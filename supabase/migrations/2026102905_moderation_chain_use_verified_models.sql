-- 审核降级链改到「实测可用」的模型（2026-10-29 晚，修正 2026102904 的选型）
--
-- ── 为什么改 ────────────────────────────────────────────────────────
-- 2026102904 按「版本号最新优先」把主模型指向 gemini-3.8-flash。端到端实测推翻了它：
-- 同一条真实链路（EF → Cloudflare Worker → Gemini，guest 身份临时放行，测完还原）结果：
--
--   gemini-3.8-flash       ✗ 503 / 30s AbortSignal 超时 —— **纯文本就挂**，与是否带图无关
--   gemini-3.6-flash       ✓ 文本 ~3.0s；带图返回 {"nsfw":false}
--   gemini-3.5-flash       ✓ 文本 5.6s；带图返回「蓝色」
--   gemini-3.5-flash-lite  ✓ 文本/带图均正常，带图 5.8s
--
-- 后果比"白排一次队"严重：客户端 image-moderation-pipeline 的 CLOUD_TIMEOUT_MS = 2500，
-- 而主模型要卡满 30s 才放弃 ⇒ **每张图的云端审核都会先在客户端超时**，全部回落到
-- 本地 nsfwjs 从宽判定（只有 ≥0.75 才拦）。也就是说主模型选错 = 云端审核等于关闭。
--
-- 教训：选型口径是「**当前链路实测可用** + 尽量新」，不是「版本号最大」。
--      新版模型 id 在代理/账号白名单里未必已经开通，写进配置前必须先跑一次真请求。
--
-- ── 本次改动 ────────────────────────────────────────────────────────
-- 主：gemini-3.6-flash（实测最快，且比 3.5 新）→ 备1：gemini-3.5-flash → 备2：gemini-3.5-flash-lite
-- 图片与文本两条链同步改；链条结构、列定义、上限 3 跳的约束都不动。

begin;

update public.bohai_model_configs
   set model_id = 'gemini-3.6-flash',
       updated_at = now()
 where mode_id = 'moderation-image';

update public.bohai_model_configs
   set model_id = 'gemini-3.6-flash',
       updated_at = now()
 where mode_id = 'moderation-text';

update public.bohai_model_configs
   set model_id = 'gemini-3.5-flash',
       notes = '降级链专用行：2026-10-29 实测 gemini-3.5-flash 文本/带图均正常。',
       updated_at = now()
 where mode_id in ('moderation-image-fb1', 'moderation-text-fb1');

update public.bohai_model_configs
   set notes = '降级链专用行：gemini-3.5-flash-lite，2026-10-29 实测带图正常；亦是 2026-10-29 之前的主模型。',
       updated_at = now()
 where mode_id in ('moderation-image-fb2', 'moderation-text-fb2');

commit;
