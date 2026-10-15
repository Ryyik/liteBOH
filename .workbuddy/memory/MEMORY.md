# BOHLITE 硬规则速查
> 长文归档 `MEMORY-full-2026-09-29.md`；每日进展见 `YYYY-MM-DD.md`。只留会咬人的规则。
> 分册（按需读）：`MEMORY-ops.md`（Supabase/EF/CI/Cloud+/图片列/页游）、`MEMORY-css-loading.md`（资源加载/__vitePreload/CSS 自愈）、`MEMORY-ai-config.md`（AI 配置页/密钥与模型 全细则）。

## 环境 / 工具
- vite 只绑 IPv6 → `--host ::`；构建用 `--outDir dist-check`（勿动 dist）；vitest `--pool=forks`；npx 被 SIGTERM → `./node_modules/.bin/<tool>`。
- safe-delete 拦「>50 文件删除」⇒ 让位用 `mv`（`dist-check`、`node_modules/.vite`、**`dist`**：跑 build:ci / vite build 前先 `mv dist /tmp/…`，否则 prepareOutDir 直接报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，并吐「壳样式允许清单为空」等**次生** warning 误导；CI 无此 shim）。
- 后台服务必须走托管后台任务；`nohup … &` 随工具调用被杀（curl 刚 200、下条即 ECONNREFUSED）。
- 竖屏视觉巡检修真源：探针 `scripts/probes/probe-portrait-visual-audit.mjs`（390×844 截图×多档 + DOM 诊断 + axe 对比度，`--only=` 可筛）；2026-10-13 报告 `docs/2026-10-13-竖屏视觉检查报告.md`（含 AI 设置抽屉不可滚动 / KeysAndModels 对话框无样式 / admin section 初始 tab 不落位 三个待修 P0-P1）。
- playwright：chrome channel + `--proxy-server=direct:// --proxy-bypass-list=*`；伪造登录注 pinia（等 `#app.__vue_app__` 后改 `pinia.state.value.auth`）；mock Supabase 必回 Content-Range；窄浮层（<300px）选项必须 `element.click()`。
- /tmp 一次性 ESM 引仓库依赖无效 → `createRequire('<repo>/package.json')` 或脚本放仓库根（用完删）。
- BSD grep 无 `\|` `\b` `\s`（静默 0 命中）→ `grep -E` / Grep 工具；macOS 无 `timeout`；BSD find 无 `-newermt`。
- 推 GitHub 走 `ssh.github.com:443`；`gh run watch <id> --exit-status`。
- ⚠️ 并行会话同工作区：last-write-wins；**提交只给明确路径、永不 `git add -A`**；棘轮共享 → `eslint . -f json` set diff 归因；**未提交的修复会被对方 git 级回滚**（2026-10-11 实证：自证绿后 11 分钟被 `git restore`）⇒ 交付后立刻 grep 修复点 + 复跑守卫。
- 改完必反证；探针漂移＝抖动非回归。

## 提交
- pre-commit 在 `.git/hooks/pre-commit`（**非 husky**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`）。
- 🔴 lint-staged 会卷进无关未暂存文件 ⇒ 每次 commit 后核对 `git show --stat HEAD`。误入修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 路径式 `git commit -F <msg> -- <路径…>`。
- 钩子会重排文件 ⇒ 提交前手跑同款（仅改动文件 prettier --write + eslint --fix），提交后对**提交后的树**再跑 verify。已实证：lint-staged 重排 57 文件令 `tabIds: [ 'x'` 字面量断言假红 ⇒ 源码守卫按**数组项/正则宽容**断言，不写格式化敏感的连续子串。

## 门禁 / 测试
- `npm run verify` 一条兜底（lint + type-check + test + 8 check + 棘轮总账）；发布前 `verify:full`。
- lint 带 `--max-warnings` 棘轮（**以 package.json 现值为准**，2026-10-12 = 116）⇒ 报绿必须同时报警告条数（口径 `eslint . -f json`）；计数归零才翻 error；上调必走 commit message。
- 新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 列未覆盖；棘轮 baseline 只许下调。
- 源码守卫：两边过**同一个** `tests/helpers/source.js` 归一函数；否定断言先 `scriptSection()` + `stripComments()`（.vue 全文剥注释会吃掉真实代码）。
- ⚠️ 「找不到元素就跳过」＝假绿温床 ⇒ 找不到就 **fail**；「模板里有 X」是没牙断言 ⇒ 给产物打 `data-*` 钩子按 id 对齐断言「真的画出来了」；反证**只撤单点**（撤两处会中途崩）。
- ⚠️⚠️ **样式类改动/故障的验收必须带截图肉眼过**（2026-10-13 实证：三 CSS 全失败时程序化差分只报 1 项，肉眼是大面积塌陷；采样点不能替代视觉）。留证探针 `probe:css-visual`。

## CSS / 主题
- `:root` 禁进 scoped @import；全局变量唯一入口 `glass-aliases.css`；动效/玻璃单源 `tokens.css`；暗色真源 `theme-manager.js`；scoped 特异性 +1。
- ⚠️ 液态玻璃三铁律：材质单源 `liquid-glass.css` 只挂基础类（≤768px 强制关 backdrop 变体）；scoped 让位写 `:not(.liquid-glass)`；白底玻璃需 `.cloud-page::before` 环境光 + 父级 `isolation:isolate`；色值走 color-mix。
- ⚠️ 玻璃底图**必须放面板背后**（进 `backdrop-filter`）；放面板自身 `background-image` 不经过模糊 ⇒ 深色字块透进正文（白遮罩 .90 仍剩约 8% 可见）。
- ⚠️ 暗色覆盖三坑：① 异步 chunk 的 scoped 样式带 `[data-v-*]` 且晚于 themes/*.css ⇒ `[data-theme=dark] .x` 被压掉，必须写 `html[data-theme=dark] .x`；② 反色实心按钮（`--liquid-text-primary` 底 + `color:#fff`）暗色改 `color:var(--boh-bg-primary)`；③ 共享组件禁依赖宿主私有变量（`--text-primary` 只由 `.user-space-page` 定义），走全局 `--liquid-text-*`。
- ⚠️ 判「白玻璃」看**元素自身 background-color**（合成亮度会骗人：55% 白叠深底 lum≈0.27 < 阈值 0.35 假绿）；`check:dark-tokens` 连 `var(--x,#hex)` fallback 也计数 ⇒ 想零增长别写 fallback。护栏 `probe:dark-surfaces`(36)。
- ⚠️ **fixed 容器会被撑高的子元素撑开**：`#unified-nav-container` 岛展开 78→390px 且 `pointer-events:auto`（**撑高有意**，接「点外部关闭」，别改高度）；带实心背景就成页顶一块矩形 ⇒ 容器只定位＋接点击，**视觉全交 `.unified-nav-surface`**。
- ⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 子项 shrink:0）＝压 0 宽/竖排字/被裁；修法是折行。
- ⚠️ 绝对定位浮层**禁挂 overflow 滚动容器内**（任一轴非 visible 裁到 padding box；88px 窄栏下 172px 浮层剩 68px）。**240px 宽栏 215>172 恰好不暴露 ⇒ 断言必须覆盖窄档**。浮层挂成滚动容器**兄弟**；`contain:paint`（`.liquid-glass`）同样裁后代，左栏靠 `side-rail.css` 的 `contain:none` 让位。护栏 probe-rail-more-menu(16)。
- ⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**。高度断言用 `offsetHeight`。
- ⚠️ `.badge` 在 `1fr` 网格列默认 stretch ⇒ 要 `justify-self:start`。
- ⚠️ 切 tab 只切 class 不同步 `hidden` ⇒ `.panel.is-on{display:block}` 压过 `[hidden]`，两面板同时显示。
- ⚠️ `--muted-foreground:#7f8d9f` 在白底只有 3.38:1（< AA 4.5）⇒ 达标值 `#5a6577`(5.41) / 暗色 `#a8b0bd`(7.49)。

## 路由 / 交互 / 单源
- `key=route.path`（禁 fullPath/name）；`<script setup>` 运行时 API 显式 import；ForumMain `watch immediate` 禁同步调下方 const（TDZ）。
- `useConfirmDialog` 互斥**会 reject** → 调用点把预期拒绝归化成取消，别删那条 reject。
- UserSpace 旧 tab 映射单源 `resolveRequestedUserSpaceTab()`；直接用裸 `route.query.tab` ⇒ 旧值失映射＝整页白屏。
- ⚠️ 手动输入框时**不能整体重绘**（光标会丢），单独 sync 提交按钮 disabled。
- 可见性单源 `isGlobalNavbarVisible(route)`；首页入场真源 `.home --gate-p`（probe-home-gate-pull 50）；竖屏菜单 probe-nav-mobile-menu(48)；概览岛唯一触发点＝首页 gateSettled 落定。
- 头像框：佩戴同步唯一注册点 `initAvatarFrameSync()`；url→id 反查不到**保留本机**、绝不回落 none；`avatar_frames.url` 发布后不可变；本机 key `boh-avatar-frame-id/-owner/-pending`。
- 自动增高真源 `composables/useAutoGrowTextarea.js`（勿加第 5 份）；上限只声明在 CSS max-height；空内容先摘 placeholder 再量；`height='auto'` 后必须无条件写回。护栏 probe-reply-autogrow(10)。
- 动态加载失败恢复 `vite-preload-recovery.js`；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`；论坛搜索 RPC 单实现 9 参（PG 42725，禁新增签名）。
- AI 额度口径 `utils/ai-quota-display.js`：界面**只显示百分比**（进度条走 `meterPercent`、`percent` 不封顶）；档位比大小走 `subscription-benefits.js` 的 `PLAN_AI_TOKEN_PERCENTS`；**界面不许显示 Token 数**。
- `bohai_model_configs.api_url` 只解析 `choices[0]`；`freemodels.api_base_url` 名字误导，存的是**完整 chat/completions 端点**（存量如此勿改语义）。
- 跨表同名字段语义真源 `src/config/field-semantics.ts`（`lab_ai_model_configs.model_id` 存的是 `bohai_model_configs.mode_id`）。守卫 `tests/unit/field-semantics.test.js`。

## 资源加载 / __vitePreload（细则见 `MEMORY-css-loading.md`）
- `cssCodeSplit:true` ⇒ 路由级 CSS（含 SFC scoped）不在 index.html，由路由 chunk JS 经 `__vitePreload` 建 `<link>` 注入；SW 只预缓存 2 个壳 CSS，其余 runtimeCaching CacheFirst。
- ⚠️ 助手时序：并发建 link → 全 settle → reportError 每个 rejected → 最后 `loadModule()`；CSS 失败无人 preventDefault 会 throw ⇒ **整条链 reject、`loadModule()` 永不执行**（「点底栏毫无反应」）⇒ CSS 失败必须无条件吞（`vite-preload-recovery.js` 的 `shouldSwallowPreloadError`），JS chunk 失败才上抛。
- ⚠️ 去重表 `i[url]` 在 fetch 完成前写入 ⇒ 失败后同会话再 import 直接 resolve、永不重建 link ⇒ 页内重试只能**摘旧 link 用同一 href 重建**。
- ⚠️ **动态 CSS 的失败兜底只有一个实现处**：`src/utils/style-load-guard.js`（判活读 cssRules 包 try / 摘旧 link 重建 / 有限退避 + 修好即停 + 离开即停）。新页面用 `createStyleSheetGuard({ matchers, delays, isActive })`，**不要再写一份**；守卫 `tests/unit/style-load-guard.test.js` 拦「本地自建 link / 自读 cssRules」。已接入：profile 三样式、暗色主题 8 CSS。
- ⚠️ 异步组件统一走工厂 **`createPanelAsync(loader, { label })`**（`src/utils/async-component.js`）：delay 120 / timeout 20s / 退避重试 2 次 / 失败上报 / 内联样式错误卡。**裸 `defineAsyncComponent` 已清零**，门禁 `check:async-component-fallback`（题 0/0）新增即红。
- ⚠️ 「先裸后穿」就绪门：`UserSpaceMain.vue` 的 `.content-home-host` 带 `:data-styles-ready`、未就绪 `visibility:hidden`；放行 = `areProfileStylesApplied()` 或 **1000ms 超时兜底**。判就绪**必须**用 `guard.areApplied()`（`repairNow()===0` 会误判）。
- 可观测出口：`monitoring.js` 的 `reportEvent(type, payload)`（端点**惰性读取**，未配 `VITE_MONITORING_ENDPOINT` 时静默 false）。已接信号：`css_load_failure`、`style_repair_giveup`。
- 部署竞态对策：**已知有新构建时，在「用户本来要换页的那一拍」先整页切构建**（`version-checker.applyPendingUpdateBeforeNavigation` + router beforeEach 最前面 `next(false)`）；防循环靠 `boh_version_reload_target`（同一 buildId 只试一次）。验收 `probe-update-on-navigation`。
- ⚠️ 别再提「SW 导航改 NetworkFirst」（已撤回）：旧 SW 应答旧 index.html 已由 `forceCleanAndReload` 正面处理，且 `dismantleServiceWorkers` 兜底**依赖** NavigationRoute 回落网络行为。
- ⚠️ 探针 `page.evaluate(fn)` **只序列化函数体** ⇒ 闭包依赖一律作为**参数**传入。
- ⚠️ 棘轮名 ≤20 字符（`check-ratchet-summary` 列宽）；node 22 `globalThis.navigator` 只读 ⇒ `Object.defineProperty`；新增未用变量会当场推高 lint 棘轮。

## AI 配置 / 密钥与模型（全细则 → `MEMORY-ai-config.md`）
- 需求基线（用户定 2026-10-12）：添加平台＝选平台→贴 Key→**自动拉取模型**（不出现 base_url）；手动建平台只有 名称/地址/Key；6 tab → 3 tab。原型 `ai-config-demo.html`。
- ⚠️ 三个必读陷阱（细节见分册）：provider 分「模型平台/工具服务」两类；`api_key_vault` 唯一键 `(provider,purpose)` ⇒ **再保存＝替换**，必须先点名覆盖行；一列只能有一个写入口（`quota_multiplier` 双写曾互相覆盖）。

## 新增工具（2026-10-15 AI 环境审计落地）
- 开工先跑 `npm run env:doctor`（30 项**实测**自检）。⚠️ **诊断档，永远 exit 0，刻意不进 verify**；`--strict` 才当门禁，别顺手接进 verify/build:ci。
- lint 棘轮红了用 `npm run lint:delta`（**别手工 set diff**）。两条设计别改坏：`HEAD` 侧走 `git show` + `eslint --stdin --stdin-filename`（**不碰工作区**，`git stash` 会动并行会话的改动）；基线侧并发 6 + 剪枝（5m56s→1m05s，`--full` 才全量）。
- `check:root-clean`（`verify` 链内）：根目录沙盒棘轮，冻结 **25 html + 3 临时脚本**，新增即红。落点 `docs/demos/`，归拢后 `check:root-clean:update` 降基线。
- 环境坑 10 条 + **并行会话纪律**（提交只给明确路径、永不 `git add -A`）已提进**必读通道** `docs/AI-ENV.md`（AGENTS.md §1 必读表）。
- AGENTS.md 三条超长条目的坑记录外置到 `docs/gate-matrix.md` §C（AGENTS.md 51.5KB→45.1KB）。
- ⚠️ **判据必须连带单位**：审计报告称「AGENTS.md 3 行超 2000 字符被截断」是**错的** —— macOS `awk length` 按**字节**算，那三行 2406 字节 / 1326 字符，**从未截断**。一个 `length` 就能编出一条结论。
- ⚠️ 实测坑复现：新脚本 import 了没用到的符号 ⇒ lint 立刻 117/116 超棘轮。**新脚本落地后先跑一次 `lint:delta`。**

## 新方向：BOH分镜（2026-10-13 起，进行中）
- 定义（用户定）：视频拍摄脚本编辑器，**支持 AI 生成或手写，可导出**，要能嵌进网页。原型 `boh-fenjing-demo.html`（仓库根，单文件零依赖，同 ai-config-demo 惯例）。
- 生态结论：网页端同类**全是 React，无一可直接集成**（Vue 无现成货）。可抄：openframe（MIT，10 个景别 SVG 已移植）；禁抄：OpenShotDesigner / mediastory（GPL）、youmedhub / storyboarder（**无 license**）。剪映草稿导出 **JS 侧无成熟库**（生态全在 Python/C#/Java）。
- 拟落点：Vue 3 组件 + Supabase，AI 走现有模型配置通道；导出链＝项目 JSON 单一真源 → CSV / PDF / Markdown 派生。用户问过「是否按 React 重写」——结论：**不重写**（能抄到的 React 代码量极小，等于零收益、全量成本）。
- 液玻结论：**不是 React 专属**。用户已选型 **`@wxperia/liquid-glass-vue`**（MIT；实拍 demo ＝ `demo-wxperia-liquid.html`，16 项探针全绿，含透明度/磨砂滑杆）。⚠️ 集成五坑（详见 2026-10-13 日志）：默认导出是插件要用命名导出 `{ LiquidGlass }`；浮层式定位（必须传 style）；玻璃紧贴内容尺寸；shader worker 绝对路径需拷 `public/assets/`（仅 shader 模式用）；**模糊公式 `blur = (overLight?12:4) + blurAmount×32` px，阅读面建议 0.4~0.5、装饰按钮 0.1~0.25**；**透明度＝内容层白膜 α（默认 0.12，≥0.40 切深字）**。另一备选 `liquid-web`（MIT、跨框架、可内联）。**Beta7 交付配方（含滑杆口径与六条清单）＝ `docs/未完成任务清单.md` §21。**
- BOHAI 材料地图（2026-10-14 盘点）：**已有 CSS 液态玻璃「一组材质、六个消费者」**（`boh-composer.css:913-939` + `boh-stream.css:886-902`；材质单源 `--liquid-filter-sm`，颜色 `--boh-glass-*` 成对）；侧栏/工作台/气泡/代码块**保持实心是设计口径**。折射级（WXperia）**已落地进 src/**（2026-10-14：`BohGlassRefract.vue` 覆盖层组件 + 输入框/模型/工具三处，`probe-bohai-glass.mjs` 19 项全绿；`.boh-main` z-index 已让位、菜单 z 40→20-22；**用户透明度滑杆已落 设置→外观**（`glassOpacity` 偏好持久化）。⚠️ **官方样貌单源 = `src/config/liquid-glass-spec.js`**（2026-10-14 两次「白底玻璃隐形」事故——本会话+并行会话各一次——后建立：厚膜+撤投影是死因；改观感只改 spec + 跑 `bohai-glass-look-spec` 守卫；参数已对齐官方 demo：blur 0.4/位移 70/白膜默认 0.25，唯一有意分歧 elasticity=0）。⚠️ **采样根硬约束**：玻璃祖先链上的任何堆叠上下文（z-index/isolation/opacity/filter/transform）都会降级/灭掉模糊——**真实代码 `.boh-main{z-index:1}` 接线时必改**（菜单 z 40→20 保抽屉层级）；堆叠 A/B 必须整页重建（运行时切换不复合）；elasticity 必须 0；overlay 结构 + `glassSize:{width:'100%'}` 可让 autogrow 零 JS 跟随。详见 `docs/未完成任务清单.md` §21.7。
