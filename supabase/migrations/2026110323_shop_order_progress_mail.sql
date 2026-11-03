-- ============================================================================
-- 2026-11-03 订单进度 → 邮件通知下单人
--
-- 用户口径：「下单确认不需要发邮件通知用户，而是订单有新进度的时候发邮件给用户」。
--
-- 落地前的事实（2026-11-03 排查）：
--   · 用户侧的邮件只有三类：关注动态（follow-mail-send）、审核处置
--     （forum-async-worker）、认证（Supabase Auth）。**订单类一封都没有** ——
--     订单邮件全发给管理员（email-send → profiles.role='admin'）。
--   · 站内信那一路已经通了（2026110322），但站内信只有打开站点才看得到；
--     「已发货」是既有时效又要行动的通知，需要能落到邮箱。
--
-- 为什么走 mail_outbox 而不是触发器直接调 EF：
--   ① 账本 + 重试是现成的（boh_mail_outbox_retry，每 5 分钟，最多 3 次）；
--      直连 EF 失败就是静默丢信，而「东西发了没」正是用户会来问的那类问题。
--   ② 复用同一把内部投递凭证（push_dispatch_key），不新增 secret。
--   ③ 与「关注邮件」同一套消费端（follow-mail-send），不新增 cron、不新增 EF。
--
-- ⚠️ follow-mail-send 这个名字会让人以为只管关注邮件，其实它是 mail_outbox
--    **唯一消费端**。EF 里按 kind 分流：shop_order 走订单模板，其余走关注模板。
--    订单分支**不读** follow_mail_enabled —— 订单进度是事务性通知，不是订阅内容，
--    不该被「关注邮件开关」连带关掉。
--
-- 去重口径：dedupe = shop_order:<订单 id>:<目标状态>。
--   同一单同一个状态只发一封（后台反复保存、状态来回切都不会重复发）。
--   不同状态各发一封（准备中 → 已发货 → 完成，用户会收到两封，这是对的）。
--
-- 不发的两种情况（与站内信触发器同口径）：
--   · 状态没变（is distinct from 判等）；
--   · 本人自助取消（auth.uid() = 订单主人）—— 他刚点的，再发一封邮件是噪声。
--     管理员在后台取消仍会发（auth.uid() 是管理员或 service_role 的 null）。
-- ============================================================================

begin;

-- ── 1) mail_outbox 支持订单类 ──────────────────────────────────────────
alter table public.mail_outbox
  add column if not exists order_id uuid;

alter table public.mail_outbox
  drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox
  add constraint mail_outbox_kind_check
  check (kind in ('follow_post', 'follow_reply', 'shop_order'));

-- 订单被物理删除时连带清掉待发邮件（历史订单不删，这条只是完整性约束）。
-- ⚠️ 用 cascade 而不是 set null：order_id 为空时消费端只能跳过，
--    留一堆注定发不出的 pending 行会污染重投队列。
alter table public.mail_outbox
  drop constraint if exists mail_outbox_order_id_fkey;
alter table public.mail_outbox
  add constraint mail_outbox_order_id_fkey
  foreign key (order_id) references public.shop_points_orders (id) on delete cascade;

create index if not exists idx_mail_outbox_order
  on public.mail_outbox (order_id)
  where order_id is not null;

comment on column public.mail_outbox.order_id is
  'kind=shop_order 时指向 shop_points_orders.id；关注类邮件为 null。';

-- ── 2) 状态变更：站内信 + 邮件账本 ─────────────────────────────────────
create or replace function public.notify_shop_order_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_name text;
  v_actor uuid := auth.uid();
  v_outbox_id uuid;
  v_dedupe text;
  v_url text;
  v_dispatch text;
begin
  if new.user_id is null then
    return new;
  end if;

  -- 只有状态真的变了才发：后台「保存」按钮经常原样提交，不该刷屏
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- 本人自助取消：站内信与邮件都不发（他刚点的，自己知道）
  if new.status = 'cancelled' and v_actor is not null and v_actor = new.user_id then
    return new;
  end if;

  v_label := case new.status
    when 'preparing' then '准备中'
    when 'shipped' then '已发货'
    when 'completed' then '完成'
    when 'cancelled' then '已取消'
    else coalesce(new.status, '已更新')
  end;

  v_name := coalesce(nullif(trim(new.order_no), ''), '周边订单');

  -- 站内信：整块单独兜异常，失败不影响订单状态落库
  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (
      new.user_id,
      null, -- 系统消息：sender 为空，前端 filterSelfActionNotifications 不会误判成自操作
      'order',
      'unread',
      concat('你的订单「', v_name, '」进度更新为「', v_label, '」')
    );
  exception
    when others then
      null;
  end;

  -- 邮件账本：同一单同一状态只入账一次
  begin
    v_dedupe := 'shop_order:' || new.id::text || ':' || new.status;
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, order_id, dedupe_key, due_at
    ) values (
      new.user_id, null, 'shop_order', new.id, v_dedupe, now()
    )
    on conflict (dedupe_key) do nothing
    returning id into v_outbox_id;
  exception
    when others then
      v_outbox_id := null;
  end;

  -- 尽力立刻投递；缺配置 / 缺 pg_net 就静默跳过，交给 5 分钟 cron 兜底
  if v_outbox_id is not null then
    begin
      select decrypted_secret into v_url
        from vault.decrypted_secrets where name = 'supabase_url';
      select decrypted_secret into v_dispatch
        from vault.decrypted_secrets where name = 'push_dispatch_key';

      if v_url is not null
         and v_dispatch is not null
         and exists (select 1 from pg_extension where extname = 'pg_net') then
        perform net.http_post(
          url := rtrim(v_url, '/') || '/functions/v1/follow-mail-send',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_dispatch,
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object('action', 'send', 'outboxId', v_outbox_id)
        );
      end if;
    exception
      when others then
        null;
    end;
  end if;

  return new;
end;
$$;

comment on function public.notify_shop_order_progress() is
  '商城订单状态变更 → 站内信（type=order）+ 邮件账本（mail_outbox.kind=shop_order）。本人自助取消不发。2026-11-03。';

-- 触发器函数不对外暴露执行权限（与 2026110314 / 2026110319 同口径）。
-- 触发器本身留在 2026110322，这里只替换函数体。
revoke all on function public.notify_shop_order_progress() from public;
revoke all on function public.notify_shop_order_progress() from anon;
revoke all on function public.notify_shop_order_progress() from authenticated;

commit;
