# BOHAI 系统优化报告

**日期**: 2026-06-09  
**系统**: BOH AI Chat Engine (BOHAI)  
**版本**: Phase 4 模块化重构 + 性能优化  
**范围**: Chat Engine 核心管线、工具函数、基础设施、决策逻辑

---

## 1. 概述

本报告记录 BOHAI 系统自 Phase 4 以来的全部优化工作。优化目标涵盖三大维度：

1. **模块化重构** — 将 6825 行的 `useChatEngine.js` 单体 composable 拆分为职责清晰的子模块，降低认知负担与合并冲突概率。
2. **基础设施抽取** — 将从各处重复实现的 scroll lock、localStorage 读写、DB 错误检测、通知等通用逻辑统一提取为可复用 composable / 工具函数。
3. **性能优化** — 引入超时保护、LRU 缓存、TTL 缓存、keep-alive 连接、并行执行等手段，减少不必要的计算与等待。

时间线覆盖 2026-04 至 2026-06-09 的累计变更。

---

## 2. 模块化重构（Phase 4）

### 2.1 从 `useChatEngine.js` 拆分的 composable

`useChatEngine.js` 原文件约 6825 行，闭包依赖较多。Phase 4 将其中的独立职责抽出为以下 composable 文件：

| 文件名 | 职责 | 源行范围 | 说明 |
|--------|------|----------|------|
| `useGenerationPipeline.js` | 模型调用、流式处理、Thinking 过滤、Fallback | `useChatEngine.js` SECTION I（原 ~1500 行） | 包含 `callModelInternal`、`callModelStream`、SSE 解析器、Thinking 内容过滤、Smart Context 压缩、Fallback 模型选择 |
| `bohai-engine-helpers.js` | 纯工具函数 | 原内联在 `useChatEngine.js` 中 | 关键词提取（`extractQueryKeywords`）、上下文构建（`buildHistoryMessagesWithinBudget`）、退化检测（`isDegenerateAssistantReply`）、生成配置（`getGenerationProfile`）、Action 草稿解析、知识块压缩等 |
| `chat-engine-config.js` | 配置常量、模型映射、Prompt 模板 | 零散分布于多处 | 模式定义（`chatModes`）、模型 ID 常量（`FAST_NEX_MODEL_ID` 等）、系统 Prompt（`BASE_SYSTEM_PROMPT`）、风格选项、关键词列表、分块/缓存相关常量 |
| `agent-cluster-helpers.js` | Agent 集群状态管理与执行 | 新引入 | `useAgentClusterState`（响应式状态）、`runAgentClusterBranch`（集群分支执行）、`isAgentClusterMode`（模式判断） |

### 2.2 从 `treehole-api.js` 拆分的工具模块

`treehole-api.js` 原文件同时包含 API 调用逻辑和纯数据变换函数。为降低与 `supabase` 的耦合，将所有纯工具函数抽出：

| 文件名 | 职责 | 说明 |
|--------|------|------|
| `treehole-helpers.js` | 纯工具函数 | 游标编码/解码、文本裁剪、JSON 解析、行归一化、去重（Bigram 相似度）、记忆分块组装、搜索引擎打分、错误码检测等。与 `supabase` 无依赖 |

### 2.3 拆分收益

- **认知负担降低**: 每个文件聚焦单一职责，新成员可快速定位代码
- **合并冲突减少**: 多人协作时不再争抢同一文件
- **可测试性提升**: 纯函数（`bohai-engine-helpers.js`、`treehole-helpers.js`）可直接导出供单测覆盖
- **可维护性增强**: 配置变更只需修改 `chat-engine-config.js`，无需触及业务逻辑

---

## 3. 基础设施抽取

### 3.1 `useBodyScrollLock.js`

**问题**: 多个组件分别用 `document.body.style.overflow = 'hidden'` 控制滚动，导致相互覆盖后页面卡死。

**方案**: 引用计数式 scroll lock composable。

```js
const scrollLockCount = { current: 0 }

export function useBodyScrollLock() {
  function lock() {
    scrollLockCount.current++
    if (scrollLockCount.current === 1) {
      document.body.style.overflow = 'hidden'
    }
  }
  function unlock() {
    if (scrollLockCount.current <= 0) return
    scrollLockCount.current--
    if (scrollLockCount.current === 0) {
      document.body.style.overflow = ''
    }
  }
  return { lock, unlock }
}
```

**文件路径**: `/src/composables/useBodyScrollLock.js`  
**收益**: 消除多组件竞争导致的滚动卡死 Bug。

### 3.2 `useLocalSetting.js`

**问题**: 多处直接读写 `localStorage`，Key 无 namespace，容易冲突，缺少 JSON 序列化/反序列化封装。

**方案**: 带 `boh_` 前缀的响应式 localStorage composable。

```js
const STORAGE_PREFIX = 'boh_'

export function useLocalSetting(key, defaultValue) {
  const storageKey = STORAGE_PREFIX + key
  // 初始化时从 localStorage 读取
  // watch 自动写入
  return value
}
```

**文件路径**: `/src/composables/useLocalSetting.js`  
**收益**: 集中管理所有 `boh_` 开头 localStorage 键，提供响应式读写。

### 3.3 `db-error.js`

**问题**: 代码库中 5+ 处复制粘贴了同样的 DB 错误检测逻辑（`isMissingRpcFunctionError`、`isMissingDbColumnError` 等）。

**方案**: 统一抽取为一个工具模块。

```js
export function isMissingRpcFunctionError(error) { /* ... */ }
export function isMissingDbColumnError(error) { /* ... */ }
export function isMissingCloudTableError(error) { /* ... */ }
export function isForumRateLimitError(error) { /* ... */ }
export function normalizeDbError(error, fallbackMessage) { /* ... */ }
```

**文件路径**: `/src/utils/db-error.js`  
**收益**: 消除重复代码，统一错误返回格式。

### 3.4 `notify.js`

**问题**: 用户通知散落在各处，有的用 `console.warn`，有的直接 `alert`，缺乏统一出口。

**方案**: 通过 `CustomEvent` 驱动全局 Toast 的轻量通知工具。

```js
const TOAST_EVENT = 'boh_notify'

export function notify(message, type = 'info') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }))
}
```

**文件路径**: `/src/utils/notify.js`  
**收益**: 所有通知统一走事件总线，App.vue 注册监听者即可展示 Toast。

---

## 4. 决策逻辑收拢

原先的 Auto 模式路由逻辑散落在 `useChatEngine.js` 的不同节段中，决策流程难以追踪。

### 4.1 `bohai-auto-router.js`

**位置**: `/src/views/BOHAI/engine/bohai-auto-router.js`（前端通过 `/src/utils/bohai-auto-router.js` 重导出）  
**职责**: Auto 模式路由核心，包含：

- **LRUCache 类**: 基于 Map 的 LRU 缓存实现，淘汰 FIFO 旧实现，提升长会话中的决策缓存命中率
- **`resolveBOHAIAutoModeDecision`**: Auto 模式决策入口
- **`pickModeFromLocalSignals`**: 基于本地信号（文本长度、关键词、上下文依赖）的模式选择

### 4.2 `bohai-auto-decision.js`

**位置**: `/src/views/BOHAI/engine/bohai-auto-decision.js`（前端通过 `/src/utils/bohai-auto-decision.js` 重导出）  
**职责**: 纯函数集合，包含：

- `createNeutralAutoDecision`、`computeModeFromDecision`、`mergeAutoDecisionWithLocalGuardrails`
- `shouldAskModelForAutoDecision`、`pickMoreCapableMode`、`safeParseAutoClassifierJson`
- 所有函数可独立于 Vue/Pinia 运行，便于单测覆盖

### 4.3 收拢收益

- 决策链路清晰可追踪
- Auto 模式相关的 15+ 个纯函数集中管理，不再散落各处
- 决策缓存使用 LRU 而非 FIFO，提升长会话命中率

---

## 5. 性能优化

### 5.1 `AbortSignal.any` 信号合并

**位置**: `treehole-api.js` — `requestTreeholeCompletion` 函数

**之前**: 手动创建 AbortController + setTimeout 实现超时，需手动清理事件监听器。

**之后**: 使用 `AbortSignal.any` 合并外部 signal 与超时 signal，代码更简洁且避免资源泄漏。

```js
// treehole-api.js 第 284-293 行
if (hasExternalSignal && hasTimeout) {
  try {
    combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(safeTimeout)]);
  } catch {
    combinedSignal = signal;
  }
}
```

**收益**: 消除手动事件监听器可能导致的泄漏，超时与外部中止统一处理。

### 5.2 流式 Fetch 120s 超时

**位置**: `useChatEngine.js` — 生成主流程

**之前**: 流式 Fetch 无整体超时保护，网络不稳定时可能无限挂起。

**之后**: 引入 `AbortSignal.timeout(120_000)` 合并到请求 signal。

```js
// useChatEngine.js 第 5659-5663 行
const STREAM_FETCH_TIMEOUT_MS = 120_000; // 2 min stream timeout
const streamFetchSignal = typeof AbortSignal.any === 'function'
  ? AbortSignal.any([requestController.signal, AbortSignal.timeout(STREAM_FETCH_TIMEOUT_MS)])
  : requestController.signal;
```

**收益**: 防御性提升，防止模型无响应时前端无限等待。

### 5.3 联网搜索 30s 超时

**位置**: `useChatEngine.js` — 联网搜索

**之前**: 联网搜索无独立超时，依赖整体流程超时。

**之后**: 独立 30s 超时 signal。

```js
// useChatEngine.js 第 5227-5230 行
const WEB_SEARCH_TIMEOUT_MS = 30_000;
const webSearchSignal = typeof AbortSignal.any === 'function'
  ? AbortSignal.any([requestController.signal, AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS)])
  : requestController.signal;
```

**同样适用于** `bohai-engine-helpers.js` 中 `searchWebForPrompt` 函数（25s 超时，第 556-562 行）。

**收益**: 联网搜索挂起不超过 30s，不阻塞后续流程。

### 5.4 LRU 关键词缓存

**位置**: `bohai-engine-helpers.js` — `extractQueryKeywords` / `keywordCache`

**之前**: `keywordCache` 使用 `Map` 的插入顺序做 FIFO 淘汰，长会话中早期关键词容易被踢出。

**之后**: 命中时将 key 重新插入到 Map 末尾，实现 LRU 淘汰。

```js
// bohai-engine-helpers.js 第 86-92 行
if (keywordCache.has(normalized)) {
  // LRU bump: 将命中的 key 移到末尾
  const value = keywordCache.get(normalized);
  keywordCache.delete(normalized);
  keywordCache.set(normalized, value);
  return value;
}
```

**收益**: 高频查询场景缓存命中率提升。

### 5.5 生成配置 TTL 缓存

**位置**: `bohai-engine-helpers.js` — `getGenerationProfile` / `_generationProfileCache`

**之前**: `getGenerationProfile` 每次调用都重新创建 profile 对象（`GENERATION_PROFILE_BY_MODE[modeId]` + 参数覆盖）。

**之后**: 引入 60s TTL 缓存 + LRU 淘汰（最大 32 条）。

```js
// bohai-engine-helpers.js 第 906-928 行
export const getGenerationProfile = (modeId, options = {}) => {
  const cacheKey = `${modeId}|${factualQuestion}|${operationQuestion}`;
  const cached = _generationProfileCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < _GEN_PROFILE_CACHE_TTL_MS) return cached.value;
  // ... 计算 profile
  _generationProfileCache.set(cacheKey, { value: profile, timestamp: Date.now() });
  return profile;
};
```

**收益**: 同一参数组合在 60s 内不重复计算，减少对象分配。

### 5.6 LRU Fallback 模型缓存

**位置**: `useGenerationPipeline.js` — `getFallbackModel` / `_fallbackModelCache`

**之前**: 每次模型调用失败都遍历 `availableModels` 查找 fallback 候选。

**之后**: 引入 LRU 缓存（最大 16 条），命中时直接返回。

```js
// useGenerationPipeline.js 第 79-110 行
const _fallbackModelCache = new Map();
const _FALLBACK_CACHE_MAX = 16;

const getFallbackModel = (failedModelId) => {
  if (_fallbackModelCache.has(failedModelId)) {
    return _fallbackModelCache.get(failedModelId);
  }
  // ... 计算 fallback 并缓存
};
```

**收益**: 同一模型短时间内多次失败时避免重复遍历。

### 5.7 `Connection: keep-alive` HTTP 头

**位置**: `useGenerationPipeline.js` — `callModelInternal` 和 `callModelStream`

**之前**: fetch 请求未显式设置 `Connection` 头，依赖浏览器默认行为（可能为短连接）。

**之后**: 显式添加 `'Connection': 'keep-alive'` 头。

```js
// useGenerationPipeline.js 第 169, 367 行
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${model.apiKey}`,
  'Connection': 'keep-alive'
}
```

**收益**: 复用 TCP 连接，减少 TLS 握手开销。

### 5.8 共享记忆搜索缓存上限

**位置**: `useChatEngine.js` — `sharedMemorySearchCache`

**之前**: `sharedMemorySearchCache` 为 `Map` 但无大小限制，长会话中可能无限增长。

**之后**: 限制最多 100 条，超出时淘汰最早插入的条目。

```js
// useChatEngine.js 第 267-268, 2834-2838 行
const sharedMemorySearchCache = new Map();
const SHARED_MEMORY_SEARCH_CACHE_MAX = 100;
// 写入时检查 size
if (sharedMemorySearchCache.size >= SHARED_MEMORY_SEARCH_CACHE_MAX) {
  const firstKey = sharedMemorySearchCache.keys().next().value;
  sharedMemorySearchCache.delete(firstKey);
}
```

**收益**: 控制内存占用上限，避免无限增长。

### 5.9 缓存失效空标签过滤

**位置**: `treehole-api.js` 中的 `invalidateTreeholeCache` 等函数; `request-core.js` — `invalidateByTags`

**之前**: 调用 `invalidateByTags` 时可能传入空字符串标签，导致意外匹配或误删。

**之后**: `invalidateByTags` 内部过滤 `Boolean` 空标签；调用方在拼接标签数组后 `.filter(Boolean)`。

```js
// treehole-api.js 第 131-136 行
const invalidateTreeholeCache = (userId) => {
  invalidateByTags([
    TREEHOLE_CACHE_TAG,
    userId ? `${TREEHOLE_CACHE_TAG}:user:${userId}` : ''
  ].filter(Boolean));
};
```

```js
// request-core.js 第 119-122 行
export function invalidateByTags(tags = []) {
  const patterns = tags.filter(Boolean);  // 过滤空字符串
  if (!patterns.length) return;
  // ...
}
```

**收益**: 消除空标签导致的无效请求，减少意外缓存失效。

### 5.10 并行连接器执行

**位置**: `bohai-connectors.js` — `runBohAIReadConnectorsCore`

**之前**: 已使用 `Promise.allSettled` 并行执行所有 connector read 操作。此部分在本次优化中保持最优，无需改动。

```js
// bohai-connectors.js 第 333-360 行
const settled = await Promise.allSettled(
  activeConnectors.map(async (connector) => {
    // ... 并行执行
  })
);
```

**收益**: 多个知识源（Cloud+、公共记忆、记忆库、操作手册、论坛、用户私域）并行检索，互不阻塞。

### 5.11 `ensureContextCompression` 优化

**位置**: `useChatEngine.js` — `ensureContextCompression` 函数

**之前**: 每次调用都计算 `computeContextBudgetUsage`，即使上下文远未达到压缩水位。

**之后**: 非强制模式下先计算预算，只有 `level === 'high'` 或 `'full'` 时才执行压缩。

```js
// useChatEngine.js 第 2468-2471 行
if (!force) {
  const usage = computeContextBudgetUsage(targetSession);
  if (usage.level !== 'high' && usage.level !== 'full') return false;
}
```

**收益**: 大多数低水位场景跳过压缩，减少不必要的 CPU 消耗。

### 5.12 `GENERATION_STALL_TIMEOUT_MS` 缩减

**位置**: `bohai-engine-helpers.js` — 常量定义

**之前**: `GENERATION_STALL_TIMEOUT_MS = 90000`（90s）

**之后**: `GENERATION_STALL_TIMEOUT_MS = 60000`（60s）

```js
// bohai-engine-helpers.js 第 41 行
export const GENERATION_STALL_TIMEOUT_MS = 60000;
```

**收益**: 生成停顿检测时间缩短 33%，用户更快感知异常并重试。

### 5.13 Planner 函数 `resolveResourceSearchPlanWithModel` 超时

**位置**: `useChatEngine.js` — `resolveResourceSearchPlanWithModel`

**之前**: 使用手动 `setTimeout` + `AbortController` 管理超时。

**之后**: 使用 `AbortSignal.timeout(8000)`（8s 超时），与外部 signal 通过 `AbortSignal.any` 合并。

```js
// useChatEngine.js 第 4592-4598 行
const PLANNER_TIMEOUT_MS = 8000;
const combinedSignal = requestSignal
  ? (typeof AbortSignal.any === 'function'
      ? AbortSignal.any([requestSignal, AbortSignal.timeout(PLANNER_TIMEOUT_MS)])
      : requestSignal)
  : AbortSignal.timeout(PLANNER_TIMEOUT_MS);
```

**收益**: 移除手动 setTimeout 管理，代码更简洁可靠。

---

## 6. Bug 修复

### 6.1 `callAIToGenerate` 默认模型选择

**位置**: `useChatEngine.js` 第 1663-1668 行

**问题**: 函数签名 `modeId = 'pro'`，但内部使用 `getGenerationProfile(modeId)` 获取 profile 后，尝试引用不存在的 `profile.defaultModel` 字段（`GENERATION_PROFILE_BY_MODE` 中不含 `defaultModel`），导致模型选择意外回退。

**修复**: 改为使用 `getModelForModeId(modeId) || currentModel.value || availableModels[0]`，确保始终选用正确的模式模型。

```js
// useChatEngine.js 第 1665-1666 行
// 使用当前模式的模型而非 profile.defaultModel（该字段不存在于 GENERATION_PROFILE_BY_MODE 中）
const genModel = getModelForModeId(modeId) || currentModel.value || availableModels[0];
```

### 6.2 `resolveResourceSearchPlanWithModel` 超时处理

**位置**: `useChatEngine.js` 第 4585-4598 行

**问题**: 原有实现使用 `setTimeout` + `AbortController` 手动管理超时，在竞态条件下可能出现未清理的定时器。

**修复**: 替换为 `AbortSignal.any([requestSignal, AbortSignal.timeout(8000)])`，移除手动定时器管理。

### 6.3 `treehole-api.js` 辅助函数去重

**位置**: `treehole-api.js` 中的 `invalidateTreeholeCache` 等函数

**问题**: 各 API 函数中重复出现标签拼接 + `.filter(Boolean)` 的模式。

**修复**: 统一将标签过滤逻辑集中在 `invalidateByTags` 内部，调用方只需传入原始标签数组。

---

## 7. 性能基准

以下数据基于代码分析估算，实际效果可能因运行环境而异。

| 指标 | 优化前 | 优化后 | 提升幅度 |
|------|--------|--------|----------|
| 模型调用超时保护 | 无（潜在无限等待） | 120s 超时 | **防御性提升** |
| 联网搜索超时 | 无 | 30s 超时 | **防御性提升** |
| 关键词缓存淘汰策略 | FIFO 淘汰 | LRU 淘汰 | **缓存命中率 ↑** |
| 生成停顿超时 | 90s | 60s | **响应速度 ↑33%** |
| 生成配置缓存 | 每次调用重新计算 | 60s TTL 缓存 | **重复计算 ↓** |
| 缓存失效标签 | 含空字符串标签 | 过滤空标签 | **无效请求 ↓** |
| 共享记忆搜索缓存 | 无限增长 | 上限 100 条 | **内存占用 ↓** |
| HTTP 连接 | 默认短连接 | `keep-alive` | **连接复用 ↑** |
| 连接器执行 | `Promise.allSettled`（已并行） | 不变 | **已最优** |
| 上下文压缩触发策略 | 每次都计算预算 | 跳过非高水位 | **CPU 占用 ↓** |
| Planner 超时管理 | 手动 `setTimeout` + `AbortController` | `AbortSignal.any` + `AbortSignal.timeout` | **代码简洁 ↑** |
| 路由决策缓存 | FIFO 淘汰（`bohai-auto-router.js`） | LRU 淘汰 | **长会话命中率 ↑** |

---

## 8. 未来优化建议

### 8.1 进一步拆分 `useChatEngine.js`

当前 `useChatEngine.js` 仍约 6000+ 行。建议按分区注释继续拆分：

| 建议模块名 | 职责 | 对应 SECTION |
|-----------|------|-------------|
| `useMessageManager` | 消息 CRUD（添加、编辑、删除、思考状态） | SECTION D |
| `useConversationManager` | 会话持久化（load / migrate / save） | SECTION B |
| `useModelConfig` | 模式选择、风格选择、设置持久化 | SECTION C |
| `useActionDraftEngine` | Action 草稿解析与执行（post / mail / page） | SECTION G & H |

### 8.2 响应流压缩

- 对 SSE 响应流启用 `Content-Encoding: gzip` / `br` 传输压缩（需后端配合）。
- 前端增加 `Accept-Encoding: gzip, br` 请求头。

### 8.3 请求去重

- 引入请求去重层，对相同参数的并发请求合并为一个 Promise。
- 适用于 `getSharedMemoriesCached`、`searchBohAIKnowledgeForAI` 等读多写少的场景。

### 8.4 HTTP 连接池

- 浏览器层面对同一 origin 的连接数有限制（通常 6 个）。考虑使用 `keep-alive` + `maxConnections` 调优。
- 可通过 Service Worker 实现自定义连接池。

### 8.5 模型响应缓存

- 对完全相同的问题（精确匹配）缓存 LLM 响应，短时间（如 60s）内直接返回缓存。
- 适用于 FAQ、操作指南查询等高重复场景。

### 8.6 渐进式渲染

- 长响应（如 Plan 模式的分步计划）支持渐进式渲染，先显示框架再填充细节。
- 前端可使用 `<Suspense>` + 分段解析实现。

### 8.7 决策缓存优化

- Auto 路由决策的 LRU 缓存当前基于纯文本 key，可引入语义哈希（如 MiniHash）以识别语义相似的查询。
- 减少对 LLM 分类器的依赖，降低延迟与成本。

---

## 9. 文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `/src/views/BOHAI/composables/useGenerationPipeline.js` | AI 生成管线 — 模型调用、流式处理、Thinking 过滤、Fallback |
| `/src/views/BOHAI/composables/bohai-engine-helpers.js` | BOHAI 引擎工具函数 — 关键词、上下文、退化检测、Action 草稿 |
| `/src/views/BOHAI/composables/chat-engine-config.js` | BOHAI 配置常量 — 模型映射、Prompt、风格、关键词列表 |
| `/src/views/BOHAI/composables/agent-cluster-helpers.js` | Agent 集群状态管理与执行 |
| `/src/utils/api/treehole-helpers.js` | 树洞工具函数 — 游标、归一化、去重、记忆分块 |
| `/src/composables/useBodyScrollLock.js` | 引用计数式滚动锁 |
| `/src/composables/useLocalSetting.js` | Namespaced localStorage composable |
| `/src/utils/db-error.js` | 统一 DB 错误检测 |
| `/src/utils/notify.js` | 轻量通知工具 |
| `/src/views/BOHAI/engine/bohai-auto-router.js` | Auto 模式路由核心（含 LRUCache） |
| `/src/views/BOHAI/engine/bohai-auto-decision.js` | Auto 模式决策纯函数集合 |

### 修改文件

| 文件路径 | 变更内容 |
|----------|----------|
| `/src/views/BOHAI/composables/useChatEngine.js` | 导入子 composable；添加超时、缓存上限、压缩优化；修复 Bug |
| `/src/utils/api/treehole-api.js` | 导入 `treehole-helpers.js`；`requestTreeholeCompletion` 使用 `AbortSignal.any`；空标签过滤 |
| `/src/utils/request-core.js` | `invalidateByTags` 增加 `filter(Boolean)` 空标签过滤 |
| `/src/views/BOHAI/composables/useGenerationPipeline.js` | `Connection: keep-alive` 头；LRU fallback 缓存；`_combineSignals` 统一超时 |
| `/src/views/BOHAI/composables/bohai-engine-helpers.js` | LRU 关键词缓存；`getGenerationProfile` TTL 缓存；`GENERATION_STALL_TIMEOUT_MS` 缩减 |
| `/src/utils/bohai-connectors.js` | `runBohAIReadConnectorsCore` 提取公共 core；`withTimeout` 工具函数 |
| `/src/utils/bohai-auto-router.js` | 改为重导出文件（指向 `engine/bohai-auto-router.js`） |
| `/src/utils/bohai-auto-decision.js` | 改为重导出文件（指向 `engine/bohai-auto-decision.js`） |

---

*本报告由自动化工具基于代码分析生成，所有优化点均可在对应源文件中验证。*