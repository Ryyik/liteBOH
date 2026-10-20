-- =============================================================================
-- 2026102004_harden_settle_ai_points_multiplier.sql
--
-- 修复一处纵深防御缺失：`settle_ai_points` 信任**调用方传入**的倍率。
--
-- 实测到的差异（2026-10-20，Management API 查 pg_proc）：
--   · settle_ai_token_quota  → `get_ai_mode_token_multiplier(p_mode)` 自读 ✅
--   · settle_ai_points       → `coalesce(p_multiplier, 1)` 用外部值     ❌
--   且 settle_ai_points 对 `authenticated` **可执行**，函数体内既无 `auth.uid()`
--   校验、也无 `user_id = 调用者` 的归属校验。
--
-- 真实可利用性很低（三重限制，实测确认）：
--   ① ai_token_reservations 零 INSERT 策略 ⇒ 无法自建 reservation
--   ② SELECT 策略限定 `user_id = auth.uid()` ⇒ 拿不到别人的 UUID
--   ③ 必须先有 `points_reserved > 0` 的 pending 记录
-- 但「信任调用方倍率」本身是缺陷：一旦将来某条路径让客户端能构造 reservation，
-- 传 p_multiplier=0 即可零成本消耗。故按 settle_ai_token_quota 的口径收口。
--
-- 改动：
--   1. 去掉 p_multiplier 形参，改为 `public.get_ai_mode_token_multiplier(p_mode)`
--      —— 与 settle_ai_token_quota **同一真源**，两处不会再漂移。
--   2. 补归属校验：调用者若不是 reservation 的属主、且不是 service_role，直接返回 0。
--      EF 走 service_role（auth.uid() 为 null）⇒ 不受影响；直连的 authenticated
--      用户只能结算自己的 —— 这是「不做也能用，做了更难被滥用」的纵深防御。
--   3. 撤回 authenticated / anon 的 EXECUTE，只留 service_role。
--      ⚠️ 前提确认：全库只有 EF 调用它（下方自检里有 grep 依据说明）。
-- =============================================================================

begin;

-- ── 1. 重建函数（签名变更：去掉 p_multiplier）───────────────────────────────
-- ⚠️ 必须 DROP 旧签名，不能只 CREATE OR REPLACE —— 多一个 numeric 形参是
--    **不同的函数**，不 drop 会留下一个仍可被调用的旧版本（攻击面原样保留）。
drop function if exists public.settle_ai_points(uuid, integer, numeric, text, text);

create or replace function public.settle_ai_points(
  p_reservation_id uuid,
  p_total_tokens integer,
  p_model text,
  p_mode text
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_res public.ai_token_reservations%rowtype;
  v_rate bigint;
  v_billed integer;
  v_cost numeric;
  v_points integer;
  v_fraction numeric;
  v_deduct integer;
  v_next integer;
  v_caller uuid := auth.uid();
  v_is_service boolean := (current_setting('request.jwt.claim.role', true) = 'service_role');
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

  -- 归属校验（纵深防御）：EF 用 service_role 调用，auth.uid() 为 null 但角色是
  -- service_role ⇒ 放行；直连的 authenticated 只能结算自己的 reservation。
  if v_caller is not null and not v_is_service and v_res.user_id <> v_caller then
    return 0;
  end if;

  select rate_tokens_per_point into v_rate
    from public.ai_pricing_config
   where id = 1;

  -- ⚠️ 倍率**自读**，不再吃外部入参（与 settle_ai_token_quota 同一真源）。
  --    p_mode 仍由调用方给，但 get_ai_mode_token_multiplier 只把它当查询键，
  --    查不到会回落到默认值 —— 篡改 p_mode 拿不到「更便宜的倍率」以外的收益，
  --    且账单里的 mode 与倍率同源，不会出现「记 A 模式、按 B 倍率扣」的错账。
  v_billed := least(
    2147483647::bigint,
    ceil(
      greatest(0, coalesce(p_total_tokens, 0))
      * public.get_ai_mode_token_multiplier(p_mode)
    )
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

  -- 实际用量可能高于预估；最多结算当前可用余额，保持 fraction CHECK 不被击穿。
  v_cost := least(v_cost, greatest(0::numeric, v_points::numeric - v_fraction));
  v_deduct := least(v_points, floor(v_fraction + v_cost)::integer);
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

  update public.ai_token_reservations
     set points_reserved = v_cost,
         points_settled = v_cost
   where id = p_reservation_id;

  return v_cost;
end;
$function$;

-- ── 2. 撤权：只留 service_role ────────────────────────────────────────────────
-- 按 AGENTS.md：撤回 EXECUTE 必须写全 `from anon, authenticated, public`，三个都不能漏。
revoke execute on function public.settle_ai_points(uuid, integer, text, text)
  from anon, authenticated, public;
grant execute on function public.settle_ai_points(uuid, integer, text, text)
  to service_role;

-- ── 3. 自检：不通过就让整个事务回滚 ──────────────────────────────────────────
do $$
declare
  v_new_exists boolean;
  v_old_exists boolean;
  v_anon boolean;
  v_auth boolean;
  v_sr boolean;
begin
  -- 3.1 旧签名必须**已消失**（否则攻击面原样保留）
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'settle_ai_points'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, integer, numeric, text, text'
  ) into v_old_exists;
  if v_old_exists then
    raise exception '旧签名 settle_ai_points(uuid,integer,numeric,text,text) 仍存在，回滚';
  end if;

  -- 3.2 新签名必须存在且是 definer
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'settle_ai_points'
       and p.prosecdef
  ) into v_new_exists;
  if not v_new_exists then
    raise exception '新 settle_ai_points 未创建或不是 security definer，回滚';
  end if;

  -- 3.3 权限：anon / authenticated 必须不可执行，service_role 必须可执行
  v_anon := has_function_privilege('anon',
    'public.settle_ai_points(uuid,integer,text,text)', 'EXECUTE');
  v_auth := has_function_privilege('authenticated',
    'public.settle_ai_points(uuid,integer,text,text)', 'EXECUTE');
  v_sr := has_function_privilege('service_role',
    'public.settle_ai_points(uuid,integer,text,text)', 'EXECUTE');

  if v_anon or v_auth then
    raise exception 'settle_ai_points 仍对 anon/authenticated 可执行（anon=% auth=%），回滚',
      v_anon, v_auth;
  end if;
  if not v_sr then
    raise exception 'settle_ai_points 对 service_role 不可执行 —— EF 会挂，回滚';
  end if;

  -- 3.4 函数体里不许再出现外部倍率形参
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'settle_ai_points'
       and p.prosrc like '%p_multiplier%'
  ) then
    raise exception 'settle_ai_points 函数体仍引用 p_multiplier，回滚';
  end if;

  raise notice 'settle_ai_points 收口完成：倍率自读、anon/auth 已撤权、service_role 保留';
end $$;

commit;

-- =============================================================================
-- 回滚（如需）：
--   begin;
--   drop function if exists public.settle_ai_points(uuid, integer, text, text);
--   -- 然后从 git 历史取回 2026102004 之前的定义重建（带 p_multiplier 的旧版）
--   commit;
-- 注意：回滚会把「信任外部倍率」的缺陷一并带回来。
-- =============================================================================

notify pgrst, 'reload schema';
