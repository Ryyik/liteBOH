-- ============================================================================
-- 封禁下沉到 GoTrue：让 passkey / OAuth 也无法签发 token（**不禁用 passkey**）
--
-- 问题（2026-11-03 外部审查 F1）：
--   今天的封禁只写 `profiles.is_banned`，服务端校验只存在于 `auth-login` EF
--   的密码分支。而 passkey（`supabase.auth.signInWithPasskey()` →
--   `/passkeys/authentication/verify`）和 OAuth 都直连 GoTrue，
--   **不经过任何我们自己的函数** ⇒ 被封禁用户仍能拿到有效 access token。
--   前端 `stores/auth.ts:803 checkBanAfterSignIn` 会在 UI 层登出，但直接持有
--   token 的调用者不受该客户端检查约束（这正是 `auth-login` 注释里点名的
--   「客户端检查可被绕过」那一类路径）。
--
-- 为什么不是关掉 passkey：
--   产品要保留这项登录方式。正确的收口点是**签发方**，不是客户端。
--
-- 依据（GoTrue 源码，已核对 supabase/auth `internal/api/passkey_authentication.go`）：
--   passkey 校验通过后、`issueRefreshToken` **之前**：
--       if user.IsBanned() {
--           return apierrors.NewForbiddenError(apierrors.ErrorCodeUserBanned, "User is banned")
--       }
--   `IsBanned()` 读的就是 `auth.users.banned_until`。也就是说：只要把封禁写进
--   这一列，passkey 登录会在服务端被 GoTrue 直接拒掉（403 user_banned），
--   OAuth 与密码走 `/token` 同款检查，一并覆盖。
--   撤销 refresh 由 `admin-revoke-session` EF 负责（封禁流程已在调用）。
--
-- 与现有实现的差异（保持单一真源 + 同事务）：
--   `profiles.is_banned / banned_until` 仍是**展示与业务口径**的真源
--   （前端列表、徽标、`checkBanAfterSignIn` 都读它）；`auth.users.banned_until`
--   是**执行口径**。两者在同一个 SECURITY DEFINER 函数、同一个事务里写，
--   不会出现「库里说封了但还能登录」或反之。
--
-- ⚠️ 永久封禁写成 `now() + 100 years`，不用 `'infinity'`：Go 侧解析
--    infinity 的行为依驱动版本而异，100 年足够且是 GoTrue 官方 admin API
--    自己用的量级（ban_duration 上限即 876000h ≈ 100 年）。
--
-- ⚠️ 反向对账：若有人绕过这两个 RPC 直接改 `profiles.is_banned`，两份状态会
--    分叉（表现为「列表显示已封禁但还能登录」）。对账 SQL 放在
--    docs/2026-11-03-安全整改外部审查.md §8。
-- ============================================================================

create or replace function public.admin_ban_user(
  p_user_id uuid,
  p_reason text default null,
  p_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current_is_banned boolean;
  v_admin_id uuid;
  v_auth_rows integer := 0;
  v_auth_ban_until timestamptz;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  v_admin_id := auth.uid();

  if p_user_id = v_admin_id then
    return jsonb_build_object('ok', false, 'message', '不能封禁自己');
  end if;

  select is_banned into v_current_is_banned
    from profiles where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', '用户不存在');
  end if;

  if v_current_is_banned = true then
    return jsonb_build_object('ok', false, 'message', '用户已经被封禁');
  end if;

  update profiles
     set is_banned = true,
         ban_reason = p_reason,
         banned_until = p_until,
         banned_at = now(),
         banned_by = v_admin_id
   where id = p_user_id;

  -- ── 执行面：写 GoTrue 的 banned_until，封住 passkey / OAuth / 密码三条签发路径 ──
  v_auth_ban_until := coalesce(p_until, now() + interval '100 years');

  update auth.users
     set banned_until = v_auth_ban_until
   where id = p_user_id;

  get diagnostics v_auth_rows = row_count;

  -- 返回 user_id，调用方可据此撤销该用户现有 session
  return jsonb_build_object(
    'ok', true,
    'message', '用户已封禁',
    'affected', 1,
    'user_id', p_user_id,
    'auth_ban_synced', v_auth_rows = 1,
    'auth_banned_until', v_auth_ban_until
  );
end;
$function$;

create or replace function public.admin_unban_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current_is_banned boolean;
  v_auth_rows integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  select is_banned into v_current_is_banned
    from profiles where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', '用户不存在');
  end if;

  if v_current_is_banned = false then
    return jsonb_build_object('ok', false, 'message', '用户未被封禁');
  end if;

  update profiles
     set is_banned = false,
         ban_reason = null,
         banned_until = null,
         banned_at = null,
         banned_by = null
   where id = p_user_id;

  -- 解封必须同步清掉执行面，否则用户「已解封但登不进来」
  update auth.users
     set banned_until = null
   where id = p_user_id;

  get diagnostics v_auth_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'message', '用户已解封',
    'affected', 1,
    'auth_ban_cleared', v_auth_rows = 1
  );
end;
$function$;

-- 授权面保持不变（两个函数体内都自判 admin）
revoke all on function public.admin_ban_user(uuid, text, timestamptz) from public;
grant execute on function public.admin_ban_user(uuid, text, timestamptz) to authenticated, service_role;

revoke all on function public.admin_unban_user(uuid) from public;
grant execute on function public.admin_unban_user(uuid) to authenticated, service_role;

-- 自证：历史遗留的「profiles 已封禁但 auth 未封」必须为 0
do $do$
declare
  v_drift integer;
begin
  select count(*)
    into v_drift
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.is_banned = true
     and (u.banned_until is null or u.banned_until <= now());

  if v_drift > 0 then
    raise exception '存在 % 个用户 profiles 已封禁但 auth 未封禁，请先对账再应用本迁移', v_drift;
  end if;
end
$do$;
