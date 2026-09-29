-- ============================================
-- AI 积分计费 5/5：Coding 附加包积分自助购买 + 免费模型（0 倍率）
--   1) subscription_plan_prices 上架 coding-* 四档（token 锚定价，
--      打包价 ≈ 每日加成×30÷汇率×0.75，汇率 1 分 = 100 万 billed_tokens）
--   2) 新 RPC subscribe_coding_pack_with_points：附加包与主订阅共存，
--      不走 subscribe_with_points 的「顶掉现有订阅」语义
--   3) quota_multiplier 约束放宽到 >= 0：设 0 即免费模型
--      （billed_tokens 记 0，不扣额度不扣积分，usage 照常入账）
-- ============================================

-- ----------------------------------------------------------------------------
-- 1) 价格表
--    并为管理面板开放只读+管理员写：此前该表刻意无用户侧策略（2026091001），
--    面板编辑需要一条 admin 策略；服务端取价 RPC 走 security definer 不受影响。
-- ----------------------------------------------------------------------------
insert into public.subscription_plan_prices (plan_code, billing_cycle, points_cost, duration_months) values
  ('coding-lite',  'monthly',  10,   1),
  ('coding-plus',  'monthly',  34,   1),
  ('coding-pro',   'monthly',  68,   1),
  ('coding-ultra', 'monthly',  135,  1),
  ('coding-lite',  'yearly',   100,  12),
  ('coding-plus',  'yearly',   340,  12),
  ('coding-pro',   'yearly',   680,  12),
  ('coding-ultra', 'yearly',   1350, 12)
on conflict (plan_code, billing_cycle) do update set
  points_cost = excluded.points_cost,
  duration_months = excluded.duration_months,
  is_active = true,
  updated_at = now();

drop policy if exists subscription_plan_prices_admin_all on public.subscription_plan_prices;
create policy subscription_plan_prices_admin_all
  on public.subscription_plan_prices
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select on table public.subscription_plan_prices to authenticated;

-- ----------------------------------------------------------------------------
-- 2) 附加包购买 RPC（共存语义：不 supersede 任何现有订阅）
-- ----------------------------------------------------------------------------
create or replace function public.subscribe_coding_pack_with_points(
  p_plan_code text,
  p_billing_cycle text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_plan_code text;
  v_points integer := 0;
  v_next_points integer := 0;
  v_cost integer;
  v_months integer;
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_subscription_id uuid;
  v_action text := 'new';
  v_cur_expires timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  v_plan_code := lower(trim(coalesce(p_plan_code, '')));
  if v_plan_code not in ('coding-lite', 'coding-plus', 'coding-pro', 'coding-ultra') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_PLAN_CODE', 'plan_code', v_plan_code);
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_BILLING_CYCLE');
  end if;

  -- 服务端取价（与 subscribe_with_points 同一真源）
  select p.points_cost, p.duration_months
    into v_cost, v_months
    from public.subscription_plan_prices p
   where p.plan_code = v_plan_code
     and p.billing_cycle = p_billing_cycle
     and p.is_active;

  if v_cost is null or v_months is null then
    return jsonb_build_object('ok', false, 'message', 'PLAN_NOT_AVAILABLE', 'plan_code', v_plan_code);
  end if;

  -- 锁积分行（防并发重复扣费）
  select coalesce(points, 0)
    into v_points
    from public.profiles
   where id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  -- 同档有效附加包：顺延续费（不叠加并行时长）；异档共存，各自行内加成
  select max(s.expires_at) into v_cur_expires
    from public.user_subscriptions s
   where s.user_id = v_user_id
     and lower(trim(s.plan_code)) = v_plan_code
     and s.status = 'active'
     and s.expires_at > v_now;

  if v_cur_expires is not null then
    v_action := 'renew';
    v_started_at := v_cur_expires;
  else
    v_started_at := v_now;
  end if;
  v_expires_at := v_started_at + make_interval(months => v_months);

  if v_points < v_cost then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'current_points', v_points,
      'required_points', v_cost
    );
  end if;

  update public.profiles
     set points = coalesce(points, 0) - v_cost
   where id = v_user_id
  returning points into v_next_points;

  insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
  values (
    v_user_id, -v_cost, coalesce(v_next_points, 0), 'subscription',
    case v_action
      when 'renew' then '附加包续费：' || initcap(replace(v_plan_code, 'coding-', 'Coding '))
      else '附加包开通：' || initcap(replace(v_plan_code, 'coding-', 'Coding '))
    end
  );

  insert into public.user_subscriptions (
    user_id, plan_code, plan_name, billing_cycle,
    points_cost, duration_months, started_at, expires_at, status, metadata
  )
  values (
    v_user_id, v_plan_code,
    initcap(replace(v_plan_code, 'coding-', 'Coding ')),
    p_billing_cycle, v_cost, v_months,
    v_started_at, v_expires_at, 'active',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'action', v_action,
      'price_source', 'server',
      'kind', 'coding_pack',
      'previous_expires_at', case when v_cur_expires is not null then v_cur_expires else null end
    )
  )
  returning id into v_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'CODING_PACK_SUBSCRIBED',
    'subscription_id', v_subscription_id,
    'plan_code', v_plan_code,
    'billing_cycle', p_billing_cycle,
    'action', v_action,
    'points_deducted', v_cost,
    'current_points', coalesce(v_next_points, 0),
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.subscribe_coding_pack_with_points(text, text, jsonb) from public;
grant execute on function public.subscribe_coding_pack_with_points(text, text, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) 免费模型：倍率下限 0.1 → 0
-- ----------------------------------------------------------------------------
alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_quota_multiplier_check;
alter table public.bohai_model_configs
  add constraint bohai_model_configs_quota_multiplier_check
  check (quota_multiplier >= 0 and quota_multiplier <= 100);

create or replace function public.get_ai_mode_token_multiplier(p_mode text)
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(0, coalesce((
    select config.quota_multiplier
      from public.bohai_model_configs as config
     where lower(trim(config.mode_id)) = lower(trim(coalesce(p_mode, '')))
     order by config.updated_at desc
     limit 1
  ), case lower(trim(coalesce(p_mode, '')))
    when 'pro' then 2 when 'max' then 3 when 'ultra' then 4 else 1
  end));
$$;

revoke all on function public.get_ai_mode_token_multiplier(text) from public;
grant execute on function public.get_ai_mode_token_multiplier(text) to service_role;

comment on constraint bohai_model_configs_quota_multiplier_check on public.bohai_model_configs is
  '0 = free model: usage is logged with billed_tokens=0 and charges neither quota nor points.';

notify pgrst, 'reload schema';
