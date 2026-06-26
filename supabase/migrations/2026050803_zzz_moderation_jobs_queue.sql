begin;

create table if not exists public.moderation_jobs (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'message')),
  target_id uuid not null,
  content_snapshot text not null,
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'canceled')),
  source text not null default 'db_trigger',
  worker_id text null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_run_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_until timestamptz null,
  ai_result text null check (ai_result is null or ai_result in ('approved', 'rejected')),
  ai_reason text null,
  ai_model text null,
  last_error text null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moderation_jobs_pending_next_run
  on public.moderation_jobs (next_run_at asc, created_at asc)
  where status = 'pending';

create index if not exists idx_moderation_jobs_running_locked
  on public.moderation_jobs (locked_until asc)
  where status = 'running';

create index if not exists idx_moderation_jobs_target_created
  on public.moderation_jobs (target_type, target_id, created_at desc);

create index if not exists idx_moderation_jobs_status_updated
  on public.moderation_jobs (status, updated_at desc);

alter table public.moderation_jobs enable row level security;

drop policy if exists moderation_jobs_admin_select on public.moderation_jobs;
create policy moderation_jobs_admin_select
  on public.moderation_jobs
  for select
  to authenticated
  using (public.current_user_is_admin());

grant select on table public.moderation_jobs to authenticated;
grant all on table public.moderation_jobs to service_role;

create or replace function public.touch_moderation_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_moderation_job_updated_at on public.moderation_jobs;
create trigger trg_touch_moderation_job_updated_at
before update on public.moderation_jobs
for each row
execute function public.touch_moderation_job_updated_at();

create or replace function public.enqueue_moderation_job(
  p_target_type text,
  p_target_id uuid,
  p_content_snapshot text,
  p_source text default 'db_trigger'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_content text := left(trim(coalesce(p_content_snapshot, '')), 40000);
  v_hash text;
  v_existing_id uuid;
  v_job_id uuid;
begin
  if v_target_type not in ('post', 'comment', 'message') then
    raise exception 'INVALID_MODERATION_TARGET_TYPE';
  end if;

  if p_target_id is null then
    raise exception 'INVALID_MODERATION_TARGET_ID';
  end if;

  if v_content = '' then
    return null;
  end if;

  v_hash := md5(v_content);

  select id
    into v_existing_id
    from public.moderation_jobs
   where target_type = v_target_type
     and target_id = p_target_id
     and content_hash = v_hash
     and status in ('pending', 'running', 'succeeded')
   order by created_at desc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  update public.moderation_jobs
     set status = 'canceled',
         last_error = 'superseded_by_new_content',
         locked_until = null,
         worker_id = null
   where target_type = v_target_type
     and target_id = p_target_id
     and status in ('pending', 'running');

  insert into public.moderation_jobs (
    target_type,
    target_id,
    content_snapshot,
    content_hash,
    source
  )
  values (
    v_target_type,
    p_target_id,
    v_content,
    v_hash,
    left(trim(coalesce(p_source, 'db_trigger')), 48)
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.claim_moderation_jobs(
  p_limit integer default 10,
  p_worker_id text default null,
  p_lock_seconds integer default 120
)
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  content_snapshot text,
  content_hash text,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_worker_id text := left(trim(coalesce(p_worker_id, 'moderation-worker')), 120);
  v_lock_seconds integer := least(greatest(coalesce(p_lock_seconds, 120), 30), 900);
begin
  return query
  with picked as (
    select j.id
      from public.moderation_jobs j
     where (
       (j.status = 'pending' and j.next_run_at <= now())
       or (j.status = 'running' and coalesce(j.locked_until, '-infinity'::timestamptz) < now())
     )
       and j.attempt_count < j.max_attempts
     order by j.next_run_at asc, j.created_at asc
     for update skip locked
     limit v_limit
  ),
  claimed as (
    update public.moderation_jobs j
       set status = 'running',
           worker_id = v_worker_id,
           attempt_count = j.attempt_count + 1,
           locked_at = now(),
           locked_until = now() + make_interval(secs => v_lock_seconds),
           last_error = null
      from picked
     where j.id = picked.id
     returning
       j.id,
       j.target_type,
       j.target_id,
       j.content_snapshot,
       j.content_hash,
       j.attempt_count,
       j.max_attempts
  )
  select
    claimed.id,
    claimed.target_type,
    claimed.target_id,
    claimed.content_snapshot,
    claimed.content_hash,
    claimed.attempt_count,
    claimed.max_attempts
  from claimed;
end;
$$;

create or replace function public.complete_moderation_job(
  p_job_id uuid,
  p_worker_id text,
  p_ai_result text,
  p_ai_reason text default null,
  p_ai_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.moderation_jobs%rowtype;
  v_worker_id text := left(trim(coalesce(p_worker_id, 'moderation-worker')), 120);
  v_ai_result text := lower(trim(coalesce(p_ai_result, 'approved')));
  v_ai_reason text := nullif(left(trim(coalesce(p_ai_reason, '')), 500), '');
  v_ai_model text := nullif(left(trim(coalesce(p_ai_model, '')), 120), '');
  v_current_content text;
  v_current_hash text;
begin
  if p_job_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_JOB_ID');
  end if;

  if v_ai_result not in ('approved', 'rejected') then
    v_ai_result := 'approved';
  end if;

  select *
    into v_job
    from public.moderation_jobs
   where id = p_job_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND');
  end if;

  if v_job.status <> 'running' then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_RUNNING', 'status', v_job.status);
  end if;

  if coalesce(v_job.worker_id, '') <> v_worker_id then
    return jsonb_build_object('ok', false, 'code', 'JOB_WORKER_MISMATCH');
  end if;

  if v_job.target_type = 'post' then
    select left(trim('标题：' || coalesce(nullif(p.title, ''), public.forum_post_title(p.content), '无标题') || chr(10) || '正文：' || coalesce(nullif(p.body, ''), public.forum_post_body(p.content), p.content, '')), 40000)
      into v_current_content
      from public.posts p
     where p.id = v_job.target_id;
  elsif v_job.target_type = 'comment' then
    select left(trim(coalesce(c.content, '')), 40000)
      into v_current_content
      from public.comments c
     where c.id = v_job.target_id;
  elsif v_job.target_type = 'message' then
    select left(trim('主题：' || coalesce(m.subject, '') || chr(10) || '正文：' || coalesce(m.content, '')), 40000)
      into v_current_content
      from public.messages m
     where m.id = v_job.target_id;
  end if;

  if v_current_content is null or trim(v_current_content) = '' then
    update public.moderation_jobs
       set status = 'canceled',
           last_error = 'target_missing_or_empty',
           locked_until = null,
           worker_id = null
     where id = v_job.id;

    return jsonb_build_object('ok', false, 'code', 'TARGET_MISSING_OR_EMPTY');
  end if;

  v_current_hash := md5(v_current_content);
  if v_current_hash <> v_job.content_hash then
    update public.moderation_jobs
       set status = 'canceled',
           last_error = 'stale_content_snapshot',
           locked_until = null,
           worker_id = null
     where id = v_job.id;

    return jsonb_build_object('ok', false, 'code', 'STALE_CONTENT_SNAPSHOT');
  end if;

  insert into public.moderation_logs (
    target_id,
    target_type,
    ai_result,
    ai_reason,
    moderator_id
  ) values (
    v_job.target_id,
    v_job.target_type,
    v_ai_result,
    v_ai_reason,
    null
  );

  if v_ai_result = 'rejected' then
    if v_job.target_type = 'post' then
      update public.posts
         set status = 'rejected',
             updated_at = now()
       where id = v_job.target_id
         and coalesce(status, 'approved') <> 'rejected';
    elsif v_job.target_type = 'comment' then
      update public.comments
         set status = 'rejected'
       where id = v_job.target_id
         and coalesce(status, 'approved') <> 'rejected';
    elsif v_job.target_type = 'message' then
      update public.messages
         set moderation_status = 'rejected',
             moderation_reason = coalesce(v_ai_reason, '内容审查未通过')
       where id = v_job.target_id
         and coalesce(moderation_status, 'approved') <> 'rejected';
    end if;
  elsif v_job.target_type = 'message' then
    update public.messages
       set moderation_status = 'approved',
           moderation_reason = null
     where id = v_job.target_id
       and coalesce(moderation_status, 'approved') <> 'rejected';
  end if;

  update public.moderation_jobs
     set status = 'succeeded',
         ai_result = v_ai_result,
         ai_reason = v_ai_reason,
         ai_model = v_ai_model,
         completed_at = now(),
         locked_until = null,
         last_error = null
   where id = v_job.id;

  return jsonb_build_object('ok', true, 'result', v_ai_result);
end;
$$;

create or replace function public.fail_moderation_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.moderation_jobs%rowtype;
  v_worker_id text := left(trim(coalesce(p_worker_id, 'moderation-worker')), 120);
  v_error text := left(trim(coalesce(p_error, 'moderation worker failed')), 1000);
  v_retry_delay_seconds integer;
begin
  if p_job_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_JOB_ID');
  end if;

  select *
    into v_job
    from public.moderation_jobs
   where id = p_job_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND');
  end if;

  if v_job.status <> 'running' then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_RUNNING', 'status', v_job.status);
  end if;

  if coalesce(v_job.worker_id, '') <> v_worker_id then
    return jsonb_build_object('ok', false, 'code', 'JOB_WORKER_MISMATCH');
  end if;

  if v_job.attempt_count >= v_job.max_attempts then
    update public.moderation_jobs
       set status = 'failed',
           last_error = v_error,
           locked_until = null,
           worker_id = null
     where id = v_job.id;

    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;

  v_retry_delay_seconds := least(3600, (30 * power(2, greatest(v_job.attempt_count - 1, 0)))::integer);

  update public.moderation_jobs
     set status = 'pending',
         next_run_at = now() + make_interval(secs => v_retry_delay_seconds),
         last_error = v_error,
         locked_until = null,
         worker_id = null
   where id = v_job.id;

  return jsonb_build_object('ok', true, 'status', 'pending', 'retryInSeconds', v_retry_delay_seconds);
end;
$$;

create or replace function public.queue_post_moderation_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text;
begin
  if coalesce(new.status, 'approved') = 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.content is not distinct from old.content
     and new.title is not distinct from old.title
     and new.body is not distinct from old.body then
    return new;
  end if;

  v_content := left(trim('标题：' || coalesce(nullif(new.title, ''), public.forum_post_title(new.content), '无标题') || chr(10) || '正文：' || coalesce(nullif(new.body, ''), public.forum_post_body(new.content), new.content, '')), 40000);
  perform public.enqueue_moderation_job('post', new.id, v_content, 'posts_trigger');
  return new;
end;
$$;

create or replace function public.queue_comment_moderation_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'approved') = 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  perform public.enqueue_moderation_job('comment', new.id, new.content, 'comments_trigger');
  return new;
end;
$$;

create or replace function public.queue_message_moderation_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text;
begin
  if coalesce(new.moderation_status, 'approved') = 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.content is not distinct from old.content
     and new.subject is not distinct from old.subject then
    return new;
  end if;

  v_content := left(trim('主题：' || coalesce(new.subject, '') || chr(10) || '正文：' || coalesce(new.content, '')), 40000);
  perform public.enqueue_moderation_job('message', new.id, v_content, 'messages_trigger');
  return new;
end;
$$;

drop trigger if exists trg_queue_post_moderation_job on public.posts;
create trigger trg_queue_post_moderation_job
after insert or update of content, title, body, status on public.posts
for each row
execute function public.queue_post_moderation_job();

drop trigger if exists trg_queue_comment_moderation_job on public.comments;
create trigger trg_queue_comment_moderation_job
after insert or update of content, status on public.comments
for each row
execute function public.queue_comment_moderation_job();

drop trigger if exists trg_queue_message_moderation_job on public.messages;
create trigger trg_queue_message_moderation_job
after insert or update of subject, content, moderation_status on public.messages
for each row
execute function public.queue_message_moderation_job();

revoke all on function public.enqueue_moderation_job(text, uuid, text, text) from public;
revoke all on function public.claim_moderation_jobs(integer, text, integer) from public;
revoke all on function public.complete_moderation_job(uuid, text, text, text, text) from public;
revoke all on function public.fail_moderation_job(uuid, text, text) from public;

grant execute on function public.enqueue_moderation_job(text, uuid, text, text) to service_role;
grant execute on function public.claim_moderation_jobs(integer, text, integer) to service_role;
grant execute on function public.complete_moderation_job(uuid, text, text, text, text) to service_role;
grant execute on function public.fail_moderation_job(uuid, text, text) to service_role;

grant execute on function public.queue_post_moderation_job() to service_role;
grant execute on function public.queue_comment_moderation_job() to service_role;
grant execute on function public.queue_message_moderation_job() to service_role;

notify pgrst, 'reload schema';

commit;
