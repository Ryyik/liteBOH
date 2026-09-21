-- 2026092104_admin_issued_login_tokens.sql
-- 管理员代发「一次性登录 token」的审计表。
--
-- 用途：用户丢失邮箱/密码访问时，管理员当面核实身份后签发一次性登录凭证
--（Supabase generateLink(type:'recovery') 的 hashed_token），用户在 /reset-password
-- 粘贴 token 直接建立会话并自行设置新密码。密码全程只有用户本人知道。
--
-- 为什么必须有这张表：该功能本质是「管理员可冒充任意用户」。service_role 本就具备
-- 该能力，但功能化之后变成一键操作 —— 审计是这条功能的准入条件，不是附加项。
--
-- 权限设计（比先例 lottery_admin_audit_logs 更严）：
--   - 只读：RLS 策略 current_user_is_admin()（便于后台查看签发记录）
--   - 写入：**无任何客户端角色**。EF 以 service_role 写入（绕过 RLS 且持有表权限）。
--     注意 lottery_admin_audit_logs 给了 authenticated INSERT 权 —— 登录用户可伪造
--     审计记录，属已知洞型（2026092101 报告 §5），本表不重蹈。
--   -anon / authenticated 的全部表级权限显式 revoke（Supabase 默认授权会覆盖新表）。

create table if not exists public.admin_issued_login_tokens (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  target_username text,
  reason text not null,
  -- pending = 已登记待签发 / issued = 已成功签发 / failed = 签发失败
  status text not null default 'pending',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_issued_login_tokens is
  '管理员代发一次性登录 token 的审计表。仅 service_role 可写（EF），仅 admin 可读（RLS）。status: pending/issued/failed。';

create index if not exists admin_issued_login_tokens_target_idx
  on public.admin_issued_login_tokens (target_id);
create index if not exists admin_issued_login_tokens_actor_idx
  on public.admin_issued_login_tokens (actor_id);

alter table public.admin_issued_login_tokens enable row level security;

drop policy if exists admin_issued_login_tokens_admin_select on public.admin_issued_login_tokens;
create policy admin_issued_login_tokens_admin_select
  on public.admin_issued_login_tokens
  for select
  to authenticated
  using (current_user_is_admin());

-- 无 insert / update / delete 策略 → anon 与 authenticated 一律拒绝；
-- service_role 绕过 RLS 且经默认权限持有全权，EF 写入不受影响。

revoke all on table public.admin_issued_login_tokens from anon;
revoke all on table public.admin_issued_login_tokens from authenticated;
revoke all on table public.admin_issued_login_tokens from public;

notify pgrst, 'reload schema';

-- ================================================================
-- 回滚附录（审计表无调用方依赖，可整表回滚）
-- ================================================================
-- drop table if exists public.admin_issued_login_tokens;
-- notify pgrst, 'reload schema';
--
-- 验证 SQL（迁移后应满足）：
--   select has_table_privilege('anon','public.admin_issued_login_tokens','INSERT')          -> f
--   select has_table_privilege('authenticated','public.admin_issued_login_tokens','INSERT') -> f
--   select has_table_privilege('service_role','public.admin_issued_login_tokens','INSERT')  -> t
--   select count(*) from pg_policy where polrelid='public.admin_issued_login_tokens'::regclass -> 1（select-only）
