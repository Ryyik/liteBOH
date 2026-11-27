-- XP 台账对客户端显式拒绝；SECURITY DEFINER 函数与 service_role 仍可写入。

begin;

drop policy if exists forum_experience_awards_no_client_access on public.forum_experience_awards;
create policy forum_experience_awards_no_client_access
  on public.forum_experience_awards
  for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';

commit;
