-- 数据管理中心权限收口：
-- 1) 后台内容写入仅允许 profiles.role = 'admin'
-- 2) 管理员删除用户走 security definer RPC，同时删除 public.profiles 与 auth.users
-- 3) 私信审核 RPC 保持小写 moderation_status，避免“点击通过但状态未生效”

begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to service_role;

alter table public.news enable row level security;
alter table public.activities enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.user_gifts enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.messages enable row level security;

drop policy if exists "只允许认证用户创建新闻" on public.news;
drop policy if exists "只允许认证用户更新新闻" on public.news;
drop policy if exists "只允许认证用户删除新闻" on public.news;
drop policy if exists news_admin_insert on public.news;
drop policy if exists news_admin_update on public.news;
drop policy if exists news_admin_delete on public.news;
create policy news_admin_insert on public.news
  for insert to authenticated
  with check (public.current_user_is_admin());
create policy news_admin_update on public.news
  for update to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy news_admin_delete on public.news
  for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists "只允许认证用户创建活动" on public.activities;
drop policy if exists "只允许认证用户更新活动" on public.activities;
drop policy if exists "只允许认证用户删除活动" on public.activities;
drop policy if exists activities_admin_insert on public.activities;
drop policy if exists activities_admin_update on public.activities;
drop policy if exists activities_admin_delete on public.activities;
create policy activities_admin_insert on public.activities
  for insert to authenticated
  with check (public.current_user_is_admin());
create policy activities_admin_update on public.activities
  for update to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy activities_admin_delete on public.activities
  for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists products_select_all on public.products;
drop policy if exists products_admin_insert on public.products;
drop policy if exists products_admin_update on public.products;
drop policy if exists products_admin_delete on public.products;
create policy products_select_all on public.products
  for select to public
  using (true);
create policy products_admin_insert on public.products
  for insert to authenticated
  with check (public.current_user_is_admin());
create policy products_admin_update on public.products
  for update to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy products_admin_delete on public.products
  for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists user_gifts_admin_insert on public.user_gifts;
drop policy if exists user_gifts_admin_update on public.user_gifts;
drop policy if exists user_gifts_admin_delete on public.user_gifts;
create policy user_gifts_admin_insert on public.user_gifts
  for insert to authenticated
  with check (public.current_user_is_admin());
create policy user_gifts_admin_update on public.user_gifts
  for update to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy user_gifts_admin_delete on public.user_gifts
  for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists posts_admin_manage on public.posts;
create policy posts_admin_manage on public.posts
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists comments_admin_manage on public.comments;
create policy comments_admin_manage on public.comments
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists messages_admin_manage on public.messages;
create policy messages_admin_manage on public.messages
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create or replace function public.admin_delete_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile_rows integer := 0;
  v_auth_rows integer := 0;
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法删除用户');
  end if;

  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可删除用户');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_USER_ID', 'message', '用户 ID 不能为空');
  end if;

  if p_user_id = v_actor_id then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_DELETE_SELF', 'message', '不能在数据管理中心删除当前登录的管理员账号');
  end if;

  delete from public.profiles
   where id = p_user_id;
  get diagnostics v_profile_rows = row_count;

  delete from auth.users
   where id = p_user_id;
  get diagnostics v_auth_rows = row_count;

  if v_profile_rows = 0 and v_auth_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', '没有找到该用户，可能已被删除');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'USER_DELETED',
    'message', '用户已删除',
    'user_id', p_user_id,
    'profile_deleted', v_profile_rows > 0,
    'auth_deleted', v_auth_rows > 0
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'ADMIN_DELETE_USER_FAILED'),
      'message', coalesce(sqlerrm, '删除用户失败')
    );
end;
$$;

revoke all on function public.admin_delete_user_account(uuid) from public;
grant execute on function public.admin_delete_user_account(uuid) to authenticated;
grant execute on function public.admin_delete_user_account(uuid) to service_role;

create or replace function public.admin_apply_moderation_action(
  p_target_type text,
  p_target_id uuid,
  p_action_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
  v_status text := lower(trim(coalesce(p_action_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行管理员审核操作');
  end if;

  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可执行审核操作');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_status not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '审核状态仅支持 approved / rejected');
  end if;

  if v_target_type = 'post' then
    update public.posts
       set status = v_status,
           updated_at = now()
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'comment' then
    update public.comments
       set status = v_status
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'message' then
    update public.messages
       set moderation_status = v_status,
           moderation_reason = case when v_status = 'approved' then null else v_reason end
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  if v_rows <= 0 then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND', 'message', '没有找到要审核的记录，可能已被处理或删除');
  end if;

  return jsonb_build_object('ok', true, 'affected', v_rows, 'target_type', v_target_type, 'target_id', p_target_id);
exception
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ADMIN_MODERATION_FAILED'), 'message', coalesce(sqlerrm, '审核操作失败'));
end;
$$;

grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to authenticated;
grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to service_role;

grant select on table public.news, public.activities, public.products, public.profiles to anon, authenticated;
grant select, insert, update, delete on table public.news, public.activities, public.products, public.profiles, public.user_gifts, public.posts, public.comments, public.messages to authenticated;

commit;
