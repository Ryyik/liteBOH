-- 多支付方式支持：
-- 1) products 表新增 payment_mode + rmb_price
-- 2) shop_points_orders 表扩展 points_used / rmb_total / payment_mode
-- 3) 重写 RPC create_shop_order_with_points → create_shop_order
-- 支付模式: points_only | rmb_only | combined

begin;

-- ===== products 表 =====
alter table public.products
  add column if not exists payment_mode text not null default 'points_only'
    check (payment_mode in ('points_only', 'rmb_only', 'combined'));

alter table public.products
  add column if not exists rmb_price integer;

-- 确保已有商品默认值正确
update public.products
   set payment_mode = 'points_only'
 where payment_mode is null;

-- 约束校验（豁免不可购买商品：绝版/下架商品 points_cost 或 rmb_price 可能为 0）
alter table public.products
  drop constraint if exists chk_products_points_required;

alter table public.products
  add constraint chk_products_points_required
    check (payment_mode <> 'points_only' or points_cost > 0 or is_purchasable = false);

alter table public.products
  drop constraint if exists chk_products_rmb_required;

alter table public.products
  add constraint chk_products_rmb_required
    check (payment_mode not in ('rmb_only', 'combined') or rmb_price > 0 or is_purchasable = false);

-- ===== shop_points_orders 表扩展 =====
alter table public.shop_points_orders
  add column if not exists points_used integer default 0;

alter table public.shop_points_orders
  add column if not exists rmb_total integer;

alter table public.shop_points_orders
  add column if not exists payment_mode text not null default 'points_only'
    check (payment_mode in ('points_only', 'rmb_only', 'combined'));

-- 迁移旧数据
update public.shop_points_orders
   set points_used = coalesce(total_points, 0),
       payment_mode = 'points_only'
 where points_used is null
    or points_used = 0;

-- ===== 新 RPC 函数 =====
create or replace function public.create_shop_order(
  p_items jsonb,
  p_contact_type text,
  p_contact_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if v_contact_type not in ('qq', 'vx') then
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
    'pending'
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
$$;

-- 权限
revoke all on function public.create_shop_order(jsonb, text, text) from public;
grant execute on function public.create_shop_order(jsonb, text, text) to authenticated;
grant execute on function public.create_shop_order(jsonb, text, text) to service_role;

commit;
