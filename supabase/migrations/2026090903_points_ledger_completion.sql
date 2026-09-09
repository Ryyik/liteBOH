-- ============================================================================
-- 2026090903: 积分账本补全（BETA 6 P0-2a · 用户可查账单的数据层地基）
--
--   1) subscribe_with_points 补写 points_transactions（reason='subscription'）
--      —— 此前订阅扣分不写流水，用户"积分莫名其妙少了"无账可查。
--      以 2026082609 的定义为基线逐字保留，仅在扣减后插入流水。
--
--   2) admin_grant_points 恢复 2026081104 的 batch 批次语义，并升级为
--      CTE 原子快照（同 2026081502 对 admin_revoke_grant 的 H3 修复模式）。
--      背景：2026081201 用无 batch 的旧版覆盖了批量版（文件名序在后），
--      导致其后新发放的流水 batch_id 为空、无法批次撤销，且
--      UPDATE 与 INSERT 分离在并发下会产生 balance_after 快照漂移。
--
--   3) 新增 get_points_ledger_drift() 管理员对账 RPC：
--      余额 vs 流水 SUM（仅统计有流水的用户；流水账起账日之前的
--      历史余额无流水属预期，不在此列）。
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) subscribe_with_points：补写订阅扣减流水
-- ----------------------------------------------------------------------------
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

  -- 当前决定用户等级的最高档有效订阅（含 trial）
  v_cur_id uuid;
  v_cur_plan_code text;
  v_cur_status text;
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

  -- 取当前最高档有效订阅（含 trial，档位降序 -> 到期最晚）
  select s.id, s.plan_code, s.status, s.points_cost, s.duration_months, s.expires_at
    into v_cur_id, v_cur_plan_code, v_cur_status, v_cur_points_cost, v_cur_duration_months, v_cur_expires_at
    from public.user_subscriptions s
   where s.user_id = v_user_id
     and s.status in ('active', 'trial')
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

  -- 降档守卫：已有更高档有效订阅（含 trial）时不允许购买低档
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
    if v_cur_status = 'trial' then
      -- 试用转正：立即生效，避免把试用记录置 expired 后出现权益空窗
      v_action := 'convert';
      v_started_at := v_now;
    else
      -- 同档续订：顺延到当前订阅到期后
      v_action := 'renew';
      v_started_at := v_cur_expires_at;
    end if;
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

  -- 应付：升级为折算后差额，其余为全价（试用 cost=0 故转正不抵扣）
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

  -- 积分流水：订阅扣减入账（BETA 6 账本补全）。
  -- charge=0（试用转正零扣减）不写流水，避免零额噪音；余额快照取本次扣减后的真实值。
  if v_charge > 0 then
    insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
    values (
      v_user_id,
      -v_charge,
      coalesce(v_next_points, 0),
      'subscription',
      case v_action
        when 'upgrade' then '订阅升级：' || p_plan_name || '（旧订阅抵扣 ' || v_credit || ' 积分）'
        when 'renew'   then '订阅续费：' || p_plan_name
        when 'convert' then '试用转正：' || p_plan_name
        else '订阅开通：' || p_plan_name
      end
    );
  end if;

  if v_action = 'upgrade' then
    -- 升级：作废当前最高档有效订阅（含 trial），metadata 留痕
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'superseded_by', p_plan_code,
             'superseded_at', now(),
             'credit_applied', v_credit,
             'remaining_days', v_remaining_days,
             'trial_converted_to', case when status = 'trial' then p_plan_code else null end
           )
     where user_id = v_user_id
       and status in ('active', 'trial')
       and expires_at > v_now;
  else
    -- 新建/续订/转正：清理已过期 active 记录，并作废仍在有效期内的 trial（试用转正为新付费订阅）
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'superseded_by', p_plan_code,
             'superseded_at', now(),
             'trial_converted_to', case when status = 'trial' then p_plan_code else null end
           )
     where user_id = v_user_id
       and (
         (status = 'active' and expires_at <= v_now)
         or status = 'trial'
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
      'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end,
      'converted_from_trial', case when v_cur_status = 'trial' then true else null end
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

-- ----------------------------------------------------------------------------
-- 2) admin_grant_points：恢复 batch 批次 + CTE 原子快照
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_points(
  p_user_ids uuid[] default null,
  p_amount integer default 0,
  p_remark text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_targets uuid[];
  v_affected integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可发放积分';
  end if;

  if coalesce(p_amount, 0) = 0 then
    raise exception '积分数量不能为 0';
  end if;

  -- 空数组/NULL -> 全部非管理员用户
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles
     where role <> 'admin';
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可发放积分的用户';
  end if;

  -- 单语句原子快照（同 2026081502 对 admin_revoke_grant 的 H3 修复模式）：
  -- UPDATE 锁行并取回发放后的新余额，流水 balance_after 与该次 UPDATE 严格一致，
  -- 并发发放/消费下不再出现快照漂移；同时恢复 2026081104 的 batch_id 批次语义
  -- （2026081201 曾以无 batch 版本覆盖本函数，致新发放无批次、无法撤销）。
  with updated as (
    update public.profiles p
       set points = greatest(0, p.points + p_amount)
     where p.id = any(v_targets)
    returning p.id as user_id, p.points as new_points
  )
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id, batch_id)
  select u.user_id, p_amount, u.new_points, 'admin_grant', coalesce(p_remark, ''), v_operator, v_batch_id
    from updated u;

  get diagnostics v_affected = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'amount', p_amount,
    'remark', coalesce(p_remark, ''),
    'batch_id', v_batch_id
  );
  return v_result;
end;
$$;

revoke all on function public.admin_grant_points(uuid[], integer, text) from public;
grant execute on function public.admin_grant_points(uuid[], integer, text) to authenticated;
grant execute on function public.admin_grant_points(uuid[], integer, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) get_points_ledger_drift：管理员对账（余额 vs 流水 SUM）
--    仅统计有流水记录的用户；起账日之前的历史余额无流水属预期，
--    不在本对账范围（否则全员误报）。
-- ----------------------------------------------------------------------------
create or replace function public.get_points_ledger_drift()
returns table (
  user_id uuid,
  username text,
  balance integer,
  ledger_sum bigint,
  drift bigint,
  tx_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    coalesce(p.points, 0) as balance,
    coalesce(sum(t.amount), 0)::bigint as ledger_sum,
    (coalesce(p.points, 0) - coalesce(sum(t.amount), 0))::bigint as drift,
    count(t.id)::bigint as tx_count
  from public.profiles p
  join public.points_transactions t on t.user_id = p.id
  where (auth.uid() is null or public.current_user_is_admin())
  group by p.id, p.username, p.points
  having coalesce(p.points, 0) <> coalesce(sum(t.amount), 0)
  order by abs(coalesce(p.points, 0) - coalesce(sum(t.amount), 0)) desc;
$$;

revoke all on function public.get_points_ledger_drift() from public;
grant execute on function public.get_points_ledger_drift() to authenticated;
grant execute on function public.get_points_ledger_drift() to service_role;

commit;
