begin;

-- =============================================
-- 积分发放批次撤销功能
-- 1) points_transactions 表新增 batch_id 列（同一次发放共享同一 batch_id）
-- 2) admin_grant_points 生成 batch_id 并写入
-- 3) admin_revoke_grant 按 batch_id 批量撤销（反向扣除 + 写入撤销流水）
-- =============================================

-- 1. 新增 batch_id 列（已有数据 batch_id 为 null，不影响查询）
alter table public.points_transactions add column if not exists batch_id uuid;

create index if not exists idx_points_transactions_batch
  on public.points_transactions (batch_id, created_at desc);

-- 2. 替换 admin_grant_points：生成 batch_id 并写入每条流水
create or replace function public.admin_grant_points(
  p_user_ids uuid[] default null,
  p_amount integer default 0,
  p_remark text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_targets uuid[];
  v_affected integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可发放积分';
  end if;

  if coalesce(p_amount, 0) = 0 then
    raise exception '积分数量不能为 0';
  end if;

  -- 空数组/NULL -> 全部非管理员用户
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles
     where role <> 'admin';
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可发放积分的用户';
  end if;

  -- 更新积分余额
  update public.profiles
     set points = greatest(0, points + p_amount)
   where id = any(v_targets);

  -- 写入流水（共享同一 batch_id）
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id, batch_id)
  select p.id,
         p_amount,
         p.points,
         'admin_grant',
         coalesce(p_remark, ''),
         v_operator,
         v_batch_id
    from public.profiles p
   where p.id = any(v_targets);

  get diagnostics v_affected = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'amount', p_amount,
    'remark', coalesce(p_remark, ''),
    'batch_id', v_batch_id
  );
  return v_result;
end;
$$;

revoke all on function public.admin_grant_points(uuid[], integer, text) from public;
grant execute on function public.admin_grant_points(uuid[], integer, text) to authenticated;
grant execute on function public.admin_grant_points(uuid[], integer, text) to service_role;

-- 3. 新增 admin_revoke_grant：按 batch_id 批量撤销
--    反向扣除积分（正数发放 -> 扣回，负数扣除 -> 补回）
--    写入 reason='admin_revoke' 的撤销流水
create or replace function public.admin_revoke_grant(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_revoked integer := 0;
  v_amount integer;
  v_remark text;
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销积分发放';
  end if;

  if p_batch_id is null then
    raise exception '批次 ID 不能为空';
  end if;

  -- 检查批次是否存在且未被撤销
  select amount, remark
    into v_amount, v_remark
    from public.points_transactions
   where batch_id = p_batch_id
     and reason = 'admin_grant'
   limit 1;

  if not found then
    raise exception '未找到该批次的发放记录，或已撤销';
  end if;

  -- 检查是否已撤销
  if exists (
    select 1 from public.points_transactions
     where batch_id = p_batch_id
       and reason = 'admin_revoke'
  ) then
    raise exception '该批次已撤销，不可重复撤销';
  end if;

  -- 反向扣除积分：发放时是 +amount，撤销时扣回 -amount（下限 0）
  update public.profiles p
     set points = greatest(0, p.points - v_amount)
    from public.points_transactions t
   where t.batch_id = p_batch_id
     and t.reason = 'admin_grant'
     and t.user_id = p.id;

  -- 写入撤销流水（amount 取反，reason='admin_revoke'）
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id, batch_id)
  select t.user_id,
         -t.amount,
         p.points,
         'admin_revoke',
         '撤销发放: ' || coalesce(t.remark, ''),
         v_operator,
         t.batch_id
    from public.points_transactions t
    join public.profiles p on p.id = t.user_id
   where t.batch_id = p_batch_id
     and t.reason = 'admin_grant';

  get diagnostics v_revoked = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'revoked', v_revoked,
    'batch_id', p_batch_id,
    'amount', v_amount
  );
  return v_result;
end;
$$;

revoke all on function public.admin_revoke_grant(uuid) from public;
grant execute on function public.admin_revoke_grant(uuid) to authenticated;
grant execute on function public.admin_revoke_grant(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
