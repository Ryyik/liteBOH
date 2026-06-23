begin;

-- ============================================================
-- 1. RPC: 获取即将过生日的用户（服务端计算，避免客户端 JS 全量排序）
-- ============================================================
create or replace function public.get_recent_birthday_profiles(p_limit int default 8)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  join_date timestamptz,
  birth_month int,
  birth_day int,
  last_active_at timestamptz,
  hide_online_status boolean,
  birthday_days_until int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now date := current_date;
  v_current_year int := extract(year from v_now)::int;
begin
  return query
  with birthday_data as (
    select
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.join_date,
      p.birth_month::int as birth_month,
      p.birth_day::int as birth_day,
      p.last_active_at,
      p.hide_online_status,
      case
        when p.birth_month::int between 1 and 12
             and p.birth_day::int between 1 and
               case p.birth_month::int
                 when 2 then 29
                 when 4 then 30 when 6 then 30
                 when 9 then 30 when 11 then 30
                 else 31
               end
             and make_date(v_current_year, p.birth_month::int, p.birth_day::int) >= v_now
          then make_date(v_current_year, p.birth_month::int, p.birth_day::int) - v_now
        else make_date(v_current_year + 1, p.birth_month::int, p.birth_day::int) - v_now
      end as days_until
    from public.profiles p
    where p.birth_month is not null
      and p.birth_day is not null
      and p.birth_month ~ '^\d+$'
      and p.birth_day ~ '^\d+$'
  )
  select
    bd.id,
    bd.username,
    bd.avatar_url,
    bd.bio,
    bd.join_date,
    bd.birth_month,
    bd.birth_day,
    bd.last_active_at,
    bd.hide_online_status,
    bd.days_until as birthday_days_until
  from birthday_data bd
  order by bd.days_until asc, bd.username asc nulls last
  limit p_limit;
end;
$$;

grant execute on function public.get_recent_birthday_profiles(int) to authenticated;
grant execute on function public.get_recent_birthday_profiles(int) to anon;

comment on function public.get_recent_birthday_profiles is '获取最近过生日的用户列表，服务端计算距离天数并排序';

-- ============================================================
-- 2. forum_post_images 添加覆盖索引 (post_id, sort_order, moderation_status)
--    帖子列表 RPC 中按 post_id + sort_order 取图，同时需过滤审核状态
-- ============================================================
create index if not exists idx_forum_post_images_post_order_moderation
  on public.forum_post_images (post_id, sort_order, moderation_status);

-- ============================================================
-- 3. forum_rate_limit_events 添加复合索引 (user_id, target_type, created_at desc)
--    支持按用户+操作类型查询限流事件
-- ============================================================
create index if not exists idx_forum_rate_limit_events_user_type_created
  on public.forum_rate_limit_events (user_id, target_type, created_at desc);

-- ============================================================
-- 4. notifications: 将 self-action 过滤推到数据库层
--    为 getUnreadNotificationCount 查询优化
-- ============================================================
create or replace function public.get_unread_notification_count(p_recipient_id uuid)
returns table (count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select count(1)::bigint
  from public.notifications n
  where n.recipient_id = p_recipient_id
    and n.status = 'unread'
    and (
      n.sender_id is null
      or n.sender_id is distinct from p_recipient_id
      or n.type not in ('like', 'comment')
    );
end;
$$;

grant execute on function public.get_unread_notification_count(uuid) to authenticated;

comment on function public.get_unread_notification_count is '获取未读通知数（排除用户自身操作的 like/comment 通知）';

notify pgrst, 'reload schema';

commit;
