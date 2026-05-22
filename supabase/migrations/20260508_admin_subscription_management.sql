-- 管理员数据管理中心：订阅管理权限
-- 允许 profiles.role = 'admin' 的账号查看、创建、修改和删除用户订阅记录。

begin;

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_admin_select on public.user_subscriptions;
drop policy if exists user_subscriptions_admin_insert on public.user_subscriptions;
drop policy if exists user_subscriptions_admin_update on public.user_subscriptions;
drop policy if exists user_subscriptions_admin_delete on public.user_subscriptions;

create policy user_subscriptions_admin_select
  on public.user_subscriptions
  for select
  to authenticated
  using (public.current_user_is_admin());

create policy user_subscriptions_admin_insert
  on public.user_subscriptions
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy user_subscriptions_admin_update
  on public.user_subscriptions
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy user_subscriptions_admin_delete
  on public.user_subscriptions
  for delete
  to authenticated
  using (public.current_user_is_admin());

grant select, insert, update, delete on table public.user_subscriptions to authenticated;

commit;
