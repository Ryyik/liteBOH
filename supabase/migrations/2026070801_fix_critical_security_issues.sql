begin;

-- =====================================================================
-- 修复 CRITICAL 安全漏洞 C-1 + C-2
-- C-1: admin_ban/unban/mute/unmute RPC 为 SECURITY DEFINER 但函数体
--      未校验调用者 admin 身份，任意登录用户可封禁/解封全站用户。
-- C-2: sync_profile_from_auth_user_insert 触发器从 raw_user_meta_data
--      读取 role/points，配合 auth-register 透传 metadata 可自注册管理员。
-- =====================================================================


-- ---------------------------------------------------------------------
-- C-1: 重写 4 个 ban/mute RPC，在函数体内强制校验 current_user_is_admin()
--      并去掉可伪造的 p_admin_id 参数，统一使用 auth.uid()。
--      同时重写 cleanup_expired_bans_and_mutes 加 admin 校验。
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_banned BOOLEAN;
  v_admin_id UUID;
BEGIN
  -- 安全修复：强制校验调用者为管理员
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden: 仅管理员可执行此操作';
  END IF;

  v_admin_id := auth.uid();

  -- 不允许封禁自己，避免管理员误操作锁死账号
  IF p_user_id = v_admin_id THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '不能封禁自己'
    );
  END IF;

  -- 检查目标用户是否存在
  SELECT is_banned INTO v_current_is_banned
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户不存在'
    );
  END IF;

  -- 如果已经封禁，返回提示
  IF v_current_is_banned = TRUE THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户已经被封禁'
    );
  END IF;

  -- 执行封禁，操作人固定为当前鉴权用户
  UPDATE profiles
  SET
    is_banned = TRUE,
    ban_reason = p_reason,
    banned_until = p_until,
    banned_at = NOW(),
    banned_by = v_admin_id
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已封禁',
    'affected', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unban_user(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_banned BOOLEAN;
BEGIN
  -- 安全修复：强制校验调用者为管理员
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden: 仅管理员可执行此操作';
  END IF;

  -- 检查目标用户是否存在
  SELECT is_banned INTO v_current_is_banned
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户不存在'
    );
  END IF;

  -- 如果未封禁，返回提示
  IF v_current_is_banned = FALSE THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户未被封禁'
    );
  END IF;

  -- 执行解封
  UPDATE profiles
  SET
    is_banned = FALSE,
    ban_reason = NULL,
    banned_until = NULL,
    banned_at = NULL,
    banned_by = NULL
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已解封',
    'affected', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mute_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_muted BOOLEAN;
  v_admin_id UUID;
BEGIN
  -- 安全修复：强制校验调用者为管理员
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden: 仅管理员可执行此操作';
  END IF;

  v_admin_id := auth.uid();

  -- 检查目标用户是否存在
  SELECT is_muted INTO v_current_is_muted
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户不存在'
    );
  END IF;

  -- 如果已经禁言，返回提示
  IF v_current_is_muted = TRUE THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户已经被禁言'
    );
  END IF;

  -- 执行禁言，操作人固定为当前鉴权用户
  UPDATE profiles
  SET
    is_muted = TRUE,
    mute_reason = p_reason,
    muted_until = p_until,
    muted_at = NOW(),
    muted_by = v_admin_id
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已禁言',
    'affected', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unmute_user(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_muted BOOLEAN;
BEGIN
  -- 安全修复：强制校验调用者为管理员
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden: 仅管理员可执行此操作';
  END IF;

  -- 检查目标用户是否存在
  SELECT is_muted INTO v_current_is_muted
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户不存在'
    );
  END IF;

  -- 如果未禁言，返回提示
  IF v_current_is_muted = FALSE THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'message', '用户未被禁言'
    );
  END IF;

  -- 执行解除禁言
  UPDATE profiles
  SET
    is_muted = FALSE,
    mute_reason = NULL,
    muted_until = NULL,
    muted_at = NULL,
    muted_by = NULL
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已解除禁言',
    'affected', 1
  );
END;
$$;

-- cleanup 同样加 admin 校验，避免任意用户触发清理逻辑
CREATE OR REPLACE FUNCTION public.cleanup_expired_bans_and_mutes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ban_count INTEGER;
  v_mute_count INTEGER;
BEGIN
  -- 安全修复：强制校验调用者为管理员
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden: 仅管理员可执行此操作';
  END IF;

  -- 清理过期封禁
  UPDATE profiles
  SET
    is_banned = FALSE,
    ban_reason = NULL,
    banned_until = NULL,
    banned_at = NULL,
    banned_by = NULL
  WHERE is_banned = TRUE
    AND banned_until IS NOT NULL
    AND banned_until < NOW();

  GET DIAGNOSTICS v_ban_count = ROW_COUNT;

  -- 清理过期禁言
  UPDATE profiles
  SET
    is_muted = FALSE,
    mute_reason = NULL,
    muted_until = NULL,
    muted_at = NULL,
    muted_by = NULL
  WHERE is_muted = TRUE
    AND muted_until IS NOT NULL
    AND muted_until < NOW();

  GET DIAGNOSTICS v_mute_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'bans_expired', v_ban_count,
    'mutes_expired', v_mute_count
  );
END;
$$;

-- 注意：函数签名已变更（去掉 p_admin_id 参数），需要收回旧的 GRANT 再重新授权。
-- PostgREST 通过函数签名缓存权限，签名变更后旧 GRANT 自动失效，
-- 但显式 REVOKE 可避免遗留歧义，随后对新签名授权。
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(UUID, TEXT, TIMESTAMPTZ, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mute_user(UUID, TEXT, TIMESTAMPTZ, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unmute_user(UUID, UUID) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mute_user(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unmute_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_bans_and_mutes() TO authenticated;


-- ---------------------------------------------------------------------
-- C-2: 重写 sync_profile_from_auth_user_insert 触发器函数，
--      强制忽略 raw_user_meta_data 中的 role/points，
--      新注册用户 role 一律为 'user'、points 一律为 0。
--      这是根本防线：即便 Edge Function 被绕过或 metadata 被污染，
--      触发器也不会把攻击者注入的 role/points 写入 profiles。
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_username text;
  v_join_date date := current_date;
  v_join_date_text text;
  v_birth_month text;
  v_birth_day text;
begin
  v_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  if v_username is null then
    v_username := nullif(trim(split_part(lower(coalesce(new.email, '')), '@', 1)), '');
  end if;
  if v_username is null then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  -- 安全修复：强制 role 为 'user'，忽略 metadata 中可能注入的 role
  -- （原代码 v_role := nullif(... raw_user_meta_data ->> 'role' ...) 导致自注册管理员漏洞）

  -- 安全修复：强制 points 为 0，忽略 metadata 中可能注入的 points
  -- （原代码 v_points 从 raw_user_meta_data ->> 'points' 读取）

  v_join_date_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'join_date', '')), '');
  if v_join_date_text is not null and v_join_date_text ~ '^\d{4}-\d{2}-\d{2}$' then
    v_join_date := v_join_date_text::date;
  end if;

  v_birth_month := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_month', '')), '');
  v_birth_day := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_day', '')), '');

  insert into public.profiles (
    id,
    username,
    email,
    role,
    points,
    join_date,
    birth_month,
    birth_day
  ) values (
    new.id,
    v_username,
    lower(nullif(trim(coalesce(new.email, '')), '')),
    'user',
    0,
    v_join_date,
    v_birth_month,
    v_birth_day
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(nullif(trim(public.profiles.username), ''), excluded.username),
        join_date = coalesce(public.profiles.join_date, excluded.join_date),
        -- 安全修复：on conflict 时也不允许用 metadata 的 role 覆盖
        role = public.profiles.role,
        birth_month = coalesce(public.profiles.birth_month, excluded.birth_month),
        birth_day = coalesce(public.profiles.birth_day, excluded.birth_day);

  return new;
end;
$$;

-- 触发器本身无需重建（仍引用同名函数），函数体重写即生效。

notify pgrst, 'reload schema';

commit;
