# 无损文件拆分 Spec

## Why
项目核心源文件体量过大（useChatEngine.js 5,295行、DataManagement 5,179行、Forum 3,648行等），维护和调试困难。需要在不修改任何原有大文件的前提下，将可复用逻辑提取到独立模块，降低单文件认知负担。

## What Changes
- 从 `useChatEngine.js` 中提取纯函数到独立模块，原文件改为 import 调用（行为不变）
- 从大型 Vue 组件中提取子组件，原组件改为引用子组件（渲染结果不变）
- 从大型 API 文件中提取子模块，原文件保留为 re-export 入口（调用方无需改动）
- **不删除任何原有文件，不改变任何外部可观察行为**

## Impact
- Affected specs: 无（纯内部重构，不影响功能规格）
- Affected code:
  - `src/views/BOHAI/composables/useChatEngine.js` — 内部实现改为 import，函数签名和返回值不变
  - `src/views/Forum/index.vue` — 模板中部分内联 HTML 改为子组件标签
  - `src/views/DataManagement/index.vue` — 同上
  - `src/views/PostDetail/index.vue` — 同上
  - `src/utils/api/treehole-api.js` — 保留为 re-export 入口
  - `src/utils/api/forum-api.js` — 保留为 re-export 入口

## ADDED Requirements

### Requirement: 纯函数提取 — 论坛总结
系统 SHALL 将 `useChatEngine.js` 中无响应式依赖的论坛总结函数提取到 `src/views/BOHAI/composables/useForumSummary.js`。

提取的函数列表：
- `buildForumPostNaturalSummary`
- `buildExtractiveForumSummaryAnswer`
- `buildForumNarrativeSummaryPrompt`
- `normalizeForumSummaryText`
- `isLatestForumSummaryQuery`
- `sortForumPostsByCreatedAtDesc`
- `removeForumSummaryLinks`
- `getForumSummarySourceText`
- `detectForumSummaryPolarityConflicts`
- `buildForumSearchQueries`
- `mergeForumPosts`
- `rankForumPostsByQuery`
- `getForumTagFilterFromQuery`
- `getForumSortModeFromQuery`

#### Scenario: 提取后行为一致
- **WHEN** `useChatEngine.js` 通过 import 调用 `useForumSummary.js` 中的函数
- **THEN** 所有论坛总结相关输入输出与提取前完全一致

### Requirement: 纯函数提取 — 意图检测
系统 SHALL 将 `useChatEngine.js` 中无响应式依赖的意图判断函数提取到 `src/views/BOHAI/composables/useIntentDetection.js`。

提取的函数列表：
- `isCommunityQuestion`
- `isCommunityCreativeRequest`
- `isTreeholeReflectionQuestion`
- `shouldUseMemoryContext`
- `shouldUseSharedMemoryContext`
- `shouldUseTreeholeContext`
- `isTreeholeCreateConfirm` / `isTreeholeCreateReject`
- `isSharedMemorySaveConfirm` / `isSharedMemorySaveReject`
- `resolveMemorySaveDestinationFromText`
- `formatMemorySavePrompt`
- `summarizeThinkingSubject`

#### Scenario: 提取后行为一致
- **WHEN** `useChatEngine.js` 通过 import 调用上述函数
- **THEN** 所有意图检测结果与提取前完全一致

### Requirement: 纯函数提取 — 用户私域检索
系统 SHALL 将 `useChatEngine.js` 中用户私域检索相关纯函数提取到 `src/views/BOHAI/composables/useUserPrivateRetrieval.js`。

提取的函数列表：
- `resolveUserPrivateRetrievalPlan`
- `selectItemsByQuery`
- `getUserOverviewContext`
- `getUserPostsPrivateContext`
- 以及所有 `USER_PRIVATE_*` 关键词匹配常量

#### Scenario: 提取后行为一致
- **WHEN** `useChatEngine.js` 通过 import 调用上述函数
- **THEN** 用户私域检索结果与提取前完全一致

### Requirement: Composable 拆分 — Action 草稿
系统 SHALL 将 `useChatEngine.js` 中 Action 草稿相关逻辑提取到 `src/views/BOHAI/composables/useActionDraft.js`。

采用依赖注入模式，接收参数：
- `chatSessions`, `currentSessionIndex`, `pendingActionDraft`, `appendSessionMessage`, `resetComposerInput`, `scrollToBottom`, `isLoggedIn`, `userInfo`, `abortController`, `activeGenerationSessionIndex`, `startThinkingTimer`, `stopThinkingTimer`, `setThinkingStatus`, `clearThinkingStatus`, `getSessionByIndex`, `nextTick`, 以及 `bohai-engine-helpers` 中的工具函数

包含函数：
- `tryStartActionDraftFromUserInput`, `handlePendingActionDraftReply`
- `createActionRegistry`, `runRegisteredAction`, `submitPostDraft`
- `tryStartPageCreationFromUserInput`, `generatePageHtmlFromUserIdea`
- `callAIToGenerate`, `extractHtmlBlock`
- `getLocalDateKey`, `formatPostDraftPreview`, `formatPageDraftPreview`
- `updatePostDraftByUserInput`, `getActionAuthContext`

#### Scenario: useChatEngine 代理调用
- **WHEN** `useChatEngine.js` 内部改为 `const actionDraft = useActionDraft({...})` 并代理导出同名函数
- **THEN** BOHAI/index.vue 调用 `useChatEngine()` 的返回值接口不变

### Requirement: Composable 拆分 — 记忆捕获
系统 SHALL 将 `useChatEngine.js` 中记忆/Cloud+/随手记相关逻辑提取到 `src/views/BOHAI/composables/useMemoryCapture.js`。

采用依赖注入模式，接收参数：
- `chatSessions`, `pendingTreeholeCreation`, `pendingCloudReferenceConsent`, `pendingSharedMemoryCapture`, `pendingQuickNote`, `isLoggedIn`, `userInfo`, `isTreeholeMemoryEnabled`, `isMemoryCaptureEnabled`, `isQuickNoteEnabled`, `appendSessionMessage`, `resetComposerInput`, `scrollToBottom`, `setMemoryCaptureStatusMessage`, `resetPending*` 系列, `persistTreeholeMemorySetting`, `persistQuickNoteSetting`, `getSessionByIndex`, `nextTick`

包含函数：
- `toggleMemoryCapture`, `toggleTreeholeMemory`, `toggleQuickNoteMode`
- `confirmQuickNoteDraft`, `dismissQuickNoteDraft`, `updatePendingQuickNoteDraft`
- `requestCloudReferenceConsent`, `applyCloudReferenceConsent`, `approveCloudReferenceConsent`, `rejectCloudReferenceConsent`
- `handlePendingTreeholeCreationReply`, `handlePendingCloudReferenceConsentReply`, `handlePendingSharedMemoryCaptureReply`
- `requestSharedMemorySaveConfirmation`, `saveConfirmedAutoMemory`
- `persistCloudReferenceConsent`, `shouldSuppressMemoryStatusEcho`, `memoryCaptureTip`

#### Scenario: useChatEngine 代理调用
- **WHEN** `useChatEngine.js` 内部改为 `const memoryCapture = useMemoryCapture({...})` 并代理导出同名函数
- **THEN** BOHAI/index.vue 调用 `useChatEngine()` 的返回值接口不变

### Requirement: Composable 拆分 — 知识检索
系统 SHALL 将 `useChatEngine.js` 中知识路由与上下文构建逻辑提取到 `src/views/BOHAI/composables/useKnowledgeRetrieval.js`。

采用依赖注入模式，接收参数：
- `chatSessions`, `treeholeMemoryCache`, `sharedMemoryCache`, `sharedMemorySearchCache`, `userPrivateContextCache`, `isLoggedIn`, `userInfo`, `isTreeholeMemoryEnabled`, `isSharedMemoryEnabled`, `isKnowledgeBaseEnabled`, `isForumSearchEnabled`

包含函数：
- `resolveKnowledgeRoutingPlan`, `buildAutoKnowledgeContext`, `createReadConnectors`
- `getMemoryContext`, `getSharedMemoryContext`, `getSharedMemoriesCached`, `getSharedMemoriesByQuery`
- `getTreeholeContext`, `getTreeholeMemoriesCached`
- `getSiteGuideContext`, `getForumContext`
- `getUserPrivateContext`, `getUserPrivateSnapshotCached`
- `getVectorKnowledgeChunks`, `buildKnowledgeContextBlock`, `buildVectorKnowledgeContext`
- `getRetrievalTargetLabels`, `buildVisibleRetrievalActionNote`

#### Scenario: useChatEngine 代理调用
- **WHEN** `useChatEngine.js` 内部改为 `const knowledge = useKnowledgeRetrieval({...})` 并代理导出同名函数
- **THEN** BOHAI/index.vue 调用 `useChatEngine()` 的返回值接口不变

### Requirement: Vue 子组件提取 — PostCard
系统 SHALL 从 `Forum/index.vue` 中提取单条帖子卡片为 `src/views/Forum/components/PostCard.vue`。

Props: 帖子数据对象、当前主题、登录状态等
Events: `like`, `comment`, `report`, `click`

#### Scenario: 论坛页面渲染不变
- **WHEN** Forum/index.vue 使用 `<PostCard>` 替代内联帖子模板
- **THEN** 帖子列表渲染结果与提取前完全一致

### Requirement: Vue 子组件提取 — CommentThread
系统 SHALL 从 `PostDetail/index.vue` 中提取评论线程为 `src/views/PostDetail/components/CommentThread.vue`。

#### Scenario: 帖子详情渲染不变
- **WHEN** PostDetail/index.vue 使用 `<CommentThread>` 替代内联评论模板
- **THEN** 评论列表渲染结果与提取前完全一致

### Requirement: Vue 子组件提取 — ImageViewer
系统 SHALL 从 `PostDetail/index.vue` 中提取图片查看器为 `src/views/PostDetail/components/ImageViewer.vue`。

#### Scenario: 图片查看器行为不变
- **WHEN** PostDetail/index.vue 使用 `<ImageViewer>` 替代内联图片查看器
- **THEN** 缩放/平移/关闭行为与提取前完全一致

### Requirement: API 层拆分 — treehole-api
系统 SHALL 将 `treehole-api.js` 拆分为子模块，原文件保留为 re-export 入口。

子模块：
- `src/utils/api/treehole/memory-api.js` — 公共记忆 CRUD
- `src/utils/api/treehole/cloud-entry-api.js` — Cloud+ 日记 CRUD
- `src/utils/api/treehole/treehole-space-api.js` — 树洞空间管理
- `src/utils/api/treehole/knowledge-search-api.js` — 知识库/向量检索

#### Scenario: 调用方无感知
- **WHEN** 其他文件 `import { xxx } from '@/utils/api/treehole-api.js'`
- **THEN** 导出内容与拆分前完全一致，无需修改任何调用方

### Requirement: API 层拆分 — forum-api
系统 SHALL 将 `forum-api.js` 拆分为子模块，原文件保留为 re-export 入口。

子模块：
- `src/utils/api/forum/post-api.js` — 帖子 CRUD
- `src/utils/api/forum/comment-api.js` — 评论 CRUD
- `src/utils/api/forum/forum-interaction-api.js` — 点赞/举报/互动

#### Scenario: 调用方无感知
- **WHEN** 其他文件 `import { xxx } from '@/utils/api/forum-api.js'`
- **THEN** 导出内容与拆分前完全一致，无需修改任何调用方

## MODIFIED Requirements

无（不修改任何现有功能规格）

## REMOVED Requirements

无（不删除任何现有功能）
