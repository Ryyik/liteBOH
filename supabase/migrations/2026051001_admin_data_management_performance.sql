begin;

-- 数据管理中心性能优化：
-- 1) 让常用后台筛选/排序命中索引
-- 2) 用聚合 RPC 返回抽奖报名人数，避免前端拉取大量报名行做计数

create index if not exists idx_profiles_role_join_date
  on public.profiles (role, join_date desc);

create index if not exists idx_profiles_points_desc
  on public.profiles (points desc);

create index if not exists idx_posts_status_created
  on public.posts (status, created_at desc);

create index if not exists idx_posts_status_updated
  on public.posts (status, updated_at desc);

create index if not exists idx_comments_status_created
  on public.comments (status, created_at desc);

create index if not exists idx_messages_moderation_status_created
  on public.messages (moderation_status, created_at desc);

create index if not exists idx_user_subscriptions_expires
  on public.user_subscriptions (expires_at desc);

create index if not exists idx_user_subscriptions_status_expires
  on public.user_subscriptions (status, expires_at desc);

create index if not exists idx_user_gifts_created
  on public.user_gifts (created_at desc);

create index if not exists idx_user_gifts_status_created
  on public.user_gifts (gift_status, created_at desc);

create index if not exists idx_lotteries_status_created
  on public.lotteries (status, created_at desc);

create index if not exists idx_lotteries_fulfillment_created
  on public.lotteries (fulfillment_status, created_at desc);

create index if not exists idx_lottery_entries_created
  on public.lottery_entries (created_at);

create index if not exists idx_lottery_draw_logs_created
  on public.lottery_draw_logs (created_at desc);

create index if not exists idx_lottery_join_attempts_created
  on public.lottery_join_attempts (created_at desc);

create index if not exists idx_news_id_desc
  on public.news (id desc);

create index if not exists idx_activities_id_desc
  on public.activities (id desc);

create index if not exists idx_products_id
  on public.products (id);

create index if not exists idx_products_category
  on public.products (category);

create or replace function public.admin_lottery_entry_counts(p_lottery_ids uuid[])
returns table(lottery_id uuid, entry_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select e.lottery_id,
         count(*)::integer as entry_count
    from public.lottery_entries e
   where e.lottery_id = any(coalesce(p_lottery_ids, array[]::uuid[]))
     and public.current_user_is_admin()
   group by e.lottery_id;
$$;

revoke all on function public.admin_lottery_entry_counts(uuid[]) from public;
grant execute on function public.admin_lottery_entry_counts(uuid[]) to authenticated;
grant execute on function public.admin_lottery_entry_counts(uuid[]) to service_role;

create or replace function public.admin_data_management_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'users', (select count(*) from public.profiles),
    'points', (select count(*) from public.profiles),
    'subscriptions', (select count(*) from public.user_subscriptions),
    'activeSubscriptions', (
      select count(*)
        from public.user_subscriptions
       where status = 'active'
         and expires_at > now()
    ),
    'gifts', (select count(*) from public.user_gifts),
    'forum', (select count(*) from public.posts),
    'reportedPosts', (select count(*) from public.posts where status = 'limited'),
    'reviewPosts', (select count(*) from public.posts where status ilike 'rejected'),
    'reviewComments', (select count(*) from public.comments where status ilike 'rejected'),
    'reviewMessages', (select count(*) from public.messages where moderation_status ilike 'rejected'),
    'coreMemories', (select count(*) from public.boh_ai_core_memories),
    'lotteries', (select count(*) from public.lotteries),
    'lotteryEntries', (select count(*) from public.lottery_entries),
    'lotteryDrawLogs', (select count(*) from public.lottery_draw_logs),
    'lotteryJoinAttempts', (select count(*) from public.lottery_join_attempts),
    'news', (select count(*) from public.news),
    'activities', (select count(*) from public.activities),
    'products', (select count(*) from public.products)
  );
end;
$$;

revoke all on function public.admin_data_management_counts() from public;
grant execute on function public.admin_data_management_counts() to authenticated;
grant execute on function public.admin_data_management_counts() to service_role;

commit;
