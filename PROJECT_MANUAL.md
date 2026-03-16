# 方块之家 (BOH) 项目维护与 AI 修改指南

> **最后更新日期**: 2026-03-16
> **适用版本**: BOH Beta 2.5.2

本文档旨在为开发人员和 AI 助手提供项目的全景视图、架构细节及修改规范。请在进行任何代码变更前仔细阅读本指南。

---

## 1. 项目全景架构

### 1.1 技术栈概览
*   **核心框架**: Vue 3 (Composition API)
*   **构建工具**: Vite 7.2.4
*   **路由管理**: Vue Router 4 (Hash 模式)
*   **状态管理**: Pinia 3.0.4
*   **后端服务**: Supabase (认证、数据库、实时通知)
*   **样式方案**: CSS/SCSS + Tailwind CSS 4.2.0
*   **数据源**: Supabase PostgreSQL + 本地静态 JSON/JS 文件 (Mock Data 驱动)
*   **新增依赖**: 
    - @supabase/supabase-js (后端服务)
    - @emailjs/browser (邮件服务)
    - lucide-vue-next (图标库)
    - marked (Markdown 渲染)
    - highlight.js (代码高亮)
    - html2canvas (截图功能)
    - canvas-confetti (特效)
    - @vueuse/core, @vueuse/motion (Vue 工具库)
    - pinia (状态管理)

### 1.2 目录结构树
```text
src/
├── assets/          # 静态资源库
│   ├── images/      # 图片 (注意：必须通过 asset-helper 引用)
│   │   └── developer/ # 开发者头像
│   ├── fonts/       # 字体文件
│   └── styles/      # 样式库 (global.css, variables.css 等)
│       ├── common/  # 公共样式
│       ├── components/ # 组件样式
│       ├── helpers/ # 辅助样式
│       ├── layouts/ # 布局样式
│       ├── pages/   # 页面样式
│       └── vendor/  # 第三方库样式
├── components/      # 公共 UI 组件
│   ├── UnifiedNavbar.vue  # [核心] 全局导航栏，含登录状态与菜单逻辑
│   ├── Footer.vue         # [核心] 全局页脚
│   ├── BlockCalendar.vue  # 方块日历
│   ├── CommonAlertModal.vue # 通用弹窗
│   ├── GiftSelectionModal.vue # 礼物选择弹窗
│   ├── MemberDetailModal.vue # 成员详情弹窗
│   └── UserCenterNav.vue  # 用户中心导航
├── composables/     # Vue Composables
│   └── useNews.js   # 新闻数据逻辑
├── data/            # [核心] 模拟数据库层 (所有业务数据源头)
│   ├── activities.js # 活动数据
│   ├── ai-memory.js # AI 记忆数据
│   ├── downloads.js  # 下载资源数据
│   ├── home.js       # 首页数据
│   ├── news.js       # 新闻列表
│   └── products.js   # 商城商品数据
├── router/
│   └── index.js     # 路由配置 (含 admin 权限拦截守卫)
├── stores/          # [Pinia] 全局状态管理
│   ├── auth.js      # 用户认证状态 (登录、用户信息、token 管理)
│   ├── bag.js       # 购物袋状态
│   └── products.js  # 商品状态
├── utils/           # 核心工具类
│   ├── asset-helper.js # 资源路径处理 (解决 Vite 动态图片 404 问题)
│   ├── auth.js         # [核心] Supabase 认证与 API 封装
│   ├── content-moderation.js # 内容审核
│   ├── email-service.js # 邮件服务
│   ├── time.js         # 时间工具
│   └── xp.js           # 经验值系统
├── views/           # 页面级视图
│   ├── BOHAI/          # [新增] AI 聊天模块
│   │   ├── AIChatPage.vue
│   │   ├── components/ # AI 聊天组件
│   │   └── composables/ # AI 聊天逻辑
│   ├── activities/      # 活动模块
│   │   ├── ActivitiesList.vue
│   │   └── ActivitiesPhotoWall.vue
│   ├── user-center/     # [重构] 用户中心 (嵌套路由)
│   │   ├── UserInfo.vue
│   │   ├── Address.vue
│   │   ├── Points.vue
│   │   ├── Subscription.vue
│   │   ├── Messages.vue
│   │   ├── Partners.vue
│   │   └── TagsImpressions.vue
│   ├── DataManagement.vue # [重点] 后台数据管理页
│   ├── UserCenter.vue     # 用户中心入口
│   ├── Game.vue           # 游戏介绍页
│   ├── Shop.vue           # 周边商城页
│   ├── Home.vue           # 首页
│   ├── Forum.vue          # [新增] 论坛页
│   ├── PostDetail.vue     # [新增] 帖子详情页
│   ├── Mailbox.vue        # [新增] 邮箱页
│   ├── AiChat.vue         # [新增] AI 聊天入口
│   ├── Profile.vue        # [新增] 用户个人主页
│   ├── AlertStyleEditor.vue # [新增] 弹窗样式编辑器
│   ├── AboutUs.vue        # 关于我们
│   ├── Activities.vue     # 活动页
│   ├── Bagproduct.vue     # 包包产品页
│   ├── Birthday.vue       # 生日页
│   ├── BlockOfHomeAnimation.vue # 方块之家动画
│   ├── Download.vue       # 下载页
│   ├── Gift.vue           # 礼物页
│   ├── Health.vue         # 健康页
│   ├── Join.vue           # 加入页
│   ├── Login.vue          # 登录页
│   ├── MBTI.vue           # MBTI 测试页
│   ├── Newsroom.vue       # 新闻编辑部
│   ├── Service.vue        # 服务页
│   └── Tutorial.vue       # 教程页
└── App.vue          # 根组件 (挂载 Navbar 和 RouterView)
└── main.js          # 入口文件 (含性能优化、WebP 检测)
```

---

## 2. 核心模块深度解析

### 2.1 数据层 (Data Layer) - `src/data/`
本项目采用混合数据源策略：
*   **Supabase 数据库**: 用户认证、用户资料 (profiles)、论坛帖子、评论、点赞、通知、用户印象等实时数据
*   **本地 `.js` 文件**: 商品、新闻、活动等相对静态的数据

**主要数据文件**:
*   **`products.js`**: 定义商城商品。修改价格、图片或描述在此进行。
*   **`news.js`**: 定义新闻列表。
*   **`activities.js`**: 定义活动数据。
*   **`downloads.js`**: 定义下载资源。
*   **`home.js`**: 首页内容数据。
*   **`ai-memory.js`**: AI 聊天记忆数据。

### 2.2 认证与状态层 (Auth & State)
*   **`src/utils/auth.js`**:
    *   **职责**: Supabase 认证封装、数据库 API 封装
    *   **关键功能**: 
      - 注册/登录 (支持 Email/Username、OAuth)
      - 论坛功能 (帖子、评论、点赞)
      - 通知系统
      - 用户印象功能
      - 用户资料管理
*   **`src/stores/auth.js`** (Pinia Store):
    *   **职责**: 用户认证状态管理，集成 Supabase 认证状态同步
    *   **关键 State**: `isLoggedIn` (Ref<Boolean>), `userInfo` (Reactive<Object>), `showLoginModal` (Ref<Boolean>)
    *   **关键 Actions**: `login()`, `logout()`, `resetPassword()`, `updateLocalState()`, `initLoginState()`
    *   **使用方式**: 
      ```javascript
      import { useAuthStore } from '@/stores/auth';
      import { storeToRefs } from 'pinia';
      
      const authStore = useAuthStore();
      const { isLoggedIn, userInfo } = storeToRefs(authStore);
      ```
*   **`src/stores/bag.js`** (Pinia Store):
    *   **职责**: 购物袋状态管理
    *   **关键 State**: `shoppingBag`, `productsData`
    *   **关键 Actions**: `loadShoppingBag()`, `addToBag()`, `removeFromBag()`
*   **`src/main.js`**:
    *   **职责**: Pinia 初始化，认证状态初始化
    *   **关键代码**: 
      ```javascript
      import { createPinia } from 'pinia';
      import { useAuthStore } from './stores/auth';
      import { useBagStore } from './stores/bag';
      
      const app = createApp(App);
      const pinia = createPinia();
      app.use(pinia);
      
      const authStore = useAuthStore();
      const bagStore = useBagStore();
      authStore.initLoginState();
      bagStore.loadShoppingBag();
      ```

### 2.3 Supabase 集成说明
项目已完全集成 Supabase 作为后端服务：
*   **认证**: Supabase Auth (Email/Password、OAuth)
*   **数据库**: Supabase PostgreSQL (profiles, posts, comments, likes, notifications, user_impressions 等表)
*   **实时功能**: 实时通知订阅
*   **环境变量**: 需要配置 `.env` 文件中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

### 2.4 构建配置 (Build Config) - `vite.config.js`
*   **Base URL**: `./` (支持相对路径部署，适应 GitHub Pages 或本地文件系统)
*   **插件**:
    *   `vite-plugin-purgecss`: 已注释禁用 (防止动态组件样式丢失)
*   **分包策略**: 
    - 手动将 `vue` 全家桶打包为 `vue-vendor`
    - 组件库打包为 `ui-components`
*   **优化配置**: 
    - Terser 压缩 (生产环境移除 console)
    - CSS 代码分割禁用 (合并为单文件)
    - 图片资源自动优化

---

## 3. 新增功能模块

### 3.1 论坛系统 (`src/views/Forum.vue`, `src/views/PostDetail.vue`)
*   **功能**: 发帖、评论、点赞、删除帖子/评论
*   **数据存储**: Supabase (posts, comments, likes 表)
*   **权限控制**: 作者或管理员可删除/编辑

### 3.2 AI 聊天系统 (`src/views/BOHAI/`)
*   **功能**: AI 对话、Markdown 渲染、打字机效果
*   **组件**: ChatInput, ChatMessage, ChatSidebar, ModelSidebar
*   **Composables**: useChatEngine, useMarkdownRenderer, useTypingEffect

### 3.3 通知系统 (`src/utils/auth.js`)
*   **功能**: 实时通知、未读计数、标记已读
*   **数据存储**: Supabase (notifications 表)
*   **实时订阅**: Supabase Realtime

### 3.4 用户印象系统 (`src/views/user-center/TagsImpressions.vue`)
*   **功能**: 添加用户印象、查看他人对自己的印象
*   **数据存储**: Supabase (user_impressions 表)

### 3.5 个人主页 (`src/views/Profile.vue`)
*   **功能**: 查看用户资料、用户发帖、用户评论
*   **路由**: `/profile/:username`

---

## 4. 已知风险与约束

1.  **🟡 数据持久化 (中)**
    *   **混合存储**: 用户资料、论坛数据等实时数据存储在 Supabase，商品、新闻等静态数据存储在本地 `.js` 文件
    *   **购物车**: 购物袋数据仅保存在 `localStorage` 中

2.  **🟡 样式系统 (中)**
    *   **混合方案**: 传统 CSS/SCSS + Tailwind CSS 4.2.0 共存
    *   **复杂依赖**: `main.js` 引入了大量 CSS 文件，修改全局样式时需小心 CSS 权重冲突

3.  **🟡 环境变量 (低)**
    *   **Supabase 配置**: 需要正确配置 `.env` 文件中的 Supabase URL 和 Anon Key

---

## 5. AI 修改指南 (Modification Guide)

为确保代码迭代的安全性和准确性，请严格遵循以下**分层修改顺序**：

### 第一优先级：数据定义变更
*   **场景**: "新增一个名为 '钻石剑' 的商品" 或 "添加一条新闻"。
*   **操作**: 直接修改 `src/data/products.js`、`src/data/news.js` 或对应数据文件。
*   **注意**: 用户相关数据已迁移至 Supabase，如需操作用户数据请使用 `src/utils/auth.js` 中的 API。

### 第二优先级：核心逻辑与状态
*   **场景**: "修改登录校验规则" 或 "改变购物车结算逻辑"。
*   **操作**:
    1.  修改 `src/utils/auth.js` (业务逻辑)。
    2.  同步更新对应的 Pinia store (`src/stores/auth.js` 或 `src/stores/bag.js` 等)。
*   **注意**: 使用 `storeToRefs()` 来解构 Pinia store 的响应式引用，确保 reactivity 正常工作。

### 第三优先级：组件与 UI
*   **场景**: "导航栏增加 '社区' 链接" 或 "修改登录弹窗样式"。
*   **操作**: 修改 `src/components/UnifiedNavbar.vue` 或对应组件。
*   **注意**: 涉及图片引用时，**必须**使用：
    ```javascript
    import { getImageUrl } from '@/utils/asset-helper';
    const imgSrc = getImageUrl('icon.png');
    ```

### 第四优先级：页面视图迭代
*   **场景**: "重构用户中心" 或 "优化首页布局"。
*   **操作**: 修改 `src/views/` 下的文件。
*   **规范**: 保持 Composition API 风格 (`<script setup>`)，尽量复用 `src/assets/styles/` 中的变量或使用 Tailwind CSS。

### 第五优先级：Supabase 相关修改
*   **场景**: "新增论坛功能" 或 "修改通知逻辑"。
*   **操作**: 修改 `src/utils/auth.js` 中的相关 API 函数。
*   **注意**: 确保 Supabase 表结构与代码逻辑匹配。

---

## 6. 常见问题排查 (Troubleshooting)

### Q1: 部署后图片显示 404
*   **原因**: Vite 打包后文件名带有哈希，且目录结构变化。
*   **解决**: 确保所有动态图片都使用了 `src/utils/asset-helper.js` 中的 `getImageUrl` 方法，且 `asset-helper.js` 中配置了 `import.meta.glob(..., { eager: true })`。

### Q2: 页面样式错乱或丢失
*   **原因**: `vite-plugin-purgecss` 误删了动态生成的类名，或 Tailwind CSS 与传统 CSS 冲突。
*   **解决**: 检查 `vite.config.js`，确保 `purgecss` 插件已被注释或禁用；检查 CSS 权重。

### Q3: 修改了代码但浏览器未生效
*   **原因**: 浏览器缓存或 Vite HMR 失效。
*   **解决**: 尝试强制刷新 (Ctrl+F5)，或重启开发服务器 (`npm run dev`)。

### Q4: Supabase 相关功能不工作
*   **原因**: 环境变量未配置或 Supabase 项目未正确设置。
*   **解决**: 检查 `.env` 文件是否存在且包含正确的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`；检查 Supabase 项目的表结构和 RLS 策略。

### Q5: 登录后状态不同步
*   **原因**: Supabase 会话状态与本地 Pinia store 状态不一致。
*   **解决**: 检查 `src/stores/auth.js` 中的 `initLoginState()` 和 `updateLocalState()` 函数是否正确调用；确保在 `src/main.js` 中正确初始化了 Pinia 和 auth store。
