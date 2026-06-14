# Tasks

- [x] Task 1: 提取论坛总结纯函数到 `useForumSummary.js`
  - [x] 1.1: 创建 `src/views/BOHAI/composables/useForumSummary.js`，将 14 个论坛总结纯函数复制到新文件并 export
  - [x] 1.2: 在 `useChatEngine.js` 中删除这 14 个函数的内联实现，改为 `import` 调用
  - [x] 1.3: 验证 `npm run build` 通过

- [x] Task 2: 提取意图检测纯函数到 `useIntentDetection.js`
  - [x] 2.1: 创建 `src/views/BOHAI/composables/useIntentDetection.js`，将 13 个意图判断纯函数复制到新文件并 export
  - [x] 2.2: 在 `useChatEngine.js` 中删除这些函数的内联实现，改为 `import` 调用（shouldUseTreeholeContext 用薄包装层处理响应式依赖）
  - [x] 2.3: 验证 `npm run build` 通过

- [x] Task 3: 提取用户私域检索纯函数到 `useUserPrivateRetrieval.js`
  - [x] 3.1: 创建 `src/views/BOHAI/composables/useUserPrivateRetrieval.js`，将 8 个私域检索纯函数复制到新文件并 export
  - [x] 3.2: 在 `useChatEngine.js` 中删除这些函数的内联实现，改为 `import` 调用（保留依赖响应式状态的 getUserPrivateSnapshotCached 和 getUserPrivateContext）
  - [x] 3.3: 验证 `npm run build` 通过

- [x] Task 4: 拆出 `useActionDraft.js` composable
  - [x] 4.1: 创建 `src/views/BOHAI/composables/useActionDraft.js`，采用依赖注入模式，接收 chatSessions 等共享状态
  - [x] 4.2: 将 Action 草稿相关 14 个函数从 `useChatEngine.js` 移入新文件
  - [x] 4.3: 在 `useChatEngine.js` 中改为 `const actionDraft = useActionDraft({...})` 并代理导出同名函数
  - [x] 4.4: 验证 `npm run build` 通过

- [x] Task 5: 拆出 `useMemoryCapture.js` composable
  - [x] 5.1: 创建 `src/views/BOHAI/composables/useMemoryCapture.js`，采用依赖注入模式
  - [x] 5.2: 将记忆/Cloud+/随手记相关 20+ 函数从 `useChatEngine.js` 移入新文件
  - [x] 5.3: 在 `useChatEngine.js` 中改为 `const memoryCapture = useMemoryCapture({...})` 并代理导出同名函数
  - [x] 5.4: 验证 `npm run build` 通过

- [x] Task 6: 拆出 `useKnowledgeRetrieval.js` composable
  - [x] 6.1: 创建 `src/views/BOHAI/composables/useKnowledgeRetrieval.js`，采用依赖注入模式
  - [x] 6.2: 将知识路由与上下文构建相关 18 个函数从 `useChatEngine.js` 移入新文件
  - [x] 6.3: 在 `useChatEngine.js` 中改为 `const knowledge = useKnowledgeRetrieval({...})` 并代理导出同名函数
  - [x] 6.4: 验证 `npm run build` 通过

- [x] Task 7: 提取 PostCard 子组件
  - [x] 7.1: 创建 `src/views/Forum/components/PostCard.vue`，提取单条帖子卡片模板+逻辑（18 props, 15 events）
  - [x] 7.2: 在 `Forum/index.vue` 中用 `<PostCard>` 替代内联帖子模板
  - [x] 7.3: 验证 `npm run build` 通过

- [x] Task 8: 提取 CommentThread + ImageViewer 子组件
  - [x] 8.1: 创建 `src/views/PostDetail/components/CommentThread.vue`（17 props, 9 events）
  - [x] 8.2: 创建 `src/views/PostDetail/components/ImageViewer.vue`（6 props, 4 events）
  - [x] 8.3: 在 `PostDetail/index.vue` 中用子组件替代内联模板
  - [x] 8.4: 验证 `npm run build` 通过

- [x] Task 9: API 层拆分 — treehole-api.js
  - [x] 9.1: 创建 `src/utils/api/treehole/` 目录及 4 个子模块文件（memory-api, cloud-entry-api, treehole-space-api, knowledge-search-api）
  - [x] 9.2: 将函数实现移入子模块，原 `treehole-api.js` 改为 re-export 入口
  - [x] 9.3: 验证 `npm run build` 通过，所有 `import from '@/utils/api/treehole-api.js'` 无需改动

- [x] Task 10: API 层拆分 — forum-api.js
  - [x] 10.1: 创建 `src/utils/api/forum/` 目录及 4 个子模块文件（post-api, comment-api, forum-interaction-api, _shared）
  - [x] 10.2: 将函数实现移入子模块，原 `forum-api.js` 改为 re-export 入口
  - [x] 10.3: 验证 `npm run build` 通过，所有 `import from '@/utils/api/forum-api.js'` 无需改动

# Task Dependencies
- [Task 4] depends on [Task 1, Task 2, Task 3] — 纯函数提取先完成，减少 composable 拆分时的闭包依赖
- [Task 5] depends on [Task 2] — 意图检测函数被记忆捕获模块使用
- [Task 6] depends on [Task 2, Task 3] — 意图检测和私域检索被知识检索模块使用
- [Task 7, Task 8, Task 9, Task 10] 互相独立，可并行执行
