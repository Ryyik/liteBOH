-- BOH database health repair for the 2026-05-10 health-check result.
-- Safe/idempotent intent:
-- 1) Adds missing BOH AI knowledge base table and related retrieval support.
-- 2) Attempts to validate older boh_creator_shows NOT VALID constraints.
-- 3) Reloads PostgREST schema cache.
--
-- Run this in Supabase SQL Editor after reviewing the statements.

begin;

create table if not exists public.boh_ai_knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default '',
  description text not null default '',
  owner_user_id uuid null references public.profiles (id) on delete set null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  version text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_knowledge_bases_slug_len check (char_length(slug) between 1 and 120),
  constraint boh_ai_knowledge_bases_title_len check (char_length(title) <= 160),
  constraint boh_ai_knowledge_bases_description_len check (char_length(description) <= 800),
  constraint boh_ai_knowledge_bases_visibility_owner check (
    visibility = 'public' or owner_user_id is not null
  )
);

create index if not exists idx_boh_ai_knowledge_bases_public_updated
  on public.boh_ai_knowledge_bases (updated_at desc)
  where visibility = 'public' and status = 'active';

create index if not exists idx_boh_ai_knowledge_bases_owner_updated
  on public.boh_ai_knowledge_bases (owner_user_id, updated_at desc)
  where visibility = 'private';

drop trigger if exists trg_boh_ai_knowledge_bases_updated_at on public.boh_ai_knowledge_bases;
create trigger trg_boh_ai_knowledge_bases_updated_at
before update on public.boh_ai_knowledge_bases
for each row
execute function public.touch_boh_treehole_updated_at();

alter table public.boh_ai_knowledge_bases enable row level security;

drop policy if exists boh_ai_knowledge_bases_select_public_or_own on public.boh_ai_knowledge_bases;
create policy boh_ai_knowledge_bases_select_public_or_own
  on public.boh_ai_knowledge_bases
  for select
  to anon, authenticated
  using (
    status = 'active'
    and (
      visibility = 'public'
      or auth.uid() = owner_user_id
    )
  );

drop policy if exists boh_ai_knowledge_bases_service_all on public.boh_ai_knowledge_bases;
create policy boh_ai_knowledge_bases_service_all
  on public.boh_ai_knowledge_bases
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.boh_ai_knowledge_bases to anon;
grant select on table public.boh_ai_knowledge_bases to authenticated;
grant all on table public.boh_ai_knowledge_bases to service_role;

alter table public.boh_ai_knowledge_chunks
  drop constraint if exists boh_ai_knowledge_chunks_source_type_check;

alter table public.boh_ai_knowledge_chunks
  add constraint boh_ai_knowledge_chunks_source_type_check
  check (source_type in ('core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'));

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

drop trigger if exists trg_boh_ai_knowledge_bases_archive_ai_chunks on public.boh_ai_knowledge_bases;
create trigger trg_boh_ai_knowledge_bases_archive_ai_chunks
after delete on public.boh_ai_knowledge_bases
for each row
execute function public.archive_boh_ai_knowledge_chunks_for_source('knowledge_base');

create or replace function public.archive_boh_ai_knowledge_base_chunks_when_inactive()
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
     where source_type = 'knowledge_base'
       and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boh_ai_knowledge_bases_status_ai_chunks on public.boh_ai_knowledge_bases;
create trigger trg_boh_ai_knowledge_bases_status_ai_chunks
after update of status on public.boh_ai_knowledge_bases
for each row
execute function public.archive_boh_ai_knowledge_base_chunks_when_inactive();

create or replace function public.match_boh_ai_knowledge_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 8,
  p_source_types text[] default array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'],
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
    and c.source_type = any(coalesce(p_source_types, array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base']))
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

do $$
declare
  c_name text;
begin
  foreach c_name in array array[
    'boh_creator_shows_platform_valid',
    'boh_creator_shows_author_username_len',
    'boh_creator_shows_creator_platform_id_len',
    'boh_creator_shows_title_len',
    'boh_creator_shows_description_len',
    'boh_creator_shows_video_url_valid'
  ]
  loop
    begin
      execute format('alter table public.boh_creator_shows validate constraint %I', c_name);
      raise notice 'Validated constraint %', c_name;
    exception
      when others then
        raise notice 'Could not validate constraint %: %', c_name, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
