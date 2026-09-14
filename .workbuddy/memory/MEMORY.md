# BOHLITE 项目长期记忆（精简版；细节见 .workbuddy/memory/YYYY-MM-DD.md 与用户级技能）

## 环境 / 探针
- hash 路由；dev 5173。**探针统一放 `scripts/probes/`**（0914 从根目录归档，80 个），一律**从仓库根运行** `node scripts/probes/xxx.mjs`（脚本内的 `dist/`、`output/` 等相对路径以 cwd 为准，故不受影响）；chrome channel，截图 output/ 或 debug-screenshots/。审计脚本里的语料排除是 `^scripts/` 前缀 → 归档后探针被正确排除（此前根目录的 probe-*.mjs 反而是规则盲区）。
- playwright 必加 args:['--no-proxy-server','--proxy-server=direct://','--proxy-bypass-list=*']；测暗色用 addInitScript 设 localStorage boh-theme=dark。静态服务必须 run_in_background。
- 伪造登录：等 3s 现注 pinia isLoggedIn+userInfo（reactive({}) 须 Object.assign；id 须合法 UUID）；禁种 sb-*-auth-token；禁拦 /auth/v1/**；admin 需真实会话；注入前 waitForFunction 等 `#app.__vue_app__`。
- 弹层断言：overlay→确认→detached；数据落定用条件等待。supabase mock 按 URL 分流，假行带齐 author_id/target_id。
- **选择器陷阱**：`querySelector('footer')` 误判 —— Footer.vue 根是 `<div class="footer-pages">`。断言前先确认真实根元素。
- 同一文件多处修改禁放同一并行 Edit 批次（静默丢改动）；重要编辑后 Grep 复核。**BSD grep 不支持 `\s`、`\|` 交替且不报错（静默空）** → 用 `[[:space:]]`、内置 Grep 或分开执行；空结果≠不存在；断言零引用须全仓检索（Edge Function / output / 根 html 都在 src/ 之外）。
- 沙箱拦截前缀 `CODEBUDDY_BROKERED_FS_HOOK_ENABLED=0 CODEBUDDY_SAFE_DELETE_SANDBOX=0`；构建验证用 `npx vite build --outDir dist-check`（勿动 dist）。

## 主题 / 样式
- themeManager：localStorage boh-theme→html[data-theme]，暗色 css 懒加载（themes/ 下 8 个文件）。**init() 在 app.mount 之后**，所以 index.html 里另有一份内联「早期主题脚本」（0914 起）在 HTML 解析期就把 data-theme 设好 —— 否则骨架的 `[data-theme=dark]` 分支是死规则、暗色用户首帧整屏白闪（dark-mode.css 也是懒加载，body 底色同样滞后）。**两份 VALID_THEMES 必须同步**，由 `check:first-paint` 门禁断言。Vue 不支持 `:global()`；全局 css 里 `:deep()` 静默失效。
- 两套暗色选择器都有效：① data-theme 挂 html + 13 个具名容器（theme-manager.js 的 applyTheme：.forum-page/.post-detail-page/.user-space-page/.account-security-page/.address-page/.subscription-page/.partners-container/.tags-impressions-page/.pushplus-settings-page/.shared-memory-page/#unified-nav-container/.bohai-page/.x-notifications-container；**.note-page 已随 boh-note 下线，勿再计入**）→ 后代式（2589 处）；② 7 个组件自绑定 `:data-theme="currentTheme"`。
- 玻璃单一源 tokens.css `--liquid-*`（26 个）。`--liquid-text-*` 浅 #1d1d1f/#6e6e73/#8b9098，暗 #f5f5f7/#a1a1a6/#8a919c。门禁 check-liquid-glass.mjs **只扫 tokens 定义，index.html 内联样式是盲区**。
- 3 份内联 token 副本已漂移：supabase/functions/user-data-export/index.ts、output/preview-html-v2.part.ts（各内联 23 个，暗 tertiary #7c7c82 仅 4.1:1）。改导出模板须同批对齐，验证链 probe-export-v2-harness.mjs。
- !important 棘轮门禁 check-important-budget.mjs（**基线 1332**）进 build:ci。Hero 单源=hero-surface.css。空态一律 EmptyState.vue。**全站禁用 content-visibility:auto**（WebKit bug 321501）。
- 组件 scoped 压过全局 media → 响应式写进组件自己的 scoped media。`body.page-*` 是活的（App.vue 挂 page-${route.name}）。

## 首屏 / 发布
- **壳 = 入口 app-*.js 的静态 import 9 个**（app、vue-vendor、vue-utils-vendor、ui-icons、ui-components、supabase-vendor、state-vendor、auth-store、ui-sanitize）；**懒加载 131 个**。壳集合可用 dist/index.html 的 modulepreload 名单复核。
- sw.js 预缓存 **110 项 / 9 JS**（vite.config.js globPatterns **手写名单**）。workbox 对手写名单里单个未匹配名字**不告警**（只对整条 glob 零匹配告警）→ 漏配只在真白屏时暴露。**已由 `check:shell-precache` 门禁覆盖（0914，挂 build:ci 的 vite build 之后）**：从产物反推入口静态 import 并断言 ⊆ 预缓存，带非空断言防"正则失配→空集→假绿"。
- `static/fonts/*.{woff,woff2}` glob 曾零匹配（dist/static 只有 css/images/js）→ **0914 已删**，重建后构建输出零 warning（warning 噪音会掩盖真正的不匹配）。
- 白屏机理：导航栏所在 ui-components 在预缓存内秒出，131 个路由 chunk 走网络 → 中间窗口"导航栏+白屏"；发新版后旧 hash 删除 → 路由 chunk 404 不自愈。
- 旧四层兜底全失效：Suspense fallback 永不 pending；内联 recovery 只听 link/script resource error（动态 import 失败不触发）；preload-recovery 撞 30s 冷却；terser drop_console → 线上零日志。
- ✅ 0914 已实施：① index.html 内联启动骨架（导航栏胶囊+三点 spinner，浅 #ffffff/暗 #0a0a0f）+12s 超时「重新加载」（?forceUpdate=true，参数会被 delete 后 replace，无死循环）；Vue mount 执行 `container.innerHTML=''` 自动清空。② App.vue 用 router.isReady()（bootReady/bootTimedOut 10s）渲染加载态、`<Suspense>` 改 v-else。③ globPatterns 补 ui-sanitize（109→110）。
- ✅ 0914 第二批修复：删掉骨架假导航胶囊（真实导航栏实测 ~90ms 就位；假胶囊 720×72 与真实默认全宽 1280×72 / scrolled 860×58 都不符，只会制造形态跳变）；骨架文字暗色 #a1a1a6→#8a919c（回到 tertiary 语义层）；新增早期主题脚本 + 暗色 body 底色兜底；删 fonts glob。**第三批**：两处超时文案统一为「加载超时，可能是网络不稳定或刚刚更新了版本」（index.html 12s / App.vue 10s，注释互引）；`<Footer v-if="bootReady && !route.meta?.hideFooter">` 防御；perf 探针补 try/finally 并把「首屏可交互」拆成 Vue挂载/主体首帧/骨架可见时长三个不混淆的指标；根目录两份审计 HTML 迁入 output/；80 个探针归档 scripts/probes/。
- 性能口径：probe-boot-perf 的「首屏可交互」实测是 **Vue mount 时刻**（判据=导航栏出现），与骨架无关；FCP 116→56ms 是骨架内联提前画的必然，不能解读为加载更快。
- 回归探针（都在 scripts/probes/）：probe-blank-screen-diagnosis.mjs（A正常/B延迟/C404/D壳404）、probe-verify-boot-changes.mjs（V1 暗色首帧 / V2 慢懒加载布局 / V3 暗色慢启动）、probe-boot-perf.mjs（FCP / Vue挂载 / 主体首帧 / 骨架可见时长四分指标，需 dist+dist-check 两份产物，带 try/finally）。
- **首屏门禁（build:ci）**：`check:first-paint`（骨架 7 组色值 === tokens.css / dark-mode.css 对应 token、骨架 `<style>` 位置早于 `</head>` 与任何样式表、index.html 内联 VALID_THEMES === theme-manager.js）+ `check:shell-precache`（壳依赖 ⊆ 预缓存）。两者都做过反证测试（改错色值 / 删主题 / 删预缓存条目都会红）。**改 index.html 骨架或 manualChunks 后必须跑这两个。**
- 发布形态：dist 顶层 404.html、CNAME、_headers、version.json + index.html meta boh-version/boh-build-id（bohVersionPlugin 注入，version-checker 比对 buildId）。

## 数据层 / 订阅
- 类型筛选下推服务端；getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。db push 必须 --yes；迁移先 dry-run；孤儿行 migration repair --status reverted；迁移编号 YYYYMMDDNN。
- 订阅 P0 已修（2026091001）：价格/时长/试用服务端权威化。遗留：权益四处分裂（订阅页硬编码/ai_quota_config/boh_cloud_image_limit_for_user/useLabQuota）；record_lab_usage 只 insert 不校验；周签到 5 分≈21.7/月 ≥ Pro 月费 20；无降档/自动续费。AI Token 配额是唯一真闸。
- ai_quota_config 线上已手工对齐页面（20/80/200/500/1000 万）→ Plus=Pro=10 万/积分。bohai_model_configs 仅 5 模式（fast/Ultra/Air/Code/agent-cluster）。「邀请好友注册」全仓无实现。
- 定价口径：以积分为展示单位，不强调 1 积分=1 元。钩子：Agent 重上线恢复宣传；Coding 附加包上架=价格表加种子。

## UserSpace / 论坛 / 消息
- 论坛入口=/user-space?tab=community；内容 tab=SegmentTabs 六档（按钮 role="tab"，须 getByRole('tab',{name})）；externalFeed 握手 → ForumMain watcher 单次同步。恒 Beta 6 单轨。
- 消息中心真实入口=UserSpace messages tab 的 AsyncMessages，非 ForumMain 的 NotificationDrawer（死 UI）。NotificationSuggestIsland 调度在 UserSpaceMain，须 ensureNotificationStore()。回归 probe-notification-suggest-island.mjs。
- 论坛多图：strip+分段指示器；全量图唯一入口 ensureForumPostFullImages（in-flight 去重）；shallowRef 元素改字段须整体替换+triggerRef；官方卡按 source_type+source_id 回源。
- 头像框：单源 useAvatarFrame.js AVATAR_FRAMES，素材 1223×1223 PNG≤400KB。新框流程：中心内切圆测量（white-cat 66.8% 基准）→散点构图勿机械 1/内孔→1223 缩放→清单注册→probe-avatar-frame-new.mjs。仓鼠白底须 flood fill 抠。暗色验收垫暗底截图；坐标以像素扫描为准。脚本写文件核对 OUT≠SRC，处理用户素材先留副本。
- 装扮路径 /#/user-space?tab=assets→现注 pinia→点「装扮」tab（无 URL 直达）。

## 导出预览
- user-data-export 内嵌 previewHtml=liquid-glass-v2；改模板必跑 probe-export-v2-harness.mjs；大块改动用锚点拼接，拼完查游离反引号/${。

## 死代码清理（细则见用户级技能 dead-code-safe-cleanup）
- 待清：glass-ui 76%、animations 89%、section__header 74% 死类；tailwind 引擎 0 使用但 preflight 生效；data-boh-theme 91 处；--apple-* 38/59 死。SCSS 编译 css 是 CRLF。
- 口径三套并存（1133/932/1493）待统一为单一脚本单一产物。工具：**用户级技能**里的 `~/.workbuddy/skills/dead-code-safe-cleanup/scripts/dead-code-audit.mjs`（6 维度只读报告；项目内 scripts/ 下并没有这个文件，别再找错）；它的语料排除按目录**前缀**匹配（tests/scripts/probe/tools/sso/api）。
- **审计语料必须排除生成产物**（stats.html、*-audit/report/results.json、上一次的 *-report.html/*-plan.html）与设计稿套件（Apple/Claude/Google/Golden Time Style）。**报告一律写 output/ 或仓库外**（0914 已把根目录 6 份分析报告迁入 output/：dead-code-cleanup-plan / github-component-scout-report / dark-mode-audit-report / style-remnant-audit-report / subscription-strategy-review / user-space-perf-audit-report；根目录现在只剩入口 index.html、12 个 demo 资产与已忽略的 stats.html）。`dead-code-audit.mjs` 默认不落盘、需显式 `--out`；`style-remnant-audit.mjs` 仍硬编码把 json 写到仓库根（待改）。
- 删除判据：选择器是 AND（some 即可删）；`:is()/:where()` 是 OR（须展开组合）；`:not()` 内容剔除。只删高置信死类。强耦合必查 important-budget.json、check-project-structure.mjs、以源码文本断言的单测。删完 find src -type d -empty。
