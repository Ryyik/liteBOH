# 031 · BOHAI 竖屏「模式选择」体验重构

- **状态**：DRAFT（2026-10-21 出方案；**2026-10-22 评审修订**：D2 建议推翻、Teleport 落点改 `.bohai-page`、S1 拆 S1a/S1b、补 §2.11 排序根因；S0 的 ①②⑤ 已落代码）
- **日期**：2026-10-21（修订 2026-10-22）
- **触发**：用户口径「BOHAI 竖屏体验还是不好，主要是模式选择等问题」
- **影响面**：`BohComposer.vue` / `boh-composer.css` / `layout.css` / `useBohShell.js` / `BohaiSettingsPanel.vue` / 通知通道；**不改数据库、不改 EF**
- **关联**：`plans/030`（策略/模型两层体系，本方案是它的竖屏落地与 §3.6 的口径修订）、`docs/DESIGN-BOHAI.md` §3.1 / §7.2

---

## 1. 一句话结论

竖屏下模式选择的核心矛盾**不是样式不够精致，而是「一个 488px 高的 9 行列表被塞进一个只剩 250–360px 的锚定浮层」**
——列表本身没问题，容器选错了。锚定浮层（popover）在竖屏只能向上长，而它上方是胶囊、再上方是导航球，
可用高度被物理锁死在 `胶囊顶部 − 12px`；底部弹层（sheet）向下长，可用高度是整块屏幕。
**所以 P0 只有一件事：竖屏把这颗菜单从 popover 换成 bottom sheet，并让列表可分组、可滚动到当前行。**
其余（热区、锁态对比度、通知通道、设置页口径分叉）都是围绕它的配套修复。

---

## 2. 实测现状

> 环境：dev server `http://[::1]:5173`（IPv6），Chrome via Playwright，登录态用 pinia 注入。
> 判据：`node docs/demos/bohai-portrait-audit.mjs`（**2026-10-21 实测**，输出 A–I 九组）。
> 该脚本为只读诊断脚本，不做断言；方案落地后应转成正探针 `scripts/probes/probe-bohai-mode-sheet.mjs`。

### 2.1 菜单高度被视口锁死，当前选中行经常看不见

结论：模式清单满高 **488px**（3 策略行 55px + 6 模型行 41px），但竖屏面板可用高度只有 **250–360px**，
且打开时 `scrollTop` 恒为 0 —— 当前选中行在 320/360/375 三档都**不完整可见**。

判据：`node docs/demos/bohai-portrait-audit.mjs`（A 组，读 `.boh-mm-body` 的 `scrollHeight/clientHeight` 与 `.boh-mm-item.is-on` 的 rect）　（2026-10-21 实测）

| 视口 | 面板高 | 完整可见行 | 当前行（GLM4）top | 面板 bottom | 当前行可见 |
| --- | ---: | ---: | ---: | ---: | --- |
| 320×568 | 250 | 4 / 9 | 306 | 277 | ❌ |
| 360×640 | 282 | 5 / 9 | 313 | 315 | ❌（差 39px） |
| 375×667 | 293 | 5 / 9 | 316 | 330 | ❌（差 27px） |
| 390×844 | 360 | 6 / 9 | 339 | 419 | ✅ |

根因：`boh-composer.css:465` 的 `max-height: min(44dvh, 360px)` 是**对面板整体**封顶，
面板底边又钉在胶囊上方（`boh-composer.css:407` 锚 `bottom: calc(100% + 8px)`）——
于是「高度」和「位置」两个约束同时生效，可用高度 = `胶囊顶部 − 12px`，与屏幕高度近似线性。
注释里写的「44dvh 保证短视口也有余量」只在 390 以上成立。

### 2.2 游客唯一能用的那一行，在短屏上就在可视区外

结论：游客看到 9 行里 **8 行锁定**，唯一可用的 GLM4 排在第 6 行；在 320×568 与 375×667 上它整行落在面板之外
（`scrollTop` 不动），用户打开菜单看到的是 8 个灰色不可点项。

判据：同上脚本 F 组（`usableRows` / `firstUsable.visible`）　（2026-10-21 实测）

| 视口 | 可用行 | 可用行 top | 面板 bottom | 可见 |
| --- | --- | ---: | ---: | --- |
| 320×568 | `["GLM4"]` | 306 | 277 | ❌ |
| 375×667 | `["GLM4"]` | 316 | 330 | ❌ |
| 390×844 | `["GLM4"]` | 339 | 419 | ✅ |

### 2.3 顶部导航容器压住首行，并**吃掉点击**

结论：360×640 / 375×667 上面板首行与导航球矩形相交；在交点处 `document.elementFromPoint` 返回
`div.nav-container`（`z-index: 9999`），**不是** `.boh-mm-item`（`z-index: 20`）——
即首行左侧约 34×55px 是死区，点了没反应。

判据：`node docs/demos/bohai-portrait-audit.mjs`（A 组 `orbOverlapsFirstRow`），
补充点位判据 `elementFromPoint(40, 行中线)`　（2026-10-21 实测）

```
360×640：首行 top=41 / 导航球 14–66；elementFromPoint(40, 53) → div.nav-container
375×667：首行 top=43 / 导航球 14–66；elementFromPoint(40, 55) → div.nav-container
390×844：首行 top=66，与球相切（不重叠），点击正常
```

注：`.boh-float-actions`（`layout.css:70`，`z-index: 6`）里的「打开侧栏」按钮同理压在同一位置。

### 2.4 软键盘弹起，面板直接被顶出视口

结论：注入 `--kb-inset: 336px`（等价 390×844 上键盘占 336px）后，面板 `top = -109`，
前两行（含默认档 Balance / Cost）整块在视口之上，且**没有任何媒体查询在矮可用高度下重新封顶**。

判据：同上脚本 D 组（`menu.top` / `menuAboveViewport`）　（2026-10-21 实测）

### 2.5 竖屏 hover 详情卡「关不掉」，且只露一条 17px 的边

结论：`layout.css:135` 的 `@media (orientation: portrait) { .boh-mm-detail { display: none } }` 是**死规则**
——`.boh-mm-detail` 在 `BohComposer` 的 scoped CSS 里，`layout.css` 的规则够不到它。
实测竖屏 hover 后卡片仍挂出，`left = -215 / right = 17`：**整卡在视口左侧之外，只露 17px**，
比不显示更糟（用户看到一条莫名其妙的玻璃边）。

判据：同上脚本 C 组（`mounted` / `left` / `right`）　（2026-10-21 实测）

> ✅ **2026-10-22 已修（S0 ②）**：规则迁进 `boh-composer.css`（`.boh-mm-detail` 所在组件自己的 scoped 文件），
> `layout.css` 那边只留一条"别加回来"的注释。待新探针复验「竖屏 hover 后 `.boh-mm-detail` 不存在」。

### 2.6 触控热区不达标

结论：`@media (hover: none)` 只给 `.boh-slash-item` 补了 44px（`boh-composer.css:1243`），
**没给 `.boh-mm-item`**。触屏（`hasTouch`）下模型行仍是 **41px**，低于 44px 最小值。

判据：同上脚本 B 组（`minRowHeight`）　（2026-10-21 实测）

> ✅ **2026-10-22 已修（S0 ①）**：`@media (hover: none)` 补了 `.boh-mm-item { min-height: 48px }`
> （`boh-composer.css:1263`）。注意这会同时抬高**桌面触屏**（iPad 横屏）的行高 —— 那是正确方向。

### 2.7 切模式成功的提示被静默丢弃

结论：`selectMode`（`useBohShell.js:1511`）切成功后走 `emitIslandMessage`（`:398` → `emit('island-message')`），
而 `/ai-chat` 独立页**没有消费者**（`BOHAIIsland` 的 `onIslandMessage` 只处理 `thinking` / `empty`）⇒
实测切到 GLM4Flash 后，导航容器内文本全程为空，无任何确认反馈。

判据：同上脚本 E 组 + 手动调用链；实测脚本切 Air 后 150/400/900/1600ms 四次采样 `navText` 均为 `""`　（2026-10-21 实测）

对照：游客点锁定行走的是 `showIsland.notify()`（`:1562`），**实测能弹**（`navText = "Balance 需登录后使用…"`）
——同一份代码里两条通知走了两条通道，只有一条通。

### 2.8 设置页的模式选择与输入区口径分叉

结论：`BohaiSettingsPanel.vue:109` 直接渲染 `chatModes`（**未装饰**，无 `locked` / `is-locked` / `disabled` / `aria-disabled`），
游客看到 9 项全部可选；点 Balance 后 picker 关闭、胶囊仍是 GLM4、抽屉不关，
锁定提示被全屏设置页（`z-index: 2147483600`）盖住 ⇒ 表现为「点了完全没反应」。

判据：同上脚本 G 组（`count: 9 / lockedCount: 0 / disabledCount: 0`）+ 点击后 DOM 快照　（2026-10-21 实测）

### 2.9 加载态抖动 + 失败态无出口

结论：模式表 RPC 实测 **0.6–9.6s**（5 次采样：9590 / 808 / 5941 / 791 / ~600ms），
期间面板是 162px 的骨架，落地瞬间跳到 360px（**198px 跳变**）；
RPC 失败时只显示「暂无可用模式 + 配置自定义模型」，**没有重试**，胶囊退回字符串 `GLM4`。

判据：同上脚本 H 组；RPC 时长用 `page.on('request'/'response')` 打点　（2026-10-21 实测）

### 2.10 数据层：策略行与模型行是「同一个模型、两套价格」

结论：3 条策略行绑定的 `model_id` 与 3 条模型行**完全重复**，但倍率不同（策略更便宜）：

| 策略 | 绑定 model_id | 策略倍率 | 同模型行 | 模型行倍率 |
| --- | --- | ---: | --- | ---: |
| `cost` | `GLM-4-Flash-250414` | 0.45 | `Air` | 0.50 |
| `balance` | `GLM-Z1-Flash` | 1.10 | `Code` | 1.50 |
| `intelligence` | `gemini-3.8-flash` | 2.10 | `38Flash` | 3.00 |

而 `generation_profiles` 里两者的采样参数**一模一样**（0.180 / 0.720 / 0.050 / 1600）⇒
策略目前只是「模型别名 + 折扣价」，不是 plans/030 §3.5 设想的「按天哈希选模型」。
UI 上表现为 `Balance 1.1x` 紧贴 `GLMZ1Flash 1.5x`，用户无法理解为什么要多付 36%。

> ✅ **2026-10-22 已解决**：plans/030 阶段 6 上线（迁移 `2026102201`），三个策略行现在各自有
> `strategy_candidates` 池子（只存 `mode_id` + `weight`），EF 按「北京日期 + 用户 + 策略」加权挑。
> 实测：同一用户同一天连调两次 `intelligence` 都返回 `gemini-3.5-flash`（不是固定绑定的
> `gemini-3.8-flash`）⇒ 分支真的在挑；`cost` 命中过 `THUDM/GLM-4-9B-0414`（fast 候选）。
> 倍率同时统一为「池内最强 × 0.7」= 0.35 / 1.05 / 2.10，价差有了可自证的说法。

判据：Management API `select mode_id, model_id, quota_multiplier from public.bohai_model_configs where status='active' order by sort_order, display_name`　（2026-10-21 实测）

### 2.11 游客可用行排第 6，是**排序规则**造成的，不是巧合

结论：§2.2 说「GLM4 排在第 6 行」—— 这不是数据顺序碰巧如此。RPC 的排序是
`order by sort_order asc, display_name asc`（`supabase/migrations/2026101801_exclude_internal_modes_from_public_modes.sql:61`），
在大小写不敏感 collation（en_US.UTF-8 / ICU）下 `Gemini3.5Flash` / `Gemini3.8Flash` 排在 `GLM4` **之前**
（E < L）⇒ 3 策略行 + 2 条 Gemini 灰行之后，才是游客唯一可用的 GLM4。

判据：`select display_name from public.bohai_model_configs where status='active' and sort_order=100 order by display_name`　（2026-10-22 复核迁移定义）

后果：游客打开菜单，第一眼看到的**前两行模型全是灰的**，第三行才是能用的。
这条与 §3.2 的分组正交 —— 分组只解决「策略 vs 模型」的语义，不解决「灰行在前」。
**修法见 §8 D3-B 的配套项**：排序改成「可用优先 + 倍率升序」，否则引导位只是给第 6 行加了一句解释。

---

## 3. 目标形态

### 3.1 竖屏：底部弹层（bottom sheet）

| 项 | 取值 | 依据 |
| --- | --- | --- |
| 触发条件 | `(max-width: 768px) and (orientation: portrait)` | DESGIN §3.1 的竖屏档 |
| 承载 | `<Teleport to=".bohai-page">`（**不是 body** —— 见 §4.3 约定 4） | 脱离 `.boh-composer` 的 overflow / 堆叠链，同时保留 `.bohai-page` 作用域的令牌 |
| 高度 | `max-height: min(72dvh, calc(100dvh - var(--kb-inset, 0px) - 96px))` | 320×568 → 409px（7 行）；390×844 → 608px（9 行全显）；390×844 + 键盘 336 → 412px。⚠️ **320×568 + 键盘 336 只有 136px**（方案初版只验了 390 档）⇒ 靠「打开即 blur 收键盘」避免这一组合，见下行 |
| 层级 | scrim `10040` / sheet `10050` | 必须盖过 `#unified-nav-container` 的 `9999`（§2.3），且低于登录弹窗 `2147483500` 与设置页 `2147483600` |
| 顶部圆角 | `--boh-radius-lg` 之上单写 `24px`（只此一处） | 视觉，不进令牌体系 |
| 底部内衬 | `max(12px, env(safe-area-inset-bottom))` | 全仓已有先例（`AccountBindPrompt` / `AgreementModal`） |
| 行高 | `≥ 48px`（策略行 56px 含副标题） | Apple HIG 44pt 下限 + 触摸误差 |
| 滚动定位 | 打开时 `scrollIntoView({ block: 'center' })` 到 `.is-on` | 修 §2.1 |
| 关闭 | 点 scrim / Esc / 下滑 > 80px 或速度 > 0.5px·ms⁻¹ / 选中一行 | 与 `plans/029` §6 的 sheet 手势口径一致 |
| 打开时 | 先 `blur` 输入框（收键盘）再展开 | 2026-10-22 补：320×568 + 键盘 336px 时高度公式只剩 136px（一条缝）；且 sheet 是模态，输入框不该保持焦点 —— 顺便解决「焦点进当前行」与输入框抢焦点 |
| 焦点 | 打开 → 焦点进当前行；关闭 → 焦点回 `.boh-mode-pill` | 修 §2.7 的焦点问题（实测当前焦点停在胶囊） |
| 动效 | 进场 `translateY(8px)+opacity`，`--boh-dur-med` / `--boh-ease`；reduce-motion 由令牌归零自动降级（**前提是 Teleport 落点对，见 §4.3 约定 4**） | `DESIGN §2.4`，不新增第二份 reduce 查询 |

### 3.2 分组：把「策略 / 模型」显性化（**修订 plans/030 的 D11**）

plans/030 D11 定的是「不分组，靠 1px 分隔线 + 副标题」。实测证明这条在竖屏**不成立**：
9 行同质列表里，1px 线在 488px 的滚动内容里根本不构成断点，用户读到的是
「Balance 1.1x / Cost 0.45x / Intelligence 2.1x / Gemini3.5Flash 2.4x / …」——
两类语义完全不同的东西被排成了一列可比值。

改为两个**粘性组标题**：

```
策略                    按套餐价计费
  Balance    日常推荐              1.05x
  Cost       性价比优先            0.35x
  Intelligence 最强推理            2.10x
模型                    直接指定，按下方倍率计费
  GLM4       0.00x  ✓
  …
```

⚠️ **2026-10-22 用户口径：组标题不要写「自动挑选最合适的模型」**。理由是那句话在竖屏 9 行列表里
会被读成「这个策略会帮我挑，但我不知道挑到谁」，而倍率是固定的 —— 说「按套餐价计费」才对得上
用户实际付的钱。倍率同步改为阶段 6 落地后的新价（0.35 / 1.05 / 2.10，见 `plans/030` §6.4）。

组标题是**纯装饰**：不参与任何序号。⚠️ 2026-10-22 修正一句误导：方案初版写「不参与键盘上下选、
不参与 `slashActiveIndex` 那套序号」—— 但 `slashActiveIndex` 属于**斜杠菜单**，模式列表从来没有
键盘上下选（全仓只有 `.boh-slash-item` 走 roving 序号）。所以「不参与」是空转，真实情况是
**根本没有这套机制**。§3.1 的「焦点进当前行」只要求焦点落点，没要求方向键切换 —— 如果后续要补
roving focus（↑↓ 在 9 行间移动），那是新能力，须单独评估并补探针，别夹在分组里顺手做。

`tests/unit/bohai-strategy-mode-wiring.test.js:82` 现在锁的是 `boh-mm-divider`，需同步改成
「两个 `.boh-mm-group` 存在且顺序为 策略 → 模型」。

### 3.3 桌面 / 横屏：保持现有 popover

`≥769px` 或 landscape 下不改形态（现有浮层宽 252px、右上/左上展开都够用，探针 A2a 已覆盖）。
即 **同一个列表组件，两种外壳** —— 这是本方案的分层要点，见 §4.1。

---

## 4. 实施方案

### 4.1 组件拆分（守住 400 行阈值）

`BohComposer.vue` 现在 **816 行**（阈值 400，存量 WARN）。本方案**净减行数**，不再加：

| 新文件 | 职责 | 预估行数 |
| --- | --- | ---: |
| `components/BohModeList.vue` | 纯列表：组标题 / 行 / 倍率 / 锁 / 副标题 / 空态 / 骨架。**唯一列表实现**，sheet 与 popover 共用 | ~170 |
| `components/BohModeSheet.vue` | 竖屏外壳：scrim / 拖拽 / Esc / 焦点陷阱 / safe-area。内部 `<slot>` 放 `BohModeList` | ~150 |
| `components/BohModePicker.vue` | 形态判定（`matchMedia`）+ 二选一渲染 + 打开/关闭状态机 | ~120 |

`BohComposer.vue` 删掉模板 124–260 的整块（锚 + 玻璃 + 菜单 + hover 卡，约 137 行）与
`isStrategyRow` / `hoverTop` / `hoverFlipped` / `onModeRowEnter` / `scheduleCloseModeDetail` 等约 60 行脚本，
改为一行 `<BohModePicker v-bind="…" @select="pickMode" />`。

⚠️ **上表只算了 `.vue`，没算 CSS —— 这是 S1 初版低估的地方（2026-10-22 补）**：
`boh-mm-*` 在 `boh-composer.css` 里有 **63 处引用**，覆盖列表行 / 倍率位 / 锁定态 / 副标题 /
组分隔 / 空态 / 骨架 / hover 详情卡 / `@supports` 撤实底 / `@media (hover: none)`。
这些规则**必须跟着 DOM 一起搬**（scoped 是按组件实例打的，留在原文件就够不到新组件）。
所以 S1 的真实工作量 = 搬模板 **+ 搬这 63 处 CSS + 重跑 `check:dark-tokens:strict`（棘轮）**。
搬完必须复核三条既有契约（探针直接查 DOM，不看组件结构）：
`.boh-mm-item` 类名、`data-mode-id` 属性、`.boh-mm-body` 这个内层滚动容器。

⚠️ **不复制第二份列表**：`BohaiSettingsPanel.vue:109` 的那 9 行也要换成 `<BohModeList compact>`，
否则就是第三份（现在已经是第二份，且已经和输入区分叉 —— §2.8 就是分叉的后果）。

### 4.2 阶段划分

| 阶段 | 内容 | 触碰文件 | 风险 |
| --- | --- | --- | --- |
| **S0** 零风险修复（0.5d） | ① `.boh-mm-item` 补 `@media (hover: none) { min-height: 48px }` ✅；② 删 `layout.css:135` 死规则，改到 `boh-composer.css` 内 ✅；③ picker 内接 Esc + 焦点 ⬜；④ 设置页传 `decorateChatModes` 后的列表并渲染锁态 ⬜；⑤ 删 `--boh-sab` 幻影令牌、`startPsychAnalysis` 的 `'pro'` 分支 ✅；⑥ 删 `boh-composer.css:435` 的 `max-height: calc(100dvh - 140px)` 死规则 ✅（2026-10-22 评审新增） | css ×2、`useBohShell.js`、`BohaiSettingsPanel.vue`、`useModelConfig.js` | 低（无 DOM 结构变化） |
| **S1a** 列表组件化（1d） | 只抽 `BohModeList.vue` + 搬 63 处 CSS，popover 继续用它渲染，**行为零变化**；跑旧探针全绿 | 新增 1 个 `.vue` + 1 个 scoped css，改 `BohComposer.vue` / `boh-composer.css` | 中（DOM 换了但外观/选择器不变，风险被限制在"搬"这一件事） |
| **S1b** 竖屏 sheet（1d） | 加 `BohModeSheet.vue` / `BohModePicker.vue`（形态判定）；竖屏走 sheet；`scrollIntoView` 当前行；分组标题 | 新增 2 个 `.vue`，改 `BohComposer.vue` | 中（新外壳，探针 A2a/A2b 选择器需保留兼容） |
| **S2** 通知与加载态（1d） | ① `selectMode` 改走 `showIsland.notify`（与锁定提示同源）；② 骨架高度对齐落地高度（避免 198px 跳变）；③ 失败态加「重试」；④ 长 RPC 时胶囊显示骨架态而非字符串 `GLM4` | `useBohShell.js`、`BohModeList.vue`、`useChatEngine.js` | 低 |
| **S3** 需拍板 | §2.10 的数据层（见 §8） | DB / EF | 高，**不在本方案自动执行范围** |

### 4.3 关键实现约定（踩过的坑，别推翻）

1. **`z-index` 只写在 sheet / scrim 自己身上**，锚（`.boh-mode-sheet-anchor` 若需要）**不许带 z**
   —— 与 `.boh-menu-anchor` 同款纪律（`boh-composer.css:407` 注释、§21.7 采样根）。
2. **Teleport 出去的节点仍然吃 scoped CSS**（Vue 按组件实例打 `data-v`，与 DOM 落点无关）。
   但**页面级后代规则**要看你 teleport 到哪：落到 `body` 时 `.bohai-page .xxx` 一律不命中，
   落到 `.bohai-page` 内部则命中。两种情况 sheet 都必须自带 `position: fixed` / 尺寸 / 背景。
3. **断点写在新组件自己的 scoped css 里**，不上收 `layout.css`（`layout.css:14` 的纪律 2：
   scoped 的 `[data-v]` 会让选择器 +1 特异性，同深度压不过组件基座）。
4. ⚠️ **Teleport 落点必须是 `.bohai-page`，不能是 `body`**（2026-10-22 评审修正，原写「到 body 依然继承」）。
   基础令牌确实在 `:root`（`tokens.css:15`）能继承，但**两样东西挂在 `.bohai-page` 作用域**：
   · `reduce-motion` 的令牌归零 —— `layout.css:197-211` 两个分支都是 `.bohai-page { --boh-dur-*: .01ms }`；
   · 折射级白膜 —— `tokens.css:179/183` 的 `--refract-tint-rgb`（这是刻意挂 `.bohai-page` 的，
     因为 `data-boh-theme` 离开 BOHAI 后不会被清掉，挂 `:root` 会把暗色白膜泄漏给顶栏）。
   落到 `body` 的后果是**静默的**：用户关掉「界面动效」后 sheet 仍播 150ms（`tokens.css:110` 的默认值），
   暗色下玻璃 tint 走站点主题那一档 —— 两者都不会让任何探针变红。
   落 `.bohai-page` 是安全的：它是 `position: relative; overflow: hidden`（`layout.css:21-33`），
   fixed 子元素不会被裁（包含块是视口），且不构成堆叠上下文（relative 无 z-index）⇒ z-index 仍按根层比较。
5. **动效只用 `--boh-dur-fast/-med` + `--boh-ease`**，不写字面时长；拖拽回弹用 `--boh-dur-med`。
6. **`check:dark-tokens:strict` 是棘轮**：新 css 里零裸色值、零 `!important`（BOHAI 当前 0 处，保持 0）。

---

## 5. 自证清单

| 项 | 判据 |
| --- | --- |
| 当前行可见（四档） | 新探针 `probe-bohai-mode-sheet.mjs`：320×568 / 360×640 / 375×667 / 390×844 下 `.boh-mm-item.is-on` 的 rect 完全落在 sheet 的 padding-box 内 |
| 首行点得动 | `elementFromPoint(行左缘+8, 行中线)` 返回 `.boh-mm-item` 本身（不是 `.nav-container`） |
| 键盘弹起不越界 | 注入 `--kb-inset: 336px` 后 sheet 的 `top ≥ 0` **且高度 ≥ 240px**（2026-10-22 补：320×568 档只 `top ≥ 0` 会得到 136px 的一条缝 —— 判据会绿、体验是坏的） |
| 打开时收键盘 | 打开前后 `document.activeElement` 不是 `.boh-composer-input`（textarea `blur` 生效） |
| reduce-motion 真的降级 | `emulateMedia({ reducedMotion: 'reduce' })` 后 sheet 的 `transitionDuration` 为 `0.01ms`（**这是 §4.3 约定 4 的落地断言**，落错 Teleport 位置时只有它能抓） |
| 游客可用行可见 | 游客态下 `.boh-mm-item:not(.is-locked)` 全部完整可见 |
| 热区 | `hasTouch` 下 `.boh-mm-item` 的 `min-height ≥ 44` |
| 竖屏不挂 hover 卡 | 竖屏 hover 后 `.boh-mm-detail` 不存在（或 `display:none`） |
| Esc / 焦点 | 打开后 Esc 关闭；关闭后 `document.activeElement` 是 `.boh-mode-pill` |
| 通知真能弹 | 切模式后 1.5s 内 `#unified-nav-container` 文本包含「已切换」 |
| 设置页同口径 | 游客态下设置页 picker 的 `[aria-disabled="true"]` 数 == 锁定行数 |
| 设置页与输入区**同源** | 源码级断言：`BohComposer.vue` 与 `BohaiSettingsPanel.vue` 都引用 `BohModeList`（数量对不代表同源 —— 第三份手抄列表能凑出同样的 aria-disabled 数）。与仓库既有「源码文本守卫」口径一致 |
| 既有契约不破 | `node scripts/probes/probe-bohai-composer.mjs`（A2a/A2b 选择器保留）、`probe-bohai-portrait.mjs`、`probe-bohai-shell.mjs`、`probe-bohai-glass.mjs` |
| 单测 | `tests/unit/bohai-strategy-mode-wiring.test.js`（分组断言改写）、`bohai-glass-surfaces.test.js`、`bohai-shell-structure.test.js`（行数） |
| 全量 | `npm run verify` |

⚠️ 判「红」之前先跑**无改动基线**：当前 `probe-bohai-composer.mjs` 有 1 条**既有**失败
（A8 期望 `/web /community /cloud`，命令表已于 2026-10-19 合并为 `/memory`），
`probe-bohai-portrait.mjs` 5/5 绿。A8 是陈旧断言，不属于本方案 —— 但 S1 落地时必须顺手改掉，
否则新探针会被这条噪声掩盖。

---

## 6. 回滚

- S0：单文件级改动（css 两条媒体查询 + 三个 JS 分支），`git revert` 即回；
- S1：`BohComposer.vue` 保留 `activeMenu === 'model'` 这条状态与 `.boh-mode-pill` 的
  `aria-expanded`，回滚 = 把 `<BohModePicker>` 换回原来的 `.boh-menu-anchor` 块（结构在 git 历史里）；
  新组件是**纯增量文件**，删掉不影响其它页面；
- S2：通知通道保留 `emitIslandMessage` 调用点，只切换实现，回滚是改一行；
- 无数据库 / EF 改动 ⇒ 无数据回滚面。

---

## 7. 不做的事

- **不给 `.boh-mm-item` 加大 `!important`** 去抢导航层级 —— 那是把债挪个地方，且撞 `check:important-budget`。
- **不把 sheet 做成「随胶囊位置自适应」** —— 2026-10-20 已试过 JS 测量方案并被用户否掉
  （口径是「放小 + 可滚动」，不是自适应，见 `boh-composer.css:463`）。
- **不新增第三份模式列表**。
- **不动 `--kb-inset` 的写入方**（`useKeyboardInset.js` 是唯一真源，阈值 120px 别改）。

---

## 8. 需要拍板的 3 项

| # | 问题 | 选项 | 建议 |
| --- | --- | --- | --- |
| D1 | 列表要不要分组？ | A 保持 030 的「不分隔线、不分组」；B 改用两个粘性组标题（本方案 §3.2） | **B** —— 实测 1px 线在滚动列表里不构成断点，且策略行的倍率比同模型行低 36%，不解释就是价格陷阱 |
| D2 | 策略行的语义 | ~~A 仅文案解释「打包价」~~ / ~~B 删掉重复的三行~~ / **C 落地 plans/030 阶段 6** / ~~D 倍率先对齐绑定模型~~ | ✅ **已拍板并已上线（C）**：2026-10-22 落地阶段 6（迁移 `2026102201` + EF 部署）。策略行现在真的在候选池里按天加权挑模型，倍率统一为「池内最强 × 0.7」（cost 0.35 / balance 1.05 / intelligence 2.10）⇒ §2.10 的「同模型两套价」不再成立。A/D 作废（A 是虚假解释，D 会让策略与模型行完全等价） |
| D3 | 游客默认档 | A 维持 GLM4（现状）；B 改成「GLM4 + 明确标注『登录解锁全部』」的引导位；C 给游客一次 Balance 试用额度 | **B** —— §2.2 已证明游客打开菜单只能看到 8 个灰色行，需要一句解释而不是又一个灰色行。**但必须配 §2.11 的排序修复**（`order by sort_order, (min_tier='guest') desc, quota_multiplier asc` 之类），否则引导位只是给"第 6 行"加一句说明，灰行仍在最上面 |

---

## 9. 参考：现状关键行号（2026-10-21 工作树）

| 位置 | 内容 |
| --- | --- |
| `BohComposer.vue:117` | `.boh-mode-pill` 触发键 |
| `BohComposer.vue:124–260` | 整个菜单块（锚 + 玻璃 + `.boh-mode-menu` + hover 详情卡）——S1a 要搬走 |
| `BohComposer.vue:166` | `.boh-mm-item`（探针依赖的 `data-mode-id` 在这里） |
| `boh-composer.css:409` | `.boh-menu-anchor`：`bottom: calc(100% + 8px)`（向上长的根因） |
| `boh-composer.css:421–443` | `≤480` 的锚全宽化（竖屏 action-sheet 式，但仍是 popover） |
| `boh-composer.css:469` | `max-height: min(44dvh, 360px)` |
| `boh-composer.css:503–516` | `.boh-mm-body` 内层滚动 + 隐藏滚动条 |
| `boh-composer.css:519` | `.boh-mm-item` 基座（触屏 48px 在 `:1263`） |
| `boh-composer.css:578` / `:631` | 锁定行 `opacity: .55` / `background: transparent` |
| `boh-composer.css:718` | `.boh-mm-detail`（竖屏隐藏块在其后，`:793` 附近） |
| `boh-composer.css:1263` | `@media (hover: none)` —— **2026-10-22 起已覆盖 `.boh-mm-item`**（S0 ①） |
| `layout.css:132` | 竖屏 `.boh-mm-detail` 死规则**已迁走**（S0 ②，现只留一条"别加回来"的注释） |
| `useBohShell.js:224` | `STRATEGY_MODE_IDS`（策略唯一真源） |
| `useBohShell.js:236–250` | `decorateChatModes` / `filteredChatModes`（`locked` 唯一计算点） |
| `useBohShell.js:398` | `emitIslandMessage` → `emit('island-message')`（断头通道） |
| `useBohShell.js:1511` | `selectMode`（成功通知走断头通道） |
| `useBohShell.js:1553` | `handleLockedMode`（走 `showIsland.notify`，实测能弹） |
| `useBohShell.js:2260` | `handleEscapeLayer` —— 只有 `BOHAIIsland` 调用，独立页无宿主 |
| `BohaiSettingsPanel.vue:109` | 设置页模式列表（未装饰，无锁态） |
| `BohaiSettingsPanel.vue:1847` | 设置页 `z-index: 2147483600`（压住通知） |

> 行号以 **2026-10-22 工作树**为准（S0 的 ①②⑤⑥ 已落代码，`boh-composer.css` 因此整体下移 4 行）。
