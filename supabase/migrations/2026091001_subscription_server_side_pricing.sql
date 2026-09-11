-- ============================================================================
-- 2026091001: 订阅价格服务端权威化（P0 止血）
--
--   背景（2026-09-10 复核实锤）：
--     subscribe_with_points 的价格与时长完全信任调用方传参，RPC 仅拒绝
--     负数与超长时长（2026090903:76-83）。任何已登录用户可绕过前端直连
--     RPC，以 p_points_cost=0 / p_duration_months=120 开通 10 年 Ultra。
--     start_subscription_trial 的档位与天数同为调用方传参，可领 90 天
--     Ultra 而非 3 天 Pro。
--
--   处理：
--     1) 新建服务端价格表 subscription_plan_prices，种子值与订阅页完全
--        一致（Plus 8 / Pro 20 / Max 40 / Ultra 70；年付 = 月价 × 10、
--        时长 12 个月）。未上架的 plan_code（含 coding-*）无价格记录，
--        一律拒绝。
--     2) subscribe_with_points 按 (plan_code, billing_cycle) 查表取价与
--        时长，忽略调用方传入的 p_points_cost / p_duration_months；
--        三态续费 / 升级折算 / 积分流水逻辑逐字保留 2026090903 基线，
--        仅替换取价来源并统一 plan_code 归一化。
--     3) start_subscription_trial 锁定 Pro / 3 天，忽略调用方传参；
--        「已有订阅拦截」与「每账号一次」守卫保留。
--     4) boh_cloud_image_limit_for_user 纳入 status='trial'，与
--        get_user_subscription_tier 及 Edge Function resolveUserPlans
--        对齐，兑现「试用期间享受 Pro 完整权益」的页面承诺。
--
--   兼容性：两个 RPC 的函数签名不变，前端无需改动；前端当前传参
--   （pointsCost=页面价、durationMonths=1/12、trial=pro/3天）与服务端
--   取值完全一致，合法用户行为零变化。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 服务端价格表
-- ----------------------------------------------------------------------------
create table if not exists public.subscription_plan_prices (
  plan_code text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  points_cost integer not null check (points_cost >= 0),
  duration_months integer not null check (duration_months > 0),
  is_active boolean not null default true,
  updated_at timestamp with time zone not null default now(),
  primary key (plan_code, billing_cycle)
);

alter table public.subscription_plan_prices enable row level security;

-- 不建用户侧策略：仅 service_role 与 security definer 函数访问
grant all on table public.subscription_plan_prices to service_role;

insert into public.subscription_plan_prices (plan_code, billing_cycle, points_cost, duration_months) values
  ('plus',  'monthly',   8,  1),
  ('pro',   'monthly',  20,  1),
  ('max',   'monthly',  40,  1),
  ('ultra', 'monthly',  70,  1),
  ('plus',  'yearly',   80, 12),
  ('pro',   'yearly',  200, 12),
  ('max',   'yearly',  400, 12),
  ('ultra', 'yearly',  700, 12)
on conflict (plan_code, billing_cycle) do update set
  points_cost = excluded.points_cost,
  duration_months = excluded.duration_months,
  is_active = true,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 2) subscribe_with_points：服务端取价（基线 = 2026090903 逐字保留，仅改校验）
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

  -- 服务端取价结果（忽略调用方的 p_points_cost / p_duration_months）
  v_plan_code text;
  v_price_cost integer;
  v_price_months integer;

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

  -- 归一化档位码（与 2026082301 别名口径一致）
  v_plan_code := lower(trim(p_plan_code));

  -- 服务端取价：价格与时长只认价格表，调用方传参一律忽略。
  -- 无价格记录的档位（free / coding-* / 未知码）视为未上架，直接拒绝。
  select p.points_cost, p.duration_months
    into v_price_cost, v_price_months
    from public.subscription_plan_prices p
   where p.plan_code = v_plan_code
     and p.billing_cycle = p_billing_cycle
     and p.is_active;

  if v_price_cost is null or v_price_months is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'PLAN_NOT_AVAILABLE',
      'plan_code', v_plan_code,
      'billing_cycle', p_billing_cycle
    );
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

  v_target_rank := case v_plan_code
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
    v_due := greatest(0, v_price_cost - v_credit);
  end if;

  v_expires_at := v_started_at + make_interval(months => v_price_months);

  -- 应付：升级为折算后差额，其余为全价（试用 cost=0 故转正不抵扣）
  v_charge := case when v_action = 'upgrade' then v_due else v_price_cost end;

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
             'superseded_by', v_plan_code,
             'superseded_at', now(),
             'credit_applied', v_credit,
             'remaining_days', v_remaining_days,
             'trial_converted_to', case when status = 'trial' then v_plan_code else null end
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
             'superseded_by', v_plan_code,
             'superseded_at', now(),
             'trial_converted_to', case when status = 'trial' then v_plan_code else null end
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
    v_plan_code,
    p_plan_name,
    p_billing_cycle,
    v_price_cost,
    v_price_months,
    v_started_at,
    v_expires_at,
    'active',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'action', v_action,
      'price_source', 'server',
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
    'plan_code', v_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'action', v_action,
    'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end,
    'credit_applied', case when v_action = 'upgrade' then v_credit else 0 end,
    'remaining_days', case when v_action = 'upgrade' then v_remaining_days else 0 end,
    'points_deducted', v_charge,
    'required_points', v_price_cost,
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
-- 3) start_subscription_trial：锁定 Pro / 3 天（基线 = 2026082609，仅改参数）
-- ----------------------------------------------------------------------------
create or replace function public.start_subscription_trial(
  p_plan_code text default 'pro',
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
  v_already_member boolean;
  v_already_trial boolean;
  -- 试用参数服务端锁定（忽略调用方传参）
  v_plan_code text := 'pro';
  v_days integer := 3;
  v_expires_at timestamp with time zone;
  v_subscription_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  -- 试用参数服务端锁定：只发 Pro 3 天，忽略调用方传入的档位与天数。
  v_expires_at := v_now + make_interval(days => v_days);

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
    v_plan_code,
    initcap(v_plan_code),
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
    'plan_code', v_plan_code,
    'plan_name', initcap(v_plan_code),
    'expires_at', v_expires_at,
    'trial_days', v_days
  );
end;
$$;

revoke all on function public.start_subscription_trial(text, integer, jsonb) from public;
grant execute on function public.start_subscription_trial(text, integer, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) boh_cloud_image_limit_for_user：纳入 trial（基线 = 2026081903）
--    该函数是云盘上传闸门的判定依据（2026042802 触发器调用），
--    此前只认 active，试用期 Cloud+ 仍是 Free 的 150 张，
--    与订阅页「试用期间享受 Pro 完整权益」承诺不符。
-- ----------------------------------------------------------------------------
create or replace function public.boh_cloud_image_limit_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_limit integer := 0;
begin
  select coalesce(max(
    case lower(trim(plan_code))
      when 'plus' then 300
      when 'boh-ai-plus' then 300
      when 'boh-plus' then 300
      when 'pro' then 450
      when 'boh-pro' then 450
      when 'max' then 900
      when 'boh-max' then 900
      when 'ultra' then 1200
      when 'boh-ultra' then 1200
      else 0
    end
  ), 0)
    into v_plan_limit
    from public.user_subscriptions
   where user_id = p_user_id
     and status in ('active', 'trial')
     and expires_at > now();

  return greatest(150, v_plan_limit);
end;
$$;

revoke all on function public.boh_cloud_image_limit_for_user(uuid) from public;
grant execute on function public.boh_cloud_image_limit_for_user(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
