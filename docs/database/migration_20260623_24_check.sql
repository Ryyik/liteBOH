-- ============================================================
-- 迁移功能检查脚本
-- 用于验证 20260623-24 迁移是否成功执行
-- ============================================================

-- ============================================================
-- 1. 表结构检查
-- ============================================================

-- 1.1 检查 _rate_limits 表是否存在
SELECT '_rate_limits 表' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_rate_limits'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 1.2 检查 notifications.archived_at 列是否存在
SELECT 'notifications.archived_at 列' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'archived_at'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 1.3 检查 posts 位置字段是否存在
SELECT 'posts.location_name 列' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'location_name'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'posts.location_lat 列' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'location_lat'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'posts.location_lng 列' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'location_lng'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- ============================================================
-- 2. 索引检查
-- ============================================================

-- 2.1 检查 notifications 相关索引
SELECT 'idx_notifications_active' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_notifications_active'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_notifications_archived' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_notifications_archived'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 2.2 检查 posts 性能索引
SELECT 'idx_posts_status_created_id' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_status_created_id'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_posts_author_created_id' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_author_created_id'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_posts_tag_status_created_id' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_tag_status_created_id'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 2.3 检查其他索引
SELECT 'idx_likes_user_post' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_likes_user_post'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_comments_post_parent_created' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_comments_post_parent_created'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_forum_post_images_post_order_moderation' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_forum_post_images_post_order_moderation'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'idx_forum_rate_limit_events_user_type_created' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_forum_rate_limit_events_user_type_created'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 2.4 检查冗余索引是否已删除
SELECT 'idx_posts_status_created (应已删除)' as check_item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_status_created'
  ) THEN '✅ 已删除' ELSE '❌ 仍存在' END as status;

SELECT 'idx_posts_status_created_at (应已删除)' as check_item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_status_created_at'
  ) THEN '✅ 已删除' ELSE '❌ 仍存在' END as status;

SELECT 'idx_posts_status_created_at_id (应已删除)' as check_item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_status_created_at_id'
  ) THEN '✅ 已删除' ELSE '❌ 仍存在' END as status;

SELECT 'idx_posts_author_id_created_at (应已删除)' as check_item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_posts_author_id_created_at'
  ) THEN '✅ 已删除' ELSE '❌ 仍存在' END as status;

-- ============================================================
-- 3. RPC 函数检查
-- ============================================================

-- 3.1 检查通知相关函数
SELECT 'mark_single_as_read(uuid)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_single_as_read'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'mark_all_as_read(uuid)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_all_as_read'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

SELECT 'get_unread_notification_count(uuid)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_unread_notification_count'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 3.2 检查点赞通知触发器函数
SELECT 'create_like_notification()' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_like_notification'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 3.3 检查 Admin 函数
SELECT 'admin_data_management_counts()' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_data_management_counts'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 3.4 检查生日用户函数
SELECT 'get_recent_birthday_profiles(int)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_recent_birthday_profiles'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 3.5 检查论坛帖子创建函数（8参数版本）
SELECT 'create_forum_post_with_images(8参数版本)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_forum_post_with_images'
      AND p.pronargs = 8
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- 3.6 检查论坛列表函数
SELECT 'list_forum_posts(7参数版本)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'list_forum_posts'
      AND p.pronargs = 7
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- ============================================================
-- 4. 触发器检查
-- ============================================================

SELECT 'trigger_on_like (likes表)' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'likes'
      AND t.tgname = 'trigger_on_like'
      AND NOT t.tgisinternal
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- ============================================================
-- 5. RLS 策略检查
-- ============================================================

SELECT 'notifications UPDATE 策略' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'notifications'
      AND p.polname = 'Users can update their own notifications'
  ) THEN '✅ 存在' ELSE '❌ 不存在' END as status;

-- ============================================================
-- 6. Realtime Publication 检查
-- ============================================================

SELECT 'notifications 在 supabase_realtime' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN '✅ 已加入' ELSE '❌ 未加入' END as status;

-- ============================================================
-- 7. 函数权限检查
-- ============================================================

-- 7.1 检查 mark_single_as_read 权限
SELECT 'mark_single_as_read: authenticated 有执行权限' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_authid a ON a.rolname = 'authenticated'
    WHERE n.nspname = 'public'
      AND p.proname = 'mark_single_as_read'
      AND has_function_privilege(a.oid, p.oid, 'EXECUTE')
  ) THEN '✅ 正确' ELSE '❌ 缺失权限' END as status;

-- 7.2 检查 mark_all_as_read 权限
SELECT 'mark_all_as_read: authenticated 有执行权限' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_authid a ON a.rolname = 'authenticated'
    WHERE n.nspname = 'public'
      AND p.proname = 'mark_all_as_read'
      AND has_function_privilege(a.oid, p.oid, 'EXECUTE')
  ) THEN '✅ 正确' ELSE '❌ 缺失权限' END as status;

-- 7.3 检查 get_unread_notification_count 权限
SELECT 'get_unread_notification_count: authenticated 有执行权限' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_authid a ON a.rolname = 'authenticated'
    WHERE n.nspname = 'public'
      AND p.proname = 'get_unread_notification_count'
      AND has_function_privilege(a.oid, p.oid, 'EXECUTE')
  ) THEN '✅ 正确' ELSE '❌ 缺失权限' END as status;

-- 7.4 检查 anon 对 list_forum_posts 是否已撤销权限
SELECT 'list_forum_posts: anon 无执行权限 (应已撤销)' as check_item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_authid a ON a.rolname = 'anon'
    WHERE n.nspname = 'public'
      AND p.proname = 'list_forum_posts'
      AND has_function_privilege(a.oid, p.oid, 'EXECUTE')
  ) THEN '✅ 已撤销' ELSE '❌ 仍有权限' END as status;

-- ============================================================
-- 8. 函数签名详细检查
-- ============================================================

-- 显示所有相关函数的完整签名
SELECT '函数签名检查' as section, p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'mark_single_as_read',
    'mark_all_as_read',
    'get_unread_notification_count',
    'create_like_notification',
    'admin_data_management_counts',
    'get_recent_birthday_profiles',
    'create_forum_post_with_images',
    'list_forum_posts'
  )
ORDER BY p.proname;

-- ============================================================
-- 9. 综合汇总
-- ============================================================

SELECT '=== 迁移检查汇总 ===' as summary;

SELECT
  CASE
    WHEN (
      -- 表结构
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_rate_limits')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'archived_at')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'location_name')
      -- 索引
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_notifications_active')
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_posts_status_created_id')
      -- 函数
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'mark_single_as_read')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'mark_all_as_read')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_unread_notification_count')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'create_like_notification')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'create_forum_post_with_images' AND p.pronargs = 8)
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'list_forum_posts' AND p.pronargs = 7)
      -- 触发器
      AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'likes' AND t.tgname = 'trigger_on_like' AND NOT t.tgisinternal)
      -- RLS
      AND EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'notifications' AND p.polname = 'Users can update their own notifications')
      -- Realtime
      AND EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications')
    ) THEN '✅ 所有迁移项检查通过'
    ELSE '❌ 存在未完成的迁移项，请查看上方详细检查结果'
  END as final_status;