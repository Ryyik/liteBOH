-- ============================================================
-- 合并迁移脚本：2026年6月23-24日
-- 可直接在 Supabase SQL Editor 中粘贴执行
-- ============================================================

begin;

-- ============================================================
-- 1. 创建 rate_limits 表 (DB-backed rate limits for Edge Functions)
-- ============================================================
create table if not exists public._rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. notifications 表增加 archived_at 字段
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'archived_at'
  ) then
    alter table public.notifications
      add column archived_at timestamp with time zone default null;
  end if;
end $$;

-- 索引：按接收者查询未归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_active
  ON public.notifications USING btree (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;

-- 索引：按接收者查询已归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON public.notifications USING btree (recipient_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.notifications.archived_at IS '归档时间，NULL 表示未归档；非 NULL 表示已归档';

-- ============================================================
-- 3. 将 notifications 表加入 supabase_realtime publication
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ============================================================
-- 4. notifications 表增加 UPDATE RLS 策略
-- ============================================================
drop policy if exists "Users can update their own notifications" on public.notifications;

create policy "Users can update their own notifications"
  on public.notifications
  for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- ============================================================
-- 5. 帖子表添加位置支持字段
-- ============================================================
alter table public.posts add column if not exists location_name text;
alter table public.posts add column if not exists location_lat double precision;
alter table public.posts add column if not exists location_lng double precision;

-- ============================================================
-- 6. 性能优化索引
-- ============================================================
-- 删除重复冗余索引
drop index if exists public.idx_posts_status_created;
drop index if exists public.idx_posts_status_created_at;
drop index if exists public.idx_posts_status_created_at_id;
drop index if exists public.idx_posts_author_id_created_at;

-- 创建新索引
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

-- forum_post_images 添加覆盖索引
create index if not exists idx_forum_post_images_post_order_moderation
  on public.forum_post_images (post_id, sort_order, moderation_status);

-- forum_rate_limit_events 添加复合索引
create index if not exists idx_forum_rate_limit_events_user_type_created
  on public.forum_rate_limit_events (user_id, target_type, created_at desc);

-- ============================================================
-- 7. 创建/更新 RPC 函数
-- ============================================================

-- 7.1 创建通知标记已读的 RPC 函数
drop function if exists public.mark_single_as_read(uuid);
drop function if exists public.mark_all_as_read(uuid);

-- 标记单条通知为已读
create or replace function public.mark_single_as_read(notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count int;
  caller_id uuid;
begin
  caller_id := auth.uid();
  if notification_id is null then
    raise exception 'notification_id 不能为空';
  end if;
  if caller_id is null then
    raise exception '用户未认证';
  end if;
  update public.notifications
  set status = 'read'
  where id = notification_id
    and status = 'unread'
    and recipient_id = caller_id;
  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

comment on function public.mark_single_as_read(uuid) is
  '标记单条通知为已读，返回是否成功更新';

revoke all on function public.mark_single_as_read(uuid) from public;
grant execute on function public.mark_single_as_read(uuid) to authenticated;
grant execute on function public.mark_single_as_read(uuid) to service_role;

-- 标记用户所有未归档未读通知为已读
create or replace function public.mark_all_as_read(target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count bigint;
  caller_id uuid;
begin
  caller_id := auth.uid();
  if target_user_id is null then
    raise exception 'target_user_id 不能为空';
  end if;
  if caller_id is null then
    raise exception '用户未认证';
  end if;
  if caller_id != target_user_id then
    raise exception '只能标记自己的通知为已读';
  end if;
  update public.notifications
  set status = 'read'
  where recipient_id = target_user_id
    and status = 'unread'
    and archived_at is null;
  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

comment on function public.mark_all_as_read(uuid) is
  '标记用户所有未归档未读通知为已读，返回更新的记录数';

revoke all on function public.mark_all_as_read(uuid) from public;
grant execute on function public.mark_all_as_read(uuid) to authenticated;
grant execute on function public.mark_all_as_read(uuid) to service_role;

-- 7.2 修复 get_unread_notification_count RPC 函数
create or replace function public.get_unread_notification_count(p_recipient_id uuid)
returns table (count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  if p_recipient_id is null then
    raise exception 'p_recipient_id 不能为空';
  end if;
  caller_id := auth.uid();
  if caller_id is null then
    raise exception '用户未认证';
  end if;
  if caller_id != p_recipient_id then
    raise exception '只能查询自己的未读通知数量';
  end if;
  return query
  select count(1)::bigint
  from public.notifications n
  where n.recipient_id = p_recipient_id
    and n.status = 'unread'
    and n.archived_at is null
    and (
      n.sender_id is null
      or n.sender_id is distinct from p_recipient_id
      or n.type not in ('like', 'comment')
    );
end;
$$;

comment on function public.get_unread_notification_count(uuid) is
  '获取用户未读通知数量，排除已归档通知和自操作通知';

revoke all on function public.get_unread_notification_count(uuid) from public;
grant execute on function public.get_unread_notification_count(uuid) to authenticated;
grant execute on function public.get_unread_notification_count(uuid) to service_role;

-- 7.3 创建点赞通知触发器函数
create or replace function public.create_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author_id uuid;
begin
  select p.author_id
    into v_post_author_id
    from public.posts p
   where p.id = new.post_id;

  if v_post_author_id is not null
     and (new.user_id is null or v_post_author_id <> new.user_id) then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status,
      post_id
    )
    select
      v_post_author_id,
      new.user_id,
      'like',
      'unread',
      new.post_id
    where not exists (
      select 1
        from public.notifications n
       where n.recipient_id = v_post_author_id
         and n.type = 'like'
         and n.post_id = new.post_id
         and n.sender_id = new.user_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_on_like on public.likes;
create trigger trigger_on_like
  after insert on public.likes
  for each row
  execute function public.create_like_notification();

-- 7.4 Admin 数据管理统计优化
create or replace function public.admin_data_management_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profiles bigint;
  v_user_subscriptions bigint;
  v_user_gifts bigint;
  v_posts bigint;
  v_boh_ai_core_memories bigint;
  v_lotteries bigint;
  v_lottery_entries bigint;
  v_lottery_draw_logs bigint;
  v_lottery_join_attempts bigint;
  v_news bigint;
  v_activities bigint;
  v_products bigint;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  select coalesce(reltuples, 0)::bigint into v_profiles
    from pg_class where oid = 'public.profiles'::regclass;
  select coalesce(reltuples, 0)::bigint into v_user_subscriptions
    from pg_class where oid = 'public.user_subscriptions'::regclass;
  select coalesce(reltuples, 0)::bigint into v_user_gifts
    from pg_class where oid = 'public.user_gifts'::regclass;
  select coalesce(reltuples, 0)::bigint into v_posts
    from pg_class where oid = 'public.posts'::regclass;
  select coalesce(reltuples, 0)::bigint into v_boh_ai_core_memories
    from pg_class where oid = 'public.boh_ai_core_memories'::regclass;
  select coalesce(reltuples, 0)::bigint into v_lotteries
    from pg_class where oid = 'public.lotteries'::regclass;
  select coalesce(reltuples, 0)::bigint into v_lottery_entries
    from pg_class where oid = 'public.lottery_entries'::regclass;
  select coalesce(reltuples, 0)::bigint into v_lottery_draw_logs
    from pg_class where oid = 'public.lottery_draw_logs'::regclass;
  select coalesce(reltuples, 0)::bigint into v_lottery_join_attempts
    from pg_class where oid = 'public.lottery_join_attempts'::regclass;
  select coalesce(reltuples, 0)::bigint into v_news
    from pg_class where oid = 'public.news'::regclass;
  select coalesce(reltuples, 0)::bigint into v_activities
    from pg_class where oid = 'public.activities'::regclass;
  select coalesce(reltuples, 0)::bigint into v_products
    from pg_class where oid = 'public.products'::regclass;

  return jsonb_build_object(
    'ok', true,
    'users', v_profiles,
    'points', v_profiles,
    'subscriptions', v_user_subscriptions,
    'activeSubscriptions', (select count(*) from public.user_subscriptions where status = 'active' and expires_at > now()),
    'gifts', v_user_gifts,
    'forum', v_posts,
    'reportedPosts', (select count(*) from public.posts where status = 'limited'),
    'reviewPosts', (select count(*) from public.posts where status ilike 'rejected'),
    'reviewComments', (select count(*) from public.comments where status ilike 'rejected'),
    'coreMemories', v_boh_ai_core_memories,
    'lotteries', v_lotteries,
    'lotteryEntries', v_lottery_entries,
    'lotteryDrawLogs', v_lottery_draw_logs,
    'lotteryJoinAttempts', v_lottery_join_attempts,
    'news', v_news,
    'activities', v_activities,
    'products', v_products
  );
end;
$$;

-- 7.5 获取即将过生日的用户
create or replace function public.get_recent_birthday_profiles(p_limit int default 8)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  join_date date,
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

-- 7.6 更新论坛帖子创建函数（支持位置）
drop function if exists public.create_forum_post_with_images(text, text, text, jsonb, text, text, double precision, double precision);

create or replace function public.create_forum_post_with_images(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb,
  p_tag text default null,
  p_location_name text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_body text := trim(coalesce(p_body, ''));
  v_author_username text := left(trim(coalesce(p_author_username, '')), 80);
  v_tag text := lower(trim(coalesce(p_tag, 'daily')));
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_image jsonb;
  v_image_count integer := 0;
  v_recent_image_count integer := 0;
  v_daily_image_post_count integer := 0;
  v_oldest_recent_image_at timestamptz;
  v_today_start timestamptz := ((timezone('Asia/Shanghai', now())::date)::timestamp at time zone 'Asia/Shanghai');
  v_tomorrow_start timestamptz := (((timezone('Asia/Shanghai', now())::date + 1)::timestamp) at time zone 'Asia/Shanghai');
  v_retry_after_seconds integer := 60;
  v_post_id uuid;
  v_cloud_entry_id uuid;
  v_content text;
  v_first_image_url text := '';
  v_manual_cover_url text := '';
  v_cover_url text := '';
  v_cloud_blocks jsonb := '[]'::jsonb;
  v_cloud_image_blocks jsonb := '[]'::jsonb;
  v_url text;
  v_public_id text;
  v_width_text text;
  v_height_text text;
  v_score_text text;
  v_width integer;
  v_height integer;
  v_format text;
  v_score numeric;
  v_reason text;
  v_is_cover boolean;
  v_order integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if v_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_TITLE:请填写标题';
  end if;

  if v_body = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_BODY:请填写正文内容';
  end if;

  if v_tag not in ('server', 'activity', 'daily', 'question') then
    v_tag := 'daily';
  end if;

  if jsonb_typeof(v_images) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:INVALID_IMAGES:图片数据格式无效';
  end if;

  v_image_count := jsonb_array_length(v_images);
  if v_image_count > 6 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:POST_IMAGE_LIMIT:每个帖子最多发布 6 张图片';
  end if;

  if v_image_count > 0 and not public.current_user_is_admin() then
    select count(*)
      into v_daily_image_post_count
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.image_count, 0) > 0
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= v_today_start
       and p.created_at < v_tomorrow_start;

    if v_daily_image_post_count >= 5 then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_tomorrow_start - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'DAILY_IMAGE_POST_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:DAILY_IMAGE_POST_LIMIT:今天带图帖子发布额度已满，每天最多 5 条',
        hint = v_retry_after_seconds::text;
    end if;

    select min(p.created_at)
      into v_oldest_recent_image_at
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.image_count, 0) > 0
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '3 minutes';

    if v_oldest_recent_image_at is not null then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_image_at + interval '3 minutes' - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_POST_COOLDOWN', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_POST_COOLDOWN:图片帖发布太频繁了，请 3 分钟后再试',
        hint = v_retry_after_seconds::text;
    end if;

    select coalesce(sum(coalesce(p.image_count, 0)), 0), min(p.created_at)
      into v_recent_image_count, v_oldest_recent_image_at
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '10 minutes';

    if v_recent_image_count + v_image_count > 9 then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_image_at + interval '10 minutes' - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_10M_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_10M_LIMIT:短时间内发布图片较多，请稍后再试',
        hint = v_retry_after_seconds::text;
    end if;
  end if;

  v_content := '【' || v_title || '】' || chr(10) || v_body;

  if v_image_count > 0 then
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      if jsonb_typeof(v_image) <> 'object' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;

      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width_text := trim(coalesce(v_image ->> 'width', ''));
      v_height_text := trim(coalesce(v_image ->> 'height', ''));
      v_score_text := trim(coalesce(v_image ->> 'moderationScore', ''));
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);
      v_is_cover := lower(trim(coalesce(v_image ->> 'isCover', v_image ->> 'is_cover', 'false'))) in ('true', '1', 'yes');

      if trim(coalesce(v_image ->> 'moderationStatus', '')) <> 'approved' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:IMAGE_NOT_APPROVED:图片未通过发布前安全检测';
      end if;

      if char_length(v_url) > 2048
         or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
         or v_url !~* '[.](png|jpe?g|webp)([?#].*)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE_URL:图片来源异常，已阻止发布';
      end if;

      if v_public_id = ''
         or char_length(v_public_id) > 255
         or v_public_id like '/%'
         or v_public_id like '%..%'
         or position(chr(92) in v_public_id) > 0 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_PUBLIC_ID:图片资源标识异常，已阻止发布';
      end if;

      if v_width_text !~ '^[0-9]+$' or v_height_text !~ '^[0-9]+$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      v_width := v_width_text::integer;
      v_height := v_height_text::integer;

      if v_width <= 0
         or v_height <= 0
         or v_width > 8192
         or v_height > 8192
         or (v_width::bigint * v_height::bigint) > 25000000 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      if v_score_text <> '' and v_score_text !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;
      v_score := nullif(v_score_text, '')::numeric;

      if v_first_image_url = '' then
        v_first_image_url := v_url;
      end if;

      if v_is_cover and v_manual_cover_url = '' then
        v_manual_cover_url := v_url;
      end if;

      v_cloud_image_blocks := v_cloud_image_blocks || jsonb_build_array(jsonb_build_object(
        'type', 'image',
        'url', v_url,
        'publicId', v_public_id,
        'width', v_width,
        'height', v_height,
        'alt', '论坛图片'
      ));
    end loop;
  end if;

  v_cover_url := coalesce(nullif(v_manual_cover_url, ''), v_first_image_url);

  insert into public.posts (
    content,
    title,
    body,
    tag,
    author_id,
    author_username,
    status,
    image_count,
    cover_image_url,
    location_name,
    location_lat,
    location_lng
  )
  values (
    v_content,
    v_title,
    v_body,
    v_tag,
    v_user_id,
    v_author_username,
    'approved',
    v_image_count,
    v_cover_url,
    trim(coalesce(p_location_name, '')),
    case when p_location_lat is not null and p_location_lat between -90 and 90 then p_location_lat else null end,
    case when p_location_lng is not null and p_location_lng between -180 and 180 then p_location_lng else null end
  )
  returning id into v_post_id;

  if v_image_count > 0 then
    v_cloud_blocks := jsonb_build_array(jsonb_build_object(
      'type', 'text',
      'text', v_content
    )) || v_cloud_image_blocks;

    insert into public.boh_cloud_entries (
      user_id,
      entry_date,
      title,
      entry_type,
      visibility,
      content_text,
      content_blocks,
      cover_image_url,
      mood,
      source
    )
    values (
      v_user_id,
      timezone('Asia/Shanghai', now())::date,
      left('论坛：' || v_title, 120),
      case when v_body = '' then 'image' else 'mixed' end,
      'private',
      v_content,
      v_cloud_blocks,
      v_cover_url,
      '',
      'forum'
    )
    returning id into v_cloud_entry_id;

    update public.posts
       set forum_cloud_entry_id = v_cloud_entry_id
     where id = v_post_id;

    v_order := 0;
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width := trim(coalesce(v_image ->> 'width', ''))::integer;
      v_height := trim(coalesce(v_image ->> 'height', ''))::integer;
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_score := nullif(trim(coalesce(v_image ->> 'moderationScore', '')), '')::numeric;
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);

      insert into public.forum_post_images (
        post_id,
        user_id,
        cloud_entry_id,
        url,
        public_id,
        width,
        height,
        format,
        moderation_status,
        moderation_source,
        moderation_score,
        moderation_reason,
        sort_order
      )
      values (
        v_post_id,
        v_user_id,
        v_cloud_entry_id,
        v_url,
        v_public_id,
        v_width,
        v_height,
        v_format,
        'approved',
        'client_nsfwjs',
        v_score,
        v_reason,
        v_order
      );

      if to_regclass('public.cloudinary_pending_uploads') is not null then
        update public.cloudinary_pending_uploads
           set claimed_at = coalesce(claimed_at, now()),
               updated_at = now()
         where user_id = v_user_id
           and public_id = v_public_id
           and deleted_at is null;
      end if;

      v_order := v_order + 1;
    end loop;
  end if;

  return (
    select to_jsonb(result_row)
      from (
        select
          p.*,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', i.id,
              'url', i.url,
              'publicId', i.public_id,
              'width', i.width,
              'height', i.height,
              'format', i.format,
              'sortOrder', i.sort_order,
              'isCover', i.url = p.cover_image_url
            ) order by i.sort_order, i.created_at)
              from public.forum_post_images i
             where i.post_id = p.id
               and i.moderation_status = 'approved'
          ), '[]'::jsonb) as images
        from public.posts p
        where p.id = v_post_id
      ) result_row
  );
end;
$$;

revoke all on function public.create_forum_post_with_images(text, text, text, jsonb, text, text, double precision, double precision) from public;
grant execute on function public.create_forum_post_with_images(text, text, text, jsonb, text, text, double precision, double precision) to authenticated;
grant execute on function public.create_forum_post_with_images(text, text, text, jsonb, text, text, double precision, double precision) to service_role;

comment on function public.create_forum_post_with_images(text, text, text, jsonb, text, text, double precision, double precision) is
  '创建论坛帖子，支持图片、标签和位置定位。';

-- 7.7 修复 list_forum_posts RPC（top_comments bug）
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
          c.created_at as updated_at,  -- comments 表没有 updated_at，用 created_at 代替
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

-- ============================================================
-- 8. 权限调整：撤销 anon 对 list_forum_posts 的执行权限
-- ============================================================
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from anon;
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from public;

-- ============================================================
-- 9. 通知 PostgREST 重新加载 schema
-- ============================================================
notify pgrst, 'reload schema';

commit;