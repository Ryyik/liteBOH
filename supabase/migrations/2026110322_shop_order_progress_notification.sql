-- ============================================================================
-- 2026-11-03 商城订单进度变更 → 通知用户
--
-- 用户口径：「有新进度会通知用户，实现了没」。
--
-- 落地前的事实（2026-11-03 排查，查的是线上 pg_trigger 而不是迁移文件）：
--   · 礼物这一路**早就通了**：2026110202 的 trg_notify_gift_progress 在线上，
--     gift_status 变化 → 插 notifications(type='gift') → 自动吃 Web Push。
--   · 商城订单这一路**一个触发器都没有**：管理员在 DataManagement 把
--     preparing → shipped → completed 改掉，用户毫无感知，只能自己进购物袋刷。
--   · 接收端也已经就绪：Messages/index.vue 的「系统」分组按
--     isSystemNotificationType 过滤，加一个类型即可落进同一个 tab。
--
-- 为什么用触发器而不是在 DataAdmin 里调 createNotification：
--   ① 覆盖所有写入路径 —— 后台表单、SQL 直改、EF、将来的批量脚本都会触发；
--   ② 不依赖客户端 RLS，与礼物 / 中奖 / 关注 / 印象同一套做法；
--   ③ 通知失败绝不回滚订单本身（异常兜住）—— 发货状态是主数据，通知是附属品。
--
-- 口径：
--   · 只在 status **真的变了**时发（is distinct from 判等，重复保存不发）；
--   · 四态文案与 shop_points_orders_status_check 一一对应（2026110201 收敛的四态）；
--   · 用户自己点「取消订单」不再给他推一条「你的订单已取消」——
--     auth.uid() 就是订单主人时说明是他本人刚做的动作，告诉他「你刚做了什么」
--     属于噪声（同 notifications 侧 filterSelfActionNotifications 的口径）。
--     管理员在后台取消（auth.uid() 是管理员或 service_role 的 null）仍会通知。
--   · user_id 为空（历史脏数据）直接跳过。
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
    when 'shipped' then '已发货'
    when 'completed' then '完成'
    when 'cancelled' then '已取消'
    else coalesce(new.status, '已更新')
  end;

  v_name := coalesce(nullif(trim(new.order_no), ''), '周边订单');

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
      null; -- 通知是附属品，失败不影响订单状态落库
  end;

  return new;
end;
$$;

comment on function public.notify_shop_order_progress() is
  '商城订单状态变更 → 给下单人插一条 order 类型站内通知（2026-11-03 补发送端；礼物那一路见 notify_gift_progress）';

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
