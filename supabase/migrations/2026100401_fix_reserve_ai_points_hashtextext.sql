-- 2026100401: 修复 reserve_ai_points 的运行期 42883（积分预扣从未成功）
--
-- 发现方式：supabase db lint --linked --level warning
--   public.reserve_ai_points [error] function hashtextext(text) does not exist (42883)
--
-- 根因：函数体第 43 行写的是
--   perform pg_advisory_xact_lock(hashtextext('boh-ai-points:' || p_user_id::text));
--   PostgreSQL 没有 hashtextext(text)，只有 hashtext(text) / hashtextextended(text, int8)。
--
-- 线上实测（只读直查）：
--   select hashtext('a')      -> 1075015857   ✅
--   select hashtextext('a')   -> ERROR 42883  ❌
--   事务内验证修复后的表达式：begin; select pg_advisory_xact_lock(hashtext('boh-ai-points:'||...::text)); rollback; -> 无错
--
-- 影响：该函数**每次调用都在第 43 行抛 42883**。
--   调用方 supabase/functions/api-key-vault/index.ts:2119-2126 是 `if (error) throw error;`
--   ⇒ 积分预扣链路从未成功，与 docs/2026-10-02-BOHAI模型倍率与积分制度审查.md 的
--     「积分只发不收」结论一致。
--
-- ⚠️ 行为变更提示：修好后「已登录非游客」用户的 AI 调用**会开始真正预扣/结算积分**
--   （在此之前是静默不扣）。这是经济侧行为变更，不是纯技术修复。
--
-- 幂等：create or replace，签名 (uuid, uuid, text, integer, numeric) 与线上一致。
-- 本次只改 hashtextext -> hashtext 一处，其余函数体逐字节取自线上 pg_get_functiondef。

CREATE OR REPLACE FUNCTION public.reserve_ai_points(p_reservation_id uuid, p_user_id uuid, p_ip_address text, p_estimated_billed integer, p_multiplier numeric)
 RETURNS TABLE(allowed boolean, points_estimate numeric, points_balance integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform pg_advisory_xact_lock(hashtext('boh-ai-points:' || p_user_id::text));

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
$function$
