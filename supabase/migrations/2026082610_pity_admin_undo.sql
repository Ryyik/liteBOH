-- =============================================
-- 保底中心：撤销最近一次保底修改
-- 1) admin_batch_adjust_pity / admin_batch_set_pity 审计日志补充 per-user details
--    （含每个用户的 before/after，便于按用户撤销）
-- 2) 新增 admin_undo_pity：将用户保底次数恢复到最近一次未撤销修改前的值
--    - 单用户操作（pity.adjust/set）直接读 detail.user_id
--    - 批量操作（pity.batch_adjust/set）从 detail.details 数组匹配 user_id
--    - 撤销后标记该条记录/元素为 undone，避免重复撤销
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. 批量增量调整：审计日志补充 per-user details
-- ------------------------------------------------------------------
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
      'failed', v_failed,
      'details', v_details
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

revoke all on function public.admin_batch_adjust_pity(uuid[], integer, text) from public;
grant execute on function public.admin_batch_adjust_pity(uuid[], integer, text) to authenticated;
grant execute on function public.admin_batch_adjust_pity(uuid[], integer, text) to service_role;

-- ------------------------------------------------------------------
-- 2. 批量设值：审计日志补充 per-user details
-- ------------------------------------------------------------------
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
      'failed', v_failed,
      'details', v_details
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

revoke all on function public.admin_batch_set_pity(uuid[], integer, text) from public;
grant execute on function public.admin_batch_set_pity(uuid[], integer, text) to authenticated;
grant execute on function public.admin_batch_set_pity(uuid[], integer, text) to service_role;

-- ------------------------------------------------------------------
-- 3. 撤销最近一次保底修改
-- ------------------------------------------------------------------
create or replace function public.admin_undo_pity(
  p_user_id uuid,
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
  v_old integer := 0;
  v_before integer;
  v_target jsonb;
  v_log_id uuid;
  v_action text;
  v_is_batch boolean := false;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销保底修改';
  end if;

  if p_user_id is null then
    raise exception '用户 ID 不能为空';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '用户不存在';
  end if;

  -- 查找该用户最近一次「未撤销」的保底修改（单用户或批量）
  -- 注意：批量日志（含 details）需同时检查顶层 undone（admin_undo_pity_batch 只写顶层），
  --       否则批次撤销后单用户撤销仍会命中同一批日志，导致双重撤销。
  select l.id, l.action,
         case
           when l.detail ? 'user_id' then l.detail
           else (
             select d
               from jsonb_array_elements(l.detail->'details') d
              where d->>'user_id' = p_user_id
                and coalesce((d->>'ok')::boolean, false)
                and coalesce((d->>'undone')::boolean, false) = false
              limit 1
           )
         end as target_detail,
         (l.detail ? 'details') as is_batch
    into v_log_id, v_action, v_target, v_is_batch
    from public.lottery_admin_audit_logs l
   where l.action in ('pity.adjust', 'pity.set', 'pity.batch_adjust', 'pity.batch_set')
     and coalesce((l.detail->>'undone')::boolean, false) = false
     and (
       (l.detail ? 'user_id' and l.detail->>'user_id' = p_user_id)
       or
       (l.detail ? 'details' and exists (
         select 1 from jsonb_array_elements(l.detail->'details') d
          where d->>'user_id' = p_user_id
            and coalesce((d->>'ok')::boolean, false)
            and coalesce((d->>'undone')::boolean, false) = false
       ))
     )
   order by l.created_at desc, l.id desc
   limit 1;

  if v_target is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOTHING_TO_UNDO',
      'message', '该用户没有可撤销的保底修改记录'
    );
  end if;

  v_before := greatest(0, coalesce((v_target->>'before')::integer, 0));

  select consecutive_losses into v_old
    from public.lottery_pity_progress
   where user_id = p_user_id
   for update;
  if not found then v_old := 0; end if;

  -- 恢复到 before（精确回退，不按当前档位截断）
  insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
  values (p_user_id, v_before, null, now())
  on conflict (user_id) do update set
    consecutive_losses = excluded.consecutive_losses,
    updated_at = excluded.updated_at;

  -- 标记被撤销的日志为 undone（批量操作仅标记对应元素）
  if v_is_batch then
    update public.lottery_admin_audit_logs
       set detail = jsonb_set(
             detail,
             '{details}',
             (
               select coalesce(jsonb_agg(
                 case when d->>'user_id' = p_user_id
                      then d || jsonb_build_object('undone', true)
                      else d end
               ), '[]'::jsonb)
               from jsonb_array_elements(detail->'details') d
             )
           )
     where id = v_log_id;
  else
    update public.lottery_admin_audit_logs
       set detail = detail || jsonb_build_object('undone', true, 'undone_at', now())
     where id = v_log_id;
  end if;

  -- 撤销审计
  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.undo',
    jsonb_build_object(
      'user_id', p_user_id,
      'undo_from_log_id', v_log_id,
      'undo_from_action', v_action,
      'before', v_old,
      'after', v_before,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'before', v_old,
    'after', v_before,
    'undo_from', v_action
  );
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_undo_pity(uuid, text) from public;
grant execute on function public.admin_undo_pity(uuid, text) to authenticated;
grant execute on function public.admin_undo_pity(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
