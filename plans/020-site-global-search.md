# 020 · 导航栏全局搜索（灵动岛形态）

> 目标：导航栏放一个搜索入口，点击后从灵动岛展开搜索面板，搜索**全站所有可搜内容**——
> 帖子、新闻、活动、用户、商城商品、资源与教程、方块墙、抽奖、节目、头像框、设定集、
> MBTI、指令词典，以及外部的 Modrinth 资源（mod / 整合包 / 材质包 / 光影）。

## 1. 现状盘点（先纠正常见的过时认知）

### 1.1 中文搜索问题**已经解决**（2026-09-27 两个迁移）

| 迁移 | 内容 |
|---|---|
| `2026092701_forum_search_cjk_fallback.sql` | 装 pg_trgm；给 `posts.title` / `posts.content` 建 `gin_trgm_ops` 索引；`list_forum_posts` 并列 ILIKE 子串兜底；相关度改分层加权；新增 `forum_search_excerpt()` 中文高亮 |
| `2026092702_forum_list_single_impl.sql` | 三个重载（7/8/9 参数）收敛为「唯一实现 + 两个兼容 wrapper」；唯一实现 = 9 参数（含 `p_kind_filter`），返回 24 列（含 `author_avatar_frame_url`）；三签名的 ACL 全部撤 anon / PUBLIC |

所以：

- ⚠️ **不要再规划"修复中文分词"**。`posts.search_vector` 是 `generated stored` + `'simple'` 配置，
  对中文无效是**已知且已被绕开**的事实——绕开方式就是 ILIKE 子串兜底，不改向量列表达式
  （改它要重建全表），也不引入 pgroonga / zhparser（Supabase 装不上后者）。
- 相关度口径（**全局搜索应沿用同一口径**）：
  标题命中 `1.0` > 正文命中 `0.4` > 纯向量命中 `≤0.3`，有搜索词时**相关度恒优先**，热度只作次级键。
- `forum_search_excerpt(text, query)` 是可直接复用的中文高亮函数（返回带 `[[ ]]` 标记的窗口截断文本），
  ACL：`revoke from anon, public` / `grant to authenticated, service_role`。

### 1.2 检索能力分布

- `list_forum_posts` **已 revoke anon** → 论坛搜索必须登录（`authenticated`）。
- `posts` / `comments` / `profiles` / `products` / `block_wall_items` / `boh_creator_shows` /
  `news` / `activities` / `avatar_frames` / `birthday_*` / `forum_weekly_reports` 等对 anon 仍可 SELECT。
- `2026092101_revoke_anon_execute_and_table_writes.sql` 只回收 anon 的**写**权限与函数 EXECUTE，
  **不回收 SELECT** → 某表 anon 能否读，最终只由各自 RLS SELECT 策略决定。

## 2. 可搜索实体总表

### 组 A · 已有检索基建（直接复用，不要重写）

| 实体 | 表 / 来源 | 查询路径 | 可见性 |
|---|---|---|---|
| 帖子 + 新闻 + 活动 | `posts`（官方卡由触发器镜像，`post_kind` ∈ post/repost/news/activity） | RPC `list_forum_posts(p_page,p_page_size,p_sort,p_author_id,p_include_author_non_approved,p_search_query,p_tag_filter,p_following_user_ids,p_kind_filter)` | authenticated |
| 用户 / 作者 | `profiles` | `.ilike('username', …)`（已有 trgm 索引 `idx_profiles_username_trgm`） | anon |
| 评论（可选，作帖子补充） | `comments` | `.ilike('content', …)` | anon |

> `posts` 一次查询即覆盖帖子 / 新闻 / 活动三类，**不必**分别查 `news` / `activities` 表。

### 组 B · 小表 + 简单 ILIKE（新增轻量查询，**不需要新 RPC**）

| 实体 | 表 | 可搜字段 | 可见性 / 约束 | 跳转 |
|---|---|---|---|---|
| 商城商品 | `products` | `title` `description` `category` `specifications[].label/.value` | anon（`using(true)`） | `/shop` |
| 方块墙 | `block_wall_items` | `content` `author_username` | anon | `/activities-wall?tab=wall` |
| 抽奖 | `lotteries` | `title` `description` `prize_title` `prize_description` | ⚠️ 策略含可见性开关：`is_home_visible`/`is_community_visible` + `status` | `/lotteries` |
| 创作者节目 | `boh_creator_shows` | `title` `description` `author_username` | anon | `/shows` |
| 生日祝福 | `birthday_wishes` | `content` `author_name` | 仅 `status='approved'` | `/birthday` |
| 生日活动 | `birthday_events` | `title` `subtitle` `hero_quote` | 仅 `is_active=true` | `/birthday` |
| 头像框 | `avatar_frames` | `name` `description` `tier` | 仅 `status='published'` | 用户空间装扮区 |
| 论坛周报 | `forum_weekly_reports` | `summary` `topics` `open_questions` | 仅 `status='published'` | 周报入口 |
| 活动（新平台） | `activity_campaigns` | `title` `description` `slug` | ⚠️ 策略 `using(true)` 会把 `stage='draft'` 泄漏给 anon（草稿隔离目前只在前端做）→ **先收紧策略再入搜索** | `/activities-wall` |

### 组 C · 纯静态前端索引（零网络，随输入即时命中）

| 内容 | 来源 | 条目 | 备注 |
|---|---|---|---|
| 页面与功能 | `UnifiedNavbar/index.vue` 的 `navMenuItems` | ~30 | **建议抽出为 `config/site-nav.ts` 单源**，导航与搜索共用 |
| 教程中心 | `src/views/Download/index.vue` 内联常量 `rawTutorialData` | 15（q1–q15） | ⚠️ 当前未导出 → 需提取成可导入模块 |
| 下载资源 | `src/data/downloads.js` 的 `downloadsData` | 2 | 字段 `name` / `description` / `type` |
| 设定集 | `src/views/CharacterBook/index.vue` 内联 `characters` | 15 | ⚠️ 需提取；可搜 `name` `role` `description` `facts[].value` |
| 八周年回忆 | `src/views/BOH8YearsJourney/copy-editor-catalog.js` 的 `copyEditorGroups` | 50+ | 可搜 `title` `copy` `kicker` `name` `code` |
| 八周年活动角色 | `src/views/BOH8YearsEvent/index.vue` 的 `habitTrainPosterCharacters` | 16 | `role` / `member` / `note` |
| MBTI | `src/data/mbti-data.js` 的 `MBTI_TYPES` / `MBTI_QUESTIONS` | 16 型 + 48 题 | 跳 `/mbti` |
| 实验室指令词典 | `src/data/minecraft-commands.js` 的 `COMMAND_MODE_INSTRUCTION` | 数十 | 附魔 / 效果 / 属性 / 槽位 / 游戏规则中英词典 |
| 云上咖啡店 | `src/views/AnniversaryCafe/index.vue` 内联 `drinks`/`customers`/`cafeMemories` | 8 + 12 + 5 | 彩蛋性质，最低优先级 |
| 订阅档位 | `src/utils/subscription-benefits.js` 五常量 | 5 档 | 命中跳订阅页，不作重型条目 |

### 组 D · 外部 API（**必须显式触发**，不可随输入即时查）

| 内容 | 实现 | 触发条件 |
|---|---|---|
| Modrinth 资源（mod / 整合包 / 材质包 / 光影） | `utils/api/resource-search-api.js`：`detectBohAIResourceSearchIntent()` 判意图 → `buildResourceSearchQuery()` 剥停用词/别名表 → `searchMinecraftResourcesForBohAI()` | ① 意图识别命中资源词，或 ② 用户点「去 Modrinth 搜 XXX」 |

> ⚠️ 现成调用链在 `views/BOHAI/composables/useResourceSearch.js`（入口 `/ai-chat`），
> 不在 Lab 页面。结果**不落库**，所以 DB 侧搜索永远覆盖不到它。
> 不可随输入触发：第三方 API 有 CORS 与速率限制，逐字触发会打爆上游且拖慢面板。

### 不纳入（明确排除）

- **私有数据**：`boh_cloud_entries`（BOH Cloud+ 私人相册流）、`boh_note_entries`（BOH Note 日记，
  已替代 `boh_treehole_*`）、`health_profiles`/`health_weight_logs`/`health_daily_logs`/`health_vault_records`、
  `notifications`、`user_impressions`（仅作者与被写者本人可见）、`user_gifts`、`user_addresses`、
  `shop_points_orders`、`points_card_presets`、`forum_post_drafts`、`activity_rewards`。
- **无内容实体**：`/gift`（中奖名单写死在组件内）、`/app`（营销落地页）、`/login`、`/join`、`/reset-password`。
- **管理 / 内部型**：`moderation_logs`、`api_key_vault*`、`ai_quota_*`、`ai_token_reservations`、
  `_rate_limits`、`forum_rate_limit_events`、`subscription_*`、`lottery_*_logs`、`push_*`、
  `user_data_export_jobs`、`admin_issued_login_tokens`、`post_reward_*`。

> ⚠️ `boh_treehole_memories` / `boh_treehole_spaces` 的 `comment` 已标注 **DEPRECATED**
> （已迁移至 `boh_note_entries`）。旧 trgm 索引 `idx_boh_treehole_memories_content_trgm` 事实上已失效，
> 不要再基于它规划检索。

## 3. 架构方案

### 3.1 核心：搜索源注册表（而非单一巨型 RPC）

```
config/site-search-sources.js    ← 每类内容声明一个 adapter
  {
    id: 'posts', label: '帖子', icon: Post, group: 'instant',
    search: (query, { limit, signal }) => listForumPosts({ search: query, ... }),
    resolve: (row) => ({ title, excerpt, route, meta })   // 归一化 + 跳转
  }
```

**为什么不建统一 `search_site()` RPC：**

1. 组 A 的帖子搜索已有 RPC，且带 CJK 兜底 / 分层 rank / 中文高亮——在 SQL 里再包一层 UNION
   要么复制这三样逻辑（立刻产生第二个真相源），要么调函数（PL/pgSQL 里动态拼 20 张表的
   `union all` 会退化成顺序扫描，得不偿失）。
2. 组 B 全是小表（个位到百条量级）+ 简单 ILIKE，前端并行 `.or()` 比新建 RPC 更轻。
3. 组 C 本就零网络。
4. 新 RPC 意味着新的授权面：仓库有 `check-anon-execute.mjs` 护栏 + baseline 棘轮，
   能不加新函数就不加。
5. 加实体时只加一个 adapter 文件，不动数据库。

### 3.2 分级触发（形态约束倒逼）

岛内面板高度有限（建议限高 `min(56vh, 480px)`），不可能一次展示 20 个来源的全量结果。

| 级别 | 来源 | 触发时机 |
|---|---|---|
| 即时 | 组 C 静态索引 + 组 A 帖子 + 组 A 用户 | 输入 debounce 250ms |
| 补充 | 组 B 全部 | ① 用户按回车；② 点某类型 chip；③ 「全部」视图里按需补齐 |
| 显式 | 组 D Modrinth | 意图识别命中，或用户点「去 Modrinth 搜」 |

默认视图：**分组展示，每组最多 3 条**，每组末尾「查看全部 N 条」→ 切到该类型全量视图。

### 3.3 排序：组内排序，不做跨组融合

⚠️ **不要做跨类型加权融合排序**。用户搜「周边」时不该让商品压过帖子、搜「生日」时不该让
祝福语压过活动——跨类别的分数没有可比性。正确做法：

- 每组内部沿用该来源自己的排序口径（帖子沿用 §1.1 的分层 rank）。
- 「全部」视图 = 固定分组顺序 + 每组固定条数上限。
- 组顺序按「用户最可能要什么」静态排：帖子 > 用户 > 商城 > 活动/抽奖 > 资源教程 > 其他。

## 4. 交互与形态规范

### 4.1 宿主与展开

- 入口：`UnifiedNavbar/index.vue` 的 `.nav-user` 左侧插一个搜索按钮；绑定 `⌘K` / `Ctrl+K`。
- 面板：新建 `components/UnifiedNavbar/GlobalSearchIsland.vue`，经 `showIsland.custom(组件, props)` 渲染进 nav surface。
- 高度上报：走 `customCardHeight`（**不可混用 `navStatusCardHeight`**——否则关闭后 surface 复原不了）。
- 竖屏 mini 自动展开：`isExpandedLooking` 已把「任意岛在场」纳入派生，**零改动**。

### 4.2 必须先解决的仲裁问题

⚠️ 当前 `custom` 槽位在任务岛 / AI 岛占用时是 `v-show` 让位（见 `UnifiedNavbar/index.vue` 模板）。
用户点搜索按钮时若正有通知岛或任务岛在展示，**面板会被隐藏 → 表现成"点了没反应"**。

两种解法（择一，建议前者）：

1. 在 `useIsland.js` 增加 `preempt()` 语义：搜索打开时主动收掉通知岛 / 任务岛（AI 岛除外，
   或一并收掉并记下以便恢复）。
2. 把搜索提升为独立槽位，优先级置于任务岛之上。

### 4.3 边界条件（逐条都要显式处理）

| 条件 | 处理 |
|---|---|
| `route.meta.hideNavbar` 路由（约 14 条：admin/* 全部、user-space 部分子页、community 2 条、public 2 条） | 无 nav 宿主 → ⌘K 必须同步禁用，否则"按了没反应"。可参考 `useGlobalAiOverlay.js` 的 `canOpen` 写法 |
| 首页 `.home-gate` 开场画在场 | 是 fixed 覆盖层 + `touch-action: none` + 三道解锁保险 → **开画期间不响应 ⌘K**，否则层叠错位 |
| 搜索结果跳帖子 | 横屏走弹窗（`usePostDetailModal` + `utils/forum-viewport.js` 判据），竖屏走 `/forum/post/:id`——**复用同一判据，不可各写一套** |
| 跳用户 | `/profile/:username`（`hideNavbar` → 跳过去后导航栏消失，属既有行为） |
| 跳教程 | `/download`（`/tutorial` 已重定向到此）→ 建议 `#<item.id>` 锚点 |
| 输入态 | ⚠️ **实时输入搜索不许写 URL**（仓库硬规则，见 `App.vue` 路由 key 口径） |
| 暗色 | 面板与结果卡必须亮暗双态完备（`check-dark-tokens` 观察模式会把新组件计入） |
| 减少动效 | 展开/收起在 `prefers-reduced-motion` 下退化为纯淡入淡出 |
| 锁定 import | 新组件不得引入会触发 tfjs / `node-fetch` 解析的依赖（`probe-vite-dep-scan.mjs`） |

## 5. 落点文件清单

| 动作 | 路径 |
|---|---|
| 新增 | `src/config/site-search-sources.js`（注册表 + 归一化） |
| 新增 | `src/config/site-nav.ts`（从 `navMenuItems` 抽出，导航与搜索共用单源） |
| 新增 | `src/components/UnifiedNavbar/GlobalSearchIsland.vue` |
| 新增 | `src/utils/api/site-search-api.js`（组 B 的轻量查询；组 A 复用现有 api） |
| 新增 | `src/utils/site-search-intent.js`（照 `resource-search-api.js` 的停用词/别名表范式） |
| 修改 | `src/components/UnifiedNavbar/index.vue`（入口按钮 + ⌘K + 高度分槽） |
| 修改 | `src/composables/useIsland.js`（`preempt` 语义） |
| 修改 | `src/components/UnifiedNavbar/style.scoped.css`（新面板样式；顺手清掉已无模板引用的 `.nav-search-btn` / `.nav-search-panel` / `.has-nav-search-panel` 残留） |
| 提取 | `src/views/Download/index.vue` 的 `rawTutorialData` → `src/data/tutorials.js` |
| 提取 | `src/views/CharacterBook/index.vue` 的 `characters` → `src/data/character-book.js` |
| 可选收紧 | `activity_campaigns` 的 RLS（当前 `using(true)` 会把 draft 泄漏给 anon） |

## 6. 分期

- **P0 — 可用**：入口 + ⌘K + 岛内面板 + 组 C 静态索引 + 组 A（帖子 / 用户）+ 键盘导航（↑↓ / Enter / Esc）+ 点外部关闭 + 仲裁与 hideNavbar / 开场画边界
- **P1 — 覆盖**：组 B 全部小表接入 + 类型 chip 切换 + 每组「查看全部」+ 搜索历史（localStorage）+ 空态引导
- **P2 — 智能**：意图识别（自然语言 → 结构化条件）+ 组 D Modrinth 接入 + 零结果时静默升级到 `boh-ai-retrieval` + 「问 BOH」把 query 经 `showIsland.ai({ prompt })` 交给 AI 岛（**这条通路已存在，零成本**）
- **P3 — 深化**：结果内联预览、结果级 Actions（直达评论 / 活动报名 / 商品详情）

> 关于 AI：全站内容做 embedding 是重投入且需持续同步，而"随手搜一下"等不了 rerank 延迟。
> **AI 只在两条路上出手**——零结果兜底、用户显式点「问 BOH」。

## 7. 验收探针

新增 `scripts/probes/probe-global-search.mjs`，至少覆盖：

1. 入口按钮存在且可点；竖屏 mini 下点击后 surface 展开成长条
2. `⌘K` / `Ctrl+K` 开关；`hideNavbar` 路由下不响应
3. 首页开场画在场时不响应（或按 §4.3 的口径）
4. 面板展开高度上报 > 0，且关闭后 `--global-nav-custom-card-height` 归零、surface 复原
5. 输入后各组结果出现；组上限生效；「查看全部」切换正常
6. 键盘：↑↓ 循环、Enter 执行、Esc 关闭、点外部关闭
7. 与任务岛 / AI 岛的仲裁：有岛在场时打开搜索仍可见（§4.2 的修复点）
8. 暗色 token 断言；reduce 下无动画残留
9. 跳转断言：帖子（横屏弹窗 / 竖屏路由）、用户、教程锚点各一例

并按仓库惯例做**反证**：撤掉 §4.2 的仲裁修复，断言第 7 条必须转红。

## 8. 风险清单

| 风险 | 说明 | 应对 |
|---|---|---|
| 请求放大 | 组 B 有 9 张表，若全在输入时并行查会打爆 Supabase | 分级触发（§3.2）：即时组只 3 个来源 |
| 第三方限流 | Modrinth 逐字触发会被限流且慢 | 组 D 仅显式触发 |
| 草稿泄漏 | `activity_campaigns` 的 RLS 是 `using(true)`，draft 会被 anon 直查拿到 | 入搜索前先收紧策略 |
| 权限面 | 组 B 多为 anon 可读，但 `list_forum_posts` 已撤 anon | 帖子结果按登录态分流：未登录时不查帖子，或引导登录 |
| 结果口径漂移 | 若在 SQL 里复制论坛的 rank / 高亮逻辑 | 一律复用 `list_forum_posts` 与 `forum_search_excerpt`，不复制 |
| 高度抖动 | 结果异步到达导致 surface 高度反复变化 | 结果区固定高度 + 内部滚动，加载态保持占位高度 |
| 中文两字词 | trgm 索引对两字中文词无可提取 trigram → 顺序扫描 | `posts` 现仅百余行，可忽略；行数增长后需重新评估 |

## 9. 实施状态（2026-09-27 落地：组 A + B + C）

### 已完成

| 文件 | 作用 |
|---|---|
| `src/config/site-search-sources.ts`（新） | **搜索源注册表**：15 个 source，`instant`（本地索引 + 帖子 + 用户）/ `deferred`（其余小表）分级 |
| `src/utils/api/site-search-api.ts`（新） | 组 B 九张小表 + profiles 的 ILIKE 查询层，含保留字符/通配符转义 |
| `src/composables/useGlobalSearch.js`（新） | 开关逻辑：按钮 + `/` 快捷键 + `preempt()` + hideNavbar / 开场画边界 |
| `src/components/UnifiedNavbar/GlobalSearchIsland.vue`（新） | 面板：输入 / 类型 chip / 分组结果（每组 ≤3）/ 键盘导航 / 点外部关闭 / 暗色 / reduce |
| `src/config/site-nav.ts`（新） | 顶栏菜单**单源**（导航渲染与搜索索引共用）+ `flattenSiteNavPages()` |
| `src/data/tutorials.ts`、`src/data/character-book.ts`（新） | 从 Download / CharacterBook 的组件内联常量抽出（原内联已删，零重复） |
| `src/composables/useIsland.js` | 新增 `showIsland.preempt()`（收任务岛 + 派发抢占事件清通知队列） |
| `src/components/UnifiedNavbar/index.vue` | `.nav-user` 内插入口按钮；监听抢占事件；接 `useGlobalSearch()` |
| `src/components/UnifiedNavbar/style.scoped.css` | mini 未展开态隐藏 `.nav-search-btn` |
| `scripts/probes/probe-global-search.mjs`（新） | **28 条**断言，4 组场景 |

### 与方案原文的四处修正（都是实测踩出来的）

1. **快捷键不能用 ⌘K** —— 它已被 BOH AI 岛占用：`useGlobalAiPreferences` 默认 `shortcut='mod+k'`
   （用户可改 mod+space / mod+j），`App.vue` 的 `handleGlobalAiKeydown` 全局监听且**不判 shiftKey**。
   两边都注册在 window 上，`preventDefault` 挡不住对方，实测后果是「搜索面板刚打开就被 AI 岛以
   `has-bohai-island` 盖住」。→ 搜索改用 `/`（非输入态），并用探针守住「⌘K 不打开搜索面板」。
   ⚠️ 若产品后续决定让搜索接管 ⌘K，必须同时改 AI 侧的偏好默认值，不能只加 stopImmediatePropagation。
2. **`preempt()` 与「收掉 AI 岛」是两件事** —— `custom` 槽位的 v-show 条件是
   `!isTaskCardShown && !isBohaiIslandOpen`，**通知岛不在其中**（它只让 surface 更高）。所以
   「通知岛在场时面板仍可见」**不能**作为 preempt 的守卫（第一次反证时它假绿）。现在拆成两条独立断言：
   ⑱b（preempt 清通知卡）与 ⑱d（AI 岛让位）。
3. **scoped 样式里 `:global(#id[attr]) .cls` 不产出规则** —— CSSOM 实测 `rules=[]`，暗色恒失效且
   不报错。改为直接写 ID 选择器 `#unified-nav-container[data-theme="dark"] .cls`（与
   `UnifiedNavbar/style.scoped.css` 既有写法一致）。
4. **新增文件里带 TS 类型语法的必须是 `.ts`** —— `.js` 里的 `interface` 是语法错误；带 `.ts` 扩展名
   导入在 `moduleResolution: bundler` 下也不合规（项目里 `@/config/*` 一律不带扩展名）。

### 未完成（按优先级）

- **组 D Modrinth**：仍按方案只在「意图命中资源词」或用户点「去 Modrinth 搜」时触发；复用
  `utils/api/resource-search-api.js`，注意真实调用链在 `views/BOHAI/composables/useResourceSearch.js`。
- 结果关键词高亮（当前 `posts` 的 `[[ ]]` 标记是**剥掉**显示的，避免 v-html 消毒负担）。
- 搜索历史 / 热门词 / 空态引导。
- 意图识别（档位 2：自然语言 → 结构化条件），可照 `resource-search-api.js` 的停用词/别名表范式。
- `activity_campaigns` 的 RLS 收紧（当前 `using(true)` 会把 `stage='draft'` 泄漏给 anon，
  现在只在前端侧用 `.neq('stage','draft')` 兜底）。

### 验证

- `probe-global-search.mjs` **28/28 PASS**；**反证两轮**：停用 `preempt()` → ⑱b 转红
  （`shown=true cleared=false`）；停用 AI 岛让位 → ⑱d 转红；恢复后 28/28。
- `vue-tsc --noEmit` 干净、eslint 全绿；门禁 `check:views` / `check:structure` /
  `check:important-budget`（1319/1319 未变）/ `check:first-paint` 全过。

## 10. 搜索开启光效（已实现六轮后按用户要求移除，2026-09-27）

形态经历了「纯白内部光（不可见）→ 暖金内部光 → 彩虹内部光 → 边缘描边 → 彩虹流光 → 灰调彩光晕」
六轮迭代，最终用户决定不要光效，模板 / 样式 / 探针断言已整体移除。
过程与四条可复用经验（纯白叠加不可见、定格截图验证法、元素截图裁外发光、transform 旋转带离边缘环）
沉淀在 `.workbuddy/memory/2026-09-27.md` 与长期记忆，此处不赘述。

## 11. 避让修复（随光效探索发现的真实布局 bug，已保留）

**现象**：搜索一出结果，页面内容区被推下去 200px+（用户口径「侧边栏被岛带着向下避让」）。

**根因**：`Home/index.vue` 的 `syncNavIslandHeight` 与 `UserSpaceMain.vue` 的
`syncUserspaceNavHeight` 用 ResizeObserver 把 `#unified-nav-container` 的**实时高度**写入
`--userspace-nav-h`；岛（搜索面板 / AI 岛 / 状态卡）展开时 container 从 78px 涨到 300px+，
首页 stage / hero 与用户空间多处 `padding-top` 吃该变量 → 内容整体下移。

**修复**：上报高度钳制到 container 的 `min-height`（= 收起态高度，单源在 CSS）——
岛是悬浮层，页面内容不应为它让位。UserSpaceMain 原有的 AI 岛冻结逻辑因此变为无害冗余，保留。

**守卫**：探针组 5「岛展开与出结果都不推页面内容」（打开前后 main top / stage 高度对比 ±2px）。

## 12. Spotlight 式优化（2026-09-27 第二批，已实现）

对标 macOS Spotlight 的四项增强，全部落在既有注册表 / 面板架构内：

### 12.1 动作搜索（搜到即执行）

- `site-search-sources.ts` 新增 **`actions` 源**（instant、纯本地、排来源首位）：
  切换主题 / 退出登录 / 打开 BOHAgent / 检查版本更新 / 创建桌面快捷方式。
  匹配 = 标题 + 摘要 + 关键词表（小写 includes）；主题动作标题按当前主题动态生成。
- `SiteSearchHit` 扩展 `action?: string`，取值 = **`handleMenuAction` 的 action 词表**；
  执行权统一归导航栏（单一真相源）：`useGlobalSearch({ onAction })` → 面板 props.onAction
  → navbar `handleMenuAction`。新增 `toggleTheme`（themeManager.toggle）与
  `logout`（confirm 确认后 authStore.logout）两个分支；checkVersion / createDesktop /
  openAiAssistant 复用既有实现。
- ⚠️ 动作词表两处同步：`SITE_SEARCH_ACTIONS` 的 action 值 ↔ `handleMenuAction` 分支。

### 12.2 常驻「问 BOH AI」

结果列表末尾常驻 `gs-ai` 按钮（虚线弱化样式，有词就在，不只零结果兜底）——
Spotlight「在网页中搜索」同款位。点击 = 关面板 + `showIsland.ai({ prompt })`；
opener 未注册时兜底 `router.push('/ai-chat')`，点击不落空。

### 12.3 Alt+数字切类型

`Alt+Digit1..9` 切 chip（1 = 全部，2.. = 来源 chip）。

- ⚠️ **不能用 Cmd/Ctrl+数字**：浏览器保留给「切标签页」，preventDefault 拦不住。
- ⚠️ **判据必须用 `event.code`（Digit1..9）而非 `event.key`**：macOS 上 Option+数字的
  key 是特殊字符（Option+2 = '™'），按 key 在 Mac 上永远匹配不上（探针 ㉙b 实测踩过）。
- ⚠️ **「全部」chip 是模板硬编码、不在 `chips` computed 里** → 键盘序号整体差一位：
  `n === 1` 取全部，否则 `chips.value[n - 2]`。首版写 `chips.value[n-1]`，
  Alt+2 永远选不中（temp-diag 实测 `chipId: null` 后定位）。

### 12.4 点击频率排序（个性化）

`localStorage['boh-site-search-source-clicks']` 记各 source 点击次数；`orderedGroups`
按「历史点击多 → 排前」，同频靠注册表顺序（sort 稳定）。⚠️ 仍不做跨组融合——
频率只决定**组与组的展示顺序**，组内分数各归各。AI 入口点击记为 `ai`（仅入账不参与组序）。

### 验证

探针扩至 **38/38**（组 6 新增 7 条：动作命中 / 动作真实执行（主题实测翻转 light→dark）/
Alt+2 单组展示 / AI 入口存在 / 点击后面板关+AI 岛开+频率落库 / 频率排序生效 / 零 pageerror）。
eslint、vue-tsc、check:views / check:structure / check:important-budget（1319/1319）全过。

**未做（下一批候选）**：结果级 Actions（Hit.actions 数组）、MC 速查卡（「1.20.4 对应 Java 17」
即答卡）、搜索历史与空态热门词、剪贴板历史（Web 权限受限，放弃）。

## 13. Spotlight 式优化（2026-09-27 第三批，已实现）

### 13.1 MC 速查卡（版本 → Java 即答）

- `data/mc-quick-answers.ts`：**唯一结构化映射**（1.12–1.16.5→Java 8+ / 1.17.x→16+ /
  1.18–1.20.4→17+ / 1.20.5+→21+）+ `matchMcJavaAnswer()`（正则提取 1.x[.y]，区间比较）。
  教程 q2 的散文保持人类可读，版本要求更新时改本表。
- 注册表 `answers` 源（instant、排来源**最前**、恒 ≤1 条），route 跳 `/download#q2` 教程锚点；
  面板给该组 `gs-group--answer` 轻强调样式（读起来像「系统直接给了答案」）。

### 13.2 结果级 Actions（复制链接）

- 每条有 route 的结果，悬停/键盘选中时浮现「复制链接」按钮（绝对定位行尾、覆盖次要
  meta 区），点击写 `origin/#/route` 到剪贴板，1.6s「已复制 ✓」反馈。
- ⚠️ **不能嵌进 `.gs-hit`（button 套 button 非法）** → 外层包 `.gs-hit-row`（position:relative）+
  兄弟节点绝对定位。
- 「关注用户」评估后不做：`followUser` 需要双方 id + 登录态 + 关注状态回显，塞进面板太重。

### 13.3 搜索历史（Spotlight Recents）

- `localStorage['boh-site-search-history']`：**点开结果时**落账（去重、最新在前、上限 8 条）。
- 空态展示「最近搜索」chip 列表：点击回填 query（自动触发搜索），「清除」一键清空。

### 13.4 ⚠️ 附带修掉的真实 bug：点击目标中途被换下树 → 面板被误关

点「最近搜索」条目 → `applyHistory` 改 query → 空态历史块被 v-if 卸载 → **点击事件冒泡到
document 时 target 已是游离节点（isConnected=false）** → `rootRef.contains(target)`=false →
`handleDocumentClick` 误判「点外部」→ 面板整个关闭、回填失效。真实用户点历史条目必现。

**修复**：`handleDocumentClick` 开头加 `if (!target.isConnected) return` —— 游离目标意味着
「这是面板自己交互中被换下树的节点」，永远不是「点外部」。真实外部点击的 target 恒 connected。
排查方法（值得复用）：逻辑自洽但行为矛盾时，沿「事件是否真的送达 → 目标节点还连着树吗 →
实例是否换血」三层走查，`isConnected` + 祖先链快照一次定位。

### 验证

探针扩至 **47/47**（组 7 新增 9 条：速查卡命中 1.20.4→Java 17 / 边界 1.21→Java 21 /
剪贴板内容精确匹配（用「Frp」定位唯一命中，防断言路由漂移）/ 已复制反馈 / 历史落账 /
空态展示 / 回填出结果 / 清除落库 / 零 pageerror）。eslint、vue-tsc、
check:views、check:important-budget（1319/1319）全过。

## 14. Spotlight 式优化（2026-09-27 第四批：ABD，已实现）

### 14.1 内容补全（A）

- **评论源**（`comments`，instant）：`searchComments` —— `.or('status.is.null,status.eq.approved')`
  + `content.ilike`，路由 `/forum/post/:post_id`，badge「评论」。RLS `comments_select_visible`
  把关可见性；量级小不建 trgm（与帖子搜索不是一个重量级，注释已写明）。
- **我的笔记源**（`boh_cloud_entries`，instant）：`searchMyCloudEntries` —— title/content_text
  双字段 ILIKE，路由 `/user-space/note`。RLS 四条策略均 `auth.uid()=user_id`：登录只搜自己的、
  anon 恒空（site-search-api.ts 头注释的「私有数据不纳入」口径随之更新）。
- **Modrinth 源**（`Mod 资源`，**deferred 显式触发**）：复用 `searchMinecraftResourcesForBohAI`
  归一化链路（单源，`.js` 默认参推断坑 → 调用处显式收窄类型）。结果为 modrinth.com **外链**：
  `Hit.route` 允许 http(s)，面板 `openHit` 对外链 `window.open(_blank, noopener)`；
  无 route（计算器即答）→ 面板保持原状。
- ⚠️ **顺带修掉的预置 UX 缺口**：deferred 源原先只显示「有结果的组」的 chip —— 从不查询就
  永远没结果，**永远不可达**。现在 deferred chip 常驻可点（点击=显式触发），chip 行仅在有词时渲染。

### 14.2 体验增强（B）

- **关键词高亮**：`buildLocalExcerpt` 命中处包 `[[..]]`（新增 `markMatches`），posts 沿用服务端
  `search_excerpt` 自带标记（**删除 stripMarks** —— 之前把服务端标记直接扔了）；本地源标题
  同步打标。面板 `splitMarks()` 分段渲染 `<mark class="gs-mark">`（纯文本节点，无 v-html）。
- **速查扩展**：`data/mc-quick-answers.ts` 升级为 `data/quick-answers.ts`
  `matchQuickAnswers(query, take≤2)`：**计算器**（递归下降解析 +−*/%^ 括号，拒绝 eval、
  除零返回 null、route 为空不跳转）+ MC 正查 + **Java 反查**（Java 17 → 1.18~1.20.4）+
  **端口速查**（25565/19132）。
- **空态推荐**：热门词（`SITE_SEARCH_HOT_WORDS` 运营位静态配置）+ **猜你想去**
  （`boh-site-search-item-clicks` 条目级点击频率 top3 页面，不足用 /download /shop /lotteries
  兜底）。搜索历史/热门/猜你想去三块复用 `.gs-history` 样式，**探针定位须按块头文字**。
- **前缀指令**：`@xxx` 只搜用户；`#标签 [关键词]` 只搜对应来源（label 包含匹配）——
  `parseScope()` 在 `runSearch` 入口解析，优先级高于 chip 状态。

### 14.3 RLS 修复（D，已应用到远端）

`2026092704_activity_campaigns_draft_rls.sql`：旧 `activity_campaigns_select using(true)` 收紧为
`using (stage <> 'draft' or current_user_is_admin())`。配套
`scripts/probes/probe-campaign-draft-rls.py`（--apply 幂等应用 + 验证：policy 文本 / 授权保留 /
恰一条 SELECT 策略；Management API 会话不能 set role anon，行为语义由授权+policy 定义唯一决定）。
应用时表为空（0 行），无存量泄漏；前端 `.neq('stage','draft')` 保留为纵深防御。

### 验证

探针扩至 **58/58**（组 8 九条：计算器 25*4+10=110 / mark 渲染 / 热门词 5 / 猜你想去 3 /
空态无 chip 行 / 评论 mock 命中 / Mod chip 常驻+触发 / 外链新标签 / #教程 前缀单组）。
eslint、vue-tsc、check:views 全过。
⚠️ `check:important-budget` 失败为**并行未提交工作**所致（style.scoped.css 的「沉浸阅读形态」
immersiveNav 迷你球 +11，非本批改动；本批四个文件零新增 !important）——不代为下调基线，
由该工作自身收口。
