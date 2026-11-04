-- ============================================================================
-- 商城下单：收货地址快照 + 备注 + 库存真实校验扣减（2026-11-04）
--
-- 三件事必须一起做，因为它们都落在同一个函数体里（`create_shop_order`）：
--
-- ① **地址快照**：`shop_points_orders` 原来只存 `contact_type/contact_value`，
--    收货地址全靠 order_id 回读 `profiles.shipping_*`。用户改了默认地址之后，
--    历史订单就永远说不清"当时寄给谁"；结算邮件也会跟着漂。下单是**事实**，
--    必须把当时那一份地址冻在订单上。
--
-- ② **备注**：用户想写「要 XXL」「周末送」只能事后私聊管理员，退款/换货时
--    也说不清当初要求过什么。加一列 `remark`（限 200 字），随订单一并落库。
--
-- ③ **库存真实校验扣减**：`products.stock` 一直是**装饰** —— 原函数只校验
--    `quantity between 1 and 99`，既不读也不扣 `stock`。于是详情页那句
--    「库存 100 件」是纯展示，两个人同时下单都能成功，库存永远是 100。
--    这里改成：读行锁（`for update`）→ 按**累计数量**校验 → 下单成功后扣减。
--    同一商品出现在多个行（不同规格）时按累计量校验，否则两行各买 60 件
--    能绕过只剩 99 件的库存。
--
-- ⚠️ 两个必须守住的顺序约束：
--   · **所有改写动作放在全部校验之后**。plpgsql 里 `return jsonb_build_object('ok',false)`
--     **不会回滚**已经做过的写操作。若先扣库存再发现积分不足，库存就白扣了。
--   · **先 drop 再 create**。给函数加带默认值的参数会形成**新重载**，
--     与旧的 3 参版本同时存在时，前端按 3 个参数调用会撞
--     `function public.create_shop_order(jsonb, text, text) is not unique`。
--     顺带：drop 会丢授权，所以结尾必须重新 grant。
-- ============================================================================

begin;

-- ── ① 订单上的收货快照与备注 ────────────────────────────────────────────────
alter table public.shop_points_orders
  add column if not exists shipping_recipient text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_address text,
  add column if not exists remark text;

comment on column public.shop_points_orders.shipping_recipient is
  '下单当时的收件人快照。不要回读 profiles —— 用户改地址后历史订单必须保持当时的寄送信息';
comment on column public.shop_points_orders.shipping_address is
  '下单当时的收货地址快照（省市区 + 详细地址整段）';
comment on column public.shop_points_orders.remark is
  '买家备注，限 200 字，随订单落库（不进 profiles，避免带到下一单）';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'shop_points_orders_remark_length_check'
       and conrelid = 'public.shop_points_orders'::regclass
  ) then
    alter table public.shop_points_orders
      add constraint shop_points_orders_remark_length_check
      check (remark is null or char_length(remark) <= 200);
  end if;
end;
$$;

-- ── ② 先清掉旧签名（避免重载歧义 / 丢失授权）────────────────────────────────
drop function if exists public.create_shop_order(jsonb, text, text);

create or replace function public.create_shop_order(
  p_items jsonb,
  p_contact_type text,
  p_contact_value text,
  p_shipping jsonb default null,
  p_remark text default null
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
  /* 收货快照：优先用本次结算页传来的那一份（用户可能临时选了别的地址），
     没传才回落到 profiles —— 老客户端仍然能下单，只是快照等价于资料现值。 */
  v_recipient text;
  v_ship_phone text;
  v_ship_address text;
  v_remark text;
  /* 每件商品累计下单量（jsonb: {"12": 3}）：同一商品多规格时按累计量校验库存 */
  v_taken jsonb := '{}'::jsonb;
  v_pid_text text;
  v_take_qty integer;
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

  -- ── 备注：可空；给了就必须在 200 字以内（约束里也有一份，双保险）────────
  v_remark := nullif(trim(coalesce(p_remark, '')), '');
  if v_remark is not null and char_length(v_remark) > 200 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_REMARK');
  end if;

  -- ── 收货快照 ──────────────────────────────────────────────────────────
  if p_shipping is not null and jsonb_typeof(p_shipping) = 'object' then
    v_recipient := nullif(trim(coalesce(p_shipping->>'recipient', '')), '');
    v_ship_phone := nullif(trim(coalesce(p_shipping->>'phone', '')), '');
    v_ship_address := nullif(trim(coalesce(p_shipping->>'address', '')), '');

    /* 传了就必须传全：只有一半的地址对寄送毫无用处，还会让管理员以为"有地址" */
    if v_recipient is null or v_ship_phone is null or v_ship_address is null then
      return jsonb_build_object('ok', false, 'message', 'INVALID_SHIPPING');
    end if;
    if char_length(v_ship_address) > 500 then
      return jsonb_build_object('ok', false, 'message', 'INVALID_SHIPPING');
    end if;
  else
    select nullif(trim(coalesce(shipping_recipient, '')), ''),
           nullif(trim(coalesce(shipping_phone, '')), ''),
           nullif(trim(coalesce(shipping_address, '')), '')
      into v_recipient, v_ship_phone, v_ship_address
      from public.profiles
     where id = v_user_id;
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

    /* for update（不是 for share）：后面要按校验结果扣库存，
       共享锁挡不住并发下单，两边都会通过校验。 */
    select
      id, title, category, description,
      points_cost, stock, image, is_active,
      payment_mode, rmb_price
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_FOUND', 'product_id', v_product_id);
    end if;

    if coalesce(v_product.is_active, false) = false then
      return jsonb_build_object('ok', false, 'message', 'PRODUCT_NOT_AVAILABLE', 'product_id', v_product_id);
    end if;

    -- ── 库存：按**累计**数量校验（stock 为 null 视为不限量）──────────────
    v_taken := v_taken || jsonb_build_object(
      v_product_id::text,
      coalesce((v_taken->>v_product_id::text)::integer, 0) + v_quantity
    );
    if v_product.stock is not null then
      if (v_taken->>v_product_id::text)::integer > v_product.stock then
        return jsonb_build_object(
          'ok', false,
          'message', 'INSUFFICIENT_STOCK',
          'product_id', v_product_id,
          'stock', v_product.stock
        );
      end if;
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

  -- 按需扣减积分（先校验余额，写动作留到全部校验通过之后）
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

  -- ══ 校验全部通过，从这里开始才是写操作 ══════════════════════════════════
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
    status,
    shipping_recipient,
    shipping_phone,
    shipping_address,
    remark
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
    'preparing',
    v_recipient,
    v_ship_phone,
    v_ship_address,
    v_remark
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

  -- 扣库存：行锁已在上面拿住，这里的 stock >= 判定不会失败；
  -- 真失败说明锁语义被绕过，必须整体回滚而不是留一张扣不掉的订单。
  for v_pid_text, v_take_qty in
    select key, value::integer from jsonb_each_text(v_taken)
  loop
    update public.products
       set stock = stock - v_take_qty
     where id = v_pid_text::bigint
       and stock is not null
       and stock >= v_take_qty;

    if not found then
      raise exception 'SHOP_STOCK_DECREMENT_RACE product_id=%', v_pid_text
        using errcode = 'P0001';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'message', 'CREATE_ORDER_SUCCESS',
    'order_id', v_order_id,
    'order_no', v_order_no,
    'points_deducted', coalesce(v_total_points, 0),
    'rmb_total', nullif(v_total_rmb, 0),
    'current_points', coalesce(v_next_points, 0),
    'payment_mode', v_order_payment_mode,
    'items', v_items_snapshot,
    'shipping', jsonb_build_object(
      'recipient', v_recipient,
      'phone', v_ship_phone,
      'address', v_ship_address
    ),
    'remark', v_remark
  );
end;
$function$;

-- ── 授权：drop 之后再建会默认 Open，必须重新收口 ───────────────────────────
revoke all on function public.create_shop_order(jsonb, text, text, jsonb, text) from public;
revoke all on function public.create_shop_order(jsonb, text, text, jsonb, text) from anon;
grant execute on function public.create_shop_order(jsonb, text, text, jsonb, text) to authenticated;
grant execute on function public.create_shop_order(jsonb, text, text, jsonb, text) to service_role;

commit;

-- ============================================================================
-- 回滚说明（手工执行，不在迁移里）：
--   drop function if exists public.create_shop_order(jsonb, text, text, jsonb, text);
--   -- 再从 2026110317_shop_order_payment_mode.sql 重建 3 参版本并重新 grant。
--   加的四个列是 add column if not exists，回滚时不必删（旧函数不写它们）。
-- ============================================================================
