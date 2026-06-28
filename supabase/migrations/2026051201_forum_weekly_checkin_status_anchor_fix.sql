-- Optimize weekly check-in state calculation.
-- The database now returns explicit display fields so the frontend does not
-- need to infer the reward cycle from the total streak.

create or replace function public.calculate_weekly_checkin_status(
  p_user_id uuid,
  p_points_awarded integer default 0,
  p_message text default 'OK'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_local timestamp := timezone('Asia/Shanghai', now());
  v_current_week_start date := date_trunc('week', v_now_local)::date;
  v_target_week date;
  v_anchor_week date;
  v_has_signed boolean := false;
  v_streak integer := 0;
  v_cycle_size integer := 4;
  v_cycle_progress integer := 0;
  v_next_reward integer := 4;
  v_current_points integer := 0;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = p_user_id;

  select exists (
    select 1
      from public.forum_weekly_checkins
     where user_id = p_user_id
       and week_start_date = v_current_week_start
  ) into v_has_signed;

  if v_has_signed then
    v_anchor_week := v_current_week_start;
  else
    v_anchor_week := (v_current_week_start - interval '1 week')::date;
  end if;

  v_target_week := v_anchor_week;
  loop
    exit when not exists (
      select 1
        from public.forum_weekly_checkins
       where user_id = p_user_id
         and week_start_date = v_target_week
    );

    v_streak := v_streak + 1;
    v_target_week := (v_target_week - interval '1 week')::date;
  end loop;

  v_cycle_progress := case when v_streak = 0 then 0 else mod(v_streak - 1, v_cycle_size) + 1 end;
  v_next_reward := v_cycle_size - v_cycle_progress;
  if v_next_reward = 0 then
    v_next_reward := v_cycle_size;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_signed', v_has_signed,
    'has_signed_this_week', v_has_signed,
    'streak_total', v_streak,
    'current_streak', v_streak,
    'cycle_progress', v_cycle_progress,
    'cycle_size', v_cycle_size,
    'reward_completed_this_week', v_has_signed and v_streak > 0 and v_cycle_progress = v_cycle_size,
    'points_awarded', greatest(0, coalesce(p_points_awarded, 0)),
    'current_points', v_current_points,
    'next_reward_in', v_next_reward,
    'current_week_start', v_current_week_start,
    'message', coalesce(p_message, 'OK')
  );
end;
$$;

create or replace function public.get_weekly_checkin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return public.calculate_weekly_checkin_status(v_user_id, 0, 'OK');
end;
$$;

create or replace function public.submit_weekly_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_local timestamp := timezone('Asia/Shanghai', now());
  v_current_week_start date := date_trunc('week', v_now_local)::date;
  v_status jsonb;
  v_streak integer := 0;
  v_points_awarded integer := 0;
  v_inserted_rows integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  insert into public.forum_weekly_checkins (user_id, week_start_date, signed_at)
  values (v_user_id, v_current_week_start, now())
  on conflict (user_id, week_start_date) do nothing;

  get diagnostics v_inserted_rows = row_count;

  if v_inserted_rows = 0 then
    return public.calculate_weekly_checkin_status(v_user_id, 0, 'ALREADY_SIGNED_THIS_WEEK')
      || jsonb_build_object(
        'already_signed', true,
        'has_signed_this_week', true,
        'points_awarded', 0
      );
  end if;

  v_status := public.calculate_weekly_checkin_status(v_user_id, 0, 'CHECKIN_SUCCESS');
  v_streak := coalesce((v_status ->> 'streak_total')::integer, 0);

  if v_streak > 0 and mod(v_streak, 4) = 0 then
    v_points_awarded := 5;

    update public.profiles
       set points = coalesce(points, 0) + v_points_awarded
     where id = v_user_id;
  end if;

  return public.calculate_weekly_checkin_status(v_user_id, v_points_awarded, 'CHECKIN_SUCCESS')
    || jsonb_build_object(
      'already_signed', false,
      'has_signed_this_week', true
    );
end;
$$;

revoke all on function public.calculate_weekly_checkin_status(uuid, integer, text) from public;
revoke all on function public.get_weekly_checkin_status() from public;
revoke all on function public.submit_weekly_checkin() from public;

grant execute on function public.get_weekly_checkin_status() to authenticated;
grant execute on function public.get_weekly_checkin_status() to service_role;
grant execute on function public.submit_weekly_checkin() to authenticated;
grant execute on function public.submit_weekly_checkin() to service_role;
