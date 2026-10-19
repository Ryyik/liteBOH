-- 修复：审核专用模式（moderation-text / moderation-image）泄漏到用户侧模式选择器
--
-- 现场（2026-10-18 用户报障）：后台「审核模型配置」把文本/图片审核两块打开后，
-- BOHAI 输入框的模型菜单里出现「审核·文本 0.1x」「审核·图片 0.1x」两项，可被普通用户选中对话。
--
-- 根因：`list_public_bohai_modes` 的 WHERE 只有 `status = 'active'`，**没有任何内部模式过滤**。
-- 审核两行平时是 status='disabled'（迁移 2026091703 刻意如此）⇒ 看不见；一旦管理员在
-- 「审核模型配置」页启用（ModerationModelConfig 会把该行置为 active）⇒ 立刻混进公开列表。
-- 换句话说，这不是「启用审核」的副作用，而是**列表查询少了排除条件**，只在启用后才暴露。
--
-- 危害不止 UI：
--   ① 用户能选到它，实际打的是 gemini-3.5-flash（quota_multiplier = 0.1）——
--      等于给所有人开了一条 0.1x 的廉价聊天通道，绕开 gemini 模式（1.5x / min_tier=pro）；
--   ② 该行的 max_tokens=256、temperature=0.1 是给审核 JSON 输出调的，拿来聊天体验也差。
--
-- 修法：与 DataAdmin 后台列表同口径 —— 排除 `moderation-` 保留前缀的行
--   （前缀的 JS 侧单一真源：src/views/DataManagement/config/bohai-internal-modes.js）。
--   SQL 里必须硬编码字面量（函数无法 import JS），两边同步由
--   tests/unit/bohai-internal-modes.test.js 的最后一条断言锁死：
--   它读「本仓最后一次定义 list_public_bohai_modes 的迁移」，断言排除条件用的是同一个前缀。
--
-- 幂等：drop + create（返回列不变，create or replace 也可，这里与历史写法保持一致）；
--       不新增表/列，不改数据。
--
-- ⚠️ 本迁移只解决「列表里看不到」。真正的越权面在 EF 侧：
--    mode 是请求体字段，用户仍可直连 runtime-chat 伪造 mode='moderation-text'。
--    那道闸门在 supabase/functions/api-key-vault/index.ts 的 resolveRuntimeModelPolicy
--    （按 purpose 判定，需 `supabase functions deploy api-key-vault` 才生效）。

drop function if exists public.list_public_bohai_modes();

create function public.list_public_bohai_modes()
returns table(
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
stable
security definer
set search_path = public
as $$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, min_tier, sort_order,
         quota_multiplier
    from public.bohai_model_configs
   where status = 'active'
     -- 审核专用行由「审核模型配置」页维护，不进用户侧模式选择器
     and mode_id not like 'moderation-%'
   order by sort_order asc, display_name asc;
$$;

revoke all on function public.list_public_bohai_modes() from public;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;
