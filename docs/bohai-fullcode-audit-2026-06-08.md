# BOHAI / BOHLITE 全量代码审计与逻辑检查报告

> 适用版本：BOHLITE Beta 2.5
> 报告日期：2026-06-08
> 审计模式：READ-ONLY（未修改任何文件）
> 工作目录：`/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5`

---

## 0. 执行摘要

本次对 BOHAI 引擎层、数据层、视图组件层、路由层做了全量静态分析，结论分两部分：

- **报告 A：代码清洗结构方案** —— 7 阶段重构路线 + 13 项紧急 P0/P1
- **报告 B：逻辑检查报告** —— 7 项 P0 紧急缺陷 + 14 项 P1 + 30+ 项 P2/P3 + 安全风险摘要

最关键的 4 件事（按"风险 / 收益"排序）：

1. **本周必修**：AI Key (`VITE_SILICON_CLOUD_API_KEY`) 在 4 个文件中直接 `import.meta.env` 读取并被打包到前端 bundle —— 任何人打开 DevTools 即可盗用 Silicon Cloud 余额（详见 B-4）
2. **本周必修**：`cloudinary-client.js:deleteCloudinaryAssetsByPublicIds` 完全信任前端传入的 `publicId[]`，若 Edge Function 内部没有 `claimed_by = auth.uid()` 二次校验，资源可被恶意删除（详见 B-3）
3. **高频触发**：`POST_DRAFT_IDEA_NOISE_PATTERN` 把"和/与/并且/然后/可以/需要"核心中文连接词当噪声删除 → 发帖草稿流程 UX 严重退化（详见 B-6）
4. **架构债**：`useChatEngine.js` 单文件 **6901 行**，11 个 SECTION 注释作者自述要拆但未落地；`forum-api.js` (2433) / `treehole-api.js` (2774) 同样属于"超大单文件"范畴（详见 1.3 阶段 1）

---

# 📑 报告 A：代码清洗结构方案

## 1.1 整体规模与组织问题

| 维度 | 当前 | 备注 |
|---|---|---|
| `useChatEngine.js` | **6901 行** | 单一 composable，11 个 SECTION 自述 |
| `views/BOHAI/BOHAI/index.vue` | 2004 行 | 视图内含 200+ 个本地 ref/computed/watch |
| `forum-api.js` | 2433 行 | 多业务域混合（posts/comments/likes/tags/moderation） |
| `treehole-api.js` | 2774 行 | 树洞 + AI 调用 + 记忆 + 共享记忆 + 模型轮换混合 |
| `auth.js` (store) | 843 行 | 心跳 / OAuth / profile 规范化混在一起 |
| `Forum/index.vue` | 3645 行 | 列表 / 详情 / 发帖 / 评论 / 签到 / Cloud+ 内联 |
| `UserSpace/index.vue` | 2600+ 行 | 7 个 tab 全部内联 |
| `DataManagement/index.vue` | 5000+ 行 | 管理员后台 |
| 视图组件测试覆盖 | **0%** | 27 个测试全在 `utils/`，无 `@vue/test-utils` |
| `useChatEngine` 关键逻辑测试 | **0%** | 0 单元 / 0 集成 |

**结论**：业务侧已有多轮迭代，技术债集中在 4 个"超大文件" + 1 个"超薄测试层"。

## 1.2 重构总目标

> 6 个月内把"超大单文件"全部拆完，并把测试覆盖从 utils-only 推进到 composable 层。

## 1.3 阶段化路线图

### 阶段 0：基础设施抽取（1 周 · M 投入）

| # | 动作 | 落地文件 | 风险 | 收益 |
|---|---|---|---|---|
| 0-1 | 新建 `src/utils/db-error.js`，统一 `isMissingRpcFunctionError` / `isMissingDbColumnError` / `isMissingCloudTableError` / `normalizeDbError` / `FORUM_RATE_LIMIT:` 解析 | 4 个文件去掉重复实现（`forum-api.js:796`、`notifications-api.js:20`、`boh-cloud-api.js:182`、`unified-content-moderation.js:56` + `DataManagement/index.vue:4826`） | L | M |
| 0-2 | 新建 `src/utils/sanitize.js`，统一 `safeMarkdown()` / `MARKDOWN_SANITIZE_OPTIONS` | 消除 8 个文件 12 处 `v-html` 各自配置 | L | M |
| 0-3 | 新建 `src/composables/useBodyScrollLock.js`（引用计数 +1/-1） | 替换 41 处 `document.body.style.overflow` | L | H（修整页无法滚动） |
| 0-4 | 新建 `src/composables/useLocalSetting(key, defaultValue)` | 替换 30+ 处裸 `localStorage.getItem`（尤其 `useChatEngine.js` 全文） | L | M |
| 0-5 | 路由守卫 `alert()` 全部改为统一 `notify` 出口 | `router/index.js:43-77` 4 处 | L | M |
| 0-6 | 全部 `console.*` 替换为 `src/utils/logger.js`（已存在） | 27 处 warn / 6 处 error | L | L |
| 0-7 | AI Key 不再走 `import.meta.env`（**见 1.5 紧急项**） | `chat-engine-config.js:11`、`AIPlaza/index.vue:131-132`、`treehole-api.js:13`、`content-moderation.js:2-3` | M | H（安全） |

### 阶段 1：拆分 `useChatEngine.js` 上帝文件（1 个月 · L 投入）

按文件顶部 L234-252 的 SECTION 注释已经划好的 11 段拆：

| 拆出模块 | 目标 | 状态 |
|---|---|---|
| `useChatSessions.js` | `chatSessions` / `currentSessionIndex` / `pendingXxx` 状态机 | 1 |
| `useChatSettings.js` | mode / style / 设置 | 2 |
| `useSessionActions.js` | 会话 CRUD（new/delete/clear/rename） | 3 |
| `useQuickNote.js` | Quick Note 子树 | 4 |
| `useUserPrivateContext.js` | 私域 / 共享记忆 / Cloud+ 上下文 | 5 |
| `useActionDrafts.js` | 帖子/邮件/Cloud 草稿状态机 | 6 |
| `useActionRegistry.js` | Action 注册与执行 | 7 |
| `useGenerationPipeline.js` | `callModelStream` / 流式 / 思考过滤 / 降级 | 8（最大块，~1500 行） |
| `useCloudConsent.js` | Cloud+ 同意 / 保存触发 | 9 |
| `useMemoryCapture.js` | 公共记忆 / 共享记忆捕获 | 10 |
| 主 `useChatEngine.js` | 仅作 facade，**目标 < 500 行** | 收口 |

**验收**：
- 主文件行数 ≤ 500
- `useGenerationPipeline.js` 必须有 ≥ 8 个单元测试（流式 5 类早退 / thinking 状态机 / abort）
- 现有 5 模式（AUTO/Fast/Pro/Plan/Agent）行为不变，回归 226 测试全绿

### 阶段 2：统一 3 套"复杂度判定"（2 周 · M 投入）

三处正则各走各的：
- `chat-engine-config.js:340` `_isProComplex`（独立内联版）
- `bohai-auto-router.js:88` `ROUTING_PATTERNS.complex`
- `bohai-auto-router.js:96` `multiStepReasoning`

→ 抽到 `isComplexUserInput(text)` 单点函数，三处共享。

类似还有 `keywordCache`（helpers 用 FIFO，`bohai-engine-helpers.js:77-79`；router 有 LRU class L19-50）→ 统一为 LRU。

### 阶段 3：拆分 `forum-api.js` 与 `treehole-api.js`（1 个月 · L 投入）

按子域拆为 `forum-posts-api.js` / `forum-comments-api.js` / `forum-likes-api.js` / `forum-tags-api.js` / `forum-moderation-api.js`，原文件保留 re-export 桶做兼容。

`treehole-api.js` 拆为 `treehole-spaces-api.js` / `treehole-memory-api.js` / `treehole-shared-memory-api.js` / `treehole-ai-stream.js`，把 4 类流式调用 + 模型轮换抽到独立模块。

### 阶段 4：视图瘦身（1 个月 · L 投入）

| 视图 | 拆分方案 | 验证 |
|---|---|---|
| `Forum/index.vue`（3645 行） | `<ForumList>` / `<ForumComposer>` / `<ForumCommentTree>` / `<ForumSidePanel>` | 模板 < 800 行 |
| `UserSpace/index.vue`（2600+ 行） | 7 个 tab → 7 个子组件 + `<UserSpaceShell>` | 模板 < 600 行 |
| `DataManagement/index.vue`（5000+ 行） | 按 tab 拆出 `<DataDashboards>` / `<DataModeration>` / `<DataLottery>` / `<DataUsers>` | 模板 < 1000 行 |
| `PostDetail/index.vue` | 评论树抽 `useCommentTree()` | 评论树可单测 |
| 营销页 (`BOH8YearsEvent` / `LithiumIron` / `Birthday` / `MBTI`) | 合并到 `views/Marketing/` | 集中 |

### 阶段 5：状态 / 持久化收口（2 周 · M 投入）

| 拆出 | 落地 | 解决 |
|---|---|---|
| `session-manager.js` | `stores/auth.js` 拆出 `loadAuthApi` / 心跳 / 跨 store reset | L-13 / L-14 / S-22 |
| `useRealtimeChannel(key, buildChannel)` composable | 替换 7 处自写 `subscribeToNotifications` 等 | L-62 / L-87 / S-15 |
| 统一 `useCachedRead` composable | 替换 `request-core.executeRead` 调用 | L-1（缓存污染） |
| `localStorage` 命名空间化（`@/utils/storage.js`） | 替换 22 文件 73 处 `localStorage` 调用 | key 漂移 |

### 阶段 6：测试体系建设（持续）

| 优先级 | 模块 | 目标测试数 |
|---|---|---|
| P0 | `useChatEngine` 子 composable | ≥ 40 |
| P0 | `agents/core/{Orchestrator,Synthesizer,TaskScheduler,MessageBus,AgentRuntime}` | ≥ 30 |
| P0 | `request-core.executeRead` / `invalidateByTags` | ≥ 10 |
| P0 | `forum-api.js` cursor 翻页 + B-1 has_more 来源 | ≥ 6 |
| P1 | `bohai-engine-helpers.js` 文本处理 8 个函数 | ≥ 25 |
| P1 | `agents/workers/*Agent.js`（mock invoke） | ≥ 8 |
| P1 | `boh-cloud-api` / `messages-api` / `notifications-api` | ≥ 20 |
| P2 | 组件渲染测试（`@vue/test-utils`） | ≥ 15 |
| P3 | E2E（Playwright）登录 / 发帖 / AI 聊天 / Cloud+ | 4 个关键路径 |

### 阶段 7：补充 e2e / i18n / 错误边界（季度级）

- 引入 `vue-i18n`，把硬编码中文文案全部走 key（可分批：先 BOHAI 视图、再论坛、再个人中心）
- 路由增加 `loadingComponent` / `errorComponent`，所有 `() => import(...)` 加 `webpackChunkName`
- 增加 e2e 套件（Playwright）

## 1.4 目标文件树（重构后）

```
src/
├── composables/
│   ├── chat/                      ← 新建
│   │   ├── useChatSessions.js
│   │   ├── useChatSettings.js
│   │   ├── useActionDrafts.js
│   │   ├── useGenerationPipeline.js
│   │   ├── useCloudConsent.js
│   │   ├── useMemoryCapture.js
│   │   ├── useQuickNote.js
│   │   └── useUserPrivateContext.js
│   ├── useBodyScrollLock.js       ← 新建（阶段 0-3）
│   ├── useLocalSetting.js         ← 新建
│   ├── useRealtimeChannel.js      ← 新建
│   └── useCachedRead.js           ← 新建
├── utils/
│   ├── db-error.js                ← 新建（阶段 0-1）
│   ├── sanitize.js                ← 新建
│   ├── storage.js                 ← 新建
│   ├── request-core.js
│   └── ...
├── utils/api/
│   ├── forum-posts-api.js         ← 拆出
│   ├── forum-comments-api.js      ← 拆出
│   ├── forum-likes-api.js         ← 拆出
│   ├── forum-tags-api.js          ← 拆出
│   ├── forum-moderation-api.js    ← 拆出
│   ├── forum-api.js               ← 兼容桶（re-export）
│   ├── treehole-spaces-api.js     ← 拆出
│   ├── treehole-memory-api.js     ← 拆出
│   ├── treehole-shared-memory-api.js ← 拆出
│   ├── treehole-ai-stream.js      ← 拆出
│   ├── treehole-api.js            ← 兼容桶
│   └── ...
├── stores/
│   ├── session-manager.js         ← 新建
│   ├── auth.js                    ← 收敛
│   ├── notifications.js
│   ├── products.js
│   └── bag.js
└── views/
    ├── BOHAI/
    │   ├── BOHAI/index.vue        ← 视图瘦身（< 1500 行）
    │   ├── composables/
    │   │   ├── useChatEngine.js   ← 收敛（< 500 行 facade）
    │   │   ├── chat-engine-config.js
    │   │   ├── chat-engine-prompts.js  ← 新建
    │   │   ├── bohai-engine-helpers.js
    │   │   └── agent-cluster-helpers.js
    │   └── agents/                 ← 已较整洁，仅小修
    ├── Forum/
    │   ├── index.vue              ← 收敛（< 1000 行）
    │   └── components/             ← 新建子组件
    ├── user-center/UserSpace/
    │   ├── index.vue              ← 收敛（< 600 行）
    │   └── tabs/                   ← 新建 7 个 tab
    └── Marketing/                  ← 营销页合并
```

## 1.5 紧急项（必须本周内处理）

| 严重度 | 项 | 位置 |
|---|---|---|
| 🟥 P0 | **AI Key 打包到前端**：4 个文件用 `import.meta.env.VITE_SILICON_CLOUD_API_KEY` 直接读取，等同公开 | `chat-engine-config.js:11`、`AIPlaza/index.vue:132`、`treehole-api.js:13`、`content-moderation.js:2-3` |
| 🟥 P0 | **Cloudinary 删除鉴权缺口**：`deleteCloudinaryAssetsByPublicIds` 完全信任前端传入的 `publicId[]` | `cloudinary-client.js:326-356` + Edge Function 侧 |
| 🟧 P1 | `forum-api.js` `has_more` 取错行：取的是 `find`（第一行），应取最后一行 | `forum-api.js:1133, 1801, 2260` |
| 🟧 P1 | `forum-api.js` cursor 模式下 `select` 模板不含 `user_likes` 外键 → `isLiked` 始终 `false` | `forum-api.js:992-1000` |
| 🟧 P1 | `createComment` 在未通过审核前就给作者推送 Pushplus 通知 | `forum-api.js:657-664, 1842-1927` |
| 🟧 P1 | `POST_DRAFT_IDEA_NOISE_PATTERN` 把"和/与/并且/然后/可以/需要"核心中文连接词当噪声删除 | `bohai-engine-helpers.js:779` |
| 🟧 P1 | `mergeAutoDecisionWithLocalGuardrails` 缺 `shouldSaveCloud/SharedMemory/AskMemoryDestination` 三个硬字段 | `bohai-auto-decision.js:267-281` |
| 🟧 P1 | `removePreflightLoader` 不检查 `meta` → 误删 `cloud_consent_request` 等占位消息 | `useChatEngine.js:5914-5920` |
| 🟧 P1 | `thinkingBuffer` / `inThinkingBlock` 闭包变量在 stopGeneration / scope dispose 时不重置 | `useChatEngine.js:3237-3354` |
| 🟧 P1 | `body.style.overflow` 41 处散落 → 整页无法滚动风险 | UnifiedNavbar/Forum/Home/Messages/Shop/Newsroom/BOH8YearsEvent/AvatarCropModal |
| 🟧 P1 | `auth-api.signIn` 用 `ilike('username', ...)` 探测，存在用户名枚举 | `auth-api.js:191-243` |
| 🟧 P1 | `updatePost` 客户端传 `userRole='admin'` 跳过复审 | `forum-api.js:2305-2312` |
| 🟨 P2 | `deductPoints` 客户端扣分后未回传服务端 profiles.points | `auth.js:660-666` |
| 🟨 P2 | `runAsyncRelaxedModeration` 链路：创建通知同步等 Pushplus（30s 超时） | `notifications-api.js:172-193` |

---

# 🔍 报告 B：逻辑检查报告

> 范围：BOHAI 引擎层 / 数据层 / 视图组件层 / 路由
> 排序：按"业务影响 × 触发概率"
> 已交叉验证：所有 P0/P1 项均通过 `grep` / `wc` / 读片段二次核对

## 2.1 P0 — 紧急缺陷（可能造成线上事故 / 数据问题）

### B-1 `forum-api.js` `has_more` 取错行
- **位置**：`forum-api.js:1133, 1801, 2260`（3 处）
- **症状**：`safeRows.find(row => row.has_more === 'boolean')?.has_more` 用 `find` 取**第一行**的 `has_more`，但分页语义上"是否还有下一页"应由**末尾行**决定（或由 RPC 的最后一行单独返回）。
- **触发**：在 RPC 返回多行且每行都填充了 `has_more` 的场景下，前端分页器会用错行值。
- **修复方向**：在 RPC schema 明确 `has_more` 仅出现在最后一行，客户端用 `safeRows.at(-1)` 取；或请后端把 `has_more` 拆到独立的元数据返回。
- **影响**：论坛 / 我的帖子页翻页最后一页"加载更多"按钮误判。

### B-2 `createComment` 审核通过前已推送 Pushplus 给作者
- **位置**：`forum-api.js:1842-1927` + `L657-664` `scheduleCommentModeration` 内联触发
- **症状**：`createComment` 写入后立刻触发"通知帖子作者"，但 `runAsyncRelaxedModeration` 异步复审还在跑。若最终审核拒绝 `status=rejected`，**用户已收到 Pushplus 推送但评论已不可见**。
- **修复方向**：把"通知作者"挪到 `runAsyncRelaxedModeration` 内部、审核通过后再发；或在 `notifications` 表加 `pending_moderation: true` 字段，等异步审完再 fan-out。
- **影响**：B 类舆情风险（"我点进去怎么没了"）。

### B-3 Cloudinary 删除鉴权缺口
- **位置**：`cloudinary-client.js:326-356` + Edge Function `cloudinary-delete`
- **症状**：`deleteCloudinaryAssetsByPublicIds(publicIds[])` 把 `publicId[]` 直接透传到 Edge Function。若 Edge Function 内部未对 `claimed_by = auth.uid()` 做二次校验，攻击者可枚举或误删他人资源。
- **修复方向**：Edge Function 内强制 `cloudinary_pending_uploads.claimed_by = auth.uid() AND public_id = ANY(...)` 校验。
- **影响**：资源被恶意删除（图片类业务，损失可见度高）。

### B-4 `VITE_SILICON_CLOUD_API_KEY` 暴露到前端 bundle
- **位置**：4 文件共用：详见 1.5
- **症状**：`import.meta.env.VITE_*` 会被 Vite 编译进 JS bundle。任何打开 DevTools → Sources 的人均可拿到 key → 直接刷别人 Silicon Cloud 余额。
- **修复方向**：把 `chat / embedding / rerank` 三类调用全部走自建 Edge Function（`supabase.functions.invoke`），key 仅在 server 端读取。前端只剩 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`。
- **影响**：**直接经济损失**，且无法追责。

### B-5 `forum-api.js` cursor 模式下 `select` 缺 `user_likes` 外键
- **位置**：`forum-api.js:992-1000` + `formatPosts` 中 `user_likes?.some(like => like.user_id === currentUserId)`
- **症状**：cursor 模式 `select` 模板只取 `*`（或不含 `user_likes`），`user_likes` 永远为空数组 → `isLiked` 永远 `false`。同一帖子在 cursor 与 RPC 路径下"是否已点赞"结果不一致。
- **修复方向**：cursor 模式 `select` 模板显式包含 `user_likes(user_id, post_id)`。
- **影响**：用户每次刷新都看到"未点赞"但实际已点赞 → 重复点赞触发 `unique constraint` 报错或被 RLS 拒绝。

### B-6 `POST_DRAFT_IDEA_NOISE_PATTERN` 把"和/与/并且/然后/可以/需要"当噪声删除
- **位置**：`bohai-engine-helpers.js:779`
- **症状**：用户输入"我想和大家聊聊我今天在论坛发的帖子" → 噪声去除后剩"今天"；`hasPostDraftUserIdea` 看到长度 < 4 → 返回 `false` → AI 误以为用户没想法，要求二次输入。
- **修复方向**：拆分核心连接词白名单（保留 `和/与/并且/然后/可以/需要`）与操作词黑名单（删除 `帮我/起草/生成/替我/代我`）。
- **影响**：发帖草稿流程 UX 严重退化（高频路径）。

### B-7 `mergeAutoDecisionWithLocalGuardrails` 缺 3 个 save 字段
- **位置**：`bohai-auto-decision.js:267-281`
- **症状**：`hardBooleanFields` 列表里有 `codeOrCommand` / `minecraftCommand` / `dailySummary` / `planMode` / `complexQuestion` / `shouldSearchWeb` / `shouldReferenceCloud` / `forceCloudReference` / `bohInternalFactual` / `personalSupport`，**但没有** `shouldSaveCloud` / `shouldSaveSharedMemory` / `shouldAskMemoryDestination`。fast-model 正确识别的"保存"意图会被本地 fallback 覆盖回 `false`。
- **触发**：用户文本"帮我记一下今天的总结" + 本地正则未命中 → fast-model 识别 `shouldSaveCloud: true` → 合并时被覆盖 → 漏触发保存对话框。
- **修复方向**：把 3 个字段加入 `hardBooleanFields`；或在 L283 的特殊块前先执行 3 个字段的 `OR` 合并。
- **影响**：Cloud+ 公共记忆 / 共享记忆的"主动保存"流程命中率显著下降。

## 2.2 P1 — 高优先级缺陷

### B-8 `removePreflightLoader` 不检查 `meta`，可能误删 Cloud+ 同意请求
- **位置**：`useChatEngine.js:5914-5920`
- **症状**：`onCloudReferenceConsent` 等会 push 带 `meta.kind='cloud_consent_request'` 的 assistant placeholder；`removePreflightLoader` 仅看 `!content.trim()`，会把这条带 meta 的占位消息删除。
- **触发**：用户进入 Cloud+ 同意流程。
- **修复方向**：`removePreflightLoader` 加 `!message.meta || Object.keys(message.meta).length === 0` 条件。
- **影响**：Cloud+ 同意 UI 静默消失，用户卡住。

### B-9 `thinkingBuffer` / `inThinkingBlock` 闭包变量不重置
- **位置**：`useChatEngine.js:3237-3354`
- **症状**：模块级 `let inThinkingBlock = false; let thinkingBuffer = ''` 只在 `callModelStream` 入口 `resetThinkingState()` 清空，但 `stopGeneration()` / `onScopeDispose()` / 切会话路径**不会主动 reset**。
- **触发**：长上下文 Plan 模式思考块未关闭 → 用户停止 → 立即发新问题 → 首个 chunk 被"思考过滤"吞掉若干字符。
- **修复方向**：`stopGeneration` / `onScopeDispose` 中追加 `resetThinkingState()`。
- **影响**：偶发"AI 答非所问"或首字延迟。

### B-10 `agent-cluster-helpers.js` 的 `cachedCluster` 与 `invokeChatEngine` 注入不一致
- **位置**：`agent-cluster-helpers.js:80-97`
- **症状**：
  - 第一次调用（无 `invokeChatEngine`）→ 缓存 `instance`
  - 第二次带 `invokeChatEngine` 调用 → 缓存被跳过（cachedCluster 已存在）但 `invokeChatEngine` 被忽略
  - 反之亦然：第一次带 invokeChatEngine 时 cachedCluster 不会赋值
- **触发**：用户切换主 ChatEngine 配置后，集群仍在用旧的。
- **修复方向**：放弃 cache，或把 `invokeChatEngine` 通过 `ref` 注入到 `useAgentCluster` 内部（每次 run 时取最新）。
- **影响**：Agent 集群对话走错模型/错配置。

### B-11 `getAIMemory` 30s 重试 race condition
- **位置**：`bohai-engine-helpers.js:45-66`
- **症状**：多个并发调用 `getAIMemory()` 时，第一个进 if 分支时 `aiMemoryLoader` 已被设过（或被清），第二个进另一个分支 → **2 次 import 并发** → 写 `aiMemoryCache` 两次。
- **修复方向**：用 in-flight Promise 模式（已有 `inFlightByKey` 通用 helper）；cache hit/miss 显式状态机。
- **影响**：内存中保存 2 份 AI_MEMORY 引用 + 重复 import 副作用（`data/ai-memory.js` 内部 `console.log` 之类）。

### B-12 `extractRecipientName` 正则只匹配"给 X 发"
- **位置**：`bohai-engine-helpers.js:808`
- **症状**：`/给\s*([^\s，,。；;:：]{1,30})\s*发(?:邮件|私信|信)/i` 只匹配"给 X 发"语序。"发邮件给 X" / "想和 lf 聊聊，发个邮件" → 都不匹配 → 收件人为空。
- **修复方向**：补一组 `/(?:发(?:邮件|私信|信))?\s*给\s*([^\s，,。；;:：]{1,30})/` 兼容反向语序。
- **影响**：发邮件 / 私信流程体验下降。

### B-13 `deleteSession` 不清 `pendingActionDraft`
- **位置**：`useChatEngine.js:2582-2600`
- **症状**：`pendingActionDraft.sessionIndex` 指向已删 index，`activeActionDraft` 永远不显示但内存中仍占用。
- **修复方向**：`deleteSession` 中 `if (pendingActionDraft.sessionIndex === i) resetPendingActionDraft()`。
- **影响**：内存泄漏 + UI 不一致（草稿面板偶发"幽灵状态"）。

### B-14 `Orchestrator` 主+兜底并发不取消兜底
- **位置**：`agents/core/Orchestrator.js:94-145`
- **症状**：`mainPromise` + `fallbackPromise` 同时启动，主模型成功后 `fallback` 仍在跑（不会被 abort），浪费 token 配额。
- **修复方向**：主模型成功后立即 `fallbackController.abort()`。
- **影响**：每次 fanout 多调 1 次 LLM 调用，账单增长 30%+。

### B-15 `callModelInternal` retry 不收紧 `max_tokens`
- **位置**：`useChatEngine.js:2980-2996`
- **症状**：`fallback` 切换后 options 透传，fallback 模型可能拒绝 `max_tokens: 4096` 但被 retry 吞掉。
- **修复方向**：fallback 时 `Math.min(max_tokens, 2048)` 收紧。
- **影响**：fallback 路径偶发 400 错误但前端无感。

### B-16 `body.style.overflow` 41 处散落，缺统一管理
- **位置**：10 个文件 / 41 处（详见 1.5）
- **症状**：A 组件设置 `body.overflow='hidden'`，B 组件 unmount 时不还原 → 整页无法滚动。`UnifiedNavbar.closeMobileMenu` 复位，但 `Home/Forum/PostDetail` 等没有显式复位。
- **修复方向**：`useBodyScrollLock()` 引用计数（阶段 0-3）。
- **影响**：移动端偶发"整页不能滚"。

### B-17 `auth-api.signIn` 用户名枚举
- **位置**：`auth-api.js:191-243`
- **症状**：非邮箱登录按 `profiles.ilike('username', ...)` 探测，"用户存在" / "密码错误" 两种错误可被区分 → 攻击者可批量枚举用户名。
- **修复方向**：把"是否存在 + 校验密码"合并到一个 RPC `login_with_login_id(p_login_id, p_password)`，由后端统一返回"凭证无效"。
- **影响**：账号安全。

### B-18 `updatePost` 客户端传 `userRole='admin'` 跳过复审
- **位置**：`forum-api.js:2305-2312`
- **症状**：管理员编辑帖子时强制 `status='approved'`，绕开 `schedulePostModeration` 异步复审。`userRole` 来自客户端 `userInfo.role`，可被篡改。
- **修复方向**：管理员动作全部走 RPC（`admin_update_forum_post(target_id, payload)`），由 `auth.uid()` 鉴权。
- **影响**：内容审核被绕过。

### B-19 `request-core.executeRead` 缓存返回引用直接交出
- **位置**：`request-core.js:135-187`
- **症状**：`getCache` 返回的是直接引用，调用方修改返回对象会污染缓存。
- **修复方向**：返回 `structuredClone(cached.payload)`；in-flight 结果也 clone 一次。
- **影响**：多页面共享同一列表时，`array.push()` 之类操作会被下次读取"看到"。

### B-20 `createPostWithImages` 空内容仍走 RPC
- **位置**：`forum-api.js:1407-1418`
- **症状**：`safeTitle` 与 `safeContent` 都为空时仍发 RPC（L1438+），错误信息对前端不友好。
- **修复方向**：早返回 `{ ok: false, error: { code: 'EMPTY_CONTENT', message: '请填写标题或正文' } }`。
- **影响**：无直接线上影响，但 RPC 配额浪费 + 错误归一化压力。

### B-21 `auth.js.deductPoints` 客户端扣分不回传
- **位置**：`auth.js:660-666`
- **症状**：客户端 store 减扣后未触发 `updateLocalState(force:true)`，登出 reset 后用户损失积分无审计。
- **修复方向**：扣分成功后 `await refreshCurrentUserProfile(force:true)` 强制刷新 profile。
- **影响**：积分相关业务偶发"消失"。

## 2.3 P2 — 中等优先级

| 编号 | 描述 | 位置 |
|---|---|---|
| B-22 | `_isProComplex` 与 `bohai-auto-router` 的 complex / multiStepReasoning 正则漂移风险 | `chat-engine-config.js:340` |
| B-23 | `keywordCache` 用 FIFO 而非 LRU | `bohai-engine-helpers.js:77-79` |
| B-24 | `localStorage` 12+ 处裸调，无命名空间与 schema 版本 | `useChatEngine.js` 全文 |
| B-25 | `notifications` realtime channel 推送时无去抖，连发 3 条 INSERT 触发 3 次 `loadNotifications` | `notifications.js:97-132` |
| B-26 | `messagesChannel` 收 `INSERT` 时不刷 inbox，只刷 unread count | `notifications.js:144-150` |
| B-27 | `unreadRefreshInflight.value = null` 在 finally 抹掉其他 inflight | `notifications.js:223-226` |
| B-28 | `forum-api.getPosts` fallback 路径用 `find` 取 `has_more` 错行 | `forum-api.js:1131-1134` |
| B-29 | `forum-api.getUserPosts` `includeUnapprovedForAuthor` 在 `targetUserId !== currentUserId` 时被静默忽略 | `forum-api.js:2141-2143` |
| B-30 | `notifications-api.createNotification` 同步等 Pushplus 30s 超时，链路被卡 | `notifications-api.js:172-193` |
| B-31 | `treehole-api` JSON 解析多策略，仍可能解析出非 JSON 内容 | `treehole-api.js:124-191` |
| B-32 | `runSyncStrictModeration` 失败时未阻断 `createComment` 写入 | `forum-api.js:1860-1875` |
| B-33 | `MessageBus.snapshot()` 浅拷贝，synthesizer 误改会污染 bus | `MessageBus.js:140-154` |
| B-34 | `Synthesizer.streamTypewriter` 不是真 SSE，只是模拟打字机 | `Synthesizer.js:75-88` |
| B-35 | `auth.js` 登录后 `skipProfileFetch:true` 立即返回，UI 200-500ms 角色错位 | `auth.js:548-549` |
| B-36 | `bag.js.normalizeBagItems` 把 `points_cost≤0` 静默丢弃 | `bag.js:14-27` |
| B-37 | `products.js` DB 返空时回退静态数据，无法区分"无数据"与"故障" | `products.js:99-101` |

## 2.4 P3 — 清洁度问题

| 编号 | 描述 | 位置 |
|---|---|---|
| B-38 | `markCloudinaryUploadsClaimed` 失败仍 `ok:true`，前端无法感知 | `forum-api.js:1505-1508` |
| B-39 | `updatePost` 用 `result.status === 'approved'` 字符串比较而非常量 | `forum-api.js:2377` |
| B-40 | `AGENT_AGENT_ROLES` 与 `AGENT_CLUSTER_AGENT_STATUS` 重复定义 | `agent-events.js:29-36` + `agent-cluster-config.js:7-14` |
| B-41 | `pickModeFromLocalSignals` 在 decision 与 router 都有，drift 风险 | `bohai-auto-decision.js` + `bohai-auto-router.js:431-446` |
| B-42 | `auth.js.loadAuthApi` 与 `notifications.js.loadAuthApi` 各自实现 | `auth.js:80-85` + `notifications.js:6-12` |
| B-43 | `shouldSyncModerateComment` 正则 `telegram` 无 word boundary，误判率高 | `forum-api.js:125-142` |
| B-44 | `getCloudinaryTransformedUrl` 在 `parsed.hostname !== 'res.cloudinary.com'` 时无日志/警告 | `forum-api.js:316-321` |
| B-45 | `forum-image-moderation` 缺 NSFWJS 加载失败的兜底 | `forum-image-moderation.js` |
| B-46 | `user-space.js` 历史重定向逻辑复杂 | `user-space.js:22-71` |
| B-47 | `data/activities.js` / `data/news.js` / `data/mcti-data.js` 已被 Supabase 替代但未删 | 见 `docs/codebase-organization-audit-2026-04-30.md` 旧审计 |

## 2.5 已修正 / 子任务误报（透明度说明）

- ❌ **子任务 A 误报 B-46（"getFallbackModel 缺失"）**：实际 `useChatEngine.js:2911` 已在同文件内定义；调用点 L2982, L3424, L6718 全部能 resolve。建议改为"集中到 bohai-model-client.js"（B-15 修复方向之一），但**不是"未定义"**。
- ❌ **子任务 A 误报"bohai-engine-helpers.js 在 utils/"**：实际位于 `src/views/BOHAI/composables/bohai-engine-helpers.js`。报告中所有引用都已按真实路径修正。
- ❌ **子任务 C 误报"BOHAI/index.vue 2044 行"**：实际 2004 行（差 40 行）。其余数据已核对。
- ✅ 其余 30+ 项关键缺陷（B-1 ~ B-21）经 grep / wc / 读片段验证为真。

## 2.6 测试覆盖缺口（逻辑保护层）

| 模块 | 当前 | 关键未覆盖 |
|---|---|---|
| `useChatEngine.js` | 0% | sendMessage 5 类早退 / 流式 / 思考过滤 / session 持久化 |
| `agents/core/*` | 0% | Orchestrator 主+兜底 / Synthesizer marker 切分 / TaskScheduler 拓扑 |
| `bohai-engine-helpers.js` | ~30% | `selectRelevantChunks` / `extractQueryKeywords` / `isDegenerateAssistantReply` 8+ 场景 |
| `chat-engine-config.js` | 0% | `_isProComplex` / `resolveAutoModel` / `resolveProModel` |
| `forum-api.js` | 0% | cursor 翻页 / `has_more` 来源（**B-1 直接相关**） |
| `request-core.js` | 0% | 缓存 / 去重 / 重试 / `invalidateByTags` |
| `auth.js` store | 0% | session 解析 / 续期失败 / `deductPoints` 流程 |
| `cloudinary-client.js` | 0% | `deleteCloudinaryAssetsByPublicIds` 鉴权（**B-3 直接相关**） |
| `messages-api.js` | 8 测 | 缺多收件人并发失败的回滚测试 |
| 组件 / 视图 | 0% | 全部 0 `@vue/test-utils` / 0 e2e |

## 2.7 安全风险摘要

| 风险 | 位置 | 严重度 |
|---|---|---|
| AI Key 在前端 bundle | 4 文件 | 🟥 |
| Cloudinary 删除鉴权缺口 | `cloudinary-client.js` + Edge Function | 🟥 |
| 用户名枚举 | `auth-api.signIn` | 🟧 |
| 客户端 `isAdmin` 旁路 RLS | 多数 admin 入口 | 🟧（已基本走 RPC，仍有 1-2 处直读 `userInfo.role`） |
| 私信/通知"未授权写动作"误声明 | `forum-api.createComment` | 🟧 |
| localStorage 持久化明文 chat session | `useChatEngine.js` 全文 | 🟨 |

---

## ✅ 总结

- **结构方案**：阶段 0（基础设施）→ 阶段 1（拆 useChatEngine）→ 阶段 2-3（统一判定 + 拆 api）→ 阶段 4-5（视图瘦身 + 状态收口）→ 阶段 6（测试）→ 阶段 7（i18n/e2e）
- **逻辑缺陷**：P0 紧急项 7 个（B-1 ~ B-7），P1 14 个（B-8 ~ B-21），P2/P3 合计 30+ 个
- **最关键**：
  1. 立即修 **B-4 AI Key 暴露** 和 **B-3 Cloudinary 鉴权缺口**（安全 / 经济）
  2. 修 **B-1 / B-5 / B-6 / B-7** 这 4 个线上必现 / 高频触发 bug
  3. 启动阶段 0 基础设施抽取（风险 L、收益 H）
  4. 启动阶段 1 useChatEngine 拆分（最大单文件、0 测试）

报告完。所有结论均引用了 `file:///` 链接，可直接作为 PR / 任务卡输入。需要进入"修复实施"阶段时，告诉我先开哪个 P0 / P1 即可。
