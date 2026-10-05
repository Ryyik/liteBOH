# plans/025 — BOHAI 模块拆分与引擎重写（2026-10-05）

> 触发：用户明确要求 **「重写，然后分出很多文件，不出现超大单个文件」**。
>
> 前置阅读：`docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md`（**做什么** —— 产品形态、Chat/Work、插件选型）。
> 本文是**怎么拆**（工程），两份互为表里。

---

## 0. 先回答一个必须先讲清的问题：哪些该重写，哪些只该拆

用户说「重写」。但**拆文件**和**重写**是两件事，风险差一个数量级，混在一起做会把资产一起扔掉。

**决定性的约束在这里**：BOHAI 被 **37 个测试文件 + 7 个探针**锁着行为。
这些测试锁的恰恰是**最贵的经验**——例如：

- `bohai-auto-router.test.js` 锁「9 类正则已无活消费方但不可误删」；
- `psych-interview-engine.test.js` / `psych-guard-rewrite.test.js` 锁心理访谈的**封闭域**（不检索、不写记忆）；
- `bohai-latency-guards.test.js` 锁首字延迟的两个 P0（少一次 LLM 往返 + 陈旧证据注入）；
- `probe-bohai-composer.mjs` **22 条**锁输入区三形态几何。

**推倒重写 = 把这 44 份验证资产全部作废**，而且重写过程中没人能告诉你「原来为什么要这么写」。

所以正确的做法是**按代码性质分三层，各用各的手法**：

| 层 | 代码性质 | 该用什么手法 | 为什么 | 风险 |
| --- | --- | --- | --- | --- |
| **L1** | **纯函数杂物抽屉**（无状态、无 Vue 依赖） | **只拆，不重写** | 行为被单测逐条锁着；重写等于白扔 70 个已验证函数 | 极低 |
| **L2** | **组件与样式** | **只拆，不重写** | 探针锁几何；拆是机械移动 | 中 |
| **L3** | **巨型有状态 composable** | **拆 + 重写成阶段化** | 它本来就要为"形态/工具层"改，顺手重构成流水线 | 高 |

**一句话**：**L1/L2 拆，L3 重写。** 不是全都要重写。

> 反过来说，如果你坚持"全部重写"，请先接受一个代价：**37 个测试 + 7 个探针作废，行为回归只能靠人工盲测**。
> 而 BOHAI 恰恰是"规则密集 + 行为微妙"（记忆里有大量「改一处要动四处」的记录），我不建议。

---

## 1. 现状量化（实测）

**总量：58 个文件 / 27,478 行。**

门禁阈值（`scripts/check-project-structure.mjs:27-30`）：`.css` = 2000 行，`.js` / `.ts` / `.vue` = 2500 行；
超阈值是 **WARN 不是 error**，但 `npm run verify` 输出里会刷出来（本轮 verify 就报了 7 个）。

### 1.1 超阈值清单（按行数降序，这是拆分的靶子）

| 文件 | 行数 | 阈值 | 超出 |
| --- | --- | --- | --- |
| `BOHAI/BOHAI/BOHAIMain.vue` | **3179** | 2500 | +679 |
| `composables/useChatEngine.js` | **2696** | 2500 | +196 |
| `BOHAI/BOHAI/styles/messages.css` | **2075** | 2000 | +75 |
| `BOHAI/BOHAI/components/BohaiSettingsPanel.vue` | **2073** | 2500 | — |
| `BOHAI/BOHAI/styles/adaptive-layout.css` | **1959** | 2000 | — |
| `composables/bohai-engine-helpers.js` | **1682** | 2500 | — |
| `composables/useKnowledgeRetrieval.js` | **1238** | 2500 | — |
| `BOHAI/BOHAI/styles/shell-header.css` | 1030 | 2000 | — |
| `BOHAI/BOHAI/components/BohaiSidebar.vue` | 1003 | 2500 | — |

> 注：`BohaiSettingsPanel.vue` 2073 / `adaptive-layout.css` 1959 / `shell-header.css` 1030 虽未超阈值，
> 但作为**拆分靶子**仍然成立（它们离阈值只差一点，且改动频繁）。

### 1.2 验证资产（拆分的"安全网"也是"约束"）

- **37 个测试文件**（`grep -ril bohai tests/`）覆盖：auto-router / auto-decision / latency-guards / contextual-followup / quick-sidebar / settings-panel / connectors / action-draft-intent / resource-search-intent / user-private-plan / site-activities / chat-session-store / model-client / model-config / action-audit / observability / constants / web-search-fallback …
- **7 个探针**：`probe-bohai-composer.mjs`(22) / `probe-bohai-mode-loading.mjs` / `probe-lab-bohai-mode-chat.mjs` / `probe-ai-panels.mjs` / `probe-ai-island-rail.mjs` / `probe-aichat-landscape-rail.mjs` / `probe-ai-billing-config.mjs`

**⇒ 拆分过程中，这 44 份资产就是回归判据。任何一步做完，它们必须全绿。**

---

## 2. 红线（拆分时绝对不能碰的）

| # | 红线 | 来源 |
| --- | --- | --- |
| 1 | **`agents/` 和 `expert-roles/` 不动** | 它们已是良好模块化（每个 100–300 行）。`agents/` 是 Work 形态的现成底座，改它只会破坏 |
| 2 | **不要为了"少一层目录"把纯函数塞回组件** | 单一真源：同一规则只能有一处定义 |
| 3 | **CSS 拆分必须保序**：`.css` 的 `@import` 顺序 = 层叠顺序 | 本仓有 scoped 特异性 +1 的坑（AGENTS.md） |
| 4 | **CSS 拆分不得把 scoped 改成 global**，也不得新增裸色 | `check:important-budget` / `check:dark-tokens` 两道棘轮（当前 1217/1217、2854/2854，**只许降**） |
| 5 | **lint 警告数只许降不许升**（当前 **118**） | `--max-warnings` 棘轮 |
| 6 | **动态 import 的组件必须带 `onError` retry** | 否则 chunk 404 = 无声空白（`vite-preload-recovery.js` 有恢复，组件级要自己兜） |
| 7 | **拆分期间 BOHAI 目录不能有并行会话在写** | 本仓已有多次"文件凭空消失"的教训（`parallel-session-stash-recovery`） |
| 8 | **提交只给明确路径，永不 `git add -A`** | 工作区长期有并行改动的脏文件 |
| 9 | **每步单独 commit + 单独验证**，不要攒一大坨 | 出错要能单步回滚 |

---

## 3. 目标结构

```
src/views/BOHAI/
├─ BOHAI/                          # 页面层（薄壳 + 组件）
│  ├─ BOHAIMain.vue                # 目标 < 350 行：只做布局装配 + 形态切换
│  ├─ components/
│  │  ├─ chat/                     # 消息流
│  │  │  ├─ ChatMessageList.vue
│  │  │  ├─ ChatMessageItem.vue
│  │  │  ├─ SearchSourceChips.vue
│  │  │  ├─ InlineFollowUp.vue
│  │  │  ├─ AgentClusterPanel.vue
│  │  │  └─ EmptyStateSuggestions.vue
│  │  ├─ composer/                 # 输入区
│  │  │  ├─ ComposerArea.vue
│  │  │  ├─ UsageOrb.vue
│  │  │  ├─ ComposerSettingsMenu.vue
│  │  │  └─ SlashCommandMenu.vue
│  │  ├─ sidebar/
│  │  │  ├─ BohaiSidebar.vue       # 壳
│  │  │  └─ SessionListItem.vue
│  │  └─ settings/                 # 设置面板
│  │     ├─ BohaiSettingsPanel.vue # 壳 + tab
│  │     └─ cards/
│  │        ├─ ConversationPrefsCard.vue
│  │        ├─ MemoryContextCard.vue
│  │        ├─ AppearanceCard.vue
│  │        └─ UsageCard.vue
│  └─ styles/                      # 按域再拆（见 §4.4）
│
├─ engine/                         # ★ 编排层（纯逻辑，无 UI）
│  ├─ useChatEngine.js             # 目标 < 400 行：只做流程编排
│  └─ stages/                      # 见 §4.5
│
├─ tools/                          # ★ 新增：Tool Registry（形态的能力来源）
│  ├─ registry.js
│  ├─ types.js
│  ├─ retrieval/                   # 从 useKnowledgeRetrieval 拆出，一个 connector 一个文件
│  ├─ web/                         # 搜索 + 网页深读
│  ├─ generator/                   # ★ 新增：docx / pptx / xlsx
│  └─ action/                      # createPost 等写动作
│
├─ surfaces/                       # ★ 新增：形态定义
│  ├─ chat.js
│  └─ work.js
│
├─ agents/                         # 保持不动（已是良好模块化）
├─ expert-roles/                   # 保持不动
└─ utils/                          # ★ L1 拆分落点（见 §4.1）
   ├─ text/
   ├─ retrieval/
   ├─ prompt/
   ├─ memory/
   ├─ web/
   ├─ intent/
   ├─ draft/
   └─ format/
```

> ⚠️ **命名冲突提醒**：BOHAI 内部已有 `utils/`，而全局有 `src/utils/`。
> import 时 `../utils/xxx` 与 `@/utils/xxx` 极易看错。建议拆分后统一用**相对路径**指向 BOHAI 内部 utils，
> 并在 `src/views/BOHAI/utils/index.js` 加一行注释说明"这里是 BOHAI 私有工具，不是 `@/utils`"。

---

## 4. 逐文件拆分提案

### 4.1 L1 · `bohai-engine-helpers.js`（1682 行，≈70 个导出）→ 14 个模块

**这是最该先做的一步**：全是纯函数（零 Vue 依赖、零响应式），**机械移动即可，行为零变化**。
按职责分为 8 组：

| 目标文件 | 收纳的导出 | 估算 |
| --- | --- | --- |
| `utils/text/normalize.js` | `normalizeText` `truncateText` `normalizePromptLine` `escapePromptXmlAttr` `stripWrappingQuotes` `containsAnyKeyword` | ~90 |
| `utils/text/keywords.js` | `splitKnowledgeChunks` `extractQueryKeywords` `clearKeywordCache` + 关键词缓存 | ~110 |
| `utils/text/tokens.js` | `estimateTokens` `estimateMessagesTokens` `TOKEN_ESTIMATE_ROLE_OVERHEAD` | ~60 |
| `utils/retrieval/scoring.js` | `scoreChunk` `selectRelevantChunks` `trimKnowledgeChunk` `rankEvidenceContextBlocks` `buildSharedEvidenceContext` | ~170 |
| `utils/retrieval/budget.js` | `buildHistoryMessagesWithinBudget` `trimMessagesToBudget` `getStorableDialogueMessages` `ESTIMATED_SYSTEM_PROMPT_CHARS` | ~90 |
| `utils/prompt/assembly.js` | `appendPromptSection` `buildStructuredUserPrompt` `buildSystemEvidenceContext` `isEmptyAssistantPlaceholder` | ~80 |
| `utils/prompt/followup.js` | `isEllipticalElaborationFollowUp` `isContextDependentFollowUp` `buildContextualFollowUpQuery` `buildContextualWebSearchQuery` | ~90 |
| `utils/memory/store.js` | `getAIMemory` `CONVERSATION_SUMMARY_*` `buildConversationSummaryFingerprint` `buildHistoryMessagesWithCachedSummary` `getCachedSummaryIfUsable` | ~130 |
| `utils/memory/dedupe.js` | `normalizeMemoryCompareText` `isLikelyMemoryDuplicate` `extractExplicitMemoryContent` | ~50 |
| `utils/web/search.js` | `buildSearchResultsContext` `getWebSearchFreshnessDays` `searchWebForPrompt` `resetTavilySearchAvailability` + `TAVILY_/FREE_` 常量 | ~150 |
| `utils/intent/rules.js` | `isOperationQuestion` `shouldUseSiteGuide` | ~45 |
| `utils/draft/post-text.js` | `normalizeActionInput` `stripLeadingActionPhrase` `extractSingleLineField` `extractMultilineField` `trimLeadingDraftDelimiters` `extractFieldUntilNextLabel` `cleanPostDraftIdeaText` `stripPostDraftTitleNoise` `buildLocalPostDraftTitle` `buildLocalPostDraftContent` `isWeakPostDraftTitle` `buildPostDraftFromText` `POST_DRAFT_*_PATTERN` | ~320 |
| `utils/format/display.js` | `formatPromptDate` `formatPromptDateTime` `parseBirthdayValue` `getBirthdayCountdown` `formatBillingCycleLabel` | ~75 |
| `utils/format/post.js` | `parsePostTitleAndBody` `getPostTitleAndBody` `isMissingRelationError` | ~55 |

**做法**：保留 `bohai-engine-helpers.js` 作为**barrel（转出口）**，内容变成几十行 `export * from './utils/xxx.js'`。
- 好处：**所有既有 import 点零改动**（`useChatEngine.js` 等 10+ 个消费方不用动），风险降到最低；
- 之后可以逐批把消费方改成直接 import 具体模块，再把 barrel 缩到最小。

> ⚠️ barrel 会略微影响 tree-shaking，但这里是同目录内部模块、且都进同一个 chunk，实际无损失。

### 4.2 L2 · `BOHAIMain.vue`（3179 行）→ 壳 + 12 个子组件

按 template 的天然区块切（区块位置来自代码勘察）：

| 目标组件 | 来源区块 | 估算 |
| --- | --- | --- |
| `BOHAIMain.vue`（壳） | 布局装配 + 三形态（embedded / overlay / standalone）+ 跨组件事件接线 | **< 350** |
| `chat/ChatMessageList.vue` | `chat-container` + 滚动锚定 | ~180 |
| `chat/ChatMessageItem.vue` | 单条消息渲染（含 markdown、思考块、引用 chip 插槽） | ~280 |
| `chat/SearchSourceChips.vue` | 检索来源 chip | ~90 |
| `chat/InlineFollowUp.vue` | 内联追问块 | ~80 |
| `chat/AgentClusterPanel.vue` | 集群进度面板（约 330 行，整块搬） | ~340 |
| `chat/EmptyStateSuggestions.vue` | 空态建议 | ~80 |
| `composer/ComposerArea.vue` | `input-area` 外壳 + 自动增高接线 | ~200 |
| `composer/UsageOrb.vue` | 上下文双环 + 额度浮层 | ~220 |
| `composer/ComposerSettingsMenu.vue` | 模式/强度三行面板 + 二级菜单 | ~260 |
| `composer/SlashCommandMenu.vue` | 斜杠命令（含 `/web /community /cloud /health`） | ~120 |
| `sidebar/SessionListItem.vue` | 从 `BohaiSidebar.vue`(1003) 抽出单条 | ~120 |

**⚠️ 关键约束（有探针守着，别踩）**：
- `probe-bohai-composer.mjs` 的 **22 条**断言锚在 `.composer-panel` / `.usage-orb-wrap` / `.composer-submenu*` 这些类名上
  ⇒ **拆组件时类名不能改名**，否则 22 条一起红（这正是探针该起的作用，但要提前知道成本）。
- 二级菜单**必须挂在面板内部且面板 `overflow: visible`**（挂触发器上会重叠 128px 并拦掉点击）。
- `BohaiSidebar` 的展开按钮是**独立页唯一入口**，`show-open-button` 与 `full-workspace.css` 那条 `display:none` **必须同批改**。

### 4.3 L2 · `BohaiSettingsPanel.vue`（2073 行）→ 壳 + 4 卡

已确认现结构是 **4 卡**（对话偏好 / 记忆与上下文 / 外观 / 用量）+ 折叠高级 + 底部数据行：

```
components/settings/BohaiSettingsPanel.vue   # 壳 + tab + 折叠逻辑（< 300）
components/settings/cards/ConversationPrefsCard.vue
components/settings/cards/MemoryContextCard.vue
components/settings/cards/AppearanceCard.vue
components/settings/cards/UsageCard.vue      # 承接已退役的 AiQuotaSidePanel 口径
```

⚠️ 有 `bohai-settings-panel.test.js` 锁着，卡片边界与 `props` 要按它现有的断言走。

### 4.4 L2 · 3 个 CSS

| 现文件 | 拆成 | 依据 |
| --- | --- | --- |
| `styles/messages.css` (2075) | `messages/bubble.css` · `messages/rich-content.css` · `messages/progress.css` | 气泡 / 富内容（代码块、引用）/ 进度与状态 |
| `styles/adaptive-layout.css` (1959) | `layout/shell.css` · `layout/composer.css` · `layout/breakpoints.css` | 外壳 / 输入区 / 断点覆盖 |
| `styles/shell-header.css` (1030) | 保持，或拆 `header/topbar.css` + `header/overlay.css` | 收益较小，可留到最后 |

**⚠️ 三条硬约束**：
1. **必须保序**：`@import` 的顺序就是层叠顺序，拆完要逐个核对选择器覆盖关系；
2. **不得新增裸色**（`dark-tokens` 2854/2854 已到顶）；**不得新增 `!important`**（1217/1217 已到顶）；
3. 拆分只移动规则，**不合并、不重命名**选择器（重命名会打断 scoped 哈希与探针）。

### 4.5 L3 · `useChatEngine.js`（2696 行）→ 编排壳 + 阶段

**这一步不是纯拆分，是重写成流水线**——因为它同时要接入 Tool Registry 与形态。

现在它一个人做 11 件事（会话状态 / 限流 / 4 条前置捷径 / 集群分支 / 上下文压缩 / 追问改写 / 意图检测 / 并行检索 / prompt 装配与预算 / 模型选择 / 流式与后处理）。

目标：

```
engine/useChatEngine.js            # 只做：接收输入 → 依次跑阶段 → 返回（< 400）
engine/stages/
├─ sessionState.js                 # 会话/消息/草稿状态（原 useMessageManager 部分）
├─ rateLimit.js
├─ shortcutBranches.js             # 树洞 / 发帖草稿 / 页面生成 / MC 资源搜索 四条捷径
├─ contextCompression.js           # 已有独立 composable，改为接入
├─ intent.js                       # 意图检测 + 能力决策
├─ retrieval.js                    # 并行检索（知识 + 联网）→ 改调 Tool Registry
├─ promptAssembly.js               # 结构化 prompt + 预算
├─ modelSelect.js                  # 模式 → 模型
├─ stream.js                       # 真流式 + 退化修复
└─ postProcess.js                  # 心理守门重写 + grounding 降级重试
```

**⚠️ 这里最大的技术风险（必须写清楚）**：这些阶段共享几十个响应式 ref
（`messages` / `isSearching` / `currentContent` / `webSearchResult` …）。
跨文件拆 composable **不是无痛的**——要么层层传参，要么引入一个显式的 `ctx` 对象。

**建议的稳妥做法**：阶段函数**签名统一收成 `(ctx, options)`**，`ctx` 由壳一次构造并透传：

```js
const ctx = { messages, isSearching, sessionIndex, /* … */ };
await runRetrievalStage(ctx, { query, signal });
```

**并且不要一次拆完**：先按"四条前置捷径 → 检索 → prompt 装配"这三个**边界最清晰**的阶段拆，
每个阶段拆完立刻跑全套测试。流式与后处理最后拆（它们交织最深）。

### 4.6 L1/L3 · `useKnowledgeRetrieval.js`（1238 行）→ connector 注册表

现在 8+1 个 connector（cloud / sharedMemory / knowledge / siteGuide / forum / userPrivate / health / siteActivities）硬编码在 `createReadConnectors` 里。

目标：**一个 connector 一个文件**，主文件只做注册与编排。

```
tools/retrieval/
├─ index.js            # 注册表（< 120）
├─ cloud.js            # 每个 80–200 行
├─ shared-memory.js
├─ knowledge.js
├─ site-guide.js
├─ forum.js
├─ user-private.js
├─ health.js
└─ site-activities.js
```

这**正好就是 Tool Registry 的第一批实现**（详见 docs 那份方案的 §5），所以这一步同时完成"拆文件"与"架构升级"。

⚠️ 有 `bohai-agent-cluster-sources.test.js` 等测试锁着 connector 的注册一致性，拆完要跑。

---

## 5. 执行顺序（每步独立可交付、可回滚）

| 步 | 做什么 | 验证 | 风险 |
| --- | --- | --- | --- |
| **1** | **L1：拆 `bohai-engine-helpers.js` → 14 模块 + barrel** | 相关 10+ 测试 + `npm run verify` | 极低 |
| **2** | **L1：拆 `useKnowledgeRetrieval.js` → 9 个 connector 文件** | `bohai-*-sources` / `bohai-connectors` 等测试 | 低 |
| **3** | L2：拆 3 个 CSS | 全部探针（CSS 影响面广）+ verify（两道棘轮） | 中 |
| **4** | L2：拆 `BOHAIMain.vue` → 壳 + 12 组件 | `probe-bohai-composer`(22) / `probe-ai-island-rail` / `probe-aichat-landscape-rail` | 中 |
| **5** | L2：拆 `BohaiSettingsPanel.vue` → 壳 + 4 卡 | `bohai-settings-panel.test.js` + `probe-ai-panels` | 中 |
| **6** | **L3：`useChatEngine.js` 重写为阶段化**（分 3 小步：捷径 → 检索 → 装配；流式与后处理最后） | 全部 BOHAI 测试 + 7 探针 | 高 |
| **7** | 收尾：新增模块的探针补充 + `check-project-structure` 超大文件 WARN 归零 | `npm run verify:full` | 低 |

**第 1 步为什么排第一**：它是**零风险**的（纯函数 + 有 barrel 兜住 import 点），
却能把 1682 行的最大"杂物抽屉"消掉，同时验证"拆 → 跑测试 → 提交"这条流水在 BOHAI 里跑得通。

**第 6 步为什么必须最后**：它依赖前面所有拆分完成（否则会同时改一个 2696 行的文件 + 一个 3179 行的文件，冲突无解）。

---

## 6. 每一步的验证清单（固定套路）

```bash
# 1) 相关单测
./node_modules/.bin/vitest run tests/unit/bohai-*.test.js --pool=forks

# 2) 相关探针（CSS / UI 改动必跑）
node scripts/probes/probe-bohai-composer.mjs
node scripts/probes/probe-ai-panels.mjs

# 3) 全量门禁（落盘，别管道给 head —— 会 SIGPIPE 提前退出）
npm run verify > /tmp/verify.log 2>&1; echo EXIT=$?

# 4) 报告绿必须同时报「警告条数」（当前 118）
grep -E "problems|Test Files|Tests " /tmp/verify.log
```

**判绿三件套**：`EXIT=0` + lint 警告数**不高于 118** + 超大文件 WARN 数**下降**。

---

## 7. 需要用户拍板的四件事

1. **接受"L1/L2 拆、L3 重写"这个分层吗？** （即不推倒重写全部 —— 理由见 §0）
2. **`bohai-engine-helpers.js` 用 barrel 过渡，还是直接改所有 import 点？**
   （barrel 更安全但多一层；直接改更干净但要动 10+ 个文件）
3. **拆 CSS 要不要做？** 收益是消掉 2 个超阈值 WARN，代价是层叠顺序要逐条核。也可以只拆 JS/Vue、CSS 留着。
4. **`useChatEngine.js` 的阶段拆分，接受"分 3 小步、每步单独验证"的节奏吗？**

---

## 8. 与其它文档的关系

| 文档 | 关系 |
| --- | --- |
| `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md` | **做什么**（形态、Chat/Work、插件选型、路线图 P0/P1/P2）。本文是它的**工程实现路径** |
| `AGENTS.md` | 改动 → 必跑门禁的对照表（本文 §6 是它的 BOHAI 专用版） |
| `docs/未完成任务清单.md` | BOHAI 相关的在途事项（输入区改版、plans/023/024 的收尾）**应先清完再做本方案**，否则会撞车 |
| `plans/023-bohai-ui-redraw.md` / `plans/024-bohai-rules-and-latency-slimming.md` | 它们的遗留项（约 35 处死 CSS、P2-1 消融验证）与本方案的拆 CSS / 拆引擎**有重叠**，需合并排期 |
