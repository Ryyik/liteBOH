-- 2026100501: 修复 AI 积分 reservation 与 fraction 结算越界
--
-- ai_points_fraction 表示「已消费但尚未扣整分」的尾数，因此可用额度是
-- points - ai_points_fraction，而不是 points + ai_points_fraction。
-- 旧实现只检查 points >= 1，多个 pending reservation 可以共同超过余额，
-- 结算时再把 fraction 推到 1 以上，触发 profiles.ai_points_fraction 的 CHECK。

CREATE OR REPLACE FUNCTION public.reserve_ai_points(
  p_reservation_id uuid,
  p_user_id uuid,
  p_ip_address text,
  p_estimated_billed integer,
  p_multiplier numeric
)
RETURNS TABLE(allowed boolean, points_estimate numeric, points_balance integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_rate bigint;
  v_cap integer;
  v_points integer;
  v_fraction numeric;
  v_deducted_today numeric;
  v_pending numeric;
  v_estimate numeric;
  v_available numeric;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
BEGIN
  SELECT enabled, rate_tokens_per_point, daily_points_burn_cap
    INTO v_enabled, v_rate, v_cap
    FROM public.ai_pricing_config
   WHERE id = 1;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT false, 0::numeric, 0::integer, 'POINTS_BILLING_DISABLED';
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, 0::integer, 'NOT_AUTHENTICATED';
    RETURN;
  END IF;

  v_estimate := round(
    greatest(0, coalesce(p_estimated_billed, 0))
      * greatest(0, coalesce(p_multiplier, 1))
      / greatest(1, coalesce(v_rate, 1000000))::numeric,
    6
  );
  IF v_estimate <= 0 THEN
    RETURN QUERY SELECT true, 0::numeric, 0::integer, 'OK';
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('boh-ai-points:' || p_user_id::text));

  SELECT coalesce(points, 0), coalesce(ai_points_fraction, 0)
    INTO v_points, v_fraction
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT found THEN
    RETURN QUERY SELECT false, v_estimate, 0::integer, 'PROFILE_NOT_FOUND';
    RETURN;
  END IF;

  v_available := greatest(0::numeric, v_points::numeric - v_fraction);

  SELECT coalesce(abs(sum(pt.amount)), 0) INTO v_deducted_today
    FROM public.points_transactions pt
   WHERE pt.user_id = p_user_id
     AND pt.reason = 'ai_usage'
     AND pt.amount < 0
     AND pt.created_at >= v_today_start;

  SELECT coalesce(sum(points_reserved), 0) INTO v_pending
    FROM public.ai_token_reservations
   WHERE user_id = p_user_id
     AND status = 'pending'
     AND points_reserved > 0
     AND created_at >= v_today_start;

  IF coalesce(v_cap, -1) <> -1
     AND v_deducted_today + v_pending + v_estimate > v_cap THEN
    RETURN QUERY SELECT false, v_estimate, v_points, 'DAILY_BURN_CAP';
    RETURN;
  END IF;

  -- pending reservation 也占用可用余额，避免并发请求把 fraction 结算到 1 以上。
  IF v_pending + v_estimate > v_available THEN
    RETURN QUERY SELECT false, v_estimate, v_points, 'INSUFFICIENT_POINTS';
    RETURN;
  END IF;

  INSERT INTO public.ai_token_reservations (id, user_id, ip_address, reserved_tokens, points_reserved)
  VALUES (p_reservation_id, p_user_id, p_ip_address, 0, v_estimate)
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY SELECT true, v_estimate, v_points, 'OK';
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_ai_points(
  p_reservation_id uuid,
  p_total_tokens integer,
  p_multiplier numeric,
  p_model text,
  p_mode text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res public.ai_token_reservations%rowtype;
  v_rate bigint;
  v_billed integer;
  v_cost numeric;
  v_points integer;
  v_fraction numeric;
  v_deduct integer;
  v_next integer;
BEGIN
  SELECT * INTO v_res
    FROM public.ai_token_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;
  IF NOT found
     OR v_res.status <> 'pending'
     OR coalesce(v_res.points_reserved, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT rate_tokens_per_point INTO v_rate
    FROM public.ai_pricing_config
   WHERE id = 1;

  v_billed := least(
    2147483647::bigint,
    ceil(greatest(0, coalesce(p_total_tokens, 0)) * greatest(0, coalesce(p_multiplier, 1)))
  )::integer;
  v_cost := round(v_billed / greatest(1, coalesce(v_rate, 1000000))::numeric, 6);

  SELECT coalesce(points, 0), coalesce(ai_points_fraction, 0)
    INTO v_points, v_fraction
    FROM public.profiles
   WHERE id = v_res.user_id
   FOR UPDATE;
  IF NOT found THEN
    RETURN 0;
  END IF;

  -- 实际用量可能高于预估；最多结算当前可用余额，保持 fraction CHECK 不被击穿。
  v_cost := least(v_cost, greatest(0::numeric, v_points::numeric - v_fraction));
  v_deduct := least(v_points, floor(v_fraction + v_cost)::integer);
  v_next := v_points - v_deduct;

  UPDATE public.profiles
     SET points = v_next,
         ai_points_fraction = coalesce(v_fraction, 0) + v_cost - v_deduct
   WHERE id = v_res.user_id;

  IF v_deduct > 0 THEN
    INSERT INTO public.points_transactions (user_id, amount, balance_after, reason, remark)
    VALUES (
      v_res.user_id, -v_deduct, v_next, 'ai_usage',
      'BOHAI 服务计费：' || left(coalesce(p_mode, ''), 40) || ' / ' || left(coalesce(p_model, ''), 60)
    );
  END IF;

  UPDATE public.ai_token_reservations
     SET points_reserved = v_cost,
         points_settled = v_cost
   WHERE id = p_reservation_id;

  RETURN v_cost;
END;
$function$;

NOTIFY pgrst, 'reload schema';
