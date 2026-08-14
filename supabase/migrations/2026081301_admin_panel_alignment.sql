-- ============================================================================
-- 2026081301: 数据管理面板对齐 - RLS 修复 + 缺失 admin 策略 + 清理函数
-- 修复:
--   P0-1  ai_quota_log RLS 未启用 (安全漏洞)
--   P0-2  lottery_scheduler_logs 清理函数
--   P1    多个表缺少 admin SELECT 策略,面板无法读取
-- ============================================================================

-- ============================================
-- 1. P0-1: ai_quota_log 启用 RLS + 策略
-- ============================================
alter table public.ai_quota_log enable row level security;

drop policy if exists ai_quota_log_admin_select on public.ai_quota_log;
create policy ai_quota_log_admin_select
  on public.ai_quota_log
  for select
  using (public.current_user_is_admin());

-- service_role 始终可写(绕过 RLS)
grant select on public.ai_quota_log to authenticated;

-- ============================================
-- 2. P1: notifications 增加 admin 策略
-- ============================================
drop policy if exists notifications_admin_select on public.notifications;
create policy notifications_admin_select
  on public.notifications
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 3. P1: shop_points_orders 增加 admin 策略
-- ============================================
drop policy if exists shop_points_orders_admin_select on public.shop_points_orders;
create policy shop_points_orders_admin_select
  on public.shop_points_orders
  for select
  using (public.current_user_is_admin());

drop policy if exists shop_points_orders_admin_update on public.shop_points_orders;
create policy shop_points_orders_admin_update
  on public.shop_points_orders
  for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ============================================
-- 4. P1: anniversary_subscription_claims 增加 admin 策略
-- ============================================
drop policy if exists anniversary_subscription_claims_admin_select on public.anniversary_subscription_claims;
create policy anniversary_subscription_claims_admin_select
  on public.anniversary_subscription_claims
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 5. P1: forum_weekly_checkins 增加 admin 策略
-- ============================================
drop policy if exists forum_weekly_checkins_admin_select on public.forum_weekly_checkins;
create policy forum_weekly_checkins_admin_select
  on public.forum_weekly_checkins
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 6. P1: cloudinary_pending_uploads 增加 admin 策略
-- ============================================
drop policy if exists cloudinary_pending_uploads_admin_all on public.cloudinary_pending_uploads;
create policy cloudinary_pending_uploads_admin_all
  on public.cloudinary_pending_uploads
  for select
  using (public.current_user_is_admin());

drop policy if exists cloudinary_pending_uploads_admin_delete on public.cloudinary_pending_uploads;
create policy cloudinary_pending_uploads_admin_delete
  on public.cloudinary_pending_uploads
  for delete
  using (public.current_user_is_admin());

-- ============================================
-- 7. P1: ai_web_search_log 增加 admin 策略
-- ============================================
drop policy if exists ai_web_search_log_admin_select on public.ai_web_search_log;
create policy ai_web_search_log_admin_select
  on public.ai_web_search_log
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 8. P1: user_follows 增加 admin 策略
-- ============================================
drop policy if exists user_follows_admin_select on public.user_follows;
create policy user_follows_admin_select
  on public.user_follows
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 9. P1: lab_usage_records 增加 admin 策略
-- ============================================
drop policy if exists lab_usage_records_admin_select on public.lab_usage_records;
create policy lab_usage_records_admin_select
  on public.lab_usage_records
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 10. P1: user_impressions 增加 admin 策略
-- ============================================
drop policy if exists user_impressions_admin_select on public.user_impressions;
create policy user_impressions_admin_select
  on public.user_impressions
  for select
  using (public.current_user_is_admin());

-- ============================================
-- 11. P1: boh_creator_shows 增加 admin 策略
-- ============================================
drop policy if exists boh_creator_shows_admin_all on public.boh_creator_shows;
create policy boh_creator_shows_admin_all
  on public.boh_creator_shows
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ============================================
-- 12. P0-2: lottery_scheduler_logs 自动清理函数
-- 保留最近 30 天的日志,删除更早的记录
-- ============================================
create or replace function public.cleanup_lottery_scheduler_logs(p_retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if p_retention_days < 1 then
    p_retention_days := 30;
  end if;

  delete from public.lottery_scheduler_logs
  where created_at < now() - (p_retention_days || ' days')::interval
    and created_at < now() - interval '7 days';

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'retention_days', p_retention_days
  );
end;
$$;

grant execute on function public.cleanup_lottery_scheduler_logs(integer) to authenticated;

-- ============================================
-- 13. P0-2: 通用日志清理函数(通知、审核日志等)
-- ============================================
create or replace function public.cleanup_old_records(p_table text, p_retention_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_allowed_tables text[] := array['notifications', 'lottery_scheduler_logs'];
  v_table_exists boolean;
begin
  if not (p_table = any(v_allowed_tables)) then
    return jsonb_build_object('success', false, 'error', 'Table not allowed for cleanup: ' || p_table);
  end if;

  if p_retention_days < 7 then
    p_retention_days := 7;
  end if;

  execute format(
    'select exists (select 1 from information_schema.tables where table_schema = ''public'' and table_name = %L)',
    p_table
  ) into v_table_exists;

  if not v_table_exists then
    return jsonb_build_object('success', false, 'error', 'Table does not exist: ' || p_table);
  end if;

  execute format(
    'with deleted as (
      delete from public.%I
      where created_at < now() - (%L || '' days'')::interval
        and created_at < now() - interval ''7 days''
      returning 1
    ) select count(*) from deleted',
    p_table, p_retention_days
  ) into v_deleted_count;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'table', p_table,
    'retention_days', p_retention_days
  );
end;
$$;

grant execute on function public.cleanup_old_records(text, integer) to authenticated;
