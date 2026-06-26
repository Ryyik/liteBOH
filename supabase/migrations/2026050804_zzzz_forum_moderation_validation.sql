-- 论坛与审核链路校验脚本（只读 / 前端先发后审模式）
-- 用途：
-- 1) 在执行完关键迁移后，快速确认数据库对象/约束/RPC/授权是否齐全
-- 2) 不改数据，只返回 PASS/FAIL 清单
-- 3) 当前策略：不启用 Supabase 自动审核队列，内容写入依赖前端本地预检 + 前端异步硅基流动 AI 复审

with ctx as (
  select
    to_regprocedure('public.list_forum_posts(integer,integer,text,uuid,boolean,text)') as fn_list_forum_posts,
    to_regprocedure('public.admin_apply_moderation_action(text,uuid,text,text)') as fn_admin_apply_moderation_action,
    to_regprocedure('public.admin_delete_moderation_target(text,uuid)') as fn_admin_delete_moderation_target,
    to_regprocedure('public.insert_moderation_log(uuid,text,text,text,uuid)') as fn_insert_moderation_log,
    to_regprocedure('public.submit_forum_post_report(uuid,text,text)') as fn_submit_forum_post_report,
    to_regprocedure('public.delete_my_account(text)') as fn_delete_my_account,
    to_regprocedure('public.claim_moderation_jobs(integer,text,integer)') as fn_claim_moderation_jobs,
    to_regprocedure('public.complete_moderation_job(uuid,text,text,text,text)') as fn_complete_moderation_job,
    to_regprocedure('public.fail_moderation_job(uuid,text,text)') as fn_fail_moderation_job
),
checks as (
  -- 基础表
  select 10 as ord, 'table.public.posts exists' as check_name,
         (to_regclass('public.posts') is not null) as passed,
         '应存在 public.posts' as detail
  union all
  select 20, 'table.public.comments exists',
         (to_regclass('public.comments') is not null),
         '应存在 public.comments'
  union all
  select 30, 'table.public.messages exists',
         (to_regclass('public.messages') is not null),
         '应存在 public.messages'
  union all
  select 40, 'table.public.moderation_logs exists',
         (to_regclass('public.moderation_logs') is not null),
         '应存在 public.moderation_logs'

  -- 状态字段默认值 / 非空
  union all
  select 50, 'posts.status default approved',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'posts'
             and column_name = 'status'
             and coalesce(column_default, '') ilike '%approved%'
         ),
         'posts.status 默认值应为 approved'
  union all
  select 60, 'posts.status not null',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'posts'
             and column_name = 'status'
             and is_nullable = 'NO'
         ),
         'posts.status 应为 NOT NULL'
  union all
  select 70, 'comments.status default approved',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'comments'
             and column_name = 'status'
             and coalesce(column_default, '') ilike '%approved%'
         ),
         'comments.status 默认值应为 approved'
  union all
  select 80, 'comments.status not null',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'comments'
             and column_name = 'status'
             and is_nullable = 'NO'
         ),
         'comments.status 应为 NOT NULL'
  union all
  select 90, 'messages.moderation_status default approved',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'messages'
             and column_name = 'moderation_status'
             and coalesce(column_default, '') ilike '%approved%'
         ),
         'messages.moderation_status 默认值应为 approved'
  union all
  select 100, 'messages.moderation_status not null',
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'messages'
             and column_name = 'moderation_status'
             and is_nullable = 'NO'
         ),
         'messages.moderation_status 应为 NOT NULL'

  -- 双态约束
  union all
  select 110, 'posts status check(approved/limited/rejected)',
         exists (
           select 1
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
           where n.nspname = 'public'
             and t.relname = 'posts'
             and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%status%'
             and pg_get_constraintdef(c.oid) ilike '%approved%'
             and pg_get_constraintdef(c.oid) ilike '%limited%'
             and pg_get_constraintdef(c.oid) ilike '%rejected%'
         ),
         'posts 应允许 approved/limited/rejected'
  union all
  select 120, 'comments status check(approved/rejected)',
         exists (
           select 1
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
           where n.nspname = 'public'
             and t.relname = 'comments'
             and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%status%'
             and pg_get_constraintdef(c.oid) ilike '%approved%'
             and pg_get_constraintdef(c.oid) ilike '%rejected%'
         ),
         'comments 应仅允许 approved/rejected'
  union all
  select 130, 'messages moderation_status check(approved/rejected)',
         exists (
           select 1
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
           where n.nspname = 'public'
             and t.relname = 'messages'
             and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%moderation_status%'
             and pg_get_constraintdef(c.oid) ilike '%approved%'
             and pg_get_constraintdef(c.oid) ilike '%rejected%'
         ),
         'messages.moderation_status 应仅允许 approved/rejected'
  union all
  select 140, 'moderation_logs ai_result check(approved/rejected)',
         exists (
           select 1
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
           where n.nspname = 'public'
             and t.relname = 'moderation_logs'
             and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%ai_result%'
             and pg_get_constraintdef(c.oid) ilike '%approved%'
             and pg_get_constraintdef(c.oid) ilike '%rejected%'
         ),
         'moderation_logs.ai_result 应仅允许 approved/rejected'

  -- 论坛读取 RPC
  union all
  select 150, 'rpc.list_forum_posts exists',
         (ctx.fn_list_forum_posts is not null),
         '应存在 list_forum_posts(integer,integer,text,uuid,boolean,text)'
  from ctx
  union all
  select 160, 'rpc.list_forum_posts executable by anon',
         coalesce(has_function_privilege('anon', ctx.fn_list_forum_posts, 'EXECUTE'), false),
         'anon 需有 list_forum_posts 执行权限'
  from ctx
  union all
  select 170, 'rpc.list_forum_posts executable by authenticated',
         coalesce(has_function_privilege('authenticated', ctx.fn_list_forum_posts, 'EXECUTE'), false),
         'authenticated 需有 list_forum_posts 执行权限'
  from ctx

  -- 管理员审核 RPC
  union all
  select 180, 'rpc.admin_apply_moderation_action exists',
         (ctx.fn_admin_apply_moderation_action is not null),
         '应存在 admin_apply_moderation_action(text,uuid,text,text)'
  from ctx
  union all
  select 190, 'rpc.admin_delete_moderation_target exists',
         (ctx.fn_admin_delete_moderation_target is not null),
         '应存在 admin_delete_moderation_target(text,uuid)'
  from ctx

  -- 审核日志写入 RPC 兜底
  union all
  select 200, 'rpc.insert_moderation_log exists',
         (ctx.fn_insert_moderation_log is not null),
         '应存在 insert_moderation_log(uuid,text,text,text,uuid)'
  from ctx
  union all
  select 210, 'rpc.insert_moderation_log executable by authenticated',
         coalesce(has_function_privilege('authenticated', ctx.fn_insert_moderation_log, 'EXECUTE'), false),
         'authenticated 需有 insert_moderation_log 执行权限'
  from ctx
  union all
  select 220, 'index.idx_moderation_logs_target_type_target_id_created exists',
         (to_regclass('public.idx_moderation_logs_target_type_target_id_created') is not null),
         '应存在 moderation_logs 复合索引'

  -- 自助注销 RPC
  union all
  select 230, 'rpc.delete_my_account exists',
         (ctx.fn_delete_my_account is not null),
         '应存在 delete_my_account(text)'
  from ctx
  union all
  select 240, 'rpc.delete_my_account security definer',
         exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.oid = ctx.fn_delete_my_account
             and p.prosecdef = true
         ),
         'delete_my_account 应为 SECURITY DEFINER'
  from ctx
  union all
  select 250, 'rpc.delete_my_account executable by authenticated',
         coalesce(has_function_privilege('authenticated', ctx.fn_delete_my_account, 'EXECUTE'), false),
         'authenticated 需有 delete_my_account 执行权限'
  from ctx

  -- posts RLS 策略（至少具备可读/可插入）
  union all
  select 260, 'policy.posts SELECT exists',
         exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'posts'
             and cmd = 'SELECT'
         ),
         'posts 应至少存在一条 SELECT 策略'
  union all
  select 270, 'policy.posts INSERT exists',
         exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'posts'
             and cmd = 'INSERT'
         ),
         'posts 应至少存在一条 INSERT 策略'
  union all
  select 280, 'table.public.forum_post_reports exists',
         (to_regclass('public.forum_post_reports') is not null),
         '应存在 public.forum_post_reports'
  union all
  select 290, 'rpc.submit_forum_post_report exists',
         (ctx.fn_submit_forum_post_report is not null),
         '应存在 submit_forum_post_report(uuid,text,text)'
  from ctx
  union all
  select 300, 'rpc.submit_forum_post_report executable by authenticated',
         coalesce(has_function_privilege('authenticated', ctx.fn_submit_forum_post_report, 'EXECUTE'), false),
         'authenticated 需有 submit_forum_post_report 执行权限'
  from ctx
  union all
  select 310, 'policy.comments SELECT visibility guarded',
         exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'comments'
             and policyname = 'comments_select_visible'
             and cmd = 'SELECT'
             and coalesce(qual, '') ilike '%comments.status%'
             and coalesce(qual, '') ilike '%approved%'
             and coalesce(qual, '') ilike '%posts%'
         ),
         'comments SELECT 应跟随帖子可见性，且普通/帖子作者读取需约束评论自身 approved 状态'
  union all
  select 320, 'server moderation queue absent or marked disabled',
         (
           to_regclass('public.moderation_jobs') is null
           or coalesce(obj_description(to_regclass('public.moderation_jobs'), 'pg_class'), '') ilike '%Disabled%'
         ),
         '前端先发后审模式下 moderation_jobs 可不存在；若保留，应标记为 disabled'
  union all
  select 330, 'rpc.claim_moderation_jobs not executable by service_role',
         not coalesce(has_function_privilege('service_role', ctx.fn_claim_moderation_jobs, 'EXECUTE'), false),
         '前端先发后审模式下 service_role 不应继续执行 claim_moderation_jobs'
  from ctx
  union all
  select 340, 'rpc.complete_moderation_job not executable by service_role',
         not coalesce(has_function_privilege('service_role', ctx.fn_complete_moderation_job, 'EXECUTE'), false),
         '前端先发后审模式下 service_role 不应继续执行 complete_moderation_job'
  from ctx
  union all
  select 350, 'rpc.fail_moderation_job not executable by service_role',
         not coalesce(has_function_privilege('service_role', ctx.fn_fail_moderation_job, 'EXECUTE'), false),
         '前端先发后审模式下 service_role 不应继续执行 fail_moderation_job'
  from ctx
  union all
  select 360, 'trigger.posts moderation job queue disabled',
         not exists (
           select 1 from pg_trigger
           where tgname = 'trg_queue_post_moderation_job'
             and tgrelid = to_regclass('public.posts')
             and not tgisinternal
         ),
         '前端先发后审模式下 posts 写入/编辑不应自动入队 moderation_jobs'
  union all
  select 370, 'trigger.comments moderation job queue disabled',
         not exists (
           select 1 from pg_trigger
           where tgname = 'trg_queue_comment_moderation_job'
             and tgrelid = to_regclass('public.comments')
             and not tgisinternal
         ),
         '前端先发后审模式下 comments 写入/编辑不应自动入队 moderation_jobs'
  union all
  select 380, 'trigger.messages moderation job queue disabled',
         not exists (
           select 1 from pg_trigger
           where tgname = 'trg_queue_message_moderation_job'
             and tgrelid = to_regclass('public.messages')
             and not tgisinternal
         ),
         '前端先发后审模式下 messages 写入/编辑不应自动入队 moderation_jobs'
),
summary as (
  select
    count(*) as total_checks,
    count(*) filter (where passed) as passed_checks,
    count(*) filter (where not passed) as failed_checks,
    bool_and(passed) as all_passed
  from checks
)
select
  'SUMMARY' as section,
  0 as ord,
  format(
    'overall=%s, passed=%s/%s',
    case when s.all_passed then 'PASS' else 'FAIL' end,
    s.passed_checks,
    s.total_checks
  ) as check_name,
  s.all_passed as passed,
  format('failed=%s', s.failed_checks) as detail
from summary s

union all

select
  'CHECK' as section,
  c.ord,
  c.check_name,
  c.passed,
  c.detail
from checks c

order by ord;
