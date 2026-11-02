-- ============================================================================
-- 2026-11-02 订单 / 礼物：四态收敛 + 未发货可自助退款
--
-- 用户口径：
--   ①「准备中，已发货，完成，取消，就这四个状态就行了」
--   ②「在未发货前可以让用户直接退款」
--
-- 四态（shop_points_orders.status 与 user_gifts.gift_status 完全一致）：
--   preparing 准备中  —— 未发货，用户可自助取消并退回积分
--   shipped   已发货  —— 包裹在路上，不可自助取消，走人工售后
--   completed 完成    —— 已交付
--   cancelled 取消    —— 已取消，积分已退回（幂等，不会二次退）
--
-- 历史值归并：pending / processing → preparing（两者都是"还没发出去"，
-- 分两档对用户没有意义，后台也多一个要维护的格子）。
--
-- 幂等：重复调用对已取消的记录直接返回 ok + ALREADY_CANCELLED，不会二次加积分。
-- 流水：退积分必须写 points_transactions（reason='shop_refund'），否则用户账单上
--       「积分回来了但没记录」，和 2026090903 修的那批「只发不收」是同一类问题。
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) 先摘掉旧白名单，再改数据，最后挂新白名单
--    ⚠️ 顺序不能反：旧约束里没有 preparing，先改数据会直接 23514。
-- ----------------------------------------------------------------------------
alter table public.shop_points_orders
  drop constraint if exists shop_points_orders_status_check;

alter table public.user_gifts
  drop constraint if exists check_gift_status;

update public.shop_points_orders
   set status = 'preparing',
       updated_at = now()
 where status in ('pending', 'processing');

update public.user_gifts
   set gift_status = 'preparing',
       updated_at = now()
 where gift_status = 'processing';

-- ----------------------------------------------------------------------------
-- 2) 约束收敛成四态
-- ----------------------------------------------------------------------------
alter table public.shop_points_orders
  add constraint shop_points_orders_status_check
  check (
    status = any (
      array['preparing'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text]
    )
  );

alter table public.user_gifts
  add constraint check_gift_status
  check (
    gift_status = any (
      array['preparing'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text]
    )
  );

-- ----------------------------------------------------------------------------
-- 3) 下单 RPC：落库状态从 'pending' 改为 'preparing'
--    函数体 200 行，不整段复制（抄错一个字就是线上事故）：
--    取当前定义、只替换那一处、再 execute 回去，前后做断言。
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_shop_order';

  if v_def is null then
    raise exception 'create_shop_order 不存在，无法收敛订单状态';
  end if;

  if position($q$'pending'$q$ in v_def) = 0 then
    return;
  end if;

  v_def := replace(v_def, $q$'pending'$q$, $q$'preparing'$q$);

  if position($q$'pending'$q$ in v_def) > 0 then
    raise exception 'create_shop_order 里还有其它 pending 字面量，请人工核对';
  end if;

  execute v_def;
end $$;

-- ----------------------------------------------------------------------------
-- 4) 取消购物订单 + 退积分（只有 preparing 可退 = 未发货前）
-- ----------------------------------------------------------------------------
create or replace function public.cancel_shop_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_refund_points integer := 0;
  v_next_points integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  -- 锁行：并发两次点击时，第二次会读到已 cancelled 的状态走幂等分支，
  -- 不会重复加积分（这是这个函数最要紧的一条）。
  select o.user_id, o.status, o.points_used, o.order_no
    into v_order
    from public.shop_points_orders o
   where o.id = p_order_id
     for update;

  if not found or v_order.user_id <> v_user_id then
    -- 不区分「不存在」和「不是你的」，避免拿订单 id 探测他人订单
    return jsonb_build_object('ok', false, 'message', 'ORDER_NOT_FOUND');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'message', 'ALREADY_CANCELLED', 'refunded_points', 0);
  end if;

  -- 未发货 = preparing。shipped 之后包裹已在路上，自助退会变成
  -- 「钱退了货还在寄」，只能走人工售后。
  if v_order.status <> 'preparing' then
    return jsonb_build_object(
      'ok', false,
      'message', 'ORDER_NOT_CANCELLABLE',
      'status', v_order.status
    );
  end if;

  v_refund_points := greatest(coalesce(v_order.points_used, 0), 0);

  if v_refund_points > 0 then
    update public.profiles
       set points = coalesce(points, 0) + v_refund_points
     where id = v_user_id
    returning points into v_next_points;

    insert into public.points_transactions
      (user_id, amount, balance_after, reason, remark, operator_id)
    values
      (
        v_user_id,
        v_refund_points,
        coalesce(v_next_points, 0),
        'shop_refund',
        '取消订单 ' || v_order.order_no,
        v_user_id
      );
  else
    select coalesce(points, 0) into v_next_points from public.profiles where id = v_user_id;
  end if;

  update public.shop_points_orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'ORDER_CANCELLED',
    'order_no', v_order.order_no,
    'refunded_points', v_refund_points,
    'current_points', coalesce(v_next_points, 0)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) 取消礼物（礼物是中奖 / 管理员发放，无积分可退，只改状态）
-- ----------------------------------------------------------------------------
create or replace function public.cancel_user_gift(p_gift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_gift record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if p_gift_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  select g.user_id, g.gift_status, g.gift_no
    into v_gift
    from public.user_gifts g
   where g.id = p_gift_id
     for update;

  if not found or v_gift.user_id <> v_user_id then
    return jsonb_build_object('ok', false, 'message', 'GIFT_NOT_FOUND');
  end if;

  if v_gift.gift_status = 'cancelled' then
    return jsonb_build_object('ok', true, 'message', 'ALREADY_CANCELLED');
  end if;

  if v_gift.gift_status <> 'preparing' then
    return jsonb_build_object(
      'ok', false,
      'message', 'GIFT_NOT_CANCELLABLE',
      'status', v_gift.gift_status
    );
  end if;

  update public.user_gifts
     set gift_status = 'cancelled',
         updated_at = now()
   where id = p_gift_id;

  return jsonb_build_object('ok', true, 'message', 'GIFT_CANCELLED', 'gift_no', v_gift.gift_no);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) 权限：只给登录用户，anon 一律不可执行
-- ----------------------------------------------------------------------------
revoke all on function public.cancel_shop_order(uuid) from public;
revoke all on function public.cancel_user_gift(uuid) from public;
grant execute on function public.cancel_shop_order(uuid) to authenticated;
grant execute on function public.cancel_user_gift(uuid) to authenticated;
grant execute on function public.cancel_shop_order(uuid) to service_role;
grant execute on function public.cancel_user_gift(uuid) to service_role;

commit;
