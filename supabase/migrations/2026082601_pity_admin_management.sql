-- =============================================
-- 保底次数管理：管理员增减/批量操作
-- 1) RLS 策略补齐 (lottery_pity_progress/events 仅 enable RLS 无 policy)
-- 2) 扩展 lottery_pity_events.result 允许 admin 审计
-- 3) 新增 4 个 security definer RPC：
--    admin_adjust_pity(p_user_id, p_delta, p_reason)
--    admin_set_pity(p_user_id, p_value, p_reason)
--    admin_batch_adjust_pity(p_user_ids, p_delta, p_reason)
--    admin_batch_set_pity(p_user_ids, p_value, p_reason)
--    均做：admin 校验、threshold 截断、free 拒绝、upsert progress、写 audit 日志
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. RLS 策略：管理员可读 pity 进度与事件，用户可读自己的进度
-- ------------------------------------------------------------------

-- lottery_pity_progress: 仅有 enable RLS，需补充策略
drop policy if exists lottery_pity_progress_admin_select on public.lottery_pity_progress;
create policy lottery_pity_progress_admin_select on public.lottery_pity_progress
  for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_pity_progress_owner_select on public.lottery_pity_progress;
create policy lottery_pity_progress_owner_select on public.lottery_pity_progress
  for select to authenticated
  using (user_id = auth.uid());

-- 管理员可通过 RPC 写入，无需直接 all 策略，但为 panel 直查兼容，开放 admin all
drop policy if exists lottery_pity_progress_admin_all on public.lottery_pity_progress;
create policy lottery_pity_progress_admin_all on public.lottery_pity_progress
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists lottery_pity_events_admin_select on public.lottery_pity_events;
create policy lottery_pity_events_admin_select on public.lottery_pity_events
  for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_pity_events_owner_select on public.lottery_pity_events;
create policy lottery_pity_events_owner_select on public.lottery_pity_events
  for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.lottery_pity_progress to authenticated;
grant select, insert, update, delete on table public.lottery_pity_events to authenticated;
grant all on table public.lottery_pity_progress to service_role;
grant all on table public.lottery_pity_events to service_role;

-- ------------------------------------------------------------------
-- 2. 扩展 result 约束，允许管理员操作审计
-- ------------------------------------------------------------------
alter table public.lottery_pity_events
  drop constraint if exists lottery_pity_events_result_check;

alter table public.lottery_pity_events
  add constraint lottery_pity_events_result_check
  check (result in ('loss', 'random_win', 'pity_win', 'admin_adjust', 'admin_set', 'admin_batch_adjust', 'admin_batch_set'));

-- ------------------------------------------------------------------
-- 3. 辅助：获取阈值 + 校验管理员 + 计算新值
-- ------------------------------------------------------------------

-- 单用户增量调整
create or replace function public.admin_adjust_pity(
  p_user_id uuid,
  p_delta integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_tier text;
  v_threshold integer;
  v_old integer := 0;
  v_new integer;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_found boolean;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可调整保底次数';
  end if;

  if p_user_id is null then
    raise exception '用户 ID 不能为空';
  end if;

  if coalesce(p_delta, 0) = 0 then
    raise exception '调整值不能为 0';
  end if;

  -- 校验用户存在
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '用户不存在';
  end if;

  v_tier := coalesce(nullif(public.get_user_subscription_tier(p_user_id), ''), 'free');
  v_threshold := public.lottery_pity_threshold(v_tier);

  -- free / threshold 0 的用户不计保底，拒绝正向增加
  if v_threshold <= 0 and p_delta > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_ELIGIBLE',
      'message', format('该用户当前档位 %s 不计保底（阈值 0），无法增加保底次数', v_tier),
      'tier', v_tier,
      'threshold', v_threshold
    );
  end if;

  -- 取当前值并加锁
  select consecutive_losses into v_old
    from public.lottery_pity_progress
   where user_id = p_user_id
   for update;
  v_found := found;
  if not v_found then
    v_old := 0;
  end if;

  if v_threshold <= 0 then
    v_new := 0;
  else
    v_new := greatest(0, least(v_old + p_delta, v_threshold));
  end if;

  insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
  values (p_user_id, v_new, null, now())
  on conflict (user_id) do update set
    consecutive_losses = excluded.consecutive_losses,
    updated_at = excluded.updated_at;

  -- 审计：写入 lottery_pity_events (admin_adjust)
  -- 使用一个虚拟 lottery_id：若存在最近抽奖则关联，否则用 null -> 需允许 null，lottery_id 为 not null，这里改用 audit 日志
  -- 因此改为写入 lottery_admin_audit_logs
  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.adjust',
    jsonb_build_object(
      'user_id', p_user_id,
      'tier', v_tier,
      'threshold', v_threshold,
      'delta', p_delta,
      'before', v_old,
      'after', v_new,
      'reason', v_reason
    )
  );

  -- 同时写入 pity_events 需 lottery_id，跳过；仅在有 last_lottery_id 时写入
  -- 为可审计，额外尝试写入 pity_events 以 lottery_id = last_lottery_id 或随机
  -- 这里不强制写入 pity_events，避免外键约束

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'tier', v_tier,
    'threshold', v_threshold,
    'before', v_old,
    'after', v_new,
    'delta', p_delta
  );
exception when others then
  -- 将 NOT_ELIGIBLE 等业务返回转为异常时，保留原始 message
  if sqlstate = 'P0001' then
    raise;
  end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
end;
$$;

-- 单用户设值
create or replace function public.admin_set_pity(
  p_user_id uuid,
  p_value integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_tier text;
  v_threshold integer;
  v_old integer := 0;
  v_new integer;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_found boolean;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可设置保底次数';
  end if;

  if p_user_id is null then
    raise exception '用户 ID 不能为空';
  end if;

  if p_value is null or p_value < 0 then
    raise exception '保底次数必须为大于等于 0 的整数';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '用户不存在';
  end if;

  v_tier := coalesce(nullif(public.get_user_subscription_tier(p_user_id), ''), 'free');
  v_threshold := public.lottery_pity_threshold(v_tier);

  if v_threshold <= 0 and p_value > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_ELIGIBLE',
      'message', format('该用户当前档位 %s 不计保底（阈值 0），无法设置为 %s', v_tier, p_value),
      'tier', v_tier,
      'threshold', v_threshold
    );
  end if;

  select consecutive_losses into v_old
    from public.lottery_pity_progress
   where user_id = p_user_id
   for update;
  v_found := found;
  if not v_found then
    v_old := 0;
  end if;

  if v_threshold <= 0 then
    v_new := 0;
  else
    v_new := greatest(0, least(p_value, v_threshold));
  end if;

  insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
  values (p_user_id, v_new, null, now())
  on conflict (user_id) do update set
    consecutive_losses = excluded.consecutive_losses,
    updated_at = excluded.updated_at;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.set',
    jsonb_build_object(
      'user_id', p_user_id,
      'tier', v_tier,
      'threshold', v_threshold,
      'value', p_value,
      'before', v_old,
      'after', v_new,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'tier', v_tier,
    'threshold', v_threshold,
    'before', v_old,
    'after', v_new,
    'value', p_value
  );
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
end;
$$;

-- 批量增量调整（同一 delta 应用于所有选中用户）
create or replace function public.admin_batch_adjust_pity(
  p_user_ids uuid[],
  p_delta integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_targets uuid[];
  v_success integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_uid uuid;
  v_tier text;
  v_threshold integer;
  v_old integer;
  v_new integer;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可批量调整保底次数';
  end if;

  if coalesce(p_delta, 0) = 0 then
    raise exception '调整值不能为 0';
  end if;

  -- 空数组/NULL -> 全部非管理员用户（与积分发放一致）
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles
     where role <> 'admin';
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可调整保底的用户';
  end if;

  -- 串行化：避免并发抽奖与批量调整冲突
  perform pg_advisory_xact_lock(hashtext('lottery_pity_progress_v3'));

  foreach v_uid in array v_targets loop
    begin
      if not exists (select 1 from public.profiles where id = v_uid) then
        v_failed := v_failed + 1;
        v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', 'NOT_FOUND');
        continue;
      end if;

      v_tier := coalesce(nullif(public.get_user_subscription_tier(v_uid), ''), 'free');
      v_threshold := public.lottery_pity_threshold(v_tier);

      if v_threshold <= 0 and p_delta > 0 then
        v_skipped := v_skipped + 1;
        v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', 'NOT_ELIGIBLE', 'tier', v_tier);
        continue;
      end if;

      select consecutive_losses into v_old
        from public.lottery_pity_progress
       where user_id = v_uid
       for update;
      if not found then v_old := 0; end if;

      if v_threshold <= 0 then
        v_new := 0;
      else
        v_new := greatest(0, least(v_old + p_delta, v_threshold));
      end if;

      insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
      values (v_uid, v_new, null, now())
      on conflict (user_id) do update set
        consecutive_losses = excluded.consecutive_losses,
        updated_at = excluded.updated_at;

      v_success := v_success + 1;
      v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', true, 'before', v_old, 'after', v_new, 'tier', v_tier, 'threshold', v_threshold);
    exception when others then
      v_failed := v_failed + 1;
      v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
    end;
  end loop;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.batch_adjust',
    jsonb_build_object(
      'delta', p_delta,
      'reason', v_reason,
      'target_count', cardinality(v_targets),
      'success', v_success,
      'skipped', v_skipped,
      'failed', v_failed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'delta', p_delta,
    'target_count', cardinality(v_targets),
    'success', v_success,
    'skipped', v_skipped,
    'failed', v_failed,
    'details', v_details
  );
end;
$$;

-- 批量设值（同一 value 应用于所有选中用户）
create or replace function public.admin_batch_set_pity(
  p_user_ids uuid[],
  p_value integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_targets uuid[];
  v_success integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_uid uuid;
  v_tier text;
  v_threshold integer;
  v_old integer;
  v_new integer;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可批量设置保底次数';
  end if;

  if p_value is null or p_value < 0 then
    raise exception '保底次数必须为大于等于 0 的整数';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles
     where role <> 'admin';
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可设置保底的用户';
  end if;

  perform pg_advisory_xact_lock(hashtext('lottery_pity_progress_v3'));

  foreach v_uid in array v_targets loop
    begin
      if not exists (select 1 from public.profiles where id = v_uid) then
        v_failed := v_failed + 1;
        v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', 'NOT_FOUND');
        continue;
      end if;

      v_tier := coalesce(nullif(public.get_user_subscription_tier(v_uid), ''), 'free');
      v_threshold := public.lottery_pity_threshold(v_tier);

      if v_threshold <= 0 and p_value > 0 then
        v_skipped := v_skipped + 1;
        v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', 'NOT_ELIGIBLE', 'tier', v_tier);
        continue;
      end if;

      select consecutive_losses into v_old
        from public.lottery_pity_progress
       where user_id = v_uid
       for update;
      if not found then v_old := 0; end if;

      if v_threshold <= 0 then
        v_new := 0;
      else
        v_new := greatest(0, least(p_value, v_threshold));
      end if;

      insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
      values (v_uid, v_new, null, now())
      on conflict (user_id) do update set
        consecutive_losses = excluded.consecutive_losses,
        updated_at = excluded.updated_at;

      v_success := v_success + 1;
      v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', true, 'before', v_old, 'after', v_new, 'tier', v_tier, 'threshold', v_threshold);
    exception when others then
      v_failed := v_failed + 1;
      v_details := v_details || jsonb_build_object('user_id', v_uid, 'ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
    end;
  end loop;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.batch_set',
    jsonb_build_object(
      'value', p_value,
      'reason', v_reason,
      'target_count', cardinality(v_targets),
      'success', v_success,
      'skipped', v_skipped,
      'failed', v_failed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', p_value,
    'target_count', cardinality(v_targets),
    'success', v_success,
    'skipped', v_skipped,
    'failed', v_failed,
    'details', v_details
  );
end;
$$;

-- 授权
revoke all on function public.admin_adjust_pity(uuid, integer, text) from public;
grant execute on function public.admin_adjust_pity(uuid, integer, text) to authenticated;
grant execute on function public.admin_adjust_pity(uuid, integer, text) to service_role;

revoke all on function public.admin_set_pity(uuid, integer, text) from public;
grant execute on function public.admin_set_pity(uuid, integer, text) to authenticated;
grant execute on function public.admin_set_pity(uuid, integer, text) to service_role;

revoke all on function public.admin_batch_adjust_pity(uuid[], integer, text) from public;
grant execute on function public.admin_batch_adjust_pity(uuid[], integer, text) to authenticated;
grant execute on function public.admin_batch_adjust_pity(uuid[], integer, text) to service_role;

revoke all on function public.admin_batch_set_pity(uuid[], integer, text) from public;
grant execute on function public.admin_batch_set_pity(uuid[], integer, text) to authenticated;
grant execute on function public.admin_batch_set_pity(uuid[], integer, text) to service_role;

-- 便捷视图：管理员查询 pity 进度 + 用户 + 档位 + 阈值
-- security_invoker=true 使视图遵循调用者的 RLS（非管理员仅能看到自己的进度）
create or replace view public.lottery_pity_progress_admin
with (security_invoker = true) as
select
  p.user_id as id,
  p.user_id,
  coalesce(nullif(trim(pr.username), ''), '未命名用户') as username,
  pr.role,
  coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free') as tier_code,
  public.lottery_pity_threshold(coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free')) as threshold,
  p.consecutive_losses,
  case when public.lottery_pity_threshold(coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free')) > 0
       then greatest(0, public.lottery_pity_threshold(coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free')) - p.consecutive_losses)
       else 0 end as remaining_losses,
  case when public.lottery_pity_threshold(coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free')) > 0
        and p.consecutive_losses >= public.lottery_pity_threshold(coalesce(nullif(public.get_user_subscription_tier(p.user_id), ''), 'free'))
       then true else false end as is_due,
  p.last_lottery_id,
  p.updated_at
from public.lottery_pity_progress p
left join public.profiles pr on pr.id = p.user_id;

-- 同时需要展示未参与过但有订阅的用户：由前端通过 profiles + left join 查询，此视图仅覆盖已有进度的用户

grant select on public.lottery_pity_progress_admin to authenticated, service_role;

-- 若 lottery_admin_audit_logs 的 RLS 限制写入，需确保 security definer 可写入：已是 definer，無需策略变更

notify pgrst, 'reload schema';

commit;
