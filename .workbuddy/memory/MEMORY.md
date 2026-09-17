# BOHLITE 长期记忆（细则见同目录 YYYY-MM-DD.md）

## 探针 / 环境
- hash 路由；探针在 scripts/probes/，从仓库根跑；chrome channel；playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；dev 可能只听 IPv6 → BASE 用 `http://[::1]:5173`；构建验证 `npx vite build --outDir dist-check`（勿动 dist）。
- 伪造登录：现注 pinia（reactive({}) 须 Object.assign；id 须合法 UUID）；禁种 sb-*-auth-token；等 `#app.__vue_app__`。**登录态就绪 ≠ 页面就绪** → 还要等真实根元素，否则读到 index.html 骨架（假红一片）；dev recovery 重载会丢注入态，探针须自愈重注。
- 弹层断言验计算样式/几何；数据落定用条件等待不用 sleep；等待选择器别用 `[class*="x"]`。叠放 tab（`.tab-page`）离场页签仍可见且在更前 → 锚定「第一个可见组」。
- `check:important-budget` 纯文本匹配 `!important`（含注释字面量）且只扫 git ls-files → 用「感叹号 important」表述。同一文件多处修改禁放同一并行 Edit 批次（静默丢改动）；**用 python 按行号区间替换前必须确认区间终点**（曾把 `lines[i14:]` 当成"最后一节"，误删了其后的 §15-§17，靠备份恢复）→ 先 dry-run 打印起止行 + 先备份；**BSD grep 不支持 `\s`/`\|` 且不报错** → 用 `[[:space:]]` 或内置 Grep；含中文引号的段落用 Edit 匹配不可靠（全角/半角看不出），改用行号替换。
- **本机网络是代理工具的 fake-IP 模式**（`http_proxy=127.0.0.1:62001`；`*.workers.dev` 被解析到 `198.18.x.x`）。→ **本机 curl 无法证明「国内能否裸连」**：即使带 `--noproxy '*'`，DNS 已被劫持、流量仍走 TUN。凡「国内可达性」结论必须让用户用手机流量或关代理实测。curl 验证公网服务一律加 `--noproxy '*'`。
- **本沙箱的 Bash `grep -r` / `grep -E` 会静默返回空结果**（不报错）→ 日志解析、跨文件检索一律改用 Node 脚本或内置 Grep 工具，**不要根据 bash grep 的空结果下结论**。
- **未声明变量类 bug 两个关卡都抓不到** → **已修复（2026-09-17）**：`eslint.config.js` 已开 `'no-undef': 'error'`（仅 js/vue 块；`.ts` 块故意不开，类型名会误报且 vue-tsc 已兜底），并补了 `dist-check/**` 到 ignores（漏配曾让 warnings 涨到 2234）。k6 压测全局配在 `scripts/loadtest/**` 专用块。审计命令：`npx eslint --rule '{"no-undef":"error"}' src/`。若 lint 报 `'X' is not defined`：先查是否浏览器/k6 注入全局，再查漏 import，最后才在配置声明全局。
- **代理关闭后的国内裸连基线**（已实测）：`*.workers.dev` **DNS 被污染**（返回非 CF 段的 128.242.240.91）→ 不可达；`generativelanguage.googleapis.com` 解析正常但 **IP 层阻断**；**Supabase / `api.supabase.com` / `api.cloudflare.com` 均可达**（0.6-1.5s）。→ 生产链路（浏览器→Supabase→Edge Function→Worker→Google）**不需要用户端代理**，唯一需国内可达的一跳是 Supabase。`verify.mjs` 只能在开代理时跑。`unset http_proxy` 只对当前 shell 生效，Bash 每次新起 shell 会重新继承 profile → 每条命令自带 `unset`。

## Supabase / 迁移
- CLI **已认证**（`npx supabase projects list` 直接通）；link 状态在 `supabase/.temp/`（ref `nplnlefdwfgtyimfkyih` = "Ryyik's Project"，**region Singapore**，pooler `aws-1-ap-southeast-1.pooler.supabase.com:5432`）。
- **`db push` 不需要 DB 密码**（CLI 用 access token 换凭据）；**有 `--dry-run`** → 标准流程：`db push --dry-run --linked` 看清单 → `db push --linked --yes`。`supabase/.env` 只有 ALTCHA 变量，无 DB 凭据。macOS 无 `timeout`（用 `gtimeout`）。
- 验证落库用 `curl <VITE_SUPABASE_URL>/rest/v1/<table>` + anon key（RLS 允许匿名读 active 行），比连库更轻。

## AI 出口 / 反代
- **前端不直连任何模型商**。链路：浏览器 → Edge Function `api-key-vault`（`runtime-chat` / `runtime-chat-stream`）→ 上游。故「网页里配置模型」的落点其实是后台 DB，不是前端代码。
- 唯一对线上对话生效的字段 = `bohai_model_configs.api_url`（`api-key-vault/index.ts:1544/1578` 读它，`:952`/`:1004` 用它）；`api_key_vault.metadata.apiUrl` 只影响 test/discover（`:520`/`:632`），**不影响线上**。没配 api_url 会**静默回退** siliconflow 默认地址。
- **vault 只说 OpenAI 协议**：`POST apiUrl` + `Authorization: Bearer`，body `{model, messages, stream, max_tokens, temperature, top_p, frequency_penalty, stream_options:{include_usage:true}}`；只解析 `choices[0].delta.content`。`frequency_penalty` 与 `stream_options` 是**硬编码必发**的 → 接任何非 OpenAI 上游都必须清洗。
- Worker 工程在 `cloudflare/gemini-proxy/`（`src/index.js` 单一真相源 + `verify.mjs` 三项端到端 + README）。线上 `https://boh-gemini-proxy.18768487974.workers.dev`。改完 `npx wrangler deploy`；wrangler 命令一律加 `NO_PROXY=localhost,127.0.0.1`（OAuth 回调走 localhost 会被代理劫持）。密钥在 `cloudflare/gemini-proxy/.dev.vars`（gitignore），上传用 `wrangler secret bulk <json>`。
- **Google 兼容层踩坑**：`frequency_penalty` 直接 **400**（Vertex 才静默忽略）；`reasoning_effort: minimal` 400，只能用 `low`；`reasoning_effort` **不能给 gemma**（400），Worker 已按 `gemini` 前缀放行；thinking 与正文共享 `max_tokens`，过小会返回**合法但空内容**的 SSE（`finish_reason:length`）→ `max_tokens` 别低于 512。错误响应是 **JSON 数组** `[{error:{...}}]`。
- `api_key_vault`（表名不是 api_keys）的 `encrypted_value` 由 Edge Function 用 `API_KEY_VAULT_MASTER_KEY` 加密且 NOT NULL → **SQL 无法造密文**，密钥行必须在管理后台录入（`vault.decrypted_secrets` 是空的，master key 只在 Edge Function env）。
- ⚠️ **`api_key_vault` 的 `unique (provider, purpose)` 会遮蔽自定义上游**：runtime 只用 `resolveActiveSecret(provider, 'chat')` 取密钥，**不看 api_url** → 同一个 provider 的 chat 密钥只能有一条，两个不同 custom 上游无法并存（除非改 vault 按 api_url 解析密钥）。已有一条 custom/chat 时，新建 custom 模式会拿到旧密钥 → 401。UI 保存是 `onConflict: 'provider,purpose'` → **就地覆盖**那条密钥。
- 失败响应里带 `keyInfo`（`label`/`maskedValue`）→ 一眼看出用的是哪条密钥，排错首选。
- `MODEL_CONFIG_CACHE` 缓存模式 5 分钟且**不复查 status** → 停用模式最多再可被调 5 分钟（`list_public_bohai_modes` 直查 DB，UI 立刻消失）。
- Google 兼容层短回复流式可能只出 1 个 content chunk（非逐字），不是缓冲 bug。thinking 与正文共享 `max_tokens`：实测回复 2 token 却 `total_tokens=90`。
- 国内直调 Edge Function 做端到端验证：`resolveRuntimeIdentity`（`index.ts:231`）**允许匿名**（`tier='guest'`），用 `.env` 的 anon key POST `/functions/v1/api-key-vault` 即可，无需登录。

## 样式 / 主题
- `:global(.x)` 只 (0,1,0)，被同名 scoped `.x[data-v]` 压过 → 覆盖用 `:not()` 提特异性，勿新增 important（基线 1332）。
- base.css 是 scoped 引入的 → 跨组件选择器带父 scope id，匹配不到子组件内部；子组件样式必须写进它自己的 scoped。组件 scoped 压过全局 media → 响应式写进组件 scoped。
- 玻璃单一源 tokens.css（`--liquid-*`）；跨宿主复用组件只取 `--liquid-*`（同名变量在不同宿主可能是不同类型值）。
- themeManager init() 在 mount 之后 → index.html 有内联早期主题脚本，两份 VALID_THEMES 须同步。禁 content-visibility:auto；空态用 EmptyState.vue。
- 主题 CSS 由 theme-css-loader 动态 import → 度量暗色前须等目标样式表插入；Teleport 元素用 html 级 `[data-theme="dark"]` 覆盖。
- GlassPillButton（components/ui/）= 白玻璃胶囊按钮基件；散装玻璃胶囊一律收敛到它。
- 死代码：见技能 `dead-code-safe-cleanup`；改样式前先搜同选择器（多份定义=死规则温床），用探针读 computedStyle 确认真生效的那条。

## 首屏
- 壳 = 入口 app-*.js 的 9 个静态 import；`check:shell-precache` 反推预缓存。白屏：ui-components 秒出 → 「导航栏+白屏」窗口；旧 hash 404 不自愈。probe-boot-perf「首屏可交互」= Vue mount 时刻。改骨架/manualChunks 必跑 `check:first-paint`。

## 数据 / 订阅
- 迁移 `YYYYMMDDNN_snake.sql` 放 supabase/migrations/，begin/commit 包裹，先 dry-run，push 必 --yes。getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。订阅遗留：权益四处分裂、无降档。AI Token 配额是唯一真闸。

## UserSpace / 论坛（易踩）
- `.tab-page` absolute 叠放 → 改宽只覆盖 left/width；左栏用 absolute 不用 fixed。顶隙 `--userspace-nav-h`。
- 「我的方块」→ `/user-space` = UserSpaceMain.vue；他人空间 = `/profile/:username` = ProfileMain.vue（两套平行视图，看组件不看 URL）。
- 横屏左栏 UserSpaceSideRail.vue，判据 landscape + min-width 1024 + min-height 600；改断点同步 3 处探针。分栏：`--userspace-content-gutter` 补 padding；`.forum-container` 的 100vw 分栏后失真改 `%`。
- 发布右区：复用 `ForumMain.openMobileComposer()`；`defineExpose` 有 TDZ 坑（后段函数箭头包装）；ForumMain 只在社区 tab 挂载 → 先 `switchTab('community')`；overlay Teleport 到 body → 用 body 级选择器+变量。
- `profile-*.css` 按需加载 → 能在社区 tab 触发却依赖它的新入口必须先 `await preloadProfileStyles()`，否则 UI 裸奔。
- AI 岛会撑大 `--userspace-nav-h`；左栏顶隙单独走 `--userspace-rail-top-h`（浮层不让位）。
- 消息中心真实入口 = UserSpace messages tab 的 AsyncMessages；提示断言听 `boh_global_nav_status` 事件。
- 论坛 hero 横屏 ≥993 大玻璃容器（双 DOM 块 CSS 互斥）；#标签筛选无#不重置；问BOHAI 走 `showIsland.ai` + 模式透传 `applySeedMode`。

## 活动 / 活动平台（易踩）
- 页面链：nav「活动&方块墙」→ `/activities-wall` → `ActivitiesWall/index.vue`（宿主+灵动岛）→ `views/activities/ActivitiesList.vue`（活动面板，680 行兼任 6 件事）+ `BlockWall`(embedded)。旧深链 `/activities`·`/activities/list`·`/block-wall` 全 302 到此。
- **两套数据源、无关联键**：`activities`(id bigint; 17 行; 仅 title/date/image/description) 是历史回顾；`activity_campaigns`(id uuid; stage/signup 窗口/config jsonb) 是进行时报名。**fulfilled 无归档通道**（`ForumMain.vue:2349` 靠 title 字符串匹配认领官方卡）。
- `activities.date` 是 **varchar(50) 三态脏数据**：`YYYY/M/D` 9 条 + `YYYY/M` **6 条缺日** + `YYYY-MM-DD` 2 条 → `split('/')` 对 dash 格式崩；DB `order=date.desc` 是字符串比较**排序错乱**（`2025/7/21 > 2025/12/12`）；前端 `new Date(replace)` 重排侥幸正确（V8 把 `2024-7` 宽松补成 07-01，不报错=假绿）。方案见 `plans/008-activities-page-restructure-insights.md`：加 `event_date` 生成列 + `activity_timeline` 视图。
- `activity_campaigns` / `_entries` / `_rewards` 三表**已建但常为 0 行**（`2026090901_probe_seed` 插、`2026090902_probe_cleanup` 删）→ `campaign-section` 的 `v-if` 空转，`probe-campaign-ui.mjs` 断言老类名且当前必 FAIL。
- **RLS 与注释不符**：`activity_campaigns_select using (true)` → draft 对 anon 可读，注释却说"由 RLS 兜底"；草稿过滤只在 API 层。报名状态查询是 **N+1**（每卡一次 entries）。
- 导航高度在本页被测两遍：外层 `--aw-nav-h` + 内层 `--nav-h`，两个 ResizeObserver；`ActivitiesWall/index.vue:127-147` 的 `:deep()` 补丁改类名后**静默失效**。
- **日期解析单一真相源 = `src/utils/activity-date.js`**（`parseActivityDate` 正则三分支，**禁** `new Date` 宽松解析；分组键 monthKey 与排序键 monthOrd 必须分离）。活动页已重构为 **M2 每月一轨**，组件在 `views/activities/components/`（SignupSection / MonthRail / Card；放 `ActivitiesWall/` 会两目录互相引用）。角标按精度渲染，缺「日」只显示 `10月`。真库 17 条 = **16 个月份组**（15 组仅 1 张卡）→ 多数轨道不真的滚动，横向滚动是结构能力。
- **数据管理曾持续销毁日期精度**：`useDataAdminHelpers.js` 的 `toDateInputValue('2025/10')` → `'2025-10-01'`（打开即改写）。已换 `normalizeActivityDateInput`，`EditDrawer` 新增 `activity-date` 控件（`type=month` + 可选「日」）。`campaignEntries` 已开放 status 审核（此前完全只读）。
- 露边负 margin：`--activity-rail-gutter` 必须 == 宿主容器水平 padding；**子组件禁写 `.x { --var: 40px }`**（会压掉父级继承），用 `var(--x, 40px)` fallback。
- 探针坑：`locator.isVisible()` **不自动等待**（改用 `boundingBox()`）；`unroute` + reload 不足以撤 mock（A/B 场景用两个独立 page）；报名区（campaigns）与月份轨道（activities）是**两条独立异步链**，须分别等终态。**重活串行**——并行 build+vitest+探针会打断 dev server 造成假红。
- 管理员投稿弹窗（`components/AdminContentPublishModal.vue`）双路径：**报名活动写 `activity_campaigns`**（uuid 由 DB 生成 / **无 image 列** / 4 个时间窗 / slug 必填唯一 / **无论坛同步触发器**），**往期活动写 `activities`**（自增 id / 有封面 / 单 date / **有** `trg_sync_activity_forum_card`）。→ 报名活动不给封面图，且 toast **不能**说「论坛官方帖已自动同步」。
- slug 归一 / datetime-local→ISO / 时间窗校验的单一真相源 = `src/utils/activity-campaign.js`（前台弹窗与后台 saveStrategies 共用）。datetime-local 必须转带时区 ISO，否则偏 8 小时。
- 探针注入 admin：`Object.assign(pinia.state.value.auth.userInfo, {id: 合法UUID, role:'admin'})` + `isLoggedIn/isInitialized = true`，**必须同时 mock `**/rest/v1/profiles*`**，否则会话校验把 userInfo 洗掉。

## 错误边界 / 反证
- 全局兜底 = `components/GlobalErrorBoundary.vue`，包在 `<Suspense>` **外**；Lab 自带的不要上提。
- `onErrorCaptured` 返回 false ⇒ 收不到 pageerror → 判据看「卡片是否带出原始错误」。事件处理器里的 rejected Promise 走 `app.config.errorHandler`，不变 unhandledrejection。
- 探针 mock Supabase 必须发 `Access-Control-Expose-Headers: Content-Range`（否则 count 恒 null → delete 被判无权限回滚）；DELETE mock 用 200 + `content-range: 0-0/1` + 合法 JSON。
- **改完必反证**：撤掉修复再跑探针，确认会红（否则是假绿）。
