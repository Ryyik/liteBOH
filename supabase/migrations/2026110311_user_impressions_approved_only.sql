-- ============================================================================
-- A2 · user_impressions 只公开审核通过的内容
--
-- 原策略：`"Impressions are viewable by everyone"`，cmd=SELECT，roles={public}，
--         qual = true ⇒ moderation_status = 'pending' / 'rejected' 的行
--         同样对外可读 —— 审核拦下的内容等于没拦。
--
-- 改动只碰这一条策略的 USING 表达式：
--   · 作者 / 被评价人仍能通过 `user_impressions_select_own` 看到自己的
--     全部记录（含 pending），所以「提交后能在自己主页看到」不受影响；
--   · 管理员仍走 `user_impressions_admin_select`。
--
-- 上线前取证：整表 21 行，moderation_status 全为 'approved'
--   ⇒ 本次收口对现有可见性 **零变化**，只堵住将来写入非 approved 的泄漏。
--   （若将来出现 null 值，null 不满足 = 'approved'，默认不可见，方向安全。）
-- ============================================================================

drop policy if exists "Impressions are viewable by everyone" on public.user_impressions;

create policy "Impressions are viewable by everyone"
  on public.user_impressions
  for select
  to public
  using (moderation_status = 'approved');
