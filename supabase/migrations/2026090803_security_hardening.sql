-- ============================================================
-- BETA 6 安全三项清零（P0 硬门槛 · plans/007-beta6-plan.md §5）
-- 2026090803_security_hardening.sql
--
-- 背景实测（probe-rls-audit / probe-privacy-cols，anon = 未认证凭据）：
--   1. profiles 行级 select using(true) 且未做列级限制 →
--      anon 可读 email（5+ 用户非空）/ shipping_phone（实测 HAS-VALUE）/
--      shipping_address（实测 HAS-VALUE）/ pushplus_token / gift_* 全列。
--   2. 客户端 ALLOWED_PROFILE_FIELDS 白名单只是 UI 约束，
--      服务端对 update 无列级限制 → authenticated 可自助改 role/points/is_banned。
--   3. email 列与 auth.users 重复存储，注册/自愈两条路径仍在写入。
--
-- 本迁移：
--   ① drop profiles.email（email 只保留在 auth.users）
--   ② profiles RLS 幂等显式化（select 公开 / insert 本人 / update 本人 / delete 管理员）
--   ③ 列级 select：anon 收紧为公开列集（不含 ban_reason / mute_reason）
--   ④ 列级 update：authenticated 白名单 26 列（与前端 ALLOWED_PROFILE_FIELDS
--      + auth.ts dbUpdates + pushplus-api 写集对齐，role/points/is_banned 不可越权）
--   ⑤ 列级 insert：仅注册/自愈所需 5 列
--   ⑥ revoke authenticated delete（无业务需要，service_role 兜底）
--
-- 兼容性核对（前端调用点）：
--   - PROFILE_SELECT_COLUMNS 30 列不含 email → drop 不影响主读取
--   - admin 改积分走 admin_grant_points RPC（security definer）不受影响
--   - role / ban / mute 变更均由 service_role（Supabase 控制台手工）执行
--   - authenticated 互读隐私列（shipping/pushplus/gift）为已知残留，
--     下一步拆 profile_private 表根治（见 PROJECT_MANUAL 5.1 待办）
-- ============================================================

begin;

-- ============ ① 根除 email 列 ============
-- 存量数据随列一起删除；email 唯一真相源为 auth.users
alter table public.profiles drop column if exists email;

-- ============ ② RLS 显式化（幂等） ============
alter table public.profiles enable row level security;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete using (public.current_user_is_admin());

-- ============ ③ 列级 select：anon 仅公开列 ============
revoke select on table public.profiles from anon;
grant select (
  id, username, role, points, join_date, birth_month, birth_day,
  avatar_url, profile_background_url, profile_background_public_id,
  points_card_skin, points_card_image_url, points_card_image_public_id,
  tags, bio, experience, is_boh_creator, creator_platform_ids,
  creator_platform_visibility, creator_platform_order, showcase_post_ids,
  last_active_at, hide_online_status, hide_follow_data,
  is_banned, is_muted, banned_until, muted_until
) on table public.profiles to anon;

-- ============ ④ 列级 update：authenticated 白名单 ============
revoke update on table public.profiles from authenticated;
grant update (
  username, bio, avatar_url, join_date, birth_month, birth_day,
  profile_background_url, profile_background_public_id,
  points_card_skin, points_card_image_url, points_card_image_public_id,
  is_boh_creator, creator_platform_ids, creator_platform_visibility,
  creator_platform_order, showcase_post_ids, hide_follow_data,
  shipping_recipient, shipping_phone, shipping_address,
  pushplus_token, pushplus_enabled,
  gift_status, gift_content, gift_no, gift_price
) on table public.profiles to authenticated;

-- ============ ⑤ 列级 insert：仅注册/自愈所需 ============
revoke insert on table public.profiles from authenticated;
grant insert (id, username, join_date, birth_month, birth_day)
  on table public.profiles to authenticated;

-- ============ ⑥ delete 不授 authenticated ============
revoke delete on table public.profiles from authenticated;

commit;

-- 回归验证（anon 凭据手工复测）：
--   select=id,username          → 200（公开）
--   select=*                    → 400（列级限制生效）
--   select=shipping_phone       → 400（隐私列 anon 不可读）
--   select=email                → 400 column does not exist（列已根除）
