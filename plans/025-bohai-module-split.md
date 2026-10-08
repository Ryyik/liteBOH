# plans/025 — BOHAI 全量重写（2026-10-06）

> **触发**：用户拍板对 BOH AI 模块做**全量重写**，推翻本文件 v1（2026-10-05「模块拆分与引擎重写」）的
> **「只拆不重写」**前提。
>
> **前置阅读**：
> - `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md` —— **做什么**（产品形态、Chat/Work、Tool Registry、P0/P1/P2）。
> - `docs/DESIGN-BOHAI.md` —— **长什么样**（令牌、断点、布局矩阵、组件树、两层模式体系）。本文是**怎么改**（工程）。
> - `output/boh-ui-demo/index.html` —— 已验收的 UI 预览件（**本地预览，`output/` 已 gitignore，不入库**）。
>   它是视觉与交互规格的**事实基准**；`docs/DESIGN-BOHAI.md` 已把它的全部数值自含抄录，后续不依赖该文件。
>
> **版本说明**：本文是 **v2**，**原地改写** v1（不新建文件，单一真源）。v1 的「L1/L2 拆、L3 重写」分层
> 与「44 份验证资产会作废」的顾虑**已作废**；v1 中仍然有效的部分（现状量化口径、并行会话禁令、
> 显式路径提交、单步提交）已在本文保留并更新。

---

## 0. 前提反转：为什么从「只拆不重写」改成「全量重写」

### 0.1 v1 的立场与它的理由（已作废，但理由值得记住）

v1 认为：**拆文件**和**重写**是两件事，风险差一个数量级；BOHAI 被 **37 个测试文件 + 7 个探针**锁着行为，
「推倒重写 = 把这 44 份验证资产全部作废，而且重写过程中没人能告诉你『原来为什么要这么写』」。
据此 v1 给出「L1 纯函数只拆不重写 / L2 组件样式只拆 / L3 巨型 composable 拆+重写」。

### 0.2 拍板反转：用户选择全量重写

用户明确拍板**全量重写**，并给出**让它安全的前提**。反转成立的关键在于 v1 漏看了一件事：

> **这 44 份验证资产不是「重写时会作废的包袱」，而是「重写后必须照样绿的验收规格」。**

- **测试即规格**：37 个测试 + 7 个探针锁的恰恰是最贵的经验（见 §1.3）。重写**不删这些资产**——
  允许改 import 路径、允许探针随新 DOM 同批重写，但**断言数只增不减**、语义一条不丢。
  ⇒ 重写不是「作废回归判据」，而是「**换实现、保规格**」，回归判据**照旧生效**。
- **领域知识以数据形式移植**：9 类正则、`POST_DRAFT_*` 模式、心理访谈封闭域、Tavily 降级链、
  证据前缀 `T/S/K/G/F`、延迟两条 P0、退化输出守卫 —— 这些是**领域数据**，不是实现细节。
  重写时**原样搬运为常量/表**，**禁止重新发明**（重新发明 = 用新 bug 替换旧经验）。

### 0.3 重写边界（**硬边界**）

| 范围 | 文件数 | 行数 | 处置 |
| --- | --- | --- | --- |
| `agents/` + `expert-roles/` + `engine/` | **22** | **4,032** | **不动**（`agents/` 已是良好模块化；`engine/` 已有 auto-router / auto-decision，**不是新概念**） |
| 其余 BOHAI 代码 | **36** | **23,446** | **重写范围** |

> 结论：`agents/` + `expert-roles/` + `engine/` 三层共 **22 文件 / 4,032 行**；重写范围 = 其余 **36 文件 / 23,446 行**。
> 判据：`find src/views/BOHAI/{agents,expert-roles,engine} -type f | wc -l`（→22）、
> `… -print0 | xargs -0 wc -l | tail -1`（→4032）；BOHAI 全目录 58 文件 / 27,478 行（§1.1）。
> （2026-10-06 实测；58 − 22 = 36，27,478 − 4,032 = 23,446）

### 0.4 一句话总原则

> **重写实现，不重写规格。** 规格 = 44 份验证资产（可执行）+ 领域数据（原样移植）。

---

## 1. 现状量化（实测账本 · 2026-10-06）

> 本节每条量化结论按 `docs/报告模板.md` 的**三件套**给出：**结论 / 判据（可重跑命令）/ 实测日期**。
> 与提示词或 v1 不符处，**以本节实测为准**并显式标注冲突。

### 1.1 规模

| 项 | 数值 | 判据 |
| --- | --- | --- |
| BOHAI 目录文件数 | **58** | `find src/views/BOHAI -type f \( -name '*.vue' -o -name '*.js' -o -name '*.ts' -o -name '*.css' \) \| wc -l` |
| BOHAI 目录总行数 | **27,478** | 同上 + `-print0 \| xargs -0 wc -l \| tail -1` |
| `bohai-engine-helpers.js` | **1,682 行 / 92 个导出名 / 零 Vue 依赖** | `wc -l …`；`grep -c "^export" …` |
| 其消费方 | **11 个**（`src/` 内） | `grep -rl "bohai-engine-helpers" src/ \| wc -l`（含 `tests/` 共 15） |

> （2026-10-06 实测）

### 1.2 超阈值文件与「WARN 归零不可达」

**门禁阈值**（`scripts/check-project-structure.mjs:26-31`）：`.css` = 2,000 行，`.js`/`.ts`/`.vue` = 2,500 行；
超阈值是 **WARN 不是 error**。

**关键缺陷（本方案的目标据此改写）**：`scripts/check-project-structure.mjs:235` 有 **`sourceFiles.slice(0, 20)`**
—— 超大文件 WARN **只扫全仓 top-20**。

> 结论：`messages.css` **2,075 行**（> 2,000 阈值）但**全仓排名第 22**，因此**永远不被报告**。
> 判据：`node -e` 全仓 `src/**/*.{vue,js,ts,css}` 按行数降序，看 `messages.css` 的排名（→ 第 22）。
> （2026-10-06 实测）

> 结论：全仓超阈值文件 **19 个**，其中 **16 个在 BOHAI 目录外**。
> ⇒ **「WARN 归零」不可达**（要动 BOHAI 之外的 16 个文件），本方案的目标改为
> **「BOHAI 文件掉出 top-20」**。门禁改 `filter` 是**另一个独立任务**，不混入本方案。
> 判据：`node -e` 全仓按 `LARGE_FILE_LINE_LIMITS`（`.css` 2000 / 其余 2500）过滤计数。
> （2026-10-06 实测；⚠️ **冲突标注**：提示词记「18 个超大文件」，实测为 **19**；
> 差异 1 个疑与并行会话写入有关（见 §2 红线 7），以实测为准）

**BOHAI 内的超阈值文件与排名**（重写的靶子）：

| 文件 | 行数 | 阈值 | 全仓排名 | 是否被报 |
| --- | --- | --- | --- | --- |
| `BOHAI/BOHAI/BOHAIMain.vue` | **3,179** | 2500 | #8 | ✅ 被报 |
| `composables/useChatEngine.js` | **2,696** | 2500 | #15 | ✅ 被报 |
| `BOHAI/BOHAI/styles/messages.css` | **2,075** | 2000 | **#22** | ❌ **永不被报** |

**其余大文件**（未超阈值但改动频繁，仍作拆分靶子）：

| 文件 | 行数 |
| --- | --- |
| `BOHAI/BOHAI/components/BohaiSettingsPanel.vue` | **2,073** |
| `BOHAI/BOHAI/styles/adaptive-layout.css` | **1,959** |
| `composables/bohai-engine-helpers.js` | **1,682** |
| `composables/useKnowledgeRetrieval.js` | **1,238** |
| `BOHAI/BOHAI/styles/shell-header.css` | 1,030 |
| `BOHAI/BOHAI/components/BohaiSidebar.vue` | 1,003 |

> 判据：`wc -l <上面 8 个路径>`。（2026-10-06 实测）

### 1.3 验证资产（**可执行规格**）

| 资产 | 数量 | 判据 |
| --- | --- | --- |
| BOHAI 测试文件 | **37** | `grep -ril bohai tests/ \| wc -l` |
| BOHAI 探针 | **7** | `scripts/probes/` 下：`probe-bohai-composer` / `probe-bohai-mode-loading` / `probe-lab-bohai-mode-chat` / `probe-ai-panels` / `probe-ai-island-rail` / `probe-aichat-landscape-rail` / `probe-ai-billing-config` |
| 全仓测试文件 | 148 | `ls tests/unit/ \| grep -cE "\.test\.(js\|ts)$"` |

**37 个测试按「重写期是否要改」分三类**（口径：测试对被测模块的引用方式）：

| 类别 | 数量（约） | 重写期动作 | 判据 |
| --- | --- | --- | --- |
| **直连 import** 被测模块 | 约 15 | 改 import 路径即绿（模块搬迁不改行为） | `grep -rlE "from '.*BOHAI/" tests/unit/` |
| **源码文本守卫**（走 `tests/helpers/source.js`） | 16 | 源码变了就得改断言（**重写期的移植清单**） | `grep -rl "helpers/source" tests/unit/ \| wc -l` |
| `agents/` / `expert-roles/` 相关 | 7 | **零改动**（这两层不动） | — |

> ⚠️ 上表「约 15 / 16 / 7」为**账本口径（估计，非精确分类）**，合计与 37 有 ±1 出入；
> **唯一硬判据是「37」**（`grep -ril bohai tests/`）。重写前请以工作树重新分类一次。
> （2026-10-06 实测）

**全仓测试规模（落盘日实测）**：`npm run test` = **162 文件 / 2,361 passed / 1 skipped**。
⚠️ `AGENTS.md:199` 记的「130 文件 / 2,150 断言」是**旧口径**（已漂移；提示词亦沿用 2,150）——
本方案**以落盘日实测值为基线**，重写后 BOHAI 相关断言数**只增不减**，Step 7 核算。
判据：`npm run test` 输出末尾的 `Test Files` / `Tests` 行。（2026-10-06 实测）

**37 个测试锁定的「最贵经验」示例**（重写时逐条对照，不许丢）：

- `bohai-auto-router.test.js` 锁「9 类正则已无活消费方但不可误删」；
- `psych-interview-engine.test.js` / `psych-guard-rewrite.test.js` 锁心理访谈**封闭域**（不检索、不写记忆）；
- `bohai-latency-guards.test.js` 锁首字延迟两个 P0（少一次 LLM 往返 + 陈旧证据注入）；
- `probe-bohai-composer.mjs` **22 条**锁输入区三形态几何（⚠️ **现状 22 条全在桌面档**，见 §4 Step 6）。

### 1.4 技术债与漂移（重写要一并收敛的）

| 项 | 现状 | 判据 |
| --- | --- | --- |
| 断点值 | BOHAI 目录内 **10 条不同 `@media` 条件**（其中 **8 个不同像素断点值**：560 / 600 / 640 / 767 / 768 / 1023 / 1024 / 1440），且 **767 与 768 并存漂移** | `grep -rhoE "@media[^{]*" src/views/BOHAI/ \| sort -u` |
| `.bohai-page` 高度**双源** | `adaptive-layout.css:21` 与 `shell-header.css:28` **各写一份** `height: calc(100dvh - var(--kb-inset, 0px))` | `grep -rn "100dvh - var(--kb-inset" src/views/BOHAI/` |
| 死形态残留 | `embedded-mode` / `overlay-mode`（独立页 + AI 岛两形态下已不可达） | `grep -rn "embedded-mode" src/views/BOHAI/` |
| 横屏左栏断点**手工同步 4 处** | `UserSpace/styles/{landscape-rail,shell-community}.css` + `UserSpace/components/{side-rail,bottom-nav}.css` | `grep -rln "1024px" src/views/user-center/UserSpace/` |
| `--bohai-sidebar-left` 杠杆 | `BohaiSidebar.vue:925`（`left: var(--bohai-sidebar-left, 0px) !important`）由 `landscape-rail.css:356` 置位 | `grep -rn "bohai-sidebar-left" src/` |
| 模式注释与库不一致 | `chat-engine-config.js:511-518` 注释仍是 **2026-06-08 口径**（Fast/Pro/Plan/Agent），与线上 `bohai_model_configs` 不一致 | 读 `chat-engine-config.js:505-520` |

> 全部 2026-10-06 实测。

### 1.5 棘轮现状（重写只许降不许升）

| 棘轮 | 现值 | 真源 |
| --- | --- | --- |
| **lint 警告** | **118** | `package.json:18`（`--max-warnings 118`）⚠️ `AGENTS.md` 里写的 **183 已过时**，本次顺手更正 |
| `!important` | **1,217**（BOHAI 名下 **约 497**：`adaptive-layout` 267 + `BohaiSidebar` 157 + `SettingsPanel` 56 + `motion-system` 10 + `full-workspace` 5 + `shell-header` 2） | `scripts/important-budget.json` |
| 暗色裸值 | **2,854** | `scripts/dark-token-budget.json` |

> 判据：`sed -n '18p' package.json`；`node -e "console.log(require('./scripts/important-budget.json').total)"`；
> 同法读 `dark-token-budget.json`。（2026-10-06 实测）
> ⚠️ `!important` 另有一处**在 BOHAI 目录之外**：`src/components/UnifiedNavbar/BOHAIIsland.vue` **73** 处
> —— 计入 BOHAI 名下清理清单时不要漏（`important-budget.json` 的 `files` 键里能查到）。

---

## 2. 红线（重写时绝对不能碰的）

| # | 红线 | 来源 / 理由 |
| --- | --- | --- |
| 1 | **`agents/` + `expert-roles/` + `engine/` 三层不动**（22 文件 / 4,032 行） | `agents/` 已是良好模块化（每个 100–300 行），是 Work 形态的现成底座；`engine/` 已有 auto-router / auto-decision，**不是新概念** |
| 2 | **测试即规格**：37 测试 + 7 探针重写后必须照样绿；允许改 import 路径、允许探针随新 DOM 同批重写，但**断言数只增不减**、语义一条不丢 | §0.2 |
| 3 | **领域知识以数据形式原样移植**，禁止重新发明（9 类正则、`POST_DRAFT_*`、心理访谈封闭域、Tavily 降级链、证据前缀 `T/S/K/G/F`、延迟两条 P0、退化输出守卫） | §0.2 |
| 4 | **不引任何新运行时依赖**：无 React / Tailwind / Radix；字体用系统栈，不引 Web 字体（大陆可达性） | 视觉/技术栈硬约束 |
| 5 | **`BOHAI_CONNECTOR_IDS` 与 `createBohAIConnector` 工厂在全局 `src/utils/bohai-connectors.js:16`，不搬不复制** | 单一真源：搬进 BOHAI 内部会产生第二份 |
| 6 | **`--liquid-*` 全局变量一字不动，BOHAI 不再消费**；暗色真源是 `theme-manager.js`（BOHAI 挂 `data-boh-theme`） | 玻璃/主题单一真源 |
| 7 | **重写期间 BOHAI 目录不能有并行会话在写** | 本仓已有多次「文件凭空消失」的教训（skill `parallel-session-stash-recovery`） |
| 8 | **提交只给明确路径，永不 `git add -A`** | 工作区长期有并行改动的脏文件（本次任务实测：`useAvatarFrame.js` / `main.js` / `UserSpaceMain.vue` 等有他人在改） |
| 9 | **每步单独 commit + 单独验证**，不攒一大坨 | 出错要能单步回滚 |
| 10 | **动态 import 的组件必须带 `onError` retry** | 否则 chunk 404 = 无声空白（复用 `vite-preload-recovery.js`） |
| 11 | **CSS 是「删」不是「拆」**（v1 的「CSS 保序」红线**删除**） | 旧 DOM 一起死、旧 CSS 直接删；新组件配新 CSS，无需保序 |

> ⚠️ **v1 红线变更说明**：v1 红线 3「CSS 拆分必须保序」**已删**。理由：全量重写下**旧 CSS 是整体删除**，
> 不是把规则搬到新文件再保层叠顺序；新 UI 树配新样式，不存在「拆完要逐条核对覆盖关系」。
> v1 红线 1/2/4/5/6/7/8/9 保留（已并入上表）。

---

## 3. 目标结构

> **两条与 v1 的关键差别**：① `engine/` **已存在**（不是本方案新引入的概念），重写后其壳 `< 400 行` 迁入；
> ② **新增 `domain/`**（领域数据沉淀层，见 §4 Step 2）。**全局 `bohai-*` 不搬**（红线 5）。

```
src/views/BOHAI/
├─ BOHAI/                          # 页面层（薄壳 + 组件）—— 全部 Boh* 新命名
│  ├─ BOHAIMain.vue                # 目标 < 400 行：只做布局装配 + 形态切换
│  ├─ components/
│  │  ├─ BohChatStream.vue         # 消息流（BohChatMessage / BohSearchChips / BohInlineFollowUp）
│  │  ├─ BohComposer.vue           # 输入区（BohUsageOrb / BohModeMenu / BohSlashMenu）
│  │  ├─ BohSidebar.vue            # 会话侧栏壳（BohSessionItem / BohSurfaceSwitcher）
│  │  ├─ BohWorkPanel.vue          # Work 面板（产物 / 来源 / 集群进度）
│  │  └─ settings/BohSettingsPanel.vue + cards/Boh*Card.vue
│  └─ styles/                      # 新样式；旧 3 个 CSS 整体删，不拆不保序
│     └─ layout.css                # ★ 断点唯一真源（4+1 全落此文件）
│
├─ domain/                         # ★ 新增：领域数据沉淀（常量 / 正则 / 模式 → 单一真源）
│  ├─ routing-patterns.js          # 9 类正则（含「间接存活」6 类，见 plans/024）
│  ├─ post-draft.js                # POST_DRAFT_* 模式 + 本地草稿构建
│  ├─ evidence.js                  # 证据前缀 T/S/K/G/F + 权重
│  ├─ psych-interview.js           # 心理访谈封闭域
│  └─ degenerate-guard.js          # 退化输出守卫 + 延迟两条 P0 相关常量
│
├─ engine/                         # 编排层（纯逻辑，无 UI）—— 已存在；重写后壳迁入
│  ├─ useChatEngine.ts             # 目标 < 400 行：只做流程编排
│  └─ stages/                      # 见 §4 Step 5
│
├─ tools/                          # ★ Tool Registry（形态的能力来源）
│  ├─ registry.ts                  # 注册表
│  ├─ types.ts
│  ├─ retrieval/                   # 8 个 read connector 一文件 + index
│  ├─ web/                         # 搜索（Tavily→free 降级链）+ 网页深读
│  ├─ generator/                   # docx / pptx / xlsx（Work）
│  └─ action/                      # 写动作（createPost / saveSharedMemory / createPage）
│
├─ surfaces/                       # ★ 形态定义
│  ├─ chat.ts
│  └─ work.ts
│
├─ agents/                         # 不动
├─ expert-roles/                   # 不动
└─ utils/                          # L1 拆分落点（旧 bohai-engine-helpers.js 先做临时 barrel 保绿）
```

**技术栈**：全量 TS —— 纯逻辑层（`engine/` `stages/` `tools/` `domain/`）**必须 `.ts`**；
SFC 可 `lang="ts"`（⚠️ **全仓首例**，`vue-tsc` 已在 `verify` 链内，先小范围试点再铺开）。

> ⚠️ **命名冲突提醒**：BOHAI 内部已有 `utils/`，全局有 `src/utils/`。
> import 时 `../utils/xxx` 与 `@/utils/xxx` 极易看错。约定：BOHAI 内部一律用**相对路径**，
> 并在 `src/views/BOHAI/utils/index.js` 顶部注明「BOHAI 私有工具，不是 `@/utils`」。

---

## 4. 执行章（七步，每步独立可交付、可回滚）

> **为什么 Step 0 排第一**：重写是「**保规格换实现**」，在途项是「**改规格**」。两者混做**无法归因**
> （回归红了分不清是新实现错还是旧改动没收尾）。所以**先把在途项了结**。

| Step | 做什么 | 验证 | 风险 |
| --- | --- | --- | --- |
| **0** | **清场**：了结 `docs/未完成任务清单.md` 的 BOHAI 在途项 | 见下「Step 0 清单」 | 低 |
| **1** | `docs/DESIGN-BOHAI.md` 落盘 + `--boh-*` 令牌落地 | **零行为变更**：`verify` 绿 + 探针全绿（不改 DOM） | 极低 |
| **2** | **domain 数据沉淀**：常量/正则/模式 → 单一真源，测试改 import 跟进 | 相关单测（改 import 即绿） | 低 |
| **3** | **utils 归位**：92 个导出分模块；旧 `bohai-engine-helpers.js` 先做**临时 barrel** 保绿 | 10+ 相关单测 + `verify` | 极低 |
| **4** | **tools / Tool Registry**：8 个 read connector 一文件 + registry | `bohai-*-sources` / `bohai-connectors` 等测试 | 低 |
| **5** | **engine 重写**（strangler in place，分 3 小步） | 全量 BOHAI 测试**每小步**绿 | **高** |
| **6** | **新 UI 树逐块替换**（壳→侧栏→消息流→输入区→Work 面板） | 每块：新探针 + 旧探针同批改 | 中 |
| **7** | **收尾**：行数阈值收紧 + 断言核算 + `!important` 归零 | `verify` + 探针 | 低 |

### Step 0 — 清场（**先了结在途项，再重写**）

| # | 在途项 | 处置 |
| --- | --- | --- |
| 0-1 | 输入区 AI 岛形态验收（`docs/未完成任务清单.md` §1 第 2 项「三形态验收」，AI 岛未验） | 人工验收或明确降级 |
| 0-2 | `plans/023` 人工验收（步骤 ⑤ 人眼看两形态） | 验收或标注不做 |
| 0-3 | `plans/024` 剩余 4 项验收（§6，尤其 P2-1 消融验证） | 验收或标注不做 |
| 0-4 | `multi-agent-cluster` stash 去留（`docs/未完成任务清单.md` §0 的 `stash@{1}`） | 明确并入/丢弃 |

> 清场结论写回 `docs/未完成任务清单.md`（活文档，原地更新）。

### Step 1 — DESIGN-BOHAI + 令牌落地（零行为变更）

- 产出 `docs/DESIGN-BOHAI.md`（本次同批交付）。
- 落地 `--boh-*` 令牌（灰度 12 档 + 语义别名 + 暗色映射），**只新增令牌，不接组件**。
- 判绿：`verify` 绿、探针全绿（**DOM 未变**，探针不该有任何变化）。

### Step 2 — domain 数据沉淀（**原样移植，禁止重新发明**）

- 把 9 类正则、`POST_DRAFT_*`、心理访谈封闭域、Tavily 降级链、证据前缀、退化守卫、
  延迟两条 P0 的常量**从现文件搬进 `domain/`**（值**逐字不变**）。
- 消费方改 import；**源码文本守卫类测试**（16 个，§1.3）随新路径/新符号同批改断言。
- ⚠️ 9 类正则里 **6 类「间接存活」不可删**（`community` / `question` / `memoryQuery` / `memoryShare` /
  `professionalHealth` / `personalSupport`，见 `plans/024` §9）—— 删前用 **Grep 工具**确认消费方。

### Step 3 — utils 归位（92 个导出，含 23 个原表漏网）

`bohai-engine-helpers.js`（1,682 行 / **92 个导出**）按职责分模块。v1 的 14 模块表只收编 **69** 个，
**漏网 23 个**，必须补齐以下五组（**这是 v1 的实质缺陷，勿照 v1 执行**）：

| 组 | 漏网导出（23 个） |
| --- | --- |
| **context-budget** | `AGENT_CONTEXT_BUDGETS` · `CONTEXT_BUDGET_DEFAULTS` · `CONTEXT_CATEGORIES` · `createContextBudgetTracker` · `buildAgentContext` |
| **structured-memory** | `STRUCTURED_MEMORY_TYPES` · `buildStructuredMemoryBlock` · `extractStructuredMemories` |
| **degenerate-guard** | `INTERNAL_PROGRESS_LINE_PATTERNS` · `GENERATION_STALL_TIMEOUT_MS` · `hasEscapedLineBreakFlood` · `isDegenerateAssistantReply` · `isDegenerateStreamOutput` · `normalizeEscapedLineBreaks` · `cleanAssistantVisibleReply` |
| **page-context** | `MAX_PAGE_CONTEXT_CHARS` · `buildPageContextBlock` · `buildPageDraftFromText` · `hasPostDraftUserIdea` |
| **generation-profile** | `getGenerationProfile` · `compactMessages` · `normalizeCompactText` · `compressKnowledgeContextBlocks` |

> **做法**：保留 `bohai-engine-helpers.js` 作为**临时 barrel**（`export * from './utils/xxx'`），
> **所有既有 import 点零改动**；消费方重写时改直连，**最后删 barrel**。
> 判据（导出名清单）：`grep -c "^export" src/views/BOHAI/composables/bohai-engine-helpers.js`（→92）。
> （2026-10-06 实测）

### Step 4 — tools / Tool Registry

- 8 个 read connector **一文件一个** + `registry.ts`；主文件只做注册与编排。
- **全局真源不搬**（红线 5）：`BOHAI_CONNECTOR_IDS` 与 `createBohAIConnector` 工厂留在
  `src/utils/bohai-connectors.js:16`；新 registry 引用它，不复制。
- `generator/`（docx/pptx/xlsx）与 `action/` 按 `docs/2026-10-05-…` §5 的形状接入。

### Step 5 — engine 重写（strangler in place，分 3 小步）

> **手法**：新 `stages/` **逐段替换** `useChatEngine.js` 的对应逻辑，**公开签名保持兼容**，
> **每一小步后全量 BOHAI 测试必须绿**；完成后把壳（`< 400 行`）迁入 `engine/`。

| 小步 | 内容 | 顺序理由 |
| --- | --- | --- |
| 5-1 | **捷径**（树洞 / 发帖草稿 / 页面生成 / MC 资源搜索 四条前置捷径） | 边界最清晰 |
| 5-2 | **检索**（并行知识 + 联网 → 改调 Tool Registry） | 边界次清晰 |
| 5-3 | **装配 + 流式 + 后处理**（prompt 装配与预算 / 真流式 / 退化修复 / 心理守门重写 / grounding 降级重试） | 交织最深，**放最后** |

**技术风险（必须写清楚）**：这些阶段共享几十个响应式 ref
（`messages` / `isSearching` / `currentContent` / `webSearchResult` …）。跨文件拆 composable
**不是无痛的** —— 阶段函数**签名统一收成 `(ctx, options)`**，`ctx` 由壳一次构造并透传：

```ts
const ctx = { messages, isSearching, sessionIndex /* … */ };
await runRetrievalStage(ctx, { query, signal });
```

> ⚠️ **流式与后处理最后拆**（交织最深）；不要一次拆完。

### Step 6 — 新 UI 树逐块替换（**每块一个提交**）

**每块的动作 = 新组件 + 新样式 + 新探针 + 旧组件/旧样式/旧探针同批删。**

> ✅ **2026-10-08 全部完成**（用户口径「必须一次做完」）。落地清单见本节末尾「Step 6 完成记录」。

| 块 | 内容 | 随块重写的探针 |
| --- | --- | --- |
| 6-1 壳 | `BOHAIMain.vue` 布局装配 + 形态切换 | `probe-aichat-landscape-rail`（14） |
| 6-2 侧栏 | `BohSidebar` + 会话侧栏 Teleport 抽屉 + `--bohai-sidebar-left` 杠杆 | `probe-ai-island-rail` |
| 6-3 消息流 | `BohChatStream` + 消息项 + 来源 chip + 内联追问 | `probe-ai-panels` |
| 6-4 输入区 | `BohComposer` + 用量圆钮 + 模式/强度菜单 + 斜杠菜单 | **`probe-bohai-composer`（三档重写，见下）** |
| 6-5 Work 面板 | `BohWorkPanel`（产物 / 来源 / 集群进度） | 新增探针 |

> **`probe-bohai-composer` 必须按三档视口重写**：**1440×900 / 390×844 / 844×390**。
> ⚠️ 现状 **22 条全在桌面档**，**竖屏与矮横屏零覆盖** —— 这是必须补的缺口（§7 探针重建计划）。
>
> **类名纪律**（「不允许重命名」的准确含义）：**旧类名不做迁移**（旧 DOM 一起死、旧 CSS 直接删不拆），
> **新组件用 `Boh*` 前缀新名**，**探针落成后名字冻结**。

#### Step 6 完成记录（2026-10-08）

**新增（`src/views/BOHAI/BOHAI/`）**

| 文件 | 作用 |
| --- | --- |
| `styles/layout.css` | 壳级布局（`.bohai-page` / `.boh-shell` / `.boh-main` / `.boh-topbar` / `.boh-backdrop`）+ 壳级断点 |
| `components/BohLogo.vue` | 方块之家母题（2×2 圆角方），三档尺寸 |
| `components/BohSidebar.vue` + `styles/boh-sidebar.css` | 会话侧栏（Teleport 抽屉 / 静态列）+ **形态切换器** + 底部今日额度 |
| `components/BohChatStream.vue` + `styles/boh-stream.css` | 消息流（气泡 / AI 头 / 检索状态 / 任务面板 / 来源 chip / 内联追问 / 跳转导航） |
| `components/BohComposer.vue` + `styles/boh-composer.css` | 输入区（用量圆钮 + 浮层 / 模式·强度胶囊 + 单层面板 / 斜杠菜单 / 圆形发送） |
| `components/BohWorkPanel.vue` + `styles/boh-work.css` | Work 面板（产物 / 检索来源 / 集群进度），仅 ≥1024×600 挂载 |
| `components/boh-markdown.js` | `renderMarkdown`（marked + hljs + DOMPurify）从壳原样迁出 |
| `components/boh-sources.js` | 来源 chip 的**证据前缀**真源（消息流与 Work 面板共用） |

**删除**：`styles/{messages,adaptive-layout,shell-header,full-workspace,motion-system}.css`、
`components/BohaiSidebar.vue`（合计约 **6,400 行**）；
`BOHAIIsland.vue` 里指向旧类名的 **约 250 行 `:global()` 覆盖**（含 40+ 个 `!important`）。

**行为变更（3 条，均经用户拍板）**
1. **思考圆点按旧版口径保留**（2026-10-08）——不换成 Demo 的三点打字动画；
2. 独立页**恢复顶栏**（侧栏展开入口 + 会话名 + 工作台开关），侧栏自己的 `sidebar-open-btn` 删除；
3. 新增**大模式 = 形态**（Chat / Work）与 Work 面板；形态存 `localStorage.boh_ai_surface_v1`。

**自证**：`npm run verify` **EXIT=0**（180 文件 / **2490 passed** / 1 skipped；lint **116/116**；
`important-budget 701/701`（↓512）、`dark-tokens 2785/2785`（↓69）、`layering 164/164`）；
`check:gates-self-test` 11/11 通过；
探针 **`probe-bohai-shell` 25/25**、**`probe-bohai-composer` 30/30（三档）**、
`probe-aichat-landscape-rail` 14/14、`probe-ai-panels` 通过、`probe-ai-island-rail` 7/7、
`probe-bohai-mode-loading` 6/6。

**遗留（属 Step 7）**：`BOHAIMain.vue` 仍是 **2,134 行**（模板已薄到 ~250 行，`<script setup>` 的
210 条顶层声明未动）⇒ 「组件 < 400 行」阈值**未达**，须在 Step 7 把状态/接线抽成
`composables/useBohShell.js` 后再收紧阈值。另 `BohChatStream.vue`（474）/ `BohComposer.vue`（494）
也略高于 400 行阈值。`src/styles/themes/bohai-dark.css`（908 行）已基本成为死 CSS
（新组件走 `--boh-*` 令牌），待 Step 7 一并清理。

### Step 7 — 收尾

| # | 事项 | 判据 |
| --- | --- | --- |
| 7-1 | BOHAI 目录行数阈值收紧（**组件 400 / 模块 500**）并入 `check-project-structure` | 门禁绿 |
| 7-2 | **断言总数核算 ≥ 落盘日实测**（162 文件 / 2,361 passed） | `npm run test` 输出 |
| 7-3 | **BOHAI 名下 `!important` 归零**并下调棘轮基线 | `scripts/important-budget.json`（BOHAI 名下现值约 497 + `BOHAIIsland.vue` 73） |
| 7-4 | BOHAI 文件**掉出全仓 top-20**（见 §1.2，不追求 WARN 归零） | 全仓行数降序排名 |

---

## 5. 验证清单（每一步的固定套路）

```bash
# 1) 相关单测
./node_modules/.bin/vitest run tests/unit/bohai-*.test.js --pool=forks

# 2) 相关探针（CSS / UI 改动必跑）
node scripts/probes/probe-bohai-composer.mjs
node scripts/probes/probe-ai-panels.mjs

# 3) 全量门禁（落盘，别管道给 head —— 会 SIGPIPE 提前退出）
npm run verify > /tmp/verify.log 2>&1; echo EXIT=$?

# 4) 报绿必须同时报「警告条数」（当前 118）
grep -E "problems|Test Files|Tests " /tmp/verify.log
```

**判绿三件套**：`EXIT=0` + lint 警告数**不高于 118** + **断言总数 ≥ 落盘日实测（2,361 passed；BOHAI 相关只增不减）**。

**反证纪律**（重写期尤其重要）：改完一处行为，**就地改回旧写法 → 断言必须 FAIL 且现象与报障一致 → 恢复**。
（不要用 `git stash` 回退，见 skill `parallel-session-stash-recovery`。）

---

## 6. 与其它文档的关系

| 文档 | 关系 |
| --- | --- |
| `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md` | **做什么**（形态、Chat/Work、插件选型、路线图 P0/P1/P2）。本文是它的**工程实现路径**；`docs/DESIGN-BOHAI.md` 是它的**视觉/交互规格**。 |
| **⚠️ companion §5.3 能力公式修订声明** | companion 文档 §5.3 原公式 **漏了 `action`、没提编码**。本方案**修订为**（见 `DESIGN-BOHAI.md` §7）：<br>`Chat = retrieval + web + action(轻量写:发帖/记忆)`<br>`Work = retrieval + web + generator(docx/pptx/xlsx + 代码) + agents 集群` |
| `docs/DESIGN-BOHAI.md` | **长什么样**（令牌、断点、布局矩阵、组件树、两层模式体系）。本次同批交付。 |
| `AGENTS.md` | 改动 → 必跑门禁的对照表（本文 §5 是它的 BOHAI 专用版）；本次顺手更正 lint 基线 183 → 118。 |
| `docs/未完成任务清单.md` | BOHAI 相关的在途事项**应先清完再做本方案**（Step 0），否则会撞车；本方案落盘与 Step 0 清场项已登记。 |
| `plans/023-bohai-ui-redraw.md` / `plans/024-bohai-rules-and-latency-slimming.md` | 它们的遗留项（约 35 处死 CSS、P2-1 消融验证）与本方案**有重叠**：**旧 CSS 在 Step 6 整体删除时一并消失**，P2-1 并入 Step 0 清场。 |
| `output/boh-ui-demo/index.html` | 视觉/交互的**事实基准**（gitignored，不入库）。`DESIGN-BOHAI.md` 已自含其全部数值。 |

---

## 7. 需要用户拍板 / 已标注冲突

1. **⚠️ 圆角冲突（已按纪律标注）**：提示词记「输入框圆角 **12**」，但已验收的预览件
   `output/boh-ui-demo/index.html` 的 `.boh-composer` 实为 `--boh-radius-xl`（**14**）。
   `DESIGN-BOHAI.md` 暂以**预览件（事实基准）为准记 14**；若要按 12 落地，需改预览件并重新验收。
2. **门禁 `slice(0, 20)` 修复**：`check-project-structure.mjs:235` 的 top-20 窗口导致
   `messages.css`（2,075 行）永不被报。修它是**独立任务**，不混入本方案（§1.2）。
3. **`engine/` 迁入壳**：完成后 `useChatEngine` 的公开签名兼容层是否保留一个版本（便于回滚），或直接切换。
