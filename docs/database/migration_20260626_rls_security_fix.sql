-- ============================================================================
-- 安全修复迁移：补全缺失的 RLS 策略
-- Date: 2026-06-26
-- Priority: P0 (高危安全漏洞)
-- Issue: likes, user_impressions, addresses, moderation_logs 表无 RLS 保护
-- ============================================================================

-- ============================================
-- 1. likes 表 RLS 策略（高危：任意用户可伪造点赞/删除他人点赞）
-- ============================================

-- 启用 RLS
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- SELECT：用户只能查看自己的点赞
CREATE POLICY likes_select_own ON public.likes
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT：用户只能为自己点赞
CREATE POLICY likes_insert_own ON public.likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE：用户只能删除自己的点赞
CREATE POLICY likes_delete_own ON public.likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. user_impressions 表 RLS 策略（高危：用户印象数据完全公开）
-- ============================================

-- 启用 RLS
ALTER TABLE public.user_impressions ENABLE ROW LEVEL SECURITY;

-- SELECT：用户可以查看自己发出的印象或自己收到的印象
CREATE POLICY user_impressions_select_own ON public.user_impressions
  FOR SELECT
  USING (auth.uid() = author_id OR auth.uid() = target_id);

-- INSERT：用户只能为自己发出的印象负责
CREATE POLICY user_impressions_insert_own ON public.user_impressions
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- ============================================
-- 3. addresses 表 RLS 策略（高危：地址数据无保护）
-- ============================================

-- 启用 RLS
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- SELECT：用户只能查看自己的地址
CREATE POLICY addresses_select_own ON public.addresses
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT：用户只能为自己创建地址
CREATE POLICY addresses_insert_own ON public.addresses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE：用户只能更新自己的地址
CREATE POLICY addresses_update_own ON public.addresses
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE：用户只能删除自己的地址
CREATE POLICY addresses_delete_own ON public.addresses
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. moderation_logs 表 RLS 策略（高危：审核日志无保护）
-- ============================================

-- 启用 RLS
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- 仅管理员可访问审核日志
CREATE POLICY moderation_logs_admin_only ON public.moderation_logs
  FOR ALL
  USING (public.current_user_is_admin());

-- ============================================
-- 5. 补充 posts/comments 表管理员 DELETE/UPDATE 策略
-- ============================================

-- posts 管理员删除策略
CREATE POLICY posts_admin_delete ON public.posts
  FOR DELETE
  USING (public.current_user_is_admin());

-- comments 管理员删除策略
CREATE POLICY comments_admin_delete ON public.comments
  FOR DELETE
  USING (public.current_user_is_admin());

-- ============================================
-- 验证迁移
-- ============================================

-- 检查所有表是否启用了 RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('likes', 'user_impressions', 'addresses', 'moderation_logs', 'posts', 'comments');

-- 检查策略是否已创建
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('likes', 'user_impressions', 'addresses', 'moderation_logs', 'posts', 'comments')
ORDER BY tablename, policyname;

-- ============================================================================
-- 注意事项：
-- 1. 需要确保 current_user_is_admin() 函数已定义
-- 2. addresses 表的外键应从 username 改为 id（长期优化）
-- 3. posts/comments SELECT 策略可能需要添加 status 过滤（已在其他迁移中处理）
-- ============================================================================