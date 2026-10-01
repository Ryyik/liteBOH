# 023 · BOH AI 界面重绘（输入区 + 左栏 + 纯文字流收口）

> 状态：**设计待确认，未动代码**。本文件由 2026-09-30 的草图（`clipboard-2026-09-30T14-34-35-813Z-1830ef41.png`）推导，
> 用户原话：「这次的重构可能比较大，因为我想重绘整个 UI 界面，有点想推倒重来了。但是 AI 的等待动作和输出的格式不变，依旧是纯文字流的感觉」。
> 前一份相关计划在 `.zcode/plans/plan-sess_051668e1-....md`（BOHAI 输入区 + 设置面板优化方案，2026-09-29，**从未实施**，见 §9 的关系说明）。

---

## 1. 目标与已确认口径

草图读出来的目标布局：左侧一条贯穿全高的**对话管理**栏；右侧**消息流**；底部**输入框**，框内左下角是**联网开关**，
右侧一个**可展开面板入口**（面板里装模式选择 / 思考强度），最右是**圆形发送键**。

用户本轮已拍定 3 条：

| # | 决定 | 影响 |
| --- | --- | --- |
| ① | **「模型选择」其实就是模式选择**，不是两个东西 | 面板里模式只留**一个**条目，避免双入口。**不新增独立模型选择器**，`model` 继续由 `mode` 推导 |
| ② | 输入框左下角**只留联网**，其余开关收进右侧面板 | 社区搜索 / 个人 Cloud+ / 健康分析 / 心理分析 从 `+` 菜单搬到右侧面板第三组 |
| ③ | 三形态**一次改、三处覆盖**（改一次就会同时生效） | 开发 1 份，验收 3 份。详见 §3 |

另有一条来自草图的**隐含决定**：草图上**没有顶栏**。而现有独立页顶栏（`.full-ai-toolbar`）的三个职责
——会话名 / 新对话 / 设置——**左栏已经全部承载**（`BohaiSidebar` 已 emit `start-new-chat` 与 `open-settings`）。
所以本次**删除顶栏**，属删冗余，不是新功能。

---

## 2. 现状盘点（实测 file:line，2026-09-30）

### 2.1 视图层（要动）

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/views/BOHAI/BOHAI/BOHAIMain.vue` | **3015** | 模板 1-826 / 脚本 828-2805 / 外链样式 2807-2811 / 内联样式 2813-3015 |
| `styles/messages.css` | 1961 | 消息流 + 输入区部分样式 |
| `styles/adaptive-layout.css` | 1875 | 响应式主力，`composer-mode-*` 有 **58 处** |
| `styles/shell-header.css` | 1141 | `.main-content` 322 / 334 / 379 |
| `styles/motion-system.css` | 314 | 动效，`composer-*` 23 处 |
| `styles/full-workspace.css` | 187 | `.standalone-mode .main-content` 6-11 |
| `components/BohaiSidebar.vue` | 725 | 左栏（对话管理） |
| `components/BohaiSettingsPanel.vue` | 1181 | 设置抽屉，**7 分区** |
| `src/components/ai/AiQuotaSidePanel.vue` | 949 | 额度侧板（本次拟退役） |
| `src/styles/themes/bohai-dark.css` | 908 | 暗色主题 |
| `src/components/UnifiedNavbar/BOHAIIsland.vue` | ~470 | 岛外壳（要删 17 行 `!important` 覆盖） |

### 2.2 逻辑层（**一行都不动**）

`useChatEngine.js` 2752、`bohai-engine-helpers.js` 1619、`useKnowledgeRetrieval.js` 1217、`agents/**` 约 2500、
`useMemoryCapture.js` 795、`useGenerationPipeline.js` 562、`useConversationManager.js` 551、`engine/**` 733
—— **合计约 15000+ 行**。

**这是本计划最重要的结论**：用户要保住的「等待动作 + 输出格式 = 纯文字流」恰好全在这一层，
而这一层跟外壳解耦得很干净。所以「推倒重来」推的是**样式**（5478 行 CSS），不是逻辑。

### 2.3 输入区现有结构（`BOHAIMain.vue`）

```
<footer class="input-area">                       480-781
  ├── .slash-command-menu                         481-503   （保留）
  ├── .composer-chips                             504-548   （顶部开关 chip 行，本次删除）
  ├── .composer-chips.context-chip-row            549-583   （附加页面上下文，保留）
  └── .input-box                                  584-763
      ├── .input-left                             585-651   ← features-btn(+ 号) + features-menu
      │                                                           内含 4 开关 + 心理分析
      ├── .composer-main                          653-664   ← textarea
      └── .input-right                            666-762
          ├── .composer-mode-picker               667-748   ← 模式选择（就地浮层）
          └── .input-actions                      749-761   ← 方形发送 / 停止
```

另：**上下文环**目前在 `.message-actions` 内（`373-428`），计算逻辑 `1405-1416`。

### 2.4 三形态的实际差别（用户问过，此处存档）

同一个 `BOHAIMain.vue` 被三处挂载：

| 形态 | 挂载点 | props | 左栏 | 顶栏 | 尺寸 |
| --- | --- | --- | --- | --- | --- |
| 独立页 `/ai-chat` | `router/routes/public.ts:95` → `BOHAI/BOHAI/index.vue` | 无 | 完整（`position: fixed`） | 组件自带 | 占满窗口 |
| AI 岛 | `UnifiedNavbar/BOHAIIsland.vue:55` | `embedded` + `overlay-mode` | **被隐藏** | 岛自己的 | `position:absolute`，高 `min(50vh,520px)` |
| 用户空间内嵌 | `UserSpace/UserSpaceMain.vue:232` | `embedded` | 默认折叠为按钮 | 组件自带 | 受 `.ai-workspace` 约束 |

岛藏左栏/顶栏是**硬代码**（`BOHAIIsland.vue:396-406`）：

```css
:global(.bohai-island-chat .sidebar) { display: none !important; }
:global(.bohai-island-chat .full-ai-toolbar),
:global(.bohai-island-chat .full-ai-toolbar-actions),
:global(.bohai-island-chat .full-ai-header) { display: none !important; }
```

**内容同源，外壳三套。** 所以「改几处」不存在，改一次三处都变；要花力气的是**验收跑三遍**。

### 2.5 左栏的定位真相（影响新布局怎么写）

`BohaiSidebar.vue` 根元素是 `<aside class="sidebar">`，且 **`<Teleport to="body">`**（`overlayMode` 下 disabled）。
在 ≥1024px 时（`BohaiSidebar.vue:643-655`）：

```css
.sidebar { position: fixed; inset: 0 auto 0 0; width: clamp(248px, 19vw, 312px); z-index: 2147483450; }
```

主内容靠 `margin-left` 避让（`adaptive-layout.css:1318-1322`）：

```css
.bohai-page.sidebar-open .main-content {
  margin-left: var(--bohai-sidebar-width);
  width: calc(100% - var(--bohai-sidebar-width));
}
```

即：**现在是「固定浮层 + 主内容让位」，不是真正的两列流式布局。** 草图要的是一条真实贯穿全高的列，
两种写法都能做到，但代价不同（见 §10 待定 ①）。

### 2.6 纯文字流：⚠️ 前一版此处结论有误，已更正

**初版结论（错）**：以为岛已实现纯文字流，本次只是"把它提升为基类"。
**实测更正（2026-09-30 22:45）**：**岛那段是死代码，三形态目前都有用户气泡。**

原因：岛的去气泡规则打在**父元素** `.message.user` / `.message.assistant` 上
（`BOHAIIsland.vue:429-439`），而气泡实际长在**子元素** `.message.user .message-content` 上。
父元素设 `background: transparent` 管不到子元素；且基类 `.message`（`messages.css:224-227`）
本来就只有 `max-width: 100%; padding: 0;`，没有背景/边框/圆角/阴影
—— 所以岛那 8 条声明**逐条都是 no-op**。

用户气泡的真实定义有 **3 处**，且**生效的是第 2 处**（3 类选择器，特异性压过第 1 处的 2 类）：

| # | 位置 | 选择器特异性 | 内容 |
| --- | --- | --- | --- |
| 1 | `messages.css:244-254` | 0,2,0 | `padding: 9px 14px` / `border-radius: 20px` / `--bohai-liquid-fill` / `--bohai-glass-shadow` / `backdrop-filter` |
| 2 | **`adaptive-layout.css:591-599`** | **0,3,0** ← 实际生效 | `border-radius: 18px 18px 6px 18px`（带尾角的气泡）/ `rgba(255,255,255,.9)` / `backdrop-filter` |
| 3 | `bohai-dark.css:94-98` | 0,3,0 + `[data-theme]` | 暗色 `background: #303030` |

**推论**：去气泡是**三形态的全新视觉变更**，不是"把已有形态推广"。且它与用户原话
「输出的格式不变」存在**字面冲突**（气泡算不算"格式"？）——故此项**降级为待确认**，
不放进首批实施（见 §10 ⑥）。

**顺带确认**：仓库已有 `data-ui-style` 皮肤机制（`theme-manager.js:182/190`，值 `glass` / `flat`，
BOHAIMain `:data-ui-style` 绑定 + Forum 共用），但 **`flat` 只关掉 `backdrop-filter`，不删气泡**
（`shell-header.css:70-83`）。所以"纯文字流"在现有皮肤体系里**没有现成实现**，不能靠切皮肤达成。

### 2.7 模型与模式的关系（口径 ① 的代码依据）

`useModelConfig.js:71`：

```js
const currentModelId = computed(() => currentMode.value.model);
```

**模型是模式的附属品，用户无法单独选择。** 所以口径 ① 落地的正确做法是：
面板里模式条目**顺带展示它对应的模型名**（信息量不减），而不是做一个假的模型选择器。
若将来真要做独立模型选择，那是**行为变更**——会撞后端 `bohai_model_configs.min_tier` 校验
与 `quotaMultiplier` 额度倍率，必须另走流程。

---

## 3. 改造范围

**改一次，三处覆盖。** 验收按 `独立页 → AI 岛 → 用户空间内嵌` 递进。

- 左栏完整形态**只在独立页出现**（岛藏掉它、内嵌默认折叠）——这是既成事实，本次不改。
- 输入框三件套（联网左下 / 右侧面板 / 圆发送）**三处都会出现**，因为是同一个组件。
- 用户空间内嵌那处容器约束最多（塞在 `.ai-workspace` 里），**放最后验收**。

---

## 4. 新布局规格

### 4.1 骨架（独立页）

```
.bohai-page.standalone-mode
└── .bohai-container
    ├── BohaiSidebar (.sidebar)          ← 左栏：对话管理（贯穿全高）
    └── .main-content
        ├── ✂ .full-ai-toolbar           ← 【删除】职责已由左栏承载
        ├── .chat-container              ← 消息流（纯文字流）
        └── footer.input-area            ← 新输入框
```

### 4.2 输入框

```
.input-box
├── .composer-main
│   └── textarea.input-textarea          ← 自动增高（复用现有 autoResize）
└── .composer-bar                        ← 【新增】底行
    ├── .composer-bar-left
    │   └── button.composer-web-toggle   ← 联网开关（左下角，单键）
    ├── .composer-bar-spacer
    └── .composer-bar-right
        ├── button.composer-panel-trigger ← 展开面板入口
        └── button.send-btn               ← 圆形发送（isLoading 时切 stop-btn）
```

- **联网开关**：单键 toggle，`isSearching` 双向绑定；开启态需有明确视觉反馈（现在是 chip 上的 ×）。
- **发送键**：由方形 `.input-actions` 改为**圆形**，图标沿用 `ArrowUp`；`isLoading` 时原位换成 `Square` 停止键（复用现有 `stopGeneration`）。
- **删除** `.composer-chips` 顶部开关行（`504-548`）——4 个开关搬进右侧面板，`.context-chip-row`（附加页面上下文）保留。

### 4.3 右侧展开面板 `.composer-panel`

向上弹出，锚定在 `.composer-panel-trigger`。**三组**：

| 组 | 内容 | 数据来源（已解构，直接复用） |
| --- | --- | --- |
| 1 · 模式 | `chatModes` 列表 + 当前模型名 + 倍率 | `currentModeId` / `chatModes` / `selectMode` / `isFreeMode` / `formatQuotaMultiplier` |
| 2 · 思考强度 | 低 / 中 / 高 三档 + 描述 | `currentThinkingSpeedId` / `thinkingSpeedOptions` / `setThinkingSpeed` |
| 3 · 工具开关 | 社区搜索 / 个人 Cloud+ / 健康分析 / 心理分析 | `toggleForumSearch` / `handleTreeholeMemoryToggle` / `toggleHealthAnalysis` / `startPsychAnalysis` |

- 模式组**顺带展示模型名**（口径 ①）：每个 `mode` 已有 `mode.model`，映射 `availableModels` 取显示名即可，**不新增选择能力**。
- 现有 `.composer-mode-menu`（`667-748`）的**加载骨架屏**（`chatModesLoading`）、空态、`了解所有模式 ›` 页脚全部平移进面板第 1 组，**契约不破**。
- 外点 / Esc 关闭：复用现有模式菜单的 pattern（`BOHAIMain.vue` 已有 `@click.stop` + document 监听）。

### 4.4 左栏（对话管理）

**能力全部沿用** `BohaiSidebar.vue`，只重绘视觉：搜索、新对话、临时对话、会话列表、置顶 / 重命名 / 删除、设置入口。
唯一结构性待定项是定位方式（§10 ①）。

### 4.5 纯文字流收口（**降级为待确认，见 §10 ⑥**）

若用户确认要去气泡，正确做法是**改真源而不是加覆盖**：

1. **改第 2 处**（`adaptive-layout.css:591-599`，实际生效的那个）：去掉 `border` / `border-radius` / `background` / `backdrop-filter`，留 `color`。
2. **改第 1 处**（`messages.css:244-254`）：同样去掉气泡属性，`padding` 归零。
3. **改第 3 处**（`bohai-dark.css:94-98`）：删掉暗色 `background: #303030`。
   ⚠️ 三处必须同批改 —— 只改一处会因为特异性/暗色覆盖而"改了没反应"，这是本文件 2.6 节踩过的同一个坑。
4. **删岛里的死代码**（`BOHAIIsland.vue:429-439`）：那 8 条声明确认是 no-op，可安全删除并**顺带降 `check:important-budget` 棘轮**。
   ⚠️ 但同块的 `font-size: 14px` / `line-height: 1.65` 与 `text-align: right`（442-451）**不是 no-op**，删前要单独核。
5. **`renderMarkdown` / 流式输出 / `.thinking-dot` / 任务面板 / 内联问答一律不动**——这是用户明确要保的部分。

---

## 5. 改动清单（按文件）

**改**

- `BOHAIMain.vue` — 模板：删顶栏、删 `.composer-chips`、重建 `.input-box` 内部、上下文环从 `message-actions`（373-428）搬进 `.composer-bar-right`
- `styles/adaptive-layout.css` — `composer-*` 58 处重排；新增 `.composer-bar` / `.composer-panel` / `.composer-web-toggle` 规则；竖屏档（1337 起）补窄屏收缩
- `styles/messages.css` — 输入区（1688 / 1733 / 1754）+ 去气泡（244-254）
- `styles/motion-system.css` — 23 处 `composer-*` 动效对齐
- `styles/shell-header.css` — 顶栏相关规则清理（322 / 334 / 379）
- `styles/full-workspace.css` — `.standalone-mode .main-content` 适配无顶栏
- `components/BohaiSidebar.vue` — 视觉重绘（能力不动）
- `components/BohaiSettingsPanel.vue` — 7 分区重排（思考强度移出、工具开关移出）
- `src/styles/themes/bohai-dark.css` — 新增控件的暗色
- `src/components/UnifiedNavbar/BOHAIIsland.vue` — 删 419-435 覆盖；核对 396-406 的选择器是否因重绘改名而失效
- `tests/unit/bohai-quick-sidebar.test.js`、`tests/unit/bohai-settings-panel.test.js` — **读源码文本断言**，必须同批改
- `scripts/probes/probe-bohai-mode-loading.mjs` — 选择器同步

**增**

- `scripts/probes/probe-bohai-composer.mjs` — 新探针（见 §7）

**删**

- `src/components/ai/AiQuotaSidePanel.vue`（949 行）及其挂载（`BOHAIMain.vue:809-813`）与接线（`openQuotaPanel` / `closeQuotaPanel` / `isQuotaPanelOpen`）
- 顶栏 `.full-ai-toolbar` 模板块（`41-71`）与其样式

---

## 6. 明确出界（不许顺手改）

- **`THINKING_SPEED_OPTIONS` / `GENERATION_PROFILE_BY_MODE` 表值**——改值 = 行为变更，另走流程。本次只搬 UI。
- **`renderMarkdown` / 流式输出 / 等待动效 / 任务面板 / 内联问答**——用户明确要求保持不变。
- `useChatEngine` / `bohai-engine-helpers` / `agents/**` / `useKnowledgeRetrieval` / `useMemoryCapture` 等逻辑层。
- `quota-status` runtime API（`api-key-runtime-api.js:325`）——设置面板用量卡仍用。
- `GENERATION_PARAMS` 真源表（`generation-params.js`）与 `check:bohai-params` 门禁对象。
- 权限策略、表结构、Edge Function。

---

## 7. 验证计划

### 7.1 门禁

- `npm run verify` 全绿；**lint 警告棘轮 ≤189 不升**
- `npm run check:important-budget` —— 删掉岛里 17 行 `!important` 应使总量**下降**（下调是好方向，无需交代）；新增样式**不许**加 `!important`
- `npm run check:dark-tokens:strict` —— 新样式不许出现暗色裸色值，走 token 或 `bohai-dark.css`
- `npm run check:layering` —— 不许在 `views`/`components` 里新增 `supabase.from/rpc`
- `npm run check:gates-self-test` —— 若本次改动了任何门禁

### 7.2 现有探针 / 单测

- `npm run probe:ai-panels`（125 行；断言 `.bohai-container`、设置入口、`.ai-settings-drawer` 尺寸与不透明底、焦点进入、Esc 关闭）
  → ⚠️ 它断言设置入口是 `[title*="设置"]` / `[class*="settings-btn"]`，**删顶栏后入口只剩左栏那个，需确认仍能命中**
- `node scripts/probes/probe-bohai-mode-loading.mjs`
- `node scripts/probes/probe-ai-island-rail.mjs`（岛形态）
- `tests/unit/bohai-quick-sidebar.test.js` / `bohai-settings-panel.test.js`

### 7.3 新增探针 `probe-bohai-composer.mjs`

断言（初版 6 条，实施时按实际 DOM 定稿）：

1. `.input-box` 内存在 `.composer-bar`，且 `.composer-web-toggle` 位于**框内左下角**（`rect.left < 框中线` 且 `rect.bottom > 框中线`）
2. `.composer-web-toggle` 点击后 `isSearching` 生效（按钮呈开启态）
3. `.composer-panel-trigger` 点击后 `.composer-panel` 出现，且**三组**（模式 / 思考 / 工具）均在
4. 面板内可切换思考档位，且刷新后保持（读 `boh_ai_thinking_speed_v1`）
5. `.send-btn` 为**圆形**（`border-radius` 使 `width ≈ height` 且为圆）
6. 消息区**无气泡**：`.message.user .message-content` 的 `backgroundColor` 为透明、`border-radius` 为 0
7. 反证：`git stash` 撤掉修复后，第 1、5、6 条必红

### 7.4 手工验收（三形态各一遍）

| 形态 | 检查 |
| --- | --- |
| 独立页 `/ai-chat` | 左栏贯穿全高；无顶栏；输入框三件套就位；面板三组可用；纯文字流 |
| AI 岛 | 无左栏（预期）；输入框三件套出现；面板可用；纯文字流与独立页**视觉一致** |
| 用户空间内嵌 | 左栏折叠按钮可用；输入框三件套不溢出容器；竖屏不遮挡 |

另需：暗色模式无裸色值违规；`prefers-reduced-motion` 下动效降级正常；竖屏 390×844 与横屏各过一遍。

---

## 8. 风险表

| 风险 | 症状 | 对策 |
| --- | --- | --- |
| **岛的选择器因重绘改名而静默失效** | 左栏/顶栏在岛上**重新出现**，岛被撑破 | 改类名前先核 `BOHAIIsland.vue:396-406`；新探针加岛形态断言 |
| **顶栏删除后设置入口丢失** | `probe-ai-panels` 找不到入口而 skip（不报红，静默漏检） | 确认左栏 `.sidebar` 内设置按钮能被 `[title*="设置"]` 命中；探针加显式断言 |
| **去气泡化连带影响消息可读性** | 用户消息与 AI 回复视觉上分不开 | 靠字号/缩进/`BOH AI` 角色标签区分；对照岛现状（岛已跑此形态，有实测基础） |
| **`!important` 棘轮反向** | 新样式为压旧规则而加 `!important`，撞门禁 | 优先删旧规则而不是覆盖；确需新增走 commit message 说明 |
| **暗色裸色值** | `check:dark-tokens:strict` 红 | 新控件颜色一律走 token |
| **三形态回归面广** | 独立页好了，岛或内嵌崩 | 验收顺序固定 独立页 → 岛 → 内嵌；探针覆盖三形态 |
| **`.main-content` 避让逻辑与新左栏冲突** | 侧栏开着时主内容被双倍偏移 | §10 ① 定案后再动 `adaptive-layout.css:1311-1335` |
| **`probe-bohai-mode-loading.mjs` 既有失效选择器** | 探针假绿 | 本次顺手修（前计划已记录 `.mode-option-name strong` → `.mode-option-main strong`） |

---

## 9. 与前一份计划（`.zcode/plans/`）的关系

2026-09-29 那份《BOHAI 输入区 + 设置面板优化方案》**从未实施**（实测：`AiQuotaSidePanel.vue` 仍在、
`composer-thinking-picker` 全仓 0 命中、`input-right` 未出现）。它与本计划有重叠但**结论不同**：

| 议题 | 前计划（9-29） | 本计划（9-30） |
| --- | --- | --- |
| 输入区布局 | `[+号][textarea][上下文环][思考][模式][发送]` | `[textarea / 底行: 联网 | 面板入口 | 圆发送]` |
| 思考强度 | 新增 `.composer-thinking-picker` 就地控件 | 移入右侧展开面板 |
| 模式选择 | 就地浮层保留 | 移入右侧展开面板 |
| 联网开关 | 仍在 `+` 菜单 | **提到左下角单键** |
| 上下文环 | 搬进 `.input-right` | 搬进 `.composer-bar-right`（同思路） |
| AiQuotaSidePanel | 退役 | 退役（一致） |
| 顶栏 | 不动 | **删除**（新） |
| 纯文字流 | 不涉及 | **全局收口**（新） |

**本计划取代前计划。** 建议把 `.zcode/plans/` 那份归档或标注「已由 plans/023 取代」，避免两份漂移
（`AGENTS.md` 把计划真源定在 `plans/NNN-*.md`，`.zcode/plans/` 既无编号也不在索引里，属计划散落）。

---

## 10. 待定项 —— 已按建议定案（2026-09-30）

| # | 议题 | 定案 | 理由 |
| --- | --- | --- | --- |
| ① | **左栏定位方式** | **保留 `position: fixed` + 主内容 `margin-left` 避让**，只重绘视觉（圆角 / 内缩 / 边框），贴近草图的"卡片感" | 改成 in-flow flex 列要**同时**动三处：`BohaiSidebar.vue:2` 的 `<Teleport to="body">`、`adaptive-layout.css:1311-1335` 的避让逻辑、`BOHAIIsland.vue:396-399` 的岛内隐藏选择器。风险大于收益，且视觉收益可用样式达成 |
| ② | **面板形态** | **浮层，向上弹出** | 与现有 `.composer-mode-menu`（`BOHAIMain.vue:680-747`）的交互 pattern 一致，复用外点/Esc 关闭逻辑；不挤压消息流 |
| ③ | **竖屏 / 移动端** | 左栏走现有抽屉；输入框底行在 `<480px` 时**联网与面板入口只留图标**，隐藏文字 | 竖屏底行放不下三件套 + 文字 |
| ④ | **顶部 chip 行删除的连带** | 开启态**由开关按钮自身承担**（变色 / 描边 / 图标态），**不新增提示条** | 避免又造一个"状态第二处真源" |
| ⑤ | **上下文环归宿** | 搬进 `.composer-bar-right`；点击开**设置面板的用量卡**（因额度面板退役） | 草图未画它，但它承载上下文预算信息，不宜丢 |
| ⑥ | **去气泡（纯文字流）** | **⏸ 待确认** | 见 §2.6 —— 它与用户原话「输出的格式不变」有字面冲突，且是三形态的可见变更，需用户拍板 |

---

## 11. 实施顺序（每步独立可验证）

> ⚠️ 已调整：原第 ① 步「去气泡」因前提证伪（§2.6）降级为最后的待确认项，
> 改从**无歧义的输入框重建**起步（这是用户草图的重点，也是三条已确认口径的落点）。

```
① 输入框重建      → 底行三件套（联网左下 / 面板入口 / 圆发送）+ 删顶部 chip 行 + 上下文环搬家
② 右侧展开面板    → 模式（含模型名）+ 思考强度 + 工具开关三组；吞掉 + 菜单
③ 左栏重绘 + 删顶栏
④ 设置面板重排 + AiQuotaSidePanel 退役
⑤ 三形态验收 + 探针补齐
⑥ ⏸ 去气泡（待用户确认）
```

每步跑 `npm run verify` + 对应探针；① 与 ② 之间插一次三形态冒烟，尽早暴露岛 / 内嵌的连带问题。

---

## 12. 实施进度

### ✅ 步骤 ① 输入框重建 + ② 右侧展开面板（2026-09-30 23:00 完成）

**已改文件**：`BOHAIMain.vue`（模板 + 脚本）、`styles/adaptive-layout.css`、`styles/motion-system.css`、
`tests/unit/bohai-quick-sidebar.test.js`。

**落地内容**：
- 删顶部 `.composer-chips` 开关行（4 开关不再平铺）
- `.input-box` 单行三列 grid → **两行 flex column**
- 新增 `.composer-bar` 底行：左 `.composer-tool-btn`（联网单键）/ 右 `.composer-context-slot`（上下文环从
  `.message-actions` 搬来）+ `.composer-panel-picker` + `.input-actions`
- 新增 `.composer-panel`（向上弹出）三组：**模式**（含倍率 / 免费角标 / 加载骨架 / 空态 / `了解所有模式` 页脚）
  + **思考强度**（三档）+ **工具**（社区搜索 / Cloud+ / 健康分析 / 心理分析）
- 删 `.input-left`（`+` 号菜单），5 个入口全搬进面板工具组
- 脚本层重命名：`modeMenuOpen` → `composerPanelOpen`、`closeModeMenu` → `closeComposerPanel`、
  `toggleModeMenu` → `toggleComposerPanel`；**连根删除** `showFeaturesMenu` ref / `toggleFeaturesMenu` /
  `closeFeaturesMenu` / `closeFeaturesMenuTimer` 及 6 处调用点

**两条「白提」需求（实测本来就满足，别再重复做）**：
- **圆形发送键**：`.send-btn`/`.stop-btn` 早就是 `34px + border-radius:999px`（`adaptive-layout.css:972-987`）。
- **模型名展示**：`availableModels[].name` 来自 `display_name`（`bohai-model-config-api.js:23`），而每行是**模式**
  配置 ⇒ 该 name 其实是**模式名**，拿它当模型标签会误导。故面板只留「模式」一组（正好合口径①），不展示模型名。

**自证**：`verify` 全绿（2273 passed / 1 failed → 唯一红是断言被删 chip 行的 v-if 条件，已同批改锁新落点）；
`probe-home-gate-pull` 54/54；三个棘轮持平；lint 无新增警告。

### ✅ 步骤 ③ 删顶栏（2026-09-30 23:17 完成）

**已改文件**：`BOHAIMain.vue`、`styles/full-workspace.css`、`styles/motion-system.css`、
`tests/unit/bohai-quick-sidebar.test.js`。

**⚠️ 这一步的坑（必须记）**：独立页顶栏（`.full-ai-toolbar`）原本是独立页**唯一**的侧栏展开入口 ——
侧栏自己的 `.sidebar-open-btn` 被**两处**同时藏掉：
① 模板传 `:show-open-button="!isStandalone && !props.overlayMode"`（独立页为 false）；
② `full-workspace.css` 里还有一条 `.bohai-page.standalone-mode .sidebar-open-btn { display: none !important }`。
**直接删顶栏 = 用户收起侧栏后永久打不开**。修法：模板放开为 `:show-open-button="!props.overlayMode"`，
并删掉那条 `display:none !important`。两处必须同批改。

**顶栏三个职责的去处**（全部由左栏承载，无需新增 UI）：会话名 = 侧栏会话列表高亮项；
新对话 = 侧栏 `start-new-chat`；设置 = 侧栏 `.sidebar-settings-btn`（`title="设置"`，`probe-ai-panels` 靠它命中）。

**连带清理**：删顶栏 CSS（`full-workspace.css` 的 `.full-ai-toolbar*` 全套 + `motion-system.css` 的
入场动画与 `@keyframes bohai-toolbar-enter`）；删 3 个失效 import（`Plus` / `PanelLeft` / `Settings2`）
与失效 computed `currentSessionTitle`；把 `motion-system.css` 的过渡组里已死的
`.features-btn` / `.composer-mode-button` / 顶栏两项换成新的
`.composer-tool-btn` / `.composer-panel-trigger` / `.composer-panel-option` / `.composer-panel-tool`。

**自证**：`probe-ai-panels` 通过（**「设置入口存在：true」** —— 删顶栏后没静默漏检）；
`bohai-quick-sidebar` + `bohai-settings-panel` **60/60 绿**（那条读源码断言已同批改，并加了一条
`not.toContain('full-ai-toolbar')` 防止顶栏偷偷回来）；lint 无新增警告；
一次性 Playwright 检查 **7/7 通过**（顶栏已删 / 侧栏默认展开 / 收起后「打开侧栏」按钮出现 / 点它能恢复）。

### ⬜ 未做

- **步骤 ④** 设置面板重排（7 分区 → 3 卡 + 折叠高级 + 底部数据行）+ `AiQuotaSidePanel` 退役
- **步骤 ⑤** 三形态人工验收 + 新探针 `probe-bohai-composer.mjs`
- **步骤 ⑥** 去气泡 —— **用户已拍板：保留用户端气泡、AI 回复不放气泡**。
  实测结论：**这就是现状，无需改动**（AI 回复在浅色下无背景；暗色下 `bohai-dark.css:540-546`
  显式 `background: transparent; border: none; box-shadow: none`）。用户气泡保留三处定义
  （`messages.css:244` / `adaptive-layout.css:591` 生效 / `bohai-dark.css:94`）。

### ⚠️ 遗留：约 35 处死 CSS 未清

步骤 ② 删掉的元素（`.features-btn` / `.features-menu` / `.composer-mode-button` / `.composer-mode-menu` /
`.composer-mode-option` / `.input-left` / `.input-right`）在 4 个样式文件里仍留有约 35 处规则。
**不在 `verify` 链内**（`audit:css:orphans` 是独立脚本），无功能影响。
建议单开一步清理（届时可顺带下调 `check:important-budget` 与 `check:dark-tokens` 计数）。
