-- Supabase Postgres performance playbook
-- Usage:
-- 1) Run section by section in SQL Editor.
-- 2) Collect baseline before/after index/query changes.
-- 3) Keep evidence (query id, avg latency, calls, plan).

-- ================================================================
-- 0) Prerequisites
-- ================================================================
-- Enable extension if allowed in your project.
create extension if not exists pg_stat_statements;

-- Optional: reset stats right before a controlled load test window.
-- select pg_stat_statements_reset();

-- ================================================================
-- 1) Top SQL by total execution time (overall impact)
-- ================================================================
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round((100 * total_exec_time / nullif(sum(total_exec_time) over (), 0))::numeric, 2) as total_pct,
  rows,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 240) as sample_sql
from pg_stat_statements
order by total_exec_time desc
limit 20;

-- ================================================================
-- 2) Top SQL by mean execution time (single-request latency)
-- ================================================================
select
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round(min_exec_time::numeric, 2) as min_ms,
  round(max_exec_time::numeric, 2) as max_ms,
  rows,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 240) as sample_sql
from pg_stat_statements
where calls >= 20
order by mean_exec_time desc
limit 20;

-- ================================================================
-- 3) Potential over-fetch / scan-heavy statements
-- ================================================================
select
  queryid,
  calls,
  rows,
  round((rows::numeric / nullif(calls, 0))::numeric, 2) as rows_per_call,
  round(mean_exec_time::numeric, 2) as mean_ms,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 240) as sample_sql
from pg_stat_statements
where calls >= 20
order by rows_per_call desc
limit 30;

-- ================================================================
-- 4) Table access pattern (seq scan vs index scan)
-- ================================================================
select
  relname as table_name,
  seq_scan,
  idx_scan,
  n_live_tup,
  round((100.0 * seq_scan / nullif(seq_scan + idx_scan, 0))::numeric, 2) as seq_scan_pct
from pg_stat_user_tables
order by seq_scan desc
limit 30;

-- ================================================================
-- 5) Index usage and candidates for cleanup
-- ================================================================
-- Indexes never used (review carefully; keep PK/unique/constraint indexes).
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
from pg_stat_user_indexes s
join pg_index i
  on i.indexrelid = s.indexrelid
where s.idx_scan = 0
  and not i.indisprimary
  and not i.indisunique
order by pg_relation_size(s.indexrelid) desc
limit 50;

-- ================================================================
-- 6) Largest tables and indexes
-- ================================================================
select
  relname as relation,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_size_pretty(pg_relation_size(relid)) as table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as index_toast_size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 30;

-- ================================================================
-- 7) Autovacuum and dead tuple health
-- ================================================================
select
  relname as table_name,
  n_live_tup,
  n_dead_tup,
  round((100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0))::numeric, 2) as dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc
limit 30;

-- ================================================================
-- 8) Lock wait diagnosis
-- ================================================================
select
  a.pid,
  a.usename,
  a.state,
  a.wait_event_type,
  a.wait_event,
  age(now(), a.query_start) as waiting_for,
  left(a.query, 200) as waiting_query
from pg_stat_activity a
where a.wait_event_type is not null
order by a.query_start asc;

-- ================================================================
-- 9) Find statements that may still use SELECT *
-- ================================================================
select
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) as mean_ms,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 260) as sample_sql
from pg_stat_statements
where lower(query) like '%select *%'
order by calls desc
limit 50;

-- ================================================================
-- 10) EXPLAIN ANALYZE template (replace SQL)
-- ================================================================
-- Notes:
-- - Use EXPLAIN (ANALYZE, BUFFERS) for SELECT in staging or controlled windows.
-- - For write queries in production, avoid ANALYZE unless you understand impact.

-- Example:
-- EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
-- SELECT id, username, join_date
-- FROM public.profiles
-- WHERE username ilike '%test%'
-- ORDER BY join_date desc
-- LIMIT 20;

-- ================================================================
-- 11) Optional high-impact index templates (adapt first)
-- ================================================================
-- Run CONCURRENTLY off-peak and one-by-one.
-- create index concurrently if not exists idx_profiles_username_lower
--   on public.profiles (lower(username));

-- create index concurrently if not exists idx_profiles_join_date_id
--   on public.profiles (join_date desc, id desc);

-- create index concurrently if not exists idx_posts_status_created_id
--   on public.posts (status, created_at desc, id desc);

-- create index concurrently if not exists idx_comments_post_status_created_id
--   on public.comments (post_id, status, created_at desc, id desc);

-- create index concurrently if not exists idx_notifications_recipient_status_created
--   on public.notifications (recipient_id, status, created_at desc);

-- ================================================================
-- 12) Baseline snapshot output table (optional)
-- ================================================================
-- You can persist snapshots before/after optimization for comparison.
-- create table if not exists public.perf_snapshot_pgss (
--   captured_at timestamptz not null default now(),
--   queryid bigint,
--   calls bigint,
--   total_exec_time double precision,
--   mean_exec_time double precision,
--   rows bigint,
--   sample_sql text
-- );
--
-- insert into public.perf_snapshot_pgss (queryid, calls, total_exec_time, mean_exec_time, rows, sample_sql)
-- select
--   queryid,
--   calls,
--   total_exec_time,
--   mean_exec_time,
--   rows,
--   left(regexp_replace(query, '\\s+', ' ', 'g'), 500)
-- from pg_stat_statements;
