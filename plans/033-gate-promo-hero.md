# 033 · 首屏宣传画（宣传期互斥 + 随时切回默认首屏）

> 目标：首屏开场画支持「宣传图 + 大标题 + 按钮」，**宣传期内只有宣传画**（不泄漏默认图），
> 宣传结束可随时切回现在的默认首屏（红苹果 + 时段问候），**不需要发版**。
>
> 提出：2026-10-22（承接 2026-10-20 的调研与方案定稿，见 §0.2）
> 状态：**仅方案，未改任何源码。** 本文数字均为实测，判据见各节「判据」行。
> 用户已拍板四点：① 宣传期互斥；② 图挂了降级为红苹果 + **保留宣传文案**；③ 数据落 `home_heroes`（A 方案）；④ 文案为大字体标题、需要按钮；⑤ 首屏缓存 TTL 24h。

---

## 0. 背景

### 0.1 现在是什么样

首屏是「满屏开场画 → 跟手揭开 → 论坛」，三层结构：

| 层 | 元素 | 性质 |
| --- | --- | --- |
| 浮层 | `.home-gate`（fixed / z 1300） | 一次性，卸载后 DOM 里就没有了 |
| 桌面 | `.home-forum-stage` | 常驻，只做 `scale` 归位 |
| 外围 | 横屏左栏 / 竖屏底栏 | 左栏 `opacity` 吃 `--forum-p` |

进度真源 `--gate-p`（0~1）绑在 `.home` 的 inline style 上，`--forum-p` 由它派生；时长唯一真源是
`useGatePull.js` 的 `GATE_TIMINGS`；视觉全部由 CSS 从变量派生，**手势绑在 gate 元素上而不是 window**（防监听泄漏锁死全站）。

**当前线上首屏是「品牌兜底」形态**（白底 + 红苹果 logo + 「晚上好，欢迎回到方块街」+「往下逛逛↓」）：

- 结论：DB 里 `template='street-scene'` 的行 **0 条**，`image_portrait` / `image_landscape` 全 NULL
- 判据：`node output/…`（已删的临时脚本）或在浏览器里 `fetch` `home_heroes` 后过滤 `template==='street-scene'`
- 实测日期：2026-10-22

线上已发布未归档的行只有 6 条：`showcase`、`overlay`、`builtin/birthday`、`builtin/block-wall`、
`builtin/anniversary-8`、`builtin/split-brand-letter`。

### 0.2 与 2026-10-20 旧方案的关系

旧方案（`.workbuddy/memory/2026-10-20.md`，提交 `085deebc` / `b0287c13` / `fda9ebb0`）的解析优先级是：

```
published gate-promo > street-scene > 品牌兜底
```

这是**降级链**。本文**推翻其中的「新增 gate-promo 模板」与「优先级链」两部分**，理由：

1. 用户口径是**互斥**，不是「宣传优先、失败退回街景」——降级链允许默认图在宣传期出现；
2. 新增模板要改 `home_heroes_template_check` + 合并 partial unique index（表结构变更），
   而「宣传期 ↔ 默认期」本质是**同一条行换形态**，复用现成的单例约束天然互斥。

**保留旧方案中正确的部分**：重播标记机制（`boh-home-gate-passed-content`、哨兵 `'brand'`、缺失记录保守不重播）。

---

## 1. 实测：四条会泄漏默认图的路径

宣传期要求「只有宣传图」，所以任何「宣传行还在、画面却退回默认」的路径都是缺陷。
以下四条均为实测（2026-10-22），判据为 Playwright 脚本按 §1 表格逐条注入场景后读 DOM。

| # | 触发条件 | 实测结果 | 归属 |
| --- | --- | --- | --- |
| **L1** | 宣传图 404 | `on-brand:true` + `brandLogo:true` + `greeting:"全年最大活动"` —— 红苹果 + **宣传文案** | **内容级**，符合用户口径，✅ 保留 |
| **L2** | 只传竖屏图，横屏访问（844×390） | 同上（`hasImg:false` / `brandLogo:true`） | **内容级**，✅ 保留 |
| **L3** | 远端返回 **500** | `cacheStillThere:false`、`cacheRows:null` → 回退基线 → 宣传行**连文案一起消失** | **数据级**，❌ 必须修 |
| **L4** | 无缓存首访 | 首帧（t≈250ms）`onBrand:true` + 默认问候；t≈1.6s 整块换成宣传画 | **时序级**，❌ 部分修 |

### 1.1 L3 的成因（读码确认）

`homeHeroes.ts` 的远端失败分支在「有缓存但缓存超过 1h」时会 `clearCache()` 并整体回退
`HOME_HERO_BASELINE`：

```js
// src/stores/homeHeroes.ts:387 附近
if (hasPublishedCache && !hasPublishedRemoteData &&
    Date.now() - cachedPublishedAt > STALE_CACHE_FALLBACK_MS) {
  clearCache();
  hasPublishedCache = false;
  publishedHeroes.value = HOME_HERO_BASELINE;   // ← 宣传行在这一步被丢掉
}
```

注意区分：**网络中断（abort）反而保留了缓存**（实测 aborted 6 次请求后宣传画仍在），
只有**服务端返回错误码**才会清缓存。宣传期最可能的故障恰好是后者。

### 1.2 L4 的成因与残余

首屏是否播放是**同步**判定的（`gateAlreadyPassed = readGatePassed()`，读 localStorage），
而首屏内容是 `onMounted` 里 `await fetchPublished()` 才有的。两者不同步 ⇒ 无缓存首访必然先看到兜底。

**残余（不修，接受）**：真正的首次访问（localStorage 里连海报缓存都没有）仍会看到红苹果约 1–2s。
想彻底消除只能让 `.home-gate` 等数据就绪再渲染，而那时 `boh-boot` 骨架已经被 Vue 挂载替换掉，
等待期是**空白**，比红苹果更糟。缓解手段写进 §5.4（运维预热）。

---

## 2. 设计

### 2.1 三种形态与互斥

首屏解析结果**只有一个**，不留第三态：

| 形态 | 条件 | 画面 | 文案 |
| --- | --- | --- | --- |
| **默认图** | `home_heroes` 里**没有**已发布未归档的 `street-scene` 行 | 白底 + 红苹果 logo | 时段问候（`{greeting}，欢迎回到方块街`）+「往下逛逛↓」 |
| **街景** | 有行，图正常，`title` 为空 | 街景照片 | 同上（现状形态，零改动） |
| **宣传** | 有行，`title` 非空 | 宣传照片（或降级为红苹果底） | **大标题 = `title`**、副标题 = `subtitle`、按钮 = `links`、底部提示 = `hint_text` |

**互斥由 DB 不变量保证**：现有 partial unique index `home_heroes_street_scene_singleton`
（`where template='street-scene' and status='published' and is_archived=false`）
保证同一时刻**至多一条**首屏行 ⇒ 不可能出现「宣传行与街景行同时存在」。

**切换语义（这就是「随时切回」）**：

| 从 → 到 | 操作 | 生效范围 |
| --- | --- | --- |
| 默认 → 宣传 | 新建/编辑 `street-scene` 行，填 `title` + 图 + 按钮，**发布** | 全员（含已过闸用户，见 §2.6） |
| 宣传 → 默认 | 把该行**归档** | 全员 |
| 宣传 A → 宣传 B | 编辑同一条行后重新发布 | 全员（`published_at` 变 ⇒ 身份串变） |

全部走 Hero Console 的发布/归档，**零发版**。

### 2.2 数据落点：复用 `street-scene` 行，零迁移

**结论：不新增模板、不新增列、不写迁移。**

`home_heroes` 现有列已经够用（`docs/db-schema-snapshot.json`，26 列）：

| 列 | 宣传形态的用途 | 现状 |
| --- | --- | --- |
| `title` | 大标题 | 已有，NOT NULL（存 `''` 合法） |
| `subtitle` | 副标题 | 已有，nullable |
| `links` | 按钮（`text` / `type` / `to` / `href`） | 已有 jsonb，`normalizeLinks` 已白名单过滤 |
| `hint_text` | 底部提示（下拉诱导） | 已有，street-scene 专用 |
| `greeting_text` | 街景形态的问候语 | 已有，**宣传形态不用**（改用 `title`） |
| `image_portrait` / `image_landscape` | 双构图 | 已有 |
| `published_at` | 重播身份串的一部分 | 已有 |

为什么优于「新增模板」：

- 新增模板要改 CHECK 白名单（`2026092203_home_heroes_street_scene.sql`）+ 合并单例索引 ⇒ 表结构变更；
- 新增模板会让「首屏」这个概念在消费方多一次 `template === 'x' || template === 'y'` 的散落判断，
  正是 AGENTS「改一处要动四处」点名的缺陷形态。

**形态判据 = `title.trim()` 非空**。风险与缓解：

- 风险：Console「+ 新建」时 `title` 默认是 `'未命名英雄区'`（非空）⇒ 新建 street-scene 行会直接进宣传形态。
- 缓解（§3 清单 A3）：模板切到 `street-scene` 时**把 `title` 默认清空**，并在表单里显示一行提示
  「主标题留空 = 街景形态；填写 = 宣传形态」。形态是可见的（预览实时反映），不存在静默错态。

### 2.3 首屏专用缓存（修 L3 / L4）

**结论：给首屏内容单独一份缓存 `boh-home-gate-v1`，与海报流缓存解耦。**

现状是首屏内容和官方海报流**共用** `boh_home_heroes_v3`，所以海报的 stale 清理会连带清掉首屏。

| 事项 | 设计 |
| --- | --- |
| key | `boh-home-gate-v1`（与 `boh_home_heroes_v3` 完全独立） |
| 内容 | 只存**首屏那一行**（`{ id, template, title, subtitle, links, hint_text, greeting_text, image_portrait, image_landscape, published_at, status }`） |
| 写入 | 远端成功后，从**同一份响应**里挑出首屏行写入（不发起第二次请求） |
| 读取 | **同步**读，`setup` 阶段就能拿到（与 `readGatePassed()` 同性质） |
| TTL | **24h**（用户拍板） |
| 清理 | ① 管理员改动后 `clearCache()` 时**两处都清**；② **远端失败分支只清 `boh_home_heroes_v3`，不动 `boh-home-gate-v1`** |
| 无行时 | 写入哨兵 `null`，表示「确认无首屏行」，与「没缓存」区分开（重播机制要用，见 §2.6） |

**模块边界（避免 TDZ）**：`useHomeHeroesStore()` 在 `Home/index.vue:442` 调用，
而 `useGatePull()` 在 `:179` —— `useGatePull` 不能直接依赖 store。所以缓存读写收进独立模块：

```
src/views/Home/gate-content.js        ← 只做「同步读 / 写 / 清」+ 形态判定，零 Vue 依赖
  ├─ readGateContent()                → { row } | { row: null } | null（null = 没缓存）
  ├─ writeGateContent(rowOrNull)
  ├─ clearGateContent()
  ├─ resolveGateForm(row)             → 'promo' | 'street' | 'brand'
  └─ gateContentId(row)               → `${id}:${published_at}` | 'brand'
```

`useHomeHeroesStore`（写）与 `useGatePull`（读）都从它引，**调用顺序无关**。

### 2.4 降级矩阵（这是「宣传期只有宣传图」的判定表）

| 情形 | 画面 | 文案与按钮 | 是否符合口径 |
| --- | --- | --- | --- |
| 有行，宣传图正常 | 宣传照片 | 大标题 + 副标题 + 按钮 | ✅ |
| 有行，宣传图 404 | **红苹果**（`on-brand`） | 大标题 + 副标题 + 按钮（文字翻黑） | ✅ 用户指定 |
| 有行，本方向没图（横屏缺 landscape） | **红苹果** | 同上 | ✅ |
| 有行，远端 500 | 缓存兜底 ⇒ 宣传照片 | 大标题 + 按钮 | ✅（§2.3 修复后） |
| 有行，远端失败且**无**首屏缓存 | **红苹果** | 大标题 + 按钮（缓存在 `boh-home-gate-v1` 里读不到时，回落到 store 现状） | ⚠️ 见 §6 待确认 |
| 无行 | 红苹果 | 默认问候 + 「往下逛逛」 | ✅ 这就是「默认图」 |

关键：**只要行存在，就永远走 `promo` 或 `street` 形态，不会掉回「默认问候」。**
默认问候只属于「没有行」这一支。

### 2.5 宣传形态的视觉与交互

**版式（竖屏 390×844 为基准，横屏继承 `StreetSceneHero` 现有断点）**：

```
┌─────────────────────────┐
│  [导航岛]                │
│                         │
│  大标题                  │  ← clamp(34px, 9vw, 52px) / 700 / line-height 1.14
│  副标题                  │  ← clamp(15px, 4vw, 18px) / 字重 500 / 行高 1.5
│  ┌─────────┐ ┌────────┐ │  ← 按钮组：主按钮实心 / 次按钮描边
│  │  主按钮  │ │ 次按钮  │ │
│  └─────────┘ └────────┘ │
│                         │
│                         │
│      往下逛逛 ↓          │  ← 底部提示，沿用现有节点与呼吸箭头
└─────────────────────────┘
```

- 标题**左上对齐**、与现有问候同锚点（避免宣传形态看起来像「换了张图」）；横屏 `max-width: min(52%, 24ch)` 沿用现有规则。
- 标题支持 `<br>`：走 `DOMPurify.sanitize(…, { ALLOWED_TAGS:['br','b','strong','em','i','span'] })`，
  **与 `DynamicHomeHero.sanitizedTitle` 同口径**（`src/views/Home/components/DynamicHomeHero.vue:163`），不新造一套、不用裸 `v-html`。
- 按钮**最多 2 个**（多了在竖屏挤成两行）；超出部分不渲染。

**交互（这里有三个必须处理的坑）**：

1. **`.street-hero-content` 是 `pointer-events: none`**（`StreetSceneHero.vue:292`）。
   按钮容器必须单独 `pointer-events: auto`，否则点了没反应。**只给按钮容器开，不给整层开** ——
   整层开会让下拉手势的落点被 content 吃掉。
2. **点击 = 先 `commitGate()` 再导航**。顺序不能反：gate 是 fixed 覆盖层，直接 push 路由会让
   浮层盖在新页面上。`commitGate()` 内部已经做了 `scrollTo(0)` + 滚动锁 + 补间，直接调用即可。
3. **点击不能同时被当成下拉手势**。tap 在 gate 上会触发 `touchstart` / `touchend`（无 move ⇒
   `travel = 0` ⇒ `releaseGate()` 判回弹）。回弹补间与「按我的进度走」会打架，
   所以按钮的 `@click` 里要先 `event.stopPropagation()`，并在 `commitGate` 前确保
   `pullProgress` 已归零（`settleGateBack()` 是 460ms 补间，会与提交补间抢同一个 `rafTween`）。

**按钮跳转只支持 `to`（内部路由）与 `href`（外链）。
不支持 `modal:*`** —— 那三类弹窗的宿主是 `OfficialHeroStage`（`handleDynamicLinkClick`，`:487`），
gate 层拿不到。Console 侧要在选择「街景/首屏」模板时**禁用**这三个 option，避免配了不生效。

### 2.6 重播机制（沿用 10-20 定稿）

**新 key `boh-home-gate-passed-content`**（复用 `boh-home-gate-passed` 前缀 + 同款 `:buildId` 后缀）：

| 事项 | 设计 |
| --- | --- |
| 为什么必须新 key | 现有 `boh-home-gate-passed` 存的是**裸时间戳**，`readGatePassed()` 走 `Number(raw)`。写 JSON 进去会变 `NaN` ⇒ 每个请求都重播 ⇒ 11 个预写裸时间戳的探针全红 |
| 前缀复用 | `ProfileSettingsPanel.replayHomeGate`（`:412`）按 `startsWith('boh-home-gate-passed')` 清除，新 key **零改动**被覆盖 |
| 身份串 | `${hero.id}:${hero.published_at || ''}`；无行时哨兵 `'brand'`（**必须非空**：`brand → street` 首配场景下 `recorded=''` 是 falsy，会误判「无记录」而漏重播） |
| 缺失记录 | **保守不重播**（老用户 / 首次上线 / 隐私模式）。理由：约 10 个探针预写裸时间戳 key，若「缺记录就重播」它们会全红；且新构建本身换指纹必重播 |
| 判定时机 | 只在 `setup` 做一次，且必须在 `gateDismissed` 等状态播种**之前**（`useGatePull.js:113`） |
| 写入时机 | 随 `markGatePassed()` 一并写身份串 |
| 会话中途远端到达 | **不**中途拉人回闸，下次进站生效 |

`useGatePull` 增加可选参数 `options.getContentId`（不传 = 机制关闭），`UserSpace` 等他处复用零影响。

### 2.7 首帧正确性（一处必须讲清的顺序约束）

首屏内容要走**同步缓存**，才能和无缓存首访区分开、做到「首帧就是宣传画」。但同步读有个隐含约束：

- `readGateContent()` 必须在 `gateDismissed` 播种**之前**完成（`useGatePull.js:113`），
  否则会出现「先按 `gateAlreadyPassed` 渲染出 gate、再被身份串判定改掉」的一帧抖动。
- 而 `useHomeHeroesStore()` 在 `Home/index.vue:442` 调用，`useGatePull()` 在 `:179` ——
  **`useGatePull` 不能依赖 store**（TDZ）。
- 因此 `gate-content.js` **零 Vue 依赖、只用 localStorage**，`useGatePull` 与 store 各自从它引。
  这是 §2.3 那条模块边界存在的**真正原因**，不是为了好看。

验证判据：J1 断言必须在 `waitForSelector('.home-gate')` 之后**立刻**采样（不给 `waitForTimeout`），
否则「首帧正确」这件事测不出来。

---

## 3. 施工清单

按依赖顺序排列。**A 组可独立先做（修存量 bug），B 组才是新功能。**

### A 组 · 修存量问题（不依赖新功能，单独可交付）

| # | 文件 | 改动 |
| --- | --- | --- |
| A1 | `src/stores/homeHeroes.ts` | 在 store 里切一刀：保留 `publishedHeroes`（原始），新增两个 getter —— `gateHero`（首屏行）与 `posterHeroes`（剔除首屏行）。**用同一处谓词**，不在消费方各写一遍 |
| A2 | `src/views/Home/components/OfficialHeroStage.vue:442` | `visibleHeroes` 改用 `posterHeroes`（再滤 birthday）。**修掉现存空行**：实测 `street-scene` 行在此渲染成 `children:0 / height:0` |
| A3 | `src/views/HeroConsole/index.vue:1598` | `officialOrder` 改用同一谓词，让「官方堆叠预览」与线上一致 |
| A4 | `src/views/HeroConsole/index.vue:1544` 附近 | 模板切到 `street-scene` 时把 `title` 默认清空；表单加提示「主标题留空 = 街景形态 / 填写 = 宣传形态」 |
| A5 | `src/views/HeroConsole/index.vue:2193` | 保存 payload：`title` / `subtitle` / `links` **已经是无条件落库**（`:2186` / `:2188` / `:2194`），street-scene 模板下无需额外门控。只需确认「切走 street-scene 模板时」这三个字段不被清空即可 —— 现状本来就不清，**无需改动，仅需单测锁住** |
| A6 | `src/views/HeroConsole/index.vue:1147` | 「按钮配置」区的 `v-if="!isBuiltin && !isStreetScene"` 放开 `street-scene`，并禁用 `modal:*` 三个 option |

> **A6 需要改的只有按钮区一处。** 实测确认：`title` / `subtitle` 的编辑区在 `:363` 的 `form-grid`（条件仅 `!isBuiltin`）里，**street-scene 下本来就可编辑**；
> 被 `!isStreetScene` 挡住的只有三处 —— `:439` 标题文字位置、`:535` 快捷填充、`:1147` 按钮配置。前者与快捷填充本轮不做（见 Q3），只放开按钮配置。

### B 组 · 首屏专用缓存（修 L3 / L4）

| # | 文件 | 改动 |
| --- | --- | --- |
| B1 | `src/views/Home/gate-content.js`（新建） | §2.3 的五个导出函数 + TTL 24h + 隐私模式 try/catch |
| B2 | `src/stores/homeHeroes.ts:376` 附近 | 远端成功后同步 `writeGateContent(gateRow \|\| null)` |
| B3 | `src/stores/homeHeroes.ts:387` 附近 | **stale 分支只清海报缓存**，加注释说明「首屏缓存不受海报 stale 影响」 |
| B4 | `src/stores/homeHeroes.ts` 的 `clearCache()` 调用点 | 管理员改动路径**两处都清**（`saveHero` / `publishHero` / `deleteHero` / `rollbackHero` 等） |
| B5 | `src/views/Home/index.vue:445` | `streetSceneHero` 改为：优先用 store 的 `gateHero`，无则用 `readGateContent()` 的同步值（首帧就能拿到） |

### C 组 · 宣传形态渲染

| # | 文件 | 改动 |
| --- | --- | --- |
| C1 | `src/views/Home/components/StreetSceneHero.vue` | 新增 `form` prop（`'promo' \| 'street' \| 'brand'`）。`promo` 时渲染：大标题（DOMPurify 白名单，同 `DynamicHomeHero:163`）、副标题、按钮组；底部提示沿用既有 `.street-hero-hint` |
| C2 | 同上（`<style scoped>`） | 宣传形态的标题/副标题/按钮样式 + `on-brand` 下的深色变体。**不新增 `!important`**（棘轮）；裸色值一律走 token 或 `on-brand` 内已有的 `#17130e` / `#52483c` |
| C3 | 同上 | 按钮容器 `pointer-events: auto`（**只此一处**）；按钮 `@click.stop`；点击后 `commitGate()` 再导航 |
| C4 | 同上 | `prefers-reduced-motion` 段补：宣传形态的按钮不做位移入场 |
| C5 | `src/views/Home/index.vue` | `:form="gateForm"` 传下去；`@gate-link` 事件接到 `commitGate()` + `router.push` / `window.open` |

### D 组 · 重播标记

| # | 文件 | 改动 |
| --- | --- | --- |
| D1 | `src/views/Home/composables/useGatePull.js` | 加 `options.getContentId`（可选，不传 = 关闭）；新增 `CONTENT_STORAGE_KEY` 与身份串比对。**判定必须在 `:113` 状态播种之前** |
| D2 | 同上 `commitGate()` | `markGatePassed()` 时一并写身份串 |
| D3 | `src/views/Home/index.vue` | 把 `gateContentId` 传给 `useGatePull({ getContentId })` |
| D4 | `src/views/user-center/UserSpace/components/ProfileSettingsPanel.vue:412` | **零改动**（前缀匹配自动覆盖），需在实测里确认 |

### E 组 · 文档

| # | 文件 | 改动 |
| --- | --- | --- |
| E1 | `docs/PROBES.md` | 更新 `probe-home-gate-pull` 断言数（§5.1） |
| E2 | `AGENTS.md:67` | `（50）` → 实际断言数。**注意字节棘轮**：AGENTS.md 现 47966B / 基线 47970B，只剩 4B 余量 ⇒ 必须同批删掉等量内容，或走 `check:doc-truth:update` 并在 commit message 交代 |
| E3 | `docs/未完成任务清单.md` | 登记本方案与遗留项（§6） |

---

## 4. 探针与单测

### 4.1 扩展 `probe-home-gate-pull.mjs`（不新建文件）

沿用 10-20 定稿的做法：**扩展既有探针**，避免 `check:doc-truth` 的探针计数对账连锁（`scripts/probes/` 现 203 个）。

**注入手法用缓存注入**（`addInitScript` 预写 `boh_home_heroes_v3` + `boh-home-gate-v1` 带宣传行），
不用远程 stub —— 与现有 `openHome({ skipGate })` 的写法一致（`:60`）。

新增断言组（预计 +8 条，54 → 62）：

| 编号 | 断言 | 反证方式 |
| --- | --- | --- |
| J1 | 宣传行 + 图正常 ⇒ 首帧就是宣传照片，`.street-hero-brand` **不存在** | 把 `form` 恒设为 `'street'` ⇒ 红 |
| J2 | 宣传形态有**大标题**且字号 ≥ 34px（`getComputedStyle.fontSize`） | 改用问候样式 ⇒ 红 |
| J3 | 宣传形态**没有**默认问候文案（`.street-hero-greeting` 不存在或为空） | 回落到 street 分支 ⇒ 红 |
| J4 | 宣传形态有按钮，数量 = `links.length`（上限 2） | 删按钮渲染 ⇒ 红 |
| J5 | 按钮容器 `pointer-events` 为 `auto`（父层仍是 `none`） | 删那条规则 ⇒ 红 |
| J6 | 点按钮 ⇒ gate 退场**且**路由已变（`commitGate` 先于导航） | 反序 ⇒ 红 |
| J7 | **图 404 ⇒ `on-brand` 成立 + 大标题仍在**（宣传文案不丢） | 让失败分支退回 `brand` 形态 ⇒ 红 |
| J8 | 远端 500 + 有首屏缓存 ⇒ 宣传照片仍显示（**L3 回归守卫**） | 去掉 B3 的隔离 ⇒ 红 |

### 4.2 单测（进 CI）

| 文件 | 覆盖 |
| --- | --- |
| `tests/unit/gate-content.test.js`（新建） | `resolveGateForm` 三态判定、`gateContentId` 哨兵非空、TTL 24h 边界、隐私模式不抛 |
| `tests/unit/home-heroes-baseline.test.js` | 补：`posterHeroes` 剔除首屏行；`gateHero` 只取一条 |
| `tests/unit/home-heroes-partial-save-regression.test.js` | 补：`street-scene` 的 `title/subtitle/links` 落库不被门控清空 |

### 4.3 受影响但**不需要改**的既有探针（需实测确认）

| 探针 | 为什么可能受影响 | 处置 |
| --- | --- | --- |
| `probe-street-scene-copy.mjs`（9/9） | 读 `.street-hero-greeting` / `.street-hero-hint-text`；宣传形态下问候不存在 | **实测确认**：该探针场景里 `title` 为空 ⇒ 走 street 形态 ⇒ 应仍 9/9 |
| `probe-street-scene-brand.mjs`（20 条） | 读 `on-brand` 与 brand 层 | 应无影响（同样是 street 形态） |
| `probe-home-forum-rail.mjs` / `probe-rail-landing.mjs` | 左栏吃 `--forum-p` | 应无影响，跑一遍兜底 |

---

## 5. 门禁与账（施工前必须先清，否则会连撞两次）

### 5.1 断言数已漂移

两个数字对不上，改探针前先对齐口径：

| 探针 | AGENTS.md / PROBES.md | 实测 | 判据 |
| --- | --- | --- | --- |
| `probe-home-gate-pull.mjs` | 50 | **54** | `grep -c "check(" scripts/probes/probe-home-gate-pull.mjs`（2026-10-22） |

同批核实（这三个是本次的**不回归基线**，实测日期 2026-10-22）：

| 探针 | 实测 | 判据 |
| --- | --- | --- |
| `probe-street-scene-copy.mjs` | 9/9 | `node scripts/probes/probe-street-scene-copy.mjs` |
| `probe-street-scene-brand.mjs` | 20/20 | `node scripts/probes/probe-street-scene-brand.mjs` |
| `probe-home-forum-rail.mjs` | 21/21 | `node scripts/probes/probe-home-forum-rail.mjs` |
| `probe-rail-landing.mjs` | 45/45 | `node scripts/probes/probe-rail-landing.mjs` |

### 5.2 `probe-gate-marker-reduce.mjs` 已经是半坏的（4/8）

```
✗ B1 reduce 下 gate 退场仍播放（非瞬跳）  —— anim=null dur=nullms
✗ B2 reduce 下 gate 退场动画时长 300ms    —— nullms
✗ B3 reduce 下论坛层淡入仍播放            —— anim=null
✗ B4 reduce 下底栏存在且有入场动画        —— anim=null
```

- 判据：`node scripts/probes/probe-gate-marker-reduce.mjs "http://[::1]:5173"` ⇒ **4/8**（2026-10-22 实测）
- 成因：B 组断言的 `homeGateExitReduced` / `homeForumStageInReduced` 属于 2026-09-24 的实现，
  2026-09-27 改成进度派生后**整段删掉**了（`grep -rn homeGateExitReduced src` ⇒ 0 命中）
- 为什么没人发现：它不在 AGENTS 门禁表里，只登记在 `docs/PROBES.md:93`

**处置（施工第 0 步）**：要么把 B 组改写成「进度派生 + `GATE_TIMINGS.reduced`」口径，要么退役 B 组只保 A 组（标记机制）。
**不许在假基线上加新断言。**

### 5.3 必跑清单（本次改动命中）

```bash
npm run verify                                  # 12 道 check + lint + type-check + test
node scripts/probes/probe-home-gate-pull.mjs    # 本次主要守卫（54 → 62）
node scripts/probes/probe-street-scene-copy.mjs # 9/9
node scripts/probes/probe-street-scene-brand.mjs
node scripts/probes/probe-home-forum-rail.mjs   # 21
node scripts/probes/probe-rail-landing.mjs      # 45
npm run check:doc-truth                         # 改了 AGENTS 必跑
npm run gate:plan                               # 改动 → 该跑什么
```

改门禁逻辑才需要 `npm run check:gates-self-test`（本次不改门禁脚本，不跑）。

### 5.4 运维侧（写进交付说明，不是代码）

- **宣传期开始前，用真实手机访问一次线上首页**，把 `boh-home-gate-v1` 缓存热起来 —— 这是 L4 残余的唯一缓解手段。
- **宣传期结束后必须归档那行**，否则宣传画会继续播。归档后缓存 24h 内可能仍显示旧宣传（`boh-home-gate-v1` TTL 内），
  可接受；若要求立即生效，让管理员发布后提示「用户下次访问可能延迟至多 24h」。

---

## 6. 待确认 / 未验证项

| # | 项 | 说明 |
| --- | --- | --- |
| Q1 | 「有行 + 远端失败 + 首屏缓存也没有」 | 此时只能回落到 store 现状（可能是基线）。是否需要「宁可显示红苹果 + 空标题」也不显示默认问候？**当前设计是回落到 store 值**，若 store 也是基线 ⇒ 会出现「默认问候」。这是唯一残留的泄漏点，概率极低（需同时满足：无首屏缓存 + 远端错误 + 海报缓存也失效） |
| Q2 | 按钮在 `on-brand`（红苹果底）下的配色 | 建议沿用现有 `on-brand` 的暖黑 `#17130e` / `#52483c`，但按钮需要实心主色——用 `--boh-brand` 还是纯黑？**视觉待定**，实现后用截图确认 |
| Q3 | 宣传形态的标题是否也支持 `content_layout`（偏移/对齐） | 本轮**不做**（现 `street-scene` 也没有该编辑区，`:439` 的 `content-layout-section` 被 `!isStreetScene` 排除） |
| Q4 | 暗色主题下的宣传形态 | 首屏是满屏照片/白底，`.home-gate` 本身不参与暗色 token。**本轮不处理**，需要在交付时说明 |

---

## 7. 验收判据（可重跑）

全部绿才算完成：

```bash
# 1. 主守卫（含 J1–J8）
node scripts/probes/probe-home-gate-pull.mjs          # 期望 62/62

# 2. 既有首屏探针不回归
node scripts/probes/probe-street-scene-copy.mjs       # 期望 9/9
node scripts/probes/probe-street-scene-brand.mjs      # 期望 20/20

# 3. 左栏不回归
node scripts/probes/probe-home-forum-rail.mjs         # 期望 21/21
node scripts/probes/probe-rail-landing.mjs            # 期望 45/45

# 4. 门禁
npm run verify
npm run check:doc-truth
```

**人工确认（无法自动化）**：

1. 竖屏 390×844 与横屏 844×390 各截一张宣传形态图，人眼确认字号层级与按钮可点；
2. Hero Console 里走一遍「默认 → 宣传 → 默认」的完整切换；
3. 图 404 时的红苹果 + 宣传文案形态截图。

---

## 8. 与旧方案（2026-10-20）的差异对照

| 项 | 旧方案 | 本方案 | 理由 |
| --- | --- | --- | --- |
| 数据落点 | 新增 `gate-promo` 模板 | 复用 `street-scene` + `title` 判形态 | 免迁移；单例约束天然互斥 |
| 解析 | 优先级链 `gate-promo > street-scene > brand` | 三形态互斥（§2.1） | 用户口径是互斥，链会泄漏默认图 |
| 首屏缓存 | 未提 | 独立 `boh-home-gate-v1`（24h） | 修 L3/L4 |
| 官方分区空行 | 未提 | A1–A3 一处谓词修掉 | 实测存在的存量 bug |
| 重播标记 | `boh-home-gate-passed-content` + 哨兵 `'brand'` | **原样保留** | 设计已正确 |
| 探针 | 扩展 `probe-home-gate-pull`（缓存注入） | 同，54 → 62 | 避免探针计数连锁 |
| CTA | `links` + `normalizeLinks` | 同，但**禁用 `modal:*`**；`@click.stop` + 先 `commitGate` | gate 层拿不到弹窗宿主 |
