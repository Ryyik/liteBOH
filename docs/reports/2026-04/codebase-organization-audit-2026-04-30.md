# 代码库组织结构审计 - 2026-04-30

## 当前状态

这个项目并不是坏掉了，也不是随意拼起来的。它目前处在一次较大的 Vue 3/Vite 迁移过程中：

- 许多页面已经从单个 `*.vue` 文件迁移到了 `folder/index.vue + style.scoped.css` 的结构。
- 旧资源和全局样式已经从 `public/assets` 迁移到了 `src/assets` 和 `src/styles`。
- 功能区域大体上已经拆分到 `views`、`components`、`stores`、`composables`、`utils/api` 和 `supabase` 中。

目前主要的维护风险不是正确性问题，而是结构漂移：旧文件、暂停开发的功能目录，以及体积很大的页面/样式模块，会让后续改动更难判断和维护。

## 本轮已清理内容

- 移除了未使用的路由辅助函数，以及旧的、已注释掉的 Create Studio 路由守卫。
- 移除了 ESLint 报告的未使用 Vue imports、常量和函数。
- 将 lint 噪音从 14 个 warning 降到了 0 个 warning。
- 确认组件目录导入已经在使用新的 `ComponentName/index.vue` 模式。
- 将 `src/router/index.js` 拆分为按领域组织的路由文件：公共页面、社区、个人空间、创作者工作台、管理后台和重定向。
- 将管理后台路由统一改为 `meta.requiresAdmin`，包括 `/admin/data-management` 和 `/admin/alert-style-editor`。
- 将 BOH AI 聊天引擎的配置常量、模型列表、关键词和阈值抽到 `src/views/BOHAI/composables/chat-engine-config.js`。
- 将部分高频页面/组件调试输出迁移到 `src/utils/logger.js`，包括 App、PWA、Shop、Mailbox、Messages、BOHDesktop 和 BOH AI 聊天引擎。
- 在 `auth` Pinia store 中增加统一的 `isAdmin`，并让路由守卫、个人中心导航、个人中心索引和礼物地址页使用同一权限判断来源。

## 验证结果

清理后以下检查均已通过：

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run build`
- `npm run check:bundle`

## 值得关注的冗余候选

以下文件/目录目前看起来没有被应用导入或路由使用。由于当前工作区包含大量尚未提交的迁移改动，删除前仍应再次确认。

- `src/data/news.js`：旧的静态新闻数据；当前新闻数据已经通过 `src/composables/useNews.js` 和 Supabase 获取。
- `src/data/activities.js`：旧的静态活动数据；当前活动数据已经通过 `src/composables/useActivities.js` 和 Supabase 获取。
- `src/data/mcti-data.js`：目前没有发现导入引用。
- `src/views/user-center/CreateStudio/CreatorStudioEditor/`：路由现在指向 `SimpleEditor`。
- `src/views/user-center/CreateStudio/BOHdesktop/`：目前没有发现路由或导入引用；当前生效的桌面路由指向 `src/views/BOHDesktop/index.vue`。

## 较大的清理目标

- `src/views/BOHAI/composables/useChatEngine.js` 仍然很大，但配置层已经拆出。后续建议继续按关注点拆成更小的模块：提示词构建、检索、记忆捕获、审核/grounding，以及 UI 会话状态。
- 一些页面样式文件非常大，尤其是 `Home`、`Cloud+`、`UserSpace`、`Forum` 和 `VideoScriptEditor`。建议只在多个页面重复使用时，再抽取共享布局/控件样式。
- 页面组件中的控制台输出仍有剩余，尤其是大型页面中的错误处理日志。已迁移一批高频 debug 输出，后续可以继续把 page-level 日志迁移到 logger，或删除纯调试日志。
- 一些根目录文档和生成产物与源代码混在一起。长期来看，建议将产品/项目文档放在 `docs/` 下，数据库快照放在 `docs/database/` 下，生成产物不要纳入源代码追踪。

## Pinia 状态管理检查

当前 Pinia 结构总体方向是对的：`auth` 管登录态和用户资料，`notifications` 管实时通知和未读数，`bag` 管购物袋，`products` 管商品列表缓存，`video-script` 管视频脚本编辑器。

需要继续关注的点：

- `src/stores/video-script.js` 约 1,700 行，是目前最大的 store。它同时管理项目、场景、镜头、历史栈、自动保存、云端同步和 AI 能力。建议后续拆为 `project-store`、`scene-shot-store`、`history-store`、`ai-actions` 或至少把规范化/AI action 抽到独立模块。
- `src/stores/auth.js` 约 800 行，职责还可以接受，但已经包含 profile 规范化、登录、注册、OAuth、注销、资料更新和会话心跳。建议继续把 profile 规范化逻辑留在 store 外的纯函数模块中，store 只负责状态编排。
- `notifications` store 的方向较好，已经集中处理未读数和实时监听。页面仍有一些自己的刷新事件逻辑，后续可以进一步收敛到 store action，减少 `window.dispatchEvent` 和 `localStorage` 事件散落。
- `bag` 和 `products` store 体积合理，适合继续保留。已将异常日志接入 `logger`。
- 管理员权限判断已经收敛到 `authStore.isAdmin`。后续新增管理入口时，应只依赖这个来源，不再在页面里写用户名兜底判断。

## 建议删除顺序

1. 确认 Supabase 已经替代所有静态 `news` 和 `activities` 内容，然后删除这两个旧数据文件。
2. 确认 MCTI 是否仍在计划中。如果不再需要，删除 `src/data/mcti-data.js` 和根目录的 `MCTI人格参考文件.txt`。
3. 确认 Create Studio 编辑器的最终方向，然后移除未使用的 `CreatorStudioEditor` 目录。
4. 确认 BOH Desktop 只保留一个实现，然后移除 `CreateStudio/BOHdesktop`。
5. 每批删除后运行 `npm run lint && npm run type-check && npm run test && npm run build`。
