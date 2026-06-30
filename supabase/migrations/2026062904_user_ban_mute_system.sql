-- ============================================================
-- 用户封禁/禁言系统
-- 添加封禁相关字段到 profiles 表，并创建管理员操作 RPC
-- ============================================================

-- 1. 添加封禁/禁言相关字段到 profiles 表
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mute_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS banned_by UUID DEFAULT NULL REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS muted_by UUID DEFAULT NULL REFERENCES auth.users(id);

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_muted ON public.profiles(is_muted) WHERE is_muted = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_banned_until ON public.profiles(banned_until) WHERE banned_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_muted_until ON public.profiles(muted_until) WHERE muted_until IS NOT NULL;

-- 3. 添加注释
COMMENT ON COLUMN public.profiles.is_banned IS '用户是否被封禁（禁止登录）';
COMMENT ON COLUMN public.profiles.is_muted IS '用户是否被禁言（禁止发言）';
COMMENT ON COLUMN public.profiles.ban_reason IS '封禁原因';
COMMENT ON COLUMN public.profiles.mute_reason IS '禁言原因';
COMMENT ON COLUMN public.profiles.banned_until IS '封禁到期时间，NULL 表示永久封禁';
COMMENT ON COLUMN public.profiles.muted_until IS '禁言到期时间，NULL 表示永久禁言';
COMMENT ON COLUMN public.profiles.banned_at IS '封禁操作时间';
COMMENT ON COLUMN public.profiles.muted_at IS '禁言操作时间';
COMMENT ON COLUMN public.profiles.banned_by IS '执行封禁的管理员 ID';
COMMENT ON COLUMN public.profiles.muted_by IS '执行禁言的管理员 ID';

-- 4. 创建管理员封禁用户 RPC
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_current_is_banned BOOLEAN;
BEGIN
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

  -- 执行封禁
  UPDATE profiles
  SET 
    is_banned = TRUE,
    ban_reason = p_reason,
    banned_until = p_until,
    banned_at = NOW(),
    banned_by = COALESCE(p_admin_id, auth.uid())
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已封禁',
    'affected', 1
  );
END;
$$;

-- 5. 创建管理员解封用户 RPC
CREATE OR REPLACE FUNCTION public.admin_unban_user(
  p_user_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_banned BOOLEAN;
BEGIN
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

-- 6. 创建管理员禁言用户 RPC
CREATE OR REPLACE FUNCTION public.admin_mute_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_muted BOOLEAN;
BEGIN
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

  -- 执行禁言
  UPDATE profiles
  SET 
    is_muted = TRUE,
    mute_reason = p_reason,
    muted_until = p_until,
    muted_at = NOW(),
    muted_by = COALESCE(p_admin_id, auth.uid())
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', '用户已禁言',
    'affected', 1
  );
END;
$$;

-- 7. 创建管理员解除禁言 RPC
CREATE OR REPLACE FUNCTION public.admin_unmute_user(
  p_user_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_muted BOOLEAN;
BEGIN
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

-- 8. 创建定时清理过期封禁/禁言的函数（可由 cron 或前端触发）
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

-- 9. 授权管理员角色执行这些 RPC
-- 注意：需要确保管理员有执行权限，RLS 策略会在下一步处理
GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID, TEXT, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mute_user(UUID, TEXT, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unmute_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_bans_and_mutes() TO authenticated;

-- 10. 更新 RLS 策略，确保只有管理员可以修改封禁状态
-- 管理员可以查看和修改所有用户的封禁字段
CREATE POLICY "Admins can manage ban/mute fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

-- 11. 添加检查约束，确保封禁/禁言状态与时间字段一致
-- 如果 is_banned/is_muted 为 TRUE，则 banned_at/muted_at 必须有值
ALTER TABLE public.profiles
ADD CONSTRAINT check_ban_consistency
CHECK (
  (is_banned = FALSE AND banned_at IS NULL AND banned_by IS NULL)
  OR (is_banned = TRUE AND banned_at IS NOT NULL AND banned_by IS NOT NULL)
);

ALTER TABLE public.profiles
ADD CONSTRAINT check_mute_consistency
CHECK (
  (is_muted = FALSE AND muted_at IS NULL AND muted_by IS NULL)
  OR (is_muted = TRUE AND muted_at IS NOT NULL AND muted_by IS NOT NULL)
);