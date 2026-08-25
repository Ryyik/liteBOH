begin;

-- daily_limit/monthly_limit are counts (see the admin UI), not point totals.
create or replace function public.grant_post_publish_reward(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_author uuid;
  v_campaign record;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', timezone('Asia/Shanghai', v_now));
  v_month_start timestamptz := date_trunc('month', timezone('Asia/Shanghai', v_now));
  v_claim_count bigint := 0;
  v_awarded integer := 0;
  v_current_points integer := 0;
  v_row_count bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select author_id into v_post_author from public.posts where id = p_post_id;
  if v_post_author is null or v_post_author <> v_user_id then
    return jsonb_build_object('ok', false, 'message', 'POST_NOT_FOUND_OR_FORBIDDEN');
  end if;

  select * into v_campaign
  from public.post_reward_campaigns
  where status = 'active' and start_at <= v_now and end_at >= v_now
  order by start_at desc
  limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('ok', true, 'awarded', 0, 'message', 'NO_ACTIVE_CAMPAIGN');
  end if;

  insert into public.post_reward_claims (user_id, post_id, campaign_id, points_awarded)
  values (v_user_id, p_post_id, v_campaign.id, 0)
  on conflict (user_id, post_id) do nothing;
  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return jsonb_build_object('ok', true, 'awarded', 0, 'already_claimed', true, 'message', 'ALREADY_CLAIMED');
  end if;

  select count(*) into v_claim_count
  from public.post_reward_claims c
  where c.campaign_id = v_campaign.id and c.user_id = v_user_id and c.created_at >= v_month_start;
  if v_campaign.monthly_limit is not null and v_campaign.monthly_limit > 0
     and v_claim_count > v_campaign.monthly_limit then
    delete from public.post_reward_claims where user_id = v_user_id and post_id = p_post_id;
    return jsonb_build_object('ok', true, 'awarded', 0, 'skipped', true, 'reason', 'MONTHLY_LIMIT', 'message', 'MONTHLY_LIMIT_REACHED');
  end if;

  select count(*) into v_claim_count
  from public.post_reward_claims c
  where c.campaign_id = v_campaign.id and c.user_id = v_user_id and c.created_at >= v_today_start;
  if v_campaign.daily_limit is not null and v_campaign.daily_limit > 0
     and v_claim_count > v_campaign.daily_limit then
    delete from public.post_reward_claims where user_id = v_user_id and post_id = p_post_id;
    return jsonb_build_object('ok', true, 'awarded', 0, 'skipped', true, 'reason', 'DAILY_LIMIT', 'message', 'DAILY_LIMIT_REACHED');
  end if;

  v_awarded := v_campaign.points_per_post;
  update public.profiles set points = coalesce(points, 0) + v_awarded where id = v_user_id;
  update public.post_reward_claims set points_awarded = v_awarded where user_id = v_user_id and post_id = p_post_id;
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
  values (v_user_id, v_awarded, (select points from public.profiles where id = v_user_id), 'forum_post', '发帖有奖：' || coalesce(v_campaign.title, ''));
  select coalesce(points, 0) into v_current_points from public.profiles where id = v_user_id;

  return jsonb_build_object('ok', true, 'awarded', v_awarded, 'current_points', v_current_points,
    'campaign_id', v_campaign.id, 'campaign_title', v_campaign.title, 'message', 'REWARDED');
end;
$$;

revoke all on function public.grant_post_publish_reward(uuid) from public;
grant execute on function public.grant_post_publish_reward(uuid) to authenticated;
grant execute on function public.grant_post_publish_reward(uuid) to service_role;

commit;
