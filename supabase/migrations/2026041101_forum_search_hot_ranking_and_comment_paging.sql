-- 论坛：全量搜索 / 服务端热榜 / 审核后评论计数统一

begin;

create index if not exists idx_posts_status_created_at
  on public.posts (status, created_at desc);

create index if not exists idx_comments_post_status_created_at
  on public.comments (post_id, status, created_at desc);

create index if not exists idx_likes_post_id
  on public.likes (post_id);

create or replace function public.forum_post_title(p_content text)
returns text
language sql
immutable
as $$
  select coalesce((regexp_match(coalesce(p_content, ''), '^【(.*?)】'))[1], '');
$$;

create or replace function public.forum_post_body(p_content text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_content, ''), '^【.*?】\\s*', '');
$$;

create or replace function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null
)
returns table (
  id uuid,
  content text,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  comment_count bigint,
  like_count bigint,
  hot_score double precision,
  search_rank real,
  search_excerpt text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_offset integer := (v_page - 1) * v_page_size;
  v_sort text := lower(trim(coalesce(p_sort, 'latest')));
  v_query text := nullif(trim(coalesce(p_search_query, '')), '');
  v_has_query boolean := v_query is not null;
begin
  if v_sort not in ('latest', 'hottest') then
    v_sort := 'latest';
  end if;

  return query
  with base_posts as (
    select
      p.id,
      p.content,
      p.author_id,
      p.author_username,
      pr.avatar_url as author_avatar_url,
      p.created_at,
      p.updated_at,
      p.status,
      public.forum_post_title(p.content) as title_text,
      public.forum_post_body(p.content) as body_text
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (
        p.status = 'approved'
        or (p_include_author_non_approved and p_author_id is not null and p.author_id = p_author_id)
      )
  ),
  post_stats as (
    select
      bp.id,
      coalesce(c.comment_count, 0)::bigint as comment_count,
      coalesce(l.like_count, 0)::bigint as like_count
    from base_posts bp
    left join (
      select post_id, count(*)::bigint as comment_count
      from public.comments
      where status = 'approved'
      group by post_id
    ) c on c.post_id = bp.id
    left join (
      select post_id, count(*)::bigint as like_count
      from public.likes
      group by post_id
    ) l on l.post_id = bp.id
  ),
  merged as (
    select
      bp.*,
      ps.comment_count,
      ps.like_count,
      (ps.like_count::double precision * 1.0)
      + (ps.comment_count::double precision * 1.5)
      + greatest(0.0, 48.0 - extract(epoch from (now() - bp.created_at)) / 3600.0) / 24.0 as hot_score,
      case
        when v_has_query then
          setweight(to_tsvector('simple', coalesce(bp.title_text, '')), 'A')
          || setweight(to_tsvector('simple', coalesce(bp.body_text, '')), 'B')
          || setweight(to_tsvector('simple', coalesce(bp.author_username, '')), 'C')
        else null
      end as doc,
      case when v_has_query then websearch_to_tsquery('simple', v_query) else null end as query_ts
    from base_posts bp
    join post_stats ps on ps.id = bp.id
  ),
  filtered as (
    select *
    from merged m
    where (not v_has_query) or (m.doc @@ m.query_ts)
  )
  select
    f.id,
    f.content,
    f.author_id,
    f.author_username,
    f.author_avatar_url,
    f.created_at,
    f.updated_at,
    f.status,
    f.comment_count,
    f.like_count,
    f.hot_score,
    case when v_has_query then ts_rank_cd(f.doc, f.query_ts) else 0::real end as search_rank,
    case
      when v_has_query then ts_headline(
        'simple',
        coalesce(nullif(f.body_text, ''), f.content),
        f.query_ts,
        'MaxFragments=2, FragmentDelimiter=" … ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
      )
      else null
    end as search_excerpt
  from filtered f
  order by
    case when v_has_query and v_sort = 'latest' then ts_rank_cd(f.doc, f.query_ts) end desc nulls last,
    case when v_sort = 'hottest' then f.hot_score end desc nulls last,
    f.created_at desc
  limit v_page_size
  offset v_offset;
end;
$$;

grant execute on function public.forum_post_title(text) to anon;
grant execute on function public.forum_post_title(text) to authenticated;
grant execute on function public.forum_post_title(text) to service_role;

grant execute on function public.forum_post_body(text) to anon;
grant execute on function public.forum_post_body(text) to authenticated;
grant execute on function public.forum_post_body(text) to service_role;

grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to anon;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to service_role;

commit;
