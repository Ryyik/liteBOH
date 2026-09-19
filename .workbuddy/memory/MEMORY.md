# BOHLITE 长期记忆（超限注入被截断；细则见同目录日志 / plans/ / 探针）

## 环境 / 探针
- hash 路由；playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；dev 只听 IPv6 → BASE `http://[::1]:5173`；构建验证 `vite build --outDir dist-check`（勿动 dist；shell-precache/bundle 收 `DIST_DIR`）。
- 探针三坑：同一 browser+每场景一 context；多条 `page.route` **后注册优先**（`continue()` 短路前面 mock）→ 一条路由只注册一次+规则表；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：注 pinia（Object.assign、合法 UUID）；禁种 sb-*-auth-token；登录态就绪≠页面就绪；切路由用 `location.hash`。fake-IP 下 curl 不能证明国内可达，公网 `--noproxy '*'`。**改完必反证**：stash src/ → 记红 → pop → 复跑全绿。

## CI 门禁（build:ci 链序）
- views → structure → liquid-glass → **important-budget** → dark-tokens(观察) → first-paint → build → shell-precache → bundle。**新文件用 `!important` 必须同步 `scripts/important-budget.json`**（只查单文件超基线，total 仅展示，现 1327）。承重覆盖属例外：对抗全局 `body{overflow-x:hidden!important}` 用 `html.<页> body{overflow:visible!important}`（Home/BOH8YearsJourney/BOHApp 同款）。CI 中途断则后面没跑 → 本地必须全链。

## Supabase
- ref `nplnlefdwfgtyimfkyih`；`db push --linked --yes`（先 dry-run）；迁移 `YYYYMMDDNN_snake.sql` 结尾 `notify pgrst,'reload schema'`。新表 revoke 后须**分别** grant anon+authenticated（漏 anon → 42501，mock 不暴露）；service_role 下 `auth.uid()` NULL → security definer 拆无身份校验内部函数。

## 数据读取 / 取消
- `executeRead(scope, params, fetcher, options)` **options 第 4 参**；**fetcher 必须返回 `{data,error}`**（return 数组 → data 恒 null 且不报错，照 subscription-api.js）。
- 取消唯一出口 request-core.js `code:'ABORTED'` 三形态（DOMException / postgrest 转义普通对象——resolve 非 reject / 文案「请求已被取消」）；消费侧判 `aborted || code==='ABORTED'` 静默跳过。

## AI 出口（vault / Worker）
- 浏览器 → Edge Function `api-key-vault` → 上游；线上唯一生效字段 = `bohai_model_configs.api_url`；vault 只说 OpenAI 协议（penalty/stream_options 必发须清洗，只解析 choices[0]）。CF Worker `cloudflare/gemini-proxy/`（单源 src/index.js，改完 `npx wrangler deploy`）；Google 坑：frequency_penalty 400、reasoning_effort 只能 low 不给 gemma、max_tokens≥512、错误是 JSON 数组。
- ⚠️ vault unique(provider,purpose) 遮蔽自定义上游（同 provider 双 custom 不能并存）；审核 localStorage 配置在 vault 端不生效；配额预扣 stringify/4（base64 撑爆）；限流 10 次/分/用户。

## 样式 / 主题
- `:global(.x)` 被 scoped 压 → `:not()` 提特异性勿加 important；子组件禁压父级变量用 `var(--x,40px)`。玻璃单源 tokens.css（--liquid-*）；禁 content-visibility:auto；空态 EmptyState.vue；设置面板用 settings-glass.css gs-*。
- **sticky 坑**：全局 `body{overflow-x:hidden}` 使 body 成滚动容器 → sticky 永不吸附；修法挂载给 html 加类、卸载移除。暗色真源 theme-manager.js + 13 容器白名单。首屏壳 = app-*.js 9 个静态 import，改骨架必跑 first-paint + shell-precache；getPosts TTL 缓存切 tab 零请求非 bug。

## UserSpace / 论坛（细则 plans/011、probe-rail-landing.mjs）
- 横屏左栏判据 landscape+≥1024+≥600（同步 3 探针：nav-mini-bar / forum-ux-fixes G 组 / nav-optical-center）；probe-user-space-ia.mjs 基线 79 PASS/1 FAIL（既有）。
- forumData shallowRef → **感知态必须走 prop**；主 feed keyset 直查 posts（RPC 主列表不生效）；profile-*.css 按需先 `preloadProfileStyles()`；outside-click 用品牌位容器；胶囊指示器包含块须 `.userspace-rail-group`。

## 活动平台 / 头像框（细则 plans/008、010）
- 日期单源 `src/utils/activity-date.js`（禁 new Date 宽松解析）；campaigns（uuid，无图无同步）vs activities（bigint 有封面有同步触发器）；slug 单源 `activity-campaign.js`。
- 框 scale ≈ 1/内孔占比、素材孔心裁切；框层上限 116px；限免单源 `avatar-frame-campaign.js`；FramedAvatar prop `frameScale`（写错静默回落 1.24）；断言用 getBoundingClientRect；发布后 slug/url 永久不可变。

## Android / TWA（流程见 skill `pwa-to-android-apk-ci`）
- 单源 `android-twa/twa-manifest.json`；APK 推 Release `android-latest`；触发路径不含 src/ → **只改 src/ 不触发打包**；包名与签名永久不可换；Pages 吞 `.well-known/` 靠 `.nojekyll`；改 src/ 免重打包；/app 分镜 10% 过渡窗 + 36px 位移。

## Web Push（已实现 2026-09-18，未部署）
- 链：notifications 触发器 → push_outbox → `push-send` → FCM/APNs → `public/push-sw.js`（workbox.importScripts 注入，删了 SW 装不上）；决策唯一出口 `boh_should_send_web_push()`。
- 库必须 `jsr:@negrel/webpush`（npm:web-push Deno 跑不通）；VAPID 必须 JWK 无 ext/key_ops；换账号走 `boh_save_push_subscription` RPC；signOut 先解绑设备；与 Pushplus 会双发。
