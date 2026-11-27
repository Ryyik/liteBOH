-- XP 奖励台账只允许 SECURITY DEFINER 函数与 service_role 访问，客户端不可直读直写。

begin;

alter table public.forum_experience_awards enable row level security;

revoke all on table public.forum_experience_awards from public, anon, authenticated;
grant all on table public.forum_experience_awards to service_role;

notify pgrst, 'reload schema';

commit;
