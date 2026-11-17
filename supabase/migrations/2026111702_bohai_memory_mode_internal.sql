-- 2026-11-17：BOHAI「自动记忆沉淀」的抽取模型换成魔搭 ModelScope 的 DeepSeek。
--
-- 背景：对话记忆抽取（treehole-space-api.js 的 extractMemoryCandidatesFromDialogue）调
--   api-key-vault 时**不带 mode** ⇒ EF 侧 `normalizeModeId('') || 'fast'` 兜底到 fast 行，
--   实际跑的是 SiliconFlow 的 THUDM/GLM-4-9B-0414。
--
-- 为什么**不复用**已有的 deepseek 行（modelscope / DeepSeek-V4.1-Flash-1017）：
--   那行 quota_multiplier = 1.00。记忆抽取是「每轮助手回复后自动跑」的后台任务，
--   复用它会静默吃掉用户额度（free 档 50000/日，单次抽取的 prompt+输出约 3k），
--   用户十几轮后就会撞「今日额度已用完」，而且完全不知道是谁扣的 —— 沉淀对用户不可见。
--
-- 为什么**不改** fast 行：
--   fast 同时是游客默认模式（BOH_GUEST_FALLBACK_MODE_ID），还被 lab_ai_model_configs 里
--   周报 / 文档排版 / PPT 三个后台任务绑定。改它会连带换掉游客对话和那三个功能。
--
-- 所以：新开一行 internal-memory，跟 fast 同口径（倍率 0 = 不扣用户额度），只换模型。
-- 降级链挂 fast：ModelScope 挂掉时退回原来的 GLM-4-9B，沉淀不至于整体失效。
--
-- ⚠️ 这一行**不能进用户侧模式选择器**（否则用户菜单里会多出一个「内部·记忆抽取」）。
--    做法是 RPC list_public_bohai_modes 增加 `mode_id not like 'internal-%'`；
--    前缀真源 src/views/DataManagement/config/bohai-internal-modes.js 的 INTERNAL_TASK_MODE_PREFIX，
--    两边同步由 tests/unit/bohai-internal-modes.test.js 锁死。
-- ⚠️ 与 moderation- 行不同：这类行**不做** EF 的 purpose 硬拦 —— 记忆抽取走的是普通
--    purpose='chat' 调用，拦了它自己就用不成。代价是知道 mode_id 的登录用户能直连 EF 用它，
--    且该行倍率 0 不计量。这与 fast 现状同一类问题（fast 也是 0 倍率），随它；
--    真要收口，就给它一个 >0 的倍率，代价是沉淀每轮扣用户几百 tokens。
-- ⚠️ 后台「BOHAI 模型」列表里**保留可见**（审核那两行有专用页面，这行没有）：
--    方便临时停用或换模型，notes 已写明不要把它改成公开模式。

insert into public.bohai_model_configs
  (mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url,
   capability, icon, temperature, top_p, frequency_penalty, max_tokens, status, sort_order,
   notes, min_tier, quota_multiplier, fallback_mode_ids)
values
  ('internal-memory',
   '内部·记忆抽取',
   'BOHAI 自动沉淀专用（勿公开）',
   'BOHAI 每轮对话结束后自动抽取长期记忆时使用。倍率 0：系统后台行为，不扣用户额度。',
   'modelscope',
   '魔搭 ModelScope',
   'deepseek-ai/DeepSeek-V4.1-Flash-1017',
   'https://api-inference.modelscope.cn/v1/chat/completions',
   'chat',
   'brain',
   0.2, 0.75, 0.06, 1200,
   'active',
   900,
   '仅供 src/utils/api/treehole/treehole-space-api.js 的记忆抽取/分块摘要使用。倍率 0 不计量，勿设为公开模式。',
   'free',
   0,
   '["fast"]'::jsonb)
on conflict (mode_id) do update set
  display_name = excluded.display_name,
  tagline = excluded.tagline,
  description = excluded.description,
  provider = excluded.provider,
  provider_label = excluded.provider_label,
  model_id = excluded.model_id,
  api_url = excluded.api_url,
  capability = excluded.capability,
  icon = excluded.icon,
  temperature = excluded.temperature,
  top_p = excluded.top_p,
  frequency_penalty = excluded.frequency_penalty,
  max_tokens = excluded.max_tokens,
  status = excluded.status,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  min_tier = excluded.min_tier,
  quota_multiplier = excluded.quota_multiplier,
  fallback_mode_ids = excluded.fallback_mode_ids,
  updated_at = now();

-- 用户侧模式选择器：内部任务行（记忆抽取等）同样排除。
-- 保留 status='active' 与 moderation-% 两条既有口径，只加第三条。
create or replace function public.list_public_bohai_modes()
returns table (
  id uuid,
  mode_id text,
  display_name text,
  tagline text,
  description text,
  capability text,
  icon text,
  temperature numeric,
  top_p numeric,
  frequency_penalty numeric,
  max_tokens integer,
  min_tier text,
  sort_order integer,
  quota_multiplier numeric
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, min_tier, sort_order,
         quota_multiplier
    from public.bohai_model_configs
   where status = 'active'
     -- 审核专用行由「审核模型配置」页维护，不进用户侧模式选择器
     and mode_id not like 'moderation-%'
     -- 内部任务行（记忆抽取等）同理；前缀真源见 bohai-internal-modes.js
     and mode_id not like 'internal-%'
   order by sort_order asc, display_name asc;
$function$;
