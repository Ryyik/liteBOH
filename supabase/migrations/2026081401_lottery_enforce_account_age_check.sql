-- ============================================================================
-- 2026081401: 抽奖账号年龄校验改为按需启用
-- 背景: 之前所有抽奖都强制进行"账号创建满 24 小时"校验，与 lotteries.enforce_account_age_check
--      字段的语义不一致。现在改为仅在 enforce_account_age_check = true 时才校验。
-- 变更:
--   1. 确保 lotteries.enforce_account_age_check 字段存在
--   2. get_home_lottery / get_community_lotteries 返回 enforce_account_age_check 字段
--   3. join_home_lottery / join_community_lottery 仅在启用时才进行 24 小时账号年龄校验
-- ============================================================================

-- ============================================
-- 1. 确保 enforce_account_age_check 字段存在
-- ============================================
alter table public.lotteries
  add column if not exists enforce_account_age_check boolean not null default false;

-- ============================================
-- 2. get_home_lottery: 返回 enforce_account_age_check
-- ============================================
create or replace function public.get_home_lottery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
begin
  select *
    into v_lottery
    from public.lotteries
   where is_home_visible = true
     and status in ('open', 'drawn')
   order by
     case when status = 'open' then 0 else 1 end,
     created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  if v_lottery.status = 'open'
     and v_lottery.draw_at is not null
     and v_lottery.draw_at <= now() then
    begin
      perform public.execute_lottery_draw(v_lottery.id, false, false, null);
    exception
      when others then
        perform public.record_lottery_auto_draw_failure(
          v_lottery.id,
          concat(coalesce(sqlstate, 'AUTO_DRAW_FAILED'), ' ', coalesce(sqlerrm, '自动开奖失败'))
        );
    end;

    select *
      into v_lottery
      from public.lotteries
     where id = v_lottery.id;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = v_lottery.id;

  if v_lottery.status = 'drawn' then
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'position', l.winner_position,
                 'entry_id', l.entry_id,
                 'user_id', l.user_id,
                 'username', l.username_snapshot
               )
               order by l.winner_position
             ) filter (where l.user_id is not null),
             '[]'::jsonb
           )
      into v_winners
      from public.lottery_draw_logs l
     where l.lottery_id = v_lottery.id
       and l.draw_no = (
         select max(draw_no)
           from public.lottery_draw_logs
          where lottery_id = v_lottery.id
       );
  end if;

  if auth.uid() is not null then
    select id, created_at
      into v_current_user_entry_id, v_current_user_entry_created_at
      from public.lottery_entries
     where lottery_id = v_lottery.id
       and user_id = auth.uid()
     limit 1;

    if v_current_user_entry_id is not null then
      select count(*)::integer
        into v_current_user_entry_number
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and created_at <= v_current_user_entry_created_at;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_lottery.id,
    'title', v_lottery.title,
    'description', v_lottery.description,
    'prize_title', v_lottery.prize_title,
    'prize_description', v_lottery.prize_description,
    'cover_image_url', v_lottery.cover_image_url,
    'status', v_lottery.status,
    'fulfillment_status', v_lottery.fulfillment_status,
    'max_entries', v_lottery.max_entries,
    'winner_count', v_lottery.winner_count,
    'entry_count', v_entry_count,
    'entry_deadline_at', v_lottery.entry_deadline_at,
    'draw_at', v_lottery.draw_at,
    'drawn_at', v_lottery.drawn_at,
    'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username,
    'winners', v_winners,
    'current_user_entry_id', v_current_user_entry_id,
    'current_user_entry_created_at', v_current_user_entry_created_at,
    'current_user_entry_number', v_current_user_entry_number,
    'enforce_account_age_check', coalesce(v_lottery.enforce_account_age_check, false),
    'created_at', v_lottery.created_at,
    'updated_at', v_lottery.updated_at
  );
end;
$$;

-- ============================================
-- 3. get_community_lotteries: 返回 enforce_account_age_check
-- ============================================
create or replace function public.get_community_lotteries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  for v_lottery in
    select *
      from public.lotteries
     where is_community_visible = true
       and status in ('open', 'drawn', 'closed')
     order by
       case when status = 'open' then 0 else 1 end,
       coalesce(draw_at, drawn_at, created_at) desc,
       created_at desc
  loop
    if v_lottery.status = 'open'
       and v_lottery.draw_at is not null
       and v_lottery.draw_at <= now() then
      begin
        perform public.execute_lottery_draw(v_lottery.id, false, false, null);
      exception
        when others then
          perform public.record_lottery_auto_draw_failure(
            v_lottery.id,
            concat(coalesce(sqlstate, 'AUTO_DRAW_FAILED'), ' ', coalesce(sqlerrm, '自动开奖失败'))
          );
      end;

      select *
        into v_lottery
        from public.lotteries
       where id = v_lottery.id;
    end if;

    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = v_lottery.id;

    v_current_user_entry_id := null;
    v_current_user_entry_created_at := null;
    v_current_user_entry_number := null;
    v_winners := '[]'::jsonb;

    if v_lottery.status = 'drawn' then
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'position', l.winner_position,
                   'entry_id', l.entry_id,
                   'user_id', l.user_id,
                   'username', l.username_snapshot
                 )
                 order by l.winner_position
               ) filter (where l.user_id is not null),
               '[]'::jsonb
             )
        into v_winners
        from public.lottery_draw_logs l
       where l.lottery_id = v_lottery.id
         and l.draw_no = (
           select max(draw_no)
             from public.lottery_draw_logs
            where lottery_id = v_lottery.id
         );
    end if;

    if auth.uid() is not null then
      select id, created_at
        into v_current_user_entry_id, v_current_user_entry_created_at
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and user_id = auth.uid()
       limit 1;

      if v_current_user_entry_id is not null then
        select count(*)::integer
          into v_current_user_entry_number
          from public.lottery_entries
         where lottery_id = v_lottery.id
           and created_at <= v_current_user_entry_created_at;
      end if;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_lottery.id,
      'title', v_lottery.title,
      'description', v_lottery.description,
      'prize_title', v_lottery.prize_title,
      'prize_description', v_lottery.prize_description,
      'cover_image_url', v_lottery.cover_image_url,
      'status', v_lottery.status,
      'fulfillment_status', v_lottery.fulfillment_status,
      'max_entries', v_lottery.max_entries,
      'winner_count', v_lottery.winner_count,
      'entry_count', v_entry_count,
      'entry_deadline_at', v_lottery.entry_deadline_at,
      'draw_at', v_lottery.draw_at,
      'drawn_at', v_lottery.drawn_at,
      'winner_user_id', v_lottery.winner_user_id,
      'winner_username', v_lottery.winner_username,
      'winners', v_winners,
      'current_user_entry_id', v_current_user_entry_id,
      'current_user_entry_created_at', v_current_user_entry_created_at,
      'current_user_entry_number', v_current_user_entry_number,
      'enforce_account_age_check', coalesce(v_lottery.enforce_account_age_check, false),
      'created_at', v_lottery.created_at,
      'updated_at', v_lottery.updated_at
    ));
  end loop;

  return v_items;
end;
$$;

-- ============================================
-- 4. join_home_lottery: 仅在 enforce_account_age_check=true 时校验 24 小时
-- ============================================
create or replace function public.join_home_lottery(p_lottery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_lottery public.lotteries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_result jsonb;
  v_profile_id uuid := null;
  v_account_created_at timestamp with time zone := null;
  v_recent_attempt_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录后再报名抽奖');
  end if;

  select count(*)
    into v_recent_attempt_count
    from public.lottery_join_attempts
   where user_id = v_user_id
     and created_at > now() - interval '1 minute';

  if v_recent_attempt_count >= 5 then
    perform public.record_lottery_join_attempt(null, v_user_id, 'RATE_LIMITED', '报名请求过于频繁，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', '报名请求过于频繁，请稍后再试');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found or not v_lottery.is_home_visible then
    perform public.record_lottery_join_attempt(null, v_user_id, 'NOT_FOUND', '抽奖不存在或暂未开放');
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在或暂未开放');
  end if;

  if v_lottery.status <> 'open' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'NOT_OPEN', '抽奖报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '抽奖报名已关闭');
  end if;

  if v_lottery.draw_at is not null and v_lottery.draw_at <= now() then
    v_draw_result := public.execute_lottery_draw(v_lottery.id, false, false, null);
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'DRAWN', '抽奖已到开奖时间，报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'DRAWN', 'message', '抽奖已到开奖时间，报名已关闭', 'draw_result', v_draw_result);
  end if;

  if v_lottery.entry_deadline_at is not null and v_lottery.entry_deadline_at <= now() then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ENTRY_CLOSED', '本次抽奖报名已截止');
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CLOSED', 'message', '本次抽奖报名已截止');
  end if;

  select *
    into v_entry
    from public.lottery_entries
   where lottery_id = p_lottery_id
     and user_id = v_user_id
   limit 1;

  if found then
    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = p_lottery_id;

    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '你已经报名过本次抽奖',
      'entry_id', v_entry.id,
      'entry_count', v_entry_count
    );
  end if;

  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id
   limit 1;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  -- 仅在启用账号年龄校验时才检查账号创建时间
  if coalesce(v_lottery.enforce_account_age_check, false) then
    select created_at
      into v_account_created_at
      from auth.users
     where id = v_user_id
     limit 1;

    if v_account_created_at is null then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
    end if;

    if v_account_created_at > now() - interval '24 hours' then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号创建满 24 小时后才可报名抽奖');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号创建满 24 小时后才可报名抽奖');
    end if;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '本次抽奖报名人数已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '本次抽奖报名人数已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, coalesce(v_username, 'BOH 用户'))
  returning *
   into v_entry;

  perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'JOINED', '报名成功');

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'message', '报名成功',
    'entry_id', v_entry.id,
    'entry_count', v_entry_count + 1,
    'entry_created_at', v_entry.created_at
  );
exception
  when unique_violation then
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object('ok', true, 'code', 'ALREADY_JOINED', 'message', '你已经报名过本次抽奖');
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'JOIN_FAILED'), 'message', coalesce(sqlerrm, '报名失败'));
end;
$$;

-- ============================================
-- 5. join_community_lottery: 仅在 enforce_account_age_check=true 时校验 24 小时
-- ============================================
create or replace function public.join_community_lottery(p_lottery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_lottery public.lotteries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_result jsonb;
  v_profile_id uuid := null;
  v_account_created_at timestamp with time zone := null;
  v_recent_attempt_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录后再报名抽奖');
  end if;

  select count(*)
    into v_recent_attempt_count
    from public.lottery_join_attempts
   where user_id = v_user_id
     and created_at > now() - interval '1 minute';

  if v_recent_attempt_count >= 5 then
    perform public.record_lottery_join_attempt(null, v_user_id, 'RATE_LIMITED', '报名请求过于频繁，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', '报名请求过于频繁，请稍后再试');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found or not v_lottery.is_community_visible then
    perform public.record_lottery_join_attempt(null, v_user_id, 'NOT_FOUND', '抽奖不存在或暂未开放');
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在或暂未开放');
  end if;

  if v_lottery.status <> 'open' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'NOT_OPEN', '抽奖报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '抽奖报名已关闭');
  end if;

  if v_lottery.draw_at is not null and v_lottery.draw_at <= now() then
    v_draw_result := public.execute_lottery_draw(v_lottery.id, false, false, null);
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'DRAWN', '抽奖已到开奖时间，报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'DRAWN', 'message', '抽奖已到开奖时间，报名已关闭', 'draw_result', v_draw_result);
  end if;

  if v_lottery.entry_deadline_at is not null and v_lottery.entry_deadline_at <= now() then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ENTRY_CLOSED', '本次抽奖报名已截止');
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CLOSED', 'message', '本次抽奖报名已截止');
  end if;

  select *
    into v_entry
    from public.lottery_entries
   where lottery_id = p_lottery_id
     and user_id = v_user_id
   limit 1;

  if found then
    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = p_lottery_id;

    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '你已经报名过本次抽奖',
      'entry_id', v_entry.id,
      'entry_count', v_entry_count
    );
  end if;

  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id
   limit 1;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  -- 仅在启用账号年龄校验时才检查账号创建时间
  if coalesce(v_lottery.enforce_account_age_check, false) then
    select created_at
      into v_account_created_at
      from auth.users
     where id = v_user_id
     limit 1;

    if v_account_created_at is null then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
    end if;

    if v_account_created_at > now() - interval '24 hours' then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号创建满 24 小时后才可报名抽奖');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号创建满 24 小时后才可报名抽奖');
    end if;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '本次抽奖报名人数已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '本次抽奖报名人数已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, coalesce(v_username, 'BOH 用户'))
  returning *
   into v_entry;

  perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'JOINED', '报名成功');

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'message', '报名成功',
    'entry_id', v_entry.id,
    'entry_count', v_entry_count + 1,
    'entry_created_at', v_entry.created_at
  );
exception
  when unique_violation then
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object('ok', true, 'code', 'ALREADY_JOINED', 'message', '你已经报名过本次抽奖');
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'JOIN_FAILED'), 'message', coalesce(sqlerrm, '报名失败'));
end;
$$;
