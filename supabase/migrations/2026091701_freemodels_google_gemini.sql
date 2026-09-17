-- 免费模型库加入 Google Gemini 系列（8 个，均实测可用）
--
-- 收录依据：2026-09-17 用线上 key 经 Cloudflare 反代（boh-gemini-proxy）逐个实测，
-- 走的是 vault runtime-chat-stream 的真实请求形状（含 Worker 注入的 reasoning_effort=low）。
-- 只有返回 200 且拿到正文的模型才收录。
--
-- 实测未收录及原因：
--   gemini-3.1-pro-preview  429  免费档不给 Pro 类
--   gemini-pro-latest       429  同上
--   gemini-2.5-pro          404  官方已对新用户下线（no longer available to new users）
--   gemini-3.8-flash        503  当前持续过载，等稳定后再评估
--   gemma-4-26b-a4b-it      200  可用，但思考过程会以 <thought> 标签混入正文，直接展示给用户会出问题
--   gemma-4-31b-it          200  同上，且实测稳定性差（多次 500/503）
--   gemini-*-latest 别名    未收录：会随 Google 更新静默换模型，行为会漂
--
-- 注意：这些行只是让模型出现在「模型ID」下拉框里。要真正路由到 Gemini，
-- 还需要 api_key_vault 里有 provider=custom / purpose=chat 的密钥
-- （该表的 encrypted_value 由 Edge Function 用 API_KEY_VAULT_MASTER_KEY 加密，
--   SQL 无法生成密文，必须在管理后台「API 密钥」页录入），
-- 以及 bohai_model_configs 里对应模式的 provider/api_url 指向反代。

begin;

insert into public.freemodels (
  model_id,
  name,
  family_label,
  best_for,
  is_active,
  sort_order,
  provider,
  provider_label,
  api_base_url
) values
  ('gemini-3.7-flash',      'Gemini 3.7 Flash',      'Gemini',      '最新 Flash，综合对话（首次调用冷启动较慢）', true, 100, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-3.6-flash',      'Gemini 3.6 Flash',      'Gemini',      '通用对话，质量与速度均衡',                   true, 101, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-3.5-flash',      'Gemini 3.5 Flash',      'Gemini',      '通用对话，响应快',                           true, 102, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'Gemini 轻量', '极速响应，实测延迟最低',                     true, 103, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Gemini 轻量', '低成本高频调用',                             true, 104, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-3-flash-preview','Gemini 3 Flash 预览',   'Gemini 预览', '预览版，行为可能随 Google 更新变动',         true, 105, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-2.5-flash',      'Gemini 2.5 Flash',      'Gemini',      '上一代稳定通用',                             true, 106, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions'),
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Gemini 轻量', '上一代轻量',                                 true, 107, 'custom', 'Google Gemini', 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions')
on conflict (model_id) do nothing;

commit;


-- ============================================================
-- 以下为可选项，确认反代端到端可用后再手动执行
-- 前置条件（缺一不可，否则模式启用后调用会直接失败）：
--   1. api_key_vault 里已有 provider='custom'、purpose='chat' 的密钥，
--      值为 Worker 的 PROXY_TOKEN；metadata.apiUrl 填反代的 chat/completions 地址。
--   2. Cloudflare Worker 的 GEMINI_API_KEY / PROXY_TOKEN 已就位（/health 两个 flag 均为 true）。
-- ============================================================
--
-- begin;
--
-- insert into public.bohai_model_configs (
--   mode_id, display_name, tagline, description,
--   provider, provider_label, model_id, api_url,
--   capability, icon,
--   temperature, top_p, frequency_penalty, max_tokens,
--   status, sort_order, notes
-- ) values (
--   'gemini', 'Gemini', '谷歌模型', 'Google Gemini 3.5 Flash（经自建反代）',
--   'custom', 'Google Gemini', 'gemini-3.5-flash',
--   'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
--   'chat', 'sparkles',
--   0.20, 0.75, 0.06, 1800,
--   -- 先置 disabled，避免密钥未就位时被用户选到；验证通过后再改 active
--   'disabled', 60, '经 Cloudflare 反代接入 Gemini。max_tokens 不要低于 512：thinking 会占用同一预算，过小会导致输出为空。'
-- )
-- on conflict (mode_id) do update set
--   display_name   = excluded.display_name,
--   tagline        = excluded.tagline,
--   description    = excluded.description,
--   provider       = excluded.provider,
--   provider_label = excluded.provider_label,
--   model_id       = excluded.model_id,
--   api_url        = excluded.api_url,
--   capability     = excluded.capability,
--   icon           = excluded.icon,
--   temperature    = excluded.temperature,
--   top_p          = excluded.top_p,
--   frequency_penalty = excluded.frequency_penalty,
--   max_tokens     = excluded.max_tokens,
--   status         = excluded.status,
--   sort_order     = excluded.sort_order,
--   notes          = excluded.notes;
--
-- commit;
