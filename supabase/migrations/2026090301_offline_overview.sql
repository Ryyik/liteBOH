-- 2026090301_offline_overview.sql
-- 离线回顾智能概览：聚合用户上次活跃（锚点）之后新发布的论坛帖子与站点新闻，
-- 合并按发布时间倒序返回，供 /overview 独立概览页使用。
-- 采用 invoker 权限（同 list_forum_posts 模式）：查询自动受 posts / news / profiles 表级 RLS 约束，
-- 函数内同时显式复刻 posts.status = 'approved' 过滤，形成双重防线。
-- 前端传入的 p_anchor 仅用于本人查询范围，服务端做合理性钳制（非未来时间、最早 90 天）；
-- 未传时回退读取 profiles.last_active_at，两者皆空则进入首次登录模式（返回最近 7 天内容）。

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
    -- 首次登录（无历史活跃时间）：展示最近 7 天内容，不拉取全量历史
    v_anchor := now() - interval '7 days';
    v_is_first_login := true;
    v_anchor_source := 'first_login';
  else
    -- 锚点钳制：不晚于当前时间、最早不超过 90 天
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
    select
      'post'::text as type,
      p.id::text as id,
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      left(coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), p.content), 160) as excerpt,
      coalesce(p.author_username, '') as author,
      pr.avatar_url as author_avatar,
      p.created_at as published_at,
      nullif(coalesce(p.cover_image_url, ''), '') as image,
      coalesce(p.tag, 'daily') as category
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    where p.status = 'approved'
      and p.created_at > v_anchor
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
      n.category::text
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
      'category', t.category
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
  '离线回顾智能概览：聚合锚点之后新发布的已批准帖子和公开新闻，仅限当前登录用户。';

notify pgrst, 'reload schema';

commit;
