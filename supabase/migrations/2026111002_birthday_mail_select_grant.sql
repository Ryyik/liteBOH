-- ============================================================================
-- 2026-11-10 补 birthday_mail_enabled 的列级 SELECT 授权
--
-- 事故（2026-11-10 用户报障）：
--   「设置里的生日邮件开关点不动，而且显示是关闭的」。
--
-- 根因：2026110308 把 authenticated 对 profiles 的 SELECT 从**表级**收窄成
--   **列白名单**，并在文件头写明了维护约定：
--     「今后 profiles 新增列不会自动可读，若要暴露给登录用户，
--       必须在新迁移里显式 grant select (新列)」。
--   2026111001 加列时只补了 UPDATE 授权（`grant update (birthday_mail_enabled)`），
--   漏了 SELECT。
--
-- 实测（2026-11-10，Management API）：
--   has_column_privilege('authenticated','public.profiles','birthday_mail_enabled','SELECT') = false
--   has_column_privilege('authenticated','public.profiles','birthday_mail_enabled','UPDATE') = true
--   information_schema 里列默认值 = true
--
-- 前端表现链条（src/components/PushplusSettings/index.vue → loadBirthdayMailSetting）：
--   `.select('birthday_mail_enabled')` → PostgREST 42501 permission denied
--   → getBirthdayMailEnabled 返回 error 非空
--   → 刻意「不把失败当成 false 写进去」，于是 birthdayMailLoaded 保持 false
--   → SettingToggle 的 :disabled 恒为 true ⇒ 开关置灰、且沿用初始值 false
--   ⇒ 用户看到的就是「点不动 + 是关的」。
--
-- 为什么不是「默认值没生效」：列默认 true 一直是对的（这条 grant 只影响读取，
--   不影响列默认，也不影响服务端 boh_enqueue_birthday_mails 的
--   `coalesce(p.birthday_mail_enabled, true)`）。缺的只是**读**的权限。
--
-- 安全影响：birthday_mail_enabled 是「是否收生日祝福邮件」的布尔偏好，
--   与已开放的 follow_mail_enabled / moderation_mail_enabled 同类，不含任何
--   敏感信息 ⇒ 授予 SELECT 无风险。sensitive 三件套（shipping_*）与
--   pushplus_token 仍然不开放。
--
-- Down Migration（回滚）：
--   revoke select (birthday_mail_enabled) on table public.profiles from authenticated;
-- ============================================================================

begin;

grant select (birthday_mail_enabled) on table public.profiles to authenticated;

commit;

-- ============================================================================
-- 部署后自检（期望值已在注释里）
-- ============================================================================
-- select
--   has_column_privilege('authenticated','public.profiles','birthday_mail_enabled','SELECT') as a_birthday_select, -- true
--   has_column_privilege('authenticated','public.profiles','birthday_mail_enabled','UPDATE') as a_birthday_update, -- true
--   has_column_privilege('authenticated','public.profiles','pushplus_token','SELECT')       as a_pushplus,        -- false（不变）
--   has_column_privilege('authenticated','public.profiles','shipping_phone','SELECT')       as a_shipping_phone; -- false（不变）
