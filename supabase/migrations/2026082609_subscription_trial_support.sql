-- 订阅试用机制支持
-- 目标：
--   1) 扩展 user_subscriptions.status 约束，新增 'trial' 状态
--   2) 新 RPC start_subscription_trial：用户主动领取 Pro 3 天试用（每账号一次、已有订阅则拦截）
--   3) 等级计算（get_user_subscription_tier / batch）与升级折算（subscribe_with_points）纳入 trial：
--      试用视同有效当前档，转正/升级时把 trial 记录作废，避免悬挂

-- 1) 扩展 status 约束（动态定位未命名 inline check 后重建）
do $$
declare
  rec record;
begin
  for rec in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where t.relname = 'user_subscriptions'
      and c.contype = 'c'
      and a.attname = 'status'
  loop
    execute format('alter table public.user_subscriptions drop constraint %I', rec.conname);
  end loop;
end $$;

alter table public.user_subscriptions
  add constraint user_subscriptions_status_check
  check (status in ('active', 'expired', 'cancelled', 'trial'));

-- 2) 新 RPC：领取订阅试用（默认 Pro / 3 天，每账号一次）
create or replace function public.start_subscription_trial(
  p_plan_code text,
  p_duration_days integer default 3,
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
  v_tier int;
  v_already_member boolean;
  v_already_trial boolean;
  v_days integer;
  v_expires_at timestamp with time zone;
  v_subscription_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  v_tier := case lower(trim(p_plan_code))
    when 'free'  then 0
    when 'plus'  then 1
    when 'pro'   then 2
    when 'max'   then 3
    when 'ultra' then 4
    else -1
  end;
  if v_tier <= 0 then
    return jsonb_build_object('ok', false, 'message', 'TRIAL_PLAN_INVALID');
  end if;

  if coalesce(p_duration_days, 0) <= 0 or p_duration_days > 90 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_DURATION_DAYS');
  end if;
  v_days := p_duration_days;

  -- 已有有效订阅（含试用中）-> 不可再领
  select exists (
    select 1 from public.user_subscriptions
    where user_id = auth.uid()
      and status in ('active', 'trial')
      and expires_at > v_now
  ) into v_already_member;
  if v_already_member then
    return jsonb_build_object('ok', false, 'message', 'ALREADY_HAS_SUBSCRIPTION');
  end if;

  -- 每账号仅限一次（含已过期试用的历史记录）
  select exists (
    select 1 from public.user_subscriptions
    where user_id = auth.uid()
      and metadata ->> 'source' = 'trial'
  ) into v_already_trial;
  if v_already_trial then
    return jsonb_build_object('ok', false, 'message', 'TRIAL_ALREADY_USED');
  end if;

  v_expires_at := v_now + make_interval(days => v_days);

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
    lower(trim(p_plan_code)),
    initcap(lower(trim(p_plan_code))),
    -- billing_cycle 仍表示计费周期（monthly/yearly），试用状态由 status='trial' 表达。
    -- 若写 'trial' 会违反 user_subscriptions.billing_cycle 的 CHECK 约束。
    'monthly',
    0,
    greatest(1, ceil(v_days::numeric / 30.0))::integer,
    v_now,
    v_expires_at,
    'trial',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'trial',
      'trial_days', v_days,
      'granted_by', 'self'
    )
  )
  returning id into v_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'TRIAL_STARTED',
    'subscription_id', v_subscription_id,
    'plan_code', lower(trim(p_plan_code)),
    'plan_name', initcap(lower(trim(p_plan_code))),
    'expires_at', v_expires_at,
    'trial_days', v_days
  );
end;
$$;

revoke all on function public.start_subscription_trial(text, integer, jsonb) from public;
grant execute on function public.start_subscription_trial(text, integer, jsonb) to authenticated;

-- 3a) 等级计算：纳入 trial（status in ('active','trial') 且未过期）
create or replace function public.get_user_subscription_tier(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text := '';
  v_idx int;
  v_code text;
  v_best_idx int := -1;
begin
  if p_user_id is null then
    return '';
  end if;

  for v_code in
    select distinct lower(trim(s.plan_code))
    from public.user_subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trial')
      and s.expires_at > now()
  loop
    v_idx := case
      when v_code = 'free'  then 0
      when v_code = 'plus'  then 1
      when v_code = 'pro'   then 2
      when v_code = 'max'   then 3
      when v_code = 'ultra' then 4
      else -1
    end;
    if v_idx > v_best_idx then
      v_best_idx := v_idx;
      v_tier := v_code;
    end if;
  end loop;

  return v_tier;
end;
$$;

grant execute on function public.get_user_subscription_tier(uuid) to authenticated;
grant execute on function public.get_user_subscription_tier(uuid) to anon;

-- 3b) 批量等级计算：纳入 trial
create or replace function public.get_user_subscription_tiers(p_user_ids uuid[])
returns table(user_id uuid, tier text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with ranked as (
    select
      s.user_id,
      lower(trim(s.plan_code)) as code,
      case
        when lower(trim(s.plan_code)) = 'free'  then 0
        when lower(trim(s.plan_code)) = 'plus'  then 1
        when lower(trim(s.plan_code)) = 'pro'   then 2
        when lower(trim(s.plan_code)) = 'max'   then 3
        when lower(trim(s.plan_code)) = 'ultra' then 4
        else -1
      end as idx
    from public.user_subscriptions s
    where s.user_id = any(p_user_ids)
      and s.status in ('active', 'trial')
      and s.expires_at > now()
  ),
  best as (
    select user_id, code
    from (
      select
        user_id,
        code,
        row_number() over (partition by user_id order by idx desc) as rn
      from ranked
      where idx >= 0
    ) t
    where rn = 1
  )
  select
    t.user_id,
    coalesce(b.code, '') as tier
  from unnest(p_user_ids) as t(user_id)
  left join best b on b.user_id = t.user_id;
end;
$$;

grant execute on function public.get_user_subscription_tiers(uuid[]) to authenticated;
grant execute on function public.get_user_subscription_tiers(uuid[]) to anon;

-- 3c) 升级折算：当前有效档纳入 trial；转正时把 trial 一并作废
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
