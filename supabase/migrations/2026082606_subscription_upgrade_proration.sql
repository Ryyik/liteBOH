-- 订阅三态改造：同档续订顺延 / 更高档升级（立即生效 + 按剩余天数折算抵扣）/ 禁止降档
-- 行为定义：
--   1) 无有效订阅            -> action = 'new'      新建订阅，立即生效
--   2) 目标档 = 当前最高档    -> action = 'renew'    顺延叠加：新周期从当前订阅到期日开始，扣全价
--   3) 目标档 > 当前最高档    -> action = 'upgrade'  立即生效 + 按旧订阅剩余天数折算积分抵扣差额，旧订阅作废
--   4) 目标档 < 当前最高档    -> 返回 LOWER_TIER_NOT_SUPPORTED（前端已拦截，此为 RPC 层守卫）

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
  v_subscription_id uuid;

  -- 当前决定用户等级的最高档 active 订阅
  v_cur_id uuid;
  v_cur_plan_code text;
  v_cur_points_cost integer := 0;
  v_cur_duration_months integer := 1;
  v_cur_expires_at timestamp with time zone;

  -- 档位比较与折算
  v_target_rank integer;
  v_cur_rank integer;
  v_remaining_days integer := 0;
  v_credit integer := 0;
  v_due integer := 0;
  v_charge integer := 0;
  v_action text := 'new';
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if coalesce(trim(p_plan_code), '') = ''
     or coalesce(trim(p_plan_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_BILLING_CYCLE');
  end if;

  if coalesce(p_points_cost, -1) < 0 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_POINTS_COST');
  end if;

  if coalesce(p_duration_months, 0) <= 0
     or p_duration_months > 120 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_DURATION_MONTHS');
  end if;

  -- 锁定并读取用户积分（防止并发重复扣费）
  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  -- 取当前最高档 active 订阅（档位降序 -> 到期最晚，与 get_user_subscription_tier 同规则）
  select s.id, s.plan_code, s.points_cost, s.duration_months, s.expires_at
    into v_cur_id, v_cur_plan_code, v_cur_points_cost, v_cur_duration_months, v_cur_expires_at
    from public.user_subscriptions s
   where s.user_id = v_user_id
     and s.status = 'active'
     and s.expires_at > v_now
   order by
     case lower(trim(s.plan_code))
       when 'free' then 0
       when 'plus' then 1
       when 'pro'  then 2
       when 'max'  then 3
       when 'ultra' then 4
       else -1
     end desc,
     s.expires_at desc
   limit 1
   for update;

  v_target_rank := case lower(trim(p_plan_code))
    when 'free' then 0
    when 'plus' then 1
    when 'pro'  then 2
    when 'max'  then 3
    when 'ultra' then 4
    else -1
  end;

  v_cur_rank := case lower(trim(v_cur_plan_code))
    when 'free' then 0
    when 'plus' then 1
    when 'pro'  then 2
    when 'max'  then 3
    when 'ultra' then 4
    else -1
  end;

  -- 降档守卫：已有更高档 active 时不允许购买低档
  if v_cur_id is not null and v_target_rank < v_cur_rank then
    return jsonb_build_object(
      'ok', false,
      'message', 'LOWER_TIER_NOT_SUPPORTED',
      'current_plan_code', coalesce(v_cur_plan_code, ''),
      'action', 'blocked'
    );
  end if;

  -- 行为判定
  if v_cur_id is null then
    -- 新订阅：立即生效
    v_action := 'new';
    v_started_at := v_now;
  elsif v_target_rank = v_cur_rank then
    -- 同档续订：顺延到当前订阅到期后
    v_action := 'renew';
    v_started_at := v_cur_expires_at;
  else
    -- 升级：立即生效 + 折算
    v_action := 'upgrade';
    v_started_at := v_now;
    v_remaining_days := greatest(
      0,
      ceil(extract(epoch from (v_cur_expires_at - v_now)) / 86400.0)
    )::integer;
    -- 日单价 = 旧订阅实际成交价 / (时长月数 * 30)，按剩余天数折算可抵扣积分
    v_credit := round(
      (v_cur_points_cost::numeric / greatest(v_cur_duration_months, 1) / 30.0)
      * v_remaining_days
    )::integer;
    v_due := greatest(0, p_points_cost - v_credit);
  end if;

  v_expires_at := v_started_at + make_interval(months => p_duration_months);

  -- 应付：升级为折算后差额，其余为全价
  v_charge := case when v_action = 'upgrade' then v_due else p_points_cost end;

  if v_current_points < v_charge then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'current_points', v_current_points,
      'required_points', v_charge,
      'action', v_action,
      'credit_applied', v_credit,
      'remaining_days', v_remaining_days
    );
  end if;

  update public.profiles
     set points = coalesce(points, 0) - v_charge
   where id = v_user_id
   returning points into v_next_points;

  if v_action = 'upgrade' then
    -- 升级：作废当前最高档订阅，同时清理历史并行 active 订阅（旧 bug 产物），metadata 留痕
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'superseded_by', p_plan_code,
             'superseded_at', now(),
             'credit_applied', v_credit,
             'remaining_days', v_remaining_days
           )
     where user_id = v_user_id
       and status = 'active'
       and expires_at > v_now;
  else
    -- 新建/续订：清理已过期的残留 active 记录
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now()
     where user_id = v_user_id
       and status = 'active'
       and expires_at <= v_now;
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
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'action', v_action,
      'credit_applied', case when v_action = 'upgrade' then v_credit else 0 end,
      'remaining_days', case when v_action = 'upgrade' then v_remaining_days else 0 end,
      'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end
    )
  )
  returning id into v_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'SUBSCRIBE_SUCCESS',
    'subscription_id', v_subscription_id,
    'plan_code', p_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'action', v_action,
    'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end,
    'credit_applied', case when v_action = 'upgrade' then v_credit else 0 end,
    'remaining_days', case when v_action = 'upgrade' then v_remaining_days else 0 end,
    'points_deducted', v_charge,
    'required_points', p_points_cost,
    'current_points', coalesce(v_next_points, 0),
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) from public;

grant execute on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.subscribe_with_points(text, text, text, integer, integer, jsonb) to service_role;
