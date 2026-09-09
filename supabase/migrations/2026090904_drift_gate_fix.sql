-- ============================================================================
-- 2026090904: get_points_ledger_drift 权限门修复 + anon EXECUTE 回收
--
--   2026090903 的对账函数用 `auth.uid() is null or current_user_is_admin()`
--   做 WHERE 门（本意放行 service_role），但 anon 未登录时 uid 同样为 null，
--   且 Supabase 的 alter default privileges 会给新函数自动授予
--   anon/authenticated/service_role 的 EXECUTE（`revoke from public` 撤不掉），
--   结果未登录请求能拉到全站用户名 + 积分余额。实测 probe 抓到 6 行泄露。
--
--   修复：
--   1) 门改为 `auth.jwt()->>'role' = 'service_role' or current_user_is_admin()`
--   2) 显式 revoke anon 的 EXECUTE（对账函数 + 同类门缺陷的 admin_revoke_grant）
-- ============================================================================

begin;

create or replace function public.get_points_ledger_drift()
returns table (
  user_id uuid,
  username text,
  balance integer,
  ledger_sum bigint,
  drift bigint,
  tx_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    coalesce(p.points, 0) as balance,
    coalesce(sum(t.amount), 0)::bigint as ledger_sum,
    (coalesce(p.points, 0) - coalesce(sum(t.amount), 0))::bigint as drift,
    count(t.id)::bigint as tx_count
  from public.profiles p
  join public.points_transactions t on t.user_id = p.id
  where (auth.jwt() ->> 'role' = 'service_role' or public.current_user_is_admin())
  group by p.id, p.username, p.points
  having coalesce(p.points, 0) <> coalesce(sum(t.amount), 0)
  order by abs(coalesce(p.points, 0) - coalesce(sum(t.amount), 0)) desc;
$$;

revoke all on function public.get_points_ledger_drift() from public;
revoke execute on function public.get_points_ledger_drift() from anon;
grant execute on function public.get_points_ledger_drift() to authenticated;
grant execute on function public.get_points_ledger_drift() to service_role;

-- admin_revoke_grant（2026081502）的 plpgsql 门 `auth.uid() is not null and not admin`
-- 对 anon（uid 为 null）不拒绝；虽有批次 UUID 难猜兜底，仍回收 anon EXECUTE 以绝后患。
revoke execute on function public.admin_revoke_grant(uuid) from anon;

commit;
