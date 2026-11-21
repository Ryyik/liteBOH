# 网站数据管理面板（DataManagement）· UI / 操作性审查报告

> 审查范围：`src/views/DataManagement/**`（主视图 `DataAdmin.vue` 5300 行、13 个 composables、14 个 shared 组件、6 个 page 控制台、5 份样式表）
> 审查性质：**只读代码审查**，未修改任何源码。所有结论均基于真实代码，附 `文件:行号` 锚点。
> 审查日期：2026-08-25
> 关注重点：排版 / 布局 / UI 一致性，以及**操作性（operability）**。

---

## 0. 总体评价

这是一个**功能密度极高、架构相当成熟**的后台管理面板：数据驱动（50+ 张表由 `config/tables.js`、`fields.js`、`saveStrategies.js` 描述）、深/浅色主题、响应式、危险操作有确认层、有变更日志/导出/备份/列配置/保存视图/跨表搜索等高级能力。

**优点（已核实，应保留）**
- 危险操作全部经 `useConfirmDialog` 确认：`deleteItem`（useDataAdminMutations.js:116）、`batchDelete`（:151）、`closeLottery`（:289）、`banUser`/`muteUser`（:637/:761，含理由 `prompt` + `confirm`）、`deleteModerationItem`（:602）。共 11 处 `dialog.confirm`，覆盖完整——**安全性是强项**。
- 反馈无障碍：自定义 toast 带 `role` 与 `aria-live`（DataAdmin.vue:1017-1027），错误类型 `assertive` 且**不自动消失**（:1394-1399），非错误 3s 自动消失。
- 抽屉无障碍：`EditDrawer` 用 `role="dialog"` + `aria-modal` + `Esc` 关闭 + 焦点恢复（EditDrawer.vue:4-6、:705-713、:901-905）。
- 键盘效率：全局快捷键 `Ctrl/⌘+S` 保存、`Esc` 关闭、`/` 聚焦搜索、`n` 新建、←/→ 在抽屉内切换记录（useDataAdminShortcuts.js）。
- 批量编辑带**回滚**逻辑（DataAdmin.vue:4621-4650），移动端有卡片视图与骨架屏。

**但「操作性」仍有明确的、可量化的改进空间**，主要集中在：单文件体量、图标/视觉一致性、表格两大交互（排序、行内编辑）的键盘可达性、工具栏信息密度、选择模型的语义。下面分维度展开。

---

## 1. 布局与信息架构

### 1.1 现状
- 三级导航：侧边栏（模块级，扁平）+ 内容区顶部横向子标签（tab 级）+ 表格。模块在 `config/tabs.js` 的 `tabModules` 已分组（overview/users/gifts/shop/community/operations/moderation/lottery/ai-config/logs 共 10 组），但 `AdminSidebar.vue` 注释明确写 “flat, no groups”，只渲染模块，**模块内环境（哪些 tab）靠横向按钮**（`DataAdmin.vue` ~L90-105）。
- 这在 10 个模块内是合理的；但当某模块 tab 较多（如 `users` 7 个、`logs` 6 个）时，横向子标签栏在窄屏会拥挤/换行，目前未在审查中确认其滚动/收起策略。

### 1.2 建议
- **P1** 横向子标签栏加 `overflow-x:auto` + 可视滚动提示，或在 <900px 折叠为下拉（`select`），避免换行破坏表格顶部对齐。
- **P2** 侧边栏模块项可加分组小标题（复用 `tabModules` 的 `description`），降低“扁平长列表”的认知负担。
- **P1** 当前“概览/数据”两个 section 切换（`activeAdminSection`）与模块切换是两套心智模型，建议统一为「模块 = section」，减少切换层级。

---

## 2. 排版与视觉一致性

### 2.1 图标体系分裂（**最显眼的视觉不一致**）
- 主视图 `DataAdmin.vue`：表格与工具栏用了 **16 个手写 `<svg>`**（新增/筛选/删除/导出/编辑等），但只 `import` 了 **1 个** lucide 图标（`Database`，用于备份按钮）。`grep "<svg"` = 16，`grep lucide` = 1。
- 页面型控制台（如 `ApiKeyConsole.vue`）则**正确使用 lucide**（`lucide` import=1、`raw <svg>`=0）。
- 侧边栏、头部、概览同样使用 lucide。

**后果**：同一套面板里，工具栏图标与主/控制台图标在描边粗细、尺寸、currentColor 着色上不一致，且手写 SVG 无法随主题统一调色、难以维护。

**建议（P0 一致性）**：把 `DataAdmin.vue` 内的手写 SVG 全部替换为 lucide 组件（或统一 `<Icon name>` 封装），与控制台对齐。例如新增/筛选/删除/导出分别用 `Plus`/`Filter`/`Trash2`/`Download`。

### 2.2 排版细节
- 标题层级清晰（`.section-title` + `.view-context` 面包屑），可保留。
- **P2** 字号体系略散：面板内出现 `0.78rem`/`0.82rem`/`0.84rem`/`0.86rem` 等多种接近值，建议收敛为 token（如 `--text-xs/-sm/-base`），统一行高与字重。
- **P2** 状态色用 `var(--chart-2/3/5)` 表达 danger/warn/success（如 `g-diagnostic-row`、`g-overview-health`）。建议新增语义化 token（`--danger/--warning/--success/--info`），避免“图表色”与“语义色”耦合，深色模式下更易保证对比度。

---

## 3. 操作性（核心审查维度）

### 3.1 表格两大交互：排序 & 行内编辑——鼠标独占 ⚠️
这是**操作性 + 无障碍最关键的缺口**，两个高频操作键盘/读屏用户都用不了：

| 交互 | 当前实现 | 问题 |
|---|---|---|
| 排序 | `<th @click="sortBy(col.key)">`（`DataAdmin.vue:637-639`，`sortBy` 在 :2542） | 仅点击；**无 `role`、无 `tabindex`、无 `aria-sort`、无键盘事件**。键盘/读屏用户无法排序，且无法感知当前排序方向。 |
| 行内编辑 | 单元格 `@dblclick="startInlineEdit(item, col)"`（:696/709/712/715/737） | **仅双击触发**；无可见编辑入口（无铅笔图标/悬停提示/tooltip），**无键盘入口**。可发现性与可达性双低。 |

**建议（P0）**
- 排序 th 改为可聚焦按钮：
  ```html
  <th :aria-sort="sortKey===col.key ? (sortOrder==='asc'?'ascending':'descending') : 'none'">
    <button type="button" class="th-sort" @click="sortBy(col.key)" @keydown.enter.prevent="sortBy(col.key)">
      {{ col.label }} <SortIcon :class="{active: sortKey===col.key}" />
    </button>
  </th>
  ```
- 行内编辑增加可发现入口 + 键盘支持：单元格 hover/focus 显示铅笔图标；单元格可聚焦（`tabindex=0`），`Enter` 进入编辑、`Esc` 取消、`Enter` 提交；编辑态 `input` 加 `aria-label`。

### 3.2 工具栏信息密度过高
当前存在 **5+ 个动作面**叠加：
1. `toolbar-primary`（标题 + 新增）
2. `toolbar-secondary`（搜索 + “筛选”展开 → 内含 4 按钮：跨表搜索/高级筛选/保存视图/置顶表 + 状态下拉 + 日期区间）
3. `content-toolbar`（列配置/变更日志/批量编辑/删除选中/导出/备份全部/清理日志/执行到期开奖）
4. 多个浮动面板（列配置、批量编辑、变更日志、跨表搜索、高级筛选）
5. 备份进度遮罩竟**内嵌在 `content-toolbar` 内部**（`DataAdmin.vue:311-320`），应是顶层遮罩/模态，结构上属瑕疵。

**建议（P1）**
- 建立**操作层级**：主操作（新增/刷新/搜索）置于一级；次级批量/导出/配置收进 “更多 / ⋯” 菜单或 `role="toolbar"` 分组。
- 引入 **命令面板（`⌘K`）**：把所有动作（切换表、新增、导出、列配置、保存视图…）收敛到一个可搜索的面板，显著降低认知负荷——与现有快捷键体系天然契合。
- 将备份进度、`isFilterLoading` 等提升为独立覆盖层（`Teleport` 到 body），不要在工具栏里嵌遮罩。

### 3.3 选择模型的语义缺陷
- `toggleSelectAll` 只作用于**当前页** `paginatedData`（:2616-2625），但标签/提示容易让人误以为“全选所有结果”。
- 缺少 “选择全部 N 条匹配结果（跨页）” 模式（类似 Gmail 的横幅）。

**建议（P1）**：勾选“表头全选”时：
- 若仅当前页 → 维持现状；
- 提供 “选择全部 X 条结果” 横幅，点击后 `selectedItems` 扩展为整段查询结果（注意与分页加载/性能的平衡，可改为服务端 `update ... where <filters>` 语义）。

### 3.4 搜索入口语义重叠
存在两套不同作用域的搜索：
- 侧边栏“快速搜索”（`localSearchQuery`）→ 过滤**导航/模块列表**（AdminSidebar.vue）。
- 工具栏“搜索数据”（`searchQuery` → `handleSearch`）→ 搜索**当前表记录**。
- 头部 `AdminHeader` 在本视图 `:searchable="false"`（DataAdmin.vue:25），故不渲染；但其仍挂载了全局 `/` 监听去聚焦一个不存在的输入框（`AdminHeader.vue:136-141`）——与 `useDataAdminShortcuts` 的 `/`（聚焦 `.search-box input`）形成**两处 `/` 全局监听**的潜在冲突（目前因 searchable=false 而“恰好无害”，属潜伏 bug）。

**建议（P1）**
- 统一全局快捷键到 `useDataAdminShortcuts` 一处，移除 `AdminHeader` 内的重复 `/` 监听。
- 区分两搜索的文案/占位符（如“筛选导航模块” vs “搜索本表记录”），避免用户混淆。

### 3.5 抽屉编辑的“脏数据”保护不足
`EditDrawer` 的 `Esc` 直接关闭（EditDrawer.vue:5-6）。对数据后台而言，**误触 Esc 丢失未保存编辑**是真实风险。

**建议（P2）**：关闭前若 `dirty`（存在未提交改动），弹确认“放弃更改？”；或利用已有的 `shouldKeepDraft` 机制（DataAdmin.vue:4100）做草稿自动暂存。

### 3.6 可发现性细节
- 批量编辑/列配置/变更日志等面板依赖先点“筛选/列配置”等按钮展开，**缺乏状态提示**（哪个面板开着）。建议展开按钮用 `aria-expanded` + 高亮态。
- 跨表搜索结果用 `v-html="highlightCellValue(...)"`（:238）——注意 `highlightCellValue` 必须做转义，避免 XSS（建议在报告外另行安全核查，本审查不覆盖）。

---

## 4. 无障碍（a11y）清单

| 项目 | 状态 | 建议 |
|---|---|---|
| 危险操作确认 | ✅ 完整 | 保留；可额外提供“撤销”提升效率 |
| Toast `aria-live` | ✅ 有 | 保留 |
| 抽屉 `role/aria-modal`/焦点恢复 | ✅ 有 | 建议再加**焦点陷阱**（focus trap） |
| 排序 `aria-sort`/键盘 | ❌ 缺 | 见 3.1（P0） |
| 行内编辑键盘/可发现 | ❌ 缺 | 见 3.1（P0） |
| 可见焦点环 | ⚠️ 部分 | `.btn`(:825)`/.icon-btn`(:1298) 有 `:focus-visible`；`.review-btn`/`.clear-filters-btn`/`.collection-chip`/`.card-copy-btn`/`.mobile-action-btn`/可排序 th 需补 `:focus-visible` |
| 复选框自定义 | ⚠️ 需查 | `.checkbox-wrapper` 用原生 `<input>`+`.checkmark`，确认 `input` 未被 `display:none` 导致读屏失效（若隐藏需 `sr-only` + `:focus-visible` 描边） |
| 颜色对比 | ⚠️ 需查 | 深色模式下 `chart-*` 语义色对比度建议用工具核验 |

---

## 5. 可维护性 / 性能（影响长期操作性）

### 5.1 单文件体量（P1 结构性）
`DataAdmin.vue` = **5300 行单文件**，承担：表格、两个工具栏、移动卡片、卡片视图、行内编辑、列配置、批量编辑、变更日志、备份遮罩、全局搜索面板、高级筛选面板。
**风险**：回归面大、审查困难、并行开发易冲突。

**建议**：按职责拆分子组件（均在 `components/` 内）：
- `DataTable.vue`（含排序/选择/分页/行内编辑）
- `DataToolbar.vue`（搜索/筛选/批量/导出）
- `MobileCardList.vue`、`LotteryCardGrid.vue`
- `FilterPanel.vue` / `AdvancedFilterPanel.vue` / `ColumnConfigPanel.vue` / `ChangeLogPanel.vue` / `BackupProgressOverlay.vue`
- 主文件仅做编排（state + 编排），把“数据/突变/筛选/快捷键”逻辑继续留在现有 composables 中（这部分的 composables 拆分已经做得很好，应保留）。

### 5.2 样式表
`console.css` 2071 行、`responsive.css` 1670 行、`overlays.css` 1212 行，均为单文件。建议按组件作用域拆分为 `<style scoped>` 或 CSS Module，减少全局污染与覆盖顺序陷阱（尤其 `z-index`：topbar=1000、sidebar=1002、drawer overlay 需确认高于二者）。

---

## 6. 优先级改进清单（落地顺序）

**P0（立即）— 操作性/无障碍硬伤**
1. 排序 th 可键盘聚焦 + `aria-sort`（3.1）。
2. 行内编辑加可见入口 + 键盘支持（3.1）。
3. 统一图标体系：DataAdmin.vue 手写 SVG → lucide（2.1）。

**P1（本迭代）— 效率与一致性**
4. 集中全局快捷键，移除 `AdminHeader` 重复 `/` 监听（3.4）。
5. 横向子标签栏窄屏滚动/折叠（1.2）。
6. 工具栏分层 + 引入 `⌘K` 命令面板（3.2）。
7. 选择模型加“全选所有结果”语义（3.3）。
8. 备份进度遮罩提升为顶层覆盖层（3.2）。
9. 拆分 `DataAdmin.vue` 巨型单文件（5.1）。
10. 为 `.review-btn` / 行内编辑按钮 / FAB / 表格单元格补 `:focus-visible`（基础 `.btn`/`.icon-btn` 已有，详见 §8.2）。

**P2（打磨）**
11. 抽屉关闭前脏数据确认/草稿暂存（3.5）。
12. 字号/状态色收敛为 token（2.2）。
13. 抽屉加焦点陷阱、复选框 a11y 核查、深色对比度核验（4）。
14. 展开型面板加 `aria-expanded` 与高亮态（3.6）。

---

## 7. 一句话总结
面板"功能 completeness"已经很高，下一步的操作性红利来自三件事：**让表格的两大交互（排序、行内编辑）对键盘/读屏可用**、**统一图标与视觉语言**、**把过密的工具栏与 5300 行单文件拆解为分层、可发现的界面与组件**。危险操作确认、toast 无障碍、抽屉焦点管理这些已经做对的，请务必保留。

---

## 8. 交叉验证复核（2026-08-25 追加）

> 复核方法：在用户要求下，对第 0–7 节每条结论**重新独立核查**（重新 `grep` + 重新读取真实代码行），不采信上一轮分析记忆。复核中发现并修正了一处命令行 bug（变量未展开导致 focus-visible 初判为空），以下为更正后的最终结论。

### 8.1 复核结论表

| # | 原结论 | 复核结果 | 证据（重新核查） |
|---|--------|----------|------------------|
| P0-1 | 排序 `<th>` 无 `aria-sort`、无键盘入口 | ✅ 属实 | `DataAdmin.vue:638` `<th ... @click="col.sortable && sortBy(col.key)">`，无 `aria-sort`/`role`/`tabindex`/`@keydown`（仅 `@click`）；`sortBy` 定义于 `:2542` |
| P0-2 | 行内编辑仅 `@dblclick` 触发 | ✅ 属实 | 触发点 `:696/:709/:712/:715/:737` 均仅 `@dblclick="startInlineEdit(item, col)"`；单元格无编辑按钮、`tabindex`、`role`；键盘仅在已打开后用于保存（`:677-679`） |
| P0-3 | 图标体系分裂 | ✅ 属实（措辞精确化见 §8.2） | `DataAdmin.vue` 内 16 处手写 `<svg>`（`:141/151/160/293/300/422/501/504/604/605/619/622/902/909/937/1028`），同时 `:1060` 又从 `lucide-vue-next` 导入 10 个图标（Image/KeyRound/MessageSquare/Network/RefreshCw/Settings/ShieldCheck/Server/Sparkles/Users）；手写的 pencil/trash/copy/check 正是 lucide 已有图标；控制台 `ApiKeyConsole.vue` 纯 lucide（0 手写 svg） |
| 强项 | 危险操作全部确认 | ✅ 属实 | `useDataAdminMutations.js` 共 11 处 `dialog.confirm`（`deleteItem:116`、`batchDelete:151`、`closeLottery:289`、`banUser:637`、`muteUser:761`、`deleteModerationItem:602` 等） |
| P1-4 | `/` 快捷键重复绑定 | ✅ 属实 | `AdminHeader.vue:137` `if (e.key === '/')` 与 `composables/useDataAdminShortcuts.js:35` `if (e.key === '/')` 双重监听 |
| P1-7 | 选择仅当前页 | ✅ 属实 | `isAllSelected`(`:2118`) 与 `toggleSelectAll`(`:2616`) 均基于 `paginatedData.value`（当前页），无"全选所有结果"语义 |
| P1-9 | 5300 行单文件 | ✅ 属实 | `wc -l DataAdmin.vue` = 5300 |
| 搜索 | 搜索入口重叠/混乱 | ✅ 属实（措辞精确化见 §8.2） | `searchQuery` 模块内搜索（`:156`）、`globalSearchQuery` 跨表搜索（`:224`），且同一 `globalSearchQuery` 经 `:search-query`（`:10-12`）双向绑定到侧边栏模块过滤框（`AdminSidebar.vue:13-24`）→ 两入口共用一变量、用途不同 |
| 侧边栏 | flat 未用分组 | ✅ 属实 | `AdminSidebar.vue:32` 注释 `<!-- Navigation (flat, no groups) -->`，渲染为 `v-for="(mod, idx) in modules"`（`:5`）单层平铺，与 config 分组定义矛盾 |

### 8.2 两处需更正 / 精确化（重要）

1. **focus-visible 并非"普遍缺失"**：经复核，`.btn`（`console.css:825`）与 `.icon-btn`（`console.css:1298`）**已有** `:focus-visible`。原报告"补 `.review-btn` 等控件的 `:focus-visible`"应精确为：基础按钮已有，缺失的是 **`.review-btn`（审核/开奖等高频操作按钮，`DataAdmin.vue:450-488`）、`.inline-edit-action`、`.fab-button`、以及表格单元格**。`DataAdmin.vue` 自身 `<style>` 块（5300 行内）**完全无** `:focus-visible`（V29）。P1-10 已按此更正。
2. **"三套搜索"应改为"两套数据搜索 + 一处变量复用冲突"**：实际是 `searchQuery`（模块内）与 `globaltSearch`→`globalSearchQuery`（跨表）两套数据搜索，外加侧边栏模块过滤框错误复用 `globalSearchQuery` 变量。问题真实存在，但本质是"变量复用导致的语义混乱"，而非三个独立系统。

### 8.3 复核方法说明
- 所有结论来自重新执行的 `grep`/`sed`/`wc` 与重新读取的真实代码行，未依赖上一轮记忆。
- 复核中修正了上一轮一个命令 bug（变量未展开导致 focus-visible 初判为空），已用更正后的结果替代。

---

## 9. P0+P1 实施记录与交叉复核（2026-08-25 追加）

> 实施范围：P0 全部 + P1 全部（**不含** P1-9「拆分 `DataAdmin.vue`」，按用户要求跳过）。
> 校验：`@vue/compiler-sfc` parse/compileTemplate + esbuild（script 语法）通过；`vue-tsc --noEmit` 0 错误；ESLint 0 errors（49 条 warning 均为该 5300 行文件既有未用变量，非本次引入）。

### 9.1 实施清单（文件 → 改动 → 复核结果）

| 项 | 改动 | 复核证据 |
|----|------|----------|
| P0-1 排序键盘可达 + aria-sort | `DataAdmin.vue` 排序 `<th>` 加 `:tabindex`、`:aria-sort`（ascending/descending/none）、`@keydown.enter/space` 触发 `sortBy` | 复核通过（行 615-622 目视 + grep） |
| P0-2 行内编辑键盘可达 + 可见入口 | 5 类可编辑单元格（badge/price/date/datetime/text）加 `tabindex=0`、`role="button"`、`aria-label`、`Enter/Space` 启动编辑；每格新增悬停/聚焦显示的 pencil 按钮（`.cell-edit-trigger`，编辑态隐藏） | 5 处 trigger + 5 处 tabindex 均确认；CSS 位于 console.css |
| P0-3 统一图标 lucide | 替换 18 处手写 `<svg>` 为 lucide（Plus/Search/Filter/Trash2/Download/Pencil/Copy/Check/X），新增 9 个图标导入 | `grep '<svg' DataAdmin.vue` = 0 |
| P1-4 移除重复 `/` 监听 | 删除 `AdminHeader.vue` 的 `handleKey`（聚焦 `.g-topbar-search input`，因 `searchable=false` 为空转）及其监听，`/` 仅由 `useDataAdminShortcuts` 处理 | grep `handleKey` = 0 |
| P1-5 子标签栏窄屏滚动 | 复核发现 `.g-module-tabs` **已具备** `overflow-x:auto`；仅补 `overscroll-behavior-x:contain` + `-webkit-overflow-scrolling:touch` | 行 5053-5054 确认 |
| P1-6 命令面板 + 工具栏入口 | 新增 `⌘K`/`Ctrl+K` 命令面板：可过滤命令列表（新增/刷新/主题/导出/备份/跨表搜索/高级筛选/列配置/变更日志/批量删除/切换 50+ 模块）、键盘 ↑↓ 选择、Enter 执行、Esc 关闭、点击遮罩关闭；工具栏新增「命令 ⌘K」可见入口按钮；内容工具栏本就 `flex-wrap:wrap`（分层） | 模板 1046-1086 + 脚本 + 按钮均确认；类型检查通过 |
| P1-7 全选所有结果 | 新增 `selectAllResultsMode`：表头复选框 aria-label 区分「全选本页/取消全选」；工具栏「全选所有结果 (N)」按钮（多页时出现）；跨页全选横幅 `.selection-all-banner`（含清除）；`isAllSelected`/`toggleSelectAll` 兼容新模式；`selectedItems` 在跨页模式填入全部 `currentData`，批量删除/编辑天然生效 | 脚本 1305/2198/2696-2720 + 模板 276/304-306/611 确认 |
| P1-8 备份遮罩顶层化 | 遮罩标记从 `.toolbar-right` 内部移出到模板根部（toast 前），补 `role="dialog"`/`aria-modal`；CSS 原已 `position:fixed; z-index:12000`（真正风险是祖先 transform/毛玻璃降级 fixed，移出后消除） | 行 1035 确认 |
| P1-10 关键控件 focus-visible | 补 `.review-btn`、`.inline-edit-action`、`.fab-button`、可编辑单元格 `.cell-text.editable/.cell-badge/.cell-price/.cell-date`、`.cell-edit-trigger` 的 `:focus-visible`（沿用 `--ring` token） | console.css 5 处新增确认 |
| 搜索变量复用解耦 | 移除 `DataAdmin` 中 `:search-query="globalSearchQuery"` / `@update:search-query` 双向绑定，侧边栏过滤框不再污染跨表搜索变量 | grep 无残留 |

### 9.2 交叉复核说明
- 每个改动均以「grep + 重新读码」独立验证存在性与正确性，非采信记忆。
- 新增 `scripts/verify-sfc-parse.mjs` 作为轻量 SFC 语法/模板校验工具（parse + compileTemplate + esbuild），可复用于后续改动。
- 复核中发现并修正一处：`.cell-edit-trigger` 悬停背景原用未定义变量 `--surface`，已改为已定义的 `--muted`；编辑态时隐藏 pencil 按钮避免与编辑框重叠。

### 9.3 未实施（按用户要求跳过）
- P1-9 拆分 `DataAdmin.vue`（5300 行单文件）——用户明确"不拆分文件"。

---

## 10. 全面优化实施记录（阶段 1-4，2026-08-25 追加）

> 范围：4 阶段全部落地（不拆文件）。校验：SFC parse/compileTemplate + esbuild 通过、`vue-tsc --noEmit` 0 错误、ESLint 0 errors、vitest 全量通过。

### 10.1 阶段 1 视图层（Config 驱动）
- **通用视图切换器**：`viewMode`（table/card/kanban/timeline），`availableViewModes` 由 config 驱动（有 cardView→卡片、有 kanban/status 字段→看板、有 datetime 列→时间线）；`localStorage` 按表记忆；`defaultView` 可配置（默认有卡片→卡片，否则表格）。
- **卡片流**：核实现有 18 张表已配 `cardView`（gifts/addresses/posterRequests/forum/news/activities/products/shopOrders/pointsTransactions/notifications/forumPostReports/forumPostImages/blockWallItems/bohCreatorShows/birthdayEvents/birthdayWishes/lotteries），新补 `coreMemories`（官方事实）。
- **看板**：`kanbanViewConfig` 推断顺序 = `kanban.statusKey` 显式 > `cardView.statusKey` > 自动找 status select 字段；列 = statusMeta 或字段 options。已为 `reviewPosts/reportedPosts/reviewComments/lotteryFulfillments` 加显式 `kanban` 配置；`shopOrders` 等有 cardView.statusKey 的表自动获得看板。看板卡片点击开编辑抽屉，审核表含通过/拒绝快捷按钮。
- **时间线**：`timelineViewConfig` 自动推断（首个 datetime 列作时间、首文本列作标题、最多 4 个正文字段），日志类表（lotteryDrawLogs/lotterySchedulerLogs/moderationLogs/pointsTransactions/lotteryAuditLogs 等）自动可用，按日分组倒序。
- 全部新视图键盘可达（tabindex + Enter + focus-visible），与 P0 无障碍体系一致。

### 10.2 阶段 2 交互效率
- **通用状态分布（统计下钻）**：`statusBreakdownForCurrentTab` 复用看板列（label/tone 更准），有状态字段的表都显示状态分布条并点击下钻筛选（替代原仅 collection 表）。
- **引用面板**：行操作新增"关联"入口（`relatedJumpsForItem` 复用 `RELATED_JUMP_MAP`），面板集中展示一条记录的所有关联（字段→目标表→搜索值）并跳转，替代来回跳转。
- **批量操作**：核查 `batchDelete`（数量确认）与 `applyBatchEdit`（预览+确认+部分失败回滚）已具备向导级体验，无需改动。

### 10.3 阶段 3 性能体验
- **抽屉焦点陷阱**：`EditDrawer` 加 Tab 循环（`trapFocus`），焦点保持在抽屉内。
- **暂缓项（诚实标注）**：表格虚拟滚动——现有分页已缓解大表渲染，虚拟化需改造表格容器且易与选择/排序/分页冲突，建议后续单独做；脏数据确认/草稿暂存——编辑状态在父组件（EditDrawer 仅转发 updateField），深比较易误报，需谨慎设计后单独实现。

### 10.4 阶段 4 视觉与架构
- **设计 token**：base.css 新增语义 token（`--success/-info/-warning/-danger` 及 `*-soft`，三套：light/dark/auto-dark）；console.css 批量收敛 65 处硬编码色值（33 处 `#4285f4→var(--primary)` 等）。注意：深色模式 `--primary` 为品牌红（#fc2c50），token 化后相关控件深色下会跟随品牌色，属预期行为，建议点验深色观感。
- **毛玻璃**：`.g-topbar`（头部）、`.drawer`（编辑抽屉）、`.command-palette`、`.backup-progress-panel` 加 `backdrop-filter: blur+saturate` + 半透明背景（`color-mix`），深/浅色自适应。
- **配置驱动收口（约定）**：表配置新增可选字段——`defaultView`（默认形态）、`kanban: { statusKey, statusMeta }`（看板）、`timeline: { dateKey, titleKey, bodyKeys }`（时间线）、`cardView`（卡片，已有）。新形态全部由 `tables.js` 驱动，加配置即生效。

### 10.5 后续待办（非本轮）
- 表格虚拟滚动、抽屉脏数据确认/草稿暂存（见 10.3）。
- 剩余 46 处中性/图表硬编码色值（#0f172a 等）可进一步 token 化。
- 独立主从详情布局（订单+明细）——现由引用面板覆盖关联场景。
