-- BOH AI 论坛记忆（事实卡）—— 让模型「记住」论坛里发生过什么。
--
-- 设计（2026-10-16，用户口径：全部公开帖 + 每日定时抽事实卡）：
--   ① 不存原文片段，存**结构化事实卡**：一条事实 = 一句话 + 涉及成员 + 时间 + 出处帖。
--      理由：原文切片噪声大、且与 `posts.search_vector` 全文检索重复；事实卡是提炼后的长期记忆。
--   ② 新 source_type `forum_memory`，与 core_memory / shared_memory / cloud_entry / knowledge_base 并列。
--   ③ chunks 侧 1:1 映射（chunk_index 恒 0，source_id = 事实卡 id），
--      因此可直接复用既有 `archive_boh_ai_knowledge_chunks_for_source()` 触发器函数。
--   ④ 帖子硬删除走 ON DELETE CASCADE（连带归档向量切片）；
--      帖子状态从 approved 变成别的值由**摄取任务每轮复查**处理（不在 posts 上挂触发器，
--      避免给写热路径增加触发器开销）。
--   ⑤ 每日 20:00 UTC = 次日 04:00（北京时间）触发 `boh-ai-forum-memory` 增量摄取。
--
-- 幂等：全部 create ... if not exists / drop ... if exists / create or replace。

begin;

-- ============================================================
-- 1) 事实卡表
-- ============================================================

create table if not exists public.boh_ai_forum_memories (
  id uuid primary key default gen_random_uuid(),
  source_post_id uuid not null references public.posts (id) on delete cascade,
  source_post_title text not null default '',
  source_post_author text not null default '',
  fact text not null,
  category text not null default 'general',
  people jsonb not null default '[]'::jsonb,
  occurred_at text not null default '',
  confidence numeric(5, 4) not null default 0,
  evidence text not null default '',
  model text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  updated_by uuid null references public.profiles (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_forum_memories_fact_len check (char_length(fact) between 1 and 600),
  constraint boh_ai_forum_memories_category_len check (char_length(category) between 1 and 60),
  constraint boh_ai_forum_memories_people_array check (jsonb_typeof(people) = 'array'),
  constraint boh_ai_forum_memories_people_size check (jsonb_array_length(people) <= 12),
  constraint boh_ai_forum_memories_occurred_at_len check (char_length(occurred_at) <= 60),
  constraint boh_ai_forum_memories_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint boh_ai_forum_memories_evidence_len check (char_length(evidence) <= 600),
  constraint boh_ai_forum_memories_model_len check (char_length(model) <= 120),
  constraint boh_ai_forum_memories_post_title_len check (char_length(source_post_title) <= 200),
  constraint boh_ai_forum_memories_post_author_len check (char_length(source_post_author) <= 80)
);

-- 同一帖子同一句话不重复入库（摄取任务重跑不会堆重复事实）
create unique index if not exists uq_boh_ai_forum_memories_post_fact
  on public.boh_ai_forum_memories (source_post_id, md5(fact));

create index if not exists idx_boh_ai_forum_memories_status_updated
  on public.boh_ai_forum_memories (status, updated_at desc);

create index if not exists idx_boh_ai_forum_memories_category
  on public.boh_ai_forum_memories (category, updated_at desc);

create index if not exists idx_boh_ai_forum_memories_post
  on public.boh_ai_forum_memories (source_post_id);

drop trigger if exists trg_boh_ai_forum_memories_updated_at on public.boh_ai_forum_memories;
create trigger trg_boh_ai_forum_memories_updated_at
before update on public.boh_ai_forum_memories
for each row
execute function public.touch_boh_treehole_updated_at();

-- ============================================================
-- 1b) 摄取账本：记录「扫过哪些帖子」
--     必须有它：抽不出事实的帖子（闲聊、图片帖）也要留痕，
--     否则 `not exists (select 1 from memories ...)` 这类增量条件会每轮重复扫描同一批帖子，
--     既浪费 LLM 调用，也让「本轮新增 N 条」这个指标永远不准。
-- ============================================================

create table if not exists public.boh_ai_forum_memory_scans (
  post_id uuid primary key references public.posts (id) on delete cascade,
  fact_count integer not null default 0,
  model text not null default '',
  note text not null default '',
  scanned_at timestamp with time zone not null default now(),
  constraint boh_ai_forum_memory_scans_fact_count_range check (fact_count >= 0),
  constraint boh_ai_forum_memory_scans_note_len check (char_length(note) <= 240),
  constraint boh_ai_forum_memory_scans_model_len check (char_length(model) <= 120)
);

create index if not exists idx_boh_ai_forum_memory_scans_scanned
  on public.boh_ai_forum_memory_scans (scanned_at desc);

alter table public.boh_ai_forum_memory_scans enable row level security;

-- 内部账本：只给 admin 看（后台展示摄取进度），不参与检索、不对外公开。
drop policy if exists boh_ai_forum_memory_scans_admin_select on public.boh_ai_forum_memory_scans;
create policy boh_ai_forum_memory_scans_admin_select
  on public.boh_ai_forum_memory_scans
  for select
  to authenticated
  using (public.current_user_is_admin());

grant all on table public.boh_ai_forum_memory_scans to service_role;

-- ============================================================
-- 2) RLS：事实源自公开帖 ⇒ 与 boh_ai_core_memories 同口径（公开可读、admin 全权）
-- ============================================================

alter table public.boh_ai_forum_memories enable row level security;

drop policy if exists boh_ai_forum_memories_select_active on public.boh_ai_forum_memories;
create policy boh_ai_forum_memories_select_active
  on public.boh_ai_forum_memories
  for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists boh_ai_forum_memories_admin_select on public.boh_ai_forum_memories;
create policy boh_ai_forum_memories_admin_select
  on public.boh_ai_forum_memories
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists boh_ai_forum_memories_admin_insert on public.boh_ai_forum_memories;
create policy boh_ai_forum_memories_admin_insert
  on public.boh_ai_forum_memories
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists boh_ai_forum_memories_admin_update on public.boh_ai_forum_memories;
create policy boh_ai_forum_memories_admin_update
  on public.boh_ai_forum_memories
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists boh_ai_forum_memories_admin_delete on public.boh_ai_forum_memories;
create policy boh_ai_forum_memories_admin_delete
  on public.boh_ai_forum_memories
  for delete
  to authenticated
  using (public.current_user_is_admin());

grant select on table public.boh_ai_forum_memories to anon;
grant select, insert, update, delete on table public.boh_ai_forum_memories to authenticated;
grant all on table public.boh_ai_forum_memories to service_role;

-- ============================================================
-- 3) chunks 白名单加 'forum_memory'
-- ============================================================

alter table public.boh_ai_knowledge_chunks
  drop constraint if exists boh_ai_knowledge_chunks_source_type_check;

alter table public.boh_ai_knowledge_chunks
  add constraint boh_ai_knowledge_chunks_source_type_check
  check (source_type in ('core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory'));

-- 向量检索 RPC：**必须同步默认参数**。否则调用方不显式传 p_source_types 时，
-- coalesce 兜底走的仍是旧数组 ⇒ 论坛记忆永远检索不到（这类「默认值漂移」不报错、只是静默漏结果）。
create or replace function public.match_boh_ai_knowledge_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 8,
  p_source_types text[] default array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory'],
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
    and c.source_type = any(coalesce(p_source_types, array['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory']))
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

-- ============================================================
-- 4) 事实卡归档/删除 → 连带归档向量切片（复用既有 helper，传 'forum_memory'）
-- ============================================================

drop trigger if exists trg_boh_ai_forum_memories_archive_ai_chunks on public.boh_ai_forum_memories;
create trigger trg_boh_ai_forum_memories_archive_ai_chunks
after delete on public.boh_ai_forum_memories
for each row
execute function public.archive_boh_ai_knowledge_chunks_for_source('forum_memory');

create or replace function public.archive_boh_ai_forum_memory_chunks_when_inactive()
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
     where source_type = 'forum_memory'
       and source_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.archive_boh_ai_forum_memory_chunks_when_inactive() from public;
grant execute on function public.archive_boh_ai_forum_memory_chunks_when_inactive() to service_role;

drop trigger if exists trg_boh_ai_forum_memories_status_ai_chunks on public.boh_ai_forum_memories;
create trigger trg_boh_ai_forum_memories_status_ai_chunks
after update of status on public.boh_ai_forum_memories
for each row
execute function public.archive_boh_ai_forum_memory_chunks_when_inactive();

-- ============================================================
-- 5) 每日增量摄取（pg_cron → boh-ai-forum-memory）
--    与 2026090605 / 2026090602 同款模式：读 app.settings 里的 url + service_role_key。
--    缺扩展或缺配置时**只打 notice 不报错**，避免迁移在本地/CI 上失败。
-- ============================================================

do $cron$
declare
  v_supabase_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_service_role_key text := nullif(current_setting('app.settings.service_role_key', true), '');
  v_has_pg_cron boolean := false;
  v_has_pg_net boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_pg_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;

  if not v_has_pg_cron or not v_has_pg_net then
    raise notice '论坛记忆摄取未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  if v_supabase_url is null or v_service_role_key is null then
    raise notice '论坛记忆摄取未注册：缺少 app.settings.supabase_url 或 app.settings.service_role_key。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'boh_ai_forum_memory_ingest_cron';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'boh_ai_forum_memory_ingest_cron',
    '0 20 * * *',
    format($cmd$
      select net.http_post(
        url := %L || '/functions/v1/boh-ai-forum-memory',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$, rtrim(v_supabase_url, '/'), v_service_role_key)
  );

  raise notice '论坛记忆摄取已注册：每天 20:00 UTC（北京时间次日 04:00）增量摄取一次。';
exception when others then
  raise notice '创建论坛记忆摄取任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
