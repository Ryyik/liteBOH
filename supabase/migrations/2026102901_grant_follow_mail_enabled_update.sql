-- 2026102901: 补 follow_mail_enabled 的列级 UPDATE 授权
--
-- 现象（2026-10-29 用户报障）：设置页点「关注的人邮件通知」开关 → 「设置保存失败，请稍后重试」。
--
-- 根因：profiles 对 authenticated 的 UPDATE **不是表级授权，而是列级白名单**
--   （28 列，见 2026070802 收窄敏感列时的写法）。2026102801 新增 follow_mail_enabled 后，
--   它只自动继承了表级已有的 SELECT / REFERENCES —— UPDATE 不在表级，
--   所以**新列默认没有 UPDATE 权限** ⇒ PostgREST 返回 42501 permission denied。
--
--   ⚠️ 注意这个组合最容易误判成前端 bug：SELECT 有权限，所以开关能正确显示当前状态，
--      只有「点了保存不动」。查权限时要同时看 column_privileges 的 SELECT 和 UPDATE 两行。
--
-- 为什么当时验证没发现：是用 Management API 的 postgres 超级用户直接 UPDATE 的，
--   超级用户不受列级权限约束。**涉及「用户改自己」的列，必须用 authenticated 身份验证。**
--
-- RLS 侧本来就是通的（profiles_update_self / Users can update own profile，均为 auth.uid() = id），
--   所以只需要补这一条列级 grant，不需要动策略。
--
-- 幂等：grant 可重复执行。
--
-- Down Migration: revoke update (follow_mail_enabled) on public.profiles from authenticated;

begin;

grant update (follow_mail_enabled) on table public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;
