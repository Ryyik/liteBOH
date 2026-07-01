-- 为 _rate_limits 表启用 RLS（安全约束：仅 service_role 可访问）
-- 该表由 Edge Function（service_role）通过 check_rate_limit RPC 访问
-- RPC 为 security definer，绕过 RLS，因此无需额外 policy

alter table public._rate_limits enable row level security;

-- 确保无默认 policy 残留（防御性清理）
drop policy if exists "allow all on _rate_limits" on public._rate_limits;
