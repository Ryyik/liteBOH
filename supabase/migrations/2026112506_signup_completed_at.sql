-- 2026112506_signup_completed_at.sql
-- 「邮箱优先」注册流程需要一个**可靠的「这个账号建完了没有」标记**。
--
-- ── 没有它会出什么事 ──────────────────────────────────────────────────
-- 新流程第 ① 屏就用 signInWithOtp 把 auth.users 建出来，密码要到第 ③ 屏才设。
-- 用户如果在第 ② 屏或第 ③ 屏离开（很常见：去收信、被打断、嫌麻烦），库里会留下
--   一个**没有密码**的账号。
--
-- 然后他过两天回来用同一个邮箱重新注册，`signInWithOtp` 认出邮箱已存在 ⇒
-- 走的是「登录」语义。如果这时我们按「已注册」把他挡回家去登录，
-- 他会发现**自己根本没有密码**，也没有任何入口能设 —— 这个邮箱就废了。
--
-- ── 为什么不用 created_at 判断 ────────────────────────────────────────
-- 一开始想用「创建于 15 分钟内 = 本次新建」，但它只能覆盖「刚刚」这一段。
-- 隔天回来的用户 created_at 早就超了，照样被误判成老用户挡在门外。
--
-- ── 本次改动 ─────────────────────────────────────────────────────────
-- 新增 `profiles.signup_completed_at`：
--   · 第 ③ 屏写完 ID + 密码时置 `now()`（见 completeSignupIdentity）
--   · 判定就一句：**为 NULL ⇒ 这个账号还没建完，允许继续走注册流程**；
--     非 NULL ⇒ 真正的老用户，提示去登录。
-- 这样「放弃后回来」和「误用已注册邮箱」被区分开了，靠的是一个业务事实
-- （密码和 ID 都设好了没有），而不是一个时间窗猜测。
--
-- ── 存量回填（必须做，否则会误伤所有老用户）──────────────────────────
-- 下面这条 update 会把现有 37 个用户全部标成「已建完」。
-- 不回填的后果：所有老用户都被判成「未建完」，允许走注册流程 ⇒
-- 他们用自己邮箱收验证码后会被引导重设 ID 和密码，等于**静默改写老账号**。
-- 这是本次改动里最危险的一步，先回填、再上线前端。
--
-- 幂等：add column if not exists + 只填 NULL，可重复执行。

alter table public.profiles
  add column if not exists signup_completed_at timestamptz;

comment on column public.profiles.signup_completed_at is
  '注册流程真正走完（BOH ID 与密码都已设置）的时刻。为 NULL 表示账号尚未建完 —— 允许用户用同一邮箱继续注册，不会被「邮箱已注册」挡住。';

-- 存量回填：现有用户的 auth.users 行都是完整的（有密码），
-- 用 created_at 作为他们的「建完时间」，语义上最接近。
update public.profiles p
   set signup_completed_at = coalesce(u.created_at, p.join_date::timestamptz, now())
  from auth.users u
 where u.id = p.id
   and p.signup_completed_at is null;

-- 兜底：万一有 profiles 行没有对应的 auth.users（理论上 FK 保证不会有），
-- 也不要留 NULL 把它们变成「未建完」。
update public.profiles
   set signup_completed_at = coalesce(join_date::timestamptz, now())
 where signup_completed_at is null;

-- 索引：按「未建完」筛账号是清理和排查的常用条件
-- ⚠️ profiles 没有 created_at（只有 join_date，是 date 不带时分），
--    所以索引建在 join_date 上 —— 够用来做「哪些是最近没建完的」这类排查。
create index if not exists idx_profiles_signup_incomplete
  on public.profiles (join_date)
  where signup_completed_at is null;

notify pgrst, 'reload schema';
