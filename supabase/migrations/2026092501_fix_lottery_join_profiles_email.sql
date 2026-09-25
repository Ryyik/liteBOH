-- ============================================================================
-- 2026092501_fix_lottery_join_profiles_email.sql
--
-- 症状：新建抽奖后所有用户点「立即报名」全部失败（前端提示「报名失败」，
--       lottery_join_attempts 里连续记录 result_code = 'JOIN_FAILED'）。
--
-- 根因：2026090803 迁移 drop 了 profiles.email（email 只存 auth.users），
--       但 2026081501 重建的 join_home_lottery / join_community_lottery
--       仍在取 username 快照时引用 profiles.email：
--           coalesce(nullif(trim(username), ''), email, 'BOH 用户')
--       → 运行期抛 42703 column "email" does not exist
--       → 被 `exception when others` 吞掉，统一降级成 JOIN_FAILED。
--       （8 月能报名是因为该列当时还在；9/8 之后两个抽奖入口就全挂了。）
--
-- 修复：
--   1. 新增 public.lottery_entry_profile_snapshot(uuid)：用户名快照口径单一真相源。
--      严格撤权，仅允许从其他 SECURITY DEFINER 函数内部以 owner 身份调用。
--   2. join_home_lottery / join_community_lottery 改走该快照函数。
--   3. `exception when others` 把 sqlstate 写进 lottery_join_attempts.message
--      （仅管理员可读），返回给客户端的文案不变。
-- ============================================================================

-- 1) 用户名快照单一真相源
--    profiles.username 是 NOT NULL，空串时统一兜底为 'BOH 用户'。
--    不存在的用户返回 0 行 → 调用方 v_profile_id 为 NULL → 继续走 PROFILE_NOT_FOUND（fail-closed）。
create or replace function public.lottery_entry_profile_snapshot(p_user_id uuid)
returns table(profile_id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id as profile_id,
         coalesce(nullif(trim(p.username), ''), 'BOH 用户') as username
    from public.profiles p
   where p.id = p_user_id;
$$;

-- 撤权：该函数以 DEFINER 身份读任意用户资料，绝不能暴露给客户端角色
revoke all on function public.lottery_entry_profile_snapshot(uuid) from public;
revoke all on function public.lottery_entry_profile_snapshot(uuid) from anon;
revoke all on function public.lottery_entry_profile_snapshot(uuid) from authenticated;

-- 2) 重建 join_home_lottery（其余逻辑与 2026081501 版本逐字一致）
CREATE OR REPLACE FUNCTION public.join_home_lottery(p_lottery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- H1 回归修复：先做 profiles 存在性校验（fail-closed），同时取 username 快照
  -- 用户名快照口径单一真相源：public.lottery_entry_profile_snapshot()
  -- （原实现直读 profiles.email，2026090803 已 drop 该列 → 42703 → 报名恒失败）
  select snapshot.profile_id,
         snapshot.username
    into v_profile_id,
         v_username
    from public.lottery_entry_profile_snapshot(v_user_id) as snapshot;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  if coalesce(v_lottery.enforce_account_age_check, false) then
    -- H1 回归修复：以 auth.users.created_at 为准（profiles.created_at 可能被回填/修复脚本影响），
    -- 缺失时直接拒绝（fail-closed），防止 profiles 行未生成时绕过 24 小时校验
    select created_at
      into v_account_created_at
      from auth.users
     where id = v_user_id;

    if v_account_created_at is null then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
    end if;

    if v_account_created_at > now() - interval '24 hours' then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号注册未满 24 小时，暂不可参与抽奖');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号注册未满 24 小时，暂不可参与抽奖');
    end if;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '抽奖名额已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '抽奖名额已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, v_username)
  returning * into v_entry;

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
    -- L4：返回给客户端的文案保持通用，不泄露数据库结构信息；
    -- 但把 sqlstate 落到审计表（仅管理员可读），避免再次出现「只能手工复现」的黑洞。
    perform public.record_lottery_join_attempt(
      p_lottery_id,
      v_user_id,
      'JOIN_FAILED',
      '报名失败，请稍后重试 [sqlstate=' || sqlstate || ']'
    );
    return jsonb_build_object('ok', false, 'code', 'JOIN_FAILED', 'message', '报名失败，请稍后重试');
end;
$function$;

-- 2) 重建 join_community_lottery（其余逻辑与 2026081501 版本逐字一致）
CREATE OR REPLACE FUNCTION public.join_community_lottery(p_lottery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- H1 回归修复：先做 profiles 存在性校验（fail-closed），同时取 username 快照
  -- 用户名快照口径单一真相源：public.lottery_entry_profile_snapshot()
  -- （原实现直读 profiles.email，2026090803 已 drop 该列 → 42703 → 报名恒失败）
  select snapshot.profile_id,
         snapshot.username
    into v_profile_id,
         v_username
    from public.lottery_entry_profile_snapshot(v_user_id) as snapshot;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  if coalesce(v_lottery.enforce_account_age_check, false) then
    -- H1 回归修复：以 auth.users.created_at 为准（profiles.created_at 可能被回填/修复脚本影响），
    -- 缺失时直接拒绝（fail-closed），防止 profiles 行未生成时绕过 24 小时校验
    select created_at
      into v_account_created_at
      from auth.users
     where id = v_user_id;

    if v_account_created_at is null then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
    end if;

    if v_account_created_at > now() - interval '24 hours' then
      perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号注册未满 24 小时，暂不可参与抽奖');
      return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号注册未满 24 小时，暂不可参与抽奖');
    end if;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '抽奖名额已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '抽奖名额已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, v_username)
  returning * into v_entry;

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
    -- L4：返回给客户端的文案保持通用，不泄露数据库结构信息；
    -- 但把 sqlstate 落到审计表（仅管理员可读），避免再次出现「只能手工复现」的黑洞。
    perform public.record_lottery_join_attempt(
      p_lottery_id,
      v_user_id,
      'JOIN_FAILED',
      '报名失败，请稍后重试 [sqlstate=' || sqlstate || ']'
    );
    return jsonb_build_object('ok', false, 'code', 'JOIN_FAILED', 'message', '报名失败，请稍后重试');
end;
$function$;


notify pgrst, 'reload schema';
