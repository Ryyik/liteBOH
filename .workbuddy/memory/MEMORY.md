# BOHLITE 硬规则速查
> 长文归档 `MEMORY-full-2026-09-29.md`；每日进展见 `YYYY-MM-DD.md`。只留会咬人的规则。
> 分册（按需读）：`MEMORY-ops.md` —— Supabase/EF/CI/Cloud+/图片列/页游 细则。

## 环境 / 工具
- vite 只绑 IPv6 → `--host ::`；构建 `--outDir dist-check`（勿动 dist）；vitest `--pool=forks`；npx 被 SIGTERM → `./node_modules/.bin/<tool>`。
- safe-delete 拦「>50 文件的删除」⇒ 让位用 `mv`（`dist-check`、`node_modules/.vite`）。
- 后台服务必须托管后台任务；`nohup … &` 随工具调用被杀（curl 刚 200、下探针 CONNECTION_REFUSED）。
- playwright：chrome channel + `--proxy-server=direct:// --proxy-bypass-list=*`；伪造登录注 pinia；mock Supabase 必回 Content-Range；窄浮层（<300px）选项必须 `element.click()`。
- /tmp 一次性 ESM 引仓库依赖无效 → `createRequire('<repo>/package.json')` 或脚本放仓库根（用完删）。
- BSD grep 无 `\|` `\b` `\s`（静默 0 命中）→ `grep -E` / Grep 工具；macOS 无 `timeout`；BSD find 无 `-newermt`。
- 推 GitHub 走 `ssh.github.com:443`；`gh run watch <id> --exit-status`。
- ⚠️ 并行会话同工作区：last-write-wins；**提交只给明确路径，永不 `git add -A`**；棘轮共享 → `eslint . -f json` set diff 归因；判写入者 `find … -mmin -3` 连看两次。
- ⚠️ **未提交的修复会被对方 git 级回滚**（2026-10-11：自证绿后 11 分钟被 `git restore` 回原样，连 prettier 格式都退）⇒ 交付后立刻 grep 修复点 + 复跑守卫。
- 改完必反证；探针漂移＝抖动非回归。

## 提交
- pre-commit 在 `.git/hooks/pre-commit`（**非 husky**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`）。
- 🔴 lint-staged 会卷进无关未暂存文件 ⇒ 每次 commit 后核对 `git show --stat HEAD`。误入修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 重提用**路径式** `git commit -F <msg> -- <路径…>`。
- 钩子会重排文件 ⇒ 提交前手跑同款（仅改动文件 prettier --write + eslint --fix），提交后对**提交后的树**再跑 verify；别把钩子改成 prettier --check。

## 门禁 / 测试
- `npm run verify` 一条兜底（lint + type-check + test + 8 check + 棘轮总账）。
- lint 带 `--max-warnings` 棘轮（**以 package.json 现值为准**，2026-10-12 = 116）⇒ 报绿必须同时报警告条数（口径 `eslint . -f json`）；计数归零才翻 error；上调必走 commit message。
- 新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 列未覆盖；棘轮 baseline 只许下调。
- 源码守卫：两边过**同一个** `tests/helpers/source.js` 归一函数；否定断言先 `scriptSection()` + `stripComments()`（.vue 全文剥注释会吃掉真实代码）；换行/尾逗号交归一，引号风格/补分号写宽容正则。
- ⚠️ 「找不到元素就跳过」＝假绿温床 ⇒ 找不到就 **fail**。
- ⚠️ 「模板里有 X」是没牙的断言（撤掉渲染逻辑照样绿）⇒ 给产物打 `data-*` 钩子，按 id 对齐断言「真的画出来了」。
- 反证**只撤单点**：撤两处会中途崩（元素不可见超时），拿不到「反证成立」。

## CSS / 主题
- `:root` 禁进 scoped @import；全局变量唯一入口 `glass-aliases.css`；动效/玻璃单源 `tokens.css`；暗色真源 `theme-manager.js`；scoped 特异性 +1。
- ⚠️ 液态玻璃三铁律：材质单源 `liquid-glass.css` 只挂基础类（≤768px 强制关 backdrop 变体）；scoped 让位写 `:not(.liquid-glass)`；白底玻璃需 `.cloud-page::before` 环境光 + 父级 `isolation:isolate`；色值走 color-mix。
- ⚠️ 玻璃底图**必须放面板背后**（进 `backdrop-filter`）；放面板自己的 `background-image` 不经过模糊 ⇒ 深色字块透进正文（白遮罩 .90 仍剩约 8% 可见）。
- ⚠️ 暗色覆盖三坑：① 异步 chunk 的 `<style scoped>` 带 `[data-v-*]` 且晚于 themes/*.css ⇒ `[data-theme=dark] .x` 被压掉，必须写 `html[data-theme=dark] .x`；② 反色实心按钮 `background:var(--liquid-text-primary)+color:#fff` 只在浅色成立，暗色改 `color:var(--boh-bg-primary)`；③ 共享组件禁依赖宿主私有变量（`--text-primary` 只由 `.user-space-page` 定义），走全局 `--liquid-text-*`。
- ⚠️ 判「白玻璃」看**元素自身 background-color**（合成亮度会骗人：55% 白叠深底 lum≈0.27 < 阈值 0.35 假绿）；`check:dark-tokens` 连 `var(--x,#hex)` fallback 也计数 ⇒ 想零增长别写 fallback。护栏 `probe:dark-surfaces`(36)。
- ⚠️ **fixed 容器会被撑高的子元素撑开**：`#unified-nav-container` 岛展开 78→390px 且 `pointer-events:auto`（**撑高有意**，接「点外部关闭」，别改高度）；带实心背景/backdrop 就成页顶一块矩形（「一有岛活动就带出一大块黑色」）⇒ 容器只定位＋接点击，**视觉全交 `.unified-nav-surface`**。先例 `.nav-immersive-on .unified-nav` 退场。
- ⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 子项 shrink:0）＝压 0 宽/竖排字/被裁；修法是折行。
- ⚠️ 绝对定位浮层**禁挂 overflow 滚动容器内**（任一轴非 visible 裁到自身 padding box；左栏「更多」172px 在 88px 窄栏被裁到 68px）。**240px 宽栏 215>172 恰好不暴露 ⇒ 断言必须覆盖窄档**。浮层挂成滚动容器的**兄弟**；`contain:paint`（`.liquid-glass` 基础类）同样裁后代，左栏靠 `side-rail.css` 的 `contain:none` 让位。护栏 probe-rail-more-menu(16)。
- ⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**。高度断言用 `offsetHeight`。
- ⚠️ `.badge` 在 `1fr` 网格列默认 stretch ⇒ 被拉成横带，要 `justify-self:start`。
- ⚠️ 切 tab 只切 class 不同步 `hidden` ⇒ `.panel.is-on{display:block}` 压过 `[hidden]`，两面板同时显示。
- ⚠️ **`--muted-foreground: #7f8d9f` 在白底只有 3.38:1**（< AA 4.5），面板所有「模式/模型 ID」都在这个色上。达标值 `#5a6577`(5.41) / 暗色 `#a8b0bd`(7.49)。

## 路由 / 交互 / 单源
- `key=route.path`（禁 fullPath/name）；`<script setup>` 运行时 API 显式 import；ForumMain `watch immediate` 禁同步调下方 const（TDZ）。
- `useConfirmDialog` 互斥**会 reject** → 调用点把预期拒绝归化成取消，别删那条 reject。
- UserSpace 旧 tab 映射单源 `resolveRequestedUserSpaceTab()`（三处共用）；直接用裸 `route.query.tab` ⇒ 旧值失映射＝整页白屏。
- ⚠️ 手动输入框时**不能整体重绘**（光标会丢），要单独 sync 提交按钮 disabled。
- 可见性单源 `isGlobalNavbarVisible(route)`；首页入场真源 `.home --gate-p`（probe-home-gate-pull 50）；竖屏菜单 probe-nav-mobile-menu(48)；概览岛唯一触发点＝首页 gateSettled 落定。
- 头像框：佩戴同步唯一注册点 `initAvatarFrameSync()`；url→id 反查不到**保留本机**、绝不回落 none；`avatar_frames.url` 发布后不可变；本机 key `boh-avatar-frame-id/-owner/-pending`。
- 自动增高真源 `composables/useAutoGrowTextarea.js`（勿加第 5 份）；上限只声明在 CSS max-height；空内容先摘 placeholder 再量；`height='auto'` 后必须无条件写回。护栏 probe-reply-autogrow(10)。
- 动态加载失败恢复 `vite-preload-recovery.js`（全局壳 defineAsyncComponent 必带 onError retry + errorComponent）；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`；论坛搜索 RPC 单实现 9 参（PG 42725，禁新增签名）。
- AI 额度口径 `utils/ai-quota-display.js`：界面**只显示百分比**（基础＝100%、附加包把满量程推到 100%+包%、进度条走 `meterPercent`、`percent` 不封顶）；档位比大小走 `subscription-benefits.js` 的 `PLAN_AI_TOKEN_PERCENTS`（基准＝Plus 100%）。`PLAN_AI_TOKEN_LIMITS` 仍在（百分比由它推导），**界面不许显示 Token 数**。
- `bohai_model_configs.api_url` 只解析 `choices[0]`；`freemodels.api_base_url` 名字误导，存的是**完整 chat/completions 端点**（存量如此，勿按名字改语义）。
- 跨表同名字段语义真源 `src/config/field-semantics.ts`（`lab_ai_model_configs.model_id` 存的是 `bohai_model_configs.mode_id`）。守卫 `tests/unit/field-semantics.test.js`。

## 资源加载 / __vitePreload（2026-10-13 实测）
- `cssCodeSplit:true` ⇒ **路由级 CSS（含 SFC scoped、`<style src>`）不在 index.html 里**，由路由 chunk 的 JS 经 `__vitePreload` 建 `<link>` 注入；SW 只预缓存 index.html 引用的 2 个壳 CSS，其余走 runtimeCaching `/static/css/` CacheFirst。
- ⚠️ 助手时序（dist 内核实）：**并发建 link → 全 settle → 依次 reportError 每个 rejected → 最后才 `loadModule()`**。`reportError` 没人 `preventDefault` 就 **throw**，那一步在 `.then` 里 ⇒ **整条链 reject、`loadModule()` 永不执行** ⇒ 一条 CSS 404 能炸掉整个路由 chunk 的 `import()`（表现为「点底栏毫无反应、导航被吞」）。CSS 失败必须无条件吞（`utils/vite-preload-recovery.js` 的 `shouldSwallowPreloadError`），JS chunk 失败才维持上抛。
- ⚠️ **去重表 `i[url]` 在 fetch 完成前写入** ⇒ 失败后同会话再 `import` 同一文件**直接 resolve、永不重建 link**（「切走再切回」是假重试）⇒ 页内重试只能**摘旧 link 用同一 href 重建**（`async-loaders.js` 的 `reloadProfileStyleLink`）。
- ⚠️ **`__vitePreload` 给 CSS link 带 `crossOrigin`** ⇒ 失败/过渡态 sheet 读 `cssRules` 抛 SecurityError；按规则数判活必须包 try（读不到＝未生效）；健康 link 实测可读（profile-base 224 条）。
- 全局恢复链预算有限：`vite:preloadError` 有 30s sessionStorage 冷却（`boh_vite_preload_reload_ts`），index.html 的 link-error 监听有 `bohAssetRecovery` 一次性护栏 ⇒ 一次会话只够救一两次，**别把持久故障的兜底全押在它上面**。
- 复现/验收探针 `probe:css-failure`（五段：基线差分 / 持续失败 / 路由 CSS 失败 / 恢复链限流下的自愈 / 暗色主题自愈）。判据用**自校准差分**（先采健康基线再逐属性 diff），写死属性值会被层叠覆盖坑（`.profile-tab` padding-top 被 shell-community.css:2862 覆盖成 10px）。
- ⚠️ **动态 CSS 的失败兜底只有一个实现处**：`src/utils/style-load-guard.js`（判活读 cssRules 包 try / 摘旧 link 同一 href 重建 / 有限退避 + 修好即停 + 离开即停）。新页面要兜动态 CSS 就 `createStyleSheetGuard({ matchers, delays, isActive })`，**不要再写一份**，守卫 `tests/unit/style-load-guard.test.js` 会拦「本地自建 link / 自读 cssRules」。已接入：profile 三样式（`async-loaders.js`）、暗色主题 8 个 CSS（`theme-css-loader.js`）。
- ⚠️ 探针 `page.evaluate(fn)` **只序列化函数体**：闭包里的模块级变量在页面里不存在（踩过 `DARK_THEME_KEYS is not defined`）⇒ 一律把依赖作为**参数**传进去。
- 可观测出口：`monitoring.js` 的 `reportEvent(type, payload)`（端点**惰性读取**，未配 `VITE_MONITORING_ENDPOINT` 时静默返回 false ⇒ 线上没配就等于没上报，改前先确认）。已接信号：`css_load_failure`（按资源名去重）、`style_repair_giveup`（scope profile / dark-theme）。
- 门禁 `check:async-component-fallback`：裸 `defineAsyncComponent`（无 onError/errorComponent）台账棘轮，基线 `scripts/async-component-baseline.json`（24 处 / 10 文件），接在 **verify + build:ci 两条链**（CI 只跑 build:ci）；新增即红，下调跑 `check:async-component-fallback:update`。剥注释走 `tests/helpers/source.js`。
- 部署竞态对策：**已知有新构建时，在「用户本来就要换页的那一拍」先整页切构建**（`version-checker.applyPendingUpdateBeforeNavigation` + `router/index.ts` 的 beforeEach 最前面 `next(false)`）；防循环靠 `boh_version_reload_target`（同一 buildId 只试一次）。验收探针 `probe-update-on-navigation`。
- ⚠️ 棘轮名 ≤20 字符（`check-ratchet-summary` 列宽 20，超了整张表歪）；node 22 `globalThis.navigator` 只读 ⇒ 测试用 `Object.defineProperty`；lint 的 `--max-warnings` 棘轮对**新增未用变量**当场红（探针里多一个变量即从 116→117 失败）。
- ⚠️⚠️ **程序化差分判据会严重低估视觉故障（2026-10-13 截图实测）**：我的页三 CSS 全失败时 `getComputedStyle` 差分只报 **1 项**（`.profile-page-content` padding 40px→0px），肉眼却是**大面积塌陷**（头像跑位/昵称竖排断行/胶囊退化成裸标签/stats 挤成一行/卡片内部散在四角）；成员页路由 CSS 失败时差分只报 4 项，肉眼是**整页被一个巨型黑色 loading 圆环占满 + 隐藏的 `<input type=file>` 露出**（⇒ `shell-community.css` 还负责 spinner 尺寸约束与 hidden 规则，它一丢是「页面崩了」而非「布局歪了」）。**结论：样式类改动/故障的验收必须带截图肉眼过，采样点不能替代视觉。**
- 视觉留证探针 `probe:css-visual`（`scripts/probes/probe-css-visual-check.mjs`）：五态截图（健康我的页 / 健康成员页 / 故障我的页 / 故障成员页 / 自愈后）+ 场景 F 就绪门验收；`deviceScaleFactor:2`、`serviceWorkers:'block'`；输出目录默认 `/tmp/css-visual-<ts>`；有 violation 时 exit 1。
- ⚠️ 异步组件统一走工厂 **`createPanelAsync(loader, { label })`**（`src/utils/async-component.js`）：delay 120 / timeout 20s / 退避重试 2 次 / 失败上报 `async_component_failure` / **内联样式**错误卡（不依赖任何 CSS）。**裸 `defineAsyncComponent` 已清零**（24→0），门禁 `check:async-component-fallback` 台账归零 ⇒ 新增一处即红；替换全部 24 处时**不要**再手写第二份。
- ⚠️ 「先裸后穿」的就绪门：`UserSpaceMain.vue` 的 `.content-home-host` 带 `:data-styles-ready`，scoped CSS 未就绪时 `visibility:hidden`；放行两条路 = `areProfileStylesApplied()` 或 **1000ms 超时兜底**（不能永久空白）。判就绪**必须**用 `guard.areApplied()`，`repairNow()===0` 会误判（「link 尚未建出」也是 0）。
- ⚠️ **别再提「SW 导航改 NetworkFirst」**（2026-10-13 评估后撤回）：旧 SW 用旧预缓存 index.html 应答导航这件事已由 `version-checker.forceCleanAndReload`（等新 SW 接管 / 否则注销 SW + 清缓存）正面处理，且 `dismantleServiceWorkers` 的兜底**依赖** NavigationRoute「预缓存未命中回落网络」行为 —— 关掉 `navigateFallback` 会动摇它。验收探针 `probe-version-update-click`。

## AI 配置：需求基线（用户定，2026-10-12）
- **添加平台＝选平台→贴 Key→自动拉取模型**（界面不出现 base_url）；**手动建平台只有 名称/地址/Key 三字段**；**添加模型＝只选平台 + 填模型信息**。页面 6 tab → 3 tab（密钥与模型 / 场景绑定 / 额度）。
- 原型产物：`ai-config-demo.html`（根目录单文件）+ `scripts/probes/probe-ai-config-demo.mjs`（支持 `DEMO_FILE` / `EXPECT_RED` / `SHOT_DIR`）。
- ⚠️ **「配置不明确」三根因**：① 一个词指多个东西；② 编辑器按**代码结构**分组（basic/provider/params/extra）而不是按人的心智；③ 界面把内部枚举名当文案（`chat/multimodal`、`min_tier` 10 个扁平值）。修法：一字段一名字 + 分组按「要干什么」+ 枚举换人话 + 每字段一句「改了会怎样」。
- ⚠️ 模型类字段用统一工厂 `mkModel()` 兜默认值，否则漏字段＝界面空白。

## 「密钥与模型」合并页（2026-10-12）
- 原「API Key」+「免费模型库」→ 一个 tab `keys-models`（左栏平台、右栏密钥+模型）。文件：`components/KeysAndModels.vue`、`composables/useKeyVault.js`（**provider 元数据唯一声明点 `PROVIDER_META`**）、`composables/useFreemodels.js`、`utils/api/freemodels-api.js`、`tests/unit/keys-models-merge.test.js`。
- ⚠️ **分层棘轮管 composables**：在 `src/views|components|composables` 写 `supabase.from(...)` ⇒ layering 162 上升即失败，表访问收口到 `src/utils/api/**`。
- ⚠️ **provider 分两类**：模型平台（siliconflow/openrouter/zhipu/custom，有模型+可发现）/ 工具服务（tavily/cloudinary/turnstile，**只有密钥没有模型**，界面不得显示「该平台的模型」）。
- ⚠️ **一列只能有一个写入口**：`bohai_model_configs.quota_multiplier` 曾有两个（面板表格编辑器 + AI 额度页），面板保存是**整行 UPDATE** ⇒ 在 A 页改完、去 B 页保存别的字段就把 A 覆盖回旧值。修法两条**缺一不可**：① 字段 `disabled: true`；② 保存策略**编辑时不写该列**（`if (!isEditing) payload.quota_multiplier = 1;`，新建仍给初值因 NOT NULL）。改「只读化」前先看有没有既有测试断言旧语义（`bohai-model-quota-multiplier-zero.test.js` 按新契约重写而非删）。
- ⚠️ **同源约束**：写入口字面量与列表排除条件必须同源 —— `config/bohai-internal-modes.js`（审核两行 mode_id 只在那里出现一次；列表与**计数**查询必须用同一个 `excludeInternalBohaiModes`，否则「列表 8 行、计数 10 条」）。
- ⚠️ `ADMIN_SECTION_DEFAULT_TABS` 必须显式列出所有页面型 section（否则从 `/admin/api-keys` 进来 defaultTab 为 undefined ⇒ 不切 tab、停在上次表）。旧别名（api-keys/freemodels）映射到新 tab。
- ⚠️ **`provider` ≠ 平台名**：provider 是接入方式枚举，平台名在 `api_key_vault.label` ⇒ 左栏/列表**对 custom 必须用 label**，写 `providerLabel(provider)` 会把用户配的「公司内网网关」藏起来。
- ⚠️ **`api_key_vault` 唯一键＝`(provider, purpose)`**（迁移 `2026061001:17`；EF 亦 `upsert(onConflict:'provider,purpose')`）⇒ 同平台同用途**只能一行**，再保存＝**替换**。预设平台是预期的，`custom` 则是灾难（以为在加第二个网关，实际覆盖第一个，界面还提示「已加密保存」）⇒ 保存前必须点名「将被覆盖的是哪一行」+ 二次确认 + 按钮写「覆盖保存」。守卫 `keys-models-merge.test.js` 的「不能静默覆盖」组。
- ⚠️ `freemodels` 只记 provider、不记「属于哪个自定义网关」⇒ 多网关**共用同一份模型清单**（界面明说，不假装分得清）。要真拆分需动唯一键 + 加平台标识（破坏性，先确认）。
