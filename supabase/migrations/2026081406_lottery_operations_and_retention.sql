-- Lottery operations hardening:
-- - Keep scheduler logs useful instead of writing one idle row per minute.
-- - Manage fulfillment per winner, including disqualification and replacement.
-- - Provide retryable winner notifications, immutable admin audit records, and storage diagnostics.

begin;

create table if not exists public.lottery_winner_fulfillments (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  draw_no integer not null,
  winner_position integer not null,
  entry_id uuid null references public.lottery_entries(id) on delete set null,
  user_id uuid null references public.profiles(id) on delete set null,
  username_snapshot text null,
  status text not null default 'pending_contact',
  is_current boolean not null default true,
  replacement_of uuid null references public.lottery_winner_fulfillments(id) on delete set null,
  disqualification_reason text null,
  contact_note text null,
  address_id uuid null references public.user_addresses(id) on delete set null,
  shipping_carrier text null,
  tracking_number text null,
  contacted_at timestamp with time zone null,
  confirmed_at timestamp with time zone null,
  fulfilled_at timestamp with time zone null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lottery_winner_fulfillments_draw_check check (draw_no > 0),
  constraint lottery_winner_fulfillments_position_check check (winner_position > 0),
  constraint lottery_winner_fulfillments_status_check check (
    status in ('pending_contact', 'contacted', 'confirmed', 'shipping', 'fulfilled', 'disqualified', 'forfeited', 'voided')
  )
);

create unique index if not exists lottery_winner_fulfillments_draw_entry_unique
  on public.lottery_winner_fulfillments (lottery_id, draw_no, winner_position, entry_id)
  where entry_id is not null;

create unique index if not exists lottery_winner_fulfillments_current_position_unique
  on public.lottery_winner_fulfillments (lottery_id, winner_position)
  where is_current = true;

create index if not exists lottery_winner_fulfillments_lottery_current_idx
  on public.lottery_winner_fulfillments (lottery_id, is_current, created_at desc);

create index if not exists lottery_winner_fulfillments_user_idx
  on public.lottery_winner_fulfillments (user_id, created_at desc);

create table if not exists public.lottery_eligibility_exclusions (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lottery_eligibility_exclusions_reason_length check (char_length(trim(reason)) between 1 and 500),
  unique (lottery_id, user_id)
);

create index if not exists lottery_eligibility_exclusions_active_idx
  on public.lottery_eligibility_exclusions (lottery_id, user_id)
  where is_active = true;

create table if not exists public.lottery_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid null references public.lotteries(id) on delete cascade,
  fulfillment_id uuid null references public.lottery_winner_fulfillments(id) on delete set null,
  actor_id uuid null references public.profiles(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint lottery_admin_audit_logs_action_length check (char_length(trim(action)) between 1 and 120)
);

create index if not exists lottery_admin_audit_logs_lottery_created_idx
  on public.lottery_admin_audit_logs (lottery_id, created_at desc);

create index if not exists lottery_admin_audit_logs_fulfillment_created_idx
  on public.lottery_admin_audit_logs (fulfillment_id, created_at desc);

create or replace function public.touch_lottery_operation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lottery_winner_fulfillments_updated_at on public.lottery_winner_fulfillments;
create trigger trg_lottery_winner_fulfillments_updated_at
before update on public.lottery_winner_fulfillments
for each row execute function public.touch_lottery_operation_updated_at();

drop trigger if exists trg_lottery_eligibility_exclusions_updated_at on public.lottery_eligibility_exclusions;
create trigger trg_lottery_eligibility_exclusions_updated_at
before update on public.lottery_eligibility_exclusions
for each row execute function public.touch_lottery_operation_updated_at();

-- Seed operational records for the latest draw of existing lotteries.
insert into public.lottery_winner_fulfillments (
  lottery_id,
  draw_no,
  winner_position,
  entry_id,
  user_id,
  username_snapshot,
  status,
  is_current,
  created_by,
  updated_by
)
select
  logs.lottery_id,
  logs.draw_no,
  logs.winner_position,
  logs.entry_id,
  logs.user_id,
  logs.username_snapshot,
  case
    when lotteries.fulfillment_status in ('pending_contact', 'confirmed', 'fulfilled', 'voided') then lotteries.fulfillment_status
    else 'pending_contact'
  end,
  true,
  logs.drawn_by,
  logs.drawn_by
from public.lottery_draw_logs logs
join public.lotteries on lotteries.id = logs.lottery_id
join (
  select lottery_id, max(draw_no) as draw_no
  from public.lottery_draw_logs
  where user_id is not null
  group by lottery_id
) latest on latest.lottery_id = logs.lottery_id and latest.draw_no = logs.draw_no
where logs.user_id is not null
on conflict do nothing;

create or replace function public.sync_lottery_winner_fulfillment_from_draw_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  -- A fresh full redraw supersedes all winners from earlier draw rounds.
  update public.lottery_winner_fulfillments
     set is_current = false,
         updated_at = now()
   where lottery_id = new.lottery_id
     and is_current = true
     and draw_no < new.draw_no;

  insert into public.lottery_winner_fulfillments (
    lottery_id,
    draw_no,
    winner_position,
    entry_id,
    user_id,
    username_snapshot,
    status,
    is_current,
    created_by,
    updated_by
  )
  values (
    new.lottery_id,
    new.draw_no,
    new.winner_position,
    new.entry_id,
    new.user_id,
    new.username_snapshot,
    'pending_contact',
    true,
    new.drawn_by,
    new.drawn_by
  )
  on conflict (lottery_id, draw_no, winner_position, entry_id)
  where entry_id is not null
  do update set
    is_current = true,
    updated_by = excluded.updated_by,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_lottery_draw_log_fulfillment on public.lottery_draw_logs;
create trigger trg_lottery_draw_log_fulfillment
after insert on public.lottery_draw_logs
for each row execute function public.sync_lottery_winner_fulfillment_from_draw_log();

create or replace function public.audit_lottery_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_lottery_id uuid;
  v_detail jsonb;
begin
  v_action := case tg_op when 'INSERT' then 'lottery.created' when 'UPDATE' then 'lottery.updated' else 'lottery.deleted' end;
  v_lottery_id := coalesce(new.id, old.id);
  v_detail := case
    when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new))
    else jsonb_build_object('before', to_jsonb(old))
  end;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (v_lottery_id, auth.uid(), v_action, v_detail);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lotteries_audit on public.lotteries;
create trigger trg_lotteries_audit
after insert or update or delete on public.lotteries
for each row execute function public.audit_lottery_change();

create or replace function public.admin_update_lottery_winner_fulfillment(
  p_fulfillment_id uuid,
  p_status text,
  p_contact_note text default null,
  p_address_id uuid default null,
  p_shipping_carrier text default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lottery_winner_fulfillments%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可更新中奖履约');
  end if;
  if v_status not in ('pending_contact', 'contacted', 'confirmed', 'shipping', 'fulfilled', 'forfeited', 'voided') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '履约状态无效');
  end if;

  update public.lottery_winner_fulfillments
     set status = v_status,
         contact_note = nullif(trim(coalesce(p_contact_note, '')), ''),
         address_id = p_address_id,
         shipping_carrier = nullif(trim(coalesce(p_shipping_carrier, '')), ''),
         tracking_number = nullif(trim(coalesce(p_tracking_number, '')), ''),
         contacted_at = case when v_status in ('contacted', 'confirmed', 'shipping', 'fulfilled') then coalesce(contacted_at, now()) else contacted_at end,
         confirmed_at = case when v_status in ('confirmed', 'shipping', 'fulfilled') then coalesce(confirmed_at, now()) else confirmed_at end,
         fulfilled_at = case when v_status = 'fulfilled' then coalesce(fulfilled_at, now()) else null end,
         updated_by = auth.uid()
   where id = p_fulfillment_id
     and is_current = true
   returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '当前中奖履约记录不存在');
  end if;

  insert into public.lottery_admin_audit_logs (lottery_id, fulfillment_id, actor_id, action, detail)
  values (v_row.lottery_id, v_row.id, auth.uid(), 'winner.fulfillment_updated', jsonb_build_object('status', v_status));

  return jsonb_build_object('ok', true, 'fulfillment', to_jsonb(v_row));
end;
$$;

create or replace function public.admin_replace_lottery_winner(
  p_fulfillment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.lottery_winner_fulfillments%rowtype;
  v_candidate public.lottery_entries%rowtype;
  v_replacement public.lottery_winner_fulfillments%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_content text;
  v_notification_id uuid;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可替补中奖人');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', '替补必须填写原因');
  end if;

  select * into v_previous
  from public.lottery_winner_fulfillments
  where id = p_fulfillment_id
    and is_current = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '当前中奖履约记录不存在');
  end if;
  if v_previous.status = 'fulfilled' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_FULFILLED', 'message', '已完成履约的中奖人不能替补');
  end if;

  select e.* into v_candidate
  from public.lottery_entries e
  where e.lottery_id = v_previous.lottery_id
    and not exists (
      select 1 from public.lottery_winner_fulfillments f
      where f.lottery_id = e.lottery_id and f.user_id = e.user_id and f.is_current = true
    )
    and not exists (
      select 1 from public.lottery_eligibility_exclusions x
      where x.lottery_id = e.lottery_id and x.user_id = e.user_id and x.is_active = true
    )
  order by random()
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_ELIGIBLE_REPLACEMENT', 'message', '没有可用的候补报名用户');
  end if;

  update public.lottery_winner_fulfillments
     set is_current = false,
         status = 'disqualified',
         disqualification_reason = v_reason,
         updated_by = auth.uid()
   where id = v_previous.id;

  insert into public.lottery_winner_fulfillments (
    lottery_id, draw_no, winner_position, entry_id, user_id, username_snapshot,
    status, is_current, replacement_of, created_by, updated_by
  ) values (
    v_previous.lottery_id, v_previous.draw_no, v_previous.winner_position,
    v_candidate.id, v_candidate.user_id, v_candidate.username_snapshot,
    'pending_contact', true, v_previous.id, auth.uid(), auth.uid()
  ) returning * into v_replacement;

  select concat('你在「', l.title, '」中获得了替补中奖资格！奖品：', l.prize_title)
    into v_content
    from public.lotteries l
   where l.id = v_previous.lottery_id;

  insert into public.lottery_notification_jobs (
    lottery_id, draw_no, winner_position, user_id, type, content, status
  ) values (
    v_replacement.lottery_id, v_replacement.draw_no, v_replacement.winner_position,
    v_replacement.user_id, 'lottery_win_replacement', v_content, 'pending'
  ) on conflict (lottery_id, draw_no, winner_position, type) do update
    set user_id = excluded.user_id, content = excluded.content, status = 'pending', last_error = null, updated_at = now();

  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (v_replacement.user_id, auth.uid(), 'lottery_win', 'unread', v_content)
    returning id into v_notification_id;

    update public.lottery_notification_jobs
       set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
     where lottery_id = v_replacement.lottery_id
       and draw_no = v_replacement.draw_no
       and winner_position = v_replacement.winner_position
       and type = 'lottery_win_replacement';
  exception when others then
    update public.lottery_notification_jobs
       set status = 'failed', attempt_count = attempt_count + 1, last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
     where lottery_id = v_replacement.lottery_id
       and draw_no = v_replacement.draw_no
       and winner_position = v_replacement.winner_position
       and type = 'lottery_win_replacement';
  end;

  insert into public.lottery_admin_audit_logs (lottery_id, fulfillment_id, actor_id, action, detail)
  values (
    v_previous.lottery_id, v_replacement.id, auth.uid(), 'winner.replaced',
    jsonb_build_object('previous_fulfillment_id', v_previous.id, 'reason', v_reason, 'replacement_user_id', v_replacement.user_id)
  );

  return jsonb_build_object('ok', true, 'replacement', to_jsonb(v_replacement));
end;
$$;

create or replace function public.admin_retry_lottery_notification(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.lottery_notification_jobs%rowtype;
  v_notification_id uuid;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可重试中奖通知');
  end if;

  select * into v_job from public.lottery_notification_jobs where id = p_job_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '通知任务不存在');
  end if;

  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (v_job.user_id, auth.uid(), 'lottery_win', 'unread', v_job.content)
    returning id into v_notification_id;

    update public.lottery_notification_jobs
       set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, last_error = null, updated_at = now()
     where id = v_job.id;
  exception when others then
    update public.lottery_notification_jobs
       set status = 'failed', attempt_count = attempt_count + 1, last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
     where id = v_job.id;
    return jsonb_build_object('ok', false, 'code', 'SEND_FAILED', 'message', left(coalesce(sqlerrm, '通知发送失败'), 500));
  end;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (v_job.lottery_id, auth.uid(), 'notification.retried', jsonb_build_object('job_id', v_job.id));
  return jsonb_build_object('ok', true, 'notification_id', v_notification_id);
end;
$$;

create or replace function public.admin_lottery_storage_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'lotteries', 'lottery_entries', 'lottery_draw_logs', 'lottery_scheduler_logs',
    'lottery_notification_jobs', 'lottery_join_attempts', 'lottery_winner_fulfillments',
    'lottery_eligibility_exclusions', 'lottery_admin_audit_logs'
  ];
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'estimated_rows', greatest(c.reltuples::bigint, 0),
        'total_bytes', pg_total_relation_size(c.oid),
        'table_bytes', pg_relation_size(c.oid),
        'index_bytes', pg_indexes_size(c.oid)
      ) order by pg_total_relation_size(c.oid) desc)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = any(v_tables)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.cleanup_lottery_operational_data(
  p_scheduler_days integer default 7,
  p_join_attempt_days integer default 30,
  p_notification_days integer default 90,
  p_audit_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduler_deleted integer := 0;
  v_join_deleted integer := 0;
  v_notification_deleted integer := 0;
  v_audit_deleted integer := 0;
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  delete from public.lottery_scheduler_logs
   where created_at < now() - (greatest(1, p_scheduler_days) || ' days')::interval;
  get diagnostics v_scheduler_deleted = row_count;

  delete from public.lottery_join_attempts
   where created_at < now() - (greatest(7, p_join_attempt_days) || ' days')::interval;
  get diagnostics v_join_deleted = row_count;

  delete from public.lottery_notification_jobs
   where status = 'sent'
     and created_at < now() - (greatest(30, p_notification_days) || ' days')::interval;
  get diagnostics v_notification_deleted = row_count;

  delete from public.lottery_admin_audit_logs
   where created_at < now() - (greatest(90, p_audit_days) || ' days')::interval;
  get diagnostics v_audit_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'scheduler_deleted', v_scheduler_deleted,
    'join_attempt_deleted', v_join_deleted,
    'notification_deleted', v_notification_deleted,
    'audit_deleted', v_audit_deleted
  );
end;
$$;

-- Replace the scheduler procedure so no-op minute ticks stay out of storage.
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

  select count(*)::integer into v_due_count
  from public.lotteries
  where status = 'open' and draw_at is not null and draw_at <= now();

  -- Nothing due is healthy and intentionally leaves no persistence footprint.
  if v_due_count = 0 then
    return jsonb_build_object('ok', true, 'checked', 0, 'drawn', 0, 'failed', 0, 'due_count', 0, 'ran_at', now(), 'results', '[]'::jsonb);
  end if;

  insert into public.lottery_scheduler_logs (run_source, status, due_count, started_at)
  values (coalesce(nullif(v_run_source, ''), 'scheduled'), 'running', v_due_count, v_started_at)
  returning id into v_log_id;

  for v_lottery_id in
    select id from public.lotteries
    where status = 'open' and draw_at is not null and draw_at <= now()
    order by draw_at asc, created_at asc
    limit v_limit
    for update skip locked
  loop
    v_checked := v_checked + 1;
    begin
      v_result := public.execute_lottery_draw(v_lottery_id, false, false, case when v_run_source = 'manual_admin' then 'manual_due_draw' else 'scheduled_draw' end);
      if coalesce(v_result->>'code', '') in ('DRAWN', 'ALREADY_DRAWN') then v_drawn := v_drawn + 1; else v_failed := v_failed + 1; end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object('lottery_id', v_lottery_id, 'code', v_result->>'code', 'ok', coalesce((v_result->>'ok')::boolean, false)));
    exception when others then
      v_failed := v_failed + 1;
      perform public.record_lottery_auto_draw_failure(v_lottery_id, concat(coalesce(sqlstate, 'SCHEDULED_DRAW_FAILED'), ' ', coalesce(sqlerrm, '定时开奖失败')));
      v_results := v_results || jsonb_build_array(jsonb_build_object('lottery_id', v_lottery_id, 'code', coalesce(sqlstate, 'SCHEDULED_DRAW_FAILED'), 'ok', false));
    end;
  end loop;

  update public.lottery_scheduler_logs
     set status = case when v_failed > 0 and v_drawn > 0 then 'partial_failure' when v_failed > 0 then 'failed' else 'success' end,
         checked_count = v_checked, drawn_count = v_drawn, failed_count = v_failed, due_count = v_due_count,
         finished_at = clock_timestamp(), duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer), details = v_results
   where id = v_log_id;

  return jsonb_build_object('ok', true, 'checked', v_checked, 'drawn', v_drawn, 'failed', v_failed, 'due_count', v_due_count, 'ran_at', now(), 'results', v_results);
exception when others then
  if v_log_id is not null then
    update public.lottery_scheduler_logs
       set status = 'failed', checked_count = v_checked, drawn_count = v_drawn, failed_count = v_failed + 1, due_count = v_due_count,
           finished_at = clock_timestamp(), duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
           error_message = left(coalesce(sqlerrm, '定时开奖任务失败'), 500), details = v_results
     where id = v_log_id;
  end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'SCHEDULER_FAILED'), 'message', coalesce(sqlerrm, '定时开奖任务失败'), 'checked', v_checked, 'drawn', v_drawn, 'failed', v_failed + 1, 'due_count', v_due_count, 'results', v_results);
end;
$$;

alter table public.lottery_winner_fulfillments enable row level security;
alter table public.lottery_eligibility_exclusions enable row level security;
alter table public.lottery_admin_audit_logs enable row level security;

drop policy if exists lottery_winner_fulfillments_admin_all on public.lottery_winner_fulfillments;
create policy lottery_winner_fulfillments_admin_all on public.lottery_winner_fulfillments
  for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists lottery_eligibility_exclusions_admin_all on public.lottery_eligibility_exclusions;
create policy lottery_eligibility_exclusions_admin_all on public.lottery_eligibility_exclusions
  for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists lottery_admin_audit_logs_admin_select on public.lottery_admin_audit_logs;
create policy lottery_admin_audit_logs_admin_select on public.lottery_admin_audit_logs
  for select to authenticated using (public.current_user_is_admin());

revoke all on function public.admin_update_lottery_winner_fulfillment(uuid, text, text, uuid, text, text) from public;
revoke all on function public.admin_replace_lottery_winner(uuid, text) from public;
revoke all on function public.admin_retry_lottery_notification(uuid) from public;
revoke all on function public.admin_lottery_storage_report() from public;
revoke all on function public.cleanup_lottery_operational_data(integer, integer, integer, integer) from public;

grant execute on function public.admin_update_lottery_winner_fulfillment(uuid, text, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_replace_lottery_winner(uuid, text) to authenticated, service_role;
grant execute on function public.admin_retry_lottery_notification(uuid) to authenticated, service_role;
grant execute on function public.admin_lottery_storage_report() to authenticated, service_role;
grant execute on function public.cleanup_lottery_operational_data(integer, integer, integer, integer) to authenticated, service_role;

commit;
