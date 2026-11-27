-- ============================================================
-- 「隐藏在线状态」开关点了没反应（2026-11-26）
-- 2026112607_self_update_hide_online_status.sql
--
-- 报障：设置 → 账户与安全 →「隐藏在线状态」开关点不动（点了弹回原状态）。
--
-- 两层真因，缺一都不通（实测依据）：
--   ① 前端 `auth.ts` 的 `dbUpdates` 是**字段白名单式**（逐个 if），里面没有
--      `hide_online_status` ⇒ 传给 postgrest 的更新对象是空的 ⇒ 返回 200、
--      影响 0 行、回读还是旧值 ⇒ 开关弹回。已在前端补上。
--   ② 线上 `authenticated` 对 `public.profiles` 的列级 UPDATE 里**没有这一列**。
--      实测：has_column_privilege('authenticated','public.profiles',
--            'hide_online_status','UPDATE') = false，而同组的
--            `hide_follow_data` = true。
--
-- 为什么 ② 会漏：2026090803_security_hardening 的列级 UPDATE 白名单是**按当时
-- 前端实际写入集**对齐的（该迁移注释原话：「与前端 ALLOWED_PROFILE_FIELDS +
-- auth.ts dbUpdates + pushplus-api 写集对齐」）。而前端 dbUpdates 里从来没有这一列
-- ⇒ 授权也跟着漏了。所以这是 ① 的连带缺漏，不是一次有意的安全收窄。
--
-- 为什么可以直接授列（不做 RPC）：
--   · 语义上是**纯自助**的隐私开关，只能作用于自己那一行 ——
--     `profiles_update_self` 策略是 `using (auth.uid() = id) with check (auth.uid() = id)`，
--     越权改别人的行会被 RLS 挡掉；它也不像 `role / points` 那样是提权向量
--     （把自己的 hide_online_status 改成 false 只是「显示自己」，等于默认值）。
--   · 与同一屏的兄弟开关 `hide_follow_data` 保持**同一条写路径**（那一列本来就是直授）。
--     一个开关走 RPC、兄弟开关走直更，才是这仓库最忌讳的「同一语义两条路」。
--   ⚠️ 不要因为这条把 `role / points / experience / tags` 也一并授上 ——
--      那四列是 2026090803 有意收窄的提权面（补 update(role) 可自升 admin，已实测）。
--
-- 回滚：revoke update (hide_online_status) on public.profiles from authenticated;
-- ============================================================

begin;

grant update (hide_online_status) on table public.profiles to authenticated;

commit;

notify pgrst, 'reload schema';