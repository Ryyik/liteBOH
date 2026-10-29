-- 注册 forum-async-worker 的兜底唤醒 cron（2026-10-29 补齐）
--
-- ── 为什么需要这条 ────────────────────────────────────────────────
-- 图片异步复审（image_recheck，2026102908）唯一的执行者是 forum-async-worker，
-- 而它**只能靠 cron 唤醒**：客户端只入队（enqueue_forum_image_recheck），
-- worker 的「用户通道」只会入队 post_moderation 并处理它自己 claim 到的 job，
-- 没有任何前端路径会去 claim 一条 image_recheck。
--
-- ── 本次实测发现的真问题 ─────────────────────────────────────────
-- 2026090605 本来就要注册这个 cron，但它在 cron.job 里**根本不存在**。原因：
-- 那段 DO 块要求 `app.settings.supabase_url` 与 `app.settings.service_role_key`，
-- 而当前项目这两个 GUC 都是空的 ⇒ 它只 raise notice 就 return，静默跳过。
-- 于是从未有 cron 唤醒过 worker —— 也就是说连 post_moderation 的重试
-- （fail 后 run_after=now()+30s）一直没有兜底，任务卡住就永远卡住。
--
-- 教训（写进注释免得下次再犯）：**「缺配置就静默 return」等于把门禁做成了装饰**。
-- 既然这条 cron 是复审链路的唯一执行者，配置缺失必须让迁移失败、当场暴露。
--
-- ── 这次的做法 ───────────────────────────────────────────────────
-- 密钥走 vault（与 jobid 10/28/33 的既有 cron 同款），不再依赖 app.settings：
--   · vault: supabase_url        —— 项目 URL
--   · vault: forum_worker_secret —— worker 的 x-worker-secret（= EF secret FORUM_WORKER_SECRET）
--   · vault: forum_worker_anon_key —— 网关 JWT。函数是 verify_jwt=true，
--     cron 请求必须先过一个有效 JWT 才能进到函数体，函数内部再用 x-worker-secret
--     走 cron 分支（见 index.ts 的 isCron）。
--
-- 幂等：先按 jobname unschedule 再重建。

begin;

do $cron$
declare
  v_url text;
  v_worker_secret text;
  v_anon_key text;
  v_job record;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'supabase_url';
  select decrypted_secret into v_worker_secret
    from vault.decrypted_secrets where name = 'forum_worker_secret';
  select decrypted_secret into v_anon_key
    from vault.decrypted_secrets where name = 'forum_worker_anon_key';

  if nullif(v_url, '') is null then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 supabase_url';
  end if;
  if nullif(v_worker_secret, '') is null then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 forum_worker_secret（= EF secret FORUM_WORKER_SECRET）';
  end if;
  if nullif(v_anon_key, '') is null then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 forum_worker_anon_key';
  end if;

  for v_job in select jobid from cron.job where jobname = 'forum_async_worker_cron' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'forum_async_worker_cron',
    '*/5 * * * *',
    format($cmd$
      select net.http_post(
        url := rtrim(%L, '/') || '/functions/v1/forum-async-worker',
        headers := jsonb_build_object(
          'apikey', %L,
          'Authorization', 'Bearer ' || %L,
          'x-worker-secret', %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$, v_url, v_anon_key, v_anon_key, v_worker_secret)
  );
end;
$cron$;

commit;
