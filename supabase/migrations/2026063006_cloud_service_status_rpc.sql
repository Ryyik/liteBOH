-- =====================================================
-- 云服务状态查询 RPC
-- 提供管理员查看 Cloudinary 和 Supabase 使用状态
-- =====================================================

-- 创建 Supabase 项目状态查询 RPC
-- 注意：部分数据需要 Service Role Key 才能获取，这里使用 pg_stat 系统视图
CREATE OR REPLACE FUNCTION admin_supabase_project_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  db_size BIGINT;
  db_size_limit BIGINT := 500 * 1024 * 1024; -- 500MB free tier default
  storage_size BIGINT;
  storage_size_limit BIGINT := 1 * 1024 * 1024 * 1024; -- 1GB free tier default
  active_connections INT;
  user_count INT;
  post_count INT;
  db_percent FLOAT;
  storage_percent FLOAT;
BEGIN
  -- 检查是否为管理员
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '需要管理员权限'
    );
  END IF;

  -- 获取数据库大小（当前数据库）
  SELECT pg_database_size(current_database()) INTO db_size;
  
  -- 获取活跃连接数
  SELECT count(*) INTO active_connections
  FROM pg_stat_activity
  WHERE datname = current_database()
  AND state = 'active';
  
  -- 获取用户数
  SELECT count(*) INTO user_count FROM profiles;
  
  -- 获取帖子数
  SELECT count(*) INTO post_count FROM posts;
  
  -- 尝试获取存储大小（如果有 storage.objects 表）
  BEGIN
    SELECT COALESCE(SUM(size), 0) INTO storage_size
    FROM storage.objects;
  EXCEPTION WHEN OTHERS THEN
    storage_size := 0;
  END;

  -- 计算百分比（使用 FLOAT 类型避免 ROUND 函数问题）
  db_percent := CASE WHEN db_size_limit > 0 THEN (db_size::FLOAT / db_size_limit::FLOAT) * 100 ELSE 0 END;
  storage_percent := CASE WHEN storage_size_limit > 0 THEN (storage_size::FLOAT / storage_size_limit::FLOAT) * 100 ELSE 0 END;

  -- 构建返回结果
  result := jsonb_build_object(
    'ok', true,
    'project_name', 'BOHLITE',
    'region', 'ap-northeast-1',
    'database_size', db_size,
    'database_size_limit', db_size_limit,
    'database_percent', db_percent,
    'storage_size', storage_size,
    'storage_size_limit', storage_size_limit,
    'storage_percent', storage_percent,
    'active_connections', active_connections,
    'user_count', user_count,
    'post_count', post_count,
    'monthly_active_users', user_count,
    'api_requests_month', 0,
    'edge_function_count', 0,
    'health_score', CASE 
      WHEN db_percent > 80 THEN 80
      WHEN db_percent > 60 THEN 90
      ELSE 100
    END,
    'last_updated', NOW()
  );

  RETURN result;
END;
$$;

-- 授权管理员执行
GRANT EXECUTE ON FUNCTION admin_supabase_project_status() TO authenticated;

-- 创建 Cloudinary 使用量估算 RPC（基于 pending_uploads 表）
CREATE OR REPLACE FUNCTION admin_cloudinary_usage_estimate()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  pending_count INT;
  pending_size_estimate BIGINT;
BEGIN
  -- 检查是否为管理员
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '需要管理员权限'
    );
  END IF;

  -- 获取待处理上传数
  BEGIN
    SELECT count(*) INTO pending_count
    FROM cloudinary_pending_uploads
    WHERE deleted_at IS NULL;
    
    -- 估算平均每张图片 500KB
    pending_size_estimate := pending_count * 500 * 1024;
  EXCEPTION WHEN undefined_table THEN
    -- 表不存在时返回默认值
    pending_count := 0;
    pending_size_estimate := 0;
  END;

  result := jsonb_build_object(
    'ok', true,
    'cloud_name', 'dkqae7j1m',
    'pending_uploads_count', pending_count,
    'pending_uploads_estimate_bytes', pending_size_estimate,
    'message', CASE 
      WHEN pending_count = 0 THEN '无待处理上传'
      ELSE '有 ' || pending_count || ' 个待处理上传记录'
    END,
    'note', '完整使用情况需部署 cloudinary-usage Edge Function',
    'last_updated', NOW()
  );

  RETURN result;
END;
$$;

-- 授权管理员执行
GRANT EXECUTE ON FUNCTION admin_cloudinary_usage_estimate() TO authenticated;

-- 添加注释
COMMENT ON FUNCTION admin_supabase_project_status() IS '获取 Supabase 项目状态（管理员专用）';
COMMENT ON FUNCTION admin_cloudinary_usage_estimate() IS '估算 Cloudinary 使用情况（管理员专用）';