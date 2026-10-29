# 发帖编辑器（PostComposer）代码详解 — 上下文交接文档

> 目的：把发帖编辑器的完整上下文一次性讲清，供其他 AI / 新会话直接使用，无需重新检索代码库。
> 项目：BOHLITEBeta2.5（Vue 3 + Vite + Pinia + Supabase，hash 路由）
> 基于代码版本：2026-10-26（行号会漂移，定位一律以函数名/类名为准）

---

## 1. 文件地图

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/views/Forum/components/PostComposer.vue` | ~1800 | **纯展示组件**（受控组件）。无业务状态，所有数据经 props 进、emits 出 |
| `src/views/Forum/styles/composer.css` | ~1365 | 编辑器主样式（被 PostComposer 的 scoped `@import` 引入） |
| `src/views/Forum/ForumMain.vue` | ~5600 | **编排层**。全部业务状态与事件处理在这里：图片管线、发布队列、草稿、冷却、发布会话 |
| `src/views/Forum/composables/useForumPostPolish.js` | — | 智能整理状态机（生成 / 收口 / 应用 / 撤销），文字流光时长也从这里注入 CSS |
| `src/views/Forum/styles/post-polish-sweep.css` | — | 标题/正文的逐字流光、状态行与 reduced-motion 兜底 |
| `src/stores/forumPublishQueue.js` | ~82 | Pinia store：即发即走发布队列（state 机：queued/uploading/publishing/success/failed） |
| `src/views/Forum/composables/useForumPostDraftStorage.js` | ~220 | 单份草稿的 localStorage 读写（按用户隔离 + cleared_at 标记；遗留多版本 key 会被清理）+ 实时暂存（`_autosave`，可带已上传图片 URL） |
| `src/views/Forum/forum-config.js` | 常量 | `FORUM_POST_IMAGE_MAX_COUNT = 6`、`FORUM_TAG_OPTIONS`、`FORUM_TAG_MAP` |
| `src/utils/api/forum/post-api.js` | ~1677 | `createPost` / `createPostWithImages`（发帖 RPC 封装）、草稿云端 CRUD、`updatePost` |
| `src/utils/api/forum-images-api.js` | ~190 | 图片上传/检测/删除：`moderateForumImage`、`uploadApprovedForumImageQueued`（3 路并发）、`deleteUploadedForumImage` |
| `src/utils/image-compression.js` | ~143 | 压缩计划 `getImageCompressionPlan` + `compressImageFileToUploadLimit`（browser-image-compression，Web Worker） |
| `src/utils/cloudinary-client.js` | ~530 | Cloudinary 上传/删除/pending 登记（`uploadImageToCloudinary`、`assertCloudinaryUploadAllowed`） |
| `src/utils/forum-image-moderation.js` | — | NSFW 检测（动态 import，WebGL classify，模型可预载） |
| `src/utils/content-moderation.js` | ~540 | 文本关键词预检（`runKeywordPrecheck`，scene: forum_post） |
| `src/views/PostDetail/PostDetailMain.vue` | ~3500 | **编辑帖子宿主**：编辑已有帖子（`edit-mode`） |

回归探针（`scripts/probes/`，Playwright + chrome channel，必须加 `args:['--no-proxy-server']`）：
`probe-composer-publish-dedupe.mjs`（出口去重 + 三档宿主）、`probe-composer-chips.mjs`（统一动作栏 + 旧结构反证）、`probe-forum-viewport.mjs`（横竖屏矩阵 / 旋转保活）、`probe-forum-polish-sweep.mjs`（文字流光明暗两档）。
性能实测见 §12：`probe-publish-tick-cost.mjs`（observer 重建单位成本）、`probe-publish-tick-breakdown.mjs`（每 tick 成本拆解）。

---

## 2. 分层架构（一句话版）

**PostComposer 是哑组件，ForumMain 是大脑。** PostComposer 只做渲染与交互原语（输入、拖拽、菜单定位、定位面板），每个交互都 emit 给父级；父级 ForumMain 持有全部状态（正文、图片、上传、队列、草稿、冷却），处理完再通过 props 流回来。图片处理与发布在 ForumMain 内部自成一套「边选边传 + 即发即走队列」体系。

数据流：`PostComposer(emit) → ForumMain(处理) → API 层 → Supabase/Cloudinary`，UI 状态反向 `props ↓`。

---

## 3. PostComposer.vue 详解

### 3.1 Props（全部由父级注入）

| Prop | 类型/默认 | 说明 |
|---|---|---|
| `isLoggedIn` | Boolean | false 时整个卡片替换为登录引导卡（`.login-prompt-card`，点击 emit `login`） |
| `userInfo` | Object | 头像、username（问候语/头像行用） |
| `newPost` | Object `{title, content}` | **v-model:newPost**，标题+正文 |
| `selectedPostTag` | String `'daily'` | **v-model:selectedPostTag** |
| `postLocation` | Object/null | **v-model:postLocation** `{name, cityName, districtName, precision, lat, lng}` |
| `postImages` | Array | 图片对象数组（结构见 §7.1） |
| `isSubmitting` / `isUploadingPostImage` | Boolean | 提交中 / 图片处理中（合成 `isPostBusy`，busy 时禁用一切图片操作） |
| `postImageUploadStatus` | String | 图片处理状态文案（选图→发布保持安静，仅卡顿/失败时出现） |
| `postCooldownSeconds` | Number | 发布冷却倒计时（按钮变「Ns 后发布」） |
| `maxPostImages` | Number = 6 | 图片上限（来自 `FORUM_POST_IMAGE_MAX_COUNT`） |
| `mentionUsers` | Array | @ 候选（父级 `forumMentionUsers`，组件内去重归一取前 24，过滤输入取前 6） |
| `forumTagOptions` | Array | 标签选项 `{value,label}`（来自 FORUM_TAG_OPTIONS） |
| `isMobileComposer` | Boolean | 发布会话模式：切换竖屏文案、拍照入口与全屏排版 |
| `isHomeCatTheme` | Boolean | 家猫主题（左下角装饰猫 HomeCatMascot，内容≥80 字或有图时 `is-awake`） |
| `editMode` | Boolean | 编辑模式（PostDetail 用）：问候语变「编辑帖子」、隐藏更多菜单、显示关闭按钮 emit `close` |
| `existingImages` | Array | 编辑模式的既有图片（当前实际由 editPostImages 走 postImages 传入，此 prop 兜底） |

### 3.2 Emits

`submit`、`close`（编辑模式关闭）、`login`、
`update:newPost` / `update:selectedPostTag` / `update:postLocation`（v-model 三件套，注意 update:newPost 是**整对象展开替换**），
`request-image-picker`、`request-camera`、
`image-selection`（payload `{files, event}`）、`remove-image(image, index)`、`retry-image(image, index)`、
`reorder-image({fromIndex, toIndex})`、`clear-images({cleanup: true})`（cleanup=true 时父级会云端删除）、
**关键模式**：`request-image-picker` / `request-camera` 传的是一个**回调函数** `() => fileInput.click()`。因为 `<input type=file>` 在 PostComposer 内部（两个隐藏 input：相册 `multiple`、拍照 `capture="environment"`），但「是否允许选图」（冷却/上限/busy 校验）在父级。父级校验通过后执行回调，change 事件再 emit `image-selection` 回去。

### 3.3 组件内部逻辑块（都在 PostComposer 里，纯 UI 层）

1. **标题自动增高**：标题是 `textarea rows=1`（非 input，为了可换行），高度由 `composables/useAutoGrowTextarea.js` 统一维护；上限只声明在 CSS `max-height: 132px`，JS 通过 `getComputedStyle` 读取。`TITLE_MAX_LENGTH = 50`，input 时 slice 截断 + 右下角 `n/50` 计数（满额变红 `is-near-limit`）。
2. **@ 提及**：正文 `input/keyup/click/focus` 时 `updateMentionState` 用正则 `/(^|\s)@([\u4e00-\u9fa5\w.-]{0,24})$/u` 检测光标前的 @ 前缀 → 弹 `.composer-mention-menu`（绝对定位在输入区左下）；点击候选 `insertMention` 用 `replaceContentRange` 替换区间并在 nextTick 恢复光标。更多菜单里也有「提及用户」= 在文末插入 `@`。
3. **图片网格交互**：
   - 预览：点图片 → `previewImage` → Teleport 大图灯箱（z-index 220200）。
   - 拖拽排序：HTML5 dragstart/dragenter/drop（仅 `canReorderImage` = 无 uploadStatus 或 approved/staged 可拖；busy 时禁用）。
   - 按钮排序：每张图左下角 ArrowLeft/ArrowRight 一对按钮（无障碍冗余）。
   - **状态徽章设计意图（重要）**：上传/优化/检测过程**不在图片上显示任何加载态**（真实进度由灵动岛统一展示）；只有 `uploadStatus === 'failed'` 才显示红色 badge + 重试按钮。
   - 「添加图片」方框卡（`post-image-add-more-card`）已停用：动作栏的「图片」是唯一入口。模板里保留节点是为详情编辑的既有网格布局兜底，发布态由 CSS 隐藏。
4. **位置功能（组件内自包含，不经过父级状态机，直接 v-model:postLocation 写回）**：
   - 数据源 Nominatim（OpenStreetMap）：`throttledNominatimFetch` 强制 1100ms 间隔 + Map 缓存 10 分钟（注意缓存返回 `res.clone()`）。
   - GPS 定位：`navigator.geolocation` → 逆地理 `zoom=13&accept-language=zh`，解析出 cityName（正则 `/市$/` 兜底 display_name）与 districtName；emit 的 precision 恒为 `'city'`（产品拍板只到城市级）。
   - 搜索：300ms debounce，`limit=5`，结果取 display_name 反转后「含市的后三段」做 shortName。
   - 面板：Teleport，桌面居中 360px 卡，≤899px 变底部上拉（`border-radius 32px 32px 0 0` + safe-area-inset-bottom）。
   - 已选位置在编辑器内显示为蓝色横条 `.post-location-bar`，可移除。
5. **更多菜单（MoreMenu）**：`handleMoreButtonClick` 记录按钮 rect → Teleport 面板。定位逻辑：窄屏（≤900）从底部弹出；正常屏在按钮上方、右缘对齐，`Math.max/min` 收进视口；打开期间监听 window scroll/resize 重定位（onUnmounted 清理）。菜单项：提及用户、添加/更换位置、拍照（仅发布会话）。z-index：overlay 220100 / panel 220101。
6. **统一动作栏**：`.composer-actions` 一行四席——标签（下拉）/ 图片（相册多选）/ 智能整理 / 更多。更多菜单只收纳提及用户、位置与拍照；不再有手动草稿面板、旧 chips 行、双工具条或预览模式。
7. **智能整理**：生成期间直接在标题/正文 textarea 的字形上跑文字流光（`.is-polishing`，`background-clip: text`），落点后直接替换并给「撤销」；没有覆盖层、预览面板或二次确认。
8. **冷却显示**：发布按钮 label 由 `submitButtonLabel` 控制——编辑模式「保存修改/保存中…」、冷却「Ns 后发布」、否则「发布」；`isSubmitting` 时按钮内出白色 mini-spinner。发布会话里内部 `.post-btn` 恒隐藏，顶栏「发布」是唯一出口。
9. **编辑模式**：头部问候换「编辑帖子/修改你的分享，记得保存～」，出现 X 关闭按钮（hover 旋转 90°），隐藏更多菜单。

### 3.4 样式体系要点

- 三个样式入口：`composer.css` + `replies-responsive.css`（scoped 共享层）、`post-polish-sweep.css`（全局文字流光/状态行）、组件尾部私有 scoped 块（位置面板、更多菜单、动画）。
- **液态玻璃 token 全走 `--liquid-*`**（`--liquid-bg/border/radius-lg/filter/highlight/shadow/blur/saturate/text-primary/...`），fallback 值内联。`.editor-card` = blur 28px + saturate 180% + 双层阴影 + 内高光，支持 `corner-shape: squircle` 渐进增强；`@supports not (backdrop-filter)` 与 `.boh-perf-lite` 各有降级。
- **字体栈铁律**：`.editor-card` 显式声明 `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro SC", "PingFang SC", ...` 并让 input/textarea/button `inherit`——因为 Teleport 弹层不在 `.forum-page` 内，表单元素会回落到浏览器默认等宽字体（历史 bug）。
- `:deep()` 只在 SFC scoped 有效；全局 css 一律平铺后代选择器（如 `.editor-card .post-image-add-more-card`）。
- 视觉拍板：纯白 + 圆角玻璃**禁渐变**，主色 `#0071e3`（--apple-blue）。

---

## 4. 两个宿主、一个发帖会话

**新帖只有两个入口，二者都打开同一个 ForumMain 发布会话：**

1. **横屏分栏**：左栏「发布」（`[data-rail-action="compose"]`）→ `ForumSectionShell.openComposer()` → `ForumMain.openMobileComposer()`。会话 Teleport 到 body，但只覆盖右区（`left = 左栏宽`），左栏保持可见；切落点前由 `useForumComposerSession.dismissComposerSession()` 先收会话。
2. **竖屏 / 无分栏**：FAB `.mobile-compose-fab` → 同一 `openMobileComposer()`，会话铺满视口。900×700 这类横屏但无分栏的尺寸也由 FAB 承担。

**会话顶栏**：竖屏为 `取消 / 发布`，横屏分栏只显示 `发布`（左栏仍是退出上下文）；`取消` 走 `closeMobileComposer`（有未保存内容时弹「保存草稿」），发布走 `handlePost`。**内嵌发帖编辑器已废弃并从 ForumMain 模板删除**，页面里不应再出现 `.forum-left-column > .post-creation-section`。

**旋转**：会话不再因横竖屏切换而关闭，内容与滚动锁保持；只在内部重排为横屏右区/竖屏全屏。

**进出场**：竖屏以触发 FAB 的中心为 `transform-origin`，从 `scale(0.08)` 放大成整页 / 关闭时缩回按钮（`.mobile-composer-enter-active` / `leave-active`，380ms emphasized 曲线，opacity 180ms 辅助）；横屏分栏保持即时切换。FAB 中心由 `captureMobileComposerOrigin()` 在开关时实测并注入 `--mobile-composer-origin`，不在 CSS 写死右下角（安全区 / embedded 抬升 / 旋转都会变）。⚠️ overlay 是 `<Transition>` 根节点，禁止再给它写 `transform: none !important` —— 旧的「立即上屏」规则只应落在 `.mobile-composer-section` 与 `.editor-card` 上；`probe-composer-motion.mjs` 读动画中间帧守住这条。

**编辑已有帖子**（PostDetailMain.vue）：`<PostComposer edit-mode>`，v-model 绑 `editNewPost/editSelectedPostTag/editPostImages`；竖屏同样出现 `post-edit-bar` 顶栏承担保存；提交走 `submitEditPost`（updatePost + updateForumPostImages），不是发帖队列。`PostComposer` 保留正是为这个宿主与新帖会话。

---

## 5. ForumMain 编排层 — 状态与关键 handler

核心状态（ForumMain ~548-560、1136-1160 行）：

```js
newPost = ref({title:'', content:''}); selectedPostTag = ref('daily');
postImages = ref([]); postLocation = ref(null);
isSubmitting; isUploadingPostImage; postImageUploadStatus;
isMobileComposerOpen; // 新帖发布会话唯一开关（横屏左栏 / FAB 共用）
postCooldownUntil = ref(0);  // 冷却时间戳
savedPostDraft = ref(null); postDraftSaveTimer; postDraftRestoreSeq;
// 草稿**只有一份**（2026-10-26 产品定稿）：云端 forum_post_drafts 为准，本地 localStorage 只是缓存。
// 没有"草稿列表/历史版本"——清空内容或退出选「不保存」= 删除这份草稿。别再引入多版本。
```

冷却系统：`startActionCooldown(target, seconds)` 支持 `post / reply / imageUpload` 三种；`ensureCooldownTimer` 每秒 tick，三个都归零后自毁。发帖成功后 `startActionCooldown('post', 8)`（8 秒）；图片上传限流错误也会触发 imageUpload 冷却（`applyImageUploadRateLimitCooldown`）。

图片选入总入口 `handlePostImageSelection(payload)`（~1631 行）：
1. 取 files → 剩余额度 = `6 - postImages.length`，超出弹窗并截断。
2. 为每个文件造 pending 对象（`uploadId: uploading-{batch}-{i}`、`URL.createObjectURL` 本地预览、`uploadStatus: isBeta5 ? 'staged' : 'preparing'`）push 进 postImages。
3. **分岔（isBeta5 来自 useAppMode）**：
   - **Beta5（边选边传，现行）**：预载 NSFW 模型 + 300ms debounce 后逐张 `scheduleDraftImagePipeline`（见 §7）。此模式下**选图阶段不上传进度给编辑器**，点发布时多半已就绪。
   - **稳定模式（非 Beta5）**：立刻同步走 `prepareForumImageForUpload`（压缩）→ `runForumImageUploadQueue`（并发 3 上传），逐张更新 `postImageUploadStatus` 文案与图片 uploadStatus，失败收集后统一弹窗。
4. 其他 handler：`removePostImage`（取消管线 + revoke 预览 + 云端删除，uploading 中的管线例外见 §7.3）、`retryPostImageUpload`（移除失败图→重走选图→插回原位）、`reorderPostImage`（splice + `normalizePostImageSortState` 重排 sortOrder）、`clearPostImages({cleanup})`（cleanup=true 才云端删除）。

---

## 6. 发布流（handlePost → 队列 → runPublishQueue）

### 6.1 handlePost（~3339 行）— 「即发即走」

守卫链（顺序）：未登录→弹登录；封禁（永久/临时未到期）；禁言；标题为空；图片超 6 张；发布冷却中。
然后：
1. **快照**：捕获 title/content/tag/location/images（images 保留 File 与 localPreviewUrl，`uploadStatus` 兜底 `staged`/`approved`）。
2. **指纹去重**：`JSON.stringify([title, body, images的[publicId,name,size]])`，队列里有相同指纹且在途 → 拒绝。
3. `submissionId = crypto.randomUUID()`（幂等发帖用）。
4. `publishQueueStore.enqueue(...)` + `insertOptimisticPost(queueItem)`——乐观帖子卡插到列表顶（带进度条与失败态按钮）。
5. **立即清空编辑器**（title/content/tag/location/images 全清、清草稿本地+云端、关 overlay），无二次确认。
6. `startActionCooldown('post', 8)`，`void runPublishQueue()`，`scrollForumTo(0)`。

### 6.2 队列 worker `runPublishQueue`（~913 行）

单飞锁 `publishWorkerRunning`；循环取 `state==='queued'`：
1. state→uploading，建 AbortController 存 `publishAbortControllers`。
2. 有图则 `processPublishImagesForQueue(item, signal)`：逐张等 draftImagePipelines 里的 promise（全就绪则秒过），成功 `replaceUploadedImage` 换成云端数据；任一张失败 → `markImageFailure`（failType moderation）并**取消同批其余管线**。进度映射：压缩 0-35% / 检测 35-50% / 上传 50-100%，发布阶段 82→88→96→100。
3. `createPost(body, authorId, username, 'approved', title, finalImages, tag, location, {submissionId})`。
4. 成功：state success → 乐观卡换真实卡 `replaceOptimisticWithReal` → revoke 预览 URL → `addExperience(XP_REWARDS.POST)` → `claimPostPublishReward`（发帖得积分活动，奖励用**瞬时岛**；成功态本身用常驻 Airdrop 式任务岛）→ `emitProfileSync` → 刷新周报 + 持久化 feed 快照 → 900ms 后移除队列项。
5. 失败：`applyRateLimitCooldown`；归因 `failType` = `moderation | network`；state failed + 乐观卡失败态；**break 中断队列**等用户操作。任务岛（`showIsland.task`）常驻展示，按 failType 出不同操作按钮：
   - moderation：`fix`（移除该图后重试，`fixModerationPublish`）/ `edit`（`editFailedPublish` 回填编辑器）/ `cancel`
   - network：`retry`（`retryPublish`）/ `edit` / `cancel`（取消会云端清理已传图）
   - **重试坑（已修，勿回退）**：失败图自身的 pipeline entry 必须从 map 删除，否则 `scheduleDraftImagePipeline` 因「已存在」拒绝重建 → 重试永远立即失败（`runPublishQueue` 内 ~894 行注释即此因）。

### 6.3 API 层 `createPost` / `createPostWithImages`（post-api.js ~785 行）

1. 校验：图片 ≤ 上限、标题必填；`resolvePostAuthorIdentity` 兜底解析作者（未登录→NOT_AUTHENTICATED）。
2. 拼正文 `【title】\ncontent` → `runKeywordPrecheck`（本地关键词预检，命中 REJECTED → LOCAL_KEYWORD_BLOCK 拒绝）。
3. RPC：有 submissionId 走 **`create_forum_post_with_images_idempotent`**（+`p_submission_id`，防网络重试重复发帖），缺函数降级 `create_forum_post_with_images`，再缺参数再降级去掉 tag/location 的 legacy payload。
4. tag 回写（RPC 不含 tag 时 update posts 表）、`invalidateByTags(['posts','profiles','boh-cloud'])` 清缓存。
5. 后台并行（不阻塞返回）：`schedulePostModeration`（帖子异步审核入队）、`markCloudinaryUploadsClaimed`（pending 归属标记，失败则 `cleanupOrphanedUploads` + 云端删除孤儿图）。

---

## 7. 图片管线（本项目最复杂的部分）

### 7.1 图片对象结构

```
{
  uploadId, name, file(原始File), url(预览/云端URL), localPreviewUrl,
  publicId, deleteToken, width, height, format,
  uploadStatus: 'preparing'|'staged'|'optimizing'|'queued'|'uploading'|'approved'|'failed',
  uploadStatusLabel, uploadError, sortOrder
}
```

### 7.2 Beta5 预热管线 `scheduleDraftImagePipeline`（~1816 行）

三段式，核心目标：**用户打字期间图片后台传完，点发布接近秒发**。

- **压缩**（2 路并发池 `COMPRESSION_CONCURRENCY`，`navigator.deviceMemory < 4` 降 1 路）：跑在 browser-image-compression 的 Web Worker。进度 0→0.35。
- **检测**（3 路并发池 `MODERATION_CONCURRENCY`，2026-10-29 从「全局串行链」改来）：池任务内先 await 本张压缩 → `moderateForumImage`（云优先 + 本地兜底）→ 非 approved 直接 fail。进度 0.35→0.5。quiet 模式**不写中间状态到编辑器**。
  - **为什么敢并发**：云端审核是纯 fetch（无 WebGL、无共享可变状态），而本地兜底的 `classify` 由 `forum-image-moderation.js` 的 `classifyMutex` 模块级互斥 ⇒ 旧链对本地是双重保险、对云端是纯排队。
  - **为什么只开 3 路**：一次 6 张全并发，一场 300ms 网络抖动会让在飞的请求**同一瞬间**全部失败，一步凑满连续失败阈值 ⇒ 云端冻结 60s ⇒ 整批转本地**从宽**判定。所以 pipeline 侧同步把失败改按**波次**记（`cloudInFlight`：还有别的请求在飞就并进本波），3 路时一次抖动只算 1 次。
  - **本地兜底**：`image-moderation-pipeline.js` 的 `localFallbackChain` **强制单并发**（不止 classify，连整文件解码也串起来）。移动端批量本地审核会崩是已被用户实测过的事故，所以在 pipeline 层兜住 —— 调用方开了几路都落到一个一个来。
  - **实测成本**（1600px 输入，Chrome M4）：224px 编码 17ms/张、本地 classify 稳态 33ms/张（首张含模型初始化 690ms）⇒ 串行的代价几乎全是云端 RTT，**不是**本地 CPU。
- **上传**（`uploadApprovedForumImageQueued` → forum-images-api 全局 3 路并发队列 `uploadQueue`）：进度 0.5→1.0；成功 `updatePendingPostImage(uploadId, {...result.data, uploadStatus:'approved', uploadStatusLabel:'已就绪', file})`。
- `entry.promise` 是全链 promise，发布 worker 通过 `awaitPipelineSettled(entry, {uploadId})` 等它（**不再裸 await**）：`entry.promise` 失败会自己吞错，唯一的坏形态是**永不 settle**（压缩卡住 / 检测模型加载挂住 / 上传被系统挂起），那时 worker 永久停在 await 上——岛显示「发送中」、进度不动、没有按钮可点，后面排队的帖也一起冻死。看门狗按「进度连续 90s 没前进」判失败（真实进度每 300ms 被聚合读一次，字节还在走就不会误杀慢网），失败时顺手 `cancelDraftImagePipeline` 把死管线从 map 摘掉（否则重试被「已存在」挡回去、直接复用同一条死 promise），并归类为**可重试**的网络错误。
- 上传超时口径（`cloudinary-client.js` 的 `uploadFormDataWithProgress`）：**空闲 30s（每有字节前进就重置）+ 总上限 180s**。原来的「整个上传固定 30s」是总时长超时，移动网络传 2MB 稍差一点就必失败，而连接真正挂死时也要等满 30s。

### 7.3 取消/删除语义（精细，易踩坑）

- `cancelDraftImagePipeline(uploadId)`：标记 cancelled；**若 state==='uploading' 不 abort 网络请求**（让它自然完成并登记 cloudinary pending，孤儿图由 Edge Function 兜底清理），同时 `cleanupPending=true` 避免与云端删除竞态；否则 `controller.abort()`。entry 从 map 删除。
- `removePostImage`：取消管线 → revoke 预览 → 从数组移除 →（非 cleanupPending 时）`cleanupUploadedForumImage` 云端删除（deleteToken 优先，无 token 用 publicId；有 `postImageCleanupLocks` 防重）。
- `clearPostImages({cleanup:true})`（编辑器「清空图片」按钮）：先收集 uploading 中的管线 id，再全取消，未在上传中的逐张云端删除。

### 7.4 压缩层（image-compression.js）

- `getImageCompressionPlan`：判超限（maxSizeBytes / maxDimension / maxPixels，来自 cloud-upload-guard）+ 主动优化（optimizeForUpload=true 时 JPEG/WebP 超 2MB 或边长超 2048 就压）。PNG（不可有损优化）若超限且不可压则报错换格式。
  ⚠️ 论坛发帖**不用**这两个全局默认值，而是显式传 `FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS`
  （1600 / 0.9MB，见 `forum-format.js` 与 §12.3）：全局默认是给影集/云盘等「下载后可另存原图」的入口用的。
- `compressImageFileToUploadLimit`：**统一输出 WebP**（展示端 Cloudinary f_auto，源格式无关紧要）；**分桶首轮质量**（≥8MB→0.78，≥4MB→0.82，否则 0.85）+ maxIteration 4 —— 大图压缩耗时 -30~50%（A1 调优）。压缩后仍超限则报错。

### 7.5 上传/检测层（forum-images-api.js）

- `moderateForumImage`：先 validateForumImageFile（仅 PNG/JPG/WebP，GIF 拒绝；大小上限 FORUM_IMAGE_MAX_SIZE_MB）→ 动态 import 检测模块。
- **服务端降级链（2026-10-29）**：云端失败不再「一次就落到本地」。`bohai_model_configs.fallback_mode_ids`
  存一串 mode_id，`api-key-vault` 的 `resolveRuntimePolicyChain` 逐跳重试（0/400/403/404/408/429/5xx 都换，
  **401 不换**——链上共用一把 key，换模型救不了）。当前链（2026-10-29 实测定序）：
  `gemini-3.5-flash-lite` → `gemini-3.5-flash` → `gemini-3.6-flash`。
  ⚠️ 这条链挡的是「某个模型不可用 / 被限流」；**挡不住** Worker 或那把 Gemini key 挂掉（三者共用同一出口），
  那类故障仍然直接落本地。降级时 meta 事件会带 `model` / `fallbackFrom`，别再让它静默降级。
- ⚠️ **选型口径是「实测可用 + 最快」，不是「版本号最新」**（2026-10-29 踩了两次）。端到端实测
  （EF → Worker → Gemini，224px 真实送审尺寸，各 2 次）：

  | 模型 | 文本 | 带图 | 中位延迟 |
  |---|---|---|---|
  | `gemini-3.5-flash-lite` | ✅ | ✅ | **2.8s** |
  | `gemini-3.5-flash` | ✅ | ✅ | 3.6s |
  | `gemini-3.6-flash` | ✅ | ✅ | 4.3s |
  | `gemini-3.8-flash` | ❌ 503 / 30s 超时 | ❌ | — |

  `gemini-3.8-flash` **纯文本就挂**（与带不带图无关），写进配置前必须先跑一次真请求；
  守卫在 `tests/unit/bohai-model-fallback-chain.test.js` 的 `VERIFIED_MODELS` 白名单里。
- ✅ **已解（2026-10-29）**：客户端 `CLOUD_TIMEOUT_MS` 2500 → **6000**，服务端降级链改成
  「整条链共用一份预算」而不是每跳各拿满额。2500 比最快一跳 2.8s 还短 ⇒ 在此之前
  图片云端审核**从未真正生效过**（每次都在客户端先超时，回落本地 nsfwjs 从宽判定）。
  6000 覆盖「第 1 跳成功 2.8s」与「第 1 跳快速失败 + 第 2 跳 3.6s ≈ 3.9s」；
  两个慢跳全串行（≈6.4s）会超时回落本地 —— **刻意接受**。
  代价：真不可达时单批等待 2.5s → 6s，但论坛侧 3 路并发 + 连续失败 3 次即冷却，
  最坏只付一波。守卫：`image-moderation-pipeline.test.js`（超时契约）+
  `bohai-model-fallback-chain.test.js`（每跳按剩余预算）。
- `preloadForumImageModeration`：模型预载（选图时 `scheduleForumImageModerationPreload({immediate:true})` 调用，与压缩并行）。
- **本地模型改走自托管二进制（2026-10-29）**：nsfwjs 只分发「权重内联成 base64 的 3.49MB JS」，
  浏览器要下载 → 当 JS 解析（单行 349 万字符）→ base64 解码，全在主线程 —— 这是「预热卡输入」
  与「兜底初始化 30s 超时」的主要成本。`scripts/build-nsfw-model-assets.mjs` 把**同一份权重**
  转成 `public/models/nsfw/mobilenet_v2/{model.json,group1-shard1of1.bin}`（2.50MB / gzip 1.99MB），
  加载走 `tf.loadLayersModel(url)`，不再经过 JS 解析。**精度不变**：.bin 就是那串 base64 的解码结果，
  浏览器实测两条路径 5 个类概率**逐位相同**；初始化耗时实测 14.1s → 6.4s（headless SwiftShader，
  只看相对量）。JS 包路径保留为兜底（资产缺失/升级后缓存错配时自动退回，不报错、只是慢回去），
  资产是生成物不入库（`public/models/` 已 gitignore），build / build:ci / predev 前置自动生成。
  守卫：`tests/unit/nsfw-model-asset.test.js`（产物结构 / 字节一致 / 接线 / 不入库）。
- `uploadApprovedForumImage`：`assertCloudinaryUploadAllowed({source:'forum'})` → `uploadImageToCloudinary(file, {folder: FORUM_CLOUDINARY_FOLDER, pendingSource:'forum', skipUploadPreflight:true, onProgress, signal})`。
- 并发队列：`uploadQueue` + `MAX_CONCURRENT_UPLOADS = 3`，**仅网络层并发**（压缩/检测已在调用方控并发）。

---

## 8. 草稿系统

- **双层存储**：localStorage（`useForumPostDraftStorage`，key = `forum_post_draft_{uid}`，按用户隔离；带 `_cleared_at` 清空标记，防止「远端旧草稿回填已清空的编辑器」）+ 云端（`savePostDraftToDatabase` → `upsertForumPostDraft` / `deleteForumPostDraft`，防抖 `schedulePostDraftDatabaseSync`）。
- **实时暂存（2026-10-29）**：第二条命，不是第二份草稿。key = `forum_post_draft_{uid}_autosave`，编辑器开着时 debounce 400ms 写、`pagehide` / `beforeunload` 同步 flush；内容是编辑器当前状态的**本机镜像**（含已上传图片的持久 URL，`blob:` 一律丢弃）。不进云端、不出现在任何「草稿列表」，只为「刷新 / 崩溃 / 误关标签页」兜底。恢复时与正式草稿取 `savedAt` 较新的一份；用户明确删除草稿（关闭选「不保存」/ 清空后关闭 / 发布成功）时一起清掉。
- **保存时机（拍板）**：**正式草稿**没有固定的自动保存定时器，也不在输入时静默写云端；编辑器内**不显示**「已自动保存 HH:MM」。保留的路径只有三条：打开发布会话时 `restorePostDraft({ preserveLocalEdits: true })` 恢复、关闭会话时 `closeMobileComposer` → `requestConfirm('保存草稿')` 后走 `persistPostDraft`、发布成功后全链路清空。**手动草稿面板已移除**（`open-draft` / `save-draft` / `saveMobileDraft` 都不得回流）。
- **墓碑纪律（2026-10-29 僵尸草稿事故）**：`_cleared_at` **只在新草稿 upsert 成功后**清。删除成功后清墓碑 = 忘掉「用户明确删过」，任何仍持旧副本的路径（典型：另一个宿主实例正在 `await` 的 `restorePostDraft`，读到的是删除前的 `localDraft`）都能把同一段文字写回云端并刷新 `updated_at`，用户看到的就是「删了又回来、怎么删都删不掉」。`savePostDraftToDatabase` 是**唯一**云端写入出口，`draft.savedAt <= cleared_at` 一律拒写；`applyExternalDraftChange` 收到 clear 时 `postDraftRestoreSeq += 1` 让本实例在飞的恢复失效，并掐掉待写的 `autoSaveDraftTimer`（否则 400ms 防抖在删除之后才落盘，下次打开又恢复回来）。守卫：`tests/unit/forum-post-draft-autosave-guard.test.js`。
- **跨设备闸门（2026-10-29 第二轮）**：`_cleared_at` 是本机的，挡不住「另一台设备删了、这台还留着旧副本」。所以再加一条事实标记 `forum_post_draft_{uid}_pending_push`：**只有它存在时，本机才被允许把草稿覆盖到云端**。置位点在 `persistPostDraft`（用户主动保存 = 本地确实领先云端）；清除点只有两处 —— 这次改动真的写进云端之后，或用户删掉草稿之后（`writeLocalPostDraft(null)` 在存储层单点清）。于是「云端查不到草稿 + 本机没有该标记」⇒ 云端是被别处删过的，本机副本只留在本地给用户看，**绝不回写**。别再退回「比较 `savedAt` 谁更晚就推」——那只说明本机这份看起来更新，不说明云端欠它一次写入。
- **删除必须核对影响行数**：`deleteForumPostDraft` 的 `delete()` 带 `.select('user_id')`。PostgREST 被 RLS 挡掉时**不报错**，只是 0 行受影响 —— 旧实现照样返回 `ok:true`，界面提示「已删除」而库里还在，是最隐蔽的一种「删不掉」。
- `restorePostDraft`：恢复草稿时会比较 `postDraftRestoreSeq` 序号防竞态（恢复请求返回前编辑器已被清空则丢弃）。
- `beforeunload`：有在途发布任务 →「有内容正在发送」；竖屏编辑器开着且有未保存内容 →「是否保存为草稿」。内容已落进实时暂存后再弹这条只会教用户无视提示，所以 `isEditorDirty()` 把暂存也算「已落盘」。
- 发布成功后草稿全链路清空（本地 + 云端 + 暂存）。

---

## 9. 其他子系统速览

- **周签到**：`handleWeeklyCheckin` → `submitWeeklyCheckin()`；入口在 `ForumToolbar`，结果看独立 `WeeklyCheckinCalendar` 弹窗。编辑器内不再嵌周签到面板。
- **mentionUsers 来源**：`forumMentionUsers` computed（~452 行），从当前加载的帖子/评论作者归一而来。
- **FAB 可见性**：所有 feed 视口下、`feedMode==='posts'` 时显示（内嵌发帖器退场后 FAB 不再限竖屏）；embedded 时还要求路由是 `/user-space?tab=community`（论坛真实入口，`/forum` 已 redirect）。
- **图片来源**：动作栏「图片」直接开相册多选；「更多」里的「拍照」仅发布会话（`isMobileComposer`）显示。旧的 `postImageSourceMenu` 状态与监听已删除。

---

## 10. 给后续 AI 的告警区（铁律与坑，勿回退）

1. **本项目 Vue 编译器不支持 `:global()`**（SFC scoped 里原样泄漏导致整条规则失效）；全局样式一律平铺后代选择器。
2. **Teleport 弹层不在 `.forum-page`**：局部 token/forum-dark.css 作用不到；弹层要么只用全局 `--liquid-*`，要么自带暗色覆盖 + 字体栈 + 表单 `inherit`（`.editor-card` 的 font-family 声明就是为此）。弹层 z-index 需 ≥10002 盖过 UnifiedNavbar（本组件用了 220100/220200 层级）。
3. **图片设计意图**：上传/检测过程图片上不显示加载态（进度只在灵动岛）；只保留 failed badge + 重试。别把 spinner 加回图片。
4. **重试失效根因已修**：failed pipeline entry 必须先 delete 再重建（§6.2）。
5. **取消上传中的图不 abort 网络**：登记 pending 走云端兜底清理，避免 pending 登记×删除竞态（§7.3）。
6. **压缩统一 WebP + 分桶首轮质量**是性能调优结果，勿改回固定 0.85。
7. **幂等发帖 RPC**（create_forum_post_with_images_idempotent + p_submission_id）是防重复发帖的关键，降级链不可删。
8. **`:deep()` 只在 SFC scoped 有效**，抽到全局 css 会静默失效。
9. `Edit` 工具可能静默丢改动：重要编辑写后重读校验。
10. **发帖入口只剩两处、共用一场会话**：横屏分栏的左栏「发布」，其余 feed 视口用 FAB。不要再把 `PostComposer` 内嵌回 `.forum-left-column`；那会同时产生两个编辑状态与第二个发布出口（`probe-composer-publish-dedupe` / `probe-composer-chips` 会红）。竖屏判定仍是 `width<=1024 && height>=width`，但它只影响编辑弹层排版，不再作为「是否有内嵌编辑器」的开关。
11. 伪装登录探针注意：`auth.userInfo` 是 reactive({})，须 `Object.assign` 原地改；Playwright launch 必须加 `args:['--no-proxy-server']`。
12. 视觉拍板：纯白圆角玻璃禁渐变；主色 #0071e3；`!important` 有预算门禁（scripts/check-important-budget.mjs，基线见 important-budget.json），新增样式避免滥用。

---

## 11. 一次「选 3 张图 + 打字 + 点发布」的完整时序（把上面串起来）

1. FAB / 左栏「发布」→ 发布会话 → 动作栏「图片」→ 父级校验 → 回调触发隐藏 input → `image-selection` → `handlePostImageSelection`。
2. 3 个 pending 占位进网格（本地 blob 预览，无任何加载圈）。
3. 300ms 后预热管线启动：图 1/2 压缩并行（2 路）→ 检测串行链逐张 → 各自进入 3 路上传队列；模型预载与首张压缩同时开始。
4. 用户继续打字（mention 菜单、字数统计、标题自动增高均为纯前端）。
5. 点发布 → `handlePost` 守卫 → 快照+指纹 → 入队 → 乐观卡置顶 → 编辑器瞬间清空 → 8s 冷却。
6. worker 取任务：等剩余管线完成（快则 0ms）→ `createPost` 幂等 RPC → 关键词预检 → 落库 → 乐观卡换真实卡 → XP/积分奖励/周报刷新。
7. 任一环失败：任务岛常驻 + 失败归因（moderation→移除该图重试 / network→重试），队列中断等操作；期间 beforeunload 有拦截提示。

---

## 12. 性能实测（2026-10-29）—— 别凭感觉归因

### 12.1 测量工具

| 工具 | 测什么 | 命令 |
|---|---|---|
| `tests/unit/forum-feed-observer-churn.test.js` | **确定性计数**：一次发布过程中的 observer 重建次数（真实 composable，不读源码字符串） | `npx vitest run tests/unit/forum-feed-observer-churn.test.js` |
| `scripts/probes/probe-publish-tick-cost.mjs` | 真实 Chromium 里「一次 observer 重建」的耗时 | `node scripts/probes/probe-publish-tick-cost.mjs` |
| `scripts/probes/probe-publish-tick-breakdown.mjs` | 真实组件实例上拆解每 tick 的 A/B 成本 | `node scripts/probes/probe-publish-tick-breakdown.mjs` |

探针前置：`npm run dev`；本机 dev 只监听 IPv6 回环，`PROBE_BASE` 用 `http://[::1]:5173`
（`127.0.0.1` 连不上）。断点测量靠 `<script setup>` 在 dev 下暴露的 `setupState`，
生产构建不可用 —— 所以这是**开发机构建下的量级参照**，不是线上指标。

### 12.2 实测数字（50 帖 / 虚拟化开启 / 可见 30 卡 / Chrome on M4）

| 项 | 值 | 说明 |
|---|---|---|
| A 整列替换 + 重渲染 | mean **0.298ms** / p95 0.5ms | `forumData` 换数组 → Vue 重渲染可见窗口。**新旧实现都要付** |
| B `buildOptimisticPost`（6 图） | mean **0.011ms** / p95 0.1ms | 旧实现每 tick 都做；新实现只在状态变化时做 |
| C observer 重建（50 节点） | mean **0.014ms** / p95 0.1ms | 旧实现每 tick 都做；新实现 0 |
| 每 tick 净节省 | ≈ **0.025ms** | B + C |
| 20s 带图发布（67 tick）总计 | ≈ **1ms** | 摊到 20 秒里完全不可感知 |

**结论（重要，别回退认知）**：进度 tick 这条路径**不是**「发帖卡」的主因。
2026-10-29 早期把它判成「每 300ms 整页重绘 = 卡顿来源」是**错的**，已被上述测量推翻；
相关改动（跳过进度 tick 的图片块重建、签名式 observer 重建）保留是因为它们**语义正确且零成本**，
但要清楚它们带来的是 **~1ms/次发布**，不是体验级提升。

### 12.3 真正影响「发帖慢/不稳」的项（这些才是量级）

1. **上传字节数**（决定性，2026-10-29 已收档）。先纠正一个错误估算：此前写的「6 张 × 目标 2MB
   ≈ 12MB」是拿 **2MB 上限**当实际值，压缩其实一直在跑。真实 2048 档照片单张约 380~620KB
   （取决于内容，见下），6 张 **2.5~3.6MB 量级**，不是 12MB。
   真正的浪费在展示侧上限：列表 `w_720`、详情 `w_1600`，而 `ForumImageViewer` 的取图顺序是
   `[detailUrl, originalUrl, ...]` 且 `detailUrl` 恒存在 ⇒ **originalUrl 永不被下载**。
   也就是说 2048 档多出来的那些像素，任何界面都不会加载。
   现改为 `FORUM_UPLOAD_IMAGE_MAX_DIMENSION=1600` / `targetSizeMB=0.9`
   （`utils/api/forum-format.js` 单源，论坛侧显式传入，不动全局 2048 默认以免牵连影集/云盘）：
   **实测（真实管线，2026-10-29）**：在 vite dev 里直接调 `getImageCompressionPlan` +
   `compressImageFileToUploadLimit`（不是 canvas 近似），三个 4032px 样本：
   照片样本 2048 档 379KB/256ms → 1600 档 249KB/205ms（**−34%**），另两样本 −27% / −26%。
   **体积降幅 −26%~−34%**，不是纯面积比的 −39%。**压缩耗时基本持平**（205~269 vs 222~264ms，
   属噪声 —— Web Worker 启动与库质量迭代是固定成本）。
   ⚠️ 只有**相对降幅**是可靠的：绝对体积强依赖内容（同一张 4032 壁纸 55KB、照片 379KB、细节更多的
   手机原片可能 600KB+），所以别把某次样本的 KB 数写成通则。
   收益随上行带宽放大：1Mbps 省 ~8s、2Mbps 省 ~5s、50Mbps 基本无感 —— 它只压了发帖关键路径
   里「上传」一段的 30%，**不是「卡」的解药**（审核 RTT 与上传物理下限仍在）。
   **画质零损失（有实测，不是断言）**：同一张 4032×3024 照片，两条路径最终展示尺寸都是
   1600×1200，可直接逐像素比 —— 旧路径（→2048→WebP→再缩 1600）PSNR **39.70dB** / 平均像素差 1.78，
   新路径（→1600 一步到位）PSNR **39.67dB** / 平均像素差 1.88，**差 0.03dB ＝ 噪声级**。
   也没有「少一次重采样所以更清晰」这回事，两条路径打平。
   ⚠️ 边界：这条前提**依赖「没有查看原图/下载入口」**（当前属实，`ForumImageViewer` 只取 detailUrl）。
   将来若加下载原图、或把 `FORUM_DETAIL_IMAGE_TRANSFORM` 提到 2048，则**此前的 1600 帖子补不回来**，
   历史帖清晰度天花板锁在 1600。
   ⚠️ 不变量：上传档位必须 ≤ 详情展示宽度，只有先调大 `FORUM_DETAIL_IMAGE_TRANSFORM`
   才允许调大上传档。护栏 `tests/unit/forum-upload-image-tier.test.js`（撤掉传参 / 改回 2048 均红）。
   ⚠️ 未处理：PNG 走不了有损优化，4032px 截图仍原样上传（属同类冗余，需单独拍板要不要转 WebP）。

2. **队头阻塞 900ms**（已修）：成功后 `await 900ms` 保留队列项会把后续排队的帖冻住；
   改成 `setTimeout` 后连发两帖不再凭空慢近 1 秒。
3. **每次发帖一次 `/auth/v1/user` 往返**（已修）：`createPost` 取 userId 从 `getUser()`
   改为 `getSession()`（RLS 认 JWT，取 userId 等价），省掉关键路径上一个网络往返。
4. **上传超时口径**（已修，稳定性）：XHR 从「整个上传固定 30s」改成「空闲 30s + 总上限 180s」。
   移动网络 2MB @ 100KB/s 需 20s+，旧口径稍差一点就必失败；而且真挂死要干等满 30s。
5. **图片管线看门狗**（已修，稳定性）：`entry.promise` 有不 settle 的最坏形态（压缩/模型挂住），
   旧实现会让发布 worker 永久停在 `await`、后续队列一起冻死。现在按「90s 无进度前进」判失败
   并把死管线从 map 摘掉（不摘的话重试会复用同一条死 promise）。
