-- Creator Studio 团队管理：退出团队、转让组长、移除成员

begin;

create or replace function public.leave_my_creator_studio_team()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_role text;
  v_member_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select team_id, role
    into v_team_id, v_role
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_IN_TEAM');
  end if;

  select count(*)
    into v_member_count
    from public.creator_studio_team_members
   where team_id = v_team_id;

  if v_role = 'owner' and v_member_count > 1 then
    return jsonb_build_object('ok', false, 'message', 'OWNER_MUST_TRANSFER_FIRST');
  end if;

  if v_role = 'owner' then
    -- owner 且仅剩自己：删除整个团队（级联删除成员和共享脚本）
    delete from public.creator_studio_teams
     where id = v_team_id
       and owner_user_id = v_user_id;

    return jsonb_build_object(
      'ok', true,
      'message', 'TEAM_DELETED',
      'team', null
    );
  end if;

  delete from public.creator_studio_team_members
   where team_id = v_team_id
     and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'LEFT_TEAM',
    'team', null
  );
end;
$$;

create or replace function public.transfer_creator_studio_team_owner(
  p_new_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_my_role text;
  v_new_role text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if p_new_owner_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_NEW_OWNER');
  end if;

  select team_id, role
    into v_team_id, v_my_role
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_IN_TEAM');
  end if;

  if v_my_role <> 'owner' then
    return jsonb_build_object('ok', false, 'message', 'NOT_TEAM_OWNER');
  end if;

  if p_new_owner_user_id = v_user_id then
    return jsonb_build_object('ok', false, 'message', 'TARGET_IS_SELF');
  end if;

  select role
    into v_new_role
    from public.creator_studio_team_members
   where team_id = v_team_id
     and user_id = p_new_owner_user_id
   limit 1;

  if v_new_role is null then
    return jsonb_build_object('ok', false, 'message', 'TARGET_NOT_IN_TEAM');
  end if;

  update public.creator_studio_teams
     set owner_user_id = p_new_owner_user_id,
         updated_at = now()
   where id = v_team_id
     and owner_user_id = v_user_id;

  update public.creator_studio_team_members
     set role = 'member'
   where team_id = v_team_id
     and user_id = v_user_id;

  update public.creator_studio_team_members
     set role = 'owner'
   where team_id = v_team_id
     and user_id = p_new_owner_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'team', public.build_creator_studio_team_payload(v_team_id, v_user_id)
  );
end;
$$;

create or replace function public.remove_member_from_my_creator_studio_team(
  p_member_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_my_role text;
  v_target_role text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if p_member_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_MEMBER');
  end if;

  select team_id, role
    into v_team_id, v_my_role
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_IN_TEAM');
  end if;

  if v_my_role <> 'owner' then
    return jsonb_build_object('ok', false, 'message', 'NOT_TEAM_OWNER');
  end if;

  if p_member_user_id = v_user_id then
    return jsonb_build_object('ok', false, 'message', 'CANNOT_REMOVE_SELF');
  end if;

  select role
    into v_target_role
    from public.creator_studio_team_members
   where team_id = v_team_id
     and user_id = p_member_user_id
   limit 1;

  if v_target_role is null then
    return jsonb_build_object('ok', false, 'message', 'TARGET_NOT_IN_TEAM');
  end if;

  if v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'message', 'CANNOT_REMOVE_OWNER');
  end if;

  delete from public.creator_studio_team_members
   where team_id = v_team_id
     and user_id = p_member_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'team', public.build_creator_studio_team_payload(v_team_id, v_user_id)
  );
end;
$$;

revoke all on function public.leave_my_creator_studio_team() from public;
revoke all on function public.transfer_creator_studio_team_owner(uuid) from public;
revoke all on function public.remove_member_from_my_creator_studio_team(uuid) from public;

grant execute on function public.leave_my_creator_studio_team() to authenticated;
grant execute on function public.leave_my_creator_studio_team() to service_role;
grant execute on function public.transfer_creator_studio_team_owner(uuid) to authenticated;
grant execute on function public.transfer_creator_studio_team_owner(uuid) to service_role;
grant execute on function public.remove_member_from_my_creator_studio_team(uuid) to authenticated;
grant execute on function public.remove_member_from_my_creator_studio_team(uuid) to service_role;

commit;
