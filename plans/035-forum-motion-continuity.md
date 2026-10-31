# 035 · 论坛动效连续性：「从哪来，回哪去」

> 状态：**方案定稿（2026-10-31）**，节奏按「慢速」档；三项结构决策已锁定（§10），代码未动
> 目标：让每一次「出现」都有一个来源矩形，每一次「消失」都回到那个矩形；并把散落的 4 套时长收敛成一套可调的节奏。
> 前提纪律：**慢的是空间，不是响应** —— 点击必须在 120ms 内给出可见反馈，之后的形变才可以慢到 640ms。
> 关联：`plans/001`（motion tokens）、`plans/003`（reduce-motion）、`plans/017`（覆盖层曲线家族）、`plans/032`（详情弹窗 XHS 对齐）

---

## 1. 一句话

论坛现在有 4 条互不相干的动画链（卡片入场 / 整页详情进 / 整页详情出 / 横屏弹窗进），**没有一条知道"用户点的是哪张卡"**。所以详情看起来是"换了一页"，而不是"这张卡张开了"。

---

## 2. 现状地图（2026-10-31 读码）

### 2.1 两条独立的详情链

| 形态 | 判据 | 承载 | 进场 | 离场 |
| --- | --- | --- | --- | --- |
| 横屏 ≥1024×600 | `isForumLandscape()`（`utils/forum-viewport.js:102`） | `PostDetailModal` 覆盖层 + `pushState` | 遮罩 200ms / 面板 380ms，`translateY(12px) scale(.985)`（`PostDetailModal.vue:355-388`） | 面板 260ms，`scale(1.008)` |
| 其余（竖屏/窄窗） | 同上取反 | 整页路由 `/forum/post/:id`（`routes/community.ts:57`） | `pd-page-enter` 260ms，`translateY(10px)`（`style.scoped.css:32-68`） | `pd-page-leave` 220ms，由 `onBeforeRouteLeave` 返回 Promise 拖住导航（`PostDetailMain.vue:1493-1523`） |

唯一分流点：`openForumPost()`（`composables/usePostDetailModal.js:126-138`）。`ForumMain` / `ProfileMain` / `UserSpaceMain` 三个列表都调它 —— **接线只需在这一点加参数**。

### 2.2 十二处「没有来处」

| # | 位置 | 现状 | 问题 |
| --- | --- | --- | --- |
| 1 | `style.scoped.css:26,35` | 注释写着「用 `--pd-enter-from` 承接方向」，但全仓**没有任何 JS 写过这个变量** | 设计过、从未接线 ⇒ 每次进详情都是同一个 ↑10px |
| 2 | `PostCard.vue:359` / `ForumMain.vue:3136` | `emit('click', post.id)`，`openPostDetail(postId)` 只收 id | 起点矩形从未被采集 |
| 3 | `ForumMain.vue:351-354` | 返回状态存 `scrollY` + `postId` | 没有 rect |
| 4 | `App.vue:486-502` | 只有 `meta.keepAlive` 走 KeepAlive，论坛没有 | 列表在导航时**卸载**，返程目标卡片此刻不存在 |
| 5 | `App.vue:452-468` | 刻意没有路由级 `<Transition>`（实测类名从未被加上） | 不能用 Vue 的 shared-element，只能 CSS/WAAPI + JS 传参 |
| 6 | `PostDetailModal.vue:113-139` | 面板宽度由图片比例反推（媒体列 + 信息列 460） | 入场首帧算不出终态矩形 |
| 7 | `PostDetail/index.vue` | `Suspense` + 骨架；`fetchPostDetail()` 在 `onMounted` | 入场时页面里是骨架，不是帖子 |
| 8 | `style.scoped.css:56-65` | `fill-mode:both` 会把 transform 永久留在 `matrix(1,0,0,1,0,0)`，导致 `.pd-actionbar--page`（fixed）包含块被劫持 | 大尺度 scale 挂在含 fixed 的根上，底栏会被一起缩放 |
| 9 | `feed.css:1075-1090` | 评论展开 `max-height: 0 → 1200px`，固定 0.34s | 短评 37ms 就走完、长评 313ms；超过 1200px 被切 |
| 10 | `base.css:59-63` | 回复框 `fade-slide` 从 **−10px** 落下 | 触发它的按钮在**下方**，方向反了 |
| 11 | `ForumImageViewer.vue:560-575`、`PostDetail/components/ImageViewer.vue` | 从**屏幕中心** `scale(.92)` 起 | 点的是第 2 张缩略图，它从中间冒出来 |
| 12 | `ForumMain.vue:2883,3023` + `feed.css:1042-1073` | 点赞 1900ms class / `heartBeat .44s` / 计数 `.48s`；分享 1500ms 换图标 | 三套时长互不同源，且**都没走 `tokens.css:33-45` 的 token** |

### 2.3 一条附带的性能债

`feed.css:128-142`：`.post-card-v2 { animation: forumPostCardEnter .42s both; animation-delay: var(--post-appear-delay) }`。
列表是虚拟窗口（`useForumVirtualFeed`，前 20 / 后 30），**窗口滑动会挂载新卡片，每张都从 0.42s 淡入开始** —— 快速滚动时整屏一直在冒卡片。

---

## 3. 工程规则（写进代码注释与探针）

- **R1 出现必有来处**：`source rect` 来自被点元素；拿不到就降级为同方向淡入，**不默认居中缩放**。
- **R2 消失必回原处**：返回前**重新量一次**目标 rect（滚动可能变过）；目标不可见就降级淡出，**不硬缩到屏幕外**。
- **R3 形变不露字**：容器先形变，内容延迟 38% 再淡入；非等比 scale 期间内容不可读。
- **R4 时长跟距离走**：短距离 240ms、跨屏 640ms；同一交互不许恒定一个值。
- **R5 慢必须可中断**：所有形变走 WAAPI 并保存 `Animation` 句柄；新交互先 `cancel()`，**以当前 rect 为新的起点**反向跑（640ms 不可中断 = 卡住）。

---

## 4. 分层方案

### L0 节奏旋钮（视觉零变化）

新增 `src/styles/common/motion.css`（或并入 `tokens.css` 的 Motion 段）：

```css
--motion-morph-in: 640ms;      /* 卡片 ↔ 详情（跨屏距离） */
--motion-morph-in-near: 480ms; /* 小卡 → 短距离 */
--motion-morph-out: 480ms;
--motion-enter: 480ms;
--motion-exit: 360ms;
--motion-stagger: 70ms;
--motion-stagger-max: 5;
/* 曲线沿用既有的 --ease-drawer: cubic-bezier(0.32,0.72,0,1)
   —— 不新建 --ease-morph：同值不同名＝一次重复定义（单一真源）。 */
```

> 以上 7 个变量已于 2026-10-31 落进 `src/styles/common/tokens.css`（P0）。

配套 `src/utils/motion.js`：`prefersReducedMotion()`、`isLitePerf()`（读 `html.boh-perf-lite`，见 `utils/performance-profile.js`）、`motionMs(name)`（`getComputedStyle` 读变量 —— **不在 JS 写第二份毫秒数**，与 `useAutoGrowTextarea` 的「上限只声明在 CSS」同一条纪律）。

### L1 origin 采集与传递

新增 `src/utils/motion-origin.js`：

```js
captureCardOrigin(el) → { x, y, w, h, radius, postId, at }
consumeOrigin(postId) → origin | null
```

- 内存单例（同文档跳转，主路径）+ `sessionStorage` 兜底（刷新/整页跳转），TTL 与 `forum-return-state.js` 同为 30min；
- **必须校验 `postId` 一致**（防止 A 卡点的、B 卡的展开）；
- 视口尺寸变化 > 20% 视为失效。

接线 3 处 + 1 个签名：

```js
// usePostDetailModal.js
export function openForumPost({ router, postId, originEl })
// ForumMain / ProfileMain / UserSpaceMain 各一行
// PostCard.vue: @click="emit('click', post.id, $event)"
```

`ProfileMain.vue` 的自绘卡片（`.profile-post-card`，约 644 行起）补 `data-post-card`，否则 profile 入口自然降级。

### L2 入场 morph（几何是真源）

```js
const S = card.getBoundingClientRect();
const T = panel.getBoundingClientRect();          // 先 display，再量
const sx = S.width / T.width, sy = S.height / T.height;
const dx = S.left - T.left,   dy = S.top - T.top;
panel.style.transformOrigin = '0 0';              // 必须：否则 translate 与 scale 不落在 S

panel.animate([
  { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
    borderRadius: `${20 / Math.max(sx, sy)}px` },  // 圆角反算，见下
  { transform: 'none', borderRadius: `${R}px` },
], { duration: motionMs('--motion-morph-in'), easing: 'cubic-bezier(.32,.72,0,1)' });
```

**三条几何注记**（都在 demo 里验过）：

1. `transform-origin: 0 0` 是必须的。用 `50% 50%` 时 `translate` 与 `scale` 的组合落点会偏 `(S.w - T.w)/2`。
2. 非等比缩放下圆角会被拉成椭圆。用 `20 / max(sx, sy)` 反算，主轴上看起来正好 20px；`min` 会让辅轴过圆。
3. 终点圆角取「详情面板圆角」（竖屏 0 / 横屏 24px），**不要**用卡片圆角 —— 那会让面板四角一直是 20px。

**内容分两段**：`pbody` 单独 `opacity 0 → 1`、`delay = 0.38 × dur`、`translateY 10px → 0`。这样即使 `sy ≈ 4`，用户也看不到文字被拉长。

**两条兜底**：

- 竖屏目标 = `.post-detail-card`（`style.scoped.css:369`），不是整页根 —— 背景/底栏不该跟着缩放；
- fixed 底栏 `.pd-actionbar--page` 在形变期间 `opacity:0; translateY(100%)`，落定后 140ms 内升起（绕开 R2 的包含块事故）。

### L3 返程 morph（最难的一环）

**问题**：列表已卸载（2.2 第 4 条），返回时 `initializeForumData()` 走快照直跳 + `restoreForumScrollPosition()`（`ForumMain.vue:382-410`），可能连拉数页。**详情离场那一刻，目标卡片还不存在。**

**采用方案 B（2026-10-31 拍板，不再是备选）**：App 级 `SharedMorphLayer`（`Teleport body`、`pointer-events:none`、z-index 与详情同级）接住跨路由尾帧。

握手协议三条，缺一不可：

1. 详情离场前 `beginMorphBack(rect)` → morph 层**先**接管（取代现在"等 `animationend` 再 resolve"的顺序）；
2. 列表 restore 完成（`restoreForumScrollPosition` 之后）广播 `forum:anchor-ready`，带 `postId`；
3. morph 层收到后 1 帧内算目标 rect 并收缩；**400ms 未收到就原地淡出** —— 与 `PostDetailMain.vue:1511-1513` 的 320ms 超时兜底同一纪律，绝不把用户卡在中间态。

**备选（A，仅作应急预案）**：不跨路由，只按内存 origin 的相对位置反向缩小淡出。70 分，滚动变化时会偏。**只在 B 的握手失败（`forum:anchor-ready` 超时）时作为兜底，不作主路径。**

**备选（C，终局）**：竖屏也改用 `usePostDetailModal` 的覆盖层，列表 DOM 全程不卸载 —— 双向 morph 天然成立、顺手解决滚动锚点。代价：竖屏详情的滚动锁、软键盘、深链、`onBeforeRouteLeave` 全要重验，7 个详情探针要改。**本计划不做，留作 036 的候选。**

### L4 局部交互（逐项「从触发点长出」）

| 交互 | 改法 | 慢速时长 |
| --- | --- | --- |
| 评论展开 | `max-height` 改**实测高度**，时长按高度算；收起从当前高度出发 | `clamp(240, 150 + h×0.42, 600)` |
| 评论收起 | 比展开快 25% | `clamp(180, 120 + h×0.30, 420)` |
| 骨架→真实 | 骨架与列表**同高**，只换内容不换容器 | 160ms 交叉淡入 |
| 回复框 | 从「回复」按钮原点展开（`transform-origin: var(--ox) top` + `scale(.72,.42)`），不再从上落下 | 340ms |
| 点赞 | 涟漪从心形扩散 + 数字上滚（双数字槽 `translateY`）；取消赞不播弹跳 | 图标 480 / 涟漪 680 |
| 分享 | 气泡从按钮圆心 `clip-path: circle()` 扩出；勾号 `stroke-dashoffset` 画出来 | 气泡 420 / 勾 480 / 保持 2200 |
| 图片查看器 | 缩略图 rect ↔ 全屏 rect 双向；多图翻页后按 index 取当前那张 | 进 420 / 出 320 |
| 详情内图片切换 | `out-in` 改绝对叠放 + 方向感知 `translateX(±8%)`；与面板 520ms 变宽错拍 | 420ms |
| 筛选/分区切换 | 方向感知出/入；stagger 只在首屏与换筛选时播，滚动挂载不播 | 360 + 70×5 |

**修 2.3 的滚动重播**：卡片加 `data-appear="once"`，动画 `animationend` 后置位；虚拟窗口重挂载时不再播。

### L4.5 统一按压基线（2026-10-31 拍板：要做）

**先补 transition，再加 scale。** `.post-card-v2`（`feed.css:128-142`）的 `transition` 只覆盖 `opacity / background-color / border-color / box-shadow`，**没有 `transform`** ⇒ 直接加 `:active { transform: scale(.994) }` 会瞬跳，看起来像抖动而不是按压。

真源放在 `motion.css`，两个工具类，**禁止各组件自己写一份**：

| 类 | 适用 | `:active` 值 | 补的 transition |
| --- | --- | --- | --- |
| `.boh-press` | 容器级：帖子卡片、面板、大面积可点区 | `scale(.994)` | `transform 120ms var(--ease-out)` |
| `.boh-press-sm` | 控件级：≤32px 图标按钮、操作项 | `scale(.94)` | 同上 |

四条注记：

1. **不参与慢速放大**：进 120ms、回 180ms，与 §4 表格最后一行同一条纪律；
2. 只在 `:active` 与 `@media (hover: none)` 生效，桌面 `:hover` 不加位移 —— 鼠标滑过就抖是另一种廉价感；
3. 卡片要补 `-webkit-tap-highlight-color: transparent`，否则 iOS 的灰色高亮会和缩放叠成一坨；
4. 不要把 scale 写进 `:hover`：`feed.css` 的卡片 hover 已经改了 border/shadow，叠加后"选中态"与"按压态"分不清。

### L5 慢速节奏总表（定稿）

| 场景 | 进 | 出 | 比例 |
| --- | --- | --- | --- |
| 卡片 ↔ 详情（跨屏） | 640ms | 480ms | 1.33 |
| 卡片 ↔ 详情（近距） | 480ms | 380ms | 1.26 |
| 弹窗（遮罩 / 面板） | 300 / 560 | 420 | — |
| 整页详情（降级路径） | 480ms | 360ms | 1.33 |
| 局部块（评论 / 回复框） | 240–600 | 180–420 | 1.4 |
| 反馈（点赞 / 分享） | 480 / 680 | — | — |
| **即时反馈（按压 / 高亮 / 骨架）** | **120–160ms（不参与放慢）** | — | — |

> 最后一行是这套方案能不能成立的关键：把所有时长整体 ×1.5 会让"点击→看见变化"越过 200ms 的感知阈值，用户判成卡顿。**慢的是空间，响应必须留在原速。**

---

## 5. 降级判据（必须写死，否则会缩到屏幕外）

1. `consumeOrigin()` 未命中 / `postId` 不符 / TTL 过期 → 淡入（并用 `--pd-enter-from` 承接方向：点上半屏 +10px，下半屏 −10px）；
2. `prefers-reduced-motion: reduce` → 只留 ≤110ms 的 opacity（沿用 `animations.css:1028-1038` 的全局重置，别另写一套）；
3. `html.boh-perf-lite`（`performance-profile.js`）→ 关 morph，只淡入；
4. 目标卡片 rect 不在可视区（`bottom < stageTop + 4` 或 `top > stageBottom - 4`）→ 淡出；
5. 视口在动画中变化（旋转/软键盘）→ `cancel()` 当前动画，直接落到终态。

---

## 6. 改动范围

| 类型 | 文件 | 说明 |
| --- | --- | --- |
| 新增 | `src/utils/motion.js` | 时长读取 / 降级判据。**随 P1 首个消费者一起进** —— P0 单独引入会变成死代码 |
| 新增 | `src/utils/motion-origin.js` | origin 采集与消费（P2） |
| 新增 | `src/components/motion/SharedMorphLayer.vue` | 跨路由收缩层（`body` 兄弟节点，**不包** `RouterView`） |
| 改 | `src/App.vue` | 仅挂载上述层。⚠️ 动它就必须跑 `npm run probe:route-switch`（见 AGENTS.md §2） |
| 改 | `src/styles/common/tokens.css`、`animations.css` | Motion Ladder + `.boh-press/-sm`（P0 已落）。**不新建 motion.css** —— 动效 token 的单源就是 tokens.css |
| 新增 | `src/composables/useCollapseTransition.js` | 高度展开（**不要写第 5 份**） |
| 改签名 | `composables/usePostDetailModal.js` | `openForumPost({ originEl })`、`close()` 前握手 |
| 改 | `ForumMain.vue` | 传 origin、评论展开、点赞/分享、stagger once、`forum:anchor-ready` |
| 改 | `Forum/components/PostCard.vue` | click 带 `$event`、`data-post-card`、回复框原点、评论容器 |
| 改 | `PostDetail/PostDetailMain.vue` | morph 入/出、图片切换方向、反馈、morph 期间底栏 |
| 改 | `PostDetail/PostDetailModal.vue` | 从卡片 rect 起、两段式宽度（760 → 比例宽） |
| 改 | `PostDetail/index.vue`、`style.scoped.css`、`modal-layout.css` | 动画规则 |
| 改 | `Forum/styles/{feed,base,replies-responsive}.css` | 度量/节奏/方向修正 |
| 改 | `Forum/components/ForumImageViewer.vue`、`PostDetail/components/ImageViewer.vue` | 两处共用一套 rect morph |
| 一行接线 | `Profile/ProfileMain.vue`、`user-center/UserSpace/UserSpaceMain.vue` | 传 origin |
| 门禁 | `scripts/lib/gate-map.json`、`docs/PROBES.md`、`AGENTS.md` §2 | 新增探针映射 |

---

## 7. 探针断言（必须"有牙"）

新增 `scripts/probes/probe-forum-motion.mjs`：

1. 入场首帧 `getBoundingClientRect()` 与卡片 rect 误差 < 8px；
2. 落定后 `getComputedStyle(panel).transform === 'none'`（防 `fill:both` 残影 + fixed 劫持，2.2 第 8 条）；
3. 返回后 morph 层节点数归零、`.post-detail-page` 不存在；
4. `prefers-reduced-motion` 下不产生 transform；
5. 评论展开耗时与高度**正相关**（短/长两档差 ≥ 120ms）—— 这一条是不许回到 `max-height:1200` 的唯一证据；
6. 图片查看器关闭后，全屏节点的 rect 与缩略图 rect 误差 < 8px。

扩 `probe-post-detail-transition.mjs`：时长断言改为**读 CSS 变量**，不再写死 `260` / `220`。
新增门禁的样本必须进 `scripts/lib/gate-fixtures.mjs`，否则 `check:gates-self-test` 会列「未覆盖」。

---

## 8. 分批与验收

| 批 | 内容 | 风险 | 验收 |
| --- | --- | --- | --- |
| P0 | motion tokens（`tokens.css`）+ 两个 press 工具类（`animations.css`） | 极低（视觉不变） | `verify:fast` |
| P1 | 局部交互：评论展开、回复框方向、点赞、分享、图片查看器、图片切换 | 低，不碰路由 | `probe-forum-search/-virtual-jump/-polish-sweep` + 新探针 5/6 |
| P2 | 入场 morph（竖屏整页优先） | 中 | 新探针 1/2/4 + `probe-post-detail-transition` |
| P3 | 返程 morph（`SharedMorphLayer` + 握手） | 中高 | 新探针 3 + `probe:route-switch` |
| P4 | **横屏弹窗 morph（已拍板要做）** + 节奏微调 + lite 降级 | 中 | `probe-pd-modal`、`probe-post-detail-modal-xhs` |

每批结束：`npm run gate:plan` → 对应探针 → `npm run verify`；动过棘轮基线的必须 `npm run prepush`（`check:gates-self-test` 不在主链，**verify 绿 ≠ prepush 绿**）。

**建议先交付 P0 + P1**：覆盖 80% 的「有来处」体感（评论/回复/点赞/分享/看图），且完全不碰路由；morph 的 640/480 一旦落定就很难再单调，先用 P1 在真机上确认"慢到什么程度才不钝"。

---

## 9. 风险与已知坑

1. **`fill-mode: both` + fixed 包含块**：形变层绝不包 fixed 子元素；结束必须 `transform: none`（探针 2 守）。
2. **`contain: paint` / `overflow` 裁切**：morph 层必须挂 `body`，不能塞进 `.liquid-glass`（`contain:paint`）或 `overflow` 容器。
3. **虚拟列表卸载**：内存 origin 可能指向已销毁的卡片 ⇒ 一律走 `postId` 校验 + 可见性判定，不 `document.querySelector` 硬抓。
4. **iOS 边缘返回手势**：会打断长动画 ⇒ R5 可中断 + 全部等待带超时。
5. **弹窗宽度异步**（2.2 第 6 条）：入场按 `PANEL_MIN = 760` 起，比例到达后用现有 520ms `width` 过渡接上，不等网络。
6. **`will-change` 泄漏**：形变结束清掉，否则整页长期提升合成层。

---

## 10. 已拍板（2026-10-31）

1. **返程上 `SharedMorphLayer`** —— 定为唯一主路径（L3-B），L3-A 降级为握手超时时的兜底。
   连带约束：`App.vue` 要多挂一个 `pointer-events:none` 的常驻层；它**不能**包住 `RouterView`（会改变 `fixed` 的包含块），必须是 `body` 下的兄弟节点。
2. **横屏弹窗也走 morph** —— 不再只统一曲线。弹窗口径：起点同样是卡片 rect，目标 `.pd-modal-panel`（`PostDetailModal.vue:199`）。
   注意它宽度是**异步**的（由图片比例反推，`:113-139`）⇒ 进场按 `PANEL_MIN = 760` 起，比例到达后由既有 520ms `width` 过渡接上。
3. **统一按压基线** —— 见 L4.5，落 `motion.css` 的两个工具类，随 P0 一起进（纯 token + 类，视觉只在 `:active` 时变化）。

### 仍未决（不阻塞实施）

- 卡片按压值最终取 `.994` 还是 `.98`：等 P0 落地后在真机点一遍再定，改一个数字即可。
- 640ms 是否在 60Hz 低端机上降到 520ms：等 `boh-perf-lite` 的实测分布再定（`performance-profile.js` 已有判据，但没统计过命中率）。

---

## 11. 实施记录

### P0（2026-10-31 已完成）

| 文件 | 改动 |
| --- | --- |
| `src/styles/common/tokens.css` | Motion Ladder 7 个变量（640/480/480/480/360/70/5） |
| `src/styles/common/animations.css` | `.boh-press` / `.boh-press-sm`（刻意不写 transition，见 L4.5 注①） |

两处对原方案的修正：**不新建 `motion.css`**（动效 token 单源就是 `tokens.css`）；
**不建 `--ease-morph`**（与 `--ease-drawer` 同值）。

### P1 第一批（2026-10-31 已完成）：评论展开 / 回复框 / 点赞 / 分享

| 文件 | 改动 |
| --- | --- |
| `src/utils/motion.js`（新增） | `motionMs()` / `capMotion()` / `expandDuration()` / `collapseDuration()` |
| `PostCard.vue` | 两个 `<transition>` 改 `:css="false"` + WAAPI；回复框原点取自「回复」按钮 |
| `feed.css` | 删 `.expand-replies-*`（改 JS 驱动）；心跳 0.4→0.56s、峰值 1.25→1.18；新增 `likeRipple`；勾号 `shareCheckDraw` |
| `ForumMain.vue` | 分享态 1500→2000ms（勾号要画 480ms，画完得留可见时间） |
| `tests/unit/motion-duration.test.js`（新增） | 10 条：时长性质 + 旧实现回潮守卫 |

**浏览器实测（`/user-space?tab=community`，真实帖子）**：

- 点开评论：40ms 时高 26px、`getAnimations().length === 1`（动画在跑）；700ms 后 138px、`anims === 0`、
  内联 `max-height` 已清空 ⇒ 收尾逻辑生效，内容没被裁。
- 回复框：`transform-origin` 计算值 659.662px vs 按钮实际中心 660px（误差 0.3px）。

⚠️ **截图抓到一个只在真机上才暴露的缺陷**（已修）：卡片被重新挂载时，展开动画会**重播一次**
（虚拟窗口滑动 / 列表重算都会触发），表现为「滚回来评论区又长了一遍」。修法是实例内记
「setup 时是否已经展开」，是则跳过 enter —— 实测重挂载后 `anims === 0`。

### P1 第二批（未做）

- 图片查看器从缩略图 rect 起（`ForumImageViewer.vue` + `PostDetail/components/ImageViewer.vue` 共用一套），
  需要 `ForumMain.openForumImageViewer` 把触发元素一起传下去（`PostCard` 的 emit 目前只给 post + index）。

---

## 12. 实施记录（2026-10-31 第二轮：P1-2 / P1-3 / P1-4 / P2 / P2-1 / P2-2 / P3）

### 新增基础设施

| 文件 | 内容 |
|---|---|
| `src/utils/motion-origin.js`（新） | `captureOrigin` / `peekOrigin`（活元素现量、TTL 30min、视口变化 >20% 失效、`matchPrefix`）/ `flipFromRect` / `flipRadius` / `canMorph` / `animateMorph` |
| `PostCard.vue` | `click` 事件补 `$event`；缩略图补 `data-image-url` 与 `$event` |

**`flipFromRect` 的 `transform-origin` 必须是 `0 0`** —— 这是本轮唯一一个「不写就静默错位」的点。
第一版漏了它（元素默认 `50% 50%`），实测首帧 `translate` 与目标差 `(S.w - T.w)/2`；
补上后图片查看器首帧 `translate(19.56, 194.32) scale(0.4494, 0.2528)` 与缩略图 rect `(20, 356, 175, 131)`
逐项对得上（`390×0.4494 = 175.2`、`520×0.2528 = 131.5`、`0+19.56 = 19.56`、`162+194.32 = 356.3`）。

### 图片查看器（P1-2）

`openForumImageViewer(post, index, event)` 采集 `forum-image:<postId>:<url>`。
进场在**第一张图 load 之后**才跑（终态尺寸此时才知道），命中缓存时由 `img.complete` 补一次。
退场（`--motion-exit` 360ms）先缩回缩略图再 `close()`，因此离场位移不会被 Vue 的 180ms 淡出截断。
放大过（`zoom > 1`）则跳过形变 —— 缩放后的图与缩略图已经不是「同一个物体」的几何关系。

### 详情入场 morph（P2）

`openPostDetail(postId, event)` → `captureOrigin('post-detail:<id>', event.currentTarget)`；
`PostDetailMain` 在 `isLoading` 转 false 后对 `.x-post-card` 跑 `--motion-morph-in`（640ms）。

- **只形变 `.x-post-card`**，不碰 `.post-detail-page`：页根里的底栏是 `position: fixed`，
  祖先一旦带 transform 包含块就被换掉，底栏会被一起缩放（仓库踩过的坑）。
- 内容 `opacity` 从 0 起、到 45% 才满：非等比缩放下文字会被拉伸，但那几帧它本来就看不见。
- 落定后实测 `transform: none`、内联样式为空。
- 终态矩形在动效开始时量，此时评论/图片还没全部落地（实测 727px → 900ms 后 1007px），
  所以中段尺寸会随内容生长缓慢变化。**这是异步取数的诚实代价**，不打算用「等所有内容再进场」换
  ——那会让入场被网络拖住。

### 搜索（P1-3 / P1-4）

- 清除钮 / 标签 chip：`toolbar-pop` 160ms（退 120ms）。⚠️ 退场节点必须 `pointer-events: none`：
  `.toolbar-clear-btn.is-hero` 是绝对定位、正压着输入框右端，留它吃点击会导致
  「清空后立刻点输入框」落空。
- AI 提示句 320ms 淡入；最近搜索下拉 0.18s/−6px → 320ms + `transform-origin: top` + `scaleY(.96)`。
- 结果换批：`is-feed-entering` 挂在 `.posts-feed`，卡片复用自带 `--post-appear-delay` 做 stagger，
  1.2s 后摘除。**时序挂在 `forumData` 落地**而不是关键词变化 —— 挂关键词会「播上一批结果的动画」。

### 编辑器（P2-1 / P2-2 / P3）

- 图片条改 `TransitionGroup`（`enter` 260ms `scale(.62)`→1、`move` 320ms 仅非拖拽时启用）。
- 状态徽标 160ms；发布按钮加压按基线 + 提交中沿边框转一圈的进度弧（`conic-gradient` + `mask`）。
- 竖屏发布会话：380ms/`--ease-emphasized` → **520ms/`--ease-drawer`**（退 420ms）。
  连带把 `forum-post-draft-sync-guard.test.js` 里的 `toContain('transform 380ms …')` 改成
  「≥480ms 且走 `--ease-drawer`」——钉死毫秒数的守卫每次调参都要改，等于没有约束。
- 拖拽 FLIP：`finishDrag` 先量松手时的视觉位置，重排后把卡片拉回该位置再 320ms 放掉；
  期间给元素加 `is-settling` 让 TransitionGroup 的 `move` 过渡让位（两套一起跑＝抖一下再滑）。

### 自证

```
npm run verify            ✅（3587 passed / 1 skipped，12 道 check + lint + type-check + 棘轮总账）
probe-composer-image-strip ✅ 14/14（含长按拖动换序）
probe-composer-image-stall ✅ 6/6
probe-forum-search        ⚠️ 11/12：D3「清空后点输入框」被 `.boh-main.is-empty`（统一导航岛）拦截。
                           **已用 HEAD 版 ForumToolbar 复跑，同样 11/12 ⇒ 与本轮改动无关，是既有抖动。**
probe-composer-session-gate ⚠️ 24/26：D1/D2 同样在 HEAD 版 `replies-responsive.css` 下复现 ⇒ 既有失败。
```

### 未做（下一轮）

- **`SharedMorphLayer`（L3 返程）**：详情回到列表的收缩还没做。这是整件事真正的难点（列表已卸载），
  需要 App 级层 + `forum:anchor-ready` 握手 + 400ms 降级。
- **横屏弹窗 morph（P4）**：`PostDetailModal` 的面板宽度依赖图片比例（异步），要按 `PANEL_MIN = 760`
  分两段进场；本轮未动。
- **`probe-forum-motion.mjs`**：本轮用一次性脚本实测（数值见上），还没落成常驻探针。
  落成时必须同时在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 会判未覆盖。

---

## 13. 第三轮（2026-10-31）：返程收缩 / 横屏弹窗 / 常驻探针

### L3 返程：克隆收缩层（新 `src/utils/morph-layer.js`）

不引入 App 级组件，改为**纯 DOM 工具**：`playCollapseMorph(sourceEl, targetRect, { duration })`。
它把正文卡 `cloneNode(true)` 后钉进 body 下的固定层，动画到目标矩形再自毁。

为什么是克隆而不是「让详情元素自己缩回去」：竖屏详情是整页路由，返回那一刻组件正在被卸载，
目标卡片也还不存在（列表要重新挂载 + 还原滚动）。元素级动画在这里结构上不可能成立。

四条约束（都写进文件头了）：

1. **克隆必须先钉死宽高再定位**，否则放进 `position: fixed` 的层里会按新包含块重排（字换行、图错位）。
2. **非等比缩放到目标矩形**。等比只能缩到 0.98（卡片宽 381 / 正文卡宽 390），肉眼等于没动；
   非等比会压字，所以 `opacity` 在 30%→100% 就走完，压扁最狠的几帧只剩 0.3 以下。
3. **`contain: layout paint`，不是 `strict`** —— `strict` 含 size containment，会把这一层按
   「无内容」定尺寸，克隆在内层直接 0×0（看不见也查不出来）。
4. **三条收尾路径都移除节点**（成功 / reject / 异常）。残留克隆不占视觉，但会吃掉
   「点到了哪里」的判断。

接在 `onBeforeRouteLeave` 里，与既有的整页淡出**并行**（页面壳淡掉，正文卡由克隆接住一路收回去），
不额外延长导航 —— 仍是 320ms 后放行。

### 横屏弹窗 morph（P4）

`PostDetailModal` 的 `.pd-modal-panel` 进场 `--motion-morph-in-near`（480ms），退场 `--motion-exit`（360ms，
必须短于 leave 的 420ms，否则末帧被 Vue 摘节点截断）。两点：

- 只按**面板当前**矩形算形变，不等 `media-ratio` —— 图片比例到达后面板走既有的 520ms 变宽过渡，
  两段衔接。等网络会让入场被拖住。
- `PostDetailMain` 在 `modalMode` 下**跳过**自身的卡片形变，否则面板 + 正文卡两层一起变形。

### 常驻探针 `probe-forum-motion.mjs`（22 断言）

四组：A 图片查看器 / B 详情入场 / C 返程 / D reduce 降级。三条口径写死在文件头：来源 rect 对齐、落定
`transform: none`、克隆层零残留。C2b 是最关键的一条 —— **末帧落点必须回到入口那张卡的矩形**，
实测 `{"left":4,"top":184,"width":381,"height":476}` 与卡片 `{"left":4,"top":184,"width":381,"height":476}` 完全一致。

已登记：`scripts/lib/gate-map.json`（Forum / PostDetail / `motion-origin.js` / `morph-layer.js` 四处）+
`docs/PROBES.md` 两张表。

### 第三轮实测

```
probe-forum-motion        22/22 PASS
probe-pd-modal            40/43（A6/A8/A9 失败：媒体全出血 + panelW=760。
                          **禁用面板形变后复跑仍是 40/43 ⇒ 与本轮改动无关**）
npm run verify            ✅
```

### 仍未做

- 详情返程目前只在**竖屏整页**形态生效；横屏弹窗的返场用面板 WAAPI 收缩，若列表已滚走则落点会偏。
- `AGENTS.md §2` 的新探针行 + 源文件/脚本数**必须与提交同一笔**改（`doc-truth` 口径是 `git ls-tree HEAD`，
  未提交时改文档会当场红）。
