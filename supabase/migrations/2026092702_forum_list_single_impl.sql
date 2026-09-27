-- 论坛列表 RPC：三个重载收敛为「一份实现 + 两个兼容 wrapper」，并补齐头像框字段
--
-- 背景（2026-09-27 线上实测）：
--   库里同时存在 list_forum_posts 的三个重载（7 / 8 / 9 参数），是历史迭代层层叠加的产物：
--     2026062303 起             → 7 参数
--     2026062903 加 following   → 8 参数
--     2026090705 加 kind_filter → 9 参数
--     2026091106 加头像框        → 只改了 8 参数那一个
--   create or replace 只能替换「同签名」的函数、删不掉旧签名，于是三份各约 300 行的实现
--   长期并存、各自漂移。线上后果（pg_stat_statements 实测）：
--     · 7 参数（25543 次调用）与 9 参数（78 次）返回 23 列、**不含 author_avatar_frame_url**
--       → 「头像框全站可见」实际只覆盖了 8 参数那一条路径
--     · 7 参数是主力，却既没有 kind_filter，也拿不到 2026092701 的 CJK 搜索兜底
--     · 9 参数版本的 ACL 残留 anon 与 PUBLIC（`=X/postgres`），与 2026062307 的撤权意图相悖
--
--   本迁移收敛为「一份实现 + 两个兼容 wrapper」：
--     唯一实现 = 9 参数版本（参数最全），返回 24 列（含头像框）
--     8 参数   = 薄 wrapper（转调唯一实现，保持 24 列形状）
--     7 参数   = 薄 wrapper（转调唯一实现，投影掉头像框列，保持原 23 列形状 ——
--                旧客户端读到的字段一个不少、一个不多）
--   动机：让「帖子列表到底怎么查」重新变成单源。以后改只动唯一实现。
--   ⚠️ 保留 wrapper 而不是直接删：7 参数仍有大量真实调用，删掉会让旧客户端掉进
--      post-api.js 的「RPC 缺失 → 直连查表」降级分支（性能差、且过滤语义会漂）。

begin;

-- ============================================================
-- ① 唯一实现（9 参数）：drop 后重建。
--    返回类型要从 23 列变 24 列，create or replace 不允许改返回类型，
--    只能 drop + create —— 同事务内完成，不存在空窗。
-- ============================================================
drop function if exists public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[], text);

create or replace function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null,
  p_tag_filter text default null,
  p_following_user_ids uuid[] default null::uuid[],
  -- 内容类型筛选：'post' 论坛（普通帖 + 转发）/ 'news' 官方新闻卡 / 'activity' 官方活动卡
  -- '' 或 null = 不过滤（旧客户端不传，行为与升级前一致）
  p_kind_filter text default null
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
  v_kind text := lower(trim(coalesce(p_kind_filter, '')));
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

  if v_kind not in ('post', 'news', 'activity') then
    v_kind := '';
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
      -- 内容类型筛选：官方卡按镜像列 post_kind 过滤；「论坛」= 普通帖 + 用户转发
      and (
        v_kind = ''
        or (v_kind = 'post' and coalesce(p.post_kind, 'post') in ('post', 'repost'))
        or (v_kind = 'news' and p.post_kind = 'news')
        or (v_kind = 'activity' and p.post_kind = 'activity')
      )
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

-- ============================================================
-- ② 8 参数兼容 wrapper（24 列，形状与升级前逐列一致）
-- ============================================================
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
returns TABLE(id uuid, content text, title text, body text, tag text, author_id uuid, author_username text, author_avatar_url text, author_avatar_frame_url text, created_at timestamp with time zone, updated_at timestamp with time zone, status text, comment_count bigint, like_count bigint, is_liked boolean, image_count integer, cover_image_url text, images jsonb, replies jsonb, replies_has_more boolean, hot_score double precision, search_rank real, search_excerpt text, has_more boolean)
language sql
stable
set search_path = public
as $$
  -- 薄包装：不传 p_kind_filter（旧签名没有这个概念，按「不过滤」处理）
  select *
  from public.list_forum_posts(
    p_page, p_page_size, p_sort, p_author_id, p_include_author_non_approved,
    p_search_query, p_tag_filter, p_following_user_ids, null::text
  );
$$;

-- ============================================================
-- ③ 7 参数兼容 wrapper（23 列：刻意投影掉 author_avatar_frame_url）
-- ============================================================
create or replace function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null,
  p_tag_filter text default null
)
returns TABLE(id uuid, content text, title text, body text, tag text, author_id uuid, author_username text, author_avatar_url text, created_at timestamp with time zone, updated_at timestamp with time zone, status text, comment_count bigint, like_count bigint, is_liked boolean, image_count integer, cover_image_url text, images jsonb, replies jsonb, replies_has_more boolean, hot_score double precision, search_rank real, search_excerpt text, has_more boolean)
language sql
stable
set search_path = public
as $$
  select
    r.id, r.content, r.title, r.body, r.tag,
    r.author_id, r.author_username, r.author_avatar_url,
    r.created_at, r.updated_at, r.status,
    r.comment_count, r.like_count, r.is_liked,
    r.image_count, r.cover_image_url, r.images, r.replies, r.replies_has_more,
    r.hot_score, r.search_rank, r.search_excerpt, r.has_more
  from public.list_forum_posts(
    p_page, p_page_size, p_sort, p_author_id, p_include_author_non_approved,
    p_search_query, p_tag_filter, null::uuid[], null::text
  ) r;
$$;

-- ============================================================
-- ④ 授权：三个签名逐一收紧 —— 撤 anon 与 PUBLIC，只留 authenticated / service_role
--    （9 参数版本此前残留 anon + `=X/postgres`，见文件头说明）
-- ============================================================
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from anon, public;
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) from anon, public;
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[], text) from anon, public;

grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) to authenticated, service_role;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) to authenticated, service_role;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[], text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
