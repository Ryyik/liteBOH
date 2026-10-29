-- 审核链按「实测延迟」排序（2026-10-29 晚，第二次修正：905 的选型也被实测推翻）
--
-- ── 905 错在哪 ──────────────────────────────────────────────────────
-- 905 把主模型换成 gemini-3.6-flash，理由是「3.8 不通、3.6 比 3.5 新」。
-- 但审核链的瓶颈不是画质而是**延迟**（客户端只有 2500ms），实测 224px 送审尺寸：
--
--   gemini-3.5-flash-lite  3075 / 2622 ms   ← 最快
--   gemini-3.5-flash       3286 / 3902 ms
--   gemini-3.6-flash       5044 / 3594 ms   ← 905 选它当主模型，恰恰是最慢的
--
-- 这个档位（lite = 官方「高吞吐执行」档）同时也是「不拥挤」的那一档，
-- 与产品口径「最新 + 不拥挤优先，冲突时以不拥挤优先」一致。
--
-- ── 最终顺序 ────────────────────────────────────────────────────────
-- 主：gemini-3.5-flash-lite（最快、限流最宽、且是 2026-10-29 之前长期在跑的主模型）
-- 备1：gemini-3.5-flash      （质量更好，慢约 0.8s）
-- 备2：gemini-3.6-flash      （最新一代，作末跳；慢但新）
--
-- ⚠️ 仍然存在的硬约束：最快 2.6~3.1s 也**大于客户端 CLOUD_TIMEOUT_MS = 2500**。
--    也就是说图片云端审核目前大概率在客户端先超时、回落本地 nsfwjs 从宽判定。
--    要不要抬高这个超时是产品取舍（抬高=云端审核真的生效，但发帖等待变长），
--    未拍板前不改；本次只把「能选的最快模型」放到主位。

begin;

update public.bohai_model_configs
   set model_id = 'gemini-3.5-flash-lite',
       notes = '审核主模型（2026-10-29 实测：224px 送审 2.6~3.1s，是三个候选里最快的；亦是 2026-10-29 之前长期在跑的主模型）。',
       updated_at = now()
 where mode_id in ('moderation-image', 'moderation-text');

update public.bohai_model_configs
   set model_id = 'gemini-3.5-flash',
       notes = '降级链第一跳（2026-10-29 实测 3.3~3.9s，质量优于 lite）。',
       updated_at = now()
 where mode_id in ('moderation-image-fb1', 'moderation-text-fb1');

update public.bohai_model_configs
   set model_id = 'gemini-3.6-flash',
       notes = '降级链末跳（2026-10-29 实测 3.6~5.0s，最新一代但最慢，仅作最后一道保险）。',
       updated_at = now()
 where mode_id in ('moderation-image-fb2', 'moderation-text-fb2');

commit;
