-- 修复 get_unread_notification_count RPC 函数
-- 添加 archived_at IS NULL 过滤条件，确保已归档通知不计入未读数量
-- 添加调用者身份验证，防止越权访问

create or replace function public.get_unread_notification_count(p_recipient_id uuid)
returns table (count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  -- 参数 NULL 检查
  if p_recipient_id is null then
    raise exception 'p_recipient_id 不能为空';
  end if;

  -- 获取当前用户ID
  caller_id := auth.uid();

  -- 验证用户已认证
  if caller_id is null then
    raise exception '用户未认证';
  end if;

  -- 验证只能查询自己的未读数量
  if caller_id != p_recipient_id then
    raise exception '只能查询自己的未读通知数量';
  end if;

  return query
  select count(1)::bigint
  from public.notifications n
  where n.recipient_id = p_recipient_id
    and n.status = 'unread'
    and n.archived_at is null
    and (
      n.sender_id is null
      or n.sender_id is distinct from p_recipient_id
      or n.type not in ('like', 'comment')
    );
end;
$$;

comment on function public.get_unread_notification_count(uuid) is
  '获取用户未读通知数量，排除已归档通知和自操作通知（自己点赞/评论自己的内容）';

-- 权限授予：仅允许已认证用户和服务角色调用
revoke all on function public.get_unread_notification_count(uuid) from public;
grant execute on function public.get_unread_notification_count(uuid) to authenticated;
grant execute on function public.get_unread_notification_count(uuid) to service_role;

-- 通知 PostgREST 重新加载 schema
notify pgrst, 'reload schema';