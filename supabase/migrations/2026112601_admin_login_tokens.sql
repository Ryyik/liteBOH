-- 一次性登录口令（plans/050 §11，2026-11-26）
--
-- 后台「用户详情 → 发放一次性令牌」生成 6 位数字口令，落库只存哈希；
-- 登录页用它兑换一次性会话（兑换端下一轮接入，见 plans/050 §11）。
--
-- 设计约束：
-- · 只许管理员签发（函数体自己校验 current_user_is_admin()，不依赖授权）；
-- · 明文只在签发时返回一次，库里只有 sha256(code || user_id)；
-- · 默认 15 分钟有效，最长 120 分钟；一次性（redeem 时置 used_at）。
-- · 表本身不给 anon / authenticated 任何权限，只有 security definer 函数能读写。

create table if not exists public.login_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

comment on table public.login_tokens is
  '一次性登录口令台账：仅存哈希与有效期，明文只在 admin_issue_login_token 的返回值里出现一次';

create index if not exists login_tokens_user_active_idx
  on public.login_tokens (user_id, expires_at desc)
  where used_at is null;

alter table public.login_tokens enable row level security;

revoke all on public.login_tokens from anon, authenticated, public;

create or replace function public.admin_issue_login_token(
  p_user_id uuid,
  p_ttl_minutes integer default 15
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_ttl integer := greatest(1, least(coalesce(p_ttl_minutes, 15), 120));
  v_expires timestamptz := now() + make_interval(mins => v_ttl);
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可签发一次性登录口令' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception '目标用户不存在' using errcode = 'P0002';
  end if;

  -- 6 位数字（允许前导 0）；同一用户可能有多个未用口令，兑换时取最新的那条
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.login_tokens (user_id, code_hash, expires_at, created_by)
  values (
    p_user_id,
    encode(digest(v_code || ':' || p_user_id::text, 'sha256'), 'hex'),
    v_expires,
    auth.uid()
  );

  return query select v_code, v_expires;
end;
$$;

revoke all on function public.admin_issue_login_token(uuid, integer) from anon, authenticated, public;
grant execute on function public.admin_issue_login_token(uuid, integer) to authenticated;

notify pgrst, 'reload schema';