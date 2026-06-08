-- Forum / Cloudinary / BOHAI database health check
-- Usage:
-- 1) Run this whole file in Supabase SQL Editor.
-- 2) Review FAIL first, then WARN. This script is read-only except pg_temp objects.
-- 3) Expected current policy: max 6 images/post, 10MB client upload, 25MP DB dimensions,
--    max 5 image posts per Asia/Shanghai natural day, manual cover selection,
--    Cloudinary pending uploads enabled, retry hints enabled.

drop table if exists pg_temp.forum_health_results;

create temp table forum_health_results (
  sort_order integer not null,
  status text not null check (status in ('PASS', 'WARN', 'FAIL', 'INFO')),
  area text not null,
  check_name text not null,
  detail text not null
);

insert into forum_health_results
values
  (10, 'INFO', 'runtime', 'database', current_database()),
  (11, 'INFO', 'runtime', 'current_user', current_user),
  (12, 'INFO', 'runtime', 'checked_at', now()::text),
  (13, 'INFO', 'runtime', 'postgres_version', version());

with required_tables(table_name, expected) as (
  values
    ('posts', 'forum core'),
    ('comments', 'forum core'),
    ('likes', 'forum core'),
    ('profiles', 'identity'),
    ('notifications', 'moderation retry notices'),
    ('forum_post_images', 'image posts'),
    ('forum_rate_limit_events', 'rate-limit audit'),
    ('forum_weekly_checkins', 'weekly check-in'),
    ('boh_cloud_entries', 'forum image Cloud+ sync'),
    ('cloudinary_pending_uploads', 'pending upload ownership / preflight')
)
insert into forum_health_results
select
  100,
  case when to_regclass('public.' || table_name) is null then 'FAIL' else 'PASS' end,
  'tables',
  table_name,
  case when to_regclass('public.' || table_name) is null then 'missing: ' || expected else 'exists: ' || expected end
from required_tables;

with required_columns(table_name, column_name, expected) as (
  values
    ('posts', 'title', 'structured post title'),
    ('posts', 'body', 'raw user-authored post body'),
    ('posts', 'tag', 'forum tag filter/search'),
    ('posts', 'image_count', 'image-post limits'),
    ('posts', 'cover_image_url', 'list image preview'),
    ('posts', 'forum_cloud_entry_id', 'Cloud+ sync pointer'),
    ('forum_post_images', 'public_id', 'Cloudinary identity'),
    ('forum_post_images', 'sort_order', 'drag/drop order'),
    ('forum_post_images', 'width', 'dimension guard'),
    ('forum_post_images', 'height', 'dimension guard'),
    ('forum_post_images', 'moderation_status', 'image safety'),
    ('cloudinary_pending_uploads', 'public_id', 'pending upload identity'),
    ('cloudinary_pending_uploads', 'claimed_at', 'mark uploaded image claimed after publish'),
    ('cloudinary_pending_uploads', 'deleted_at', 'ignore cleaned drafts'),
    ('cloudinary_pending_uploads', 'source', 'forum/generic upload source'),
    ('cloudinary_pending_uploads', 'folder', 'Cloudinary folder audit')
)
insert into forum_health_results
select
  200,
  case when c.column_name is null then 'FAIL' else 'PASS' end,
  'columns',
  rc.table_name || '.' || rc.column_name,
  case when c.column_name is null then 'missing: ' || rc.expected else 'exists as ' || c.data_type end
from required_columns rc
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = rc.table_name
 and c.column_name = rc.column_name;

with required_functions(function_name, expected) as (
  values
    ('create_forum_post_with_images', 'image post creation RPC'),
    ('list_forum_posts', 'forum list/search RPC'),
    ('list_forum_comment_thread', 'comment thread paging RPC'),
    ('toggle_forum_like', 'like RPC'),
    ('submit_forum_post_report', 'report RPC'),
    ('get_weekly_checkin_status', 'weekly check-in status'),
    ('submit_weekly_checkin', 'weekly check-in submit'),
    ('assert_cloudinary_upload_allowed', 'Cloudinary upload preflight'),
    ('enforce_forum_post_rate_limit', 'post retry hint trigger'),
    ('enforce_forum_comment_rate_limit', 'comment retry hint trigger'),
    ('guard_boh_cloud_entry_upload', 'Cloud+ upload guard')
)
insert into forum_health_results
select
  300,
  case when p.proname is null then 'FAIL' else 'PASS' end,
  'rpc',
  rf.function_name,
  case when p.proname is null then 'missing: ' || rf.expected else 'exists; overload count=' || count(p.oid)::text end
from required_functions rf
left join (
  select p.oid, p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
) p on p.proname = rf.function_name
group by rf.function_name, rf.expected, p.proname;

insert into forum_health_results
select
  400,
  case
    when c.oid is null then 'FAIL'
    when pg_get_constraintdef(c.oid) like '%25000000%' then 'PASS'
    when pg_get_constraintdef(c.oid) like '%24000000%' then 'FAIL'
    else 'WARN'
  end,
  'forum_images',
  'forum_post_images_dimensions_chk',
  coalesce(pg_get_constraintdef(c.oid), 'missing dimensions constraint')
from (select 1) seed
left join pg_constraint c
  on c.conrelid = 'public.forum_post_images'::regclass
 and c.conname = 'forum_post_images_dimensions_chk';

with image_rpc as (
  select case
    when to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)') is null then null
    else pg_get_functiondef(to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)'))
  end as def
)
insert into forum_health_results
select
  410,
  case
    when def is null then 'FAIL'
    when position('v_image_count > 6' in def) > 0 then 'PASS'
    else 'WARN'
  end,
  'forum_images',
  'max_images_per_post',
  case
    when def is null then 'missing create_forum_post_with_images(text,text,text,jsonb,text)'
    when position('v_image_count > 6' in def) > 0 then 'single post cap is 6 images'
    else 'cannot confirm 6-image cap from function body'
  end
from image_rpc;

with image_rpc as (
  select case
    when to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)') is null then null
    else pg_get_functiondef(to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)'))
  end as def
)
insert into forum_health_results
select
  420,
  case
    when def is null then 'FAIL'
    when position('25000000' in def) > 0 and position('24000000' in def) = 0 then 'PASS'
    when position('24000000' in def) > 0 then 'FAIL'
    else 'WARN'
  end,
  'forum_images',
  'image_rpc_25mp',
  case
    when def is null then 'missing image post RPC'
    when position('25000000' in def) > 0 and position('24000000' in def) = 0 then 'RPC uses 25MP and has no 24MP residue'
    when position('24000000' in def) > 0 then 'RPC still contains 24MP limit'
    else 'cannot find pixel limit literal in RPC'
  end
from image_rpc;

with image_rpc as (
  select case
    when to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)') is null then null
    else pg_get_functiondef(to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)'))
  end as def
)
insert into forum_health_results
select
  430,
  case
    when def is null then 'FAIL'
    when position('DAILY_IMAGE_POST_LIMIT' in def) > 0 and position('v_daily_image_post_count >= 5' in def) > 0 then 'PASS'
    when position('DAILY_IMAGE_POST_LIMIT' in def) > 0 then 'WARN'
    else 'FAIL'
  end,
  'forum_limits',
  'daily_5_image_posts_cap',
  case
    when def is null then 'missing image post RPC'
    when position('DAILY_IMAGE_POST_LIMIT' in def) > 0 and position('v_daily_image_post_count >= 5' in def) > 0 then 'daily 5 image-post cap is enabled'
    when position('DAILY_IMAGE_POST_LIMIT' in def) > 0 then 'daily limit exists, but cannot confirm threshold'
    else 'daily 5 image-post cap is missing'
  end
from image_rpc;

with image_rpc as (
  select case
    when to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)') is null then null
    else pg_get_functiondef(to_regprocedure('public.create_forum_post_with_images(text, text, text, jsonb, text)'))
  end as def
)
insert into forum_health_results
select
  440,
  case
    when def is null then 'FAIL'
    when (position('isCover' in def) > 0 or position('is_cover' in def) > 0)
      and position('v_manual_cover_url' in def) > 0
      and position('cover_image_url' in def) > 0 then 'PASS'
    else 'FAIL'
  end,
  'forum_images',
  'manual_cover_selection',
  case
    when def is null then 'missing image post RPC'
    when (position('isCover' in def) > 0 or position('is_cover' in def) > 0)
      and position('v_manual_cover_url' in def) > 0
      and position('cover_image_url' in def) > 0 then 'RPC reads image cover marker and writes cover_image_url'
    else 'cannot confirm manual cover support in RPC'
  end
from image_rpc;

with defs as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('assert_cloudinary_upload_allowed', 'enforce_forum_post_rate_limit', 'enforce_forum_comment_rate_limit', 'create_forum_post_with_images')
)
insert into forum_health_results
select
  500,
  case when position('hint =' in def) > 0 then 'PASS' else 'WARN' end,
  'retry_hints',
  proname,
  case when position('hint =' in def) > 0 then 'function returns retry hint on rate limit paths' else 'no retry hint literal found in function body' end
from defs
order by proname;

insert into forum_health_results
select
  600,
  case
    when c.relrowsecurity is true then 'PASS'
    when c.oid is null then 'FAIL'
    else 'FAIL'
  end,
  'rls',
  'cloudinary_pending_uploads',
  case
    when c.oid is null then 'missing table'
    when c.relrowsecurity is true then 'RLS enabled'
    else 'RLS disabled'
  end
from (select 1) seed
left join pg_class c
  on c.oid = to_regclass('public.cloudinary_pending_uploads');

with required_policies(policy_name) as (
  values
    ('cloudinary_pending_uploads_select_own'),
    ('cloudinary_pending_uploads_insert_own'),
    ('cloudinary_pending_uploads_update_own')
)
insert into forum_health_results
select
  610,
  case when p.policyname is null then 'FAIL' else 'PASS' end,
  'rls',
  rp.policy_name,
  case when p.policyname is null then 'missing pending-upload RLS policy' else 'policy exists' end
from required_policies rp
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = 'cloudinary_pending_uploads'
 and p.policyname = rp.policy_name;

do $$
declare
  v_count integer := 0;
begin
  if to_regclass('public.forum_post_images') is null or to_regclass('public.posts') is null then
    insert into forum_health_results
    values (700, 'FAIL', 'data_integrity', 'orphan_forum_post_images', 'posts or forum_post_images table is missing');
  else
    execute $sql$
      select count(*)
      from public.forum_post_images i
      left join public.posts p on p.id = i.post_id
      where p.id is null
    $sql$ into v_count;

    insert into forum_health_results
    values (
      700,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data_integrity',
      'orphan_forum_post_images',
      v_count::text || ' forum_post_images rows without matching posts'
    );
  end if;

  if to_regclass('public.forum_post_images') is null or to_regclass('public.posts') is null then
    insert into forum_health_results
    values (710, 'FAIL', 'data_integrity', 'forum_image_count_mismatch', 'posts or forum_post_images table is missing');
  else
    execute $sql$
      select count(*)
      from public.posts p
      left join (
        select post_id, count(*)::integer as image_count
        from public.forum_post_images
        where moderation_status = 'approved'
        group by post_id
      ) i on i.post_id = p.id
      where coalesce(p.image_count, 0) <> coalesce(i.image_count, 0)
    $sql$ into v_count;

    insert into forum_health_results
    values (
      710,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data_integrity',
      'forum_image_count_mismatch',
      v_count::text || ' posts have image_count different from approved image rows'
    );
  end if;

  if to_regclass('public.forum_post_images') is null then
    insert into forum_health_results
    values (720, 'FAIL', 'data_integrity', 'invalid_forum_image_dimensions', 'forum_post_images table is missing');
  else
    execute $sql$
      select count(*)
      from public.forum_post_images
      where width <= 0
         or height <= 0
         or width > 8192
         or height > 8192
         or (width::bigint * height::bigint) > 25000000
    $sql$ into v_count;

    insert into forum_health_results
    values (
      720,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data_integrity',
      'invalid_forum_image_dimensions',
      v_count::text || ' image rows exceed 8192 edge or 25MP'
    );
  end if;

  if to_regclass('public.cloudinary_pending_uploads') is null then
    insert into forum_health_results
    values (730, 'FAIL', 'data_integrity', 'stale_pending_uploads', 'cloudinary_pending_uploads table is missing');
  else
    execute $sql$
      select count(*)
      from public.cloudinary_pending_uploads
      where claimed_at is null
        and deleted_at is null
        and created_at < now() - interval '24 hours'
    $sql$ into v_count;

    insert into forum_health_results
    values (
      730,
      case when v_count = 0 then 'PASS' else 'WARN' end,
      'data_integrity',
      'stale_pending_uploads',
      v_count::text || ' unclaimed, undeleted pending uploads older than 24h'
    );
  end if;
end;
$$;

insert into forum_health_results
select
  800,
  'INFO',
  'bohai_ai_search',
  'database_dependency',
  'BOHAI forum AI search is a frontend model-client feature; DB dependency is existing list_forum_posts search/tag/sort support';

select *
from forum_health_results
order by
  case status
    when 'FAIL' then 0
    when 'WARN' then 1
    when 'INFO' then 2
    else 3
  end,
  sort_order,
  area,
  check_name;
