# C 类迁移方案：形变浮层（`useBohMorphSurface`）

> 2026-11-24 · 承接 plans/045 阶段 2 的 C 类剩余 3 份
> 本文件是**设计决策记录**，不是进度表 —— 进度仍写进 `plans/045` 的进度表。

## 0. 为什么不能照 B 类直接迁

B 类 5 份的共性是「Teleport + 遮罩 + 单列卡片 + 淡入缩放」，壳的四个口子正好覆盖。
C 类三份的共性**不是**这些：

| 维度 | 壳现有 | C 类要求 |
| --- | --- | --- |
| 横屏几何 | 居中**单列**卡（460/560/720 宽） | 商品详情 `1.1fr/0.9fr` 双列 1120×880；结算 1:1 双列 880×620 |
| 竖屏几何 | `portraitPage`：header + body + footer | 商品详情是**封面图区（4:3）+ 内容区**，封面不是 header |
| 进出场 | `boh-fade` 遮罩 + `boh-pop` 面板（CSS transition） | **形变**：`clip-path` 从被点卡片矩形推开 / 收回（WAAPI） |
| 滚动 | 单一 `.boh-modal__body` | 「某块固定、某块滚」（封面固定 + 内容滚） |

结论：**C 类的缺口是同一件事 —— 壳只有「单列卡 + 淡入缩放」，而它们要「任意几何 + 形变」。**
这不是三份各自的问题，所以不该边迁边试。

## 1. 最关键的风险：形变会静默消失

形变是 2026-11-01 用户定下的口径（「从点开的那一格推开」），现在 5 个文件各写一遍：
`PostDetailModal` / `ProductDetailSheet` / `LotteryDetailSheet` / 两个 ImageViewer。

如果把它们直接塞进 BohModal：

- 壳挂的 `boh-pop` 是 **CSS transition**（`transform` + `opacity`）；
- 形变是 **WAAPI**（`el.animate`），看不见；
- CSS Cascade 里 transitions 在最后一档，**压过 animations**。

⇒ 表现就是论坛详情 2026-10-31 踩过的那个坑原样复现：WAAPI 形变被整段压掉，
元素宽度全程不动，只剩一段淡入。而且**没有任何测试会红** —— 现在没有任何守卫
检查「形变是否真的播了」。

这条是本方案要解决的第一个问题（§4 的 G0 组断言）。

## 2. 选型：抽 composable，不往壳里加口子

三个候选：

| 方案 | 判断 |
| --- | --- |
| A. 给 BohModal 加 `morph` prop | ❌ 壳会被迫接管 `clipPath` / `transition-property` / 纵深层，这些都是**面板内部实现细节**，壳一旦知道就会耦合到具体宿主的 DOM 结构（纵深要挂 `.pd-modal-scroll` 这种宿主自己的类）。 |
| B. 新建 `BohMorphModal` 组件 | ❌ 等于第二套浮层壳，正是这次收编要消灭的东西；而且 B 类 5 份将来想加形变又要再迁一次。 |
| C. 抽 `useBohMorphSurface(elRef, opts)` composable | ✅ 只借壳的「遮罩 + 滚锁 + 焦点 + 进出场时机」，形变作为**独立一层**挂在壳的 dialog 元素上；宿主继续拥有自己的几何与内容。 |

选 **C**。理由：形变本质是「给某个元素的 `clip-path` 跑一段 WAAPI」，与「谁提供遮罩、
谁锁滚动」正交。把它做成 composable，就能同时喂给 `BohModal`（C 类宿主）
和 `PostDetailModal`（将来可选接入，不必现在动它）。

## 3. 交付物

### 3.1 新增 `src/composables/useBohMorphSurface.js`

从 `PostDetailModal.playPanelMorph` 抽出的通用实现，签名：

```js
useBohMorphSurface({
  surfaceRef,        // 要做形变的元素（壳的 dialog / 宿主自己的 panel）
  originKey,         // () => string，来源卡片 key（带身份）
  surfaceSelector,   // 退场时 ref 已解绑，用它回落到 DOM 查询
  depthSelector,     // 可选：纵深层选择器（相对 surface 内部查询）
  enabled,           // () => boolean，默认 true
  fallbackRadius,    // 来源元素无圆角时的兜底（默认 12）
});
// 返回 { play(direction), playClose(), closing }
//   · play('in'|'out') —— 底层，调用方自己管时序
//   · playClose()      —— 带「只播一次」守卫的退场（close 有按钮/Esc/遮罩/路由多个入口）
//   · closing          —— 只读，宿主可据此禁用按钮
```

内部必须原样保留 `PostDetailModal` 那五条踩坑结论（**一条都不能省，每条都有实测注释**）：

1. **退场时模板 ref 已解绑** ⇒ 元素回落到 DOM 查询；
2. **形变期间 `transition-property` 收成 `width`** ⇒ 否则 CSS transition 压掉 WAAPI；
3. **形变期间 `transform: none`** ⇒ 否则 leave-to 的 `scale(1.008)` 瞬间生效、末帧落偏；
4. **退场透明度是独立一条 `linear` 动画**，且末帧必须显式 `offset: 1`
   ⇒ 塞进 `ease-morph` 的关键帧会被前载曲线跨过；不写 offset 1 会反弹回不透明；
5. **退场 `keepFinal: true`** ⇒ 否则 cancel 瞬间弹回全屏。

**第 5 条的补充（本批实测，方案原文没写到）**：退场还必须 **`await` 几何那条播完再返回**。
原因不在动画本身，在**卸载时序**：宿主组件常被父级 `v-if` 控制
（`<ProductDetailSheet v-if="selectedProduct">`），`emit('close')` 会让整棵子树
**立即**卸载 —— 实测节点在 **8ms** 就被摘除，形变一帧都没跑，用户看到的是「硬切消失」。
壳的 `<Transition>` 写了离场时长也保不住它。所以形变播完由 composable 等，等完调用方才 emit。

### 3.2 壳侧唯一改动：`Transition` 增加 `@enter-cancelled` / 动画协调

壳的 `boh-pop` 只负责 `.boh-modal__dialog` 的 `transform/opacity`。
形变宿主需要「壳不要动 panel 的 transform」这一个协作点。两种做法：

- **做法一（推荐）**：加 `morph` 布尔 prop，为真时 dialog 不挂 `boh-pop`（改为只跑 `boh-fade`
  遮罩），把面板的进出场完全交给 composable。
- 做法二：不改壳，宿主自己在形变期间钉 `transition-property`。

选**做法一**。理由：做法二把「和壳的 CSS 打架」这件事留给每个宿主各写一遍，
正是这五条坑最难复现的部分。壳知道自己「这次不接管面板动画」是合理职责边界。

⚠️ 这是**第五个口子**，`tests/unit/boh-ui-kit.test.js:198` 那条「只开四个口子」的
守卫要同步改，并写清理由（与第四口子同样的纪律：形态问题只能由壳给变体）。

### 3.3 几何：不加口子，宿主自己管

双列 grid / 封面区这些**不进壳**。宿主用 `flush`（壳不管内衬）+ 自己的 CSS 排版，
壳只提供「铺满 / 居中」两种外框。理由：B 类已经证明「一个口子服务一族宿主」是划算的，
但「双列 vs 封面区 vs 三栏」各自只服务一份，开成口子就是死代码。

## 4. 验收：先补守卫，再迁宿主

**当前没有任何「形变真的播了」的守卫**，这是必须先补的（否则迁完看不出丢没丢）。

新增 `scripts/probes/probe-boh-morph-surface.mjs`（Playwright，真浏览器才量得到 WAAPI），
**已落地 15 条**，分组与方案原文的 G0–G5 对应如下：

| 落地断言 | 对应原计划 | 抓什么 |
| --- | --- | --- |
| A1 面板上确实挂了动画 | G0 | 形变被 CSS 过渡压掉时这里是 0 |
| A2 动画作用于 clipPath | G0 | 若变成 transform 缩放 ⇒ 走了别的路径 |
| **A3 起点窗口是来源卡片矩形（非全屏）** | G1 | 判别性：进场从全屏起 = 没从卡片推开 |
| A4 进场结束后动画已清空 | — | 防 fill 留在元素上导致之后的样式失效 |
| **B1 clipPath 与 opacity 是两条并行动画** | G0 | 判别性：串行发就等于没有淡出（本批实测踩过） |
| B2 形变窗口收回（2 帧 360ms） | G2 | — |
| **B3 透明度 4 帧且末帧显式 offset 1** | G0/G3 | 判别性：漏 offset 1 会反弹回不透明 |
| B4 两条都保留终态（fill forwards） | G3 | 防 cancel 弹回全屏 |
| **B5 节点存活到形变跑完（>120ms）** | G3 | 判别性：缺陷版 8ms 就被摘除 |
| R1 reduced-motion 下不播形变 | G4 | 无障碍降级 |
| R2 reduced-motion 下关闭仍生效 | G4 | 防降级把 close 一起吞了 |
| C1 morph 模式 dialog 退化成纯定位容器 | — | 双层外壳会让两块一起缩 |
| C2 morph 模式不渲染壳的空 header | — | 空头 52px 把面板撑高（904 vs 852） |
| C3 遮罩仍保留模糊 | — | 形变不该把材质一起丢掉 |
| Z1 全程无 pageerror | — | — |

> **G5（无来源时降级）** 没单独写断言：`canMorph()` / `enabled()` 为假时 `play()`
> 直接返回 `false`，宿主当即 `emit('close')`。这条由 R1 的同一路径覆盖（reduced-motion
> 就是走降级分支），再加一条只测「同一个 if」没有新增判别力。

### 实测方法坑（写探针时必读）

- **`getComputedStyle().clipPath` 读不到 WAAPI 的中间值**。第一版采样器全程读到 `none`，
  我据此误判「形变没播」，实际动画在跑。必须走 `el.getAnimations()` 读关键帧与 offset。
- **采样器要在点击的同一个 `evaluate` 里启动**。分开写（先 `page.click()` 再起 rAF）时，
  前 20 帧全在点击之前跑完，采到一片 `n:0` 的空帧。
- **`new Function` 传函数源码进页面**：`page.evaluate` 的参数里不能直接传本地函数，
  要么内联，要么像本探针这样把源码串成常量再 `new Function('return ...')()`。

### 反证记录（四条全命中，缺一条这道门禁就没牙）

| 改动 | 变红的断言 |
| --- | --- |
| 淡出从「并行发」改回「await 几何后再发」 | **B1 + B3 + B4 同红**（只剩 clipPath 一条） |
| 删掉透明度末帧 `offset: 1` | B3 红（offsets 变 3 个） |
| 让 morph 模式重新渲染壳 header | C2 红（head 高 52px） |
| 退场 `keepFinal: false` | B4 红（fill 变 both） |

## 5. 迁移顺序

| 序 | 宿主 | 理由 |
| --- | --- | --- |
| 1 | 商品详情 `ProductDetailSheet` | 最小（594 行）；**已有** `probe-shop-detail-scroll.mjs`（10 条）可复用做滚动归属兜底 |
| 2 | 结算 `CheckoutSheet` | 最规矩（纯 CSS 媒体查询、滚锁明确交父级），但 1726 行、下单关键路径 ⇒ 改动要极小、只换外壳不动业务 |
| 3 | 抽奖详情 `LotteryDetailSheet` | 有 `standalone`（独立页）与弹层两种身份，放最后单独处理 |

## 6. 落地记录（2026-11-24 · 第一步完成）

**第一步「给壳补能力」已完成，未迁第二、三份**（结算 / 抽奖详情仍待做，顺序见 §5）。

交付物：

| 文件 | 改动 |
| --- | --- |
| `src/composables/useBohMorphSurface.js` | 新增。五条坑 + 卸载时序那条，逐条带实测注释 |
| `src/components/ui/BohModal.vue` | 加第五个口子 `morph`；`--morph` 类摘掉 dialog 全部装饰；`defineExpose({ dialogRef })`；header 条件加 `!morph` |
| `src/components/ui/motion.css` | 新增 `boh-morph` 预设：只声明时长、不动任何属性（否则抢形变通道） |
| `src/views/Shop/ProductDetailSheet.vue` | 首个宿主。外层交给壳，双列 / 封面区 / 内容滚动留在宿主侧 |
| `scripts/probes/probe-boh-morph-surface.mjs` | 新增 15 条 |
| `tests/unit/boh-ui-kit.test.js` | 61 → 66（morph 口子 5 条守卫） |

### 三个额外实测坑（方案原文没预见到）

1. **`min-height: 0` 会让 grid 的封面区塌成 56px**。横屏双列下 `.surface-media` 是
   grid item，加 `min-height: 0` 后允许收缩到内容高度（空 svg 就 56px）。
   必须显式 `grid-template-rows: minmax(0, 1fr)` + 去掉 `min-height: 0`。
2. **`.is-landscape .detail-surface` 写成后代选择器永远不匹配**。两个类在**同一个**
   `<article>` 上，必须是 `.is-landscape.detail-surface`（无空格）。这个错的表现是
   **双列静默退回单列 flex、右栏文字被挤到 0 高** —— 内容断言全绿，只有截图看得出来。
   同一文件里我曾并存 `.is-landscape .detail-surface`（尺寸）与
   `.is-landscape detail-surface`（grid）两套规则，已合并。
3. **`shop-sheet-tokens` 这类域 token 必须挂在宿主自己的面板上**。壳的 overlay 不是宿主的
   后代，宿主 scoped 样式够不着（与 OrderDetailSheet 那条同一结论）。

### 迁移商品详情的净效果

`-- 285 / + 208`（净删 77 行）。删掉的是：遮罩、scrim、竖屏整页外框、横屏居中定位、
`od-*` 式进出场、手写形变调用、手写 orientation 监听之外的生命周期胶水。
保留并明确的责任边界：双列几何、封面区、内容滚动、滚动聚焦、编辑态。

## 7. 不做的事

- **不动 `PostDetailModal`**：它已有 5 条形变守卫（`postdetail-modal-morph-guard.test.js`），
  重写风险大于收益。composable 将来可选接入，但**本批不接**。
- **不动 `morph-layer.js`**（路由级克隆收缩）：那是「详情整页 → 列表」的返程，
  与浮层形变是两条路，混在一起会把 `page-snapshot` 的垫层逻辑拖进来。
- **不给壳加双列/封面区口子**（见 §3.3）。
