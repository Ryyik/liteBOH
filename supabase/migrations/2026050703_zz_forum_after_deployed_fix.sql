-- 已执行旧版 20260507 论坛迁移后的收敛补丁：
-- 1) 修复发帖触发器中 content 兼容字段漏写标题右括号的问题
-- 2) 修复可能已写入的缺右括号历史 content
-- 3) 覆盖 list_forum_posts，使列表只返回封面预览，完整图片交给详情页单独加载

begin;

create or replace function public.sync_forum_post_text_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content
       and new.title is not distinct from old.title
       and new.body is not distinct from old.body then
      v_title := nullif(trim(public.forum_post_title(new.content)), '');
      v_body := nullif(trim(public.forum_post_body(new.content)), '');
    else
      v_title := nullif(trim(coalesce(new.title, public.forum_post_title(new.content))), '');
      v_body := nullif(trim(coalesce(new.body, public.forum_post_body(new.content))), '');
    end if;
  else
    v_title := nullif(trim(coalesce(new.title, public.forum_post_title(new.content))), '');
    v_body := nullif(trim(coalesce(new.body, public.forum_post_body(new.content))), '');
  end if;

  if v_title is null and v_body is null then
    v_title := '无标题';
    v_body := '';
  end if;

  new.title := coalesce(v_title, '无标题');
  new.body := coalesce(v_body, '');

  if tg_op = 'INSERT' then
    new.content := case
      when new.title is not null and trim(new.title) <> '' then
        '【' || new.title || '】' || E'\n' || coalesce(new.body, '')
      else
        coalesce(new.body, '')
    end;
  elsif new.content is null
     or trim(new.content) = ''
     or new.title is distinct from old.title
     or new.body is distinct from old.body then
    new.content := case
      when new.title is not null and trim(new.title) <> '' then
        '【' || new.title || '】' || E'\n' || coalesce(new.body, '')
      else
        coalesce(new.body, '')
    end;
  end if;

  return new;
end;
$$;

update public.posts
   set content = '【' || title || '】' || E'\n' || coalesce(body, '')
 where title is not null
   and trim(title) <> ''
   and content = '【' || title || E'\n' || coalesce(body, '');

drop function if exists public.list_forum_posts(integer, integer, text, uuid, boolean, text);

create function public.list_forum_posts(
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
  title text,
  body text,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  comment_count bigint,
  like_count bigint,
  image_count integer,
  cover_image_url text,
  images jsonb,
  hot_score double precision,
  search_rank real,
  search_excerpt text,
  has_more boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_fetch_size integer := v_page_size + 1;
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
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), '') as body,
      p.author_id,
      p.author_username,
      pr.avatar_url as author_avatar_url,
      p.created_at,
      p.updated_at,
      p.status,
      p.comment_count,
      p.like_count,
      coalesce(p.image_count, 0)::integer as image_count,
      coalesce(p.cover_image_url, '') as cover_image_url,
      case
        when coalesce(p.cover_image_url, '') <> '' then jsonb_build_array(jsonb_build_object(
          'id', p.id::text || '-cover',
          'url', p.cover_image_url,
          'publicId', '',
          'width', 0,
          'height', 0,
          'format', '',
          'sortOrder', 0
        ))
        else '[]'::jsonb
      end as images,
      p.search_vector,
      (p.like_count::double precision * 1.0)
      + (p.comment_count::double precision * 1.5)
      + greatest(0.0, 48.0 - extract(epoch from (now() - p.created_at)) / 3600.0) / 24.0 as hot_score
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (
        p.status = 'approved'
        or (p_include_author_non_approved and p_author_id is not null and p.author_id = p_author_id)
      )
  ),
  filtered as (
    select
      bp.*,
      case
        when v_has_query then websearch_to_tsquery('simple', v_query)
        else null
      end as query_ts
    from base_posts bp
    where (not v_has_query) or (bp.search_vector @@ websearch_to_tsquery('simple', v_query))
  ),
  ranked as (
    select
      f.*,
      case when v_has_query then ts_rank_cd(f.search_vector, f.query_ts) else 0::real end as search_rank,
      case
        when v_has_query then ts_headline(
          'simple',
          coalesce(nullif(f.body, ''), f.content),
          f.query_ts,
          'MaxFragments=2, FragmentDelimiter=" … ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
        )
        else null
      end as search_excerpt,
      row_number() over (
        order by
          case when v_has_query and v_sort = 'latest' then ts_rank_cd(f.search_vector, f.query_ts) end desc nulls last,
          case when v_sort = 'hottest' then f.hot_score end desc nulls last,
          f.created_at desc,
          f.id desc
      ) as row_num
    from filtered f
  ),
  paged as (
    select *
    from ranked
    where row_num > v_offset
      and row_num <= v_offset + v_fetch_size
  ),
  page_meta as (
    select (count(*) > v_page_size) as has_more
    from paged
  )
  select
    p.id,
    p.content,
    p.title,
    p.body,
    p.author_id,
    p.author_username,
    p.author_avatar_url,
    p.created_at,
    p.updated_at,
    p.status,
    p.comment_count,
    p.like_count,
    p.image_count,
    p.cover_image_url,
    p.images,
    p.hot_score,
    p.search_rank,
    p.search_excerpt,
    pm.has_more
  from paged p
  cross join page_meta pm
  where p.row_num <= v_offset + v_page_size
  order by p.row_num;
end;
$$;

revoke all on function public.sync_forum_post_text_fields() from public;
revoke all on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) from public;

grant execute on function public.sync_forum_post_text_fields() to authenticated;
grant execute on function public.sync_forum_post_text_fields() to service_role;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to anon;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
