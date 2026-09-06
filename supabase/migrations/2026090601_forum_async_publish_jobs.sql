begin;

-- Durable, bounded forum jobs. One row represents one short server-side step;
-- it is intentionally separate from moderation_jobs, which is disabled in this project.
create table if not exists public.forum_async_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('post_moderation')),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'canceled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  worker_id text,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists uniq_forum_async_post_moderation
  on public.forum_async_jobs (job_type, post_id)
  where status not in ('canceled');
create index if not exists idx_forum_async_jobs_claim
  on public.forum_async_jobs (status, run_after, locked_until, created_at);
create index if not exists idx_forum_async_jobs_user
  on public.forum_async_jobs (user_id, created_at desc);

alter table public.forum_async_jobs enable row level security;
drop policy if exists forum_async_jobs_owner_select on public.forum_async_jobs;
create policy forum_async_jobs_owner_select on public.forum_async_jobs
  for select to authenticated using (user_id = auth.uid());
revoke all on table public.forum_async_jobs from anon, authenticated;
grant select on table public.forum_async_jobs to authenticated;

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

create or replace function public.claim_forum_async_jobs(
  p_limit integer default 1,
  p_worker_id text default '',
  p_lock_seconds integer default 45
)
returns setof public.forum_async_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
      from public.forum_async_jobs j
     where j.status in ('pending', 'running')
       and j.attempt_count < j.max_attempts
       and j.run_after <= now()
       and (j.locked_until is null or j.locked_until < now())
     order by j.created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 1), 3))
  )
  update public.forum_async_jobs j
     set status = 'running',
         attempt_count = j.attempt_count + 1,
         locked_until = now() + make_interval(secs => greatest(15, least(coalesce(p_lock_seconds, 45), 120))),
         worker_id = nullif(left(trim(coalesce(p_worker_id, '')), 120), ''),
         updated_at = now()
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.complete_forum_async_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forum_async_jobs
     set status = 'succeeded', result = coalesce(p_result, '{}'::jsonb),
         locked_until = null, worker_id = null, completed_at = now(), updated_at = now()
   where id = p_job_id and status = 'running'
     and (worker_id is null or worker_id = p_worker_id);
  return found;
end;
$$;

create or replace function public.fail_forum_async_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forum_async_jobs
     set status = case when attempt_count >= max_attempts then 'failed' else 'pending' end,
         last_error = left(coalesce(p_error, '后台任务失败'), 1000),
         run_after = now() + make_interval(secs => greatest(5, least(coalesce(p_retry_seconds, 30), 3600))),
         locked_until = null, worker_id = null, updated_at = now()
   where id = p_job_id and status = 'running'
     and (worker_id is null or worker_id = p_worker_id);
  return found;
end;
$$;

revoke all on function public.enqueue_forum_post_moderation(uuid) from public, anon;
grant execute on function public.enqueue_forum_post_moderation(uuid) to authenticated;
revoke all on function public.claim_forum_async_jobs(integer, text, integer) from public, anon, authenticated;
revoke all on function public.complete_forum_async_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_forum_async_job(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_forum_async_jobs(integer, text, integer) to service_role;
grant execute on function public.complete_forum_async_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_forum_async_job(uuid, text, text, integer) to service_role;

commit;
