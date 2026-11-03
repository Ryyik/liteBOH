-- ============================================================================
-- P4 第一步：并存一个新实现 list_forum_posts_v2（**暂不切换线上调用**）
--
-- 为什么要改
--   现有实现是「先展开、再排序、最后分页」：
--     base_posts 对**全表每一条帖子**跑 2 个 lateral（图片 preview、评论 preview，
--     各带窗口函数和 profiles join）→ filtered → 全量 row_number 排序 → 才切第一页。
--   于是不管你取第 1 页还是第 20 页，代价都是 O(全表帖子数)。
--
--   实测（authenticated 身份，158 条帖子，稳态）：
--     整条 RPC                                     15.8 ms
--     只取分页要用的 21 个 id（不展开 lateral）      0.3 ms
--     先定 21 个 id、再展开这 21 行                 3.6 ms
--   ⇒ 12 ms 全花在「最终不看的那 137 条帖子」上；而且帖子越多越糟（近似线性）。
--
-- 怎么改（只调顺序，不改语义）
--   post_base   只读 posts，算出 title/body/tag/hot_score（这些不依赖 lateral）
--   candidate   只算 search_rank（依赖 title/content/search_vector，同样不依赖 lateral）
--   ranked      row_number() 排序（排序键只用到 search_rank / hot_score / created_at / id）
--   page_rows   在这里才切分页（fetch_size = page_size + 1，用于算 has_more）
--   enriched    只对**这一页的行**展开 2 个 lateral、算 is_liked、算 search_excerpt
--
-- 为什么排序键可以等价
--   原实现的窗口排序键是 `case when v_has_query then <rank> end desc nulls last`，
--   而输出列 search_rank 是 `case when not v_has_query then 0 else <rank> end`。
--   无搜索词时：排序键为 NULL（全部相同）vs 用 0.0（也全部相同）—— 常量不改变顺序。
--   有搜索词时：两者是同一个表达式。⇒ 用 search_rank 直接排序结果一致。
--
-- 别的等价性说明
--   · 两个 lateral 块逐字照搬（含 jsonb_build_object 字段顺序、filter 条件、limit 4）
--   · search_excerpt 只对页内行计算（它不参与排序，纯输出列）
--   · has_more 仍为「取 page_size+1 行再判断 count(*) > page_size」
-- ============================================================================

create or replace function public.list_forum_posts_v2(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null,
  p_tag_filter text default null,
  p_following_user_ids uuid[] default null,
  p_kind_filter text default null
)
returns table(
  id uuid, content text, title text, body text, tag text, author_id uuid,
  author_username text, author_avatar_url text, author_avatar_frame_url text,
  created_at timestamp with time zone, updated_at timestamp with time zone, status text,
  comment_count bigint, like_count bigint, is_liked boolean, image_count integer,
  cover_image_url text, images jsonb, replies jsonb, replies_has_more boolean,
  hot_score double precision, search_rank real, search_excerpt text, has_more boolean
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_fetch_size integer := v_page_size + 1;
  v_offset integer := (v_page - 1) * v_page_size;
  v_sort text := lower(trim(coalesce(p_sort, 'latest')));
  v_query text := nullif(trim(coalesce(p_search_query, '')), '');
  v_tag text := lower(trim(coalesce(p_tag_filter, '')));
  v_kind text := lower(trim(coalesce(p_kind_filter, '')));
  v_viewer_id uuid := auth.uid();
  v_has_query boolean := v_query is not null;
  v_following_ids uuid[];
  v_tsquery tsquery;
  v_like text;
begin
  if v_has_query then
    v_tsquery := websearch_to_tsquery('simple', v_query);
    v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  if p_following_user_ids is not null then
      select array_agg(uf.following_id) into v_following_ids
      from public.user_follows uf
      where uf.follower_id = v_viewer_id
        and uf.following_id = any(p_following_user_ids);
      if v_following_ids is null then
          v_following_ids := array['00000000-0000-0000-0000-000000000000'::uuid];
      end if;
  else
      v_following_ids := null;
  end if;

  if v_sort not in ('latest', 'hottest') then
    v_sort := 'latest';
  end if;

  if v_tag not in ('server', 'activity', 'daily', 'question') then
    v_tag := '';
  end if;

  if v_kind not in ('post', 'news', 'activity') then
    v_kind := '';
  end if;

  return query
  with post_base as (
    select
      p.id,
      p.content,
      p.author_id,
      p.author_username,
      p.created_at,
      p.updated_at,
      p.status,
      p.comment_count,
      p.like_count,
      coalesce(p.image_count, 0)::integer as image_count,
      p.cover_image_url,
      p.search_vector,
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), '') as body,
      coalesce(p.tag, 'daily') as tag,
      (p.like_count::double precision * 1.0)
      + (p.comment_count::double precision * 1.5)
      + greatest(0.0, 48.0 - extract(epoch from (now() - p.created_at)) / 3600.0) / 24.0 as hot_score
    from public.posts p
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (v_tag = '' or coalesce(p.tag, 'daily') = v_tag)
      and (
        p.status = 'approved'
        or (p_include_author_non_approved and p_author_id is not null and p.author_id = p_author_id)
      )
      and (v_following_ids is null or p.author_id = any(v_following_ids))
      and (
        v_kind = ''
        or (v_kind = 'post' and coalesce(p.post_kind, 'post') in ('post', 'repost'))
        or (v_kind = 'news' and p.post_kind = 'news')
        or (v_kind = 'activity' and p.post_kind = 'activity')
      )
  ),
  candidate as (
    select
      b.*,
      case
        when not v_has_query then 0::real
        else (
          (case when coalesce(b.title, '') ilike v_like then 1.0 else 0.0 end)
          + (case when coalesce(b.content, '') ilike v_like then 0.4 else 0.0 end)
          + (case when b.search_vector @@ v_tsquery
                  then 0.3 * least(1.0, ts_rank_cd(b.search_vector, v_tsquery))
                  else 0.0 end)
        )::real
      end as search_rank
    from post_base b
    where
      (not v_has_query)
      or (b.search_vector @@ v_tsquery)
      or (b.title ilike v_like)
      or (b.content ilike v_like)
  ),
  ranked as (
    select
      k.*,
      row_number() over (
        order by
          k.search_rank desc nulls last,
          case when v_sort = 'hottest' then k.hot_score end desc nulls last,
          k.created_at desc,
          k.id desc
      ) as row_num
    from candidate k
  ),
  page_rows as (
    select *
    from ranked
    where row_num > v_offset
      and row_num <= v_offset + v_fetch_size
  ),
  page_meta as (
    select (count(*) > v_page_size) as has_more
    from page_rows
  ),
  enriched as (
    select
      pg_row.id,
      pg_row.content,
      pg_row.title,
      pg_row.body,
      pg_row.tag,
      pg_row.author_id,
      pg_row.author_username,
      pr.avatar_url as author_avatar_url,
      pr.avatar_frame_url as author_avatar_frame_url,
      pg_row.created_at,
      pg_row.updated_at,
      pg_row.status,
      pg_row.comment_count,
      pg_row.like_count,
      exists (
        select 1
        from public.likes l
        where l.post_id = pg_row.id
          and l.user_id = v_viewer_id
      ) as is_liked,
      pg_row.image_count,
      coalesce(pg_row.cover_image_url, '') as cover_image_url,
      coalesce(
        preview_images.images,
        case
          when coalesce(pg_row.cover_image_url, '') <> '' then jsonb_build_array(jsonb_build_object(
            'id', pg_row.id::text || '-cover',
            'url', pg_row.cover_image_url,
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
      pg_row.hot_score,
      pg_row.search_rank,
      case
        when not v_has_query then null
        else coalesce(
          public.forum_search_excerpt(coalesce(nullif(pg_row.body, ''), pg_row.content), v_query),
          ts_headline(
            'simple',
            coalesce(nullif(pg_row.body, ''), pg_row.content),
            case when v_has_query then v_tsquery else null end,
            'MaxFragments=2, FragmentDelimiter=" ... ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
          )
        )
      end as search_excerpt,
      pg_row.row_num
    from page_rows pg_row
    join public.posts p on p.id = pg_row.id
    left join public.profiles pr on pr.id = pg_row.author_id
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
            c.created_at as updated_at,
            c.status,
            0::integer as like_count,
            cp.avatar_url as author_avatar_url,
            cp.avatar_frame_url as author_avatar_frame_url,
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
            'author_avatar_frame_url', tc.author_avatar_frame_url,
            'parent_id', tc.parent_id,
            'reply_to_username', tc.reply_to_username,
            'created_at', tc.created_at,
            'updated_at', tc.updated_at,
            'status', tc.status,
            'like_count', tc.like_count
          ) order by tc.created_at desc, tc.id desc) filter (where tc.id is not null and tc.preview_rank <= 3),
          '[]'::jsonb
        ) as replies,
        count(*) > 3 as replies_has_more
      from top_comments tc
    ) reply_preview on true
  )
  select
    e.id,
    e.content,
    e.title,
    e.body,
    e.tag,
    e.author_id,
    e.author_username,
    e.author_avatar_url,
    e.author_avatar_frame_url,
    e.created_at,
    e.updated_at,
    e.status,
    e.comment_count,
    e.like_count,
    e.is_liked,
    e.image_count,
    e.cover_image_url,
    e.images,
    e.replies,
    e.replies_has_more,
    e.hot_score,
    e.search_rank,
    e.search_excerpt,
    pm.has_more
  from enriched e
  cross join page_meta pm
  where e.row_num <= v_offset + v_page_size
  order by e.row_num;
end;
$function$;
