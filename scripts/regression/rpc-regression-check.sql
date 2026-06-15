-- ============================================================
-- Supabase RPC 函数存在性回归检查
-- 用途: Supabase 迁移/升级后确认所有 RPC 函数仍可正常调用
-- 运行: 在 Supabase SQL Editor 中执行整个文件
-- 预期: 所有结果应为 PASS
-- ============================================================

drop table if exists pg_temp.rpc_regression_results;

create temp table rpc_regression_results (
  sort_order integer not null,
  status text not null check (status in ('PASS', 'FAIL', 'WARN', 'INFO')),
  area text not null,
  function_name text not null,
  detail text not null
);

insert into rpc_regression_results
values
  (1, 'INFO', 'runtime', 'check_runtime', format('checked at %s on db %s by %s', now()::text, current_database(), current_user));

-- -----------------------------------------------------------
-- 论坛 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('list_forum_posts',              'forum', 100),
    ('create_forum_post_with_images', 'forum', 101),
    ('get_forum_tag_stats',           'forum', 102),
    ('toggle_forum_like',             'forum', 103),
    ('submit_forum_post_report',      'forum', 104),
    ('list_forum_comment_thread',     'forum', 105)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 通知 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('mark_single_as_read', 'notifications', 200),
    ('mark_all_as_read',    'notifications', 201)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 认证 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('delete_my_account', 'auth', 300)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 签到 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('get_weekly_checkin_status', 'checkin', 400),
    ('submit_weekly_checkin',     'checkin', 401)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 抽奖 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('get_home_lottery',       'lottery', 500),
    ('join_home_lottery',      'lottery', 501),
    ('get_community_lotteries','lottery', 502),
    ('join_community_lottery', 'lottery', 503)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 订阅 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('subscribe_with_points', 'subscription', 600)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 商店 RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('create_shop_order_with_points', 'shop', 700)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- BoH Cloud RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('get_my_boh_cloud_share_channel',      'boh_cloud', 800),
    ('get_my_boh_cloud_share_viewers',       'boh_cloud', 801),
    ('upsert_my_boh_cloud_share_channel',    'boh_cloud', 802),
    ('set_my_boh_cloud_share_description',   'boh_cloud', 803),
    ('disable_my_boh_cloud_share_channel',   'boh_cloud', 804),
    ('get_shared_boh_cloud_channel_by_token','boh_cloud', 805)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- Pushplus RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('get_pushplus_token_for_notification', 'pushplus', 900)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- AI Memory RPC
-- -----------------------------------------------------------
with required_functions(fname, area, sort_order) as (
  values
    ('search_boh_ai_shared_memories', 'ai_memory', 1000)
)
insert into rpc_regression_results (sort_order, status, area, function_name, detail)
select
  rf.sort_order,
  case when p.proname is not null then 'PASS' else 'FAIL' end,
  rf.area,
  rf.fname,
  case
    when p.proname is not null
      then format('RPC 存在，参数: %s', pg_get_function_arguments(p.oid))
    else 'RPC 缺失，请执行对应 migration'
  end
from required_functions rf
left join pg_proc p
  on p.proname = rf.fname
  and p.pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 汇总
-- -----------------------------------------------------------
insert into rpc_regression_results
values
  (9999, 'INFO', 'summary', 'total_failures',
   (select count(*)::text || ' RPC(s) FAIL' from rpc_regression_results where status = 'FAIL')),
  (10000, 'INFO', 'summary', 'total_checked',
   (select count(*)::text || ' RPC(s) checked' from rpc_regression_results where status in ('PASS', 'FAIL')));

-- 输出结果
select * from rpc_regression_results order by sort_order;