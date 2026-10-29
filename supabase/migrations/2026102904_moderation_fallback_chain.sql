-- 审核模型的**服务端降级链**（2026-10-29）
--
-- ── 问题 ────────────────────────────────────────────────────────────
-- 此前 vault 的 resolveRuntimeModelPolicy 只解析出**一个** model_id，Worker 是纯透传，
-- resolveActiveSecret 也只取单行密钥 ⇒ 整条远端审核是「单模型 + 单密钥 + 单次请求」。
-- 结果是：Gemini 某个模型下线 / 该模型被限流 / 上游 5xx，唯一的兜底就是**前端**回落到
-- 本地 nsfwjs（而且是从宽判定：只有 ≥0.75 才拦）。云端之间没有任何互备。
--
-- ── 本次改动 ────────────────────────────────────────────────────────
-- 1. 新增列 `fallback_mode_ids jsonb`：**只存 mode_id 数组**，顺序即降级顺序。
--    与 strategy_candidates 同一套防 SSRF 约定 —— provider / model_id / api_url 一律回查本表，
--    jsonb 里不放 URL（放了就等于给了个把全站请求打出去的跳板）。
-- 2. 新建 4 行备用模式（moderation- 前缀 ⇒ 用户侧列表天然不可见，见迁移 2026101801）。
-- 3. 把两个审核主模式指到**最新的 Flash**，后备按「不拥挤」排序。
--
-- ── 选型：最新优先，后备按拥挤度升序 ──────────────────────────────────
-- 主模型 `gemini-3.8-flash`：当前最新 Flash（官方 2026-09-02），视觉能力强于 3.5-lite。
-- 后备一 `gemini-3.6-flash`：上一代 Flash，容量比刚发布的新档宽松，质量与主模型同级。
-- 后备二 `gemini-3.5-flash-lite`：官方定位「高吞吐执行」的 lite 档，限流阈值最宽、单价最低，
--        且**现网已经用它跑了很久**（本次改动之前 moderation-image 就是它）⇒ 可用性已验证。
--
-- ⚠️ 这条链挡的是「某个模型不可用 / 该模型被限流」，**挡不住**「Cloudflare Worker 挂了」
--    或「那把 Gemini key 失效」—— 三者共用同一个 Worker 与同一把 key，那类故障仍然
--    直接落本地兜底。要做到那层独立，得再配第二个反代或第二把 key。
--
-- ⚠️ 与 strategy_candidates 的区别（别混用）：那个是「按北京日期 + 用户加权轮换」的负载分摊，
--    语义是"今天用谁"；本列的语义是"挂了换谁"，是从前到后的**顺序降级**，不掷骰子。

begin;

-- 1) 降级链列 ---------------------------------------------------------------
alter table public.bohai_model_configs
  add column if not exists fallback_mode_ids jsonb not null default '[]'::jsonb;

-- 形状约束：必须是数组，最多 3 跳（链条再长只会推迟失败，不会更可靠）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bohai_model_configs_fallback_mode_ids_shape'
      and conrelid = 'public.bohai_model_configs'::regclass
  ) then
    alter table public.bohai_model_configs
      add constraint bohai_model_configs_fallback_mode_ids_shape
      check (
        jsonb_typeof(fallback_mode_ids) = 'array'
        and jsonb_array_length(fallback_mode_ids) <= 3
      );
  end if;
end $$;

comment on column public.bohai_model_configs.fallback_mode_ids is
  '顺序降级链：存 mode_id 数组，前一个模型调用失败(5xx/429/404/网络)时依次尝试。只存 mode_id，provider/model_id/api_url 一律回查本表（防 SSRF）。';

-- 2) 备用模式行 -------------------------------------------------------------
-- on conflict do nothing：不覆盖管理员可能已手工调整过的配置。
insert into public.bohai_model_configs (
  mode_id, display_name, tagline, description,
  provider, provider_label, model_id, api_url, capability, icon,
  temperature, top_p, frequency_penalty, max_tokens,
  status, sort_order, min_tier, quota_multiplier, notes
) values
  (
    'moderation-image-fb1',
    '审核·图片(备1)',
    '图片审核降级第一跳',
    'moderation-image 的降级目标：上一代 Flash，容量比刚发布的新档宽松',
    'custom', 'Google Gemini', 'gemini-3.6-flash',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'multimodal', 'shield-check',
    0.100, 0.500, 0.000, 256,
    'active', 902, 'free', 0.1,
    '降级链专用行：由 moderation-image 的 fallback_mode_ids 引用，请勿在 BOHAI 模式列表中启用给用户。'
  ),
  (
    'moderation-image-fb2',
    '审核·图片(备2)',
    '图片审核降级第二跳',
    'moderation-image 的降级末跳：lite 高吞吐档，限流最宽、单价最低',
    'custom', 'Google Gemini', 'gemini-3.5-flash-lite',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'multimodal', 'shield-check',
    0.100, 0.500, 0.000, 256,
    'active', 903, 'free', 0.1,
    '降级链专用行：由 moderation-image 的 fallback_mode_ids 引用。此模型是 2026-10-29 之前的主模型，可用性已在线上验证。'
  ),
  (
    'moderation-text-fb1',
    '审核·文本(备1)',
    '文本审核降级第一跳',
    'moderation-text 的降级目标：上一代 Flash',
    'custom', 'Google Gemini', 'gemini-3.6-flash',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'chat', 'shield-check',
    0.100, 0.500, 0.000, 256,
    'active', 904, 'free', 0.1,
    '降级链专用行：由 moderation-text 的 fallback_mode_ids 引用，请勿在 BOHAI 模式列表中启用给用户。'
  ),
  (
    'moderation-text-fb2',
    '审核·文本(备2)',
    '文本审核降级第二跳',
    'moderation-text 的降级末跳：lite 高吞吐档',
    'custom', 'Google Gemini', 'gemini-3.5-flash-lite',
    'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions',
    'chat', 'shield-check',
    0.100, 0.500, 0.000, 256,
    'active', 905, 'free', 0.1,
    '降级链专用行：由 moderation-text 的 fallback_mode_ids 引用。'
  )
on conflict (mode_id) do nothing;

-- 3) 主模式指向最新 + 挂上降级链 ---------------------------------------------
-- 只动这两行；status 保持原样（若管理员曾停用，不在这里偷偷打开）。
update public.bohai_model_configs
   set model_id = 'gemini-3.8-flash',
       fallback_mode_ids = '["moderation-image-fb1","moderation-image-fb2"]'::jsonb,
       updated_at = now()
 where mode_id = 'moderation-image';

update public.bohai_model_configs
   set model_id = 'gemini-3.8-flash',
       fallback_mode_ids = '["moderation-text-fb1","moderation-text-fb2"]'::jsonb,
       updated_at = now()
 where mode_id = 'moderation-text';

commit;
