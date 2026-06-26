-- Creator Studio 团队协作：加入团队小组 + 共享脚本协同编辑

begin;

create table if not exists public.creator_studio_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我的创作团队',
  invite_code text not null unique,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint creator_studio_teams_name_len check (char_length(name) between 1 and 60),
  constraint creator_studio_teams_invite_code_fmt check (invite_code ~ '^[A-Z0-9]{6,12}$')
);

create index if not exists idx_creator_studio_teams_owner
  on public.creator_studio_teams (owner_user_id);

create table if not exists public.creator_studio_team_members (
  team_id uuid not null references public.creator_studio_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamp with time zone not null default now(),
  primary key (team_id, user_id)
);

create unique index if not exists uq_creator_studio_team_members_user
  on public.creator_studio_team_members (user_id);

create index if not exists idx_creator_studio_team_members_team
  on public.creator_studio_team_members (team_id);

create table if not exists public.creator_studio_team_scripts (
  team_id uuid primary key references public.creator_studio_teams (id) on delete cascade,
  script_payload jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  constraint creator_studio_team_scripts_payload_object check (jsonb_typeof(script_payload) = 'object'),
  constraint creator_studio_team_scripts_payload_size check (char_length(script_payload::text) <= 150000)
);

create or replace function public.touch_creator_studio_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creator_studio_teams_updated_at on public.creator_studio_teams;
create trigger trg_creator_studio_teams_updated_at
before update on public.creator_studio_teams
for each row
execute function public.touch_creator_studio_updated_at();

drop trigger if exists trg_creator_studio_team_scripts_updated_at on public.creator_studio_team_scripts;
create trigger trg_creator_studio_team_scripts_updated_at
before update on public.creator_studio_team_scripts
for each row
execute function public.touch_creator_studio_updated_at();

alter table public.creator_studio_teams enable row level security;
alter table public.creator_studio_team_members enable row level security;
alter table public.creator_studio_team_scripts enable row level security;

drop policy if exists creator_studio_teams_select_member on public.creator_studio_teams;
create policy creator_studio_teams_select_member
  on public.creator_studio_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_studio_team_members m
      where m.team_id = creator_studio_teams.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists creator_studio_team_members_select_same_team on public.creator_studio_team_members;
create policy creator_studio_team_members_select_same_team
  on public.creator_studio_team_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_studio_team_members me
      where me.team_id = creator_studio_team_members.team_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists creator_studio_team_scripts_select_member on public.creator_studio_team_scripts;
create policy creator_studio_team_scripts_select_member
  on public.creator_studio_team_scripts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_studio_team_members m
      where m.team_id = creator_studio_team_scripts.team_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists creator_studio_team_scripts_insert_member on public.creator_studio_team_scripts;
create policy creator_studio_team_scripts_insert_member
  on public.creator_studio_team_scripts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.creator_studio_team_members m
      where m.team_id = creator_studio_team_scripts.team_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists creator_studio_team_scripts_update_member on public.creator_studio_team_scripts;
create policy creator_studio_team_scripts_update_member
  on public.creator_studio_team_scripts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.creator_studio_team_members m
      where m.team_id = creator_studio_team_scripts.team_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.creator_studio_team_members m
      where m.team_id = creator_studio_team_scripts.team_id
        and m.user_id = auth.uid()
    )
  );

grant select on table public.creator_studio_teams to authenticated;
grant select on table public.creator_studio_team_members to authenticated;
grant select, insert, update on table public.creator_studio_team_scripts to authenticated;
grant all on table public.creator_studio_teams to service_role;
grant all on table public.creator_studio_team_members to service_role;
grant all on table public.creator_studio_team_scripts to service_role;

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

create or replace function public.get_my_creator_studio_team()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_team_payload jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select team_id
    into v_team_id
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object(
      'ok', true,
      'message', 'NOT_IN_TEAM',
      'team', null
    );
  end if;

  v_team_payload := public.build_creator_studio_team_payload(v_team_id, v_user_id);

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'team', v_team_payload
  );
end;
$$;

create or replace function public.create_my_creator_studio_team(
  p_team_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_team_id uuid;
  v_team_name text;
  v_invite_code text;
  v_team public.creator_studio_teams%rowtype;
  v_try_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select team_id
    into v_existing_team_id
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_existing_team_id is not null then
    return jsonb_build_object('ok', false, 'message', 'ALREADY_IN_TEAM');
  end if;

  v_team_name := nullif(trim(coalesce(p_team_name, '')), '');
  if v_team_name is null then
    v_team_name := '我的创作团队';
  end if;

  loop
    v_invite_code := upper(substr(md5(v_user_id::text || clock_timestamp()::text || random()::text), 1, 8));
    exit when not exists (
      select 1
      from public.creator_studio_teams
      where invite_code = v_invite_code
    );

    v_try_count := v_try_count + 1;
    if v_try_count > 12 then
      return jsonb_build_object('ok', false, 'message', 'INVITE_CODE_GENERATION_FAILED');
    end if;
  end loop;

  insert into public.creator_studio_teams (
    name,
    invite_code,
    owner_user_id
  )
  values (
    v_team_name,
    v_invite_code,
    v_user_id
  )
  returning * into v_team;

  insert into public.creator_studio_team_members (
    team_id,
    user_id,
    role
  )
  values (
    v_team.id,
    v_user_id,
    'owner'
  );

  insert into public.creator_studio_team_scripts (
    team_id,
    script_payload,
    version,
    updated_by
  )
  values (
    v_team.id,
    '{}'::jsonb,
    1,
    v_user_id
  )
  on conflict (team_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'team', public.build_creator_studio_team_payload(v_team.id, v_user_id)
  );
end;
$$;

create or replace function public.join_creator_studio_team_by_code(
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite_code text;
  v_target_team public.creator_studio_teams%rowtype;
  v_existing_team_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  v_invite_code := upper(regexp_replace(trim(coalesce(p_invite_code, '')), '[^A-Z0-9]', '', 'g'));
  if char_length(v_invite_code) < 6 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INVITE_CODE');
  end if;

  select *
    into v_target_team
    from public.creator_studio_teams
   where invite_code = v_invite_code
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'TEAM_NOT_FOUND');
  end if;

  select team_id
    into v_existing_team_id
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_existing_team_id is not null and v_existing_team_id <> v_target_team.id then
    return jsonb_build_object('ok', false, 'message', 'ALREADY_IN_OTHER_TEAM');
  end if;

  if v_existing_team_id is null then
    insert into public.creator_studio_team_members (
      team_id,
      user_id,
      role
    )
    values (
      v_target_team.id,
      v_user_id,
      'member'
    )
    on conflict (team_id, user_id) do nothing;
  end if;

  insert into public.creator_studio_team_scripts (
    team_id,
    script_payload,
    version,
    updated_by
  )
  values (
    v_target_team.id,
    '{}'::jsonb,
    1,
    v_user_id
  )
  on conflict (team_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'team', public.build_creator_studio_team_payload(v_target_team.id, v_user_id)
  );
end;
$$;

create or replace function public.get_my_creator_studio_team_script()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_script public.creator_studio_team_scripts%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select team_id
    into v_team_id
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_IN_TEAM');
  end if;

  select *
    into v_script
    from public.creator_studio_team_scripts
   where team_id = v_team_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'message', 'NOT_FOUND',
      'script', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'script', jsonb_build_object(
      'team_id', v_script.team_id,
      'payload', v_script.script_payload,
      'version', v_script.version,
      'updated_by', v_script.updated_by,
      'updated_at', v_script.updated_at
    )
  );
end;
$$;

create or replace function public.save_my_creator_studio_team_script(
  p_script jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_payload jsonb;
  v_saved public.creator_studio_team_scripts%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select team_id
    into v_team_id
    from public.creator_studio_team_members
   where user_id = v_user_id
   limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_IN_TEAM');
  end if;

  v_payload := coalesce(p_script, '{}'::jsonb);

  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_SCRIPT_OBJECT');
  end if;

  if char_length(v_payload::text) > 150000 then
    return jsonb_build_object('ok', false, 'message', 'SCRIPT_TOO_LARGE');
  end if;

  insert into public.creator_studio_team_scripts (
    team_id,
    script_payload,
    version,
    updated_by,
    updated_at
  )
  values (
    v_team_id,
    v_payload,
    1,
    v_user_id,
    now()
  )
  on conflict (team_id)
  do update
    set script_payload = excluded.script_payload,
        version = public.creator_studio_team_scripts.version + 1,
        updated_by = v_user_id,
        updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'script', jsonb_build_object(
      'team_id', v_saved.team_id,
      'payload', v_saved.script_payload,
      'version', v_saved.version,
      'updated_by', v_saved.updated_by,
      'updated_at', v_saved.updated_at
    )
  );
end;
$$;

revoke all on function public.build_creator_studio_team_payload(uuid, uuid) from public;
revoke all on function public.get_my_creator_studio_team() from public;
revoke all on function public.create_my_creator_studio_team(text) from public;
revoke all on function public.join_creator_studio_team_by_code(text) from public;
revoke all on function public.get_my_creator_studio_team_script() from public;
revoke all on function public.save_my_creator_studio_team_script(jsonb) from public;

grant execute on function public.get_my_creator_studio_team() to authenticated;
grant execute on function public.get_my_creator_studio_team() to service_role;
grant execute on function public.create_my_creator_studio_team(text) to authenticated;
grant execute on function public.create_my_creator_studio_team(text) to service_role;
grant execute on function public.join_creator_studio_team_by_code(text) to authenticated;
grant execute on function public.join_creator_studio_team_by_code(text) to service_role;
grant execute on function public.get_my_creator_studio_team_script() to authenticated;
grant execute on function public.get_my_creator_studio_team_script() to service_role;
grant execute on function public.save_my_creator_studio_team_script(jsonb) to authenticated;
grant execute on function public.save_my_creator_studio_team_script(jsonb) to service_role;

commit;
