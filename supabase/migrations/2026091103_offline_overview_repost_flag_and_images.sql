-- 2026091103_offline_overview_repost_flag_and_images.sql
-- 智能概览摘要卡排版数据支持（20260911 拍板）：
-- 1) posts 分支新增 is_repost（repost_of_post_id 非空 => 他人转发，前端展示「转发」徽标；
--    本人转发已在 2026091102 被排除，不会出现在摘要里）；
-- 2) posts 分支新增 images（forum_post_images 前 3 张 url，moderation_status='approved'，
--    sort_order 排序，与论坛列表 RPC 同口径；前端多图并排横排 + 「+N」角标）；
--    配套 image_count（posts.image_count 列，由 update_forum_post_images 维护，老帖可能为 0），
--    前端角标优先用 image_count，缺失时回退 images.length；
-- 3) news 分支补齐对齐列（image_count=0 / is_repost=false / images='[]'），news 单图仍走 image 字段。

begin;

create or replace function public.get_offline_overview(
  p_anchor timestamptz default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anchor timestamptz;
  v_anchor_source text;
  v_is_first_login boolean := false;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_overview jsonb;
begin
  if v_user_id is null then
    raise exception '概览需要登录后使用';
  end if;

  v_anchor := p_anchor;
  v_anchor_source := 'param';

  if v_anchor is null then
    select last_active_at into v_anchor
    from public.profiles
    where id = v_user_id;
    v_anchor_source := 'profile';
  end if;

  if v_anchor is null then
    v_anchor := now() - interval '7 days';
    v_is_first_login := true;
    v_anchor_source := 'first_login';
  else
    if v_anchor > now() then
      v_anchor := now();
    end if;
    if v_anchor < now() - interval '90 days' then
      v_anchor := now() - interval '90 days';
      v_anchor_source := 'clamped';
    end if;
  end if;

  with overview_items as (
    -- 论坛帖子：与论坛列表一致的审核与可见性规则
    -- + 排除本人所发（含本人转发）；排除新闻官方镜像卡（新闻由下方 news 分支唯一呈现）
    select
      'post'::text as type,
      p.id::text as id,
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      left(coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), p.content), 160) as excerpt,
      coalesce(p.author_username, '') as author,
      pr.avatar_url as author_avatar,
      p.created_at as published_at,
      nullif(coalesce(p.cover_image_url, ''), '') as image,
      coalesce(p.tag, 'daily') as category,
      coalesce(p.image_count, 0)::integer as image_count,
      (p.repost_of_post_id is not null) as is_repost,
      coalesce(post_images.images, '[]'::jsonb) as images
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join lateral (
      select coalesce(jsonb_agg(i.url order by i.sort_order, i.created_at), '[]'::jsonb) as images
      from (
        select i.url, i.sort_order, i.created_at
        from public.forum_post_images i
        where i.post_id = p.id
          and i.moderation_status = 'approved'
        order by i.sort_order, i.created_at
        limit 3
      ) i
    ) post_images on true
    where p.status = 'approved'
      and p.created_at > v_anchor
      and p.author_id is distinct from v_user_id
      and p.source_type is distinct from 'news'
    union all
    -- 站点新闻：公开发布内容，created_at 为真实入库时间（date 为管理端手填展示日期）
    select
      'news'::text as type,
      n.id::text as id,
      n.title,
      left(n.excerpt, 160),
      n.author,
      null::text,
      n.created_at,
      n.image,
      n.category::text,
      0::integer,
      false::boolean,
      '[]'::jsonb
    from public.news n
    where n.created_at > v_anchor
  )
  select jsonb_build_object(
    'anchor', v_anchor,
    'anchor_source', v_anchor_source,
    'is_first_login', v_is_first_login,
    'server_time', now(),
    'total', counts.total,
    'has_more', (counts.total > v_offset + v_limit),
    'items', coalesce(page.items, '[]'::jsonb)
  )
  into v_overview
  from (
    select count(*)::integer as total from overview_items
  ) counts
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'type', t.type,
      'id', t.id,
      'title', t.title,
      'excerpt', t.excerpt,
      'author', t.author,
      'author_avatar', t.author_avatar,
      'published_at', t.published_at,
      'image', t.image,
      'category', t.category,
      'image_count', t.image_count,
      'is_repost', t.is_repost,
      'images', t.images
    ) order by t.published_at desc) as items
    from (
      select * from overview_items
      order by published_at desc
      offset v_offset
      limit v_limit
    ) t
  ) page on true;

  return coalesce(v_overview, jsonb_build_object(
    'anchor', v_anchor,
    'anchor_source', v_anchor_source,
    'is_first_login', v_is_first_login,
    'server_time', now(),
    'total', 0,
    'has_more', false,
    'items', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_offline_overview(timestamptz, integer, integer) from public;
revoke execute on function public.get_offline_overview(timestamptz, integer, integer) from anon;
grant execute on function public.get_offline_overview(timestamptz, integer, integer) to authenticated;
grant execute on function public.get_offline_overview(timestamptz, integer, integer) to service_role;

comment on function public.get_offline_overview(timestamptz, integer, integer) is
  '离线回顾智能概览：聚合锚点之后新发布的已批准帖子和公开新闻（排除本人所发/本人转发、新闻官方镜像卡），items 含 is_repost/images/image_count 供摘要卡排版。';

notify pgrst, 'reload schema';

commit;
