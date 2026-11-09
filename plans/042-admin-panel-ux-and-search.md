# 042 · 数据管理面板：界面收敛与搜索质量

- **状态**：**P0 已落地**（A1 / C1 / C2 / C4 / D1，外加 A2 的工具栏收敛）；P1、P2 待做，见 §11
- **日期**：2026-11-09
- **触发**：用户要求「整体优化当前界面的简洁性与易用性：精简冗余界面元素、减少视觉干扰、明确信息层级与主次操作关系；简化并优化常用操作流程，减少不必要的点击与跳转；改进搜索功能，重点提升关键词匹配准确性、搜索结果相关性排序，并完善筛选条件、输入联想与空结果提示」
- **影响文件（计划）**：
  - 新增：`src/utils/search-core.js`（关键词 → 条件 / 打分 / 空态判定，三处共用）、`src/components/admin/UserPicker.vue`、`tests/unit/search-core.test.js`、`scripts/probes/probe-admin-search-baseline.mjs`、`scripts/probes/admin-search-queries.json`
  - 修改：`src/views/DataManagement/DataAdmin.vue`（模板区 `:210-350`、`:369-390`；脚本区交叉引用）、`src/views/DataManagement/composables/useDataAdminFilters.js`、`useDataAdminGlobalSearch.js`、`useDataAdminFilterState.js`、`data-admin-empty-state.js`、`src/views/DataManagement/config/query-config.js`、`PointsGrantConsole.vue`、`SubscriptionGrantConsole.vue`、`PityGrantConsole.vue`
  - 不改：详情子页路由（`DataManagementRecord`）、`SAVE_STRATEGIES` 的保存语义、任何表结构
- **并行工作流（§10，真实网页 UI 编辑推广）**：
  - 复用（不改逻辑）：`src/views/ShopEditor/index.vue`、`src/components/inline-editor/*.vue`、`src/composables/useInlineEditor.js`、`patchAdminField`
  - 新增宿主：`src/views/LotteryEditor/index.vue`、`src/views/NewsEditor/index.vue`、返工 `src/views/HeroConsole/index.vue`
  - 需先抽组件：`src/views/Shop/LotteryPanel.vue` 的 `.lt-card`（现重复两份）→ `LotteryCard.vue`；`src/views/Forum/ForumMain.vue` 内联广告卡 → `FeedAdCard.vue`
  - 修改：`src/router/routes/admin.ts`（新宿主 + `meta.bodyClass`）、`src/views/DataManagement/config/tabs.js`、`composables/useDataAdminNavigation.js`
- **关联**：`plans/027`（数据管理面板的信息架构与批量能力，本方案是它的 UX 续篇）、`plans/028`（消息中心选择模式，同一套「动作条只在选中时出现」的取舍）

---

## 1. 需求口径

拆成四条可验收的要求，后面每项改动都挂到其中一条上：

1. **降噪**：同屏常驻的可点元素要少，主操作（新增/搜索）必须一眼可见。
2. **层级**：同一种信息只有一种控件表达（状态只有一套、搜索只有一个入口）。
3. **少跳转**：常用任务（找一条记录并改它）的步数要能数出来，且改造后变少。
4. **搜索可用**：输入不被篡改、结果按相关性排、有联想、空结果能告诉人下一步做什么。
5. **顺手改内容**（并行工作流，见 §10）：运营改一句话/一张图，不该被迫先理解表单结构。凡「内容型字段 + 前台已有组件」的位置，都应当能在**那页真实界面上**直接改。

---

## 2. 现状诊断

### 2.1 六项结构性问题

| # | 现象 | 证据 | 实际代价 |
|---|---|---|---|
| 1 | **两个搜索框，全库搜索要 4 步** | 顶部 `搜索数据...`（`DataAdmin.vue:213`）只搜当前 tab；全库搜索藏在「筛选」（`:222`）→「跨表搜索」（`:288-295`）面板里，还要再输一次、再点「搜索」（`:360-367`） | 用户在顶部搜不到人，会认为「没有这条数据」，而不是「换个地方搜」 |
| 2 | **搜索口径分成四套** | 见 2.2 | 同一关键词在四个地方四种结论 |
| 3 | **状态有两种控件** | 状态 chips 带计数（`:228-245`）+ 「全部状态」下拉（`:313-324`），两者都在筛 `statusFilter` | 同一维度两套入口，不知道以谁为准 |
| 4 | **工具栏过载** | 首行 7 个控件（搜索/筛选/列配置/更多/⌘K/新增/导出），展开筛选再出 8 个（`:248-348`） | 主操作「新增」被挤在右端中间 |
| 5 | **编辑有两条路** | 行内「编辑」开抽屉（`openEditModal`，`:276 :927 :1237 :1278 :1332 :1680`）；点标题进详情子页（`openRecordDetail:7660`）；两边可改字段不同 | 用户改不动就回头试另一个，两条路都不完整 |
| 6 | **「找人」重复实现 3 次** | 积分 `PointsGrantConsole.vue:272`、订阅 `SubscriptionGrantConsole.vue:737`、保底 `PityGrantConsole.vue:541` 各写 `handleSearch`；只有保底绑了回车（`:73`） | 行为不一致，改一处漏两处；`AvatarConsole` 已经在复用它，还会再多一个消费方 |

另有两处小而实的坑：

- `sanitizeSearchTerm` 把 `, % ( )` **直接替换成空格**（`useDataAdminFilters.js:23`）⇒ 搜「50%」实际搜的是「50 」。
- 跨表搜索的空结果是**一条 toast**（`useDataAdminGlobalSearch.js:90-93`），没有「换关键词 / 去全库 / 按 ID 精查」的去处。

### 2.2 搜索口径四分（这是「相关性」问题的根）

| 入口 | 实现 | 排序 | 覆盖字段 | 上限 |
|---|---|---|---|---|
| 列表搜索 | `ilike %kw%`（`useDataAdminFilters.js:52`） | **无**（数据库默认序） | `TAB_SEARCH_FIELDS[tab]` | 分页 |
| 跨表搜索 | 同 filters，每 tab 一条查询（`useDataAdminGlobalSearch.js:47-54`） | **无**，结果按 tab 声明顺序拼接（`:89` `flatMap`） | 同上 | 每 tab 5 条 |
| 发放台找人 | `username` ilike / `id` 精确（`points-admin-api.js:73-81`） | **按积分降序**（`:71`） | 只有 `username` | 30 |
| 邮箱 | 已被**移出**搜索字段（`query-config.js` H-1 注释：`email 已通过列级权限收窄`） | — | 不可搜 | — |

结论：**没有一处按「匹配质量」排序**。发放台甚至按积分排——积分高的人会盖住更精确的匹配。

### 2.3 已经做对、本方案不动的部分

避免返工，这些明确保留：

- 空态三分支判定（`data-admin-empty-state.js:9-43`：搜索无结果 / 筛选无结果 / 表本身为空）——逻辑是对的，本方案只是**给它补上可操作按钮**。
- 搜索去抖 + 翻页复位（`useDataAdminFilterState.js:153-168`）。
- 跨表搜索的 `AbortController` 取消（`useDataAdminGlobalSearch.js:26-30`）与 `Promise.allSettled` 容错。
- 批量操作条「选中才出现」（`:451-508`）、服务端真全选、`plans/027` 的一批能力。
- 详情子页复用同一组件实例以保留筛选/页码/滚动位置（`DataAdmin.vue:7633-7636`）——这是有意设计，不动。

---

## 3. 方案

### A. 信息层级与降噪

| 项 | 优化目标 | 具体做法 | 预期效果 |
|---|---|---|---|
| **A1 单一搜索入口** | 消除「两个搜索框」 | 顶部搜索框加范围切换 `当前表 / 全部表`（默认当前表）。选「全部表」时同一输入框实时出分组结果：按表分组，每组前 5 条 + 「查看全部」。原「跨表搜索」面板移除，`showGlobalSearchPanel` 相关分支一并删掉 | 全库搜索 **4 步 → 1 步**，不再需要第二次输入 |
| **A2 工具栏三档** | 主次分明 | 一级只留三个：搜索框、筛选、新增（主按钮）。「列配置 / 导出 / 更多 / ⌘K」收进一个 `⋯`（沿用 `RowActionMenu`）；「保存视图 / 置顶表」下沉到 `⋯` 与侧栏右键 | 首行可点元素 **7 → 3**；展开筛选区 **8 → 3**（只留高级筛选 / 清空 / 保存视图） |
| **A3 状态单一口径** | 去掉重复控件 | 保留 chips（自带计数、能看出分布），删除「全部状态」下拉；chips 末尾补「其他」兜底（不在枚举内的值）。`statusFilterOptions` 只保留给 chips 消费 | 状态筛选只有一处，计数与筛选口径天然一致 |
| **A4 条件可见** | 知道被什么挡住了 | 搜索框下方用 chips 回显当前生效条件（可单条删除），替代现在「藏在展开面板里」 | 空结果时能立刻看出是哪个条件过窄 |

### B. 流程精简

| 项 | 优化目标 | 具体做法 | 预期效果 |
|---|---|---|---|
| **B1 全库搜索并入 ⌘K** | 一个入口解决「找人 / 找记录 / 跳表」 | ⌘K 面板内输入即搜：先给「表名 / 字段名」候选（跳转），再给「记录」结果（直达详情）。现有「命令 ⌘K」按钮保留 | 任意页面 **1 次快捷键 + 1 次输入**到达目标记录 |
| **B2 编辑入口唯一化** | 消除「点哪个」的犹豫 | 行点击 = 详情子页（已能就地改）；行内「编辑」按钮文案改为「在详情中编辑」，不再直接开抽屉。抽屉只服务「新增」与详情页「完整编辑」 | 一条记录只有一条编辑主路径，复杂字段仍有出口 |
| **B3 批量删除解除限制** | 去掉「高级筛选下不能全选删除」 | 复用「导出全部筛选结果」的条件编译思路，把高级规则编译成服务端条件（`buildBatchDeleteConditions` 骨架已在 `:7756`）；同时在确认弹窗里列出将删除的条数与条件 | 筛完能一次清干净，不用先手动清规则 |
| **B4 找人组件统一** | 三处实现合一 | 抽 `UserPicker.vue`：输入去抖、回车即搜、按相关性排序、空结果给「粘贴 UUID」入口、保留最近选择 | 行为一致；新发放台不必再写第四份 |

### C. 搜索质量

| 项 | 优化目标 | 具体做法 | 预期效果 |
|---|---|---|---|
| **C1 输入不被篡改** | 匹配准确性 | `sanitizeSearchTerm` 改为**转义**而非删除：`%` / `_` 按 PostgREST 规则转义，`,` `(` `)` 用双引号包裹值，只有引号与反斜杠做剥离；保留 UUID / 纯数字的精确匹配分支 | 搜「50%」「a(b)」不再静默变形 |
| **C2 相关性排序** | 结果顺序有意义 | 新增 `scoreMatch(row, kw, fields)`：完全相等 100 / 前缀 80 / 词首 60 / 包含 40，乘字段权重（短字段、主键类字段权重高）。列表搜索按分数排序；跨表结果**合并后统一排序**，不再按 tab 顺序拼接 | 搜「围巾小狗」时它排第一，而不是随机一行 |
| **C3 输入联想** | 少打字、少走错路 | 三类联想：① 最近搜索（本机 10 条）② 枚举/`select` 列的既有值前缀 ③ 快捷前缀 `tab:` `id:` `@` | 常见操作从「打字→等→翻」变成「打 2 个字→选中」 |
| **C4 空结果可行动** | 空态不是死胡同 | 扩 `resolveEmptyState`：`no-match` 增加 `actions`（去全库搜索 / 检查拼写 / 按 ID 精查）；新增 `filtered-out` 显示被哪几个条件挡住并可单条移除；`empty` 保留「新增」 | 空态从「一条 toast」变成「下一步做什么」，且 100% 有主按钮 |
| **C5 命中高亮** | 结果可扫读 | 结果项把命中片段 `<mark>` 标出，并显示「命中字段：用户名」 | 一眼看出为什么它被匹配 |
| **C6 性能** | 联想不卡 | 输入去抖 250ms；跨表单次 `limit 8`、合并后取前 50；沿用既有 `AbortController` 取消上一次请求 | 输入流畅，请求数可控 |
| **C7 邮箱检索（待定）** | 补能力缺口 | 若业务确需按邮箱找人，走**精确匹配 + 审计**（`eq` 而非 `ilike`），不做模糊搜 | 能力补齐但不扩大枚举攻击面 |

> **不引入 `pg_trgm` / 全文索引。** 当前数据量下客户端打分足够；等单表过 10 万行或搜索 P95 超 800ms 再评估。为不存在的问题付复杂度成本，是这个仓库反复踩过的坑。

### D. 支撑（防止回退）

| 项 | 做法 |
|---|---|
| **D1 搜索单一真源** | 把「关键词 → 条件数组」「打分排序」「空态判定」收进 `src/utils/search-core.js`；列表、跨表、找人三处共用，`buildSearchFilters` 退化为适配器。分层上放 `utils/`，避免 `views/` 之间互相 import |
| **D2 守卫测试** | `tests/unit/search-core.test.js` 锁三条：① `% _ , ( )` 只转义不删除；② 打分对「完全相等 vs 前缀 vs 包含」的排序正确；③ 空态三分支的 `actions` 与 `kind` 一一对应。再加一条源码守卫：三个发放台都 import `UserPicker`（防第四份实现） |

---

## 4. 优先级与批次

| 批次 | 内容 | 预估 | 预期收益 | 主要风险 |
|---|---|---|---|---|
| **P0** | A1、C1、C2、C4、D1 | 1.5–2 天 | 全库搜索 4 步→1 步；四处搜索结论归一；空态有出路 | 触碰 `useDataAdminFilters` 的公共函数，需回归列表搜索（所有 tab） |
| **P1** | A2、A3、B1、B2、B4、C3、C5、C6、D2 | 2–3 天 | 首行控件 7→3；编辑路径唯一；常见操作少 1–2 步 | B2 改变既有习惯，需先确认（见 §9） |
| **P2** | A4、B3、C7 | 约 1 天 | 展开区 8→3；筛完能一次清干净 | B3 涉及删除，需保留现有「拒绝无条件全表删除」的两道闸 |
| **P1-并行**（§10） | 抽奖卡抽组件 + 就地编辑、新闻列表就地编辑 | 2 天 | 运营改奖名/新闻标题不必进表单；顺手消掉 `.lt-card` 两份重复 | 抽组件会动前台抽奖卡，需先跑商城/抽奖探针基线 |
| **P2-并行**（§10） | 广告位抽 `FeedAdCard` + 就地编辑、生日 hero、HeroConsole 返工 | 2–3 天 | 首页/信息流的图文位都能就地改 | 首页 hero 结构最复杂，建议最后做 |

> **§10 不阻塞 A–D**：它复用商城那次已经跑通的原语与写入通道，可以先在独立分支推进；但两件事必须共用：`validateRow`（§3 D1 的产物）与 `patchAdminField`，否则又会出现「越方便越不校验」。

**批次内顺序**：P0 里先做 D1 的骨架（抽 `search-core.js` + 单测），再让 A1/C1/C2/C4 挂上去——否则会先改 UI 再返工逻辑。

---

## 5. 验收清单

每条都要有可执行证据，不接受「看起来对了」。

| 编号 | 断言 | 采集方式 |
|---|---|---|
| AC-1 | 全库搜索的可操作步数 ≤ 2（聚焦搜索框 + 输入） | `probe-admin-search-baseline.mjs` 的 `steps` 字段，改前改后对比 |
| AC-2 | 首行可点控件数 ≤ 4；展开筛选区 ≤ 4 | 同脚本 `density` 字段 |
| AC-3 | 10 条固定查询中，目标记录进前 3 的比例 ≥ 80% | 同脚本 `ranking` 字段（改动前先跑基线） |
| AC-4 | 空结果态 100% 带主按钮；`filtered-out` 能显示至少 1 个被挡条件 | 同脚本 `empty` 字段 + 单测 |
| AC-5 | 搜索「50%」时实际发出的条件是转义后的 `50\%`（或 `"50%"`），不是「50 」 | `search-core.test.js` 断言 |
| AC-6 | 含 `%`/`_`/`,`/`(`/`)` 的关键词不报错、不产生空条件 | 同上 |
| AC-7 | 三个发放台都渲染同一个 `UserPicker`（源码守卫） | 新增测试 |
| AC-8 | `npm run verify` 全绿；首屏字节预算不高于改动前 | `verify` 棘轮表 |
| AC-9 | 所有 tab 的列表搜索功能不回归（抽 6 个代表 tab：users / products / forum / ads / lotteries / campaigns） | 同一份 10 条查询覆盖 6 个 tab |
| AC-10 | 每个编辑器宿主的预览都 **import 前台组件**，不存在手写副本 DOM | 源码守卫测试（正则找 `.preview-card` 一类副本类名 + 断言 import 路径） |
| AC-11 | 同一视口下，宿主页与前台页的容器宽度、grid 列数逐项相等 | DOM 对照脚本读 `.store-page` 的 padding / `grid-template-columns`（商城那次的实际 bug 就出在这里） |
| AC-12 | 无编辑上下文时，前台 DOM 里编辑控件数为 0（额外按钮、file input 都不许有） | DOM 断言：卡片根节点标签名、内部 button 数、标题标签名 |
| AC-13 | 单字段写入失败时界面值回滚；撤销同时写库与写界面 | 断网/权限失败场景手测 + 单测 |

---

## 6. 基线采集脚本（待落地时新建）

改之前跑一遍、改之后跑一遍，两份 `baseline.json` 直接 diff。**不是门禁**——数据依赖真实库内容，进 CI 会变成假绿。

```js
#!/usr/bin/env node
/**
 * probe-admin-search-baseline.mjs — 数据管理面板「搜索质量 + 界面密度」基线采集（plans/042）
 *
 * 采集：density（可点控件数）/ steps（全库搜索步数）/ ranking（目标记录名次）/ empty（空态按钮）
 * 前置：dev server 已起（BASE 可覆盖，默认 http://[::1]:5173）
 * 运行：node scripts/probes/probe-admin-search-baseline.mjs [--queries=path]
 * 产出：debug-screenshots/admin-search-baseline-<yyyy-mm-dd>/baseline.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = path.resolve(`debug-screenshots/admin-search-baseline-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT, { recursive: true });

const ADMIN_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const QUERIES = JSON.parse(
  fs.readFileSync(
    (process.argv.find((a) => a.startsWith('--queries=')) || '').slice(10) ||
      path.resolve('scripts/probes/admin-search-queries.json'),
    'utf8',
  ),
);

/** 用 pinia 直接注入 admin 登录态（同 probe-portrait-visual-audit.mjs:110 的写法） */
const armAdmin = (page) =>
  page.evaluate((uid) => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    if (!pinia) return 'no-pinia';
    const apply = () => {
      const s = pinia.state.value.auth;
      if (!s) return;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo) Object.assign(s.userInfo, { id: uid, username: '搜索基线', role: 'admin' });
    };
    apply();
    if (!window.__adminSearchGuard) window.__adminSearchGuard = setInterval(apply, 200);
    return 'armed';
  }, ADMIN_UID);

const countClickables = (page, rootSel) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    return root.querySelectorAll('button, a[href], input:not([type=hidden]), select').length;
  }, rootSel);

/** 在当前 tab 的列表搜索框里输入，返回命中行的文本（用于算名次） */
const searchList = async (page, keyword) => {
  const input = page.locator('.search-box input');
  await input.fill(keyword);
  await page.waitForTimeout(700); // 去抖 + 一次网络往返
  return page.$$eval('tbody tr', (rows) => rows.map((r) => r.innerText));
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/#/admin/data-management`, { waitUntil: 'domcontentloaded' });
  console.log('auth:', await armAdmin(page));
  await page.waitForSelector('.toolbar-secondary', { timeout: 15000 });

  const report = { at: new Date().toISOString(), base: BASE, density: {}, steps: null, ranking: [], empty: null };

  // 1) 界面密度
  report.density.searchRow = await countClickables(page, '.toolbar-secondary');
  await page.locator('.filter-toggle').click();
  report.density.filterRow = await countClickables(page, '.filter-bar');
  await page.locator('.filter-toggle').click();

  // 2) 全库搜索步数（人工可读的操作序列，改造后应缩短）
  report.steps = await page.evaluate(() => {
    const hasGlobalPanel = Boolean(document.querySelector('.search-panel'));
    const topSearch = Boolean(document.querySelector('.search-box input'));
    return { topSearch, hasCrossTablePanel: hasGlobalPanel, requiredActions: 0 };
  });

  // 3) 相关性：目标记录在结果里的名次
  for (const q of QUERIES) {
    const rows = await searchList(page, q.keyword);
    const idx = rows.findIndex((text) => text.includes(q.expect));
    report.ranking.push({
      tab: q.tab || '(当前)',
      keyword: q.keyword,
      expect: q.expect,
      hits: rows.length,
      rank: idx === -1 ? null : idx + 1,
    });
  }

  // 4) 空结果态是否可操作
  const ghost = QUERIES.find((q) => q.ghost) || { keyword: '__no_such_record_zz__' };
  await searchList(page, ghost.keyword);
  report.empty = await page.evaluate(() => {
    const box = document.querySelector('.empty-state, .data-empty, [class*="empty"]');
    if (!box) return { found: false };
    const buttons = [...box.querySelectorAll('button')].map((b) => b.innerText.trim());
    return { found: true, text: box.innerText.trim().slice(0, 120), buttons };
  });

  fs.writeFileSync(path.join(OUT, 'baseline.json'), JSON.stringify(report, null, 2));
  console.log('written:', path.join(OUT, 'baseline.json'));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

配套样本文件 `scripts/probes/admin-search-queries.json`（**首次运行前必须换成真实值**，下面的占位符只演示形状）：

```json
[
  { "tab": "users",    "keyword": "admin",     "expect": "admin" },
  { "tab": "users",    "keyword": "00ac36b4",  "expect": "00ac36b4" },
  { "tab": "products", "keyword": "围巾",      "expect": "围巾" },
  { "tab": "products", "keyword": "50%",       "expect": "50%" },
  { "tab": "forum",    "keyword": "测试帖子",  "expect": "测试帖子" },
  { "tab": "ads",      "keyword": "banner",    "expect": "banner" },
  { "tab": "lotteries","keyword": "抽奖",      "expect": "抽奖" },
  { "tab": "campaigns","keyword": "活动",      "expect": "活动" },
  { "tab": "users",    "keyword": "a",         "expect": "a" },
  { "tab": "products", "keyword": "__no_such_record_zz__", "expect": "___", "ghost": true }
]
```

> 选择器（`.toolbar-secondary` / `.filter-bar` / `.search-box` / `tbody tr`）以**当前实现**为准，改造后需同步更新；这也是本脚本刻意不进门禁的原因之一。

---

## 7. 明确不做

| 不做 | 理由 |
|---|---|
| `pg_trgm` / `tsvector` 全文索引 | 数据量不支持这个复杂度；先做客户端打分，用 AC-3 的命中率数据决定是否值得上 |
| 改详情子页的路由结构（`DataManagementRecord`） | 复用组件实例保留筛选/滚动位置是有意设计（`DataAdmin.vue:7633`） |
| 彻底删除编辑抽屉 | 新增记录和「完整编辑」仍需要它；B2 只改「编辑已有记录」的默认入口 |
| 给搜索加后端聚合 / 新 RPC | 跨表搜索本来就是 N 条查询，改成 RPC 需要新表新权限，收益不抵风险 |
| 把工具栏做成完全隐藏 | 「筛选」是高频动作，藏起来会变成两次点击 |

---

## 8. 风险与回滚

| 风险 | 触发点 | 缓解 |
|---|---|---|
| 改 `sanitizeSearchTerm` 影响所有 tab 的搜索 | C1 是全局面量 | 先写 `search-core.test.js` 锁住旧行为里**必须保留**的部分（去空格、截断 120 字），再改转义；用 AC-9 的 6 个 tab 做回归 |
| 跨表结果合并排序后「某些表永远看不到」 | 每表 5 条 + 全局 50 条上限 | 分组视图（按表）与统一排序视图并存，默认统一排序、可切分组 |
| A1 合并搜索框后，两套请求同时在飞 | 范围切换 | 范围切换即 abort 旧请求；「当前表」与「全部表」共用同一个 `AbortController` 槽位 |
| B2 改变运营习惯 | 行内「编辑」不再开抽屉 | 灰度：先改文案为「在详情中编辑」，观察一周再移除抽屉入口 |
| B3 删除条件编译出错 → 多删 | 高级规则 → 服务端条件 | 保留现有两道闸（无用户条件拒绝、条件数必须多于 baseScope）；确认弹窗展示条数与条件清单；先只对 `posts` / `comments` 两个表开放 |

回滚策略：全部改动集中在 5 个搜索相关文件 + 1 个新组件，任何一批出问题都可以单批 revert，不影响 `plans/027` 已落地的能力。

---

## 9. 待确认决策

1. **邮箱能不能搜（C7）**：现在是被权限刻意移出搜索字段的（`query-config.js` H-1）。这不是技术问题——模糊搜邮箱等于批量枚举。若确需，只能做精确匹配 + 审计。
2. **编辑入口是否唯一化（B2）**：如果运营已习惯「行内点编辑开抽屉」，建议按 §8 的灰度方案走，而不是一次切掉。
3. **跨表搜索默认视图**：统一排序（相关性优先）还是按表分组（结构优先）？我倾向统一排序 + 可切分组，但这会影响「我知道我要找哪个表」的场景。

---

## 10. 附：真实网页 UI 编辑还能铺到哪里

> 这一节是**并行工作流**，不属于 A–D 的搜索/降噪范围，但共用同一套写入通道，所以写在同一份计划里统一排期。

### 10.1 样板：商城已经跑通的那条链路

`/admin/shop-editor` 的做法是**后台整页渲染前台页面**，而不是在旁边做一个预览：

```vue
<ShopEditorBar />   <!-- 编辑模式 · 撤销 · 退出 -->
<Shop />            <!-- 前台页面原样，一字未改 -->
```

可复用资产（都已存在，不要再写第二份）：

| 资产 | 位置 | 作用 |
|---|---|---|
| 宿主外壳 | `src/views/ShopEditor/index.vue` | 注入编辑上下文 + 工具栏 + toast/撤销 |
| 文本原语 | `src/components/inline-editor/EditableText.vue` | 根元素仍是原标签，编辑态内部换 `input`/`textarea` |
| 图片原语 | `EditableImage.vue` | 上传 + 落库 + 失败回滚，都在原语内部完成 |
| 数字原语 | `EditableNumber.vue` | `scale` 双向换算（分↔元），价格类字段必须用它 |
| 上下文 | `src/composables/useInlineEditor.js` | provide/inject；无上下文时所有编辑 UI 不渲染 |
| 字段校验 | `src/utils/inline-editor-validate.js` | 复用 `tables.js` 的 `required/maxLength` |
| 单字段写入 | `patchAdminField`（`src/utils/api/data-admin-table-api.js`） | 乐观更新 + 撤销栈 + 变更日志 |
| 删除兜底 | 「最近删除」本机快照 | 删错了能找回 |

### 10.2 判据：两个条件同时满足才做

1. **内容型字段**——运营填的字、图、价，用户在某个固定位置看到它。
2. **前台已有可 import 的组件**——那块 UI 是 `.vue`，不是散落在页面里的内联 `<div>`。

**缺一不做。** 缺第一条会做出「看起来像前台、实际前台没有这东西」的假视图；缺第二条只能手写副本 DOM，而副本必然漂移——`ShopConsole` 的 `.preview-card` 已经实证过：前台卡片有图片失败兜底和加载态，副本里只有 `v-if="image"`，图挂了在预览里是空白框、在前台是占位图标。

### 10.3 八个工程约束（商城那次踩出来的，新宿主照抄）

| # | 约束 | 不遵守的后果 |
|---|---|---|
| 1 | 原语的**根元素不变**（仍是那个 `span`/`button`），只在内部条件渲染 `input` | 父级 class 与 scoped 样式失效，前台视觉被改 |
| 2 | 宿主路由必须声明 `meta.bodyClass` 覆盖 | `/admin/shop-editor` 当初生成 `page-shopeditor`，而 `landscape-rail.css` 有 **13 条规则挂在 `body.page-shop`** ⇒ 左栏让位失效、卡片被拉宽（400px vs 320px） |
| 3 | 无编辑上下文时**不渲染任何**编辑控件（含隐藏 `file input`） | 前台 DOM 多出一堆按钮/file input |
| 4 | 撤销必须**同时写库与写界面** | 用户点撤销「什么都没变」，刷新后才突然回退 |
| 5 | 删除必须有快照 | 误删不可恢复 |
| 6 | 宿主必须登记 `tabModules` + `ROUTE_MAP` | 页面只能手敲 URL（`gate-console` 与 `shop-editor` 都犯过） |
| 7 | 价格/金额类字段用 `EditableNumber` + `scale`，不当文本改 | 库存在「分」、界面显示「元」，当文本改会把 `¥25.00` 写进 numeric 列 |
| 8 | 弹层 z-index 到过 `2147482400`，工具栏盖不过 ⇒ 撤销放在**保存提示**里 | 详情页里改完无法撤销（要么关掉弹层，要么提层级压住返回键） |

### 10.4 可接入清单

**A 档：现在就能做（组件已存在或极易复用）**

| 位置 | 前台现状 | 要做的事 | 可就地改的字段 | 优先级 |
|---|---|---|---|---|
| 首页 hero | `Home/components/DynamicHomeHero.vue`、`OfficialHeroStage.vue` 已是组件；`HeroConsole` **已经在 import 前台组件**，但仍是「左表单 + 右预览」 | 把 HeroConsole 改成整页渲染 + 原语接入（与商城同构） | 主标题 / 副标题 / 背景图 / CTA 文案与链接 | P1-并行 |
| 抽奖卡 | `Shop/LotteryPanel.vue` 的 `.lt-card` **重复两份**（进行中 / 历史），本身就是重复代码 | 先抽 `LotteryCard.vue`（顺带消重），再接原语 | 奖名 / 奖品图 / 所需积分 / 库存 / 开奖时间 / 状态 | P1-并行 |
| 新闻列表 | `Newsroom/index.vue:220` `.news-card`（单一实现，非重复） | 直接在卡片上接原语；新建 `NewsEditor` 宿主渲染 `Newsroom` | 标题 / 封面 / 分类 / 摘要 / 置顶 | P1-并行 |
| 生日 hero | `Home/components/BirthdayHero.vue` 已组件化，被 `OfficialHeroStage` 引用 | 直接接原语 | 寿星名 / 头像 / 祝福语 / 生效日期 | P2-并行 |

**B 档：值得做，但要先抽组件**

| 位置 | 前台现状 | 先抽什么 | 字段 | 优先级 |
|---|---|---|---|---|
| 广告位 | `Forum/composables/useActiveAds.js` 取数，`ForumMain.vue` **内联**渲染卡片 | `FeedAdCard.vue` | 标题 / 图 / 落点链接 / 展示位 / 间隔 / 有效期 | P2-并行 |
| 活动平台 campaigns | 前台页面结构**待勘察**（本计划未确认） | 勘察后定 | 待勘察 | P2-并行（先勘察） |

**C 档：明确不做**

| 不做 | 理由 |
|---|---|
| 用户、积分流水、订阅、订单、报名明细、审计日志 | 数据投影，不存在「编辑这个用户时该长成什么样」的前台镜像。硬做只会得到一个更不准确、还更难点的假界面；它们真正该优化的是字段分组、校验、关联跳转 |
| 长文正文（帖子正文、新闻正文） | 编辑器排版必然与前台 article 样式打架。正确做法是加「**预览**」按钮弹真实阅读视图：书写用表单，阅读用真组件 |
| 分类枚举、规格数组、JSON 字段 | 多维结构，就地无法表达；仍走表单（分类需下拉、规格需列表编辑器） |
| 头像框 / 装扮（`AvatarConsole`） | 它不是「前台页面的镜像」，是自己的画布编辑器，已经有一套预览与几何模型，套就地编辑只会增加两套状态 |

### 10.5 与主方案的关系（三条硬连接）

1. **共用校验**：编辑器是第二条写路径，必须走 §3 D1 抽出的 `validateRow(tab, item)`。否则同一个字段「在抽屉里被拒、在页面上被接受」——这正是本计划开头列的第 1 号问题。
2. **共用入口**：新宿主不再各自占一个侧栏 tab，统一进 `⋯` 或 ⌘K（§3 A2 / B1），否则「简洁性」刚做的收敛又被新页面抵消。
3. **共用并发保护**：单字段写入同样需要 `updated_at` 比对（见上一轮复核结论）。就地编辑最容易出现「两个人同时改同一张卡」的场景。

### 10.6 本节验收

对应 §5 的 AC-10 ~ AC-13，此外补两条：

| 编号 | 断言 |
|---|---|
| AC-14 | 新增宿主后，`npm run env:doctor` 与 `npm run verify` 全绿；首屏字节预算不高于改动前（编辑器必须落在懒加载 chunk） |
| AC-15 | 抽组件是**纯重构**：前台渲染结果不变（同一视口截图对比 + DOM 结构断言），提交里不夹带样式调整 |

### 10.7 建议顺序

```
抽奖卡抽组件（纯重构）→ 抽奖就地编辑      ← 收益最快，顺手消重
新闻列表就地编辑                          ← 组件已单一，成本最低
HeroConsole 改成整页                      ← 已有预览能力的返工
广告抽 FeedAdCard → 广告就地编辑          ← 需要先抽，且要跑论坛信息流探针
生日 hero → campaigns（先勘察）
```

先做抽奖的理由：它的卡片**已经是重复代码**，抽组件这一步无论如何都要做，接原语只是顺带；而广告要先从 `ForumMain` 里拆出来，动的是信息流首屏，风险高一个量级。

---

## 11. 实施记录（P0，2026-11-09）

### 11.1 落地的改动

| 项 | 实际做法 | 落点 |
|---|---|---|
| **D1** | 新增 `src/utils/search-core.js`：`normalizeKeyword`（只规范化不删字符）、`escapeLikePattern`、`buildContainsPattern`（含 or() 保留字符时整段加引号）、`buildSearchFilters`、`scoreFieldValue`/`scoreRow`/`rankRows`、`findMatchedField`、`groupByTab` | 新文件 + `tests/unit/search-core.test.js`（20 条） |
| **C1** | `sanitizeSearchTerm` 退化为 `normalizeKeyword` 的别名；`buildSearchFilters` 委托 search-core。POST 出去的 `50%` 变成 `%50\%%`（实测见 11.3）。高级筛选的 `contains`/`starts` 也改为转义 | `useDataAdminFilters.js` |
| **C2** | 有搜索词时先拉 120 条候选窗口 → 客户端打分排序 → 再切当前页（`SEARCH_RANK_WINDOW` / `fetchPageQuery`）。跨表结果合并后**统一按分数排序**，不再按 tabs 声明顺序拼接 | `DataAdmin.vue`、`useDataAdminGlobalSearch.js` |
| **C4** | `resolveEmptyState` 增加 `actions`（含 `EMPTY_ACTIONS` 常量）；模板由「写死两个按钮」改为 `v-for="action in emptyState.actions"`。`no-match` 给「搜索全部表 + 清空」，`filtered-out` 给「清除全部筛选」，`empty` 给「新增」（无权限时退化为去全部表搜） | `data-admin-empty-state.js` + `DataAdmin.vue` |
| **A1** | 工具栏搜索框旁加范围开关（`本表` / `全部表`），**同一个关键词**驱动两种范围；选「全部表」时同一输入框下方出分组结果浮层。删掉「跨表搜索」按钮、独立输入框与 `globalSearchQuery` | `DataAdmin.vue` + `console.css` |
| **A2（部分）** | 「列配置」「命令面板」收进 `⋯` 菜单，首行由 8 个控件降到 6 个（DOM 可点元素 11 → 9，含 chips） | `DataAdmin.vue` + `console.css` |

### 11.2 与原方案的偏差（都是实测后改的）

1. **顶栏搜索整个移除**，而不是保留双入口。原方案没写这条，因为当时没注意到 `AdminHeader` 自带一个全局搜索框——它只在表格 tab 下才可能展示结果，在概览/页面型 tab 上是**点不到的无效控件**。合并后「一个关键词 + 一个范围开关」，顶栏那个框没有任何独占能力。
2. **空态判定没有搬进 `search-core.js`**。`data-admin-empty-state.js` 已经是单一真源且有测试，搬过去只会造第二份。`search-core` 只负责「关键词 → 条件 / 打分 / 分组」。
3. **不新建 `scripts/probes/probe-admin-search-baseline.mjs`**。实测发现该探针要在真实库上跑才有意义，而本机到 `*.supabase.co` 被阻断（见 `docs/AI-ENV.md`），写进仓库会变成一条永远跑不出数的脚本。基线改用一次性探针采集，数据记在 11.3。
4. **A3（删「全部状态」下拉）没做**。chips 的分布来自 `statusBreakdownForCurrentTab`，值域可能被截断；在没有确认「chips 覆盖全部枚举」之前删掉下拉会丢筛选能力，留给 P1 连同「其他」兜底一起做。

### 11.3 实测证据（1440×900，mock 数据：3 个商品 / 2 个用户）

| 断言 | 结果 |
|---|---|
| 新搜索入口存在、范围开关默认「本表」、顶栏搜索框数量 | `true` / `本表` / **0** |
| 搜「围巾小狗」的渲染顺序（输入顺序是 加厚… → 50%… → 围巾小狗） | **围巾小狗** → 加厚围巾小狗保暖款 → 50% 折扣围巾 |
| 搜「50%」时实际发出的 or 条件 | `title.ilike.%50\%,category.ilike.%50\%,description.ilike.%50\%,payment_mode.ilike.%50\%` |
| 搜「50%」的命中行数 | 1（只命中 `50% 折扣围巾`；旧实现会变成「50 」而命中 0 或误命中） |
| 全部表结果 | 命中 7 条、分 3 组、命中片段带 `<mark>` |
| 全部表空结果 | 面板给出「只在「商品管理」里搜」+「清空关键词」 |
| 本表空结果 | `kind=no-match`，动作 = 搜索全部表 / 清空搜索与筛选 |
| 首行可点元素 | 11 → **9** |
| 页面异常 | 0 |

### 11.4 仍未做（原 P1 / P2）

B1 ⌘K 合并全库搜索、B2 编辑入口唯一化（需先定灰度，见 §9-2）、B3 批量删除解除限制、B4 `UserPicker`、C3 输入联想、C5 表格行内命中高亮（结果浮层已有）、C7 邮箱精确检索、§10 的就地编辑推广。

---

## 12. 实施记录（P1 第一批：A3 + A4，2026-11-09）

### 12.1 落地的改动

| 项 | 实际做法 | 落点 |
|---|---|---|
| **A4 条件可见** | 新增 `buildFilterChips()` 纯函数（关键词 / 状态 / 日期 / 每条高级规则 → `{id,kind,label,title}`）；`createFilterState` 出 `activeFilterChips` + `removeFilterCondition(id)`，`rule:<id>` 走同一条删除路径（`removeAdvancedFilterRule` 改为委托，删掉重复的 filter 逻辑） | `composables/data-admin-filter-chips.js`（新）、`useDataAdminFilterState.js`、`components/shared/ActiveFilterChips.vue`（新） |
| **A4 两处复用** | 同一个组件挂在①工具栏「筛选」按钮右侧（常驻，不展开面板也能删）②空结果态（替代原来一行纯文字摘要 `.empty-state-filters`） | `DataAdmin.vue` |
| **A3 状态单一口径** | `showStatusSelect`：**chips 描述的列 === 状态筛选的列** 时，筛选面板里的「全部状态」下拉退场；两者不是同一列时下拉必须留着 | `DataAdmin.vue` |
| **A3 其他兜底** | chips 之外若还有行：`statusResidualCount = total − Σ(已知状态)`，在分布条右侧明账「· 另有 N 条未归类状态」。不做 `not in` 查询（PostgREST 拿不到 distinct），也不新增筛选能力 —— 那些行仍可用高级筛选定位 | `DataAdmin.vue` + `console.css` |
| **算子标签单一真源** | `ADVANCED_OPERATOR_LABELS` / `ADVANCED_OPERATOR_OPTIONS` 进 `useDataAdminFilters.js`，下拉由 `v-for` 生成，chips 复用同一张表 | 同上 |

### 12.2 顺带修掉的两个既有 bug（都是 A3 的前置条件，不修就是「用错的 chips 替掉对的下拉」）

1. **`cardView.statusMeta` 被合并了却从不参与值域**：`resolveKanbanConfig` 只看 `explicit.statusMeta`，所以声明在 `cardView` 里的表（礼物等）只能退回字段 options，声明里的 tone 全丢；没有 options 的表干脆没有分布条。改成「显式 > cardView > 字段 options」同一个顺序（与文件头注释的推断优先级一致）。
2. **`/status/i` 自动推断猜错列**：users 的 `hide_online_status`（一个 select 偏好项）被当成状态分布字段，于是用户管理的「状态分布」显示 **隐藏 0 / 显示 0**，而状态筛选筛的是 `role`。现在 `resolveKanbanConfig(cfg, { statusField })` 接受「本 tab 状态筛选真正用的列」并**锁死列名**，调用点从 `STATUS_FILTER_FIELDS` 传入。
   - 全库审计（一次性脚本，跑完即删）：只有 3 个 tab 的值域变化，且都是修正 —— `users` 在线状态(2) → role(3)、`points` null → role(3)、`campaigns` null → stage(6)；**没有任何 tab 丢看板**。
3. **状态筛选 chip 的标签是裸值**：`statusFilterLabel` 原来只查 `statusFilterOptions`，对没有 select 字段的表（`reviewPosts` 等）那份列表是按当前页行反推的，于是 chip 显示「状态：approved」。现在先问看板/分布的中文标签（且必须同列），实测变成「状态：已通过」。

### 12.3 实测证据（1440×900，mock 4 条 posts / 6 条 users）

| 断言 | 结果 |
|---|---|
| `reviewPosts` 分布 chips | 全部 4 / 已通过 1 / 仅作者可见 1 / 已拒绝 1 |
| 分布条提示 | 「当前筛选 4 条 · 另有 1 条未归类状态」（数据里真有 1 条 `pending`） |
| `reviewPosts` 筛选面板里的状态下拉 | **0**（已退场） |
| 输入关键词后的生效条件 chips | 「关键词：围巾 ×」 |
| 点状态 chip 后 | 「关键词：围巾 ×」+「状态：已通过 ×」 |
| 点关键词 chip 的 × | 搜索框清空、chip 消失、状态 chip 保留 |
| 空结果态（搜不到） | `kind=no-match`，条件 chips 居中回显，× 可清空关键词 |
| `users` 状态分布 | 全部 6 / 普通用户（user）/ 管理员（admin）/ 版主（moderator）（原来错成 隐藏/显示） |
| `users` 筛选面板里的状态下拉 | **0**（chips 现在就是 role 分布、与筛选同列 → 退场；选项与原来下拉完全一致，筛选能力没丢） |
| 暗色主题 chip 计算值 | 文字 `rgb(239,241,244)`、边框/底色由 `--primary` 派生（无硬编码色值） |
| 页面异常 | 0 |

> 样式踩坑（已写进组件注释）：`console.css` 是 `DataAdmin.vue` 的 `<style scoped>` 导入，`[data-v-x]` 只落在子组件**根节点**，内部元素一律匹配不到 —— chip 的视觉样式必须写在 `ActiveFilterChips.vue` 自己的 `<style scoped>` 里。第一次就是这么写的，实测 chip 是 16px 裸文本。

### 12.4 仍未做（P1 余项）

B1 / B2 / B4 / C3 / C5 / C6 / D2 已在 §13 落地。仍未做：B3 批量删除解除限制、C7 邮箱精确检索、§10 就地编辑推广。

> 另记：`users` 曾经因为 `hide_online_status` 被误判而多跑 2 个 head count，现已随 §12.2-2 消失；若日后新增「/status/ 命名的偏好字段」，务必同时补 `STRUCTURE` 侧的 hint，否则会被当成状态列。


---

## 13. 实施记录（P1 其余：A2 / B1 / B2 / B4 / C3 / C5 / C6 / D2，2026-11-09）

### 13.1 落地的改动

| 项 | 实际做法 | 落点 |
|---|---|---|
| **B1** | ⌘K 面板内输入即搜（独立 `createGlobalSearchCenter` 实例，避免和工具栏「全部表」共用关键词互相清空）。候选顺序 **表跳转 → 字段筛选 → 记录 → 命令**，每条带类型前缀；点记录直接 `router.push` 到详情子页；关闭面板即 abort | `DataAdmin.vue`、`useDataAdminGlobalSearch.js`、`console.css` |
| **B1 字段候选** | 匹配到字段名不跳列配置，而是「按该字段加一条 `contains` 高级筛选」——输入 `标题` 的人想筛标题，不是想改列宽 | `commandSearchDerivedItems` |
| **C3** | 新增 `buildSearchSuggestions` / `pushRecentSearch` / `collectEnumOptions` 纯函数。联想面板三类：快捷前缀提示、最近搜索（本机 10 条）、当前表 ≤24 值的枚举 | `composables/data-admin-search-suggestions.js`（新）、`useDataAdminPersistence.js`（新增 key `boh-admin-recent-searches-v1`） |
| **C3 前缀** | `parseSearchQuery`：`id:` → 主键精确（UUID）/ 主键包含；`@` → 只在用户名列里搜（无该列则退回全字段）；`tab:` → 跳表。打分/高亮统一走 `searchTermOf`（去前缀） | `utils/search-core.js` |
| **C3 回车语义** | 回车**只搜用户自己敲的词**；只有用方向键在候选里移动过，回车才应用候选（否则第一条联想会顶掉输入，这是最容易写错的一处） | `onSearchEnter` / `suggestionNavMoved` |
| **C6** | 联想去抖 250ms、`requestId` 只让最后一次结果落地、跨表 `limit 8` 合并取 50（P0 已做） | 同上 |
| **B4** | 新增 `UserPicker.vue`：去抖 250ms + 回车立即搜、按 `scoreRow` 相关性排序、空结果给「粘贴 UUID」、保留最近选择（按 `recentKey` 分发放台）、多选/单选共用、结果行带头像/角色/积分 | `components/shared/UserPicker.vue`（新） |
| **B4 接入** | 积分发放 / 订阅发放 / 抽奖补参与三处删除本地 `searchQuery/searchResults/searching/handleSearch/isSelected/toggleUser/removeUser`，抽奖那处连 280ms 定时器一起删 | 三个 Console |
| **B2** | 行内铅笔（表格 + 卡片两种视图）改成进详情（`openRecordDetail`），`aria-label` 改为「在详情中编辑」；抽屉作为**灰度逃生口**留在行 `⋯` 菜单「快速编辑（抽屉）」，详情页「编辑」仍走 `embedded` 模式 | `DataAdmin.vue` |
| **A2 收尾** | 「置顶表」从展开的筛选区下沉到 `⋯`（它不是筛选动作） | `DataAdmin.vue` |
| **C5** | 复核结论：表格行内命中高亮**此前已落地**（`createHighlightHelpers` + `highlightCellValue` 已在单元格 `v-html`），实测「本表 + 有关键词」时 `<mark>` 正常。本次未重复实现，只在文档里销账 | — |
| **D2** | 新增两条源码守卫：`user-picker-shared.test.js`（三处必须 import UserPicker、不得再有本地选人状态）、`data-admin-row-edit-entry.test.js`（铅笔不许改回 `openEditModal`、抽屉逃生口必须在） | `tests/unit/` |

### 13.2 实测证据（1440×900，mock 数据）

| 断言 | 结果 |
|---|---|
| 聚焦搜索框 | 面板给 3 条前缀提示 + 最近搜索（`围巾`/`50%`，来自 localStorage） |
| 输入「围巾」后回车 | 关键词仍是「围巾」（未被联想顶掉），出「关键词：围巾 ×」chip，行数 2 |
| 输入 `tab:用户` | 候选只剩表跳转：「用户管理」「用户数据导出」；回车后 URL `...&tab=users` |
| ⌘K 输入「围巾」 | 候选首条为「记录 · 围巾小狗 · 商品管理 · 命中 title」 |
| 点该记录 | 直达 `#/admin/data-management/products/<uuid>`（详情页渲染，面包屑 商城 › 商品管理 › id） |
| 积分发放搜「user」 | 结果 `user_one` 在前、`admin_user` 在后（前缀优先于包含，旧实现无排序） |
| 订阅发放搜「admin」 | `admin_user` 在前；选中出 chip |
| 抽奖补参与（单选） | 选中出 chip，不出现多选 |
| 页面异常 | 0 |

> 探针里 `detailVisible` 一度为 false 是我把断言写成匹配 `/record/` 而实际路由是 `/<tab>/<id>`；截图确认详情页已正常渲染，至于「JSON object requested…」是 mock 对 `.single()` 返回了两行的假错误。

### 13.3 P1 完成度

| 项 | 状态 |
|---|---|
| A1 / A2 / A3 / A4 | ✅ 全部落地 |
| B1 / B2（灰度） / B4 | ✅ 落地 |
| C1 / C2 / C3 / C4 / C5 / C6 | ✅ 落地（C5 为复核销账） |
| D1 / D2 | ✅ 落地（新增 5 个守卫/纯函数测试文件） |
| **未做** | B3 批量删除解除限制、C7 邮箱精确检索、§10 就地编辑推广（P2 / 并行线） |

### 13.4 需要拍板的两件事

1. **B2 是否「切到底」**：现在是灰度版 —— 铅笔进详情，抽屉留在 `⋯` 里。稳定跑一段时间后可删掉「快速编辑（抽屉）」，真正一条路径；也可以反过来（详情页出问题时把灰度关掉只需改一处）。
2. **B3 批量删除解除限制**：方案里是 P2，但风险最高（涉及物理删除）。要在「高级筛选下也能全选删除」上加两道闸：删除前必须回显条件 + 条数，且审计失败要可见。要不要做、按什么口径做，需要你定。
