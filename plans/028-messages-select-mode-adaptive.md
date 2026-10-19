# 028 · 消息中心「选择模式」横竖屏适配重构

- **状态**：DONE（2026-10-18 实施，见 §10 实施记录）
- **日期**：2026-10-18
- **触发**：用户报障「消息中心横屏有操作逻辑问题，点击选择之后也没有取消按钮，整体操作也不是很方便」
- **影响文件**：`src/views/user-center/Messages/index.vue`、`src/views/user-center/Messages/style.scoped.css`
- **关联**：`plans/022-userspace-ia-redesign.md`（消息 tab 只剩收件箱，`minimal` 为唯一挂载形态）

---

## 1. 一句话结论

选择模式现在有**三套壳**（页头桌面版按钮 / 「操作」下拉 / 底部悬浮条），但产品里**只有底部条一套是活的**，而底部条又被「桌面自动打开首条详情」这条规则**按死**。所以 ≥1024 的横屏下，点「选择」之后**页面上不存在任何动作或退出入口** —— 这不是「不方便」，是死局。

---

## 2. 实测现状（Playwright，2026-10-18，mock 9 条通知）

| 视口 | 场景 | `.x-select-action-bar` | 页头动作 | 结论 |
|---|---|---|---|---|
| 390×844 竖屏 | 选择模式 | `flex` 250×65 @ y=691（底栏上方 88px） | 隐藏 | 可用，拇指可达；列表底部 3 行被让位（padding 168） |
| 844×390 手机横屏 | 选择模式 | `flex` 250×65 @ y=237（vh=390） | 隐藏 | **条浮在屏幕中部**，压住列表第 2 行，下沿正好切到底栏胶囊顶部 |
| 740×360 手机横屏 | 选择模式 | `flex` 250×65 @ y=207 | 隐藏 | 同上更严重：条占屏高 18% |
| 1024×600 平板横屏 | 选择模式 | **不存在** | **不存在** | **死局**：只能全选，无法归档/已读，也无法退出 |
| 1280×800 桌面 | 选择模式 | **不存在** | **不存在** | 同上；且右侧详情仍开着，列表却在勾选 |

另：`Escape` 实测**不退出**选择模式（`window.dispatchEvent(KeyboardEvent('keydown',{key:'Escape'}))` 后 `.x-select-action-bar` 仍在）。

截图：`debug-screenshots/adapt-{portrait-390x844,landscape-844x390,landscape-1024x600,desktop-1280x800}-select.png`

---

## 3. 根因（四条，全部有代码坐标）

### R1 · 底部条被 `v-if` 与 CSS 双杀
- `index.vue:359`：`v-if="isSelectMode && !selectedMessage"`
- `index.vue:1951-1955`：`onMounted` 里 `window.innerWidth >= 1024` 时**自动选中第一条** ⇒ `selectedMessage` 从此恒非空
- `style.scoped.css:2482-2484`：`@media (min-width:1024) .detail-open .x-select-action-bar { display: none }`

⇒ ≥1024 下 `detail-open` 恒成立，条件与 CSS 各杀一次。

### R2 · 页头那套动作是永久 `display: none` 的死代码
- `style.scoped.css:1217`：`.x-filter-actions-desktop-minimal { display: none }`
- 全仓**没有任何规则**把它恢复成 `flex`（601–1023 的媒体查询 `:2046-2049` 也只是再写一遍 `none`）

⇒ minimal 页头里那段「完成 / 归档 N / 已读 N」（`index.vue:326-351`）**从来没显示过**。

### R3 · 「操作」下拉在 minimal 形态里根本不存在
- 下拉 DOM 在非 minimal 模板（`index.vue:81-148`）
- 而 `Messages` 全仓只以 `:minimal="true"` 挂载（`UserSpaceMain.vue:239-243`）

⇒ `style.scoped.css:2051-2053`（601–1023 显示下拉）指向一个不存在的元素。**三套壳里两套是死的。**

### R4 · 底距是竖屏底栏高度的硬编码
- `style.scoped.css:1229`：`bottom: calc(88px + env(safe-area-inset-bottom, 0px))`
- `style.scoped.css:1283-1285`：`.select-bar-open .x-list { padding-bottom: 168px }`

88px 是竖屏底栏口径。横屏 390 高的屏上，这条把动作条顶到 y=237（屏高 61% 处），168px 的列表让位等于 43% 屏高。横屏真正需要的是一条**贴底**的条。

---

## 4. 设计原则

1. **一个选择模式，只有一个退出入口**：左上角「取消」。动作执行后自动退出（现状四条批量操作都已 `isSelectMode = false`），所以底栏不需要第二个「完成」。
2. **动作面与详情面互斥**：进选择模式即收详情（≥1024），退出再恢复。`detail-open` 与 `select-bar-open` 不允许同时为真。
3. **壳随断点换，语义不换**：三档断点只改尺寸与容器形态，按钮集合恒定 = 取消 / 全选 / 全部·未读 / 已选 N / 归档 / 已读。
4. **底距与让位由 CSS 变量声明**，不再在 JS 里算像素。

---

## 5. 方案

### 5.1 状态机（P0，改动 ≤30 行，直接解死局）

```js
// index.vue · toggleSelectMode
const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value;
  if (isSelectMode.value) {
    // 进选择模式：收起详情（否则 detail-open 与选择模式并存，动作面被 CSS 按死）
    selectModeRestoreId.value = selectedMessage.value?.id || null;
    selectedMessage.value = null;
  } else {
    selectedMessageIds.value = new Set();
    // ≥1024 恢复进模式前那条详情；移动端保持关闭（本来就是抽屉）
    if (!isMobile.value && selectModeRestoreId.value) {
      const row = filteredMessages.value.find((m) => m.id === selectModeRestoreId.value);
      if (row) selectedMessage.value = row;
    }
    selectModeRestoreId.value = null;
  }
};
```

配套：
- `index.vue:359` → `v-if="isSelectMode"`（去掉 `&& !selectedMessage`）
- 删 `style.scoped.css:2482-2484`（`.detail-open .x-select-action-bar { display: none }`）—— 显隐交给 `v-if` 单一真源
- 删 `style.scoped.css:1217-1221` 与 `index.vue:326-351`（R2 死代码）
- 删 `index.vue:81-148` + `style.scoped.css:1296-1356`（R3 下拉，非 minimal 模板一并清理，见 §7）

### 5.2 顶部工具条（P1，补「取消」）

选择模式下 `.x-header-minimal` 收成**一行**：

```
[取消]  [☑ 全选]  [全部 | 未读]           已选 3 条
```

- 「取消」= `36×36` 圆角按钮 + 文字，`aria-label="退出选择"`，`@click="toggleSelectMode"`；样式走 `.x-mark-all-btn-minimal` 的次级态（不加主色）
- 「已选 N 条」用 `aria-live="polite"` 的 `span`，0 条时显示「选择消息」
- ≤600 竖屏：`已选 N` 折进「全选」的计数徽标（`全选 · 3`），避免第二行
- 页头宽度：≥1024 时 master panel 只有 `clamp(380px,38vw,520px)`，按 `取消 60 + 全选 70 + 分段 110 + 计数 80 + gap` ≈ 344px，388px 面板内**可单行放下**（chip 降到 32px 高、字号 12）

### 5.3 底部动作条（P1/P2）

- 只留 `归档` / `已读` 两个动作（移除 `完成`，语义与顶部「取消」重复；四条批量操作都已自动退出）
- 文案带计数：`归档 3` / `已读 3`；0 选中时**禁用**（现状 `已读` 在 0 选中时偷偷执行「全部已读」，横屏误触即清空全部未读 —— 必须改）
- 「全部已读」上移到页头（或复用已有灵动岛动作 `NotificationSuggestIsland`，`UserSpaceMain.vue:3486-3500` 已有闭环）

### 5.4 三档断点矩阵

| 断点 | 顶部 | 底部动作条 | 详情 | 列表让位 |
|---|---|---|---|---|
| 竖屏 `≤600` | 一行（计数折进全选） | 悬浮胶囊，`bottom: 88px + safe-area` | 全屏抽屉 | `padding-bottom: 168px` |
| 手机横屏 `601–1023` + `height ≤540` | 一行 | **贴底全宽条**：`left:0;right:0;transform:none;border-radius:16px 16px 0 0;height:52px;bottom:env(safe-area-inset-bottom)` | 全屏抽屉 | `padding-bottom: 72px` |
| `≥1024` | 一行 | 悬浮胶囊，`bottom: 24px`（无底栏） | **选择模式下关闭**；退出恢复 | `padding-bottom: 96px` |

实现上把底距变量化，三档各声明一次：

```css
.x-select-action-bar { bottom: var(--messages-sab-offset, calc(88px + env(safe-area-inset-bottom, 0px))); }
@media (orientation: landscape) and (max-height: 540px) { .x-notifications-container { --messages-sab-offset: env(safe-area-inset-bottom, 0px); } }
@media (min-width: 1024px) { .x-notifications-container { --messages-sab-offset: 24px; } }
```

### 5.5 横屏密度（「操作不方便」的另一半）

横屏 844×390 现在**一屏只看得见 2 条**（行高 88 + 页头 46 + 底栏 96 + 动作条 65）。在 `(orientation: landscape) and (max-height: 540px)` 下：

- `.x-item { padding: 10px 14px; }`，头像 36→32，`.x-text` 单行 `text-overflow: ellipsis`
- 行高 88→72 ⇒ **一屏 3 条**（实测：列表视口 390−120(shell chrome)−60(动作条) = 210px，72×3=216 差 6px 满屏；第 4 条要 52px 行高，得砍掉摘要行，不做）
- 页头 `.x-header-minimal { padding: 0 12px; }` 保持 38px 高

### 5.6 一致性与无障碍

- `.x-item.is-selecting .x-quick-actions { display: none; }`（现在 hover 仍会露出单条归档，与批量动作打架）
- 列表 `aria-multiselectable="true"`，行 `:aria-selected="selectedMessageIds.has(msg.id)"`
- `Esc` 退出：`window.addEventListener('keydown', e => { if (e.key === 'Escape' && isSelectMode.value) toggleSelectMode(); })`（随 `onUnmounted` 解绑）
- 移动端**长按 400ms** / 桌面**右键**直接进选择模式并选中该条（省掉「点选择→点行」两步）

---

## 6. 改动清单

| 文件 | 位置 | 动作 |
|---|---|---|
| `index.vue` | `:359` | `v-if="isSelectMode"` |
| `index.vue` | 多选模式段 | `enterSelectMode` / `exitSelectMode` / `resetSelectMode` + `selectModeRestoreId` |
| `index.vue` | minimal 页头 | 选择态改为单行工具条（取消 / 全选 / 分段 / 已选 N），删永久隐藏的 `.x-filter-actions-desktop-minimal` |
| `index.vue` | 底部动作条 | 移除「完成」；`已读` 0 选中时禁用（不再偷偷「全部已读」） |
| `index.vue` | 列表项 | `onItemClick` / 长按 450ms / 右键进选择模式；`aria-selected` / `aria-multiselectable` |
| `index.vue` | `onMounted` / `onUnmounted` | Esc 监听 + 解绑；`onActivated`/`onDeactivated` 同步 body 标记 |
| `style.scoped.css` | 容器 | 新增 `--messages-sab-offset` 三档 |
| `style.scoped.css` | `.x-select-action-bar` | `bottom` 走变量；显隐交给 `v-if`；删 `.detail-open … { display:none }` 杀手 |
| `style.scoped.css` | `.x-select-toolbar` 等 | 新增单行工具条 / 取消钮 / 计数样式（暗色只用纯 token） |
| `style.scoped.css` | 横屏媒体查询 | 贴底全宽条 + 行高 88→72 + 让位 168→76 |
| `UserSpace/components/bottom-nav.css` | 文件尾 | 横屏选择期间底栏下沉让位（`body.boh-messages-selecting`） |
| `scripts/probes/probe-messages-select.mjs` | 新增 | 83 条断言 |

---

## 7. 验证（新增 `scripts/probes/probe-messages-select.mjs`）

5 档视口（390×844 / 844×390 / 740×360 / 1024×600 / 1280×800）× 3 态（进入选择 / 勾选 1 / Esc）+ 3 个补充场景（长按 / 右键 / 已归档分区），共 **91 条断言**，实跑 91/91 PASS：

1. `.x-select-cancel` 存在、可见、`elementFromPoint` 命中（遮挡检测，防「加了 class 但被压住」）
2. `.x-select-action-bar` 在视口内，且**与底栏矩形不相交**（竖屏专项；横屏查底栏是否让位）
3. `≥1024` 选择模式下 `.x-detail-panel` **不存在**；Esc 后恢复存在
4. `Escape` 后动作条消失、`.x-item.selected` 归零、`body.boh-messages-selecting` 摘除
5. 0 选中时 `已读` 禁用；勾选 1 条后可用、计数变「已选 1 条」
6. 手机横屏完全可见行数 **≥3**（改动前 2）
7. 横屏 Esc 后底栏不再被选择模式藏住（`is-hidden` 属滚动隐藏，另算）
8. 长按 450ms 进选择模式并勾中该条；桌面右键同理且不误开详情
9. 已归档分区批量入口是「取消归档」，且 0 选中时「已读」禁用

发布前：`npm run verify` + 该探针；改动涉及 `index.vue` 模板结构，另跑 `node scripts/probes/probe-messages-metrics.mjs`（页头高度在案）。

---

## 8. 风险与回归面

- **删非 minimal 分支**是最大面：`index.vue` 的 `.x-header`、`.x-filter-actions-desktop`、`.x-select-actions-dropdown` 及 `style.scoped.css` 对应 ~200 行。删除会让 `lint --max-warnings` 的未使用符号计数变化（`toggleActionsDropdown` / `actionsDropdownOpen` / `selectFilterOpen` 等），必须同一次提交内清干净并核对棘轮上限，**不要跨提交**。
- `.detail-open` 与 `select-bar-open` 两个 class 在 CSS 里被 6 处引用（`1283`、`2389-2500`），改 `v-if` 后逐条核对是否还需要。
- 竖屏视觉几乎不变（动作条只是少了「完成」、多了顶部「取消」），回归面最小；建议**先发 P0+P1（竖屏 + 死局），横屏重排 P2 单独一次提交**。

---

## 9. 分期

| 期 | 内容 | 验收 |
|---|---|---|
| P0 | §5.1 状态机 + 删两条 CSS 杀手 | 1024/1280 选择模式出现动作条，可退出 |
| P1 | 顶部「取消」+ 底栏去「完成」+ 已读禁用 + Esc | 三档都有唯一退出入口 |
| P2 | 横屏贴底全宽条 + 行高压缩 + 让位分档 | 844×390 一屏 3 条，动作条不压底栏 |
| P3 | 死代码收敛 + 长按/右键 + a11y | lint 不涨，探针全绿 |

---

## 10. 实施记录（2026-10-18，P0–P3 全部落地）

**实际改动**：`src/views/user-center/Messages/index.vue`（+140/−150 行左右）、
`src/views/user-center/Messages/style.scoped.css`、`src/views/user-center/UserSpace/components/bottom-nav.css`、
新增 `scripts/probes/probe-messages-select.mjs`。

**与初版方案的三处偏差（都是实测逼出来的）**：

1. **竖屏底距 88px → 104px**：探针实测旧值让动作条下沿压住底栏胶囊 7px，不是 memory 里写的「贴脸」。同时列表让位 168 → 176。
2. **横屏行高压缩后是 3 行，不是 4 行**：390 高的视口里有 ~120px 是 shell chrome（分区页签 + 页头），动作条 60，留给列表 210px；72px 行高只能放 3 条（改动前 2 条）。要做到 4 行得把摘要行砍掉，不做。
3. **横屏动作条贴底会与底栏相交**（nav `z-index: 1000` 反而盖在条上）⇒ 新增一条机制：选择期间 `<body>` 挂 `boh-messages-selecting`，由 `bottom-nav.css` 把底栏**下沉让位**（移动端竖屏不跟：竖屏动作条仍在底栏上方）。KeepAlive 下切 tab 不走 `onUnmounted`，`onActivated` / `onDeactivated` 必须一起同步，否则底栏会永久消失。

**P3 范围收缩**：原计划删掉整块非 minimal 页头，实际**没删**——
`tests/unit/messages-glass-surfaces.test.js` 的守卫断言（`.x-header` / `.x-select-btn` /
`.x-select-actions-menu` 等 6 条）依赖那些 CSS 规则存在；按「断言只增不减」的纪律，
为一个产品里不可达的壳去动守卫测试不划算。只删了**永久 `display:none` 的
`.x-filter-actions-desktop-minimal`** 那一小块（模板 + CSS）。

**验证**：`probe-messages-select.mjs` 91/91；`npm run lint` 113/115（我的文件 0 新增）；
`npm run type-check` 通过；`npm test` 236 文件 / 3040 用例全过；
`check:dark-tokens` 2640/2640（暗色块里只用纯 token，无新增字面量）。

⚠️ **`check:doc-truth` 会红一条**：新探针入库后 `scripts/probes/*.mjs` 变 200，而 AGENTS.md 已按 200 写，
但它按 `git ls-tree HEAD` 计数 ⇒ **提交后才绿**，本地判红属预期。同时按新行长度跑了
`npm run check:doc-truth:update`（AGENTS.md 46,689B），理由已记在本节。
