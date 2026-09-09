-- =============================================
-- 积分账本补全之二：商城下单 + 周签到写流水 + 历史回填
-- 此前 points_transactions 缺这两类动线（表注释预留的 reason 值），
-- 账单对用户不完整。本次：
--   1) create_shop_order_with_points 扣分后写流水（reason='shop_order'）
--   2) submit_weekly_checkin 加分后写流水（reason='weekly_checkin'），
--      顺带把「UPDATE 后再 SELECT 读余额」改为 RETURNING 原子快照
--   3) 历史回填：商城订单全量；签到仅回填 2026-06-30 重构后
--      （每周固定 +5，金额可靠；重构前为连续 4 周周期制，无法可靠重建，不补）
-- 均为幂等回填（NOT EXISTS 守卫）。
-- =============================================

-- ============================================
-- 1. 商城积分下单：逐字以 2026033104 版为基线，仅扣分段后追加流水写入
-- ============================================
create or replace function public.create_shop_order_with_points(
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
  v_current_points integer := 0;
  v_next_points integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_order_no text;
  v_contact_type text := lower(trim(coalesce(p_contact_type, '')));
  v_contact_value text := trim(coalesce(p_contact_value, ''));
  v_items_snapshot jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  if v_contact_type not in ('qq', 'vx') then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_CONTACT_TYPE'
    );
  end if;

  if v_contact_value = '' or char_length(v_contact_value) > 64 then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_CONTACT_VALUE'
    );
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or coalesce(jsonb_array_length(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end), 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'EMPTY_ITEMS'
    );
  end if;

  for v_item in
    select value
      from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'id', '') !~ '^[0-9]+$'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
      return jsonb_build_object(
        'ok', false,
        'message', 'INVALID_ITEM'
      );
    end if;

    v_product_id := (v_item->>'id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 or v_quantity > 99 then
      return jsonb_build_object(
        'ok', false,
        'message', 'INVALID_QUANTITY',
        'product_id', v_product_id
      );
    end if;

    select
      id,
      title,
      category,
      description,
      points_cost,
      stock,
      image,
      is_active
    into v_product
    from public.products
    where id = v_product_id
    for share;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'message', 'PRODUCT_NOT_FOUND',
        'product_id', v_product_id
      );
    end if;

    if coalesce(v_product.is_active, false) = false
       or coalesce(v_product.points_cost, 0) <= 0 then
      return jsonb_build_object(
        'ok', false,
        'message', 'PRODUCT_NOT_EXCHANGEABLE',
        'product_id', v_product_id
      );
    end if;

    v_total_points := v_total_points + (v_product.points_cost * v_quantity);

    v_items_snapshot := v_items_snapshot || jsonb_build_array(
      jsonb_build_object(
        'id', v_product.id,
        'title', v_product.title,
        'category', v_product.category,
        'description', v_product.description,
        'image', v_product.image,
        'points_cost', v_product.points_cost,
        'stock', v_product.stock,
        'quantity', v_quantity,
        'selected_spec', coalesce(v_item->>'selected_spec', ''),
        'selected_spec_label', coalesce(v_item->>'selected_spec_label', '')
      )
    );
  end loop;

  if v_total_points <= 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_TOTAL_POINTS'
    );
  end if;

  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = v_user_id
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'PROFILE_NOT_FOUND'
    );
  end if;

  if v_current_points < v_total_points then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'current_points', v_current_points,
      'required_points', v_total_points
    );
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
    status
  )
  values (
    v_order_id,
    v_user_id,
    v_order_no,
    v_contact_type,
    v_contact_value,
    v_items_snapshot,
    v_total_points,
    'pending'
  );

  update public.profiles
     set points = coalesce(points, 0) - v_total_points
   where id = v_user_id
  returning points into v_next_points;

  -- 积分流水：商城兑换（2026090905 起）
  insert into public.points_transactions
    (user_id, amount, balance_after, reason, remark)
  values
    (v_user_id, -v_total_points, coalesce(v_next_points, 0), 'shop_order', '商城积分兑换 ' || v_order_no);

  return jsonb_build_object(
    'ok', true,
    'message', 'CREATE_ORDER_SUCCESS',
    'order_id', v_order_id,
    'order_no', v_order_no,
    'points_deducted', v_total_points,
    'current_points', coalesce(v_next_points, 0),
    'items', v_items_snapshot
  );
end;
$$;

revoke all on function public.create_shop_order_with_points(jsonb, text, text) from public;

grant execute on function public.create_shop_order_with_points(jsonb, text, text) to authenticated;
grant execute on function public.create_shop_order_with_points(jsonb, text, text) to service_role;

-- ============================================
-- 2. 周签到：逐字以 2026063003 版为基线，
--    UPDATE 改 RETURNING 原子快照 + 追加流水写入（reason='weekly_checkin'）
-- ============================================
create or replace function public.submit_weekly_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_local timestamp := timezone('Asia/Shanghai', now());
  v_current_week_start date := date_trunc('week', v_now_local)::date;
  v_row_count bigint;
  v_streak integer := 0;
  v_points_awarded integer := 0;
  v_current_points integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  insert into public.forum_weekly_checkins (user_id, week_start_date)
  values (v_user_id, v_current_week_start)
  on conflict (user_id, week_start_date) do nothing;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'ALREADY_SIGNED_THIS_WEEK',
      'already_signed', true
    );
  end if;

  -- 每周签到直接奖励 5 积分，不再需要连续 4 周
  v_points_awarded := 5;

  update public.profiles
     set points = coalesce(points, 0) + v_points_awarded
   where id = v_user_id
  returning points into v_current_points;

  -- 积分流水：周签到奖励（2026090905 起）
  insert into public.points_transactions
    (user_id, amount, balance_after, reason, remark)
  values
    (v_user_id, v_points_awarded, coalesce(v_current_points, 0), 'weekly_checkin', '每周签到奖励');

  return jsonb_build_object(
    'ok', true,
    'message', 'SIGNED_SUCCESS',
    'has_signed_this_week', true,
    'streak_total', 1,
    'current_streak', 1,
    'cycle_progress', 1,
    'cycle_size', 1,
    'reward_completed_this_week', true,
    'points_awarded', v_points_awarded,
    'current_points', v_current_points,
    'next_reward_in', 1,
    'current_week_start', v_current_week_start
  );
end;
$$;

revoke all on function public.submit_weekly_checkin() from public;

grant execute on function public.submit_weekly_checkin() to authenticated;
grant execute on function public.submit_weekly_checkin() to service_role;

-- ============================================
-- 3. 历史回填（幂等）
-- ============================================

-- 3a. 商城积分订单全量回填：每笔订单必然扣减 total_points，
--     与线上写入共用同一 remark 格式（'商城积分兑换 ' || order_no）作幂等键
insert into public.points_transactions
  (user_id, amount, balance_after, reason, remark, created_at)
select
  o.user_id,
  -o.total_points,
  0,
  'shop_order',
  '商城积分兑换 ' || o.order_no,
  o.created_at
from public.shop_points_orders o
where not exists (
  select 1 from public.points_transactions t
  where t.user_id = o.user_id
    and t.reason = 'shop_order'
    and t.remark = '商城积分兑换 ' || o.order_no
);

-- 3b. 周签到回填：仅 2026-06-30 重构后（week_start_date >= 2026-06-29，即重构当周周一），
--     每周固定 +5 金额可靠；重构前的连续 4 周周期制无法可靠重建金额，不补录。
--     幂等键：user_id + reason + created_at = signed_at（回填行 created_at 取原签到时间）
insert into public.points_transactions
  (user_id, amount, balance_after, reason, remark, created_at)
select
  c.user_id,
  5,
  0,
  'weekly_checkin',
  '每周签到奖励（历史补录）',
  c.signed_at
from public.forum_weekly_checkins c
where c.week_start_date >= date '2026-06-29'
  and not exists (
    select 1 from public.points_transactions t
    where t.user_id = c.user_id
      and t.reason = 'weekly_checkin'
      and t.created_at = c.signed_at
  );
