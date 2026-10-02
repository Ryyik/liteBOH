-- ============================================================================
-- AI 额度重平衡：订阅档位额度 ÷2、模式倍率 ÷10、积分汇率 ÷2
--
-- 背景与测算见 docs/2026-10-02-BOHAI模型倍率与积分制度审查.md §6。
--
-- 目标（用户 2026-10-02 提出）：
--   ① 缩减订阅层级发放的 token 额度（名义值偏高，且与真实成本无关）
--   ② 提升各模式的实际可用量
--
-- 公式：每天可用次数 = 档位日额度 ÷ (模式倍率 × 每次实际 token)
--       ⇒ 次数倍数 = 额度保留比例 ÷ 倍率保留比例
--   额度 ÷2 且倍率 ÷10 ⇒ 次数正好 ×5（每个模式、每个档位一致）
--
-- ⚠️ 为什么必须同时改 rate_tokens_per_point：
--   倍率是**全局缩放**，它同时抬高会员的 token 额度和**免费档的积分购买力**。
--   只降倍率+额度、不动汇率的话，「会员 vs 免费档」的差距会从 2.8× 掉到 1.4×
--   （免费档的预算来自积分 5 分/周，不受 daily_token_limit 影响）。
--   汇率 1,000,000 → 500,000 把差距拉回 2.8×。
--
-- 实测折算（次/天，按 30 天线上均值；括号内为改动前）：
--   plus  400k : Air 290(58)  Code 100(20)  Ultra 29(6)   gemini 11(2)
--   pro   1M   : Air 724(145) Code 250(50)  Ultra 73(15)  gemini 28(6)
--   max   2.5M : Air 1811(362) Code 625(125) Ultra 182(36) gemini 70(14)
--   ultra 5M   : Air 3622(724) Code 1250(250) Ultra 364(73) gemini 139(28)
--
-- ⚠️ 已知未解决项（不在本迁移范围）：
--   gemini 走 Google AI Studio 免费档，迁移 2026091702 自注「十几次调用就 429，
--   而 vault 没有 provider 降级机制」。本次把它的会员额度提到 28~139 次/天，
--   可能提前撞上游墙 —— 若出现 429，把 gemini 的倍率改回 15.00 即可（见文末回滚）。
--
-- 回滚：把下面每条的 set 值与 where 条件互换（where 已写明旧值，可直接照抄）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ① 模式倍率 ÷10（fast 保持 0.00 —— 它是免费入口，用户已确认）
-- ---------------------------------------------------------------------------
update public.bohai_model_configs
   set quota_multiplier = 0.30, updated_at = now()
 where lower(trim(mode_id)) = 'air' and quota_multiplier = 3.00;

update public.bohai_model_configs
   set quota_multiplier = 0.50, updated_at = now()
 where lower(trim(mode_id)) = 'code' and quota_multiplier = 5.00;

update public.bohai_model_configs
   set quota_multiplier = 1.00, updated_at = now()
 where lower(trim(mode_id)) = 'ultra' and quota_multiplier = 10.00;

update public.bohai_model_configs
   set quota_multiplier = 1.50, updated_at = now()
 where lower(trim(mode_id)) = 'gemini' and quota_multiplier = 15.00;

-- ---------------------------------------------------------------------------
-- ② 档位日额度 ÷2（guest / free 刻意不动）
--    guest 30,000 因 fast 倍率 0 而实际不生效（计费恒 0），保持原值不动；
--    free 0 表示「无 token 额度，走积分兜底」，语义不变。
--    注意：boh-* 三行是历史遗留死数据（resolveUserTier 永不产出 boh-*），不动。
-- ---------------------------------------------------------------------------
update public.ai_quota_config
   set daily_token_limit = 400000, updated_at = now()
 where tier = 'plus' and daily_token_limit = 800000;

update public.ai_quota_config
   set daily_token_limit = 1000000, updated_at = now()
 where tier = 'pro' and daily_token_limit = 2000000;

update public.ai_quota_config
   set daily_token_limit = 2500000, updated_at = now()
 where tier = 'max' and daily_token_limit = 5000000;

update public.ai_quota_config
   set daily_token_limit = 5000000, updated_at = now()
 where tier = 'ultra' and daily_token_limit = 10000000;

-- ---------------------------------------------------------------------------
-- ③ 积分汇率 ÷2（保住「会员 vs 免费档」2.8× 的差距）
--    含义变化：1 积分从「买 100 万计费 token」变成「买 50 万」。
--    约束：bigint check (rate_tokens_per_point >= 10000) ⇒ 500000 合法。
--    前端 AiQuotaSidePanel.vue 的「1 积分 = N Tokens × 档位倍率」会自动跟着变。
-- ---------------------------------------------------------------------------
update public.ai_pricing_config
   set rate_tokens_per_point = 500000, updated_at = now()
 where id = 1 and rate_tokens_per_point = 1000000;

notify pgrst, 'reload schema';
