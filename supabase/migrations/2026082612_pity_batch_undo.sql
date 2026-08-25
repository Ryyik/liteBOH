-- =============================================
-- 保底中心：按批次撤销（操作批次面板一键撤销）
-- 1) admin_list_pity_batch_ops 补充 undone 字段（标记批次是否已撤销）
-- 2) 新增 admin_undo_pity_batch：将批次内所有 ok=true 且未撤销的用户
--    恢复到操作前的值，并标记整批为已撤销
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. 批次列表补充 undone 字段
-- ------------------------------------------------------------------
create or replace function public.admin_list_pity_batch_ops(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_total integer;
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看保底操作记录';
  end if;

  v_limit := least(greatest(p_limit, 1), 100);

  select count(*) into v_total
    from public.lottery_admin_audit_logs l
   where l.action in ('pity.batch_adjust', 'pity.batch_set');

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', l.id,
      'action', l.action,
      'created_at', l.created_at,
      'delta', (l.detail->>'delta')::integer,
      'value', (l.detail->>'value')::integer,
      'reason', l.detail->>'reason',
      'target_count', (l.detail->>'target_count')::integer,
      'success', (l.detail->>'success')::integer,
      'skipped', (l.detail->>'skipped')::integer,
      'failed', (l.detail->>'failed')::integer,
      'undone', coalesce((l.detail->>'undone')::boolean, false),
      'details', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'user_id', d->>'user_id',
            'username', coalesce(nullif(trim(pr.username), ''), '未命名用户'),
            'ok', coalesce((d->>'ok')::boolean, false),
            'before', (d->>'before')::integer,
            'after', (d->>'after')::integer,
            'code', d->>'code',
            'tier', d->>'tier'
          )
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(l.detail->'details', '[]'::jsonb)) d
        left join public.profiles pr on pr.id = (d->>'user_id')::uuid
      )
    ) as row_json
    from public.lottery_admin_audit_logs l
    where l.action in ('pity.batch_adjust', 'pity.batch_set')
    order by l.created_at desc, l.id desc
    limit v_limit
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_list_pity_batch_ops(integer) from public;
grant execute on function public.admin_list_pity_batch_ops(integer) to authenticated;
grant execute on function public.admin_list_pity_batch_ops(integer) to service_role;

-- ------------------------------------------------------------------
-- 2. 按批次撤销
-- ------------------------------------------------------------------
create or replace function public.admin_undo_pity_batch(
  p_log_id uuid,
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
  v_log_action text;
  v_log_detail jsonb;
  v_affected integer := 0;
  v_skipped integer := 0;
  v_uid uuid;
  v_before integer;
  v_d jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销保底批次';
  end if;

  if p_log_id is null then
    raise exception '批次记录 ID 不能为空';
  end if;

  select action, detail into v_log_action, v_log_detail
    from public.lottery_admin_audit_logs
   where id = p_log_id;

  if v_log_action is null then
    raise exception '批次记录不存在';
  end if;

  if v_log_action not in ('pity.batch_adjust', 'pity.batch_set') then
    raise exception '该记录不是批量操作批次';
  end if;

  if coalesce((v_log_detail->>'undone')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_UNDONE',
      'message', '该批次已被撤销'
    );
  end if;

  perform pg_advisory_xact_lock(hashtext('lottery_pity_progress_v3'));

  -- 遍历 details，恢复每个 ok=true 且未撤销的用户到 before
  for v_d in
    select * from jsonb_array_elements(coalesce(v_log_detail->'details', '[]'::jsonb))
  loop
    if coalesce((v_d->>'ok')::boolean, false)
       and coalesce((v_d->>'undone')::boolean, false) = false then
      v_uid := (v_d->>'user_id')::uuid;
      if v_uid is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_before := greatest(0, coalesce((v_d->>'before')::integer, 0));

      insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
      values (v_uid, v_before, null, now())
      on conflict (user_id) do update set
        consecutive_losses = excluded.consecutive_losses,
        updated_at = excluded.updated_at;

      v_affected := v_affected + 1;
    end if;
  end loop;

  -- 标记整个批次为已撤销
  update public.lottery_admin_audit_logs
     set detail = detail || jsonb_build_object('undone', true, 'undone_at', now())
   where id = p_log_id;

  -- 撤销审计
  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.batch_undo',
    jsonb_build_object(
      'undo_from_log_id', p_log_id,
      'undo_from_action', v_log_action,
      'affected', v_affected,
      'skipped', v_skipped,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'skipped', v_skipped,
    'undo_from', v_log_action
  );
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_undo_pity_batch(uuid, text) from public;
grant execute on function public.admin_undo_pity_batch(uuid, text) to authenticated;
grant execute on function public.admin_undo_pity_batch(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
