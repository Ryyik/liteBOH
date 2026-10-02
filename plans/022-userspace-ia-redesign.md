# 022 · UserSpace 信息架构重设计（底栏四席 + 我页空间/资产）

> 目标：把 UserSpace 从「功能模块分类」改成「用户动作分类」，对标小红书；底栏由 5 席收成 4 席，
> 「我」页只留 空间 / 资产 两个 tab，设置降级为「我」页内的文字入口，Cloud+ 收进设置。
>
> 提出：2026-09-29（首轮 IA 讨论）／2026-09-30 22:20（本轮口径修正，见 §2）
> 状态：**设计待确认**（尚未动代码）

---

## 1. 目标 IA 一览

```
底栏四席（全站共用 src/config/bottom-nav.ts）
├── 内容    ← 原「方块」改名，= 论坛本体
├── 消息    ← 通知收件箱（赞 / 评论 / 印象 / 转发），**不含 AI 段**
├── AI      ← 点击直接进全屏 AI 形态（/ai-chat），不是段、不是浮层
└── 我      ← 个人页 = 资料卡（固定头部，右上角文字「设置」）
                         + SegmentTabs [ 空间 | 资产 | 印象 ]
                ├── 空间 = 现有「我」页全部内容（我的创作流），不变
                ├── 资产 = 原底栏「资产」席（AssetsHubPanel + 赞助）
                └── 印象 = 原论坛第 7 席（ProfileImpressionsPanel + 自持数据层一并搬入）
                          形态 = **液态玻璃卡片墙**（删掉印象词云）

「我」页分段 = 复用现有 `SegmentTabs` 组件（**一套逻辑，不新造分段组件**）：
  · UserSpaceMain.vue:69  内容分区已用 SegmentTabs
  · UserSpaceMain.vue:213 消息分区已用 SegmentTabs
  · 本次「我」页的 [空间 | 资产 | 印象] 是第三处调用，行为与上两处一致（含滑动指示器动画）

内容（论坛）分区 —— 现状 7 席 vs 目标 4 档：
  现状 7 席（src/config/forum-sections.ts:34-42）：
      官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象
      其中 latest·following·news·activity 由 ForumMain 承载（FORUM_FEED_SECTIONS），
      official·members·impressions 走独立面板。
  目标 4 档：官方 / **最新** / 关注 / 成员
      · 官方 = Hero 特别展示流（HeroConsole），非普通 feed，不与 feed 流合并
      · 最新 = 现状 `latest`，**保留「最新」命名**（2026-09-30 拍板：不叫「推荐」、不接推荐算法）
      · 关注 = 现状 following
      · 成员 = 现状 members（AsyncCommunity / CommunityTab）
      · 新闻 / 活动 → 降为「最新·关注」之下的类型筛选 chips（全部 / 新闻 / 活动）
      · **印象 → 移出论坛，成为「我」页的第三个 tab**（2026-09-30 拍板）

「我」页内其他：
  设置：不占底栏席、不做独立导航；从资料卡右上角「设置」二字进入
  Cloud+：从「空间」段控里摘掉，收进设置，**在设置里占单独一行入口**（点进独立 Cloud+ 页）
  印象：论坛第 7 席 → 「我」页第三 tab（组件 ProfileImpressionsPanel.vue 现成，数据层需一并搬迁）
  **印象词云：删掉**（2026-09-30 拍板：改用液态玻璃卡片墙，词云不够好看）
```

---

## 2. 本轮口径修正（相对 2026-09-29 首轮拍板）

| # | 2026-09-29 首轮方案 | 2026-09-30 修正为 |
| --- | --- | --- |
| 1 | 发布入口 = 内容流段控右端常驻 ＋ +「我」页作品格 ＋（A+C 组合） | **撤回，发布保持不动**（不加任何新发布入口） |
| 2 | AI 三入口（岛 / 右边缘滑动 / 底栏席位）形态不同、实例相同 | 补充：**底栏 AI 席点击 = 直接进全屏 AI 形态** |
| 3 | 「我」页层级 = 资料卡 → 积分卡 → 数据条 → 我的创作（作品/Cloud+/收藏/赞过）→ 我拥有的 → 设置 | 「我」页只留 **空间 / 资产 两个 tab**；空间内容不变，资产从底栏撤下收进来 |
| 4 | Cloud+ 是「我创作的」段控里的一格（作品 / Cloud+ / 收藏 / 赞过） | **Cloud+ 移入设置** |
| 5 | 资产 + 设置整条下沉进「我」 | 细化：**设置不做成独立导航**（不占底栏席、不做独立 tab） |
| 6 | — | 设置入口图标**从齿轮 SVG 改为文字「设置」两个字** |
| 7 | 内容流 4 tab：官方 / **推荐** / 关注 / 成员 | 第二档**保留「最新」**命名（不叫推荐、不接推荐算法） |
| 8 | 内容流被收掉的 5 席落点未定（官方/新闻/活动/成员/印象） | 官方·成员留在内容流；新闻·活动降为 chips；**印象成为「我」页第三 tab** |
| 9 | — | 「我」页从 2 段扩为 **3 段**：`空间 / 资产 / 印象`；消息 tab **不放 AI 段** |
| 10 | — | Cloud+ 在设置里**占单独一行入口**（点进独立 Cloud+ 页） |

---

## 3. 现状盘点（file:line 已核对）

### 3.1 底栏真源

`src/config/bottom-nav.ts:26-32` —— 现有 **5 席**：

```ts
export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'community', label: '方块', icon: LayoutGrid,    route: '/' },
  { id: 'posts',     label: '我的', icon: User,          route: '/user-space?tab=posts' },
  { id: 'assets',    label: '资产', icon: Wallet,        route: '/user-space?tab=assets' },
  { id: 'messages',  label: '消息', icon: MessageCircle, route: '/user-space?tab=messages', badge: 'messages' },
  { id: 'settings',  label: '设置', icon: Settings,      route: '/user-space?tab=settings' },
]
```

**三处共用同一份**（改必然连带）：UserSpace 底栏 `UserSpaceBottomNav.vue` / 横屏左栏 `UserSpaceSideRail.vue` / 首页底栏。
⇒ 不存在「只改 UserSpace 底栏」这个选项。

`USERSPACE_TAB_TO_BOTTOM_NAV_ID`（`:39-45`）当前是 1:1 映射，收席后需同步改。

### 3.2 「空间」这个词已经存在

`src/views/user-center/UserSpace/UserSpaceMain.vue:652-655`

```js
const CONTENT_SECTION_ITEMS = [
  { id: 'home',  label: '空间' },
  { id: 'cloud', label: 'Cloud+' },
]
```

⇒ 「空间 / Cloud+」是**「我的」tab 下的段控**。本次改动 = **摘掉 `cloud` 这一格**（Cloud+ 移入设置），
`home` 段（= `ProfileHomePanel`）内容**原样不动**。

### 3.3 设置入口已存在于资料卡右上角

`src/views/user-center/UserSpace/components/ProfileHomePanel.vue:22-42`

```html
<button type="button" class="profile-settings-btn" @click="$emit('settings')"
        aria-label="设置" title="设置">
  <svg viewBox="0 0 24 24" ...>  <!-- 齿轮图标 -->  </svg>
</button>
```

⇒ **位置已经是对的**（资料卡右上角），本次只需把 `<svg>` 齿轮换成文字「设置」。
`ProfileHomePanel` 已经 `$emit('settings')`，宿主 `UserSpaceMain.vue:106` 接 `@settings="openProfileSettings"`。

### 3.4 设置面板已有 Cloud+ 入口

`UserSpaceMain.vue:277` —— `ProfileSettingsPanel` 已带 `@open-cloud="openCloudPlusArea"`，
并接收 `:cloud-plus-usage-text`（`:267`）。
⇒ 「Cloud+ 移入设置」在设置侧**已具备落点**，主要是把「空间」段控里的 Cloud+ 格摘掉 + 确认设置里的呈现形态。

### 3.5 AI 现在是「消息」tab 下的一个段

`UserSpaceMain.vue:656-659`

```js
const MESSAGE_SECTION_ITEMS = [
  { id: 'inbox', label: '消息' },
  { id: 'ai',    label: 'BOH AI' },
]
```

AI 组件 `AsyncBOHAI` 在 `:230-238` 以 `embedded` 模式挂在消息 tab 的 `ai` 段。
全屏落点路由已存在：`src/router/routes/public.ts:95` → `path: "/ai-chat"`。

### 3.6 已落地的 Cloud+ 代码（2026-09-29 16:55）

| 层 | 落点 |
| --- | --- |
| 纯函数 | `utils/cloud-storage-accounting.js`、`utils/cloud-note-cover.js` |
| 编排 | `utils/cloud-entry-maintenance.js` |
| API | `utils/api/boh-cloud-api.js`（`setMyCloudEntryVisibility` / `listUserPublicCloudEntries`） |
| 页 / 组件 | `Cloud+/CloudPlusMain.vue`、`Cloud+/CloudStorageBar.vue` |
| 作品格 | `ProfileHomePanel.vue` + `UserSpaceMain.vue`（帖子 + 公开笔记混排） |
| DB | `supabase/migrations/2026092901_boh_cloud_entries_public_work_notes.sql`（**已部署**） |

⇒ 这些**不动**。Cloud+ 只是「入口从段控挪到设置」，功能本体与作品格的公开笔记混排保持现状。

### 3.7 论坛分区现状 = 7 席（不是 4 席）

`src/config/forum-sections.ts:34-42`

```ts
export const FORUM_SECTION_ITEMS: ForumSectionItem[] = [
  { id: 'official',    label: '官方' },
  { id: 'latest',      label: '最新' },
  { id: 'following',   label: '关注' },
  { id: 'news',        label: '新闻' },
  { id: 'activity',    label: '活动' },
  { id: 'members',     label: '成员' },
  { id: 'impressions', label: '印象' }
]
```

- `FORUM_FEED_SECTIONS = ['latest','following','news','activity']`（`:50`）—— 这四席由 `ForumMain` 承载；
  `official` / `members` / `impressions` **走独立面板，不是 feed 形态**。
- 默认落点 `FORUM_DEFAULT_SECTION = 'latest'`（`:47`），官方只是排序居首。
- ⇒ 「7 席收 4 档」**有现成分类依据，不是砍功能**，只是把两类东西摆到正确层级（同 2026-09-29 日志结论）。
- ✅ 目标档位的第二档**保留「最新」**（2026-09-30 拍板），所以 `latest` 的 id 与 label 都不动，只减不加。

### 3.8 「我」页分段组件已现成

`UserSpaceMain.vue:69`（内容分区）、`:213`（消息分区）均使用 `SegmentTabs`：

```html
<SegmentTabs :sections="CONTENT_SECTION_ITEMS" v-model="contentSection" aria-label="内容分区" />
<SegmentTabs :sections="MESSAGE_SECTION_ITEMS" v-model="messagesSection" aria-label="消息分区"
             style="--segment-tabs-inset: 4px" />
```

⇒ 「我」页的 `[空间 | 资产]` 是**第三处调用同一组件**，一套逻辑、含同一份滑动指示器动画，不新造分段组件。

### 3.9 印象（impressions）现状 —— **三份平行 UI 实现**（2026-09-30 22:47 更正）

> ⚠️ **本节初版有一处错误论断，已更正**：初版称 `ai-site-guide.js` 的「路径 A」是假路径、
> `ProfileMain.vue` 里没有任何 impression 引用。**那是错的** —— 当时 grep 的文件路径写成了
> `src/views/user-center/ProfileMain.vue`（不存在），`2>/dev/null` 又把 "No such file" 吞掉，
> 得到空输出后误判为「无引用」。真实路径是 `src/views/Profile/ProfileMain.vue`，
> 该文件有 **80 处** impression 引用。以下为重新核实的结论。

**印象有三份彼此独立的 UI 实现**：

| # | 落点 | 展示谁 | 能力 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `src/views/Profile/ProfileMain.vue`（路由 `/profile/:username`） | **被访问用户** | 最完整：印象 tab（带计数 `:588-593`）→ 词云（`:880-885`，由 `impressions` 分词生成）→ 写印象输入框（`:887-904`，`v-if="!isOwnProfile && isLoggedIn"`）→ 印象墙卡片 + tier（`:915-953`）→ 分页加载更多（`:954-960`）→ 「发印象」按钮（`:330`） | 活跃，他人主页主路径 |
| 2 | `UserSpace/components/ProfileImpressionsPanel.vue`（论坛第 7 席 body） | **自己**（标题「我的印象」，副标题「N 位伙伴写下了对你的印象」） | 卡片墙 + 逐条移除（两段确认 armed）+ 服务端分页 | 活跃，由 `ForumSectionShell.vue:37-48` 挂载 |
| 3 | `src/views/user-center/TagsImpressions.vue`（路由 `/user-space/tags-impressions`） | **自己** | 他人印象列表 + 删除；「个人标签」段是半成品 | **孤儿**：全站零 UI 入口（见 §5 待定 1） |

**共同 API**：`utils/api/profile-api.js` → `getUserImpressions` / `addUserImpression` / `deleteUserImpression`，表 `user_impressions`。

**其他相关点**：
- 论坛第 7 席的**数据层自持在 `ForumSectionShell.vue` 内部**（`impressionsLoading` / `profileImpressions` /
  `impressionsHasMore` / `isLoadingMoreImpressions` / `loadMoreImpressions` / `handleDeleteImpression`
  + 一份 `createMemoryTtlCache`）⇒ 搬迁「我」页印象 tab 时这块要一并挪走或抽出。
- 消息中心有「印象」**通知**分类（`Messages/index.vue`），是通知不是印象墙本体。
- `Partners.vue`（社区伙伴页）也有「写印象」入口。

**✅ 更正结论**：`src/data/ai-site-guide.js:36-39` 写的三条路径**都是准确的**（路径 A `/profile/:username`
的「印象」标签确实存在）。它仍需要在 IA 改动后更新，但原因是**路径会变**（印象从论坛移到「我」页），
不是因为它本来写错了。

**⇒ 对本次 IA 的含义（重要）**：
印象天然有「两个面」——**别人看我**（公开主页，含写印象）与**我看我收到的**（私人侧，含管理）。
「我」页新增的印象 tab 属于后者，与 `/profile/:username` 的印象 tab **不是重复**，是同一数据的两侧视图。
但 #2 与 #3 是同一侧的**两份实现**，收敛掉一份才是正解（#3 是孤儿且最弱，见 §5）。
若进一步追求单一真源，可考虑让 #2 复用 #1 的印象墙渲染，但两者 props 与能力面不同（#1 含写入口与词云），
属独立议题，不在本轮范围。

### 3.10 印象词云现状 —— 全站唯一落点，且风格与 #2 不一致

**词云只存在于一处**：`ProfileMain.vue` 的印象 tab 内（即 §3.9 的 #1）。

| 项 | 落点 |
| --- | --- |
| 模板 | `ProfileMain.vue:880-886`（`.word-cloud-section` → header + `<WordCloud :words="wordCloudData" :height="200" />`） |
| 组件 | `src/components/WordCloud.vue`（**全站仅此一处引用**，删词云后即成孤儿） |
| import | `ProfileMain.vue:1033` |
| 数据 | `wordCloudData` computed `ProfileMain.vue:1504-1543`（由 `impressions` 分词统计，取前 30 词） |
| 分词依赖 | `segmentText`（`:1463-1502`）+ `stopWords`（`:1335`）—— **均为词云专用** |
| 样式 | `Profile/style.scoped.css` 里 `.word-cloud-*` 共 **~13 处**（`:785/790/797/804`、`:1923/1927/1931`、`:2017`、`:2738`、`:3324/3332`、`:3522` 暗色、`:3651`） |

⚠️ 注意区分：`views/ResetPassword/index.vue:121-125` 里也有个叫 `segmentText` 的**局部变量**（解析 URL 片段），
与词云无关，**不要一起删**。

**风格不一致（本次要收敛的点）**：

| | #1 `ProfileMain` 印象卡 | #2 `ProfileImpressionsPanel` 印象卡 |
| --- | --- | --- |
| 背景 | `var(--surface-soft)`（`style.scoped.css:3394`） | `var(--liquid-bg)`（`:203`）+ `var(--liquid-filter-sm)` |
| 边框 | 裸值 `rgba(15,23,42,0.06)` | `var(--liquid-border)` |
| hover | `background: #fff` + 裸 `rgba(15,23,42,0.08)` 阴影 | `var(--liquid-shadow)` + `var(--liquid-inner-highlight)` |
| 结论 | **非液态玻璃** | **液态玻璃** ✅ |

⇒ 2026-09-30 拍板：**删词云，印象卡统一为液态玻璃风格**（向 #2 看齐）。
附带好处：#1 那几处裸色值（`rgba(15,23,42,…)` / `#fff`）被 liquid token 替换后可**下调暗色 token 棘轮计数**。

---

## 4. 改动清单（按文件）

### 4.1 `src/config/bottom-nav.ts`（真源，先改这里）

- `BOTTOM_NAV_ITEMS` 5 席 → **4 席**：`内容 / 消息 / AI / 我`
  - `community`：`label` 由「方块」改「**内容**」（用户口径：内容和方块一个意思，按内容命名）
  - `posts`：`label` 由「我的」改「**我**」
  - **新增** `ai` 席：`route: '/ai-chat'`（点击即全屏 AI，不参与 tab 选中态）
  - **删除** `assets` 席（收进「我」页的**资产分段**）
  - **删除** `settings` 席（降级为「我」页内文字入口）
- `USERSPACE_TAB_TO_BOTTOM_NAV_ID` 同步收敛；`ai` 席不进映射表（它不是 UserSpace tab）
- ⚠️ 三处共用：`UserSpaceBottomNav.vue` / `UserSpaceSideRail.vue` / 首页底栏同步生效

### 4.2 `UserSpaceMain.vue`

- 原 `CONTENT_SECTION_ITEMS`（`[空间 | Cloud+]`）段控**整体移除**，由「我」页新的 `[空间 | 资产 | 印象]` 取代：
  - 复用现有 `SegmentTabs` 组件（与 `:69` 内容分区、`:213` 消息分区同一套逻辑）
  - `空间` 段 = 现有 `ProfileHomePanel` 挂载块（`:74-133`）原样保留
  - `资产` 段 = 复用现有 `assets-shell` 块（`AssetsHubPanel` + `SponsorPanel`，`:135-195`）
  - `印象` 段 = 从 `ForumSectionShell.vue` 搬入的 `ProfileImpressionsPanel` + 其自持数据层
- **消息 tab 移除 AI 段**（2026-09-30 拍板）：`MESSAGE_SECTION_ITEMS` 去掉 `{ id: 'ai' }`，
  `AsyncBOHAI` 的 `embedded` 挂载块（`:230-238`）一并移除；消息 tab 只剩通知收件箱
- **印象搬迁**：`ForumSectionShell.vue` 的 impressions 分支（`:37-48`）与**它自持的数据层**一并移出，
  挂到「我」页的「印象」段；`ProfileImpressionsPanel.vue` 组件本体不动
- ⚠️ 分段值需重定：原 `contentSection` 为 `'home' | 'cloud'`，新增 `'assets' | 'impressions'`；
  且「资产」由原来的**独立 tab**（`currentTab === 'assets'`）降为**分段**，URL 形态要重定（见 §6）
- `LEGACY_TAB_MAP`（`:628`）新增兼容：`assets → posts(section=assets)`、`settings → posts(打开设置)` → 见 §6
- `openProfileSettings`（`:1798`）：入口从底栏 tab 改为「我」页内面板，URL 形态需重定 → 见 §6

### 4.3 `ProfileHomePanel.vue`

- `:22-42` `.profile-settings-btn` 的 `<svg>` 齿轮 → 文字「**设置**」
  - 同步改 `.profile-settings-btn`（`:1112`）与 `svg` 子选择器（`:1140`）与暗色覆盖（`:1634`）的样式
- ⚠️ 样式改了要过 `check:dark-tokens:strict`（暗色裸色值棘轮）与 `check:important-budget`

### 4.4 `CloudPlusMain.vue` / 设置面板

- `ProfileSettingsPanel` 已有 `@open-cloud` 入口（`UserSpaceMain.vue:277`）→ **保持为设置里单独一行入口**，
  点进独立 Cloud+ 页（2026-09-30 拍板：不做内联展开）
- Cloud+ 页副标题维持「私密空间 · 全部存储」

### 4.5 论坛分区 `src/config/forum-sections.ts`（现状 7 席 → 目标 4 档）

- `FORUM_SECTION_ITEMS` 7 席 → **4 档**：`官方 / 最新 / 关注 / 成员`
  - `latest` **保留「最新」label**（不叫「推荐」、排序逻辑不动 —— 2026-09-30 拍板，避免与「本轮内容流形态不动」冲突）
  - `news` / `activity` 从分区表移出 → 降为「最新·关注」之下的**类型筛选 chips**（全部 / 新闻 / 活动）
  - `impressions` 从分区表移出 → **成为「我」页的第三个 tab**（见 §4.2）
- `FORUM_FEED_SECTIONS`（`:50`）随之收敛：`news` / `activity` 若不再是分区，须从该数组移除
- `FORUM_DEFAULT_SECTION`（`:47`）：默认落点仍是 `latest`（label 不变，值不用改）
- ⚠️ `resolveForumSection` / `resolveExternalFeed` 的回落口径要同步，否则旧 URL 深链
  （`?view=news` / `?view=activity` / `?view=impressions`）会落到不存在的分区
- ⚠️ 消费方三处：`ForumSectionShell.vue` / `UserSpaceMain.vue`（合法 view 集合）/ `Home/index.vue`（写回 URL）
- ⚠️ `src/data/ai-site-guide.js:36-39` 的印象路径描述要一并更新（落点变化，见 §3.9）

### 4.6 收掉 `/user-space/tags-impressions`（建议，待确认）

- `router/routes/user-space.ts:160-162` 改为 redirect → `?tab=posts&section=impressions`（用现有 `redirectWithQuery` 透传 query）
- 删 `TagsImpressions.vue`（476 行）与它的暗色样式 / theme-manager 引用 → 完整清单见 §5 待定 1
- 更正 `src/data/ai-site-guide.js:15`、`:38`（路径本身没错，是**落点变了**，见 §3.9）

### 4.7 删印象词云 + 印象卡统一液态玻璃（2026-09-30 拍板）

**A. 删词云**（落点见 §3.10）

- 删 `ProfileMain.vue` 模板段 `:880-886`（`.word-cloud-section` 整块）
- 删 `ProfileMain.vue:1033` `import WordCloud from '@/components/WordCloud.vue'`
- 删 `ProfileMain.vue` 的 `wordCloudData` computed（`:1504-1543`）
- 删 `ProfileMain.vue` 的 `segmentText`（`:1463-1502`）与 `stopWords`（`:1335`）—— **词云专用**
- 删 `Profile/style.scoped.css` 里 ~13 处 `.word-cloud-*` 规则
- 删 `src/components/WordCloud.vue`（删词云后全站零引用 → 孤儿组件）
- ⚠️ **不要动** `views/ResetPassword/index.vue:121-125` 的同名局部变量 `segmentText`（无关）

**B. 印象卡统一液态玻璃**（向 `ProfileImpressionsPanel.vue` 看齐）

- 改 `Profile/style.scoped.css:3393-3409` `.impression-card-profile` 及其 `:hover`：
  - `background: var(--surface-soft)` → `var(--liquid-bg)`
  - `border: 1px solid rgba(15,23,42,0.06)` → `1px solid var(--liquid-border)`
  - `:hover` 的 `background: #fff` + 裸 `rgba(15,23,42,0.08)` 阴影 → `var(--liquid-shadow)` + `var(--liquid-inner-highlight)`
  - 补 `backdrop-filter: var(--liquid-filter-sm)` + `-webkit-backdrop-filter`
  - ⚠️ 其余 4 处同名规则（`:897/905`、`:1888/1894`、`:2002/2007`、`:3677/3683`、`:3777/3795`）是响应式/暗色覆盖，
    要一并核对，别只改一处留下漂移
- ⚠️ **项目硬规则**：`--liquid-*` 只有一个出口 `tokens.css`，**子组件不许压父级变量**；暗色真源是 `theme-manager.js`
- ✅ 附带收益：被替换掉的裸色值可**下调 `check:dark-tokens:strict` 棘轮计数**（下调永远是好方向，不用交代）

### 4.8 不动的东西（明确列出，防误改）

- **发布**：不动（本轮撤回新增发布入口的方案）
- **内容流形态**：不动（不做瀑布流，仍是单列）
- Cloud+ 功能本体、作品格公开笔记混排、DB 迁移 2026092901：不动

---

## 5. 待定（需用户拍板）

**已决（2026-09-30 22:26）**
- 「我」页分段 = 复用现有 `SegmentTabs`，**一套逻辑**；资料卡固定为页头，段控只切下方内容
  （原「只剩一格的段控去留」「资料卡是否固定」两条关闭）。
- 原 `[空间 | Cloud+]` 段控**整体移除**，由新的 `[空间 | 资产 | 印象]` 取代。

**已决（2026-09-30 22:36）**
- 论坛第二档**保留「最新」命名**，不叫「推荐」、不接推荐算法 ⇒ 目标 4 档 = **官方 / 最新 / 关注 / 成员**。
- **印象移入「我」页**（不留在论坛分区）。

**已决（2026-09-30 22:41）**
- **消息 tab 不放 AI 段** ⇒ 消息 tab 只剩通知收件箱。
- **Cloud+ 在设置里占单独一行入口**（点进独立 Cloud+ 页，不做内联展开）。
- **「我」页 = 3 段 tab：`空间 / 资产 / 印象`**（印象是第三个 tab，不是并进「空间」段）。

**已决（2026-09-30 22:49）**
- **删掉印象词云**，印象卡统一为**液态玻璃风格**（向 `ProfileImpressionsPanel.vue` 看齐）。
  ⇒ 「我」页印象 tab 用 `ProfileImpressionsPanel` 那套渲染；`ProfileMain` 的印象卡一并改风格。
  完整改动清单见 §4.7。

**待定（1 条，已有明确建议）**

1. **`/user-space/tags-impressions` 独立路由去留**
   → **建议：收掉，改 redirect 到 `?tab=posts&section=impressions`**（2026-09-30 调查后给出，待用户确认）

   调查依据（file:line 已核对）：

   | 项 | 事实 |
   | --- | --- |
   | UI 入口 | **零**。全站无 `router-link` / `router.push` / 菜单项指向它，连「标签与印象」「独特身份」这两句页面专属文案在 `src/` 里都只出现在它自己文件内 |
   | 功能重叠 | 主体「他人印象」列表 + 删除 = 印象**三份平行实现**里的一份（见 §3.9），能力最弱：无词云、无写印象、无 tier、无分页增量 |
   | 半成品段 | 「个人标签」段是 `v-if="userTags.length > 0"`，注释自写 `Optional/Future`；且 `userTags` 只在 `:98` 取一次 `userInfo.value?.tags` 的**快照**，不随 store 更新 |
   | 现状定性 | **孤儿页面** —— 路由活着，但没有任何真实用户路径能走到 |

   ⇒ 它既不是入口、又不承载独有能力，留着只会让「印象到底有几个入口」继续模糊，
   而入口收敛正是本次 IA 的目标。且项目已有 redirect 先例
   （`/user-center/tags-impressions` → `/user-space/tags-impressions`，`router/routes/user-space.ts:61-62`），
   再做一层 redirect 是同一套做法，成本极低。

   **连带清理清单**（收掉时一并处理）：
   - 删 `src/views/user-center/TagsImpressions.vue`（476 行）
   - 删 `src/styles/themes/user-center-dark.css` 里 ~16 处 `.tags-impressions-page` 规则（**可顺带下调暗色 token 棘轮计数**）
   - 删 `src/utils/theme-manager.js:101` 的 `.tags-impressions-page` 引用
   - 改 `src/data/ai-site-guide.js:15` 与 `:38` 两条印象路径（路径本身没错，是**落点会变**，见 §3.9）
   - 保留 `router/routes/user-space.ts:160-162` 一条 redirect 条目（不做 404）

   ⚠️ **需单独决策**：「个人标签」（`profiles.tags`）随之失去唯一展示位。
   实测 `views/` 与 `components/` 里**没有任何 `.tags` 展示点**（`WordCloud` 只用在
   `Profile/ProfileMain.vue:885`，那里渲染的是**印象词云**，与个人标签无关）⇒ 它本来就已经无处可见。
   要么彻底放弃，要么并进「我」页资料卡（作为身份信息的一部分）。

2. ~~**「我」页印象 tab 用哪套渲染**~~ → **已决（2026-09-30 22:49）**：
   用 `ProfileImpressionsPanel.vue` 的**液态玻璃卡片墙**，**删掉印象词云**；
   并顺带把 `ProfileMain` 的印象卡也统一成液态玻璃风格（见 §4.7）。
   原「让「我」页复用 ProfileMain 印象区（含词云）」的选项**作废**，勿再引用。

---

## 6. 迁移与兼容

**URL 形态变化（旧 → 新）**

> ⚠️ **2026-09-30 更正**：分段参数的**真源是 `?view=`，不是 `?section=`**
> （`UserSpaceMain.vue` 的 `SECTION_REFS` / `setSectionRoute()` / `resolveSectionFromRoute()` 一律用 `view`）。
> 下表已按真源更正。

| 旧 | 新 | 说明 |
| --- | --- | --- |
| `?tab=assets` | `?tab=posts&view=assets` | 资产由**独立 tab** 降为「我」页**分段** |
| `?tab=settings` | `?tab=posts`（并打开设置面板） | 设置不再是底栏席（`?tab=settings` 仍作内部面板可达） |
| `?tab=community&view=impressions` | `?tab=posts&view=impressions` | 印象由论坛分区改为「我」页分段 |
| `?tab=messages&view=ai` | `/ai-chat` | AI 段取消，改走全屏路由 |

- `LEGACY_TAB_MAP` 现为 `{ profile: 'posts', ai: 'messages', shows: 'posts' }`（`UserSpaceMain.vue:628`）。
  本轮再叠加 `assets / settings → 我` 会变多对一 ⇒ 照项目棘轮门禁思路，建议加一条
  「遗留映射条目数只减不增」的检查（与 `check:layering` / `check:important-budget` 同规矩）。
- 旧链接（`?tab=assets`、`?tab=settings`、`?view=impressions`、`?view=news`、`?view=activity`）
  需落到新位置，不能 404 或白屏。
- `ai → messages` 这条旧映射要重新评估：AI 已独立成席走 `/ai-chat`，旧映射会把用户送到消息 tab。
- 首页底栏与横屏左栏共用同一份配置 ⇒ 一并验证（`probe-home-forum-rail` / `probe-rail-landing`）。

---

## 6.5 实施进度（2026-09-30 23:00 起）

> 本方案于 2026-09-30 22:55 开工，分 7 个任务推进。**已完成 4 个**，均跑过 `npm run verify`。

| # | 任务 | 状态 | 落地内容 |
| --- | --- | --- | --- |
| 1 | 删印象词云 + 印象卡统一液态玻璃 | ✅ 完成 | 删 `ProfileMain.vue` 词云（模板 `:880-886` / import / `wordCloudData` / `segmentText` / `stopWords`）+ `style.scoped.css` 13 处 `.word-cloud-*` + 组件 `src/components/WordCloud.vue`（262 行）；删除被层叠覆盖的 2 组旧 `.impression-card-profile` 规则（其中 `:hover { background:#fff }` 会盖掉玻璃底，是实际生效的 bug）。棘轮下调 1319→1316 |
| 2 | 收掉 `/user-space/tags-impressions` | ✅ 完成 | 路由改 redirect（`/user-center/tags-impressions` 与 `/user-space/tags-impressions` 两条都走新增的 `redirectToUserSpaceImpressions`）；删 `TagsImpressions.vue`（476 行）；`user-center-dark.css` 16 处 `.tags-impressions-page` 清零；`theme-manager.js` 容器移除；`ai-site-guide.js` 印象路径改指 `?tab=community&view=impressions` |
| 4 | 底栏 5 席 → 4 席 | ✅ 完成 | `bottom-nav.ts` 改为 **内容 / 消息 / AI / 我**；新增 `fullPage` 字段（AI 席 `fullPage:true`，点它 `router.push('/ai-chat')` 不参与 tab 切换）；`USERSPACE_TAB_TO_BOTTOM_NAV_ID` 改为多对一（`assets`/`settings` → `posts`）；`useUserSpaceTabs.js` 的 `activeNavIndex` 与 `UserSpaceMain` 的 `:current-tab` 都改走映射（否则 `findIndex` 得 -1 会错误高亮第一席）；`handleBottomNavClick` 加 `fullPage` 分流；`Home/index.vue` 注释「五席」→「四席」 |
| 6 | 设置入口齿轮 → 文字「设置」 | ✅ 完成 | `ProfileHomePanel.vue:22-42` 的齿轮 SVG 换为文字；`.profile-settings-btn` 由 40×40 圆形改文字胶囊（`min-height:32px` / `padding:0 14px` / `border-radius:999px` / `font-size:13px`）；移除已无用的 `.profile-settings-btn svg` 规则 |
| 5 | 「我」页三段 tab + 印象数据层搬迁 | ✅ 完成（2026-10-01） | **已完成**：消息 tab 去掉 AI 段（模板删 `SegmentTabs` + `ai-host`；脚本删 `MESSAGE_SECTION_ITEMS` / `bohaiActivatedOnVisit` + 两个 watch / `setMessagesSection` / 预载 watch；清 `AsyncBOHAI`、`preloadBOHAIComponent` import）。**已补齐（2026-10-01）**：`[空间｜资产｜印象]` 三段 tab 全部落地 —— 资产块从独立 tab-page 搬进 posts tab（闩锁改用 `assetsSegmentVisited`），印象数据层从 `ForumSectionShell.vue` 抽到 `composables/useProfileImpressions.js` + `ProfileImpressionsSection.vue`，论坛侧 `impressions` 席与 `FORUM_SECTION_ITEMS` 条目一并移除。⚠️ 剩余遗留死 CSS：`.ai-host` / `.ai-workspace` 在 `shell-community.css`（~7 处）与 `landscape-rail.css`（2 处）待清理（`.content-cloud-host` 已随本次改名清掉） |
| 3 | 论坛分区 7 席 → 4 档 | ⬜ 待做 | `forum-sections.ts` 收敛 + news/activity 降为 chips |
| 7 | 探针更新 + 全量自证 | ⬜ 待做 | `probe-user-space-ia.mjs` 13 条存量 FAIL 必须一并更新 |

**门禁结论（2026-09-30 23:38）**：`npm run verify` **EXIT=0**；lint **188** 条 warning
（棘轮已从 189 下调到 188）；三项棘轮全部持平在下调后的值：
`important-budget 1315/1315`（原 1319）、`dark-tokens 2885/2885`（原 2902）、`layering 168/168`。
测试 146 文件全过（2274 passed / 1 skipped）。

**⚠️ 任务 2 的 redirect 目标是临时的**：当前指向论坛「印象」分区（`?tab=community&view=impressions`），
因为「我」页的印象分段（任务 5）尚未落地。任务 5 完成后应改为 `?tab=posts&section=impressions`。

**⚠️ 任务 4 已完成但任务 5 未做，中间态影响**：`assets` / `settings` 已从底栏撤下，
但尚未成为「我」页分段。当前：
- 设置：仍可从资料卡右上角「设置」进入（`openProfileSettings` → `jumpWithSection('settings','home')`）✅
- 资产：底栏入口已无，仅剩页内入口（`openAssetsHub` / `openSponsorPage`）与直链 `?tab=assets` ⚠️

**过程记录（值得留档）**：
- 又一次踩到 **bash `grep "a\|b"` 在本环境恒返回 0 匹配**（BRE 交替不生效）：查 `BOTTOM_NAV_ITEMS` 消费方时假阴性，改用 Grep 工具才查到。已写入 `.workbuddy-ai/memory/MEMORY.md`。
- `check:important-budget --update` 曾出现一次读数不一致（报 1319 / 66 文件，实时读数却是 1316），重跑后恢复正常（1316 / 65 文件）。**结论：棘轮 --update 后要复核一次实时读数**。
- `tests/unit/bohai-quick-sidebar.test.js` 在整链 verify 中偶发 1 例失败（BOHAI 模块，与本轮改动无关：该测试只读 `BohaiSidebar.vue` / `BOHAIMain.vue`）。单跑通过、整测试集重跑也通过 ⇒ **判定为并发抖动**，非本轮引入。

---

## 7. 自证计划（判据可复跑）

| 改了什么 | 命令 |
| --- | --- |
| 通用门禁 | `npm run verify` |
| 首页 / 底栏 / 左栏 / 论坛入口布局 | `node scripts/probes/probe-home-forum-rail.mjs`（21 断言）、`node scripts/probes/probe-rail-landing.mjs`（45） |
| UserSpace IA | `node scripts/probes/probe-user-space-ia.mjs`（⚠️ 已知 13 条存量 FAIL：探针仍断言旧底栏五席与社区六档，属「探针文档过期」，改 IA 时**必须一并更新这份探针**，否则新旧漂移混在一起无法判红） |
| AI 面板 | `npm run probe:ai-panels` |
| 暗色 token | 已在 verify 链内 `check:dark-tokens:strict` |
| UI 层直连数据层 | 已在 verify 链内 `check:layering` |

---

## 8. 关联文档

- `AGENTS.md` §2「改动 → 必跑门禁」、§3 硬规则
- `plans/020-site-global-search.md`（全局搜索面，IA 收席后需同步）
- `docs/PROBES.md`（探针登记表）
- `.workbuddy-ai/memory/2026-09-29.md`（首轮 IA 讨论全文 + 入口冗余审计）
