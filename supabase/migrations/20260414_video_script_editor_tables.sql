-- 专业级视频拍摄脚本编辑器数据库迁移
-- 包含：项目表、场景表、镜头表、角色表、RLS策略、项目数量限制（每个用户最多3个项目）
-- 参考：creator_studio_projects 表的设计风格
-- 提供：旧表安全删除方案（注释中）

begin;

-- ============================================
-- 1. 视频脚本项目表（参考 creator_studio_projects 设计）
-- ============================================
create table if not exists public.video_script_projects (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  title text not null default '未命名脚本项目',
  description text,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed')),
  storage_type text not null default 'cloud' check (storage_type in ('cloud', 'local')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint video_script_projects_pk primary key (user_id, project_id),
  constraint video_script_projects_project_id_len check (char_length(project_id) between 1 and 80),
  constraint video_script_projects_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint video_script_projects_metadata_size check (char_length(metadata::text) <= 180000)
);

create index if not exists idx_video_script_projects_user_updated
  on public.video_script_projects (user_id, updated_at desc);

-- ============================================
-- 2. 场景表
-- ============================================
create table if not exists public.video_script_scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  scene_number text not null,
  order_index integer not null default 0,
  location text,
  time_of_day text,
  interior_exterior text check (interior_exterior in ('INT', 'EXT', 'INT/EXT')),
  description text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint video_script_scenes_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint video_script_scenes_fk_project foreign key (user_id, project_id) 
    references public.video_script_projects (user_id, project_id) on delete cascade
);

create index if not exists idx_video_script_scenes_project
  on public.video_script_scenes (user_id, project_id);

create index if not exists idx_video_script_scenes_order
  on public.video_script_scenes (user_id, project_id, order_index);

-- ============================================
-- 3. 镜头表
-- ============================================
create table if not exists public.video_script_shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  scene_id uuid not null references public.video_script_scenes (id) on delete cascade,
  shot_number text not null,
  order_index integer not null default 0,
  shot_type text,
  angle text,
  movement text,
  duration integer,
  description text,
  action text,
  dialogue text,
  camera_notes text,
  lighting_notes text,
  sound_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint video_script_shots_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint video_script_shots_fk_project foreign key (user_id, project_id) 
    references public.video_script_projects (user_id, project_id) on delete cascade
);

create index if not exists idx_video_script_shots_project
  on public.video_script_shots (user_id, project_id);

create index if not exists idx_video_script_shots_scene
  on public.video_script_shots (scene_id);

create index if not exists idx_video_script_shots_order
  on public.video_script_shots (scene_id, order_index);

-- ============================================
-- 4. 角色表
-- ============================================
create table if not exists public.video_script_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  name text not null,
  description text,
  color text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint video_script_characters_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint video_script_characters_fk_project foreign key (user_id, project_id) 
    references public.video_script_projects (user_id, project_id) on delete cascade
);

create index if not exists idx_video_script_characters_project
  on public.video_script_characters (user_id, project_id);

-- ============================================
-- 5. 自动更新时间戳函数
-- ============================================
create or replace function public.touch_video_script_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 项目表更新触发器
drop trigger if exists trg_video_script_projects_updated_at on public.video_script_projects;
create trigger trg_video_script_projects_updated_at
before update on public.video_script_projects
for each row
execute function public.touch_video_script_updated_at();

-- 场景表更新触发器
drop trigger if exists trg_video_script_scenes_updated_at on public.video_script_scenes;
create trigger trg_video_script_scenes_updated_at
before update on public.video_script_scenes
for each row
execute function public.touch_video_script_updated_at();

-- 镜头表更新触发器
drop trigger if exists trg_video_script_shots_updated_at on public.video_script_shots;
create trigger trg_video_script_shots_updated_at
before update on public.video_script_shots
for each row
execute function public.touch_video_script_updated_at();

-- 角色表更新触发器
drop trigger if exists trg_video_script_characters_updated_at on public.video_script_characters;
create trigger trg_video_script_characters_updated_at
before update on public.video_script_characters
for each row
execute function public.touch_video_script_updated_at();

-- ============================================
-- 6. 项目数量限制函数（每个用户最多3个项目）- 参考 creator_studio_projects 实现
-- ============================================
create or replace function public.enforce_video_script_projects_limit()
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
      from public.video_script_projects p
     where p.user_id = new.user_id
       and p.project_id = new.project_id
  ) then
    return new;
  end if;

  select count(*)
    into v_count
    from public.video_script_projects p
   where p.user_id = new.user_id;

  if v_count >= 3 then
    raise exception 'VIDEO_SCRIPT_PROJECT_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- 项目数量限制触发器
drop trigger if exists trg_video_script_projects_limit on public.video_script_projects;
create trigger trg_video_script_projects_limit
before insert on public.video_script_projects
for each row
execute function public.enforce_video_script_projects_limit();

-- ============================================
-- 7. RLS 行级安全策略
-- ============================================
alter table public.video_script_projects enable row level security;
alter table public.video_script_scenes enable row level security;
alter table public.video_script_shots enable row level security;
alter table public.video_script_characters enable row level security;

-- 项目表策略
drop policy if exists video_script_projects_select_own on public.video_script_projects;
create policy video_script_projects_select_own
  on public.video_script_projects
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists video_script_projects_insert_own on public.video_script_projects;
create policy video_script_projects_insert_own
  on public.video_script_projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists video_script_projects_update_own on public.video_script_projects;
create policy video_script_projects_update_own
  on public.video_script_projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists video_script_projects_delete_own on public.video_script_projects;
create policy video_script_projects_delete_own
  on public.video_script_projects
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 场景表策略
drop policy if exists video_script_scenes_select_own on public.video_script_scenes;
create policy video_script_scenes_select_own
  on public.video_script_scenes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists video_script_scenes_insert_own on public.video_script_scenes;
create policy video_script_scenes_insert_own
  on public.video_script_scenes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists video_script_scenes_update_own on public.video_script_scenes;
create policy video_script_scenes_update_own
  on public.video_script_scenes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists video_script_scenes_delete_own on public.video_script_scenes;
create policy video_script_scenes_delete_own
  on public.video_script_scenes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 镜头表策略
drop policy if exists video_script_shots_select_own on public.video_script_shots;
create policy video_script_shots_select_own
  on public.video_script_shots
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists video_script_shots_insert_own on public.video_script_shots;
create policy video_script_shots_insert_own
  on public.video_script_shots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists video_script_shots_update_own on public.video_script_shots;
create policy video_script_shots_update_own
  on public.video_script_shots
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists video_script_shots_delete_own on public.video_script_shots;
create policy video_script_shots_delete_own
  on public.video_script_shots
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 角色表策略
drop policy if exists video_script_characters_select_own on public.video_script_characters;
create policy video_script_characters_select_own
  on public.video_script_characters
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists video_script_characters_insert_own on public.video_script_characters;
create policy video_script_characters_insert_own
  on public.video_script_characters
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists video_script_characters_update_own on public.video_script_characters;
create policy video_script_characters_update_own
  on public.video_script_characters
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists video_script_characters_delete_own on public.video_script_characters;
create policy video_script_characters_delete_own
  on public.video_script_characters
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================
-- 8. 权限授予
-- ============================================
grant select, insert, update, delete on table public.video_script_projects to authenticated;
grant select, insert, update, delete on table public.video_script_scenes to authenticated;
grant select, insert, update, delete on table public.video_script_shots to authenticated;
grant select, insert, update, delete on table public.video_script_characters to authenticated;

grant all on table public.video_script_projects to service_role;
grant all on table public.video_script_scenes to service_role;
grant all on table public.video_script_shots to service_role;
grant all on table public.video_script_characters to service_role;

-- ============================================
-- 9. RPC 函数：获取用户项目列表
-- ============================================
create or replace function public.get_my_video_script_projects()
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
        'description', p.description,
        'status', p.status,
        'storage_type', p.storage_type,
        'metadata', p.metadata,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      order by p.updated_at desc
    ),
    '[]'::jsonb
  )
    into v_projects
    from public.video_script_projects p
   where p.user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'projects', v_projects
  );
end;
$$;

-- ============================================
-- 10. RPC 函数：插入/更新项目
-- ============================================
create or replace function public.upsert_my_video_script_project(
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
  v_description text;
  v_status text;
  v_storage_type text;
  v_metadata jsonb;
  v_exists boolean := false;
  v_cloud_count integer := 0;
  v_saved public.video_script_projects%rowtype;
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
      from public.video_script_projects p
     where p.user_id = v_user_id
       and p.project_id = v_project_id
  ) into v_exists;

  if not v_exists then
    select count(*)
      into v_cloud_count
      from public.video_script_projects p
     where p.user_id = v_user_id;

    if v_cloud_count >= 3 then
      return jsonb_build_object(
        'ok', false,
        'message', 'VIDEO_SCRIPT_PROJECT_LIMIT_REACHED'
      );
    end if;
  end if;

  v_title := left(coalesce(nullif(trim(p_project ->> 'title'), ''), '未命名脚本项目'), 255);
  v_description := p_project ->> 'description';
  
  v_status := lower(trim(coalesce(p_project ->> 'status', 'draft')));
  if v_status not in ('draft', 'in_progress', 'completed') then
    v_status := 'draft';
  end if;

  -- 云端表只存云端项目，统一收敛为 cloud
  v_storage_type := 'cloud';

  v_metadata := coalesce(p_project -> 'metadata', '{}'::jsonb);
  if jsonb_typeof(v_metadata) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_METADATA'
    );
  end if;

  if char_length(v_metadata::text) > 180000 then
    return jsonb_build_object(
      'ok', false,
      'message', 'METADATA_TOO_LARGE'
    );
  end if;

  insert into public.video_script_projects (
    user_id,
    project_id,
    title,
    description,
    status,
    storage_type,
    metadata
  )
  values (
    v_user_id,
    v_project_id,
    v_title,
    v_description,
    v_status,
    v_storage_type,
    v_metadata
  )
  on conflict (user_id, project_id)
  do update
    set title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        storage_type = excluded.storage_type,
        metadata = excluded.metadata,
        updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'ok', true,
    'message', case when v_exists then 'UPDATED' else 'CREATED' end,
    'project', jsonb_build_object(
      'id', v_saved.project_id,
      'title', v_saved.title,
      'description', v_saved.description,
      'status', v_saved.status,
      'storage_type', v_saved.storage_type,
      'metadata', v_saved.metadata,
      'created_at', v_saved.created_at,
      'updated_at', v_saved.updated_at
    )
  );
end;
$$;

-- ============================================
-- 11. RPC 函数：删除项目
-- ============================================
create or replace function public.delete_my_video_script_project(
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

  delete from public.video_script_projects
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

-- ============================================
-- 12. 辅助函数：获取用户项目计数
-- ============================================
create or replace function public.get_video_script_project_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    return 0;
  end if;

  select count(*)
    into v_count
    from public.video_script_projects
   where user_id = v_user_id;

  return v_count;
end;
$$;

-- ============================================
-- 13. RPC 函数权限
-- ============================================
revoke all on function public.get_my_video_script_projects() from public;
revoke all on function public.upsert_my_video_script_project(jsonb) from public;
revoke all on function public.delete_my_video_script_project(text) from public;
revoke all on function public.get_video_script_project_count() from public;

grant execute on function public.get_my_video_script_projects() to authenticated;
grant execute on function public.get_my_video_script_projects() to service_role;
grant execute on function public.upsert_my_video_script_project(jsonb) to authenticated;
grant execute on function public.upsert_my_video_script_project(jsonb) to service_role;
grant execute on function public.delete_my_video_script_project(text) to authenticated;
grant execute on function public.delete_my_video_script_project(text) to service_role;
grant execute on function public.get_video_script_project_count() to authenticated;
grant execute on function public.get_video_script_project_count() to service_role;

commit;

-- ============================================
-- 安全删除方案（如需回滚，执行以下语句）
-- ============================================
-- begin;
-- 
-- -- 删除函数
-- drop function if exists public.get_my_video_script_projects();
-- drop function if exists public.upsert_my_video_script_project(jsonb);
-- drop function if exists public.delete_my_video_script_project(text);
-- drop function if exists public.get_video_script_project_count();
-- drop function if exists public.enforce_video_script_projects_limit();
-- drop function if exists public.touch_video_script_updated_at();
-- 
-- -- 删除表（会级联删除所有相关数据）
-- drop table if exists public.video_script_characters;
-- drop table if exists public.video_script_shots;
-- drop table if exists public.video_script_scenes;
-- drop table if exists public.video_script_projects;
-- 
-- commit;
-- ============================================
