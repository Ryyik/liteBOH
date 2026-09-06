-- 补注册论坛 AI 周报定时任务（幂等，可重复执行）
--
-- 前置条件（在 Dashboard → SQL Editor 中先执行一次）：
--   alter database postgres set "app.settings.supabase_url" = 'https://nplnlefdwfgtyimfkyih.supabase.co';
--   alter database postgres set "app.settings.service_role_key" = '<你的 service_role key>';
--   （service_role key 在 Dashboard → Project Settings → API → service_role）
--
-- 然后新开一个 SQL Editor 查询窗口（让上面的数据库级配置生效），粘贴本文件全部内容执行。
-- 成功时会输出 notice：'论坛周报自动任务已注册：每周一 01:15 UTC（北京时间 09:15）。'

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
