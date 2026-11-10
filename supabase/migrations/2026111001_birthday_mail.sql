-- ============================================================================
-- 2026-11-10 生日自动邮件（生日当天 00:00 Asia/Shanghai 发送）
--
-- 用户口径：「生日的话 00:00 发」。
--
-- 落地前的事实（2026-11-10 核查）：
--   · Brevo 只被当成**事件驱动的事务性通道**在用（认证 / 关注动态 / 审核处置 /
--     订单进度），全仓 `supabase/functions` 下 `birthday|生日` **零命中**。
--   · 生日系统（2026070205 birthday_events / birthday_wishes）是纯站内功能：
--     管理员配生日页、用户提交祝福、审核后展示。**从不碰邮件**。
--   · Brevo 后台的「生日自动化」也开不起来：代码只调过 /v3/smtp/email，
--     从没做过 contacts 导入，也就没有生日属性可触发。
--
-- 为什么复用 mail_outbox 而不是新起一套：
--   ① 账本 + 重试现成（boh_mail_outbox_retry，每 5 分钟，最多 3 次）；
--      直连 EF 失败就是静默丢信，而「生日祝福没收到」是用户会记住一整年的事。
--   ② 复用同一把内部投递凭证（push_dispatch_key），不新增 secret。
--   ③ 与关注邮件 / 订单进度同一套消费端（follow-mail-send），不新增 EF。
--      ⚠️ follow-mail-send 这个名字是历史包袱，它是 mail_outbox 的**唯一消费端**，
--         新增 kind 的模板就加在那里。
--
-- 去重口径：dedupe_key = 'birthday:<user_id>:<年>'（不含月日）。
--   dedupe_key 全局唯一 ⇒ 同一人同一年**最多一封**：cron 重跑、补跑、
--   手动调函数都不会重复发。跨年自然产生新 key。
--
-- 时间口径：pg_cron 按**数据库时区**（UTC）解释表达式。
--   「生日当天 00:00 Asia/Shanghai」= 前一天 16:00 UTC ⇒ '0 16 * * *'。
--   不要改成 '0 0 * * *' —— 那会在北京时间早上 8 点发。
--   日期的「今天」一律用 (now() at time zone 'Asia/Shanghai')::date 取，
--   否则 00:00 那一刻 UTC 还是前一天，会挑错人。
--
-- 不发的三种情况：
--   · profiles.birthday_mail_enabled = false（用户关了开关）；
--   · 没填生日，或填的不是合法月/日（birth_month/birth_day 是 text 列，
--     历史上由 auth 元数据写入，可能是空串 —— 必须用正则挡在 cast 之前）；
--   · 邮箱未验证（与 boh_get_user_emails 同口径：Brevo 会拒，且伤域名信誉）——
--     这类人不入账，避免在账本里堆一堆注定 skipped 的行。
--
-- Down Migration（回滚）：
--   select cron.unschedule('boh_birthday_mail');
--   drop function if exists public.boh_enqueue_birthday_mails();
--   alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
--   alter table public.mail_outbox add constraint mail_outbox_kind_check
--     check (kind in ('follow_post', 'follow_reply', 'shop_order'));
--   alter table public.profiles drop column if exists birthday_mail_enabled;
--   delete from public.mail_outbox where kind = 'birthday';
-- ============================================================================

begin;

-- ------------------------------------------------------------------
-- 1) 用户开关
-- ------------------------------------------------------------------
-- 默认 **true**，与「关注邮件」（默认 false，必须先主动订阅）刻意相反。
-- 理由不是「想多骚扰一下」，而是两者的信息来源与性质不同：
--   · 关注邮件的内容是**别人产生的内容**，用户没主动要过；
--   · 生日邮件的触发条件是**用户在资料里自己填的生日**，是服务性问候，
--     且一年只一封、不含任何推销内容。
-- 用户随时可在「通知设置」关掉（列级 UPDATE 授权给 authenticated，
-- 与 follow_mail_enabled / moderation_mail_enabled 同一套口径，开关无权益含义）。
alter table public.profiles
  add column if not exists birthday_mail_enabled boolean not null default true;

comment on column public.profiles.birthday_mail_enabled is
  '是否接收生日当天 00:00 自动发送的生日邮件。默认开启（生日由用户自己填写），可在通知设置关闭。';

grant update (birthday_mail_enabled) on table public.profiles to authenticated;

-- ------------------------------------------------------------------
-- 2) mail_outbox 支持生日类
-- ------------------------------------------------------------------
alter table public.mail_outbox
  drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox
  add constraint mail_outbox_kind_check
  check (kind in ('follow_post', 'follow_reply', 'shop_order', 'birthday'));

-- ------------------------------------------------------------------
-- 3) 入账函数：挑出「今天过生日」的人，各写一条账本
-- ------------------------------------------------------------------
-- returns = 本次新入账的条数（cron 日志里能直接看出「今天发了几封」）。
-- 幂等：靠 dedupe_key 的唯一约束，不靠调用方判重。
create or replace function public.boh_enqueue_birthday_mails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'Asia/Shanghai')::date;
  v_year     integer := extract(year from (now() at time zone 'Asia/Shanghai'))::integer;
  v_month    integer := extract(month from (now() at time zone 'Asia/Shanghai'))::integer;
  v_day      integer := extract(day from (now() at time zone 'Asia/Shanghai'))::integer;
  v_is_leap  boolean;
  v_count    integer := 0;
begin
  -- 闰年判定：2/29 出生的人在平年落到 2/28 发（不发就等于四年丢三次）
  v_is_leap := (v_year % 4 = 0 and (v_year % 100 <> 0 or v_year % 400 = 0));

  with due as (
    select p.id
      from public.profiles p
     where coalesce(p.birthday_mail_enabled, true) = true
       -- 正则必须在 cast 之前：这两列是 text，历史数据可能是空串 / 'unknown'
       and p.birth_month ~ '^[0-9]{1,2}$'
       and p.birth_day ~ '^[0-9]{1,2}$'
       and (
            (p.birth_month::int = v_month and p.birth_day::int = v_day)
            -- 平年：2/29 的人提前一天在 2/28 过
            or (
              v_is_leap = false
              and v_month = 2 and v_day = 28
              and p.birth_month::int = 2 and p.birth_day::int = 29
            )
           )
       -- 邮箱必须已验证（与 boh_get_user_emails 同口径）
       and exists (
             select 1
               from auth.users u
              where u.id = p.id
                and u.email is not null
                and u.email_confirmed_at is not null
           )
  ), ins as (
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, dedupe_key, delivery, due_at
    )
    select
      d.id,
      null,                                     -- 系统邮件：sender 为空
      'birthday',
      'birthday:' || d.id::text || ':' || v_year::text,
      'instant',
      now()                                     -- 立刻到期，cron 紧接着调 retry 投递
      from due d
    on conflict (dedupe_key) do nothing
    returning id
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

comment on function public.boh_enqueue_birthday_mails() is
  '生日邮件唯一入账口：挑出今天（Asia/Shanghai）过生日、开关开着、邮箱已验证的用户，各写一条 mail_outbox(kind=birthday)。幂等靠 dedupe_key=birthday:<uid>:<year>。';

revoke all on function public.boh_enqueue_birthday_mails() from public;
revoke all on function public.boh_enqueue_birthday_mails() from anon;
revoke all on function public.boh_enqueue_birthday_mails() from authenticated;
grant execute on function public.boh_enqueue_birthday_mails() to service_role;

-- ------------------------------------------------------------------
-- 4) cron：每天 16:00 UTC = 次日 00:00 Asia/Shanghai
-- ------------------------------------------------------------------
-- 入账后**立刻**触发一次 retry 投递，不等 5 分钟的兜底 cron ——
-- 「生日当天 00:00」是用户明确要求的口径，00:05 才到就不算数了。
-- 这里不用 action=send 逐条投递：一次性入账可能有多个寿星，
-- retry 分支自带批量 + 限流 + 状态回写，正好是我们要的。
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
    perform cron.unschedule(jobid) from cron.job where jobname = 'boh_birthday_mail';
  exception when others then
    null;
  end;

  perform cron.schedule(
    'boh_birthday_mail',
    '0 16 * * *',
    $cmd$
      select public.boh_enqueue_birthday_mails();
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/follow-mail-send',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('action', 'retry', 'limit', 50)
      );
    $cmd$
  );

  raise notice 'cron 任务已注册：boh_birthday_mail（0 16 * * * UTC = 00:00 Asia/Shanghai）。';
exception when others then
  raise notice '注册 cron 任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

notify pgrst, 'reload schema';

commit;
