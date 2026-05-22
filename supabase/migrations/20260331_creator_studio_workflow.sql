-- 创作者 Studio：每位用户仅允许一条工作流记录（云端）
-- 包含：表结构、RLS、以及 upsert/get RPC

begin;

create table if not exists public.creator_workflows (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '我的工作流',
  graph jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'paused')),
  version integer not null default 1 check (version >= 1),
  last_run_summary jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint creator_workflows_graph_is_object check (jsonb_typeof(graph) = 'object'),
  constraint creator_workflows_graph_has_nodes check (jsonb_typeof(graph -> 'nodes') = 'array'),
  constraint creator_workflows_graph_has_edges check (jsonb_typeof(graph -> 'edges') = 'array'),
  constraint creator_workflows_graph_size check (char_length(graph::text) <= 150000)
);

create index if not exists idx_creator_workflows_updated_at
  on public.creator_workflows (updated_at desc);

create or replace function public.touch_creator_workflows_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creator_workflows_updated_at on public.creator_workflows;
create trigger trg_creator_workflows_updated_at
before update on public.creator_workflows
for each row
execute function public.touch_creator_workflows_updated_at();

alter table public.creator_workflows enable row level security;

drop policy if exists creator_workflows_select_own on public.creator_workflows;
create policy creator_workflows_select_own
  on public.creator_workflows
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists creator_workflows_insert_own on public.creator_workflows;
create policy creator_workflows_insert_own
  on public.creator_workflows
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists creator_workflows_update_own on public.creator_workflows;
create policy creator_workflows_update_own
  on public.creator_workflows
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists creator_workflows_delete_own on public.creator_workflows;
create policy creator_workflows_delete_own
  on public.creator_workflows
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.creator_workflows to authenticated;
grant all on table public.creator_workflows to service_role;

create or replace function public.upsert_my_creator_workflow(
  p_name text default null,
  p_graph jsonb default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_default_graph jsonb := '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb;
  v_existing public.creator_workflows%rowtype;
  v_saved public.creator_workflows%rowtype;
  v_name text;
  v_status text;
  v_graph jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select *
    into v_existing
    from public.creator_workflows
   where user_id = v_user_id;

  v_name := nullif(trim(coalesce(p_name, v_existing.name, '我的工作流')), '');
  if v_name is null then
    v_name := '我的工作流';
  end if;

  v_status := lower(trim(coalesce(p_status, v_existing.status, 'draft')));
  if v_status not in ('draft', 'published', 'paused') then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_STATUS'
    );
  end if;

  v_graph := coalesce(p_graph, v_existing.graph, v_default_graph);

  if jsonb_typeof(v_graph) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_GRAPH_OBJECT'
    );
  end if;

  if jsonb_typeof(v_graph -> 'nodes') <> 'array'
     or jsonb_typeof(v_graph -> 'edges') <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_GRAPH_SHAPE'
    );
  end if;

  if char_length(v_graph::text) > 150000 then
    return jsonb_build_object(
      'ok', false,
      'message', 'GRAPH_TOO_LARGE'
    );
  end if;

  insert into public.creator_workflows (
    user_id,
    name,
    graph,
    status,
    version
  )
  values (
    v_user_id,
    v_name,
    v_graph,
    v_status,
    1
  )
  on conflict (user_id)
  do update
    set name = excluded.name,
        graph = excluded.graph,
        status = excluded.status,
        version = public.creator_workflows.version + 1,
        updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'workflow', jsonb_build_object(
      'user_id', v_saved.user_id,
      'name', v_saved.name,
      'graph', v_saved.graph,
      'status', v_saved.status,
      'version', v_saved.version,
      'last_run_summary', v_saved.last_run_summary,
      'created_at', v_saved.created_at,
      'updated_at', v_saved.updated_at
    )
  );
end;
$$;

create or replace function public.get_my_creator_workflow()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.creator_workflows%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select *
    into v_item
    from public.creator_workflows
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'message', 'NOT_FOUND',
      'workflow', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'workflow', jsonb_build_object(
      'user_id', v_item.user_id,
      'name', v_item.name,
      'graph', v_item.graph,
      'status', v_item.status,
      'version', v_item.version,
      'last_run_summary', v_item.last_run_summary,
      'created_at', v_item.created_at,
      'updated_at', v_item.updated_at
    )
  );
end;
$$;

revoke all on function public.upsert_my_creator_workflow(text, jsonb, text) from public;
revoke all on function public.get_my_creator_workflow() from public;

grant execute on function public.upsert_my_creator_workflow(text, jsonb, text) to authenticated;
grant execute on function public.upsert_my_creator_workflow(text, jsonb, text) to service_role;
grant execute on function public.get_my_creator_workflow() to authenticated;
grant execute on function public.get_my_creator_workflow() to service_role;

commit;
