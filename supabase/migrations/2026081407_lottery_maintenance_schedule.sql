-- Keep lottery operational data bounded without retaining scheduler no-op ticks.

begin;

do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过抽奖运营数据保留任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_lottery_operational_data_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'cleanup_lottery_operational_data_daily',
    '20 3 * * *',
    $cmd$select public.cleanup_lottery_operational_data(7, 30, 90, 365);$cmd$
  );
exception when others then
  raise notice '创建抽奖运营数据保留任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
