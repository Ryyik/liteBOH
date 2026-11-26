-- 撤销重复实现（2026-11-26，plans/050 §11 更正）
--
-- 一次性登录 token 早在 2026-11-21 就有完整实现：
--   · EF `admin-issue-login-token`：管理员确认 + 原因必填（写审计）+ GoTrue generateLink(recovery)
--   · 台账表 `admin_issued_login_tokens`
--   · 消费端 `/reset-password` 粘贴 hashed_token → verifyOtp(recovery) 建立会话
-- 2026112601 又建了一套 `login_tokens` + `admin_issue_login_token`（6 位数字口令），
-- 属第二份真源，且消费端未接。这里就地删除，后台详情页改用既有 EF 链路。

drop function if exists public.admin_issue_login_token(uuid, integer);
drop table if exists public.login_tokens;

notify pgrst, 'reload schema';
