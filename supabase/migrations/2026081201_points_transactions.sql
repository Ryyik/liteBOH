begin;

-- =============================================
-- 积分流水表 + 管理员批量发放积分 RPC
-- 用户端「积分明细」与后台「积分发放」共用
-- =============================================

create table if not exists public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,                 -- 正数=获得，负数=消耗
  balance_after integer not null default 0,
  reason text not null default '',         -- weekly_checkin / shop_order / admin_grant / subscription
  remark text not null default '',         -- 管理员备注
  operator_id uuid references public.profiles (id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_points_transactions_user_created
  on public.points_transactions (user_id, created_at desc);

create index if not exists idx_points_transactions_operator_created
  on public.points_transactions (operator_id, created_at desc);

alter table public.points_transactions enable row level security;

-- 本人可读自己的流水
drop policy if exists points_transactions_owner_select on public.points_transactions;
create policy points_transactions_owner_select on public.points_transactions
  for select to authenticated
  using (user_id = auth.uid());

-- 管理员全权访问
drop policy if exists points_transactions_admin_all on public.points_transactions;
create policy points_transactions_admin_all on public.points_transactions
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select, insert, update, delete on table public.points_transactions to authenticated;
grant all on table public.points_transactions to service_role;

-- =============================================
-- admin_grant_points：管理员批量发放积分
-- p_user_ids 为空数组或 NULL 时发放给全部用户；
-- 支持正数（发放）与负数（扣除）。
-- =============================================
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
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可发放积分';
  end if;

  if coalesce(p_amount, 0) = 0 then
    raise exception '积分数量不能为 0';
  end if;

  -- 空数组/NULL -> 全部用户
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

  -- 写入流水（余额取更新后的 points，避免重复累加）
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id)
  select p.id,
         p_amount,
         p.points,
         'admin_grant',
         coalesce(p_remark, ''),
         v_operator
    from public.profiles p
   where p.id = any(v_targets);

  get diagnostics v_affected = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'amount', p_amount,
    'remark', coalesce(p_remark, '')
  );
  return v_result;
end;
$$;

revoke all on function public.admin_grant_points(uuid[], integer, text) from public;
grant execute on function public.admin_grant_points(uuid[], integer, text) to authenticated;
grant execute on function public.admin_grant_points(uuid[], integer, text) to service_role;

commit;
