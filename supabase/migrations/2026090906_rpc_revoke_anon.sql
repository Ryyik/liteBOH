-- =============================================
-- 权限最小化：商城下单 / 周签到 RPC 显式收回 anon 的 EXECUTE
-- 背景：Supabase 默认权限会把 EXECUTE 显式授给 anon 角色，
--       `revoke from public` 撤不掉显式授权（与 2026090904 同因）。
--       两函数内部均有 auth.uid() 门（anon 只会拿到 NOT_AUTHENTICATED），
--       无实际数据泄露，但按最小权限原则显式收回。
-- =============================================

revoke all on function public.create_shop_order_with_points(jsonb, text, text) from anon;
revoke all on function public.submit_weekly_checkin() from anon;
