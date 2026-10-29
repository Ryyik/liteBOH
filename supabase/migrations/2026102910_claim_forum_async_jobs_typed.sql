-- 按 job_type 认领的 claim 变体（2026-10-29 审查 P2-2）
--
-- ── 为什么需要它 ──────────────────────────────────────────────────
-- `claim_forum_async_jobs` 认领的是**队列里的任意一条**。它只给 service_role 用，
-- 原本没问题；但 forum-async-worker 的**用户通道**（登录用户 POST 一个 postId）
-- 也用 service client 调它，于是任何登录用户反复「enqueue image_recheck（自己
-- 的帖）+ 调这个 EF」就能让 worker 一轮轮跑图片复审 —— 每个 job 最多
-- imageRecheckBudgetMs 秒的视觉模型多跳调用 ⇒ 把审核额度变成可被外部放大的资源。
--
-- 修法：给用户通道一条**只能认领 post_moderation** 的路。为什么不给原函数加
-- `p_job_types` 默认参数：`create or replace function` 改不了参数列表，必须 drop
-- 重建，而重建期间 PostgREST 会同时看到新旧两个同名重载 ⇒ PGRST203 歧义错误
--（论坛搜索 RPC 的 9 参事故是同一个坑）。换个函数名一劳永逸。
--
-- ⚠️ 部署顺序：**本迁移必须先于 forum-async-worker 的 EF 部署**。
--    未应用时 EF 侧会命中 isMissingFunctionError() 并降级为「只入队」，
--    cron 仍会在 5 分钟内接手，不会 500。

begin;

create or replace function public.claim_forum_async_jobs_typed(
  p_job_types text[],
  p_prefer_post_id uuid default null,
  p_limit integer default 1,
  p_worker_id text default null,
  p_lock_seconds integer default 90
)
returns setof public.forum_async_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 空数组 = 什么都不认领（**不是**"不过滤"）。默认放行会让调用方漏传参数时
  -- 悄悄退回「认领任意 job」的老行为，正好是这次要堵的洞。
  if p_job_types is null or cardinality(p_job_types) = 0 then
    return;
  end if;

  return query
  with candidates as (
    select j.id
      from public.forum_async_jobs j
     where j.status in ('pending', 'running')
       and j.job_type = any (p_job_types)
       and j.attempt_count < j.max_attempts
       and j.run_after <= now()
       and (j.locked_until is null or j.locked_until < now())
     -- 用户通道传自己的 post_id ⇒ 优先处理「我刚发的这条」，而不是队列里最老的一条。
     -- coalesce 是必须的：`x = null` 结果为 null，而 order by 对 DESC 默认 NULLS FIRST，
     -- 不包一层会让「没传 prefer」的场景退化成随机顺序。
     order by coalesce(j.post_id = p_prefer_post_id, false) desc, j.created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 1), 3))
  )
  update public.forum_async_jobs j
     set status = 'running',
         attempt_count = j.attempt_count + 1,
         locked_until = now() + make_interval(secs => greatest(15, least(coalesce(p_lock_seconds, 90), 120))),
         worker_id = nullif(left(trim(coalesce(p_worker_id, '')), 120), ''),
         updated_at = now()
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;

comment on function public.claim_forum_async_jobs_typed(text[], uuid, integer, text, integer) is
  '按 job_type 白名单认领任务。用户通道只用它认领 post_moderation，避免任何登录用户借 worker 的 service_role 跑图片复审（额度放大）；p_prefer_post_id 让调用者的帖排在前面。';

revoke all on function public.claim_forum_async_jobs_typed(text[], uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_forum_async_jobs_typed(text[], uuid, integer, text, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
