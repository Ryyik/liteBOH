-- ============================================================================
-- 商城订单：支付模式状态机 + 约束口径 + 清掉旧死函数
--
-- 来源（2026-11-03 外部审查 F7，本次核实三条全部坐实）：
--   ① `create_shop_order` 的 `v_order_payment_mode` 在**每个商品分支里被覆盖**，
--      而 `v_has_rmb` 赋值后从未被读取（`supabase db lint` 实测报
--      `never read variable "v_has_rmb"`）。后果：
--        · 购物车先放 points_only、后放 rmb_only ⇒ rmb_only 分支看到
--          `v_order_payment_mode = 'points_only'` 就把它改成 `'rmb_only'`，
--          明明混了两种支付方式，订单却记成纯 RMB；
--        · 反向顺序则被 points_only 分支重置回 `'points_only'`。
--      修法：分支只累计金额与布尔标志，**循环结束后按两个标志一次性定档**，
--      不依赖商品顺序。
--   ② `shop_points_orders.total_points` 的 CHECK 是 `> 0`，与 `rmb_only`
--      分支（`v_total_points` 保持 0）互斥 ⇒ 纯 RMB 商品一上架，下单必然 23514。
--      当前线上无 rmb_only 在售商品，属于「还没触发」而不是「没问题」。
--   ③ `create_shop_order_with_points(jsonb,text,text)` 是运行期死函数：
--      它插入 `status='pending'`，而线上 CHECK 只允许
--      preparing/shipped/completed/cancelled（`2026110201` 改的，且那次只
--      replace 了 `create_shop_order`，没管这个旧名字）⇒ 每次调用必 23514。
--      它 authenticated 可执行、前端零调用，属于白送的报错入口。
--
-- 约束口径（`payment_mode` 与金额必须自洽）：
--   points_only ⇒ 积分 > 0 且 rmb_total 为空/0
--   rmb_only    ⇒ 积分为 0 且 rmb_total > 0
--   combined    ⇒ 两者都 > 0
--   现有 4 行数据实测全部满足（3 条 combined、1 条 points_only），可直接 validate。
-- ============================================================================

-- 四个语句必须原子：函数换了一半、约束没跟上，会导致「新模式写不进旧约束」的中间态。
begin;

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
  v_order_payment_mode text;
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

    -- 根据支付模式验证不同字段。
    -- ⚠️ 这里**只累计金额与标志**，不写 v_order_payment_mode ——
    --    模式由循环结束后的两个布尔量一次性定档（见下），否则结果依赖商品顺序。
    if v_product.payment_mode = 'points_only' then
      if coalesce(v_product.points_cost, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_EXCHANGEABLE', 'product_id', v_product_id);
      end if;
      v_total_points := v_total_points + (v_product.points_cost * v_quantity);
      v_has_points := true;

    elsif v_product.payment_mode = 'rmb_only' then
      if coalesce(v_product.rmb_price, 0) <= 0 then
        return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_PURCHASABLE', 'product_id', v_product_id);
      end if;
      v_total_rmb := v_total_rmb + (v_product.rmb_price * v_quantity);
      v_has_rmb := true;

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

  -- 支付模式定档：只在循环结束后算一次，与商品顺序无关
  if not (v_has_points or v_has_rmb) then
    return jsonb_build_object('ok', false, 'message', 'EMPTY_ITEMS');
  end if;

  v_order_payment_mode := case
    when v_has_points and v_has_rmb then 'combined'
    when v_has_rmb then 'rmb_only'
    else 'points_only'
  end;

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

-- ────────────────────────────────────────────────────────────────────────────
-- 约束：total_points 允许 0（纯 RMB 单），但支付模式与金额必须自洽
-- ────────────────────────────────────────────────────────────────────────────
alter table public.shop_points_orders
  drop constraint if exists shop_points_orders_total_points_check;

alter table public.shop_points_orders
  add constraint shop_points_orders_total_points_check check (total_points >= 0);

alter table public.shop_points_orders
  drop constraint if exists shop_points_orders_payment_mode_amounts_check;

alter table public.shop_points_orders
  add constraint shop_points_orders_payment_mode_amounts_check check (
    case payment_mode
      when 'points_only' then total_points > 0 and coalesce(rmb_total, 0) = 0
      when 'rmb_only'    then total_points = 0 and coalesce(rmb_total, 0) > 0
      when 'combined'    then total_points > 0 and coalesce(rmb_total, 0) > 0
      else false
    end
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 死函数清退：插 status='pending'（违反现状 CHECK）+ 前端零调用
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_shop_order_with_points(jsonb, text, text);

commit;
