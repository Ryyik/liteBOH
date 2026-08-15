-- ============================================================================
-- 2026081501: 安全加固修复
-- 修复项:
--   H1: cleanup_old_records / cleanup_lottery_scheduler_logs 缺少管理员校验和 revoke public
--   H2: admin_reset_all_ai_quotas 权限逻辑写反导致 service_role 被拒
--   L1: touch_lottery_operation_updated_at 缺少 set search_path
--   L2: ai_token_reservations 表启用 RLS 但无策略
--   L3: get_ai_mode_token_multiplier 缺少 SECURITY DEFINER
--   L4: join_home_lottery / join_community_lottery 返回原始 SQL 错误
--   L5: bohai_model_configs_admin_select 策略未限定 to authenticated
--   L6: reserve_ai_token_quota 缺少输入校验（user_id 和 ip_address 均为 NULL）
--   M9: lottery_winner_fulfillments 缺少用户侧 SELECT 策略
--   H1(回归修复): join_home/community_lottery 重建时回退了 2026081401 的账号年龄
--     校验加固——恢复 auth.users.created_at 依据 + fail-closed + PROFILE_NOT_FOUND
--     + username 兜底 + max_entries=0 语义（0 = 名额已满）
-- ============================================================================

begin;

-- ============================================
-- H1: 修复 cleanup_old_records 和 cleanup_lottery_scheduler_logs 权限漏洞
-- ============================================

create or replace function public.cleanup_lottery_scheduler_logs(p_retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    raise exception '仅管理员可执行清理操作' using errcode = '42501';
  end if;

  if p_retention_days < 1 then
    p_retention_days := 30;
  end if;

  delete from public.lottery_scheduler_logs
  where created_at < now() - (p_retention_days || ' days')::interval
    and created_at < now() - interval '7 days';

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'retention_days', p_retention_days
  );
end;
$$;

create or replace function public.cleanup_old_records(p_table text, p_retention_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_allowed_tables text[] := array['notifications', 'lottery_scheduler_logs'];
  v_table_exists boolean;
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    raise exception '仅管理员可执行清理操作' using errcode = '42501';
  end if;

  if not (p_table = any(v_allowed_tables)) then
    return jsonb_build_object('success', false, 'error', 'Table not allowed for cleanup: ' || p_table);
  end if;

  if p_retention_days < 7 then
    p_retention_days := 7;
  end if;

  execute format(
    'select exists (select 1 from information_schema.tables where table_schema = ''public'' and table_name = %L)',
    p_table
  ) into v_table_exists;

  if not v_table_exists then
    return jsonb_build_object('success', false, 'error', 'Table does not exist: ' || p_table);
  end if;

  execute format(
    'with deleted as (
      delete from public.%I
      where created_at < now() - (%L || '' days'')::interval
        and created_at < now() - interval ''7 days''
      returning 1
    ) select count(*) from deleted',
    p_table, p_retention_days
  ) into v_deleted_count;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'table', p_table,
    'retention_days', p_retention_days
  );
end;
$$;

revoke all on function public.cleanup_lottery_scheduler_logs(integer) from public;
revoke all on function public.cleanup_old_records(text, integer) from public;
grant execute on function public.cleanup_lottery_scheduler_logs(integer) to authenticated, service_role;
grant execute on function public.cleanup_old_records(text, integer) to authenticated, service_role;

-- ============================================
-- H2: 修复 admin_reset_all_ai_quotas 权限逻辑
-- 原条件: if auth.uid() is null or not current_user_is_admin()
--   -> service_role (auth.uid()=null) 被错误拒绝
-- 修复为: if auth.uid() is not null and not current_user_is_admin()
--   -> service_role (auth.uid()=null) 通过, 非 admin 用户被拒
-- ============================================

create or replace function public.admin_reset_all_ai_quotas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_logs integer := 0;
  v_reservations integer := 0;
  v_web_logs integer := 0;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    raise exception '仅管理员可重置 AI 额度' using errcode = '42501';
  end if;

  delete from public.ai_token_reservations where created_at >= v_today_start;
  get diagnostics v_reservations = row_count;
  delete from public.ai_quota_log where created_at >= v_today_start;
  get diagnostics v_token_logs = row_count;
  delete from public.ai_web_search_log where created_at >= v_today_start;
  get diagnostics v_web_logs = row_count;

  return jsonb_build_object(
    'ok', true,
    'tokenLogsDeleted', v_token_logs,
    'reservationsDeleted', v_reservations,
    'webSearchLogsDeleted', v_web_logs,
    'resetAt', now()
  );
end;
$$;

revoke all on function public.admin_reset_all_ai_quotas() from public;
grant execute on function public.admin_reset_all_ai_quotas() to authenticated, service_role;

-- ============================================
-- L1: 修复 touch_lottery_operation_updated_at 缺少 set search_path
-- ============================================

create or replace function public.touch_lottery_operation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================
-- L2: 为 ai_token_reservations 添加用户侧 RLS 策略
-- 仅允许用户查询自己的预留记录，写操作仍通过 service_role RPC
-- ============================================

drop policy if exists ai_token_reservations_owner_select on public.ai_token_reservations;
create policy ai_token_reservations_owner_select on public.ai_token_reservations
  for select to authenticated
  using (user_id = auth.uid());

-- ============================================
-- L3: 为 get_ai_mode_token_multiplier 添加 SECURITY DEFINER
-- 该函数读取 bohai_model_configs（仅管理员 SELECT），
-- 若未来授予 authenticated 调用，非 admin 会因 RLS 返回空集导致 multiplier 回退
-- ============================================

create or replace function public.get_ai_mode_token_multiplier(p_mode text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0.1, coalesce((
    select config.quota_multiplier
      from public.bohai_model_configs as config
     where lower(trim(config.mode_id)) = lower(trim(coalesce(p_mode, '')))
     order by config.updated_at desc
     limit 1
  ), case lower(trim(coalesce(p_mode, '')))
    when 'pro' then 2 when 'max' then 3 when 'ultra' then 4 else 1
  end));
$$;

revoke all on function public.get_ai_mode_token_multiplier(text) from public;
grant execute on function public.get_ai_mode_token_multiplier(text) to service_role;

-- ============================================
-- L4: 修复 join_home_lottery / join_community_lottery 返回原始 SQL 错误
-- 将 sqlerrm 替换为通用提示，避免泄露数据库内部结构信息
-- ============================================

-- join_home_lottery 的异常处理修复
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

  -- H1 回归修复：先做 profiles 存在性校验（fail-closed），同时取 username 快照
  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id;

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
    -- L4 修复：不返回原始 sqlerrm，避免泄露数据库结构信息
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'JOIN_FAILED', '报名失败，请稍后重试');
    return jsonb_build_object('ok', false, 'code', 'JOIN_FAILED', 'message', '报名失败，请稍后重试');
end;
$$;

-- join_community_lottery 的异常处理修复
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

  -- H1 回归修复：先做 profiles 存在性校验（fail-closed），同时取 username 快照
  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id;

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
    -- L4 修复：不返回原始 sqlerrm，避免泄露数据库结构信息
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'JOIN_FAILED', '报名失败，请稍后重试');
    return jsonb_build_object('ok', false, 'code', 'JOIN_FAILED', 'message', '报名失败，请稍后重试');
end;
$$;

-- ============================================
-- L5: bohai_model_configs_admin_select 策略限定 to authenticated
-- ============================================

drop policy if exists bohai_model_configs_admin_select on public.bohai_model_configs;
create policy bohai_model_configs_admin_select
  on public.bohai_model_configs
  for select to authenticated
  using (public.current_user_is_admin());

-- ============================================
-- L6: reserve_ai_token_quota 添加输入校验
-- 当 user_id 和 ip_address 均为 NULL 时拒绝执行，避免共享配额池
-- ============================================

create or replace function public.reserve_ai_token_quota(
  p_reservation_id uuid,
  p_user_id uuid,
  p_ip_address text,
  p_since timestamptz,
  p_token_limit bigint,
  p_reserved_tokens integer
)
returns table(allowed boolean, used_tokens bigint, remaining_tokens bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity text;
  v_used bigint := 0;
  v_pending bigint := 0;
  v_required integer := greatest(0, coalesce(p_reserved_tokens, 0));
begin
  -- L6 修复：校验至少有一个身份标识
  if p_user_id is null and p_ip_address is null then
    raise exception 'Either user_id or ip_address must be provided';
  end if;

  v_identity := coalesce(p_user_id::text, 'ip:' || coalesce(p_ip_address, 'unknown'));

  perform pg_advisory_xact_lock(hashtext('boh-ai-token:' || v_identity));

  update public.ai_token_reservations
     set status = 'released', settled_at = now()
   where status = 'pending'
     and created_at < now() - interval '10 minutes';

  select coalesce(sum(billed_tokens), 0)::bigint
    into v_used
    from public.ai_quota_log
   where created_at >= p_since
     and ((p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and p_ip_address is not null and ip_address = p_ip_address));

  select coalesce(sum(reserved_tokens), 0)::bigint
    into v_pending
    from public.ai_token_reservations
   where status = 'pending'
     and created_at >= p_since
     and ((p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and p_ip_address is not null and ip_address = p_ip_address));

  if p_token_limit <> -1 and v_used + v_pending + v_required > p_token_limit then
    return query select false, v_used, greatest(0, p_token_limit - v_used - v_pending);
    return;
  end if;

  insert into public.ai_token_reservations (id, user_id, ip_address, reserved_tokens)
  values (p_reservation_id, p_user_id, p_ip_address, v_required)
  on conflict (id) do nothing;

  return query
  select true,
         v_used,
         case
           when p_token_limit = -1 then -1
           else greatest(0, p_token_limit - v_used - v_pending - v_required)
         end;
end;
$$;

revoke all on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) from public;
grant execute on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) to service_role;

-- ============================================
-- M9: 为 lottery_winner_fulfillments 添加用户侧 SELECT 策略
-- 中奖用户可查看自己的奖品履约状态
-- ============================================

drop policy if exists lottery_winner_fulfillments_owner_select on public.lottery_winner_fulfillments;
create policy lottery_winner_fulfillments_owner_select on public.lottery_winner_fulfillments
  for select to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';

commit;
