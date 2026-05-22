# 方块之家 (BOH) 项目维护与 AI 修改指南

> **最后更新日期**: 2026-04-11
> **适用版本**: BOH Beta 2.5.4
> **审计修复批次**: 2026-03-24 (7项中危问题已修复)

本文档旨在为开发人员和 AI 助手提供项目的全景视图、架构细节及修改规范。请在进行任何代码变更前仔细阅读本指南。

***

## 0. 项目整理与改造记录

本轮整理目标是“收敛目录职责，降低维护成本，避免路径混乱”。

### 0.1 已完成的结构收敛

- 样式目录统一：`src/assets/styles/` 已并入 `src/styles/`，入口与组件引用已同步更新。
- 静态资源边界统一：
  - `src/assets/` 存放业务图片与字体（由 Vite 处理）。
  - `public/` 仅保留直出文件（如 `favicon.png`、`CNAME`、`.nojekyll`、`mcdmsc.js`）。
- 数据库目录统一：
  - 可执行迁移统一放在 `supabase/migrations/`。
  - 结构文档与快照统一放在 `docs/database/schema/`。

### 0.2 当前推荐目录职责（根目录）

```text
.
├── src/                    # 前端应用源码
│   ├── assets/             # 业务资源（图片/字体）
│   └── styles/             # 全局样式库（common/components/helpers/layouts/pages/vendor）
├── public/                 # 直出静态文件（不经打包哈希）
├── supabase/
│   └── migrations/         # 可执行 SQL 迁移脚本
├── docs/
│   └── database/
│       ├── README.md       # 数据库目录规范
│       └── schema/         # 结构快照与按表 SQL（文档用途）
├── scripts/                # 工程脚本
├── tsconfig.json           # TS 项目入口（references）
├── tsconfig.app.json       # TS 应用配置（vue-tsc 使用）
└── tests/                  # 测试
```

### 0.3 数据库文件放置规则（强约束）

- 需要执行到数据库的变更：放 `supabase/migrations/`。
- 用于查阅/比对的表结构：放 `docs/database/schema/`。
- 禁止在根目录新增零散 `*.sql`。

### 0.4 MBTI 页面优化记录（2026-03-28）

本次改造目标是“修复测评结果正确性 + 提升答题完成率 + 降低维护成本”。

- **核心修复（正确性）**
  - 修复 MBTI 第四维 `J/P` 类型判定方向错误（历史问题：`J>=P` 时输出为 `P`）。
  - 评分逻辑已抽离为独立工具函数，避免页面内重复实现导致偏差。

- **结构优化（可维护性）**
  - 新增 `src/data/mbti-data.js`，集中管理 MBTI 题库和 16 型映射描述。
  - 新增 `src/utils/mbti-scoring.js`，集中管理评分、类型推导、维度条数据构建、未答题定位。
  - `src/views/MBTI/index.vue`（入口壳 `src/views/MBTI.vue`）从“大型单文件”重构为“页面 + 数据层 + 逻辑层”协作模式。

- **交互与体验优化**
  - 新增“本页必须答完才能下一页”的拦截与提示，减少无效跳页。
  - 新增总进度文案：`已完成 x / 48 题`。
  - 原生 `alert` 全部替换为统一弹窗 `CommonAlertModal`，风格与站点一致。
  - 分享逻辑增加异常处理：支持系统分享失败回退、剪贴板复制回退。
  - 新增答题进度持久化（`localStorage`：`boh_mbti_progress_v1`），支持刷新后恢复。

- **可访问性与移动端优化**
  - 增加 `focus-visible` 焦点样式，提升键盘可用性。
  - 提升移动端 Likert 最小点击尺寸与标签可读性。
  - 新增 `prefers-reduced-motion` 支持，降低动画引发的不适风险。

- **测试与验证**
  - 新增单测：`tests/unit/mbti-scoring.test.js`。
  - 覆盖点：空分数字典、反向计分、`J/P` 极性回归、维度百分比、未答题定位。
  - 本地验证：`npm run test` 通过；`npm run build` 通过（保留项目既有 warning，不由本次改动引入）。

### 0.5 Home 页面优化记录（2026-03-28）

本次针对 `src/views/Home/index.vue`（入口壳 `src/views/Home.vue`）的优化目标是“减少隐藏模块的无效执行、修复稳定性隐患、清理历史冗余”。

- **执行与性能优化**
  - 将多个 `v-if="false"` 区块改为显式特性开关（`showNewYearHero`、`showBottomCardsSection`、`showCommunityPartnersSection`），避免后续维护时误触发隐性逻辑。
  - 倒计时初始化改为“仅在新年模块开关开启时执行”，不再默认创建无效定时器。
  - 首页新闻 `topThreeNews` 的切片加载改为“仅在底部卡片模块开启时执行”。

- **稳定性修复**
  - 修复弹窗滚动锁残留风险：在页面卸载阶段统一恢复 `document.body.style.overflow`，避免路由切换后页面无法滚动。
  - 论坛帖子拉取增强容错：
    - 显式处理 `getPosts` 返回的 `error` 分支。
    - 对返回数据增加 `Array.isArray` 保护。
    - `id` 增加 fallback（防止空值导致 `.toString()` 异常）。
    - 异常时重置帖子列表与轮播索引，避免状态污染。

- **安全与维护性优化**
  - 外链 `target="_blank"` 补齐 `rel="noopener noreferrer"`。
  - 清理未使用 import、状态、方法和模板挂载点，降低单文件复杂度与心智负担。

- **验证结果**
  - `npx eslint src/views/Home/index.vue`：通过。
  - `npm run build`：通过（保留项目既有 warning，不由本次 Home 逻辑改动引入）。

### 0.6 TypeScript 基线接入记录（2026-03-28）

本次改造目标是“在不阻塞现有 JS 业务开发的前提下，接入可执行的 TS 类型检查链路”。

- **新增配置文件**
  - 根目录新增 `tsconfig.json`（项目引用入口）。
  - 根目录新增 `tsconfig.app.json`（应用侧编译选项，`strict: true`，`allowJs: true`，`checkJs: false`）。
  - 新增 `src/env.d.ts`（`vite/client` 类型声明）。
- **脚本链路更新**
  - 新增 `npm run type-check`：`vue-tsc --noEmit -p tsconfig.app.json`。
  - `npm run build` 已调整为先执行 `type-check` 再构建。
  - `npm run build:ci` 已同步接入 `type-check`，避免 CI 漏检类型问题。
- **兼容策略**
  - 采用“渐进式接入”：保留现有 `.js` 文件可运行，后续按模块逐步迁移到 `.ts` / `lang="ts"`。
  - 已对 TS6 行为做兼容（移除弃用的 `baseUrl` 写法，路径别名使用相对路径映射）。
- **验证结果**
  - `npm run type-check`：通过。
  - `npm run build`：通过（保留项目既有 warning，不由本次 TS 接入引入）。

### 0.7 页面/组件拆分规范与二轮拆分记录（2026-04-06）

本轮改造目标是“统一拆分规则、降低单文件复杂度、保证拆分后可持续维护”。

- **统一拆分规则（对新增或重构页面强约束）**
  - 采用“**同名入口 + 同名目录**”模式：
    - 页面入口壳文件：`src/views/XXX.vue`
    - 页面实现目录：`src/views/XXX/index.vue`
  - 在已拆分页面中，入口壳文件仅做转发，不承载业务逻辑（模板渲染 `XXXPage` + 导入 `./XXX/index.vue`）。
  - 同一组件/页面相关文件必须放在同一目录下（如 `index.vue`、`style.scoped.css`、`config.js`、局部 helpers）。
  - 仅跨页面复用的逻辑允许上提至 `src/utils/` 或 `src/composables/`。
  - 页面样式优先使用 `<style scoped src="./style.scoped.css"></style>`，避免样式与逻辑耦合膨胀。

- **二轮拆分已落地项**
  - `Profile`：平台账号映射逻辑提取到 `src/views/Profile/creatorPlatforms.js`。
  - `BOHTreehole`：常量与配置提取到 `src/views/user-center/BOHTreehole/config.js`。
  - `Forum` + `Messages`：审核重试缓存能力沉淀到 `src/utils/moderation-retry-cache.js`。
  - `DataManagement`：配置模块化（`src/views/DataManagement/config.js`）并完成引用补齐。

- **拆分后验收命令（必须执行）**
  - `npm run lint`
  - `npx eslint . --max-warnings=0`
  - `npm run build`
  - `npm test`

- **本轮验收结果（2026-04-06）**
  - 全部通过：lint / 严格 lint / type-check + build / vitest。
  - 已执行结构检查：`wrapper -> index.vue` 映射、`<style src>` 路径、相对导入路径均有效。
  - 当前仍有少量历史页面未完成目录化（如 `Activities.vue`、`Join.vue`、`Tutorial.vue`），后续按迭代逐步收敛。

### 0.8 论坛/私信/管理员审核链路统一修复记录（2026-04-11）

本轮改造目标是“统一 AI 审查模型、统一数据库状态、去除待审核态、降低误判并修复管理后台可操作性”。

- **模型与调用策略统一**
  - 审查模型统一为 `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`（DeepSeek 8B）。
  - 论坛发帖/评论改为**单次 AI 调用**（提交前审查），移除重复调用与异步二次复审链路。
  - 私信发送改为 `failClosed` 策略：审查服务异常/解析失败/缺 key 时拒绝发送，不再默认放行。

- **状态统一（无待审核态）**
  - 审核状态统一为两态：`approved` / `rejected`。
  - 前端展示与筛选逻辑同步移除 `PASS/NEEDS_REVIEW/PENDING/REVIEW` 等旧状态分支。
  - 收件箱可见性统一为“仅 `approved` 可见”。

- **管理员数据管理面板修复**
  - `reviewMessages` 从“待审私信”调整为“私信审核”。
  - 私信审核页支持按记录状态执行操作：
    - `approved`：可拒绝、可删除；
    - `rejected`：可恢复为通过、可删除。
  - 私信审核数据源改为读取 `moderation_status in ('approved','rejected')`，与数据库约束一致。

- **数据库迁移**
  - 新增迁移：`supabase/migrations/20260411_moderation_status_unification.sql`
  - 迁移内容：
    - 历史私信审核状态归一到 `approved/rejected`；
    - `messages.moderation_status` 默认值改为 `approved`，并固化 check 约束；
    - 新增索引 `idx_messages_receiver_unread_approved`；
    - 修复 `admin_apply_moderation_action` 对私信状态大小写处理问题。

- **文档同步**
  - 已同步更新：
    - `docs/database/schema/tables/messages.sql`
    - `docs/database/schema/full_schema_snapshot.sql`

- **验收结果（2026-04-11）**
  - `npm run type-check`：通过
  - `npm test`：通过（25/25）
  - `npm run lint`：存在项目历史问题（非本轮引入）：
    - `src/data/mcti-data.js` 有未闭合字符串；
    - 少量既有 unused warning。

***

## 1. 项目全景架构

### 1.1 技术栈概览

- **核心框架**: Vue 3 (Composition API)
- **构建工具**: Vite 7.x
- **类型系统**: TypeScript 6.0.2 + vue-tsc 3.2.6（渐进式接入，兼容现有 JS）
- **路由管理**: Vue Router 4 (Hash 模式)
- **状态管理**: Pinia 3.0.4 + pinia-plugin-persistedstate
- **后端服务**: Supabase (认证、数据库、实时通知)
- **样式方案**: CSS/SCSS + Tailwind CSS 4.2.0
- **数据源**: Supabase PostgreSQL + 本地静态 JSON/JS 文件 (Mock Data 驱动)
- **核心依赖**:
  - @supabase/supabase-js (后端服务)
  - @emailjs/browser (邮件服务)
  - lucide-vue-next (图标库)
  - marked (Markdown 渲染)
  - highlight.js (代码高亮)
  - html2canvas (截图功能)
  - canvas-confetti (特效)
  - @vueuse/core, @vueuse/motion (Vue 工具库)
  - pinia (状态管理)
  - pinia-plugin-persistedstate (状态持久化)

### 1.2 目录结构树

```text
src/
├── assets/                 # 业务资源
│   ├── images/             # 图片资源（含 developer/）
│   └── fonts/              # 字体资源
├── styles/                 # 全局样式库（common/components/helpers/layouts/pages/vendor）
├── components/             # 公共 UI 组件
│   ├── UnifiedNavbar.vue   # 入口壳（转发到 ./UnifiedNavbar/index.vue）
│   ├── UnifiedNavbar/      # 同组件目录（index.vue + style.scoped.css）
│   ├── Footer.vue          # [核心] 全局页脚
│   ├── UserCenterNav.vue   # 用户中心导航
│   ├── NotificationBell.vue # 通知铃铛
│   └── ...                 # AvatarCropModal/WordCloud/弹窗等
├── composables/            # 组合式逻辑
│   ├── useNews.js
│   ├── useActivities.js
│   └── useNotifications.js
├── data/                   # 本地业务数据
│   ├── products.js
│   ├── news.js
│   ├── activities.js
│   ├── home.js
│   ├── downloads.js
│   ├── ai-memory.js
│   └── minecraft-commands.js
├── libs/                   # TS 工具（特效相关）
│   ├── shader-utils.ts
│   └── utils.ts
├── router/
│   └── index.js            # 路由与守卫
├── stores/                 # Pinia 状态管理
│   ├── auth.js
│   ├── notifications.js
│   ├── bag.js
│   └── products.js
├── utils/                  # 工具层与后端 API 封装
│   ├── api/                # 分层 API：auth/forum/profile/notifications/pushplus
│   ├── auth.js             # [核心] 认证与业务 API 门面
│   ├── supabase-client.js  # Supabase Client
│   ├── asset-helper.js     # 动态资源解析
│   └── ...                 # logger/xp/time/monitoring 等工具
├── views/                  # 页面级视图
│   ├── Home.vue            # 入口壳（转发到 ./Home/index.vue）
│   ├── Home/               # 页面目录（index.vue + style 文件）
│   ├── Forum.vue           # 入口壳（转发到 ./Forum/index.vue）
│   ├── Forum/              # 页面目录（index.vue + style.scoped.css）
│   ├── Profile.vue         # 入口壳（转发到 ./Profile/index.vue）
│   ├── Profile/            # 页面目录（含 creatorPlatforms.js）
│   ├── BOHAI/              # AI 功能页（BOHAI.vue + BOHAI/index.vue + composables）
│   ├── activities/         # 活动子页面（list/photo-wall）
│   ├── user-center/        # 用户中心子页面（含 BOHTreehole/Messages 等拆分目录）
│   └── ...                 # 其余页面按同样模式组织
├── App.vue                 # 根组件
├── env.d.ts                # Vite 类型声明
├── main.js                 # 应用入口
└── style.css               # 入口基础样式
```

***

## 2. 核心模块深度解析

### 2.1 数据层 (Data Layer) - `src/data/`

本项目采用混合数据源策略：

- **Supabase 数据库**: 用户认证、用户资料 (profiles)、论坛帖子、评论、点赞、通知、用户印象等实时数据
- **本地** **`.js`** **文件**: 商品、新闻、活动等相对静态的数据

**主要数据文件**:

- **`products.js`**: 定义商城商品。修改价格、图片或描述在此进行。
- **`news.js`**: 定义新闻列表。
- **`activities.js`**: 定义活动数据。
- **`downloads.js`**: 定义下载资源。
- **`home.js`**: 首页内容数据。
- **`ai-memory.js`**: AI 聊天记忆数据。

### 2.2 认证与状态层 (Auth & State)

#### `src/utils/auth.js`

- **职责**: Supabase 认证封装、数据库 API 封装
- **关键功能**:

* 注册/登录 (支持 Email/Username、OAuth)
* 论坛功能 (帖子、评论、点赞)
* 通知系统
* 用户印象功能
* 用户资料管理

#### `src/stores/auth.js` (Pinia Store)

- **职责**: 用户认证状态管理，集成 Supabase 认证状态同步，支持状态持久化
- **关键 State**:

* `isLoggedIn` (Ref<Boolean>) - 登录状态
* `userInfo` (Reactive<Object>) - 用户信息对象
* `showLoginModal` (Ref<Boolean>) - 登录弹窗控制

- **userInfo 字段**: `id`, `username`, `email`, `role`, `points`, `joinDate`, `tags`, `birthMonth`, `birthDay`, `avatarUrl`, `bio`, `experience`
- **关键 Actions**:

* `login()` - 用户登录
* `logout()` - 用户登出 (自动调用 resetState)
* `resetState()` - 重置所有状态
* `updateLocalState()` - 从 Supabase 同步用户信息
* `updateUserProfile(updates)` - 统一更新用户资料
* `initLoginState()` - 初始化登录状态

- **持久化配置**: 使用 `pinia-plugin-persistedstate`，自动持久化 `isLoggedIn` 和 `userInfo` 到 localStorage
- **使用方式**:

```javascript
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const { updateUserProfile, logout } = authStore;
```

#### `src/stores/notifications.js` (Pinia Store)

- **职责**: 通知状态管理，实时订阅，未读计数
- **关键 State**:

* `unreadCount` (Ref<Number>) - 未读通知数量 (唯一数据源)
* `notifications` (Ref<Array>) - 通知列表
* `currentUserId` (Ref<String>) - 当前用户 ID
* `notificationSubscription` (Ref) - 实时订阅对象

- **关键 Actions**:

* `startNotificationListener(userId)` - 启动实时订阅
* `stopNotificationListener()` - 停止订阅
* `resetState()` - 重置状态并停止订阅
* `fetchUnreadCount()` - 获取未读计数

#### `src/stores/bag.js` (Pinia Store)

- **职责**: 购物袋状态管理
- **关键 State**: `shoppingBag`, `productsData`
- **关键 Actions**: `loadShoppingBag()`, `addToBag()`, `removeFromBag()`

#### `src/main.js`

- **职责**: Pinia 初始化，持久化插件配置，认证状态初始化
- **关键代码**:

```javascript
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { useAuthStore } from './stores/auth';
import { useBagStore } from './stores/bag';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);  // 配置持久化插件
app.use(pinia);

const authStore = useAuthStore();
const bagStore = useBagStore();
authStore.initLoginState();
bagStore.loadShoppingBag();
```

### 2.3 Supabase 集成说明

项目已完全集成 Supabase 作为后端服务：

- **认证**: Supabase Auth (Email/Password、OAuth)
- **数据库**: Supabase PostgreSQL (profiles, posts, comments, likes, notifications, user\_impressions, messages, user\_gifts, activities, news 等表)
- **实时功能**: 实时通知订阅
- **环境变量**: 需要配置 `.env` 文件中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

### 2.4 构建配置 (Build Config) - `vite.config.js`

- **Base URL**: `./` (支持相对路径部署，适应 GitHub Pages 或本地文件系统)
- **插件**:
  - `@vitejs/plugin-vue`
  - `vite-plugin-imagemin`（构建期图片压缩）
- **分包策略**:
  - 手动将 `vue` 全家桶打包为 `vue-vendor`
  - 组件库打包为 `ui-components`
- **优化配置**:
  - Terser 压缩 (生产环境移除 console)
  - CSS 代码分割启用 (`cssCodeSplit: true`)
  - 图片资源自动优化

***

## 3. 功能模块

### 3.1 论坛系统 (`src/views/Forum/index.vue`, `src/views/PostDetail/index.vue`)

- **功能**: 发帖、评论、点赞、删除帖子/评论
- **数据存储**: Supabase (posts, comments, likes 表)
- **权限控制**: 作者或管理员可删除/编辑

### 3.2 AI 聊天系统 (`src/views/BOHAI/`)

- **功能**: AI 对话、Markdown 渲染、打字机效果
- **页面结构**: `src/views/BOHAI/BOHAI.vue`（入口壳）+ `src/views/BOHAI/BOHAI/index.vue`（实现）
- **Composables**: `useChatEngine`

### 3.3 通知系统 (`src/stores/notifications.js`, `src/utils/auth.js`)

- **功能**: 实时通知、未读计数、标记已读
- **数据存储**: Supabase (notifications 表)
- **实时订阅**: Supabase Realtime
- **状态管理**: 统一由 `notificationsStore` 管理，`unreadCount` 为唯一数据源

### 3.4 用户印象系统 (`src/views/user-center/TagsImpressions.vue`)

- **功能**: 添加用户印象、查看他人对自己的印象
- **数据存储**: Supabase (user\_impressions 表)

### 3.5 个人主页 (`src/views/Profile/index.vue`)

- **功能**: 查看用户资料、用户发帖、用户评论
- **路由**: `/profile/:username`
- **状态管理**: 使用 `storeToRefs` 从 `authStore` 获取用户信息

### 3.6 用户中心 (`src/views/user-center/`)

- **功能**: 用户空间、树洞、地址、订阅、消息、创作者工作台、标签印象等
- **状态管理**: 统一使用 `authStore` 管理用户状态，通过 `updateUserProfile` 更新资料

***

## 4. 状态管理架构

### 4.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     应用状态架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐               │
│  │  Pinia Stores   │    │   Composables   │               │
│  │  (全局状态)      │    │   (局部状态)     │               │
│  ├─────────────────┤    ├─────────────────┤               │
│  │ - auth          │    │ - useActivities │               │
│  │ - notifications │    │ - useNews       │               │
│  │ - products      │    │ - useChatEngine │               │
│  │ - bag           │    │                 │               │
│  └────────┬────────┘    └────────┬────────┘               │
│           │                      │                         │
│           ▼                      ▼                         │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Vue Components                      │       │
│  │  (storeToRefs 获取响应式状态)                      │       │
│  └─────────────────────────────────────────────────┘       │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────┐       │
│  │    pinia-plugin-persistedstate + Supabase       │       │
│  │         (持久化存储 + 实时同步)                    │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 状态管理最佳实践

1. **使用 storeToRefs 解构响应式引用**
   ```javascript
   const { isLoggedIn, userInfo } = storeToRefs(authStore);
   ```
2. **直接解构 Actions**
   ```javascript
   const { updateUserProfile, logout } = authStore;
   ```
3. **统一更新入口**
   - 用户资料更新应通过 `authStore.updateUserProfile()` 统一处理
   - 避免在组件中直接操作数据库
4. **状态重置**
   - 登出时调用 `resetState()` 清理所有状态
   - 停止实时订阅，避免内存泄漏

***

## 5. 已知风险与约束

1. **🟡 数据持久化 (中)**
   - **混合存储**: 用户资料、论坛数据等实时数据存储在 Supabase，商品、新闻等静态数据存储在本地 `.js` 文件
   - **购物车**: 购物袋数据仅保存在 `localStorage` 中
   - **状态持久化**: 用户登录状态和基本信息通过 `pinia-plugin-persistedstate` 自动持久化
2. **🟡 样式系统 (中)**
   - **混合方案**: 传统 CSS/SCSS + Tailwind CSS 4.2.0 共存
   - **复杂依赖**: `main.js` 引入了大量 CSS 文件，修改全局样式时需小心 CSS 权重冲突
3. **🟢 环境变量 (低)**
   - **Supabase 配置**: 需要正确配置 `.env` 文件中的 Supabase URL 和 Anon Key

### 5.1 全局代码审计结果 (2026-03-24)

本次审计发现以下主要问题：

#### 🔴 高危问题 (需立即修复)

| 问题 | 位置 | 风险 | 修复建议 | 状态 |
|------|------|------|----------|------|
| **API Key 硬编码** | `useChatEngine.js:L7-9` | 密钥泄露风险 | 使用环境变量，立即轮换密钥 | ⏳ 待修复 |
| **RLS 策略缺失** | 数据库表 | 数据越权访问 | 为所有表启用 RLS 策略 | ⏳ 待修复 |
| **权限检查在客户端** | `forum-api.js` | 权限绕过 | 服务端验证用户角色 | ⏳ 待修复 |
| **XSS 风险** | `Forum.vue:L181` | 脚本注入 | 使用 DOMPurify 净化内容 | ✅ 已修复 |
| **经验值竞态条件** | `xp.js:L42-72` | 数据丢失 | 使用数据库原子操作 | ✅ 已修复 |

#### 🟠 中危问题

| 问题 | 位置 | 风险 | 修复建议 | 状态 |
|------|------|------|----------|------|
| **toastTimer 内存泄漏** | `notifications.js:L16` | 内存泄漏 | 使用 ref 并在 resetState 中清理 | ✅ 已修复 |
| **resetState 不完整** | `bag.js`, `products.js` | 状态残留 | 添加完整的状态重置机制 | ✅ 已修复 |
| **N+1 查询** | `forum-api.js:L48-63` | 性能问题 | 使用嵌套查询优化 | ✅ 已修复 |
| **重复订阅** | `Messages.vue:L665` | 资源浪费 | 统一使用 store 管理订阅 | ✅ 已修复 |
| **空值访问** | 多处 `charAt(0)` | 运行时错误 | 添加空值检查 `?.` | ✅ 已修复 |

#### 🟡 低危问题

- 未使用的函数和 CSS 类
- 代码注释与逻辑不符
- TypeScript 已接入但类型覆盖仍可继续提升（大量业务文件仍为 JS）
- 部分页面仍较大（如 `DataManagement/index.vue` 2200+、`BOHTreehole/index.vue` 1600+、`Profile/index.vue` 1500+）

### 5.2 性能优化建议

1. **避免 computed 中使用 Math.random()** - 破坏响应式缓存
2. **预计算随机样式** - ActivitiesPhotoWall.vue 中缓存样式
3. **清理定时器和事件监听** - 在 onUnmounted 中清理
4. **虚拟滚动** - 大型列表使用 vue-virtual-scroller
5. **防抖优化** - 使用 lodash-es/throttle 替代 setTimeout

### 5.3 代码规范建议

1. **统一使用 storeToRefs** - 避免直接解构 reactive 对象
2. **提取可复用 composables** - 减少组件代码量
3. **添加 JSDoc 注释** - 提高代码可维护性
4. **统一错误处理** - 创建 withErrorHandling 包装器
5. **使用 logger 替代 console** - 统一日志管理
6. **遵循拆分目录规范** - 页面/组件按“同名入口壳 + 同名目录”组织，避免再次回到大型单文件
7. **同组件文件必须共址** - `index.vue`、`style.scoped.css`、`config.js`、局部 helper 不跨目录散落
8. **跨页面逻辑再上提** - 仅可复用逻辑放入 `src/utils/` 或 `src/composables/`

***

## 6. AI 修改指南 (Modification Guide)

为确保代码迭代的安全性和准确性，请严格遵循以下**分层修改顺序**：

### 第一优先级：数据定义变更

- **场景**: "新增一个名为 '钻石剑' 的商品" 或 "添加一条新闻"。
- **操作**: 直接修改 `src/data/products.js`、`src/data/news.js` 或对应数据文件。
- **注意**: 用户相关数据已迁移至 Supabase，如需操作用户数据请使用 `src/utils/auth.js` 中的 API。

### 第二优先级：核心逻辑与状态

- **场景**: "修改登录校验规则" 或 "改变购物车结算逻辑"。
- **操作**:
  1. 修改 `src/utils/auth.js` (业务逻辑)。
  2. 同步更新对应的 Pinia store (`src/stores/auth.js` 或 `src/stores/bag.js` 等)。
- **注意**:
  - 使用 `storeToRefs()` 来解构 Pinia store 的响应式引用
  - 用户资料更新应通过 `authStore.updateUserProfile()` 统一处理
  - 登出时应调用 `resetState()` 清理状态

### 第三优先级：组件与 UI

- **场景**: "导航栏增加 '社区' 链接" 或 "修改登录弹窗样式"。
- **操作**: 修改 `src/components/UnifiedNavbar.vue` 或对应组件。
- **注意**:
  - 涉及图片引用时，**必须**使用：
    ```javascript
    import { getImageUrl } from '@/utils/asset-helper';
    const imgSrc = getImageUrl('icon.png');
    ```
  - 用户信息应从 `authStore` 通过 `storeToRefs` 获取，避免本地复制

### 第四优先级：页面视图迭代

- **场景**: "重构用户中心" 或 "优化首页布局"。
- **操作**: 修改 `src/views/` 下的文件。
- **规范**:
  - 保持 Composition API 风格 (`<script setup>`)
  - 遵循“入口壳 + 页面目录”拆分模式：
    - `src/views/XXX.vue` 仅做转发
    - `src/views/XXX/index.vue` 承载页面逻辑
    - `src/views/XXX/style.scoped.css` 承载页面样式
  - 尽量复用 `src/styles/` 中的变量或使用 Tailwind CSS
  - 用户状态统一从 `authStore` 获取

### 第五优先级：Supabase 相关修改

- **场景**: "新增论坛功能" 或 "修改通知逻辑"。
- **操作**: 修改 `src/utils/auth.js` 中的相关 API 函数。
- **注意**: 确保 Supabase 表结构与代码逻辑匹配。

***

## 7. 常见问题排查 (Troubleshooting)

### Q1: 部署后图片显示 404

- **原因**: Vite 打包后文件名带有哈希，且目录结构变化。
- **解决**: 确保所有动态图片都使用了 `src/utils/asset-helper.js` 中的 `getImageUrl` 方法，且 `asset-helper.js` 中配置了 `import.meta.glob(..., { eager: true })`。

### Q2: 页面样式错乱或丢失

- **原因**: 页面拆分后 `style.scoped.css` 引用路径错误，或全局样式加载顺序/权重冲突。
- **解决**:
  - 检查页面是否使用了正确的 `<style scoped src="./style.scoped.css"></style>` 路径
  - 检查 `src/main.js` 的全局样式引入顺序
  - 在 DevTools 中确认冲突选择器并修正权重

### Q3: 修改了代码但浏览器未生效

- **原因**: 浏览器缓存或 Vite HMR 失效。
- **解决**: 尝试强制刷新 (Ctrl+F5)，或重启开发服务器 (`npm run dev`)。

### Q4: Supabase 相关功能不工作

- **原因**: 环境变量未配置或 Supabase 项目未正确设置。
- **解决**: 检查 `.env` 文件是否存在且包含正确的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`；检查 Supabase 项目的表结构和 RLS 策略。

### Q5: 登录后状态不同步

- **原因**: Supabase 会话状态与本地 Pinia store 状态不一致。
- **解决**:
  - 检查 `src/stores/auth.js` 中的 `initLoginState()` 和 `updateLocalState()` 函数是否正确调用
  - 确保在 `src/main.js` 中正确初始化了 Pinia 和持久化插件
  - 检查 localStorage 中 `boh_auth` 键的值

### Q6: 页面刷新后登录状态丢失

- **原因**: Pinia 状态未正确持久化。
- **解决**:
  - 确认 `pinia-plugin-persistedstate` 已在 `main.js` 中正确配置
  - 检查 `authStore` 的 `persist` 配置是否正确
  - 清除 localStorage 后重新登录测试

### Q7: 登出后状态未清理

- **原因**: `resetState()` 未被正确调用。
- **解决**:
  - 确保 `logout()` action 中调用了 `resetState()`
  - 检查 `notificationsStore.resetState()` 是否停止了实时订阅
  - 清除 localStorage 中的 `boh_auth` 键

### Q8: API Key 硬编码安全问题

- **原因**: AI 聊天组件中硬编码了 API Key。
- **解决**:
  - 立即将 API Key 移至 `.env` 文件
  - 使用 `import.meta.env.VITE_XXX_API_KEY` 读取
  - 在 `.env.example` 中添加示例配置
  - **立即轮换已泄露的密钥**

### Q9: 权限绕过风险

- **原因**: 论坛删除/编辑操作依赖客户端传入的 `userRole`。
- **解决**:
  - 在服务端查询用户角色进行验证
  - 使用 Supabase RLS 策略进行权限控制
  - 参考代码:
    ```javascript
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (post.author_id !== userId && userProfile?.role !== 'admin') {
      return { ok: false, error: '没有权限' };
    }
    ```

### Q10: 内存泄漏问题

- **原因**: 定时器和事件监听器未在组件卸载时清理。
- **解决**:
  - 使用 `onUnmounted` 清理所有定时器和监听器
  - 将 timer 引用保存到 ref 中
  - 示例:
    ```javascript
    const timer = ref(null);
    onUnmounted(() => {
      if (timer.value) clearTimeout(timer.value);
    });
    ```

### Q11: 响应式对象解构问题

- **原因**: 直接解构 `userInfo` 导致响应式丢失。
- **解决**:
  - 使用 `storeToRefs` 获取响应式引用
  - 示例:
    ```javascript
    import { storeToRefs } from 'pinia';
    const authStore = useAuthStore();
    const { userInfo } = storeToRefs(authStore);
    ```

***

## 8. 数据库表结构参考

项目使用 Supabase PostgreSQL 数据库，主要表结构如下：

| 表名                 | 用途   | 关键字段                                                                  |
| ------------------ | ---- | --------------------------------------------------------------------- |
| `profiles`         | 用户资料 | id, username, email, role, points, experience, bio, avatar\_url, tags |
| `posts`            | 论坛帖子 | id, content, author\_id, author\_username, status, created\_at        |
| `comments`         | 帖子评论 | id, post\_id, author\_id, content, parent\_id, status                 |
| `likes`            | 点赞记录 | id, post\_id, user\_id                                                |
| `notifications`    | 系统通知 | id, recipient\_id, sender\_id, type, status, created\_at              |
| `messages`         | 私信   | id, sender\_id, receiver\_id, subject, content, status                |
| `user_impressions` | 用户印象 | id, author\_id, target\_id, content, category                         |
| `user_gifts`       | 用户礼物 | id, user\_id, gift\_no, gift\_content, gift\_status                   |
| `activities`       | 活动   | id, title, date, image, description                                   |
| `news`             | 新闻   | id, category, title, excerpt, content, author, date                   |

**注意**: `addresses` 表已弃用，地址信息存储在 `profiles` 表的 `shipping_*` 字段中。

***

## 9. 组件库与第三方集成

### 9.1 核心第三方库（按职责）

- **后端与认证**
  - `@supabase/supabase-js`: 认证、数据库访问、Realtime
- **状态管理**
  - `pinia`
  - `pinia-plugin-persistedstate`
- **内容渲染与安全**
  - `marked`: Markdown 渲染
  - `highlight.js`: 代码高亮
  - `dompurify`: 富文本净化（XSS 防护）
- **交互与多媒体**
  - `@vueuse/core`, `@vueuse/motion`
  - `html2canvas`
  - `canvas-confetti`
  - `browser-image-compression`
  - `vue-advanced-cropper`
- **工程与构建**
  - `vite`
  - `@vitejs/plugin-vue`
  - `vite-plugin-imagemin`
  - `vue-tsc`
  - `eslint`
  - `vitest`

### 9.2 集成修改准则

1. 新增三方库前，优先评估是否可由现有依赖覆盖，避免重复能力与包体膨胀。
2. 涉及用户输入渲染时，必须同时考虑安全链路（例如 Markdown + DOMPurify）。
3. 影响构建链路的插件变更必须附带回归验证：`npm run lint`、`npm run build`、`npm test`。
4. 三方服务密钥统一通过 `.env` 注入，禁止硬编码到仓库。
