-- ---------------------------------------------------------------------------
-- 管理员代报名（帮人报名）
--
-- 为什么不能直接 insert into lottery_entries：
--   报名只有一个入口 join_community_lottery / join_home_lottery（SECURITY DEFINER），
--   它背后压着一整套约束：5 次/分钟限流、抽奖必须 open、到开奖时间自动触发开奖、
--   entry_deadline_at 截止、同用户去重、max_entries 名额、账号满 24 小时、
--   用户名快照、每次尝试写 lottery_join_attempts 审计。
--   直接插表会把这些全部绕过 —— 名额超卖、重复报名、给已开奖的抽奖补人，
--   而且事后没有任何审计痕迹。所以代报名必须是**一条复用同一套规则的 RPC**。
--
-- 与用户自助报名的差异（刻意放开的两条）：
--   1. 不做 5 次/分钟限流 —— 那是防刷，管理员点一次是一次。
--   2. 不做「账号注册满 24 小时」校验 —— 帮人报名的典型场景恰恰是
--      「新人报名失败」，这条规则正是他要绕过的。
--
-- 与用户自助报名保持一致的部分：
--   · 同一用户去重（unique_violation 兜底，返回 ALREADY_JOINED 而不是报错）
--   · 用户名快照口径单一真源 lottery_entry_profile_snapshot()
--   · 每次操作写 lottery_join_attempts（code = ADMIN_JOINED）
--
-- 强制加人：抽奖非 open / 已过报名截止 / 已过计划开奖 / 名额已满 时，
--   必须 p_force = true **且**填了原因，否则拒绝。强制成功会额外写 admin_audit_logs
--   （action = grant），把「谁给谁加的、当时卡在哪几条规则、原因是什么」全部留痕。
-- ---------------------------------------------------------------------------

create or replace function public.admin_join_lottery(
  p_lottery_id uuid,
  p_user_id uuid,
  p_reason text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_lottery public.lotteries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_profile_id uuid := null;
  v_username text := '';
  v_entry_count integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_blocked text[] := '{}';
  v_forced boolean := false;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可代报名');
  end if;

  if p_lottery_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGS', 'message', '抽奖与用户都必须选择');
  end if;

  -- for update：与用户自助报名抢同一把行锁，避免「查名额 → 插入」之间被并发插队
  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在');
  end if;

  -- 去重放在最前面：重复点一次不该报错，直接告诉他「已经在名单里了」
  select *
    into v_entry
    from public.lottery_entries
   where lottery_id = p_lottery_id
     and user_id = p_user_id
   limit 1;

  if found then
    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = p_lottery_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '该用户已在报名名单中',
      'entry_id', v_entry.id,
      'entry_count', v_entry_count
    );
  end if;

  -- 用户名快照：与 join_community_lottery 同一真源，不要另抄一份
  select snapshot.profile_id,
         snapshot.username
    into v_profile_id,
         v_username
    from public.lottery_entry_profile_snapshot(p_user_id) as snapshot;

  if v_profile_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'PROFILE_NOT_FOUND',
      'message', '该用户还没有站点资料（profiles 无记录），无法加入名单'
    );
  end if;

  -- 收集「需要强制」的原因，而不是遇到第一条就返回 —— 管理员要一次看到全部卡点
  if v_lottery.status <> 'open' then
    v_blocked := array_append(v_blocked, '抽奖状态为 ' || coalesce(v_lottery.status, '未知'));
  end if;

  if v_lottery.draw_at is not null and v_lottery.draw_at <= now() then
    v_blocked := array_append(v_blocked, '已过计划开奖时间');
  end if;

  if v_lottery.entry_deadline_at is not null and v_lottery.entry_deadline_at <= now() then
    v_blocked := array_append(v_blocked, '已过报名截止时间');
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    v_blocked := array_append(
      v_blocked,
      '名额已满（' || v_entry_count || '/' || v_lottery.max_entries || '）'
    );
  end if;

  if array_length(v_blocked, 1) > 0 then
    if not coalesce(p_force, false) then
      return jsonb_build_object(
        'ok', false,
        'code', 'BLOCKED',
        'message', '需要强制加人：' || array_to_string(v_blocked, '；'),
        'blocked_reasons', to_jsonb(v_blocked)
      );
    end if;

    if v_reason is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'REASON_REQUIRED',
        'message', '强制加人必须填写原因（会写进管理员审计日志）',
        'blocked_reasons', to_jsonb(v_blocked)
      );
    end if;

    v_forced := true;
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, p_user_id, v_username)
  returning * into v_entry;

  perform public.record_lottery_join_attempt(
    p_lottery_id,
    p_user_id,
    'ADMIN_JOINED',
    left('管理员代报名' || coalesce('：' || v_reason, ''), 200)
  );

  -- 审计与报名同事务：审计写不进去就整笔回滚（异常处理块会撤销本块所有改动），
  -- 不允许出现「人加进去了但查不到是谁加的」。
  perform public.log_admin_action(
    'grant',
    'lottery_entries',
    v_entry.id::text,
    jsonb_build_object(
      'lottery_id', p_lottery_id,
      'lottery_title', v_lottery.title,
      'user_id', p_user_id,
      'username', v_username,
      'forced', v_forced,
      'blocked_reasons', to_jsonb(v_blocked),
      'entry_count_before', v_entry_count
    ),
    jsonb_build_object('reason', v_reason, 'source', 'admin_join_lottery')
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'message', case when v_forced then '已强制加入报名名单' else '已加入报名名单' end,
    'entry_id', v_entry.id,
    'entry_count', v_entry_count + 1,
    'entry_created_at', v_entry.created_at,
    'forced', v_forced,
    'blocked_reasons', to_jsonb(v_blocked)
  );
exception
  when unique_violation then
    -- 并发下两次点击都过了上面的去重检查，靠唯一约束兜底
    perform public.record_lottery_join_attempt(
      p_lottery_id,
      p_user_id,
      'ADMIN_JOINED',
      '管理员代报名（并发去重命中唯一约束）'
    );
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '该用户已在报名名单中'
    );
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', 'JOIN_FAILED',
      'message', '代报名失败，请稍后重试',
      'sqlstate', sqlstate
    );
end;
$function$;

comment on function public.admin_join_lottery(uuid, uuid, text, boolean) is
  '管理员代报名：复用 join_*_lottery 的去重/名额/快照口径，放开限流与账号 24h 校验；'
  '抽奖已截止或名额已满时必须 p_force + 原因，并写 admin_audit_logs（action=grant）。';

-- 收权：新函数一律显式收，别指望 alter default privileges（本项目对它无效，
-- 见 check-anon-execute.mjs 顶部说明）。只放给 authenticated —— 函数内部还有
-- current_user_is_admin() 兜底，两道门。
revoke all on function public.admin_join_lottery(uuid, uuid, text, boolean) from public;
revoke all on function public.admin_join_lottery(uuid, uuid, text, boolean) from anon;
revoke all on function public.admin_join_lottery(uuid, uuid, text, boolean) from authenticated;
grant execute on function public.admin_join_lottery(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.admin_join_lottery(uuid, uuid, text, boolean) to service_role;

-- 回滚：
--   drop function if exists public.admin_join_lottery(uuid, uuid, text, boolean);
