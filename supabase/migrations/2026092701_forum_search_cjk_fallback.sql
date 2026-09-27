-- 论坛搜索：中文（CJK）子串兜底 + 相关度恒优先 + 中文高亮兜底
--
-- 背景（线上实测，2026-09-27）：
--   posts.search_vector 是 generated column，用 'simple' 配置（见 2026050702）。
--   simple 不切中文 —— 一整段中文（以标点/空格为界）被当作**单个词元**，于是：
--     to_tsvector('simple','今天去海边玩了，天气很好')  →  '今天去海边玩了':1 '天气很好':2
--     websearch_to_tsquery('simple','天气')             →  '天气'   →  @@ = false
--   即「只有输入的词恰好等于帖子里被标点隔开的那一整段，才搜得到」。
--   搜「天气 / 活动 / 抽奖」这类两字词基本全军覆没 —— 搜索对中文等于失效。
--
-- 本迁移四件事：
--   1) 装 pg_trgm（若未装）+ 给 title / content 建 gin_trgm_ops 索引
--      （≥3 字词走索引；中文两字词的 %ab% 无可提取 trigram，仍走顺序扫描 ——
--        posts 目前仅百余行，代价可忽略；索引是为将来行数增长预留）
--   2) list_forum_posts 搜索条件并列 ILIKE 子串兜底 → 中文两字词立刻可搜
--   3) 相关度改为分层加权且**始终优先**：标题命中 1.0 > 正文命中 0.4 > 向量命中 ≤0.3；
--      旧实现只在 v_sort='latest' 时按 ts_rank_cd 排 —— 带关键词切「最热」就变成
--      纯热度排序，相关度完全丢失。现在热度只作次级排序键。
--   4) 中文高亮：ts_headline 同样依赖分词、对中文不产出 [[ ]] 标记；
--      新增 forum_search_excerpt() 做「关键词窗口截取 + [[ ]]」兜底。
--
-- 刻意不改搜索向量列的表达式（generated stored 列要重建全表 + 依赖），
-- 也不引入 pgroonga / zhparser（前者改动面大，后者 Supabase 装不上）。

begin;

create extension if not exists pg_trgm;

create index if not exists idx_posts_title_trgm
  on public.posts using gin (title gin_trgm_ops);

create index if not exists idx_posts_content_trgm
  on public.posts using gin (content gin_trgm_ops);

/* 中文高亮兜底：定位 p_query 在 p_text 里的**子串**位置，截取前后窗口并用 [[ ]] 标出关键词；
   未命中子串返回 null（交由 ts_headline 接管）。
   为什么不用 ts_headline：它按词元定位，而中文整段被当作一个词元 → 永远定位不到关键词。 */
create or replace function public.forum_search_excerpt(p_text text, p_query text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := coalesce(p_text, '');
  v_q text := trim(coalesce(p_query, ''));
  v_before constant integer := 30;   -- 关键词前保留的字符数
  v_after constant integer := 40;    -- 关键词后保留的字符数
  v_pos integer;
  v_len integer;
  v_start integer;
  v_end integer;
begin
  if v_text = '' or v_q = '' then
    return null;
  end if;

  v_pos := strpos(lower(v_text), lower(v_q));
  if v_pos = 0 then
    return null;
  end if;

  v_len := char_length(v_q);
  v_start := greatest(1, v_pos - v_before);
  v_end := least(char_length(v_text), v_pos + v_len + v_after);

  return
    (case when v_start > 1 then '…' else '' end)
    || substring(v_text from v_start for v_pos - v_start)
    || '[[' || substring(v_text from v_pos for v_len) || ']]'
    || substring(v_text from v_pos + v_len for v_end - (v_pos + v_len) + 1)
    || (case when v_end < char_length(v_text) then '…' else '' end);
end;
$$;

-- 授权：RPC 是 invoker 权限，调用方需本函数的 EXECUTE（与论坛体系其他 helper 同口径）
revoke execute on function public.forum_search_excerpt(text, text) from anon, authenticated, public;
grant execute on function public.forum_search_excerpt(text, text) to authenticated, service_role;

create or replace function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null,
  p_tag_filter text default null,
  p_following_user_ids uuid[] default null::uuid[]
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
  author_avatar_frame_url text,
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
  v_following_ids uuid[];
  -- 搜索用：tsquery 与「转义后的 ILIKE 模式」（见下方 CJK 兜底说明）
  v_tsquery tsquery;
  v_like text;
begin
  /* ---------- 搜索前置计算（2026-09-27 CJK 兜底）----------
     ⚠️ websearch_to_tsquery('simple', …) 对中文近乎无效：simple 不切中文，
     一整段中文（以标点/空格为界）会被当成单个词元，只有输入恰好等于该整段才命中。
     线上实测：to_tsvector('simple','今天去海边玩了，天气很好') @@ websearch_to_tsquery('simple','天气') = false
     所以必须并列一条 ILIKE 子串条件，中文两字词才搜得到（见 filtered CTE）。
     ILIKE 模式里的 % 与 _ 要转义，否则用户输入 "%" 会退化成「匹配一切」。 */
  if v_has_query then
    v_tsquery := websearch_to_tsquery('simple', v_query);
    v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- 服务端校验：只保留当前用户实际关注的用户 ID
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
      pr.avatar_frame_url as author_avatar_frame_url,
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
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (v_tag = '' or coalesce(p.tag, 'daily') = v_tag)
      and (
        p.status = 'approved'
        or (p_include_author_non_approved and p_author_id is not null and p.author_id = p_author_id)
      )
      and (v_following_ids is null or p.author_id = any(v_following_ids))
  ),
  filtered as (
    select
      bp.*,
      case when v_has_query then v_tsquery else null end as query_ts,
      -- 摘要的来源文本（与 ts_headline 原口径一致），提前算一次给高亮复用
      coalesce(nullif(bp.body, ''), bp.content) as excerpt_source
    from base_posts bp
    where
      (not v_has_query)
      -- ① 全文向量命中（英文/词形变化，以及「整段」恰好相等的中文）
      or (bp.search_vector @@ v_tsquery)
      -- ② CJK 兜底：子串命中。这一条才是中文搜索真正生效的那条。
      or (bp.title ilike v_like)
      or (bp.content ilike v_like)
  ),
  ranked as (
    select
      f.*,
      /* 相关度（分层加权，2026-09-27）：
           标题命中 1.0  >  正文命中 0.4  >  纯向量命中 ≤0.3
         向量项刻意给得最小：ts_rank_cd 对中文几乎恒为 0（分词失效），
         真正决定中文排序的是那两条 ILIKE，所以它们必须压过向量项。
         least(1.0, …) 保证向量项永远超不过「正文命中」——
         否则英文帖子会盖住中文子串命中。 */
      case
        when not v_has_query then 0::real
        else (
          (case when coalesce(f.title, '') ilike v_like then 1.0 else 0.0 end)
          + (case when coalesce(f.content, '') ilike v_like then 0.4 else 0.0 end)
          + (case when f.search_vector @@ v_tsquery
                  then 0.3 * least(1.0, ts_rank_cd(f.search_vector, v_tsquery))
                  else 0.0 end)
        )::real
      end as search_rank,
      /* 高亮：先试 CJK 兜底（关键词窗口截取 + [[ ]]），
         未命中子串再交回 ts_headline（英文词形变化的正确做法）。 */
      case
        when not v_has_query then null
        else coalesce(
          public.forum_search_excerpt(f.excerpt_source, v_query),
          ts_headline(
            'simple',
            f.excerpt_source,
            f.query_ts,
            'MaxFragments=2, FragmentDelimiter=" ... ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
          )
        )
      end as search_excerpt,
      row_number() over (
        order by
          /* ⚠️ 有搜索词时恒以相关度优先（不再看 v_sort）：
             旧写法是 `v_has_query and v_sort = 'latest'`，导致「带关键词切到最热」
             变成纯热度排序 —— 搜出来的东西看着毫不相关。热度降为次级排序键。 */
          case
            when v_has_query then (
              (case when coalesce(f.title, '') ilike v_like then 1.0 else 0.0 end)
              + (case when coalesce(f.content, '') ilike v_like then 0.4 else 0.0 end)
              + (case when f.search_vector @@ v_tsquery
                      then 0.3 * least(1.0, ts_rank_cd(f.search_vector, v_tsquery))
                      else 0.0 end)
            )
          end desc nulls last,
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
    p.author_avatar_frame_url,
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

-- create or replace 保留原 ACL；这里重述一遍以保证幂等（若函数曾被 drop）
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) from anon, public;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) to service_role;

notify pgrst, 'reload schema';

commit;
