# 032 · 横屏帖子详情弹窗对齐小红书设计（差距清单 + 对齐方案）

> 目标：把 `PostDetailModal`（横屏帖子详情弹窗）从「小红书式布局的近似实现」推进到「信息密度、字号层级、
> 动作条形态、媒体呈现」与小红书横屏网页版详情一致的形态，同时保住 BOH 自己的产品差异（评论楼中楼、
> 帖子菜单、无障碍、暗色主题）。
>
> 提出：2026-10-22（用户提供小红书横屏网页版详情截图，要求对比并提出对齐方案）
> 状态：**仅分析与方案，未改任何源码。** 本文所有数字均为实测，判据见 §3。
> 复现素材：`output/xhs-align/`（参考图 `ref.png`、我方同尺寸截图 `ours-972x734.png`、测量脚本）

---

## 0. 落地状态（2026-10-22）

用户选定的范围：**P0-2、P0-3、P0-4、P1-6、P1-7、P1-8、P1-9 七项已落地**。
明确排除：**P0-5（收藏）不做**、**P0-1（面板材质）本次不做**、全部 P2 不做。
约束：**不动数据库**（本轮零表结构 / 零 API 改动）。

判据（可重跑）：

```bash
node scripts/probes/probe-post-detail-modal-xhs.mjs --assert
# 2026-10-22 实测：7/8 达标。唯一 FAIL = 面板填充（P0-1，本轮刻意不做）
```

竖屏整页详情**未被连带改动**（CommentThread 是弹窗态与整页态共用组件，故全部规则都挂在
`.post-detail-page--modal` 前缀下 + `:deep()`）。实测对照（390×844 走真实路由，非弹窗）：

| 观察点 | 竖屏现状 | 是否受影响 |
| --- | --- | --- |
| `.post-detail-title` | 27px | 否（未覆盖） |
| `.content-text` | 17px（clamp 下限） | 否（弹窗态覆盖带前缀） |
| `.x-comments-section` padding | 12px | 否 |
| 评论操作文字标签 | 「赞」「回复」照常显示 | 否 |
| 回复数徽标 | `display:none`（基类默认隐藏） | 否 |
| 子回复头像 | 32px | 否 |
| 展开链接颜色 | `rgb(37,99,235)` 蓝 | 否 |

判据：`node output/xhs-align/verify-portrait-real.mjs`（本机脚本，不入库）。

---

## 1. 结论摘要

结论：现有实现**结构方向是对的**（左侧媒体 + 右侧固定作者条 + 内部滚动信息列 + 底部固定动作条），
差的是**度量与材质**，不是重做。可归为 7 组、共 22 项，其中 9 项是「一眼能看出不同」的高优先项。

结论：最刺眼的 3 个差异是
① **面板是半透明玻璃（填充 `rgba(255,255,255,0.84)` → 实测落屏 `rgb(234,235,238)`）而参考是纯白 `rgb(255,255,255)`**；
② **媒体区有 17px 内衬 + 12px 圆角，参考是满出血贴面板边**；
③ **动作条是「胶囊输入框 + 发送按钮 + 三个图标+数字」五件套，参考是「胶囊输入框 + 四个纯图标（数字仅首项）」**。

---

## 2. 两侧口径（先统一坐标系，否则所有比较都无意义）

结论：参考截图是 **DPR=2 的 972×734 CSS 视口截图**（1944×1468 物理像素），我方用同视口同 DPR 复现，
两者可直接逐像素比对。

判据：

```bash
# 参考图尺寸 1944x1468；评论头像实测 40.0 CSS px（小红书固定 40），关注按钮高 40.0，
# 面板圆角切线 ≈18 CSS px —— 三处独立锚点同为整数 ⇒ CSS = 物理/2
python3 output/xhs-align/measure-anchors.py
python3 output/xhs-align/measure-text.py
```

（2026-10-22 实测）

| 项 | 参考（小红书） | 我方现状 | 差 |
| --- | --- | --- | --- |
| 视口 | 972×734 @2x | 972×734 @2x（复现用） | — |
| 面板 | 902.5 × 694，圆角 ≈18 | 924 × 686，圆角 28 | 我方宽 21.5、圆角大 10 |
| 面板外边距 | 左右 30 / 上下 23 | 四边 24 | 参考上下更紧、左右更松 |
| 面板填充 | **纯白 255** | 玻璃 0.84 → **234** | 差 21 级亮度 |
| 媒体列宽占比 | 51.4% | 49.9% | 我方窄 1.5pt |
| 信息列文本左缘 | 518.0（相对面板 488.0） | 521.7（相对面板 497.7） | 接近 |

---

## 3. 差距清单（按优先级）

> 每条格式：**现象 / 实测数据 / 判据**。「P0」= 用户一眼能看出，先做；「P1」= 密度与手感；「P2」= 打磨。

### P0-1 面板材质：玻璃 → 实白

- 现象：我方信息列底色是冷的灰白（浮在模糊背景上会透出），参考是纯白实底。
- 实测：同位置取样 —— 参考 `(255,255,255)`；我方 `(234,235,238)`。
- 判据：`python3 output/xhs-align/calibrate.py`（末段「面板填充」）
- 位置：`PostDetailModal.vue:126` `background: var(--liquid-bg-strong, rgba(255,255,255,0.84))`
- 注意：`backdrop-filter` 与 `--liquid-*` 是本仓既定材质体系（AGENTS.md「毛玻璃变量只有一个出口」）。
  **不要**直接删 token，做法见 §4.1。

### P0-2 媒体区：内衬 + 圆角 → 满出血

- 现象：参考的照片直接贴到面板左/上/下边缘（圆角只由面板裁切），我方照片四周有 17px 白边、自己再套 12px 圆角。
- 实测：参考媒体左缘 x=30.0 = 面板左缘；我方媒体左缘 x=41.0，面板左缘 x=24.0（内衬 17）。
- 判据：`python3 output/xhs-align/calibrate.py`（末段「媒体区」）
- **修法已做过对照实验**（2026-10-22）：注入 `detail-container{padding:0}` +
  `stage-wrap{border-radius:0;border:none}` 后重新量 —— 内衬 `17 → 1`、圆角 `12px → 0px`、描边 `1px → 0px`。
  残留的 1px 是面板自身 `border: 1px`。
  判据：`POST=0d33c7f6-47c0-4f70-9205-2fc5d0a4938e node output/xhs-align/verify-bleed.mjs`
- 位置：`modal-layout.css:26`（`padding: 16px`）、`modal-layout.css:84-95`（`border-radius:12px` + 底色 + 描边）

### P0-3 动作条形态：五件套 → 「胶囊 + 四图标」

- 现象：参考底部是 1 个占位胶囊（内置 24px 头像 + 「说点什么…」）+ 心形(223) / 星星(12) / 气泡(36) / 分享，
  **后三项只有图标没有数字**，且图标是 20px 描边线性、无文字标签；我方是「输入框 + 深色『发送』按钮 +
  三个『图标+数字』竖排」。
- 实测：参考图标到基线 `y 671.5..690`（高 18-19），数字与图标**同一行**（非上下堆叠）；
  我方 `.pd-action-btn` 是 `flex-direction: column`，数字在图标下方（`actionIcon` y=655.8 / `actionCount` y=675.8）。
- 判据：`python3 output/xhs-align/measure-anchors.py`（§5/§6）+ `node output/xhs-align/measure-at-972.mjs`
- 位置：`PostDetailMain.vue:2548-2635`（模板）、`modal-layout.css:397-446`（`.pd-action-btn` / `.pd-action-count`）

### P0-4 字号层级：参考更小更密

- 现象：参考整列字号比我们小一档，行距更紧，因此同样高度能多显示约 1.5 条评论。
- 实测（同尺寸逐元素墨高，比值 = 参考/我方）：

  | 元素 | 参考墨高 | 我方墨高 | 比值 | 我方字号 |
  | --- | --- | --- | --- | --- |
  | 作者名 | 14.5 | 16.0 | 0.91 | 16px/800 |
  | 标题 | 17.0 | 19.5 | **0.87** | 20px/500 |
  | 正文 | 14.5 | 16.5 | **0.88** | 17px/400 |
  | 共 N 条评论 | 12.5 | 11.5 | 1.09 | 13px/400 |
  | 评论名 | 13.5 | 13.5 | 1.00 | 14px/400 |
  | 评论时间 | 10.5 | 9.5 | 1.11 | 12px/400 |

- 判据：`python3 output/xhs-align/calibrate.py`
- 解读：**标题与正文偏大约 12%**（20→18、17→15），而「共 N 条评论 / 评论时间 / 评论名」已经不偏小、
  甚至偏小 —— 所以不能整体缩放，只能动标题与正文两档。
- ⚠️ 正文的真源是 `clamp(17px, 1.28vw, 19px)`，**在参考视口 972 下取的是下限 17px**，不是上限：

  | 视口 | 1.28vw | clamp 取值 |
  | --- | --- | --- |
  | 972 / 1024 / 1280 | 12.44 / 13.11 / 16.38 | **17px（下限）** |
  | 1440 | 18.43 | 18.43px |
  | 1600 / 1920 | 20.48 / 24.58 | **19px（上限）** |

  判据：`node -e "for (const w of [972,1024,1280,1440,1600,1920]) console.log(w, Math.max(17, Math.min(1.28*w/100, 19)))"`
  （2026-10-22 实测）
  ⇒ **只改 `clamp` 上限对 972 宽的横屏弹窗完全无效**，必须改下限（或给弹窗态一个固定值）。
- 位置：`modal-layout.css:252`（`.pd-title` 20px）、`style.scoped.css:721`（`.content-text` `clamp(17px,1.28vw,19px)`）

### P0-5 缺「收藏」这一动作

- 现象：参考动作条第二项是**星星 = 收藏**（12）；我方只有 点赞 / 评论 / 分享。
- 实测：`grep -rn "收藏\|favorite\|bookmark" src/` 在帖子详情域**零命中**；DB 侧也无 favorites/collections 表。
- 判据：`grep -rn "favorite\|bookmark\|收藏" src/views/PostDetail src/utils/api | wc -l` → `0`（2026-10-22 实测）
- 影响：这是**功能缺口不是样式缺口**，需要新表 + 新 API + 新 RLS。属于「改表结构 → 先跟人确认」，**不进本轮**。

### P1-6 评论区左缘与层级

- 现象：参考评论头像左缘 = 正文左缘（518.0，同标题），评论块与标题是**同一条左基线**；
  我方评论头像左缘 541.7，比标题（521.7）**内缩 20px** —— 因为 `.x-comments-section` 自带 `padding: 18px`
  （`CommentThread.vue:654`），叠加在信息列内边距之上。
- 实测：我方 `title.x=521.7`、`commentItem.x=539.7`（含自身 `padding:16px 2px` 的 2px）、`avatar.x=541.7`。
- **归因已做对照实验**（2026-10-22）：把 `.x-comments-section` 的 `padding` 注入成 `0` 后，
  `avatar.x` 由 541.7 → **523.7**（相对标题只差 2px，那 2px 来自 `.comment-item-x` 自身的 `padding: 0 2px`）。
  ⇒ 「内缩 20px」里 **18px 由 `.x-comments-section` 的 padding 贡献、2px 由评论项自身 padding 贡献**（这是实测归因，不是推断）。
  判据：`node output/xhs-align/verify-pad.mjs`
- 判据：`node output/xhs-align/measure-child2.mjs`
- 位置：`modal-layout.css` 需补一条让位规则（现有 `:270-285` 只清了背景/边框/内边距，**漏了 `.x-comments-section` 的 18px**）。
  `grep -n "x-comments-section" src/views/PostDetail/modal-layout.css` → 零命中（2026-10-22 实测），确认是漏项而非已覆盖。

### P1-7 评论操作行：文字标签 → 图标 + 数字

- 现象：参考评论动作是「♡ 6 / 💬 3」纯图标+数字；我方是「♡ 赞 / ↩ 回复」，带文字，且 14px 间距。
- 实测：参考两组各宽 **23.5**（`570.5..593.5` / `608.0..631.0`，组间距 14.5），每组 = 图标 + 数字；
  我方「点赞」单组宽 **30.5**（图标 + 文字「赞」+ 数字），且第二组是「↩ 回复」而非「💬 3」。
- 判据：`python3 output/xhs-align/measure-anchors.py`（§评论操作行）+ `node output/xhs-align/measure-child2.mjs`（`cLike.w`）
- 位置：`CommentThread.vue:339-375`、`CommentThread.vue:1386-1430`

### P1-8 楼中楼：缩进方式与「展开」链接

- 现象：参考子回复是**头像列整体右移一级**（头像 24px 落在 x=570，与父评论文字列同基线），
  并带一条独立的「展开 2 条回复」文字链接（灰 `#555`，非蓝色）；
  我方子回复头像 32px、缩进由 grid 自然形成，展开链接是蓝色 `#2563eb`。
- 实测：参考子头像 24.0 CSS px；我方 32px。参考展开链接最暗像素 `(85,85,85)` = `#555555`。
- 判据：`python3 output/xhs-align/measure-anchors.py`（§评论 #2）
- 位置：`CommentThread.vue:1451-1489`（`.child-reply-item` 32px）、`.child-expand-link` 颜色 `#2563eb`

### P1-9 元信息行：地点与时间同色同重，且带「…」菜单

- 现象：参考的「2天前 广东」是**一整行浅灰**（`#b9b9b9`），右侧有一个 `…` 更多菜单（与评论的 `…` 对齐）；
  我方是「时间 + 📍地点」两个 span，颜色 `rgb(104,115,134)`，且没有 `…`。
- 实测：参考元信息行最暗 `(185,185,185)`；其 `…` 位于 x 893..904.5，与评论 `…` 同一列。
- 判据：`python3 output/xhs-align/measure-text.py`
- 位置：`PostDetailMain.vue:2387-2390`（时间/地点 span）、`3198`（`.post-location-tag`）
- 说明：`…` 菜单我方已有（`post-menu-trigger`，在作者行右侧），**只是位置不同**——参考把它挪到元信息行右端。
  这一项属于「可选」，因为把菜单从作者行挪走会改变现有交互路径。

### P2-10 作者行：字号与关注按钮形态

- 现象：参考作者名是**常规字重**、无 `@` 前缀；关注按钮是**描边红胶囊**（红字红边、白底、高 40 / 宽 96）。
  我方作者名 16px/800 且有 `@` 前缀并带等级金色；关注按钮是**实心黑**（`rgb(29,29,31)`）。
- 实测：参考关注按钮描边 1px（`x=813` 单像素过渡，主色 `(220,49,77)`）、按钮 **96×40**；我方 **65×40.7** 实心。
  ⚠️ 参考作者名的**精确字号未实测**：墨高 14.5 与我方 16px 的墨高 16.0 相比比值 0.91，
  按比例**外推**约 14.5px（这是外推、不是实测 —— 截图上无法直接读出 font-size）。
  可以确定的是「比我们小一档」「字重明显更轻」这两条定性结论。
- 判据：`python3 output/xhs-align/measure-text.py`；`node output/xhs-align/measure-at-972.mjs`
- 位置：`modal-layout.css:224-250`（`.pd-follow-btn`）

### P2-11 媒体浮层：计数器 / 箭头 / 指示点

- 现象：
  - 参考右上角有 **`9/9` 计数器胶囊**（半透明深底 + 白字）——我方**没有**；
  - 参考左右箭头是**半透明深色圆**（`rgba(0,0,0,.35)` 级）+ 白色细箭头，我方是**白色玻璃圆 + 灰色字符 `‹ ›`**；
  - 参考指示点是 **9 个白点、直径 6、间距 12，无胶囊背景**，我方是「白胶囊里 4 个灰点」。
- 实测：参考点直径 6.0、中心间距 12.0（实测 9 组：`426.5,450.5,…,618.5`）；我方点 6.9、含胶囊底。
- 判据：`python3 output/xhs-align/measure-anchors.py`（§4）
- 位置：`modal-layout.css:122-187`（箭头与点）、`PostDetailMain.vue:2281-2353`（媒体区模板，需新增计数器）

### P2-12 分隔线与留白

- 现象：参考有**两条**通栏 hairline：①作者行下 → 正文上之间没有，**正文/元信息之后**有一条（y=249，从 518 到 934.5）；
  ②动作条上方一条（y=644，通栏）。
  我方第一条 hairline 画在「共 N 条评论」上（`border-top` 在 `.pd-comments-head`），位置与参考差 20px。
- 实测：参考 hairline y=249.0 起于 x=518.0（**与文本左缘对齐**，不是通栏）；动作条 hairline 通栏。
- 判据：`python3 output/xhs-align/measure-ref2.py`
- 位置：`modal-layout.css:260`（`.pd-comments-head` 的 `border-top`）

### P2-13 面板外边距与圆角

- 现象：参考面板 902.5×694、圆角 ≈18、上下留 23 / 左右留 30；我方 924×686、圆角 28、四边 24。
- 实测：圆角切线拟合 —— 参考 `dy=0→x=914.5`、`dy=16→x=932.0`（≈18）；我方 `border-radius: 28px`。
- 判据：`python3 output/xhs-align/measure-anchors.py`（§9）
- 位置：`PostDetailModal.vue:121-122`（`min(1120px, 100vw-48px)` / `min(880px, 100vh-48px)`）、`:125` 圆角

---

## 4. 对齐方案（分三阶段，每阶段可独立验证）

> ⚠️ **动手前必读（2026-10-22 反证实测踩到的坑）**：
> `modal-layout.css` 是由 `<style scoped>` 里的 `@import` 引入的（`PostDetailMain.vue:3192-3194`）。
> 因此凡是**指向子组件内部类名**的选择器（`.x-comments-section` / `.comment-item-x` / `.child-reply-item`
> 都来自 `CommentThread.vue`），不加 `:deep()` 会被 scoped 编译成 `.xxx[data-v-父]` 而**永不匹配**，
> 表现是「样式写了、页面没变、也不报错」。
> 实测反证：第一版补丁直接写 `.post-detail-page--modal .x-comments-section{padding:0}`，
> 探针仍是 `评论头像内缩 20px` / `子回复头像 32px`；改成
> `.post-detail-page--modal .pd-comment-thread :deep(.x-comments-section)` 后两个断言立刻转 PASS。
> 注意 `modal-layout.css` 里**已有** `:deep()` 的使用（`:277`、`:281`），照它们写即可。

### 4.1 阶段 A —— 材质与媒体（P0-1、P0-2、P2-13）

1. **面板改实白**，但保留材质 token 的存在：
   在 `modal-layout.css` 里给 `.post-detail-page--modal .pd-modal-info` 及其祖先铺实底，
   由 `PostDetailModal.vue` 的 `.pd-modal-panel` 提供 `background: var(--pd-modal-surface, #fff)`，
   并**同时**删掉该面板的 `backdrop-filter`（否则白底下继续跑模糊是纯性能浪费）。
   暗色主题下把 `--pd-modal-surface` 指向暗色 token（不要写第二份裸色值，`check:dark-tokens:strict` 会拦）。
2. **媒体满出血**：`.detail-container` 在弹窗态把 `padding: 16px` 改为 `padding: 0`，
   只给信息列单独留内衬（`padding: 0 20px`）；`.pd-media-stage-wrap` 去 `border-radius` 与 `border`，
   改由 `.pd-modal-panel` 的 `overflow: hidden` 裁切。

> ⚠️ 已知坑：`modal-layout.css:27` 那条注释记录过「`margin: 0 auto` 在 flex 容器里会吸收剩余空间，
> 导致无图帖内容挤在中间」。改 `padding` 时**不要**顺手把 `margin: 0` 改回 `auto`。

### 4.2 阶段 B —— 动作条与字号（P0-3、P0-4、P1-7、P1-9）

3. **动作条改为「胶囊 + 四图标」**：
   - `.pd-action-btn` 由 `flex-direction: column` 改 `row`，`gap: 6px`，数字紧随图标（仅点赞项保留数字，
     评论/分享只留图标 + `aria-label`）；
   - 删掉 `.pd-reply-send` 在本形态下的可见性（回车发送），或保留但改为胶囊内的箭头按钮；
   - 输入胶囊左侧加 24px 当前用户头像（参考实测 24.0 CSS px），置于 `padding-left` 内。
4. **字号收两档**：`.pd-title` 20→18px；正文改弹窗态固定值
   （`clamp` 的**下限** 17→15，或在 `.post-detail-page--modal` 下直接 `font-size: 15px` ——
   注意只改上限对 972 视口无效，理由见 P0-4 的表）；
   评论名 14→13px、评论时间 12→11.5px（对应上表比值 0.91~1.11 的反向修正）。
   ⚠️ `.content-text` 是**整页模式共用**的类（`style.scoped.css:721`），必须用
   `.post-detail-page--modal .content-text` 的弹窗前缀覆盖，**不要**改基类。
5. **元信息行**：时间与地点合并为一行、统一 `#b9b9b9`、去「📍」emoji。

### 4.3 阶段 C —— 评论区（P1-6、P1-8、P2-11、P2-12）

6. 补一条 `.post-detail-page--modal .x-comments-section { padding: 0 }`（现在漏了这条，
   评论因此比标题内缩 20px）。
7. 子回复头像 32→24px，缩进改为与父评论文字列同基线；`.child-expand-link` 颜色 `#2563eb`→`#555`。
8. 媒体区新增 `9/9` 计数器胶囊；箭头改深色半透明圆 + 白箭头；指示点去胶囊底、直径 6 / 间距 12。
9. hairline 调整：`.pd-comments-head` 的 `border-top` 保留（它语义上是「评论区分隔」），
   但把它从「距文本左缘 20px」对齐到文本左缘；动作条上 hairline 维持通栏。

---

## 5. 明确不跟的三件事（产品差异，不是缺陷）

| 小红书做法 | BOH 现状 | 不跟的理由 |
| --- | --- | --- |
| 收藏（星星）作为一等动作 | 无收藏功能 | 需要新表 + RLS + API，属「改表结构先确认」；且收藏在 BOH 的积分/权益体系里没有定义 |
| 作者名无 `@`、无等级色 | `@用户名` + 等级金/彩虹 | 等级体系是 BOH 核心，属**有意差异** |
| 每次点帖都开弹窗；`Esc`/点遮罩关 | 已有（`usePostDetailModal`） | 一致，无需动 |
| 话题（#扫街）可点击跳转 | 无话题体系 | 功能缺口，非样式缺口 |

---

## 6. 验收判据（改完必须能跑出来的数）

**已固化成探针**：`scripts/probes/probe-post-detail-modal-xhs.mjs`（度量器，8 项）
- 默认模式永远 exit 0，只打「现值 / 目标 / 是否达标」；
- `--assert` 模式未达标即 exit 1（供分批实施后验收）。

结论：**改动前基线 0/8，改动后（对照实验）8/8**。
判据：`node scripts/probes/probe-post-detail-modal-xhs.mjs`（2026-10-22 实测）

反证已做（2026-10-22）：把 §4.1/§4.2/§4.3 的 8 处改动全部注入 → 8/8 PASS；`git checkout` 还原 → 回到 0/8。
⇒ 探针有牙，不是「永远红」或「永远绿」。

| 断言 | 阈值 | 探针字段 |
| --- | --- | --- |
| 面板填充为纯白 | `rgb(255,255,255)` | `panelBg` |
| 媒体左/上/下贴面板边 | 差 ≤ 1px | `mediaInset` |
| 媒体无自身圆角 | `0px` | `mediaRadius` |
| 动作条图标与数字同行 | 中心差 ≤ 6px | `iconCountDeltaY` |
| 标题 18px / 正文 15px | 精确值 | `titleFont` / `bodyFont` |
| 评论头像左缘 = 标题左缘 | 差 ≤ 2px | `commentAvatarIndent` |
| 子回复头像 24px | ±1px | `childAvatarWidth` |

⚠️ 该探针**只读 DOM 计算值、不截图**，因此它证明「度量到位」，**不证明「看起来一样」**；
像素级验收仍须人眼过对照图（`output/xhs-align/compare-full.png` 的生成方式见 §3 判据）。
从 `output/` 迁出到 `scripts/probes/` 的原因：`output/` 在 `.gitignore:48`，放那里等于判据不可重跑。

---

## 7. 必跑门禁

改完后（按 AGENTS.md §2）：

```bash
npm run verify:fast                 # 本轮只动 CSS + 少量模板
node scripts/probes/probe-reply-autogrow.mjs   # 动了 .pd-reply-input 的高度契约，必须跑
node scripts/probes/probe-post-detail-fix.mjs  # 动了媒体区，多图轮播回归
node scripts/probes/probe-forum-viewport.mjs   # 动了弹窗分流判据相关几何
npm run check:dark-tokens:strict    # 新增暗色 token 必须走 token 块
npm run check:important-budget      # 别用 !important 抢特异性
```

⚠️ 已知高度契约：`.pd-reply-input` 的 `max-height: 132px` 是 `useAutoGrowTextarea` 的**唯一真源**
（`modal-layout.css:320-322` 有完整注释），阶段 B 改动作条时**不许**在 JS 里写第二份像素值。

---

## 8. 风险与依赖

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `.content-text` 同时被整页模式使用 | 改基类会波及竖屏详情 | 只用 `.post-detail-page--modal` 前缀覆盖 |
| 面板去 `backdrop-filter` | 与全站液态玻璃材质语言不一致 | 保留 token 出口，仅在弹窗这一个消费者上退回实底（本仓已有先例：Cloud+ 玻璃在暗色下退回实色） |
| 动作条删「发送」按钮 | 触屏用户失去显式提交入口 | 保留按钮但降级为胶囊内小箭头，或保留回车 + 长按 |
| 缺「收藏」被当成 bug 报上来 | 反复澄清 | 本文 §5 已写明是**功能缺口**，需单独立项 |
