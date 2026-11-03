-- ============================================================================
-- 修 `admin_supabase_project_status` 引用不存在的 `storage.objects.size`
--
-- 症状（`npm run check:db-lint` 的唯一 error，2026-11-03 外部审查 §1.1）：
--   public.admin_supabase_project_status  [error] column "size" does not exist (42703)
--     SQL: SELECT COALESCE(SUM(size), 0) FROM storage.objects
--
-- 为什么以前没炸：函数体里那段被 `EXCEPTION WHEN OTHERS` 包着，运行期
--   命中 undefined_column 后走兜底把 storage_size 置 0 —— 用户看不到报错，
--   但**存储用量永远是 0**，管理后台那张卡是假的。门禁（plpgsql_check）
--   看的是静态可达性，所以它能红。
--
-- 为什么 `metadata->>'size'` 是对的口径：
--   本库 storage.objects 的实际列只有
--     id / bucket_id / name / owner / created_at / updated_at / last_accessed_at /
--     metadata / path_tokens / version / owner_id / user_metadata /
--     archived_at / is_delete_marker / is_versioned
--   —— 没有 `size`。文件大小在 metadata jsonb 里，键是字符串形式的字节数
--   （`metadata->>'size'`），这也是 storage-api 对外返回 size 的同源取值。
--
-- ⚠️ 只改存储那一段，其余逻辑与原函数逐字一致（线上 v 定义为准，不是迁移
--   2026063006 的初版 —— 两者在 region 注释与 ROUND 写法上已经漂移）。
-- ============================================================================

create or replace function public.admin_supabase_project_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  result JSONB;
  db_size BIGINT;
  db_size_limit BIGINT := 500 * 1024 * 1024; -- 500MB free tier default
  storage_size BIGINT;
  storage_size_limit BIGINT := 1 * 1024 * 1024 * 1024; -- 1GB free tier default
  active_connections INT;
  user_count INT;
  post_count INT;
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
  
  -- 存储用量：storage.objects **没有 size 列**，大小在 metadata jsonb 里（键 'size'，
  -- 值形如 "12345"）。用正则先筛数字再 cast —— 比 `::BIGINT` 直接转更稳：
  -- metadata 里出现非数字（历史脏数据）时不会整段报错，而是按 0 计。
  -- EXCEPTION 兜底保留：storage schema 的可见性将来再变时不至于让管理卡片 500。
  BEGIN
    SELECT COALESCE(
             SUM(
               CASE
                 WHEN o.metadata ->> 'size' ~ '^[0-9]+$' THEN (o.metadata ->> 'size')::BIGINT
                 ELSE 0
               END
             ),
             0
           )
      INTO storage_size
      FROM storage.objects o;
  EXCEPTION WHEN OTHERS THEN
    storage_size := 0;
  END;

  -- 构建返回结果
  result := jsonb_build_object(
    'ok', true,
    'project_name', 'BOHLITE',
    'region', 'ap-northeast-1', -- Tokyo region
    'database_size', db_size,
    'database_size_limit', db_size_limit,
    'database_percent', ROUND((db_size::FLOAT / db_size_limit) * 100, 2),
    'storage_size', storage_size,
    'storage_size_limit', storage_size_limit,
    'storage_percent', ROUND((storage_size::FLOAT / storage_size_limit) * 100, 2),
    'active_connections', active_connections,
    'user_count', user_count,
    'post_count', post_count,
    'monthly_active_users', user_count, -- 简化估计
    'api_requests_month', 0, -- 无法从客户端获取，需 Management API
    'edge_function_count', 0, -- 无法从客户端获取
    'health_score', CASE 
      WHEN (db_size::FLOAT / db_size_limit) > 0.8 THEN 80
      WHEN (db_size::FLOAT / db_size_limit) > 0.6 THEN 90
      ELSE 100
    END,
    'last_updated', NOW()
  );

  RETURN result;
END;
$function$;

-- 授权面保持不变：只给 authenticated（函数体内自判 admin 角色）。
revoke all on function public.admin_supabase_project_status() from public;
grant execute on function public.admin_supabase_project_status() to authenticated, service_role;
