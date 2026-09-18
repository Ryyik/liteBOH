# BOHLITE 长期记忆（**必须精简**：超限会被注入侧截断；细则一律见同目录 YYYY-MM-DD.md、plans/、探针与 skill）

## 环境 / 探针
- hash 路由；探针 `scripts/probes/*.mjs` 在仓库根跑；playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；dev 只听 IPv6 → BASE `http://[::1]:5173`；构建验证 `npx vite build --outDir dist-check`（勿动 dist）。
- 探针三大坑：同一 browser + 每场景一 context（反复 launch 会越来越慢直至超时）；同页多次 `page.route` **后注册优先**，非命中分支写 `continue()` 会短路前面 mock → 一条路由只注册一次 + 规则表匹配；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：现注 pinia（reactive({}) 须 Object.assign；id 须合法 UUID）；禁种 sb-*-auth-token；**登录态就绪 ≠ 页面就绪**，要等真实根元素；admin 探针须 mock `**/rest/v1/profiles*`，切路由用 `location.hash`（勿 `page.goto`）。
- 本机代理 fake-IP：**本机 curl 不能证明国内可达性**（DNS 已劫持），需用户手机流量实测；curl 公网一律 `--noproxy '*'`。**Bash grep -r/-E 静默返回空** → 用内置 Grep/Node；BSD grep 不支持 `\s`/`\|`，`strings` 也没有 `-e l`（要看 UTF-16 得用 Python 解）。
- 同一文件多处修改禁放同一并行 Edit 批次（静默丢改动）；重活串行——并行 build+vitest+探针会打断 dev server 假红。
- 国内裸连：`*.workers.dev` DNS 污染不可达；`generativelanguage.googleapis.com` IP 阻断；**Supabase 可达**。
- **改完必反证**：`git stash push -- src/` → 探针记红项 → `stash pop` → 复跑全绿。

## Supabase
- CLI 已认证，ref `nplnlefdwfgtyimfkyih`（Singapore）；`db push` 不需密码：`--dry-run --linked` → `--linked --yes`；迁移 `YYYYMMDDNN_snake.sql`，begin/commit 包裹，结尾 `notify pgrst, 'reload schema'`。
- **新表权限矩阵**：`revoke all` 后必须**分别** grant anon 与 authenticated —— 漏 anon 的 select 时 RLS 再对也 42501；探针会 mock 掉，**只有真库 curl 能暴露** → 新表上线补双侧直查。
- service_role 下 `auth.uid()` 为 NULL → 任何 security definer 函数里写了「caller_id := auth.uid(); if null then raise」的，后台/Edge Function 都调不了，得另拆一个无身份校验的内部函数（仅 grant service_role）。

## 数据读取 / 取消语义
- `executeRead(scope, params, fetcher, options)`：**options 是第 4 参**（插错位 → 用户可见 `fetcher is not a function`）；retry 分支前必判 `signal.aborted`。
- **fetcher 必须返回 `{ data, error }`**：直接 `return 数组` 会让索引变结果字段、`data` 恒 null，表现「请求像没发出、清单永远走兜底」，**且不报错**。照 `subscription-api.js` 写。
- 取消单一出口 = `request-core.js` 的 `code:'ABORTED'`，须认三形态：DOMException(name AbortError)、**postgrest 转义的普通对象**（无 name，`message:'AbortError: ...'` + `hint:'Request was aborted...'`，是 resolve 不是 reject）、文案「请求已被取消」。消费侧只判 `dataResult.aborted || error.code==='ABORTED'` 静默跳过。
- 全局兜底 GlobalErrorBoundary.vue 包在 Suspense 外。

## AI 出口（vault / Worker）
- 前端不直连模型商：浏览器 → Edge Function `api-key-vault`（runtime-chat / -stream）→ 上游。线上对话唯一生效字段 = `bohai_model_configs.api_url`。
- vault 只说 OpenAI 协议，`frequency_penalty`/`stream_options` 硬编码必发 → 非 OpenAI 上游必须清洗；只解析 `choices[0]`。
- Worker `cloudflare/gemini-proxy/`（单一真相源 src/index.js）；线上 boh-gemini-proxy.18768487974.workers.dev；改完 `npx wrangler deploy`。Google 坑：`frequency_penalty` 400；`reasoning_effort` 只能 low 且不能给 gemma；max_tokens ≥512；错误响应是 JSON 数组。
- ⚠️ `api_key_vault` unique(provider,purpose) 遮蔽自定义上游（runtime 按 `resolveActiveSecret(provider,'chat')` 取密钥，不看 api_url）→ 同 provider 两个 custom 上游不能并存。
- `boh_moderation_model_config`（localStorage）在 vault 端**不生效**：审核不传 mode → 落 `bohai_model_configs` fast 行。
- 配额预扣按 messages JSON.stringify /4 估算 → base64 图片撑爆预扣；runtime-chat 限流 10 次/分/用户。

## 样式 / 主题
- `:global(.x)` 被 scoped 压过 → 用 `:not()` 提特异性，勿加 important（门禁基线 `scripts/important-budget.json.total` = **1326**）。子组件禁写 `.x { --var: 40px }` 压父级，用 `var(--x, 40px)` fallback。
- 玻璃单一源 `src/styles/common/tokens.css`（`--liquid-*`）。禁 content-visibility:auto；空态用 EmptyState.vue；设置类面板复用 `settings-glass.css` 的 `gs-*` 类。
- **sticky 坑**：祖先 overflow 非 visible 时它成为滚动容器 → 全局 `body{overflow-x:hidden}` 让 `position:sticky` 永不吸附。修法：页面挂载给 `html` 加类 → `html.x body{overflow:visible !important}`，卸载移除。
- **暗色**：裸字面量 2790 / 89 文件 / 413 !important（观察门禁 `check-dark-tokens.mjs` 不阻断）。挂载真源 `theme-manager.js` + 13 容器白名单；**1107 行暗色选择器挂在容器属性上** → 废白名单前必须先迁。确定性 bug：`DataManagement/styles/base.css` :164 与 :601 的 `:not([data-theme="light"])` 在白名单外 → 永真。详见 docs/dark-mode-audit-report-2026-09-18.md。

## 首屏
- 壳 = 入口 app-*.js 的 9 个静态 import；改骨架/manualChunks 必跑 `check:first-paint` 与 `check:shell-precache`。getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。AI Token 配额是唯一真闸。

## UserSpace / 论坛（细则见 plans/011 与 probe-rail-landing.mjs）
- `/user-space` = UserSpaceMain.vue；他人 `/profile/:username` = ProfileMain.vue。横屏左栏判据 landscape + ≥1024 + ≥600（改断点同步 3 处探针）。发布右区复用 `ForumMain.openMobileComposer()`，先 `switchTab('community')`。`profile-*.css` 按需加载 → 新入口先 `await preloadProfileStyles()`。
- **感知态必须走 prop**：`forumData` 是 shallowRef、元素是普通对象，父级 `triggerRef` 不会让 PostCard 重渲染 → 骨架/乐观值一律 `:is-replies-loading="!!post._repliesLoading"` 形式下传。
- 主 feed 走 **keyset 游标直查 `posts`**（`list_forum_posts` RPC 在主列表不生效）→ `replies` 不内联 → 回复预览须懒加载 + idle 预取。
- **视觉居中 ≠ 几何居中**：胶囊内头像圆心偏左 9~10px，根因 vendor `unified-nav.css:1532` 给 `.nav-user-info` 钉了**带 important 的 `gap:8px`**，mini 态收起用户名后仍占位。修法：`:not(.nav-expanded)` 下 `.nav-username{margin-left:-8px}`（不新增 important），残留属固有项不修。
- **横屏左栏**：品牌位**绝对定位**占进顶部空白（不进文档流；反证：撤样式首项 152→208）；退出登录/主题移入「更多」菜单，outside-click 判定用**品牌位容器**（用按钮会被 pointerdown 先关菜单）。胶囊指示器的包含块必须是 `position:relative` 的 `.userspace-rail-group`，否则宽 24px、左偏 12px、首屏上浮 56px。
- `.unified-nav-surface` 居中基准 = 整页；横屏有左栏时用 `left: calc(var(--userspace-rail-w)/2)`（不能给 `#unified-nav-container` 加 padding，被 scoped `padding:0 !important` 钉死）。
- 改导航尺寸/断点必同步三处探针：`probe-nav-mini-bar.mjs`、`probe-forum-ux-fixes.mjs` G 组、`probe-nav-optical-center.mjs`。`probe-user-space-ia.mjs` 基线 **79 PASS / 1 FAIL**（「发布」按钮，既有）。

## 活动平台
- 链：nav → `/activities-wall`；旧深链全 302。两套数据源无关联键：`activities`（bigint，历史）vs `activity_campaigns`（uuid，报名）。`activities.date` 是 varchar 三态脏数据 → 日期单一真相源 = `src/utils/activity-date.js`，禁 `new Date` 宽松解析（plans/008）。投稿双路径：campaigns 无 image 列、无同步触发器；activities 有封面、有 `trg_sync_activity_forum_card` → toast 不能说自动同步论坛。slug/datetime 单一源 = `src/utils/activity-campaign.js`。

## 头像框 / 装扮（细则见 plans/010）
- **scale 口径** = 保证内孔内接圆 ≥ 头像直径 → `scale ≈ 1/内孔占比`；外扩大的素材先**以孔心为几何中心裁切**。框层硬上限 116px（装扮网格卡片宽）；36/42/52 的容器是论坛卡片(116px)、96 是主页 hero → 校验尺寸必须按档位取容器，否则好框被误判溢出。
- **限免单一真相源** = `src/utils/avatar-frame-campaign.js`（`freeUntil:'YYYY-MM-DD'` 含当日全天）；`useAvatarFrame` 的 `nowMs` 单例 ref + 到期定时器驱动「不刷新自动切档 + 佩戴中限免框自动掉落」；UI 只消费 `tierOf()`。
- `FramedAvatar` 缩放 prop 名 **`frameScale`**（模板 `:frame-scale`），写错不报错、静默回落 1.24。
- `.boh-avatar-wrap` 是 `inline-block`，`getComputedStyle().width` 返回 `auto` → 断言用 `getBoundingClientRect()`，基准取头像元素。UserSpace 各 tab pane **全部常驻 DOM**（未激活 `display:none`）→ 断言 hero 必须显式 `?tab=profile` 并挑 rect 宽 > 0 的节点。
- **控制台三条不可动决策**：①编辑器摆位**烘焙进像素**，渲染层只认 `url + scale`；②清单迁 DB 但**内置 5 框不删**；③**发布后 slug 与素材 url 永久不可变**。

## Android / TWA 打包（完整流程见 skill `pwa-to-android-apk-ci`）
- `.github/workflows/android-apk.yml`；配置单一真相源 = `android-twa/twa-manifest.json`。APK 推到固定 tag Release `android-latest` → 直链 `https://github.com/Ryyik/liteBOH/releases/download/android-latest/boh.apk`（repo PUBLIC，免登录）。落地页 `/app`，下载信息单一源 `src/views/BOHApp/app-release.js`。触发路径过滤只含 `android-twa/**`、`public/icons/**`、`public/.well-known/**`、`vite.config.js`、workflow 自身 → **只改 `src/` 不会触发打包**。
- **包名 `cn.blockofhome.app` 与签名密钥永久不可更换**；指纹须与 `public/.well-known/assetlinks.json` 一致，否则退回带地址栏浏览器壳；**GitHub Pages 会吞 `.well-known/`** → 靠 `.nojekyll`。
- **外壳层 vs 内容层**：改 `src/` 不需重打包；只有图标/应用名/启动屏变才需重打包 + 覆盖安装。更新形态：**冷启动自动静默切新**（`version-checker.js:355` 比 buildId），**使用中只弹提示、点确认才刷**。线上 `sw.js` 被 CF 加 `max-age=14400`，靠 `main.js` 的 `updateViaCache:'none'` 绕过。
- `/app` 落地页滚动分镜两坑：①全局 `body{overflow-x:hidden}` 会让 body 成滚动容器 → sticky 永不吸附，修法 = 挂载给 `html` 加类；②三屏同位置不能长交叉淡入（标题糊）也不能整屏位移（中途空白带），只留 10% 过渡窗 + 36px 位移。

## Web Push（已实现 2026-09-18，未部署；部署清单见当日日志）
- 链路 = `notifications` AFTER INSERT 触发器 → `push_outbox` 账本 → `net.http_post` → Edge Function `push-send` → FCM/APNs → `public/push-sw.js`（经 vite.config 的 `workbox.importScripts` 注入；**删了它 sw.js 会 importScripts 404、整个 SW 装不上**）。投递决策唯一出口 = `boh_should_send_web_push()`。
- **推送库必须 `jsr:@negrel/webpush`，`npm:web-push` 在 Deno 里跑不通**（`crypto.ECDH unimplemented`）；VAPID 必须 JWK 且**不能带 `ext`/`key_ops`**（生成脚本 `scripts/generate-vapid-keys.mjs`），公钥由 `action=config` 运行时下发、不硬编码前端。
- 订阅表 `push_subscriptions` endpoint 全局唯一 → **同设备换账号必须走 `boh_save_push_subscription` RPC**（客户端 upsert 会被 RLS 拒）。角标唯一落点 = `stores/notifications.ts` 的 `watch(unreadCount)`，数字口径单一源 = `boh_count_unread_notifications`（仅 service_role；`get_unread_notification_count` 委托它）。**signOut 必须先解绑设备再登出**。
- 与 Pushplus（微信、前端触发 `forum/_shared.js`）是两条通道，重叠类型会双发 → 去重改 `boh_should_send_web_push`。`/push-sw.js` 运行时拉取，CF 别缓存住。**Chrome for Android 无数字角标（只有圆点）**；TWA 通知委派已在包内（`enableNotifications: true`，已解现有 APK 的 AXML 实证）。
