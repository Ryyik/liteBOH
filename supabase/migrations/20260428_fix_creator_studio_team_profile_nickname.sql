begin;

create or replace function public.build_creator_studio_team_payload(
  p_team_id uuid,
  p_my_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.creator_studio_teams%rowtype;
  v_my_role text;
  v_members jsonb := '[]'::jsonb;
  v_script_version integer := 0;
  v_script_updated_at timestamp with time zone := null;
begin
  if p_team_id is null or p_my_user_id is null then
    return null;
  end if;

  select *
    into v_team
    from public.creator_studio_teams
   where id = p_team_id;

  if not found then
    return null;
  end if;

  select role
    into v_my_role
    from public.creator_studio_team_members
   where team_id = p_team_id
     and user_id = p_my_user_id
   limit 1;

  if v_my_role is null then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'role', m.role,
          'joined_at', m.joined_at,
          'username', p.username,
          'nickname', p.username,
          'avatar_url', p.avatar_url
        )
        order by m.joined_at asc
      ),
      '[]'::jsonb
    )
  into v_members
  from public.creator_studio_team_members m
  left join public.profiles p on p.id = m.user_id
  where m.team_id = p_team_id;

  select version, updated_at
    into v_script_version, v_script_updated_at
    from public.creator_studio_team_scripts
   where team_id = p_team_id;

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'invite_code', v_team.invite_code,
    'owner_user_id', v_team.owner_user_id,
    'created_at', v_team.created_at,
    'updated_at', v_team.updated_at,
    'my_role', v_my_role,
    'latest_script_version', coalesce(v_script_version, 0),
    'latest_script_updated_at', v_script_updated_at,
    'members', v_members
  );
end;
$$;

revoke all on function public.build_creator_studio_team_payload(uuid, uuid) from public;

comment on function public.build_creator_studio_team_payload(uuid, uuid) is '构建创作团队载荷。profiles 表无 nickname 字段，因此使用 username 作为成员展示名。';

commit;
