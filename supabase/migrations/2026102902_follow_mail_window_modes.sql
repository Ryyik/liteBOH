-- 2026102902: 邮件通知两种模式（实时 15min [Max+ Only] / 标准 1h）
--
-- 产品口径（2026-10-29 与站长确认）：
--   · 模式 1「实时」：同一发件人 15 分钟内的动作合并成一封（比原 30min 更快收到）
--     —— **Max+ Only**：仅 max / ultra 订阅用户可选，选项卡挂「Max+ Only」徽章
--   · 模式 2「标准」：同一发件人 1 小时内的动作合并成一封 —— 无门槛，所有人可用
--   · 非 Max+ 用户选中实时 → 服务端拒绝，前端弹订阅引导（跳 /user-space/subscriptions）
--   · 默认 60（标准），与原有 30min 行为最接近的无门槛档
--
-- 权益判定的单一真源：user_subscriptions（plan_code in ('max','ultra')、
--   status='active'、expires_at > now()）。写窗口的**唯一入口**是
--   boh_set_follow_mail_window（security definer，内部做 Max+ 校验）——
--   ⚠️ 这里**刻意不给** follow_mail_window_minutes 补列级 UPDATE grant：
--      profiles 对 authenticated 的 UPDATE 是列级白名单（2026102901 的教训），
--      但如果照常补 grant，用户就能直改 profiles 绕过 Max+ 校验 = 权益漏洞。
--      所以新列只继承表级 SELECT（前端显示当前值够用），写入全部走 RPC。
--
-- 去重键不变（收件人:发件人:桶号），桶宽从写死 1800s 改为按用户偏好。
-- 切换窗口后新桶与旧桶 key 不同：同一发件人可能立刻再触发一封「新」邮件，
-- 可接受（切换是显式动作）。
--
-- Down Migration:
--   drop function if exists public.boh_set_follow_mail_window(integer);
--   drop function if exists public.boh_get_follow_mail_prefs();
--   alter table public.profiles drop column if exists follow_mail_window_minutes;
--   （boh_enqueue_follow_mail 恢复固定 1800s：重放 2026102801 的函数定义即可）

begin;

-- ------------------------------------------------------------------
-- 1) 用户偏好列
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists follow_mail_window_minutes integer not null default 60;

comment on column public.profiles.follow_mail_window_minutes is
  '「关注的人邮件通知」的去重窗口（分钟）：15=实时(Max+ Only)，60=标准(无门槛)。写入只经 boh_set_follow_mail_window。';

-- ------------------------------------------------------------------
-- 2) 入账函数：去重窗口改读用户偏好
-- ------------------------------------------------------------------
create or replace function public.boh_enqueue_follow_mail(
  p_recipient_id uuid,
  p_sender_id    uuid,
  p_kind         text,
  p_post_id      uuid,
  p_comment_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox_id  uuid;
  v_bucket     bigint;
  v_dedupe     text;
  v_url        text;
  v_dispatch   text;
  v_enabled    boolean;
  v_window     integer;
begin
  if p_recipient_id is null or p_sender_id is null or p_recipient_id = p_sender_id then
    return;
  end if;

  -- 收件人偏好一次取齐：开关 + 去重窗口（列不存在时 coalesce 兜底到标准档）
  begin
    select coalesce(follow_mail_enabled, false),
           coalesce(follow_mail_window_minutes, 60)
      into v_enabled, v_window
      from public.profiles
     where id = p_recipient_id;
  exception when undefined_column then
    -- 迁移未到位时退回旧行为（开关 + 固定 30 分钟），保证触发器永远能跑
    select coalesce(follow_mail_enabled, false) into v_enabled
      from public.profiles where id = p_recipient_id;
    v_window := 30;
  end;

  if not coalesce(v_enabled, false) then
    return;
  end if;

  -- 去重桶按用户偏好的窗口切：15=实时(Max+)，60=标准（默认）
  v_bucket := floor(extract(epoch from now()) / (coalesce(v_window, 60) * 60)::numeric)::bigint;
  v_dedupe := p_recipient_id::text || ':' || p_sender_id::text || ':' || v_bucket::text;

  begin
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, post_id, comment_id, dedupe_key
    ) values (
      p_recipient_id, p_sender_id, p_kind, p_post_id, p_comment_id, v_dedupe
    )
    on conflict (dedupe_key) do nothing
    returning id into v_outbox_id;
  exception when others then
    return;
  end;

  if v_outbox_id is null then
    return;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'supabase_url';
    select decrypted_secret into v_dispatch
      from vault.decrypted_secrets where name = 'push_dispatch_key';

    if v_url is null or v_dispatch is null then
      return;
    end if;

    if not exists (select 1 from pg_extension where extname = 'pg_net') then
      return;
    end if;

    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/follow-mail-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_dispatch,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('action', 'send', 'outboxId', v_outbox_id)
    );
  exception when others then
    null;
  end;
end;
$$;

comment on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) is
  '关注邮件唯一入账口：开关判定 + 按用户偏好的去重窗口 + 写 mail_outbox + 尽力立刻投递。所有异常都被吞掉。';

revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from anon;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from authenticated;
grant execute on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------------
-- 3) 读偏好（含实时权益判定）—— 前端一次拿全：开关 + 窗口 + 能否选实时
-- ------------------------------------------------------------------
create or replace function public.boh_get_follow_mail_prefs()
returns table (enabled boolean, window_minutes integer, can_realtime boolean)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.follow_mail_enabled, false),
    coalesce(p.follow_mail_window_minutes, 60),
    exists (
      select 1
        from public.user_subscriptions s
       where s.user_id = auth.uid()
         and s.plan_code in ('max', 'ultra')
         and s.status = 'active'
         and s.expires_at > now()
    )
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.boh_get_follow_mail_prefs() is
  '邮件通知偏好 + Max+ 实时权益（user_subscriptions: max/ultra、active、未过期）。security definer 下 auth.uid() 仍取自 JWT，不会冒充。';

revoke all on function public.boh_get_follow_mail_prefs() from public;
revoke all on function public.boh_get_follow_mail_prefs() from anon;
grant execute on function public.boh_get_follow_mail_prefs() to authenticated;

-- ------------------------------------------------------------------
-- 4) 写窗口的唯一入口（Max+ Only 强校验）
-- ------------------------------------------------------------------
create or replace function public.boh_set_follow_mail_window(p_window integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_realtime boolean;
begin
  if p_window is null or p_window not in (15, 60) then
    raise exception 'INVALID_WINDOW: 窗口只允许 15 或 60 分钟'
      using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.user_subscriptions s
     where s.user_id = auth.uid()
       and s.plan_code in ('max', 'ultra')
       and s.status = 'active'
       and s.expires_at > now()
  ) into v_can_realtime;

  if p_window = 15 and not v_can_realtime then
    -- 前端据此弹订阅引导（message 是约定好的协议串，别改字面量）
    raise exception 'MAX_ONLY_REQUIRED: 实时提醒（15 分钟）需要 Max 或 Ultra 订阅'
      using errcode = 'P0001';
  end if;

  -- security definer 下这条 update 不受列级白名单约束（这正是走 RPC 而非直改 profiles 的原因）
  update public.profiles
     set follow_mail_window_minutes = p_window
   where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return p_window;
end;
$$;

comment on function public.boh_set_follow_mail_window(integer) is
  '写「关注的人邮件通知」去重窗口的唯一入口。15 分钟档需要 max/ultra 订阅（MAX_ONLY_REQUIRED）。';

revoke all on function public.boh_set_follow_mail_window(integer) from public;
revoke all on function public.boh_set_follow_mail_window(integer) from anon;
grant execute on function public.boh_set_follow_mail_window(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
