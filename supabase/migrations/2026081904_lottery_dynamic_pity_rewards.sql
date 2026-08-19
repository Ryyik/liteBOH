-- Keep ordinary and pity awards separate. An eligible event has one ordinary
-- winner and at most one distinct pity winner.

begin;

alter table public.lotteries
  add column if not exists pity_reward_title text null,
  add column if not exists pity_reward_description text null,
  add column if not exists pity_overflow_reward_title text null,
  add column if not exists pity_overflow_reward_description text null;

-- Keep existing eligible events operable. New eligible events are validated by
-- the application and the constraint below.
update public.lotteries
   set pity_reward_title = coalesce(nullif(trim(pity_reward_title), ''), prize_title),
       pity_reward_description = coalesce(pity_reward_description, prize_description),
       pity_overflow_reward_title = coalesce(nullif(trim(pity_overflow_reward_title), ''), prize_title),
       pity_overflow_reward_description = coalesce(pity_overflow_reward_description, prize_description)
 where pity_mode = 'eligible';

alter table public.lotteries
  drop constraint if exists lotteries_pity_winner_count_check;

alter table public.lotteries
  add constraint lotteries_pity_winner_count_check
  check (
    pity_winner_count is null
    or (pity_winner_count > 0 and pity_winner_count <= winner_count)
  );

alter table public.lotteries
  drop constraint if exists lotteries_pity_reward_config_check;

alter table public.lotteries
  add constraint lotteries_pity_reward_config_check
  check (
    pity_mode <> 'eligible'
    or (
      length(trim(coalesce(pity_reward_title, ''))) > 0
    )
  );

-- Normalize the existing data before enforcing the new fixed winner layout.
update public.lotteries
   set pity_winner_count = 1
 where pity_winner_count is distinct from 1;

update public.lotteries
   set winner_count = case when pity_mode = 'eligible' then 2 else 1 end
 where winner_count is distinct from case when pity_mode = 'eligible' then 2 else 1 end;

create or replace function public.validate_lottery_pity_winner_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pity_mode = 'eligible' and coalesce(new.winner_count, 0) <> 2 then
    raise exception '兑现保底时中奖人数必须为 2：一位普通中奖人和一位保底中奖人';
  end if;
  if new.pity_mode <> 'eligible' and coalesce(new.winner_count, 0) <> 1 then
    raise exception '不兑现保底时中奖人数必须为 1：一位普通中奖人';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lotteries_validate_pity_winner_configuration on public.lotteries;
create trigger trg_lotteries_validate_pity_winner_configuration
before insert or update of pity_mode, winner_count on public.lotteries
for each row execute function public.validate_lottery_pity_winner_configuration();

alter table public.lottery_winner_fulfillments
  add column if not exists award_kind text not null default 'standard',
  add column if not exists award_title text null,
  add column if not exists award_description text null;

update public.lottery_winner_fulfillments f
   set award_title = coalesce(f.award_title, l.prize_title),
       award_description = coalesce(f.award_description, l.prize_description)
  from public.lotteries l
 where l.id = f.lottery_id;

alter table public.lottery_winner_fulfillments
  drop constraint if exists lottery_winner_fulfillments_award_kind_check;

alter table public.lottery_winner_fulfillments
  add constraint lottery_winner_fulfillments_award_kind_check
  check (award_kind in ('standard', 'pity_primary', 'pity_overflow'));

drop index if exists public.lottery_winner_fulfillments_current_position_unique;
create unique index lottery_winner_fulfillments_current_position_unique
  on public.lottery_winner_fulfillments (lottery_id, award_kind, winner_position)
  where is_current = true;

create index if not exists lottery_winner_fulfillments_award_kind_idx
  on public.lottery_winner_fulfillments (lottery_id, award_kind, is_current, created_at desc);

create or replace function public.sync_lottery_winner_fulfillment_from_draw_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
begin
  if new.user_id is null then
    return new;
  end if;

  select * into v_lottery from public.lotteries where id = new.lottery_id;

  update public.lottery_winner_fulfillments
     set is_current = false, updated_at = now()
   where lottery_id = new.lottery_id and award_kind = 'standard'
     and is_current = true and draw_no < new.draw_no;

  insert into public.lottery_winner_fulfillments (
    lottery_id, draw_no, winner_position, entry_id, user_id, username_snapshot,
    award_kind, award_title, award_description, status, is_current, created_by, updated_by
  ) values (
    new.lottery_id, new.draw_no, new.winner_position, new.entry_id, new.user_id, new.username_snapshot,
    'standard', v_lottery.prize_title, v_lottery.prize_description,
    'pending_contact', true, new.drawn_by, new.drawn_by
  )
  on conflict (lottery_id, draw_no, winner_position, entry_id)
  where entry_id is not null
  do update set
    is_current = true,
    award_kind = excluded.award_kind,
    award_title = excluded.award_title,
    award_description = excluded.award_description,
    updated_by = excluded.updated_by,
    updated_at = now();

  return new;
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
  v_job_type text;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可替补中奖人');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', '替补必须填写原因');
  end if;

  select * into v_previous
    from public.lottery_winner_fulfillments
   where id = p_fulfillment_id and is_current = true
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
     set is_current = false, status = 'disqualified', disqualification_reason = v_reason, updated_by = auth.uid()
   where id = v_previous.id;

  insert into public.lottery_winner_fulfillments (
    lottery_id, draw_no, winner_position, entry_id, user_id, username_snapshot,
    award_kind, award_title, award_description,
    status, is_current, replacement_of, created_by, updated_by
  ) values (
    v_previous.lottery_id, v_previous.draw_no, v_previous.winner_position,
    v_candidate.id, v_candidate.user_id, v_candidate.username_snapshot,
    v_previous.award_kind, v_previous.award_title, v_previous.award_description,
    'pending_contact', true, v_previous.id, auth.uid(), auth.uid()
  ) returning * into v_replacement;

  v_content := concat('你在「', (select title from public.lotteries where id = v_previous.lottery_id),
    '」中获得了替补中奖资格！奖品：', coalesce(v_replacement.award_title, '活动奖品'));
  v_job_type := concat('lottery_', v_replacement.award_kind, '_replacement');

  insert into public.lottery_notification_jobs (
    lottery_id, draw_no, winner_position, user_id, type, content, status
  ) values (
    v_replacement.lottery_id, v_replacement.draw_no, v_replacement.winner_position,
    v_replacement.user_id, v_job_type, v_content, 'pending'
  ) on conflict (lottery_id, draw_no, winner_position, type) do update
    set user_id = excluded.user_id, content = excluded.content, status = 'pending', last_error = null, updated_at = now();

  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (v_replacement.user_id, auth.uid(), 'lottery_win', 'unread', v_content)
    returning id into v_notification_id;

    update public.lottery_notification_jobs
       set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
     where lottery_id = v_replacement.lottery_id and draw_no = v_replacement.draw_no
       and winner_position = v_replacement.winner_position and type = v_job_type;
  exception when others then
    update public.lottery_notification_jobs
       set status = 'failed', attempt_count = attempt_count + 1,
           last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
     where lottery_id = v_replacement.lottery_id and draw_no = v_replacement.draw_no
       and winner_position = v_replacement.winner_position and type = v_job_type;
  end;

  insert into public.lottery_admin_audit_logs (lottery_id, fulfillment_id, actor_id, action, detail)
  values (
    v_previous.lottery_id, v_replacement.id, auth.uid(), 'winner.replaced',
    jsonb_build_object('previous_fulfillment_id', v_previous.id, 'reason', v_reason,
      'replacement_user_id', v_replacement.user_id, 'award_kind', v_replacement.award_kind)
  );

  return jsonb_build_object('ok', true, 'replacement', to_jsonb(v_replacement));
end;
$$;

create or replace function public.lottery_pity_threshold(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(p_tier, '')))
    when 'plus' then 24
    when 'pro' then 18
    when 'max' then 12
    when 'ultra' then 8
    else 0
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
  v_entry public.lottery_entries%rowtype;
  v_pity_entry record;
  v_entry_count integer := 0;
  v_draw_no integer := 1;
  v_previous_draw_no integer := null;
  v_previous_winner_count integer := 0;
  v_winner_limit integer := 0;
  v_actual_winner_count integer := 0;
  v_pity_due_count integer := 0;
  v_pity_primary_limit integer := 0;
  v_pity_primary_count integer := 0;
  v_pity_overflow_count integer := 0;
  v_pity_position integer := 0;
  v_winners jsonb := '[]'::jsonb;
  v_candidate_hash text := null;
  v_notification_id uuid := null;
  v_fulfillment_id uuid := null;
  v_notification_content text := '';
  v_reason text := nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '');
  v_error_message text := '';
  v_winner_user_ids uuid[] := '{}'::uuid[];
  v_pity_recipient_user_ids uuid[] := '{}'::uuid[];
  v_tier_code text := 'free';
  v_pity_threshold integer := 0;
  v_streak_before integer := 0;
  v_streak_after integer := 0;
  v_pity_result text := 'loss';
  v_award_kind text := 'pity_primary';
  v_award_title text := '';
  v_award_description text := '';
begin
  if p_force and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可手动开奖');
  end if;

  if p_redraw and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可重抽');
  end if;

  select * into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在');
  end if;

  if v_lottery.status = 'drawn' and not p_redraw then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_DRAWN', 'message', '抽奖已经开奖', 'winner_user_id', v_lottery.winner_user_id, 'winner_username', v_lottery.winner_username);
  end if;

  if v_lottery.status not in ('open', 'drawn') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '当前抽奖不在开放状态');
  end if;

  if (v_lottery.pity_mode = 'eligible' and v_lottery.winner_count <> 2)
     or (v_lottery.pity_mode <> 'eligible' and v_lottery.winner_count <> 1) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_PITY_WINNER_CONFIGURATION',
      'message', '不兑现保底时必须配置 1 位普通中奖人；兑现保底时必须配置 1 位普通中奖人和 1 位保底中奖人'
    );
  end if;

  if p_redraw and v_lottery.pity_mode <> 'none' then
    return jsonb_build_object('ok', false, 'code', 'PITY_REDRAW_UNSUPPORTED', 'message', '计入保底的抽奖不支持重抽，请关闭后重新创建活动');
  end if;

  if not p_force and not p_redraw and (v_lottery.draw_at is null or v_lottery.draw_at > now()) then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'message', '尚未到开奖时间');
  end if;

  -- Pity progress is shared by every event, so serialize pity draws to avoid
  -- giving the same due participant a reward in concurrent events.
  if v_lottery.pity_mode <> 'none' then
    perform pg_advisory_xact_lock(hashtext('lottery_pity_progress_v3'));
  end if;

  update public.lotteries
     set draw_attempted_at = now(), draw_failed_at = null, draw_failure_message = null
   where id = p_lottery_id;

  select count(*)::integer,
         md5(coalesce(string_agg(e.id::text || ':' || e.user_id::text, ',' order by e.created_at, e.id), ''))
    into v_entry_count, v_candidate_hash
    from public.lottery_entries e
   where e.lottery_id = p_lottery_id;

  select max(draw_no) into v_previous_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_previous_draw_no is not null then
    select count(*) into v_previous_winner_count
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id and draw_no = v_previous_draw_no and user_id is not null;
  end if;

  select coalesce(max(draw_no), 0) + 1 into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_entry_count > 0 then
    v_winner_limit := least(1, v_entry_count);

    -- The normal pool is always drawn first and never loses seats to pity.
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
               select 1 from public.lottery_draw_logs l
                where l.lottery_id = p_lottery_id
                  and l.draw_no = v_previous_draw_no
                  and l.user_id = e.user_id
             )
           )
      )
      select * from eligible_entries order by random() limit v_winner_limit
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
        'pity', false
      ));

      insert into public.lottery_draw_logs (
        lottery_id, draw_no, entry_id, user_id, username_snapshot, winner_position, drawn_by, reason
      ) values (
        p_lottery_id, v_draw_no, v_winner.id, v_winner.user_id, v_winner.username_snapshot,
        v_actual_winner_count, auth.uid(), v_reason
      );

      v_notification_content := concat('你在「', v_lottery.title, '」中中奖啦！奖品：', v_lottery.prize_title);
      insert into public.lottery_notification_jobs (
        lottery_id, draw_no, winner_position, user_id, type, content, status
      ) values (
        p_lottery_id, v_draw_no, v_actual_winner_count, v_winner.user_id, 'lottery_win', v_notification_content, 'pending'
      ) on conflict (lottery_id, draw_no, winner_position, type) do nothing;

      begin
        insert into public.notifications (recipient_id, sender_id, type, status, content)
        values (v_winner.user_id, auth.uid(), 'lottery_win', 'unread', v_notification_content)
        returning id into v_notification_id;

        update public.lottery_notification_jobs
           set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
         where lottery_id = p_lottery_id and draw_no = v_draw_no
           and winner_position = v_actual_winner_count and type = 'lottery_win';
      exception when others then
        update public.lottery_notification_jobs
           set status = 'failed', attempt_count = attempt_count + 1,
               last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
         where lottery_id = p_lottery_id and draw_no = v_draw_no
           and winner_position = v_actual_winner_count and type = 'lottery_win';
      end;
    end loop;

    -- A pity award is independent from the ordinary winner and is limited to
    -- one due participant who did not win the ordinary prize.
    if v_lottery.pity_mode = 'eligible' then
      v_pity_primary_limit := 1;

      for v_pity_entry in
        select e.id as entry_id, e.user_id, e.username_snapshot, e.created_at,
               p.consecutive_losses, p.updated_at as progress_updated_at
          from public.lottery_entries e
          join public.lottery_pity_progress p on p.user_id = e.user_id
         where e.lottery_id = p_lottery_id
           and p.consecutive_losses >= public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id))
           and public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id)) > 0
           and not (e.user_id = any(v_winner_user_ids))
         order by p.consecutive_losses desc, p.updated_at asc, e.created_at asc, e.id asc
         limit v_pity_primary_limit
      loop
        v_pity_due_count := v_pity_due_count + 1;
        v_pity_position := v_pity_position + 1;
        v_pity_recipient_user_ids := array_append(v_pity_recipient_user_ids, v_pity_entry.user_id);

        v_award_kind := 'pity_primary';
        v_award_title := v_lottery.pity_reward_title;
        v_award_description := v_lottery.pity_reward_description;
        v_pity_primary_count := v_pity_primary_count + 1;

        insert into public.lottery_winner_fulfillments (
          lottery_id, draw_no, winner_position, entry_id, user_id, username_snapshot,
          award_kind, award_title, award_description, status, is_current, created_by, updated_by
        ) values (
          p_lottery_id, v_draw_no, v_pity_position, v_pity_entry.entry_id, v_pity_entry.user_id, v_pity_entry.username_snapshot,
          v_award_kind, v_award_title, v_award_description, 'pending_contact', true, auth.uid(), auth.uid()
        ) returning id into v_fulfillment_id;

        v_notification_content := concat('你在「', v_lottery.title, '」中获得保底礼：', v_award_title);
        insert into public.lottery_notification_jobs (
          lottery_id, draw_no, winner_position, user_id, type, content, status, fulfillment_id
        ) values (
          p_lottery_id, v_draw_no, v_pity_position, v_pity_entry.user_id,
          concat('lottery_', v_award_kind), v_notification_content, 'pending', v_fulfillment_id
        ) on conflict (lottery_id, draw_no, winner_position, type) do nothing;

        begin
          insert into public.notifications (recipient_id, sender_id, type, status, content)
          values (v_pity_entry.user_id, auth.uid(), 'lottery_win', 'unread', v_notification_content)
          returning id into v_notification_id;

          update public.lottery_notification_jobs
             set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
           where lottery_id = p_lottery_id and draw_no = v_draw_no
             and winner_position = v_pity_position and type = concat('lottery_', v_award_kind);
        exception when others then
          update public.lottery_notification_jobs
             set status = 'failed', attempt_count = attempt_count + 1,
                 last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
           where lottery_id = p_lottery_id and draw_no = v_draw_no
             and winner_position = v_pity_position and type = concat('lottery_', v_award_kind);
        end;
      end loop;
    end if;
  end if;

  -- A win always resets an eligible member's streak. A "none" event does not
  -- add a loss for non-winners, but it still records the reset for its winner.
  if not p_redraw then
    for v_entry in
      select e.* from public.lottery_entries e where e.lottery_id = p_lottery_id
    loop
      v_tier_code := coalesce(nullif(public.get_user_subscription_tier(v_entry.user_id), ''), 'free');
      v_pity_threshold := public.lottery_pity_threshold(v_tier_code);
      if v_pity_threshold <= 0 then
        continue;
      end if;

      select consecutive_losses into v_streak_before
        from public.lottery_pity_progress
       where user_id = v_entry.user_id
       for update;
      if not found then
        v_streak_before := 0;
      end if;

      if v_entry.user_id = any(v_winner_user_ids) then
        v_streak_after := 0;
        v_pity_result := 'random_win';
      elsif v_entry.user_id = any(v_pity_recipient_user_ids) then
        v_streak_after := 0;
        v_pity_result := 'pity_win';
      elsif v_lottery.pity_mode = 'none' then
        continue;
      else
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
      ) values (
        p_lottery_id, v_entry.user_id, v_entry.id, v_tier_code, v_pity_result, v_streak_before, v_streak_after
      ) on conflict (lottery_id, user_id) do nothing;
    end loop;
  end if;

  update public.lotteries
     set status = 'drawn', drawn_at = now(), draw_attempted_at = coalesce(draw_attempted_at, now()),
         draw_failed_at = null, draw_failure_message = null, draw_entry_count_snapshot = v_entry_count,
         draw_candidate_hash = v_candidate_hash,
         draw_algorithm_version = case when v_lottery.pity_mode = 'eligible' then 'postgres_order_by_random_v1_fixed_dual_pity_v4' else 'postgres_order_by_random_v1' end,
         winner_entry_id = case when v_actual_winner_count > 0 then v_first_winner.id else null end,
         winner_user_id = case when v_actual_winner_count > 0 then v_first_winner.user_id else null end,
         winner_username = case when v_actual_winner_count > 0 then v_first_winner.username_snapshot else null end,
         fulfillment_status = 'pending_contact',
         updated_by = case when p_force then auth.uid() else updated_by end
   where id = p_lottery_id
   returning * into v_lottery;

  if v_actual_winner_count = 0 then
    insert into public.lottery_draw_logs (
      lottery_id, draw_no, entry_id, user_id, username_snapshot, winner_position, drawn_by, reason
    ) values (p_lottery_id, v_draw_no, null, null, null, 1, auth.uid(), v_reason);
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'DRAWN', 'message', '开奖完成', 'entry_count', v_entry_count,
    'draw_no', v_draw_no, 'winner_count', v_lottery.winner_count,
    'actual_winner_count', v_actual_winner_count, 'pity_mode', v_lottery.pity_mode,
    'pity_due_count', v_pity_due_count, 'pity_primary_limit', v_pity_primary_limit,
    'pity_primary_count', v_pity_primary_count, 'pity_overflow_count', v_pity_overflow_count,
    'candidate_hash', v_candidate_hash, 'algorithm_version', v_lottery.draw_algorithm_version,
    'winners', v_winners, 'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username, 'drawn_at', v_lottery.drawn_at
  );
exception when others then
  v_error_message := left(concat(coalesce(sqlstate, 'DRAW_FAILED'), ' ', coalesce(sqlerrm, '开奖失败')), 500);
  update public.lotteries
     set draw_failed_at = now(), draw_failure_message = v_error_message,
         draw_attempted_at = coalesce(draw_attempted_at, now())
   where id = p_lottery_id;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'DRAW_FAILED'), 'message', v_error_message);
end;
$$;

revoke all on function public.execute_lottery_draw(uuid, boolean, boolean, text) from public;
grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to authenticated, service_role;

commit;
