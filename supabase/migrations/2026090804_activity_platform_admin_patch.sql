-- ============================================================
-- 2026090804_activity_platform_admin_patch.sql
-- BETA 6 P1-3 管理端接入补丁：
--   activity_entries 的 update policy 原仅限本人（auth.uid() = user_id），
--   管理员在后台纠正报名/投稿状态会被 RLS 拦截。
--   本迁移给 update 加 admin 分支（delete 原本已含 admin，无需改动）。
-- ============================================================

begin;

drop policy if exists activity_entries_update on public.activity_entries;
create policy activity_entries_update on public.activity_entries
  for update using (auth.uid() = user_id or public.current_user_is_admin())
  with check (auth.uid() = user_id or public.current_user_is_admin());

commit;
