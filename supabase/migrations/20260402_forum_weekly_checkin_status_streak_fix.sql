-- 修复周签到状态在“本周尚未签到”时连续进度被重置为 0 的问题。
-- 规则：
-- 1) 若本周已签到，从本周开始向前计算连续周数；
-- 2) 若本周未签到，从上周开始向前计算连续周数；
-- 3) 这样可以在新的一周内保留上周截止时的连签进度展示。

create or replace function public.get_weekly_checkin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_local timestamp := timezone('Asia/Shanghai', now());
  v_current_week_start date := date_trunc('week', v_now_local)::date;
  v_target_week date;
  v_anchor_week date;
  v_has_signed boolean := false;
  v_streak integer := 0;
  v_next_reward integer := 4;
  v_current_points integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'NOT_AUTHENTICATED'
    );
  end if;

  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = v_user_id;

  select exists (
    select 1
      from public.forum_weekly_checkins
     where user_id = v_user_id
       and week_start_date = v_current_week_start
  ) into v_has_signed;

  if v_has_signed then
    v_anchor_week := v_current_week_start;
  else
    v_anchor_week := (v_current_week_start - interval '1 week')::date;
  end if;

  v_target_week := v_anchor_week;
  loop
    exit when v_target_week is null;
    exit when not exists (
      select 1
        from public.forum_weekly_checkins
       where user_id = v_user_id
         and week_start_date = v_target_week
    );

    v_streak := v_streak + 1;
    v_target_week := (v_target_week - interval '1 week')::date;
  end loop;

  v_next_reward := 4 - mod(v_streak, 4);
  if v_next_reward = 0 then
    v_next_reward := 4;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_signed', v_has_signed,
    'has_signed_this_week', v_has_signed,
    'current_streak', v_streak,
    'points_awarded', 0,
    'current_points', v_current_points,
    'next_reward_in', v_next_reward,
    'current_week_start', v_current_week_start,
    'message', 'OK'
  );
end;
$$;

