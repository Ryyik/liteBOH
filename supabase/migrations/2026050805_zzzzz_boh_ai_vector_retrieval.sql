-- BOH AI vector retrieval foundation.
-- Adds a shared/private knowledge chunk table for bge-m3 embeddings and a
-- guarded match RPC used by the boh-ai-retrieval Edge Function.

begin;

create extension if not exists vector with schema extensions;

create table if not exists public.boh_ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('shared_memory', 'cloud_entry')),
  source_id uuid not null,
  owner_user_id uuid null references public.profiles (id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  chunk_index integer not null default 0 check (chunk_index >= 0),
  title text not null default '',
  content text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding_model text not null default 'BAAI/bge-m3',
  embedding extensions.vector(1024),
  status text not null default 'active' check (status in ('active', 'stale', 'archived')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_knowledge_chunks_content_len check (char_length(content) between 1 and 3000),
  constraint boh_ai_knowledge_chunks_title_len check (char_length(title) <= 160),
  constraint boh_ai_knowledge_chunks_hash_len check (char_length(content_hash) between 16 and 128),
  constraint boh_ai_knowledge_chunks_visibility_owner check (
    visibility = 'public' or owner_user_id is not null
  )
);

create unique index if not exists uniq_boh_ai_knowledge_chunks_source_chunk
  on public.boh_ai_knowledge_chunks (source_type, source_id, chunk_index);

create index if not exists idx_boh_ai_knowledge_chunks_source
  on public.boh_ai_knowledge_chunks (source_type, source_id);

create index if not exists idx_boh_ai_knowledge_chunks_owner_updated
  on public.boh_ai_knowledge_chunks (owner_user_id, updated_at desc)
  where visibility = 'private';

create index if not exists idx_boh_ai_knowledge_chunks_public_updated
  on public.boh_ai_knowledge_chunks (updated_at desc)
  where visibility = 'public' and status = 'active';

do $$
begin
  create index if not exists idx_boh_ai_knowledge_chunks_embedding_cosine
    on public.boh_ai_knowledge_chunks
    using ivfflat (embedding extensions.vector_cosine_ops)
    with (lists = 64)
    where embedding is not null and status = 'active';
exception
  when others then
    raise notice 'Skipping vector index idx_boh_ai_knowledge_chunks_embedding_cosine: %', sqlerrm;
end;
$$;

drop trigger if exists trg_boh_ai_knowledge_chunks_updated_at on public.boh_ai_knowledge_chunks;
create trigger trg_boh_ai_knowledge_chunks_updated_at
before update on public.boh_ai_knowledge_chunks
for each row
execute function public.touch_boh_treehole_updated_at();

alter table public.boh_ai_knowledge_chunks enable row level security;

drop policy if exists boh_ai_knowledge_chunks_select_public_or_own on public.boh_ai_knowledge_chunks;
create policy boh_ai_knowledge_chunks_select_public_or_own
  on public.boh_ai_knowledge_chunks
  for select
  to anon, authenticated
  using (
    status = 'active'
    and (
      visibility = 'public'
      or auth.uid() = owner_user_id
    )
  );

drop policy if exists boh_ai_knowledge_chunks_service_all on public.boh_ai_knowledge_chunks;
create policy boh_ai_knowledge_chunks_service_all
  on public.boh_ai_knowledge_chunks
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.boh_ai_knowledge_chunks to anon;
grant select on table public.boh_ai_knowledge_chunks to authenticated;
grant all on table public.boh_ai_knowledge_chunks to service_role;

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

drop trigger if exists trg_boh_cloud_entries_archive_ai_chunks on public.boh_cloud_entries;
create trigger trg_boh_cloud_entries_archive_ai_chunks
after delete on public.boh_cloud_entries
for each row
execute function public.archive_boh_ai_knowledge_chunks_for_source('cloud_entry');

drop trigger if exists trg_boh_ai_shared_memories_archive_ai_chunks on public.boh_ai_shared_memories;
create trigger trg_boh_ai_shared_memories_archive_ai_chunks
after delete on public.boh_ai_shared_memories
for each row
execute function public.archive_boh_ai_knowledge_chunks_for_source('shared_memory');

create or replace function public.archive_boh_ai_shared_memory_chunks_when_inactive()
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
     where source_type = 'shared_memory'
       and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boh_ai_shared_memories_status_ai_chunks on public.boh_ai_shared_memories;
create trigger trg_boh_ai_shared_memories_status_ai_chunks
after update of status on public.boh_ai_shared_memories
for each row
execute function public.archive_boh_ai_shared_memory_chunks_when_inactive();

create or replace function public.match_boh_ai_knowledge_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 8,
  p_source_types text[] default array['shared_memory', 'cloud_entry'],
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
    and c.source_type = any(coalesce(p_source_types, array['shared_memory', 'cloud_entry']))
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
