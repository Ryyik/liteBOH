-- Scheduled lottery draws and observability:
-- 1) Draw every open lottery whose draw_at has passed.
-- 2) Record scheduler runs, draw attempts, fairness audit metadata, and notification jobs.
-- 3) Register a pg_cron job to run the sweep once per minute when pg_cron is available.

begin;

alter table public.lotteries
  add column if not exists draw_attempted_at timestamp with time zone null;

alter table public.lotteries
  add column if not exists draw_failed_at timestamp with time zone null;

alter table public.lotteries
  add column if not exists draw_failure_message text null;

alter table public.lotteries
  add column if not exists draw_entry_count_snapshot integer null;

alter table public.lotteries
  add column if not exists draw_candidate_hash text null;

alter table public.lotteries
  add column if not exists draw_algorithm_version text not null default 'postgres_order_by_random_v1';

create table if not exists public.lottery_scheduler_logs (
  id uuid primary key default gen_random_uuid(),
  run_source text not null default 'scheduled',
  status text not null default 'running',
  checked_count integer not null default 0,
  drawn_count integer not null default 0,
  failed_count integer not null default 0,
  due_count integer not null default 0,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  duration_ms integer null,
  error_message text null,
  details jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint lottery_scheduler_logs_status_check check (status in ('running', 'success', 'partial_failure', 'failed', 'skipped')),
  constraint lottery_scheduler_logs_run_source_len check (char_length(run_source) <= 80)
);

create index if not exists idx_lottery_scheduler_logs_started
  on public.lottery_scheduler_logs (started_at desc);

create index if not exists idx_lottery_scheduler_logs_status_started
  on public.lottery_scheduler_logs (status, started_at desc);

create table if not exists public.lottery_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  draw_no integer not null,
  winner_position integer not null default 1,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'lottery_win',
  content text not null,
  status text not null default 'pending',
  notification_id uuid null references public.notifications(id) on delete set null,
  attempt_count integer not null default 0,
  last_error text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lottery_notification_jobs_status_check check (status in ('pending', 'sent', 'failed')),
  constraint lottery_notification_jobs_winner_position_check check (winner_position > 0),
  constraint lottery_notification_jobs_draw_no_check check (draw_no > 0),
  constraint lottery_notification_jobs_unique unique (lottery_id, draw_no, winner_position, type)
);

create index if not exists idx_lottery_notification_jobs_status_created
  on public.lottery_notification_jobs (status, created_at);

alter table public.lottery_scheduler_logs enable row level security;
alter table public.lottery_notification_jobs enable row level security;

drop policy if exists lottery_scheduler_logs_select_admin on public.lottery_scheduler_logs;
create policy lottery_scheduler_logs_select_admin
  on public.lottery_scheduler_logs
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_notification_jobs_select_admin on public.lottery_notification_jobs;
create policy lottery_notification_jobs_select_admin
  on public.lottery_notification_jobs
  for select
  to authenticated
  using (public.current_user_is_admin());

create or replace function public.record_lottery_auto_draw_failure(
  p_lottery_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_no integer := 1;
  v_message text := left(coalesce(p_message, 'unknown'), 500);
  v_lottery_title text := '';
  v_admin public.profiles%rowtype;
begin
  if p_lottery_id is null then
    return;
  end if;

  update public.lotteries
     set draw_failed_at = now(),
         draw_failure_message = v_message,
         draw_attempted_at = coalesce(draw_attempted_at, now())
   where id = p_lottery_id
   returning title
    into v_lottery_title;

  if exists (
    select 1
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id
       and reason like 'auto_draw_failed:%'
       and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  select coalesce(max(draw_no), 0) + 1
    into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  insert into public.lottery_draw_logs (
    lottery_id,
    draw_no,
    entry_id,
    user_id,
    username_snapshot,
    winner_position,
    drawn_by,
    reason
  )
  values (
    p_lottery_id,
    v_draw_no,
    null,
    null,
    null,
    1,
    auth.uid(),
    left(concat('auto_draw_failed: ', v_message), 500)
  );

  for v_admin in
    select *
      from public.profiles
     where role = 'admin'
  loop
    begin
      insert into public.notifications (recipient_id, sender_id, type, status, content)
      values (
        v_admin.id,
        null,
        'lottery_draw_failed',
        'unread',
        concat('抽奖「', coalesce(v_lottery_title, p_lottery_id::text), '」自动开奖失败：', v_message)
      );
    exception
      when others then
        null;
    end;
  end loop;
exception
  when others then
    return;
end;
$$;

create or replace function public.execute_lottery_draw(
  p_lottery_id uuid,
  p_force boolean default false,
  p_redraw boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_winner public.lottery_entries%rowtype;
  v_first_winner public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_no integer := 1;
  v_previous_draw_no integer := null;
  v_previous_winner_count integer := 0;
  v_winner_limit integer := 0;
  v_actual_winner_count integer := 0;
  v_winners jsonb := '[]'::jsonb;
  v_candidate_hash text := null;
  v_notification_id uuid := null;
  v_notification_content text := '';
  v_reason text := nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '');
  v_error_message text := '';
begin
  if p_force and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可手动开奖');
  end if;

  if p_redraw and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可重抽');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在');
  end if;

  if v_lottery.status = 'drawn' and not p_redraw then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_DRAWN',
      'message', '抽奖已经开奖',
      'winner_user_id', v_lottery.winner_user_id,
      'winner_username', v_lottery.winner_username
    );
  end if;

  if v_lottery.status not in ('open', 'drawn') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '当前抽奖不在开放状态');
  end if;

  if not p_force and not p_redraw and (v_lottery.draw_at is null or v_lottery.draw_at > now()) then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'message', '尚未到开奖时间');
  end if;

  update public.lotteries
     set draw_attempted_at = now(),
         draw_failed_at = null,
         draw_failure_message = null
   where id = p_lottery_id;

  select count(*)::integer,
         md5(coalesce(string_agg(e.id::text || ':' || e.user_id::text, ',' order by e.created_at, e.id), ''))
    into v_entry_count,
         v_candidate_hash
    from public.lottery_entries e
   where e.lottery_id = p_lottery_id;

  select max(draw_no)
    into v_previous_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_previous_draw_no is not null then
    select count(*)
      into v_previous_winner_count
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id
       and draw_no = v_previous_draw_no
       and user_id is not null;
  end if;

  select coalesce(max(draw_no), 0) + 1
    into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_entry_count > 0 then
    v_winner_limit := least(greatest(coalesce(v_lottery.winner_count, 1), 1), v_entry_count);

    for v_winner in
      select *
        from public.lottery_entries e
       where e.lottery_id = p_lottery_id
         and (
           not p_redraw
           or v_previous_draw_no is null
           or v_previous_winner_count = 0
           or v_entry_count <= v_previous_winner_count
           or (v_entry_count - v_previous_winner_count) < v_winner_limit
           or not exists (
             select 1
               from public.lottery_draw_logs l
              where l.lottery_id = p_lottery_id
                and l.draw_no = v_previous_draw_no
                and l.user_id = e.user_id
           )
         )
       order by random()
       limit v_winner_limit
    loop
      v_actual_winner_count := v_actual_winner_count + 1;

      if v_actual_winner_count = 1 then
        v_first_winner := v_winner;
      end if;

      v_winners := v_winners || jsonb_build_array(jsonb_build_object(
        'position', v_actual_winner_count,
        'entry_id', v_winner.id,
        'user_id', v_winner.user_id,
        'username', v_winner.username_snapshot
      ));

      insert into public.lottery_draw_logs (
        lottery_id,
        draw_no,
        entry_id,
        user_id,
        username_snapshot,
        winner_position,
        drawn_by,
        reason
      )
      values (
        p_lottery_id,
        v_draw_no,
        v_winner.id,
        v_winner.user_id,
        v_winner.username_snapshot,
        v_actual_winner_count,
        auth.uid(),
        v_reason
      );

      v_notification_content := concat('你在「', v_lottery.title, '」中中奖啦！奖品：', v_lottery.prize_title);

      insert into public.lottery_notification_jobs (
        lottery_id,
        draw_no,
        winner_position,
        user_id,
        type,
        content,
        status
      )
      values (
        p_lottery_id,
        v_draw_no,
        v_actual_winner_count,
        v_winner.user_id,
        'lottery_win',
        v_notification_content,
        'pending'
      )
      on conflict (lottery_id, draw_no, winner_position, type) do nothing;

      begin
        insert into public.notifications (recipient_id, sender_id, type, status, content)
        values (
          v_winner.user_id,
          auth.uid(),
          'lottery_win',
          'unread',
          v_notification_content
        )
        returning id
         into v_notification_id;

        update public.lottery_notification_jobs
           set status = 'sent',
               notification_id = v_notification_id,
               attempt_count = attempt_count + 1,
               updated_at = now()
         where lottery_id = p_lottery_id
           and draw_no = v_draw_no
           and winner_position = v_actual_winner_count
           and type = 'lottery_win';
      exception
        when others then
          update public.lottery_notification_jobs
             set status = 'failed',
                 attempt_count = attempt_count + 1,
                 last_error = left(coalesce(sqlerrm, '通知发送失败'), 500),
                 updated_at = now()
           where lottery_id = p_lottery_id
             and draw_no = v_draw_no
             and winner_position = v_actual_winner_count
             and type = 'lottery_win';
      end;
    end loop;
  end if;

  update public.lotteries
     set status = 'drawn',
         drawn_at = now(),
         draw_attempted_at = coalesce(draw_attempted_at, now()),
         draw_failed_at = null,
         draw_failure_message = null,
         draw_entry_count_snapshot = v_entry_count,
         draw_candidate_hash = v_candidate_hash,
         draw_algorithm_version = 'postgres_order_by_random_v1',
         winner_entry_id = case when v_actual_winner_count > 0 then v_first_winner.id else null end,
         winner_user_id = case when v_actual_winner_count > 0 then v_first_winner.user_id else null end,
         winner_username = case when v_actual_winner_count > 0 then v_first_winner.username_snapshot else null end,
         fulfillment_status = 'pending_contact',
         updated_by = case when p_force then auth.uid() else updated_by end
   where id = p_lottery_id
   returning *
    into v_lottery;

  if v_actual_winner_count = 0 then
    insert into public.lottery_draw_logs (
      lottery_id,
      draw_no,
      entry_id,
      user_id,
      username_snapshot,
      winner_position,
      drawn_by,
      reason
    )
    values (
      p_lottery_id,
      v_draw_no,
      null,
      null,
      null,
      1,
      auth.uid(),
      v_reason
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'DRAWN',
    'message', '开奖完成',
    'entry_count', v_entry_count,
    'draw_no', v_draw_no,
    'winner_count', v_lottery.winner_count,
    'actual_winner_count', v_actual_winner_count,
    'candidate_hash', v_candidate_hash,
    'algorithm_version', v_lottery.draw_algorithm_version,
    'winners', v_winners,
    'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username,
    'drawn_at', v_lottery.drawn_at
  );
exception
  when others then
    v_error_message := left(concat(coalesce(sqlstate, 'DRAW_FAILED'), ' ', coalesce(sqlerrm, '开奖失败')), 500);
    update public.lotteries
       set draw_failed_at = now(),
           draw_failure_message = v_error_message,
           draw_attempted_at = coalesce(draw_attempted_at, now())
     where id = p_lottery_id;
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'DRAW_FAILED'),
      'message', v_error_message
    );
end;
$$;

drop function if exists public.execute_due_lottery_draws(integer);

create or replace function public.execute_due_lottery_draws(
  p_limit integer default 50,
  p_run_source text default 'scheduled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_run_source text := left(trim(coalesce(p_run_source, 'scheduled')), 80);
  v_lottery_id uuid;
  v_result jsonb;
  v_checked integer := 0;
  v_drawn integer := 0;
  v_failed integer := 0;
  v_due_count integer := 0;
  v_log_id uuid := null;
  v_started_at timestamp with time zone := clock_timestamp();
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可手动执行到期开奖任务');
  end if;

  select count(*)::integer
    into v_due_count
    from public.lotteries
   where status = 'open'
     and draw_at is not null
     and draw_at <= now();

  insert into public.lottery_scheduler_logs (
    run_source,
    status,
    due_count,
    started_at
  )
  values (
    coalesce(nullif(v_run_source, ''), 'scheduled'),
    'running',
    v_due_count,
    v_started_at
  )
  returning id
   into v_log_id;

  for v_lottery_id in
    select id
      from public.lotteries
     where status = 'open'
       and draw_at is not null
       and draw_at <= now()
     order by draw_at asc, created_at asc
     limit v_limit
     for update skip locked
  loop
    v_checked := v_checked + 1;

    begin
      v_result := public.execute_lottery_draw(v_lottery_id, false, false, case when v_run_source = 'manual_admin' then 'manual_due_draw' else 'scheduled_draw' end);

      if coalesce(v_result->>'code', '') in ('DRAWN', 'ALREADY_DRAWN') then
        v_drawn := v_drawn + 1;
      else
        v_failed := v_failed + 1;
      end if;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'lottery_id', v_lottery_id,
        'code', v_result->>'code',
        'ok', coalesce((v_result->>'ok')::boolean, false)
      ));
    exception
      when others then
        v_failed := v_failed + 1;
        perform public.record_lottery_auto_draw_failure(
          v_lottery_id,
          concat(coalesce(sqlstate, 'SCHEDULED_DRAW_FAILED'), ' ', coalesce(sqlerrm, '定时开奖失败'))
        );
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'lottery_id', v_lottery_id,
          'code', coalesce(sqlstate, 'SCHEDULED_DRAW_FAILED'),
          'ok', false
        ));
    end;
  end loop;

  if v_log_id is not null then
    update public.lottery_scheduler_logs
       set status = case
           when v_failed > 0 and v_drawn > 0 then 'partial_failure'
           when v_failed > 0 then 'failed'
           else 'success'
         end,
           checked_count = v_checked,
           drawn_count = v_drawn,
           failed_count = v_failed,
           due_count = v_due_count,
           finished_at = clock_timestamp(),
           duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
           details = v_results
     where id = v_log_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked', v_checked,
    'drawn', v_drawn,
    'failed', v_failed,
    'due_count', v_due_count,
    'ran_at', now(),
    'results', v_results
  );
exception
  when others then
    if v_log_id is not null then
      update public.lottery_scheduler_logs
         set status = 'failed',
             checked_count = v_checked,
             drawn_count = v_drawn,
             failed_count = v_failed + 1,
             due_count = v_due_count,
             finished_at = clock_timestamp(),
             duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
             error_message = left(coalesce(sqlerrm, '定时开奖任务失败'), 500),
             details = v_results
       where id = v_log_id;
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'SCHEDULER_FAILED'),
      'message', coalesce(sqlerrm, '定时开奖任务失败'),
      'checked', v_checked,
      'drawn', v_drawn,
      'failed', v_failed + 1,
      'due_count', v_due_count,
      'results', v_results
    );
end;
$$;

create or replace function public.admin_lottery_scheduler_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_pg_cron boolean := false;
  v_job_exists boolean := false;
  v_job_active boolean := false;
  v_job_schedule text := null;
  v_due_count integer := 0;
  v_oldest_due_at timestamp with time zone := null;
  v_last_log public.lottery_scheduler_logs%rowtype;
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可查看抽奖定时任务状态');
  end if;

  select exists (
    select 1
      from pg_extension
     where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if v_has_pg_cron then
    begin
      select true,
             coalesce(active, false),
             schedule
        into v_job_exists,
             v_job_active,
             v_job_schedule
        from cron.job
       where jobname = 'execute_due_lottery_draws_every_minute'
       limit 1;
    exception
      when others then
        v_job_exists := false;
        v_job_active := false;
        v_job_schedule := null;
    end;
  end if;

  select count(*)::integer,
         min(draw_at)
    into v_due_count,
         v_oldest_due_at
    from public.lotteries
   where status = 'open'
     and draw_at is not null
     and draw_at <= now();

  select *
    into v_last_log
    from public.lottery_scheduler_logs
   order by started_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'pg_cron_enabled', v_has_pg_cron,
    'job_exists', coalesce(v_job_exists, false),
    'job_active', coalesce(v_job_active, false),
    'job_schedule', v_job_schedule,
    'due_count', v_due_count,
    'oldest_due_at', v_oldest_due_at,
    'last_run', case when v_last_log.id is null then null else jsonb_build_object(
      'id', v_last_log.id,
      'status', v_last_log.status,
      'run_source', v_last_log.run_source,
      'checked_count', v_last_log.checked_count,
      'drawn_count', v_last_log.drawn_count,
      'failed_count', v_last_log.failed_count,
      'due_count', v_last_log.due_count,
      'started_at', v_last_log.started_at,
      'finished_at', v_last_log.finished_at,
      'duration_ms', v_last_log.duration_ms,
      'error_message', v_last_log.error_message
    ) end
  );
end;
$$;

create or replace function public.admin_data_management_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'users', (select count(*) from public.profiles),
    'points', (select count(*) from public.profiles),
    'subscriptions', (select count(*) from public.user_subscriptions),
    'activeSubscriptions', (
      select count(*)
        from public.user_subscriptions
       where status = 'active'
         and expires_at > now()
    ),
    'gifts', (select count(*) from public.user_gifts),
    'forum', (select count(*) from public.posts),
    'reportedPosts', (select count(*) from public.posts where status = 'limited'),
    'reviewPosts', (select count(*) from public.posts where status ilike 'rejected'),
    'reviewComments', (select count(*) from public.comments where status ilike 'rejected'),
    'reviewMessages', (select count(*) from public.messages where moderation_status ilike 'rejected'),
    'coreMemories', (select count(*) from public.boh_ai_core_memories),
    'lotteries', (select count(*) from public.lotteries),
    'lotteryEntries', (select count(*) from public.lottery_entries),
    'lotteryDrawLogs', (select count(*) from public.lottery_draw_logs),
    'lotteryJoinAttempts', (select count(*) from public.lottery_join_attempts),
    'lotterySchedulerLogs', (select count(*) from public.lottery_scheduler_logs),
    'lotteryNotificationJobs', (select count(*) from public.lottery_notification_jobs),
    'news', (select count(*) from public.news),
    'activities', (select count(*) from public.activities),
    'products', (select count(*) from public.products)
  );
end;
$$;

revoke all on function public.record_lottery_auto_draw_failure(uuid, text) from public;
revoke all on function public.execute_lottery_draw(uuid, boolean, boolean, text) from public;
revoke all on function public.execute_due_lottery_draws(integer, text) from public;
revoke all on function public.admin_lottery_scheduler_status() from public;
revoke all on function public.admin_data_management_counts() from public;

grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to service_role;
grant execute on function public.execute_due_lottery_draws(integer, text) to authenticated;
grant execute on function public.execute_due_lottery_draws(integer, text) to service_role;
grant execute on function public.admin_lottery_scheduler_status() to authenticated;
grant execute on function public.admin_lottery_scheduler_status() to service_role;
grant execute on function public.admin_data_management_counts() to authenticated;
grant execute on function public.admin_data_management_counts() to service_role;

do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  begin
    create extension if not exists pg_cron;
  exception
    when others then
      raise notice 'pg_cron 未启用，已跳过扩展创建: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
  end;

  select exists (
    select 1
      from pg_extension
     where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过抽奖定时任务创建。可通过 service_role 手动调用 execute_due_lottery_draws。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'execute_due_lottery_draws_every_minute';
  exception
    when undefined_table or undefined_function or invalid_schema_name then
      null;
  end;

  perform cron.schedule(
    'execute_due_lottery_draws_every_minute',
    '* * * * *',
    $cmd$select public.execute_due_lottery_draws(50, 'scheduled');$cmd$
  );
exception
  when others then
    raise notice '创建/更新抽奖 pg_cron 任务失败，已跳过自动调度: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
