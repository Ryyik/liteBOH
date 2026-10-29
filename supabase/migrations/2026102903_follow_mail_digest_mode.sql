-- 2026102903: 邮件通知投递方式（及时 / 聚合摘要）+ 窗口内多动作合并
--
-- 产品口径（2026-10-29 与站长确认）：
--   上一版（2026102902）的同窗后续动作是「on conflict do nothing」静默丢弃 ——
--   张三 15 分钟内发 2 帖 + 回复 1 次，用户只收到第一帖，其余两条在邮件里不可见。
--   本版给用户一个选择：
--     · 及时通知（instant，默认）：首条动作立刻投递；同窗后续动作依旧丢弃（现状行为）
--     · 聚合摘要（digest）：窗口内所有动作追加进同一条账本，窗口结束后由 cron
--       发送**一封完整摘要**（首条为主条目，其余进「同期还有 N 条动态」列表）
--   代价：聚合模式下首封也要等窗口结束（15min 档 ≈ 15~20 分钟送达）—— 已向用户明示。
--
-- 关键设计：**due_at 显式列**而不是「created_at + 窗口」的运行期计算 ——
--   PostgREST/EF 的查询无法表达「created_at + window_minutes 分钟 <= now()」这种列运算，
--   入账时把到期时间算好存进 due_at，cron/EF 的兜底查询就统一成一个简单条件
--   `due_at <= now()`，及时与聚合两种模式共用一条查询。
--
-- Down Migration:
--   drop function if exists public.boh_set_follow_mail_digest(boolean);
--   alter table public.mail_outbox drop column if exists extra_items;
--   alter table public.mail_outbox drop column if exists window_minutes;
--   alter table public.mail_outbox drop column if exists delivery;
--   alter table public.mail_outbox drop column if exists due_at;
--   alter table public.profiles drop column if exists follow_mail_digest;
--   （boh_enqueue_follow_mail 恢复 2026102902 版本：重放该迁移的函数定义）

begin;

-- ------------------------------------------------------------------
-- 1) 用户偏好：投递方式（false = 及时，true = 聚合）
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists follow_mail_digest boolean not null default false;

comment on column public.profiles.follow_mail_digest is
  '「关注的人邮件通知」投递方式：false=及时(首条即发,同窗后续丢弃)，true=聚合(窗口结束发一封全摘要，可能有延迟)。';

-- ------------------------------------------------------------------
-- 2) 账本扩展：聚合条目 + 投递快照 + 到期时间
-- ------------------------------------------------------------------
alter table public.mail_outbox
  add column if not exists extra_items jsonb not null default '[]',
  add column if not exists window_minutes integer,
  add column if not exists delivery text not null default 'instant',
  add column if not exists due_at timestamptz;

-- delivery 快照 + 约束（历史行默认 instant，行为与旧版一致）
alter table public.mail_outbox
  drop constraint if exists mail_outbox_delivery_check;
alter table public.mail_outbox
  add constraint mail_outbox_delivery_check check (delivery in ('instant', 'digest'));

comment on column public.mail_outbox.extra_items is
  '聚合摘要的附加动作（仅 digest 模式累积）：[{kind,post_id,comment_id,at}]。渲染时按 id 回查标题/摘要。';
comment on column public.mail_outbox.window_minutes is
  '入账时的去重窗口快照（分钟）——用户切换偏好不影响已入账行的到期判定。';
comment on column public.mail_outbox.due_at is
  '兜底投递到期时间：digest = created_at + 窗口；instant = created_at + 60s（失败重投节奏）。cron/EF 统一按 due_at <= now() 扫描。';

create index if not exists idx_mail_outbox_due
  on public.mail_outbox (due_at)
  where status in ('pending', 'failed');

-- ------------------------------------------------------------------
-- 3) 入账函数重写：同窗 pending 行追加 items（聚合核心）
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
  v_outbox_id    uuid;
  v_existing_id  uuid;
  v_bucket       bigint;
  v_dedupe       text;
  v_url          text;
  v_dispatch     text;
  v_enabled      boolean;
  v_window       integer;
  v_digest       boolean;
  v_delivery     text;
begin
  if p_recipient_id is null or p_sender_id is null or p_recipient_id = p_sender_id then
    return;
  end if;

  -- 收件人偏好一次取齐：开关 + 窗口 + 投递方式
  begin
    select coalesce(follow_mail_enabled, false),
           coalesce(follow_mail_window_minutes, 60),
           coalesce(follow_mail_digest, false)
      into v_enabled, v_window, v_digest
      from public.profiles
     where id = p_recipient_id;
  exception when undefined_column then
    -- 迁移未到位时退回旧行为：开关 + 固定 30 分钟 + 及时
    select coalesce(follow_mail_enabled, false) into v_enabled
      from public.profiles where id = p_recipient_id;
    v_window := 30;
    v_digest := false;
  end;

  if not coalesce(v_enabled, false) then
    return;
  end if;

  v_delivery := case when coalesce(v_digest, false) then 'digest' else 'instant' end;

  -- 去重桶按窗口切
  v_bucket := floor(extract(epoch from now()) / (coalesce(v_window, 60) * 60)::numeric)::bigint;
  v_dedupe := p_recipient_id::text || ':' || p_sender_id::text || ':' || v_bucket::text;

  -- ── 聚合核心：同窗已有「未投递」行 → 追加本动作，不再新建 ──
  -- 只追 pending（已 sent 的窗口不再重复提醒，语义与旧版一致）
  begin
    select id into v_existing_id
      from public.mail_outbox
     where dedupe_key = v_dedupe
       and status = 'pending'
     order by created_at desc
     limit 1;
  exception when others then
    null;
  end;

  if v_existing_id is not null then
    begin
      update public.mail_outbox
        set extra_items = extra_items || jsonb_build_array(
              jsonb_build_object(
                'kind', p_kind,
                'post_id', p_post_id,
                'comment_id', p_comment_id,
                'at', to_jsonb(now())
              )
            )
        where id = v_existing_id;
    exception when others then
      null;
    end;
    return;
  end if;

  -- ── 首条动作：新建账本行（窗口/投递方式是入账时刻的快照）──
  begin
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, post_id, comment_id,
      dedupe_key, window_minutes, delivery,
      due_at
    ) values (
      p_recipient_id, p_sender_id, p_kind, p_post_id, p_comment_id,
      v_dedupe, coalesce(v_window, 60), v_delivery,
      now() + make_interval(mins => case
        when v_delivery = 'digest' then coalesce(v_window, 60)   -- 聚合：窗口结束才到期
        else 1                                                    -- 及时：失败后 1 分钟即可重投
      end)
    )
    on conflict (dedupe_key) do nothing
    returning id into v_outbox_id;
  exception when others then
    return;
  end;

  if v_outbox_id is null then
    return;  -- 命中已 sent 的同窗去重：窗口内不重复提醒
  end if;

  -- ── 即时模式：尽力立刻投递；聚合模式交给 cron 到期扫描 ──
  if v_delivery = 'digest' then
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

revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from anon;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from authenticated;
grant execute on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------------
-- 4) 偏好读取：加 digest 列
-- ------------------------------------------------------------------
-- ⚠️ returns table 的列集变了（+digest），PG 不允许 create or replace 改行类型（42P13），
--    必须先 drop 再建 —— 授权随函数删除，下方重建。
drop function if exists public.boh_get_follow_mail_prefs();

create or replace function public.boh_get_follow_mail_prefs()
returns table (enabled boolean, window_minutes integer, can_realtime boolean, digest boolean)
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
    ),
    coalesce(p.follow_mail_digest, false)
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.boh_get_follow_mail_prefs() from public;
revoke all on function public.boh_get_follow_mail_prefs() from anon;
grant execute on function public.boh_get_follow_mail_prefs() to authenticated;

-- ------------------------------------------------------------------
-- 5) 投递方式开关（无权益门槛：聚合/及时都不需要订阅）
-- ------------------------------------------------------------------
create or replace function public.boh_set_follow_mail_digest(p_digest boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set follow_mail_digest = coalesce(p_digest, false)
   where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return coalesce(p_digest, false);
end;
$$;

revoke all on function public.boh_set_follow_mail_digest(boolean) from public;
revoke all on function public.boh_set_follow_mail_digest(boolean) from anon;
grant execute on function public.boh_set_follow_mail_digest(boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
