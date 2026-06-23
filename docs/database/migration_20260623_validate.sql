-- ============================================================
-- 校验：20260623_database_performance_optimization.sql 迁移
-- 已正确应用
-- 用法：在 Supabase SQL Editor 中运行，查看结果
-- ============================================================

drop table if exists pg_temp.boh_migration_validate;

create temp table boh_migration_validate (
  sort_order int not null,
  status text not null check (status in ('PASS', 'FAIL')),
  item text not null,
  detail text not null
);

-- 1) 校验 RPC: get_recent_birthday_profiles
insert into boh_migration_validate
select
  100,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  'RPC: get_recent_birthday_profiles',
  coalesce(p.proname::text, 'not found')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_recent_birthday_profiles';

-- 2) 校验 RPC: get_unread_notification_count
insert into boh_migration_validate
select
  110,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  'RPC: get_unread_notification_count',
  coalesce(p.proname::text, 'not found')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_unread_notification_count';

-- 3) 校验索引: idx_forum_post_images_post_order_moderation
insert into boh_migration_validate
select
  200,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'INDEX: idx_forum_post_images_post_order_moderation',
  coalesce(i.indexname::text, 'not found')
from pg_indexes i
where i.schemaname = 'public'
  and i.tablename = 'forum_post_images'
  and i.indexname = 'idx_forum_post_images_post_order_moderation';

-- 4) 校验索引: idx_forum_rate_limit_events_user_type_created
insert into boh_migration_validate
select
  210,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'INDEX: idx_forum_rate_limit_events_user_type_created',
  coalesce(i.indexname::text, 'not found')
from pg_indexes i
where i.schemaname = 'public'
  and i.tablename = 'forum_rate_limit_events'
  and i.indexname = 'idx_forum_rate_limit_events_user_type_created';

-- 5) 校验 RPC 可执行（dry-run: 只验证入参匹配，不实际查询）
insert into boh_migration_validate
select
  300,
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_recent_birthday_profiles'
        and p.pronargs = 1
    ) then 'PASS'
    else 'FAIL'
  end,
  'RPC param count: get_recent_birthday_profiles(1 param)',
  'expects 1 param (p_limit)';

insert into boh_migration_validate
select
  310,
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_unread_notification_count'
        and p.pronargs = 1
    ) then 'PASS'
    else 'FAIL'
  end,
  'RPC param count: get_unread_notification_count(1 param)',
  'expects 1 param (p_recipient_id)';

-- 6) 校验 RPC 权限
insert into boh_migration_validate
select
  400,
  case
    when has_function_privilege('anon', 'public.get_recent_birthday_profiles(int)', 'execute')
    then 'PASS' else 'FAIL'
  end,
  'PERMISSION: get_recent_birthday_profiles granted to anon',
  case when has_function_privilege('anon', 'public.get_recent_birthday_profiles(int)', 'execute')
    then 'OK' else 'missing' end;

insert into boh_migration_validate
select
  410,
  case
    when has_function_privilege('authenticated', 'public.get_unread_notification_count(uuid)', 'execute')
    then 'PASS' else 'FAIL'
  end,
  'PERMISSION: get_unread_notification_count granted to authenticated',
  case when has_function_privilege('authenticated', 'public.get_unread_notification_count(uuid)', 'execute')
    then 'OK' else 'missing' end;

-- ============================================================
-- 汇总
-- ============================================================
select '=== 迁移校验结果 ===' as "校验";

select
  status,
  count(*) as count
from boh_migration_validate
group by status
order by status desc;

select
  status as "状态",
  item as "检查项",
  detail as "详情"
from boh_migration_validate
order by sort_order;

-- 最终结论
select case
  when not exists (select 1 from boh_migration_validate where status = 'FAIL')
  then '全部通过，迁移已正确应用'
  else '存在失败的检查项，请排查'
end as "结论";
