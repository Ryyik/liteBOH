-- BOHAI 增加一个走自建反代的 Gemini 模式（灰度用）
--
-- 状态说明：这条迁移刻意落为 status='disabled'，原因有两个
--   1. api_key_vault 里 provider=custom / purpose=chat 的密钥还没录入
--      （该表 encrypted_value 由 Edge Function 加密，SQL 造不出密文），
--      密钥缺席时启用该模式，用户选中就是直接报错。
--   2. 实测 Gemini 免费档额度很紧，十几次调用就 429，而 vault 没有 provider 降级机制。
--      先限定 min_tier='pro' 把面收窄，确认容量后再决定是否放开。
--
-- 启用方式（密钥录入、端到端验证通过后）：把下面 status 改成 'active'，
-- 或直接在数据管理面板的「BOHAI 模型」里切换。

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
  notes
) values (
  'gemini',
  'Gemini',
  '谷歌模型',
  'Google Gemini 3.5 Flash，经自建 Cloudflare 反代接入',
  'custom',
  'Google Gemini',
  'gemini-3.5-flash',
  'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
  'chat',
  'sparkles',
  0.20,
  0.75,
  0.06,
  1800,
  'disabled',
  60,
  'pro',
  'max_tokens 不要低于 512：Gemini 的 thinking 与正文共享同一预算，过小会返回合法但空内容的响应。'
)
on conflict (mode_id) do nothing;

commit;
