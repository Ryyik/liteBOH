# BOHLITE 长期记忆（细则见同目录 YYYY-MM-DD.md）

## 环境 / 探针
- hash 路由；探针在 scripts/probes/ 仓库根跑；playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；dev 只听 IPv6 → BASE 用 `http://[::1]:5173`；构建验证 `npx vite build --outDir dist-check`（勿动 dist）。
- 伪造登录：现注 pinia（reactive({}) 须 Object.assign；id 须合法 UUID）；禁种 sb-*-auth-token；**登录态就绪 ≠ 页面就绪**，还要等真实根元素。admin 探针必须同时 mock `**/rest/v1/profiles*`。
- 本机是代理 fake-IP 模式 → **本机 curl 无法证明国内可达性**（DNS 已劫持），需用户手机流量实测；curl 公网一律 `--noproxy '*'`。**Bash grep -r/-E 静默返回空** → 检索用内置 Grep 或 Node。BSD grep 不支持 `\s`/`\|`。
- 同一文件多处修改禁放同一并行 Edit 批次（静默丢改动）；python 行号区间替换前先 dry-run + 备份。中文引号段落用行号替换。
- 国内裸连基线：`*.workers.dev` DNS 污染不可达；`generativelanguage.googleapis.com` IP 阻断；**Supabase 可达** → 生产链路不需用户端代理。wrangler 命令加 `NO_PROXY=localhost,127.0.0.1`。

## Supabase
- CLI 已认证；ref `nplnlefdwfgtyimfkyih`（Singapore）。`db push` 不需 DB 密码，标准流程：`--dry-run --linked` → `--linked --yes`。迁移 `YYYYMMDDNN_snake.sql`，begin/commit 包裹。
- 验证落库用 curl REST + anon key，比连库轻。

## AI 出口（vault / Worker）
- 前端不直连模型商：浏览器 → Edge Function `api-key-vault`（runtime-chat / -stream）→ 上游。线上对话唯一生效字段 = `bohai_model_configs.api_url`；metadata.apiUrl 只影响 test/discover。
- vault 只说 OpenAI 协议，`frequency_penalty`/`stream_options` 硬编码必发 → 非 OpenAI 上游必须清洗。只解析 `choices[0]`。
- Worker 工程 `cloudflare/gemini-proxy/`（src/index.js 单一真相源 + verify.mjs）；线上 boh-gemini-proxy.18768487974.workers.dev；改完 `npx wrangler deploy`；密钥在 .dev.vars / `wrangler secret bulk`。
- Google 兼容层坑：`frequency_penalty` 400；`reasoning_effort` 只能 low 且不能给 gemma（Worker 已按 gemini 前缀放行）；max_tokens 别低于 512；错误响应是 JSON 数组。
- ⚠️ `api_key_vault` unique(provider,purpose) 遮蔽自定义上游：runtime 按 `resolveActiveSecret(provider,'chat')` 取密钥不看 api_url → 同 provider 两个 custom 上游不能并存，UI 保存就地覆盖密钥。
- `boh_moderation_model_config`（localStorage，ModerationModelConfig.vue 保存）在 vault 端**不生效**：审核调用不传 mode → 落 `bohai_model_configs` 的 fast 行，payload.model 被 policy.modelId 覆盖、body.apiUrl 被忽略（2026-09-17 探查确认）。
- vault 配额预扣 `estimatePromptTokens` 对 messages JSON.stringify /4 估算 → base64 图片会撑爆预扣（50KB 图 ≈ 12.5k token）；runtime-chat 限流 10 次/分/用户。
- 排错首选：失败响应带 keyInfo（label/maskedValue）。MODEL_CONFIG_CACHE 5 分钟不复查 status。匿名可直调 Edge Function 验证（tier=guest）。

## 样式 / 主题
- `:global(.x)` 特异性 (0,1,0) 被 scoped 压过 → 用 `:not()` 提特异性，勿加 important（基线 1332）。跨组件选择器/响应式写进各自组件 scoped。
- 玻璃单一源 tokens.css（`--liquid-*`），跨宿主只取该前缀变量。禁 content-visibility:auto；空态用 EmptyState.vue；GlassPillButton 收敛散装玻璃胶囊。

## 首屏 / 数据
- 壳 = 入口 app-*.js 的 9 个静态 import；改骨架/manualChunks 必跑 `check:first-paint`。getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。AI Token 配额是唯一真闸。

## UserSpace / 论坛
- `/user-space` = UserSpaceMain.vue；他人 = `/profile/:username` = ProfileMain.vue。横屏左栏判据 landscape + ≥1024 + ≥600（改断点同步 3 处探针）。发布右区复用 `ForumMain.openMobileComposer()`，先 `switchTab('community')`；overlay Teleport 到 body。
- `profile-*.css` 按需加载 → 社区 tab 触发的新入口先 `await preloadProfileStyles()`。消息中心入口 = UserSpace messages tab 的 AsyncMessages；提示断言听 `boh_global_nav_status`。

## 活动 / 活动平台
- 页面链：nav → `/activities-wall` → ActivitiesWall/index.vue → ActivitiesList.vue + BlockWall。旧深链全 302。
- 两套数据源无关联键：`activities`（bigint，历史回顾）vs `activity_campaigns`（uuid，进行时报名）。`activities.date` 是 varchar 三态脏数据（`2025/7`、`2025/7/21`、`2025-07-01`）→ 日期单一真相源 = `src/utils/activity-date.js`，禁 `new Date` 宽松解析。方案见 plans/008。
- 管理员投稿弹窗双路径：报名活动写 campaigns（无 image 列、无论坛同步触发器）；往期活动写 activities（有封面、有 `trg_sync_activity_forum_card`）→ toast 不能说自动同步论坛。slug/datetime 归一单一源 = `src/utils/activity-campaign.js`。
- 子组件禁写 `.x { --var: 40px }` 压父级继承，用 `var(--x, 40px)` fallback。重活串行——并行 build+vitest+探针会打断 dev server 假红。

## 错误边界 / 反证
- 全局兜底 GlobalErrorBoundary.vue 包在 Suspense 外。探针 mock Supabase 必发 `Access-Control-Expose-Headers: Content-Range`。
- **改完必反证**：撤掉修复再跑探针确认会红，否则是假绿。
