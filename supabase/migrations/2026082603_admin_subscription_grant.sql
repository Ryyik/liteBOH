-- =============================================
-- 订阅发放：管理员批量添加订阅
-- 1) user_subscriptions 增加 batch_id 列（批次分组，仅管理员批量发放时写入）
-- 2) admin_batch_grant_subscriptions：批量插入订阅记录（不扣积分）
--    - p_user_ids = null/空 -> 全部用户（含管理员）
-- 3) admin_list_subscription_grant_batches：按 batch_id 分组列出最近发放批次
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. batch_id 列
-- ------------------------------------------------------------------
alter table public.user_subscriptions
  add column if not exists batch_id uuid null;

create index if not exists idx_user_subscriptions_batch_id
  on public.user_subscriptions (batch_id);

-- ------------------------------------------------------------------
-- 2. 批量发放订阅
-- ------------------------------------------------------------------
create or replace function public.admin_batch_grant_subscriptions(
  p_user_ids uuid[] default null,
  p_plan_code text default '',
  p_plan_name text default '',
  p_billing_cycle text default 'monthly',
  p_points_cost integer default 0,
  p_duration_months integer default 1,
  p_started_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_affected integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_started_at timestamptz;
  v_expires_at timestamptz;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可批量发放订阅';
  end if;

  if coalesce(trim(p_plan_code), '') = '' or coalesce(trim(p_plan_name), '') = '' then
    raise exception '订阅层级与名称不能为空';
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception '订阅周期无效';
  end if;

  if coalesce(p_points_cost, -1) < 0 then
    raise exception '积分成本不能为负数';
  end if;

  if coalesce(p_duration_months, 0) <= 0 or p_duration_months > 120 then
    raise exception '订阅月数必须是 1-120 之间的整数';
  end if;

  if p_status not in ('active', 'expired', 'cancelled') then
    raise exception '订阅状态无效';
  end if;

  v_started_at := coalesce(p_started_at, now());
  v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(months => p_duration_months));

  if v_expires_at <= v_started_at then
    raise exception '到期时间必须晚于订阅时间';
  end if;

  -- 空数组/NULL -> 全部用户（含管理员）
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles;
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可发放订阅的用户';
  end if;

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
    metadata,
    batch_id
  )
  select
    p.id,
    p_plan_code,
    p_plan_name,
    p_billing_cycle,
    p_points_cost,
    p_duration_months,
    v_started_at,
    v_expires_at,
    p_status,
    coalesce(p_metadata, '{}'::jsonb),
    v_batch_id
  from public.profiles p
  where p.id = any(v_targets);

  get diagnostics v_affected = row_count;

  return jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'batch_id', v_batch_id,
    'plan_code', p_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'duration_months', p_duration_months,
    'points_cost', p_points_cost,
    'started_at', v_started_at,
    'expires_at', v_expires_at,
    'status', p_status
  );
end;
$$;

revoke all on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb) from public;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb) to authenticated;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb) to service_role;

-- ------------------------------------------------------------------
-- 3. 批次记录查询
-- ------------------------------------------------------------------
create or replace function public.admin_list_subscription_grant_batches(
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_offset integer;
  v_total integer;
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看发放记录';
  end if;

  v_limit := least(greatest(p_page_size, 1), 50);
  v_offset := (greatest(p_page, 1) - 1) * v_limit;

  select count(distinct batch_id) into v_total
    from public.user_subscriptions
   where batch_id is not null;

  select coalesce(jsonb_agg(row_json order by batch_created_at desc), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'batch_id', b.batch_id,
        'batch_created_at', b.batch_created_at,
        'plan_code', b.plan_code,
        'plan_name', b.plan_name,
        'billing_cycle', b.billing_cycle,
        'duration_months', b.duration_months,
        'points_cost', b.points_cost,
        'started_at', b.started_at,
        'expires_at', b.expires_at,
        'status', b.status,
        'grant_count', b.grant_count,
        'users', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'username', coalesce(nullif(trim(pr.username), ''), '未命名用户')
          ) order by pr.username), '[]'::jsonb)
          from public.user_subscriptions s
          left join public.profiles pr on pr.id = s.user_id
          where s.batch_id = b.batch_id
        )
      ) as row_json,
      b.batch_created_at
    from (
      select
        batch_id,
        min(created_at) as batch_created_at,
        min(plan_code) as plan_code,
        min(plan_name) as plan_name,
        min(billing_cycle) as billing_cycle,
        min(duration_months) as duration_months,
        min(points_cost) as points_cost,
        min(started_at) as started_at,
        min(expires_at) as expires_at,
        min(status) as status,
        count(*) as grant_count
      from public.user_subscriptions
      where batch_id is not null
      group by batch_id
    ) b
    order by batch_created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_list_subscription_grant_batches(integer, integer) from public;
grant execute on function public.admin_list_subscription_grant_batches(integer, integer) to authenticated;
grant execute on function public.admin_list_subscription_grant_batches(integer, integer) to service_role;

notify pgrst, 'reload schema';

commit;
