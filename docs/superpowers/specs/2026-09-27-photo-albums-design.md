# 摄影集（Photo Albums）功能设计 — P1+P2

日期：2026-09-27 · 状态：已确认（用户批准，范围 P1+P2）

## 1. 定位

用户在个人空间亲手"装帧"一本影集：上传照片 → 自动初排成页 → 手动微调（换版式/调顺序/写配文/加章节）→ 翻页阅读 → 下载离线 HTML → 可选分享到社区（封面链接入口卡）。

体验三支柱（市调共识）：自动初排（按 EXIF 时间聚类+横竖比匹配版式）、装帧感（封面/章节页/内容页/尾页）、成果可带走（单文件离线 HTML，断网可看可打印）。

## 2. 已确认决策

- 排版模式：**A 页面版式流**（6 种版式模板 + 自动初排 + 手动微调）
- 社区属性：影集入口只在**个人空间**；作者点"分享到社区"后，社区出现**带封面的链接入口卡**，点击跳阅读页（无社区内互动）
- 图片来源：仅本地上传（Cloudinary 管线）
- AI：首期不做；自动初排用规则实现

## 3. 页面与路由

| 页面 | 路由 | 说明 |
|---|---|---|
| 影集列表 | 个人空间新增入口（UserSpace 内 tab/卡片） | 封面卡片：封面图+标题+照片数+状态；新建按钮 |
| 影集编辑器 | `/studio/albums/:id`（`meta:{requiresLogin:true}`） | 独立创作页 |
| 影集阅读页 | `/albums/:id` | 公开可访问，仅当 published+已分享 |
| 社区入口卡 | 社区影集区 | 封面+标题链接卡 |

- 路由注册：`src/router/routes/community.ts`（阅读页）+ 编辑器路由（同文件或 public.ts，编辑器加 requiresLogin）；组件懒加载 `views/<Module>/index.vue`。
- 导航：`src/config/site-nav.ts` 加节点（单源，顶栏+全局搜索自动同步）。

## 4. 编辑器布局（单页完成创作）

```
┌────────────────────────────────────────────────┐
│ 工具栏：标题/封面 · 保存 · 预览 · 分享 · 下载HTML │
├──────────┬──────────────────────┬──────────────┤
│ 照片池    │   页面画布（当前页）     │  页面设置      │
│ 待用照片   │  按当前版式渲染照片槽    │  · 版式切换    │
│ 点击/拖入页│                      │  · 每图配文    │
├──────────┴──────────────────────┴──────────────┤
│ 页面缩略图条：封面 [1][2][3][+章节][+] 尾页 拖拽换序│
└────────────────────────────────────────────────┘
```

流程：新建（标题/副标题/封面，AvatarCropModal 裁剪）→ 上传照片进照片池 → 自动初排 → 微调（拖拽换序用原生 HTML5 DnD，项目无 sortablejs）→ 预览（翻页：左右键/触摸滑动+章节目录+页码）。

**版式库 6 种（P1）**：full（全幅）/ duo（双图）/ trio（三图）/ grid4（2×2）/ img-left-text / img-right-text。版式=数据对象（槽位数+槽位宽高比），扩展不动引擎；P2 增补若干。

## 5. 数据模型（3 表，全部 RLS，迁移放 `supabase/migrations/`，命名如 `2026092701_photo_albums.sql`）

```
photo_albums        id, user_id, title, subtitle, cover_url,
                    status(text draft|published), shared_to_community(bool),
                    photo_count(int), created_at, updated_at
photo_album_photos  id, album_id, user_id, cloudinary_url, width, height,
                    ratio(text landscape|portrait|square), caption(text), sort_order(int)
photo_album_pages   id, album_id, page_index(int), page_type(text cover|chapter|content|end),
                    layout_id(text), chapter_title(text), note(text),
                    photo_refs(jsonb, 有序引用照片池照片id), created_at, updated_at
```

RLS：本人全权（user_id = auth.uid()）；公众仅可读 `status='published' AND shared_to_community=true`。管理后台按惯例接入：`tabs.js`（tab + TABS_ACTIONS `['view','edit','delete']`）+ `tabModules.tabIds` + `tables.js` dataConfig。

## 6. 图片上传（复用现有管线）

- `src/utils/cloudinary-client.js` `uploadImageToCloudinary(file, {folder:'photo-album', pendingSource:'photo-album', onProgress, signal})`
- 压缩：`src/utils/image-compression.js`（browser-image-compression，WebP 输出）
- 审核：`src/utils/image-moderation-pipeline.js` NSFW 管线（仿 `forum-images-api.js` L41-54 接法）
- 封面裁剪：`src/components/AvatarCropModal.vue`（自由比例）
- 存宽高与 ratio，供自动初排与版式槽匹配

## 7. 离线 HTML 导出

- 仿 `src/views/Lab/engine/html-renderer.js`：前端拼单文件 HTML → Blob → a.download
- 单文件内嵌：base64 WebP 图片 + CSS + 翻页 JS；含封面/章节目录/翻页+滚动双模式/打印样式
- ≤40 张单文件；>40 张走 ZIP（`index.html` + `images/`），ZIP 用 jszip——**需把 jszip 加进 package.json 直接依赖**（Lab 目前是传递依赖侥幸可用）
- 导出计入配额

## 8. 约束与风控

- 配额：按订阅 tier 限制「影集数量 + 单集照片数」，仿 `useLabQuota` 的 TIER_QUOTA_MAP 模式；超限阻断+升级提示（不做降级）
- 审核：上传即审 + 分享到社区前复审
- 配文纯文本转义渲染（无 v-html 或经 DOMPurify）；导出 HTML 中配文必须 HTML escape
- 弹窗统一 `useConfirmDialog`；通知走 `useIsland.js` 的 `showIsland.notify()`
- 组件卸载/重挂载重置 loading 状态；上传支持 AbortController 取消

## 9. 实施范围

**P1（核心可用）**
1. 迁移：3 表 + RLS（supabase/migrations/2026092701_photo_albums.sql）
2. 个人空间影集列表入口 + 新建向导
3. 编辑器：照片池上传、自动初排引擎、6 版式、配文、页面增删/换序/章节页、拖拽换序
4. 阅读页：翻页模式 + 章节目录 + 页码
5. 单文件离线 HTML 导出
6. 管理后台接入（tabs.js/tables.js）
7. 配额校验（影集数/照片数）

**P2（一并做）**
8. 分享到社区：shared_to_community 开关 + 社区封面入口卡 + 分享前复审
9. 大影集 ZIP 导出（jszip 提为直接依赖）
10. 追加版式若干（如 hero-text、strip 胶片条）

**不做（预留 P3）**：自由画布单页编辑、AI 配文/智能初排、社区内互动（点赞评论）。

## 10. 参考文件索引

- 路由：`src/router/index.ts`（六组 routes 拼装）、`src/router/routes/community.ts`（例：/lotteries L67-70）
- 导航单源：`src/config/site-nav.ts`（SITE_NAV_ITEMS）
- 上传：`src/utils/cloudinary-client.js`（L427 上传、L256 预检 RPC）、`src/utils/api/forum-images-api.js`（folder/pendingSource + 审核接法范例）
- 导出范例：`src/views/Lab/engine/html-renderer.js`（buildPreviewUrl/buildCodeZip/downloadZipBlob）
- 灯箱：`src/views/Forum/components/ForumImageViewer.vue`
- 管理后台：`src/views/DataManagement/config/tabs.js`（L201 TABS_ACTIONS）、`tables.js`（dataConfig）
- 配额：`src/composables/useLabQuota.js`（TIER_QUOTA_MAP）、tier：`useUserTier.js`
- 压缩：`src/utils/image-compression.js`；裁剪：`src/components/AvatarCropModal.vue`
- 结构检查：`npm run check:structure`；views 模块目录：`src/views/PhotoAlbums/`（index.vue 入口 + components/ composables/ utils/ 分层，编辑器可独立 `src/views/PhotoAlbumEditor/`）

## 11. 调研依据（摘要）

- Shutterfly 论文：自动初排是留存关键，用户从零手排大量弃坑 → 自动初排+微调双模式
- ud5 工具：单文件离线 HTML 导出（base64 内嵌）是可行且优雅的形态
- WhiteClover：book/scroll 双视图、模板+微调；专业工具共识：封面→章节页→内容页→尾页
- 国内 H5 相册（留影/易企秀）：模板填空缺创作感，且内容不可带走 → 反向验证"装帧感+可导出"定位
