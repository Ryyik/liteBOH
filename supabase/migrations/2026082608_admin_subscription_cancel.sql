-- =============================================
-- 订阅发放：撤销订阅（标记为已取消）
-- 1) admin_cancel_subscription：撤销单条订阅记录
-- 2) admin_cancel_subscription_batch：按发放批次整体撤销
-- 均将 status 置为 cancelled 并在 metadata 留痕，保留记录可追溯
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 1. 撤销单条订阅
-- ------------------------------------------------------------------
create or replace function public.admin_cancel_subscription(
  p_subscription_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_plan_code text;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销订阅';
  end if;

  select user_id, plan_code into v_user_id, v_plan_code
    from public.user_subscriptions
   where id = p_subscription_id;

  if v_user_id is null then
    raise exception '订阅记录不存在';
  end if;

  update public.user_subscriptions
     set status = 'cancelled',
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'cancelled_by_admin', true,
           'cancelled_at', now()
         )
   where id = p_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'id', p_subscription_id,
    'user_id', v_user_id,
    'plan_code', v_plan_code,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.admin_cancel_subscription(uuid) from public;
grant execute on function public.admin_cancel_subscription(uuid) to authenticated;
grant execute on function public.admin_cancel_subscription(uuid) to service_role;

-- ------------------------------------------------------------------
-- 2. 按批次撤销（仅撤销批次内仍生效的订阅）
-- ------------------------------------------------------------------
create or replace function public.admin_cancel_subscription_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销发放批次';
  end if;

  update public.user_subscriptions
     set status = 'cancelled',
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'cancelled_by_admin', true,
           'cancelled_at', now()
         )
   where batch_id = p_batch_id
     and status = 'active';

  get diagnostics v_affected = row_count;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'affected', v_affected
  );
end;
$$;

revoke all on function public.admin_cancel_subscription_batch(uuid) from public;
grant execute on function public.admin_cancel_subscription_batch(uuid) to authenticated;
grant execute on function public.admin_cancel_subscription_batch(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
