# BOHLITE 长期记忆（要点；细节见 .workbuddy/memory/YYYY-MM-DD.md 与用户级技能）

## 环境 / 探针
- hash 路由；dev 5173。探针在 `scripts/probes/`，**从仓库根** `node scripts/probes/xxx.mjs`；chrome channel；截图落 output/ 或 debug-screenshots/。
- playwright 必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；暗色用 addInitScript 设 `localStorage boh-theme=dark`；静态服务 run_in_background。
- 伪造登录：等 3s 现注 pinia isLoggedIn+userInfo（reactive({}) 须 Object.assign；id 须合法 UUID）；禁种 sb-*-auth-token、禁拦 /auth/v1/**；注入前等 `#app.__vue_app__`。
- 弹层断言必须验计算样式/几何（只验 DOM 存在会漏裸奔）；数据落定用条件等待不用 sleep。
- **「登录态就绪」≠「页面就绪」**：注入登录后还要等真实根元素（如 `.user-space-page`）出现，否则断言读到 index.html 骨架（rail/底栏全 ABSENT，一次十几条假红）。dev server 偶发模块请求失败会命中 index.html 内联 recovery → `?forceUpdate=true` 重载 → **注入的 pinia 登录态丢失**，探针要能自愈重注。
- 叠放式 tab（`.tab-page`）切 tab 时离场页面的页签仍可见且可能排在更前 → 查页签必须锚定「**第一个**可见组」，不能用「任意一个」。
- **`check:important-budget` 是纯文本匹配 `!important`（注释里的字面量也算），且只扫 `git ls-files`**（未跟踪的新文件不入库不报）→ 注释里要写这个词就用「感叹号 important」表述。
- 同一文件多处修改禁放同一并行 Edit 批次（静默丢改动）；**BSD grep 不支持 `\s`/`\|` 且不报错（静默空）** → 用 `[[:space:]]` 或内置 Grep；零引用断言须全仓检索。
- 沙箱前缀 `CODEBUDDY_BROKERED_FS_HOOK_ENABLED=0 CODEBUDDY_SAFE_DELETE_SANDBOX=0`；构建验证 `npx vite build --outDir dist-check`（勿动 dist）。
- dev server 可能只听 IPv6 `::1`（Chromium 走 IPv4 会 ERR_CONNECTION_REFUSED）→ 探针 BASE 用 `http://[::1]:5173`。页面上下文 `import('/src/composables/useIsland.js')` 可直接调 `showIsland.ai()` 打开 AI 岛、`useGlobalAiOverlay().close()` 关闭（同 URL=同模块单例）；AI 岛几何验证探针 = `probe-ai-island-rail.mjs`。

## 样式 / 主题
- **特异性优先**：`:global(.x)` 只输出 (0,1,0)，被同名 scoped `.x[data-v]` (0,2,0) 压过；覆盖用 `:not()` 提特异性，**勿新增 !important**（棘轮基线 1332）。
- **base.css 是 scoped 引入的** → 跨组件选择器带父 scope id，永远匹配不到子组件内部；改子组件内部样式必须写进该组件自己的 scoped，或把元素提到 grid 层用 `>` 直系选择器。
- 组件 scoped 压过全局 media → 响应式写进组件自己的 scoped media。玻璃/布局单一源 tokens.css（`--liquid-*` + `--boh-*`）；玻璃挂现成 `.liquid-glass` 只覆盖形态，禁裸写 `backdrop-filter: blur(NNpx)` NN≥14。
- themeManager init() 在 app.mount 之后 → index.html 有内联早期主题脚本；两份 VALID_THEMES 必须同步。全站禁 `content-visibility:auto`。空态一律 EmptyState.vue。
- **forum-dark.css 等主题 CSS 是 theme-css-loader 动态 import 的**（初始即暗色也会异步加载）→ 探针度量暗色样式前必须等含目标规则的样式表插入 styleSheets，否则读到亮色假象；暗色覆盖选择器要考虑 Teleport 到 body 的元素（继承不到 `.forum-page` 级变量，用 html 级 `[data-theme="dark"] …`）。
- **GlassPillButton**（`src/components/ui/GlassPillButton.vue`）= 白玻璃胶囊操作按钮基件（42 高/14 圆角/tone light|soft），材质走 `--glass-pill-*` 变量、暗色在 forum-dark.css；散装玻璃胶囊一律收敛到它，业务差异用父前缀提特异性覆盖。forum 工具 chip（`mobile-composer-chip`）是带激活态的工具件，未收敛（组件加 active prop 后可收）。发布会话内 `mobile-post-image-toolbar` 已全宽度隐藏（composer.css `.mobile-composer-overlay` 前缀，真相源单一）。
- 横屏登录岛：导航胶囊=上半岛、登录卡=下半岛，宽度单一源 `--boh-login-island-width`；navbar-dark 暗色 !important 已加 `:not(.has-login-card)` 放行。

## 首屏 / 发布
- **壳 = 入口 app-*.js 的 9 个静态 import**（app/vue-vendor/vue-utils-vendor/ui-icons/ui-components/supabase-vendor/state-vendor/auth-store/ui-sanitize），懒加载 131。sw.js 预缓存手写名单，`check:shell-precache` 反推断言。
- 白屏机理：ui-components 在预缓存内秒出 → 「导航栏+白屏」窗口；发新版后旧 hash 404 不自愈。probe-boot-perf 的「首屏可交互」= **Vue mount 时刻**，不是 FCP。
- 改 index.html 骨架 / manualChunks 必跑 `check:first-paint`（骨架色值 === tokens.css、骨架 style 早于样式表、内联 VALID_THEMES === theme-manager.js）。

## 数据层 / 订阅
- 类型筛选下推服务端；getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。迁移 YYYYMMDDNN，先 dry-run，push 必 --yes。
- 订阅 P0 已修（价格/时长/试用服务端权威化）。遗留：权益四处分裂；周签到 5 分 ≈ 21.7/月 ≥ Pro 月费 20；无降档/自动续费。AI Token 配额是唯一真闸。定价以积分为展示单位。

## UserSpace / 论坛 / 消息
- `.tab-page` = `absolute; left:0; width:100%; height:100%` 靠 z-index 叠放 → **改宽/改位只覆盖 left/width**，别动 flex/grid/滚动链。顶隙 `--userspace-nav-h`（58 / 展开 130+）。左栏类改造用 absolute 而非 fixed（躲祖先 transform/backdrop-filter 改写包含块）。
- 范围口径：「我的方块」= `UnifiedNavbar/index.vue:116` → `/user-space` = `UserSpaceMain.vue`；**他人空间 = `/profile/:username` = `views/Profile/ProfileMain.vue`**（两套平行视图，ProfileHomePanel 只属于前者；路由 `community.ts:88` 无 requiresAuth → 匿名可访问）。看**组件**不看 URL 前缀。
- **跨宿主复用组件的检查清单**：① **同名 CSS 变量在不同宿主作用域里可能是不同类型的值**（`--shadow-sm` 在 user-space 是完整 shadow、`profile/style.scoped.css` 里只是 rgba 颜色 → `box-shadow: var(--shadow-sm)` 静默失效），跨页复用只取全局单一源 `--liquid-*`；② 暗色覆写别写死某个宿主 class，用 `html[data-theme="dark"]`（祖先选择器不带 scope 属性，不会跨组件失配）；③ 组件根加 `width:100%; min-width:0`，否则作为 flex/grid 子项时内部横向滚动区会把整页撑宽。
- **横屏左栏（0915 落地）**：`UserSpaceSideRail.vue` + `side-rail.css` + `styles/landscape-rail.css`，UserSpaceMain 只加 1 组件 + 1 行 css。判据 `(orientation:landscape) and (min-width:1024px) and (min-height:600px)`（1024 天然排除全部手机横屏 ≤932）。宽度 88 / 240。10 项：主导航 5 + 便捷 2（发布/搜索）+ 工具 3（主题/首页/退出，退出仅登录态）；统一 `emit('action', id)` → `handleRailAction`。内层 `.userspace-rail-scroll` 承担滚动（玻璃层自己不滚）。
- 分栏三陷阱：① 右区左边缘 = 左栏右边缘，embedded 论坛 `.forum-container` 与 `.x-notifications-container.minimal-mode` 左右 padding 都是 0 → 用 `--userspace-content-gutter` 补；② 内部二次分栏改「压窄侧栏」；③ `.forum-container` 的 `100vw` 分栏后失真，域内改 `%`。
- 改横屏断点必须同步 3 处探针（probe-user-space-ia 横屏切 tab + 桌面居中以 `innerWidth/2` 为基准、probe-user-space-perf:99 clickNav×5）→ 用**双通道选择器**避免 if 分叉。
- **发布（右区全屏编辑器）**：复用 `ForumMain.openMobileComposer()`（横屏 FAB 恒不可见，overlay 只看 `isMobileComposerOpen` 不看 mode）。`defineExpose` 有 **TDZ 坑** → 后段函数须箭头包装。**ForumMain 只在社区 tab 挂载** → 先 `switchTab('community')` 再轮询 `forumViewRef`。overlay 被 `<Teleport to="body">` → 收右区必须用 **body 级选择器 + body 级变量**。
- **profile-\*.css 按需动态加载**（`preloadProfileStyles()`；仅初始 tab ∈ {posts,assets,settings} 预载）。**任何能在社区 tab 触发、却依赖 profile-*.css 的新入口必须先 `await preloadProfileStyles()`**，否则 UI 裸奔（实例：ThemeModal 的 `.modal-overlay` 退化成 static）。
- **AI 岛会撑大导航实测高度**：`.unified-nav-surface.has-bohai-island` 高度 = 胶囊 + min(50vh,520px) + 12 → `--userspace-nav-h` 暴涨（页签/消息避让照常跟随）。左栏顶隙单独走 `--userspace-rail-top-h`（UserSpaceMain 在 `isAiIslandOpen` 期间冻结、收场 600ms 定时器后恢复写入；side-rail.css 消费）——AI 岛是浮层，左栏不让位。SegmentTabs 的避让是自身 padding-top，测几何要量 `.segment-tab` 而非容器。
- 论坛入口 /user-space?tab=community。消息中心真实入口 = UserSpace messages tab 的 AsyncMessages（ForumMain 的 NotificationDrawer 是死 UI）；NotificationSuggestIsland 调度在 UserSpaceMain，须 ensureNotificationStore()。`Messages.showFeedback` 是「优先灵动岛」包装 → 断言提示要走 `boh_global_nav_status` 事件。useIsland「同一时刻只一张卡」不含自定义岛。
- **论坛工具栏 hero（0915 落地）**：横屏 ≥993 = 大玻璃容器（输入区上 + 底栏 [签到][问BOHAI] 左 / 圆搜索钮右），移动端原结构不变 —— 双 DOM 块（`.toolbar-hero-bar` vs `.toolbar-mobile-row`+`.toolbar-search-actions`）CSS 互斥切换；AI 状态/提示是 toolbar 直系子级（横屏挂工具栏下方）。周年皮肤有守卫块恢复行内形态。**输入区透明裸坐容器上（容器即输入框，focus-within 落描边），文字左对齐；hero 白底胶囊按钮用户明确满意保留**。
- **GlassPillButton（0915 封装）**：`src/components/ui/GlassPillButton.vue` = 白底玻璃胶囊通用按钮（`tone: light/soft`，class 透传承载业务态，`--liquid-inner-highlight` 带 fallback 可跨页用）。论坛 hero 签到/问BOHAI 已接；新页面要同款胶囊直接用它，别再复制样式。
- **#标签筛选语法**：搜索框输 `#服务器/#question` = 标签筛选；`deriveTagFilterFromInput` 返回 null(无#不干预)/''(未匹配清除)/value；无#记号时**不重置**筛选（防打字清掉下拉/点选的选择）。解析单一源 `applySearchFromInput`（提交/回车/防抖共用），chip × 与下拉选择先 strip 输入记号。
- **问BOHAI 链路**：`askBohai()` = getPosts 查相关帖(5条,hottest) → 拼 prompt → `showIsland.ai({ prompt, mode: 'fast' })` → 顶部 AI 岛自动发送回复；检索不耗额度、岛内回复耗用户额度。**AI 岛 mode 透传**：overlay `pendingMode`/`consumePendingMode()` → BOHAIIsland 消费后调 `bohaiMainRef.applySeedMode(mode)`（=selectMode 静默版，expose 自 BOHAIMain）。旧 BOHAI 搜索开关流（runAiSearch/isAiSearchEnabled）已删。

## 死代码清理
- 细则见用户级技能 `dead-code-safe-cleanup`（脚本在 `~/.workbuddy/skills/`）。选择器：AND 型 some 即可删；`:is()/:where()` 是 OR 须展开；`:not()` 内容剔除。删前查 important-budget.json；报告写 output/ 或仓库外。
- **同选择器多份定义 = 死规则温床**：改样式前先搜同选择器，用探针读 computedStyle 确认真生效的那条。
