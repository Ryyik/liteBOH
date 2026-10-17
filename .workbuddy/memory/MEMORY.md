# BOHLITE 硬规则速查

> **本文件每会话常驻注入 ⇒ 必须保持精简。** 细则进分册，**不要在这里加**。
> 每日进展见 `YYYY-MM-DD.md`；长文归档 `MEMORY-full-2026-09-29.md`。
> 🤖 **加东西之前先问一句**：这条是「每次会话都必须知道」吗？不是 ⇒ 进分册。
>
> 分册（按需读 —— **动对应领域前先读它**）：
> · `MEMORY-ops.md` —— Supabase / EF / CI / Cloud+ / 图片列 / 页游
> · `MEMORY-css-loading.md` —— 资源加载 / `__vitePreload` / CSS 自愈 / 部署竞态
> · `MEMORY-ai-config.md` —— AI 配置页 / 密钥与模型
> · `MEMORY-bohai-liquid.md` —— BOH分镜 / 液态玻璃 / BOHAI 材质地图 / 本次新增工具
> · `docs/AI-ENV.md` —— **必读通道**：环境坑 10 条 + 并行会话纪律（2026-10-15 从按需提上来）
> · `docs/gate-matrix.md` —— 门禁自证纪律 + 从 AGENTS.md 外置的三条超长条目的**事故级坑记录**
>
> 2026-10-15 首次瘦身（17KB → 约 6KB）：原「资源加载」段与 `MEMORY-css-loading.md` **逐条重复**（实测 11/11 命中）已删；
> 环境坑段与 `docs/AI-ENV.md` 重复已收成指针。

## 开工三步

- `npm run env:doctor` —— 35 项**实测**环境自检。⚠️ **诊断档，永远 exit 0，刻意不进 verify**；`--strict` 才当门禁。
- `npm run verify:fast`（约 10s）；`git status --porcelain | wc -l` 看工作区有多脏（并行会话判断依据）。
- 环境坑与并行会话纪律 → `docs/AI-ENV.md`（**别在这里再抄一份**）。

## 环境 / 工具

- 竖屏视觉巡检修真源：`scripts/probes/probe-portrait-visual-audit.mjs`（390×844 多档截图 + DOM 诊断 + axe 对比度，`--only=` 可筛）；
  2026-10-13 报告 `docs/2026-10-13-竖屏视觉检查报告.md`（含三个待修 P0-P1）。
- 改完必反证；**探针漂移 ＝ 抖动，不是回归**（先单跑一遍那个用例再下结论）。

## 提交

- pre-commit 在 `.git/hooks/pre-commit`（**非 husky**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`）。
- 🔴 lint-staged 会卷进无关未暂存文件 ⇒ 每次 commit 后核对 `git show --stat HEAD`。
  误入修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 路径式 `git commit -F <msg> -- <路径…>`。
- ⚙️ lint-staged 只覆盖 `*.{js,mjs,vue,ts}` + json（`.lintstagedrc.json`）⇒ 手跑 `prettier --write` **不要扫到 CSS 等其他类型**（仓库漂移文件多，会全文件重排带来百行级无关 churn）；CSS 改动一律手动局部编辑。
- 🔴 **`git status` 里的 ` M` 可能混着别人的在途改动** ⇒ 提交前对自己要提交的**每个**文件先 `git diff <file>` 扫一眼，
  别只看 `--cached --name-status` 的文件名。（2026-10-15 实证：把并行会话未提交的 MEMORY.md 压缩改写一起带进了提交。）
- 钩子会重排文件 ⇒ 提交前手跑同款（仅改动文件 `prettier --write` + `eslint --fix`），提交后对**提交后的树**再跑 verify。
  已实证：lint-staged 重排 57 文件令 `tabIds: [ 'x'` 字面量断言假红 ⇒ 源码守卫按**数组项/正则宽容**断言，不写格式化敏感的连续子串。

## 门禁 / 测试

- `npm run verify` 一条兜底（**12 道 check → lint → type-check → test → 棘轮总账**，2026-10-15 起 fail-fast：最贵的排最后）；发布前 `verify:full`。
- **`npm run gate:plan`**：改了什么 → 额外要跑什么，一条命令（映射真源 `scripts/lib/gate-map.json`；verify 永远兜底）。**别再通读 §2 表格做关键词匹配。**
- **`npm run check:doc-truth`**（verify 链内）：AGENTS.md 关键数字与实测对账 + 必读面字节棘轮。文档数字写错/过时当场红 —— 别手改估计值。
- **`npm run prepush`**（2026-10-15）：推送前对 HEAD 的干净 worktree 跑全部门禁 + `npm ci --dry-run`。**推送前必跑** —— 它专抓「本地绿 = 工作区绿、CI 红 = 提交树红」四兄弟：没提交的门禁/基线/lock 配套、先行入库的半成品测试。`--full` 加跑 lint/type-check/test。
- ⚠️ **基线校准（一切 --update）必须在提交树口径上做**：脏工作区的读数含未提交的清理/新增，本地/CI 会差（实测同 commit 2701 vs 2706）。
- ⚠️ doc-truth 计数口径 = `git ls-tree HEAD`（提交树恒定）；文件系统口径随「谁在改什么」漂移。
- `npm run session:start` ＝ 开工三步并一条（env:doctor + verify:fast）。
- 推 github：SSH over 443 间歇抖动（`core.sshCommand` 已配 ConnectTimeout=15），失败重试 1~2 次即通；确认远端用 `gh api repos/…/git/refs/heads/main`。
- lint 带 `--max-warnings` 棘轮（**以 package.json 现值为准**，2026-10-15 = 116）⇒ 报绿必须同时报警告条数
  （口径 `eslint . -f json`）；计数归零才翻 error；上调必走 commit message。**红了用 `npm run lint:delta` 归因。**
- ✅ ~~满载跑 verify 偶发 `project-structure.test.js` 45s 超时~~ **已修（2026-10-15）**：根因是
  `maxForks: 2` 在 vitest 5 是未知选项被**静默忽略**（正名 `maxWorkers`，睡眠探针实验定案）+ src 双读合并单遍。
  **留下的通用教训：未知配置项静默忽略，「限流失效」的唯一表现是最重用例偶发红；
  summary 的「N workers spawned」数的是隔离体不是并发数，别拿它当限流证据。**（详见 vitest.config.js 注释）
- 新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 列未覆盖；棘轮 baseline 只许下调。
- ⚠️ `check:layering` 棘轮盯**三类出口**（`supabase.from` / `rpc` / `functions.invoke`），不只 from ——
  视图加一个 `functions.invoke` 也会红（2026-10-17 实证两连红）；收口到 `src/utils/api/*` 后**必须
  `--update` 同步下调基线**，否则 gates-self-test 注入样本落在基线内 ⇒ 假绿被自检当场抓（实证）。
- 源码守卫：两边过**同一个** `tests/helpers/source.js` 归一函数；否定断言先 `scriptSection()` + `stripComments()`。
- 数据管理面板表格类 tab：`query-config.js` 六张查询地图缺任一（尤其 `TAB_SELECT_COLUMNS`）＝**静默空列表、连请求都不发**
  （2026-10-16 活动报名明细事故）⇒ 新增 tab 必须补齐；护栏 `tests/unit/data-admin-tab-config-coverage.test.js`。
- ⚠️ 「找不到元素就跳过」＝假绿温床 ⇒ 找不到就 **fail**；「模板里有 X」是没牙断言 ⇒ 给产物打 `data-*` 钩子按 id 对齐断言；
  反证**只撤单点**（撤两处会中途崩）。
- ⚠️ ⛔ 已删：「project-structure 满载抖动 ⇒ 判红先单跑」—— **2026-10-15 已修到根**（maxForks 被静默忽略 + src 双读），这条过时规则不再适用。
- ⚠️⚠️ **样式类改动/故障的验收必须带截图肉眼过**（2026-10-13 实证：三 CSS 全失败时程序化差分只报 1 项，
  肉眼是大面积塌陷；采样点不能替代视觉）。留证探针 `probe:css-visual`。

## CSS / 主题

- `:root` 禁进 scoped @import；全局变量唯一入口 `glass-aliases.css`；动效/玻璃单源 `tokens.css`；
  暗色真源 `theme-manager.js`；scoped 特异性 +1。
- ⚠️ 液态玻璃三铁律：材质单源 `liquid-glass.css` 只挂基础类（≤768px 强制关 backdrop 变体）；
  scoped 让位写 `:not(.liquid-glass)`；白底玻璃需 `.cloud-page::before` 环境光 + 父级 `isolation:isolate`；色值走 color-mix。
- ⚠️ 玻璃底图**必须放面板背后**（进 `backdrop-filter`）；放面板自身 `background-image` 不经过模糊
  ⇒ 深色字块透进正文（白遮罩 .90 仍剩约 8% 可见）。
- ⚠️ 暗色覆盖三坑：① 异步 chunk 的 scoped 样式带 `[data-v-*]` 且晚于 themes/*.css ⇒ `[data-theme=dark] .x` 被压掉，
  **必须写 `html[data-theme=dark] .x`**；② 反色实心按钮（`--liquid-text-primary` 底 + `color:#fff`）暗色改
  `color:var(--boh-bg-primary)`；③ 共享组件禁依赖宿主私有变量（`--text-primary` 只由 `.user-space-page` 定义），
  走全局 `--liquid-text-*`。
- ⚠️ 判「白玻璃」看**元素自身 background-color**（合成亮度会骗人：55% 白叠深底 lum≈0.27 < 阈值 0.35 假绿）；
  `check:dark-tokens` 连 `var(--x,#hex)` fallback 也计数 ⇒ 想零增长别写 fallback。护栏 `probe:dark-surfaces`(36)。
- ⚠️ **fixed 容器会被撑高的子元素撑开**：`#unified-nav-container` 岛展开 78→390px 且 `pointer-events:auto`
  （**撑高有意**，接「点外部关闭」，别改高度）；带实心背景就成页顶一块矩形 ⇒ 容器只定位＋接点击，
  **视觉全交 `.unified-nav-surface`**。
- ⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 子项 shrink:0）＝压 0 宽/竖排字/被裁；修法是折行。
- ⚠️ 绝对定位浮层**禁挂 overflow 滚动容器内**（任一轴非 visible 裁到 padding box；88px 窄栏下 172px 浮层剩 68px）。
  **240px 宽栏 215>172 恰好不暴露 ⇒ 断言必须覆盖窄档**。浮层挂成滚动容器**兄弟**；
  `contain:paint`（`.liquid-glass`）同样裁后代，左栏靠 `side-rail.css` 的 `contain:none` 让位。护栏 `probe-rail-more-menu`(16)。
- ⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**。
  高度断言用 `offsetHeight`。
- ⚠️ `.badge` 在 `1fr` 网格列默认 stretch ⇒ 要 `justify-self:start`。
- ⚠️ 切 tab 只切 class 不同步 `hidden` ⇒ `.panel.is-on{display:block}` 压过 `[hidden]`，两面板同时显示。
- ⚠️ `--muted-foreground:#7f8d9f` 在白底只有 3.38:1（< AA 4.5）⇒ 达标值 `#5a6577`(5.41) / 暗色 `#a8b0bd`(7.49)。

## 路由 / 交互 / 单源

- `key=route.path`（禁 fullPath/name）；`<script setup>` 运行时 API 显式 import；
  `ForumMain` 的 `watch immediate` 禁同步调下方 `const`（TDZ）。
- `useConfirmDialog` 互斥**会 reject** → 调用点把预期拒绝归化成取消，别删那条 reject。
- UserSpace 旧 tab 映射单源 `resolveRequestedUserSpaceTab()`；直接用裸 `route.query.tab` ⇒ 旧值失映射＝整页白屏。
- ⚠️ 手动输入框时**不能整体重绘**（光标会丢），单独 sync 提交按钮 `disabled`。
- 可见性单源 `isGlobalNavbarVisible(route)`；首页入场真源 `.home --gate-p`（`probe-home-gate-pull` 50）；
  竖屏菜单 `probe-nav-mobile-menu`(48)；概览岛唯一触发点＝首页 `gateSettled` 落定。
- 头像框：佩戴同步唯一注册点 `initAvatarFrameSync()`；url→id 反查不到**保留本机**、绝不回落 none；
  `avatar_frames.url` 发布后不可变；本机 key `boh-avatar-frame-id/-owner/-pending`。
- 自动增高真源 `composables/useAutoGrowTextarea.js`（**勿加第 5 份**）；上限只声明在 CSS `max-height`；
  空内容先摘 `placeholder` 再量；`height='auto'` 后必须无条件写回。护栏 `probe-reply-autogrow`(10)。
- 动态加载失败恢复 `vite-preload-recovery.js`；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`；
  论坛搜索 RPC 单实现 9 参（PG 42725，**禁新增签名**）。
- AI 额度口径 `utils/ai-quota-display.js`：界面**只显示百分比**（进度条走 `meterPercent`、`percent` 不封顶）；
  档位比大小走 `subscription-benefits.js` 的 `PLAN_AI_TOKEN_PERCENTS`；**界面不许显示 Token 数**。
- `bohai_model_configs.api_url` 只解析 `choices[0]`；`freemodels.api_base_url` 名字误导，存的是
  **完整 chat/completions 端点**（存量如此，勿改语义）。
- 跨表同名字段语义真源 `src/config/field-semantics.ts`（`lab_ai_model_configs.model_id` 存的是
  `bohai_model_configs.mode_id`）。守卫 `tests/unit/field-semantics.test.js`。
- ⚠️ 探针 `page.evaluate(fn)` **只序列化函数体** ⇒ 闭包依赖一律作为**参数**传入。
