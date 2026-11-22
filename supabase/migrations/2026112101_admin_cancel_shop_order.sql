-- ============================================================================
-- 2026-11-21 后台取消订单（履约台）
--
-- 背景：用户要求「后台可以取消订单」。此前 `cancel_shop_order` 只允许下单人本人
--   取消，且只有 preparing 可退；管理员遇到需要作废的订单只能去数据表里直接
--   改 status —— 那会绕过退积分、流水和审计，属于危险操作。
--
-- 本函数把后台取消收成一条事务：
--   ① 仅 admin 可调用（security definer + current_user_is_admin）；
--   ② preparing 取消 → 退回 points_used 并写 points_transactions；
--   ③ shipped 取消 → 允许（在途售后/补单纠错），**不自动退积分**，由人工处理；
--      completed 是终态，拒绝；
--   ④ 锁行 + cancelled 幂等，重复点击不会二次退积分；
--   ⑤ 写 admin_audit_logs；
--   ⑥ 返回 mail_queued：状态 UPDATE 会由 notify_shop_order_progress 入 mail_outbox，
--      前端据此如实告诉操作者「邮件是否已入队」，不假设一定发出。
--
-- 通知口径：取消由管理员发起，触发器会正常发站内信 + Brevo 进度邮件；
--   只有「本人自助取消」才在触发器里跳过。
--
-- 幂等：create or replace function；不改表结构、不改已有数据。
-- ============================================================================

begin;

create or replace function public.admin_cancel_shop_order(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_order public.shop_points_orders%rowtype;
  v_refund_points integer := 0;
  v_next_points integer := 0;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'admin_cancel'), 200);
  v_mail_queued boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'message', 'NOT_ADMIN');
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  select * into v_order
    from public.shop_points_orders
   where id = p_order_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'ORDER_NOT_FOUND');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'message', 'ALREADY_CANCELLED',
      'order_no', v_order.order_no,
      'refunded_points', 0,
      'current_points', (select coalesce(points, 0) from public.profiles where id = v_order.user_id),
      'mail_queued', false
    );
  end if;

  if v_order.status not in ('preparing', 'shipped') then
    return jsonb_build_object(
      'ok', false,
      'message', 'ORDER_COMPLETED',
      'status', v_order.status
    );
  end if;

  /* 只有未发货才自动退积分；shipped 的退款/售后由人工处理，
     避免出现「货在路上，钱已自动退了」的账实不符。 */
  if v_order.status = 'preparing' then
    v_refund_points := greatest(coalesce(v_order.points_used, 0), 0);

    if v_refund_points > 0 then
      update public.profiles
         set points = coalesce(points, 0) + v_refund_points
       where id = v_order.user_id
      returning points into v_next_points;

      insert into public.points_transactions
        (user_id, amount, balance_after, reason, remark, operator_id)
      values
        (
          v_order.user_id,
          v_refund_points,
          coalesce(v_next_points, 0),
          'shop_refund',
          '后台取消订单 ' || v_order.order_no,
          v_actor
        );
    else
      select coalesce(points, 0) into v_next_points
        from public.profiles where id = v_order.user_id;
    end if;
  else
    select coalesce(points, 0) into v_next_points
      from public.profiles where id = v_order.user_id;
  end if;

  update public.shop_points_orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  /* 状态 UPDATE 已经过 notify_shop_order_progress。这里只读账本，
     不重复投递；返回 true 只代表「已入队」，不代表 Brevo 已送达。 */
  select exists (
    select 1
      from public.mail_outbox
     where order_id = p_order_id
       and kind = 'shop_order'
       and dedupe_key = 'shop_order:' || p_order_id::text || ':cancelled'
  ) into v_mail_queued;

  perform public.log_admin_action(
    'update',
    'shop_points_orders',
    p_order_id::text,
    jsonb_build_object(
      'status', jsonb_build_object('from', v_order.status, 'to', 'cancelled'),
      'refunded_points', v_refund_points
    ),
    jsonb_build_object(
      'source', 'admin_cancel_shop_order',
      'reason', v_reason,
      'order_no', v_order.order_no,
      'mail_queued', v_mail_queued
    )
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'ORDER_CANCELLED',
    'order_no', v_order.order_no,
    'previous_status', v_order.status,
    'refunded_points', v_refund_points,
    'current_points', coalesce(v_next_points, 0),
    'mail_queued', v_mail_queued
  );
end;
$function$;

comment on function public.admin_cancel_shop_order(uuid, text) is
  '后台取消订单：admin only；preparing 退积分并写流水，shipped 允许取消但不自动退；completed 拒绝；写审计并返回邮件入队状态。';

revoke all on function public.admin_cancel_shop_order(uuid, text) from public;
revoke all on function public.admin_cancel_shop_order(uuid, text) from anon;
grant execute on function public.admin_cancel_shop_order(uuid, text) to authenticated;
grant execute on function public.admin_cancel_shop_order(uuid, text) to service_role;

commit;

notify pgrst, 'reload schema';