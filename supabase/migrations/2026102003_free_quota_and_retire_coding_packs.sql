-- ============================================================================
-- 阶段 2+3：free 额度 0 → 50000，并下线 Coding 附加包
--
-- 配套方案：plans/030-bohai-strategy-model-tier-rework.md §3.3 / §5
--
-- ── 一、free 额度 0 → 50000 ─────────────────────────────────────────────
--   现状：free.daily_token_limit = 0 ⇒ 免费用户没有免费额度，每次对话直接走积分兜底。
--   改为 50000：注册即有一定免费量，用完才烧积分。
--     · 按 cost 0.45x 约 111 条、balance 1.10x 约 45 条（按 1000 token/条估）
--     · 比 guest(30000) 多一点，体现"注册有用"
--     · 远低于 plus(400000)，订阅仍有意义
--   ⚠️ 连带副作用（需前端同步，见 §3.3 风险表）：
--       subscription-benefits.js 的 PLAN_AI_TOKEN_LIMITS.free 也必须改，
--       否则订阅页仍宣传"无额度"，与系统实际不符。
--       改后 free 在对比表里由 `—` 变成 12.5%（Plus=100%）。
--
-- ── 二、Coding 附加包下线 ───────────────────────────────────────────────
--   下线依据（2026-10-20 实测）：user_subscriptions 里 plan_code like 'coding-%' **零行**
--     ⇒ 无需退款/折算/到期保留等善后。
--
--   为什么删（方案 §1）：一个 plan_code 同时承担两个正交职责 ——
--     · "每天多 N 万 token" 的额度加成（加法，sumCodingBonuses）
--     · "能不能用某些模型" 的准入阶梯（比较，CODING_PLAN_RANK）
--   两者共用同一标识符，导致 min_tier 出现两套合法值域、两个查找表、
--   一个必须前后端对齐的数值（ai-coding-pack-bonus-parity.test.js 专治）。
--   本次把"准入"收敛为 guest/free 两种，"额度加成"随包一起消失。
--
--   处置：价格表**不物理删**，只置 is_active=false（留审计痕迹 + 可回滚）。
--         RPC subscribe_coding_pack_with_points 保留定义但 revoke 执行权，
--         避免"菜单没了但接口还能直接调"。
--
-- 幂等：update / revoke 均可重复执行。
-- 回滚：见文件末尾。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 一、free 额度 0 → 50000
-- ---------------------------------------------------------------------------
update public.ai_quota_config
   set daily_token_limit = 50000,
       updated_at = now()
 where tier = 'free'
   and daily_token_limit = 0;          -- 只改"当前还是 0"的行，避免覆盖人工调整过的值

-- ---------------------------------------------------------------------------
-- 二、Coding 包价格下架（保留行）
-- ---------------------------------------------------------------------------
update public.subscription_plan_prices
   set is_active = false,
       updated_at = now()
 where plan_code like 'coding-%'
   and is_active = true;

-- ---------------------------------------------------------------------------
-- 三、关闭购买 RPC 的执行权（防"菜单没了但接口还能直连"）
--   函数体保留：历史调用方若仍调用会拿到 EXECUTE 权限错误，而不是"函数不存在"，
--   报错更容易定位。确认零调用后可另起迁移 drop。
-- ---------------------------------------------------------------------------
revoke execute on function public.subscribe_coding_pack_with_points(text, text, jsonb)
  from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 四、min_tier 约束收窄：去掉 4 个 coding-* 合法值
--   收窄后只剩 guest/free/plus/pro/max/ultra —— 前两个是本方案实际用到的，
--   后四个保留是为了不让本迁移连带拒绝"未来若恢复付费档准入"的需求
--   （方案 D11 只要求"档位只分游客/登录"，不要求物理删除档位词表）。
--   ⚠️ 收窄前必须确保没有行还带着 coding-* —— 2026102002 已把 Code 改成 free，
--      这里再兜一次底：万一有遗漏，先报错而不是静默通过。
-- ---------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  select count(*) into v_left
    from public.bohai_model_configs
   where min_tier like 'coding-%';

  if v_left > 0 then
    raise exception
      '仍有 % 行 min_tier 是 coding-*，请先执行 2026102002 再收窄约束', v_left;
  end if;
end $$;

alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_min_tier_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_min_tier_check
  check (min_tier in ('guest', 'free', 'plus', 'pro', 'max', 'ultra'));

commit;

-- ── 自证（执行后逐条跑）──────────────────────────────────────────────────
--   select tier, daily_token_limit from public.ai_quota_config where tier='free';
--     ⇒ 期望 50000
--
--   select count(*) from public.subscription_plan_prices
--    where plan_code like 'coding-%' and is_active;
--     ⇒ 期望 0
--
--   select count(*) from public.subscription_plan_prices
--    where plan_code like 'coding-%';
--     ⇒ 期望 8（行还在，只是下架）
--
--   select has_function_privilege('authenticated',
--            'public.subscribe_coding_pack_with_points(text,text,jsonb)', 'EXECUTE');
--     ⇒ 期望 false
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'bohai_model_configs_min_tier_check';
--     ⇒ 期望不含 coding-
--
-- ⚠️ 前端必须同批改 PLAN_AI_TOKEN_LIMITS.free（0 → 50000），
--    否则订阅页口径与系统实际不一致（AGENTS.md §3「量化结论必须带判据」同源问题）。

-- 回滚：
--   update public.ai_quota_config set daily_token_limit = 0, updated_at = now() where tier='free';
--   update public.subscription_plan_prices set is_active = true, updated_at = now()
--    where plan_code like 'coding-%';
--   grant execute on function public.subscribe_coding_pack_with_points(text, text, jsonb)
--     to authenticated;
--   alter table public.bohai_model_configs drop constraint if exists bohai_model_configs_min_tier_check;
--   alter table public.bohai_model_configs add constraint bohai_model_configs_min_tier_check
--     check (min_tier in ('guest','free','plus','pro','max','ultra',
--                         'coding-lite','coding-plus','coding-pro','coding-ultra'));

notify pgrst, 'reload schema';
