-- ============================================================================
-- 2026062701: RLS 收口 + 原子限流函数
-- 修复:
--   P0-BUG-3 多张核心表无 RLS 保护
--   P0-D2 限流自增竞态
--   P1-D1 API Key Vault delete action 审计
-- ============================================================================

-- ============================================
-- 1. 原子限流自增函数 (解决 P0-D2)
-- ============================================
create or replace function public.increment_rate_limit(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public._rate_limits (key, count, reset_at)
  values (p_key, 1, now() + interval '1 hour')
  on conflict (key) do update
    set count = public._rate_limits.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

grant execute on function public.increment_rate_limit(text) to service_role, anon, authenticated;

-- ============================================
-- 2. api_key_vault: 仅管理员可访问 (前端不应直连,统一走 Edge Function)
-- ============================================
drop policy if exists api_key_vault_admin_all on public.api_key_vault;
create policy api_key_vault_admin_all
  on public.api_key_vault
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists api_key_vault_audit_admin_all on public.api_key_vault_audit_logs;
create policy api_key_vault_audit_admin_all
  on public.api_key_vault_audit_logs
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ============================================
-- 3. bohai_model_configs: 补 INSERT/UPDATE/DELETE
-- ============================================
drop policy if exists bohai_model_configs_admin_write on public.bohai_model_configs;
create policy bohai_model_configs_admin_write
  on public.bohai_model_configs
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ============================================
-- 4. lottery 核心表
-- ============================================
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='lotteries') then
    alter table public.lotteries enable row level security;
    drop policy if exists lotteries_admin_all on public.lotteries;
    create policy lotteries_admin_all
      on public.lotteries
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='lottery_entries') then
    alter table public.lottery_entries enable row level security;
    drop policy if exists lottery_entries_admin_all on public.lottery_entries;
    create policy lottery_entries_admin_all
      on public.lottery_entries
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='lottery_draw_logs') then
    alter table public.lottery_draw_logs enable row level security;
    drop policy if exists lottery_draw_logs_admin_all on public.lottery_draw_logs;
    create policy lottery_draw_logs_admin_all
      on public.lottery_draw_logs
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='lottery_scheduler_logs') then
    alter table public.lottery_scheduler_logs enable row level security;
    drop policy if exists lottery_scheduler_logs_admin_all on public.lottery_scheduler_logs;
    create policy lottery_scheduler_logs_admin_all
      on public.lottery_scheduler_logs
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='lottery_notification_jobs') then
    alter table public.lottery_notification_jobs enable row level security;
    drop policy if exists lottery_notification_jobs_admin_all on public.lottery_notification_jobs;
    create policy lottery_notification_jobs_admin_all
      on public.lottery_notification_jobs
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='lottery_join_attempts') then
    alter table public.lottery_join_attempts enable row level security;
    drop policy if exists lottery_join_attempts_admin_all on public.lottery_join_attempts;
    create policy lottery_join_attempts_admin_all
      on public.lottery_join_attempts
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;
end $$;

-- ============================================
-- 5. forum_post_reports
-- ============================================
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='forum_post_reports') then
    alter table public.forum_post_reports enable row level security;
    drop policy if exists forum_post_reports_insert_own on public.forum_post_reports;
    create policy forum_post_reports_insert_own
      on public.forum_post_reports
      for insert
      with check (auth.uid() = reporter_id);
    drop policy if exists forum_post_reports_select_own_or_admin on public.forum_post_reports;
    create policy forum_post_reports_select_own_or_admin
      on public.forum_post_reports
      for select
      using (auth.uid() = reporter_id or public.current_user_is_admin());
    drop policy if exists forum_post_reports_admin_update on public.forum_post_reports;
    create policy forum_post_reports_admin_update
      on public.forum_post_reports
      for update
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;
end $$;

-- ============================================
-- 6. boh_ai_core_memories: 仅管理员可写,所有登录用户可读
-- ============================================
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='boh_ai_core_memories') then
    alter table public.boh_ai_core_memories enable row level security;
    drop policy if exists boh_ai_core_memories_read on public.boh_ai_core_memories;
    create policy boh_ai_core_memories_read
      on public.boh_ai_core_memories
      for select
      using (auth.role() = 'authenticated' or public.current_user_is_admin());
    drop policy if exists boh_ai_core_memories_admin_write on public.boh_ai_core_memories;
    create policy boh_ai_core_memories_admin_write
      on public.boh_ai_core_memories
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;
end $$;

-- ============================================
-- 7. user_subscriptions: 补管理员写策略
-- ============================================
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='user_subscriptions') then
    alter table public.user_subscriptions enable row level security;
    drop policy if exists user_subscriptions_admin_write on public.user_subscriptions;
    create policy user_subscriptions_admin_write
      on public.user_subscriptions
      for all
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());
  end if;
end $$;

-- ============================================
-- 验证
-- ============================================
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'api_key_vault', 'api_key_vault_audit_logs',
    'bohai_model_configs',
    'lotteries', 'lottery_entries', 'lottery_draw_logs',
    'lottery_scheduler_logs', 'lottery_notification_jobs', 'lottery_join_attempts',
    'forum_post_reports', 'boh_ai_core_memories', 'user_subscriptions'
  )
ORDER BY tablename;
