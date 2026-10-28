-- 2026102801: 关注的人邮件通知（follow mail notification）
--
-- 产品口径（2026-10-28 与站长确认）：
--   ① 关注的人发新帖   → 给粉丝发邮件
--   ② 关注的人回复我   → 给我发邮件
--   ③ 其他情况一律不发
--   ④ 同一「发件人 → 收件人」30 分钟内只发一封（按发件人算，不按收件人算）
--   ⑤ 不写站内通知（消息中心不受影响）
--   ⑥ 邮件内容含正文摘要 + 图片缩略图
--
-- 为什么照抄 push_outbox 那套而不是自己另起：
--   Web Push 已经跑通「通知落库 → outbox 账本 → EF 投递 → cron 兜底重投」，
--   邮件是**同构的第二条通道**。账本、重投、状态回写全部复用同一套心智模型，
--   排错时看一张表就知道「该发几条 / 发了几条 / 卡在哪」。
--
-- 为什么邮件不挂在 notifications 上（与 push 的关键差异）：
--   「关注的人发帖」这条**不写站内通知**（站长明确要求），所以没有 notifications 行可挂。
--   于是两个事件源各自直接写账本：
--     · posts        AFTER INSERT  → 遍历粉丝 → 写账本
--     · notifications AFTER INSERT (type='comment') → 判断发件人是否被我关注 → 写账本
--
-- 幂等：create if not exists / create or replace / drop trigger if exists / 先 unschedule 再 schedule。
--
-- Down Migration（回滚）：
--   drop trigger if exists trg_notify_followers_on_post on public.posts;
--   drop function if exists public.boh_notify_followers_on_post();
--   drop trigger if exists trg_notify_follow_reply on public.notifications;
--   drop function if exists public.boh_notify_follow_reply();
--   drop function if exists public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid);
--   drop function if exists public.boh_get_user_emails(uuid[]);
--   drop table if exists public.mail_outbox;
--   alter table public.profiles drop column if exists follow_mail_enabled;
--   select cron.unschedule('boh_mail_outbox_retry');

begin;

-- ------------------------------------------------------------------
-- 1) 用户开关
-- ------------------------------------------------------------------
-- 默认 false：邮件是打扰性最强的渠道，「关注即订阅」在合规上属于未经同意的商业信息，
-- 且一旦用户量大，用户会直接标记垃圾邮件、拖垮域名信誉。必须用户主动打开。
alter table public.profiles
  add column if not exists follow_mail_enabled boolean not null default false;

comment on column public.profiles.follow_mail_enabled is
  '是否接收「关注的人发帖/回复我」的邮件通知。默认关闭，由用户在通知设置里主动开启。';

-- ------------------------------------------------------------------
-- 2) 投递账本
-- ------------------------------------------------------------------
create table if not exists public.mail_outbox (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_id    uuid references public.profiles (id) on delete set null,
  kind         text not null,
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete set null,
  status       text not null default 'pending',
  attempts     integer not null default 0,
  last_error   text null,
  -- 去重键 = 收件人:发件人:30分钟桶。同一发件人对同一收件人，半小时内只留一条。
  dedupe_key   text not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz null,
  constraint mail_outbox_status_check
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  constraint mail_outbox_kind_check
    check (kind in ('follow_post', 'follow_reply')),
  constraint mail_outbox_dedupe_key unique (dedupe_key)
);

comment on table public.mail_outbox is
  '关注邮件投递账本。status: pending=待投, sent=已投, skipped=无邮箱/未开启, failed=已放弃。由 follow-mail-send 回写。';

create index if not exists idx_mail_outbox_pending
  on public.mail_outbox (created_at)
  where status in ('pending', 'failed');

alter table public.mail_outbox enable row level security;

drop policy if exists mail_outbox_service_all on public.mail_outbox;
create policy mail_outbox_service_all
  on public.mail_outbox
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.mail_outbox from anon;
revoke all on table public.mail_outbox from authenticated;
grant all on table public.mail_outbox to service_role;

-- ------------------------------------------------------------------
-- 3) 写账本 + 尽力立刻投递（唯一入口）
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
begin
  -- 自通知不发（通知行本身也已在业务侧跳过，这里是二道保险）
  if p_recipient_id is null or p_sender_id is null or p_recipient_id = p_sender_id then
    return;
  end if;

  -- 收件人必须主动开了开关；函数自包含这道判断，调用方漏判也不会误发
  if not exists (
    select 1
      from public.profiles
     where id = p_recipient_id
       and coalesce(follow_mail_enabled, false) = true
  ) then
    return;
  end if;

  -- 30 分钟桶：floor(epoch/1800)。同一发件人对同一收件人，半小时内只发一封。
  v_bucket := floor(extract(epoch from now()) / 1800)::bigint;
  v_dedupe := p_recipient_id::text || ':' || p_sender_id::text || ':' || v_bucket::text;

  -- 写账本：整块单独兜异常，失败也只是少一封邮件，绝不冒泡到 posts / notifications 的 insert
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

  -- 命中 30 分钟去重（没有新账本行）就直接结束
  if v_outbox_id is null then
    return;
  end if;

  -- 立刻投递：凭证复用 push 那套内部投递 key；缺配置或缺 pg_net 就静默跳过，交给 cron 兜底
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
  '关注邮件唯一入账口：开关判定 + 30 分钟去重 + 写 mail_outbox + 尽力立刻投递。所有异常都被吞掉。';

revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from anon;
revoke all on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) from authenticated;
grant execute on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------------
-- 4) 事件源 A：关注的人发新帖
-- ------------------------------------------------------------------
create or replace function public.boh_notify_followers_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_id uuid;
begin
  -- 只有审核通过的帖子才对外可见；未通过的不发
  if coalesce(new.status, 'approved') <> 'approved' then
    return new;
  end if;
  if new.author_id is null then
    return new;
  end if;

  begin
    for v_follower_id in
      select f.follower_id
        from public.user_follows f
        join public.profiles p on p.id = f.follower_id
       where f.following_id = new.author_id
         and f.follower_id <> new.author_id
         and coalesce(p.follow_mail_enabled, false) = true
    loop
      perform public.boh_enqueue_follow_mail(
        v_follower_id, new.author_id, 'follow_post', new.id, null
      );
    end loop;
  exception when others then
    null;
  end;

  return new;
end;
$$;

comment on function public.boh_notify_followers_on_post() is
  'posts AFTER INSERT：给所有开启了邮件开关的粉丝写一封「关注的人发新帖」邮件账本。异常全部吞掉。';

drop trigger if exists trg_notify_followers_on_post on public.posts;
create trigger trg_notify_followers_on_post
  after insert on public.posts
  for each row
  execute function public.boh_notify_followers_on_post();

-- ------------------------------------------------------------------
-- 5) 事件源 B：关注的人回复我
-- ------------------------------------------------------------------
-- 复用的是现成的 comment 通知（create_comment_notification 已经会给
-- 「帖子作者 / 根评论作者 / 实际被回复者」三类人写 type='comment'）。
-- 这里只做一件事：如果发件人正好是我关注的人，再补一封邮件。
-- 注意方向：follower_id = 收件人（我），following_id = 发件人（我关注的人）。
create or replace function public.boh_notify_follow_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type is distinct from 'comment' then
    return new;
  end if;
  if new.recipient_id is null or new.sender_id is null then
    return new;
  end if;
  if new.recipient_id = new.sender_id then
    return new;
  end if;

  -- 只有「我关注的人」回复我才发；不关注的人回复我 → 只留站内通知，不发邮件
  if not exists (
    select 1
      from public.user_follows
     where follower_id = new.recipient_id
       and following_id = new.sender_id
  ) then
    return new;
  end if;

  begin
    perform public.boh_enqueue_follow_mail(
      new.recipient_id, new.sender_id, 'follow_reply', new.post_id, new.comment_id
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

comment on function public.boh_notify_follow_reply() is
  'notifications AFTER INSERT (type=comment)：发件人是我关注的人时补一封邮件账本。其他类型一律忽略。';

drop trigger if exists trg_notify_follow_reply on public.notifications;
create trigger trg_notify_follow_reply
  after insert on public.notifications
  for each row
  execute function public.boh_notify_follow_reply();

-- ------------------------------------------------------------------
-- 6) 取收件邮箱（profiles 没有 email 列，邮箱只在 auth.users）
-- ------------------------------------------------------------------
-- 只给 service_role 用。只返回「已确认」的邮箱，未验证邮箱发信会被 Brevo 拒且伤域名信誉。
create or replace function public.boh_get_user_emails(p_ids uuid[])
returns table (user_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email::text
    from auth.users u
   where u.id = any(p_ids)
     and u.email is not null
     and u.email_confirmed_at is not null;
$$;

comment on function public.boh_get_user_emails(uuid[]) is
  '给 follow-mail-send 批量取收件邮箱。只返回已确认邮箱；profiles 表不含 email 列。';

revoke all on function public.boh_get_user_emails(uuid[]) from public;
revoke all on function public.boh_get_user_emails(uuid[]) from anon;
revoke all on function public.boh_get_user_emails(uuid[]) from authenticated;
grant execute on function public.boh_get_user_emails(uuid[]) to service_role;

-- ------------------------------------------------------------------
-- 7) 兜底重投（每 5 分钟）
-- ------------------------------------------------------------------
-- 为什么不跟 push 一样每 2 分钟：邮件对时效没那么敏感，5 分钟足够，
-- 也减少 pg_net 队列压力。命令里只出现 Vault 里的 secret 名字，不含密钥字符。
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'cron 任务未注册：需要启用 pg_cron。';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'cron 任务未注册：需要启用 pg_net。';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_dispatch_key') then
    raise notice 'cron 任务未注册：Vault 里缺少 push_dispatch_key。';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'supabase_url') then
    raise notice 'cron 任务未注册：Vault 里缺少 supabase_url。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'boh_mail_outbox_retry';
  exception when others then
    null;
  end;

  perform cron.schedule(
    'boh_mail_outbox_retry',
    '*/5 * * * *',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/follow-mail-send',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('action', 'retry', 'limit', 20)
      );
    $cmd$
  );

  raise notice 'cron 任务已注册：boh_mail_outbox_retry（每 5 分钟）。';
exception when others then
  raise notice '注册 cron 任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

notify pgrst, 'reload schema';

commit;
