begin;

-- 1. RPC for login email resolution
-- 绕过 RLS（SECURITY DEFINER），仅用于登录流程中 username → email 查找
create or replace function public.resolve_email_for_login(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select pr.email into v_email
  from profiles pr
  where lower(pr.username) = lower(p_username)
  limit 1;
  return v_email;
end;
$$;

grant execute on function public.resolve_email_for_login to anon, authenticated;

comment on function public.resolve_email_for_login is '安全地通过用户名查找邮箱（仅用于登录流程，绕过 RLS）';

-- 2. 阻止匿名用户直接读取 profiles.email
revoke select(email) on profiles from anon;

-- 3. archive.addresses：添加注释说明该表 RL S 锁定是预期的
comment on table archive.addresses is '历史地址归档表 — RLS 已启用但无策略（完全锁定），仅 service_role 可操作';

notify pgrst, 'reload schema';

commit;
