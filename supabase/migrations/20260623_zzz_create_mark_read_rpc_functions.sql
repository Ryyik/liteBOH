-- 创建通知标记已读的 RPC 函数
-- mark_single_as_read: 标记单条通知为已读
-- mark_all_as_read: 标记用户所有未归档未读通知为已读

-- 删除已存在的函数（如果返回类型不同，需要先删除）
drop function if exists public.mark_single_as_read(uuid);
drop function if exists public.mark_all_as_read(uuid);

-- 标记单条通知为已读
create or replace function public.mark_single_as_read(notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count int;
  caller_id uuid;
begin
  -- 获取当前用户ID
  caller_id := auth.uid();
  
  -- 验证通知属于当前用户
  update public.notifications
  set status = 'read'
  where id = notification_id
    and status = 'unread'
    and recipient_id = caller_id;

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

comment on function public.mark_single_as_read(uuid) is
  '标记单条通知为已读，返回是否成功更新';

-- 权限授予：仅允许已认证用户和服务角色调用
revoke all on function public.mark_single_as_read(uuid) from public;
grant execute on function public.mark_single_as_read(uuid) to authenticated;
grant execute on function public.mark_single_as_read(uuid) to service_role;

-- 标记用户所有未归档未读通知为已读
create or replace function public.mark_all_as_read(target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count bigint;
  caller_id uuid;
begin
  -- 获取当前用户ID
  caller_id := auth.uid();
  
  -- 验证target_user_id是当前用户
  if caller_id is distinct from target_user_id then
    raise exception '只能标记自己的通知为已读';
  end if;
  
  update public.notifications
  set status = 'read'
  where recipient_id = target_user_id
    and status = 'unread'
    and archived_at is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

comment on function public.mark_all_as_read(uuid) is
  '标记用户所有未归档未读通知为已读，返回更新的记录数';

-- 权限授予：仅允许已认证用户和服务角色调用
revoke all on function public.mark_all_as_read(uuid) from public;
grant execute on function public.mark_all_as_read(uuid) to authenticated;
grant execute on function public.mark_all_as_read(uuid) to service_role;

-- 通知 PostgREST 重新加载 schema
notify pgrst, 'reload schema';