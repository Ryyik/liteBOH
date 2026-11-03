-- ============================================================
-- 收窄 authenticated 对 profiles 的列级 SELECT
--
-- 背景（2026-11-03 安全复审，P0）：
--   `2026090803_security_hardening.sql` 的 ③ 段只对 **anon** 做了
--   「表级 revoke + 列白名单 grant」，④ 段只收紧了 authenticated 的
--   UPDATE / INSERT —— **唯独漏了 SELECT**。
--   结果是任何已注册用户（注册页开放、登录闸门尚未生效）一条请求即可拿到
--   全站所有人的收货信息：
--
--     GET /rest/v1/profiles?select=username,shipping_phone,shipping_address
--     Authorization: Bearer <任意新账号 JWT>
--
--   实测（2026-11-03，Management API）：
--     has_table_privilege('authenticated','public.profiles','SELECT')          = true
--     has_column_privilege('authenticated','public.profiles','shipping_phone') = true
--     has_column_privilege('anon',        'public.profiles','shipping_phone')  = false
--
-- ⚠️ 关键：**不能只写 `revoke select (列) ...`**。
--    PostgreSQL 的语义是「表级权限存在时，列级 revoke 不生效」，
--    所以必须像 2026090803 对 anon 那样先撤表级、再按列授予。
--
-- 保留策略不变：`profiles_select_public` 仍是 `using (true)`（社交站公开资料），
-- 本次只限制**哪些列**可读，不限制行。
--
-- 与 2026090803 的差异：白名单 = 上表全部列 − 4 个敏感列。
--   shipping_recipient / shipping_phone / shipping_address  → 改走 get_my_sensitive_profile()
--   pushplus_token                                          → 改走 get_pushplus_token_for_notification
--   注：这三列的 **UPDATE** 权限保持不变（本人仍需改自己的收货地址）。
--
-- 维护约定：今后 profiles 新增列**不会自动可读**，若要暴露给登录用户，
-- 必须在新迁移里显式 `grant select (新列) on public.profiles to authenticated`。
-- 这是刻意选择的失败模式 —— 漏授予会立刻表现为 401，而不是静默泄露。
-- ============================================================

begin;

-- ① 撤表级（否则下面的列级授权无法形成有效收窄）
revoke select on table public.profiles from authenticated;

-- ② 按列授予：全部 52 个非敏感列
grant select (
  id,
  username,
  join_date,
  tags,
  role,
  points,
  birth_month,
  birth_day,
  bio,
  avatar_url,
  experience,
  gift_status,
  gift_content,
  gift_no,
  gift_price,
  pushplus_enabled,
  gift_points,
  is_boh_creator,
  creator_platform_ids,
  creator_platform_visibility,
  creator_platform_order,
  showcase_post_ids,
  profile_background_url,
  profile_background_public_id,
  login_banned,
  speech_banned,
  ban_reason,
  login_banned_until,
  speech_banned_until,
  last_active_at,
  hide_online_status,
  hide_follow_data,
  is_banned,
  is_muted,
  mute_reason,
  banned_until,
  muted_until,
  banned_at,
  muted_at,
  banned_by,
  muted_by,
  points_card_skin,
  points_card_image_url,
  points_card_image_public_id,
  avatar_frame_url,
  last_online_day,
  overview_checked_day,
  ai_points_fraction,
  follow_mail_enabled,
  follow_mail_window_minutes,
  follow_mail_digest,
  moderation_mail_enabled
) on table public.profiles to authenticated;

commit;

-- ============================================================
-- 部署后自检（在 SQL Editor 里跑，期望值已在注释里）
-- ============================================================
-- select
--   has_column_privilege('authenticated','public.profiles','shipping_phone','SELECT')    as a_shipping_phone, -- false
--   has_column_privilege('authenticated','public.profiles','shipping_address','SELECT')  as a_shipping_addr,  -- false
--   has_column_privilege('authenticated','public.profiles','shipping_recipient','SELECT')as a_shipping_recip, -- false
--   has_column_privilege('authenticated','public.profiles','pushplus_token','SELECT')    as a_pushplus,      -- false
--   has_column_privilege('authenticated','public.profiles','username','SELECT')          as a_username,      -- true
--   has_column_privilege('anon','public.profiles','shipping_phone','SELECT')             as anon_shipping;   -- false（不变）
