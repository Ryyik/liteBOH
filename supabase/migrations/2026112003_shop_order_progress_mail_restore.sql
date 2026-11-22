-- ============================================================================
-- 2026-11-20 补回订单进度邮件入账段（修复 2026111202 的回归）
--
-- 事故：2026110323 给 notify_shop_order_progress 加了 mail_outbox 入账 + 立刻投递，
--       但 2026111202（礼物口径改写）create or replace function 时只搬了站内信段，
--       **邮件入账段整块丢了**。线上实证（2026-11-20 Management API）：
--         · 线上函数体：有「已寄出/方块礼物」✅、无 mail_outbox / dedupe ❌
--         · mail_outbox 里 kind=shop_order 最后一封是 2026-11-10（改口径当天之后零入账）
--       结果：11-12 起管理员改进度只发站内信，Brevo 邮件静默消失。
--       follow-mail-send 的 shop_order 分支（礼物口径模板 11-12 已同步）成了死代码。
--
-- 本迁移 = 2026111202 的礼物口径 + 2026110323 的邮件入账/投递段，合并成一份。
-- 只补函数体，不动 trigger 定义（触发器留在 2026111202，仍指向本函数）。
-- 幂等：create or replace function，可重复执行。
--
-- 文案口径不变（2026-11-12 词表）：
--   · 站内信：「你的方块礼物「x」有新进展：已寄出」
--   · 邮件：follow-mail-send ORDER_STATUS_META（用户侧邮件，无订单/金额词，
--     金额字段在 EF 端根本不 select）—— DB 端只负责入账，文案在 EF。
-- ============================================================================

begin;

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
    when 'shipped' then '已寄出'
    when 'completed' then '已送达'
    when 'cancelled' then '已取消'
    else coalesce(new.status, '有更新')
  end;

  v_name := coalesce(nullif(trim(new.order_no), ''), '方块礼物');

  -- 站内信：整块单独兜异常，失败不影响礼物状态落库
  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (
      new.user_id,
      null, -- 系统消息：sender 为空，前端 filterSelfActionNotifications 不会误判成自操作
      'order',
      'unread',
      concat('你的方块礼物「', v_name, '」有新进展：', v_label)
    );
  exception
    when others then
      null;
  end;

  -- 邮件账本：同一单同一状态只入账一次（2026110323 段，11-12 改口径时误删，此处补回）
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
  '商城订单（对外称「方块礼物」）状态变更 → 站内信（type=order，礼物口径）+ 邮件账本（mail_outbox.kind=shop_order）。本人自助取消不发。2026-11-03 建，2026-11-12 改礼物口径（该次误删邮件段），2026-11-20 补回邮件段。';

-- 触发器函数不对外暴露执行权限（与 2026110314 / 2026110319 同口径）。
revoke all on function public.notify_shop_order_progress() from public;
revoke all on function public.notify_shop_order_progress() from anon;
revoke all on function public.notify_shop_order_progress() from authenticated;

commit;
