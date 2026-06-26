-- BOH AI 共享记忆检索优化：
-- 1) 增加 FTS / JSONB / 活跃记录索引；
-- 2) 提供关键词检索 RPC，减少前端全量拉取与本地打分开销。

begin;

create index if not exists idx_boh_ai_shared_memories_active_updated_at
  on public.boh_ai_shared_memories (updated_at desc)
  where status = 'active';

create index if not exists idx_boh_ai_shared_memories_tags_gin
  on public.boh_ai_shared_memories
  using gin (tags jsonb_path_ops);

create index if not exists idx_boh_ai_shared_memories_search_fts
  on public.boh_ai_shared_memories
  using gin (
    to_tsvector(
      'simple',
      coalesce(content, '') || ' ' || coalesce(mood, '') || ' ' || coalesce(tags::text, '')
    )
  );

create or replace function public.search_boh_ai_shared_memories(
  p_query text,
  p_limit integer default 12
)
returns table (
  id uuid,
  owner_user_id uuid,
  content text,
  mood text,
  tags jsonb,
  confidence numeric,
  evidence jsonb,
  source text,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  score double precision
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 60));
begin
  if v_query = '' then
    return query
    select
      m.id,
      m.owner_user_id,
      m.content,
      m.mood,
      m.tags,
      m.confidence,
      m.evidence,
      m.source,
      m.status,
      m.created_at,
      m.updated_at,
      0::double precision as score
    from public.boh_ai_shared_memories m
    where m.status = 'active'
    order by m.updated_at desc
    limit v_limit;
    return;
  end if;

  begin
    return query
    with ranked as (
      select
        m.*,
        ts_rank_cd(
          to_tsvector(
            'simple',
            coalesce(m.content, '') || ' ' || coalesce(m.mood, '') || ' ' || coalesce(m.tags::text, '')
          ),
          websearch_to_tsquery('simple', v_query)
        ) as rank_score
      from public.boh_ai_shared_memories m
      where m.status = 'active'
        and (
          to_tsvector(
            'simple',
            coalesce(m.content, '') || ' ' || coalesce(m.mood, '') || ' ' || coalesce(m.tags::text, '')
          ) @@ websearch_to_tsquery('simple', v_query)
          or lower(coalesce(m.content, '')) like '%' || lower(v_query) || '%'
          or lower(coalesce(m.mood, '')) like '%' || lower(v_query) || '%'
          or lower(coalesce(m.tags::text, '')) like '%' || lower(v_query) || '%'
        )
    )
    select
      r.id,
      r.owner_user_id,
      r.content,
      r.mood,
      r.tags,
      r.confidence,
      r.evidence,
      r.source,
      r.status,
      r.created_at,
      r.updated_at,
      (coalesce(r.rank_score, 0)::double precision + (coalesce(r.confidence, 0)::double precision * 0.08)) as score
    from ranked r
    order by score desc, r.updated_at desc
    limit v_limit;
  exception
    when others then
      return query
      select
        m.id,
        m.owner_user_id,
        m.content,
        m.mood,
        m.tags,
        m.confidence,
        m.evidence,
        m.source,
        m.status,
        m.created_at,
        m.updated_at,
        0::double precision as score
      from public.boh_ai_shared_memories m
      where m.status = 'active'
        and (
          lower(coalesce(m.content, '')) like '%' || lower(v_query) || '%'
          or lower(coalesce(m.mood, '')) like '%' || lower(v_query) || '%'
          or lower(coalesce(m.tags::text, '')) like '%' || lower(v_query) || '%'
        )
      order by m.updated_at desc
      limit v_limit;
  end;
end;
$$;

revoke all on function public.search_boh_ai_shared_memories(text, integer) from public;
grant execute on function public.search_boh_ai_shared_memories(text, integer) to anon;
grant execute on function public.search_boh_ai_shared_memories(text, integer) to authenticated;
grant execute on function public.search_boh_ai_shared_memories(text, integer) to service_role;

commit;
