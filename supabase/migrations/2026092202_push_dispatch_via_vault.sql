begin;

-- ============================================
-- Web Push 投递凭证改由 Supabase Vault 提供（不再内嵌明文，也不用 app.settings）
--
-- 为什么不是 app.settings：
--   托管环境的 `postgres` 角色不是 superuser，`alter database postgres set app.settings.x`
--   实测直接 42501 permission denied。这也是 2026090602 当年把密钥**硬编码**进
--   cron.job.command 的真实原因 —— 不是疏忽，是当时唯一走得通的路。
--
-- 为什么用 Vault：
--   `supabase_vault` 扩展已启用，凭证加密存储，触发器（security definer，属主 postgres）
--   与 cron 任务都能在**执行时**读取；job.command 里只剩 secret 的**名字**，不含密钥字符。
--
-- 本迁移做三件事：
--   1) 触发器函数 boh_enqueue_web_push：改从 Vault 读 url + 凭证（原读 app.settings 恒为 NULL，
--      导致「写账本成功但从不即时投递」）
--   2) 重注册 boh_push_outbox_retry（每 2 分钟兜底重投）
--   3) 重注册 generate_forum_weekly_report_weekly（每周一 01:15）——
--      它原本把 service_role 密钥明文内嵌在 command 里，顺手清掉
--
-- 前置条件（缺任一项则只发 notice、不注册，绝不半配上线）：
--   select vault.create_secret('<值>', 'supabase_url', '…');
--   select vault.create_secret('<值>', 'push_dispatch_key', '…');
--   Edge Function 侧需配同名 secret BOH_PUSH_DISPATCH_KEY，值必须逐字节相同。
--
-- 幂等：create or replace + 先 unschedule 再 schedule。
-- ============================================

-- ------------------------------------------------------------------
-- 1) 触发器：凭证改从 Vault 读
-- ------------------------------------------------------------------
create or replace function public.boh_enqueue_web_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox_id uuid;
  v_supabase_url text;
  v_dispatch_key text;
begin
  -- 自己对自己操作不推（通知行本身也已在业务侧跳过，这里是二道保险）
  if new.recipient_id is null then
    return new;
  end if;
  if new.sender_id is not null and new.sender_id = new.recipient_id then
    return new;
  end if;

  -- 写账本：整块单独兜异常，失败也只是少一条推送，绝不冒泡到 notifications 的 insert
  begin
    if not public.boh_should_send_web_push(new.recipient_id, new.type) then
      return new;
    end if;

    insert into public.push_outbox (notification_id, recipient_id)
    values (new.id, new.recipient_id)
    on conflict (notification_id) do nothing
    returning id into v_outbox_id;
  exception when others then
    return new;
  end;

  -- 没有新账本行（重复触发或未通过判定）就直接结束
  if v_outbox_id is null then
    return new;
  end if;

  -- 立刻投递：凭证从 Vault 取；缺凭证或缺 pg_net 就静默跳过，交给 cron + 账本兜底
  begin
    select decrypted_secret into v_supabase_url
      from vault.decrypted_secrets where name = 'supabase_url';
    select decrypted_secret into v_dispatch_key
      from vault.decrypted_secrets where name = 'push_dispatch_key';

    if v_supabase_url is null or v_dispatch_key is null then
      return new;
    end if;

    if not exists (select 1 from pg_extension where extname = 'pg_net') then
      return new;
    end if;

    perform net.http_post(
      url := rtrim(v_supabase_url, '/') || '/functions/v1/push-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_dispatch_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('action', 'send', 'outboxId', v_outbox_id)
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

comment on function public.boh_enqueue_web_push() is
  'notifications AFTER INSERT：写 push_outbox 并尽力立刻触发 push-send。凭证读 vault.decrypted_secrets；所有异常都被吞掉，不影响通知本身落库。';

-- ------------------------------------------------------------------
-- 2) + 3) cron 重注册：命令里只出现 Vault 里的 secret 名字
-- ------------------------------------------------------------------
do $cron$
declare
  v_has_pg_cron boolean := false;
  v_has_pg_net boolean := false;
  v_has_key boolean := false;
  v_has_url boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_pg_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;

  if not v_has_pg_cron or not v_has_pg_net then
    raise notice 'cron 任务未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  select exists (select 1 from vault.decrypted_secrets where name = 'push_dispatch_key') into v_has_key;
  select exists (select 1 from vault.decrypted_secrets where name = 'supabase_url') into v_has_url;

  if not v_has_key or not v_has_url then
    raise notice 'cron 任务未注册：Vault 里缺少 supabase_url 或 push_dispatch_key。';
    return;
  end if;

  -- Web Push 兜底重投（每 2 分钟）
  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'boh_push_outbox_retry';
  exception when others then
    null;
  end;

  perform cron.schedule(
    'boh_push_outbox_retry',
    '*/2 * * * *',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/push-send',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('action', 'retry', 'limit', 20)
      );
    $cmd$
  );

  -- 论坛周报（每周一 01:15，保持原调度不变）
  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'generate_forum_weekly_report_weekly';
  exception when others then
    null;
  end;

  perform cron.schedule(
    'generate_forum_weekly_report_weekly',
    '15 1 * * 1',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/generate-forum-weekly-report',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$
  );

  raise notice 'cron 任务已注册（命令内不含明文密钥）：boh_push_outbox_retry、generate_forum_weekly_report_weekly。';
exception when others then
  raise notice '注册 cron 任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

notify pgrst, 'reload schema';

commit;
