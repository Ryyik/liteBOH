-- 2026100404: 修复 handle_new_user 的 search_path 可变问题（SECURITY DEFINER 提权向量）
--
-- 发现方式：新增门禁 `npm run check:db-advisors`
--   searchPathMutable  [splinter: function_search_path_mutable]
--   → public.handle_new_user  是 SECURITY DEFINER 且 proconfig = null（未固定 search_path）
--
-- 为什么危险：SECURITY DEFINER 函数以 owner 身份执行；未固定 search_path 时，
--   search_path 由**调用会话**决定 ⇒ 攻击者若能让某个 schema 排在前面，
--   即可用同名对象/操作符/隐式转换劫持函数体内部的解析，从而以 owner 身份执行任意逻辑。
--   这正是 Supabase dashboard Advisors 会标红的第一类问题。
--
-- 影响面：`handle_new_user` 由触发器 `on_auth_user_created`（on auth.users）调用，
--   **每次注册都会跑**。当前函数体已全部写成 `public.profiles` 限定形式，所以本次
--   只是把 search_path 钉死，**不改变任何业务行为**。
--
-- 已做的安全验证（事务内真跑一次 + ROLLBACK，见 docs/2026-10-04-线上DB函数lint与积分链路修复.md）：
--   begin;
--     create or replace function public.handle_new_user() ... set search_path = public, pg_temp ...;
--     insert into auth.users (...) values ('00000000-0000-0000-0000-0000000000aa', ...);
--     select count(*) from public.profiles where id = '...';   -- → 1（触发器仍正常建 profile）
--     select proconfig from pg_proc where proname='handle_new_user';  -- → {"search_path=public, pg_temp"}
--   rollback;
--
-- 幂等：create or replace，签名与返回类型（trigger）不变。
-- 回滚：去掉 `set search_path = public, pg_temp` 一行即可（原始定义见迁移 2026-06 系列
--   或 `select pg_get_functiondef('public.handle_new_user'::regproc)`）。

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  insert into public.profiles (id, username, points, tags)
  values (new.id, new.raw_user_meta_data->>'username', 0, '{}');
  return new;
end;
$function$;
