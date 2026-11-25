# 048 · 数据管理面板改造成「设置页」骨架

> **口径（2026-11-24 用户原话）：**「把数据管理面板重写成设置页面的感觉，类似当前设置页，我竟然觉得蛮方便」
> 「可以增加多的子页和子子页」「竖屏就是一个完全的设置项目页面，横屏是左导航右子页」「跟当前的设置页风格一样吧」
>
> **一句话方案：抄壳，不抄体。** 一级目录 / 二级子页按 `ProfileSettingsPanel` 那套（`.gs-group > .gs-rows`
> 卡片 + 44px 行 + 内缩发丝线 + 左缘蓝条）重写；**三级内容区（表格 / 表单 / 可视化编辑器）一行代码不动**。
>
> - 编写日期：2026-11-25
> - 状态：**期 1–3 已落地**（commit `da691bb1`），期 4 未做。落地记录见 §14
> - 基线：HEAD `212d77c9`（2026-11-24 19:03），`git status --porcelain` 28 项（并行会话在途，动工前先核）
> - 关联：`plans/027`（不许 big-bang 重写的理由，本计划继续遵守）、`plans/042`（搜索口径与工具栏收敛，已完成部分要保住）、
>   `plans/045`（铁律 A：新写的 UI 走 `src/components/ui/`）
> - 需求依据：`docs/reports/2026-11/2026-11-12-数据管理面板-需求基线与重规划输入.md` §12（五条工作流）、§13（功能对账）

---

## 0. 为什么不是「再压一压间距」

`plans/042` 已经把首屏从 418px 压到 210px、`users` 从 11 列砍到 6 列，而用户的反馈仍然是「不方便」。
原因不在密度，在**导航形状**：54 个页签被装进一条横向滚动的 chips 条（`DataAdmin.vue:163-188`，
样式 `:9049`），1440 宽下就已经看不全，抽奖模块 10 个、AI 配置 7 个。

设置页反过来：24 个条目、6 个组，一屏看全，且每条都写着「当前值」。两者的差别不是美化，是
**「找得到」这件事被解决了**。

所以本计划只解决这一个问题，不碰数据口径、不碰写路径、不碰表格能力。

> **数字口径说明（本文件的自证方式）**：§2 / §5 的所有计数都由脚本对
> `src/views/DataManagement/config/tabs.js` 穷举得出，不是手数。§5.1 给出对账式，
> 校验关系是「48 个进组 + 6 个删入口 = 54」。**如果改动了分配，必须重跑这个穷举**
> （脚本思路见 §5.1 末），否则下面的数字会立刻变成假话。

---

## 1. 三条判据（本计划所有取舍的依据）

| 判据 | 动作 | 判据来源 |
| --- | --- | --- |
| 多个页签查**同一张表**，或只是同一件事的不同视图 | **融合** | `config/tables.js` 的 `table:` 字段 |
| 操作对象不同、但必须共享上下文，或父级条目过多（>8 行） | **拆成子页** | §12.3 的「点击链会断」 |
| `TABS_ACTIONS` 只有 `['view']`，看完这件事就结束了 | **入口删除**（表保留） | `config/tabs.js` 的 `TABS_ACTIONS` |

> `TABS_ACTIONS` 共 54 条，其中 **21 条是纯 `['view']`**（实测统计，见 §8.1）。这 21 个里有 7 个
> 连「看完能干点什么」都没有 —— 它们是本计划第一批要动的（§4）。

---

## 2. 现状（实测，2026-11-25）

| 项 | 数值 | 怎么量的 |
| --- | --- | --- |
| 侧栏模块 `tabModules` | **18**（含 overview / system） | `config/tabs.js` |
| 页签名 `tabs` | **54**，其中 `type: 'page'` **9** 个 | 同上 |
| `tabIds` 总数 | **54**（与 tabs 一一对应，无孤儿） | 正则统计 |
| 表配置 `dataConfig` | **45** 条 `table:` 声明 | `config/tables.js` |
| 同表多入口 | `posts` **×3**（forum / reportedPosts / reviewPosts）、`profiles` **×2**（users / points） | 同上 |
| 独立控制台路由 | **5** 个 `-console`：`shop` / `hero` / `gate` / `xmas` / `avatar`；另有 **2** 个页内编辑宿主 `/admin/shop-editor`、`/admin/news-editor` | `router/routes/admin.ts`（共 12 条 `/admin/*`） |
| 主文件 | `DataAdmin.vue` **10,153 行**；另有**未追踪**的 `DataAdmin.vue.orig` 8,314 行（§9 处置） | `wc -l` / `git ls-files` |
| 后台样式类 | `google-components.css` 230 个 `.g-*` 选择器 | `grep -c` |
| 后台 lint 棘轮 | `--max-warnings 90` | `package.json:34` |

---

## 3. 目标结构：竖屏逐屏深入 / 横屏左栏常驻

```
竖屏（单栏钻取）            横屏（≥1024×600，两栏）
┌──────────────┐           ┌────────┬──────────────────────┐
│ 一级：目录    │           │ 目录    │ 右栏：页签列表        │
│  ↓ 点一行     │           │ 244px  │  或 内容（互斥替换）  │
│ 二级：子页    │           │ 常驻    │                      │
│  ↓ 点一行     │           │        │  ← 返回只发生在右栏   │
│ 三级：内容    │           └────────┴──────────────────────┘
│  ‹ 返回条     │
└──────────────┘
```

**两栏、不是三栏。** 三栏并置在 1440 宽下会把表格可用宽从 1132px 压到 904px —— `users` 现在
只有 6 列，再少 228px 就退回横向滚动，把 `plans/042` 的成果还回去。所以**目录与内容互斥替换**：
点组 → 右栏换成该组的行列表；点行 → 右栏换成内容；返回条只回到上一层。

断点复用设置页已有的单一真源 `settingsWideViewport`
（`src/composables/useSettingsChrome.js:37`，`(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)`）：

| 视口 | 形态 |
| --- | --- |
| 命中 `settingsWideViewport` | 两栏：左 244px 目录 + 右栏替换 |
| 未命中（竖屏 / 窄横屏） | 单栏逐屏深入，`SettingsSubpageHeader` 同款返回条 |

> ⚠️ **不改 `settingsWideViewport` 本身的断点值** —— 它同时被 `isGlobalNavbarVisible` 的
> 「设置子页隐藏导航岛」规则消费，改它会连带改前台导航行为。后台若需不同阈值，另建一个
> `adminWideViewport`，不复用同一个 ref。

---

## 4. 视觉规格：直接消费 `settings-glass.css`，不新造材质

设置页那套已经成熟（2026-09-30 重构、2026-11-24 A/B 过发丝线内缩），后台照抄即可：

| 元素 | 规格 | 出处 |
| --- | --- | --- |
| 组间节奏 | `.glass-settings` flex column，`gap: 26px` | `settings-glass.css:56` |
| 组标题 | 13px / 600 / 卡片**外**上方，`padding: 0 4px 7px` | `settings-glass.css:69` |
| 卡片本体 | `--liquid-bg-strong` + `--liquid-filter` + `--liquid-border` + `--liquid-radius-md` + `overflow: hidden` | `settings-glass.css:94` |
| 行 | `min-height: 44px`，`padding: 12px 18px`，`gap: 13px`，图标 30px | `settings-glass.css:111` |
| 单行行（无副标题） | `padding-top/bottom: 6px` → 落到 44px 档 | `settings-glass.css:170` |
| 发丝线 | `.gs-row + .gs-row::before`，`left: 61px`（内缩到文字起始处，**不穿图标**） | `settings-glass.css:152` |
| 左栏 | `grid-template-columns: 244px minmax(0,1fr)`，`gap: 30px`，`align-items: stretch` | `ProfileSettingsPanel.vue:1623` |
| 左栏行 | `min-height: 40px`，`padding: 9px 12px`，`border-radius: 10px`，14px/500 | `ProfileSettingsPanel.vue:1770` |
| 选中态 | 三通道：`--rail-pill-bg` 底 + 左缘 3×16px 蓝条 + 600 字重 | `ProfileSettingsPanel.vue:1816` |
| 进出场 | `gsPaneForward` / `gsPaneBack` 280ms `cubic-bezier(0.32,0.72,0,1)`，45ms/张错峰 | `ProfileSettingsPanel.vue:1714` |

> 上表前五行在 `src/views/user-center/UserSpace/styles/settings-glass.css`，后四行在
> `src/views/user-center/UserSpace/components/ProfileSettingsPanel.vue`（行号按 2026-11-25 工作树取）。

**三条不能想当然的地方：**

1. **`@import` 的作用域**。`settings-glass.css` 是经 `ProfileSettingsPanel.vue` 的
   `<style scoped> @import` 引入的，编译后规则带的是**父组件的 `data-v`**。直接在自己的
   `<style scoped>` 里 import 能生效（规则带自己的 `data-v`），但 `SettingsSubpageHeader.vue:47`
   那种「import 了却指望作用到子组件」会**全落空**。后台若要复用子组件，样式必须写在该子组件
   自己的 scoped 块里。
2. **`contain: paint` 会裁后代**。`.liquid-glass` 基础类带 `contain: paint`，左栏的吸顶 / 弹出层
   会被裁到 padding box（`AGENTS.md` §2「更多浮层」那条事故的同类）。后台左栏若沿用液态玻璃类，
   补 `contain: none`。
3. **`--userspace-nav-h` 后台不存在**。设置页的吸顶是 `top: calc(var(--userspace-nav-h,78px) + 12px)`；
   后台 `hideNavbar: true`、`--dm-nav-height: 0`（`AdminConsoleShell.vue:194`），必须显式覆写成 `0`，
   否则顶部白留 78px。

---

## 5. 分组方案：18 模块 → 8 组 32 行

**组顺序按日常频率排**（用户可调，见 §12 第 1 条）。`▸` = 子页。

| 组 | 行 | 行数 | 覆盖页签 |
| --- | --- | --- | --- |
| （置顶，不占组） | 今日待办：待发货 N · 待审 N · 待处理举报 N | — | — |
| **用户** | 用户 · 积分流水 · **权益发放 ▸**（积分发放 / 订阅发放） · 订阅管理 | 4 | 6 |
| **订单与履约** | 履约台 · 地址管理 | 2 | 4 |
| **抽奖与活动** | 抽奖配置 · 报名明细 · 帮人报名 · 保底中心 · 活动管理 · **活动台账 ▸**（活动平台 / 活动报名明细 / 活动发放台账） · **诊断 ▸** | 7 | 14 |
| **社区** | 论坛帖子 · 广告管理 · 摄影集 | 3 | 3 |
| **内容运营** | 新闻管理 · 发帖有奖 · 创作者展示 · **视觉装修 ▸**（首页装修 / 开屏管理 / 圣诞活动 / 头像框） | 4 | 3 |
| **审核** | 举报（举报明细 / 举报下架） · 已拒绝帖子 · 已拒绝评论 · 审核日志 | 4 | 6 |
| **AI** | 密钥与模型 · **场景模型 ▸**（博莱克 / 审核 / 实验室） · AI 额度 · **记忆与事实卡 ▸**（官方事实 / AI 沉淀 / 论坛事实卡） · **AI 日志 ▸**（联网搜索 / 实验室用量 / Key 审计） | 5 | 11 |
| **配置与工具** | 商品管理 · 媒体资源 · 网站设置 | 3 | 1 |
| **（删入口，不出现在侧栏）** | — | — | 6 |
| **合计** | **32 行** | **32** | **54** |

### 5.1 对账（54 个页签逐个有去处，无遗漏无重复）

| 组 | 用户 | 订单 | 抽奖 | 社区 | 内容 | 审核 | AI | 配置 | 删入口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 行 | 4 | 2 | 7 | 3 | 4 | 4 | 5 | 3 | — |
| 页签 | 6 | 4 | 14 | 3 | 3 | 6 | 11 | 1 | 6 |

`6+4+14+3+3+6+11+1+6 = 54` ✅；`4+2+7+3+4+4+5+3 = 32 行` ✅
（穷举脚本校验：`missing=[]`、去重覆盖 48 = 合计 48，无重复归组）

> **为什么「内容运营」3 个页签却有 4 行、「配置与工具」1 个页签却有 3 行**：
> `视觉装修 ▸` 收的 4 个独立控制台（`hero-console` / `gate-console` / `xmas-console` / `avatar-console`）
> 和 `商品管理` 一并收的 2 个（`shop-console` / `shop-editor`）、`新闻管理` 一并收的
> `news-editor` **不在 `tabs[]` 里**，只在 `tabModules[]` 里，所以不占「覆盖页签」计数，但占一行。
> `媒体资源` / `网站设置` 是 `PLACEHOLDER_ADMIN_SECTIONS` 的占位 section，同样不占页签。
> 这 7 个控制台入口 + 48 个页签 = **55 个落点**，都必须在 `ROUTE_MAP` 里有去处（现有守卫
> `admin-console-wiring.test.js` 已锁这一条）。

**举报归「审核」，不归「社区」**：`forumPostReports`（举报事件）与 `reportedPosts`（被举报的帖子）
是「按事件看 / 按对象看」两个视角，同组不同表 —— 合成一行、两个子视图，但**不合成一张表**。
把它们拆在「社区」和「审核」两个模块正是现在的错。

**消失的组：** `logs`（日志监控，6 个页签）—— 它们没有共同操作对象（AI 三个、抽奖一个、审计一个、
导出一个），只是都叫「日志」。按域归位后该组不存在。设置页也没有「日志」这一组。

**收进子页的三类：** 诊断（一个月开不了一次）、台账（活动期或对账才开）、装修（改版才开）。
它们占了高频位置却没被高频使用 —— `lottery` 模块 10 个页签里，有 **5 个**属于诊断
（`lotteryJoinAttempts` / `lotteryAuditLogs` / `lotteryDrawLogs` / `lotteryFailureStats` /
`lotteryNotificationJobs`），加上 `logs` 模块的 `lotterySchedulerLogs` 共 6 个，全在「诊断 ▸」里。

> ⚠️ **`lotteryEntries` 与 `lotteryJoinAttempts` 是两张表，不能算「报名成功/失败」的同表两视图**：
> 前者是 `lottery_entries`（报名席位），后者是 `lottery_join_attempts`（报名请求日志）。
> 所以「报名明细」只放 `lotteryEntries`，`lotteryJoinAttempts` 归诊断。

---

## 6. 融合清单：15 组

> 口径：**54 个页签 → 32 行**（§5 对账）。其中 6 个删入口、15 处融合、7 处拆成子页。
> 下表只列「融合 / 加深」，不重复 §5 的行数统计。

| # | 融合后 | 现在 | 证据 |
| --- | --- | --- | --- |
| 1 | 用户 | `users` + `points` | **同表 `profiles`**；`points` 的 saveStrategy 是 `users` 的严格子集（少 email/shipping 校验），列只少 3 个 ⇒ 它现在的作用只是「换一组默认列」 |
| 2 | 权益发放 ▸ | `points-grant` + `subscriptions-grant` | 同一套「找人 → 选额度 → 确认」交互 |
| 3 | 履约台 | `fulfillment` + `shopOrders` + `gifts` | 履约台读的就是 `shop_points_orders`(source=lottery) + `user_gifts`（`composables/fulfillment-queue.js:4`）；三行指向同一对象 |
| 4 | 诊断 › 开奖审计 | `lotteryDrawLogs` + `lotteryAuditLogs` | 都在答「谁在何时开了什么奖」，粒度不同 |
| 5 | 诊断 › 调度与异常 | `lotterySchedulerLogs` + `lotteryNotificationJobs` + `lotteryFailureStats` | 三者合起来才能答「通知卡在哪一步」 |
| 6 | 记忆与事实卡 ▸ | `coreMemories` + `aiMemories` + `forumMemories` | 表结构近同（内容 + 状态 + 归档/恢复），只差来源：官方人工 / 用户沉淀 / cron 抽取 |
| 7 | 审核日志 | `moderationLogs` + `adminAuditLogs` | 一个直接 insert `moderation_logs`，一个走 `log_admin_action` RPC ⇒ 两个写入口，问的是同一个问题 |
| 8 | AI 日志 ▸ | `aiWebSearchLog` + `apiKeyAuditLogs` + `labUsageRecords` | 三个只读页签，全属「AI 花了多少钱、哪里出错」 |
| 9 | 商品管理 | `products` + `shop-console` + `shop-editor` | **三个入口改同一张表**（`ShopConsole` 直接 update；`ShopEditor` 用 `dataConfig.products.table`） |
| 10 | 新闻管理 | `news` + `news-editor` | 与商品同构：表编辑 + 页内所见即所得 |
| 11 | 场景模型 ▸ | `bolekModels` + `moderation-model` + `lab-ai-model` | 都是「按场景选一个模型然后保存」；`bolekModels` 同时还是 `keys-models` 的模型来源 |
| 12 | 举报 | `forumPostReports` + `reportedPosts` | 一个看举报事件（`forum_post_reports`），一个看被举报的帖子（`posts` where status=limited）——「按事件看 / 按对象看」。**合成一行两个视图，不合成一张表** |
| 13 | 视觉装修 ▸ | `hero-console` + `gate-console` + `xmas-console` + `avatar-console` | 四个独立路由不能合成一页，但必须合成**一行 + 子页** |
| 14 | 活动台账 ▸ | `campaigns` + `campaignEntries` + `campaignRewards` | 三张表是「活动 → 报名 → 发放」一条链，必须共享同一个活动上下文才看得懂 |
| 15 | 密钥与模型（内部加深） | `keys-models` 一页 | 现在一页塞了「平台列表 + 密钥 + 模型」三件事 ⇒ 拆成「平台 → 该平台的密钥与模型」 |

---

## 7. 应该单独分出的 5 处

| 位置 | 现在 | 为什么必须拆 |
| --- | --- | --- |
| 用户详情 | 通用 `RecordPane` | 订单 / 积分流水 / 帖子**都不认用户名、只认 UUID** ⇒ 看一个人要手工 join 三次。要真实对象页：身份卡 → 诊断 → 处置 → 留痕 |
| 订单详情 | 抽屉里编辑 | 物流单号、地址、取消、重抽都要能操作，抽屉装不下也不该装 |
| AI 平台 | `keys-models` 左栏 | 平台是实体，密钥/模型是它的属性；现在平铺导致「加平台」和「给平台加模型」看起来是同一件事 |
| 抽奖 › 诊断 | 6 个并列页签（模块内 5 个 + 日志模块的 `lotterySchedulerLogs`） | 低频诊断占用 6 个高频位置 |
| 帖子三视图 | `forum` / `reportedPosts` / `reviewPosts` | **不该合成一张表，但该合成一组**：全量库（可改正文）、待处置队列（可 moderate）、已拒绝归档（只读）是三件事。Now 的错不在拆，在拆到了「社区」「审核」两个模块 |

> 门槛：**父级 > 8 行才允许再开一层**。否则多一次点击只是成本。54 个页签的问题不是「太扁平」，
> 是「分组分错了」——`community` 与 `operations` 的边界本来就糊。

---

## 8. 「没必要」清单：第一批要动的 6 个（+ 2 条 label 清理）

### 8.1 判据：`TABS_ACTIONS` 纯 `view`

实测 54 条动作里 **21 条是 `['view']`**：
`pointsTransactions, subscriptions-grant, anniversaryClaims, forumWeeklyCheckins, forumPostImages,
forumPostReports, moderationLogs, notifications, adminAuditLogs, lottery-join-grant, lotteryEntries,
lotteryDrawLogs, lotteryFailureStats, lotterySchedulerLogs, lotteryNotificationJobs,
lotteryJoinAttempts, lotteryAuditLogs, aiWebSearchLog, apiKeyAuditLogs, labUsageRecords,
userDataExportJobs`

其中「看完也无事可做」的 7 个：

| 页签 | 为什么没必要 | 处置 |
| --- | --- | --- |
| `forumPostImages` 图片审核 | 无任何处置动作；审核结果已在 `posts` 上体现 | 入口删除，状态并入帖子详情 |
| `notifications` 通知管理 | 只读，且**不是送达记录**（需求文档 §13.3 已更正过这个误判） | 入口删除；改到用户详情里看「这个人收到什么」 |
| `forumWeeklyCheckins` 每周签到 | 只读 | 入口删除，并入用户详情 |
| `anniversaryClaims` 周年领取 | 只读，且是一次性活动（已结束） | 入口删除 |
| `userDataExportJobs` 用户导出 | 只读、低频 | 入口删除，并入用户详情 |
| `lotteryFulfillments` 履约与通知 | 履约部分与履约台重复；通知部分已有独立页签（`lotteryNotificationJobs`） | 入口删除 |
| `api-keys` / `freemodels` | 已不在 `tabIds` 里，只剩 label 兼容 | label 一起删（旧深链落到 `keys-models`） |

> **为什么是 6 个而不是 7 个**：最后一行 `api-keys` / `freemodels` **本来就不在 `tabIds` 里**
> （§2 已实测：`tabIds` 去重后正好 54 = `tabs` 54 条），所以它们不参与「54 → 32」的对账，
> 属于**纯 label 清理**。真正从侧栏消失的是前 6 个。

### 8.2 删入口 ≠ 删表（硬纪律）

沿用 `api-keys` 的现成做法：**`tabs[]` 与 `TABS_ACTIONS` 的定义保留**（label 解析与旧深链要用），
只从 `tabModules[].tabIds` 里移除。否则 `?tab=xxx` 会算不出标题
（`useDataAdminNavigation` 的 `getTabLabel` 直接查 `tabs`）。

⚠️ `lotteryFulfillments` 是个特例：`lottery_winner_fulfillments` **仍在被读**
（`useLotteryOperations.js:34,66` 的待办指标）；迁移 `2026112001` 之后开奖是**双写**
（该表 + `shop_points_orders` source='lottery'），但履约台只读后者。所以：**删入口可以，
删表要等 `useLotteryOperations` 的指标切到订单表之后**，不在本计划范围内。

---

## 9. 三期落地（每期可独立上线、独立回滚）

### 期 1 · L2：页签条 → 行列表（**先做这个**）

| 项 | 内容 |
| --- | --- |
| 范围 | 只改 `DataAdmin.vue:163-188` 那一段与 `:9049` 的样式；`tabModules` / `tabIds` **不动** |
| 新增 | `components/AdminTabList.vue`（吃 `tabIds` + `currentTab` + `getTabLabel`，吐 `.gs-rows` 卡片行） |
| 为什么先做 | 纯渲染层改动，**不碰任何数据口径**；做完就能拿真实数据判断「顺手不顺手」 |
| 顺带收益 | tab 条从内容区顶部挪走后，表格第一行可从 210px 再抬到 ~160px |
| 反证 | 把 `AdminTabList` 改回 chips ⇒ 探针 P1 红 |

### 期 2 · L1：侧栏按 8 组重排

| 项 | 内容 |
| --- | --- |
| 范围 | `config/tabs.js` 的 `tabModules` 整体替换为 8 组；`AdminSidebar.vue` 换渲染（组头 + 行 + 当前值列） |
| 连带必改 | `function-index.js`（group 从模块名改工作流名，55 条 `TAB_ALIASES` 要跟着重指）、`ADMIN_PAGE_META`、`query-config.js` 的 `ADMIN_SECTION_DEFAULT_TABS` / `DATA_CONSOLE_SECTIONS` |
| 门禁影响 | `admin-console-wiring.test.js`（8 条）、`admin-function-index.test.js`（15 条）会红，见 §11 |
| 反证 | 少登记一个 console 模块 ⇒ wiring 第 2 条红 |

### 期 3 · 竖屏卡片化 + 待办计数接真实 RPC

| 项 | 内容 |
| --- | --- |
| 范围 | 竖屏 `.gs-rows` 全屏；三级内容改卡片流（不做横向滚动表格）；置顶「今日待办」三个数 |
| 后端 | 5 个 count 走**一个** RPC，别让前端打 10 张表（§12.11 已提过） |
| 反证 | 移除卡片化媒体查询 ⇒ 探针 P4（竖屏无横向溢出）红 |

### 期 4（不在本计划）· 对象页

用户 / 订单 / 内容三个真实详情页（§7 前两行）。它要动数据层（聚合查询），单独立计划。

---

## 10. 门禁与自证清单

### 10.1 动工前必须先跑一遍空基线

```bash
git status --porcelain | wc -l      # 现 28 项（并行会话在途，先分清哪些是自己的）
npm run verify:fast
```

### 10.2 三期各自的必跑项

| 期 | 必跑 |
| --- | --- |
| 1 | `npm run verify:fast` + `node scripts/probes/probe-data-admin-density.mjs` + `probe-data-admin-pages-mobile.mjs` |
| 2 | `npm run verify`（全量，因为动了 tabs / rbac / function-index）+ `probe-admin-function-search.mjs`（29 断言）+ `probe-admin-console-shell.mjs` + `probe-console-entries.mjs` |
| 3 | `probe-data-admin-portrait.mjs` + `probe-data-admin-landscape.mjs` + `probe:a11y` |

### 10.3 三条容易假绿的坑

1. **`probe-admin-console-shell.mjs:141` 断言 `navCount >= 8`**，`probe-admin-function-search.mjs:161`
   断言 `rows >= 8`。8 组正好卡在下界上 —— 少一组就红，但也**测不出「组内行数是否合理」**。期 2 要把
   下界提到 `>= 8` **且**新增一条「每组行数 ≤ 8」的断言，否则「一屏看全」这个目标没有任何门禁。
2. **`data-admin-tab-config-coverage.test.js` 只校验「有配置」，不校验「有入口」**。页签从 `tabIds`
   移除后它会照样绿（因为它遍历的是 `tabs` ∩ `dataConfig`）。所以删入口必须**另有**断言：
   `tabModules` 里出现的每个 id 都必须在 `tabs` 里；反向不要求。
3. **`settings-glass.css` 的 scoped 作用域**（§4 第 1 条）。期 1 写完必须肉眼过一遍截图，
   不能只看程序化差分 —— 该仓库出过「差分报 1 项、肉眼大面积塌陷」的先例（`.workbuddy/memory/MEMORY.md` 三条之一）。

### 10.4 需要新增的门禁

| 门禁 | 守什么 | 反证 |
| --- | --- | --- |
| `tests/unit/admin-tab-groups.test.js` | 每个组的行数 ∈ [1, 8]；`tabModules` 的 id 全部在 `tabs` 里；`tabs` 里被「融合」的旧 id 不再出现在任何 `tabIds` | 给任一组加第 9 行 ⇒ 红 |
| 扩展 `probe-admin-console-shell.mjs` | 侧栏一屏可见（组数 × 行高的总高 ≤ 视口高，竖屏除外） | 把某组拆回单行 6 项 ⇒ 红 |

---

## 11. 风险与不做的事

### 11.1 已知风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **两栏下组内切 tab 多一次返回** | 用户日常在用户 / 积分发放 / 订阅之间来回切，每切一次要「返回 → 再点」 | 期 1 先只做行列表（仍是单栏，不引入这个代价）；两栏落地后实测一周再定是否给中栏加「固定」开关 |
| `users` + `points` 合并后权限不对等 | `users` 有 `delete/ban/mute`，`points` 只有 `edit` | 既然 RBAC 本就是单 admin 死代码（需求文档 §2.3 实测），合并后按 `users` 的权限走 |
| 期 2 一次性动 4 个真源文件 | `tabModules` / `TABS_ACTIONS` / `function-index` / `query-config` | 按组推进，每融一组跑一次 `npm run verify:fast` + `probe-admin-function-search`，不做 big-bang |
| 深链断裂 | 旧书签 `?section=&tab=` 是既有契约 | `no-orphan` 规则：被融合的旧 tab id 必须能在新结构里解析到落点（期 2 加断言） |

### 11.2 明确不做

| 不做 | 理由 |
| --- | --- |
| 改 `DataAdmin.vue` 的表格 / 筛选 / 批量 / 抽屉 | 这是「抄壳不抄体」的边界；动了就是 `plans/027` 警告的 big-bang |
| 改任何 RLS / 表结构 / RPC | 期 3 只新增一个 count RPC，不改既有 |
| 改 `settingsWideViewport` 的断点值 | 它同时喂前台导航判断（§3 注） |
| 删 `DataAdmin.vue.orig`（8,314 行，**未追踪**） | ⚠️ 需要用户确认。`git ls-files` 证实它不在版本控制里 ⇒ 删了不可恢复。建议先移到 `docs/reports/archive/`，不直接 `rm` |
| 重做 `google-components.css` 的 230 个 `.g-*` | 属于 `plans/045` 的存量迁移，与本计划的导航形状正交 |
| 删 `lottery_winner_fulfillments` 表 | 仍被 `useLotteryOperations` 读取（§8.2） |

---

## 12. 需要用户拍板的 2 件事

1. **组顺序**：现按「日常频率」排（用户 → 订单 → 抽奖 → 社区 → 内容 → 审核 → AI → 配置）。
   若实际是「社区和抽奖最勤」，告诉我，这两组往上提。
2. **`DataAdmin.vue.orig` 怎么处置**：8,314 行**未追踪**文件（`git ls-files` 已证实），删了不可恢复。
   建议移到 `docs/reports/archive/` 而不是直接 `rm`。

> 「审核是否独立成组」已在 §5 定案（**独立**，4 行 6 页签，举报归它）；不再作为待决项。

---

## 13. 交付锚点

期 1 完成时，`git show --stat` 里应当只有：

- 新增 `src/views/DataManagement/components/AdminTabList.vue`
- 修改 `src/views/DataManagement/DataAdmin.vue`（模板一段 + 样式一段）
- 新增 `tests/unit/admin-tab-groups.test.js`（只加「tabModules ⊆ tabs」这一条）
- 扩展 `scripts/probes/probe-admin-console-shell.mjs`（侧栏一屏可见）

**除此之外的文件出现在 diff 里，说明 L3 被动了 —— 停下来重看。**

---

## 14. 落地记录（2026-11-25 · commit `da691bb1`）

### 14.1 实际交付

| 期 | 交付 | 与原计划的差异 |
| --- | --- | --- |
| 1 | `components/AdminTabList.vue`（221 行）+ DataAdmin 模板/样式替换 | 一致 |
| 2 | `config/nav-groups.js`（386 行）+ `AdminSidebar.vue` 分组渲染 | **方案变了**：原计划改 `tabModules`，实际改为「`tabModules` 不动 + 新增 `NAV_GROUPS`」，见 14.2 |
| 3 | 分区待办角标 + 竖屏确认 | **范围缩小**：竖屏卡片化早已存在（`mobile-card-list`），不需要重做，见 14.3 |
| 4 | 未做 | 对象页（用户/订单/内容详情）要动数据层，仍单独立计划 |

### 14.2 为什么没改 `tabModules`（这是本次最关键的一次改判）

计划原文 §5 打算把 `tabModules` 的 18 个模块整体换成 8 组。实施时发现一个硬阻塞：

`tests/unit/admin-console-wiring.test.js` 有 8 条断言，其中一条要求
**每个 `/admin/*-console` 路由都必须在 `tabModules` 里独立占一席**（type='page'、section='data'、
有 ROUTE_MAP、有 ADMIN_PAGE_META），否则侧栏与命令面板里找不到入口。而设置页式导航要把
4 个装修控制台**合成一行**（「视觉装修」）。

两者颗粒度天生不同：`tabModules` 是**落点注册表**（一个路由一席），侧栏要的是**渲染结构**（一行可带子页）。

⇒ 拆成两份，`tabModules` 保持 18 个不动，`NAV_GROUPS` 只管分组。结果是
`admin-console-wiring`（8）、`admin-function-index`（15）、`data-admin-tab-config-coverage`（7）、
`admin-editor-naming`（8）、`data-admin-page-tab-wiring`（4）、`admin-initial-tab`（10）
**共 52 条既有断言零改动全绿**。这比「改 tabModules 再修 6 个测试文件」安全得多。

副作用（有意接受）：被融合掉的页签（如 `points`）在侧栏没有独立行了，但 `tabModules.tabIds`
里仍留着它 ⇒ 功能搜索照旧能搜到。**侧栏负责「常用」，搜索负责「全量」**。

### 14.3 竖屏卡片化：不需要做，因为早就有

计划 §9 期 3 写「竖屏 `.gs-rows` 全屏；三级内容改卡片流」。实施时发现
`DataAdmin.vue` 已有 `mobile-card-list` + `isMobileView`（`computeMobileView()`：
宽度 <768 或粗指针 <950×550），竖屏下表格本来就不是横向滚动的。
所以期 3 只做了待办角标，**没有重做卡片**——重复实现一套只会多一份要维护的东西。

### 14.4 待办角标：不新开 RPC

计划 §9 期 3 原写「5 个 count 走一个 RPC」。实际发现宿主已经有：
- `moderationPendingCount`（reportedPosts + reviewPosts + reviewComments 的 tabCount 之和）
- `lotteryDueDrawPending`（**boolean**，不是数量）

⇒ 直接复用，`buildGroupBadges` 只负责挂到分区上。**没有新增任何查询。**

⚠️ `lotteryDueDrawPending` 是布尔值这件事必须记住：把它当 count 传会让角标显示「1」，
而实际可能 5 场到期，那个数字是假的。所以它对抽奖分区只画**圆点**不画数字
（`buildGroupBadges` 里用 `true` 表达「只画点」）。

### 14.5 过程中撞到的三个坑（都已修，且都不是本次引入）

**① `styles/overlays.css:1163` 是语法错误 ⇒ 整个后台页打不开。**
原来 reduced-motion 块只有两行选择器 + 悬空逗号、规则体为空：
```css
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active,
  }        /* ← 悬空逗号后直接 } */
```
`postcss-import` 解析到 `}` 直接抛 `Unknown word`，CSS 链编译失败 ⇒
`/admin/data-management` 的动态导入 500、页面白屏。
**它自 2026-06-28（提交 `47663c2e`）就存在，五个月没人发现** —— 因为单测读的是源码文本、
不跑 postcss，而这页长期没人真在浏览器里打开过。补成合法规则（reduced-motion 下关掉抽屉过渡）。

**② 内容区与侧栏重复渲染同一批页签（期 1 遗留）。**
期 1 用 `currentModuleTabIds.length > 1` 判是否渲染 `AdminTabList`。期 2 侧栏已经列全之后，
同一批入口就在左右两栏各出现一次（截图实测：「用户/积分流水/权益发放」在左，右边又来
「用户管理/积分管理/积分发放」）。改成 `unlistedModuleTabIds`：
只补「侧栏没列出、且不在 `HIDDEN_TAB_IDS` 里」的页签。正常情况下它恒为空数组。

**③ 选中态是整块实心蓝，不是设置页的样子。**
`.g-nav-btn.is-active` 用 `background: var(--sidebar-primary)` 实心主色。
分组行必须覆盖成设置页那套三通道（淡染 + 左缘 3px 蓝条 + 600 字重），
且选择器要抬到 `.g-nav-btn.g-nav-row.is-active`（0,3,0）—— 与 `.g-nav-btn.is-active`（0,2,0）
同权重时只能靠源序决胜，而源序会随格式化漂移。实测计算样式：
`bg: rgb(219,234,254)` / `weight: 600` / `::before` 宽 3px 蓝条。

### 14.6 验证结果

| 项 | 结果 |
| --- | --- |
| 全量单测 | **412 文件 / 5303 passed + 1 skipped** |
| lint 棘轮 | 0 error / **89 warning**（上限 90，未上调） |
| `npm run verify` | 除 `check:untracked-imports` 外全绿；唯一红是并行会话的 `Login/login-gate.css` 未追踪，不在本次范围 |
| 新守卫 `admin-tab-groups.test.js` | **24 条全绿**；四条反证实测变红（删整组 / 某组超 8 行 / 删控制台行 / 删 mergedFrom） |
| `probe-admin-console-shell` | **27/27**（顺带修了它断言旧名「商城装修」的长期假红） |
| 横屏 1440×900 | 8 组 32 顶层行、零 `pageerror`、选中态为淡染 + 蓝条 |
| 竖屏 390×844 | 横向溢出 **0px** |
| 深链 `?tab=points` | 侧栏正确高亮「用户」（融合页签落回宿主行） |

### 14.7 提交纪律（踩到的坑）

pre-commit 的 lint-staged **把并行会话的 `src/utils/global-navbar-visibility.js` 一并暂存了**
（它当时在工作区有未提交改动）。发现后：`git reset --soft HEAD~1` → `git restore --staged <他人的文件>`
→ 路径式重新提交。最终提交 7 个文件，
他人的改动**完好保留在工作区**（`M src/utils/global-navbar-visibility.js`）。
这正是 `docs/guides/AI-ENV.md` §2 第 1 条警告的场景。

### 14.8 下一步

- 期 4：用户 / 订单 / 内容三个真实对象页（要动数据层聚合查询）。
- 「待发货」分区角标：需要一个跨表 count RPC，本次刻意没做。
- 抽奖分区角标从圆点升级成真实场次：需抽奖工作台把 snapshot 里的计数透上来。

---

## 15. 自审复核（2026-11-25 · commit `bdf928e2`）

§14 交付后立刻做了一次逐文件复核，**发现 3 处「写了但没生效」**。这类缺陷的共同点是：
不报错、不白屏、不测试红，只表现为「新功能好像不存在」。记在这里因为它们都是**验收方式**的教训。

### 15.1 修掉的 3 处静默失效

| # | 病灶 | 为什么程序化检查没抓到 | 修法 |
| --- | --- | --- | --- |
| 1 | **`AdminTabList` 一次都没渲染过** | 组件能编译、能挂载逻辑、字形也正确 —— 只是 `v-if` 恒为假 | 新增 `LISTED_TAB_IDS` |
| 2 | **深链进子页时侧栏无一高亮** | 高亮类确实加上了，只是父级折叠着看不见 | 按 `activeRowId` 反查父级并自动展开 |
| 3 | **分组模式下权限置灰缺失** | 平铺分支有 `is-denied`，分组分支**整条路径都没写** | 宿主逐行算 `denied` |

**① `AdminTabList` 死代码**（最关键，因为它是期 1 的唯一交付物）
`unlistedModuleTabIds` 拿 `ROW_ID_BY_TAB_ID.keys()` 当「侧栏已列出」集合，
但那张表是**高亮反查表**、刻意含 `mergedFrom`（`points` → `users`）。
于是 `points` / `shopOrders` / `gifts` 被当成「已列出」⇒ 该列表恒为空。
实测 9 个模块全部 `unlisted=[]`，**从提交那一刻起组件就没出现过**。

教训：`ROW_ID_BY_TAB_ID` 与 `LISTED_TAB_IDS` 现在并列存在，语义差写进两边注释，
并由守卫锁死（`LISTED ⊆ ROW_ID`、两者**必须不等**、每个可达页签要么在 LISTED
要么在某个 `mergedFrom` 里 —— 不留第三种状态）。

**② 深链进子页无高亮**
`?tab=points-grant` → `activeRowId = 'points-grant'`，它挂在默认折叠的「权益发放」下，
只有父级 `is-descendant-active` 淡染，还得先展开才可见。
新增 watch：按 `activeRowId` 反查父级并展开。
⚠️ 刻意**只依赖 `activeRowId`**、不依赖 `expandedRowIds` —— 否则用户手动折叠父级的那一下
会被立刻弹开，变成「打不开的抽屉」。

**③ 分组模式权限置灰缺失**
平铺分支靠 `filteredModules` 算 `denied`；换成分组渲染后**没有任何代码算它**，
所以无权模块看起来和能点的一模一样，点下去才弹提示。
宿主 `navGroups` 逐行算：`tab` 查归属模块 / `module` 查自身 id /
`group` 行**不置灰**（它只是抽屉，里面可能一半有权限一半没有，置灰会挡住能进的子页）。
`onRowClick` 把 denied 判断提到**最前**，否则无权父行点一下还能展开，看着像「能进去」。

### 15.2 删掉的 2 处死代码

- **`GROUP_ICONS` + `iconFor`**：判的是 `row.isGroupRow`，而**全仓没有任何地方产出该字段**
  （`nav-groups.js` 只挂 `groupId`）⇒ 恒返回空串，从上线起没渲染过一个图标。
  删而**不是**补字段：这些 emoji 是按分区映射的（users→👤），与组头正上方的分区名重复，
  等于把同一个词说两遍；设置页左栏同样无图标（图标在内容区 `.gs-row` 上）。
- **`NAV_TOP_ROWS`**：零消费方。

### 15.3 守卫 24 → 32 条

新增两组断言，每条都做过反证：

| 反证 | 变红条数 |
| --- | --- |
| `LISTED_TAB_IDS` 退化成 `NAV_ROW_BY_ID.values()`（等价于原来的 bug） | **4 条** |
| 某个 `module` 行指向不存在的 id（模拟新增控制台忘登记） | **3 条** |

### 15.4 浏览器实测（1440×900，mock PostgREST）

| 检查 | 结果 |
| --- | --- |
| `?tab=points-grant` | `active=积分发放`，父行「权益发放」自动展开 ✅ |
| 侧栏结构 | 8 组 / 32 顶层行 / emoji 图标残留 **0** ✅ |
| `?tab=points` | 高亮「用户」，内容区不再重复列页签 ✅ |
| 内容区 `tab-row` | lotteries **0** / forum **0** / users **1**（`points` 的可达入口，合理） |
| `pageerror` | **0** |

### 15.5 提交纪律：同一个坑踩了两次

`da691bb1` 时 lint-staged 卷进 `global-navbar-visibility.js`，撤出了。
`bdf928e2` 的**第一次提交又把 `BohActivityAvatar.vue`（48 行）与
`ProfileSettingsPanel.vue`（424 行）卷了进来** —— 6 个文件而非 4 个。
同样用 `git reset --soft HEAD~1` + `git restore --staged <他人文件>` 修掉，
最终 4 文件 227 行，他人改动完好留在工作区。

**结论：路径式 `git commit -- <paths>` 并不能阻止 lint-staged 卷文件。**
唯一可靠做法是**提交后立刻 `git show --stat HEAD` 核对文件数**，
发现多的就 `reset --soft` 重来。这一条值得提到 `AI-ENV.md`。

### 15.6 验证（提交后的树）

- 全量单测 **412 文件 / 5311 passed + 1 skipped**（较 §14 多 8 条，即新增守卫）
- 后台相关 7 个守卫文件 **84 条全绿**
- lint **0 error / 89 warning**（上限 90，未上调）
- `verify` 唯一红仍是并行会话的 3 个未追踪文件，不在本次范围

### 15.7 仍未处理

- `xmas-console` 不在 `useDataAdminNavigation.js` 的 `DATA_SECTION_MODULES` 里
  （同族的 hero / gate / avatar 都在）。`?section=data` 时它的 `activeModule` 同步可能被
  复位成 `users`，导致侧栏高亮与内容不一致。**既有缺陷、非本次引入**，需单独立项复核。
