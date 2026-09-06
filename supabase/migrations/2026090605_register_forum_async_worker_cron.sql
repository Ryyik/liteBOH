begin;

-- ============================================
-- 注册 forum-async-worker 兜底唤醒 Cron（设计文档 plans/006 第 L3 层）
--
-- 背景：前端入队后仅一次性 fire-and-forget 唤醒 worker，且 worker 单次
-- 只处理 1 个 job。若该次调用失败，或 fail_forum_async_job 将任务置回
-- pending（run_after = now()+30s）等待重试，之后没有任何调用方来
-- claim —— 任务会永久卡死，max_attempts 重试机制形同虚设。
--
-- 本迁移复用周报（2026090602）同款模式：pg_cron 每 5 分钟以 service_role
-- Bearer 唤醒 worker（worker 的 Cron 通道接受 service_role，见 index.ts），
-- 补处理漏掉/重试的任务。
-- 前置条件：pg_cron + pg_net 扩展、app.settings.supabase_url、
--           app.settings.service_role_key（与 2026090602 周报同款，已配置）。
-- 幂等：重复执行会先 unschedule 再重建同名任务。
-- ============================================

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
    raise notice '论坛异步任务兜底唤醒未注册：需要同时启用 pg_cron 和 pg_net。';
    return;
  end if;

  if v_supabase_url is null or v_service_role_key is null then
    raise notice '论坛异步任务兜底唤醒未注册：缺少 app.settings.supabase_url 或 app.settings.service_role_key。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'forum_async_worker_cron';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'forum_async_worker_cron',
    '*/5 * * * *',
    format($cmd$
      select net.http_post(
        url := %L || '/functions/v1/forum-async-worker',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$, rtrim(v_supabase_url, '/'), v_service_role_key)
  );

  raise notice '论坛异步任务兜底唤醒已注册：每 5 分钟唤醒一次 forum-async-worker。';
exception when others then
  raise notice '创建论坛异步任务兜底唤醒失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
