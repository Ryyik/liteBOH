-- 2026100402: 修复 reserve_ai_points 的第二个运行期错误（42702 reason 歧义）
--
-- 2026100401 修掉了 hashtextext（42883）之后，**事务内真跑一次**立刻暴露第二个错误：
--   ERROR: 42702: column reference "reason" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   CONTEXT: PL/pgSQL function reserve_ai_points(...) line 60
--
-- 根因：函数签名 RETURNS TABLE(allowed boolean, points_estimate numeric,
--   points_balance integer, reason text) —— OUT 参数 reason 与
--   public.points_transactions.reason 同名；裸列名同时指向两者 ⇒ 运行期解析失败。
--   与 2026-10-03 的 toggle_forum_comment_like（42702）是同一类事故（见 MEMORY.md）。
--
-- 修法：给 points_transactions 加表别名 pt，四个列名全部限定（不只改 reason 一处，
--   避免将来再加 OUT 参数时又踩）。
--
-- 发现方式：supabase db lint **没有**报出这一条（plpgsql 体到首次执行才解析列引用）；
--   是「事务内真跑一次 + ROLLBACK」这条独立验证路径抓到的。
--
-- 幂等：create or replace，签名不变。

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

  -- ⚠️ 必须带表别名限定：本函数 RETURNS TABLE(..., reason text)，
  -- 裸列名 reason 会同时指向 OUT 参数与 points_transactions.reason ⇒ 运行期 42702 ambiguous。
  -- 同 2026-10-03 的 toggle_forum_comment_like 事故，见 MEMORY.md。
  select coalesce(abs(sum(pt.amount)), 0) into v_deducted_today
    from public.points_transactions pt
   where pt.user_id = p_user_id
     and pt.reason = 'ai_usage'
     and pt.amount < 0
     and pt.created_at >= v_today_start;

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
