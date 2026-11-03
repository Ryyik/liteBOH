-- ============================================================================
-- A3 · 下单 / 取消订单节流 + 未完成订单上限
--
-- 背景（2026-11-02 RC 安全复审 P2-N1）：
--   create_shop_order 与 cancel_shop_order 都是 SECURITY DEFINER，函数体里
--   **没有任何节流**，也没有「未完成订单数上限」。一个刚注册的账号可以脚本化
--   循环下单：
--     · 反复争用 products 行锁（`for share`）与 profiles 行锁（`for update`）；
--     · shop_points_orders 无界增长；
--     · 每单都可能触发一封结算邮件（Shop/index.vue → sendMerchandiseSettlementEmail）。
--
-- 取值依据：
--   · 5 单/小时 —— 商城 13 款商品，正常用户一小时内极少超过 3 单；
--     这一档足以挡住脚本化循环，又不会误伤「一次买多件」（一件商品多数量仍算 1 单）。
--   · 未完成订单（status='preparing'，即已付未发货）上限 10 ——
--     超过就不是正常消费行为，而是把订单表当暂存盘。
--   · 取消 20 次/小时 —— 取消本身可被用来反复「下单-取消-下单」刷流水，
--     但阈值必须比下单宽松（真实用户会连点、会遇到发货后取消失败）。
--
-- 为什么要同时加上限而不只加节流：
--   节流是「单位时间」约束，攻击者降低频率（每小时 5 单）依然能在一周内
--   堆出 840 单。上限是「存量」约束，两者正交，缺一个都不够。
--
-- ⚠️ 节流键用 user_id（不是 IP）：这两个函数都要求登录（auth.uid() 非空），
--    用户维度比 IP 维度更准，也不会因为运营商 NAT 误伤同网用户。
-- ⚠️ 检查放在 auth 判空之后、参数校验之前：无效请求也要计数，
--    否则「故意传错参数」可以无限探测而不留痕。
-- ============================================================================

create or replace function public.create_shop_order(
  p_items jsonb,
  p_contact_type text,
  p_contact_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product record;
  v_product_id bigint;
  v_quantity integer;
  v_total_points integer := 0;
  v_total_rmb integer := 0;
  v_current_points integer := 0;
  v_next_points integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_order_no text;
  v_contact_type text := lower(trim(coalesce(p_contact_type, '')));
  v_contact_value text := trim(coalesce(p_contact_value, ''));
  v_items_snapshot jsonb := '[]'::jsonb;
  v_order_payment_mode text := 'points_only';
  v_has_points boolean := false;
  v_has_rmb boolean := false;
  v_rate_allowed boolean := true;
  v_rate_retry integer := 0;
  v_open_orders integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  -- ── 节流（A3）：5 单 / 小时 ────────────────────────────────────────────
  select r.allowed, r.retry_after_seconds
    into v_rate_allowed, v_rate_retry
    from public.check_rate_limit('shop_order:' || v_user_id::text, 5, 3600) r;

  if not coalesce(v_rate_allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'message', 'RATE_LIMITED',
      'retry_after_seconds', v_rate_retry
    );
  end if;

  -- ── 存量上限（A3）：已付未发货订单 ≤ 10 ────────────────────────────────
  select count(*)
    into v_open_orders
    from public.shop_points_orders
   where user_id = v_user_id
     and status = 'preparing';

  if v_open_orders >= 10 then
    return jsonb_build_object(
      'ok', false,
      'message', 'TOO_MANY_OPEN_ORDERS',
      'open_orders', v_open_orders
    );
  end if;

  if v_contact_type not in ('qq', 'vx', 'profile') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_CONTACT_TYPE');
  end if;

  if v_contact_value = '' or char_length(v_contact_value) > 64 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_CONTACT_VALUE');
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or coalesce(jsonb_array_length(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end), 0) = 0 then
    return jsonb_build_object('ok', false, 'message', 'EMPTY_ITEMS');
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'id', '') !~ '^[0-9]+$'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
      return jsonb_build_object('ok', false, 'message', 'INVALID_ITEM');
    end if;

    v_product_id := (v_item->>'id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 or v_quantity > 99 then
      return jsonb_build_object('ok', false, 'message', 'INVALID_QUANTITY', 'product_id', v_product_id);
    end if;

    select
      id, title, category, description,
      points_cost, stock, image, is_active,
      payment_mode, rmb_price
    into v_product
    from public.products
    where id = v_product_id
    for share;

    if not found then
      return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_FOUND', 'product_id', v_product_id);
    end if;

    if coalesce(v_product.is_active, false) = false then
      return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_AVAILABLE', 'product_id', v_product_id);
    end if;

    -- 根据支付模式验证不同字段
    if v_product.payment_mode = 'points_only' then
      if coalesce(v_product.points_cost, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_EXCHANGEABLE', 'product_id', v_product_id);
      end if;
      v_total_points := v_total_points + (v_product.points_cost * v_quantity);
      v_has_points := true;
      v_order_payment_mode := 'points_only';

    elsif v_product.payment_mode = 'rmb_only' then
      if coalesce(v_product.rmb_price, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_PURCHASABLE', 'product_id', v_product_id);
      end if;
      v_total_rmb := v_total_rmb + (v_product.rmb_price * v_quantity);
      v_has_rmb := true;
      if v_order_payment_mode = 'points_only' then
        v_order_payment_mode := 'rmb_only';
      elsif v_has_points then
        v_order_payment_mode := 'combined';
      end if;

    elsif v_product.payment_mode = 'combined' then
      if coalesce(v_product.points_cost, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_INVALID_COMBINED', 'product_id', v_product_id);
      end if;
      if coalesce(v_product.rmb_price, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_INVALID_COMBINED', 'product_id', v_product_id);
      end if;
      v_total_points := v_total_points + (v_product.points_cost * v_quantity);
      v_total_rmb := v_total_rmb + (v_product.rmb_price * v_quantity);
      v_has_points := true;
      v_has_rmb := true;
      v_order_payment_mode := 'combined';
    end if;

    v_items_snapshot := v_items_snapshot || jsonb_build_array(
      jsonb_build_object(
        'id', v_product.id,
        'title', v_product.title,
        'category', v_product.category,
        'description', v_product.description,
        'image', v_product.image,
        'points_cost', v_product.points_cost,
        'rmb_price', v_product.rmb_price,
        'payment_mode', v_product.payment_mode,
        'stock', v_product.stock,
        'quantity', v_quantity,
        'selected_spec', coalesce(v_item->>'selected_spec', ''),
        'selected_spec_label', coalesce(v_item->>'selected_spec_label', '')
      )
    );
  end loop;

  -- 按需扣减积分
  if v_has_points and v_total_points > 0 then
    select coalesce(points, 0)
      into v_current_points
      from public.profiles
     where id = v_user_id
     for update;

    if not found then
      return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
    end if;

    if v_current_points < v_total_points then
      return jsonb_build_object(
        'ok', false, 'message', 'INSUFFICIENT_POINTS',
        'current_points', v_current_points,
        'required_points', v_total_points
      );
    end if;
  end if;

  v_order_no := 'BOH-ORDER-'
    || to_char(now(), 'YYYYMMDDHH24MISS')
    || '-'
    || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  insert into public.shop_points_orders (
    id,
    user_id,
    order_no,
    contact_type,
    contact_value,
    items,
    total_points,
    points_used,
    rmb_total,
    payment_mode,
    status
  )
  values (
    v_order_id,
    v_user_id,
    v_order_no,
    v_contact_type,
    v_contact_value,
    v_items_snapshot,
    coalesce(v_total_points, 0),
    coalesce(v_total_points, 0),
    nullif(v_total_rmb, 0),
    v_order_payment_mode,
    'preparing'
  );

  if v_has_points and v_total_points > 0 then
    update public.profiles
       set points = coalesce(points, 0) - v_total_points
     where id = v_user_id
     returning points into v_next_points;
  else
    select points
      into v_next_points
      from public.profiles
     where id = v_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'CREATE_ORDER_SUCCESS',
    'order_id', v_order_id,
    'order_no', v_order_no,
    'points_deducted', coalesce(v_total_points, 0),
    'rmb_total', nullif(v_total_rmb, 0),
    'current_points', coalesce(v_next_points, 0),
    'payment_mode', v_order_payment_mode,
    'items', v_items_snapshot
  );
end;
$function$;

create or replace function public.cancel_shop_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_refund_points integer := 0;
  v_next_points integer := 0;
  v_rate_allowed boolean := true;
  v_rate_retry integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  -- ── 节流（A3）：20 次 / 小时 ───────────────────────────────────────────
  select r.allowed, r.retry_after_seconds
    into v_rate_allowed, v_rate_retry
    from public.check_rate_limit('shop_cancel:' || v_user_id::text, 20, 3600) r;

  if not coalesce(v_rate_allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'message', 'RATE_LIMITED',
      'retry_after_seconds', v_rate_retry
    );
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
$function$;
