-- 将 cycle_progress 改为 1-index：签到 1 周 → 1，4 周 → 4，而非 0~3 循环
-- 规则：
--   1) streak = 0 时 progress = 0
--   2) streak > 0 时 progress = (streak - 1) % 4 + 1
--   3) reward_completed_this_week 条件改为 cycle_progress = 4

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

revoke all on function public.calculate_weekly_checkin_status(uuid, integer, text) from public;
grant execute on function public.calculate_weekly_checkin_status(uuid, integer, text) to authenticated;
grant execute on function public.calculate_weekly_checkin_status(uuid, integer, text) to service_role;
