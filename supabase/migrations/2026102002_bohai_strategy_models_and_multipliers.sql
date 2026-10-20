-- ============================================================================
-- 阶段 1：BOH AI 模型体系重构 —— 改名 / 倍率 / min_tier / 排序 / 3 个策略行
--
-- 配套方案：plans/030-bohai-strategy-model-tier-rework.md
--
-- ── 本次改的四件事 ──────────────────────────────────────────────────────
--   ① 6 个用户可见模型的 display_name 改成模型名（用户看到的是模型，不是"模式"）
--   ② 倍率按方案重排（0.0 / 0.5 / 1.2 / 1.5 / 2.4 / 3.0）
--   ③ min_tier 收窄：只留「guest 可用」与「登录即可」两种语义
--        · fast(GLM4)  = guest   ← 唯一对游客开放
--        · 其余全部      = free    ← 原 Code 的 coding-lite、gemini 的 pro 一并放开
--   ④ 新增 3 个策略行（cost / balance / intelligence），排在最前
--
-- ── 阶段 1 先固定绑定（不加随机）─────────────────────────────────────────
--   strategy_candidates 留到阶段 6 再填（见方案 §6.2）。此时策略就是普通行，
--   EF 与前端零改动即可选中，用于先验证「策略倍率能否正确扣费」。
--
-- ── 为什么不改 mode_id ───────────────────────────────────────────────────
--   方案 D10：mode_id 同时是
--     · 主键（unique 约束）
--     · ai_quota_log.mode 的关联键（30 天内 183 条真实记录，全小写）
--     · 审核行的隔离依据（mode_id not like 'moderation-%'）
--   改它会让历史日志脱节 + 用户 localStorage('boh_ai_mode_v1') 失效。
--   本次一律**只改 display_name**，mode_id 保持原样（含大小写）。
--
-- 幂等：全部 update ... where / on conflict do nothing，可重复执行。
-- 回滚：见文件末尾。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 6 个用户可见模型：display_name + 倍率
--    ⚠️ 用 mode_id 做 where 条件时保留原始大小写（Air / Code / Ultra / 38Flash）。
--       不能写 lower(mode_id)=... —— 那会连大小写变体一起改到（虽然现在没有）。
-- ---------------------------------------------------------------------------
update public.bohai_model_configs
   set display_name  = 'GLM4',
       quota_multiplier = 0.00,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = 'fast';

update public.bohai_model_configs
   set display_name  = 'GLM4Flash',
       quota_multiplier = 0.50,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = 'Air';

update public.bohai_model_configs
   set display_name  = 'Openrouter',
       quota_multiplier = 1.20,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = 'Ultra';

update public.bohai_model_configs
   set display_name  = 'GLMZ1Flash',
       quota_multiplier = 1.50,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = 'Code';

update public.bohai_model_configs
   set display_name  = 'Gemini3.5Flash',
       quota_multiplier = 2.40,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = 'gemini';

update public.bohai_model_configs
   set display_name  = 'Gemini3.8Flash',
       quota_multiplier = 3.00,
       sort_order    = 100,
       updated_at    = now()
 where mode_id = '38Flash';

-- ---------------------------------------------------------------------------
-- ② min_tier 收窄
--    语义只剩两种：
--      guest = 游客也能用（本次只有 GLM4）
--      free  = 登录即用（其余全部）
--
--    ⚠️ fast 必须保持 guest：它是游客唯一的入口，改了就没人能用。
--    ⚠️ Code 必须从 coding-lite 改走：Coding 包下线后该值会从合法域消失。
--    ⚠️ gemini 从 pro 放开：方案 D11 的口径是"登录后全开"，档位只分游客/登录。
-- ---------------------------------------------------------------------------
update public.bohai_model_configs
   set min_tier = 'guest', updated_at = now()
 where mode_id = 'fast';

update public.bohai_model_configs
   set min_tier = 'free', updated_at = now()
 where mode_id in ('Air', 'Ultra', 'Code', 'gemini', '38Flash');

-- ---------------------------------------------------------------------------
-- ③ 新增 3 个策略行
--    ⚠️ model_id / provider / api_url 先指向"固定绑定"的那个模型（阶段 1 不随机）。
--       这三行本身不改动那些模型行，只是复制其连接信息。
--    ⚠️ capability 必须落在 check 允许值内（chat / multimodal / plan / agent）——用 chat。
--    ⚠️ 倍率：cost 0.45 / balance 1.10 / intelligence 2.10
--       定价依据见方案 §3.1（期望值 0.35 / 1.15 / 2.46，刻意做成窄幅溢价）。
-- ---------------------------------------------------------------------------
insert into public.bohai_model_configs (
  mode_id, display_name, tagline, description,
  provider, provider_label, model_id, api_url,
  capability, icon,
  temperature, top_p, frequency_penalty, max_tokens,
  status, sort_order, min_tier, quota_multiplier, notes
) values
  (
    'cost', 'Cost', '性价比优先',
    '自动选择高性价比模型，适合日常问答与快速处理',
    'zhipu', '智谱 GLM Chat', 'GLM-4-Flash-250414',
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    'chat', 'zap',
    0.18, 0.72, 0.05, 1600,
    'active', 10, 'free', 0.45,
    '策略行：阶段 1 固定绑定 GLM-4-Flash-250414；阶段 6 由 strategy_candidates 随机。'
  ),
  (
    'balance', 'Balance', '日常推荐',
    '质量与消耗的平衡档，适合大多数对话',
    'zhipu', '智谱 GLM Chat', 'GLM-Z1-Flash',
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    'chat', 'sparkles',
    0.18, 0.72, 0.05, 1600,
    'active', 10, 'free', 1.10,
    '策略行（默认模式）：阶段 1 固定绑定 GLM-Z1-Flash；阶段 6 由 strategy_candidates 随机。'
  ),
  (
    'intelligence', 'Intelligence', '最强推理',
    '复杂任务与深度推理，消耗较高',
    'custom', 'Google Gemini', 'gemini-3.8-flash',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'chat', 'brain',
    0.18, 0.72, 0.05, 1600,
    'active', 10, 'free', 2.10,
    '策略行：阶段 1 固定绑定 gemini-3.8-flash；阶段 6 由 strategy_candidates 随机。'
  )
on conflict (mode_id) do nothing;

commit;

-- ── 自证（执行后逐条跑）──────────────────────────────────────────────────
--   select mode_id, display_name, quota_multiplier, min_tier, sort_order, status
--     from public.bohai_model_configs
--    where status = 'active' and mode_id not like 'moderation-%'
--    order by sort_order, display_name;
--     ⇒ 期望顺序：Cost / Balance / Intelligence（sort_order 10）
--                 GLM4 / GLM4Flash / Openrouter / GLMZ1Flash / Gemini3.5Flash / Gemini3.8Flash（100）
--
--   select get_ai_mode_token_multiplier('cost'),
--          get_ai_mode_token_multiplier('balance'),
--          get_ai_mode_token_multiplier('intelligence'),
--          get_ai_mode_token_multiplier('Air'),
--          get_ai_mode_token_multiplier('Code');
--     ⇒ 期望 0.45 | 1.10 | 2.10 | 0.50 | 1.50
--
--   select count(*) from public.bohai_model_configs
--    where min_tier in ('plus','pro','max','ultra') and status='active';
--     ⇒ 期望 0（档位门槛已收敛为 guest/free 两种）
--
-- ⚠️ 注意：EF 的 MODEL_CONFIG_CACHE / QUOTA_CONFIG_CACHE TTL 是 5 分钟，
--    改完最多 5 分钟才生效 —— 调试时别误判成"没改上"。

-- 回滚：回到 2026-10-20 之前的线上值
--   update public.bohai_model_configs set display_name='Fast', quota_multiplier=0.00, min_tier='guest', sort_order=10 where mode_id='fast';
--   update public.bohai_model_configs set display_name='Air', quota_multiplier=0.30, min_tier='free', sort_order=10 where mode_id='Air';
--   update public.bohai_model_configs set display_name='Ultra', quota_multiplier=1.00, min_tier='free', sort_order=10 where mode_id='Ultra';
--   update public.bohai_model_configs set display_name='Code', quota_multiplier=0.50, min_tier='coding-lite', sort_order=10 where mode_id='Code';
--   update public.bohai_model_configs set display_name='Gemini', quota_multiplier=1.50, min_tier='pro', sort_order=60 where mode_id='gemini';
--   update public.bohai_model_configs set display_name='3.8flash', quota_multiplier=2.00, min_tier='free', sort_order=10 where mode_id='38Flash';
--   delete from public.bohai_model_configs where mode_id in ('cost','balance','intelligence');
