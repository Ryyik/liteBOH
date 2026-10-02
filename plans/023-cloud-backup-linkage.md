# 023 — Cloud+ 私密备份库 与 帖子/备份双向联动

> 2026-10-02 产品讨论定稿的产品模型；Phase 1 已落地，Phase 2-4 待排期。
> 口径：**Cloud+ = 作品照片的私密备份库**。对外可见只有两条路：token 令牌分享（已有）、转为帖子（待做）。

## Phase 1 ✅ 取消「设为公开」（已落地，2026-10-02）

- 详情弹窗移除「设为公开」按钮与 `makeEntryPublic`；`setMyCloudEntryVisibility` 不再被 UI 引用（API 保留）。
- 相册改为显示**全部备份**（不再按可见性过滤出「私密一半」），存量已公开条目在详情里带「已公开」徽章 + 「去作品格管理」出口。
- 守卫：`tests/unit/cloud-album-order.test.js`（「设为公开」不得回流 / 相册不得再按可见性过滤）。
- 存量数据**不迁移**：已公开条目继续计入作品格与配额（`accounting.publicEntries` 语义不变）。

## Phase 2 ✅ 发帖照片自动备份（2026-10-02 落地，迁移待执行）

**行为**：论坛发帖成功后，把帖子图片自动创建为一条 Cloud+ 条目（`visibility: 'private'`，`source: 'forum'`）。

- 触点：发帖成功路径（ ForumMain 的 submit 流程）。**必须 best-effort**：备份失败只记日志，不影响发帖结果。
- 条目字段：标题 = 帖子标题、`entry_date` = 发帖日、图片 = 帖子图（Cloudinary url 直接复用，不二次上传）。
- **数据模型（前置）**：`boh_cloud_entries` 增加 `source_post_id uuid null`（nullable，加 index）。
  只需要这一个方向：删帖时按 `source_post_id` 反查备份即可，不需要 post → cloud 的反向字段。
- 迁移走 Management API + 手写 `schema_migrations`（仓库惯例）。

## Phase 3 ✅ 删除双向联动（删帖侧由 cascade 迁移保证；删备份侧已有 LOCKED 保护）

| 动作 | 联动 | 交互 |
| --- | --- | --- |
| 删论坛帖子 | 删除 `source_post_id` 指向它的全部 Cloud+ 条目（含 Cloudinary 资产，走 `deleteCloudEntryWithAssets`） | 删帖确认弹窗里**明示**「将同时删除自动备份的照片」 |
| 删 Cloud+ 条目 | 若该条目有 `source_post_id` 且帖子仍存在 → **同时删除该帖子** | **破坏性最高的一条**：必须弹独立确认框，明示「将同时删除关联的帖子，不可恢复」；建议按钮用红色警示文案 |

⚠️ 决策点（实施前需产品拍板）：
1. 删 Cloud+ 里**一张图** = 删整个关联帖子（条目粒度 = 帖子粒度）——确认交互必须非常显眼。
2. **历史帖子不回填**备份（只对 Phase 2 上线后的新帖生效）；如需补，另做一次性导入工具。
3. 编辑帖子（加图/删图）是否同步备份 → 建议放 Phase 5，Phase 3 只做「发帖快照」。
4. 权限：联动删除沿用各侧既有权限（只能删自己的帖 / 自己的备份）。

## Phase 4 ✅ 转为帖子（2026-10-02 落地）

- Cloud+ 条目详情加「转为帖子」：跳转发帖器并预填（标题 + 图片 url 直用，**不二次上传**）。
- 发布成功后把新帖 id 写回该条目的 `source_post_id`（进入 Phase 3 的联动关系）。
- 原条目保留（它就是备份），此后删帖/删备份按 Phase 3 联动。

## 涉及面（实施时的改动清单）

- 迁移：`boh_cloud_entries.source_post_id`（Phase 2 一次性）。
- API：`boh-cloud-api.js`（create 带 source_post_id / list 可按 post 反查）；forum 删帖流程（Phase 3）。
- UI：`CloudPlusMain.vue` 详情（Phase 4 入口）；ForumMain 发帖成功钩子（Phase 2）。
- 不动：作品格构成（帖子 + 公开笔记混排，`ProfileHomePanel.vue:548`）、StorageBar 口径、令牌分享。


---

## 实施记录（2026-10-02）

- 迁移文件：`supabase/migrations/2026100202_cloud_source_post_id.sql` —— **已于 2026-10-02 13:12 经 Management API 在远程执行**。
  核验：列 source_post_id（uuid nullable）+ FK `boh_cloud_entries_source_post_id_fkey`（confdeltype=c 级联）
  + 索引 `boh_cloud_entries_source_post_id_idx` + 台账 supabase_migrations.schema_migrations(2026100202) 全部就位；
  anon/authenticated 列权限与既有口径一致（anon 只读、authenticated 读写）。
- Phase 2：`ForumMain.vue` 发帖成功分支（拿到 `realPost` 后）`void backupPostImagesToCloud(...)`，
  无图帖直接返回；`createMyCloudEntry` 加 `sourcePostId`。
- Phase 3：删帖侧 = cascade（零代码）；删备份侧 = 既有 `FORUM_SYNCED_CLOUD_ENTRY_LOCKED` 保护（引导去论坛删原帖）。
- Phase 4：详情「转为帖子」（有图条目）→ sessionStorage `boh-cloud-convert-draft` 一次性预填 →
  跳论坛；`ForumMain` 挂载读取预填（图片直接复用 Cloudinary url，不二次上传），并在预填会话内
  抑制 `restorePostDraft`（`convertPrefillApplied`），避免旧草稿覆盖刚选好的图。
- 守卫：`tests/unit/cloud-album-order.test.js` 增至 10 条（Phase 2/4 契约 + key/调用点形态）。
