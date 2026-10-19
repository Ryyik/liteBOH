-- BOH AI 人物实体与别名（2026-10-19）
--
-- 背景：人物识别此前是四层字符串匹配 ——
--   ① 意图层硬编码 13 个人名；
--   ② 论坛事实卡让模型自由输出 people[]，不校验、无 ID；
--   ③ 检索没有实体维度；
--   ④ 生成上下文丢掉 metadata.people。
-- 结果：同一个人的「翼儿 / 一二 / 胡俊杰 / hjj」在每一层都可能被拆成不同的人。
--
-- 本迁移只做数据层：
--   1) 人物主数据 + 别名表（canonical_id 单一真源）；
--   2) 事实卡补 people_ids / fact_key / support_level / supersedes_id（供摄入校验与冲突取代）；
--   3) 向量切片补 entity_ids（供检索按实体加权）；
--   4) match_boh_ai_knowledge_chunks 增加 p_entity_ids，实体命中做软加权（不硬过滤）。
--
-- 幂等：全部 if not exists / create or replace / DO 块。播种走 `npm run seed:boh-entities`。

begin;

-- ============================================================
-- 1) 人物主数据
-- ============================================================

create table if not exists public.boh_ai_entities (
  id uuid primary key default gen_random_uuid(),
  /** 稳定业务标识（前端 bootstrap JSON 的 id，如 person-yier）。检索侧一律用它，
      不用 DB 生成的 uuid —— 否则静态别名表与线上 uuid 对不上。 */
  slug text not null default '',
  entity_type text not null default 'person',
  canonical_name text not null,
  display_name text not null default '',
  summary text not null default '',
  status text not null default 'active' check (status in ('active', 'merged', 'archived')),
  merged_into uuid null references public.boh_ai_entities (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_entities_slug_len check (char_length(slug) <= 80),
  constraint boh_ai_entities_canonical_len check (char_length(canonical_name) between 1 and 80),
  constraint boh_ai_entities_display_len check (char_length(display_name) <= 120),
  constraint boh_ai_entities_summary_len check (char_length(summary) <= 1200)
);

create unique index if not exists uq_boh_ai_entities_type_canonical
  on public.boh_ai_entities (entity_type, canonical_name);

-- 幂等补列：如果这张表在早期版本里已经建过（没有 slug），这里补上。
alter table public.boh_ai_entities
  add column if not exists slug text not null default '';

-- slug 允许为空串（迁移刚建表时还没播种），但非空 slug 必须唯一。
create unique index if not exists uq_boh_ai_entities_slug
  on public.boh_ai_entities (slug)
  where slug <> '';

create index if not exists idx_boh_ai_entities_status
  on public.boh_ai_entities (status, updated_at desc);

drop trigger if exists trg_boh_ai_entities_updated_at on public.boh_ai_entities;
create trigger trg_boh_ai_entities_updated_at
before update on public.boh_ai_entities
for each row
execute function public.touch_boh_treehole_updated_at();

-- ============================================================
-- 2) 别名表
-- ============================================================

create table if not exists public.boh_ai_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.boh_ai_entities (id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null default 'nickname',
  source text not null default 'manual',
  confidence numeric(4, 3) not null default 1,
  is_ambiguous boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_entity_aliases_alias_len check (char_length(alias) between 1 and 80),
  constraint boh_ai_entity_aliases_normalized_len check (char_length(normalized_alias) between 1 and 120),
  constraint boh_ai_entity_aliases_confidence_range check (confidence >= 0 and confidence <= 1)
);

-- 默认一个别名只指向一个实体；真正一对多的别名显式 is_ambiguous=true，走上下文/追问消歧。
create unique index if not exists uq_boh_ai_entity_aliases_normalized
  on public.boh_ai_entity_aliases (normalized_alias)
  where is_ambiguous = false;

create index if not exists idx_boh_ai_entity_aliases_entity
  on public.boh_ai_entity_aliases (entity_id);

drop trigger if exists trg_boh_ai_entity_aliases_updated_at on public.boh_ai_entity_aliases;
create trigger trg_boh_ai_entity_aliases_updated_at
before update on public.boh_ai_entity_aliases
for each row
execute function public.touch_boh_treehole_updated_at();

-- ============================================================
-- 3) RLS：公开读 active；admin 全权；service_role 全权
-- ============================================================

alter table public.boh_ai_entities enable row level security;
alter table public.boh_ai_entity_aliases enable row level security;

drop policy if exists boh_ai_entities_public_select on public.boh_ai_entities;
create policy boh_ai_entities_public_select
  on public.boh_ai_entities
  for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists boh_ai_entities_admin_all on public.boh_ai_entities;
create policy boh_ai_entities_admin_all
  on public.boh_ai_entities
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists boh_ai_entity_aliases_public_select on public.boh_ai_entity_aliases;
create policy boh_ai_entity_aliases_public_select
  on public.boh_ai_entity_aliases
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.boh_ai_entities e
      where e.id = entity_id
        and e.status = 'active'
    )
  );

drop policy if exists boh_ai_entity_aliases_admin_all on public.boh_ai_entity_aliases;
create policy boh_ai_entity_aliases_admin_all
  on public.boh_ai_entity_aliases
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant all on table public.boh_ai_entities to service_role;
grant all on table public.boh_ai_entity_aliases to service_role;
grant select on table public.boh_ai_entities to anon, authenticated;
grant select on table public.boh_ai_entity_aliases to anon, authenticated;

-- ============================================================
-- 4) 事实卡：实体 ID、证据锚点、支持级别、取代关系
-- ============================================================

alter table public.boh_ai_forum_memories
  add column if not exists people_ids text[] not null default '{}'::text[],
  add column if not exists people_surface text[] not null default '{}'::text[],
  add column if not exists fact_key text not null default '',
  add column if not exists support_level text not null default 'unverified',
  add column if not exists evidence_start integer,
  add column if not exists evidence_end integer,
  add column if not exists supersedes_id uuid null references public.boh_ai_forum_memories (id) on delete set null,
  add column if not exists verified_at timestamp with time zone,
  add column if not exists verified_by uuid null references public.profiles (id) on delete set null;

-- 原 status CHECK 只允许 active/archived；摄入校验需要 pending_review/rejected。
-- 用 DO 块按定义找约束，避免依赖 PostgreSQL 自动生成的约束名。
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.boh_ai_forum_memories'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.boh_ai_forum_memories drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.boh_ai_forum_memories
  drop constraint if exists boh_ai_forum_memories_status_check;

alter table public.boh_ai_forum_memories
  add constraint boh_ai_forum_memories_status_check
  check (status in ('active', 'archived', 'pending_review', 'rejected'));

create index if not exists idx_boh_ai_forum_memories_fact_key
  on public.boh_ai_forum_memories (fact_key);

create index if not exists idx_boh_ai_forum_memories_people_ids
  on public.boh_ai_forum_memories using gin (people_ids);

create index if not exists idx_boh_ai_forum_memories_supersedes
  on public.boh_ai_forum_memories (supersedes_id);

create index if not exists idx_boh_ai_forum_memories_support
  on public.boh_ai_forum_memories (support_level, status, updated_at desc);

-- ============================================================
-- 5) 向量切片：实体 ID 列 + GIN 索引
-- ============================================================

alter table public.boh_ai_knowledge_chunks
  add column if not exists entity_ids text[] not null default '{}'::text[];

create index if not exists idx_boh_ai_knowledge_chunks_entity_ids
  on public.boh_ai_knowledge_chunks using gin (entity_ids);

-- ============================================================
-- 6) 向量检索 RPC：+ p_entity_ids（软加权，不硬过滤）
-- ============================================================

-- 旧 5 参签名必须显式 drop：create or replace 改不了参数列表，会留下两个重载，
-- PostgREST 命名参数调用会报「Could not choose the best candidate function」。
drop function if exists public.match_boh_ai_knowledge_chunks(
  extensions.vector(1024),
  integer,
  text[],
  uuid,
  double precision
);

create or replace function public.match_boh_ai_knowledge_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 8,
  p_source_types text[] default array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory'],
  p_user_id uuid default null,
  p_min_similarity double precision default 0,
  p_entity_ids text[] default null
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
  similarity double precision,
  entity_match boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with scored as (
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
      greatest(0, 1 - (c.embedding <=> p_query_embedding))::double precision as raw_similarity,
      (
        p_entity_ids is not null
        and cardinality(p_entity_ids) > 0
        and c.entity_ids && p_entity_ids
      ) as entity_match
    from public.boh_ai_knowledge_chunks c
    where c.status = 'active'
      and c.embedding is not null
      and c.source_type = any(
        coalesce(
          p_source_types,
          array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory']
        )
      )
      and (
        c.visibility = 'public'
        or (p_user_id is not null and c.owner_user_id = p_user_id)
        or auth.uid() = c.owner_user_id
      )
  )
  select
    s.id,
    s.source_type,
    s.source_id,
    s.owner_user_id,
    s.visibility,
    s.chunk_index,
    s.title,
    s.content,
    s.metadata,
    s.embedding_model,
    s.updated_at,
    least(
      1,
      s.raw_similarity + case when s.entity_match then 0.08 else 0 end
    )::double precision as similarity,
    s.entity_match
  from scored s
  where s.raw_similarity >= greatest(0, least(coalesce(p_min_similarity, 0), 1))
     or s.entity_match
  order by
    (s.raw_similarity + case when s.entity_match then 0.08 else 0 end) desc,
    s.updated_at desc
  limit greatest(1, least(coalesce(p_match_count, 8), 40));
$$;

revoke all on function public.match_boh_ai_knowledge_chunks(
  extensions.vector(1024),
  integer,
  text[],
  uuid,
  double precision,
  text[]
) from public;

grant execute on function public.match_boh_ai_knowledge_chunks(
  extensions.vector(1024),
  integer,
  text[],
  uuid,
  double precision,
  text[]
) to anon, authenticated, service_role;

commit;
