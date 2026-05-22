-- 商城积分下单硬化：
-- 1) 新增订单主记录表，保证扣分前后有可追踪订单
-- 2) 提供原子 RPC：同事务内完成「校验商品 -> 订单落库 -> 积分扣减」
-- 3) 收紧 profiles 更新策略，禁止客户端直接改 points

create table if not exists public.shop_points_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_no text not null unique,
  contact_type text not null check (contact_type in ('qq', 'vx')),
  contact_value text not null,
  items jsonb not null default '[]'::jsonb,
  total_points integer not null default 0 check (total_points > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_shop_points_orders_user_created
  on public.shop_points_orders (user_id, created_at desc);

alter table public.shop_points_orders enable row level security;

drop policy if exists shop_points_orders_select_own on public.shop_points_orders;
create policy shop_points_orders_select_own
  on public.shop_points_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.shop_points_orders to authenticated;
grant all on table public.shop_points_orders to service_role;

do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
       and policyname = 'Users can update own profile'
  ) then
    execute $sql$
      alter policy "Users can update own profile"
      on public.profiles
      using (auth.uid() = id)
      with check (
        (auth.uid() = id)
        and (
          points is not distinct from (
            select p.points
              from public.profiles p
             where p.id = auth.uid()
          )
        )
      )
    $sql$;
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
       and policyname = 'Users can update their own profile'
  ) then
    execute $sql$
      alter policy "Users can update their own profile"
      on public.profiles
      using (auth.uid() = id)
      with check (
        (auth.uid() = id)
        and (
          points is not distinct from (
            select p.points
              from public.profiles p
             where p.id = auth.uid()
          )
        )
      )
    $sql$;
  end if;
end
$$;

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
