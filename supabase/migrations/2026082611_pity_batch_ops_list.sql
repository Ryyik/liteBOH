-- =============================================
-- 保底中心：按批次查看批量操作记录（类似订阅发放）
-- 新增 admin_list_pity_batch_ops：从审计日志查询最近的批量增减/设值批次，
-- 返回批次摘要 + 每个用户的 before/after（关联用户名）
-- =============================================

begin;

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

notify pgrst, 'reload schema';

commit;
