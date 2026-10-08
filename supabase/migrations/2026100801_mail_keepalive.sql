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
--   ② pg_cron 每月任务 boh_mail_keepalive_monthly（2026-10-08 起由
--      scripts/mail-keepalive-ops.mjs --cron 注册，**不再在本文件里 schedule**）：
--      每月 8 号 01:00 UTC（北京 09:00）经 pg_net 调 mail-keepalive Edge Function。
--      原因：本文件最初版在 cron 命令里动态读 app.settings.supabase_url /
--      app.settings.service_role_key（论坛周报先例的数据库级配置），实测发现那对
--      GUC **从未被设置过**（pg_db_role_setting 里查无此配置，周报任务每次都在发
--      空 Bearer）——脚本改为直接从 Management API /secrets 读 service key 后烘焙
--      进 cron 命令文本，凭据来源单点化，轮换后重跑 --cron 即可。
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
