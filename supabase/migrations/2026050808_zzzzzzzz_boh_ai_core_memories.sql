-- BOH AI official core memories.
-- Stores administrator-maintained facts separately from user-generated public memories.

begin;

create table if not exists public.boh_ai_core_memories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'general',
  tags jsonb not null default '[]'::jsonb,
  priority integer not null default 50,
  source_label text not null default 'BOH 官方',
  source_url text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  updated_by uuid null references public.profiles (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_core_memories_title_len check (char_length(title) between 1 and 160),
  constraint boh_ai_core_memories_content_len check (char_length(content) between 1 and 12000),
  constraint boh_ai_core_memories_category_len check (char_length(category) between 1 and 60),
  constraint boh_ai_core_memories_tags_array check (jsonb_typeof(tags) = 'array'),
  constraint boh_ai_core_memories_tags_size check (jsonb_array_length(tags) <= 30),
  constraint boh_ai_core_memories_priority_range check (priority >= 0 and priority <= 100),
  constraint boh_ai_core_memories_source_label_len check (char_length(source_label) <= 120),
  constraint boh_ai_core_memories_source_url_len check (char_length(source_url) <= 600)
);

create index if not exists idx_boh_ai_core_memories_status_priority_updated
  on public.boh_ai_core_memories (status, priority desc, updated_at desc);

create index if not exists idx_boh_ai_core_memories_category_updated
  on public.boh_ai_core_memories (category, updated_at desc);

create index if not exists idx_boh_ai_core_memories_tags_gin
  on public.boh_ai_core_memories using gin (tags);

drop trigger if exists trg_boh_ai_core_memories_updated_at on public.boh_ai_core_memories;
create trigger trg_boh_ai_core_memories_updated_at
before update on public.boh_ai_core_memories
for each row
execute function public.touch_boh_treehole_updated_at();

alter table public.boh_ai_core_memories enable row level security;

drop policy if exists boh_ai_core_memories_select_active on public.boh_ai_core_memories;
create policy boh_ai_core_memories_select_active
  on public.boh_ai_core_memories
  for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists boh_ai_core_memories_admin_select on public.boh_ai_core_memories;
create policy boh_ai_core_memories_admin_select
  on public.boh_ai_core_memories
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists boh_ai_core_memories_admin_insert on public.boh_ai_core_memories;
create policy boh_ai_core_memories_admin_insert
  on public.boh_ai_core_memories
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists boh_ai_core_memories_admin_update on public.boh_ai_core_memories;
create policy boh_ai_core_memories_admin_update
  on public.boh_ai_core_memories
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists boh_ai_core_memories_admin_delete on public.boh_ai_core_memories;
create policy boh_ai_core_memories_admin_delete
  on public.boh_ai_core_memories
  for delete
  to authenticated
  using (public.current_user_is_admin());

grant select on table public.boh_ai_core_memories to anon;
grant select, insert, update, delete on table public.boh_ai_core_memories to authenticated;
grant all on table public.boh_ai_core_memories to service_role;

alter table public.boh_ai_knowledge_chunks
  drop constraint if exists boh_ai_knowledge_chunks_source_type_check;

alter table public.boh_ai_knowledge_chunks
  add constraint boh_ai_knowledge_chunks_source_type_check
  check (source_type in ('core_memory', 'shared_memory', 'cloud_entry'));

create or replace function public.archive_boh_ai_knowledge_chunks_for_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.boh_ai_knowledge_chunks
     set status = 'archived',
         updated_at = now()
   where source_type = tg_argv[0]
     and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_boh_ai_core_memories_archive_ai_chunks on public.boh_ai_core_memories;
create trigger trg_boh_ai_core_memories_archive_ai_chunks
after delete on public.boh_ai_core_memories
for each row
execute function public.archive_boh_ai_knowledge_chunks_for_source('core_memory');

create or replace function public.archive_boh_ai_core_memory_chunks_when_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' then
    update public.boh_ai_knowledge_chunks
       set status = 'archived',
           updated_at = now()
     where source_type = 'core_memory'
       and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boh_ai_core_memories_status_ai_chunks on public.boh_ai_core_memories;
create trigger trg_boh_ai_core_memories_status_ai_chunks
after update of status on public.boh_ai_core_memories
for each row
execute function public.archive_boh_ai_core_memory_chunks_when_inactive();

create or replace function public.match_boh_ai_knowledge_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 8,
  p_source_types text[] default array['core_memory', 'shared_memory', 'cloud_entry'],
  p_user_id uuid default null,
  p_min_similarity double precision default 0
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  owner_user_id uuid,
  visibility text,
  chunk_index integer,
  title text,
  content text,
  metadata jsonb,
  embedding_model text,
  updated_at timestamp with time zone,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.source_type,
    c.source_id,
    c.owner_user_id,
    c.visibility,
    c.chunk_index,
    c.title,
    c.content,
    c.metadata,
    c.embedding_model,
    c.updated_at,
    greatest(0, 1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from public.boh_ai_knowledge_chunks c
  where c.status = 'active'
    and c.embedding is not null
    and c.source_type = any(coalesce(p_source_types, array['core_memory', 'shared_memory', 'cloud_entry']))
    and (
      c.visibility = 'public'
      or (p_user_id is not null and c.owner_user_id = p_user_id)
      or auth.uid() = c.owner_user_id
    )
    and greatest(0, 1 - (c.embedding <=> p_query_embedding)) >= greatest(0, least(coalesce(p_min_similarity, 0), 1))
  order by c.embedding <=> p_query_embedding asc, c.updated_at desc
  limit greatest(1, least(coalesce(p_match_count, 8), 40));
$$;

revoke all on function public.match_boh_ai_knowledge_chunks(extensions.vector(1024), integer, text[], uuid, double precision) from public;
grant execute on function public.match_boh_ai_knowledge_chunks(extensions.vector(1024), integer, text[], uuid, double precision) to anon;
grant execute on function public.match_boh_ai_knowledge_chunks(extensions.vector(1024), integer, text[], uuid, double precision) to authenticated;
grant execute on function public.match_boh_ai_knowledge_chunks(extensions.vector(1024), integer, text[], uuid, double precision) to service_role;

commit;
