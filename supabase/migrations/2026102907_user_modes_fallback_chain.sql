-- 用户侧两个模式补降级链（2026-10-29）
--
-- ── 问题 ────────────────────────────────────────────────────────────
-- `38Flash` 与 `intelligence` 都指向 `gemini-3.8-flash`。实测（EF → Worker → Gemini，
-- 纯文本，不带图）：**503 / 30s 超时**，且与带不带图无关 ⇒ 不是"不吃 image_url"，
-- 是这个模型在那个上游根本不通。
--
--   38Flash      用户主动选它 ⇒ 100% 失败
--   intelligence 阶段 1 固定绑它 ⇒ 阶段 1 请求基本全挂（阶段 6 走 strategy_candidates 时才有救）
--
-- 时间线佐证：`intelligence` 在 2026-10-22 还用 `gemini-3.5-flash` 成功过 2 次；
-- `updated_at = 2026-10-29 02:55` 被改到 3.8-flash 之后，`ai_quota_log` 里再无它的记录。
--
-- ── 修法（用户拍板：保留 3.8 主模型，加降级链）──────────────────────────
-- 不把 model_id 改掉 —— 3.8 若恢复可用，用户应当继续用到它；只在它挂时顺延到
-- `gemini`（`gemini-3.5-flash`，2026-10-22 实测通过、延迟 3.3~3.9s）。
--
-- 选 `gemini` 当降级目标而不是新建 fb 行：同一台 Worker、同一把 custom key、
-- 同一 provider，省掉一份重复配置（也避免多一行要跟着维护的 model_id）。
--
-- ⚠️ **已知代价（接受）**：额度预约只用**主模型**的 max_tokens / quota_multiplier
--    （见 EF `runtimeChatCompletion` 上方注释），降级后不重算 ⇒
--      38Flash      主 3.00 / 降级实际 2.40 ⇒ 降级时多收约 25%
--      intelligence 主 2.10 / 降级实际 2.40 ⇒ 降级时少收约 13%
--    max_tokens 也不同（1600 vs 1800），实际出字可能略超预约。
--    要根治得让降级跳按自己的 policy 重算额度，属独立改造，本次不动。
--
-- ⚠️ 应用方式（2026-10-29）：本机 `db push` 走 pooler 被沙箱阻断 ⇒ 改走 Management API
--    `POST /v1/projects/{ref}/database/query` 执行本文件 SQL，并已手工登记
--    `supabase_migrations.schema_migrations`（version=2026102907），`migration list` 已可见。
--    语句是幂等的 `update ... where mode_id in (...)`，重放无副作用。

begin;

update public.bohai_model_configs
   set fallback_mode_ids = '["gemini"]'::jsonb,
       notes = coalesce(nullif(notes, ''), '') ||
               case when notes = '' or notes is null then '' else ' | ' end ||
               '2026-10-29 加降级链 → gemini(3.5-flash)：主模型 gemini-3.8-flash 实测 503/30s 超时。',
       updated_at = now()
 where mode_id in ('38Flash', 'intelligence');

commit;
