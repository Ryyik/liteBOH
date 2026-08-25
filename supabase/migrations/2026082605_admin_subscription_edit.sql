-- =============================================
-- 订阅发放：编辑已有订阅
-- 1) admin_update_subscription：管理员编辑单条订阅记录（含校验）
-- 2) admin_list_existing_subscribers 输出补充完整字段，便于编辑表单预填
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. 编辑单条订阅
-- ------------------------------------------------------------------
create or replace function public.admin_update_subscription(
  p_subscription_id uuid,
  p_plan_code text,
  p_plan_name text,
  p_billing_cycle text,
  p_points_cost integer,
  p_duration_months integer,
  p_started_at timestamptz,
  p_expires_at timestamptz,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可编辑订阅';
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

  if p_expires_at <= p_started_at then
    raise exception '到期时间必须晚于订阅时间';
  end if;

  select user_id into v_user_id
    from public.user_subscriptions
   where id = p_subscription_id;

  if v_user_id is null then
    raise exception '订阅记录不存在';
  end if;

  update public.user_subscriptions
     set plan_code = p_plan_code,
         plan_name = p_plan_name,
         billing_cycle = p_billing_cycle,
         points_cost = p_points_cost,
         duration_months = p_duration_months,
         started_at = p_started_at,
         expires_at = p_expires_at,
         status = p_status,
         updated_at = now()
   where id = p_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'id', p_subscription_id,
    'user_id', v_user_id,
    'plan_code', p_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'duration_months', p_duration_months,
    'points_cost', p_points_cost,
    'started_at', p_started_at,
    'expires_at', p_expires_at,
    'status', p_status
  );
end;
$$;

revoke all on function public.admin_update_subscription(uuid, text, text, text, integer, integer, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_update_subscription(uuid, text, text, text, integer, integer, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_update_subscription(uuid, text, text, text, integer, integer, timestamptz, timestamptz, text) to service_role;

-- ------------------------------------------------------------------
-- 2. 已有订阅名单补充完整字段（编辑表单预填）
-- ------------------------------------------------------------------
create or replace function public.admin_list_existing_subscribers(
  p_plan_code text default null,
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
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看已有订阅用户';
  end if;

  v_limit := least(greatest(p_limit, 1), 500);

  select count(*) into v_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now()
     and (p_plan_code is null or s.plan_code = p_plan_code);

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
      and (p_plan_code is null or s.plan_code = p_plan_code)
    order by pr.username
    limit v_limit
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_list_existing_subscribers(text, integer) from public;
grant execute on function public.admin_list_existing_subscribers(text, integer) to authenticated;
grant execute on function public.admin_list_existing_subscribers(text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
