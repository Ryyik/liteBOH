-- cron.job_run_details 保留策略
--
-- 背景（2026-09-20 审计，docs/2026-09-20-数据库与加载性能审查报告.md §1.1）：
--   cron schema = 32MB，比承载全部业务数据的 public(8.3MB) 还大 3.9 倍。
--   唯一来源是 cron.job_run_details（176,828 行 / 31MB，占全库 59MB 的 53%），
--   自 2026-05-08 建库以来从未清理；其中 execute_due_lottery_draws_every_minute
--   以 '* * * * *' 运行，每天固定新增 1440 行。
--
-- 处理：保留 7 天（足够排障），并立即清理一次历史存量。
--
-- 注意：
--   1) VACUUM 不能在事务块内运行，本迁移无法顺带回收磁盘空间；
--      push 后的磁盘回收交给 autovacuum（或手动 vacuum analyze cron.job_run_details）。
--   2) 迁移里用 do 块 + 异常兜底，遵循 2026081407_lottery_maintenance_schedule.sql 的先例。

begin;

-- ── 立即清理历史存量（一次性）──────────────────────────────
do $prune$
begin
  begin
    delete from cron.job_run_details
     where start_time < now() - interval '7 days';
    raise notice 'cron.job_run_details 历史存量已清理（保留 7 天）。';
  exception when undefined_table or insufficient_privilege then
    raise notice 'cron.job_run_details 不可访问，已跳过存量清理。';
  end;
end
$prune$;

-- ── 每日清理任务 ──────────────────────────────────────────
do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过 cron 运行日志保留任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_cron_job_run_details_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'cleanup_cron_job_run_details_daily',
    '10 4 * * *',
    $cmd$delete from cron.job_run_details where start_time < now() - interval '7 days';$cmd$
  );
exception when others then
  raise notice '创建 cron 运行日志保留任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
