-- 回收「job 已 failed、图仍停在 pending」的复审残留（2026-10-29 审查 P1-2）
--
-- ── 洞在哪 ────────────────────────────────────────────────────────
-- `mark_forum_images_pending_recheck` 只写 `recheck_status is null` 的行，
-- `apply_forum_image_recheck_verdict` 只接受 `recheck_status = 'pending'` 的行。
-- 也就是说：一旦 image_recheck job 用完 max_attempts 变成 failed，重新入队只会在
-- 「用户再次编辑该帖」时发生 —— 不编辑就**永远没人重试**。而那些图自始至终是
-- moderation_status='approved'（可见），于是形成一个**没有上界的 fail-open 窗口**：
-- 绕过客户端两级审核的违规图可以长期在线，且没有任何地方向运营暴露这个积压。
--
-- ── 修法：日级「重启器」 ───────────────────────────────────────────
-- 把「failed 且图还 pending」的 job 重置回 pending（attempt_count 归零，重新拿满
-- max_attempts 轮预算）。纯 SQL 的 cron 任务，**不经过 net.http_post**，
-- 因此不需要任何密钥（对比 2026102909 把密钥写进 command 的做法）。
--
-- 三重上限，避免变成永久重试：
--   · p_min_age      —— 刚失败的不动，先让正常退避（1/5/15 分钟）自己跑完；
--   · p_max_age      —— 超过 14 天的帖不再重启（一条坏图不应该永久消耗额度）；
--   · 只重启 status='failed' 的行，running/pending 一律不碰。
-- 剩下的「重启后仍失败」由下一轮再重启，最多持续到 14 天窗口结束。
--
-- ── 为什么用 job.updated_at 而不是图的 updated_at ─────────────────
-- forum_post_images **没有** updated_at 列（实测 information_schema）。
-- job 侧每次 claim/fail 都会刷新 updated_at，是唯一可靠的时间锚点。

begin;

create or replace function public.requeue_stale_forum_image_rechecks(
  p_min_age interval default '6 hours',
  p_max_age interval default '14 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with stale as (
    select j.id
      from public.forum_async_jobs j
     where j.job_type = 'image_recheck'
       and j.status = 'failed'
       and j.updated_at < now() - p_min_age
       and j.updated_at > now() - p_max_age
       -- 只在「确实还有图没拿到裁决」时重启；图都裁完了就让它保持 failed，
       -- 否则会变成每天空转一次的死循环。
       and exists (
         select 1
           from public.forum_post_images i
          where i.post_id = j.post_id
            and i.recheck_status = 'pending'
       )
  ), rearmed as (
    update public.forum_async_jobs j
       set status = 'pending',
           attempt_count = 0,
           last_error = null,
           completed_at = null,
           locked_until = null,
           worker_id = null,
           run_after = now(),
           updated_at = now()
      from stale s
     where j.id = s.id
    returning 1
  )
  select count(*) into v_count from rearmed;

  return v_count;
end;
$$;

comment on function public.requeue_stale_forum_image_rechecks(interval, interval) is
  '把「job 已 failed、图仍 pending」的图片复审重新排回队列（每天跑）。返回重启条数。';

revoke all on function public.requeue_stale_forum_image_rechecks(interval, interval)
  from public, anon, authenticated;
grant execute on function public.requeue_stale_forum_image_rechecks(interval, interval)
  to service_role;

do $cron$
declare
  v_job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'forum_image_recheck_reaper 注册失败：pg_cron 未启用';
  end if;

  for v_job in select jobid from cron.job where jobname = 'forum_image_recheck_reaper_daily' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  -- 04:35：错开 03:20/03:40/04:10 三条清理任务，避免同一分钟抢连接。
  perform cron.schedule(
    'forum_image_recheck_reaper_daily',
    '35 4 * * *',
    $cmd$select public.requeue_stale_forum_image_rechecks()$cmd$
  );

  raise notice 'cron 任务已注册：forum_image_recheck_reaper_daily（每日 04:35）。';
end;
$cron$;

notify pgrst, 'reload schema';

commit;
