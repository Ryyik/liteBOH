# 049 · 后台从「侧拉面板」改为「整页对象页」

> **口径（2026-11-25 用户原话）：**「我的意思是不再采用侧拉面板切页面了，而是改成像现在网站的设置页
> 一样一页一个完整页面来改东西」
> 追加确认：「导航 + 编辑一起整页化」「横屏维持现状 256px 左栏」
>
> **一句话方案：把「抽屉」从两个位置都移除 —— 导航抽屉改成整页目录（一页一层），
> 编辑抽屉改成对象页（一条独立路由）。横屏左栏一行代码不动。**
>
> - 编写日期：2026-11-25
> - 状态：**期 1（导航）+ 期 2（编辑）+ 期 3（滚动恢复）已落地**
> - 关联：`plans/048`（期 1–3 只做了卡片外观，交互模型仍是抽屉 —— 本计划是它的续篇）、
>   `plans/027`（详情页 D1/D2 的既有成果，本次复用不重写）
> - 前情：`plans/048` §3 原本就写了「竖屏单栏钻取 / 横屏两栏」，期 1–3 没做到。

---

## 1. 用户否掉的到底是什么

不是「侧栏不好看」，是**交互形态**：

| | 设置页（`ProfileSettingsPanel`） | 后台（改之前） |
| --- | --- | --- |
| 竖屏导航 | 三层**整页深入**：组卡片流 → 组内行 → 内容 | 32 行塞进 `translateX(-100%)` 的抽屉 + 遮罩 + 组内手风琴 |
| 编辑 | 点一条就整页替换，没有浮层 | 从右侧滑出 700px 抽屉，盖住列表 |
| 横屏 | 左目录 244px + 右栏替换 | 左栏 256px + 右栏 chips 条（本次维持不动） |

`plans/048` 期 1–3 交付的是**卡片外观**（`.g-sidebar-rows` 白卡、40px 行、发丝线、
蓝条），但点开后仍然是抽屉。用户看截图后的判断是「这不像设置页」—— 因为
「像不像」主要由**点一下发生什么**决定，不是由底色和圆角决定。

---

## 2. 期 1 · 竖屏导航整页化（已落地）

### 2.1 断点判据：复制而不复用

新建 `composables/useAdminViewport.js`，导出 `adminWideViewport`。

判据与 `settingsWideViewport` **逐字相同**：
`(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)`。

**为什么不 import 那一个**：它同时被 `isGlobalNavbarVisible` 的「设置子页隐藏导航岛」
规则消费。复用一个 ref 意味着任何一方调阈值都会连带改前台导航 —— `plans/048` §3
已点名警告过这种耦合。复制判据、独立 ref，两边各自演化。

**为什么判 orientation 而不是 innerWidth**：

| 视口 | 应走 | 用 `innerWidth < 768` 会判成 |
| --- | --- | --- |
| 768×1024 竖屏平板 | 整页 | ❌ 两栏（宽度过 768） |
| 844×390 手机横屏 | 整页 | ❌ 两栏（宽度过 768） |
| 1440×900 笔记本 | 两栏 | ✅ 两栏 |

三条都被探针实测覆盖。

### 2.2 组件：新建，而不是给 `AdminSidebar` 加 variant

`components/AdminNavPages.vue`（竖屏整页目录）。

抽屉与整页的差别不止定位：抽屉要遮罩、Esc、滚动锁、组内手风琴；整页要返回条、
居中标题、点一行就换页。硬塞进一个组件会让 `isOpen` / `isExpanded` 两套状态打架。
拆开让 `AdminSidebar` 保持「桌面侧栏」单一职责。

两个组件在 `DataAdmin` 里**互斥渲染**：

```vue
<AdminSidebar v-if="!isNarrowNav" ... />
<AdminNavPages v-if="isNarrowNav && portraitNavOpen" ... />
```

### 2.3 层级：一页一层，最多两层

```
第一层  8 个分区（用户 / 订单与履约 / 抽奖与活动 / 社区 / 内容运营 / 审核 / AI / 配置与工具）
   ↓ 点
第二层  该分区的行（有 ▸ 的再进一层）
   ↓ 点
第三层  该行的子页            ← 只有 7 处是这一层（权益发放 / 活动台账 / 诊断 / 举报 / 审核日志 / 场景模型 / 记忆 / AI 日志 / 视觉装修 / 商品 / 新闻）
   ↓ 点
内容页  ?tab=xxx（真实路由）
```

`config/nav-groups.js` 新增三个**纯函数**（可穷举验证，无 ref 无 DOM）：

| 函数 | 职责 |
| --- | --- |
| `resolveNavContainer(id)` | 组 id 或带 children 的行 id → 它的行列表与标题 |
| `resolveNavAncestryForRow(rowId)` | 行 → 容器 id 序列（从外到内） |
| `resolveNavAncestryForTab(tabId)` | 页签 → 同上（经高亮反查表，被融合的页签会落到它被并进的那一行） |

脚本穷举校验（`54` 个可达页签）：**48 有祖先链 + 6 是刻意删入口 = 54**，19 个容器
全部可解析，问题数 0，深度分布 `{1层:22, 2层:26}`（另 6 个删入口为 0 层）。

### 2.4 层级状态不写 URL

`navPath` 是纯内存 `ref`。与设置页同一口径（那边二级页也是纯内存态）。

理由：切一层只是「翻目录」，不是「打开一页数据」。写 URL 会让浏览器返回键在目录
层级里打转，而用户按返回期望的是「回上一页数据」。**内容页切换才走 URL（`?tab=`）**。

守卫：`tests/unit/admin-portrait-nav-pages.test.js` 断言 `AdminNavPages.vue` 里
不出现 `router.push` / `router.replace` / `useRouter`。

### 2.5 一个语义修正（探针实测出来的）

第一版让目录**自动钻进当前页所在的分区**（`?tab=users` 打开目录直接看到「用户」组的
4 行）。探针报「第一层不是 8 个分区」，检查后确认这是**语义错误**：

> 用户点「导航」的意图是「我要去别的地方」，不是「给我看我现在在哪」。

当前所在分区用**行高亮**表达，不用「直接进入」表达。设置页同一口径：点「设置」进的是
组列表，不是上次停留的那一组。改成每次打开都 `resetPath()` 回第一层。

---

## 3. 期 2 · 编辑整页化（已落地）

### 3.1 新增一条真实路由

`/admin/data-management/:tab/new` → `DataManagementCreate`

**⚠️ 必须排在 `:tab/:id` 之前**（实测：排后面时 vue-router 用通配把它吞掉，
渲染出列表页且无任何报错）。

### 3.2 判据必须用路由名（本次最大的坑）

```js
// ❌ 恒为 false：`new` 是静态段，vue-router 不会把它放进 params
const isCreateRecordPage = computed(() => route.params.id === 'new');

// ✅
const isCreateRecordPage = computed(() => route.name === 'DataManagementCreate');
```

匹配到 `DataManagementCreate` 时实测 `params = { tab: 'users' }`，`params.id` 是
`undefined`。按 id 判的表现是「新增页不渲染、直接掉回列表」，**没有任何报错**。

### 3.3 编辑器绑定收敛成单一真源

改造前模板里有两份 60 行的重复绑定（详情页内编辑 / 兜底抽屉）。加第三个实例
（新增对象页）会变成三份 —— 上一次改字段时 `@update-json-buffer` 就只补了其中一份。

改成 `editorBindings` computed，三个实例统一 `v-bind="editorBindings"`。

**⚠️ 这里踩了一个真 bug（被新写的守卫抓到）**：`update:xxx` 类事件的 v-bind 键
必须带冒号且加引号：

```js
'onUpdate:addressAiText': (v) => (addressAiText.value = v),   // ✅
onUpdateAddressAiText:    (v) => (addressAiText.value = v),   // ❌ 静默失效
```

后者驼峰化把冒号吃掉了，Vue 认不出这个键 ⇒ **输入框双向绑定失效（打字没反应，
不报错）**。`data-admin-edit-wiring.test.js` 的 emits 全覆盖断言把它抓出来了。

### 3.4 四个实测缺陷（全部已修，全部有守卫）

| # | 缺陷 | 症状 | 守卫 |
| --- | --- | --- | --- |
| ① | 路由顺序 `:tab/:id` 在前 | 新增页渲染成列表 | 断言 `:tab/new` 的 index < `:tab/:id` |
| ② | 判据用 `params.id === 'new'` | 新增页完全不渲染，无报错 | 断言用 `route.name`，禁止 `params.id === 'new'` |
| ③ | `isCreateRecordPage` 定义在使用点之后 | **整页白屏**：`Cannot access before initialization`（TDZ） | 断言定义 index < 首个使用点 |
| ④ | 列表 section 没排除新增态 | 新增表单下面接着「全部表 / 暂无数据」，两页串成一页 | 断言 `data-console` 的 `v-if` 含 `!isCreateRecordPage` |
| ⑤ | 操作条 `sticky` 被推出视口 | 按钮被裁掉 17px | 断言 `padding-bottom` ≥ 66px |

⑤ 的细节见 §3.5。

③ 的严重性：不是功能失效，是 **setup 抛错 → 全局错误边界捕获 → 「页面出了点问题」**。

### 3.5 底部操作条：`fixed` 不是 `sticky`

实测数据：`position: sticky; bottom: 0` 时按钮条 `bottom=861`，而视口只有 `844`
—— 被裁掉 17px。

原因：sticky 的 `bottom: 0` 相对**最近的滚动容器**定位，容器高度由表单内容决定
（可达 2800px），在 body 滚动下会被推到内容末尾。

改 `position: fixed` 后 `bottom=844` 精确贴齐视口。

配套：`.create-record-section` 的 `padding-bottom` 必须 ≥ 操作条高度（实测 66px），
否则滚到底也点不到最后一项（实测最后那个 textarea 的 `bottom=1398`，视口 844）。
现取 86px。守卫断言 ≥ 66。

### 3.6 「新增」的五个入口统一改走路由

`openEditModal()` 无参调用的五处（工具栏按钮 / 移动端 FAB / 空态动作 /
切 tab 后立刻新增 / 命令面板）全部改为 `handleAdminCreate()`，后者 push 到
`DataManagementCreate`。

**没动的是「编辑」**：编辑已经在详情页内做页内编辑（`plans/027` D2），抽屉只作为
复杂字段的兜底。一次性把 21 个 `openEditModal` 调用点全切成路由会让改动面失控，
而用户最在意的是「新增时不要被浮层盖住」。

---

## 3A. 期 3 · 列表滚动位置恢复（已落地）

整页化带来的**直接代价**，必须同期补上。

### 3A.1 为什么是代价

抽屉时代「列表 → 编辑 → 关抽屉」列表原地不动。改成对象页后每次往返都是真实路由跳转，
`App.vue` 的 `:key="activeRoute.path"` 会让组件**重建**：筛选和页码靠 URL 即状态能恢复，
滚动位置不能。

后台「连续改 10 条」是高频动作。不补的话：从 0 次跳转变 20 次，每次回顶部重新往下翻 ——
整页化会让人觉得更慢，进而被要求改回抽屉。

### 3A.2 两个捕获点都试错过

| 尝试 | 结果 | 原因 |
| --- | --- | --- |
| `onBeforeUnmount` 记位置 | 一次都没记到 | 列表→详情**根本不卸载**（同一组件、只换了 route.params） |
| `watch(recordId 有→无)` 恢复 | 恢复不生效 | 回列表时组件重建，新实例首次 watch 拿不到「刚从对象页回来」——它随旧实例销毁了 |
| ✅ `onBeforeRouteLeave` 记 + `onMounted` 消费式取 | 600 → 600 精确恢复 | 前者拿到「离开前那一刻」的 scrollY；后者不依赖任何跨实例状态 |

### 3A.3 第三个坑：挂载时表格还是空的

在 `onMounted` 里直接 `scrollTo(600)` 实测只滚到 **172**。

原因：那一刻表格数据还没到，`document` 可滚高度不足，`scrollTo` 被浏览器
**静默夹到当前上限**（不报错、不警告）。

修法：消费式订阅 —— 先取出位置，等 `hasLoadedOnce`（`assignTabRows` 里置位，
即行数据已写进 dataStore）再滚。

### 3A.4 口径

- **按 tab 记，不按 fullPath 记**：`?tab=users&page=2` 与 `?tab=users&status=banned`
  在用户心里是同一个列表；按 fullPath 记会让换了筛选回来时落在半山腰。
- **0 不记**：回顶部本来不需要记忆，记 0 只白占 LRU 位。
- **消费式读取**：取完就删，避免下次误用旧位置。
- 上限 16 条，超了丢最早（LRU）。

守卫：`tests/unit/admin-list-scroll-memory.test.js`（11 条，含 2 条源码级接入点断言）。

---

## 3B. 顺带修掉的一个既有崩溃（不是本次引入，但被本次撞出来）

`composables/useDataAdminLifecycle.js` 的 `onUnmounted` 里有一段：

```js
if (toast.timer) { clearTimeout(toast.timer); toast.timer = null; }
```

而 `toast` 这个依赖**从来没被传入过**（`DataAdmin` 调 `setupDataAdminLifecycle` 时
没有这个字段），提示早已改走全站 `bohtoast` 单例。

后果：**每次从详情页卸载都抛**
`TypeError: Cannot read properties of undefined (reading 'timer')`，
被全局错误边界接住 ⇒ 用户看到「页面出了点问题」。

长期没暴露的原因：它只在「从详情页卸载」时触发，而详情页以往是低频深链。
`plans/049` 把详情页变成高频往返之后，它立刻把整页打崩。

处置：删掉那段死代码（不补传参 —— `bohtoast` 自己会清 timer，补一个空对象只是维持死代码）。

---

## 4. 横屏：一行不动

用户明确「维持现状 256px 左栏」。所以：

- `AdminSidebar` 全部样式保持（只删掉窄屏抽屉那一段，见 §5）
- `AdminNavPages` 只在 `isNarrowNav` 时渲染
- `plans/048` 期 1–3 的卡片层（`.g-sidebar-rows`）继续生效

### 4.1 ⚠️ 删抽屉撞出一个跨组件隐式依赖（本次第 6 个真缺陷）

`AdminSidebar.vue` 里那段窄屏抽屉媒体查询，被**四个控制台页顺手依赖**了：
`AdminConsoleShell.vue` 的侧栏就是同一个 `.g-sidebar`，它靠 AdminSidebar 里那段
`position: fixed + 负向平移` 才获得抽屉行为 —— 但那段代码**不在它自己的文件里**。

删掉之后立刻显形：

```
<aside class="g-sidebar"> … subtree intercepts pointer events
locator.click: Timeout 30000ms exceeded
```

即：侧栏失去定位变成静态块，盖住整个内容区，连汉堡按钮都被压住点不到。

修法：把抽屉定位写进 `AdminConsoleShell.vue` 自己的 scoped 块，
用 `.console-shell` 前缀限定作用域（不污染 DataAdmin 的侧栏）。

**四个控制台页仍然是抽屉形态**，没跟着改成整页目录 —— 它们是独立路由、
没有 8 组分区的层级结构，硬套「一页一层」只多一层无意义的目录。

教训：**删一段样式之前先 grep 它的类名在哪些组件里被复用**。
`.g-sidebar` 是两个组件的公共面貌，不是 `AdminSidebar` 的私有资产。

---

## 5. 删掉的是什么（不是留开关）

`AdminSidebar.vue` 末尾的窄屏抽屉规则**整段删除**：
`position: fixed` + 负向平移 + `.open` + `.is-collapsed` 那一堆。

留着的两个隐患：
1. 任何人把侧栏放回窄屏，看到的是「默认被平移到屏幕外」的侧栏 —— 因为没人再传
   `isOpen=true`，表现为「导航凭空不见」；
2. 与 `AdminNavPages` 的整页样式同时命中，靠源序决定胜负（CSS 里最脆的一种）。

删掉后「窄屏没有抽屉」成为**结构事实**，不再是运行时约定。

`AdminSidebar` 在窄屏下根本不会被渲染（`v-if="!isNarrowNav"`）。

---

## 6. 验证

| 项 | 结果 |
| --- | --- |
| 单测 | **414 文件 / 5344 passed + 1 skipped** |
| 新增守卫 | `admin-portrait-nav-pages.test.js`（22 条：分层 7 + 形态 7 + 搜索 1 + 实测缺陷 6 + 1） |
| 新增守卫 | `admin-list-scroll-memory.test.js`（11 条） |
| 改造守卫 | `data-admin-edit-wiring`（14 条，含新增的「三个实例共用绑定」） |
| 改造守卫 | `data-admin-density`（抽屉断言改为整页目录断言） |
| 探针 | `probe-admin-sidebar-settings-style` 按视口分两套，**57/57** |
| 探针 | `probe-data-admin-portrait` **50/50**（修 2 条过时断言） |
| 探针 | `probe-data-admin-landscape` **28/28**（新增对象页断言替换抽屉断言） |
| 探针 | `probe-data-admin-detail` **14/14**（修过时 toast 选择器） |
| 探针 | `probe-admin-console-shell` **27/27**（补回跨组件抽屉定位后转绿） |
| 探针 | `probe-admin-function-search` 15/16（剩 1 条与本次无关） |
| 构建 | `vite build` 通过 |
| lint | 0 error（未新增 warning） |

### 6.1 反证（都实测，改回去必须变红）

| 反证 | 结果 |
| --- | --- |
| 给 `AdminSidebar` 加回 `transform: translateX(-100%)` | 「不再有窄屏滑出抽屉」红 |
| 去掉 `AdminSidebar` 的 `v-if="!isNarrowNav"` | 「窄屏不再渲染 AdminSidebar」红 |
| 把 `isCreateRecordPage` 改回 `params.id === 'new'` | 「判据必须用路由名」红 |
| 把 `'onUpdate:addressAiText'` 写成驼峰 | 「每个事件都有对应键」红，并点名该事件 |

### 6.2 浏览器实测（不是推理，每条都真跑过）

| 场景 | 实测值 |
| --- | --- |
| 竖屏 390×844 目录首页 | 8 个分区 / 一张卡 / 行高 44px / 无横向溢出 |
| 竖屏进第二层 | 返回条出现、标题换成组名、行数 4 |
| 竖屏横屏切换 | 转横屏自动收起目录页（左栏常驻） |
| 新增对象页 | 整页渲染 / 8 个输入框 / 无遮罩 / 无浮层抽屉 / 标题「新增用户」 |
| 新增页操作条 | `bottom=844` 精确贴齐视口（不是 861） |
| 新增页滚到底 | `covered=false`，最后一项不再被按钮盖住 |
| 滚动往返 | 列表滚到 600 → 进详情 → 回列表，**600 → 600** |
| 详情页 | `hasRecord=true`（修掉 §3B 的崩溃后） |

### 6.3 探针里修掉的 4 条「长期假红」

改造过程中发现这些断言早已失效（不是本次引入），它们一直在掩盖真问题：

| 探针 | 旧断言 | 为什么失效 | 新口径 |
| --- | --- | --- | --- |
| `probe-data-admin-portrait` | 模块 tab 不被裁切 | `.g-module-tabs` 在 `plans/048` 期 1 已删；且表达式 `a<=b \|\| a>b` 恒真 | 断言「不再有横向 chips 条」 |
| `probe-data-admin-portrait` | 可点元素存在：createBtn | mock 环境无 create 权限，找不到属正常 | 降为可选元素，只验命中区 |
| `probe-data-admin-landscape` | 新增抽屉打开且不裁切 | 新增已改为整页对象页 | 断言「跳到 DataManagementCreate 且无浮层」 |
| `probe-data-admin-detail` | 保存成功 toast | 选择器 `.toast-message` 已随 `bohtoast` 迁移废弃 | 改用 `.boh-toast__msg` |

> 一条教训：**假红比没测试更糟** —— 它让「这里红着是已知的」变成习惯，
> 真问题出现时会被归到同一堆里。发现就修，别留。

---

## 7. 未做

- **编辑入口也整页化**：见 §3.6 的取舍说明。21 个调用点、1599 行的 `EditDrawer`、
  5 个按 `.drawer` 取几何的探针 —— 单独一期做。
- **四个控制台页仍用抽屉**：它们是独立路由、没有 8 组分区结构，硬套「一页一层」
  只多一层无意义的目录。见 §4.1。
- **新增页的保存端到端**：探针 mock 环境下 `validateRequiredFields` / RPC 校验
  无法满足，实测只能验到「表单渲染 + 无遮挡 + 无串页 + 操作条贴底」。
  真实保存需要登录真实后台手动确认，或补一个 stubbed RPC 的端到端探针。
- **`DataAdmin.vue.orig`**（8314 行未追踪）处置仍待决定（`plans/048` §9 遗留）。

---

