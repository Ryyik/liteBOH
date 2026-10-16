-- 注册「论坛记忆每日摄取」cron —— 用 **Vault 凭证**，不是 `app.settings.*`。
--
-- 为什么需要这个补丁迁移（而不是改 2026101601）：
--   2026101601 里的 cron 块沿用了 2026090602 / 2026090605 的旧写法
--   （读 `app.settings.supabase_url` / `app.settings.service_role_key`）。
--   那对 GUC **在本项目从未被设置过** —— 2026092202 已记录真实原因：
--     托管环境的 `postgres` 角色不是 superuser，`alter database … set app.settings.x`
--     实测 42501 permission denied，所以当年才把密钥硬编码进 cron.job.command。
--   实测后果：2026101601 push 时打出
--     NOTICE: 论坛记忆摄取未注册：缺少 app.settings.supabase_url 或 app.settings.service_role_key。
--   即**任务没注册**（守卫按设计只 notice 不报错，所以迁移显示成功）。
--   已应用的迁移不改（会破坏 migration history 校验），故另起一条补丁迁移。
--
-- 现行标准写法（见 2026092202）：凭证存 `vault.decrypted_secrets`，
--   cron.job.command 里只出现 secret 的**名字**，不含密钥字符。
--   前置：`supabase_url`、`push_dispatch_key` 两条 vault secret（已存在）。
--   Edge Function 侧需配 `BOH_PUSH_DISPATCH_KEY`，值必须与 vault 里逐字节相同。
--   `boh-ai-forum-memory` 已按此接受该 Bearer。
--
-- ⚠️ 同一处发现但**本次不修**：`forum_async_worker_cron` 只在 2026090605 里用那套死写法
--   注册过，实测线上 `cron.job` 里没有它 ⇒ 论坛审核异步任务的兜底唤醒**从未生效**。
--   修它还需要 `forum-async-worker` 接受 `BOH_PUSH_DISPATCH_KEY`（目前只认
--   `FORUM_WORKER_SECRET` 与 service_role），属另一次改动，未包含在本迁移内。
--
-- 幂等：先 unschedule 再 schedule。

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
    raise notice '论坛记忆摄取未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  select exists (select 1 from vault.decrypted_secrets where name = 'push_dispatch_key') into v_has_key;
  select exists (select 1 from vault.decrypted_secrets where name = 'supabase_url') into v_has_url;

  if not v_has_key or not v_has_url then
    raise notice '论坛记忆摄取未注册：Vault 里缺少 supabase_url 或 push_dispatch_key。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'boh_ai_forum_memory_ingest_cron';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'boh_ai_forum_memory_ingest_cron',
    '0 20 * * *',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/boh-ai-forum-memory',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$
  );

  raise notice '论坛记忆摄取已注册：每天 20:00 UTC（北京时间次日 04:00），命令内不含明文密钥。';
exception when others then
  raise notice '注册论坛记忆摄取任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;
