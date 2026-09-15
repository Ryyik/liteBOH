-- 2026091501_user_activity_heatmap.sql
-- 用户活跃热力图（GitHub 贡献图同款）：服务端按「亚洲/上海」自然日聚合当前用户的发帖与回复，
-- 供个人空间「活跃轨迹」卡片渲染 53 周 × 7 天格子图。
--
-- 设计要点：
-- 1) 必须服务端聚合 —— PostgREST 无法表达 date_trunc 分组，前端拉全量 posts/comments 再算既不现实也不经济。
--    本 RPC 一次往返返回全部所需数据（含汇总与断档可推导的窗口），前端零后处理即可铺格子。
-- 2) 只返回「有活动的那一天」——多数用户一年里活跃天数是稀疏的，省略 0 值天可把 payload 压到几 KB；
--    前端依据返回的 start_date/end_date 顺序铺满整张网格。
-- 3) 时区单一源：一律 Asia/Shanghai（与 get_weekly_checkin_status / get_offline_overview 一致），
--    避免服务端 UTC 分桶导致「晚上发帖算到第二天」。
-- 4) 只统计 status = 'approved' 的内容 —— 被驳回的草稿不算社区贡献。
-- 5) 权限：函数体以 invoker 权限执行（未用 security definer），任何人调用都只能读到
--    author_id = 目标用户的 approved 内容本身；这些行在原表的公开读策略里就已可见，不引入新的数据面。
--    anon 同样放行 —— 他人主页本就匿名可见，口径要跟页面里已有的 posts 查询保持一致。

begin;

create or replace function public.get_user_activity_heatmap(
  p_user_id uuid default null,
  p_days integer default 371
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  -- 53 周 + 当天 = 371 天，与 GitHub 口径一致；下限 28 天防止无意义的碎片请求
  v_days integer := least(greatest(coalesce(p_days, 371), 28), 371);
  v_end date := (now() at time zone 'Asia/Shanghai')::date;
  v_start date;
  v_from timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception '活跃轨迹需要登录后查看';
  end if;

  v_start := v_end - (v_days - 1);
  -- 转成带时区下界以命中 created_at 上的索引
  v_from := (v_start::timestamp) at time zone 'Asia/Shanghai';

  with events as (
    select (p.created_at at time zone 'Asia/Shanghai')::date as day, 'post'::text as kind
      from public.posts p
     where p.author_id = v_user_id
       and p.status = 'approved'
       and p.created_at >= v_from
    union all
    select (c.created_at at time zone 'Asia/Shanghai')::date as day, 'comment'::text as kind
      from public.comments c
     where c.author_id = v_user_id
       and c.status = 'approved'
       and c.created_at >= v_from
  ),
  daily as (
    select
      e.day,
      count(*) filter (where e.kind = 'post')::integer    as posts,
      count(*) filter (where e.kind = 'comment')::integer as comments
      from events e
     group by e.day
  ),
  active_days as (
    select d.day from daily d where d.posts + d.comments > 0
  ),
  -- 连续天数：连续日期减去其行号得到恒定分组键，同键连续即为一段 streak
  streak_seed as (
    select a.day, a.day - (row_number() over (order by a.day))::integer as grp
      from active_days a
  ),
  streak_runs as (
    select s.grp, count(*)::integer as len from streak_seed s group by s.grp
  ),
  days_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'd', to_char(d.day, 'YYYY-MM-DD'),
             'p', d.posts,
             'c', d.comments
           ) order by d.day), '[]'::jsonb) as items
      from daily d
     where d.posts + d.comments > 0
  )
  select jsonb_build_object(
    'start_date', to_char(v_start, 'YYYY-MM-DD'),
    'end_date', to_char(v_end, 'YYYY-MM-DD'),
    'timezone', 'Asia/Shanghai',
    'total_posts', coalesce((select sum(d.posts) from daily d), 0)::integer,
    'total_comments', coalesce((select sum(d.comments) from daily d), 0)::integer,
    'active_days', coalesce((select count(*) from active_days), 0)::integer,
    'max_streak', coalesce((select max(r.len) from streak_runs r), 0)::integer,
    'days', dp.items
  )
  into v_result
  from days_payload dp;

  return v_result;
end;
$$;

revoke all on function public.get_user_activity_heatmap(uuid, integer) from public;
-- anon 一并放行：他人主页（/profile/:username）不要求登录，页面本身就在匿名读
-- approved 的 posts/comments（fetchTotalPostCount / getPostsByUsername）。若这里把 anon 挡掉，
-- 会出现「帖子列表看得到、上方热力图却是空」的自相矛盾。该函数只是把原本可见的行做日粒度聚合，
-- 不比直接 select 暴露更多东西。
grant execute on function public.get_user_activity_heatmap(uuid, integer) to anon;
grant execute on function public.get_user_activity_heatmap(uuid, integer) to authenticated;
grant execute on function public.get_user_activity_heatmap(uuid, integer) to service_role;

comment on function public.get_user_activity_heatmap(uuid, integer) is
  '用户活跃热力图：按 Asia/Shanghai 自然日聚合指定用户（默认当前登录者）已通过的发帖与回复数，返回窗口边界、汇总值与有活动日的明细，窗口最长 371 天。';

notify pgrst, 'reload schema';

commit;
