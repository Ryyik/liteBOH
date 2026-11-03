-- ============================================================================
-- P3-b：RLS 策略里的「零参 STABLE 函数调用」上提为 InitPlan
--
-- 问题
--   策略表达式里的 auth.uid() / current_user_is_admin() 是**逐行求值**的：
--   profiles 的 SELECT、likes 的写策略都要对每一行重算一次；而
--   current_user_is_admin() 内部还要再查一次 profiles（121 条策略在调它）。
--
-- 做法
--   包成标量子查询 (select ...)，PostgreSQL 会把它改写成 InitPlan —— 每条语句
--   只算一次，然后逐行复用同一结果。这是 Supabase 官方对 auth_rls_initplan
--   这条 lint 的标准修法。
--
-- 为什么安全
--   auth.uid() / auth.role() / auth.jwt() / public.current_user_is_admin() 在库里
--   全部是 **零参数 + STABLE**（实测 provolatile = 's'、pronargs = 0）。
--   零参数 STABLE 函数在整个语句生命周期内返回值恒定 ⇒ 求值一次与求值 N 次
--   结果完全一致。本迁移只改变求值次数，不改变任何布尔结果。
--   带参数的函数（如 is_admin(uid)）不在此列，一律不碰。
--
-- 自证（关键）
--   改完逐条把渲染出的 `( SELECT f() AS f)` 还原成裸调用 `f()`，必须与改写前
--   **逐字相同** —— 证明只插入了一个包装，没有碰表达式其余任何部分。
--   任何一条对不上就 raise exception，整条迁移原子回滚。
-- ============================================================================

do $$
declare
  r              record;
  v_aq           text;
  v_aw           text;
  v_q            text;
  v_w            text;
  v_nq           text;
  v_nw           text;
  v_rt           text;
  v_sql          text;
  v_cnt          int := 0;
  v_mention_before int;
  v_mention_after  int;
  v_calls          bigint;
  v_wrapped        bigint;
begin
  select count(*) into v_mention_before
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|current_user_is_admin\(\))';

  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(auth\.uid\(\)|current_user_is_admin\(\))'
        or coalesce(with_check, '') ~ '(auth\.uid\(\)|current_user_is_admin\(\))')
    order by tablename, policyname
  loop
    v_q := coalesce(r.qual, '');
    v_w := coalesce(r.with_check, '');

    -- 幂等：已经上提过就跳过（重复执行或已手工处理过的策略不会被二次包裹）
    if v_q ~* 'select\s+(auth\.uid|current_user_is_admin)\(\)\s+as'
       or v_w ~* 'select\s+(auth\.uid|current_user_is_admin)\(\)\s+as' then
      continue;
    end if;

    v_nq := regexp_replace(v_q, '(auth\.uid\(\)|current_user_is_admin\(\))', '(select \1)', 'g');
    v_nw := regexp_replace(v_w, '(auth\.uid\(\)|current_user_is_admin\(\))', '(select \1)', 'g');
    if v_nq = v_q and v_nw = v_w then
      continue;
    end if;

    -- INSERT 策略不支持 USING，SELECT/DELETE 没有 WITH CHECK，按实际有的那一侧拼
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_q <> '' then v_sql := v_sql || format(' using (%s)', v_nq); end if;
    if v_w <> '' then v_sql := v_sql || format(' with check (%s)', v_nw); end if;
    execute v_sql;

    select coalesce(qual, ''), coalesce(with_check, '') into v_aq, v_aw
    from pg_policies
    where schemaname = r.schemaname and tablename = r.tablename and policyname = r.policyname;

    -- 回环自证 ①：USING
    v_rt := regexp_replace(v_aq,
      '\(\s*SELECT\s+(auth\.uid|current_user_is_admin)\(\)\s+AS\s+\w+\s*\)', '\1()', 'gi');
    if v_rt <> v_q then
      raise exception '回环自证失败 [%.% USING] 改写前: % | 还原后: %',
        r.tablename, r.policyname, v_q, v_rt;
    end if;

    -- 回环自证 ②：WITH CHECK
    v_rt := regexp_replace(v_aw,
      '\(\s*SELECT\s+(auth\.uid|current_user_is_admin)\(\)\s+AS\s+\w+\s*\)', '\1()', 'gi');
    if v_rt <> v_w then
      raise exception '回环自证失败 [%.% WITH CHECK] 改写前: % | 还原后: %',
        r.tablename, r.policyname, v_w, v_rt;
    end if;

    v_cnt := v_cnt + 1;
  end loop;

  -- 自证 ③：提到过这两个函数的策略条数不能变（没删没丢）
  select count(*) into v_mention_after
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|current_user_is_admin\(\))';
  if v_mention_after <> v_mention_before then
    raise exception '自证失败：涉及这两个函数的策略由 % 条变成了 % 条', v_mention_before, v_mention_after;
  end if;

  -- 自证 ④：每一次调用都必须落在一个包装里
  --   渲染后的包装形态是 `( SELECT f() AS f)`，其中恰好含一次调用。
  --   所以「调用总次数 == 包装总数」即等价于「没有任何裸调用残留」。
  --   ⚠️ 不能反过来做（把包装还原成裸调用再去找裸调用）—— 那永远成立，
  --   第一版就是这么写错的，被自证自己挡下来了。
  select sum((select count(*) from regexp_matches(t,
           '(auth\.uid\(\)|current_user_is_admin\(\))', 'g'))),
         sum((select count(*) from regexp_matches(t,
           'select\s+(auth\.uid|current_user_is_admin)\(\)\s+as', 'gi')))
    into v_calls, v_wrapped
  from (
    select coalesce(qual, '') || coalesce(with_check, '') as t
    from pg_policies where schemaname = 'public'
  ) s;

  if coalesce(v_calls, 0) <> coalesce(v_wrapped, 0) then
    raise exception '自证失败：调用 % 次，包装 % 个 —— 有裸调用没被上提', v_calls, v_wrapped;
  end if;

  raise notice 'P3-b 完成：% 条策略已上提；调用 % 次 / 包装 % 个（相等=零残留）；涉及这两个函数的策略 % 条',
    v_cnt, v_calls, v_wrapped, v_mention_after;
end $$;
