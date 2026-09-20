-- 退役 moderation_jobs 异步文本审核队列的残留物（收尾 2026050806）
--
-- 背景（2026-09-20 审计，docs/2026-09-20-数据库与加载性能审查报告.md §1.8 / 审核链路考古）：
--   2026050806 已经把这条链路停掉了：删掉 posts/comments/messages 上的三个入队触发器、
--   取消 pending 任务、并 revoke 掉 claim/complete/fail 的执行权限——但**故意保留了函数**，
--   注释写明 "keep existing moderation_jobs data for inspection"。
--
--   之后表本身被搬到了 archive schema 并清空：
--     - to_regclass('public.moderation_jobs') = null
--     - archive.moderation_jobs 存在，0 行
--   因此 public 侧的函数全部成为死代码，其中两个（claim_moderation_jobs /
--   enqueue_moderation_job）**引用了已不存在的 public.moderation_jobs，一调即 42P01**。
--   cron 任务 invoke-moderation-worker 最近 7 天 0 次运行，驱动它的 Edge Function
--   只服务于这条死队列。本次把这些残留清干净。
--
-- 注意：**不要动 `enqueue_forum_post_moderation` / `public.forum_async_jobs` / `forum-async-worker`**
-- —— 那是论坛文本审核现在真正在用的活链路（8 行 / 0 pending），本迁移一个字都不碰。
-- 图片审核（Gemini 第一层，走 api-key-vault runtime-chat）也完全独立，不受影响。

begin;

-- ── 1) 停掉已死的 cron 任务（它每小时 POST 一次 moderation-worker）─────────────
do $cron$
begin
  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'invoke-moderation-worker';
  raise notice 'cron 任务 invoke-moderation-worker 已停用。';
exception when undefined_table or undefined_function then
  null;
end;
$cron$;

-- ── 2) 先摘掉挂在归档表上的孤儿触发器（它依赖下面的函数）────────────────────
drop trigger if exists trg_touch_moderation_job_updated_at on archive.moderation_jobs;

-- ── 3) 按 pg_proc 实际存在的签名逐个 drop（自动覆盖重载）────────────────────
--    只删 public 侧；archive 侧的表保留不动（0 行，留作历史凭据）。
do $retire$
declare
  rec record;
begin
  for rec in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'claim_moderation_jobs',
         'complete_moderation_job',
         'fail_moderation_job',
         'enqueue_moderation_job',
         'queue_post_moderation_job',
         'queue_comment_moderation_job',
         'queue_message_moderation_job',
         'touch_moderation_job_updated_at'
       )
  loop
    execute format('drop function if exists public.%s cascade', rec.fn);
    raise notice '已删除函数 public.%', rec.proname;
  end loop;
end;
$retire$;

commit;

-- 删除的函数已从 PostgREST 的 REST 面板消失，需要重载 schema 缓存。
notify pgrst, 'reload schema';
