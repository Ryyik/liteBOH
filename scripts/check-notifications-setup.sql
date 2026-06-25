-- =====================================================
-- 消息中心远端功能校验 SQL（单条查询）
-- 在 Supabase SQL Editor 中直接执行
-- =====================================================

with
publication_check as (
  select
    case
      when exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
      ) then '✅'
      else '❌'
    end as status,
    'notifications 表已加入 supabase_realtime publication'
      as item,
    case
      when exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
      ) then ''
      else '实时订阅无法工作'
    end as note
),
archived_at_check as (
  select
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'archived_at'
      ) then '✅'
      else '❌'
    end as status,
    'archived_at 字段存在' as item,
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'archived_at'
      ) then ''
      else '归档功能不可用'
    end as note
),
rls_check as (
  select
    case
      when relrowsecurity then '⚠️'
      else '✅'
    end as status,
    'RLS 已启用' as item,
    case
      when not relrowsecurity then 'RLS 未启用 —— 归档 API 不带 recipient_id 也能工作'
      when exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'notifications'
          and cmd = 'UPDATE'
      ) then 'UPDATE 策略 ✅'
      else '缺少 UPDATE 策略 —— 归档会因权限被拒'
    end as note
  from pg_class
  where relname = 'notifications'
    and relnamespace = (select oid from pg_namespace where nspname = 'public')
),
rpc_check_unread as (
  select
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'get_unread_notification_count'
      ) then '✅'
      else '❌'
    end as status,
    'get_unread_notification_count RPC 存在' as item,
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'get_unread_notification_count'
      ) then ''
      else '未读计数会降级为直接查询'
    end as note
),
rpc_check_mark_single as (
  select
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'mark_single_as_read'
      ) then '✅'
      else '⚠️'
    end as status,
    'mark_single_as_read RPC 存在' as item,
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'mark_single_as_read'
      ) then ''
      else '标记已读会降级为 update'
    end as note
),
rpc_check_mark_all as (
  select
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'mark_all_as_read'
      ) then '✅'
      else '⚠️'
    end as status,
    'mark_all_as_read RPC 存在' as item,
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'mark_all_as_read'
      ) then ''
      else '全部标记已读会降级为 update'
    end as note
),
stats as (
  select
    count(*) as total,
    count(*) filter (where archived_at is null) as unarchived,
    count(*) filter (where archived_at is not null) as archived,
    count(*) filter (where status = 'unread' and archived_at is null) as unread_active
  from public.notifications
)
select * from publication_check
union all select * from archived_at_check
union all select * from rls_check
union all select * from rpc_check_unread
union all select * from rpc_check_mark_single
union all select * from rpc_check_mark_all
union all select '📊' as status, '通知总量' as item, total::text as note from stats
union all select '' as status, '  ├─ 未归档' as item, unarchived::text as note from stats
union all select '' as status, '  ├─ 已归档' as item, archived::text as note from stats
union all select '' as status, '  └─ 未读(未归档)' as item, unread_active::text as note from stats;

-- =====================================================
-- 说明：✅ 正常  ❌ 必须修复  ⚠️ 有降级方案
-- =====================================================
