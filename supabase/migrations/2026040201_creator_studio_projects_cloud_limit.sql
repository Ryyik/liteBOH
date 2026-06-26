-- Creator Studio 云端项目列表（最多 2 条）
-- 目标：
-- 1) 支持“项目创建即接入云端”；
-- 2) 每位用户云端项目最多存储 2 条（数据库层硬限制）；
-- 3) 提供列表/保存/删除 RPC 供前端调用。

begin;

create table if not exists public.creator_studio_projects (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  title text not null default '未命名项目',
  mode text not null default 'video' check (mode in ('video', 'mc')),
  template text not null default 'blank',
  duration integer not null default 180 check (duration between 15 and 1800),
  storage_type text not null default 'cloud' check (storage_type in ('cloud', 'local')),
  resolution text not null default '1080p',
  frame_rate integer not null default 30 check (frame_rate between 1 and 120),
  video_platform text not null default 'bilibili',
  mc_version text not null default '1.20.4',
  mc_tick_rate integer not null default 20 check (mc_tick_rate between 1 and 40),
  mc_runtime text not null default 'datapack',
  scene_count integer not null default 0 check (scene_count >= 0),
  node_count integer not null default 0 check (node_count >= 0),
  workspace jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint creator_studio_projects_pk primary key (user_id, project_id),
  constraint creator_studio_projects_project_id_len check (char_length(project_id) between 1 and 80),
  constraint creator_studio_projects_workspace_object check (jsonb_typeof(workspace) = 'object'),
  constraint creator_studio_projects_workspace_size check (char_length(workspace::text) <= 180000)
);

create index if not exists idx_creator_studio_projects_user_updated
  on public.creator_studio_projects (user_id, updated_at desc);

create or replace function public.touch_creator_studio_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creator_studio_projects_updated_at on public.creator_studio_projects;
create trigger trg_creator_studio_projects_updated_at
before update on public.creator_studio_projects
for each row
execute function public.touch_creator_studio_projects_updated_at();

create or replace function public.enforce_creator_studio_projects_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  -- 同一项目 ID 的冲突更新不计入新增数量
  if exists (
    select 1
      from public.creator_studio_projects p
     where p.user_id = new.user_id
       and p.project_id = new.project_id
  ) then
    return new;
  end if;

  select count(*)
    into v_count
    from public.creator_studio_projects p
   where p.user_id = new.user_id;

  if v_count >= 2 then
    raise exception 'CLOUD_PROJECT_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_creator_studio_projects_limit on public.creator_studio_projects;
create trigger trg_creator_studio_projects_limit
before insert on public.creator_studio_projects
for each row
execute function public.enforce_creator_studio_projects_limit();

alter table public.creator_studio_projects enable row level security;

drop policy if exists creator_studio_projects_select_own on public.creator_studio_projects;
create policy creator_studio_projects_select_own
  on public.creator_studio_projects
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists creator_studio_projects_insert_own on public.creator_studio_projects;
create policy creator_studio_projects_insert_own
  on public.creator_studio_projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists creator_studio_projects_update_own on public.creator_studio_projects;
create policy creator_studio_projects_update_own
  on public.creator_studio_projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists creator_studio_projects_delete_own on public.creator_studio_projects;
create policy creator_studio_projects_delete_own
  on public.creator_studio_projects
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.creator_studio_projects to authenticated;
grant all on table public.creator_studio_projects to service_role;

create or replace function public.get_my_creator_studio_projects()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_projects jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.project_id,
        'title', p.title,
        'mode', p.mode,
        'template', p.template,
        'duration', p.duration,
        'storage_type', p.storage_type,
        'resolution', p.resolution,
        'frame_rate', p.frame_rate,
        'video_platform', p.video_platform,
        'mc_version', p.mc_version,
        'mc_tick_rate', p.mc_tick_rate,
        'mc_runtime', p.mc_runtime,
        'scene_count', p.scene_count,
        'node_count', p.node_count,
        'workspace', p.workspace,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      order by p.updated_at desc
    ),
    '[]'::jsonb
  )
    into v_projects
    from public.creator_studio_projects p
   where p.user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'projects', v_projects
  );
end;
$$;

create or replace function public.upsert_my_creator_studio_project(
  p_project jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id text;
  v_title text;
  v_mode text;
  v_template text;
  v_duration integer;
  v_storage_type text;
  v_resolution text;
  v_frame_rate integer;
  v_video_platform text;
  v_mc_version text;
  v_mc_tick_rate integer;
  v_mc_runtime text;
  v_scene_count integer;
  v_node_count integer;
  v_workspace jsonb;
  v_exists boolean := false;
  v_cloud_count integer := 0;
  v_saved public.creator_studio_projects%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_PROJECT_PAYLOAD'
    );
  end if;

  v_project_id := left(nullif(trim(coalesce(p_project ->> 'id', p_project ->> 'project_id', '')), ''), 80);
  if v_project_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_PROJECT_ID'
    );
  end if;

  select exists (
    select 1
      from public.creator_studio_projects p
     where p.user_id = v_user_id
       and p.project_id = v_project_id
  ) into v_exists;

  if not v_exists then
    select count(*)
      into v_cloud_count
      from public.creator_studio_projects p
     where p.user_id = v_user_id;

    if v_cloud_count >= 2 then
      return jsonb_build_object(
        'ok', false,
        'message', 'CLOUD_PROJECT_LIMIT_REACHED'
      );
    end if;
  end if;

  v_title := left(coalesce(nullif(trim(p_project ->> 'title'), ''), '未命名项目'), 80);
  v_mode := lower(trim(coalesce(p_project ->> 'mode', 'video')));
  if v_mode not in ('video', 'mc') then
    v_mode := 'video';
  end if;

  v_template := left(coalesce(nullif(trim(p_project ->> 'template'), ''), 'blank'), 40);
  v_duration := coalesce(
    case when coalesce(p_project ->> 'duration', '') ~ '^-?\d+$' then (p_project ->> 'duration')::integer else null end,
    180
  );
  v_duration := least(1800, greatest(15, v_duration));

  -- 云端表只存云端项目，统一收敛为 cloud
  v_storage_type := 'cloud';

  v_resolution := lower(trim(coalesce(p_project ->> 'resolution', '1080p')));
  if v_resolution not in ('1080p', '2k', '4k') then
    v_resolution := '1080p';
  end if;

  v_frame_rate := coalesce(
    case when coalesce(p_project ->> 'frameRate', p_project ->> 'frame_rate', '') ~ '^-?\d+$'
      then coalesce(p_project ->> 'frameRate', p_project ->> 'frame_rate')::integer
      else null
    end,
    30
  );
  v_frame_rate := least(120, greatest(1, v_frame_rate));

  v_video_platform := lower(trim(coalesce(p_project ->> 'videoPlatform', p_project ->> 'video_platform', 'bilibili')));
  if v_video_platform not in ('bilibili', 'douyin', 'xiaohongshu', 'youtube') then
    v_video_platform := 'bilibili';
  end if;

  v_mc_version := left(coalesce(nullif(trim(coalesce(p_project ->> 'mcVersion', p_project ->> 'mc_version', '')), ''), '1.20.4'), 20);

  v_mc_tick_rate := coalesce(
    case when coalesce(p_project ->> 'mcTickRate', p_project ->> 'mc_tick_rate', '') ~ '^-?\d+$'
      then coalesce(p_project ->> 'mcTickRate', p_project ->> 'mc_tick_rate')::integer
      else null
    end,
    20
  );
  v_mc_tick_rate := least(40, greatest(1, v_mc_tick_rate));

  v_mc_runtime := lower(trim(coalesce(p_project ->> 'mcRuntime', p_project ->> 'mc_runtime', 'datapack')));
  if v_mc_runtime not in ('datapack', 'command_block') then
    v_mc_runtime := 'datapack';
  end if;

  v_scene_count := coalesce(
    case when coalesce(p_project ->> 'sceneCount', p_project ->> 'scene_count', '') ~ '^-?\d+$'
      then coalesce(p_project ->> 'sceneCount', p_project ->> 'scene_count')::integer
      else null
    end,
    0
  );
  v_scene_count := greatest(0, v_scene_count);

  v_node_count := coalesce(
    case when coalesce(p_project ->> 'nodeCount', p_project ->> 'node_count', '') ~ '^-?\d+$'
      then coalesce(p_project ->> 'nodeCount', p_project ->> 'node_count')::integer
      else null
    end,
    0
  );
  v_node_count := greatest(0, v_node_count);

  v_workspace := coalesce(p_project -> 'workspace', '{}'::jsonb);
  if jsonb_typeof(v_workspace) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_WORKSPACE'
    );
  end if;

  if char_length(v_workspace::text) > 180000 then
    return jsonb_build_object(
      'ok', false,
      'message', 'WORKSPACE_TOO_LARGE'
    );
  end if;

  insert into public.creator_studio_projects (
    user_id,
    project_id,
    title,
    mode,
    template,
    duration,
    storage_type,
    resolution,
    frame_rate,
    video_platform,
    mc_version,
    mc_tick_rate,
    mc_runtime,
    scene_count,
    node_count,
    workspace
  )
  values (
    v_user_id,
    v_project_id,
    v_title,
    v_mode,
    v_template,
    v_duration,
    v_storage_type,
    v_resolution,
    v_frame_rate,
    v_video_platform,
    v_mc_version,
    v_mc_tick_rate,
    v_mc_runtime,
    v_scene_count,
    v_node_count,
    v_workspace
  )
  on conflict (user_id, project_id)
  do update
    set title = excluded.title,
        mode = excluded.mode,
        template = excluded.template,
        duration = excluded.duration,
        storage_type = excluded.storage_type,
        resolution = excluded.resolution,
        frame_rate = excluded.frame_rate,
        video_platform = excluded.video_platform,
        mc_version = excluded.mc_version,
        mc_tick_rate = excluded.mc_tick_rate,
        mc_runtime = excluded.mc_runtime,
        scene_count = excluded.scene_count,
        node_count = excluded.node_count,
        workspace = excluded.workspace,
        updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'ok', true,
    'message', case when v_exists then 'UPDATED' else 'CREATED' end,
    'project', jsonb_build_object(
      'id', v_saved.project_id,
      'title', v_saved.title,
      'mode', v_saved.mode,
      'template', v_saved.template,
      'duration', v_saved.duration,
      'storage_type', v_saved.storage_type,
      'resolution', v_saved.resolution,
      'frame_rate', v_saved.frame_rate,
      'video_platform', v_saved.video_platform,
      'mc_version', v_saved.mc_version,
      'mc_tick_rate', v_saved.mc_tick_rate,
      'mc_runtime', v_saved.mc_runtime,
      'scene_count', v_saved.scene_count,
      'node_count', v_saved.node_count,
      'workspace', v_saved.workspace,
      'created_at', v_saved.created_at,
      'updated_at', v_saved.updated_at
    )
  );
end;
$$;

create or replace function public.delete_my_creator_studio_project(
  p_project_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id text := left(nullif(trim(coalesce(p_project_id, '')), ''), 80);
  v_rows integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  if v_project_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_PROJECT_ID'
    );
  end if;

  delete from public.creator_studio_projects
   where user_id = v_user_id
     and project_id = v_project_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object(
      'ok', true,
      'message', 'NOT_FOUND'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK'
  );
end;
$$;

revoke all on function public.get_my_creator_studio_projects() from public;
revoke all on function public.upsert_my_creator_studio_project(jsonb) from public;
revoke all on function public.delete_my_creator_studio_project(text) from public;

grant execute on function public.get_my_creator_studio_projects() to authenticated;
grant execute on function public.get_my_creator_studio_projects() to service_role;
grant execute on function public.upsert_my_creator_studio_project(jsonb) to authenticated;
grant execute on function public.upsert_my_creator_studio_project(jsonb) to service_role;
grant execute on function public.delete_my_creator_studio_project(text) to authenticated;
grant execute on function public.delete_my_creator_studio_project(text) to service_role;

commit;
