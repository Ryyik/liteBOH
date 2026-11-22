# 044 · BOH AI 记忆自主化：站点记忆的读写闭环

- **状态**：**阶段 0 已落地**（A 持久化开关 + B 自动沉淀接 supersede，2026-11-22 verify 全绿）；阶段 1–3 待做，见 §6
  > ⚠️ **2026-11-22 复核更正**：初稿曾写「2026-11-21 已落地」，但当时只落了 **B 的判定模块**
  > （`memory-supersede.js` + 单测）。实测三项都还没接上：① `dedupe.js` 仍留着 150 行
  > 逐字重复实现（不是 re-export，两份真源）；② `treehole-space-api.js` 的候选循环
  > **从未调用** `resolveSharedCandidateWrite`（判定模块是死代码，G2 实际未修）；
  > ③ `isMemoryCaptureEnabled` 仍是 `ref(false)` + 恒 `removeItem`（G1 未修）。
  > 三项已于 2026-11-22 补齐，并各配守卫：`bohai-memory-supersede-capture.test.js`
  > （dedupe 只许 re-export）、`bohai-memory-capture-supersede-wiring.test.js`（接线 + 顺序）。
- **日期**：2026-11-21
- **触发**：用户要求「让 AI 自主阅读数据库和更新当前的站点记忆」。先调研连接器现状，发现读侧已是成熟的「意图路由 + 10 连接器预取」体系，写侧有**三条已存在的路径**（见 §2.1）——原设想的「阶段 0 = 自动写入开关 + 记忆管理 UI」**均已存在**，缺口收窄为两处，本 plan 只补缺口。
- **影响文件（计划）**：
  - 新增：`src/utils/memory/memory-supersede.js`（supersede 判定下沉，纯函数）、`tests/unit/bohai-memory-supersede-capture.test.js`、本文件
  - 修改：`src/views/BOHAI/utils/memory/dedupe.js`（判定函数改 re-export，保持既有 import 不动）、`src/utils/api/treehole/treehole-space-api.js`（候选循环接 supersede）、`src/views/BOHAI/composables/useModelConfig.js`（公共记忆开关持久化）
  - 不改：`boh_ai_shared_memories` 表结构与 RLS、`saveSharedMemory` 动作语义、`SharedMemoryManagement.vue`、读侧连接器与意图路由（阶段 1 的事）
- **关联**：`plans/025`（连接器架构 v2 真源）、`plans/024`（延迟收敛——阶段 1 的成本纪律来源）、`docs/guides/gate-matrix.md`（门禁清单）

---

## 1. 需求口径

1. **自主读**：AI 能在回答过程中自主决定「查数据库的哪一块、用什么查询词」，而不是只吃预取结果。
2. **自主写**：AI 能自主维护站点记忆的**生命周期**——新事实进得来，旧事实（被改口/过期的）出得去——而不是只进不出。
3. **两条纪律不破**：写公共库的首次授权仍是用户显式动作（默认 OFF）；所有写入/归档仍过判重与归属权防线。

## 2. 现状诊断（2026-11-21 实测）

### 2.1 写侧已是三条路径，不是一条

| # | 路径 | 入口 | 确认环节 | 落库形态 | 真源 |
|---|---|---|---|---|---|
| ① | 显式指令直写 | 用户说「记住X」（`extractExplicitMemoryContent` 四正则） | **无确认**，`isMemoryCaptureEnabled` ON 即写 | `source:'manual'`，confidence 1，**含 supersede 归档** | `useChatEngine.js:818-935` |
| ② | 对话自动沉淀 | 每轮生成后 `captureMemoryFromConversation` → LLM 提取候选 | **无确认**，confidence ≥ 0.66 直写；< 0.66 进 `boh_treehole_memory_candidates`（pending） | `source:'capture'` | `treehole-space-api.js:617-900` |
| ③ | 用户请求确认写 | `ROUTING_PATTERNS.sharedSave` 命中「帮我记一下」类 | **弹确认**，回复「确认」才写 | `source:'auto_confirmed'`，走 `saveSharedMemory` 动作 + 审计 | `useChatEngine.js:1349`、`useActionDraft.js:151` |

三条路径共用 `boh_ai_shared_memories`（公开表，RLS：select 全员可读 active、update/delete 仅 owner）。管理页已存在：`SharedMemoryManagement.vue`（user-space 路由，按 status 筛选、归档、删除）。

> ⚠️ 上游结论更正：本仓库此前（含本次调研初稿）把写侧概括为「AI 提议 + 用户确认」，那只覆盖路径③。判据：`grep -n "captureTreeholeMemoriesFromDialogue" src/utils/api/treehole/treehole-space-api.js`（路径②直写无确认）+ `useChatEngine.js:864`（路径①直写无确认）。

### 2.2 读侧：路由预取，模型无工具通道

- 10 个读连接器（注册表 `tools/retrieval/index.ts:46`），由关键词/正则/实体别名本地路由决定查谁（`useIntentDetection.js`）。
- `bohai-model-client.js` 无 `tools`/`tool_choice` 参数（grep 零命中，2026-11-21）——模型没有自主调用工具的通道。
- 双通道（siliconflow + 智谱）走 vault Edge Function 代理，payload **整体透传**（`api-key-vault/index.ts:1317` `body: JSON.stringify(payload)`）⇒ 接 function calling **不需要动 Edge Function**。

### 2.3 真正的缺口（本 plan 阶段 0 的靶子）

| # | 缺口 | 证据 | 后果 |
|---|---|---|---|
| G1 | **公共记忆开关不持久**：`isMemoryCaptureEnabled = ref(false)`，`persistMemoryCaptureSetting` 只 `removeItem`（`useModelConfig.js:95,233`） | 每次会话重置 OFF ⇒ 路径①②整个失效，用户以为「AI 记不住」 | 「自主写」无从谈起 |
| G2 | **自动沉淀不会改口**：候选循环里 `isLikelyDuplicateText` 命中即 `continue`，无 supersede 分支（`treehole-space-api.js:794-800`） | 用户改口后旧事实永久占位，AI 持续答错（显式指令路径 2026-10-08 已修，自动沉淀没接上） | 违反 G2 目标「旧事实出得去」 |
| G3 | **低置信 pending 候选无出口**：只有 insert 与去重读取，无任何确认/拒绝 UI（`grep insertTreeholeMemoryCandidate src` 仅 treehole-space-api.js） | 死信堆积（去重读取仍在用，不算纯死数据）；聊天里的「待确认：N 条」无处操作 | 阶段 3 处理，本次不动 |

## 3. 阶段 0 方案（本次实施）

### A. 公共记忆开关持久化（修 G1）

- `useModelConfig.js`：`isMemoryCaptureEnabled` 初始值改 `readBooleanSetting(MEMORY_CAPTURE_SETTING_KEY, false)`；`persistMemoryCaptureSetting` 改为 ON 写 `'1'`、OFF `removeItem`（absent = 默认 OFF，语义与「默认关闭」产品口径一致）。
- **默认值不变（OFF）**。改变的只是「开过之后是否记住」——从「每会话重新授权」改为「一次授权持续生效」。KEY 沿用 `chat-engine-config.js:172` 已定义的 `boh_ai_memory_capture_enabled_v1`（此前只被 remove 过，无存量数据，无迁移负担）。
- 合同变化要在开关文案里可感知：`useMemoryCapture.js` 的开启提示从「本轮会写入」改为「已开启：将写入（可随时在设置里关闭）」。

### B. 自动沉淀接 supersede（修 G2）

1. **判定函数下沉**：`classifyMemoryWrite` / `findSupersededMemory` 及其私有依赖（`normalizeMemoryCompareText`、`isSubsetDuplicate`、`isSameTopic`、`longestCommonSubstringLength`、两个阈值常量）从 `views/BOHAI/utils/memory/dedupe.js` **原样搬**到 `src/utils/memory/memory-supersede.js`（utils 层，纯函数，零外部依赖）。
   - 为什么搬：`treehole-space-api.js` 在 `utils/api` 层，反向 import `views/BOHAI/utils` 是下层引上层的架构债；这两个函数无 BOHAI 专属语义，是纯文本判定。
   - 单一真源保法：`dedupe.js` 对外 **re-export** 搬走的函数（`export { x } from '@/utils/memory/memory-supersede.js'`），`useChatEngine` / `useActionDraft` / 存量测试 `bohai-memory-dedupe.test.js` 的 import 一行不改。
2. **新增纯判定** `resolveSharedCandidateWrite(candidateContent, sharedRows)`：组合 classify + find，返回 `{ kind: 'exact'|'supersede'|'none', supersededMemory }`——把「每候选一次决策」做成纯函数，API 循环保持薄、单测不碰 supabase。
3. **候选循环接线**（`treehole-space-api.js`）：每候选先 `resolveSharedCandidateWrite`（只对 shared rows，带 id）——
   - `exact` ⇒ 跳过（与现行 `isLikelyDuplicateText` 命中同语义，先行短路）；
   - `supersede` 且定位到旧行 ⇒ 归档旧行（`updateSharedAIMemoryStatus(..., 'archived')`）**失败不阻断**（退化为并存写入，与显式路径同口径）⇒ 照常写新；
   - `none` ⇒ 落回现行 `isLikelyDuplicateText` 联合去重闸（treehole + shared + candidate 三表内容），命中跳过、否则按 confidence 门槛直写——**现行跳过行为一律保留**，本改动只新增 supersede 分支。
   - 归属权三重防线：判定只用 `getSharedAIMemoriesForAI` 返回的行（候选改口只针对公共库内容）+ API `.eq('owner_user_id')` + RLS `update_own`。归档别人的行物理不可能，update 落空即并存。

## 4. 安全口径（原样保留，不新增例外）

- `boh_ai_shared_memories` RLS 不动：active 全员可读、写只认 owner。
- 自动归档是**降权**不是删除：`status: active → archived`，管理页可见可恢复；物理删除仍只有用户手动。
- 路径③的确认弹层不动——它服务「用户主动要求保存」场景，与自动化正交。
- 封闭域护栏不动：心理访谈不写任何记忆（`useChatEngine.js:782`）。

## 5. 门禁自证

| 改动 | 自证 | 状态 |
| --- | --- | --- |
| supersede 下沉 + re-export | 存量 `tests/unit/bohai-memory-dedupe.test.js` 全绿（行为逐字不变，23/23）；`bohai-memory-supersede-capture.test.js` 新增一条「dedupe.js 只许 re-export」源码守卫 | ✅（2026-11-22 补齐 re-export，此前是两份实现） |
| `resolveSharedCandidateWrite` | `tests/unit/bohai-memory-supersede-capture.test.js`：exact/supersede/none 三出口 + 「最同主题」定位 + 长度比教训回归锁 + 无 id 退化契约 | ✅ |
| 候选循环接线 | `tests/unit/bohai-memory-capture-supersede-wiring.test.js`（9 项）：判定先于联合去重闸、归档先于写入、失败降级并存、只喂带 id 的行、utils/api 不反向引 views。**反证已做**：删掉判定块 ⇒ 3 条当场红 | ✅（2026-11-22 补齐接线，此前是死代码） |
| 开关持久化 | 初始值改 `readBooleanSetting(KEY, false)`、ON 写 `'1'` / OFF 删键；开关文案同步说明「持续生效」。无既有测试锁旧行为 | ✅（2026-11-22 补齐，此前仍是 `ref(false)` + 恒 removeItem） |
| 全链 | `npx vitest run` ⇒ 395 文件 / 5045 用例全绿（16s）；`npm run verify` 见当日 memory 日志 | ✅ |

> 提交备注：prettier 已对本改动 6 个文件单独执行（**未跑全仓 format**，避免重排工作区里其他进行中的改动）；pre-commit 钩子若再改写文件，以其输出为准重跑定向测试。

## 6. 后续阶段（本次不做，防范围漂移）

- **阶段 1 · 读侧 tool-call 化**（大工程）：`bohai-model-client` 透传 `tools`；工具注册表从 connector 描述符**派生**（单测锁「tool 清单 == connector 清单」）；参数面只收一个 `query: string`；**保留预取为第 0 轮**（多数问题零额外调用，关键词路由降级为 fallback 不删除）；轮数上限 2–3；`bohai-retrieval-api.js` 三条 🔴 红线（profiles 只 count、products 自滤 `is_active`、news 不含全文）封死在工具实现内；参数进 `generation-params.js` 真源表；新探针参照 `probe-bohai-keepalive-stream` 的坑（SSE 重放 + 接住 abort，`route.fulfill` 一次性给完 = 假绿）。
- **阶段 2 · 记忆归档提议**：AI 检索时发现公共记忆与最新证据矛盾（活动已结束/数据过期）⇒ 提议归档，走确认或开关；复用阶段 0 的 `updateSharedAIMemoryStatus` 通道。
- **阶段 3 · pending 候选出口**：`SharedMemoryManagement.vue` 增加「待确认」分组（读 `boh_treehole_memory_candidates` status='pending'），一键转正（写 shared）/拒绝（rejected）；把聊天里「待确认：N 条」的提示链接到该页。
