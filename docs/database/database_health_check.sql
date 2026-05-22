-- BOH database health check
-- Usage:
-- 1) Run this whole file in Supabase SQL Editor.
-- 2) Read the final result set. FAIL means action is needed; WARN means review.
-- 3) This script only uses temporary tables and catalog reads. It does not change app data.

drop table if exists pg_temp.boh_db_health_results;

create temp table boh_db_health_results (
  sort_order integer not null,
  status text not null check (status in ('PASS', 'WARN', 'FAIL', 'INFO')),
  area text not null,
  check_name text not null,
  detail text not null
);

insert into boh_db_health_results
values
  (10, 'INFO', 'runtime', 'database', current_database()),
  (11, 'INFO', 'runtime', 'current_user', current_user),
  (12, 'INFO', 'runtime', 'checked_at', now()::text),
  (13, 'INFO', 'runtime', 'postgres_version', version());

-- Required extensions used by migrations and runtime retrieval.
with required_extensions(extname, required) as (
  values
    ('pgcrypto', true),
    ('vector', true),
    ('pg_stat_statements', false)
)
insert into boh_db_health_results
select
  case when required then 100 else 110 end,
  case
    when e.extname is not null then 'PASS'
    when required then 'FAIL'
    else 'WARN'
  end,
  'extensions',
  r.extname,
  case
    when e.extname is not null then 'extension installed in schema ' || n.nspname
    when required then 'missing required extension'
    else 'optional extension missing; only performance diagnostics are affected'
  end
from required_extensions r
left join pg_extension e
  on e.extname = r.extname
left join pg_namespace n
  on n.oid = e.extnamespace;

-- Tables used by frontend, Edge Functions, and migrations.
with required_tables(table_name, importance) as (
  values
    ('activities', 'required'),
    ('addresses', 'optional'),
    ('avatars', 'frontend'),
    ('comments', 'required'),
    ('likes', 'required'),
    ('messages', 'required'),
    ('moderation_logs', 'required'),
    ('news', 'required'),
    ('notifications', 'required'),
    ('posts', 'required'),
    ('products', 'required'),
    ('profiles', 'required'),
    ('user_gifts', 'required'),
    ('user_impressions', 'required'),
    ('user_subscriptions', 'required'),
    ('shop_points_orders', 'required'),
    ('forum_weekly_checkins', 'required'),
    ('forum_post_images', 'required'),
    ('forum_post_reports', 'required'),
    ('forum_rate_limit_events', 'required'),
    ('boh_treehole_spaces', 'required'),
    ('boh_treehole_memories', 'required'),
    ('boh_treehole_memory_candidates', 'required'),
    ('boh_ai_shared_memories', 'required'),
    ('boh_ai_core_memories', 'required'),
    ('boh_ai_knowledge_bases', 'required'),
    ('boh_ai_knowledge_chunks', 'required'),
    ('boh_note_entries', 'required'),
    ('boh_cloud_entries', 'required'),
    ('boh_cloud_share_channels', 'required'),
    ('boh_cloud_share_viewers', 'required'),
    ('boh_creator_shows', 'required'),
    ('creator_studio_teams', 'archived'),
    ('creator_studio_team_members', 'archived'),
    ('creator_studio_team_scripts', 'archived'),
    ('creator_studio_projects', 'archived'),
    ('moderation_jobs', 'optional'),
    ('lotteries', 'required'),
    ('lottery_entries', 'required'),
    ('lottery_draw_logs', 'required'),
    ('lottery_join_attempts', 'required')
)
insert into boh_db_health_results
select
  200,
  case
    when importance = 'archived' and to_regclass('public.' || table_name) is null then 'PASS'
    when importance = 'archived' and to_regclass('public.' || table_name) is not null then 'WARN'
    when to_regclass('public.' || table_name) is not null then 'PASS'
    when importance in ('optional', 'frontend') then 'WARN'
    else 'FAIL'
  end,
  'tables',
  table_name,
  case
    when importance = 'archived' and to_regclass('public.' || table_name) is null then 'archived object is absent as expected'
    when importance = 'archived' and to_regclass('public.' || table_name) is not null then 'archived object still exists; run 20260509_drop_archived_creator_and_video_script.sql if this feature is retired'
    when to_regclass('public.' || table_name) is not null then 'exists'
    when importance = 'optional' then 'missing optional table; review if feature is enabled'
    when importance = 'frontend' then 'missing frontend-referenced table; review runtime path before treating as blocker'
    else 'missing required table'
  end
from required_tables;

-- Columns that are directly used by recent features.
with required_columns(table_name, column_name, importance) as (
  values
    ('profiles', 'id', 'required'),
    ('profiles', 'username', 'required'),
    ('profiles', 'email', 'required'),
    ('profiles', 'role', 'required'),
    ('profiles', 'points', 'required'),
    ('profiles', 'experience', 'required'),
    ('profiles', 'join_date', 'required'),
    ('profiles', 'pushplus_token', 'required'),
    ('profiles', 'pushplus_enabled', 'required'),
    ('posts', 'status', 'required'),
    ('posts', 'title', 'required'),
    ('posts', 'comment_count', 'required'),
    ('posts', 'like_count', 'required'),
    ('posts', 'image_count', 'required'),
    ('comments', 'status', 'required'),
    ('messages', 'moderation_status', 'required'),
    ('notifications', 'content', 'required'),
    ('user_subscriptions', 'status', 'required'),
    ('user_subscriptions', 'expires_at', 'required'),
    ('user_gifts', 'gift_status', 'required'),
    ('boh_cloud_entries', 'visibility', 'required'),
    ('boh_cloud_entries', 'source', 'required'),
    ('boh_note_entries', 'mood', 'required'),
    ('boh_ai_knowledge_chunks', 'embedding', 'required'),
    ('boh_ai_knowledge_chunks', 'source_type', 'required'),
    ('boh_ai_knowledge_chunks', 'status', 'required'),
    ('boh_ai_knowledge_bases', 'slug', 'required'),
    ('boh_ai_core_memories', 'priority', 'required'),
    ('lotteries', 'status', 'required'),
    ('lotteries', 'is_home_visible', 'required'),
    ('lotteries', 'is_community_visible', 'required'),
    ('lotteries', 'winner_count', 'required'),
    ('lotteries', 'entry_deadline_at', 'required'),
    ('lotteries', 'fulfillment_status', 'required'),
    ('lottery_entries', 'lottery_id', 'required'),
    ('lottery_entries', 'user_id', 'required'),
    ('lottery_draw_logs', 'draw_no', 'required'),
    ('lottery_draw_logs', 'winner_position', 'required'),
    ('lottery_join_attempts', 'result_code', 'required')
)
insert into boh_db_health_results
select
  300,
  case
    when c.column_name is not null then 'PASS'
    when rc.importance = 'optional' then 'WARN'
    else 'FAIL'
  end,
  'columns',
  rc.table_name || '.' || rc.column_name,
  case
    when c.column_name is not null then 'exists as ' || c.data_type
    else 'missing column'
  end
from required_columns rc
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = rc.table_name
 and c.column_name = rc.column_name;

-- RPCs called by the frontend or Edge Functions.
with required_functions(function_name, importance) as (
  values
    ('admin_apply_moderation_action', 'required'),
    ('admin_data_management_counts', 'required'),
    ('admin_delete_moderation_target', 'required'),
    ('admin_delete_user_account', 'required'),
    ('admin_lottery_entry_counts', 'required'),
    ('create_forum_post_with_images', 'required'),
    ('create_shop_order_with_points', 'required'),
    ('delete_my_account', 'required'),
    ('disable_my_boh_cloud_share_channel', 'required'),
    ('execute_lottery_draw', 'required'),
    ('get_community_lotteries', 'required'),
    ('get_home_lottery', 'required'),
    ('get_my_boh_cloud_share_channel', 'required'),
    ('get_my_boh_cloud_share_channels', 'required'),
    ('get_my_boh_cloud_share_viewers', 'required'),
    ('get_pushplus_token_for_notification', 'required'),
    ('get_shared_boh_cloud_channel_by_token', 'required'),
    ('get_weekly_checkin_status', 'required'),
    ('insert_moderation_log', 'required'),
    ('join_community_lottery', 'required'),
    ('join_home_lottery', 'required'),
    ('list_forum_comment_thread', 'required'),
    ('list_forum_posts', 'required'),
    ('mark_all_as_read', 'optional'),
    ('mark_single_as_read', 'optional'),
    ('match_boh_ai_knowledge_chunks', 'required'),
    ('search_boh_ai_shared_memories', 'required'),
    ('set_my_boh_cloud_share_description', 'required'),
    ('set_my_boh_cloud_share_visibility', 'required'),
    ('submit_forum_post_report', 'required'),
    ('submit_weekly_checkin', 'required'),
    ('subscribe_with_points', 'required'),
    ('toggle_forum_like', 'required'),
    ('upsert_my_boh_cloud_share_channel', 'required'),
    ('increment_xp', 'required')
)
insert into boh_db_health_results
select
  400,
  case
    when p.proname is not null then 'PASS'
    when rf.importance = 'optional' then 'WARN'
    else 'FAIL'
  end,
  'rpc',
  rf.function_name,
  case
    when p.proname is not null then 'function exists; overload count=' || count(p.oid)::text
    when rf.importance = 'optional' then 'missing optional RPC; app has fallback or feature may be inactive'
    else 'missing required RPC used by runtime'
  end
from required_functions rf
left join (
  select p.oid, p.proname
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
   and n.nspname = 'public'
) p
  on p.proname = rf.function_name
group by rf.function_name, rf.importance, p.proname;

-- RLS state for app-exposed tables.
with rls_tables(table_name, expected) as (
  values
    ('activities', true),
    ('news', true),
    ('products', true),
    ('profiles', true),
    ('posts', true),
    ('comments', true),
    ('messages', true),
    ('notifications', true),
    ('user_gifts', true),
    ('user_subscriptions', true),
    ('forum_weekly_checkins', true),
    ('forum_post_images', true),
    ('forum_post_reports', true),
    ('boh_treehole_spaces', true),
    ('boh_treehole_memories', true),
    ('boh_treehole_memory_candidates', true),
    ('boh_ai_shared_memories', true),
    ('boh_ai_core_memories', true),
    ('boh_ai_knowledge_bases', true),
    ('boh_ai_knowledge_chunks', true),
    ('boh_cloud_entries', true),
    ('boh_cloud_share_channels', true),
    ('boh_cloud_share_viewers', true),
    ('lotteries', true),
    ('lottery_entries', true),
    ('lottery_draw_logs', true),
    ('lottery_join_attempts', true)
)
insert into boh_db_health_results
select
  500,
  case
    when c.oid is null then 'FAIL'
    when c.relrowsecurity = expected then 'PASS'
    when expected then 'FAIL'
    else 'WARN'
  end,
  'rls',
  rt.table_name,
  case
    when c.oid is null then 'table missing'
    when c.relrowsecurity then 'RLS enabled'
    else 'RLS disabled'
  end
from rls_tables rt
left join pg_class c
  on c.oid = to_regclass('public.' || rt.table_name);

-- Key indexes expected by high-traffic screens and latest features.
with required_indexes(index_name, importance) as (
  values
    ('idx_profiles_username', 'required'),
    ('idx_profiles_join_date_username', 'required'),
    ('idx_profiles_role_join_date', 'required'),
    ('idx_posts_status_created', 'required'),
    ('idx_comments_status_created', 'required'),
    ('idx_messages_receiver_unread_approved', 'required'),
    ('idx_user_subscriptions_status_expires', 'required'),
    ('idx_boh_ai_knowledge_chunks_embedding_cosine', 'required'),
    ('idx_boh_ai_core_memories_status_priority_updated', 'required'),
    ('idx_boh_ai_knowledge_bases_public_updated', 'required'),
    ('idx_forum_post_images_post_order', 'required'),
    ('idx_lotteries_home_visible', 'required'),
    ('idx_lotteries_draw_at', 'required'),
    ('idx_lotteries_status_created', 'required'),
    ('idx_lottery_entries_lottery_created', 'required'),
    ('idx_lottery_entries_created', 'required'),
    ('idx_lottery_join_attempts_user_created', 'required')
)
insert into boh_db_health_results
select
  600,
  case
    when i.indexname is not null then 'PASS'
    when ri.importance = 'optional' then 'WARN'
    else 'FAIL'
  end,
  'indexes',
  ri.index_name,
  coalesce('exists on ' || i.tablename, 'missing index')
from required_indexes ri
left join pg_indexes i
  on i.schemaname = 'public'
 and i.indexname = ri.index_name;

-- Constraint health.
insert into boh_db_health_results
select
  700,
  case when count(*) = 0 then 'PASS' else 'WARN' end,
  'constraints',
  'unvalidated_constraints',
  case
    when count(*) = 0 then 'all public constraints are validated'
    else count(*)::text || ' constraints are not validated: ' || string_agg(conname, ', ' order by conname) || '. Existing rows may predate the checks; new writes are still checked.'
  end
from pg_constraint
where connamespace = 'public'::regnamespace
  and not convalidated;

-- Migration ordering risk found in the repository: performance migration can run
-- before home lottery migration if both keep the current 20260510_* names.
insert into boh_db_health_results
select
  750,
  case
    when to_regclass('public.lotteries') is not null
     and exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and indexname in ('idx_lotteries_status_created', 'idx_lottery_entries_created')
     )
    then 'PASS'
    else 'WARN'
  end,
  'migrations',
  '20260510_order_lottery_performance',
  'If rebuilding from migrations, ensure 20260510_home_lotteries.sql runs before 20260510_admin_data_management_performance.sql, or guard lottery references in the performance migration.';

-- Dynamic data checks that must avoid referencing missing tables.
do $$
declare
  v_count bigint;
begin
  if to_regclass('public.profiles') is not null then
    execute 'select count(*) from public.profiles where coalesce(trim(username), '''') = '''''
      into v_count;
    insert into boh_db_health_results
    values (
      800,
      case when v_count = 0 then 'PASS' else 'FAIL' end,
      'data',
      'profiles_blank_username',
      v_count::text || ' rows'
    );

    execute 'select count(*) from (select username from public.profiles group by username having count(*) > 1) d'
      into v_count;
    insert into boh_db_health_results
    values (
      801,
      case when v_count = 0 then 'PASS' else 'FAIL' end,
      'data',
      'profiles_duplicate_username',
      v_count::text || ' duplicate username groups'
    );
  end if;

  if to_regclass('public.posts') is not null then
    execute 'select count(*) from public.posts where coalesce(status, '''') not in (''approved'', ''rejected'', ''limited'')'
      into v_count;
    insert into boh_db_health_results
    values (
      810,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data',
      'posts_status_values',
      v_count::text || ' posts with unexpected status'
    );
  end if;

  if to_regclass('public.comments') is not null then
    execute 'select count(*) from public.comments where coalesce(status, '''') not in (''approved'', ''rejected'', ''limited'')'
      into v_count;
    insert into boh_db_health_results
    values (
      811,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data',
      'comments_status_values',
      v_count::text || ' comments with unexpected status'
    );
  end if;

  if to_regclass('public.messages') is not null then
    execute 'select count(*) from public.messages where coalesce(moderation_status, '''') not in (''approved'', ''rejected'', ''limited'')'
      into v_count;
    insert into boh_db_health_results
    values (
      812,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data',
      'messages_moderation_status_values',
      v_count::text || ' messages with unexpected moderation_status'
    );
  end if;

  if to_regclass('public.lotteries') is not null then
    execute 'select count(*) from public.lotteries where status not in (''draft'', ''open'', ''drawn'', ''closed'')'
      into v_count;
    insert into boh_db_health_results
    values (
      820,
      case when v_count = 0 then 'PASS' else 'FAIL' end,
      'data',
      'lotteries_status_values',
      v_count::text || ' lotteries with invalid status'
    );

    execute 'select count(*) from public.lotteries where status = ''open'' and draw_at is not null and draw_at <= now()'
      into v_count;
    insert into boh_db_health_results
    values (
      821,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data',
      'lotteries_due_for_draw',
      v_count::text || ' open lotteries are due for draw'
    );
  end if;

  if to_regclass('public.lottery_entries') is not null then
    execute 'select count(*) from (select lottery_id, user_id from public.lottery_entries group by lottery_id, user_id having count(*) > 1) d'
      into v_count;
    insert into boh_db_health_results
    values (
      822,
      case when v_count = 0 then 'PASS' else 'FAIL' end,
      'data',
      'lottery_duplicate_entries',
      v_count::text || ' duplicate lottery/user entry groups'
    );
  end if;

  if to_regclass('public.boh_ai_knowledge_chunks') is not null then
    execute 'select count(*) from public.boh_ai_knowledge_chunks where status = ''active'' and embedding is null'
      into v_count;
    insert into boh_db_health_results
    values (
      830,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data',
      'boh_ai_active_chunks_without_embedding',
      v_count::text || ' active chunks have no embedding'
    );
  end if;
end $$;

-- Basic table bloat/dead tuple signal.
insert into boh_db_health_results
select
  900,
  case
    when n_dead_tup > greatest(1000, n_live_tup * 0.2) then 'WARN'
    else 'PASS'
  end,
  'maintenance',
  relname,
  'live=' || n_live_tup::text
    || ', dead=' || n_dead_tup::text
    || ', last_autovacuum=' || coalesce(last_autovacuum::text, 'never')
from pg_stat_user_tables
where schemaname = 'public'
order by n_dead_tup desc
limit 20;

-- Final summary first, then detailed rows.
select
  status,
  count(*) as checks
from boh_db_health_results
group by status
order by case status when 'FAIL' then 1 when 'WARN' then 2 when 'PASS' then 3 else 4 end;

select
  status,
  area,
  check_name,
  detail
from boh_db_health_results
order by
  case status when 'FAIL' then 1 when 'WARN' then 2 when 'PASS' then 3 else 4 end,
  sort_order,
  area,
  check_name;
