-- Lottery pity rules.
-- Existing lotteries remain outside pity by default; only newly configured
-- lotteries can opt into counting losses and allowing a pity winner.

begin;

alter table public.lotteries
  add column if not exists pity_mode text not null default 'none';

alter table public.lotteries
  add column if not exists pity_winner_count integer not null default 1;

update public.lotteries
   set pity_mode = 'none'
 where pity_mode is null
    or pity_mode not in ('none', 'eligible');

update public.lotteries
   set pity_winner_count = least(greatest(coalesce(pity_winner_count, 1), 1), greatest(winner_count, 1))
 where pity_winner_count is null
    or pity_winner_count <= 0
    or pity_winner_count > winner_count;

alter table public.lotteries
  drop constraint if exists lotteries_pity_mode_check;

alter table public.lotteries
  add constraint lotteries_pity_mode_check
  check (pity_mode in ('none', 'eligible'));

alter table public.lotteries
  drop constraint if exists lotteries_pity_winner_count_check;

alter table public.lotteries
  add constraint lotteries_pity_winner_count_check
  check (pity_winner_count > 0 and pity_winner_count <= winner_count);

create table if not exists public.lottery_pity_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  consecutive_losses integer not null default 0,
  last_lottery_id uuid null references public.lotteries(id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  constraint lottery_pity_progress_losses_check check (consecutive_losses >= 0)
);

create table if not exists public.lottery_pity_events (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid null references public.lottery_entries(id) on delete set null,
  tier_code text not null default 'free',
  result text not null,
  streak_before integer not null default 0,
  streak_after integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint lottery_pity_events_result_check check (result in ('loss', 'random_win', 'pity_win')),
  constraint lottery_pity_events_streak_check check (streak_before >= 0 and streak_after >= 0),
  unique (lottery_id, user_id)
);

create index if not exists idx_lottery_pity_progress_losses
  on public.lottery_pity_progress (consecutive_losses desc, updated_at asc);

create index if not exists idx_lottery_pity_events_user_created
  on public.lottery_pity_events (user_id, created_at desc);

alter table public.lottery_pity_progress enable row level security;
alter table public.lottery_pity_events enable row level security;

create or replace function public.lottery_pity_threshold(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(p_tier, '')))
    when 'plus' then 25
    when 'pro' then 20
    when 'max' then 20
    when 'ultra' then 10
    else 0
  end;
$$;

revoke all on function public.lottery_pity_threshold(text) from public;
grant execute on function public.lottery_pity_threshold(text) to authenticated, service_role;

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
  v_entry public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_no integer := 1;
  v_previous_draw_no integer := null;
  v_previous_winner_count integer := 0;
  v_winner_limit integer := 0;
  v_pity_winner_limit integer := 0;
  v_pity_due_count integer := 0;
  v_actual_winner_count integer := 0;
  v_winners jsonb := '[]'::jsonb;
  v_candidate_hash text := null;
  v_notification_id uuid := null;
  v_notification_content text := '';
  v_reason text := nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '');
  v_error_message text := '';
  v_pity_entry_ids uuid[] := '{}'::uuid[];
  v_winner_user_ids uuid[] := '{}'::uuid[];
  v_tier_code text := 'free';
  v_pity_threshold integer := 0;
  v_streak_before integer := 0;
  v_streak_after integer := 0;
  v_pity_result text := 'loss';
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

  if p_redraw and v_lottery.pity_mode <> 'none' then
    return jsonb_build_object(
      'ok', false,
      'code', 'PITY_REDRAW_UNSUPPORTED',
      'message', '启用保底的抽奖不支持重抽，请关闭后重新创建活动'
    );
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

    -- A pity-enabled draw must have enough reserved pity seats for every due user.
    -- Otherwise the draw would violate the promise that the next eligible activity wins.
    if v_lottery.pity_mode = 'eligible' then
      v_pity_winner_limit := least(
        greatest(coalesce(v_lottery.pity_winner_count, 1), 1),
        v_winner_limit
      );

      select count(*)::integer
        into v_pity_due_count
        from public.lottery_entries e
        join public.lottery_pity_progress p on p.user_id = e.user_id
       where e.lottery_id = p_lottery_id
         and p.consecutive_losses >= public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id))
         and public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id)) > 0;

      if v_pity_due_count > v_pity_winner_limit then
        update public.lotteries
           set draw_failed_at = now(),
               draw_failure_message = format('保底名额不足：有 %s 名用户达到保底，本次仅允许 %s 名保底中奖', v_pity_due_count, v_pity_winner_limit),
               draw_attempted_at = coalesce(draw_attempted_at, now())
         where id = p_lottery_id;

        return jsonb_build_object(
          'ok', false,
          'code', 'PITY_CAP_EXCEEDED',
          'message', format('保底名额不足：有 %s 名用户达到保底，请将允许保底中奖人数提高到至少 %s 后再开奖', v_pity_due_count, v_pity_due_count),
          'pity_due_count', v_pity_due_count,
          'pity_winner_limit', v_pity_winner_limit
        );
      end if;

      -- Pity winners are selected first and consume the same hard winner cap.
      with eligible_entries as (
        select e.*
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
      )
      select coalesce(array_agg(candidate.id order by candidate.consecutive_losses desc, candidate.progress_updated_at asc, candidate.created_at asc, candidate.id asc), '{}'::uuid[])
        into v_pity_entry_ids
        from (
          select e.id, e.created_at, p.consecutive_losses, p.updated_at as progress_updated_at
            from eligible_entries e
            join public.lottery_pity_progress p on p.user_id = e.user_id
           where p.consecutive_losses >= public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id))
             and public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id)) > 0
           order by p.consecutive_losses desc, p.updated_at asc, e.created_at asc, e.id asc
           limit v_pity_winner_limit
        ) candidate;
    end if;

    for v_winner in
      with eligible_entries as (
        select e.*
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
      )
      select candidate.*
        from (
          select e.*
            from eligible_entries e
           where e.id = any(v_pity_entry_ids)
          union all
          (
            select e.*
              from eligible_entries e
             where not (e.id = any(v_pity_entry_ids))
             order by random()
             limit greatest(v_winner_limit - coalesce(cardinality(v_pity_entry_ids), 0), 0)
          )
        ) candidate
    loop
      v_actual_winner_count := v_actual_winner_count + 1;
      v_winner_user_ids := array_append(v_winner_user_ids, v_winner.user_id);

      if v_actual_winner_count = 1 then
        v_first_winner := v_winner;
      end if;

      v_winners := v_winners || jsonb_build_array(jsonb_build_object(
        'position', v_actual_winner_count,
        'entry_id', v_winner.id,
        'user_id', v_winner.user_id,
        'username', v_winner.username_snapshot,
        'pity', v_winner.id = any(v_pity_entry_ids)
      ));

      insert into public.lottery_draw_logs (
        lottery_id, draw_no, entry_id, user_id, username_snapshot,
        winner_position, drawn_by, reason
      )
      values (
        p_lottery_id, v_draw_no, v_winner.id, v_winner.user_id,
        v_winner.username_snapshot, v_actual_winner_count, auth.uid(),
        case when v_winner.id = any(v_pity_entry_ids) then 'pity_win' else v_reason end
      );

      v_notification_content := concat('你在「', v_lottery.title, '」中中奖啦！奖品：', v_lottery.prize_title);

      insert into public.lottery_notification_jobs (
        lottery_id, draw_no, winner_position, user_id, type, content, status
      )
      values (
        p_lottery_id, v_draw_no, v_actual_winner_count, v_winner.user_id,
        'lottery_win', v_notification_content, 'pending'
      )
      on conflict (lottery_id, draw_no, winner_position, type) do nothing;

      begin
        insert into public.notifications (recipient_id, sender_id, type, status, content)
        values (
          v_winner.user_id, auth.uid(), 'lottery_win', 'unread', v_notification_content
        )
        returning id into v_notification_id;

        update public.lottery_notification_jobs
           set status = 'sent', notification_id = v_notification_id,
               attempt_count = attempt_count + 1, updated_at = now()
         where lottery_id = p_lottery_id
           and draw_no = v_draw_no
           and winner_position = v_actual_winner_count
           and type = 'lottery_win';
      exception
        when others then
          update public.lottery_notification_jobs
             set status = 'failed', attempt_count = attempt_count + 1,
                 last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
           where lottery_id = p_lottery_id
             and draw_no = v_draw_no
             and winner_position = v_actual_winner_count
             and type = 'lottery_win';
      end;
    end loop;
  end if;

  -- Only initial draws update pity. Redraws are rejected for pity-enabled events.
  if not p_redraw and v_lottery.pity_mode <> 'none' then
    for v_entry in
      select e.*
        from public.lottery_entries e
       where e.lottery_id = p_lottery_id
    loop
      v_tier_code := coalesce(nullif(public.get_user_subscription_tier(v_entry.user_id), ''), 'free');
      v_pity_threshold := public.lottery_pity_threshold(v_tier_code);
      if v_pity_threshold <= 0 then
        continue;
      end if;

      v_streak_before := 0;
      select consecutive_losses
        into v_streak_before
        from public.lottery_pity_progress
       where user_id = v_entry.user_id
       for update;
      if not found then
        v_streak_before := 0;
      end if;

      if v_entry.user_id = any(v_winner_user_ids) then
        v_streak_after := 0;
        v_pity_result := case when exists (
          select 1 from public.lottery_draw_logs l
           where l.lottery_id = p_lottery_id
             and l.draw_no = v_draw_no
             and l.user_id = v_entry.user_id
             and l.reason = 'pity_win'
        ) then 'pity_win' else 'random_win' end;
      else
        -- Keep a due user at the threshold if a concurrent draw reaches this row first.
        v_streak_after := least(v_streak_before + 1, v_pity_threshold);
        v_pity_result := 'loss';
      end if;

      insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
      values (v_entry.user_id, v_streak_after, p_lottery_id, now())
      on conflict (user_id) do update set
        consecutive_losses = excluded.consecutive_losses,
        last_lottery_id = excluded.last_lottery_id,
        updated_at = excluded.updated_at;

      insert into public.lottery_pity_events (
        lottery_id, user_id, entry_id, tier_code, result, streak_before, streak_after
      )
      values (
        p_lottery_id, v_entry.user_id, v_entry.id, v_tier_code, v_pity_result,
        v_streak_before, v_streak_after
      )
      on conflict (lottery_id, user_id) do nothing;
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
         draw_algorithm_version = case
           when v_lottery.pity_mode = 'eligible' then 'postgres_order_by_random_v1_pity_v2'
           else 'postgres_order_by_random_v1'
         end,
         winner_entry_id = case when v_actual_winner_count > 0 then v_first_winner.id else null end,
         winner_user_id = case when v_actual_winner_count > 0 then v_first_winner.user_id else null end,
         winner_username = case when v_actual_winner_count > 0 then v_first_winner.username_snapshot else null end,
         fulfillment_status = 'pending_contact',
         updated_by = case when p_force then auth.uid() else updated_by end
   where id = p_lottery_id
   returning * into v_lottery;

  if v_actual_winner_count = 0 then
    insert into public.lottery_draw_logs (
      lottery_id, draw_no, entry_id, user_id, username_snapshot,
      winner_position, drawn_by, reason
    )
    values (p_lottery_id, v_draw_no, null, null, null, 1, auth.uid(), v_reason);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'DRAWN',
    'message', '开奖完成',
    'entry_count', v_entry_count,
    'draw_no', v_draw_no,
    'winner_count', v_lottery.winner_count,
    'actual_winner_count', v_actual_winner_count,
    'pity_mode', v_lottery.pity_mode,
    'pity_winner_count', coalesce(cardinality(v_pity_entry_ids), 0),
    'pity_winner_limit', coalesce(v_lottery.pity_winner_count, 1),
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

revoke all on function public.execute_lottery_draw(uuid, boolean, boolean, text) from public;
grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to authenticated, service_role;

commit;
