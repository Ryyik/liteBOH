-- ============================================================================
-- BOH 邮件链路保活（Brevo SMTP key 防 90 天不活跃回收）
--
-- 背景：Supabase SMTP 走 Brevo 免费档（smtp-relay.brevo.com:587，2026-09-22 接入），
-- 用于注册确认 / 密码重置等认证邮件。Brevo SMTP key 90 天不活跃会被回收，
-- 一旦回收，认证邮件全链路哑火（注册即失联）。
--
-- 本迁移做两件事：
--   ① public.mail_keepalive_log —— 保活底账表（每次触发一行，失败也记）。
--      访问模型：仅 service_role（Edge Function / 运维）可读写；
--      anon/authenticated 无任何 grant（revoke）→ PostgREST 匿名面为 0。
--      下方那条 service_role policy 同时满足 check:db-advisors 的
--      rls_enabled_no_policy（RLS 启用必须至少有一条策略）。
--   ② pg_cron 任务（2026-10-08 起由 scripts/mail-keepalive-ops.mjs --cron 注册，
--      **不再在本文件里 schedule**）。2026-10-27 起是**两条**：
--        · boh_mail_keepalive_watchdog（`0 1 * * *`，每日，主通道）——
--          命令里带 `where 距上次成功 >= 21 天` 的条件，健康时不发信；
--          失败次日自动重试 ⇒ 单次抖动不再把下次机会推到下个月。
--        · boh_mail_keepalive_monthly（`0 1 8 * *`，每月 8 号，兜底）——
--          万一巡检命令本身被写坏，日历仍然会响一次。
--      两条命令都经 pg_net 调 mail-keepalive Edge Function，token 同源。
--      原因：本文件最初版在 cron 命令里动态读 app.settings.supabase_url /
--      app.settings.service_role_key（论坛周报先例的数据库级配置），实测发现那对
--      GUC **从未被设置过**（pg_db_role_setting 里查无此配置，周报任务每次都在发
--      空 Bearer）——脚本改为直接从 Management API /secrets 读 service key 后烘焙
--      进 cron 命令文本，凭据来源单点化，轮换后重跑 --cron 即可。
--
-- ⚠️ 为什么不是「每月固定一次」就够：2026-10-27 复盘发现，月度 job 上线 19 天里
--    cron.job_run_details **0 条执行记录**（首排期 11-08）——「有没有生效」无从验证，
--    且一次失败就要空等 30 天，而 Brevo 的回收窗口是 90 天。
--    判定口径与阈值常量在 scripts/lib/mail-keepalive-policy.mjs。
--
-- ⚠️ recover 端点对不存在的邮箱同样返回 200+{}（防枚举）：
--    底账里的 200 只证明「请求被接受」；最终证据 = 收件箱收到邮件 / Brevo 后台送达记录。
-- ============================================================================

create table if not exists public.mail_keepalive_log (
  id bigint generated always as identity primary key,
  triggered_at timestamptz not null default now(),
  recipient text not null,
  http_status int null,
  response_body text null,
  ok boolean not null,
  error text null
);

alter table public.mail_keepalive_log enable row level security;

revoke all on public.mail_keepalive_log from anon, authenticated;

create policy mail_keepalive_log_service_only on public.mail_keepalive_log
  for all to service_role using (true) with check (true);

-- 注：cron.schedule 不在本文件 —— 见文件头说明 ②。
-- （迁移首次执行时曾注册过引用空 GUC 的同名 job，已被 ops 脚本 --cron 的
--   unschedule + schedule 幂等替换；重放本迁移不会产生重复 job。）
