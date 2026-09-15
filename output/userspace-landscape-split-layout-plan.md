# UserSpace 横屏左右分栏改造方案（对齐小红书网页版）

> 约束前提：**仅做布局结构调整**。不改业务逻辑、数据流、状态管理、事件处理与组件行为；不改任何 Supabase / store / API 代码。
> 生效范围（已确认）：**所有电脑 + 平板横屏**。手机横屏与任何竖屏保持现状，一行不变。
> 本文档只给方案，不含代码改动。

---

## 0. 结论速览（先看这 7 条）

1. **横屏现状 = 单列 + 底部悬浮胶囊**。横屏（`orientation: landscape`）在 UserSpace 里只有一条规则：把内容 `max-width` 从 720px 放开到 100%（`shell-community.css:2823-2837`）。底部导航 `position: fixed; bottom: 20px; left: 50%`（`bottom-nav.css:9-33`）在所有尺寸都不改变位置，只在 1025px 档把间距放大（`bottom-nav.css:858-876`）。全仓 **零** sidebar / rail 实现。
2. **改造支点已经存在**：`.tab-page` 本来就是 `position:absolute; left:0; width:100%` 的全屏叠放层（`shell-community.css:110-126`，多个 tab 靠叠放 + z-index 共存）。所以做左右分栏**只需要改它的 `left` / `width` 两条**，把左侧让给一条固定栏 —— 不用改成 grid、不用重排 flex、不用碰滚动链、不动 v-show/v-if 叠放语义。
3. **唯一 DOM 改动是 1 个新增展示组件**：`UserSpaceMain.vue:195` 之前插入 `<UserSpaceSideRail>`。它只接收现有 `navItems` / `currentTab` / 未读数，并把点击原样 `emit` 回现有的 `handleBottomNavClick` —— 业务逻辑零新增。
4. **底部导航组件保留不删**：横屏由 CSS `display:none` 隐藏，竖屏/窄屏继续用它。避免出现"两套导航各自维护一份状态"。
5. **2 处现有探针断言会因此失效**（横屏点击底栏、桌面页签居中基准），必须同批更新；否则改完探针会红。见 §6。
6. **左栏材质 = 液态玻璃**（与底部胶囊同一套玻璃体系）：直接复用 `--liquid-*` token 与现成 `.liquid-glass` 类，**不新增任何色值**，明色 / 暗色 / 无滤镜降级 / `.boh-perf-lite` 省电档四层全部自动跟随。见 §3.3 ②。
7. **改动范围只有一处 UI**：全局导航栏「我的方块」（`UnifiedNavbar/index.vue:116` → `to="/user-space"`）进入的那个页面，即 `/user-space` 主路由 → `UserSpaceMain.vue`。同前缀的其他路由是各自独立的组件，不在范围内。见 §0.1。
8. **生效范围 = 电脑 + 平板横屏**（用户确认）：条件定为 `(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)`。`min-width: 1024` 正好卡在「手机横屏最大宽度」之上（iPhone 16 Pro Max 横屏 932px、安卓大屏手机 ~915px），`min-height: 600` 再兜掉超扁桌面窗口 —— **手机横屏（含既有探针里的 844×420）与所有竖屏完全不进分栏、行为一行不变**。见 §3.3 ①。

---

## 0.1 范围边界（先确认，避免误伤）

**在范围内**：`/user-space` 主路由（`name: "UserSpace"`）→ `UserSpace/index.vue` → **`UserSpaceMain.vue`** 那个「我的方块」页面。它是**唯一**有底部 5 项导航 + 5 个 tab 的页面，也是本次横屏分栏的对象。

**不在范围内**（URL 前缀相同，但 `routes/user-space.ts` 里是各自独立的组件，各有自己的布局与样式，本次一行都不动）：

| 路由 | 组件 | 备注 |
| --- | --- | --- |
| `/user-space/subscriptions` | `Subscription/index.vue` | 独立订阅页（对访客可见） |
| `/user-space/gifts` | `Address/index.vue` | 礼物/收货地址 |
| `/user-space/partners` | `Partners.vue` | 合作伙伴 |
| `/user-space/account-security` | `AccountSecurity/index.vue` | 从设置页跳出的独立页 |
| `/user-space/note` | `Cloud+/index.vue` | BOH Cloud+ |
| `/user-space/shared-memories` | `SharedMemoryManagement.vue` | — |
| `/user-space/tags-impressions` | `TagsImpressions.vue` | — |
| `/user-space/pushplus-settings` | `PushplusSettingsPage.vue` | 从设置页跳出 |
| `/user-space/settings/version` | `BetaPreview/BetaPreviewMain.vue` | `hideNavbar` |
| `/mailbox`、`/user-center*` | — | 只是 redirect 到 `/user-space?tab=…`，本身无 UI |

> 判断口径：判断"要不要改"看**组件**，不看 URL 前缀。上面的独立页若在横屏下显得窄，是它们自己的事，别顺手一起改。

---

## 1. 现状代码坐标（改造前的地图）

### 1.1 组件层

| 作用 | 文件 | 关键位置 |
| --- | --- | --- |
| **入口：「我的方块」** | `src/components/UnifiedNavbar/index.vue` | `L116` `<router-link to="/user-space" id="nav-user-info" title="进入我的方块">`，标签文字在 `L130`；点击 handler `L547`（论坛页内会先刷新并滚顶） |
| 路由入口 | `src/router/routes/user-space.ts` | `/user-space` → `UserSpace/index.vue`（`meta: { keepAlive: true }`，无 `hideFooter`）；同文件还挂着一批独立子页，见 §0.1 |
| 壳（7 行） | `src/views/user-center/UserSpace/index.vue` | 直通 `UserSpaceMain` |
| 主组件 | `src/views/user-center/UserSpace/UserSpaceMain.vue`（3017 行） | — |
| ↳ 根节点 | 同上 | `L2-7` `.user-space-page`（含 `:data-theme`） |
| ↳ 社区 tab | 同上 | `L19-42` `.tab-page.community-shell` + `SegmentTabs` |
| ↳ 内容 tab | 同上 | `L45-78` `.tab-page.content-shell` |
| ↳ 资产 tab | 同上 | `L81-116` `.tab-page.profile-tab.assets-shell` |
| ↳ 消息 tab | 同上 | `L119-136` `.tab-page.messages-tab` |
| ↳ 设置 tab | 同上 | `L139-193` `.tab-page.profile-tab.settings-shell` |
| ↳ **底部导航** | 同上 | `L195-199` `<UserSpaceBottomNav>` |
| ↳ 弹层（5 个） | 同上 | `L201-224`（均在 `.user-space-page` 内） |
| 二级页签 | `.../UserSpace/components/SegmentTabs.vue` | 容器 `L94-103`：`display:flex; justify-content:center`，顶部避让走 `--segment-tabs-inset` |
| 底部导航（展示型） | `.../UserSpace/components/UserSpaceBottomNav.vue`（74 行） | 根 `.bottom-nav-glass`，仅 emit `nav-click` / `preload-tab` |
| tab 导航数据与 handler | `UserSpaceMain.vue` | `navItems` = `L391-397`；`handleBottomNavClick`（底栏 click 落点）；`preloadUserSpaceTab` |

### 1.2 样式层（全部全局，非 scoped）

| 文件 | 关键规则 |
| --- | --- |
| `.../UserSpace/styles/shell-community.css`（2877 行，由 `UserSpaceMain.vue:2964` 引入） | `.user-space-page` `L6-60`（flex column / `height:100dvh` / `overflow:hidden` / `position:relative`）；顶部避让变量 `L8-12`；暗色变量 `L82-107`；`.tab-page` `L110-126`；`.tab-page .page-content` `L145-156`（`padding: 64px 20px 140px`）；≤768px 文档滚动 `L314-331`；社区两栏栅格 `L2042-2075`（`min-width:1024px`，main + 288~320 侧栏）；forum 宿主 `L2782-2798`；**横屏全宽 `L2823-2837`** |
| `.../UserSpace/styles/profile-base.css`（1505 行） | `.profile-tab` `L1-10`（`padding-bottom: 100px`）；`.profile-tab.profile-home-active` `L6-10`（`padding-top: 84px`）；`.profile-page-content` `L19-25`（`max-width:1200px`）；`.assets-active` L28（1600px） |
| `.../UserSpace/styles/responsive-integrations.css`（1205 行） | `L442` 矮窗 landscape；`L1156-1172` 手机横屏；`L1174-1179` `min-width:768px + landscape` |
| `.../UserSpace/components/bottom-nav.css`（960 行） | `.bottom-nav-glass` `L9-33`（**fixed 底部居中**）；`.nav-items` `L113-120`（grid 5 列）+ 滑动指示器 `::before`；`L858-876` ≥1025；`L878-892` 768-1024；`L894-916` ≤767；`L918-944` 竖屏 |
| 暗色主题 | `src/styles/themes/user-space-dark.css`（564 行）：`.bottom-nav-glass` `L24-28`、`.nav-item` `L31-47`、`.unread-badge` `L49-54` |

### 1.3 与布局相关的两个"活"变量（改造必须复用，不要写死）

- `--userspace-nav-h`：全局导航浮岛**实测高度**，由 `UserSpaceMain.vue:2701-2713` 用 `ResizeObserver` 监听 `#unified-nav-container` 后写到 `pageRoot.style`（内联，可被后代继承）。岛展开状态卡时 58px → 130px+，`SegmentTabs` 靠它避让（`SegmentTabs.vue:100-102`）。**左栏顶部避让必须用它**。
- 全局导航形态：`#unified-nav-container` 是 `position:fixed; top:0; width:100%; z-index:9999`（`src/styles/vendor/unified-nav.css:8-15`），里面的浮岛 `max-width: min(860px, 100% - 24px); height:58px; transform: translateY(10px)`（`src/components/UnifiedNavbar/style.scoped.css:66-78`）。→ **≥1024px 窗口时浮岛左边缘只有 (W-860)/2 ≈ 82px，必然横向压到左栏顶部**，这是左栏必须留顶隙的硬原因。

---

## 2. 目标布局（小红书网页版 → BOHLITE 映射）

参考图的小红书网页版结构 = **左窄栏 + 右内容区**：

| 小红书 | BOHLITE UserSpace（本方案） |
| --- | --- |
| 左栏顶部：品牌 logo | 左栏顶部：品牌/身份区（可选，默认留白 + 顶隙） |
| 左栏中部：首页 / 点点 / RED / 直播 / 发布 / 通知 / 消息 / 我（图标 + 文字竖排，当前项浅灰圆角高亮） | 左栏中部：**现有 5 个 navItems**（社区 / 我的 / 资产 / 消息 / 设置），当前项高亮，未读角标沿用 |
| 左栏底部：更多 / 关于我们 | 预留位（默认不做；见 §7） |
| 右区顶部：搜索行 + 一级文字 tab（推荐/世界杯/穿搭…） | 右区顶部：**现有 SegmentTabs**（不加改动，天然对齐） |
| 右区主体：内容瀑布流，自己滚动，左栏不动 | 右区主体：现有 `.tab-page`（内容零改动），左栏不随内容滚动 |

**视觉关键点**：左栏是**独立滚动层、不随右区滚动**；右区仍保持现有的每个 tab 独立滚动链（`.tab-page { overflow-y:auto }`）。

---

## 3. 改动清单

### 3.1 新增文件（3 个）+ 引入 1 行

| 文件 | 作用 |
| --- | --- |
| `src/views/user-center/UserSpace/components/UserSpaceSideRail.vue` | 横屏左栏，**纯展示**：props = `navItems` / `currentTab` / `hasUnreadMessages` / `unreadCount`；emit = `nav-click` / `preload-tab`（原样转发，与 `UserSpaceBottomNav.vue` 完全同构）。根元素挂 `.userspace-rail.liquid-glass` |
| `src/views/user-center/UserSpace/components/side-rail.css` | 左栏自身造型（定位/尺寸/顶隙/条目形态）。**材质不在这里写** —— 玻璃配方由 `src/styles/common/liquid-glass.css` 单一源提供（见 §3.3 ②） |
| `src/views/user-center/UserSpace/styles/landscape-rail.css` | 页面级横屏规则（③–⑦：tab-page 让位 / 底栏隐藏 / 留白收紧 / 二次分栏门槛 / 宽度变量） |
| `UserSpaceMain.vue` | 仅追加一行 `<style src="./styles/landscape-rail.css"></style>`（挨着 `L2964` 的 `shell-community.css`），并在 L195 插入组件（见 §3.2） |

> 为什么新开一套类名（`.rail-item` 等）而不是复用 `.nav-item`：`bottom-nav.css` 的 `.nav-item` 是 **grid + 横向语义**（`min-width/min-height/padding` 在 767 / 768-1024 / 1025 三档分别定义，`bottom-nav.css:858-916`），竖排要覆盖的规则比新写还多，且会污染底栏。未读角标类 `.unread-badge` 与方向无关，可直接复用。

### 3.2 DOM 变更（唯一一处）

`UserSpaceMain.vue` 在 `L195`（`<UserSpaceBottomNav>` 之前，作为 `.user-space-page` 的直接子元素）插入：

```
<UserSpaceSideRail
  :nav-items="navItems"
  :current-tab="currentTab"
  :has-unread-messages="hasUnreadMessages"
  :unread-count="unreadCount"
  @preload-tab="preloadUserSpaceTab"
  @nav-click="handleBottomNavClick" />
```

**为什么必须作为 `.user-space-page` 的直接子元素**：左栏要用 `position:absolute` 与 `.tab-page` 同层定位，父级必须是那个 `position:relative; height:100dvh; overflow:hidden` 的 `.user-space-page`（`shell-community.css:53-60`）。**不要放进任何一个 `.tab-page` 内**，否则会跟着 tab 一起滚走、并在 tab 切换时重复实例化。

**不做的 DOM 改动**：不动 5 个 `.tab-page` 的 `v-show` / `v-if` / `:ref`（`setTabPageRef` 管滚动位置记忆）；不动底栏（`L195-199`）；不动 5 个弹层。

### 3.3 CSS 变更（逐条，含落点与值）

页面级规则（③–⑦：tab-page 让位 / 底栏隐藏 / 留白收紧 / 二次分栏门槛）放**新文件** `src/views/user-center/UserSpace/styles/landscape-rail.css`，由 `UserSpaceMain.vue` 追加一行 `<style src="./styles/landscape-rail.css"></style>`（与 `shell-community.css` 同一种引入方式，仍随 userspace 懒加载 chunk 走，不进壳）。

> 为什么不塞进 `shell-community.css`：它已 **2877 行**，而 `check-project-structure.mjs` 对 `.css` 的建议阈值是 2000 行（只 WARN 不阻断）。分栏是一块完整自洽的横屏规则，独立成文件更好回滚 —— 删文件即还原。

组件级造型（① 变量消费 + ② 左栏形态）放 `components/side-rail.css`（与 `bottom-nav.css` 同位置、同引入方式）。

**① 断点与宽度变量（生效范围：电脑 + 平板横屏）**

```css
/* ── 分栏生效区间：唯一来源，本文件内 ③–⑦ 与 side-rail.css 都用这一组条件 ──
   · orientation: landscape  电脑 / 平板横屏都成立；手机横屏也成立，靠下面两条排除
   · min-width: 1024px       排除全部手机横屏（手机横屏最大宽：iPhone 16 Pro Max 932 /
                             安卓大屏 ~915，均 < 1024）；同时对齐仓库既有桌面档 1024
   · min-height: 600px       兜掉超扁桌面窗口（如 1200×380）；下界正好等于最小平板横屏
                             （1024×600），不误伤任何平板 */
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .user-space-page { --userspace-rail-w: 88px; }   /* 图标窄栏 */
}

/* ≥1280 才展开文字标签：1280 是「1280 − 240 = 1040px 右区」能撑住
   Forum 自带「主栏 + 300~380 侧栏」两栏结构的最低宽度 */
@media (orientation: landscape) and (min-width: 1280px) and (min-height: 600px) {
  .user-space-page { --userspace-rail-w: 240px; }  /* 完整栏：图标 + 文字 */
}
```

**为什么不用 `pointer: coarse` 之类区分设备**：平板有触摸但也能接键鼠，Mac 也能接触屏 —— 尺寸判据比设备信号可靠，且与仓库既有的 767 / 768 / 1024 / 1025 四档尺寸逻辑一致。

**平板横屏实测覆盖情况**（无需额外断点）：

| 设备（横屏 CSS px） | `min-width:1024` | `min-height:600` | 左栏宽度 |
| --- | --- | --- | --- |
| iPad 10.2" 1024×768 | ✓（卡边界命中） | ✓ | 88px |
| iPad mini 1133×744 | ✓ | ✓ | 88px |
| iPad Air 1180×820 | ✓ | ✓ | 88px |
| iPad Pro 11" 1194×834 | ✓ | ✓ | 88px |
| iPad Pro 12.9" 1366×1024 | ✓ | ✓ | 240px |
| Android 平板 1280×800 | ✓ | ✓ | 240px |
| 小屏 Android 平板 1024×600 | ✓（卡边界） | ✓（卡边界） | 88px |
| **iPhone 16 Pro Max 横屏 932×430** | **✗ 排除** | ✗ | 无（底栏照旧） |
| **探针里的手机横屏 844×420** | **✗ 排除** | ✗ | 无（底栏照旧） |
| 任何竖屏（含 768×1024 平板竖屏） | ✗ | — | 无（底栏照旧） |
| 超扁桌面窗口 1200×380 | ✓ | **✗ 排除** | 无（底栏照旧） |

**② 左栏定位 + 液态玻璃材质（`side-rail.css`）**

材质不自己写：模板层直接给左栏挂上现成的玻璃类，配方由 `src/styles/common/liquid-glass.css` 单一源提供。

```html
<!-- UserSpaceSideRail.vue 根元素 -->
<aside class="userspace-rail liquid-glass">
```

```css
.userspace-rail {
  display: none;                       /* 默认不参与布局：竖屏 / 窄屏 / 竖窗全部无副作用 */
}

@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  /* 用 .userspace-rail.liquid-glass（0,2,0）覆盖，而不是 .userspace-rail（0,1,0）：
     .liquid-glass 的 radius/border/contain 同为 0,1,0，靠加载顺序决胜太脆 */
  .userspace-rail.liquid-glass {
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: absolute;                /* 与 .tab-page 同层，不用 fixed */
    inset: 0 auto 0 0;                 /* top:0 right:auto bottom:0 left:0 */
    width: var(--userspace-rail-w);
    z-index: 2;                        /* 高于 .tab-page(1)，低于弹层与导航岛(9999) */
    box-sizing: border-box;
    /* 顶隙吃浮岛实测高度：岛 58px 常态 / 130px+ 展开态；禁止写死数值 */
    padding: calc(var(--userspace-nav-h, 78px) + 12px) 12px 20px;
    /* ↓ 只覆盖 .liquid-glass 的"卡片形态"，材质本身（底色/滤镜/描边/阴影）一行都不碰 ↓ */
    border-radius: 0 24px 24px 0;      /* 贴左边缘：左侧直角，右侧大圆角 */
    border: 0;                         /* 去掉四边描边，改为单侧发丝线 */
    border-right: 1px solid var(--liquid-border);
    corner-shape: normal;              /* 覆盖 .liquid-glass 的 squircle（贴边时形状会失真） */
    contain: none;                     /* 覆盖 contain:paint，避免裁剪条目的指示器 / hover 阴影 */
  }
}
```

材质来自 `.liquid-glass`（`liquid-glass.css:21-31`）：`background: var(--liquid-bg)` + `border: 1px solid var(--liquid-border)` + `box-shadow: var(--liquid-highlight) + inset … + var(--liquid-shadow)` + `backdrop-filter: var(--liquid-filter)`。这里只覆盖**形态**（圆角/描边/隔离方式），不覆盖任何颜色与滤镜值 —— 这是"依旧是液态玻璃"的正确接法。

**四层自动跟随**（`src/styles/common/tokens.css`）：`:root` 亮色（`L44-70`）→ `[data-theme="dark"]` 暗色（`L74-98`，含 `--liquid-text-*` 翻转，暗玻璃上的文字自动变亮）→ `@supports not (backdrop-filter)` 回退实色（`L99-109`）→ `.boh-perf-lite` 把 blur 从 28px 降到 12px（`L111-116`）。**左栏因此不需要写任何暗色规则、也不需要写降级规则。**

**玻璃材质的三条门禁红线**（`scripts/check-liquid-glass.mjs` 扫 `src/**/*.{css,scss,vue}`，命中即构建失败）：

1. 不许裸写 `backdrop-filter: blur(NNpx)`，NN ≥ 14 —— `var(--liquid-filter)` 是唯一合法写法
2. 不许自己派生 `--glass-filter-*`
3. 不许抄成品档字面量（`blur(18px) saturate(180%) brightness(1.02)` 这类）

**一个要知情的观感取舍**：左栏背后是 `.user-space-page` 的平色底（`--bg`，浅 `#f5f5f7`），右区内容被收窄后不会从玻璃下面经过 —— 所以玻璃观感主要由**描边 + 内高光 + 阴影 + 半透明白**构成（和现有底部胶囊完全同源，`bottom-nav.css:15-20` 就是这么做的），并不会出现"内容从玻璃后滚动穿过"的强毛玻璃效果。如果确实要那种效果，得让右区内容横向延伸到左栏下面（即 `.tab-page` 不收窄，改为给各 tab 内容加 `padding-left`）—— 但那会让不同 tab 的容器层次（forum 的负 margin 卡片、assets 自己的 shell）各自需要单独对齐，代价明显更高。**建议先按本方案落地，观感不够再评估。**

**为什么用 `absolute` 而不是 `fixed`**：`.tab-page` 已经是 absolute 同层叠放；`fixed` 还需要担心祖先链上任何 `transform` / `filter` / `backdrop-filter` 把包含块改写（本仓 tab 切换动效、玻璃层大量使用这两类属性）。absolute 挂在已知的 `position:relative` 父级上，行为确定。

**③ 右区让位（最关键的两条）**

```css
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .user-space-page .tab-page {
    left: var(--userspace-rail-w);
    width: calc(100% - var(--userspace-rail-w));
  }
}
```

`.tab-page` 原规则 `L110-126` 是 `left:0; width:100%`（特异性 0,1,0），此处 0,2,0 覆盖，不改原规则本身。**多 tab 叠放语义不受影响**（`top:0 / height:100%` 未动，`is-leaving` 的 z-index 规则也未动）。

**④ 横屏隐藏底栏**

```css
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .user-space-page .bottom-nav-glass { display: none; }
}
```

底栏的 `is-hidden`（滚动方向隐藏）、`ai-overlay-open` 等逻辑继续照常运行，只是不渲染。竖屏/窄屏完全不受影响。

**⑤ 底部留白收紧（横屏已无底栏，6 处必须同批收）**

> 下面 6 处的覆盖规则同属 ① 的分栏区间（同一组媒体查询条件），只在分栏生效时改写；手机横屏 / 竖屏读到的是原值。

| 位置 | 现值 | 横屏改为 | 说明 |
| --- | --- | --- | --- |
| `shell-community.css:151` `.tab-page .page-content` | `padding: 64px 20px 140px` | `padding-bottom: 32px` | 140px 是给底栏留的 |
| `shell-community.css:172-174` `.tab-page.messages-tab .page-content` | `padding-bottom: 140px` | `32px` | 同上 |
| `shell-community.css:11` `--userspace-community-bottom-inset` | `108px` | `32px` | 社区 tab 底部安全距 |
| `shell-community.css:2811-2819` `.messages-tab .ai-host` | `height: calc(100dvh - inset - 48px - 92px)` | `… - 24px` | 92px 是底栏占位 |
| `profile-base.css:1-10` `.profile-tab` | `padding-bottom: 100px` | `32px` | 内容/资产/设置 tab |
| `ProfileHomePanel.vue:678` | `calc(var(--userspace-bottom-nav-offset, 80px) + 28px)` | `--userspace-bottom-nav-offset: 8px` | 在 `.user-space-page` 内覆盖变量即可，组件不改 |

**⑥ Forum 底部留白的域内覆盖（不改 Forum 本体）**

`src/views/Forum/styles/base.css:47` 定义了 `--forum-embedded-bottom-nav-space: calc(88px + env(safe-area-inset-bottom))`，被 `replies-responsive.css:952 / 1561 / 1592` 消费。横屏左栏模式下应只覆盖 UserSpace 内嵌实例：

```css
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .user-space-page .forum-page.embedded-mode { --forum-embedded-bottom-nav-space: 24px; }
}
```

**⑦ 内容区内部二次分栏的适配（已实现为「压窄侧栏」而非「退化单列」）**

`1024–1279px` 时形成「左栏 88 + 右区 ≈936」，而内容区内部本身还有一层两栏：Forum 自带 `minmax(0,1fr) + clamp(300px, 27vw, 380px)`（`Forum/base.css:146-151`，≥992 生效），侧栏会按 27vw 取宽 → 主栏被压到 600px 以下。

**实测结论：不必退化为单列** —— 把内部侧栏压窄到 `clamp(240px, 22vw, 320px)`、gap 收到 `clamp(20px, 2.4vw, 40px)`，右区 936 时主栏仍有 ≈600px，帖子是纵向卡片列表，600px 完全够用，两栏结构得以保留（更接近参考图）。

```css
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .user-space-page .forum-main-grid {
    grid-template-columns: minmax(0, 1fr) clamp(240px, 22vw, 320px);
    gap: clamp(20px, 2.4vw, 40px);
  }
}
```

`community-page-grid`（成员/印象档，`minmax(288px,320px)`）实测在 936px 右区下主栏 ≈628px、用户卡片双列各 ≈307px，**保持原样即可**，不需要覆盖。

带 `.user-space-page` 前缀 = 域内覆盖，**Forum 独立页 / 社区独立页不受影响**。

**⑧ 内容与左栏的呼吸间距（必须做，否则内容贴栏）**

右区的左边缘就是左栏右边缘，而两个容器的左右 padding 在 userspace 内恰好是 0：

- `.forum-page.embedded-mode .forum-container { padding: 0 0 24px 0 }`（`Forum/base.css:42-44`）→ 左右被清零
- `.x-notifications-container.minimal-mode { padding: var(--messages-minimal-padding, 0) }`（`Messages/style.scoped.css:775-779`）→ userspace 内为 0

统一补 gutter（`--userspace-content-gutter: clamp(20px, 2.4vw, 40px)`）：

```css
.user-space-page .tab-page .page-content,
.user-space-page .tab-page .profile-page-content,
.user-space-page .tab-page .forum-page.embedded-mode .forum-container,
.user-space-page .tab-page .x-notifications-container.minimal-mode {
  padding-left: var(--userspace-content-gutter);
  padding-right: var(--usersepece-content-gutter);
}

.user-space-page .messages-tab .ai-host {
  margin-left: var(--userspace-content-gutter);
  margin-right: var(--userspace-content-gutter);
}
```

实测：1180 视口下 gutter = **28px**（`2.4vw`），探针断言 ≥20px。

**⑧ 可选（默认不做，见 §7）**

- 右区内容上限：`≥1440px` 时给 `.page-content` / `.profile-page-content` 加 `max-width: 1200px; margin-inline: auto`。**先不做**：会与现有探针断言 `max-width === '100%'` 冲突（见 §6），收益（超宽屏可读性）远小于回归成本。
- 论坛容器 `max-width: min(1480px, calc(100vw - 48px))`（`Forum/base.css:27`）：分栏后 `100vw` 把左栏算进去了，宽屏下居中点会偏；如做，改为 `max-width: 1480px` 并在 userspace 内覆盖。

---

## 4. 生效范围与数值对照

判定顺序：**先看方向，再看宽，再看高** —— 三者都满足才进分栏。

| 视口 | 命中分栏？ | 形态 | 右区可用宽 | 内部二次分栏 |
| --- | --- | --- | --- | --- |
| 任何竖屏（390×844 手机 / 768×1024 平板竖屏） | ✗ | 单列 + 底栏胶囊（现状） | 全宽 | 按原规则 |
| 手机横屏（844×420、932×430） | ✗ | 单列 + 底栏胶囊（现状） | 全宽 | 按原规则 |
| 超扁窗口（1200×380） | ✗ | 单列 + 底栏胶囊（现状） | 全宽 | 按原规则 |
| 横屏 1024–1279 且高 ≥600（iPad 10.2/ mini / Air / Pro 11"） | ✓ | **88px 图标窄栏** | 936 – 1191 | 强制单列（§3.3 ⑦） |
| 横屏 ≥1280 且高 ≥600（iPad Pro 12.9" / Mac 窗口 / Android 平板） | ✓ | **240px 完整栏** | 1040+ | 恢复原两栏（Forum ≥992 / 社区 ≥1024） |

**关于形态跳变**：窗口跨 1024 / 1280 边界拖动时，底栏胶囊 ↔ 左侧栏会瞬时切换，不会有过渡动画（`display:none` 无法 transition）。这是仓库既有的响应式行为（767↔768 档同样如此），不是本次引入的问题。

---

## 5. 风险与注意点（都已在方案里规避，但需知情）

1. **全局导航浮岛会横向压住左栏顶部**：≥1024 窗口浮岛左边缘仅 `(W-860)/2`。左栏 `padding-top` 必须用 `--userspace-nav-h`（实测），**不能写 78px** —— 状态卡展开时岛高 130px+，写死必盖。
2. **`fixed` 祖先陷阱**：已通过"左栏用 absolute 挂在 `.user-space-page`"规避。
3. **Mac 应用窗口几乎恒为 landscape**（宽>高即成立），已按用户确认纳入目标形态。**手机横屏不需要用 `max-height` 型条件去排除** —— `min-width: 1024px` 已经天然挡掉（手机横屏最大宽 932）。唯一会"越界"的是**折叠屏展开态**（如 1104×884），它会命中分栏 —— 但那本来就是平板级体验，命中是合理的；若要按设备信号再排除，成本高于收益，不建议。
4. **`--userspace-bottom-nav-offset` 是跨页面变量**：除 `ProfileHomePanel.vue:678` 外，还被 BOHAI 面板消费（`BOHAI/BOHAI/styles/shell-header.css:122-129 / 308-315`、`BohaiSidebar.vue` 多处）。只覆盖值（改小），不删除变量；AI 面板底部随之收紧属于期望效果，但需在 AI 分区回归一次。
5. **暗色 / 降级 / 省电档都不需要新增色值**：左栏玻璃全部走 `--liquid-*` token（四层自动跟随，见 §3.3 ②）。只剩**条目自身**的文字与高亮底需要定：文字建议直接用 `--liquid-text-secondary` / `--liquid-text-primary`（暗色下自动变亮，避免黑字压暗玻璃）；"当前项高亮底"若要与现有底栏观感一致，在 `src/styles/themes/user-space-dark.css` 内补一条 `.userspace-rail-item.active`，与 `L43-47` 的 `.nav-item.active`（`rgba(255,255,255,0.12)`）对齐即可 —— 这是本方案唯一可能要碰 `user-space-dark.css` 的地方，且是追加而非修改。
6. **`!important` 预算门禁**：`scripts/important-budget.json` 基线 `total: 1332`。本方案全部规则**不允许出现 `!important`**（否则要同步改基线）。现有 `user-space-dark.css:24-28` 对 `.bottom-nav-glass` 用了 `!important`，但改的是 `display` 属性，不冲突。
7. **文件膨胀**：`shell-community.css` 已 2877 行（`check-project-structure.mjs` 的 `.css` 建议阈值 2000 行，仅 WARN）。所以本方案**不在它里面加任何行**，只在逻辑上覆盖它的 `.tab-page` / `.page-content` 等规则；新规则全部落在 §3.1 的 3 个新文件里，删文件即完整回滚。
8. **不要改 `.tab-page` 的 `top/height/overflow`**：滚动位置记忆（`tabScrollPositions`、`setTabPageRef`）和三个 tab 的切换动效（`shell-community.css:266-300`）都依赖它。

---

## 6. 回归与验收

### 6.1 现有探针必须同步改的 3 处（不改就会红）

已把 4 个可能相关的探针逐个核对过视口（这一步很重要，因为生效范围一变，影响面就变）：

| 探针 | 视口 | 命中分栏？ | 影响 |
| --- | --- | --- | --- |
| `probe-user-space-ia.mjs:363-366` | 1180×720 | **命中** | 点 `.bottom-nav-glass .nav-item` 里的「我的」切 tab → 底栏 `display:none`，Playwright 视为不可见元素 → 点击超时 |
| `probe-user-space-ia.mjs:424-435` | 1280×860 | **命中** | 断言页签组居中用 `window.innerWidth / 2` → 右区中心偏移 `railW/2` → 必挂 |
| `probe-user-space-perf.mjs:99` `clickNav` | 1280×900 | **命中** | helper 直接点 `.bottom-nav-glass .nav-item`，被调用 **5 次**（`L152` 我的 / `L168` 资产 / `L177` 消息 / `L207` 设置 / `L216` 社区）→ 5 处全挂 |
| `probe-messages-ui.mjs` | 844×420 / 420×900 | 不命中 | 无需改 ✓ |
| `probe-settings-glass.mjs` | 844×420 | 不命中 | 无需改 ✓ |

**改法（推荐"双通道选择器"，一个探针同时覆盖两种形态，不用按视口写分支）**：

- 两处点导航的动作：选择器由 `.bottom-nav-glass .nav-item` 改为 `.userspace-rail-item, .bottom-nav-glass .nav-item`，Playwright 会命中当前可见的那一个。这样同一份探针在 844×420（底栏）与 1280×900（左栏）下都能跑。
- `L424-435` 居中基准：不要再用 `window.innerWidth / 2`，改成取**可见的** `.tab-page` 的 `getBoundingClientRect()` 中心 —— 无分栏时它等于窗口中心，有分栏时自动等于右区中心，两种形态都对。

> 建议不要给左栏做`.userspace-rail-item` 的可见性判断后 `if` 分支 —— 会把探针逻辑越写越分叉。

### 6.2 建议新增断言（横屏分栏专项）

**命中档（应进分栏）** —— 1024×768 / 1279×800 / 1280×800 / 1440×900：

- `.bottom-nav-glass` 计算样式 `display === 'none'`；`.userspace-rail` 可见且宽度 = 88 / 88 / 240 / 240
- `.tab-page` 的 `left === railW` 且 `width === innerWidth - railW`

**未命中档（必须保持现状，反向断言）** —— 844×420（手机横屏）/ 932×430（大屏手机横屏）/ 390×844（手机竖屏）/ 768×1024（平板竖屏）/ 1200×380（超扁窗口）：

- `.userspace-rail` 不可见（`display === 'none'`）；`.bottom-nav-glass` 可见（`display !== 'none'`）
- `.tab-page` 的 `left === 0` 且 `width === innerWidth`（即未被改写）
- 这一组是本次"生效范围"的关键反证：只断言命中档，会漏掉手机横屏被误伤的回归

**其余**：
- 左栏顶部不被浮岛遮挡：`rail.getBoundingClientRect().top + paddingTop >= #unified-nav-container 高度`
- 左栏不随右区滚动：右区滚动 500px 后，`.userspace-rail-item` 的 Y 不变
- **玻璃同源校验**：`.userspace-rail` 的 `backdrop-filter` 计算值 `!== 'none'`，且与 `.bottom-nav-glass`（竖屏）取到的值一致 → 证明两侧材质同源，没有各自写死
- **玻璃暗色校验**：`boh-theme=dark` 下取 `.userspace-rail` 的 `background-color` 与 `.userspace-rail-item` 文字色，确认底色转暗、文字转亮（即 `--liquid-*` 四层跟随生效，不是只套了明色）
- 暗色与浅色各截一张（`debug-screenshots/`），因为左栏是新 surface

### 6.3 门禁

`npm run build:ci`：受影响的是 `check:structure`（新增 3 文件，无路由 import 风险）、`check:important-budget`（新增样式零 `!important`，基线 1332 不动）、**`check:liquid-glass`（新增的两个 css 必须零裸写滤镜值，见 §3.3 ② 三条红线）**。`check:first-paint`（index.html 骨架）与 `check:shell-precache`（入口静态 import）**不受影响** —— 新组件是 `UserSpaceMain` 的静态子组件，两个新 css 随 `UserSpaceMain` 静态引入，都会并入既有 userspace 懒加载 chunk，不进壳集合。

---

## 7. 明确不做的事

- 不改 `navItems` 定义位置（继续单源在 `UserSpaceMain.vue:391-397`），左栏通过 props 消费，**不复制第二份导航配置**
- 不改 `handleBottomNavClick` / `preloadUserSpaceTab` / tab 切换动效 / 滚动位置记忆 / `v-show` 叠放语义
- 不删 `UserSpaceBottomNav`，不合并底栏与左栏逻辑
- 不做左栏底部"更多 / 关于我们 / 退出登录"（会引入新功能与新数据依赖）—— 如需要另开一版
- 不改 Forum / CommunityTab / Messages 组件本体，所有内容区让步都用 `.user-space-page` 前缀做域内覆盖
- 不动玻璃单一源：`src/styles/common/tokens.css`（`--liquid-*` 26 个）、`liquid-glass.css`（`.liquid-glass` 类库）、`glass-ui.css` —— 只**消费**，不新增、不复制、不派生
- 不动 `/user-space` 之外的同前缀独立页（订阅/礼物/伙伴/账号安全/Cloud+/共享记忆/标签印象/pushplus/版本设置），见 §0.1；判断口径看组件不看 URL 前缀
- **不把手机横屏 / 任何竖屏纳入分栏**（用户确认生效范围 = 电脑 + 平板横屏）：不写 `max-height` 型条件去"抢"手机横屏，也不降低 `min-width` 到 932 以下；844×420 这类手机横屏必须保持现状

---

## 8. 左栏还能放什么（按改造成本分三档）

### P0 · 零新逻辑（挂已有 handler / 已有路由即可）

| 位置 | 内容 | 复用点 |
| --- | --- | --- |
| 顶部身份区 | 圆形头像（`FramedAvatar`）+ 昵称 + 积分 | `avatarUrl` / `userInfo` / `userStats` 都已在 `UserSpaceMain` 的 props 里；点击 = `switchTab('posts')` |
| 次级入口组 | 订阅 · 礼物与地址 · 账号安全 · 共享记忆 · 标签印象 · pushplus 推送 | 全是已有独立路由，`router.push()` 即可（见 §0.1 的九条路由） |
| 底部工具 | 主题切换 · 返回首页 · 退出登录 | `openThemeModal()` / `handleLogout()` 已在 `UserSpaceMain` 内 |
| 消息角标 | 未读数字 | 已在左栏实现（复用 `unreadCount`） |

### P1 · 需组件暴露接口

| 内容 | 代价 |
| --- | --- |
| 发布 / 发帖 | 需 `ForumMain` 暴露"打开编辑器"接口（目前只有内嵌 FAB 走内部方法） |
| 搜索 | 需 `ForumMain` 暴露搜索框聚焦接口 |

### P2 · 需新数据或新面板

| 内容 | 代价 |
| --- | --- |
| 积分余额 / 配额进度卡 | 需要一个展示型小组件，数据源已有（`userStats` / `useLabQuota`） |
| 版本号 + 构建信息 | 已有 `version.json` / `bohVersionPlugin`，但左栏展示需新样式 |
| 帮助 / 关于我们 | 需确认目标页与文案归属 |

**已实现（2026-09-15 二批，用户选「除回到顶部全加」）**：主导航 5 项 + 未读角标 + **便捷组 2 项**（发布 / 搜索）+ **工具组 3 项**（主题 / 返回首页 / 退出登录，退出仅登录态显示）= 10 项。发布走**路径 B（全屏编辑器）**。

> 曾加过「通知」按钮（切到消息 tab 的 inbox 分区），随后按用户反馈删除 —— 它的落点与主导航的「消息」完全重合（消息 tab 默认分区就是 inbox），属于同一去处的两个入口。探针里保留了一条反向断言防止它回来。

---

## 9. 实施记录（2026-09-15）

### 落地文件

| 文件 | 状态 |
| --- | --- |
| `src/views/user-center/UserSpace/components/UserSpaceSideRail.vue` | 新增（纯展示，40 行） |
| `src/views/user-center/UserSpace/components/side-rail.css` | 新增（定位 + 形态 + 条目两档） |
| `src/views/user-center/UserSpace/styles/landscape-rail.css` | 新增（页面级 ①–⑧） |
| `src/views/user-center/UserSpace/UserSpaceMain.vue` | 改 3 处：`L246` import、`L197` 插组件、`L2973` 引样式 |

### 探针实际改动

| 文件 | 改动 |
| --- | --- |
| `probe-user-space-ia.mjs` | ① 横屏切 tab 改双通道选择器（`.userspace-rail-item, .bottom-nav-glass .nav-item`，配 `offsetParent` 可见性过滤）；② 桌面居中基准改取**可见 `.tab-page`** 的中心；③ 新增 11 条断言：左栏可见/底栏隐藏/宽度 88/让位 88/右区宽度/顶隙吃导航岛/玻璃同源/内容 gutter/竖屏反证 3 条/手机横屏反证 3 条；④ **修正一条既有失败**（见下） |
| `probe-user-space-perf.mjs` | `L99` `clickNav` 改双通道 + `:visible` 伪类（原本被 5 处调用，横屏下会全挂） |

### 顺手修掉的既有失败（与本次改造无关，但会掩盖真回归）

`probe-user-space-ia.mjs` 的「资产直接切（无页签）」在**登录态恒定 FAIL**：

- `AssetsHubPanel.vue:32` 自 2026-09-11 起内置了自己的 `SegmentTabs`（class `.ah-segment-tabs`，面板内的分类页签）
- 断言当时用全局 `.segment-tabs` 计数 → 把面板内的页签也算成"页级页签"，必然为 1
- 修正为只统计 `.tab-page > .segment-tabs`（页级页签 = `tab-page` 直接子级），并加条件等待（tab 离场动画期旧页签仍可见，固定 `waitForTimeout(600)` 不稳）

### 验证结果

- `probe-user-space-ia.mjs`：**66 PASS / 0 FAIL**
- `probe-user-space-perf.mjs`：通过（`pageErrors: 0`）
- 门禁：`check:liquid-glass` / `check:structure` / `check:views` 全绿；`check:important-budget` **1332 / 1332（零新增 `!important`）**
- `npm run type-check`：无错误
- 实测宽度：1440 → 240px、1280 → 240px、1180 → 88px、844×420 → 无分栏（底栏照旧）
- 截图：`output/landscape-rail-1440-community.png`、`output/landscape-rail-1280-community.png`、`output/landscape-rail-1180-messages.png`

### 已知行为（未处理，刻意）

BOHAI 会话抽屉（`.sidebar`）是 `position: fixed; left: 0` + z-index `2147483450`，且定位属性全带 `!important`。分栏后它打开时会**覆盖左栏**（抽屉盖住导航）。属可接受的抽屉语义；若要让它从右区左边缘滑出，覆盖需要新增 `!important`，会顶破 `important-budget` 基线，故本次不动。

### 二批：左栏按钮组（2026-09-15）

| 项 | 落点 |
| --- | --- |
| 主导航 5 + 未读角标 | 一批已做，未变 |
| 便捷组 2（发布 / 搜索） | 新增，`[data-rail-action]` |
| 工具组 3（主题 / 首页 / 退出登录） | 新增；退出仅 `isLoggedIn` 时渲染 |

**已删除「通知」**：它切到消息 tab 的 inbox 分区，与主导航「消息」（消息 tab 默认就是 inbox）落点重合 → 同一去处的两个入口。删除范围：`QUICK_ACTIONS` 去掉该项与 `Bell` import、`handleRailAction` 去掉 `case 'notifications'`、探针改为「不含 notifications」的反向断言。

**事件收敛**：6 个动作统一 `emit('action', id)` → `UserSpaceMain.handleRailAction` switch 分发到已有 handler，未新增业务分支。

**发布 = 路径 B（全屏编辑器）**，三个关键前提：

1. 横屏下论坛自带的移动发帖 FAB **恒不可见** —— `isMobileComposerMode = width <= 1024 && height >= width`（`ForumMain.vue:1870`），横屏恒 false；而 overlay 的 DOM 是 `v-if="isMobileComposerOpen"`（L3924），**不看 mode**，所以横屏可正常打开全屏写帖。
2. **`ForumMain.defineExpose` 的 TDZ 坑**：`openMobileComposer` / `focusForumSearch` 定义在文件后段（L1901+），而 `defineExpose` 在 L322 → 直接引用会撞 TDZ。解法是**箭头函数包装**（`openComposer: () => openMobileComposer()`），调用时才求值。
3. **`ForumMain` 只在社区 tab 挂载**（`v-if="currentTab === 'community' || leavingTab === 'community'"`）→ 发布/搜索必须先 `switchTab('community')`，再轮询 `forumViewRef` 就绪后调用（`waitForForumView`：60ms 间隔 / 4s 超时，`UserSpaceMain.vue:2041-2065`）。

**搜索**不依赖组件引用：`focusForumSearch` 用 `document.querySelector('.forum-page .toolbar-search-input')` + `scrollIntoView` + `focus({ preventScroll: true })`。论坛工具栏在 embedded 下常驻（`ForumMain.vue:3691` 无 v-if 条件），因此横屏可用。

**结构改动**：左栏加内层 `.userspace-rail-scroll` 承担滚动（玻璃容器自身不滚 —— 避免 `backdrop-filter` 与滚动同层的背板裁剪问题）；`.userspace-rail-group--footer { margin-top: auto }` 吸底；11 项在 1024×600 矮平板上进入内层滚动。

**验证**：`probe-user-space-ia.mjs` **74 PASS / 0 FAIL**（新增 9 条：主导航 5 项 / 便捷组齐全 / 工具组齐全 / 主题弹窗 / 通知切 tab / 通知落 inbox / 发布打开全屏编辑器 / 搜索聚焦搜索框）；`!important` 仍 1332/1332；`type-check` 无错。截图：`output/rail-buttons-1440.png`、`output/rail-buttons-1280.png`、`debug-screenshots/ia-landscape-composer.png`。

### 四批：删除「通知」+ 修复「主题」弹窗裸奔（2026-09-15）

**删除「通知」**：它切到消息 tab 的 inbox 分区，与主导航「消息」（消息 tab 默认就是 inbox）落点重合。删除范围：`QUICK_ACTIONS` 去掉该项与 `Bell` import、`handleRailAction` 去掉 `case 'notifications'`、探针删 2 条通知断言并新增「不含 notifications」反向断言。左栏现 10 项。

**修复「主题」弹窗裸奔（用户报的问题）** —— 根因不是 z-index，而是**按需加载的 CSS**：

- 诊断数据：`.modal-overlay` 计算样式 `position: static; z-index: auto; display: block`，rect 是 `0,0 1440×417` —— **样式完全没生效**，弹窗退化成文档流里的一个块，被 tab-page 内容与左栏压住。
- 根因：`.modal-overlay` / `.modal-card` 的样式来自 `styles/profile-panels.css`，而它由 `async-loaders.js` 的 `preloadProfileStyles()` **按需动态加载**；`UserSpaceMain` 只在初始 tab 为 `posts / assets / settings` 时触发预载（`L418-420`）。**以前主题弹窗只能从「设置」tab 打开（那时样式必然已加载），左栏按钮让它能在社区 tab 被直接点开 → 首次就裸奔。**
- 修法：`handleRailAction` 的 `case 'theme'` 里先 `await preloadProfileStyles()` 再 `openThemeModal()`。该预载函数自带 promise 缓存（幂等）。
- 探针补断言：`主题弹窗样式就绪（overlay 为 fixed 且卡片居中出现）` —— 原来只断言 `.theme-modal-card` 存在（DOM 存在即通过），所以漏掉了裸奔。实测修复后 `pos=fixed z=10001 dx=0 h=645`。
- **通用结论**：任何"能在社区 tab 触发、但 UI 依赖 profile-\*.css"的新入口，都必须先 `await preloadProfileStyles()`。

**深色跟随实测**（切换后取值）：`railBg = rgba(28,28,36,0.72)`（`--liquid-bg` 暗色值）/ `itemColor = rgb(245,245,247)`（`--liquid-text-primary` 暗色）/ `activeBg = rgba(255,255,255,0.12)`（左栏自己的暗色覆盖）→ 四层 token 与自定义覆盖都生效。截图 `output/rail-theme-modal-fixed.png`、`output/rail-theme-dark.png`。

### 五批：发布会话只覆盖右区，保留左栏（用户要求）

**目标形态**：发布 = 独立发布会话界面，保留左栏可见，只全屏覆盖右侧内容区。

**关键坑：overlay 被 Teleport 到 body**（第一次改就踩了）

- `ForumMain.vue:3937-3940` 的 `<Teleport to="body">` 包着 `.mobile-composer-overlay` → 它**不是** `.user-space-page` 的后代，用 `.user-space-page .mobile-composer-overlay` 完全改不到。实测证据：改完 rect 仍是 `x:0 w:1440`。
- 正确写法：`body.page-userspace .mobile-composer-overlay`（`body.page-*` 由 App.vue 挂，实测为 `body.page-userspace.is-loaded`）。
- **变量必须一起上移到 body**：`--userspace-rail-w` 原本定义在 `.user-space-page`，Teleport 出去的节点继承不到 → 改为定义在 `body.page-userspace`（`.user-space-page` 子树照旧继承，`side-rail.css` 与页面级规则都不受影响）。

```css
body.page-userspace .mobile-composer-overlay {
  left: var(--userspace-rail-w);
  right: 0;
  width: auto;
  border-top-left-radius: 20px;
  border-bottom-left-radius: 20px;
}

/* 会话在 body 层、层级高于顶部浮岛 → 浮岛被盖住，左栏不必再为空着的岛留顶隙 */
body.page-userspace:has(.mobile-composer-overlay) .userspace-rail.liquid-glass {
  padding-top: 20px;
}
```

（`:has()` 在本仓有先例：`Lab/components/ProgressRing.vue`、`CommunityLotteries/style.scoped.css`）

**连带修复：切 tab 不会自动收起会话**（它在 body 层，不在 tab-page 内 → 换 tab 后仍盖住右区）

- `ForumMain.defineExpose` 再加 `closeComposer: () => closeMobileComposer()`（同样箭头包装避 TDZ）；
- `UserSpaceMain` 新增 `dismissComposerSession()`，在 `handleBottomNavClick` 与 `handleRailAction`（`compose` 本身除外）里先 `await` 它 → 有改动内容时由论坛弹「保存草稿」确认，用户选完再继续切换。

**验证**：`probe-user-space-ia.mjs` **78 PASS / 0 FAIL**（新增 4 条：只覆盖右区 / 宽度 = 视口 − 左栏 / 发布态左栏仍可见 / 发布态点其它 tab 会话自动收起）。实测 1180 → `left=88 w=1092`，1440 → `left=240 w=1200`；左栏区域 `elementFromPoint` 命中 `button.userspace-rail-item`（确认可交互）。截图 `output/rail-compose-1180-88.png`、`output/rail-compose-1440-240.png`、`debug-screenshots/ia-landscape-composer.png`。

**待定**：会话内容本身仍是论坛的移动端编辑器布局（`PostComposer`），在 1200px 宽的右区里右侧大片留白 —— 是否重做为横屏专用版式（双栏 / 居中专注卡片）待用户确认。

### 六批：发布会话响应式适配 + 去签到 + 删内嵌编辑器（用户要求）

用户口径：**"就和手机端的一样，但做 UI 响应式适配"**、**"不要引入什么签到"**、**"删除论坛原本的编辑区"**。

**① 布局：最终为「全宽铺满右区」**（中途曾做过限宽居中，已被用户否掉）

演进过程（留档，避免再走回头路）：

| 版本 | 做法 | 结果 |
| --- | --- | --- |
| v1 | 顶栏 `margin: auto` 居中 | ❌ 顶栏被收成 **187px** —— 它是 overlay（flex column）的直接子项，auto margin 会吸收剩余空间并把宽度收缩成内容宽 |
| v2 | `align-self: center` + `max-width: 760/900px` | ✅ 居中正确，但用户看到「右边空一片」，要求**全宽布局** |
| v3（现行） | 只保留 `box-sizing: border-box`，**不限宽、不居中** | ✅ 内容铺满右区 |

```css
/* 全宽布局（用户要求）：不限宽、不居中，内容铺满右区 */
body.page-userspace .mobile-composer-overlay .mobile-composer-bar {
  box-sizing: border-box;
}
```

**② 「不要有整个界面滚动」是既有结构满足的，不要再去加规则**

`replies-responsive.css` 里已经是：`.mobile-composer-overlay { overflow: hidden; display:flex; flex-direction:column; height:100dvh }` + `.mobile-composer-scroll { flex:1; min-height:0; overflow-y:auto }` → **顶栏钉住、只有内容区滚**。已加断言锁住（`overlayOverflow=hidden` 且 `scrollOverflowY=auto`）。

**③ 去掉周签到面板**（`PostComposer.vue:792` 的 `.weekly-checkin-panel.inline-checkin-panel`）

```css
body.page-userspace .mobile-composer-overlay .weekly-checkin-panel { display: none; }
```

只隐藏**发布会话内**的；论坛独立页 / 手机端发布会话不受影响。论坛工具栏上那个「签到」按钮（`ForumToolbar` 的 `open-weekly-checkin`）是既有功能、不在发布会话里，本次未动 —— 如需一并去掉需另说。

**④ 删除社区 tab 的内嵌发帖编辑器**

`PostComposer` 在 `ForumMain` 里有两处：内嵌论坛（`L3657`，`.forum-main-grid > .forum-left-column`）与会话内（`L3976`，overlay 里）。只删内嵌那处：

```css
.user-space-page .forum-page.embedded-mode .forum-left-column > .post-creation-section {
  display: none;
}
```

- 用 `.forum-left-column >` 直接子级 + `.embedded-mode` 限定，**不会误伤会话内的实例**（它在 Teleport 到 body 的 overlay 里）。
- **为什么只在分栏区间删**：768–1023 这类中间尺寸既没有左栏「发布」按钮、`isMobileComposerMode` 又是 false（FAB 不显示）→ 内嵌编辑器是那里的**唯一**发帖入口，删掉会让平板竖屏无法发帖。

**⑤ 删掉移动端圆按钮横条（解决「点击标签有两套重复」）**

`PostComposer` 内**同时存在两套工具组**，各带一个「标签」入口，横屏下两套都可见 → 同屏两个标签按钮：

| 工具组 | 类名 | 显示条件 |
| --- | --- | --- |
| 移动端圆按钮横条 | `.mobile-post-image-toolbar` | 手机端的图片工具条 |
| 桌面工具组 | `.post-editor-tools` | `!isMobileComposerMode` |

```css
body.page-userspace .mobile-composer-overlay .mobile-post-image-toolbar { display: none; }
```

这条**一次解决两个反馈**：「点击标签有两套重复」+「删除原本的横条」是同一条横条。只隐藏会话内的实例，论坛独立页 / 手机端不受影响。

**⑥ 去掉「＋ 添加图片」大方框（连带修掉一个既有 bug）**

第一版在 `landscape-rail.css` 里写 `body.page-userspace .mobile-composer-overlay .post-image-add-more-card { display: none }` —— **完全没生效**。诊断结论：

- 页面级规则是 `display: none`（0,3,0），而 `composer.css` 里有一条 **`display: flex` + 感叹号 important**（0,2,0）→ important 赢，与特异性无关。
- 更关键的是：`composer.css:532` 的注释本来写着「**横屏去重：桌面端只保留工具栏 0/6 入口，隐藏网格内大卡片…竖屏保留卡片**」，但下面两条的重要标记规则**互相打架**：`.editor-card .post-image-add-more-card`（隐藏）与 `.mobile-composer-overlay/section .post-image-add-more-card`（显示）——会话里的卡片**同时命中两者**，后写的「显示」把「隐藏」否掉了。所以**横屏依旧显示大卡片，注释的意图从未落地**。

修法（按注释原意，且**不新增重要标记**）：把「显示」限定到「非 电脑/平板横屏」——即条件取反，写成逗号列表而不是 `@media not(...)`（兼容性更稳）：

```css
.editor-card .post-image-add-more-card { display: none !important; }
@media (orientation: portrait), (max-width: 1023px), (max-height: 599px) {
  .mobile-composer-section .post-image-add-more-card,
  .mobile-composer-overlay .post-image-add-more-card { display: flex !important; }
}
```

`landscape-rail.css` 里那条无效规则已删除，只留注释指向 `composer.css`（避免同选择器多份定义）。

> **门禁坑**：`check-important-budget` 是**纯文本匹配** `!important` —— **注释里写字面量也算一处**，且它只扫 `git ls-files`，未跟踪的新文件不扫（入库后才暴露）。本次就是因为注释里写了该字面量导致 `composer.css: 3 > 基线 2`。注释里改用「感叹号 important」表述即可。

**⑦ 横屏搜索框：加高 + 提示居中 + 跨栏独占一行**

要点是**别放错文件**（这是本次最容易白做的一处）：

- **输入框自身样式必须写进 `ForumToolbar.vue` 的 scoped**（`@media (min-width: 993px)` 里 `padding: 16px 120px 16px 36px; border-radius:16px; text-align:center`）。`base.css` 是以 scoped 方式引入 ForumMain 的，跨组件选择器 `.forum-main-grid > .forum-toolbar .toolbar-search-input` 会带上**父组件的 scope id**，永远匹配不到子组件内部的 `input` —— 写在 base.css 里会静默失效（实测 `text-align` 就是这条挂掉的）。
- **跨栏独占一行**靠 `base.css` 的 grid-areas：把 `<ForumToolbar>` 从 `.forum-left-column` 里**提到 `.forum-main-grid` 直系子级**，再给它 `grid-area: toolbar`，1 列时 DOM 顺序不变（**手机端视觉零变化**）。

**中途做错又撤销的一版（留档）**：曾把签到 / 筛选收成图标塞进搜索框右侧做成「一个搜索胶囊」。用户要的不是这个形态，已完整回滚 —— 保留加高、居中、「问 BOHAI」、去掉 + 号。

**验证**：`probe-user-space-ia.mjs` **89 PASS / 0 FAIL**（新增：发布会话只覆盖右区 / 全宽铺满 / 无移动横条 / 无签到 / 无「＋ 添加图片」大方框 / 内嵌编辑器已删 / 左栏不上移 / 会话自动收起 / 整页不滚动 / 搜索框加高居中跨栏不贴栏）。截图 `output/v3-session.png`、`output/v5-search.png`、`output/final-landscape-composer.png`、`output/final-landscape-1440-community.png`、`output/final-landscape-1180-community.png`。

**顺手修好的第二条既有失效探针**：`probe-forum-filter.mjs`

- 入口 `#/forum` **早已是重定向**（`routes/community.ts:56` → `/user-space?tab=posts`），探针一直卡在 `.toolbar-filter-btn` 超时；且未登录时社区 tab 根本不渲染论坛。
- 「内容类型」筛选的下拉分区**已不存在**（工具栏下拉现在只剩「排序方式」+「标签筛选」），类型筛选搬到了**页面级六档页签**。
- 改法：入口换成 `#/user-space?tab=community` + 登录注入 + 等 `.forum-main-grid`；筛选动作改成点页签，并对**请求侧** `post_kind` 做真断言（实测 `新闻 → in.(news)`、`活动 → in.(activity)`、`最新 → 不带该参数`）。卡片文案里已无 `【新闻】`/`【活动】` 前缀，所以按文案分类是空判据，已降级为信息输出，翻页那段改断言「分页请求仍带同一个 `post_kind`」。

**探针稳定性（这一轮修的 flaky，根因都是「固定 sleep 抢在页面就绪前」）**：

| 位置 | 症状 | 改法 |
| --- | --- | --- |
| `injectLogin` 结尾 | 登录态注入完就断言 → 页面还停在 index.html 骨架，rail / 底栏 / 导航容器全 `ABSENT`，一次报出 15 条假红 | 追加条件等待 `.user-space-page` 出现 |
| §11 桌面页签 | 固定 `sleep(1400)` 后断言 → 偶发 `groupW=0`（截图里还是「正在加载…」） | 条件等待可见 `.segment-tabs`，并把 `ready` 写进失败信息 |
| 切 tab 全链路 | dev server 偶发模块请求失败会命中 index.html 内联的 recovery 分支 → 带 `?forceUpdate=true` 重定向 → **页面重载、pinia 登录态丢失**，之后十几条断言全是「页面没内容」 | `ensureLoggedIn()` 挂在 `clickNav` 后，掉登录自动补注入 |
| 页签查询 | 切 tab 时离场页面的页签仍可见且可能排在更前（`.tab-page` 是叠放层），`some()` 会立刻命中离场组（切「消息」能读到资产页的 `概览/装扮/积分/订阅/订单/抽奖/赞助`） | `waitForSeg` 必须匹配「**第一个**可见页签组」，命中后再给 400ms 收尾 |

> 通用结论：**「登录态就绪」和「页面就绪」是两件事**；叠放式 tab 的页签查询要锚定「第一个可见组」，不能用「任意一个」。

