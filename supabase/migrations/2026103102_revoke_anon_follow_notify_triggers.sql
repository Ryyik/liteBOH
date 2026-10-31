-- ---------------------------------------------------------------------------
-- 补齐 2026102801 漏掉的两个触发器函数收权
--
-- 背景：`2026102801_follow_mail_notification.sql` 里建了四个函数，其中
--   · boh_enqueue_follow_mail(...)  → revoke from public/anon/authenticated + grant service_role ✅
--   · boh_get_user_emails(uuid[])   → revoke from public ✅
--   · boh_notify_followers_on_post()  → 建完就没了 ❌
--   · boh_notify_follow_reply()       → 建完就没了 ❌
--
-- 后果（实测 ACL，2026-10-31）：
--   boh_notify_followers_on_post  {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--   boh_notify_follow_reply       {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- 即 PUBLIC 的 EXECUTE 还在，anon 经 PUBLIC 继承 ⇒ 两个 SECURITY DEFINER 函数成了匿名入口。
-- `check:anon-execute` 棘轮当场报红（152 → 154），这道门禁存在的唯一理由就是抓这种漏。
--
-- 为什么可以直接从 anon / authenticated / public 全收：
--   PostgreSQL **不对触发器函数做 EXECUTE 权限检查** —— 触发器以表 owner 身份执行，
--   与执行 DML 的角色无关。所以收权不影响 posts / comments 上的
--   trg_notify_followers_on_post、trg_notify_follow_reply 正常工作。
--   （本迁移只动权限，不动函数体、不动触发器，无需 drop/recreate。）
--
-- 收权口径对齐同文件的 boh_enqueue_follow_mail：只剩 owner(postgres) + service_role。
-- ---------------------------------------------------------------------------

revoke all on function public.boh_notify_followers_on_post() from public;
revoke all on function public.boh_notify_followers_on_post() from anon;
revoke all on function public.boh_notify_followers_on_post() from authenticated;
grant execute on function public.boh_notify_followers_on_post() to service_role;

revoke all on function public.boh_notify_follow_reply() from public;
revoke all on function public.boh_notify_follow_reply() from anon;
revoke all on function public.boh_notify_follow_reply() from authenticated;
grant execute on function public.boh_notify_follow_reply() to service_role;

-- ---------------------------------------------------------------------------
-- 回滚（如需）：
--   grant execute on function public.boh_notify_followers_on_post() to authenticated;
--   grant execute on function public.boh_notify_followers_on_post() to anon;
--   grant execute on function public.boh_notify_follow_reply() to authenticated;
--   grant execute on function public.boh_notify_follow_reply() to anon;
--   （grant to anon 会连带重建 PUBLIC 继承面，与收权前等价）
-- ---------------------------------------------------------------------------
