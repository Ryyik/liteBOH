# BOHLITE 长期记忆（索引版；细则见同目录日志 / plans/ / docs/ 报告）

## 环境 / 探针
- hash 路由；dev/preview 只听 IPv6 → `http://[::1]:5173`、preview `:4180`。构建验证 `vite build --outDir dist-check`（**勿动 dist**）。
- playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；内核未装用 `channel:'chrome'`。后台起服务用 `run_in_background`。
- 三坑：同 browser + 每场景新 context；多条 `page.route` **后注册优先**（`continue()` 短路前序）→ 一条路由只注册一次 + 规则表；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录注 pinia（合法 UUID），**禁种 `sb-*-auth-token`**；切路由用 `location.hash`。**改完必反证**：stash（带 pathspec，先看 `git stash list`）→ 记红 → pop → 复跑全绿。

## CI 门禁
- 链序 views → structure → liquid-glass → **important-budget** → dark-tokens(观察) → first-paint → build → shell-precache → bundle；CI 中途断则后面没跑 → 本地全链跑。
- 新文件用 `!important` 须同步 `scripts/important-budget.json`（只查单文件超基线，total 1327 仅展示）。例外：`html.<页> body{overflow:visible!important}`。

## Supabase
- ref `nplnlefdwfgtyimfkyih`；迁移名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst,'reload schema'`，`db push --linked --yes`（先 dry-run）。新表 revoke 后须**分别** grant anon + authenticated（漏 anon → 42501，mock 不暴露）；service_role 下 `auth.uid()` 为 NULL → security definer 拆内部函数。
- `executeRead(scope, params, fetcher, options)`，**options 第 4 参**；**fetcher 必须返回 `{data,error}`**（返回数组 → data 恒 null 不报错）。
- 取消唯一出口 request-core `code:'ABORTED'` 三形态（DOMException / postgrest 转义普通对象，resolve 非 reject / 文案「请求已被取消」）；消费侧判 `aborted || code==='ABORTED'`。
- `clearAuthReadCache` 无人调用，logout 不清读缓存；getCache 命中不回插 → 注释写 LRU 实为 **FIFO**。

## AI 出口（vault / Worker）
- 浏览器 → EF `api-key-vault` → 上游；线上唯一生效字段 `bohai_model_configs.api_url`；vault 只说 OpenAI 协议（penalty/stream_options 必清洗，只解析 `choices[0]`）。CF Worker `cloudflare/gemini-proxy/`（改完 `npx wrangler deploy`）；Google 坑：frequency_penalty 400、reasoning_effort 仅 low 且不给 gemma、max_tokens≥512、错误是 JSON 数组。
- ⚠️ vault `unique(provider,purpose)` 遮蔽自定义上游；localStorage 配置在 vault 端不生效；配额预扣 stringify/4；限流 10 次/分/用户。
- ⚠️ **AI 面板不能「挂载即打开」**：焦点/取数挂在 `watch(modelValue|visible)` 缺 `immediate` → 惰性化后 Esc 关不掉、额度不拉；补 `immediate` 也修不好 → **先预热再打开**（await import → mounted → nextTick → 置 open）。改 AI 页必跑 `scripts/probes/probe-ai-panels.mjs`。

## 样式 / 主题
- `:global(.x)` 被 scoped 压 → 用 `:not()` 提特异性，勿加 important；子组件禁压父级变量 → `var(--x,40px)`。玻璃单源 tokens.css（`--liquid-*`）；禁 `content-visibility:auto`；空态统一 EmptyState.vue；设置面板用 settings-glass.css `gs-*`。
- **sticky 坑**：全局 `body{overflow-x:hidden}` 使 body 成滚动容器 → sticky 永不吸附；修法挂载时给 html 加类、卸载移除。暗色真源 theme-manager.js + 13 容器白名单。
- 首屏壳 = `app-*.js` 9 个静态 import，改骨架必跑 first-paint + shell-precache。红线：入口 CSS 必须 render-blocking `<link>`。

## 性能 / 缓存（docs/2026-09-20-加载性能与缓存策略审计报告.md）
- 探针 `scripts/perf-probe.mjs` / `perf-probe-dark.mjs` / `probe-lcp.mjs` / `probes/probe-userspace-pages.mjs`。
- 路由成本反解：扒 `app-*.js` 的 `m.f||(m.f=[...])` 与 `__vitePreload(...,__vite__mapDeps([...]))`，扣 index.html preload 壳 = 增量。**依赖表看不见二级动态 import**（DataAdmin 真实 209KB）。
- 基线：壳 9 JS+2 CSS ≈260KB gzip；增量 AiChat 204（BOHAIMain 129.8）> Join 81.6 > Home 62 > Birthday 60.3。受限网络瓶颈是远端图片（单图 10s）。
- **SW 预缓存已收窄（已验收）**：壳样式（`bohShellCssScopePlugin` generateBundle 算清单）进预缓存；其余路由 CSS 由 `workbox.manifestTransforms` 移出 + `/\/static\/css\/[^/]+\.css$/` → CacheFirst(`route-css`)。117/785KB → **17/286KB**，首访 1045→546KB。**两半是一对**，删任一半会「有 HTML 无样式」，`check:shell-precache` 断言 A+C 守。⚠️ manifestTransforms 入参是 `{url,revision,size}` 数组，须返回 `{manifest, warnings}`。
- `public/_headers` 线上**完全不生效**（GitHub Pages + CNAME，固定 max-age=600）→ 这是 version.json/forceUpdate 存在的理由。
- 残余 R1 暗色页级 CSS 靠时序巧合（窗口 1151ms）→ 壳级 dark-mode+navbar-dark(11KB) 按需内联；R2 `login-modal.css` 挂 idle → 建议移入入口 CSS。

## UserSpace / 切换（2026-09-20 审计 + 已落地）
- ✅ `boundaryErrored`：**只有真错误态才自增 boundaryKey**（原监听 `route.path` → 换页整树重建，KeepAlive 与 `userSpaceMemoryCache` 全清：复用 0/9、返回 142–188 请求、数据就位 3.2–4.0s → 9/9、8–19、0.58–1.2s）。守卫 `tests/unit/global-error-boundary.test.js`（语义，非仅 key 名）。
- ⚠️ boundaryKey 只能挂 `route.path` 不能挂 `fullPath`（同页改 query 也重建）。
- ✅ `mountedTabs` 闩锁接上 assets/settings（原本 v-if + 死代码），只闩外层 tab-page（内层 `DataExportPanel` 有 setInterval）；+ `preloadSettingsSubPanels()`（**模块说明符必须与 defineAsyncComponent 一致**）。
- 9 条 `/user-space/*` 子路由原本全无 `meta.keepAlive`；✅ 仅加 partners / settings/version（tags-impressions、shared-memories 内容由他人产生，缓存会被当功能坏）。
- 探针两坑：① `requiresLogin` 未过时走 `next(false)`+弹登录岛、hash 不变 → 「主内容类名变化」判据会命中 `boh-login-modal-overlay`（第一版 9 条数字全废）；伪造登录每次测量前**幂等补打**（心跳 2min 打回 false）。② `.community-forum-host` 是 `display:contents`（0×0），判可见永远超时 → 判据落在真盒子根。
- 「返回耗时」测**数据就位**（在途请求落定 + 静默 500ms），DOM 出现恒十几毫秒。⚠️ 「设置子档 291–313ms」是被论坛并发挤占的污染，隔离 34ms；URL 直跳量不出预载收益。
- 分区过渡已成熟（`shell-community.css` `userspace-tab-in/out-*`，280/250ms）**不要重造**；设置内 `<transition mode="out-in">`(0.18s) 是站内唯一 out-in。路由级 `<Transition>` 试过未落地（类名从未加上，可疑点是死重 `<Suspense>`）；**生产构建剥掉 Vue 告警，「没告警」不能当依据**。
- 定位重建层级用逐层节点身份 `window.__probeNodes`；判主内容渲染不能用 `#app > *` 末元素（下面有 display:none SPAN）。
- 分区单源 = URL `view`：`syncUserSpaceTabRoute` 必须写 view；`resolveSectionFromRoute` 遇「URL tab ≠ 当前 tab」**拒采信**（否则 `watch(currentTab)` 把分区冲回默认）。forumData 是 shallowRef → 感知态走 prop；主 feed 走 keyset 直查 posts（RPC 主列表不生效）。
- 横屏左栏判据 landscape + ≥1024 + ≥600（3 处同步：nav-mini-bar / forum-ux-fixes G / nav-optical-center）；`probe-user-space-ia.mjs` 基线 79 PASS / 1 FAIL（既有）。
- `CommunityTab.vue` 有 **30s 轮询**（成员面板 setInterval，卸载即清）——后台周期取数存量，单独列项。

## 活动 / 头像框
- 日期单源 `utils/activity-date.js`（禁 `new Date` 宽松解析）；slug 单源 `activity-campaign.js`；**发布后 slug/url 永久不可变**。
- 清单是 **DB 优先合并**（`allAvatarFrames()` DB 行覆盖同 id 内置行）→ DB 一行 url 写错就顶掉仓库素材且无告警。控制台 `save()` 两道闸：素材归属 + 同素材两占。
- 框 scale ≈ 1/内孔占比，按孔心裁切，框层上限 116px；`frameScale` 写错静默回落 1.24。画布 `setPointerCapture` **必须 try/catch**（否则白屏）；手势只能用 CDP `Input.dispatchTouchEvent`。

## 其它单源 / 未部署
- TWA：单源 `android-twa/twa-manifest.json`，APK 推 Release `android-latest`；**触发路径不含 src/ → 只改 src/ 不触发打包**，但**改 `vite.config.js` / `public/icons/**` / `.well-known` 也会触发 APK 构建**（2026-09-20 实证：只动 vite.config.js 的提交照样打了 APK）；包名签名永久不可换；Pages 吞 `.well-known/` 靠 `.nojekyll`。
- Web Push（已实现未部署）：notifications 触发器 → push_outbox → `push-send` → FCM/APNs → `public/push-sw.js`（workbox.importScripts 注入，删了 SW 装不上）；决策出口 `boh_should_send_web_push()`；库必须 `jsr:@negrel/webpush`；VAPID 须 JWK；signOut 先解绑；与 Pushplus 会双发。

## PWA 版本更新（2026-09-20 修复「立即更新无效」）
- 根因：`forceCleanAndReload` 等 1.8s 就导航，旧 SW 的 NavigationRoute 用**旧预缓存** index.html 应答任何带查询串的导航（查询串只绕 HTTP 缓存，workbox 查预缓存会剥参数）→ 重载回旧版 + 弹窗复现。
- 修法：等接管 10s（无 installing/waiting 直接导航）→ 超时先 **caches.delete 全清**（预缓存未命中 → workbox 回落网络）+ unregister 只等 1s 宽限。⚠️ Chrome 实测：**有 SW 安装中时 `unregister()` promise 拖到安装结束才 resolve**，不能 await 到底。
- 探针 `scripts/probes/probe-version-update-click.mjs`（`--expect stale`=复现 / `fresh`=验证，`--static-delay-ms` 模拟弱网安装慢）；生产 logger 只出 warn+error，页面侧面包屑要 console.warn。

## 测试约定（vitest）
- ⚠️ 禁止「固定 tick 数」放行事件循环（setImmediate 属 check 阶段，可能早于动态 import 的 I/O）→ 用**条件 + 真实时间上限** `waitUntil(() => …, 5000)`；等假定时器用 `vi.getTimerCount() >= 1`。
- ⚠️ 未 await 的 promise 会级联污染下一用例（断言先抛 → pending 调用落到 mockReset 之后）→ `afterEach` 先 `await setImmediate` 再 `useRealTimers()`。
- 判「偶发」前先做**因果实验**（参数改极端 + 临时文件复跑），复现不出就别称根因。
