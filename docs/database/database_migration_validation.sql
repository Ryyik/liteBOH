-- =============================================================================
-- BOH 数据库迁移验证脚本
-- =============================================================================
-- 用途:
--   验证两次迁移是否产生预期结果:
--     20260623_database_performance_optimization.sql      (Section A)
--     20260623_phase1_performance_optimization.sql        (Section B)
--   以及通用数据库健康检查摘要                            (Section C)
--
-- 用法:
--   1) 在 Supabase SQL Editor 中运行整个文件
--   2) 阅读最终结果集。FAIL 表示需要处理; WARN 表示需要检查
--   3) 本脚本只使用临时表和系统目录查询, 不修改任何应用数据
--
-- 格式:
--   沿用 docs/database/database_health_check.sql 的 temp-table / 有序输出惯例
-- =============================================================================

drop table if exists pg_temp.boh_migration_validation_results;

create temp table boh_migration_validation_results (
  sort_order integer not null,
  status     text not null check (status in ('PASS', 'WARN', 'FAIL', 'INFO')),
  area       text not null,
  check_name text not null,
  detail     text not null
);

-- ---------------------------------------------------------------------------
-- 运行时信息
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
values
  (10, 'INFO', 'runtime', 'database',       current_database()),
  (11, 'INFO', 'runtime', 'current_user',   current_user),
  (12, 'INFO', 'runtime', 'checked_at',     now()::text),
  (13, 'INFO', 'runtime', 'postgres_version', version());

-- ===========================================================================
-- SECTION A -- 迁移 20260623_database_performance_optimization.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A.1  RPC get_recent_birthday_profiles 存在
-- ---------------------------------------------------------------------------
with rpc_check (func_name) as (
  values ('get_recent_birthday_profiles')
)
insert into boh_migration_validation_results
select
  1010,
  case when p.oid is not null then 'PASS' else 'FAIL' end,
  'migration-a',
  r.func_name || ' (exists)',
  case
    when p.oid is not null then 'function exists (oid=' || p.oid::text || ')'
    else 'missing required RPC created by 20260623_database_performance_optimization.sql'
  end
from rpc_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- A.2  RPC get_recent_birthday_profiles 签名正确
--      预期: (p_limit integer DEFAULT 8) -> TABLE(id uuid, username text, ...)
-- ---------------------------------------------------------------------------
with rpc_check (func_name) as (
  values ('get_recent_birthday_profiles')
)
insert into boh_migration_validation_results
select
  1011,
  case
    when p.oid is null                                              then 'FAIL'
    when p.pronargs = 1
     and pg_get_function_arguments(p.oid) like 'p_limit integer%'
     and pg_get_function_result(p.oid)   like 'TABLE(%id uuid%username text%'
     and p.prolang  = (select oid from pg_language where lanname = 'plpgsql')
     and p.prosecdef                                                 then 'PASS'
    else 'WARN'
  end,
  'migration-a',
  r.func_name || ' (signature)',
  case
    when p.oid is null then 'function not found (see A.1)'
    else format(
      'exists; args=[%s]  returns=[%s]  lang=%s  security_definer=%s',
      pg_get_function_arguments(p.oid),
      pg_get_function_result(p.oid),
      (select lanname from pg_language where oid = p.prolang),
      p.prosecdef
    )
  end
from rpc_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- A.3  RPC get_unread_notification_count 存在
-- ---------------------------------------------------------------------------
with rpc_check (func_name) as (
  values ('get_unread_notification_count')
)
insert into boh_migration_validation_results
select
  1020,
  case when p.oid is not null then 'PASS' else 'FAIL' end,
  'migration-a',
  r.func_name || ' (exists)',
  case
    when p.oid is not null then 'function exists (oid=' || p.oid::text || ')'
    else 'missing required RPC created by 20260623_database_performance_optimization.sql'
  end
from rpc_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- A.4  RPC get_unread_notification_count 签名正确
--      预期: (p_recipient_id uuid) -> TABLE(count bigint)
-- ---------------------------------------------------------------------------
with rpc_check (func_name) as (
  values ('get_unread_notification_count')
)
insert into boh_migration_validation_results
select
  1021,
  case
    when p.oid is null                                                    then 'FAIL'
    when p.pronargs = 1
     and pg_get_function_arguments(p.oid) like 'p_recipient_id uuid%'
     and pg_get_function_result(p.oid)   like 'TABLE(%count bigint%'
     and p.prolang  = (select oid from pg_language where lanname = 'plpgsql')
     and p.prosecdef                                                       then 'PASS'
    else 'WARN'
  end,
  'migration-a',
  r.func_name || ' (signature)',
  case
    when p.oid is null then 'function not found (see A.3)'
    else format(
      'exists; args=[%s]  returns=[%s]  lang=%s  security_definer=%s',
      pg_get_function_arguments(p.oid),
      pg_get_function_result(p.oid),
      (select lanname from pg_language where oid = p.prolang),
      p.prosecdef
    )
  end
from rpc_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- A.5  索引 idx_forum_post_images_post_order_moderation
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1030,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'migration-a',
  'idx_forum_post_images_post_order_moderation',
  case
    when i.indexname is not null
      then 'exists on ' || i.tablename
      else 'missing index created by 20260623_database_performance_optimization.sql'
  end
from pg_indexes i
where i.schemaname = 'public'
  and i.indexname  = 'idx_forum_post_images_post_order_moderation';

-- ---------------------------------------------------------------------------
-- A.6  索引 idx_forum_rate_limit_events_user_type_created
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1040,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'migration-a',
  'idx_forum_rate_limit_events_user_type_created',
  case
    when i.indexname is not null
      then 'exists on ' || i.tablename
      else 'missing index created by 20260623_database_performance_optimization.sql'
  end
from pg_indexes i
where i.schemaname = 'public'
  and i.indexname  = 'idx_forum_rate_limit_events_user_type_created';

-- ===========================================================================
-- SECTION B -- 迁移 20260623_phase1_performance_optimization.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B.1 - B.4  验证 4 个索引已被删除
-- ---------------------------------------------------------------------------
with dropped_indexes (idx_name, sort_order) as (
  values
    ('idx_posts_status_created',        1110),
    ('idx_posts_status_created_at',     1120),
    ('idx_posts_status_created_at_id',  1130),
    ('idx_posts_author_id_created_at',  1140)
)
insert into boh_migration_validation_results
select
  d.sort_order,
  case when i.indexname is null then 'PASS' else 'FAIL' end,
  'migration-b',
  d.idx_name || ' (dropped)',
  case
    when i.indexname is null
      then 'index absent -- successfully dropped by 20260623_phase1_performance_optimization.sql'
    else 'index still exists on ' || i.tablename || '; drop may have failed or been re-created'
  end
from dropped_indexes d
left join pg_indexes i
  on i.schemaname = 'public'
 and i.indexname  = d.idx_name;

-- ---------------------------------------------------------------------------
-- B.5  索引 idx_posts_status_created_id 仍存在（未被删除）
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1150,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'migration-b',
  'idx_posts_status_created_id (preserved)',
  case
    when i.indexname is not null
      then 'exists on ' || i.tablename || ' -- correctly preserved'
    else 'missing; was it accidentally dropped?  Re-run: create index if not exists idx_posts_status_created_id on public.posts (status, created_at desc, id desc);'
  end
from pg_indexes i
where i.schemaname = 'public'
  and i.indexname  = 'idx_posts_status_created_id';

-- ---------------------------------------------------------------------------
-- B.6  索引 idx_posts_author_created_id 仍存在（未被删除）
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1160,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'migration-b',
  'idx_posts_author_created_id (preserved)',
  case
    when i.indexname is not null
      then 'exists on ' || i.tablename || ' -- correctly preserved'
    else 'missing; was it accidentally dropped?  Re-run: create index if not exists idx_posts_author_created_id on public.posts (author_id, created_at desc, id desc);'
  end
from pg_indexes i
where i.schemaname = 'public'
  and i.indexname  = 'idx_posts_author_created_id';

-- ---------------------------------------------------------------------------
-- B.7  函数 create_like_notification — 触发器函数
-- ---------------------------------------------------------------------------
with func_check (func_name) as (
  values ('create_like_notification')
)
insert into boh_migration_validation_results
select
  1170,
  case
    when p.oid is null                                                  then 'FAIL'
    when pg_get_function_result(p.oid) = 'trigger'
     and p.pronargs = 0
     and p.prolang  = (select oid from pg_language where lanname = 'plpgsql')
     and p.prosecdef                                                     then 'PASS'
    else 'WARN'
  end,
  'migration-b',
  r.func_name || ' (trigger function)',
  case
    when p.oid is null
      then 'function not found; missing from migration 20260623_phase1_performance_optimization.sql step 2'
    else format(
      'exists; returns=[%s]  args=[%s]  lang=%s  security_definer=%s',
      pg_get_function_result(p.oid),
      pg_get_function_arguments(p.oid),
      (select lanname from pg_language where oid = p.prolang),
      p.prosecdef
    )
  end
from func_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- B.8  触发器 trigger_on_like 存在于 likes 表
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1180,
  case
    when t.tgname is not null then 'PASS' else 'FAIL'
  end,
  'migration-b',
  'trigger_on_like',
  case
    when t.tgname is not null
      then 'trigger exists on public.likes; fires on INSERT FOR EACH ROW'
    else 'trigger missing; re-run: drop trigger if exists trigger_on_like on public.likes; create trigger trigger_on_like after insert on public.likes for each row execute function public.create_like_notification();'
  end
from (
  select tgname
  from pg_trigger
  where tgname = 'trigger_on_like'
    and tgrelid = 'public.likes'::regclass
    and not tgisinternal
) t;

-- ---------------------------------------------------------------------------
-- B.9  函数 admin_data_management_counts 存在并返回 jsonb
-- ---------------------------------------------------------------------------
with func_check (func_name) as (
  values ('admin_data_management_counts')
)
insert into boh_migration_validation_results
select
  1190,
  case
    when p.oid is null                                              then 'FAIL'
    when pg_get_function_result(p.oid) = 'jsonb'
     and p.pronargs = 0
     and p.prolang  = (select oid from pg_language where lanname = 'plpgsql')
     and p.prosecdef
     and p.provolatile = 's'                                        then 'PASS'
    else 'WARN'
  end,
  'migration-b',
  r.func_name || ' (signature)',
  case
    when p.oid is null
      then 'function not found; should have been rewritten by 20260623_phase1_performance_optimization.sql step 3'
    else format(
      'exists; returns=[%s]  args=[%s]  lang=%s  security_definer=%s  stable=%s',
      pg_get_function_result(p.oid),
      pg_get_function_arguments(p.oid),
      (select lanname from pg_language where oid = p.prolang),
      p.prosecdef,
      p.provolatile = 's'
    )
  end
from func_check r
left join pg_proc p
  on p.proname = r.func_name
  and p.pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- B.10  admin_data_management_counts — 验证使用了 reltuples
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1191,
  case
    when p.oid is not null
     and pg_get_functiondef(p.oid) like '%reltuples%'
     and pg_get_functiondef(p.oid) like '%pg_class%'                 then 'PASS'
    when p.oid is not null                                           then 'WARN'
    else 'FAIL'
  end,
  'migration-b',
  'admin_data_management_counts (reltuples)',
  case
    when p.oid is null             then 'function not found (see B.9)'
    when pg_get_functiondef(p.oid) like '%reltuples%'
      then 'function uses pg_class.reltuples for approximate counts -- expected per migration step 3'
    else 'function body does NOT reference reltuples -- may still use exact COUNT(*)'
  end
from pg_proc p
where p.proname = 'admin_data_management_counts'
  and p.pronamespace = 'public'::regnamespace;

-- ===========================================================================
-- SECTION C -- 通用数据库健康检查（摘要）
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- C.1 - C.2  必需扩展
-- ---------------------------------------------------------------------------
with required_extensions (extname, required) as (
  values
    ('pgcrypto', true),
    ('vector',   true)
)
insert into boh_migration_validation_results
select
  1210,
  case
    when e.extname is not null then 'PASS'
    when required              then 'FAIL'
    else 'WARN'
  end,
  'health-ext',
  r.extname,
  case
    when e.extname is not null then 'extension installed in schema ' || n.nspname
    when required              then 'missing required extension'
    else 'optional extension missing'
  end
from required_extensions r
left join pg_extension e
  on e.extname = r.extname
left join pg_namespace n
  on n.oid = e.extnamespace;

-- ---------------------------------------------------------------------------
-- C.3 - C.10  关键高流量索引
-- ---------------------------------------------------------------------------
with critical_indexes (idx_name, reason) as (
  values
    ('idx_posts_status_created_id',              'forum listing -- sort by status+created'),
    ('idx_posts_author_created_id',              'forum listing -- filter by author'),
    ('idx_comments_status_created',              'admin moderation -- comment review'),
    ('idx_profiles_username',                    'auth / profile lookup'),
    ('idx_likes_user_post',                      'forum -- user like state check'),
    ('idx_notifications_recipient_created',      'notification screen -- recipient query'),
    ('idx_forum_post_images_post_order_moderation','forum post image loading'),
    ('idx_forum_rate_limit_events_user_type_created','rate-limit enforcement query')
)
insert into boh_migration_validation_results
select
  1220,
  case when i.indexname is not null then 'PASS' else 'FAIL' end,
  'health-idx',
  c.idx_name,
  case
    when i.indexname is not null
      then 'exists on ' || i.tablename || '  (' || c.reason || ')'
    else 'missing critical index  (' || c.reason || ')'
  end
from critical_indexes c
left join pg_indexes i
  on i.schemaname = 'public'
 and i.indexname  = c.idx_name;

-- ---------------------------------------------------------------------------
-- C.11 - C.17  关键表的 RLS 状态
-- ---------------------------------------------------------------------------
with rls_tables (table_name) as (
  values
    ('profiles'),
    ('posts'),
    ('comments'),
    ('likes'),
    ('notifications'),
    ('forum_post_images')
)
insert into boh_migration_validation_results
select
  1240,
  case
    when c.oid is null                  then 'FAIL'
    when c.relrowsecurity               then 'PASS'
    else 'FAIL'
  end,
  'health-rls',
  t.table_name,
  case
    when c.oid is null               then 'table missing'
    when c.relrowsecurity            then 'RLS enabled'
    else 'RLS disabled -- data visible to all authenticated users'
  end
from rls_tables t
left join pg_class c
  on c.oid = to_regclass('public.' || t.table_name);

-- ---------------------------------------------------------------------------
-- C.18  写频繁表的死元组比例
-- ---------------------------------------------------------------------------
insert into boh_migration_validation_results
select
  1260,
  case
    when n_dead_tup > greatest(1000, n_live_tup * 0.2) then 'WARN'
    else 'PASS'
  end,
  'health-blmt',
  relname,
  'live=' || n_live_tup::text
    || ', dead=' || n_dead_tup::text
    || ', ratio=' || case when n_live_tup > 0
        then round(100.0 * n_dead_tup / nullif(n_live_tup, 0), 1)::text || '%'
        else 'N/A'
      end
    || ', last_autovacuum=' || coalesce(last_autovacuum::text, 'never')
from pg_stat_user_tables
where schemaname = 'public'
  and relname in (
    'posts', 'comments', 'likes', 'notifications',
    'forum_post_images', 'forum_rate_limit_events',
    'profiles'
  )
order by n_dead_tup desc;

-- ===========================================================================
-- 最终输出
-- ===========================================================================

-- 汇总：按状态统计
select
  status,
  count(*) as checks
from boh_migration_validation_results
group by status
order by case status when 'FAIL' then 1 when 'WARN' then 2 when 'PASS' then 3 else 4 end;

-- 详细行：按严重性排序
select
  status,
  area,
  check_name,
  detail
from boh_migration_validation_results
order by
  case status when 'FAIL' then 1 when 'WARN' then 2 when 'PASS' then 3 else 4 end,
  sort_order,
  area,
  check_name;
