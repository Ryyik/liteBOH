-- =============================================
-- 订阅发放：跳过任意层级已有订阅 + 名单显示任意层级
-- 1) admin_batch_grant_subscriptions 增加 p_skip_any_tier 参数
--    - 为 true 时跳过「任意层级」生效订阅用户；false 时仅跳过同层级
-- 2) admin_list_existing_subscribers 增加 p_any_tier 参数 + 返回 same_total / any_total
-- =============================================

begin;

-- 移除旧签名，避免重载歧义
drop function if exists public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean);

-- ------------------------------------------------------------------
-- 1. 批量发放订阅（支持跳过任意层级）
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
  p_metadata jsonb default '{}'::jsonb,
  p_skip_existing boolean default false,
  p_skip_any_tier boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_affected integer := 0;
  v_skipped integer := 0;
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

  -- 跳过已有生效订阅用户
  if p_skip_existing then
    if p_skip_any_tier then
      -- 任意层级：跳过所有已有生效订阅的用户
      select count(*) into v_skipped
        from public.user_subscriptions s
       where s.user_id = any(v_targets)
         and s.status = 'active'
         and s.expires_at > now();

      v_targets := array(
        select t.user_id
          from unnest(v_targets) as t(user_id)
         where not exists (
           select 1
             from public.user_subscriptions s
            where s.user_id = t.user_id
              and s.status = 'active'
              and s.expires_at > now()
         )
      );
    else
      -- 同层级：仅跳过同层级生效订阅的用户
      select count(*) into v_skipped
        from public.user_subscriptions s
       where s.user_id = any(v_targets)
         and s.plan_code = p_plan_code
         and s.status = 'active'
         and s.expires_at > now();

      v_targets := array(
        select t.user_id
          from unnest(v_targets) as t(user_id)
         where not exists (
           select 1
             from public.user_subscriptions s
            where s.user_id = t.user_id
              and s.plan_code = p_plan_code
              and s.status = 'active'
              and s.expires_at > now()
         )
      );
    end if;
  end if;

  if cardinality(v_targets) = 0 then
    return jsonb_build_object(
      'ok', true,
      'affected', 0,
      'skipped', v_skipped,
      'batch_id', v_batch_id,
      'plan_code', p_plan_code,
      'plan_name', p_plan_name,
      'message', '所有目标用户均已有生效订阅，已全部跳过'
    );
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
    'skipped', v_skipped,
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

revoke all on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean) from public;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean) to authenticated;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean) to service_role;

-- ------------------------------------------------------------------
-- 2. 已有订阅名单：支持任意层级 + 返回 same_total / any_total
-- ------------------------------------------------------------------
drop function if exists public.admin_list_existing_subscribers(text, integer);

create or replace function public.admin_list_existing_subscribers(
  p_plan_code text default null,
  p_any_tier boolean default false,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_total integer;
  v_same_total integer;
  v_any_total integer;
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看已有订阅用户';
  end if;

  v_limit := least(greatest(p_limit, 1), 500);

  -- 同层级生效订阅的去重用户数（用于「跳过同层级」提示）
  select count(distinct s.user_id) into v_same_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now()
     and (p_plan_code is null or s.plan_code = p_plan_code);

  -- 任意层级生效订阅的去重用户数（用于「跳过所有层级」提示）
  select count(distinct s.user_id) into v_any_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now();

  -- 名单行数（与下方 rows 过滤条件一致）
  select count(*) into v_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now()
     and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code);

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', s.id,
      'user_id', s.user_id,
      'username', coalesce(nullif(trim(pr.username), ''), '未命名用户'),
      'plan_code', s.plan_code,
      'plan_name', s.plan_name,
      'billing_cycle', s.billing_cycle,
      'duration_months', s.duration_months,
      'points_cost', s.points_cost,
      'started_at', s.started_at,
      'expires_at', s.expires_at,
      'status', s.status
    ) as row_json
    from public.user_subscriptions s
    left join public.profiles pr on pr.id = s.user_id
    where s.status = 'active'
      and s.expires_at > now()
      and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code)
    order by pr.username
    limit v_limit
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'same_total', v_same_total,
    'any_total', v_any_total,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_list_existing_subscribers(text, boolean, integer) from public;
grant execute on function public.admin_list_existing_subscribers(text, boolean, integer) to authenticated;
grant execute on function public.admin_list_existing_subscribers(text, boolean, integer) to service_role;

notify pgrst, 'reload schema';

commit;
