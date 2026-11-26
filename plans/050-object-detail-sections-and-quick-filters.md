# 050 · 对象页分段 + 日期快捷筛选 + 积分内联改

> **口径（2026-11-25 用户构思图）：** 用户 / 订单 / 内容三类对象点进去是**详情全屏页**，
> 详情页里**分段呈现**（不是一列标签值平铺）：用户是「身份 → 积分/订阅层级 → 发令牌」，
> 订单是「用户名 + 下单日期 / 礼物内容 / 地址（支持一键复制）/ 状态」。
> 状态点一下就地选（不用跳页）；积分和订阅层级点一下就地改。
> 列表侧需要**日期快捷筛选**（配合进度筛选）。
>
> - 编写日期：2026-11-25
> - 状态：**期 1（详情分段）+ 期 2（日期快捷）+ 期 3（积分内联 / 订阅跳转 / p_reason）已落地**；期 4（一次性令牌）待语义
> - 关联：`plans/049`（本方案的前提：导航整页化 + 新增对象页已落地）、
>   `plans/027`（详情页 D1/D2，本方案在它之上做分段）、
>   `plans/048`（分组导航，定义了「哪些页签属于哪个对象」）
> - 用户已确认：**订单状态沿用现有四档**，不加「运输中」

---

## 0. 一句话

**把详情页从「13 个字段平铺」改成「3 段卡片流」，并在列表补上日期快捷档。**
积分改走已有的 RPC（它本来就支持负数），订阅/令牌单独看。

---

## 1. 现状核对（实测，不是推测）

| 图里的元素 | 当前实现 | 真源 |
| --- | --- | --- |
| 点列表行 → 详情全屏页 | ✅ 已有（`DataManagementRecord` 路由） | `router/routes/admin.ts:49` |
| 详情页字段呈现 | ❌ **一列平铺**：`grid 2 列 × N 行`，只读文本，13 个字段一路排下来无分组 | `detail/DetailFields.vue:3` |
| 详情页编辑 | ✅ 有（页内 embedded，点「编辑」整块换成表单） | `plans/027` D2 |
| 地址一键复制 | ✅ 有（`copyAddressBundle`，礼物单） | `DataAdmin.vue:4321` |
| 订单状态切换 | ✅ 有，但只有「推进到下一档」一颗按钮，**不能任选** | `FulfillmentWorkbench.vue:236` |
| 订单状态枚举 | ✅ 四档：`preparing / shipped / completed / cancelled` | `fulfillment-queue.js:15-18` |
| 状态机 | ⚠️ **单向**：`preparing → shipped → completed`，`cancelled` 只能从非终态进 | `fulfillment-queue.js:45-50` |
| 日期筛选 | ⚠️ 只有「起始日 / 结束日」两个 `<input type=date>`，藏在「筛选」折叠面板里 | `DataAdmin.vue:594,601` |
| 积分改余额 | ⚠️ 只能「发放」（前端 `amount > 0` 硬校验），**不能扣** | `PointsGrantConsole.vue:211` |
| 订阅层级改 | ✅ 有独立页签（订阅发放 / 订阅管理），但不在对象页里 | `SubscriptionGrantConsole.vue` |
| 「一次性令牌」 | ❌ **全仓无此功能**（只有 API Key） | — |

### 1.1 一条关键发现：RPC 本来就支持扣减

```sql
-- 2026081104_points_grant_batch_revoke.sql:57
set points = greatest(0, points + p_amount)
```

`admin_grant_points(p_user_ids, p_amount, p_remark)` 对**负数完全支持**：
`greatest(0, …)` 保证不扣成负、流水照记。前端 `PointsGrantConsole.vue:211` 的
`amount <= 0` 校验是**纯 UI 限制，不是后端约束**。

结论：「积分扣除」不需要新 RPC、不需要迁移，**只要放开前端校验 + 加确认**。
这是本次四项里代价最低的一项。

> ⚠️ 但 `reason` 被硬编码成 `'admin_grant'`（同文件 `:66`）。扣减也记成
> 「管理员发放」会让流水读起来是假的。两个选择：
> · 前端不动后端，接受流水 reason 统一（**代价：账本语义失真**）
> · 加一个 `p_reason` 参数重写 RPC（**代价：一次迁移**，但账本干净）
> 我倾向后者，且它顺手修掉 `plans/007` 已记的「先 UPDATE 后 INSERT 读余额」竞态。

---

## 2. 期 1 · 详情页分段（风险最低，建议先做）

### 2.1 结构

`DetailFields.vue` 从「一个 grid」改成「接收分组配置，按组渲染卡片」：

```
┌─ 身份 ──────────────────────┐
│ 用户名   probe_test          │
│ 生日     03-14               │
└──────────────────────────────┘
┌─ 资产 ──────────────────────┐
│ 积分     1,280        ›      │  ← 点开内联改（期 3）
│ 订阅层级 Pro · 至 2027-03    │  ← 点开内联改（期 3）
└──────────────────────────────┘
┌─ 操作 ──────────────────────┐
│ 发放一次性令牌        ›      │  ← 期 4（需先定语义）
└──────────────────────────────┘
```

### 2.2 分组配置从哪来（不新造一份真源）

`config/fields.js` 里每个表的字段列表已经带了 `group` 字段
（`users` 的 `points: ['role','points','experience','join_date']` 这种是**写权限**分组，
不是展示分组——不能混用）。

所以展示分组**新增一份** `config/detail-sections.js`：

```js
// tabId → 展示分段。[{ id, label, fields: [...] }]
// fields 里每一项是字段 key，或 { key, action: 'edit-points' | 'edit-tier' | 'issue-token' }
export const DETAIL_SECTIONS = {
  users: [
    { id: 'identity', label: '身份', fields: ['username', 'birth_month', 'birth_day'] },
    { id: 'assets', label: '资产', fields: [
        { key: 'points', action: 'edit-points' },
        { key: 'level', action: 'edit-tier' },
    ]},
    { id: 'actions', label: '操作', fields: [{ key: '__issue_token', action: 'issue-token' }] },
  ],
  // 没配的表：退回「一个分组、全部字段」，与现在完全一致（零回归）
};
```

**没配 = 保持现状**，这是刻意的：54 个页签里只有 3–5 个需要分段，
不应让其余 49 个跟着变样。

### 2.3 两张卡片的视觉规格

直接复用 `plans/049` 与设置页那套，不新造材质：

| 元素 | 规格 | 出处 |
| --- | --- | --- |
| 卡片 | `--liquid-bg-strong` + `--liquid-radius-md`(16px) + `--liquid-border` + `overflow:hidden` | `settings-glass.css:94` |
| 组标题 | 13px/600，卡片**外**上方，`padding: 0 4px 7px` | `settings-glass.css:69` |
| 行 | `min-height: 44px`，`padding: 12px 18px` | `settings-glass.css:111` |
| 发丝线 | `.row + .row::before`，`left: 18px` | `settings-glass.css:152` |
| 可点行右侧 | `›` 或当前值缩略（`gs-value` 同款） | `ProfileSettingsPanel.vue` |

### 2.4 反证

- 去掉 `DETAIL_SECTIONS.users` ⇒ 「用户详情有 3 段」红
- 把 `groups` 传成空 ⇒ 「未配置的表退回单一分组」红（保证 49 个表零回归）

---

## 3. 期 2 · 日期快捷筛选

### 3.1 现状的问题

`dateFromFilter` / `dateToFilter` 是两个原生 date input，在「筛选」折叠面板里
（`DataAdmin.vue:594-601`、`:618`）。要看「今天新注册的用户」得：展开筛选 → 点两次
日历 → 选两次日期。这是每日常规动作，不该走三步。

### 3.2 方案：常驻分段控件 + 保留自定义

```
[ 全部 ] [ 今天 ] [ 近 7 天 ] [ 近 30 天 ] [ 自定义 ▾ ]
```

- 前四档是**纯前端计算**，直接写 `dateFromFilter` / `dateToFilter`（复用现有链路，
  零新查询）
- 「自定义」展开现有的两个 date input
- 每档的具体日期显示在 tooltip（`今天 = 2026-11-25`），避免「近 7 天」到底是 7×24h
  还是「含今天共 7 天」的歧义 → **取「含今天共 7 天」**，与设置页/前台口径一致

### 3.3 只在该表有日期列时出现

`fields.js` 里声明了 `created_at` / `join_date` / `draw_at` 的表才显示。
没有日期列的表（如 `coreMemories`）不该出现一个点了没反应的控件。

### 3.4 反证

- 让某表没有日期列 ⇒ 「不显示快捷档」红
- 点「近 7 天」⇒ 断言 `dateFromFilter` = 今天 −6 天、`dateToFilter` = 今天

---

## 4. 期 3 · 积分 / 订阅层级内联改

### 4.1 积分：放开校验 + 二次确认（后端已有能力）

| 项 | 做法 |
| --- | --- |
| 入口 | 详情页「资产」段，`积分 1,280 ›` |
| 交互 | 就地展开一栏：`[+ 发放] [- 扣除] [数字输入] [备注]`，**不弹浮层**（延续 049 的口径） |
| 校验 | 允许负数；`0` 拒绝（RPC 也拒）；扣除后余额不得为负（RPC 的 `greatest(0,…)` 兜底，但前端要先拦，否则用户以为扣了 500 实际只扣了余额那些） |
| 确认 | 必弹差异确认：`1280 → 780（-500）`，附备注 |
| 写入口 | 复用 `grantPoints()`（`points-admin-api.js:4`），不动 |

**必须做的一件事**：`reason` 语义。见 §1.1 —— 建议加 `p_reason` 参数（迁移 1 个），
否则所有扣减在账本里都写成「管理员发放」。

### 4.2 订阅层级：走已有的发放页签，对象页只做跳转

订阅有完整生命周期（plan_code / billing_cycle / 起止日 / 状态），
在对象页里内联改等于把 `SubscriptionGrantConsole` 重写一遍。

**建议：对象页「订阅层级」那行只显示当前值与到期日，点一下跳到已有页签并预填该用户。**
这是「一页一个完整页面」的正确延伸：改订阅这件事本身有 6 个字段，
它值得一个完整的页，不值得一个内联小面板。

### 4.3 反证

- 把 `amount > 0` 校验加回去 ⇒ 「允许扣除」红
- 扣除超过余额 ⇒ 断言前端在确认前就拦住（不是等 RPC 返回 `greatest(0,…)` 静默截断）

---

## 5. 期 4 · 一次性令牌（**需要先定语义，不建议现在动**）

全仓无实现。动手前必须回答三个问题，否则做出来大概率不是你要的：

| 问题 | 为什么必须定 |
| --- | --- |
| 它用来干什么？ | 「一次性登录码」/「一次性兑换码」/「重置密码凭证」是三种完全不同的东西，表结构、过期策略、消费方全不同 |
| 谁消费它？ | 用户自己在某页输入？还是嵌在邮件链接里？前者要一个输入框，后者要一条路由 + 中间页 |
| 有效期与次数？ | 「一次性」= 用一次即废，但没消费的要不要过期？（否则数据库里会积一堆永久有效的凭证） |

**建议**：这一项单独开 `plans/051`，先定语义再设计表。
在那之前，`users` 详情的「操作」段先不出现这一行 —— 留一个点了没反应的入口比不画更糟。

---

## 6. 与用户构思图的逐条对账

| 图里的标注 | 本方案 | 差异说明 |
| --- | --- | --- |
| 点进去进入一个详情全屏页 | ✅ 已有 | `plans/027` + `plans/049` 已达成 |
| 用户管理列表行显示「用户名+订阅层级+积分」 | 期 1 附带 | 竖屏卡片现在显示 `mobileCardFields()` 的前几列，需要按图改成这三个（`DataAdmin.vue:1133`） |
| 订单列表行显示「用户名+内容+进度 tag」 | 期 1 附带 | 同上 |
| 订单详情：用户名 / 下单日期 / 礼物内容 / 地址（支持一键复制） | 期 1 | 分组配置 `orders` 段；复制复用 `copyAddressBundle` |
| 状态「点一下出现一个浮层：取消/准备中/已发货/运输中/已完成」 | **改为下拉内联 + 沿用四档** | ① 你刚要求去掉浮层，这里不该再弹；② 代码里没有「运输中」，已确认沿用四档 |
| 用户详情：用户名 / 生日 / 积分 / 订阅层级 / 发放一次性令牌 | 期 1 结构 + 期 3/4 填内容 | 结构先做，动作分两期 |
| 积分/订阅层级「点一下出现发放订阅、修改订阅，支持年月日具体调节」 | 期 3 | 积分内联；订阅跳已有页签（理由见 §4.2） |
| 「点击出现发放和扣除选项或直接修改积分」 | 期 3 | 后端已支持负数，只需放开前端 |
| 需要进度筛选和日期快速筛选 | 期 2 | 进度筛选已有（`statusFilter`），只补日期快捷档 |

---

## 7. 建议顺序与代价

| 期 | 范围 | 风险 | 收益 |
| --- | --- | --- | --- |
| 1 | 详情页分段（`DetailFields` + `detail-sections.js`） | **低**（纯前端、无数据层） | 详情页立刻像设置页 |
| 2 | 日期快捷筛选 | **低**（复用现有筛选链路） | 每日常规动作从三步变一步 |
| 3 | 积分内联改（含 `p_reason` 迁移） | **中**（动写入口 + 一次迁移） | 不用切页签就能改余额 |
| 4 | 一次性令牌 | **高**（新建功能） | 需先定语义 |

期 1 + 期 2 可以一起做，两者不共享代码路径、互不影响。
期 3 单独做，因为它要动 RPC（`p_reason`），与纯前端的 1/2 混在一起会让
「谁改坏了账本」无从分辨。

---

## 8. 不做的事（明确记录，避免被当成遗漏）

- **不加「运输中」状态**（用户已确认沿用四档）：`preparing / shipped / completed / cancelled`
- **不在对象页重写订阅发放的完整表单**：浮层只做「发放 + 年月日时长」，
  起止日等其余字段仍去订阅页签（2026-11-26 起浮层提供「修改现有订阅 ›」跳转）
- **不把 54 个页签都分段**：只配 `users` / 订单类几张表，其余退回单一分组
- ~~不弹任何浮层~~（**2026-11-26 作废**：用户按新草图定为「点击出行浮层」，见 §11）
- **运输中仍不加**（2026-11-26 复确认）：DB `check_gift_status` 保持四档，浮层只出四档

---

## 9. 落地记录（2026-11-25）

| 期 | 结果 | 判据（可重跑） |
| --- | --- | --- |
| 1 · 详情分段 | `config/detail-sections.js`：users 5 段 / gifts 4 段，**覆盖该表全部列**；未配置的表由 `DetailFields` 退回旧平铺 | `npx vitest run tests/unit/data-admin-detail-sections.test.js`（17） |
| 1 · 订单详情 | 「一键复制收货信息」+ 状态四档就地切换（复用 `SAVE_STRATEGIES.gifts`，不写第二份状态规则） | `BASE=http://localhost:5199 node scripts/probes/probe-data-admin-portrait.mjs` → **78/78** |
| 2 · 日期快捷 | 全部 / 今天 / 近 7 天 / 近 30 天；本地日期、含今天；只写 `dateFromFilter`/`dateToFilter` | `npx vitest run tests/unit/data-admin-date-quick-ranges.test.js`（15） |
| 3 · 积分内联 | 详情页发放 / 扣除；扣超余额前端先拦；必弹差异确认 | 竖屏探针「扣除前弹出差异确认（100 → 70）」 |
| 3 · 订阅层级 | 行内跳「订阅发放」并预填该用户（`useSubscriptionGrantPrefill`，TTL 3s） | 源码守卫 + `SubscriptionGrantConsole` onMounted 消费 |
| 3 · 流水原因 | 迁移 `2026112501_points_grant_reason.sql`：3 参 → 4 参（默认 `admin_grant`），ACL 重授 | 线上 4 参已生效；`probe-ledger-verify.mjs` ALL PASS |
| 列表行 | 用户卡片 = 订阅层级 + 积分；礼品卡片 = 内容 + 进度 | 竖屏探针两条卡片断言 |

**与构思图的差异（2026-11-26 为准）**：状态改为**浮层点选**；「运输中」仍不加（四档）；
「一次性令牌」已实现（§11）。此行的旧结论（内联面板 / 令牌未实现）已作废。

**验证读数**：后台相关单测 63 文件 / 713 项全绿；`type-check` 通过；`vite build` 通过；
竖屏探针 78/78、横屏 28/28、详情 14/14、控制台壳 27/27。

---

## 10. 期 4 · 视觉返工轮（2026-11-25，按草图推翻卡片/表格）

用户口径（原话）：「我的草图似乎不长这样」「我不想做表格式」「感觉这些按钮也太冗余了」
「编辑页面也要相应的一样的极简文字无衬线」「保存也只有全部保存，然后不再有什么展开收起，
一行一个数据，点击直接可以编辑，然后无衬线，极简」。

| 改动 | 结论 / 判据 / 实测日期 |
| --- | --- |
| 列表形态 | **纯文字行**（既不是卡片也不是表格）。判据：`grep -n "is-plain-object-list" src/views/DataManagement/DataAdmin.vue`；实测 2026-11-25 |
| 行内动作 | 封禁 / 禁言 / 删除**从行里搬进详情「操作」段**（用户选定「收进详情页」）。判据：竖屏探针「「操作」段含封禁 / 禁言入口」 |
| 分段收口 | users 3 段（身份 / 资产 / 操作）、gifts 4 段（订单 / 收货信息 / 进度 / 操作）；未展示的列进 `DETAIL_SECTION_OMITTED_FIELDS` 显式登记。判据：`npx vitest run tests/unit/data-admin-detail-sections.test.js`（20，含「分段并集 + 省略集 == 全部列」） |
| 工具条冗余 | 批量模式改为文字开关 `.select-mode-toggle`，行内菜单 / 导出菜单在纯行 tab 隐藏。判据：`grep -n "select-mode-toggle" src/views/DataManagement/styles/console.css` |
| 编辑页极简 | 无分组卡片、无「N/M 组展开 + 全部展开/收起」、一行一条（标签左 / 控件同行右对齐）、底部只留文字态「取消 / 保存」。判据：竖屏探针四条「编辑页…」断言 |

⚠️ 两条必踩的坑（第一轮返工就是栽在这，探针当时还全绿）：

1. **specificity**：嵌入形态的盒子写在 `.drawer-overlay.is-embedded .drawer`（0,3,0），
   `.drawer.is-plain`（0,2,0）**压不掉边框 / 圆角 / 限高** —— 必须用
   `.drawer-overlay .drawer.is-plain`（同级且靠后）。症状：整页编辑被裁在一个圆角盒子里。
2. **只改 `display` 不改方向 = 仍旧两行**：基础 `.form-group` 是
   `display:flex; flex-direction:column`，纯文字态必须显式写回 `flex-direction: row`。
   另外控件不只有裸 `input`，还包在 `.user-picker-field` / `.product-picker-field` 里，
   所以「一行一条」的选择器要写 `> :not(.form-label):not(.field-hint)`，
   `.field-hint` 单独 `flex: 1 0 100%` 换行。

**验证读数（2026-11-25）**：竖屏探针 **98/98**（两档视口 × 新增 4 条编辑页断言）；
后台单测 `data-admin-detail-sections`(20) + `data-admin-date-quick-ranges`(15) 全绿；
`check:dark-tokens:strict` 2408/2408、`check:important-budget` 603/603、
`check:doc-truth` 通过、`type-check` 通过、`npm run lint` 89 警告（上限 90）。

**续做（同日，宽屏与人眼复核）**：

- 宽屏下详情 / 页内编辑收成 760px 阅读列（`.record-section.is-plain-object-list`，
  只在 ≥900px 生效，列表仍铺满）—— 否则标签在左、值被推到约 1100px 外的右缘。
- 提示文字有两种类：`.field-hint`（`<p>`）与 `.input-hint`（`<span>`），
  「一行一条」选择器漏掉后者就会把它当控件塞在输入框右侧（收窄到 760px 才暴露）。
- 源码守卫 `data-admin-b-interactions` 的 Shift 区间断言是「恰好 3 处勾选框宿主」，
  新增纯文字行 = 第 4 处；改成 4（新宿主必须一起登记，这不是放宽断言，是登记新接线）。
- 宽屏人眼复核：`debug-screenshots/desktop-{list,detail,edit-plain}.png`（1440×900，mock 数据）。


---

## 11. 期 5 · 两种对象页按草图重做（2026-11-26）

用户口径：「这有两种页面的详情页，一个是用户的，一个是订单的」。两张图的字段集与交互不同，
且**详情页本身即编辑器**（无「编辑」态，底部一个「保存」）。

| 页 | 结构（草图） | 判据（可重跑） |
| --- | --- | --- |
| 用户详情 | 返回+用户名；用户名 / 生日（行内输入）、积分 / 订阅层级 / 发放一次性令牌（浮层）；底部操作段（封禁/禁言/删除）；保存 | 竖屏探针「用户详情按草图：主字段平铺 + 操作段（2 段）」「详情页即编辑器…」 |
| 订单详情 | 返回+「用户名 · 礼物内容」；用户名 / 创建时间 / 礼物内容 / 地址（行内「复制」） / 状态（浮层四档）；保存 | 竖屏探针「订单详情标题 = 用户名 + 礼物内容」「状态浮层四档」 |
| 积分 | 浮层：发放 / 扣除 / **改为某值**（RPC 只吃增减量，直接改算差值） | 竖屏探针「扣除前弹出差异确认（100 → 70）」 |
| 订阅 | 浮层：档位 + **年 / 月 / 日** 时长发放；`修改现有订阅 ›` 跳订阅页签 | `grantSubscriptions` 的 `durationMonths/durationDays` |
| 状态 | 浮层点选 = **暂存**，底部「保存」落库（取消礼物提交前再确认） | 探针「点选状态后先暂存（chip 变「已发货」）」「状态随「保存」落库」 |
| 一次性令牌 | 详情页这一行**直接复用既有签发链路**（EF `admin-issue-login-token`，2026-11-21）：确认 → 原因必填写审计 → GoTrue `generateLink(recovery)` → token 直接进剪贴板；消费端在 `/reset-password` 粘贴即建会话 | 探针「发放令牌先弹安全确认（等同账号密码）」「令牌签发后直接进剪贴板」；`tests/unit/admin-issue-token.test.js` |

⚠️ **期 5 踩到的第三个「探针全绿、人眼一看就错」的坑（这次是事件全死）**：
纯文字页把 Teleport 目标 `#detail-edit-slot` 从模板里用 `v-if="!plain"` **摘掉**了。
Vue 在渲染 Teleport 时找不到目标宿主，错误被全局边界捕获后整棵子树的 instance 变成
半卸载态 —— 表现是「页面照常显示，但**所有 DOM 事件都不响应**」：点行不出浮层、
点返回不跳转、输入框不写回 model，且 `pageerror` 只有一条 `emitsOptions` 的 null 读。
修法：槽位**常驻**（`<div id="detail-edit-slot" v-show="!plain && editing">`）。
排查口径：先看 `el[Object.getOwnPropertySymbols(el).find(s => String(s).includes('_vei'))]`
有没有 `onClick`，再看 `console` 里的 `emitsOptions` 报错 —— 别再从业务代码里找。

**验证读数（2026-11-26）**：竖屏探针 **106/106**（两档视口）、横屏 28/28；
`data-admin-detail-sections` 20 + `b-interactions` 5 + `date-quick-ranges` 15 全绿；
`type-check` 通过、`check:dark-tokens:strict` 2408/2408、`check:important-budget` 603/603。

**⚠️ 更正（同日，发现第二条真源）**：期 5 最初新建了 `login_tokens` 表 + `admin_issue_login_token`
（6 位口令），但仓库里**早已有**完整的一次性登录机制（EF + `admin_issued_login_tokens` 台账 +
`/reset-password` 消费端）。这套重复实现已在迁移 `2026112603` 中删除（线上已验证 `login_tokens`
与函数均不存在），详情页改为复用既有 EF —— 兑换端**本来就有**，无需再接。

教训（同一类）：动手前先搜「这个能力是否已存在」。`grep admin-issue-login-token` 一条命令就能发现，
却被「草图里的新入口」当成「新能力」重做了一遍。
