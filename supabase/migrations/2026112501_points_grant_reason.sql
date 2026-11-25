-- 2026112501: admin_grant_points 增加 p_reason（plans/050 期 3）
--
-- 背景：后台「用户详情 → 积分 → 扣除」上线后，扣减仍被记成 reason='admin_grant'，
--   账本读起来是「管理员发放了一笔负数」。这里把 reason 变成参数，调用方可传
--   'admin_deduct'；不传时保持旧值 'admin_grant'（老调用点零改动）。
--
-- ⚠️ 为什么必须 DROP 再 CREATE，而不能直接 create or replace：
--   参数是函数的身份。给 3 参函数追加带默认值的第 4 参，PG 会**另存一份 4 参函数**，
--   而 3 参调用会同时匹配两份 → 42725 "function is not unique"。
--   线上唯一调用方是前端 src/utils/api/points-admin-api.js（已确认无库内调用方），
--   同一事务内 DROP + CREATE 不会留下破坏窗口。
--
-- 权限：DROP 会连带清掉 ACL，所以下面必须重新 grant（authenticated + service_role，
--   且显式 revoke anon/public —— 不能只 revoke public）。
--
-- 回滚：把本文件倒过来执行（drop 4 参 → create 3 参旧体 → 重新授权）。
--   本函数体的来源是 pg_get_functiondef 的线上定义（2026-11-25 实测）。

begin;

drop function if exists public.admin_grant_points(uuid[], integer, text);

create or replace function public.admin_grant_points(
  p_user_ids uuid[] default null,
  p_amount integer default 0,
  p_remark text default '',
  p_reason text default 'admin_grant'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_targets uuid[];
  v_affected integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'admin_grant');
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可发放积分';
  end if;

  if v_reason not in ('admin_grant', 'admin_deduct') then
    raise exception '不支持的积分流水原因: %', v_reason;
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

  -- 单语句原子快照（同 2026081502 对 admin_revoke_grant 的 H3 修复模式）：
  -- UPDATE 锁行并取回发放后的新余额，流水 balance_after 与该次 UPDATE 严格一致，
  -- 并发发放/消费下不再出现快照漂移；同时保留 2026081104 的 batch_id 批次语义。
  with updated as (
    update public.profiles p
       set points = greatest(0, p.points + p_amount)
     where p.id = any(v_targets)
    returning p.id as user_id, p.points as new_points
  )
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id, batch_id)
  select u.user_id, p_amount, u.new_points, v_reason, coalesce(p_remark, ''), v_operator, v_batch_id
    from updated u;

  get diagnostics v_affected = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'amount', p_amount,
    'remark', coalesce(p_remark, ''),
    'reason', v_reason,
    'batch_id', v_batch_id
  );
  return v_result;
end;
$function$;

revoke all on function public.admin_grant_points(uuid[], integer, text, text)
  from anon, authenticated, public;
grant execute on function public.admin_grant_points(uuid[], integer, text, text)
  to authenticated, service_role;

-- 登记迁移（与上面的 DDL 同一事务）
insert into supabase_migrations.schema_migrations (version, name)
values ('2026112501', 'points_grant_reason')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
