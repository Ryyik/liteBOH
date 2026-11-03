-- ============================================================================
-- B1 续 · 触发器函数一律不开放 EXECUTE 给客户端角色
--
-- 门禁 `security:anon-check` 在 B1 收口后报出一条新增匿名可达：
--   + notify_gift_progress（2026110202 的礼物进度触发器）
-- 顺势复核发现这不是孤例：public 下 **37 个 trigger 函数全部 anon 可执行**。
--
-- 为什么可以全收：
--   触发器执行时以**表 owner** 身份运行，Postgres **不检查**调用者对触发器函数的
--   EXECUTE 权限（只有直接 `select fn()` 才检查）。也就是说这 37 条授权是纯冗余，
--   收掉对触发器行为零影响。
--
-- 为什么必须收：
--   它们里有 `handle_new_user`（建号时写 profiles）、`apply_yearly_membership_gift`
--   （发年度礼）、`enforce_*`（约束类）以及一批 `create_*_notification`。
--   虽然直接调用大多会因缺少触发上下文而报错或空转，但这是白送的攻击面：
--   内部函数名、报错信息、异常路径都能被匿名用户探到。
--
-- 写法用 DO 块按「当时所有 trigger 函数」遍历，而不是硬编码 37 个名字：
--   硬编码会在函数改名后静默漏掉。代价是将来新增的 trigger 函数不会自动收权
--   （`alter default privileges` 在本项目对这类函数无效，见 check-anon-execute.mjs
--   头注），由 `security:anon-check` 在 CI 里提醒。
-- ============================================================================

do $do$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
    -- service_role 显式保留：运维脚本/EF 排查时仍能手工调触发器函数验证
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$do$;
