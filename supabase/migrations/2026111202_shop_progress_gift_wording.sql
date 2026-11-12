-- ============================================================================
-- 2026-11-12 商城进度站内信改「礼物」口径
--
-- 用户口径（2026-11-12）：「都叫礼物得了，用户自己买的方块商品也叫礼物好咯」。
-- 背景：2026-11-10 起发往 QQ 邮箱的所有邮件被 550 blocked by Admin 拒收，
-- 后经对照实验确认是 QQ 对发信源（域名 + Brevo 共享 IP）的整体拦截，
-- 与邮件内容无关；11-12 21:09 已自然解封。为降低「被判定为商业/交易邮件」
-- 的长期概率，订单类文案整体退场，统一改成「礼物」。
--
-- 只改文案，不动状态机、不动触发条件、不动 trigger 定义：
--   · v_label：已发货 → 已寄出、完成 → 已送达（准备中 / 已取消 不变）
--   · 兜底名：周边订单 → 方块礼物
--   · 正文：「你的订单「x」进度更新为「y」」→「你的方块礼物「x」有新进展：y」
--
-- ⚠️ 保留「方块」二字是刻意的：另一套赠礼功能（user_gifts /
--    notify_gift_progress）的站内信也叫「你的礼物」，两者状态词完全一样，
--    不加前缀用户分不清「我买的」和「别人送我的」。
--
-- 幂等：create or replace function + drop trigger if exists，可重复执行。
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
begin
  if new.user_id is null then
    return new;
  end if;

  -- 只有状态真的变了才发：后台「保存」按钮经常原样提交，不该刷屏
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- 本人自助取消：不发（他刚点的，自己知道）
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
      null; -- 通知是附属品，失败不影响订单状态落库
  end;

  return new;
end;
$$;

comment on function public.notify_shop_order_progress() is
  '商城订单（对外称「方块礼物」）状态变更 → 给下单人插一条 order 类型站内通知（2026-11-03 补发送端，2026-11-12 改礼物口径）';

drop trigger if exists trg_notify_shop_order_progress on public.shop_points_orders;
create trigger trg_notify_shop_order_progress
  after update of status on public.shop_points_orders
  for each row
  execute function public.notify_shop_order_progress();

-- 触发器函数不对外暴露执行权限（与 2026110314 / 2026110319 同口径）
revoke all on function public.notify_shop_order_progress() from public;
revoke all on function public.notify_shop_order_progress() from anon;
revoke all on function public.notify_shop_order_progress() from authenticated;

commit;
