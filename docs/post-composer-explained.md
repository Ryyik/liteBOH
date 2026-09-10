# 发帖编辑器（PostComposer）代码详解 — 上下文交接文档

> 目的：把发帖编辑器的完整上下文一次性讲清，供其他 AI / 新会话直接使用，无需重新检索代码库。
> 项目：BOHLITEBeta2.5（Vue 3 + Vite + Pinia + Supabase，hash 路由）
> 基于代码版本：2026-09-09 前后（行号会漂移，定位一律以函数名/类名为准）

---

## 1. 文件地图

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/views/Forum/components/PostComposer.vue` | ~1490 | **纯展示组件**（受控组件）。无业务状态，所有数据经 props 进、emits 出 |
| `src/views/Forum/styles/composer.css` | ~1860 | 编辑器主样式（被 PostComposer 的 scoped `@import` 引入） |
| `src/views/Forum/ForumMain.vue` | ~4535 | **编排层**。全部业务状态与事件处理在这里：图片管线、发布队列、草稿、冷却、周签到 |
| `src/stores/forumPublishQueue.js` | ~82 | Pinia store：即发即走发布队列（state 机：queued/uploading/publishing/success/failed） |
| `src/views/Forum/composables/useForumPostDraftStorage.js` | ~130 | 草稿 localStorage 读写（按用户隔离 + 版本历史 + cleared_at 标记） |
| `src/views/Forum/forum-config.js` | 常量 | `FORUM_POST_IMAGE_MAX_COUNT = 6`、`FORUM_TAG_OPTIONS`、`FORUM_TAG_MAP` |
| `src/utils/api/forum/post-api.js` | ~1677 | `createPost` / `createPostWithImages`（发帖 RPC 封装）、草稿云端 CRUD、`updatePost` |
| `src/utils/api/forum-images-api.js` | ~190 | 图片上传/检测/删除：`moderateForumImage`、`uploadApprovedForumImageQueued`（3 路并发）、`deleteUploadedForumImage` |
| `src/utils/image-compression.js` | ~143 | 压缩计划 `getImageCompressionPlan` + `compressImageFileToUploadLimit`（browser-image-compression，Web Worker） |
| `src/utils/cloudinary-client.js` | ~530 | Cloudinary 上传/删除/pending 登记（`uploadImageToCloudinary`、`assertCloudinaryUploadAllowed`） |
| `src/utils/forum-image-moderation.js` | — | NSFW 检测（动态 import，WebGL classify，模型可预载） |
| `src/utils/content-moderation.js` | ~540 | 文本关键词预检（`runKeywordPrecheck`，scene: forum_post） |
| `src/views/PostDetail/PostDetailMain.vue` | ~2000+ | **第三个挂载实例**：编辑已有帖子（`edit-mode`） |

回归探针（项目根目录，Playwright + chrome channel，必须加 `args:['--no-proxy-server']`）：
`probe-mobile-composer.mjs`、`probe-desktop-composer.mjs`、`probe-composer-dark.mjs`、`probe-composer-publish-fix.mjs`

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
| `postImageUploadStatus` | String | 图片处理进度文案（面板底部一行字+伪进度条） |
| `postCooldownSeconds` | Number | 发布冷却倒计时（按钮变「Ns 后发布」） |
| `maxPostImages` | Number = 6 | 图片上限（来自 `FORUM_POST_IMAGE_MAX_COUNT`） |
| `mentionUsers` | Array | @ 候选（父级 `forumMentionUsers`，组件内去重归一取前 24，过滤输入取前 6） |
| `weeklyCheckin*` 五个 | — | 周签到面板（状态/进度文案/七日圆点/提示/loading/submitting） |
| `forumTagOptions` | Array | 标签选项 `{value,label}`（来自 FORUM_TAG_OPTIONS） |
| `showPostImageSourceMenu` | Boolean | 遗留 prop（图片来源菜单已由更多菜单取代，仅保留兼容） |
| `isMobileComposer` | Boolean | 竖屏模式开关：切换 mobile 设置列表/底部工具栏/竖屏文案 |
| `isHomeCatTheme` | Boolean | 家猫主题（左下角装饰猫 HomeCatMascot，内容≥80 字或有图时 `is-awake`） |
| `autoSaveDraftLabel` | String | 「已自动保存 HH:MM」提示文案 |
| `editMode` | Boolean | 编辑模式（PostDetail 用）：问候语变「编辑帖子」、隐藏签到面板/草稿/更多菜单、显示关闭按钮 emit `close` |
| `existingImages` | Array | 编辑模式的既有图片（当前实际由 editPostImages 走 postImages 传入，此 prop 兜底） |

### 3.2 Emits（18 个）

`submit`、`close`（编辑模式关闭）、`login`、
`update:newPost` / `update:selectedPostTag` / `update:postLocation`（v-model 三件套，注意 update:newPost 是**整对象展开替换**），
`toggle-image-source-menu`（遗留）、`request-image-picker`、`request-camera`、
`image-selection`（payload `{files, event}`）、`remove-image(image, index)`、`retry-image(image, index)`、
`reorder-image({fromIndex, toIndex})`、`clear-images({cleanup: true})`（cleanup=true 时父级会云端删除）、
`weekly-checkin`、`open-draft`、`save-draft`

**关键模式**：`request-image-picker` / `request-camera` 传的是一个**回调函数** `() => fileInput.click()`。因为 `<input type=file>` 在 PostComposer 内部（两个隐藏 input：相册 `multiple`、拍照 `capture="environment"`），但「是否允许选图」（冷却/上限/busy 校验）在父级。父级校验通过后执行回调，change 事件再 emit `image-selection` 回去。

### 3.3 组件内部逻辑块（都在 PostComposer 里，纯 UI 层）

1. **标题自动增高**：标题是 `textarea rows=1`（非 input，为了可换行），`autoResizeTitle()` 高度 = `min(scrollHeight, 132px)`；`TITLE_MAX_LENGTH = 50`，input 时 slice 截断 + 右下角 `n/50` 计数（满额变红 `is-near-limit`）。
2. **@ 提及**：正文 `input/keyup/click/focus` 时 `updateMentionState` 用正则 `/(^|\s)@([\u4e00-\u9fa5\w.-]{0,24})$/u` 检测光标前的 @ 前缀 → 弹 `.composer-mention-menu`（绝对定位在输入区左下）；点击候选 `insertMention` 用 `replaceContentRange` 替换区间并在 nextTick 恢复光标。更多菜单里也有「提及用户」= 在文末插入 `@`。
3. **图片网格交互**：
   - 预览：点图片 → `previewImage` → Teleport 大图灯箱（z-index 220200）。
   - 拖拽排序：HTML5 dragstart/dragenter/drop（仅 `canReorderImage` = 无 uploadStatus 或 approved/staged 可拖；busy 时禁用）。
   - 按钮排序：每张图左下角 ArrowLeft/ArrowRight 一对按钮（无障碍冗余）。
   - **状态徽章设计意图（重要）**：上传/优化/检测过程**不在图片上显示任何加载态**（真实进度由灵动岛统一展示）；只有 `uploadStatus === 'failed'` 才显示红色 badge + 重试按钮。
   - 「添加图片」方框卡（`post-image-add-more-card`）：横屏 CSS 隐藏（避免与工具栏 0/6 入口重复），仅竖屏显示。
4. **位置功能（组件内自包含，不经过父级状态机，直接 v-model:postLocation 写回）**：
   - 数据源 Nominatim（OpenStreetMap）：`throttledNominatimFetch` 强制 1100ms 间隔 + Map 缓存 10 分钟（注意缓存返回 `res.clone()`）。
   - GPS 定位：`navigator.geolocation` → 逆地理 `zoom=13&accept-language=zh`，解析出 cityName（正则 `/市$/` 兜底 display_name）与 districtName；emit 的 precision 恒为 `'city'`（产品拍板只到城市级）。
   - 搜索：300ms debounce，`limit=5`，结果取 display_name 反转后「含市的后三段」做 shortName。
   - 面板：Teleport，桌面居中 360px 卡，≤899px 变底部上拉（`border-radius 32px 32px 0 0` + safe-area-inset-bottom）。
   - 已选位置在编辑器内显示为蓝色横条 `.post-location-bar`，可移除。
5. **更多菜单（MoreMenu）**：`handleMoreButtonClick` 记录按钮 rect → Teleport 面板。定位逻辑：窄屏（≤899）从底部弹出；正常屏在按钮上方、右缘对齐，`Math.max/min` 收进视口；打开期间监听 window scroll/resize 重定位（onUnmounted 清理）。菜单项：草稿、提及用户、添加/更换位置、拍照（仅移动端）。z-index：overlay 220100 / panel 220101。
6. **预览模式**：`isPreviewMode` 切换正文 textarea ↔ 只读渲染卡（保留换行 `white-space: pre-wrap`）；竖屏/桌面各有 Eye 工具按钮，无内容时禁用。
7. **竖屏设置列表**（`mobile-composer-setting-list`）：iOS Inset Grouped 风格三行——位置/草稿/标签，图标是纯色圆角 chip（位置 #34c759 绿、草稿 #ff9500 橙、标签 #0071e3 蓝，白图标无渐变）。
8. **工具栏双份**：竖屏 `.mobile-post-image-toolbar`（Hash/Eye/Image/More 图标钮）与桌面 `.desktop-post-tools`（玻璃胶囊，含标签下拉、预览、图片 n/6、保存草稿、更多），由 CSS 按断点显示其一。标签下拉两个（mobile-tag-menu / desktop-tag-menu）共用 `showMobileTagMenu` 状态。
9. **周签到面板**：编辑器 footer 左侧（仅非编辑模式），骨架屏 loading → 进度文案 + 七日圆点（today 描边 / signed 实心）+ 签到按钮（已签禁用变灰）。
10. **冷却显示**：发布按钮 label 由 `submitButtonLabel` 控制——编辑模式「保存修改/保存中…」、冷却「Ns 后发布」、否则「发布」；`isSubmitting` 时按钮内出白色 mini-spinner。
11. **编辑模式**：头部问候换「编辑帖子/修改你的分享，记得保存～」，出现 X 关闭按钮（hover 旋转 90°），隐藏签到/草稿/更多。

### 3.4 样式体系要点

- 两个 `<style scoped>` 块：第一个 `@import '../styles/composer.css'` + `replies-responsive.css`；第二个是后加的局部样式（添加图片卡、保存草稿按钮、位置面板、更多菜单、动画）。
- **液态玻璃 token 全走 `--liquid-*`**（`--liquid-bg/border/radius-lg/filter/highlight/shadow/blur/saturate/text-primary/...`），fallback 值内联。`.editor-card` = blur 28px + saturate 180% + 双层阴影 + 内高光，支持 `corner-shape: squircle` 渐进增强；`@supports not (backdrop-filter)` 与 `.boh-perf-lite` 各有降级。
- **字体栈铁律**：`.editor-card` 显式声明 `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro SC", "PingFang SC", ...` 并让 input/textarea/button `inherit`——因为 Teleport 弹层不在 `.forum-page` 内，表单元素会回落到浏览器默认等宽字体（历史 bug）。
- `:deep()` 只在 SFC scoped 有效；全局 css 一律平铺后代选择器（如 `.editor-card .post-image-add-more-card`）。
- 视觉拍板：纯白 + 圆角玻璃**禁渐变**，主色 `#0071e3`（--apple-blue）。

---

## 4. 三个挂载实例（同一组件三种壳）

1. **桌面/横屏内嵌**（ForumMain 模板 ~4010 行）：`v-if="!isMobileComposerMode"`，直接嵌在论坛左栏顶部。
2. **竖屏全屏 overlay**（ForumMain 模板 ~4276 行）：Teleport 到 body 的 `.mobile-composer-overlay`，自带顶栏（取消/草稿/发布——**竖屏下 PostComposer 内部 footer 被 CSS 隐藏，发布按钮由顶栏承担**）+ 草稿面板 + `.mobile-composer-scroll` 包 PostComposer（传 `is-mobile-composer`）。由 FAB（`.mobile-compose-fab`）唤起 `openMobileComposer`。
   - **模式判定**：`isMobileComposerMode = width <= 1024 && height >= width`（PORTRAIT_COMPOSER_BREAKPOINT=1024，看的是**宽高比**不是像素宽度）；从竖屏切回横屏时若 overlay 开着会自动关闭。
3. **编辑已有帖子**（PostDetailMain.vue ~1811 行）：`<PostComposer edit-mode>`，v-model 绑 `editNewPost/editSelectedPostTag/editPostImages`；竖屏时同样出现 `post-edit-bar` 顶栏承担保存；提交走 `submitEditPost`（updatePost + updateForumPostImages），不是发帖队列。

---

## 5. ForumMain 编排层 — 状态与关键 handler

核心状态（ForumMain ~548-560、1136-1160 行）：

```js
newPost = ref({title:'', content:''}); selectedPostTag = ref('daily');
postImages = ref([]); postLocation = ref(null);
isSubmitting; isUploadingPostImage; postImageUploadStatus;
isMobileComposerMode/isMobileComposerOpen; showPostImageSourceMenu;
postCooldownUntil = ref(0);  // 冷却时间戳
savedPostDraft = ref(null); postDraftVersions; postDraftSaveTimer; postDraftRestoreSeq;
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
- **检测**（全局串行链 `draftPipelineChain`，WebGL classify 不并发——防移动端 GPU/内存崩溃）：链任务内先 await 本张压缩 → `moderateForumImage`（NSFWJS）→ 非 approved 直接 fail。压缩与上一张的检测重叠，多图总耗时 ≈ max(压缩流水, 检测串行和)。进度 0.35→0.5。quiet 模式**不写中间状态到编辑器**。
- **上传**（`uploadApprovedForumImageQueued` → forum-images-api 全局 3 路并发队列 `uploadQueue`）：进度 0.5→1.0；成功 `updatePendingPostImage(uploadId, {...result.data, uploadStatus:'approved', uploadStatusLabel:'已就绪', file})`。
- `entry.promise` 是全链 promise，发布 worker await 它；`.catch(()=>{})` 兜底吞掉（发布路径统一消费错误）。

### 7.3 取消/删除语义（精细，易踩坑）

- `cancelDraftImagePipeline(uploadId)`：标记 cancelled；**若 state==='uploading' 不 abort 网络请求**（让它自然完成并登记 cloudinary pending，孤儿图由 Edge Function 兜底清理），同时 `cleanupPending=true` 避免与云端删除竞态；否则 `controller.abort()`。entry 从 map 删除。
- `removePostImage`：取消管线 → revoke 预览 → 从数组移除 →（非 cleanupPending 时）`cleanupUploadedForumImage` 云端删除（deleteToken 优先，无 token 用 publicId；有 `postImageCleanupLocks` 防重）。
- `clearPostImages({cleanup:true})`（编辑器「清空图片」按钮）：先收集 uploading 中的管线 id，再全取消，未在上传中的逐张云端删除。

### 7.4 压缩层（image-compression.js）

- `getImageCompressionPlan`：判超限（maxSizeBytes / maxDimension / maxPixels，来自 cloud-upload-guard）+ 主动优化（optimizeForUpload=true 时 JPEG/WebP 超 2MB 或边长超 2048 就压）。PNG（不可有损优化）若超限且不可压则报错换格式。
- `compressImageFileToUploadLimit`：**统一输出 WebP**（展示端 Cloudinary f_auto，源格式无关紧要）；**分桶首轮质量**（≥8MB→0.78，≥4MB→0.82，否则 0.85）+ maxIteration 4 —— 大图压缩耗时 -30~50%（A1 调优）。压缩后仍超限则报错。

### 7.5 上传/检测层（forum-images-api.js）

- `moderateForumImage`：先 validateForumImageFile（仅 PNG/JPG/WebP，GIF 拒绝；大小上限 FORUM_IMAGE_MAX_SIZE_MB）→ 动态 import 检测模块。
- `preloadForumImageModeration`：模型预载（选图时 `scheduleForumImageModerationPreload({immediate:true})` 调用，与压缩并行）。
- `uploadApprovedForumImage`：`assertCloudinaryUploadAllowed({source:'forum'})` → `uploadImageToCloudinary(file, {folder: FORUM_CLOUDINARY_FOLDER, pendingSource:'forum', skipUploadPreflight:true, onProgress, signal})`。
- 并发队列：`uploadQueue` + `MAX_CONCURRENT_UPLOADS = 3`，**仅网络层并发**（压缩/检测已在调用方控并发）。

---

## 8. 草稿系统

- **双层存储**：localStorage（`useForumPostDraftStorage`，key = `forum_post_draft_{uid}`，按用户隔离；另有 `_versions` 版本历史（限 versionLimit 条）与 `_cleared_at` 清空标记——用于防止「远端旧草稿回填已清空的编辑器」）+ 云端（`savePostDraftToDatabase` → `upsertForumPostDraft` / `deleteForumPostDraft`，防抖 `schedulePostDraftDatabaseSync`）。
- **保存时机（拍板）**：已从自动保存改为**手动保存**（定时器代码已注释删除）。入口：桌面工具栏「保存草稿」按钮（emit save-draft → `saveMobileDraft`）、竖屏草稿面板「保存当前」、关闭竖屏编辑器时确认弹窗（`closeMobileComposer` → `requestConfirm('保存草稿')`）。`autoSaveDraftLabel` 显示「已自动保存 HH:MM」（文案沿用）。
- `restorePostDraft`：恢复草稿时会比较 `postDraftRestoreSeq` 序号防竞态（恢复请求返回前编辑器已被清空则丢弃）。
- `beforeunload`：有在途发布任务 →「有内容正在发送」；竖屏编辑器开着且有未保存内容 →「是否保存为草稿」。
- 发布成功后草稿全链路清空（本地+版本+云端）。

---

## 9. 其他子系统速览

- **周签到**：`handleWeeklyCheckin`（~2943 行）→ `submitWeeklyCheckin()`；面板在编辑器 footer 内（内嵌紧凑版），另有独立 `WeeklyCheckinCalendar` 弹窗。注意 weekly-checkin 相关状态也在 ForumMain。
- **mentionUsers 来源**：`forumMentionUsers` computed（~452 行），从当前加载的帖子/评论作者归一而来。
- **FAB 可见性**：竖屏模式且 feedMode==='posts'；embedded 时还要求路由是 `/user-space?tab=community`（论坛真实入口，`/forum` 已 redirect）。
- **postImageSourceMenu**：遗留 UI，现由「更多菜单」承担拍照/相册入口。

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
10. 竖屏判定是 `width<=1024 && height>=width`（宽高比），不是像素断点——横屏 iPad/折叠屏走桌面内嵌布局。
11. 伪装登录探针注意：`auth.userInfo` 是 reactive({})，须 `Object.assign` 原地改；Playwright launch 必须加 `args:['--no-proxy-server']`。
12. 视觉拍板：纯白圆角玻璃禁渐变；主色 #0071e3；`!important` 有预算门禁（scripts/check-important-budget.mjs，基线见 important-budget.json），新增样式避免滥用。

---

## 11. 一次「选 3 张图 + 打字 + 点发布」的完整时序（把上面串起来）

1. FAB/桌面工具栏 → 父级校验 → 回调触发隐藏 input → `image-selection` → `handlePostImageSelection`。
2. 3 个 pending 占位进网格（本地 blob 预览，无任何加载圈）。
3. 300ms 后预热管线启动：图 1/2 压缩并行（2 路）→ 检测串行链逐张 → 各自进入 3 路上传队列；模型预载与首张压缩同时开始。
4. 用户继续打字（mention 菜单、字数统计、标题自动增高均为纯前端）。
5. 点发布 → `handlePost` 守卫 → 快照+指纹 → 入队 → 乐观卡置顶 → 编辑器瞬间清空 → 8s 冷却。
6. worker 取任务：等剩余管线完成（快则 0ms）→ `createPost` 幂等 RPC → 关键词预检 → 落库 → 乐观卡换真实卡 → XP/积分奖励/周报刷新。
7. 任一环失败：任务岛常驻 + 失败归因（moderation→移除该图重试 / network→重试），队列中断等操作；期间 beforeunload 有拦截提示。
