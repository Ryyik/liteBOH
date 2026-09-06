-- Re-register the forum AI weekly report scheduler.
--
-- The original feature migration intentionally skipped scheduling when the
-- project settings were not available at migration time. This idempotent
-- follow-up gives already-provisioned projects another chance to register the
-- job after pg_cron/pg_net and the app settings have been configured.

begin;

do $cron$
declare
  v_supabase_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_service_role_key text := nullif(current_setting('app.settings.service_role_key', true), '');
  v_has_pg_cron boolean := false;
  v_has_pg_net boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  select exists (
    select 1 from pg_extension where extname = 'pg_net'
  ) into v_has_pg_net;

  if not v_has_pg_cron or not v_has_pg_net then
    raise notice '论坛周报自动任务未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  if v_supabase_url is null or v_service_role_key is null then
    raise notice '论坛周报自动任务未注册：缺少 app.settings.supabase_url 或 app.settings.service_role_key。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'generate_forum_weekly_report_weekly';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'generate_forum_weekly_report_weekly',
    '15 1 * * 1',
    format($cmd$
      select net.http_post(
        url := %L || '/functions/v1/generate-forum-weekly-report',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$, rtrim(v_supabase_url, '/'), v_service_role_key)
  );

  raise notice '论坛周报自动任务已注册：每周一 01:15 UTC（北京时间 09:15）。';
exception when others then
  raise notice '创建论坛周报自动任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
