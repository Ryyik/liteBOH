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
- 竖屏导航 mini 胶囊宽（2026-09-17 探针实测校准）：**≤480 档 168 / >480 档 188**＝内容实测 122/134 + 两条间隙各 13 + padding 20/28。旧值 140/164 零余量 → 头像胶囊与汉堡右缘**重叠 13px**（用户说的"汉堡放不下"）。改宽必同步 `probe-nav-mini-bar.mjs`(24 项)、`probe-forum-ux-fixes.mjs` G 组、`probe-nav-optical-center.mjs`(20 项)。
- **视觉居中 ≠ 几何居中**：外壳实测六档全部 Δ=0（边距相等、与内容列同心），但胶囊内**头像圆心偏左 9~10px** —— 根因 vendor `unified-nav.css:1532`（1528 重复一遍）给 `.nav-user-info` 钉了**带 important 的 `gap:8px`**，mini 态收起用户名后这 8px 仍占位（胶囊底 66 = 12+1+8+32+0+1+12）。修法：`:not(.nav-expanded)` 下 `.nav-username { margin-left:-8px }`（**不新增 important**）→ 胶囊底 58、偏心 −5/−6。残留 −5 来自 logo(26/32) 与汉堡(36/44) 的宽度差，属固有项不修（修了会让内容外框不对称）。
- 主 feed 走 **keyset 游标直查 `posts`**（`list_forum_posts` RPC 在主列表不生效）→ 卡片 `replies` 不内联、`replies_preloaded` 恒 undefined → 回复预览必须懒加载 + idle 预取；只有 RPC 路径会内联 replies 预览。
- **感知态必须走 prop**：`forumData` 是 shallowRef、元素是普通对象，父级 `triggerRef` 不会让 PostCard 重渲染（`is-expanded` 之类的 prop 变了才重渲染）→ 骨架/加载中/乐观值这类"要及时消失"的状态一律用 `:is-replies-loading="!!post._repliesLoading"` 形式下传。
- 论坛交互验收探针 = `scripts/probes/probe-forum-ux-fixes.mjs`（27 项：点赞乐观更新+校准+回滚、评论先展开后加载+骨架、Abort 静默、idle 预取、竖屏导航），延迟/悬停用页内 50ms 采样轨迹断言"点击瞬间已反馈"。

## 活动 / 活动平台
- 页面链：nav → `/activities-wall` → ActivitiesWall/index.vue → ActivitiesList.vue + BlockWall。旧深链全 302。
- 两套数据源无关联键：`activities`（bigint，历史回顾）vs `activity_campaigns`（uuid，进行时报名）。`activities.date` 是 varchar 三态脏数据（`2025/7`、`2025/7/21`、`2025-07-01`）→ 日期单一真相源 = `src/utils/activity-date.js`，禁 `new Date` 宽松解析。方案见 plans/008。
- 管理员投稿弹窗双路径：报名活动写 campaigns（无 image 列、无论坛同步触发器）；往期活动写 activities（有封面、有 `trg_sync_activity_forum_card`）→ toast 不能说自动同步论坛。slug/datetime 归一单一源 = `src/utils/activity-campaign.js`。
- 子组件禁写 `.x { --var: 40px }` 压父级继承，用 `var(--x, 40px)` fallback。重活串行——并行 build+vitest+探针会打断 dev server 假红。

## 错误边界 / 反证 / 取消语义
- 全局兜底 GlobalErrorBoundary.vue 包在 Suspense 外。探针 mock Supabase 必发 `Access-Control-Expose-Headers: Content-Range`。
- **改完必反证**：`git stash push -- src/`（探针脚本未跟踪不受影响）→ 跑探针记红项 → `stash pop` → 复跑全绿。
- 请求取消单一出口 = `request-core.js` 的 `code:'ABORTED'`（`isAbortError/createAbortError/abortedResult`）。必须同时认出三种形态：DOMException(name AbortError)、**postgrest 转义的普通对象**（无 name，只有 `message:'AbortError: ...'` + `hint:'Request was aborted (timeout or manual cancellation)'`，且是 resolve 不是 reject）、内部文案「请求已被取消」。消费侧只判 `dataResult.aborted || error.code==='ABORTED'` 就静默跳过。
- `executeRead(scope, params, fetcher, options)`：**options 是第 4 参**，插错位会得到用户可见红字 `fetcher is not a function`；要补 signal 就往已有 options 对象里加字段。retry 分支进入前必判 `signal.aborted`（否则"用户切页"会被重试放大成"加载失败"）。
- Playwright 探针：**同页多次 `page.route` 后注册优先**，非命中分支写 `continue()` 会直接出网短路掉前面的 mock → 一条路由只注册一次 + 规则表匹配。
