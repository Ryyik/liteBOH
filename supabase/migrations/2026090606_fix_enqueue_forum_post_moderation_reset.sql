begin;

-- ============================================
-- 修复 enqueue_forum_post_moderation：冲突时重置任务状态
--
-- 背景：0601 已在远端应用，其 ON CONFLICT 仅刷新时间戳、不重置 status。
-- claim 只取 pending/running，导致帖子编辑后（updatePost 再次入队），
-- 已 succeeded/failed 的 job 永远不会被重新处理 —— 编辑后的新内容不再
-- 经过服务端复审（内容安全回归）。本迁移以 create or replace 幂等修复。
-- ============================================

create or replace function public.enqueue_forum_post_moderation(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED:请先登录';
  end if;

  if not exists (
    select 1 from public.posts p
     where p.id = p_post_id and p.author_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORUM_JOB_FORBIDDEN:没有权限处理此帖子';
  end if;

  insert into public.forum_async_jobs (job_type, post_id, user_id)
  values ('post_moderation', p_post_id, v_user_id)
  on conflict (job_type, post_id) where status not in ('canceled')
  do update set
    -- 编辑后再入队必须重置为 pending：claim 只取 pending/running，
    -- 否则已 succeeded/failed 的 job 只刷新时间戳、永远不再复审新内容
    status = 'pending',
    attempt_count = 0,
    last_error = null,
    completed_at = null,
    updated_at = now(),
    run_after = least(forum_async_jobs.run_after, now())
  returning id into v_job_id;

  return v_job_id;
end;
$$;

-- 权限与 0601 保持一致：仅 authenticated 可执行
revoke all on function public.enqueue_forum_post_moderation(uuid) from public, anon;
grant execute on function public.enqueue_forum_post_moderation(uuid) to authenticated;

commit;
