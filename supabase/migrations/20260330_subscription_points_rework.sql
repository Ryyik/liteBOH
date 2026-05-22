-- 订阅积分化改造：订阅统一走积分扣费

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_code text not null,
  plan_name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  points_cost integer not null default 0 check (points_cost >= 0),
  duration_months integer not null check (duration_months > 0),
  started_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_user_subscriptions_user_status_expires
  on public.user_subscriptions (user_id, status, expires_at desc);

create index if not exists idx_user_subscriptions_user_plan
  on public.user_subscriptions (user_id, plan_code, created_at desc);

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.user_subscriptions to authenticated;
grant all on table public.user_subscriptions to service_role;

create or replace function public.subscribe_with_points(
  p_plan_code text,
  p_plan_name text,
  p_billing_cycle text,
  p_points_cost integer,
  p_duration_months integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_current_points integer := 0;
  v_next_points integer := 0;
  v_started_at timestamp with time zone := v_now;
  v_expires_at timestamp with time zone := v_now;
  v_latest_expire timestamp with time zone;
  v_subscription_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  if coalesce(trim(p_plan_code), '') = ''
     or coalesce(trim(p_plan_name), '') = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_INPUT'
    );
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_BILLING_CYCLE'
    );
  end if;

  if coalesce(p_points_cost, -1) < 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_POINTS_COST'
    );
  end if;

  if coalesce(p_duration_months, 0) <= 0
     or p_duration_months > 120 then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_DURATION_MONTHS'
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

  if v_current_points < p_points_cost then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'current_points', v_current_points,
      'required_points', p_points_cost
    );
  end if;

  select expires_at
    into v_latest_expire
    from public.user_subscriptions
   where user_id = v_user_id
     and plan_code = p_plan_code
     and status = 'active'
     and expires_at > v_now
   order by expires_at desc
   limit 1;

  if v_latest_expire is not null and v_latest_expire > v_started_at then
    v_started_at := v_latest_expire;
  end if;

  v_expires_at := v_started_at + make_interval(months => p_duration_months);

  update public.profiles
     set points = coalesce(points, 0) - p_points_cost
   where id = v_user_id
   returning points into v_next_points;

  update public.user_subscriptions
     set status = 'expired',
         updated_at = now()
   where user_id = v_user_id
     and status = 'active'
     and expires_at <= v_now;

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    plan_name,
    billing_cycle,
    points_cost,
    duration_months,
    started_at,
    expires_at,
    status,
    metadata
  )
  values (
    v_user_id,
    p_plan_code,
    p_plan_name,
    p_billing_cycle,
    p_points_cost,
    p_duration_months,
    v_started_at,
    v_expires_at,
    'active',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'SUBSCRIBE_SUCCESS',
    'subscription_id', v_subscription_id,
    'plan_code', p_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'points_deducted', p_points_cost,
    'current_points', coalesce(v_next_points, 0),
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) from public;

grant execute on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) to service_role;
