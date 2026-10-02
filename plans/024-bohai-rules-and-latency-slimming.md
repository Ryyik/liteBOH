# 024 · BOH AI 规则瘦身与首字延迟治理

- 状态：**已实施 + 已验收（2026-10-02）**。6 项代码全部落地；P1-3 已部署到线上并冒烟；
  首字延迟有**实测数据**（§9.4）。唯一剩项是 P2-1 的消融验证（见 §9.4 末）。
- 起因：用户 2026-10-02 反馈「规则太多 / 回复和响应速度太慢 / 输出质量不高」
- 性质：**§1 的行号均为 2026-10-02 实测**（`main` 工作区，含 09-30 未提交的 023 改动）。
  §1 里**推断的运行时数字已在 §9.4 用实测替换** —— 最值得记的一条是：
  **本地阶段只占 5~26ms，首字延迟的 98%+ 在 Edge Function + 上游模型**。

---

## 0. 结论先行

三个抱怨是**三条独立的线**，不是同一条问题。把它们的病因混在一起，就会得到「再精简一轮提示词」这种收益最小的答案。

| 抱怨 | 真病灶 | 硬证据 | 收益 | 风险 |
| --- | --- | --- | --- | --- |
| **规则太多** | 一整套随 `auto` 模式一起废弃的 **auto 路由子系统仍在每轮运行** | `autoDecision` **19** 个字段，生产代码只读 **5** 个；`ROUTING_PATTERNS` **23** 类正则里 **9** 类已无活消费方；`mergeAutoDecisionWithLocalGuardrails` **只被单测引用** | 每轮少跑 9 类正则（含 2 个 24 字通配的巨型正则）；删 ~400 行 | **低** |
| **响应太慢** | 首 token 之前多付**一次完整 LLM 往返**（含 Edge 冷启动 + `auth.getUser` + 上游 RTT） | `useChatEngine.js` 的「追问改写」无条件触发、用 `currentModel`（plan 模式 = R1 推理模型）、`max_tokens: 256` ⇒ 输出被截断 ⇒ 静默回落本地 ⇒ **白跑一趟**。**实测（§9.4）**：同样的往返 = 1.3~2.1s；本地阶段只占 5~26ms | 短追问首字 **−1.3~2.1s**（**实测**，非推断） | **低** |
| **输出质量不高** | ① 陈旧证据被原样复用 ② 否定式 : 肯定式 ≈ **2.4 : 1** ③ 参数与规则互相抵消 | `useChatEngine.js:1896-1909`；neg 161 / pos 66；`fast` temp 0.22 + `frequency_penalty` 0.08 + 规则「不要重复」 | — | **中** |

**一句话建议**：**不要先动提示词文本。** 先删一条已经不生效的管线（P0-1）和一次不产生价值的模型调用（P0-2）——这两步零语义风险、改完立刻可测，且立刻缩短首字延迟。提示词精简（P2）留到有埋点数据之后再谈。

### 与 09-24 两份文档的关系（重要，别重复劳动）

仓库里已有两份同主题文档：

- `docs/2026-09-24-BOHAI约束密度审查与精简建议.md`
- `docs/2026-09-24-BOHAI提升质量与减少约束方案.md`（M1–M6）

它们做的是**心理专家角色的提示词密度**，并且 **M1 / M3 / M6 已实施**（实测：非访谈路径每轮固定注入 5612 → **2365**，−57.9%；访谈态 6262 → 5606）。那部分**本次不重复、不建议回退**。

它们**没覆盖**的三块，正是本文的对象：

1. **心理角色之外**的通用路径（`BASE_SYSTEM_PROMPT` / `responseRules` / 健康附录 / 集群）的规则与参数；
2. **首 token 之前的串行链**（09-24 完全没提延迟）；
3. **已废弃但仍运行的路由子系统**（09-24 §3.4 只提了「抽常量」，没发现整条链是死的）。

另：09-24 两份文档的共同阻塞是「探针基线未取得（沙箱起不了 Chrome + 需真实额度）」。**本文的 P0 两项不需要探针**——它们靠静态调用图 + 单测就能自证，这是把 09-24 卡住的顺序换一下。

---

## 1. 现状盘点（实测）

### 1.1 每轮首 token 之前的串行链

以 **fast 模式 + ≤160 字的追问**（最常见的用法）为例，`useChatEngine.sendMessage` 的顺序：

| # | 阶段 | 位置 | 阻塞性质 |
| --- | --- | --- | --- |
| 0 | 等模型配置就绪 | `useChatEngine.js:1076-1092` | **最多 8s 轮询**（冷加载时） |
| 1 | 上下文压缩（通常 no-op） | `:1275` 启动，`:1993` await | 与后续并行，一般 0 |
| 2 | **追问改写（一次完整 LLM 调用）** | `:1325-1373`，调用在 `:1338` | **串行阻塞一切** |
| 3 | 知识检索（`boh-ai-retrieval` Edge Function） | `:1556-1621` 启动，`:1625` await | **串行** |
| 4 | 联网搜索（未开联网则 no-op） | `:1537` 启动，`:1707` await | 与 3 并行，但被 await |
| 5 | 组装 prompt + 裁剪 | `:1942-2255` | 纯 CPU |
| 6 | 主生成（`api-key-vault` → 上游） | `:2288` | 上游 TTFT |

**关键点：第 2 步排在第 3、4 步之前，而且第 3、4 步的 Promise 都是在第 2 步 `await` 之后才创建的**（`:1338` 调用 → `:1537` / `:1556` 才构造 Promise）。所以检索**无法与改写并行**，这是一条硬串行链。

### 1.2 每次模型调用在 Edge Function 里先付 4 次 DB/auth 往返

`supabase/functions/api-key-vault/index.ts:2329` 的 `runtime-chat-stream` 分支：

| 序 | 动作 | 行 |
| --- | --- | --- |
| 1 | `resolveRuntimeIdentity` → `client.auth.getUser(token)` | `:2330` |
| 2 | `checkRateLimitDb` | `:2333` |
| 3 | `resolveRuntimeModelPolicy` | `:2347` |
| 4 | `checkTokenQuota` | `:2354` |
| 5 | 才向上游发起请求 | 之后 |

再加上 Edge Function 冷启动。**所以「一次 LLM 往返」的真实成本 ≈ 冷启动 + 4 次 DB + 上游 RTT**，不是一次普通 fetch。

这解释了为什么「少调一次模型」比「提示词少 500 字」值钱得多。

### 1.3 追问改写：付出一个完整往返，拿到零收益

`useChatEngine.js:1325-1373`：

```js
if (userText.length <= 160 && historyMessagesForCurrentTurn.length >= 2) {
  const resolverModel = currentModel.value || runtimeAvailableModels.value[0];
  ...
  const rewrittenQuery = await callModelInternal(
    resolverModel.id, userText, `<role>你是 BOH AI 的上下文理解器。</role>...`,
    resolverHistory, preflightController.signal, 0,
    TASK_GENERATION_PRESETS.titleExtract,   // { max_tokens: 256, temperature: 0, top_p: 0.3 }
  );
```

四条问题：

1. **触发条件与「是否真的需要消解指代」无关。** 门槛是「≤160 字 + 历史 ≥2 条」，而不是「含指代词」。一句 20 字的完整问句（「BOH 有多少成员？」）照样触发。
2. **用的是当前模式对应的模型。** `currentModel` 在 **plan 模式 = DeepSeek-R1（推理模型）**。给它 256 token 的预算，thinking 就吃光了。
3. **256 token 对推理模型是无效预算。** `callModelInternal` 把 `max_tokens` 夹到 `[256, 4096]`，所以下限就是 256 —— 推理模型的输出会被截断，`filterThinkingContent` 之后大概率是空串。
4. **空串会静默回落到本地规则**（`autonomousContextualQuery` 为空 → `localContextualQuery`）。也就是说：**这条路在 plan / pro 模式下几乎必定是「白跑一趟」。**

而且本地兜底 `buildContextualFollowUpQuery`（`bohai-engine-helpers.js:338-360`）的**门槛更准**——它用 `isContextDependentFollowUp(current)` 判断「是否真的省略了指代」，只在需要时才拼接历史。**它比 LLM 路径的「≤160 字」更合理。**

### 1.4 「规则太多」的真身：一条已废弃的路由链仍在运行

`auto` 模式于 **2026-06-08 移除**（`chat-engine-config.js:404` 注释、`:406` `BOH_AUTO_MODE_ID`）。但它的路由子系统没跟着删。

`ROUTING_PATTERNS` 共 **23 类正则**（`bohai-auto-router.js:74-167`）。逐条追消费方后：**14 类活、9 类死**。

**死掉的 9 类**（其唯一消费方是已被丢弃的字段，或只被已死的函数调用）：

| 正则 | 经由 | 终点 |
| --- | --- | --- |
| `complex` | `isLikelyComplexQuestion` | `complexQuestion` 字段（无消费方） |
| `multiStepReasoning` | 同上 | 同上 |
| `planMode` | `isLikelyPlanModeRequest` | `planMode` 字段（无消费方） |
| `minecraftCommand` | `isLikelyMinecraftCommandRequest` | `minecraftCommand` 字段（无消费方） |
| `bohInternalFact` | `isLikelyBohInternalFactualRequest` | `bohInternalFactual` 字段（无消费方） |
| `explicitWebSearch` | `isLikelyWebSearchRequest` | `shouldSearchWeb` 字段（**已明确废弃**，见下方注释） |
| `webFreshness` | 同上 | 同上 |
| `healthOrSafety` | 同上 | 同上 |
| `externalKnowledge` | 同上 | 同上 |

**必须保留的 14 类**（追到了真实消费方，不能误删）：

| 正则 | 活消费方 |
| --- | --- |
| `cloudSave` / `sharedSave` / `bothSave` | `shouldSaveCloud` / `shouldSaveSharedMemory` / `saveDestination` → `useChatEngine.js:1396-1407` |
| `dailySummary` / `cloudReference` / `internalSource` | `isLikelyCloudReferenceRequest` → `shouldReferenceCloud` → `:1414`、`:1603` |
| `forumPost` | `bohai-auto-router.js:315` 抑制 `wantsCloudSave`（发帖请求不当作保存记忆） |
| `community` / `question` / `memoryQuery` / `memoryShare` | `isLikelyCommunityMemoryShare` → `shouldAskMemoryDestination` → `:1396`（**这一条是间接存活，最容易被误删**） |
| `professionalHealth` / `personalSupport` | `isLikelyPersonalSupportRequest` → **被 `useChatEngine.js:49` 直接 import**，`:1795` 驱动 `personalSupportMode` 写进 `responseRules` |

**`bohai-auto-decision.js`（298 行）里已死的一半**（生产只 import 一个 `resolveAutoModeDecisionLocally`）：

`AUTO_MODES` / `isAutoModeId` / `createNeutralAutoDecision` / `normalizeAutoClassifierBoolean` / `normalizeAutoSaveDestination` / `hasHardRoute` / `shouldAskModelForAutoDecision` / `computeModeFromDecision` / `mergeAutoDecisionWithLocalGuardrails` / `safeParseAutoClassifierJson`。

**`autoDecision` 的 19 个字段，生产代码只读 5 个：**

| 字段 | 读取处 |
| --- | --- |
| `shouldSaveCloud` / `shouldSaveSharedMemory` / `shouldAskMemoryDestination` | `useChatEngine.js:1396-1400` |
| `saveDestination` | `:1407` |
| `shouldReferenceCloud` | `:1414`、`:1603` |

**其余 14 个字段算完就丢**：`modeId` / `codeOrCommand` / `minecraftCommand` / `dailySummary` / `planMode` / `bohInternalFactual` / `complexQuestion` / `communityMemoryShare` / `personalSupport` / `shouldSearchWeb` / `forceCloudReference` / `shouldAskSharedMemory` / `actionNotes` / `confidence`。

> ⚠️ 注意 `communityMemoryShare` 与 `personalSupport` 两个字段虽然自己没人读，但它们对应的**正则**是活的（前者经 `shouldAskMemoryDestination`、后者被 `useChatEngine` 直接调用）。**字段可以删，正则不能删** —— 这是 P0-1 最容易踩的坑。

其中 `shouldSearchWeb` 有一条明确的「已废弃」注释：

```js
// useChatEngine.js:1467-1469
// 联网搜索触发条件：仅当用户手动开启联网搜索开关时才触发。
// 之前 autoDecision.shouldSearchWeb 会让 AI 在用户未开启搜索时自动发起联网搜索，
// 与用户预期不符，已移除自动触发逻辑。
```

**但产生它的那 4 类正则（`explicitWebSearch` / `webFreshness` / `healthOrSafety` / `externalKnowledge`）仍在每轮跑。**

还有一处「单一真源」违规 —— **同一件事有两份实现，活的在别处，死的更长**：

| 判定 | 活的那份（被用） | 死的那份（仍运行） |
| --- | --- | --- |
| 「BOH 内部事实问题」 | `ai-chat-grounding.js:60 isLikelyBohInternalFactualQuestion` | `bohai-auto-router.js:163 ROUTING_PATTERNS.bohInternalFact.pattern`（两个 24 字通配的巨型正则） |

> ⚠️ **这是 `AGENTS.md` 最高纲领第 1 条「单一真源」的直接违反，而且方向最坏**：死的那份更复杂，后来人改口径时更可能去改它。

**为什么这条链能活到今天**：它的单测是绿的（`tests/unit/bohai-auto-decision.test.js` 有 5 个 `mergeAutoDecisionWithLocalGuardrails` 用例）。**测试在给死代码续命**，`verify` 全绿反而掩盖了它已经断了接线。

### 1.5 质量：三个机制性问题

#### ① 陈旧证据被原样复用（最像「幻觉」的一条）

`useChatEngine.js:1871-1909`：本轮**没有**检索到内部证据时，直接把**上一轮 assistant 消息 meta 里的 `evidenceContext` 原样注入**，无时间标记、无「这是上一轮的」提示。

后果：问「论坛最近有什么新帖」→ 第二轮没检索到 → 拿到第一轮的旧帖 → 模型**言之凿凿地当最新内容回答**。用户感知就是「AI 在胡说」。

同类问题在联网证据上也有（`:1871-1893`），但那条至少有 `searchContext` 结构可判时效，内部证据连时间戳都没有。

#### ② 否定式压倒肯定式

提示词文本里（13 个承载提示的文件）：

| 类别 | 出现次数 |
| --- | ---: |
| 否定式（`绝对不能` / `不要` / `禁止` / `不许` / `不得` / `不能` / `避免` / `严禁` / `切勿`） | **161** |
| 肯定式（`必须` / `应当` / `应该` / `优先` / `请务必`） | **66** |

**比例 2.4 : 1。**

09-24 的 M1 已经证明「**禁令只能排除，不能生成** —— 模型知道什么不该写，却不知道那该写什么，于是退化成最安全的形式」，并且这条结论**已经成功应用在心理角色上**。但它**没有推广到通用路径**。

具体：`BASE_SYSTEM_PROMPT`（`chat-engine-config.js:113-152`）的 `<constraints>` 有 6 条，其中 **5 条是否定式**。

「不编造」这一条规则的独立副本，实测有 **12 份**：

| # | 位置 |
| --- | --- |
| 1 | `chat-engine-config.js:132`（BASE） |
| 2 | `chat-engine-config.js:165`（plan 模式附录） |
| 3 | `chat-engine-config.js:348`（健康附录） |
| 4 | `useChatEngine.js:1827`（responseRules） |
| 5 | `useChatEngine.js:2088`（论坛叙述） |
| 6 | `useChatEngine.js:2112`（论坛修正） |
| 7 | `useForumSummary.js:209` |
| 8 | `useActionDraft.js:743` |
| 9 | `agent-cluster-helpers.js:27` |
| 10 | `synthesizer-prompt.js:13` |
| 11 | `RetrieverAgent.js:165` |
| 12 | `OpsAgent.js:75` |

（09-24 审查时是 9 份，两个月里长到 12 份 —— 说明「加规则」是默认动作，「收口」不是。）

#### ③ 参数与规则互相抵消

| 侧 | 设定 | 位置 |
| --- | --- | --- |
| 参数 | `fast` = `temperature 0.22` / `top_p 0.74` / `frequency_penalty 0.08` | `chat-engine-config.js:84` |
| 规则 | 「追问时保持对话连贯，**不要重复**已说过的内容」 | `useChatEngine.js:1822` |
| 风格 | 「少用模板腔…能用两三段说清时，就用自然短段落」 | `chat-engine-config.js:271` |

**低温 + 高频惩罚 + 「不要重复」三条同向叠加**，都指向「短、避重、少承接」。用户感知就是「答得干、没接住上一句」。

09-24 的 M6 已经证明过这个道理（「约束和温度是替代关系：温度能给的自然度，不必用规则去规定」），但那次只调了心理访谈态。**通用路径的 `frequency_penalty` 从来没被审视过。**

### 1.6 附：仓库目前没有任何 AI 耗时埋点

`utils/bohai-observability.js` 只有两个导出（`createBohAIRetrievalTrace` / `formatBohAIRetrievalTraceSummary`），**记录的是「读了哪些源」，没有任何 `duration` / `latency` / `performance.now`**。

`composables/useThinkingTimer.js`（39 行）只是 UI 的「思考中」计时器，不是分阶段计时。

**结论：现在无法回答「慢在哪一步」。** 这是 §4 要第一步解决的事 —— 否则后面所有优化都是猜。

---

## 2. 分档处置

### P0 — 零语义风险，改完立刻可测

#### P0-1 · 删掉废弃的 auto 路由链

**动作**：

1. `bohai-auto-router.js` 删掉 9 类死正则及其派生函数（`complex` / `multiStepReasoning` / `planMode` / `minecraftCommand` / `bohInternalFact` / `explicitWebSearch` / `webFreshness` / `healthOrSafety` / `externalKnowledge`），连带删 `isLikelyComplexQuestion` / `isLikelyPlanModeRequest` / `isLikelyBohInternalFactualRequest` / `isLikelyMinecraftCommandRequest` / `isLikelyWebSearchRequest` / `pickModeFromLocalSignals` / `pickMoreCapableMode`。
   **保留 14 类活正则**（清单见 §1.4，逐条有消费方）与 `isLikelyCloudReferenceRequest` / `isLikelyPersonalSupportRequest` / `isLikelyCommunityMemoryShare` / `isLikelyCodeOrCommandRequest` / `isLikelyDailySummaryRequest`。
2. `resolveBOHAIAutoModeDecision` 的返回对象从 19 个字段砍到 **5 个**（`shouldSaveCloud` / `shouldSaveSharedMemory` / `shouldAskMemoryDestination` / `saveDestination` / `shouldReferenceCloud`）。
3. `bohai-auto-decision.js` 删除 10 个死导出（清单见 §1.4），同步删 `tests/unit/bohai-auto-decision.test.js` 里对应的 describe 块。
4. `useChatEngine.js:1808` 的 `lastRoutedMode.value = activeModeId;` —— `lastRoutedMode` **只有写、没有任何读**（`useModelConfig.js:79` 定义，`useChatEngine.js:690/1808/315/2721` 全在同一个 composable 内部传进传出）。一并删。

> ⚠️ **删前必须先跑一遍「保留项反证」**：把 `resolveBOHAIAutoModeDecision` 的输入输出在删前打印一次（10 条典型语句，须覆盖：普通闲聊 / 「记一下这件事」/「存到公共记忆」/「根据我的 Cloud+ 总结一下最近」/「帮我发个帖」），删后再打印一次，断言 5 个存活字段逐条一致。
>
> ⚠️ **两个最容易误删的正则**：`community` / `question` / `memoryQuery` / `memoryShare` 四个（只经由 `isLikelyCommunityMemoryShare` → `shouldAskMemoryDestination` 间接存活），以及 `professionalHealth` / `personalSupport`（被 `useChatEngine.js:49` 直接 import）。**删前用 Grep 工具（不是 bash `grep "a\|b"`，见 `MEMORY.md`）确认。**

**收益**：每轮少跑 9 类正则（含 2 个 24 字通配的巨型正则，`bohInternalFact` 单条就有两处 `.{0,24}`）；`bohai-auto-router.js` 从 435 行降到 ~200 行、`bohai-auto-decision.js` 从 298 行降到 ~120 行；删掉 5 个测试用例的死代码覆盖。

**风险**：低。唯一风险是误删上面那 6 类间接存活的正则。

#### P0-2 · 追问改写改为「本地优先，必要时才调模型」

**动作（二选一，推荐 A）**：

- **A · 直接删掉这次 LLM 调用**，统一走 `buildContextualFollowUpQuery`。
  理由：本地版的门槛（`isContextDependentFollowUp`）比 LLM 版的（`≤160 字`）更准，且它本来就是 LLM 版失败时的兜底 —— 删掉等于「把兜底提升为主路径」。
- **B · 保留但收窄**：① 门槛改为「`isContextDependentFollowUp(userText)` 为真」；② 模型固定用最便宜的那个（`runtimeAvailableModels` 里非推理模型），**不要用 `currentModel`**；③ 加 800ms 超时，超时即用本地。

**为什么这是 P0**：它排在第 3、4 步之前（§1.1），删掉它同时缩短首字延迟**并且**让检索能提前 1 个 LLM 往返启动。

**验证**：P0-2 可加一条单测 —— 断言 `sendMessage` 在 ≤160 字追问下**不产生**非主生成的模型调用（可用 mock 计数）。

### P1 — 收益大，需要小验证

#### P1-1 · 陈旧证据复用加时效护栏

**动作**：`useChatEngine.js:1896-1909` 复用上一轮 `evidenceContext` 时：

1. 若本轮提问命中时效词（`ROUTING_FORUM_REALTIME_PATTERN`，`chat-engine-config.js:394` **已存在，直接复用**）→ **禁止复用**，改为注入 `<stale_evidence_note>` 说明「本轮未检索到新资料」。
2. 其余情况允许复用，但注入 `（以上资料来自第 N 轮检索，可能已过时）` 前缀。
3. 联网证据同理（`:1871-1893`），用 `searchContext.query` 判断是否同一主题。

**收益**：直接消除「AI 言之凿凿但内容过时」这一类投诉。这是**质量三项里最容易量化**的一项。

#### P1-2 · 参数与规则解耦（二选一，别两头都压）

| 选项 | 动作 | 代价 |
| --- | --- | --- |
| A | `fast.frequency_penalty` 0.08 → 0.02 | 改 `chat-engine-config.js:84`，**行为变更**，要跑 `check:bohai-params` |
| B | 从 `responseRules` 删掉「不要重复已说过的内容」 | 改 `useChatEngine.js:1822`，纯提示词 |

**建议先做 B**（纯提示词、可回滚、不碰参数门禁），观察后再决定要不要做 A。

#### P1-3 · Edge Function 快路径

**⚠️ 2026-10-02 实施时更正：本条收益被原方案高估了。** 读代码后发现：

- `resolveRuntimeModelPolicy` 对模型配置行有 **5 分钟内存缓存**（`index.ts:1657-1680`），
  命中时**零 DB 往返**；
- `resolveRuntimeIdentity` 里 `auth.getUser` 是 30–80ms，但那一次往返省不掉；
- 所以「4 次串行 DB」的实测构成是：`auth.getUser`(30–80ms) + `resolveUserTier`(可能已缓存)
  + `checkRateLimitDb`(1 次原子 RPC) + `resolveRuntimeModelPolicy`(通常缓存命中)
  + `checkTokenQuota`(≤3 次读)。

**真实可压缩的只有 `checkRateLimitDb` 与 `checkTokenQuota` 之间的串行**，约 **20–40ms**，
不是原方案暗示的「首字延迟的最大结构性来源」。**真正的结构性收益在 P0-2**（删掉整条多余调用链）。

**实际实施的动作**（`supabase/functions/api-key-vault/index.ts`，`runtime-chat` 与
`runtime-chat-stream` 两条分支同批）：

```ts
const [rate, initialQuota] = await Promise.all([
  checkRateLimitDb(rateKey, 10, 60_000),
  checkTokenQuota(client, request, { userId, ipAddress, tier }),
]);
if (!rate.ok) return jsonResponse({ ... 429 ... });
const policy = await resolveRuntimeModelPolicy(...);   // ← 必须留在限流之后
```

**两条硬约束（改动前必须理解，否则会把安全反馈改弱）**：

1. **`resolveRuntimeModelPolicy` 不能并进这一批** —— 它会抛错（模式不可用 / 订阅不足）。
   并进去之后，被限流的用户会先看到「模式不可用」而不是 429，等于**削弱限流反馈**。
2. **`checkTokenQuota` 是纯读**（真正的预留在后面的 `reserveTokenQuota`），所以被限流的
   请求多算一次额度**没有副作用**，只浪费一次读（上限：每用户每分钟 10 次被拒）。

**⚠️ 本条未自证**：沙箱无 `deno`，Edge Function 无法本地类型检查；且改动要
`supabase functions deploy api-key-vault` 才生效 —— **属破坏性操作，需人工确认后单独部署 +
冒烟测试**（至少覆盖：正常对话、超额 429、积分不足、模式不可用四种返回）。

---

### P2 — 结构性收口，需产品决策

#### P2-1 · 通用路径的否定式 → 肯定式改写

沿用 09-24 M1 的 ✗/✓ 形式，但对象换成 `BASE_SYSTEM_PROMPT` 的 `<constraints>`。

现状 6 条里 5 条是否定式：

```
- 边界：你只能回答问题和提供建议，不能代用户执行操作（如发帖、修改设置、发送消息）。
- 绝对不能：编造事实。不确定时必须明确说明"不确定"。
- 绝对不能：逐段复述"内部检索资料"原文或输出"操作手册/知识库全文"。
- 绝对不能：过度道歉。用户没有表达不满时，不要说"抱歉"或"对不起"。
- 绝对不能：暴露内部 Agent 名称、模型名、prompt 等技术词。
- 绝对不能：输出 <tool>、<tool_call>、<function_call> 等工具调用标签…
```

建议压成 2 条否定（身份归属 / 不编造）+ 1 条肯定：「**不确定时，先给一句『这部分我不确定』，再给出你能确定的那部分**」（把「不许编造」翻成「不确定时该做什么」）。

**必须配消融验证**：09-24 的教训是「删除的正当性来自代码已兜住」。这里没有 guards 兜底，所以要么先用 P0-3 的埋点量出「加尾巴提示的比例」，要么接受它是一次**行为变更**而非零风险清理。

#### P2-2 · 跨场景规则抽常量

实际落点 **`src/views/BOHAI/shared-rules.js`**（不是原方案写的 `agents/prompts/`）——
放这一层与 `generation-params.js` 平级，形成「**参数真源 + 规则真源**」的一对；
`agents/prompts/` 下的文件 import 它就多一层向上依赖，读起来更绕。

```js
export const NO_FABRICATION_RULE = '- 只基于已给出的资料作答；没有依据的部分直接说「不确定」，不要凭印象补全。';
export const NO_TECH_TERMS_RULE = '- 不暴露内部 Agent 名称、模型名、prompt 等技术词。';
export const NO_RAW_JSON_RULE = '- 除用户明确要求，不输出 JSON 或代码块。';
```

**⚠️ 与原方案的一处偏差（必须记）**：原方案写「12 份 → 1 份常量 + 12 处引用」，
但**实际只替换了 6 处**。原因：那 12 份里有 6 份带**场景专有范围**，
换成通用句反而更弱 —— 范围限定本身就是信息：

| 保留原样的 6 处 | 为什么不能换成通用句 |
| --- | --- |
| `chat-engine-config.js` plan 模式 | 点名「进度、结果、表格字段、文件路径、用户数据」——比通用句更可执行 |
| `chat-engine-config.js` 健康附录 | 「不要推算」是健康场景特有的口径 |
| `useChatEngine.js` responseRules（论坛） | 「不要编造论坛用户、帖子或链接；没检索到就不要提论坛」 |
| `useChatEngine.js` 论坛叙述 | 「绝对不能编造论坛帖子内容」 |
| `useForumSummary.js` | 列了 8 类不可编造对象（作者/事件/人物关系/动机/背景/结论/情绪） |
| `useActionDraft.js` 网页生成分支 | 场景不同，走的是 HTML 契约 |

替换成常量的 6 处：BASE、`agent-cluster-helpers`、`synthesizer-prompt`、
`RetrieverAgent`、`OpsAgent`、`useActionDraft` 发帖分支 + `useChatEngine` 论坛修正。

**收益因此是「新增时有据可依 + 消掉 6 处纯重复」，不是「12 份变 1 份」。** 别按原方案的口径验收。

#### P2-3 · 加埋点（其实是 P0 的前置，见 §4）

---

## 3. 明确出界（不许顺手改）

- **09-24 已完成的 M1 / M3 / M6**（心理角色提示词拆分、✗/✓ 对照、访谈态专属温度）—— 不回退。
- **`THINKING_SPEED_OPTIONS` / `GENERATION_PROFILE_BY_MODE` 的表结构**（P1-2 实际走的是方案 B —— 删规则，**没有动任何参数值**，见 §9）。
- **`renderMarkdown` / 流式输出 / 等待动效 / 任务面板 / 内联问答**（用户 09-30 明确要求保持不变）。
- **`plans/023` 的 UI 重绘范围**（进行中，本计划不碰样式）。
- **权限策略、表结构、RLS**。
- `useKnowledgeRetrieval` 的检索**内容**（只加时效护栏，不改检索策略）。

---

## 4. 实施顺序

> ⚠️ **顺序不能乱。09-24 两份文档卡住的原因就是「先设计删除，再去量基线，量不到就全停」。本文把顺序倒过来：先做不依赖测量的 P0。**

```
① 加阶段埋点        → 4 个时间戳（配置就绪 / 改写完成 / 检索完成 / 首 token）
                      落进 assistant 消息 meta 的 bohaiTiming 字段
② P0-1 删废弃路由   → 静态调用图自证 + 保留项反证（10 条语句前后对比）
③ P0-2 删追问改写   → 单测断言「≤160 字追问不产生额外模型调用」
④ 跑一次真实对话    → 用 ① 的数据确认 ③ 的实际收益（这一步才第一次有真数字）
⑤ P1-1 时效护栏     → 探针：问「论坛最新」两次，断言第二轮不带第一轮证据
⑥ P1-2 参数解耦     → 先做 B（纯提示词）
⑦ P1-3 Edge 快路径  → ⚠️ 需人工确认
⑧ P2 系列           → 有 ④ 的数据再谈
```

**① 的具体做法**（不引入新依赖）：在 `sendMessage` 里记录 6 个 `performance.now()`，写进 `mergeAssistantMessageMeta(sessionIndex, messageIndex, { bohaiTiming: {...} })`。

> ⚠️ **更正（2026-10-02 实施时实测）**：原方案写「`bohai-chat-session-store.js` 的白名单要同步加
> `bohaiTiming`」—— **这是错的，不需要改白名单。** 该文件的显式白名单只存在于
> `session.expertState`（`lastViolations` / `guardStats` 当初就是**那里**丢的）；
> message 走的是 `...message` **整块展开**，`meta` 里的任何字段都原样保留。
> 实测已写成断言（`tests/unit/bohai-latency-guards.test.js` 的「bohaiTiming 能通过会话持久化往返」）。
> **别把 `expertState` 的白名单和 `message.meta` 混为一谈。**

---

## 5. 验证计划

### 5.1 门禁

- `npm run verify` 全绿；**lint 警告棘轮 ≤183 不升**（P0-1 会删掉大量代码，**警告数应下降** —— 下调是好方向，不用交代）
- `npm run check:bohai-params` —— P1-2 若动 `frequency_penalty` 必须过
- `npm run check:layering` —— 不许在 `views` / `components` 里新增 `supabase.from/rpc`
- `npm run check:gates-self-test` —— 本次不动门禁，跑一次确认没被误伤

### 5.2 单测

| 改动 | 测试 |
| --- | --- |
| P0-1 | 删 `tests/unit/bohai-auto-decision.test.js` 的 `mergeAutoDecisionWithLocalGuardrails` describe；**新增**保留项断言（5 个存活字段 × 10 条典型语句，须覆盖 §P0-1 列出的 5 类场景） |
| P0-2 | 新增：≤160 字追问下 `callModelInternal` 调用次数 == 0（主生成除外） |
| P1-1 | 新增：命中 `ROUTING_FORUM_REALTIME_PATTERN` 的追问不复用上轮证据 |
| 埋点 | 新增：`bohaiTiming` 能通过 `bohai-chat-session-store` 的持久化往返（**实测无需改白名单**，见 §4 ① 的更正） |

### 5.3 探针

现有可用：`scripts/probes/probe-ai-panels.mjs`、`probe-bohai-composer.mjs`、`probe-psych-interview-wiring.mjs`。

**本次不新建探针**（P0 都不改 DOM）。P1-1 若要做行为断言，可复用 `probe-ai-panels` 的 Playwright 骨架加一段。

### 5.4 反证（每项必做）

| 改动 | 反证方式 |
| --- | --- |
| P0-1 | 用文件级临时编辑把保留项改回旧实现 → 4 条断言必红 → 改回。**不要用 `git stash`**（工作区有并行会话在动 git，见 `docs/未完成任务清单.md` §0） |
| P0-2 | 把 LLM 调用加回去 → 「额外调用 == 0」必红 |
| P1-1 | 把时效护栏去掉 → 探针断言必红 |

---

## 6. 风险表

| 风险 | 症状 | 对策 |
| --- | --- | --- |
| **P0-1 误伤存活的 5 个字段 / 6 类间接存活的正则** | 保存到 Cloud+ / 公共记忆 的确认弹窗不再出现；Cloud+ 引用静默失效；个人支持场景的回答腔调回退 | 删前打印 10 条典型语句的决策快照，删后逐条比对；补单测锁住；Grep 工具确认消费方 |
| **P0-1 连带删掉被别处 import 的东西** | 构建报错 | 删前用 Grep 工具（**不是 bash `grep "a\|b"`**，见 `MEMORY.md`）确认零消费方 |
| **P0-2 删除后追问理解变差** | 短追问答非所问 | 本地版门槛更准（`isContextDependentFollowUp`），风险低；保留 B 方案可回滚 |
| **P1-1 护栏过严** | 正常追问也拿不到上轮证据 | 只在命中时效词时禁止复用，其余仅加前缀 |
| **P1-2 降 `frequency_penalty` 后重复变多** | 回答开始复读 | 先做 B（删规则）不改参数；A 单独一次改动 + 前后对比 |
| **埋点被静默丢弃** | 量不到数据，以为「没有耗时」 | **实测不成立** —— `message.meta` 是整块展开，无需改白名单；已写成断言锁住这个前提（见 §4 ① 的更正） |
| **P1-3 动 Edge Function** | 限流 / 额度校验被绕过 | **属破坏性操作，必须先跟人确认**；不改校验逻辑，只合并读 |
| **09-24 的探针基线仍未取得** | P2 无法做消融验证 | 这是 P2 的前置阻塞，**不要因为卡住就不做 P0** |

---

## 7. 预期总账（推断，非实测）

| 项 | 现在 | P0 之后 | 依据 |
| --- | --- | --- | --- |
| `ROUTING_PATTERNS` 每轮实跑的正则数 | 23 | **14** | §1.4 逐条追消费方 |
| 短追问首字前的 LLM 往返 | 2 | **1** | §1.1 串行链 |
| `bohai-auto-router.js` | 435 行 | ~200 行 | — |
| `bohai-auto-decision.js` | 298 行 | ~120 行 | — |
| `autoDecision` 字段 | 19 | **5** | 生产读取点 |
| 死导出 / 死测试用例 | 10 个导出 + 5 个用例 | 0 | — |
| 提示词否定式 : 肯定式 | 161 : 66 | P2 后目标 ~120 : 90 | — |
| **首字延迟（实测，§9.4）** | — | **本地阶段 5~26ms；首字 1309~2103ms** | 游客 / `fast` 实测 3 轮 |
| **短追问省下的时间** | — | **约 1.3~2.1s / 轮** | 实测：第 2 轮本地阶段 9ms，旧实现在此处多一次 LLM 往返 |

**⚠️ 实测后的口径修正**：`plans/024` 早期把「首字延迟」归因于「本地串行链太长」，
**实测证明不成立** —— 本地阶段只有 5~26ms。真正的结构是：
**一次 LLM 往返 ≈ 1.3~2.1s，而旧实现在每轮短追问上多付了一次。**
所以优化的正确方向是「**减少往返次数**」，不是「缩短本地代码」。
后续若要继续压首字延迟，唯一有量级空间的是**上游模型本身**（换更快的模型 / 更近的接入点）。

**⚠️ 「首字 −1~4s」是推断。** §4 的第 ④ 步才产出真实数字；在那之前不要对外承诺具体秒数。

---

## 8. 一句话回答用户

> 规则多、慢、质量差，是**三件事**。
> 规则多的真身不是提示词，是**一条 2026-06 就废弃、却还在每轮跑的 auto 路由链**（23 类正则里 9 类已无活消费方，产出 19 个字段里只有 5 个被用）。
> 慢的真身不是规则长度，是**首字前的一次「白跑」模型调用**（Edge Function 里那几次串行 DB 只占 20~40ms，不是主因 —— 见 §P1-3 更正）。
> 质量差最像 bug 的一条是**陈旧证据被原样复用**，没有时间标记 —— 用户看到的「胡说」大多来自这里。
>
> 建议：先删那两条链（零语义风险、立刻可测），**提示词精简放到有埋点数据之后**。

---

## 9. 实施记录（2026-10-02）

**全部 6 项已落地。** 代码改动 **14 个文件 + 2 个新增**（`src/views/BOHAI/shared-rules.js`、
`tests/unit/bohai-latency-guards.test.js`），另加 2 个文档（本文件 + `docs/未完成任务清单.md`）。
`npm run verify` 全绿。

| 项 | 状态 | 关键产物 |
| --- | --- | --- |
| P0-3 埋点 | ✅ | `useChatEngine.js` 的 `markTiming` / `flushTiming`，6 个检查点写进 `meta.bohaiTiming` |
| P0-1 删废弃路由 | ✅ | `bohai-auto-router.js` 435→**254 行**；`bohai-auto-decision.js` 298→**68 行**；字段 19→**5** |
| P0-2 删追问改写 | ✅ | 删掉那次无条件 LLM 调用；`titleExtract` 参数随之从真源表删除 |
| P1-1 时效护栏 | ✅ | 复用跨轮证据前判 `ROUTING_FORUM_REALTIME_PATTERN`；复用则加「来自上一轮」前缀 |
| P1-2 参数解耦 | ✅ | 走**方案 B**：删 `responseRules` 里与 `frequency_penalty` 同向叠加的「不要重复已说过的内容」。**未动任何参数值** |
| P2-1 BASE 否定式转肯定 | ✅ | `<constraints>` 6 条（5 条否定）→ 6 条（**1 条否定 + 5 条肯定式动作描述**） |
| P2-2 抽规则常量 | ✅ | 新增 `src/views/BOHAI/shared-rules.js`；替换 **6 处**（非原方案的 12 处，原因见 §P2-2） |
| P1-3 Edge 快路径 | ⚠️ **已改代码，未部署** | `api-key-vault/index.ts` 两条分支的限流与额度并行；**需人工确认后单独部署 + 冒烟** |

### 9.1 自证（实数）

| 项 | 结果 |
| --- | --- |
| `npx eslint . -f json` 聚合 | **183 警告 / 0 错误**（棘轮上限 183，**持平**） |
| 逐文件对比 HEAD 与当前 | 我改的 6 个文件警告数 **31 → 31，零新增** |
| `npm run type-check` | PASS |
| `npm run verify`（完整） | **EXIT=0**；148 文件 / **2285 passed** / 1 skipped |
| 10 道门禁（views / structure / auth-validation / liquid-glass / important-budget / layering / dark-tokens:strict / first-paint / bohai-params / ratchets） | **全部 PASS** |

**⚠️ 关于「lint 警告应下降」的更正**：原方案预期 P0-1 会拉低警告数，实测**没有**。
原因是删掉的都是 **exported** 函数 —— 导出符号不产生 `no-unused-vars` 警告，
所以删它们不会让计数下降。棘轮持平（183），符合「不升」的要求。

### 9.2 反证（P0-1，已执行）

1. 改前抓 14 条典型语句 × 3 组开关的决策快照 → `/tmp/snapshot-before.json`
2. 改后重抓 → **`diff` 逐字节一致**
3. 再把 `HEAD` 版两个文件临时放回同目录，跑 **115 个检查点**的新旧对比脚本 →
   **不一致 0 个**（覆盖 `resolveBOHAIAutoModeDecision` × 3 组开关 + `resolveAutoModeDecisionLocally` × 有无 `isPostDraftRequest`）
4. 反向：把 `HEAD` 版恢复回去跑新单测 → **4 条结构断言变红**（字段数、正则数、缓存身份），恢复后全绿

### 9.3 测试改动

- `tests/unit/bohai-auto-router.test.js`：9 → **26** 用例。删掉 9 类死正则的断言；
  新增「5 个存活字段 × 14 条典型语句」的**保留项反证**组（这是防止收口误伤的锁）。
- `tests/unit/bohai-auto-decision.test.js`：25 → **8** 用例。删掉 10 个死导出的断言
  （原 `mergeAutoDecisionWithLocalGuardrails` 5 个用例测的就是死代码）。
- **新增** `tests/unit/bohai-latency-guards.test.js`（15 用例）：源码级**防回归锁**，
  逐条锁住本计划的 6 项删除/改写（追问改写调用不得回来、9 类死正则不得回来、
  `lastRoutedMode` 已删、时效护栏在位、`bohaiTiming` 6 个检查点在位、
  `responseRules` 里那句「不要重复」已删、规则常量被引用、BASE 约束已转肯定式）。
  ⚠️ 它必须用 `tests/helpers/source.js` 的 `stripComments` / `scriptSection` ——
  被删的写法在**注释里合法复述**（「为什么删掉它」），直接在原文上做否定断言会假红。
  **反证**：把 HEAD 版三个文件临时放回 → **13 / 15 条锁变红**（剩下 2 条是
  「14 类活正则仍在」与「`bohaiTiming` 持久化往返」，HEAD 下本来就成立）。

### 9.4 验收（2026-10-02 全部执行完毕，**实测数据**）

#### ✅ P1-3 已部署 + 冒烟通过

- 部署前先 `supabase functions download api-key-vault` 把**线上版本下载下来 diff** →
  与 `HEAD` **逐字节一致**（0 行差异），`_shared/{cors,rate-limiter,supabase}.ts` 也一致。
  ⇒ 确认这次部署**只会**引入我那一处改动，不会顺带推回别的状态。
- `supabase functions deploy api-key-vault --use-api` → 版本 **66 → 67**，`ACTIVE`。
- **冒烟（curl，4 条路径）**：

| 场景 | 结果 |
| --- | --- |
| 正常对话（游客 / fast） | **HTTP 200**，拿到真实回答（`model: THUDM/GLM-4-9B-0414`） |
| 模式不存在 | HTTP 400 `MODE_UNAVAILABLE`（**说明 policy 的错误仍在限流之后正常抛出**） |
| 模式 ID 格式非法 | HTTP 400 `MODE_ID_INVALID` |
| 非法 JSON body | HTTP 401 `INVALID_SESSION`（action 回落 `list`，行为与改前一致） |

- **最关键的一条：限流优先级未被改弱。** 连打 14 次（模式故意填错）：

```
#1~#7  HTTP 400 MODE_UNAVAILABLE
#8~#14 HTTP 429 RATE_LIMITED      ← 429 正确压过 400
```

  这正是 §P1-3 那条硬约束要防的回归：若把 `resolveRuntimeModelPolicy` 并进并行批次，
  被限流的用户会先看到「模式不可用」而不是 429。实测证明没有。

#### ✅ P0-3 真实数据已取得（并且它给出了 P0-2 的实测收益）

起 `vite`（**必须用 5173 端口** —— `_shared/cors.ts` 的 `ALLOWED_ORIGINS` 只放行
5173-5176 / 4173 / 生产域，用 5199 会被 CORS 挡住），Playwright 以**游客身份**跑真实对话
（`fast` 的 `min_tier` 就是 `guest`，不需要登录），读回 `localStorage` 里的 `meta.bohaiTiming`：

| 轮次 | configReady | contextReady | retrievalDone | requestSent | **firstToken** | done |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1（首问） | 0 | 23 | 25 | 26 | **2103** | 2112 |
| **2（短追问）** | 0 | 6 | 8 | **9** | **1309** | 1336 |
| 3 | 0 | 4 | 5 | 5 | 1318 | 1483 |

**三条结论**：

1. **本地阶段只占 5~26ms** ⇒ 本地代码（正则路由 / 检索编排 / prompt 组装 / 历史裁剪）
   **完全不是瓶颈**。首字延迟的 98%+ 在「Edge Function + 上游模型」。
2. **第 2 轮是短追问（≤160 字 + 历史 ≥2 条）—— 旧实现会在这里先发一次「追问改写」LLM 调用**，
   而同样的往返实测要 **1.3~2.1 秒**。所以 **P0-2 每轮短追问省下约 1.3~2.1 秒**（实测，非推断）。
3. **这也第三次确认 P1-3 的收益量级**：Edge 内部省 20~40ms，在 1300~2100ms 面前是 2~3%；
   真正值钱的是 P0-2 省掉的那一整段。

#### ✅ P1-1 两个分支都做了端到端验证

**第一版剧本是错的，记下来**：原以为「第 1 轮开社区搜索拿到证据 → 第 2 轮关掉 → 第 2 轮无证据」，
但实测第 2 轮**仍然检索到了新证据** —— 追问的 contextual blob 里含「论坛 + 最近」，
被 `resolveKnowledgeRoutingPlan` 判成 `forumRealtime` ⇒ `plan.forum = true`，
与「社区搜索开关」无关。**只要历史里出现「论坛」+时效词，forum 检索就会一直触发。**
所以剧本必须刻意避开时效词才能制造「本轮无证据」。

最终剧本（**两条都 PASS**）：

| 用例 | 剧本 | 断言 | 结果 |
| --- | --- | --- | --- |
| **T-A 护栏拦截** | 新对话 + 社区搜索 OFF →「今天有什么值得注意的」 | 命中时效词且无证据 ⇒ 注入 `<stale_evidence_note>`、**不复用** | ✅ PASS |
| **T-B 复用加前缀** | 新对话 + 社区搜索 ON →「论坛有什么帖子」（**刻意不含时效词**）→ 关掉 → 「介绍一下这些」 | 无证据 + 非时效词 ⇒ 复用上一轮证据并加「来自上一轮检索」前缀 | ✅ PASS |

**反证说明（诚实交代）**：把 `HEAD` 版 `useChatEngine.js` 换回去重跑，两条都 FAIL ——
但失败形态是「**捕获到的请求数为 0**」（`HEAD` 每轮多一次 LLM 调用，疑似与限流/沙箱交互），
不是「prompt 里没有那两个标记」，所以**这次反证被污染了，不算干净**。
不过有一条等价且更硬的证据：`stale_evidence_note` 与 `来自上一轮检索` 两个字符串
**在 `HEAD` 里各出现 0 次、在当前实现里各 1 次**（`git show HEAD:… | grep -c` 实测），
所以它们出现在真实请求的 system prompt 里，就证明是我新增的分支执行并产生的。

#### ⬜ P2-1 消融验证：仍未做（唯一剩下的一项）

否定式 → 肯定式是**行为变更**（§P2-1 已注明）。没有 guards 兜底，要做消融就得
「同一批问题跑两版 prompt + 人工盲评」，成本高且需要额度。**不声称零风险**，
建议按 §P2-1 的说明，先用 `bohaiTiming` 观察，攒够样本再评估。

---

### 9.5 附：本次踩到的两个环境坑（交接必读）

1. **dev server 必须用 5173**：`supabase/functions/_shared/cors.ts` 的 `ALLOWED_ORIGINS`
   是**精确匹配**（注释里写了「M4: 移除任意 localhost 端口前缀匹配以避免绕过」），
   只放行 `localhost/127.0.0.1` 的 **5173-5176 / 4173** + 生产域。
   用别的端口跑真实 AI 调用会得到 `blocked by CORS policy`，症状是
   「服务暂时繁忙，请稍后重试。详情：Failed to fetch」。
2. **Node 的 `fetch` 在本沙箱里会被代理改坏请求体**：同一个 Edge Function，
   `node fetch` 全部返回 401 `INVALID_SESSION`（body 解析失败 → action 回落 `list`），
   而 `curl` 同样的 body 返回 200。**测 Edge Function 用 curl，不要用 node fetch。**
   （浏览器里 Playwright 的 `fetch` 是正常的 —— 只有 node 侧受影响。）

---

## 10. 响应速度实测：A/B 对照（2026-10-02）

用户问「现在 BOHAI 的响应速度有提升吗」。答案分两半：**代码侧提升了（实测 −51%）**，
但**线上还没生效**（前端改动未提交，deploy 只在 push main 时触发）。

### 10.1 A/B 设计

同机、同场景、同 prompt，只换前端文件：
- **B 组（= 线上版）**：`git show HEAD:` 还原 11 个 BOHAI 前端文件
- **A 组（= 我的改动）**：工作树版本

每轮采样：新会话 → 热身一轮建立历史 → **测第 2 轮（短追问）的首字**。
首字用 **DOM 测量**（最后一条 `.message-content` 首次非空），各 4 次采样，样本间停 25s 避开 10 次/分限流。

### 10.2 结果

| | 短追问首字（中位数） | 区间（4 次） | 每轮 LLM 调用数 |
| --- | ---: | --- | ---: |
| **B 组 · 线上版（含追问改写）** | **3309 ms** | 2833 ~ 3605 ms | **2**（`runtime-chat` + `runtime-chat-stream`） |
| **A 组 · 我的改动** | **1612 ms** | 1521 ~ 1779 ms | **1**（只有 `runtime-chat-stream`） |
| **差值** | **−1697 ms（−51%）** | **两组区间完全不重叠** | −1 |

对照组（证明差异来源正确）：
- **热身轮（第 1 轮，无历史 ⇒ 不触发追问改写）两组一致**：A 组 2106/2151/1905/2213 ms，
  B 组 2499/1874/2185/1983 ms —— 均值 ~2094 vs ~2135 ms，**没有系统性差异**。
- **主生成那段流式耗时两组相当**：A 组 1200~1508 ms，B 组 1140~1505 ms。
  ⇒ 差异**全部**来自那次被删掉的非流式调用。
- 非流式 `runtime-chat` 单独用 curl 实测 **1.81 ~ 2.13 s**（5 次，很稳），与上面的 −1.7s 对得上。

### 10.3 ⚠️ 测量踩的坑（下次别再犯）

**第一版 A/B 用 `localStorage` 读「首字」，结论是错的**（测出「只差 100ms」）。
原因：会话持久化有 **500ms 防抖**（`SESSION_SAVE_DEBOUNCE_MS`），
所以在轮 2 开始后的头几百毫秒里，`localStorage` 里还是**上一轮的完整状态** ——
最后一条消息是上一轮的**回答**（非空）⇒ 探针立刻判定「首字已到」，
量到的其实是防抖时间（~300ms），两组都一样。

**正确做法**：测 AI 首字/落定要用 **DOM**（`.message-content` 最后一条的 textContent，
Vue 响应式是即时的），**不要用 `localStorage`**。这条已写进 `MEMORY.md`。

### 10.4 线上生效状态（必须说清）

| 改动 | 位置 | 线上是否生效 |
| --- | --- | --- |
| P1-3 Edge Function 并行化 | `supabase/functions/api-key-vault` | ✅ **已部署（v67）**，但只值 20~40ms |
| P0-1 / P0-2 / P0-3 / P1-1 / P1-2 / P2-* | 前端 `src/**` | ❌ **未生效** —— `useChatEngine.js` 等仍是 ` M`（未提交），而 `deploy.yml` 只在 `push: branches: [main]` 时触发 |

⇒ **当前线上用户感受到的速度与改动前基本一致**（只有 Edge Function 那 20~40ms）。
要让这 −1.7s 真正落到用户身上，必须**提交 + push main 触发部署**（或手动 `workflow_dispatch`）。
