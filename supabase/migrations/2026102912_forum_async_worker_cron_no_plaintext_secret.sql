-- 把 forum_async_worker_cron 的命令体改成「运行时读 vault」（2026-10-29 审查 P2-1）
--
-- ── 问题 ──────────────────────────────────────────────────────────
-- 2026102909 用 `format(%L, …)` 把 supabase_url / anon key / forum_worker_secret
-- **渲染成字面量**写进 cron.job.command。同一批同日的姊妹任务（2026102801 的
-- boh_mail_outbox_retry、boh_push_outbox_retry，以及周报 cron）用的都是
-- 「命令里只写 vault secret 名字，执行期再解密」的写法。
--
-- 线上实测（2026-10-29）：
--   select jobname, position('vault.decrypted_secrets' in command) > 0
--     from cron.job where jobname like '%worker%' or jobname like '%outbox%';
--   → forum_async_worker_cron 是 12 个任务里**唯一**「用了 vault 变量却不在
--     命令体里读 vault」的那一个。
--
-- 两个后果：
--   ① 任何能看 cron.job 的角色、以及数据库导出/备份都会拿到 worker 共享密钥；
--   ② 更现实的运维坑：轮换密钥后 cron 仍带旧值 ⇒ 静默 401 ⇒ worker 不再被唤醒，
--      而这条 cron 是 image_recheck **唯一**的执行者（客户端只入队，不执行）。
--      复审链路会无声停摆，不报错、不告警，只有「图一直不撤」这个现象。
--
-- ── 修法 ──────────────────────────────────────────────────────────
-- 命令体只保留 secret 名字，执行期解密（与 2026102801 完全同款）。
-- 依旧幂等：先按 jobname unschedule 再重建；secret 缺失时**抛异常**而不是
-- raise notice + return（那是 2026102909 自己总结出来的教训）。
--
-- 注意：本文件是这条 cron 的**当前定义**，2026102909 是历史记录（它已经把
-- 明文写进线上库了，改历史文件不会重跑，故用新迁移覆盖）。

begin;

do $cron$
declare
  v_job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'forum_async_worker_cron 注册失败：pg_net 未启用';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'supabase_url') then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 supabase_url';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'forum_worker_secret') then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 forum_worker_secret（= EF secret FORUM_WORKER_SECRET）';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'forum_worker_anon_key') then
    raise exception 'forum_async_worker_cron 注册失败：vault 缺少 forum_worker_anon_key';
  end if;

  for v_job in select jobid from cron.job where jobname = 'forum_async_worker_cron' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'forum_async_worker_cron',
    '*/5 * * * *',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/forum-async-worker',
        headers := jsonb_build_object(
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'forum_worker_anon_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'forum_worker_anon_key'),
          'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'forum_worker_secret'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron')
      );
    $cmd$
  );

  raise notice 'cron 任务已重建：forum_async_worker_cron（每 5 分钟，命令体不含明文密钥）。';
end;
$cron$;

commit;
