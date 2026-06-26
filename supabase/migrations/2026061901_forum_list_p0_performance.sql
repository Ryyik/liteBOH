-- P0 forum list performance: include viewer like state and top-level reply preview in one RPC.
-- Keeps the existing function signature so frontend callers do not need a route change.

begin;

create index if not exists idx_posts_status_created_id
  on public.posts (status, created_at desc, id desc);

create index if not exists idx_posts_author_created_id
  on public.posts (author_id, created_at desc, id desc);

create index if not exists idx_posts_tag_status_created_id
  on public.posts (tag, status, created_at desc, id desc);

create index if not exists idx_likes_user_post
  on public.likes (user_id, post_id);

create index if not exists idx_comments_post_parent_created
  on public.comments (post_id, parent_id, created_at desc);

drop function if exists public.list_forum_posts(integer, integer, text, uuid, boolean, text, text);

create or replace function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null,
  p_tag_filter text default null
)
returns table (
  id uuid,
  content text,
  title text,
  body text,
  tag text,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  comment_count bigint,
  like_count bigint,
  is_liked boolean,
  image_count integer,
  cover_image_url text,
  images jsonb,
  replies jsonb,
  replies_has_more boolean,
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
  v_tag text := lower(trim(coalesce(p_tag_filter, '')));
  v_viewer_id uuid := auth.uid();
  v_has_query boolean := v_query is not null;
begin
  if v_sort not in ('latest', 'hottest') then
    v_sort := 'latest';
  end if;

  if v_tag not in ('server', 'activity', 'daily', 'question') then
    v_tag := '';
  end if;

  return query
  with base_posts as (
    select
      p.id,
      p.content,
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), '') as body,
      coalesce(p.tag, 'daily') as tag,
      p.author_id,
      p.author_username,
      pr.avatar_url as author_avatar_url,
      p.created_at,
      p.updated_at,
      p.status,
      p.comment_count,
      p.like_count,
      exists (
        select 1
        from public.likes l
        where l.post_id = p.id
          and l.user_id = v_viewer_id
      ) as is_liked,
      coalesce(p.image_count, 0)::integer as image_count,
      coalesce(p.cover_image_url, '') as cover_image_url,
      coalesce(
        preview_images.images,
        case
          when coalesce(p.cover_image_url, '') <> '' then jsonb_build_array(jsonb_build_object(
            'id', p.id::text || '-cover',
            'url', p.cover_image_url,
            'publicId', '',
            'width', 0,
            'height', 0,
            'format', '',
            'sortOrder', 0,
            'isCover', true
          ))
          else '[]'::jsonb
        end
      ) as images,
      coalesce(reply_preview.replies, '[]'::jsonb) as replies,
      coalesce(reply_preview.replies_has_more, false) as replies_has_more,
      p.search_vector,
      (p.like_count::double precision * 1.0)
      + (p.comment_count::double precision * 1.5)
      + greatest(0.0, 48.0 - extract(epoch from (now() - p.created_at)) / 3600.0) / 24.0 as hot_score
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', ranked_images.id,
        'url', ranked_images.url,
        'publicId', ranked_images.public_id,
        'width', ranked_images.width,
        'height', ranked_images.height,
        'format', ranked_images.format,
        'sortOrder', ranked_images.sort_order,
        'isCover', ranked_images.url = p.cover_image_url
      ) order by ranked_images.preview_rank, ranked_images.sort_order, ranked_images.created_at) as images
      from (
        select
          i.id,
          i.url,
          i.public_id,
          i.width,
          i.height,
          i.format,
          i.sort_order,
          i.created_at,
          case when i.url = p.cover_image_url then 0 else 1 end as preview_rank
        from public.forum_post_images i
        where i.post_id = p.id
          and i.moderation_status = 'approved'
        order by
          case when i.url = p.cover_image_url then 0 else 1 end,
          i.sort_order,
          i.created_at
        limit 4
      ) ranked_images
    ) preview_images on true
    left join lateral (
      with top_comments as (
        select *
        from (
          select
            c.id,
            c.post_id,
            c.content,
            c.author_id,
            c.author_username,
            c.parent_id,
            c.reply_to_username,
            c.created_at,
            c.updated_at,
            c.status,
            c.like_count,
            cp.avatar_url as author_avatar_url,
            row_number() over (order by c.created_at desc, c.id desc) as preview_rank
          from public.comments c
          left join public.profiles cp on cp.id = c.author_id
          where c.post_id = p.id
            and c.parent_id is null
            and (c.status is null or c.status = 'approved')
          order by c.created_at desc, c.id desc
          limit 4
        ) ranked_comments
      )
    select
      coalesce(
        jsonb_agg(jsonb_build_object(
          'id', tc.id,
          'post_id', tc.post_id,
          'content', tc.content,
          'author_id', tc.author_id,
          'author_username', tc.author_username,
          'author_avatar_url', tc.author_avatar_url,
          'parent_id', tc.parent_id,
          'reply_to_username', tc.reply_to_username,
          'created_at', tc.created_at,
          'updated_at', tc.updated_at,
          'status', tc.status,
          'like_count', tc.like_count
        ) order by tc.created_at desc, tc.id desc) filter (where tc.id is not null and tc.preview_rank <= 3),  -- TODO: 将回复预览数量参数化
        '[]'::jsonb
      ) as replies,
        count(*) > 3 as replies_has_more
      from top_comments tc
    ) reply_preview on true
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (v_tag = '' or coalesce(p.tag, 'daily') = v_tag)
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
          'MaxFragments=2, FragmentDelimiter=" ... ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
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
    p.tag,
    p.author_id,
    p.author_username,
    p.author_avatar_url,
    p.created_at,
    p.updated_at,
    p.status,
    p.comment_count,
    p.like_count,
    p.is_liked,
    p.image_count,
    p.cover_image_url,
    p.images,
    p.replies,
    p.replies_has_more,
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

grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) to anon;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) to service_role;

comment on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) is
  '论坛列表查询；返回点赞状态、最多 4 张预览图、最多 3 条顶级评论预览，支持标签、搜索与排序。';

notify pgrst, 'reload schema';

commit;
