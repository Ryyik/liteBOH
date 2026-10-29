-- 回填 mail_outbox.due_at（2026-10-29 审查 P3-3）
--
-- 2026102903 给 mail_outbox 加了 due_at（无 default、无回填），而
-- follow-mail-send 的 retry 查询是
--   .in('status', ['pending','failed']).lte('due_at', now)
-- `NULL <= now()` 恒不为真 ⇒ 迁移前遗留的 pending/failed 行会被**永久漏投**，
-- 且它们既不会被发出去，也不会被标成 failed —— 静默卡在队列里。
--
-- 线上实测（2026-10-29）：mail_outbox 共 5 行，全部 sent，due_at 为 NULL 的 0 行
-- ⇒ 当前**没有**受损数据。这条迁移是为「以后在别的环境重放迁移」准备的一致性补丁，
-- 让「加列」和「回填」成为一个整体，而不是把坑留给下一个环境。
--
-- 口径与 2026102903 的写入端一致：
--   digest  = created_at + window_minutes
--   instant = created_at + 60s（window_minutes 为 null）
-- 只动 pending/failed —— sent/failed 的历史行不需要这个字段来驱动扫描。

begin;

update public.mail_outbox
   set due_at = created_at + make_interval(mins => coalesce(nullif(window_minutes, 0), 1))
 where due_at is null
   and status in ('pending', 'failed');

commit;
