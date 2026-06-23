begin;

-- ============================================================
-- Phase 1: 性能优化与迁移修复
-- ============================================================

-- --------------------------------------------------
-- 1. 删除重复冗余索引
--    以下索引与更新的 superset 索引完全重复:
--    - idx_posts_status_created_id supersedes idx_posts_status_created/created_at/created_at_id
--    - idx_posts_author_created_id supersedes idx_posts_author_id_created_at
-- --------------------------------------------------
drop index if exists public.idx_posts_status_created;
drop index if exists public.idx_posts_status_created_at;
drop index if exists public.idx_posts_status_created_at_id;
drop index if exists public.idx_posts_author_id_created_at;

-- --------------------------------------------------
-- 2. 补全缺失的迁移：create_like_notification 函数和 trigger
--    该函数存在于线上数据库但未纳入迁移链。
--    基于 create_comment_notification 的同样模式重建。
-- --------------------------------------------------
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

-- --------------------------------------------------
-- 3. Admin 数据管理统计优化
--    全表 COUNT(*) 改用 pg_class.reltuples 近似值，
--    带 WHERE 条件的保留精确 COUNT(*)。
-- --------------------------------------------------
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

notify pgrst, 'reload schema';

commit;
