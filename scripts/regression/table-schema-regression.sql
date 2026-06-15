-- ============================================================
-- 关键表结构回归检查
-- 用途: 确认前端依赖的关键表和字段在迁移后仍然存在
-- 运行: 在 Supabase SQL Editor 中执行整个文件
-- ============================================================

drop table if exists pg_temp.table_regression_results;

create temp table table_regression_results (
  sort_order integer not null,
  status text not null check (status in ('PASS', 'FAIL', 'WARN', 'INFO')),
  area text not null,
  check_name text not null,
  detail text not null
);

insert into table_regression_results
values
  (1, 'INFO', 'runtime', 'check_runtime', format('checked at %s on db %s by %s', now()::text, current_database(), current_user));

-- -----------------------------------------------------------
-- 表存在性检查
-- -----------------------------------------------------------
with required_tables(table_name, area, sort_order, expected) as (
  values
    ('profiles',                 'auth',       100, '用户资料'),
    ('posts',                    'forum',      200, '论坛帖子'),
    ('comments',                 'forum',      201, '论坛评论'),
    ('likes',                    'forum',      202, '点赞记录'),
    ('notifications',            'notify',     300, '通知'),
    ('messages',                 'notify',     301, '私信'),
    ('forum_post_images',        'forum',      203, '帖子图片'),
    ('forum_post_drafts',        'forum',      204, '帖子草稿'),
    ('forum_rate_limit_events',  'forum',      205, '限流审计'),
    ('forum_weekly_checkins',    'forum',      206, '每周签到'),
    ('moderation_logs',          'moderation', 400, '审核日志'),
    ('user_subscriptions',       'subscription',500, '用户订阅'),
    ('lotteries',                'lottery',    600, '抽奖'),
    ('activities',               'activity',   700, '活动日志'),
    ('user_impressions',         'profile',    800, '用户印象'),
    ('user_gifts',               'gift',       900, '用户礼物'),
    ('boh_cloud_entries',        'boh_cloud', 1000, 'BOH云条目'),
    ('cloudinary_pending_uploads','image',    1100, 'Cloudinary待确认上传'),
    ('addresses',                'shop',      1200, '收货地址'),
    ('avatars',                  'profile',   1300, '头像')
)
insert into table_regression_results (sort_order, status, area, check_name, detail)
select
  rt.sort_order,
  case when to_regclass('public.' || rt.table_name) is not null then 'PASS' else 'FAIL' end,
  rt.area,
  rt.table_name,
  case
    when to_regclass('public.' || rt.table_name) is not null
      then '表存在: ' || rt.expected
    else '表缺失: ' || rt.expected
  end
from required_tables rt;

-- -----------------------------------------------------------
-- 关键字段检查（论坛核心字段）
-- -----------------------------------------------------------
with required_columns(table_name, column_name, area, sort_order, expected) as (
  values
    -- posts 表关键字段
    ('posts', 'id',          'forum', 210, '帖子ID'),
    ('posts', 'title',       'forum', 211, '结构化标题'),
    ('posts', 'body',        'forum', 212, '帖子正文'),
    ('posts', 'content',     'forum', 213, '完整内容'),
    ('posts', 'author_id',   'forum', 214, '作者ID'),
    ('posts', 'author_username','forum',215,'作者名'),
    ('posts', 'status',      'forum', 216, '审核状态'),
    ('posts', 'tag',         'forum', 217, 'forum tag'),
    ('posts', 'comment_count','forum',218,'评论计数'),
    ('posts', 'like_count',  'forum', 219, '点赞计数'),
    ('posts', 'created_at',  'forum', 220, '创建时间'),
    -- comments 表关键字段
    ('comments', 'id',               'forum', 230, '评论ID'),
    ('comments', 'post_id',          'forum', 231, '所属帖子'),
    ('comments', 'parent_id',        'forum', 232, '父评论'),
    ('comments', 'author_id',        'forum', 233, '作者ID'),
    ('comments', 'author_username',  'forum', 234, '作者名'),
    ('comments', 'reply_to_username','forum', 235, '回复对象'),
    ('comments', 'status',           'forum', 236, '审核状态'),
    -- likes 表关键字段
    ('likes', 'id',       'forum', 240, '点赞ID'),
    ('likes', 'post_id',  'forum', 241, '帖子ID'),
    ('likes', 'user_id',  'forum', 242, '用户ID'),
    -- notifications 关键字段
    ('notifications', 'id',          'notify', 310, '通知ID'),
    ('notifications', 'recipient_id','notify', 311, '接收者'),
    ('notifications', 'sender_id',   'notify', 312, '发送者'),
    ('notifications', 'type',        'notify', 313, '通知类型'),
    ('notifications', 'status',      'notify', 314, '已读状态'),
    ('notifications', 'post_id',     'notify', 315, '关联帖子'),
    ('notifications', 'comment_id',  'notify', 316, '关联评论'),
    -- forum_post_images 关键字段
    ('forum_post_images', 'id',               'forum', 250, '图片ID'),
    ('forum_post_images', 'post_id',          'forum', 251, '所属帖子'),
    ('forum_post_images', 'url',              'forum', 252, '图片URL'),
    ('forum_post_images', 'public_id',        'forum', 253, 'Cloudinary ID'),
    ('forum_post_images', 'sort_order',       'forum', 254, '排序'),
    ('forum_post_images', 'moderation_status', 'forum', 255, '审核状态'),
    -- profiles 关键字段
    ('profiles', 'id',              'profile', 810, '用户ID'),
    ('profiles', 'username',        'profile', 811, '方块ID'),
    ('profiles', 'email',           'profile', 812, '邮箱'),
    ('profiles', 'bio',             'profile', 813, '简介'),
    ('profiles', 'avatar_url',      'profile', 814, '头像'),
    ('profiles', 'role',            'profile', 815, '角色'),
    ('profiles', 'points',          'profile', 816, '积分'),
    ('profiles', 'experience',      'profile', 817, '经验值'),
    ('profiles', 'birth_month',     'profile', 818, '生日月'),
    ('profiles', 'birth_day',       'profile', 819, '生日日')
)
insert into table_regression_results (sort_order, status, area, check_name, detail)
select
  rc.sort_order,
  case
    when a.attname is not null then 'PASS'
    else 'FAIL'
  end,
  rc.area,
  rc.table_name || '.' || rc.column_name,
  case
    when a.attname is not null
      then '字段存在: ' || rc.expected || ' (' || format_type(a.atttypid, a.atttypmod) || ')'
    else '字段缺失: ' || rc.expected
  end
from required_columns rc
left join pg_class c
  on c.relname = rc.table_name
  and c.relnamespace = 'public'::regnamespace
left join pg_attribute a
  on a.attrelid = c.oid
  and a.attname = rc.column_name
  and a.attnum > 0
  and not a.attisdropped;

-- -----------------------------------------------------------
-- 索引检查（性能关键索引）
-- -----------------------------------------------------------
with required_indexes(table_name, index_name_pattern, area, sort_order, expected) as (
  values
    ('posts',        '%author_id%',     'forum',   260, '按作者查询'),
    ('posts',        '%created_at%',    'forum',   261, '按时间排序'),
    ('comments',     '%post_id%',       'forum',   262, '按帖子查评论'),
    ('likes',        '%post_id%',       'forum',   263, '按帖子查点赞'),
    ('likes',        '%user_id%',       'forum',   264, '按用户查点赞'),
    ('notifications','%recipient_id%',  'notify',  320, '按接收者查通知'),
    ('messages',     '%receiver_id%',   'notify',  321, '按接收者查私信'),
    ('profiles',     '%username%',      'profile', 830, '按用户名查询'),
    ('profiles',     '%email%',         'profile', 831, '按邮箱查询')
)
insert into table_regression_results (sort_order, status, area, check_name, detail)
select
  ri.sort_order,
  case when i.oid is not null then 'PASS' else 'WARN' end,
  ri.area,
  ri.table_name || ':' || ri.expected,
  case
    when i.oid is not null
      then '索引存在: ' || coalesce(i.relname, 'unknown')
    else '索引可能缺失: ' || ri.expected || '，建议检查'
  end
from required_indexes ri
left join pg_class c
  on c.relname = ri.table_name
  and c.relnamespace = 'public'::regnamespace
left join pg_index px
  on px.indrelid = c.oid
left join pg_class i
  on i.oid = px.indexrelid
  and i.relname ilike ri.index_name_pattern;

-- -----------------------------------------------------------
-- RLS 策略检查
-- -----------------------------------------------------------
with tables_needing_rls(table_name, area, sort_order) as (
  values
    ('posts',          'forum', 270),
    ('comments',       'forum', 271),
    ('likes',          'forum', 272),
    ('notifications',  'notify',330),
    ('profiles',       'profile',840)
)
insert into table_regression_results (sort_order, status, area, check_name, detail)
select
  t.sort_order,
  case
    when c.relrowsecurity then 'PASS'
    else 'WARN'
  end,
  t.area,
  t.table_name || ' RLS',
  case
    when c.relrowsecurity
      then 'RLS 已启用，策略数: ' || (
        select count(*)::text from pg_policy where polrelid = c.oid
      )
    else 'RLS 未启用，请确认是否需要启用'
  end
from tables_needing_rls t
join pg_class c
  on c.relname = t.table_name
  and c.relnamespace = 'public'::regnamespace;

-- -----------------------------------------------------------
-- 汇总
-- -----------------------------------------------------------
insert into table_regression_results
values
  (9998, 'INFO', 'summary', 'total_failures',
   (select count(*)::text || ' check(s) FAIL' from table_regression_results where status = 'FAIL')),
  (9999, 'INFO', 'summary', 'total_warnings',
   (select count(*)::text || ' check(s) WARN' from table_regression_results where status = 'WARN')),
  (10000,'INFO', 'summary', 'total_checked',
   (select count(*)::text || ' check(s) total' from table_regression_results where status in ('PASS', 'FAIL', 'WARN')));

-- 输出结果
select * from table_regression_results order by sort_order;