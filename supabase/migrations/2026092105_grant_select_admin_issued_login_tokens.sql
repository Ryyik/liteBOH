-- 2026092105_grant_select_admin_issued_login_tokens.sql
-- 修正 2026092104 的自相矛盾：该迁移既建了「admin 可读」的 SELECT 策略
--（admin_issued_login_tokens_admin_select，using current_user_is_admin()），
-- 又执行了 `revoke all ... from authenticated` —— 把表级 SELECT 一并撤掉。
--
-- 表级权限是 RLS 的前提：没有 SELECT 权限时，RLS 策略无论怎么写都读不出行，
-- 等于死策略，管理员也无法核对签发记录（这功能的核心要求之一就是可审计）。
--
-- 修正：只补 SELECT。写权限（INSERT/UPDATE/DELETE）维持仅 service_role：
--   authenticated INSERT = false（登录用户不能伪造审计行）
--   authenticated SELECT = true，但 RLS 把行过滤为「仅 admin」
--     —— 普通 authenticated 用户 SELECT 得 0 行（Supabase 标准姿势：
--        表级权限宽、RLS 窄）。
--   前提已核：current_user_is_admin 在 2026092101 白名单内，authenticated 仍可执行。

grant select on table public.admin_issued_login_tokens to authenticated;

notify pgrst, 'reload schema';

-- 验证（迁移后）：
--   select has_table_privilege('authenticated','public.admin_issued_login_tokens','SELECT') -> t
--   select has_table_privilege('authenticated','public.admin_issued_login_tokens','INSERT') -> f
--   select has_table_privilege('anon','public.admin_issued_login_tokens','SELECT')           -> f
--   select has_table_privilege('service_role','public.admin_issued_login_tokens','SELECT')   -> t
