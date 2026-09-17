-- 内容审核专用模式：moderation-text（文本审核）/ moderation-image（图片审核）
--
-- 背景：审核调用此前不传 mode，vault 端 resolveRuntimeModelPolicy 落到 fast 行，
-- payload.model 被 policy.modelId 覆盖、body.apiUrl 被忽略 —— 后台「审核模型配置」
-- 实际从未生效。本迁移为审核建立两条固定 mode 行，前端审核调用显式传 mode，
-- vault 既有 policy 机制（model/api_url/temperature 全部服务端裁决）直接生效。
--
-- 图片审核走 Gemini OpenAI 兼容层的 image_url（base64 data URL）多模态输入，
-- 经 Cloudflare 反代（provider=custom），Worker 对 messages 原样透传，无需改动。
--
-- 状态说明：两行刻意落为 status='disabled'：
--   1. 迁移 push 后线上审核行为不变（vault 只认 active 行，disabled 时审核调用
--      收到 MODE_UNAVAILABLE，前端按「云端未配置」直接走本地兜底）。
--   2. 管理员在数据管理面板「审核模型配置」中启用后置为 active。
-- on conflict do nothing：不覆盖管理员可能已手工调整过的配置。

begin;

insert into public.bohai_model_configs (
  mode_id,
  display_name,
  tagline,
  description,
  provider,
  provider_label,
  model_id,
  api_url,
  capability,
  icon,
  temperature,
  top_p,
  frequency_penalty,
  max_tokens,
  status,
  sort_order,
  min_tier,
  quota_multiplier,
  notes
) values
  (
    'moderation-text',
    '审核·文本',
    '文本内容审核',
    '发帖/评论/资料等文字内容的第一层云端审核（本地关键词兜底）',
    'custom',
    'Google Gemini',
    'gemini-3.5-flash',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'chat',
    'shield-check',
    0.100,
    0.500,
    0.000,
    256,
    'disabled',
    900,
    'free',
    0.1,
    '审核专用模式：由数据管理面板「审核模型配置」维护，请勿在 BOHAI 模式列表中启用给用户。审核输出为短 JSON，max_tokens=256 足够。'
  ),
  (
    'moderation-image',
    '审核·图片',
    '图片内容审核',
    '论坛图片/方块墙的第一层云端审核（Gemini 视觉，本地 nsfwjs 兜底）',
    'custom',
    'Google Gemini',
    'gemini-3.5-flash',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'multimodal',
    'shield-check',
    0.100,
    0.500,
    0.000,
    256,
    'disabled',
    901,
    'free',
    0.1,
    '审核专用模式：需选择具备视觉能力的模型（gemini-* 系）。图片以 224px jpeg dataURL 随消息发送，vault 对 image_url 部件按固定 300 token 预扣配额。'
  )
on conflict (mode_id) do nothing;

commit;
