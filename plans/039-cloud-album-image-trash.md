# 039 · 图库单图删除（同步论坛原帖）+ 回收站 30 天可恢复

- **状态**：DONE（2026-11-04 实施并线上验证：迁移 `2026110413`/`2026110414` 已 apply、EF 已部署、RPC 全路径事务内实测通过）
- **日期**：2026-11-04
- **触发**：用户需求「为相册提供多选和删除功能；删除要在论坛同步生效（类似编辑帖子删掉那张图）；图片进回收站，30 天内可恢复」
- **影响文件（计划）**：
  - DB：`supabase/migrations/2026110413_cloud_image_trash.sql`（新）、`2026110414_backfill_cloud_source_post_id.sql`（新）
  - EF：`supabase/functions/purge-cloud-image-trash/index.ts`（新）
  - API：`src/utils/api/cloud-image-trash-api.js`（新）
  - 页面：`src/views/user-center/Cloud+/CloudPlusMain.vue`、`CloudImageTrashPanel.vue`（新）、`style.scoped.css`
  - 测试：`tests/unit/cloud-image-trash.test.js`（新）
- **关联**：`plans/023`（Cloud+ 私密备份库）、`2026100202_cloud_source_post_id.sql`（删帖级联）、`2026082801_update_forum_post_images.sql`

---

## 1. 需求口径（与用户对齐后的定稿）

1. **删除粒度 = 单张图片**，不是整条内容。图库本来就是「一张图一个格子」（`albumTiles`），所以多选选的是格子。
2. **论坛同步 = 编辑帖子**：这张图若属于 `source='forum'` 的备份条目，删图后原帖的 `forum_post_images` 行要删掉、`posts.image_count` / `cover_image_url` 要重算 —— 等价于在帖子编辑里删掉那张图，**不是删帖**。
3. **回收站 30 天**：删除时**不**动 Cloudinary 资产，只把图片块快照写进回收站表；30 天后由定时任务真正销毁资产并清行。期间可恢复（图库 + 原帖同时恢复）。
4. 恢复时原帖若已被删 → **仅恢复到图库**并明确提示；原条目若已被删 → 拒绝恢复并提示。

## 2. 现状为什么不能直接做（代码事实）

| 事实 | 位置 |
|---|---|
| 删除只有「整条」一条路径，且立刻删 Cloudinary | `utils/cloud-entry-maintenance.js:31` |
| 论坛备份条目被**硬锁**不可删 | `utils/api/boh-cloud-api.js:504` |
| 帖子编辑已有 `update_forum_post_images`，会删行 + 重算 image_count/封面，但**不会回写图库备份** | `post-api.js:1598` + 线上 RPC |
| 图库查不到 `source_post_id`（`CLOUD_COLUMNS` 没选、normalize 没映射） | `boh-cloud-api.js:16`、`:176` |
| 没有任何软删/回收站表 | 线上 schema 实测 |
| 前端配额是客户端算的，DB 守卫不过滤软删 | `cloud-storage-accounting.js`、`guard_boh_cloud_entry_upload` |

## 3. 数据模型：`boh_cloud_image_trash`

一行 = 一张被删的图（快照），不是条目。字段要点：

| 字段 | 用途 |
|---|---|
| `user_id` / `entry_id` / `source_post_id` | 归属与回挂；`entry_id` **不加 FK**（条目可能被硬删，历史行要留着审计） |
| `block jsonb` | 原始 image block（url/publicId/width/height/alt），恢复时原样塞回 |
| `block_index` | 在原 `content_blocks` 中的位置，恢复按它排序 |
| `image_url` / `public_id` | 列表展示 + 30 天后销毁资产用 |
| `entry_title` / `entry_date` / `source` | 回收站列表按「哪条内容的图」分组展示 |
| `deleted_at` / `purge_after` | `purge_after = deleted_at + 30 days` |
| `state` | `pending → restored / purged` |
| `purge_attempts` | 资产销毁失败重试计数（避免一天失败就永久卡住） |

索引：`(user_id, state, deleted_at desc)` 给回收站列表；`(state, purge_after) where state='pending'` 给清理任务。
RLS：只开 `select own`；**写操作全部经 SECURITY DEFINER RPC**（与 `forum_post_images` 同一套做法）。

## 4. RPC 契约

### 4.1 `delete_cloud_entry_images(p_entry_id uuid, p_block_indexes int[]) → jsonb`

单事务完成「图库 + 论坛 + 回收站」三件事：

1. `auth.uid()` 校验 + `select ... for update` 锁条目；
2. 校验每个 index 确实是 image block；
3. 逐张写 `boh_cloud_image_trash`（含 `source_post_id` / 原 sort_order 参考）；
4. `content_blocks` 去掉这些块，`cover_image_url` 重算为剩下的第一张图（没图则置空）；
5. 若 `source='forum'` 且 `source_post_id` 非空：按 `public_id` 删 `forum_post_images`、剩余行重排 `sort_order`、`posts.image_count` / `cover_image_url` / `edited_at` 重算；
6. 返回 `{ ok, entryId, removed, remainingImages, postSynced }`。

删除允许「删光」，删光后的归宿按**帖子正文是否为空**分两种（2026-11-04 用户口径）：

| 情形 | 结果 |
|---|---|
| 帖子 `body` 为空（纯图片帖） | **整帖同步删除**（`posts` 行删除，CASCADE 连带删备份条目）；回收站靠快照可重建 |
| 帖子 `body` 非空 | 帖子保留，只删图片，文字与帖子都在 |
| 纯图片手记（无文字块） | 整条条目删除 |

⚠️ 判据**不能用 `entry_type`**：论坛备份的 `content_blocks` 里永远有「【标题】」文字块，删掉第一张图后守卫会把 `entry_type` 从 `image` 改写成 `mixed`，删最后一张时就判不出来（事务内实测踩到，已改用 `posts.body`）。
错误码沿用 `CODE:message` 约定（`ENTRY_NOT_FOUND` / `FORBIDDEN` / `INVALID_BLOCK` / `QUOTA_EXCEEDED` / `POST_IMAGE_LIMIT` / `TRASH_EXPIRED`）。

### 4.2 `restore_cloud_image_trash(p_trash_ids uuid[]) → jsonb`

1. 只处理 `user_id = auth.uid() and state='pending'`；`purge_after <= now()` 直接拒绝（`TRASH_EXPIRED`）；
2. 按 `entry_id` 分组，块按 `block_index` 追加回 `content_blocks`；
3. 条目已不存在（整帖/整条删光）→ **按 `entry_snapshot` 重建条目**：标题/日期/正文/mood 取快照，`visibility` 强制 private；原帖还在且属于本人则继续挂回（`source='forum'`），否则降级为 `migrated`（不保留「forum + 空 source_post_id」，否则会被整条删除守卫误锁）；
4. 触发既有 `guard_boh_cloud_entry_upload` 会做 9 图/配额校验；超限返回 `ENTRY_IMAGE_LIMIT` / `QUOTA_EXCEEDED`；
5. 原帖仍在 → 插回 `forum_post_images`（追加到末尾，**不还原原始位次**）、重算 `image_count` / 封面；帖里已满 6 图 → `POST_IMAGE_LIMIT`；
6. 成功行标记 `restored`。

> 恢复是「追加」不是「插回原位」——帖子编辑本身也不保留中间插入位次，强行还原会让 `sort_order` 出现空洞。

### 4.3 30 天清理

`purge-cloud-image-trash` EF：service role 读 `state='pending' and purge_after < now()`（每批 200），调 Cloudinary destroy 批量删资产，成功 → `purged`；网络失败 → `purge_attempts += 1` 留在 pending 次日重试。
pg_cron 每天 04:50 用 `net.http_post` 调它（照抄 `push-send` 那套 `vault.push_dispatch_key` 的鉴权写法）。

## 5. 前端交互（已实现）

- **进入多选**：图库头部「选择」按钮 + 格子长按 500ms；退出：完成 / Esc / 切走 tab。
- **格子**：选中态用独立视觉通道（勾选圈 + 描边），不复用 `active` 类；纸片格（纯文字条目）**不可选**。
- **底部操作条**：`已选 N 张` + `删除` + `取消`，位置让开全局底栏（参照 `plans/028` 的自适应教训）。
- **确认文案**（danger，按选中范围分三档）：
  - 纯图片帖删光：`所选内容包含该帖所有内容，该帖将会同步删除。图片在回收站保留 30 天，期间可以恢复。`
  - 带文字帖删光：`所选内容包含该帖的全部图片，该帖的文字将保留。图片在回收站保留 30 天，期间可以恢复。`
  - 其余：`删除后会同时从论坛原帖移除。图片在回收站保留 30 天，期间可以恢复。`
- **删除后**：本地从 `entries` 里摘掉对应 block（不整页重拉，避免回顶）、`persistCachedEntries` 同步缓存、退出多选。
- **回收站面板**：图库头部「回收站」入口 → 底部面板，按条目分组、每张显示剩余天数；支持多选恢复 / 单张恢复。
- **KeepAlive 注意**：`/user-space/note` 刚加了 `meta.keepAlive`，`onDeactivated` 必须清选择态和面板，否则切回来自动停在选择模式。
- 失败语义：批量删除逐条执行，汇总「成功 N / 失败 M（原因）」；不做静默跳过。

## 6. 风险与回归点

1. **配额双算**：删除只减图库，DB 守卫仍是 `sum(image_count)`；本次因为不软删条目、只减 blocks，`image_count` 由触发器重算 ⇒ 配额一致，无需改守卫。⚠️ 若以后改成「整条软删」，这条要重审。
2. **封面漂移**：删掉封面图必须重算 `cover_image_url`（图库与帖子两处），否则卡片显示裂图。
3. **论坛缓存**：删除后要 `invalidateByTags(['posts','comments','notifications','boh-cloud'])`，否则帖子详情还显示已删的图。
4. **`update_forum_post_images` 不回写备份**：本次 RPC 必须自己写 `content_blocks`，不能只调论坛那支。
5. **恢复与配额**：用户删图后可能又传满配额，恢复会撞 `CLOUD_IMAGE_LIMIT_EXCEEDED` —— 要给可读文案（「配额不足，请先清理其他图片再恢复」）。

## 7. 验收（2026-11-04 线上实测）

- 单测：12 用例全过（剩余天数 / 按条目归组 / 摘块 / 封面重算 / 标题-only 判据）。
- **事务内全路径实测（真实库，回滚不落数据）**：
  - A 删 1 张：`removed=1, postSynced=true, postImageCount=1`，帖子图片 1 张；
  - B 删最后 1 张（纯图片帖）：`postDeleted=true, entryDeleted=true`，`posts`/条目都不存在；
  - C 恢复：条目按快照重建、2 张图、`source` 降级 `migrated`、无残留 pending；
  - D 带文字帖删光：帖子仍在、`image_count=0`、条目只剩文字块；
  - E 恢复到已有条目：帖子 2 图、条目 2 图、`image_count=2`。
- 30 天清理：seed 一条过期行 → `pg_net` 调 EF → `HTTP 200 {"claimed":1,"purged":1}` → 行变 `purged`；测试行已清理（trash 表 0 行）。
- 数据修复：61 条历史论坛备份 `source_post_id` 全部回填成功（61/61）。

## 8. 第二轮改版（2026-11-04 晚，同日）

用户三条追加口径，全部已实现并验证：

### 8.1 回收站升成独立 Tab 页面（原为底部弹层）

- `cloudTabSections` 四席：内容 / 回收站 / 分享 / 设置；`?view=trash` 深链可直达。
- 页面头复用共用 `.cloud-header`（cloudPageHero 提供「回收站」+ 副标题），说明/空态/网格都在页面里，
  弹层那套（`.trash-panel*`）整段删除。
- 取数时机挂在 `applyCloudPlusRouteView()`（与 share 同一条路径，`watch(cloudTab, immediate)` +
  `onMounted` 会触发两次 ⇒ `loadTrashedImages` 开头用 `isTrashLoading` 挡重复）；
  `onActivated` 强制重取（keepAlive 回来不能展示旧列表）。
- 离开 tab / 失活只清选择态（`resetTrashSelection`），不再有「关面板」动作。

### 8.2 「选择」改成按钮

- 从相册网格上方的 ghost-link 文字行改成**头部动作区按钮**（`.refresh-btn` 同款 + CheckSquare 图标），
  选择态变「完成」并转主色描边（与 `.filter-trigger.is-filtering` 同一视觉语言）。
- 原「相册工具行」整行删除；「全选」挪进底部多选操作条。
- ≤640 头部第二行 4 个按钮平分（筛选/刷新/选择/新建），复用既有 `.gallery-header-actions > .refresh-btn` 规则。

### 8.3 回收站支持「永久删除」

- EF `purge-cloud-image-trash` 升级为双模式：
  - **巡检**（cron / service_role / dispatch key，无 ids）：按 `purge_after` 扫，逻辑不变；
  - **用户点名**（用户 JWT + `{ ids }`）：只处理 `user_id = sub` 且 pending 的行，不看到期时间；
    越权 id 静默忽略（防枚举）。匿名任何形态一律 401。
- 前端 `purgeCloudImageTrash(ids)` 走 `supabase.functions.invoke`；函数返回 207（部分失败）时**不当成功**，
  提示「N 张图片没能销毁」。
- UI：工具栏「恢复」旁并排 danger 档「永久删除」，确认文案「永久删除后无法恢复，图片会立即从云端销毁」。
- 线上验证：`anon sweep 401` / `anon ids 401` / `dispatch sweep 200 mode=sweep`；EF 已重新部署。

### 8.4 同轮附带修复（用户报障）

- **横屏 ≥1024 底栏复现**：`landscape-rail.css` 的 `body.page-bohcloudplus` 段漏了
  `.bottom-nav-glass { display: none }`（UserSpace :94 / 周边 :487 都有，图库当年只补了左栏）。
  注意底栏是 `.cloud-page` 的**兄弟节点**，不能用后代选择器。
- **竖屏滚动底栏不隐藏**：图库接底栏时漏接 `useScrollDirectionHide`，补上
  （forceVisible = 发布器/详情浮层打开；`onActivated` reset，防 keepAlive 回来停在 hidden）。
- **各 tab 页头位置跳动**：`is-gallery` 恒开（shell 全宽），设置/分享正文限宽移到页内；
  hero 档（eyebrow + 36px 标题）换成与内容页同构的 `gallery-title-block`（26px 标题 + 13px 副标题）。
  实测四 tab 的 SegmentTabs 与 h2 位置逐像素一致。

### 8.5 已知残留

- 假登录探针会触发「账号已被封禁或禁言」提示 —— 那是探针用的假账号被 DB 侧限流/封禁判定命中，
  真实账号不受影响。

---

## 9. 审查（2026-11-04 深夜，全路径实测）

### 9.1 发现并已修的两个真 bug

**① 图库格子 key 用的是「图片序号」而不是「block 下标」（严重，功能基本不可用）**

`albumTiles` 原来 `key = ${entryId}::${图片序号}`，而删除 RPC 的 `p_block_indexes`
是 **contentBlocks 下标**。论坛备份的 blocks 永远是 `[标题文字, 图1, 图2…]`，于是：

- 选第一张图 → 传 index 0 → 打到文字块 → `INVALID_BLOCK:只能删除图片`；
- 选第二张图 → 传 index 1 → **删掉第一张**。

即所有论坛同步条目（61/68 条）的删图都会错位一位。
修法：`src/utils/cloud-album-tiles.js` 的 `buildAlbumTiles()` 用
`listDeletableImageBlocks()` 返回的**真实 blockIndex** 生成 key；
`tests/unit/cloud-album-tiles.test.js` 6 个用例锁住这条契约。

**② 重试/双击会误删下一张（严重，数据丢失）**

原来按 block 下标删。删成功后 blocks 重排、下标整体前移，任何重试
（响应超时、双端同时点、失败后再点一次）都会命中下一张。
事务内实测：`[text,a,b,c]` 连删两次 index 1 ⇒ a、b 都没了。

修法：`2026110415_cloud_image_trash_idempotent.sql` 把 RPC 改成
`delete_cloud_entry_images(uuid, integer[], text[])`，**按 publicId 定位 block**：
- 匹配不到 ⇒ `{ removed: 0, alreadyDeleted: true }`，不删任何东西；
- 部分匹配 ⇒ 只删匹配到的；
- `p_public_ids` 为空时退回下标路径（旧客户端兼容）。

前端 `deleteCloudEntryImages()` 传 publicId；`alreadyDeleted` 时只同步本地、不计数。

### 9.2 发现但未改的架构隐患（需产品决策）

**论坛编辑页 → 图库是单向同步**

`update_forum_post_images()`（论坛编辑页增删图）**不碰 `boh_cloud_entries`**
（不更新 `content_blocks` / `content_text`）。后果：

- 在论坛编辑页删掉的图，图库里仍然显示（再删一次会写回收站，恢复时可能「复活」）；
- 在论坛编辑页新加的图，图库看不到、也管不了。

本次功能建立在「图库 = 帖子图片」的假设上，编辑后这个假设不成立。
当前 61 条论坛条目实测 `entry.imageBlocks == forum_post_images`（零漂移），说明编辑功能用得很少，
所以没有立刻爆。修法三选一：
1. `update_forum_post_images` 里同步重建 `content_blocks`（保留 text/mood，工作量大）；
2. 图库打开时做一次对账（差异自动修复或提示）；
3. 产品上明确「图库只增删自己那份备份，不保证与帖子实时一致」。

### 9.3 已验证通过（真实库、事务内、跑完 rollback）

| 场景 | 结果 |
|---|---|
| 删中间一张 | `forum_post_images` 少 1、`sort_order` 重排无空洞、`posts.image_count` 正确 |
| 删第一张 | 帖子与条目封面都换成下一张 |
| 带正文帖删光 | 帖子保留、`image_count=0`、`cover_image_url=''`（NOT NULL 不炸）、条目只剩文字块 |
| 纯图片帖删光 | 帖子 + 备份条目一起消失，回收站 2 行 |
| 纯图片手记删光 | 条目消失，回收站 2 行 |
| 恢复（帖已删） | 条目按快照重建、图片回来、`source` 降级 `migrated` |
| 恢复（帖还在） | 图库与帖子同时回来，追加到末尾 |
| 恢复进已有条目 | blocks 追加、封面回填 |
| 帖子 6 图上限 | `POST_IMAGE_LIMIT`，且 RPC 内已执行的 update 被整体回滚 |
| 条目 9 图上限 | `ENTRY_IMAGE_LIMIT` |
| 重复恢复 | `TRASH_NOT_FOUND` |
| 恢复过期行 | `TRASH_EXPIRED` |
| 恢复别人的行 | `TRASH_NOT_FOUND`（不泄露存在性） |
| 删别人的条目 | `FORBIDDEN` |
| 拿自己的条目指向别人的帖子 | `FORBIDDEN`，对方帖子图片数不变 |
| 未登录 | `NOT_AUTHENTICATED` |
| 删文字块 / 空数组 / 全越界 | `INVALID_BLOCK` |
| 重复删同一 publicId | `removed:0, alreadyDeleted:true`，其余图完好 |
| 论坛删帖 | 只销毁「当前帖子剩余的图」的 Cloudinary 资产，回收站里的不在列表 ⇒ 不会裂图 |

### 9.4 已知限制（写进产品预期）

1. **配额「假释放」**：删图后 `content_blocks` 少图 ⇒ 账号配额立即释放，回收站里的图**不计入配额**。
   用户删完再传满，30 天内恢复会撞 `QUOTA_EXCEEDED`（有可读文案，不是静默失败）。
2. **恢复的可见性固定为 `private`**：帖子已删时按快照重建条目，刻意不恢复原可见性，
   避免「恢复即公开」。
3. **恢复不还原原始位次**：图片追加到末尾（论坛编辑本身也不保留中间插入位次）。
4. **`*.supabase.co` 在本机不可达**（域族被 reset），所以真实 API 链路（JWT → RLS → RPC → EF）
   只能在部署环境验证；本地验证到「真实库 SQL + 纯逻辑单测 + UI 渲染」三层。

### 9.5 如何验收（按成本从低到高）

1. **纯逻辑**：`npx vitest run tests/unit/cloud-album-tiles.test.js tests/unit/cloud-image-trash.test.js`
   —— 21 个用例，锁住 key=blockIndex、幂等参数、封面重算、天数计算。
2. **数据库**：在事务内跑删除/恢复/权限/上限（`begin; … rollback;`），断言
   `forum_post_images` / `posts.image_count` / `cover_image_url` / `content_blocks` / 回收站行数。
3. **UI（部署后）**：图库 → 选一张图 → 删除 → 确认弹窗文案按三档正确 →
   论坛帖子详情少一张且 `image_count` 减一 → 回收站出现「剩 30 天」→ 恢复 → 两边都回来。
4. **30 天清理**：`update boh_cloud_image_trash set purge_after = now() - interval '1 day'`
   后手动触发 EF，确认 `state='purged'` 且 Cloudinary 资产 404。
5. **永久删除**：回收站勾选 → 永久删除 → 确认 → 行消失、资产销毁、无法恢复。
