# 027 · 数据管理面板重构（语义修正 + CF 式控制台 + 详情子页）

> 目标：把 `DataAdmin.vue` 从「功能齐全但平铺」的后台，改造成**任务驱动的高密度控制台**：
> 先修 3 个语义缺陷（信任问题），再收敛首屏（418px → ≤240px），再把编辑从抽屉升级为详情子页。
>
> 提出：2026-10-17（依据 `docs/2026-10-17-数据管理面板UI全量评审.md` §1–§10 与 `demo-data-admin-cf-layout.html`）
> 状态：**设计待确认**（未动代码）
> 允许大范围改动，但**按可独立上线的阶段切分**，不做 big-bang 重写

---

## 1. 为什么现在做

### 1.1 三个语义缺陷（比视觉问题严重，必须先修）

| # | 缺陷 | 证据 | 后果 |
| --- | --- | --- | --- |
| S1 | 「跨页全选」只把**当前页**放进 `selectedItems` | `DataAdmin.vue:3649-3653` + `:3118-3119`（服务端 `range()` 真分页） | 批量编辑以为改全量，实际只改 20 条，且不报错 |
| S2 | 「导出」只导**当前页**，toast 却说「导出成功」 | `composables/useDataAdminExport.js:24-48` | 对账/发奖用错数据，且看不出来 |
| S3 | 筛选 0 条时提示「还没有数据，点新增」 | `:616-634`（条件用含筛选的 `totalRecordCount`，文案只看 `searchQuery`） | 误判数据丢失、造出不符合筛选的脏数据 |

### 1.2 结构债

| 指标 | 现状 | 目标 |
| --- | --- | --- |
| 表格首行距视口顶部（1440×900） | **418px** | **≤240px** |
| 首屏可见数据行 | 9 | ≥13 |
| 同页标题层级 | 3 层（顶栏 h1 / Hero h2 / toolbar h2） | 1 层 |
| 同页工具条 | 8 条 | 3 条（标题行 / tab 行 / 筛选行） |
| 「新增」入口 | 3 处（顶栏 / toolbar / 侧栏快捷） | 1 处 |
| 搜索入口 | 3 个（侧栏模块筛选 / 顶栏全局 / 表内） | 2 个（⌘K 全局 + 表内筛选） |
| 表头字号 | **11.2px**（0.7rem） | 13px |
| 导航可搜索范围 | 14 个模块（**搜不到 53 张子表**） | 模块 + 子表 |
| 变更审计 | 前端 localStorage 300 条 | 服务端表 + 只读审计页 |

---

## 2. 范围

### 2.1 做

- 语义修正（S1–S3）+ 删除确认的影响说明
- 布局收敛（去 Hero、合并工具条、tab 溢出、chips 合并）
- 字号/字重/令牌基线（14px、600/500、语义 token）
- 详情子页（只读 → 编辑态）+ 路由 + 列表状态保持
- CF 模式批 1（悬停复制、Shift 区间、时间范围预设、字段 help、`?` 快捷键、空状态教学）
- 审计日志（服务端）+ 只读权限矩阵
- 批量操作 job 结果页、Danger zone、全局异常 banner

### 2.2 不做（明确边界）

| 不做 | 理由 |
| --- | --- |
| 重写整个 `DataAdmin.vue` 为多页面应用 | 7853 行里混着 14 个 composable 的接线，big-bang 重写无法分阶段验证；改为**逐步抽 pane**（对齐 plans/025 的做法） |
| 改现有表结构（除新增审计表） | 软删除需要逐表评估，单独立计划 |
| 暗色主题重做 | 沿用 `[data-boh-theme]`，只做 token 对齐 |
| 移动端重构 | 只修窄屏断点（≤600px 主操作丢文字）与两套分页重复 |
| 引入 UI 组件库（Ant/Element） | 现有 `g-*` 类库已成型，换库等于重写 |

---

## 3. 目标形态

### 3.1 信息架构（不变的部分）

```
/admin/data-management
├── 概览（g-todo-band 已存在，补"按影响排序" + 全局可达）
└── 14 个数据域 × 53 张表
    ├── 列表（默认）           ?tab=activities&status=live&page=2
    └── 详情（新增）           /admin/data-management/activities/ACT-2026-018
        └── 编辑态（页内切换，不进 URL 层级）
```

**关键取舍**：详情用**同一个路由记录 + 参数**（`/admin/data-management/:tab/:id`），而不是子路由 + 独立组件。原因是 Vue Router 在"同一记录、仅参数变化"时**复用组件实例**，列表的筛选/页码/滚动位置天然保留；换成子路由会卸载列表，必须额外做状态外化。

### 3.2 列表页目标结构（自上而下）

```
面包屑（1 行）
H1 + 描述 + inline 统计 ················ 右侧：刷新 / 导出▾ / 新增
tab 行：常用 4~6 + 更多▾ ·············· 右侧：N 项待处理 ›
筛选行：搜索 · 状态 chips · 筛选(2) · 列配置 · ⋯
批量条（仅选中时出现，紧贴表格）
表格（粘性表头 + 粘性首列 + 粘性操作列）
footer：显示 1-20 / 共 128 · 每页 · 分页
```

### 3.3 详情页目标结构

```
面包屑：数据管理 › 运营 › 活动管理 › 八周年庆典 · 主会场
H1 + 状态 pill ························ 右侧：返回 / ⋯ / 保存
┌──────────────────────────────┬──────────────┐
│ 基本信息（两列字段网格）      │ 变更摘要      │
│ 活动说明（长文本）            │ 关联记录      │
│ …                             │ 最近修改      │
│                               │ Danger zone   │
└──────────────────────────────┴──────────────┘
吸底操作条：未保存状态 ········· 放弃 / 保存 / 保存并返回
```

---

## 4. 阶段划分（6 个阶段，每阶段可独立上线）

### 阶段 0 · 语义修正（不依赖任何 UI 改版，先上）

| 项 | 改动 | 文件 |
| --- | --- | --- |
| S1 | 文案先改为「全选本页 N 条」，移除「跨页全选」字样；`selectAllResultsMode` 保留但只在"全选全部"能力上线后启用 | `DataAdmin.vue:421-461`、`:3649-3653` |
| S2 | 导出改为菜单：`当前页（N 条）` / `全部筛选结果（M 条）`；后者复用 `exportBackupData` 的 range 分页；toast 回执条数 | `useDataAdminExport.js`、`DataAdmin.vue:194-202` |
| S3 | 空状态三分支：无数据 / 筛选无结果 / 搜索无结果；后两者显示已生效条件 chips + 「清除全部筛选」，隐藏「新增」主按钮 | `DataAdmin.vue:616-634` |
| S4 | 删除确认加影响清单：表名 + 前 3~5 条标识 + 关联计数 + 不可恢复声明；批量 ≥10 条要求勾选确认 | `useDataAdminMutations.js:117-157` |

**验收**
- 构造"筛选 0 条"：出现「清除全部筛选」，不出现「新增数据」
- 导出当前页 20 条 → toast 含「20 条（当前页）」；导出全部 → 条数 = 筛选结果总数
- 删除用户 → 弹窗含该用户积分/订阅计数
- `npm run test` 全绿（新增 3 条断言：导出范围、空状态分支、确认文案）

**工作量**：2.5 人日　**风险**：低

---

### 阶段 1 · 布局收敛（不改数据层，不动路由）

| 步 | 动作 | 释放高度 |
| --- | --- | --- |
| 1.1 | 删 `admin-section-hero`（`:87-106`）+ `toolbar-primary` 的重复 H2；统计改 H1 下方 inline | ≈100px |
| 1.2 | tab 胶囊 → 下划线 + 「更多 ▾」；置顶项排前（复用 `togglePinnedTab`） | 40~80px |
| 1.3 | 状态分布 chips 并入筛选行（`:285-302` → `:205-282`） | ≈44px |
| 1.4 | `content-toolbar`（列配置/更多/命令）并入筛选行右侧（`:394-418`） | ≈40px |
| 1.5 | tab 行右侧加「N 项待处理 ›」（0 高度成本，接概览 `g-todo-band`） | 0 |

**验收**
- 1440×900 下 `thead.getBoundingClientRect().top ≤ 240`
- 1280 宽下运营模块（11 tab）tab 行高度 ≤ 44px（单行）
- 新增探针 `probe-data-admin-density.mjs`：断言首行位置、tab 行高、工具条条数
- `npm run verify` 全绿；`npm run lint` 警告数 ≤ 114

**工作量**：3 人日　**风险**：中（模板重排，需逐 tab 回归）

---

### 阶段 2 · 字号与令牌基线

| 项 | 动作 |
| --- | --- |
| 2.1 | 正文 14px：表格 14 / 表头 13 / 辅助 12.5；去掉表头 `uppercase` + `letter-spacing`（`google-components.css:759-772`） |
| 2.2 | 字重收敛 600/500：全模块 `font-weight:650` **24 处** + `700` **40 处**（`DataAdmin.vue` 内只有 700×3，大头在 `PityGrantConsole` / `SubscriptionGrantConsole` / `overlays.css`） |
| 2.3 | 语义 token：`--bg-canvas / --bg-surface / --text-default / --text-subtle / --border-hairline / --accent` 六组，替换裸 hex（模块内共 **385 处**，其中 `styles/` 241、`DataAdmin.vue` 57） |
| 2.4 | 密度三档：紧凑 34px / 标准 42px / 宽松 48px，默认标准，按用户持久化 |

**验收**
- `DataManagement/styles/` 下的裸 hex 从 **241 处降到 ≤50**（余下的允许是状态色，需带注释）
- `font-weight:650` 全模块归零，`700` 仅保留在图标/装饰（需列白名单）
- 表格行高切换后 `offsetHeight` 分别 = 34 / 42 / 48
- 首行位置不因字号上调而变差（实测 +3px 内）

**工作量**：2 人日　**风险**：中（token 与站点主题的从属关系需先确认，见 §10 D3）

---

### 阶段 3 · 详情子页（最大改动）

#### 3.1 路由

```ts
// src/router/routes/admin.ts
{
  path: '/admin/data-management/:tab/:id',
  name: 'DataManagementRecord',
  component: () => import('../../views/DataManagement/index.vue'),
  meta: { requiresAdmin: true, hideNavbar: true },
}
```

> 与列表页**共用组件**，靠 `route.params.id` 分支渲染 → 组件实例复用 → 列表状态不丢。

#### 3.2 组件拆分（对齐 plans/025 的"抽 pane"做法，不重写）

```
views/DataManagement/
├── DataAdmin.vue            壳：sidebar + header + 分支（列表 / 详情）
├── panes/
│   ├── ListPane.vue         从 DataAdmin 抽出的表格区（≈1200 行）
│   └── RecordPane.vue       详情/编辑态（新增，≈700 行）
└── components/detail/
    ├── DetailHeader.vue     面包屑 + H1 + 操作
    ├── DetailFields.vue     字段网格（消费 config/fields.js）
    ├── DetailAside.vue      变更摘要 / 关联 / 审计 / Danger zone
    └── DetailActionBar.vue  吸底条（未保存状态 + 三按钮）
```

#### 3.3 编辑态

- 详情页默认只读；「编辑」切换为可编辑（组件内 state，**不进 URL 层级**）
- 保存复用 `useDataAdminMutations` 的同一入口，不新写保存逻辑
- 草稿 key 沿用 `getDraftKey()`（`tab:recordId`），离开守卫复用 `dialog.confirmThree`
- 保存后 `refreshCurrentViewAfterMutation()`，详情页读同一份数据，不再单独请求

#### 3.4 状态保持

| 场景 | 方案 |
| --- | --- |
| 列表 → 详情 → 返回（同一次会话） | 组件复用，天然保留 |
| 直接打开详情链接 / 刷新 | 列表状态为空 → 返回落到 `?tab=:tab`；阶段 3 先接受 |
| 分享带筛选的列表 | 阶段 6 再做 query 同步（见 §5） |

**验收**
- 点行 → 详情，URL 变为 `/:tab/:id`，面包屑 4 级
- 详情 → 返回，筛选/页码/滚动位置与进入前一致
- 编辑保存后返回列表，该行显示新值且不重复请求
- `row.id` 缺失时回退抽屉（防御性分支，见 §10.1）
- `npm run probe:route-switch` 全绿（路由改动必跑）
- 新增单测：`data-admin-detail-route.test.js`（参数解析、无 id 表回退、面包屑构造）

**工作量**：6 人日　**风险**：高（路由 + 组件拆分 + 状态）

---

### 阶段 4 · CF 模式批 1（纯前端，逐条可独立合并）

| 项 | 动作 | 文件 |
| --- | --- | --- |
| 4.1 | 悬停复制：ID/邮箱/URL 单元格 hover 出复制图标 + 「已复制」轻提示 | 新增 `components/shared/CopyCell.vue` |
| 4.2 | Shift 区间选择：勾一个后 Shift 勾另一个选中区间 | `DataAdmin.vue` 选择逻辑 |
| 4.3 | 时间范围预设：`最近 7 天 ▾` + 自定义弹层，替代两个裸 date input | 新增 `components/shared/DateRangePicker.vue` |
| 4.4 | 字段级 help：`config/fields.js` 增 `help` 字段，表单渲染 `?` 浮层 | `config/fields.js` + `EditDrawer.vue` |
| 4.5 | `?` 快捷键表（⌘K / / 聚焦搜索 / Esc / J K 上下行） | 新增 `components/shared/ShortcutHelp.vue` |
| 4.6 | 空状态教学化：这张表是什么 / 谁写入 / 示例记录 | `DataAdmin.vue:616-634` |

**验收**
- 复制后剪贴板内容与单元格一致（单测 mock `navigator.clipboard`）
- Shift 选择区间 = 起止索引之间的全部行
- 时间范围切换后请求参数含 `gte/lte`，且日志表默认 7 天
- `?` 浮层 Esc 可关，焦点回到触发元素

**工作量**：3 人日　**风险**：低

---

### 阶段 5 · 审计日志 + 权限矩阵（需数据层）

#### 5.1 审计表（草案）

```sql
create table if not exists public.admin_audit_logs (
  id            bigserial primary key,
  actor_id      uuid references auth.users(id) on delete set null,
  actor_label   text,
  action        text not null,            -- create|update|delete|batch_delete|grant|moderate|export
  resource_table text not null,
  resource_id   text,
  diff          jsonb,                    -- {"status":{"from":"pending","to":"approved"}}
  meta          jsonb,                    -- {"count":12,"filters":{...}}
  created_at    timestamptz not null default now()
);
create index on public.admin_audit_logs (resource_table, created_at desc);
create index on public.admin_audit_logs (actor_id, created_at desc);
```

- 写入：前端在 mutation 成功后调用 `log_admin_action` RPC（security definer，白名单 action）
- 读取：仅 admin（RLS `select` 策略按 `profiles.role = 'admin'`）
- 迁移前必须：`supabase db lint --linked` 零错误 + 事务内 `BEGIN…ROLLBACK` 试跑

#### 5.2 只读权限矩阵页

> ⚠️ **状态（2026-10-17 修正）**：本项**未随 E 批交付**，E 批交接时被误报为"已实现"；审查发现后经产品确认**移出 027、记入 backlog**。上行数量口径：027 的 30 个工作项按 29 项交付计。

`系统 → 权限矩阵`：行 = 53 张表，列 = view/create/edit/delete/moderate，单元格显示 `admin ✓ / moderator ✓(view)`，数据源直接读 `TABS_ACTIONS` + `MODULE_ALLOWED_ROLES`。**只读**，不做编辑。

**验收**
- 删除任意记录后，审计页出现 1 条（actor/action/resource/diff 齐全）
- 导出操作也留痕（`action='export'`，`meta.count`）
- 权限矩阵与 `TABS_ACTIONS` 逐项一致（单测遍历断言）
- `npm run check:db-lint`、`check:db-advisors` 通过（发布前，不进 verify）

**工作量**：8 人日　**风险**：高（建表 + RLS + 前端接线）

---

### 阶段 6 · 批量 job / Danger zone / 全局 banner / URL 即状态

| 项 | 动作 |
| --- | --- |
| 6.1 | 批量操作结果页：N 成功 / M 失败 + 失败明细 CSV + 重试；toast 带「查看结果」 |
| 6.2 | 服务端真全选：`selectionScope='all'` + 筛选快照，执行走白名单 RPC（**替代**阶段 0 的文案妥协） |
| 6.3 | Danger zone：详情页底部红区，删除用户/订阅要求输入 ID 或勾选确认 |
| 6.4 | 全局异常 banner：诊断异常时顶栏下方 slim banner，正常时不占高度 |
| 6.5 | URL 即状态：筛选/页码/排序写入 query（`?tab&status&page&sort&q`） |

**验收**
- 批量删 200 条中 3 条失败 → 结果页显示 197/3 + 可下载失败明细
- 服务端全选后删除，影响行数 = 筛选结果总数（DB 计数比对）
- 刷新带 query 的列表，筛选与页码还原
- 异常 banner 仅在 `diagnosticIssueCount > 0` 时出现

**工作量**：4 人日　**风险**：中

---

## 5. 阶段依赖与推荐顺序

```
阶段0（语义）──┬─→ 阶段1（布局）──→ 阶段2（字号/令牌）──→ 阶段3（详情子页）──┬─→ 阶段4（CF 批1）
               │                                                              └─→ 阶段6（job/banner/URL）
               └─→ 阶段5（审计/权限）—— 与 1~4 并行（不同文件、不同层）
```

- **阶段 0 必须最先**：它是唯一"用户信任"级别的修复，且不与其他阶段抢文件。
- **阶段 1 与 2 可合并为一次发布**：都在改 `DataAdmin.vue` 模板与样式，分开上线会让回归面翻倍。
- **阶段 3 必须在 1、2 之后**：详情页要复用收敛后的样式与 token，否则要改两遍。
- **阶段 5 可并行**：只碰数据层 + 新增页面，不动列表模板。

**总计 ≈ 28.5 人日**（不含评审与回归缓冲，建议 ×1.3）。

---

## 6. 门禁与自证

| 阶段 | 必跑 | 说明 |
| --- | --- | --- |
| 全部 | `npm run verify` | 12 道 check → lint → type-check → test |
| 改样式 | `npm run verify:fast` | 快速回路 |
| 改路由 | `npm run probe:route-switch` | 新增路由记录必须过 |
| 改布局 | 新增 `probe-data-admin-density.mjs` | 断言首行 ≤240px、tab 行 ≤44px、工具条 = 3 |
| 新增文件 | `npm run check:doc-truth:update` | 源文件数变化会红；**同步改 AGENTS.md 那三个数** |
| 加门禁 | `npm run check:gates-self-test` | 新探针要有 fixture，否则是"永远绿" |
| 数据层 | `check:db-lint` / `check:db-advisors`（发布前） | **不得接进 `verify`** |
| lint | `npm run lint:delta` | 上限 114，新增警告当场红；抽组件常因"迁走符号"多出未使用 import，每组 +2~5 |

**测试增改清单**

| 文件 | 动作 |
| --- | --- |
| `tests/unit/data-admin-density.test.js` | 改（密度三档） |
| `tests/unit/data-admin-tab-config-coverage.test.js` | 改（tab 溢出分组后仍覆盖 53 张表） |
| `tests/unit/data-admin-rbac.test.js` | 保持（矩阵页复用同一配置） |
| 新增 `data-admin-export-scope.test.js` | 当前页 / 全部 两种范围 |
| 新增 `data-admin-empty-state.test.js` | 三分支文案与按钮 |
| 新增 `data-admin-detail-route.test.js` | 参数解析 / 无 id 回退 / 面包屑 |
| 新增 `data-admin-audit-log.test.js` | mutation 后写审计（mock RPC） |

---

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- | --- |
| R1 | 组件拆分导致 lint 未使用符号激增，卡住 114 上限 | 高 | 中 | 每抽一个 pane 跑 `lint:delta`，同步删壳里的 import |
| R2 | 详情路由改动影响旧书签 `/admin/api-keys` 别名 | 中 | 中 | 别名路由保持独立，不共用参数；跑 `probe:route-switch` |
| R3 | 无稳定主键的表无法深链 | 高 | 中 | 阶段 3 前先产出"可深链表清单"；其余表点行仍开抽屉 |
| R4 | token 化与站点主题联动，出现"后台跟站点变色" | 中 | 高 | 阶段 2 前确认 `[data-boh-theme]` 的从属关系（D3） |
| R5 | 审计表 RLS 配错导致越权读 | 低 | 高 | `check:db-advisors` + 事务内以真实用户身份试读 |
| R6 | 阶段 1 删 Hero 后诊断信息失去入口 | 中 | 中 | 先接概览 `g-todo-band` 与 tab 行「N 项待处理」，再删 |
| R7 | 并行会话同时改 `DataAdmin.vue` | 中 | 高 | 遵守 `docs/AI-ENV.md`：只 `git add <自己的路径>`，不 `-A`，不 `checkout HEAD --` |

---

## 8. 回滚策略

| 阶段 | 回滚方式 |
| --- | --- |
| 0 | 纯文案/分支，单 commit 可 revert |
| 1–2 | 布局与样式集中在 `DataAdmin.vue` + `styles/`，按 commit 粒度回退 |
| 3 | 路由记录独立，删除即回到列表-only；`RecordPane.vue` 不接线不影响主流程 |
| 5 | 审计表 `drop table` 即可；前端 `log_admin_action` 失败**必须静默降级**，不得阻断业务 |

> 阶段 5 的硬约束：**审计写入失败不能让删除/保存失败**。宁可丢审计，不可丢业务（并在 console 打 `logger.error` 供排查）。

---

## 9. 工作量汇总

| 阶段 | 内容 | 人日 | 风险 |
| --- | --- | --- | --- |
| 0 | 语义修正 | 2.5 | 低 |
| 1 | 布局收敛 | 3 | 中 |
| 2 | 字号与令牌 | 2 | 中 |
| 3 | 详情子页 | 6 | 高 |
| 4 | CF 批 1 | 3 | 低 |
| 5 | 审计 + 权限矩阵 | 8 | 高 |
| 6 | job / banner / URL | 4 | 中 |
| — | **合计** | **28.5** | — |

---

## 10. 决策建议（D1–D5，附依据）

> 本节给出**明确建议**而非选项罗列，五条都可以直接照此执行。
> 其中 **D1、D3 修正了我前几轮的两个错误判断**，依据见 §10.1 / §10.2。

| # | 决策 | 建议 | 一句话理由 |
| --- | --- | --- | --- |
| D1 | 哪些表可进详情页 | **全部 48 张表 tab 可进**，分两波上线；运行时 `row.id` 缺失则回退抽屉 | 实测 48/48 的查询配置都带 `id`，无需白名单 |
| D2 | 跨页全选 | **阶段 0 只改文案**（"全选本页"），阶段 6 再做服务端 RPC | 先把"说错话"改掉，能力后补；避免半成品承诺 |
| D3 | 后台主题 | **保持跟随 `themeManager`**，token 化只做角色映射，**不新增主题源** | 现有注释记录了"第二套主题真源"引发的线上 bug |
| D4 | 删除语义 | **物理删除 + 服务端审计**先行；软删除单独立计划 | 53 张表 + 全部查询都要加 `deleted_at is null`，漏一处即数据泄漏 |
| D5 | 审计写入方式 | **RPC**（`log_admin_action`），触发器暂不做 | RPC 能带 actor 上下文、diff、筛选快照；触发器只有行数据 |

### 10.1 D1：为什么不是白名单

上一轮我建议"先白名单"，理由是 `getRowIdentity` 有"无 id 时退化成随机串"的兜底（`DataAdmin.vue:3123-3131`）。**实测推翻了这个推断**：

```
TAB_SELECT_COLUMNS 共 48 个表 tab → 全部包含 id 列（0 个缺失）
53 - 48 = 5 个是页面型 tab（points-grant / subscriptions-grant / keys-models / pity-grant / ai-* ），不是表格
```

兜底代码是防御性写法，不是"存在无 id 表"的证据。因此：

- **不必白名单**，48 张表都可深链；
- 但**分两波**：波 1 用 6 张代表性表（activities / users / news / products / coreMemories / lotteries）验证路由、面包屑、草稿、RBAC 四条链路；波 2 全量切换；
- **保留运行时回退**：`if (!row.id) return openEditModal(row)`。这样即使某张表将来改成视图/复合键，也不会 404，只是退回抽屉。

### 10.2 D3：我上一轮的建议是错的

我上一轮写"后台主题应独立，`[data-boh-theme]` 不联动"。**这是错的**，代码里已有明确的反面记录：

```js
// DataAdmin.vue:3618-3620
// 主题切换统一走 themeManager（唯一写入点：html[data-theme] + html.dark + boh-theme）。
// 这里曾经直写 documentElement 并把偏好另存到 localStorage['dm-theme']，
// 形成第二套主题真相源，后果是"用户在站内显式选了浅色、系统是暗色时，后台仍变暗"。
```

即：**后台独立主题 = 复活已被修掉的 bug**。正确做法：

- 保持 `themeManager` 为唯一写入点（`toggleAdminTheme` 已经如此）；
- 阶段 2 的 token 化只做**语义角色映射**（裸 hex → 既有 `--*` 变量），不引入新的主题状态；
- 验收加一条：切换深/浅色后，后台**不得有残留硬编码色**（截图逐屏对比，重点看 `PityGrantConsole` / `SubscriptionGrantConsole` / `ApiKeyConsole` 这三个 hex 大户）。

### 10.3 D2：为什么先改文案而不是直接做 RPC

服务端真全选需要"筛选快照 → 服务端按同一条件批量执行"，涉及：

1. 筛选条件序列化（`status / dateFrom / dateTo / searchQuery / advancedRules` 五类）；
2. 白名单表名 + 动态 SQL（`check:db-lint` 的 plpgsql_check 会静态查运行期必错）；
3. 影响行数预检（执行前先 `count` 一次，和用户看到的数字对齐）；
4. 失败明细回传。

这是阶段 6 的量级。而阶段 0 只需把"跨页全选"四个字改成"全选本页 N 条"，**一天内消除误判**，且不阻碍后续升级。半成品承诺（按钮写着全选全部、实际只选本页）才是当前最坏的状态。

### 10.4 D4：软删除为什么不能顺手做

软删除不是加一个字段，而是三件事同时成立：

| 要求 | 现状 | 代价 |
| --- | --- | --- |
| 所有读路径过滤 `deleted_at is null` | 48 张表 × 列表/搜索/关联/导出/统计，共 5 类入口 | 漏一处 = 已删数据重新出现在界面 |
| 唯一索引改为部分索引（`where deleted_at is null`） | 现有唯一约束未区分 | 删除后无法重建同名列（如 `gift_no`） |
| RLS 策略同步（`using` 里加条件） | 现有策略未含 | 越权读已删数据 |

且"删除用户"这类场景真正的诉求是**可追溯**（谁删的、删了什么），不是**可恢复**。审计表能 100% 满足前者，软删除只能部分满足后者且代价高 5 倍。**建议：先审计，观察 3 个月真实误删率，再决定是否为 users / subscriptions 两张表单独做软删。**

### 10.5 D5：RPC 与触发器的取舍

| 维度 | RPC（推荐） | 触发器 |
| --- | --- | --- |
| actor | 可带 `auth.uid()` + 前端展示名 | 只有 `auth.uid()`，服务角色写入时为空 |
| diff | 前端可算 before→after | 只能 `OLD/NEW` 整行对比，JSON 字段噪音大 |
| 意图 | 能记 `action='export'`、`meta.filters` | 只能记 DML，导出/查看类无痕 |
| 覆盖 | 只覆盖走 UI 的写入 | 能覆盖 cron / service role 写入 |
| 失败影响 | RPC 失败可降级（不阻断业务） | 触发器抛错会**回滚业务事务**（更危险） |

结论：**RPC 先行**；若后续要覆盖 cron/EF 写入，再对 `users` / `subscriptions` 两张高价值表加触发器（触发器内 `begin … exception when others then null` 吞异常，绝不阻断业务）。

---

## 11. 首个 PR 建议

> **施工单已拆出两份**：
> - 全量（批次 A–E，30 项）：[`docs/2026-10-17-交接-数据管理重构-全量施工单.md`](../docs/2026-10-17-交接-数据管理重构-全量施工单.md) ← **实现方读这份**
> - 批次 A 详版（导出 + 空状态，含可复制代码与单测）：[`docs/2026-10-17-交接-阶段0-导出与空状态.md`](../docs/2026-10-17-交接-阶段0-导出与空状态.md)

**只做阶段 0 的 S2 + S3**（导出范围 + 空状态三分支），理由：

- 两者都在 `DataAdmin.vue` 的局部区域，互不冲突
- 都能用截图 + 单测自证，不需要跑探针
- 修完立刻消除"导出数据不对"和"数据没了"两类最高频误判
- 为后续所有阶段建立"小步提交 + 可验证"的节奏

验收命令：

```bash
npm run test -- data-admin-export-scope data-admin-empty-state
npm run verify
```

---

## 12. 改造范围与影响面

模块基数：`src/views/DataManagement/` **58 个文件 / 37,781 行**（`DataAdmin.vue` 7,854；`EditDrawer.vue` 1,559；`console.css` 2,312；`responsive.css` 1,702）。

| 阶段 | 涉及文件 | 估算 diff | 影响层 | 不可逆点 |
| --- | --- | --- | --- | --- |
| 0 语义 | 8（3 新源 + 2 测试 + 3 改） | +390 / −55 | 仅后台两处 UI | 无 |
| 1 布局 | 7 | +250 / −420 | 仅后台列表页 | 无 |
| 2 字号令牌 | 10 | +180 / −320 | 仅后台（含 4 个 console 子页） | 无 |
| 3 详情子页 | 8（4 新组件 + 路由 + 2 改 + 1 测试） | +1,100 / −200 | 后台路由 + 列表组件 | 无（路由记录删掉即回退） |
| 4 CF 批 1 | 7（4 新组件 + 3 改） | +450 / −40 | 仅后台 | 无 |
| 5 审计/权限 | 6（1 迁移 + 1 RPC + 2 新页 + 2 改） | +700 / −30 | **数据层** | **审计数据写入后不可撤销**（业务已发生） |
| 6 job/banner/URL | 5 | +600 / −120 | 后台 + 批量链路 | 无 |
| **合计** | **约 35~40 个文件**（去重后） | **约 +3,700 / −1,185** | — | — |

**三层影响面**

| 层 | 覆盖阶段 | 用户可见变化 | 回滚 |
| --- | --- | --- | --- |
| T1 后台 UI | 0 / 1 / 2 / 4 / 6 | 只有管理员能看到 | 按 commit revert |
| T2 后台路由 | 3 | 新增 `/admin/data-management/:tab/:id`；旧别名 `/admin/api-keys` 不动 | 删路由记录 |
| T3 数据层 | 5 | 新增 1 表 + 1 RPC；**不改任何现有表结构、不改现有 RLS** | `drop table`（审计数据一并丢弃） |

**结论**：全量改动约占模块总量的 **10%**，但 90% 的改动集中在 6 个文件（`DataAdmin.vue`、`console.css`、`responsive.css`、`useDataAdminExport.js`、`useDataAdminMutations.js`、`config/fields.js`），其余是新增组件。真正不可逆的只有阶段 5 的审计数据，而它本身是"追加写"语义，不影响业务数据。
