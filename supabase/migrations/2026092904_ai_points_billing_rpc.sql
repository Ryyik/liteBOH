-- ============================================
-- AI 积分计费 3/5：积分预留 / 结算 RPC（service_role 专用）
-- 与 token reservation 同范式：请求前预扣占位（计入风控上限），结算按实际多退少补。
-- 积分按「小数计量、满 1 扣整」记账（profiles.ai_points_fraction 存 0~1 的尾数），
-- 保证 1 分 = 100 万 token 档位下小额对话不会因逐笔向上取整而放大消耗（积分耐用）。
--
-- 调用顺序约定（vault 侧）：
--   成功 → settle_ai_points（先，不改 status）→ settle_ai_token_quota（后，置 settled）
--   失败 → release_ai_token_quota（points_reserved 随 status='released' 退出风控口径）
-- ============================================

alter table public.ai_token_reservations
  add column if not exists points_reserved numeric(12, 6) not null default 0,
  add column if not exists points_settled numeric(12, 6);

alter table public.ai_token_reservations
  add constraint ai_token_reservations_points_reserved_check
  check (points_reserved >= 0);

alter table public.ai_token_reservations
  add constraint ai_token_reservations_points_settled_check
  check (points_settled is null or points_settled >= 0);

alter table public.profiles
  add column if not exists ai_points_fraction numeric(12, 6) not null default 0
    check (ai_points_fraction >= 0 and ai_points_fraction < 1);

create index if not exists idx_points_transactions_user_reason_created
  on public.points_transactions (user_id, reason, created_at desc);

-- ---------- 预留 ----------
create or replace function public.reserve_ai_points(
  p_reservation_id uuid,
  p_user_id uuid,
  p_ip_address text,
  p_estimated_billed integer,
  p_multiplier numeric
)
returns table(allowed boolean, points_estimate numeric, points_balance integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_rate bigint;
  v_cap integer;
  v_points integer;
  v_deducted_today numeric;
  v_pending numeric;
  v_estimate numeric;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
begin
  select enabled, rate_tokens_per_point, daily_points_burn_cap
    into v_enabled, v_rate, v_cap
    from public.ai_pricing_config
   where id = 1;

  if not coalesce(v_enabled, false) then
    return query select false, 0::numeric, 0::integer, 'POINTS_BILLING_DISABLED';
    return;
  end if;

  if p_user_id is null then
    return query select false, 0::numeric, 0::integer, 'NOT_AUTHENTICATED';
    return;
  end if;

  v_estimate := round(
    greatest(0, coalesce(p_estimated_billed, 0))
      * greatest(0, coalesce(p_multiplier, 1))
      / greatest(1, coalesce(v_rate, 1000000))::numeric,
    6
  );
  if v_estimate <= 0 then
    return query select true, 0::numeric, 0::integer, 'OK';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextext('boh-ai-points:' || p_user_id::text));

  select coalesce(points, 0) into v_points
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    return query select false, v_estimate, 0::integer, 'PROFILE_NOT_FOUND';
    return;
  end if;

  -- 至少持 1 分才允许发起计费请求；尾数（<1 分）不阻塞新请求
  if v_points < 1 then
    return query select false, v_estimate, v_points, 'INSUFFICIENT_POINTS';
    return;
  end if;

  select coalesce(abs(sum(amount)), 0) into v_deducted_today
    from public.points_transactions
   where user_id = p_user_id
     and reason = 'ai_usage'
     and amount < 0
     and created_at >= v_today_start;

  select coalesce(sum(points_reserved), 0) into v_pending
    from public.ai_token_reservations
   where user_id = p_user_id
     and status = 'pending'
     and points_reserved > 0
     and created_at >= v_today_start;

  if coalesce(v_cap, -1) <> -1
     and v_deducted_today + v_pending + v_estimate > v_cap then
    return query select false, v_estimate, v_points, 'DAILY_BURN_CAP';
    return;
  end if;

  insert into public.ai_token_reservations (id, user_id, ip_address, reserved_tokens, points_reserved)
  values (p_reservation_id, p_user_id, p_ip_address, 0, v_estimate)
  on conflict (id) do nothing;

  return query select true, v_estimate, v_points, 'OK';
end;
$$;

-- ---------- 结算（先于 settle_ai_token_quota 调用） ----------
create or replace function public.settle_ai_points(
  p_reservation_id uuid,
  p_total_tokens integer,
  p_multiplier numeric,
  p_model text,
  p_mode text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.ai_token_reservations%rowtype;
  v_rate bigint;
  v_billed integer;
  v_cost numeric;
  v_points integer;
  v_fraction numeric;
  v_deduct integer;
  v_next integer;
begin
  select * into v_res
    from public.ai_token_reservations
   where id = p_reservation_id
   for update;
  if not found
     or v_res.status <> 'pending'
     or coalesce(v_res.points_reserved, 0) <= 0 then
    return 0;
  end if;

  select rate_tokens_per_point into v_rate
    from public.ai_pricing_config
   where id = 1;

  v_billed := least(
    2147483647::bigint,
    ceil(greatest(0, coalesce(p_total_tokens, 0)) * greatest(0, coalesce(p_multiplier, 1)))
  )::integer;
  v_cost := round(v_billed / greatest(1, coalesce(v_rate, 1000000))::numeric, 6);

  select coalesce(points, 0), coalesce(ai_points_fraction, 0)
    into v_points, v_fraction
    from public.profiles
   where id = v_res.user_id
   for update;
  if not found then
    return 0;
  end if;

  v_deduct := floor(coalesce(v_fraction, 0) + v_cost)::integer;
  if v_deduct > v_points then
    v_deduct := v_points;
  end if;
  v_next := v_points - v_deduct;

  update public.profiles
     set points = v_next,
         ai_points_fraction = coalesce(v_fraction, 0) + v_cost - v_deduct
   where id = v_res.user_id;

  if v_deduct > 0 then
    insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
    values (
      v_res.user_id, -v_deduct, v_next, 'ai_usage',
      'BOHAI 服务计费：' || left(coalesce(p_mode, ''), 40) || ' / ' || left(coalesce(p_model, ''), 60)
    );
  end if;

  -- 不改 status（settle_ai_token_quota 依赖 pending）；只把预扣值收敛为实结值
  update public.ai_token_reservations
     set points_reserved = v_cost,
         points_settled = v_cost
   where id = p_reservation_id;

  return v_cost;
end;
$$;

revoke all on function public.reserve_ai_points(uuid, uuid, text, integer, numeric) from public;
revoke all on function public.settle_ai_points(uuid, integer, numeric, text, text) from public;
grant execute on function public.reserve_ai_points(uuid, uuid, text, integer, numeric) to service_role;
grant execute on function public.settle_ai_points(uuid, integer, numeric, text, text) to service_role;

comment on column public.profiles.ai_points_fraction is
  'AI points metering residue in [0,1). Fractional usage accrues here until it sums to a whole point.';
comment on column public.ai_token_reservations.points_reserved is
  'Estimated points pre-charged for cap accounting while this reservation is pending.';
comment on column public.ai_token_reservations.points_settled is
  'Actual points cost settled for this request (fractional, before whole-point rounding).';

notify pgrst, 'reload schema';
