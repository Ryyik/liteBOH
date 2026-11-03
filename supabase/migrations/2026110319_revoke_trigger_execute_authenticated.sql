-- ============================================================================
-- 触发器函数：把 authenticated 的 EXECUTE 也一并收掉（anon 已于 2026110314 收完）
--
-- 现状（2026-11-03 线上实测）：public 下 53 个触发器函数
--   anon EXECUTE = 0 · authenticated EXECUTE = 14 · service_role = 53
--
-- 为什么 authenticated 也该收：
--   ① 触发器执行时以**表 owner** 身份运行，Postgres **不检查**调用者对触发器
--      函数的 EXECUTE —— 这 14 条授权对触发器行为零影响，是纯冗余面；
--   ② 它们里有 `archive_boh_ai_*` / `boh_enqueue_web_push` / `enforce_forum_*` /
--      `sync_forum_*`，直接 `select fn()` 虽然大多会因缺少触发上下文而报错或空转，
--      但内部函数名、报错文案、异常路径都能被普通登录用户探到；
--   ③ `2026110314` 的 DO 循环条件写的是 `has_function_privilege('anon', …)`，
--      只覆盖了当时 anon 可执行的 37 个 —— 剩下 14 个本来就只授了 authenticated，
--      不在那次循环里，属于**收口漏网**而不是有意保留。
--
-- 写法沿用 2026110314：按「当时所有 authenticated 可执行的 trigger 函数」遍历，
-- 不硬编码名字（改名后会静默漏）。收完做一次断言，避免循环条件写错还静默通过。
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
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
    -- service_role 显式保留：运维脚本 / EF 排查时仍能手工调触发器函数验证
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$do$;

-- 自证：收完不应再有客户端角色可执行的触发器函数
do $do$
declare
  v_left integer;
begin
  select count(*)
    into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE'));

  if v_left > 0 then
    raise exception '仍有 % 个触发器函数对客户端角色可执行，收权未完成', v_left;
  end if;
end
$do$;
