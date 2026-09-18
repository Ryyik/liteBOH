begin;

-- ============================================
-- Web Push 派发链路：通知落库 → outbox → Edge Function
--
-- 为什么挂在 notifications 的 AFTER INSERT 触发器上，而不是复用前端已有的
-- notifyPostAuthorForLike/Comment/Repost（那三处只负责 Pushplus 微信通道）：
--   1. 通知的来源不止那三个 —— 关注、回复、抽奖、订阅赠送、审核结果等
--      都由 DB 触发器/RPC 直接落库，前端根本没有感知。挂在表上才能全覆盖。
--   2. 服务端触发不依赖发送方浏览器还活着 —— 用户点完赞立刻关页面，推送照样发得出。
--
-- 可靠性设计：
--   · 先无条件写 push_outbox（通知 ↔ 推送投递状态一一对应，便于排错与重投）
--   · 再尽力 net.http_post 立刻投递（pg_net 是异步队列，不阻塞业务写事务）
--   · 立刻投递失败/没投成，由 pg_cron 每 2 分钟调 action=retry 兜底
--   · 触发器整体吞异常：推送是增强，任何异常都绝不能反过来阻断用户的业务通知写入
--
-- 幂等：create if not exists / create or replace / drop trigger if exists。
-- ============================================

-- ------------------------------------------------------------------
-- 1) 投递决策的唯一出口
-- ------------------------------------------------------------------
create or replace function public.boh_should_send_web_push(
  p_recipient_id uuid,
  p_type text
)
returns boolean
language sql
stable
as $$
  -- 当前口径（按产品要求）：只要有消息就推，不挑类型。
  --
  -- ⚠️ 这里是「该不该给这个人发浏览器推送」的**唯一判定点**。
  --    将来要做的收敛都改这里，不要散到触发器、Edge Function 或前端：
  --      · 与 Pushplus 微信通道去重（收件人 pushplus_enabled 时不再发浏览器推送）
  --      · 免打扰时段 / 小时配额 / 某类型不推（如 impression）
  --      · 用户级开关（profiles 加列后在这里判断）
  select p_recipient_id is not null;
$$;

comment on function public.boh_should_send_web_push(uuid, text) is
  'Web Push 投递决策的唯一判定点。当前=只要有消息就推。要加免打扰/与微信通道去重/用户开关，都改这里。';

revoke all on function public.boh_should_send_web_push(uuid, text) from public;
revoke all on function public.boh_should_send_web_push(uuid, text) from anon;
revoke all on function public.boh_should_send_web_push(uuid, text) from authenticated;
grant execute on function public.boh_should_send_web_push(uuid, text) to service_role;

-- ------------------------------------------------------------------
-- 2) 投递账本
-- ------------------------------------------------------------------
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint push_outbox_status_check
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  -- 一条通知只推一次，重复触发/重投都不会产生第二条
  constraint push_outbox_notification_key unique (notification_id)
);

comment on table public.push_outbox is
  'Web Push 投递账本。status: pending=待投, sent=已投, skipped=无订阅可投, failed=已放弃。由发送端回写。';

create index if not exists idx_push_outbox_pending
  on public.push_outbox (created_at)
  where status in ('pending', 'failed');

alter table public.push_outbox enable row level security;

-- 账本只给后台看，前端不需要读（未读数走 get_unread_notification_count）
drop policy if exists push_outbox_service_all on public.push_outbox;
create policy push_outbox_service_all
  on public.push_outbox
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.push_outbox from anon;
revoke all on table public.push_outbox from authenticated;
grant all on table public.push_outbox to service_role;

-- ------------------------------------------------------------------
-- 3) 触发器：通知落库 → 写账本 → 尽力立刻投递
-- ------------------------------------------------------------------
create or replace function public.boh_enqueue_web_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox_id uuid;
  v_supabase_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_service_role_key text := nullif(current_setting('app.settings.service_role_key', true), '');
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

  -- 立刻投递：缺配置或缺 pg_net 就静默跳过，交给 cron + 账本兜底
  begin
    if v_supabase_url is null or v_service_role_key is null then
      return new;
    end if;

    if not exists (select 1 from pg_extension where extname = 'pg_net') then
      return new;
    end if;

    perform net.http_post(
      url := rtrim(v_supabase_url, '/') || '/functions/v1/push-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_role_key,
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
  'notifications AFTER INSERT：写 push_outbox 并尽力立刻触发 push-send。所有异常都被吞掉，不影响通知本身落库。';

drop trigger if exists trg_notifications_enqueue_web_push on public.notifications;
create trigger trg_notifications_enqueue_web_push
  after insert on public.notifications
  for each row
  execute function public.boh_enqueue_web_push();

-- ------------------------------------------------------------------
-- 4) 兜底重投：每 2 分钟叫醒发送端处理 pending/failed
--
-- 复用周报（2026090602）与论坛异步任务（2026090605）同款模式：
-- pg_cron 以 service_role Bearer 调用 Edge Function，读 DB 已配置的
-- app.settings.service_role_key，不需要在 DB 里额外维护一份密钥。
-- ------------------------------------------------------------------
do $cron$
declare
  v_supabase_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_service_role_key text := nullif(current_setting('app.settings.service_role_key', true), '');
  v_has_pg_cron boolean := false;
  v_has_pg_net boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_pg_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;

  if not v_has_pg_cron or not v_has_pg_net then
    raise notice 'Web Push 兜底重投未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  if v_supabase_url is null or v_service_role_key is null then
    raise notice 'Web Push 兜底重投未注册：缺少 app.settings.supabase_url 或 app.settings.service_role_key。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'boh_push_outbox_retry';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'boh_push_outbox_retry',
    '*/2 * * * *',
    format($cmd$
      select net.http_post(
        url := %L || '/functions/v1/push-send',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('action', 'retry', 'limit', 20)
      );
    $cmd$, rtrim(v_supabase_url, '/'), v_service_role_key)
  );

  raise notice 'Web Push 兜底重投已注册：每 2 分钟处理一次未成功的推送。';
exception when others then
  raise notice '创建 Web Push 兜底重投失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

notify pgrst, 'reload schema';

commit;
