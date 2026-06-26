-- 数据管理面板：管理员审核操作 RPC（绕过 RLS）
-- 目的：支持管理员在后台面板对被拒绝帖子/评论及待审私信执行通过、拒绝、删除。

begin;

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
  v_actor_role text := '';
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
  v_forum_status text := lower(trim(coalesce(p_action_status, '')));
  v_mail_status text := upper(trim(coalesce(p_action_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行管理员审核操作');
  end if;

  select coalesce(role, '')
    into v_actor_role
    from public.profiles
   where id = v_actor_id
   limit 1;

  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可执行审核操作');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_target_type = 'post' then
    if v_forum_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '帖子状态仅支持 approved / rejected');
    end if;

    update public.posts
       set status = v_forum_status,
           updated_at = now()
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  elsif v_target_type = 'comment' then
    if v_forum_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '评论状态仅支持 approved / rejected');
    end if;

    update public.comments
       set status = v_forum_status
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  elsif v_target_type = 'message' then
    if v_mail_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '私信审核状态仅支持 approved / rejected');
    end if;

    update public.messages
       set moderation_status = v_mail_status,
           moderation_reason = case
             when v_mail_status = 'approved' then null
             else v_reason
           end
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  return jsonb_build_object(
    'ok', v_rows > 0,
    'affected', v_rows,
    'target_type', v_target_type,
    'target_id', p_target_id
  );
end;
$$;

create or replace function public.admin_delete_moderation_target(
  p_target_type text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := '';
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行删除');
  end if;

  select coalesce(role, '')
    into v_actor_role
    from public.profiles
   where id = v_actor_id
   limit 1;

  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可删除审核记录');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_target_type = 'post' then
    delete from public.posts where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'comment' then
    delete from public.comments where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'message' then
    delete from public.messages where id = p_target_id;
    get diagnostics v_rows = row_count;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  return jsonb_build_object(
    'ok', v_rows > 0,
    'affected', v_rows,
    'target_type', v_target_type,
    'target_id', p_target_id
  );
end;
$$;

grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to authenticated;
grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to service_role;

grant execute on function public.admin_delete_moderation_target(text, uuid) to authenticated;
grant execute on function public.admin_delete_moderation_target(text, uuid) to service_role;

commit;
