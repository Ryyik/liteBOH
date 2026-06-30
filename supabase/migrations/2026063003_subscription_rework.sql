-- 订阅体系重构：新 tier + 周签到每周奖励

-- ============================================
-- 1. AI 配额配置更改为新 tier 名称
-- ============================================
insert into public.ai_quota_config (tier, daily_limit) values
  ('plus',  200),
  ('pro',   200),
  ('max',   500),
  ('ultra', -1)
on conflict (tier) do update set daily_limit = excluded.daily_limit;

-- ============================================
-- 2. 周签到改为每周奖励 5 积分
--    (原逻辑：连续 4 周奖励 5 分 → 每周签到即奖 5 分)
-- ============================================
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
  v_row_count bigint;
  v_streak integer := 0;
  v_points_awarded integer := 0;
  v_current_points integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  insert into public.forum_weekly_checkins (user_id, week_start_date)
  values (v_user_id, v_current_week_start)
  on conflict (user_id, week_start_date) do nothing;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'ALREADY_SIGNED_THIS_WEEK',
      'already_signed', true
    );
  end if;

  -- 每周签到直接奖励 5 积分，不再需要连续 4 周
  v_points_awarded := 5;

  update public.profiles
     set points = coalesce(points, 0) + v_points_awarded
   where id = v_user_id;

  select coalesce(points, 0) into v_current_points
    from public.profiles
   where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'SIGNED_SUCCESS',
    'has_signed_this_week', true,
    'streak_total', 1,
    'current_streak', 1,
    'cycle_progress', 1,
    'cycle_size', 1,
    'reward_completed_this_week', true,
    'points_awarded', v_points_awarded,
    'current_points', v_current_points,
    'next_reward_in', 1,
    'current_week_start', v_current_week_start
  );
end;
$$;

grant execute on function public.submit_weekly_checkin() to authenticated;
grant execute on function public.submit_weekly_checkin() to service_role;

-- 同步更新状态查询 RPC
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
  v_has_signed boolean;
  v_current_points integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select exists (
    select 1 from public.forum_weekly_checkins
    where user_id = v_user_id and week_start_date = v_current_week_start
  ) into v_has_signed;

  select coalesce(points, 0) into v_current_points
    from public.profiles
   where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'has_signed_this_week', v_has_signed,
    'streak_total', case when v_has_signed then 1 else 0 end,
    'current_streak', case when v_has_signed then 1 else 0 end,
    'cycle_progress', case when v_has_signed then 1 else 0 end,
    'cycle_size', 1,
    'reward_completed_this_week', v_has_signed,
    'points_awarded', case when v_has_signed then 5 else 0 end,
    'current_points', v_current_points,
    'next_reward_in', 1,
    'current_week_start', v_current_week_start
  );
end;
$$;

grant execute on function public.get_weekly_checkin_status() to authenticated;
grant execute on function public.get_weekly_checkin_status() to service_role;
