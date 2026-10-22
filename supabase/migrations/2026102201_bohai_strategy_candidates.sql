-- ============================================================================
-- 阶段 6：策略行「自动挑选候选模型」+ 倍率统一为「池内最强 × 0.7」
--
-- 配套方案：plans/030-bohai-strategy-model-tier-rework.md §6.2（本文件是它的落地与修订）
--           plans/031-bohai-portrait-mode-picker.md §8 D2（倍率口径）
--
-- ── 本次改的三件事 ──────────────────────────────────────────────────────
--   ① 加列 `strategy_candidates`：策略行的候选池，**只存 mode_id + weight**
--   ② 填三个策略行的池子（权重取自 plans/030 §3.1）
--   ③ 倍率统一成「池内最强模型 × 0.7」：
--        cost        0.45 → 0.35   （最强 GLM4Flash 0.50 × 0.7）
--        balance     1.10 → 1.05   （最强 GLMZ1Flash 1.50 × 0.7）
--        intelligence 2.10 不变    （最强 Gemini3.8Flash 3.00 × 0.7 = 2.10）
--
-- ── 为什么池子里只存 mode_id，不存 provider/model_id/api_url ────────────
--   plans/030 §6.2 的初版把 `{provider, model_id, api_url, max_tokens}` 整份塞进 jsonb。
--   那是**第二份模型配置真源** —— 后台改了 `bohai_model_configs` 里的 api_url，
--   池子里的旧 URL 会继续生效，且没有任何门禁能发现（最高纲领 #1 的反面教材）。
--   而且 jsonb 是后台可编辑的自由文本 ⇒ 填一个任意 URL 就能把全站 AI 请求发到别处
--   （SSRF 面）。改成只存 `mode_id` 后：
--     · 模型配置只有一处真源（本表），改配置自动生效；
--     · 候选行天然带 provider / min_tier / status，EF 侧可以照常过
--       `PROVIDER_OPTIONS` 与 tier 闸门 —— 不需要为 jsonb 再写一套校验。
--
-- ── 为什么不把 strategy_candidates 加进 list_public_bohai_modes ────────
--   刻意**不暴露给客户端**。池子一旦下发，用户就能自己算出"今天这个策略会落到哪个模型"，
--   「随机挑选」退化成「可预测」，同时暴露了后台的选型策略。
--   EF 读它走的是 service_role 直查，不需要经过 RPC。
--
-- 幂等：全部 update ... where（带旧值守卫），可重复执行。
-- 回滚：见文件末尾。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 加列
-- ---------------------------------------------------------------------------
alter table public.bohai_model_configs
  add column if not exists strategy_candidates jsonb;

comment on column public.bohai_model_configs.strategy_candidates is
  '策略行的候选池，形如 [{"mode_id":"Air","weight":70}, ...]。只存 mode_id + 权重，'
  '其余配置（provider / model_id / api_url / max_tokens / 采样参数）一律回查本表。'
  '为空/为 null 表示该行不是策略（固定绑定 model_id）。EF 侧按天加权挑选，见 '
  'api-key-vault 的 resolveStrategyCandidate()。';

-- 形状约束：null 或 1~8 项的数组。元素内部形状由 EF 运行时校验
-- （后台可编辑 jsonb，DB 层写太细的 check 反而会挡住运营微调）。
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'bohai_strategy_candidates_shape'
       and conrelid = 'public.bohai_model_configs'::regclass
  ) then
    alter table public.bohai_model_configs
      add constraint bohai_strategy_candidates_shape
      check (
        strategy_candidates is null
        or (
          jsonb_typeof(strategy_candidates) = 'array'
          and jsonb_array_length(strategy_candidates) between 1 and 8
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ② 三个策略行的候选池（权重取自 plans/030 §3.1）
--    ⚠️ mode_id 保留原始大小写（Air / Code / gemini / 38Flash），与表里的主键一致。
--    ⚠️ 守卫写 `is null`：运营手工调过池子的行**不被覆盖**（重跑迁移不重置运营改动）。
-- ---------------------------------------------------------------------------
update public.bohai_model_configs
   set strategy_candidates =
         '[{"mode_id":"Air","weight":70},{"mode_id":"fast","weight":30}]'::jsonb,
       updated_at = now()
 where mode_id = 'cost'
   and strategy_candidates is null;

update public.bohai_model_configs
   set strategy_candidates =
         '[{"mode_id":"Code","weight":65},{"mode_id":"Air","weight":35}]'::jsonb,
       updated_at = now()
 where mode_id = 'balance'
   and strategy_candidates is null;

update public.bohai_model_configs
   set strategy_candidates =
         '[{"mode_id":"38Flash","weight":40},{"mode_id":"gemini","weight":40},{"mode_id":"Code","weight":20}]'::jsonb,
       updated_at = now()
 where mode_id = 'intelligence'
   and strategy_candidates is null;

-- ---------------------------------------------------------------------------
-- ③ 倍率统一为「池内最强 × 0.7」
--    改之前三个档的折扣是 9 折 / 73 折 / 70 折（用池内最强模型折算）——
--    三个方向不一致，这才是「用户看不懂为什么 Balance 比 GLMZ1Flash 便宜 36%」的根源。
--    统一后每档都有一句用户能自证的话：「比直接选池里最强的便宜 30%」。
--
--    ⚠️ 守卫带旧值（`and quota_multiplier = 0.45`）：
--       运营若已手工调过价，重跑迁移不会把新价盖回去。
--    ⚠️ intelligence 2.10 本来就是 3.00 × 0.7 ⇒ 不动（不写 update，避免无意义写入）。
--    ⚠️ EF 的 MODEL_CONFIG_CACHE TTL 是 5 分钟 ⇒ 改完最多 5 分钟生效，别误判成没改上。
-- ---------------------------------------------------------------------------
update public.bohai_model_configs
   set quota_multiplier = 0.35, updated_at = now()
 where mode_id = 'cost'
   and quota_multiplier = 0.45;

update public.bohai_model_configs
   set quota_multiplier = 1.05, updated_at = now()
 where mode_id = 'balance'
   and quota_multiplier = 1.10;

commit;

-- ── 自证（执行后逐条跑）──────────────────────────────────────────────────
--   select mode_id, display_name, quota_multiplier, min_tier, strategy_candidates
--     from public.bohai_model_configs
--    where mode_id in ('cost','balance','intelligence')
--    order by sort_order, display_name;
--     ⇒ 期望：cost 0.35 / balance 1.05 / intelligence 2.10，三行都有非空数组
--
--   -- 池子里的 mode_id 必须都能在表里查到（EF 侧查不到会跳过该候选）
--   select c.mode_id as strategy, cand->>'mode_id' as candidate,
--          exists(select 1 from public.bohai_model_configs m
--                  where m.mode_id = cand->>'mode_id' and m.status = 'active') as ok
--     from public.bohai_model_configs c,
--          lateral jsonb_array_elements(c.strategy_candidates) cand
--    where c.strategy_candidates is not null;
--     ⇒ 期望 ok 全为 true
--
--   -- 权重和（EF 用 h % total 取模，total 必须 > 0）
--   select mode_id, sum((cand->>'weight')::int) as weight_total
--     from public.bohai_model_configs, lateral jsonb_array_elements(strategy_candidates) cand
--    where strategy_candidates is not null group by mode_id;
--     ⇒ 期望 100 / 100 / 100
--
--   -- 客户端拿不到池子（防可预测）
--   select * from public.list_public_bohai_modes() where mode_id = 'balance';
--     ⇒ 期望返回列里**没有** strategy_candidates
--
-- ── 回滚 ────────────────────────────────────────────────────────────────
--   update public.bohai_model_configs set quota_multiplier = 0.45 where mode_id = 'cost';
--   update public.bohai_model_configs set quota_multiplier = 1.10 where mode_id = 'balance';
--   update public.bohai_model_configs set strategy_candidates = null
--    where mode_id in ('cost','balance','intelligence');
--   alter table public.bohai_model_configs drop constraint if exists bohai_strategy_candidates_shape;
--   -- 列保留（EF 旧版本不读它，留着无害；要彻底删再执行下面这行）
--   -- alter table public.bohai_model_configs drop column if exists strategy_candidates;
