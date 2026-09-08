# BOHLITE BETA 6 产品与架构规划

> 调研基准：2026-09-07 · 当前版本 `5.1.1`（BETA 5 已发布）· 基准 commit `840353a`
> 适用范围：产品 / 前端 / 运营后台 · 目标版本：`6.0.0-beta.6`
> 证据来源：全仓路由、store、Supabase migration、样式层与最近 100 条 commit 的实地摸底，非经验推断。

---

## 📌 执行进度（2026-09-08 更新，含用户拍板的范围修订）

| 事项 | 状态 |
|---|---|
| P0-0 玻璃修复 + 全站视觉回归 | ✅ 完成（token 链修复 + probe-glass-regression 四页全 PASS） |
| 安全三项（API Key / RLS / 列级权限） | ✅ 完成（migration 2026090803，probe-rls-verify 9 项 PASS） |
| P1-3 活动平台化核心 | ✅ 完成（campaigns/entries/rewards 三表 + DataAdmin 管理tab + 前台报名区块） |
| P0-1 内容主干 | 🟡 半程（posts.source_* / 官方卡镜像 / 转帖 / 服务端类型筛选已上线；`useEngagement` / `useUnifiedFeed` 待抽） |
| P0-2 商业化收口 | 🟡 **范围修订**：支付回调闭环**搁置**；积分账本（含用户可查的消费/获取记录）与权益层统一**保留** |
| P1-3 剩余验证 | ⬜ 抽奖迁入 campaigns 做首个存量迁移验证 |
| S4 本体 | ⬜ `/news/:slug` 独立路由 + OG/SEO |

**用户拍板的范围修订（2026-09-08）：**
1. **支付回调闭环暂缓**——个人开发者接不了真实支付回调，二维码人工兜底维持现状，不再作为 BETA 6 验收项。
2. **新闻"讨论"入口取消**——论坛原生评论已够用，P0-1 验收只保留"活动沉淀 UGC"与互动内核抽取。
3. **积分账本提升优先级**——`points_transactions` 不再只是对账底层，要做用户可查的消费/获取记录（账单感）。

---

## 0. 核心判断

先把结论摆在前面，避免后面六章失焦。

BETA 5 已经把"跑得稳"这件事做到了——`fx` 该修的都修了，路由失败自动恢复、多图上传并发预热、PWA 缓存治理都上了。但站点真正的病灶不在性能，而在**结构重心失衡**：

> **论坛和用户空间是被当成「产品本身」在做，而首页、新闻、活动是被当成「运营物料」在做。**
> 前者有数据模型、有生命周期、有互动体系；后者是一次性页面 + 一次性表 + 一次性视觉。

它们不是变成了配角，而是**从来就没有接进主干**。链路是这样的：

```
用户在首页 / 新闻 / 活动里停留
        ↓
不产生任何沉淀（没有帖子、没有积分流水、没有关系链、没有等级变化）
        ↓
这些板块无法反哺「我是谁」 → 板块越做越虚
        ↓
订阅拿不出「身份理由」，只剩功能堆量（Token / 云盘 / 去广告）
        ↓
商业化没有杠杆 → 用户空间膨胀成 8 面板的杂物间
```

支撑这条链路的**最硬事实**：`posts` 表没有任何指向新闻或活动的外键（全仓 grep `source_type / activity_id / news_id` 零命中）。活动不能产出帖子，新闻不能转帖，首页英雄不能挂 UGC。

所以 **BETA 6 的正确主题不是"再造几个新板块"，而是补一条贯通全站的主链**：让非论坛板块也能沉淀为用户资产，让用户资产有一致出口，让"身份"成为订阅的定价理由。

一句话版本：**BETA 5 是让每个模块跑得稳，BETA 6 是让所有模块互相咬合。**

---

## 1. BETA 6 应优先推进的方向

四条主线。前两条是**地基，必须串行**；后两条是**上层建筑，可以并行**。

在此之前，有一个**零号事项**（成本 10 分钟，第一天就该做）。

### P0-0 · 修复全站毛玻璃静默失效

`src/styles/common/glass-ui.css:18-20` 存在 CSS 变量**自引用**：

```css
--glass-filter-light:  var(--glass-filter-light)  saturate(...) brightness(1.02);
--glass-filter-medium: var(--glass-filter-medium) saturate(...) brightness(1.02);
--glass-filter-heavy:  var(--glass-filter-heavy)  saturate(...) brightness(1.02);
```

按 CSS 自定义属性规范，自引用的变量计算值为 **guaranteed-invalid**，于是所有引用它的声明都变成 *invalid at computed-value time*，属性回落到初始值 —— 即 **`backdrop-filter: none`**。

佐证：第 14-17 行定义了 `--glass-blur-light/medium/heavy`，但这三条 filter 里**一条都没引用**。正确的写法显然是：

```css
--glass-filter-light: blur(var(--glass-blur-light)) saturate(var(--liquid-saturate, 180%)) brightness(1.02);
```

**影响面**：`.glass-container-light / medium / heavy / overlay` 全系列，覆盖导航栏、卡片、弹窗、按钮。由于每个类还带 `background: rgba(255,255,255,.7)` 兜底，肉眼几乎察觉不到——它不报错、不塌陷，只让人觉得"质感不太对"。**全站轻量档玻璃材质当前是失效的。**

> ⚠️ **修好之后全站观感会发生大面积变化**，这不是小修补，是一次需要全回归的视觉变更。建议独立 commit 修复，并对首页 / 论坛 / 用户空间 / 导航栏做专项视觉走查。

### P0-1 · 建数据主干：把板块互相打通（Content Spine）

**为什么是 P0**：这是唯一一条解锁后面所有事情的依赖。现在 `posts` 无 `source_type / source_id`，三大板块在本质上无法沉淀，任何上层 UI 改动都治不了。

| 动作 | 具体改动 | 位置 |
|---|---|---|
| 给 `posts` 加来源字段 | `source_type (post/news/activity/hero)` + `source_id uuid`，并建索引 | 新 migration |
| 抽互动内核 | 从 `ForumMain.vue`（4302 行）抽出 `useEngagement(targetType, targetId)`，统一 like / comment / collect / share | `src/composables/` |
| 活动 / 新闻可落地 UGC | 活动投稿自动建 post；~~新闻支持"讨论"入口~~ **（2026-09-08 取消：论坛原生评论已够用，不再给新闻加讨论入口）** | 各板块 API |
| 统一 Feed 合成器 | `useUnifiedFeed()` 按 `source_type` 聚合，供首页与用户空间复用 | `src/composables/` |

**验收口径**（2026-09-08 修订）：一次活动结束后，参与者能在自己空间里看到它产生的帖子；互动内核（like / comment / collect / share）收敛为单一 `useEngagement`。

### P0-2 · 商业化收口：真实收银台 + 单一权益层 + 真实账本

现状是典型的"半截商业化"：`subscribe_with_points` 是真 RPC（会扣 `profiles.points`、写 `user_subscriptions`），Trial 也接了，但卡在三处：

1. **充值靠二维码** —— `SubscriptionPlans.vue:253` 的 `showRechargeModal` 就是收款码 + UID + 人工核对。用户付款到开通是分钟级到小时级时延，这是整个转化漏斗最大的漏水点。
2. **`subscribe_with_points` 不写 `points_transactions`** —— 表里明明预留了 `reason='subscription'` 却没用，即订阅扣减无流水。后果是账本与余额会漂移，用户会看到"积分莫名其妙少了"。
3. **权益判断四套真相源** —— `utils/subscription-benefits.js` + `composables/useUserTier.js` 其实做得不错（5 分钟 TTL、in-flight 去重），但 `SubscriptionPlans.vue` 内部仍有本地 `TIER_RANK`、`ProfileMain.vue` 和 `Shop/index.vue` 各判各的。改一个权益要动四处。

**做什么**（2026-09-08 修订：支付回调闭环搁置，账本与权益层保留）：

- ~~**支付闭环**~~：**暂缓**（用户拍板：个人开发者无真实支付回调渠道，二维码人工兜底维持现状，不再是 BETA 6 验收项；将来若接入支付渠道再重启此节）。
- **账本成为真相 + 账单感**（优先级提升）：`points_transactions` 作为唯一流水，`profiles.points` 降级为派生值。第一步先做"余额 = SUM"的对账任务 + 告警，第二步再把 RPC 改为单事务原子写（顺手修掉 `admin_grant_points` 先 UPDATE 后 INSERT 读余额的竞态）。**并且必须做用户可查的积分记录页**——用户能按时间看到每一笔获取/消费（来源、数量、余额快照），解决"积分莫名其妙少了"的投诉型问题。
- **单一权益层**：废弃各处本地等级判断，统一走 `entitlements` 服务（`can('x')` / `quota('x')`），由 auth store 冷启动预取注入。

> 这一条做完，"订阅用户"才第一次成为可运营的对象：能自动开通、能看到完整账单、能按等级差异化展示。

### P1-3 · 活动平台化：终止"一活动一套表"

**现状证据**：`Birthday`（`birthday_events` + `birthday_wishes`）/ `CommunityLotteries`（6 张表 + scheduler，含报名→开奖→履约→通知→保底的完整管线）/ `BOH8YearsEvent`、`AnniversaryCafe`（纯静态页）/ `BOH8YearsJourney`（自带 `copy-editor-store.js`，等于一个一次性 CMS）。而 `activities` 表本身只有 `id/title/date/image/description` 五字段——它是历史相册，不是活动系统。

**最讽刺的一点**：唯一有完整生命周期管线的抽奖，恰恰是社区调性最弱的一块；真正代表社区调性的生日会、设定集、周年，反而连数据库都没有。

**做什么**：抽 `activity_campaigns`（阶段机 `draft → signup → submission → judging → result → fulfilled`）+ `activity_entries`（通用投稿/报名）+ `activity_rewards`（通用发放，对接积分/抽奖/商城）。先把抽奖和一次生日会迁进去做验证，跑通后再逐步下线一次性页面。

> **铁律：BETA 6 起不再新增一次性活动页面 / 表。**

### P1-4 · 首页从「英雄列表」升级为「会看人的运营编排」

`homeHeroes` store 底子已经很好（DB 驱动、draft/published 分离、`home_heroes_revisions` 快照、rollback/reorder、localStorage 24h 缓存）。下一步**不是再加 hero 组件**——已经有 11 个 builtin + `DynamicHomeHero`，够多了。缺的是让首页"会对不同的人说不同的话"：

- **hero 定向投放**：新增 `audience` 字段，按会员等级 / 标签 / 新老用户 / 是否创作者分流
- **生命周期自动化**：`start_at / end_at` 到期自动上下架，告别手动发布归档
- **第一屏放 happening**：聚合 activities + news + 活动贴，让用户第一眼看到"这里有人在、这里在发生什么"。这才是首页该承担的角色，而不是公告栏
- **收编硬编码弹窗**：`Home/index.vue` 里 4 个 Teleport 弹窗（遇见福州 / 八周年信件 / Cloud+ / 海报申请）改为统一的 `promo-modal` 注册中心，避免每次运营都改首页源码

---

## 2. 现有设计在用户体验与结构上的缺陷

按「用户能感知到的严重程度」排序，而不只是代码债。

### 2.1 结构性缺陷（用户会迷路）

| # | 缺陷 | 证据 | 用户感知 |
|---|---|---|---|
| S1 | **用户空间与公开主页认知分裂** | UserSpace 底栏 5 tab（posts/community/ai/messages/profile），profile 下又有 8 个子面板；同时存在独立的 `/Profile` 页做相似的事 | 不知道"我的空间"和"我的主页"哪个是给别人看的 |
| S2 | **profile 二级嵌套过深** | `validProfileSections` 8 项，且 `home` 面板本身还要并行请求 stats/cloud/posts | 改个头像要点 3 次，主路径被埋 |
| S3 | **导航三级下钻** | `UnifiedNavbar/index.vue:599` 的 navMenuItems 三级嵌套，"社区"下塞 5 项、"探索"下塞 5 项 | 桌面端靠 hover 猜，移动端第三次点击才有内容 |
| S4 | **新闻详情是模态框** | `views/Newsroom/index.vue` 详情用弹窗，无独立路由 | 不能分享单篇、不能刷新、不能前进后退、无任何 OG/SEO，站外传播为零 |
| S5 | **一次性活动页成为幽灵入口** | 8+ 一次性视图仍在路由表里；`HeroSection.vue` 全仓 0 引用 | 活动过期后页面还挂着，新用户点进去是死内容 |
| S6 | **Tab 与内容不对称** | `useUserSpaceTabs.js` 有 `shows` 可达却没进底栏 | 功能存在但入口不存在，等于不存在 |

### 2.2 体验性缺陷（用户会烦）

- **充值路径断裂**：付了钱要人工核对，中间无状态反馈，是商业化链路里最伤信任的一环。
- **积分没有账单感**：只有一个 `auth.userInfo.points` 数字，且部分路径（订阅扣减）不写流水。这是**投诉型**问题，不是优化项——用户会直接质疑账目。
- **首屏 = 活动海报墙**：9 条基线 + 动态 hero 一长串，新用户第一屏看不到社区在发生什么，只看到"这里在做活动"。这直接解释了观察到的"首页配角化"——它不是配角，它是被当成公告栏在用。
- **空 / 加载 / 错误态不统一**：目前只有 UserSpace 和 AI 聊天有骨架屏，其余裸奔。首屏抖动的观感比真实加载时间更影响体感。
- **Bug 复发集中在最高频动作**：最近 100 条 commit 中 38 条是 fix，其中 **forum composer 复发 7 次、image/upload 复发 7 次**。发帖和传图恰恰是"论坛为核心"这一现状下最不该不稳的两个动作。

---

## 3. 视觉层面可优化的具体环节

现状摸底：`src/styles` 共 12,847 行，**736 处 `!important`**（forum-dark 177 / unified-nav 157 / user-center-dark 105 / post-detail-dark 102）；两套 token 并存（`tokens.css` 的 22 个 `--liquid-*` vs `style.css` 顶部 `@theme` 的 22 个 shadcn 色板）；暗色主题仅覆盖 9 个页面。

按投入产出比排序：

| 优先级 | 环节 | 问题 | 做法 |
|---|---|---|---|
| **V1** | **英雄区设计语言** | 11 个 builtin hero 各自写死字号/间距/CTA，一眼看出是 11 个人写的 | 定一套 Hero 规范（eyebrow / headline 三级字号 / 正文 / 主从双 CTA / 安全边距），出统一 `hero-surface` 基类让 builtin 继承；顺带处置 `HeroSection.vue`——废弃则删，是唯一通用实现则改造成基类，**不要留孤儿** |
| **V2** | **暗色模式补齐** | 仅 dark-mode / navbar / forum / post-detail / user-space / user-center / bohai / messages / boh-note 9 个专属文件；Home / Shop / Lab / Newsroom / Download / 活动 / 八周年全裸奔 | 先做通用语义层（`--surface-* / --text-* / --border-*`），页面专属文件降级为只写差异；加 CI 校验"每个路由都有暗色覆盖" |
| **V3** | **`!important` 收敛** | 736 处，暗色文件是重灾区。根因是"用优先级打补丁"而非"用层叠解决问题" | 用 `@layer` 定顺序（tokens → base → components → utilities → overrides），暗色走 `[data-theme=dark]` 变量覆写而非逐条 `!important`；CI 计数门禁（只降不升） |
| **V4** | **双 token 合并** | `--liquid-*` 与 `@theme` 两套色板并存，新项目该用哪套没有答案 | 保留 `--liquid-*`（它有 `boh-perf-lite` 降级档，是真资产），把 Tailwind 主题色板映射到它，配 codemod 迁移 |
| **V5** | **断点常量化** | `pages/section__header.css` 20 处散装 `@media`、unified-nav 16 处 | 抽 `--bp-sm/md/lg` + 一组工具类，禁止业务 CSS 裸写 `@media` |
| **V6** | **最大产物下意识处理** | `DataAdmin.css` ~620KB、`doc-utils-vendor` ~420KB、`ForumMain.css` ~264KB | DataAdmin 随 C2 拆分自然会降；docx/pptx 文档导出 vendor 要核实是否真正按需动态 import（现在分了 chunk，但触发点未必隔离） |
| **V7** | **状态设计缺失** | 无全站统一的空 / 加载 / 错误 / 禁用态 | 出 `<EmptyState> / <SkeletonBlock> / <ErrorRetry>` 三件套全站替换 |

> 一个容易被忽略的点：`HeroConsole`（英雄后台）早就有了。真正的瓶颈不在"能不能配"，而在"配出来的东西没有规范可依"，所以运营配的 hero 和设计师做的不在一个系统里。**V1 是解决这个问题的前提。**

---

## 4. 信息架构可调整的方案

### 4.1 一级导航：从 5 组收敛为 4 组

现状（三级嵌套、20 项）：首页 / 社区（智能概览·新闻&节目·论坛·活动&方块墙·抽奖）/ 探索（AI助手·实验室·方块世界·设定集·生日会·八周年）/ 服务（健康·周边商城·订阅·资源中心·管理面板）/ 关于（云上咖啡店·版本检测·关于我们）

调整为：

```
首页  Home       今日 happening + 定向 hero 编排
社区  Community  论坛 · 新闻&节目 · 活动 · 抽奖
我的  Space      内容 · 资产 · 权益 · 设置          ← 合并 UserSpace 与 Profile 的认知
更多  More       AI助手 · 实验室 · 商城 · 健康 · 订阅 · 关于
```

要点：

- **合并"我的"概念**：`UserSpace`（后台态）与 `Profile`（公开态）共用同一套组件，靠 `isOwner` 切换编辑态 / 浏览态。这是解决 S1/S2 的唯一正解，顺手给创作者一个像样的对外主页。
- **"关于"降级**：云上咖啡店 / 版本检测 / 关于我们并入 `More` + footer，不占一级位。
- **活动 / 抽奖收进社区**，并逐步统一到 `/activities/:slug` 单路由（配合 P1-3）。

### 4.2 二级结构：把 UserSpace 的两层压成一层

现状：5 底栏 tab × (profile 下 8 子面板) 的隐式两层。

```
我的
├── 内容   posts / shows / 草稿               （原 posts + async shows）
├── 社区   followers / likes / 收藏            （原 community）
├── 资产   积分账本 / 积分卡 / 云盘 / 权益       （原 assets + 新增权益中心）
├── 消息   messages / AI / 通知                （原 messages + ai 合并）
└── 设置   资料编辑 / 隐私 / 数据导出            （原 profile 的 edit/settings/data-* 上提）
```

关键变化：**把 profile 的 8 个子面板上提，消除二级**。用户任何目标最多两次点击可达。

### 4.3 路由与 URL 结构改造

| 现状 | 问题 | 目标 |
|---|---|---|
| `/newsroom` 详情为弹窗 | 不可分享、不可收录 | `/news/:slug` 独立路由 + OG meta + OG image + RSS |
| 8+ 一次性活动路由 | 幽灵入口、无法统一运营 | `/activities/:slug` 统一；历史页 301 到归一化 slug |
| `/activities`、`/block-wall` | 兼容重定向残留 | 保留 301，但重新定义 `ActivitiesWall` 组合页职责 |
| 无 sitemap / robots / OG | 站外传播为零 | 新增 `scripts/gen-seo.mjs` 做构建期 OG 注入 |

### 4.4 迁移原则（不要又一次大爆炸重写）

社区产品最忌"IA 升级 = 全站重写"。建议：

- **路由层加适配器**：新 IA 先落地为"新路由 + 旧路由 301"，不动既有页面内部。
- **用户空间分两步**：第一步只做面板上提（纯 UI 重组，零数据改动），第二步再做 `Profile` / `UserSpace` 合流。
- **每个迁移给一条旧路径保底**：S1 / S4 / S5 三处的老 URL 至少保留一个版本周期的可访问性。

---

## 5. 开发重心应倾斜的模块

按一个迭代周期的人力投入建议分配：

| 权重 | 模块 | 核心交付 | 为什么是这个权重 |
|---|---|---|---|
| **30%** | **中台层**（content spine + entitlements + points ledger） | `posts.source_*`、`useEngagement`、`useUnifiedFeed`、entitlements 服务、账本对账 + 用户可查积分记录（~~支付回调~~ 2026-09-08 搁置） | 是所有上层能力的地基，也是唯一能同时改善首页 / 活动 / 新闻 / 订阅四件事的工作 |
| **20%** | **首页与英雄区编排** | hero 定向投放、生命周期自动化、happening 头部、promo-modal 注册中心 | 全站流量入口，改造第一印象性价比最高；且 HeroConsole 基础设施已在，只需补编排能力 |
| **15%** | **用户空间重构** | 面板上提、Profile/UserSpace 合流第一步、权益中心页 | 用户日均接触最多；也是"身份"的呈现载体，直接支撑订阅转化 |
| **15%** | **活动平台化** | `activity_campaigns` / `entries` / `rewards` + 迁移抽奖验证 | 权重低于它看起来的应得份额，因为这是长期收益，先做最小跑通即可 |
| **10%** | **视觉与设计系统收敛** | Hero 规范、暗色语义层、token 合并、状态三件套 | 必须做，但可以随上述改造顺手做，不必独立排期 |
| **5%** | **技术债与安全** | API Key 轮换、RLS、服务端权限校验、DataAdmin 拆分、composer 稳定性专项 | 权重最低但优先级最高，见下方警告 |

> **关于最后一行的特别说明**
>
> `PROJECT_MANUAL.md` 5.1 里的三项高危（**API Key 硬编码 / RLS 缺失 / 权限校验在客户端**）至今仍是 ⏳ 待修复。这不是可以排权重的事项——**安全项不接受排期**。而且 BETA 6 要引入真实支付，安全债的性质会从"泄密风险"变成"资损风险"，必须在第一个 sprint 无条件清掉。
>
> 同理，**forum composer + 图片上传 bug 复发合计 14 次**，需要的不是第 8 次单点 fix，而是一次性重写：把 composer 拆成独立的 `PublishFlow` 状态机组件。

---

## 6. 网站下一阶段整体需补足的能力

跳出 BETA 6 单版本，看 BOHLITE 从"爱好者社区站"走向"可持续运营的产品"还缺什么。六项能力，前三项 BETA 6 就要启动。

### C1 · 资金链闭环能力（~~BETA 6 启动~~ 2026-09-08 搁置）
现状：subscription 半自动化（有 RPC、无回调）、shop 有 `create_shop_order_with_points`、充值二维码人工。
原计划：支付渠道 → 订单 → 回调 → 权益发放 → 退款/争议 → 凭证。
**2026-09-08 用户拍板：个人开发者接不了真实支付回调，本能力整条搁置**；二维码人工兜底维持现状。积分账本（points_transactions + 用户可查记录）从本节拆出，提前至 BETA 6 单独交付。

### C2 · 运营自治能力（BETA 6 启动）
现状：`DataManagement/DataAdmin.vue` 6043 行巨型后台，HeroConsole 另起炉灶，每做一次活动要新建页面。当前"做一次运营活动"的边际成本 ≈ 发一次版。
要补：DataAdmin 按领域拆成可插拔 admin module（每张表一张注册卡片），活动 / 排期 / 投放全部后台化。
**目标：让一次运营活动的成本从"发一次版"降到"填一张表"。这条不做，C5 每调一次激励都要发版。**

### C3 · 内容可被发现的能力（BETA 6 启动）
现状：SPA + hash 路由 + 新闻详情为模态框 → 搜索引擎基本看不到任何内容。
要补：独立内容路由 + 构建期 OG 注入 + sitemap + RSS。
**社区内容如果不能被收录，"用内容拉新"这条增长路径永远为零。**

### C4 · 可观测性（BETA 6 ~ 7）
现状：有 logger、有 PWA、有自检脚本，但**没有前端错误上报、没有 Web Vitals、没有业务漏斗埋点**。
后果：只能靠用户抱怨发现问题——这正是 composer 复发 7 次的根因之一。
要补：错误监控 + 性能指标 + 关键漏斗（注册 → 首次发帖 → 首次订阅），要求每次发版看板可回放。

### C5 · 增长与留存机制（BETA 7）
现状：周签（`submit_weekly_checkin`）、发帖奖励（`get_active_post_reward`）、抽奖、会员——颗粒都有，但**没有连贯的成长叙事**：无等级墙、无成就、无"下一步该做什么"的引导。
要补：一条清晰的 `新手任务 → 创作者 → 会员` 晋升路径，把散落的奖励行为整合进同一套动机体系。
**注意：必须排在 C2 之后。**

### C6 · 治理能力（贯穿全部阶段）
规矩很简单，但比任何功能都重要，且成本最低：

1. **禁止新增上帝组件** —— `check-project-structure.mjs` 的大文件阈值应从 2500 行下调。现有 DataAdmin 6043 / Lab 4358 / ForumMain 4302 / AssetsHubPanel 3177 已经是灾难。建议 **1500 行告警 + 2500 行 CI 阻断**。
2. **禁止新增一次性活动页面 / 表** —— 需求一律走 `activity_campaigns`。
3. **`!important` 只降不升** —— CI 计数门禁。
4. **新 UI 必须有暗色覆盖** —— CI 校验。
5. **每个大版本前做一次事前债务盘点** —— 不要等到 736 处 `!important` 才动手。

---

## 附录 A · 关键事实速查

规划中所有判断的代码级依据，便于后续执行和复核：

| 事实 | 位置 |
|---|---|
| `posts` 无 `source_type / source_id`，活动与新闻不产出帖子 | 全仓 grep 零命中 |
| `HeroSection.vue` 全仓 0 引用（孤儿组件） | `src/components/HeroSection.vue` |
| 首页 11 个 builtin hero + 9 条 `HOME_HERO_BASELINE` | `src/views/Home/components/` · `src/stores/homeHeroes.ts` |
| 8+ 一次性活动视图，各一套表 | `src/views/Birthday`、`BOH8Years*`、`AnniversaryCafe`、`CommunityLotteries` |
| `activities` 表仅 5 字段（历史相册，非活动系统） | Supabase schema |
| 仅抽奖有完整生命周期管线（6 表 + scheduler + 保底 + 通知） | `CommunityLotteries` 子系统 |
| 新闻详情为模态框，无独立路由、无 OG | `src/views/Newsroom/index.vue` |
| 订阅 5 档（free/plus/pro/max/ultra）+ 本地 `TIER_RANK` | `SubscriptionPlans.vue:282-297` |
| `subscribe_with_points` 不写 `points_transactions` | `subscription-api.js:90` + migration `2026033003` |
| 积分充值 = 二维码 + UID 人工核对 | `SubscriptionPlans.vue:253` |
| 权益判断四套真相源 | `subscription-benefits.js` / `useUserTier.js` / `SubscriptionPlans.vue` / `ProfileMain.vue` + `Shop` |
| `admin_grant_points` 先 UPDATE 后 INSERT 读余额（竞态） | `points-admin-api.js` |
| UserSpace 5 tab × profile 8 子面板；另有独立 `/Profile` | `UserSpaceMain.vue:349`、`validProfileSections:384` |
| `shows` tab 可达但未进入底栏 | `useUserSpaceTabs.js` |
| 上帝组件 top5：DataAdmin 6043 / Lab 4358 / ForumMain 4302 / AssetsHubPanel 3177 / UserSpaceMain 2688 | `check-project-structure.mjs` 报告口径 |
| 736 处 `!important`；两套 token（22 个 `--liquid-*` vs 22 个 `@theme`） | `src/styles/` · `tokens.css` · `style.css` |
| 暗色仅覆盖 9 个页面 | `utils/theme-css-loader.js` |
| 近 100 条 commit 中 38 条 fix：composer 复发 7 次、image/upload 7 次 | git log |
| 三项高危安全债仍 ⏳ 待修复 | `PROJECT_MANUAL.md:5.1` |

## 附录 B · 建议版本节奏

| 阶段 | 目标 | 关键交付 | 建议版本 |
|---|---|---|---|
| S1 | 基建 + 清安全债 | `posts.source_*` · entitlements 单一层 · 积分账本（用户可查记录）· 三项高危清零（~~支付回调~~ 搁置） | `6.0.0-beta.6` |
| S2 | 首页重生 | hero 定向投放 · happening 头部 · promo 注册中心 | `6.1.0` |
| S3 | 用户空间重组 | 面板上提 · Profile/UserSpace 合流第一步 · 权益中心 | `6.2.0` |
| S4 | 活动平台化 + 视觉收敛 | campaigns 迁移抽奖验证 · Hero 规范 · 暗色语义层 | `6.3.0` |

> 每个阶段收尾都应更新 `PROJECT_MANUAL.md` 对应章节。目前手册里的风控清单已经半年没动了——它应该被 CI 检查，而不是靠人记。

---

## 附录 C · 第二份研究的交叉验证与修订

本节记录与另一份独立 BETA 6 研究报告的交叉核对结果。**已实地逐条核验**，标注了采纳 / 纠正 / 存疑。

### C.1 采纳（原规划遗漏，已并入）

| 采纳项 | 核验结果 | 处置 |
|---|---|---|
| **`glass-ui.css` 变量自引用** | ✅ 属实，`light/medium/heavy` 三档全中 | 已提升为 **P0-0**（见第 1 节） |
| **Token 实际有 4 套而非 2 套** | ✅ 属实。除 `--liquid-*` 与 `style.css` 的 `@theme` 外，全仓另有 `--apple-*`（`--apple-blue` / `--apple-btn-height` 等自成体系）与 `--boh-*`（`--boh-bg-*` / `--boh-brand-blue` / `--boh-drawer-*` 等） | **订正**本文档第 3 节 V4：原写"两套"，实为四套命名空间 + 组件局部重定义 |
| **品牌蓝双值并存** | ✅ `#007aff` 出现于 22 个文件，与已拍板的 `#0071e3` 混用 | 并入 V4 |
| **暗色三机制共存** | ✅ 除 `[data-theme="dark"]` 外，`AiQuotaSidePanel.vue` 等处使用 `[data-boh-theme="dark"]` | 并入 V2 |
| **页面内控件藏在 navbar island** | ✅ Newsroom 搜索/筛选、ActivitiesWall 标签切换均如此，**本规划未覆盖** | 新增：**C3 页面内搜索能力**应提前，且控件必须在页面可见，不能只放灵动岛 |
| **用户成长路径可视化缺失** | ✅ 积分与等级已有，但无"下一步是什么"的可视化 | 新增到 C5 |
| **内容分享能力缺失** | ✅ 新闻/帖子/活动均无生成分享卡片或链接的能力 | 新增到 C5 |
| **首次访问引导缺失** | ✅ 新用户面对 hero 墙 + 可能的弹窗，无引导 | 新增到 C5 |

### C.2 纠正（另一份研究的事实错误）

| 该研究的说法 | 核验结果 |
|---|---|
| **"两套 hero 系统共存"**，`HeroSection.vue` vs `HomeHeroRow` + `DynamicHomeHero`/`BuiltinHeroRenderer` | ❌ **不成立**。`HeroSection.vue` 全仓 **0 引用**，是孤儿组件。不存在"共存"，只存在"一个在用 + 一个死代码"。正确处置是删除或改造为基类（本文 V1），**不是"合并两套系统"** |
| **"新闻搜索/筛选仅存在于导航栏 island"** | ✅ 属实，且本规划未察觉。这是真实的可发现性风险，已采纳（见 C.1） |
| **各类推断性描述（如弹窗内容量级、品牌蓝用途区分）** | ⚠️ 方向合理但缺代码依据，执行前需二次核实，不要直接当验收项 |

### C.3 战略分歧（这是最需要拍板的部分）

两份研究的**根本路径不同**：

- **该研究 = 自下而上**：先清偿设计系统债（token 合并给到 **30%** 权重，1-2 周），再做 IA 与首页
- **本规划 = 自上而下**：先通数据主干（`posts.source_*` + entitlements + 支付回调给到 **35%** + 内含的安全项），视觉收敛随改造顺手做（10%）

**我的判断仍然是后者，理由三条：**

1. **两类债的付息方式不同。** 设计系统债是**付利息**的债——不还会一直难看，但不会新增复杂度；数据主干债是**结构性**的债——每新增一个板块（比如今天又做一个活动），就要重付一次：新建页面、新建表、新建发放逻辑。**一个版本周期的预算应该先还后者。**

2. **顺序反了会制造新债。** 该研究建议的"首页社区动态流"，在 `posts` 没有 `source_type` 的前提下实现，只能前端分别查 forum/news/activities 三张表再在客户端拼装——这恰恰是我建议消灭的模式，反而会新增一处胶水代码。

3. **工期估算偏乐观。** "token 合并约 1-2 周"在 12,847 行 CSS、736 处 `!important`、四套命名空间的现实下不现实，真实量级更接近 3-4 周且需伴随回归。**规划里最危险的东西就是低估工期。**

### C.4 修订后的建议投入

在原第 5 节基础上调整（视觉收敛从 10% 上调至 15%，用于吸收该研究的有效发现，并从首页板块调剂）：

| 模块 | 原配比 | 修订 | 变化说明 |
|---|---|---|---|
| 中台层（content spine + entitlements + ledger） | 35% | **30%** | 不变其优先级，让出 5% |
| 首页与英雄区编排 | 20% | **20%** | 不变；但需纳入"页面内可见控件"的要求 |
| 用户空间重构 | 15% | **15%** | 不变 |
| 活动平台化 | 15% | **10%** | 让出 5%，因其属长期收益 |
| **视觉与设计系统收敛** | 10% | **15%** | ⬆ 吸收四套 token / 品牌蓝 / 暗色三机制 / 遗留 `buttons.css` |
| 技术债与安全（不参与排期博弈） | 5% | **5%** | 不变 |
| **新增：P0-0 玻璃修复 + 全回归** | — | **5%** | 修 bug 只要 10 分钟，但**全站视觉回归**要留预算 |

### C.5 一句话结论

两份研究在"**站点有病**"上完全一致，分歧只在"**先治哪一处**"。该研究的手术刀切得很准（尤其 P0-0 那个 bug 是本次交叉验证里最有价值的单项发现），但它的治疗方案是**先把房子粉刷干净**；本文的方案是**先把承重墙打通**。

如果只能选一个：建议 **`posts.source_*` 那行 migration 和十分钟的 glass bug 修复同时进第一个 sprint**（两者互不冲突、都极便宜），但**不要**把四周的预算压在 token 合并上——那些应该伴随业务改造增量收敛。
