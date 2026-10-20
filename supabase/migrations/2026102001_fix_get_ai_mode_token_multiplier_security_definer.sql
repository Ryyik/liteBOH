-- ============================================================================
-- 阶段 0：修回 get_ai_mode_token_multiplier 的 SECURITY DEFINER
--
-- ── 问题（2026-10-20 实测）────────────────────────────────────────────────
--   select prosecdef from pg_proc where proname='get_ai_mode_token_multiplier'
--     ⇒ false            （owner = postgres）
--   角色模拟（只读）：
--     begin; set local role authenticated;
--     select get_ai_mode_token_multiplier('Air');   -- 期望 0.30
--     rollback;                                     -- 实测 1
--
-- ── 成因 ────────────────────────────────────────────────────────────────
--   · 2026081501_security_hardening.sql:186 这一版**有** SECURITY DEFINER，
--     注释还写明了理由：「该函数读取 bohai_model_configs（仅管理员 SELECT），
--     若未来授予 authenticated 调用，非 admin 会因 RLS 返回空集导致 multiplier 回退」。
--   · 2026092906_ai_coding_pack_sales.sql:187 用 create or replace 重写时
--     **没带这个属性**  ⇒ 被改回 invoker，此后无迁移补回（已逐个数过）。
--
-- ── 为什么现在必须修 ────────────────────────────────────────────────────
--   `bohai_model_configs` 只有一条 SELECT 策略 `current_user_is_admin()`，
--   非管理员角色查不到行 ⇒ 回退到 MODE_TOKEN_MULTIPLIERS 的默认值 1。
--   主链路目前未受影响（EF 经 settle_ai_token_quota 调用，它是 SECURITY DEFINER、
--   owner 即表 owner），但**任何以 authenticated 角色直接调它的新代码**
--   都会静默拿到 1x —— 这正是「静默失败」的典型形态。
--
-- ── 本迁移只做一件事 ────────────────────────────────────────────────────
--   加回 security definer。函数体与 2026092906 完全一致（greatest(0, ...) 下限
--   保留 —— 免费模型 0 倍率合法，别再退回 0.1）。
--
-- 幂等：create or replace，可重复执行。不改数据、不改表结构。
-- 回滚：见文件末尾。
-- ============================================================================

create or replace function public.get_ai_mode_token_multiplier(p_mode text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, coalesce((
    select config.quota_multiplier
      from public.bohai_model_configs as config
     where lower(trim(config.mode_id)) = lower(trim(coalesce(p_mode, '')))
     order by config.updated_at desc
     limit 1
  ), case lower(trim(coalesce(p_mode, '')))
    when 'pro' then 2 when 'max' then 3 when 'ultra' then 4 else 1
  end));
$$;

-- 权限保持与 2026092906 一致：只给 service_role（EF 用），不放开给 anon/authenticated。
-- 这与「有 security definer」不矛盾：属性解决的是**执行者身份**，grant 解决的是**谁能调**。
revoke all on function public.get_ai_mode_token_multiplier(text) from public;
grant execute on function public.get_ai_mode_token_multiplier(text) to service_role;

comment on function public.get_ai_mode_token_multiplier(text) is
  '按 mode_id 取模式倍率；查不到时回落 pro=2/max=3/ultra=4/其余=1。'
  ' 必须保持 SECURITY DEFINER：它读 bohai_model_configs（RLS 仅 admin SELECT），'
  ' 否则非管理员角色会静默拿到 1（2026-10-20 修复过一次，见迁移 2026102001）。';

-- ── 自证（执行后逐条跑）──────────────────────────────────────────────────
--   select prosecdef from pg_proc where proname='get_ai_mode_token_multiplier';
--     ⇒ 期望 true
--   select get_ai_mode_token_multiplier('Air'), get_ai_mode_token_multiplier('fast');
--     ⇒ 期望 0.30 | 0
--   begin; set local role authenticated;
--   select get_ai_mode_token_multiplier('Air');  rollback;
--     ⇒ 期望 0.30（修复前是 1）

-- 回滚（会重新引入权限回退缺陷，仅在确认放弃本次修复时使用）：
--   create or replace function public.get_ai_mode_token_multiplier(p_mode text)
--   returns numeric language sql stable set search_path = public as $$
--     select greatest(0, coalesce((
--       select config.quota_multiplier
--         from public.bohai_model_configs as config
--        where lower(trim(config.mode_id)) = lower(trim(coalesce(p_mode, '')))
--        order by config.updated_at desc limit 1
--     ), case lower(trim(coalesce(p_mode, '')))
--       when 'pro' then 2 when 'max' then 3 when 'ultra' then 4 else 1
--     end));
--   $$;

notify pgrst, 'reload schema';
