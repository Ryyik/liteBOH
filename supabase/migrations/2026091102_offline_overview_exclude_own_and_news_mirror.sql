-- 2026091101_offline_overview_exclude_own_and_news_mirror.sql
-- 智能离线概览纳入/排除规则收紧（20260911 拍板，仅影响 get_offline_overview 摘要查询，
-- 不影响论坛列表、转发功能与任何帖子数据）：
--
-- 1) 排除本人内容：本人发布的帖 + 本人转发别人的帖（repost 的 author_id 同为本人），
--    一条条件全覆盖 —— p.author_id is distinct from v_user_id；
--    他人转发的帖（author_id ≠ 本人）保留；author_id 为 NULL 的历史帖/镜像卡不受影响。
-- 2) 排除新闻官方镜像卡：news 的触发器会同步一张 created_at 与源同刻的镜像卡进 posts，
--    与 news 分支必成对重复 —— 排除 p.source_type = 'news' 的卡，新闻由 news 分支唯一呈现；
--    活动镜像卡（source_type='activity'）保留（activities 无独立分支，是其进摘要的唯一通道）。
-- 其余逻辑与 2026090301 完全一致（锚点钳制 / first_login / 分页 / invoker RLS 双重防线）。

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
      coalesce(p.tag, 'daily') as category
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
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
  '离线回顾智能概览：聚合锚点之后新发布的已批准帖子和公开新闻（排除本人所发/本人转发、新闻官方镜像卡），仅限当前登录用户。';

notify pgrst, 'reload schema';

commit;
