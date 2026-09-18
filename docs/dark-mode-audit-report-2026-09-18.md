# BOHLITE 暗色模式调研报告 + Dark 2.0 优化方案

- 调研日期：2026-09-18
- 调研范围：`src/styles/themes/`、`src/styles/common/`、`src/views/**`、`src/components/**`、`index.html`、`dark-audit-results.json`（2026-09-08 全站 50 页实测）
- 统计口径：自研 brace-depth 扫描器 `scripts/dark-token-scan.mjs`（278 个 `.css/.scss/.vue` 文件，注释剥离后按花括号深度判定"是否处于暗色规则块内"）
- 配色计算：`scripts/dark-palette-calc.mjs`（OKLCH → sRGB 转换 + WCAG 2.1 相对亮度/对比度，本文所有对比度均为脚本实测值）
- 计数口径说明：字面量总数会随仓库并发提交小幅漂移（本文取值时点 2026-09-18 21:40，2,794 / 279 文件），故正文以 ≈2,800 表述；结构性结论不受影响
- Demo：`docs/dark-mode-demo.html`（零构建、零侵入，双击即可打开）

---

## 0. 结论摘要

暗色模式**不是"没做"，而是"做了 90 个局部补丁、没做 1 个全局系统"**。

| # | 事实 | 数据 |
|---|---|---|
| 1 | 暗色样式基本不用 token，全是裸写色值 | 暗色规则块内 **≈2,800 个颜色字面量**（本次扫描 2,794），分布在 **90 个文件**；`themes/*.css` 内 961 个字面量 vs 94 次 `var()` → **token 化率约 9%** |
| 2 | 深色"面板色"严重碎片化 | 暗色块中出现 **301 个不同 hex**；亮度 ≤28% 的"暗表面"有 **52 个不同取值**（各用 ≥2 次） |
| 3 | 中性灰缺失统一梯度 | 同一族近黑写法 12 个：`#0a0a0f #0b0b10 #0c0c0e #0d0d0f #0d0d12 #0d0e12 #0d0f14 #0e1322 #0f0f16 #10131a #12121a #16161e`；`#1a1a24` 与 `#1a1a25` 只差 1 个 hex 位、分属两个文件 |
| 4 | 品牌蓝在暗色下有 8 个并行值 | `#0071e3`×60、`#60a5fa`×25、`#007aff`×24、`#3b82f6`×21、`#2997ff`×8、`#409cff`×5、`#62b0ff`×4、`#0a84ff`×3 |
| 5 | 暗色可读性未达标 | 2026-09-08 全站 50 页实测：**29 条 severe / 115 条 warn**。severe 均为"黑字压黑底/白字压白底"，最低 1.00:1（完全不可见） |
| 6 | 暗色下仍有浅色底残留 | 144 条实测问题行中 **77 行（53%）的背景色是浅色**（`#ffffff`×21、`#fdfdfd`×11、`#f5f5f7`×11、`#dddddd`×4…），即暗色模式下的"白块" |
| 7 | 用 `!important` 对抗优先级 | 暗色声明里 **413 处 `!important`**；`themes/` 目录合计 360 处（`forum-dark.css` 106、`post-detail-dark.css` 82） |
| 8 | 三套并行暗色机制 | `data-theme`（2,143 处/85 文件）、`data-boh-theme`（87 处/5 文件）、`.dark-mode`（20 处/1 文件）、`@media (prefers-color-scheme: dark)`（11 文件）；另有 12 个组件在自身根元素再绑一次 `:data-theme` |
| 9 | 页面覆盖 9 / 27 | 有专属暗色主题的页面根 9 个；**18 个 view 目录零暗色覆盖**，其中 11 个是用户可访问路由 |
| 10 | 原生控件未适配 | 全局**没有** `color-scheme: dark`；唯一显式声明是 `src/views/Login/index.vue:1356` 的 `color-scheme: light`（暗色下反向）；`accent-color` 全站 14 处均为浅色模式色且无暗色分支 |

**一句话诊断：** token 层（`themes/dark-mode.css` + `common/tokens.css`）设计意图是对的，但它被 90 个文件的裸字面量绕过、被 413 处 `!important` 抢答、被三套互不相识的挂载机制稀释。因此**任何一次调色目前都需要改约 2,800 处**，这是暗色长期无法收敛的根因，而不是"再补几个页面"能解决的。

---

## 1. 机制层现状（挂载与加载）

### 1.1 开关链路

唯一真源 `src/utils/theme-manager.js`（单例，无 Pinia store、无 composable）：

- `:89-90` 同时写 `documentElement[data-theme]` 与 `html.dark`
- `:93-117` 再把 `data-theme` 复制粘贴到 **13 个具名容器白名单**（`.forum-page`、`.user-space-page`、`#unified-nav-container`、`.bohai-page` …）
- `:10` `VALID_THEMES = ['light','dark','system','home-cat','anniversary-mc']`；`:51-78` 支持跟随系统并挂/摘监听
- 持久化 `localStorage['boh-theme']`；`:254-264` 联动 `meta[name=theme-color]`
- FOUC 兜底：`index.html:13-27` 内联脚本（`.workbuddy/memory/2026-09-14.md:283` 记录了它修掉的 41ms 白闪）

**结构性风险（实测确认，非推测）：**

1. `VALID_THEMES` 在 `index.html:15` 与 `theme-manager.js:10` **重复定义**，靠 `scripts/check-first-paint.mjs:162-174` 断言同步。
2. 暗色 CSS 走运行时懒加载 `src/utils/theme-css-loader.js:28` 的 `Promise.allSettled(8 个 import())` —— **8 个文件之间的注入顺序不确定**。同优先级冲突（例如 `src/style.css:225` 的 `.dark` 与 `dark-mode.css:71` 的 `[data-theme="dark"]`，特异性同为 0,1,0）由**加载运气**决定，而非设计意图。
3. 依赖容器白名单的页面，一旦类名重命名即静默失去暗色；不在白名单的页面只能靠 `html` 后代继承。
4. **第二套失控机制**：`src/views/DataManagement/DataAdmin.vue:2839-2855` 直接操作 `documentElement` 并另存 `dm-theme`，完全绕开 themeManager。
5. **确定性 bug**：`src/views/DataManagement/styles/base.css:164-165` 用 `@media (prefers-color-scheme: dark)` + `.data-management-page:not([data-theme="light"])`，但 `.data-management-page` 不在 `theme-manager.js` 白名单里 → `:not()` 永不命中 → **后台在用户显式选浅色时仍跟随系统变暗**。
6. `theme-css-loader.js` 与 `.workbuddy/memory/2026-09-08.md:125` 互相印证：探针若不用 `addInitScript` 预置 `boh-theme=dark`，8 个暗色 CSS 不加载 → 全盘误报。这说明**暗色的正确性无法在默认渲染路径上被验证**。

### 1.2 Tailwind 暗色变体处于"接了但没通电"状态

- Tailwind 4 经 `@tailwindcss/vite`（`vite.config.js:8,111`）接入，`src/style.css:1` `@import "tailwindcss"`
- 全库**没有** `@custom-variant dark`、没有 `darkMode` 配置 → 默认 `dark:` 变体仍然只认媒体查询、不认 `data-theme`
- 结果：`.vue` 模板里 **`dark:` 工具类用量 = 0**。全站暗色是 100% 手写 `[data-theme="dark"]` CSS，等于放弃了框架提供的收敛机制
- `src/style.css:225-253` 有一段 shadcn 的 `.dark { --background: oklch(...) }`，写在 `@layer base` 内且用 `--background` 而非 `--color-*`，实际**喂给了 0 个组件**，是纯死代码

---

## 2. 配色层现状（碎片化量化）

### 2.1 至少 11 套互不兼容的暗色表面 palettes

| 族 | 锚点值 | 出处 |
|---|---|---|
| A `--boh-*` 紫黑 | `#0a0a0f → #12121a → #1a1a25 → #222230` | `themes/dark-mode.css:41-44` |
| B shadcn 同步蓝灰 | `--background:#0d1117`、`--card:#1b2430`、`--muted:#202b38`、`--accent:#29405a` | `themes/dark-mode.css:71-86` |
| C 液态玻璃 | `rgba(28,28,36,.72)`、`rgba(40,40,52,.84)`、降级实色 `#1e1e2a`/`#252532` | `common/tokens.css:95-99,131-132` |
| D 论坛 | `#0d0d12` 画布 + `#2a2a3a`/`#353545` 控件 | `themes/forum-dark.css:12,203,208` |
| E 个人空间 | `#0d0d12` + `--surface:#1a1a24`、`--surface-soft:#252532` | `themes/user-space-dark.css:11-13` |
| F 商店 | `--canvas:#0d0d0f`、`--surface:#1c1c1e` | `views/Shop/style.scoped.css:1325-1326` |
| G BOHAI 中性灰 | `#212121 #2f2f2f #303030 #3a3a3a #171717` | `themes/bohai-dark.css:7-10,59,267-271` |
| H BOHAI 蓝调（后补） | `#141a22 #1b2430 #202b38 #29405a` | `themes/bohai-dark.css:705-708` |
| I Tailwind oklch 纯中性 | `oklch(0.145 0 0)` | `src/style.css:225-253` |
| J 消息中心 | `#3a3a4a #4a4a5a #303044` | `themes/messages-dark.css:157,162,416` |
| K Newsroom | `#0c0c0e`、`#1c2430→#232c3a→#2a3444` | `views/Newsroom/style.scoped.css:634,677` |

**三个色相族在互相打架**：紫调（H≈240）、蓝调（H≈212-225）、纯中性（H=0）。切换页面时底色色温漂移，这就是"暗色看着脏"的物理原因。

`themes/bohai-dark.css:701-702` 的注释写着 *"without introducing a second palette"*，而 `:705-709` 恰好在**同名 token 上覆盖了第二套色值**（`--bohai-panel` 在同一个文件里被定义 3 次：`#2f2f2f` → `#171717` → `#1b2430`）。注释与事实相反，是最典型的腐化信号。

### 2.2 token 语义被反向污染

- `themes/dark-mode.css:88` `--apple-bg-white: #1b2430` —— 名为 white 的 token 装着暗蓝灰
- `common/tokens.css:91` 亮色 `--liquid-text-tertiary: #8b9098` vs `:113` 暗色 `#8a919c` —— **暗色覆写在亮度上几乎无效**（差 0.5 个 L 单位），是假覆写
- `themes/dark-mode.css:239` `.nav-label #7a7a8a` —— `2026-09-14.md:204` 记录它是"刻意保持零变化迁移"的值，但它实测 3.72–4.68:1，**是全站底栏在暗色下的长期低对比来源**
- `style-remnant-audit.json → tokenStats`：`--boh-*` 有 **9 个定义了但从未使用**（含 `--boh-brand-blue`、`--boh-text-tertiary`、`--boh-divider`、`--boh-shadow-sm/md`），另有 **4 个只被消费、从未定义**（`--boh-drawer-muted/-surface-hover/-text`、`--boh-visual-height`）→ 静默解析为空
- 命名空间至少 7 套并行：`--boh-*`、shadcn 裸名、`--liquid-*`、`--apple-*`、`--bohai-*`、页面私有 `--surface/--ink/--canvas/--line/--text-*`、`--hero-*`

### 2.3 alpha 梯度手写化

暗色块内 `rgba(` 出现 **1,299 次**；仅 `rgba(255,255,255,α)` 一族就手写完了 `0.05/0.06/0.07/0.08/0.09/0.10/0.12/0.13/0.14/0.15/0.16/0.18/0.2` 十三档。这正是 `--boh-glass-border` 本该抽象掉的东西。

### 2.4 覆盖缺口

- **18 个 view 目录零暗色**：`AboutUs`、`Join`、`Gift`、`MBTI`、`History`、`Birthday`、`BlockWall`、`CharacterBook`、`AnniversaryCafe`、`BOH8YearsEvent`、`BOH8YearsJourney`、`SmartOverview` + 6 个 `/admin/*`
- 用户可路由页里最伤的：`Home` 首页画布 `views/Home/style.scoped.css:14` `background-color:#f5f5f7` **在全库没有任何暗色对应规则**（`.home` 的 scoped 文件里 `data-theme` 出现 0 次），首屏直接是一块浅灰
- `views/Forum/styles/anniversary.css` 9 条浅色背景声明、0 条暗色规则 —— 在"已被暗色覆盖的页面"内部整文件漏网

### 2.5 最高杠杆的一类 bug：token 已存在但组件不用它

`views/Shop/style.scoped.css:1319-1328` 已经**正确**重定义了暗色局部 token：

```css
html[data-theme="dark"] .shop-page {
  --surface: #1c1c1e;  --canvas: #0d0d0f;  --ink: #f5f5f7;  /* … */
}
```

但 `.product-card:320` 直接写 `background: rgba(255,255,255,0.6)`、`:338` hover 写 `rgba(255,255,255,0.88)`，同样绕过 `--surface` 的还有 `:115 .shop-search`、`:421 .service-strip`、`:480 .category-tabs button`、`:622 .shop-bottom-nav`、`:762 .product-sheet`、`:888 .bag-drawer`、`:988 .contact-sheet`。

> 这不是"缺暗色规则"，而是"组件不消费自己页面已定义的暗色 token"。**修法是把字面量替换成同一文件里已有的 `var()`，零设计决策、零风险** —— Shop 也正是实测 severe 最多（7 条）的页面，性价比最高。

### 2.6 图片/资源零适配

- 全库 `filter: invert` **0 次**；`public/` 与 `src/assets/` 下**没有任何** dark/night 变体资源
- 整个暗色层只有 **1 条** `<img>` 相关规则：`themes/messages-dark.css:73-76`，且只加了个边框，没有任何亮度补偿
- 白底 PNG/WebP 直接压在暗画布上无处理：`assets/home-hero/brand-logo.webp`、`assets/images/qrcode.webp`、`main1-1280.webp` 等
- `views/user-center/UserSpace/styles/shell-community.css:741` `.image-post-thumb-shell{background:#eef}`、`:793 .is-failed{background:#f8fafc}` —— 用户图片信箱式留白在暗色下变成两块刺白 slab（实测 `#f8fafc` 类浅底命中多起）

---

## 3. 运行时实测证据

来源 `dark-audit-results.json`（`generatedAt: 2026-09-08T14:00:32Z`，50 页，`darkActive: true`）。

### 3.1 全局底色实际只有一个

49/50 页 `bodyBg = rgb(10,10,15)`，即 `--boh-bg-primary: #0a0a0f` 事实上是全站画布。碎片化**不发生在 body，而发生在元素层** —— 所以只看 body 的自检会给出"暗色没问题"的假阳性结论。

### 3.2 severe Top（全部为完全不可读）

| 页面 | 元素 | 前景 on 背景 | 对比度 | 文案 |
|---|---|---|---|---|
| `/login` | h1 | `#ffffff` on `#ffffff` | **1.00** | 方块之家 |
| `/ai-chat` | span | `#111111` on `#12121a` | **1.01** | BOH |
| `/ai-chat` | small | `#111111` on `#0e1322` | **1.02** | 欢迎回来 |
| `/lotteries` | `.pi-label` | `#1d1d1f` on `#131923` | **1.05** | 保底 |
| `/forum`、`/user-space*` | span | `#1d1d1f` on `#21222c` | **1.06** | 日常 |
| `/us-ai` | span | `#111111` on `#1a1a24` | **1.09** | BOH |
| `/forum`、`/user-space*` | `.ai-label` | `#b8c2cf` on `#cecfd0` | **1.15** | BOHAI |
| `/shop` | h2 | `#f5f5f7` on `#dddddd` | **1.25** | 把方块之家的温度，带回家。 |
| `/__dev/motion` | strong | `#1d2938` on `#131923` | **1.20** | 已完成 |
| `/about` | span | `#d7d7dc` on `#ffffff` | **1.43** | 块 |
| `/health` | `.hk-chip` | `#1a7f37` on `#375841` | **1.58** | 健康 |
| `/admin/alert-style-editor` | 状态字 | `#34c759`/`#ff9500` on `#fdfdfd` | **2.16–2.18** | ✅/⚠️ |
| `/shop` | 多元素 | `#f5f5f7`/`#0071e3` on `#9e9e9f` | **1.76–2.45** | BOH BAG Air / 80 积分 |

按页统计 severe：`shop 7` · `admin-alert 4` · `ai-chat 3` · `forum 2` · `login 2` · `user-space 2` · `us-posts 2` · `us-ai 2` · `motion-lab 2`。

### 3.3 静态测算的"注定不达标"文字色

| 色值 | 暗色块内用量 | 在 8 个实测暗表面上的对比度区间 | 判定 |
|---|---|---|---|
| `#71717a` | 23 | **3.13 – 4.09** | 8 个表面全部 fail AA |
| `#6e6e73` | 4 | **2.98 – 3.89** | 全部 fail |
| `#737373` | 1 | **3.19 – 4.17** | 全部 fail |
| `#777777` | 1 | **3.38 – 4.41** | 全部 fail |
| `#7a7a8a`（`.nav-label`） | 1 | **3.58 – 4.68** | 7/8 fail |
| `#6f7b8b`（`--boh-text-muted`） | 1 | **3.51 – 4.59** | 7/8 fail |
| `#52525b` | 1 | **1.96 – 2.56** | 严重（滚动条 hover） |

**23 个不同的" muted 灰"**并存：`#6e6e73 #71717a #737373 #777 #7a7a8a #86868b #8a919c #8b8b9a #8b8e96 #8b9098 #8d8d93 #8d99a8 #8e8e93 #8f8f8f #98989d #999 #9b9b9b #a1a1a6 #a1a1aa #a7afba #b4b4b4 #b8c2cf #aab6c4`。
运行时高频低对比前景色 top4：`#86868b`×33、`#0071e3`×21、`#6e6e73`×16、`#7a7a8a`×10 —— 与静态测算完全吻合。

### 3.4 token 层的文档注释也不可信

`common/tokens.css:110` 声称三级文字"在暗玻璃(~#1c1c24)上的对比度分别约 15:1 / 6.4:1 / 4.6:1，均达 WCAG AA"。脚本实测：`#8a919c` on `#1c1c24` = **5.33:1**（数值被低估，尚可），但换到同文件 `:132` 自己声明的 `#252532` 上只有 **4.76:1**，换到 `--liquid-bg-strong` 实际合成色上更低。**注释把结论钉死在单个表面上，而全站有 52 个暗表面。**

---

## 4. 根因归纳

| 根因 | 表现 | 为什么它会持续制造问题 |
|---|---|---|
| **R1 无"禁止裸色"门禁** | ≈2,800 个字面量 | 项目已有 `check-liquid-glass.mjs`、`check-important-budget.mjs`、`check-first-paint.mjs` 三道门禁，唯独暗色没有。新代码只能沿袭"复制旁边那行的写法" |
| **R2 挂载机制三套并行 + 容器白名单** | 3 套属性 + 12 处自绑 + 1 处旁路 | 组件作者无法预判该用哪个选择器，于是各自发明；白名单漏一个页面就整页无暗色 |
| **R3 加载顺序不确定** | `Promise.allSettled` 注入 8 个 CSS | 同特异性冲突靠运气，线上偶发"某天开始某块颜色不对"，且无法在 PR 里复现 |
| **R4 深浅两侧不对称** | 亮色走 `--liquid-*`/`--boh-*`，暗色走字面量 | 暗色永远在追赶亮色的新增组件，缺口单调增长（9/27 页覆盖即为其结果） |
| **R5 把暗色当"反转"而非"重设层级"** | `box-shadow: rgba(0,0,0,.5)`、纯白 `#ffffff` 文字、白底图片直用 | 暗底上黑阴影几乎不可见 → 层级丢失 → 只能靠 `!important` 叠边框；纯白文字产生光晕（halation）；图片亮度未经校准导致"页面很暗但图很刺眼" |
| **R6 无自动化验证** | 审计只在 2026-09-08 手工跑过一次 | 29 severe 无人认领，一周后即可回归 |

---

## 5. 全新方案：BOHLITE Dark 2.0

### 5.1 八条设计原则

1. **一个中性色相族**。全站暗表面收敛到 **单一色相 H=264**（OKLCH），彻底消灭"紫/蓝/中性"三族漂移。
2. **层级靠明度，不靠阴影**。暗底上黑色阴影近乎无效，因此深度 = 表面明度台阶 + 1px 顶高光（`inset 0 1px 0 rgba(255,255,255,.06)`）。阴影只保留"接触感"，不承担层级语义。
3. **明度台阶等距且刻意放大顶段**。5 级表面 OKLCH L 分别为 .165/.207/.248/.292/.340（Δ≈.042/.041/.044/.048），顶部递增以补偿 Weber 律，视觉上才"每级都一样明显"。
4. **文字用实色，不用半透明白**。半透明白在多层的暗面板上会因底下表面不同而漂移出多个对比度；实色使**每一对 fg/bg 对比度可被静态计算并锁死**。
5. **暗色下重设品牌色，不是复用亮色**。亮色 Apple 蓝 `#0071e3` 在暗色 ramp 上只有 2.51–4.11:1，**5 个表面全部 fail**；而它在暗色块里被裸写了 60 次。
6. **强调色填充时用暗墨，不用白字**。`#ffffff` on `#4fadf3` = **2.44:1（fail）**，`#08111c` on `#4fadf3` = **7.77:1**。这是暗色最容易被忽略的一条。
7. **状态用叠加层，不用新色值**。hover/selected/pressed 一律 `rgba(255,255,255,α)` 三档，替掉 `#2a2a3a→#353545→…` 这种"每个状态发明一个 hex"的模式。
8. **图片是内容不是 UI**。用暗色 scrim（`rgba(11,14,20,.28)`）压住白底图与信箱留白；亮度补偿只作用于装饰性资产（`brightness(.92)`），**绝不对用户照片做 `invert`**。

### 5.2 Token 表（每个值都带实测对比度）

**表面 /  elevation（5 级 + 玻璃 3 档）**

| Token | 值 | 用途 | vs canvas |
|---|---|---|---|
| `--d2-canvas` | `#0b0e14` | 页面画布 | 1.00 |
| `--d2-surface-1` | `#14181f` | 卡片、面板 | 1.09 |
| `--d2-surface-2` | `#1d2129` | 嵌套层、输入框 | 1.20 |
| `--d2-surface-3` | `#272c36` | 浮层、菜单 | 1.38 |
| `--d2-surface-4` | `#323843` | 模态外壳、按下态、滚动条 | 1.64 |
| `--d2-glass-1` | `rgba(20,24,31,.72)` | 玻璃导航 | 合成 → `#11151c` |
| `--d2-glass-2` | `rgba(29,33,41,.80)` | 玻璃卡片 | 合成 → `#191d25` |
| `--d2-glass-3` | `rgba(50,56,67,.92)` | 玻璃模态 | 合成 → `#2f353f` |
| `--d2-scrim` | `rgba(4,6,9,.72)` | 遮罩 | 合成 → `#06080c` |

> 玻璃不再自带一套 `#1e1e2a/#252532/rgba(28,28,36)`，而是**同一表面梯度的 alpha 视图** —— C 族与 A/D/E 族的冲突从定义上消失。

**文字（4 级，全部实色）**

| Token | 值 | on canvas | on s-1 | on s-2 | on s-3 | on s-4 |
|---|---|---|---|---|---|---|
| `--d2-text-1` | `#eef0f4` | 16.93 | 15.60 | 14.14 | 12.27 | 10.33 |
| `--d2-text-2` | `#c0c5ce` | 11.15 | 10.27 | 9.31 | 8.08 | 6.80 |
| `--d2-text-3` | `#9aa0ad` | 7.36 | 6.78 | 6.15 | 5.34 | **4.49** |
| `--d2-text-4` | `#818895` | 5.42 | 4.99 | **4.52** | 3.93 | 3.30 |

- `text-1..3` 在**全部 5 个表面上都 ≥4.5**（AA 正文）。
- `text-4` 是**受限 token**：仅允许出现在 canvas/surface-1/surface-2 且 ≥18px/≥14px bold（大号文本 3:1 门槛），用于占位符与禁用态。使用规则写进 lint，而不是写进注释。
- `text-1` 取 `#eef0f4`（L≈95.5%）而非 `#ffffff`：**消除纯白光晕**。当前 `#ffffff` 在暗色块里被用了 96 次、`#f5f5f7` 131 次，且同时被当作文字色和表面色使用（语义重载）。

**强调与语义（9 色，均可作为正文文字通过 AA）**

| Token | 值 | min（on s-4） | 备注 |
|---|---|---|---|
| `--d2-brand` | `#4fadf3` | 4.83 | 替代暗色下全部 8 个蓝 |
| `--d2-brand-soft` | `#aad1f2` | 7.36 | 品牌底上的文字、渐变端 |
| `--d2-link` | `#61c1f8` | 5.89 | |
| `--d2-success` | `#52cd86` | 5.85 | |
| `--d2-warning` | `#e8b53b` | 6.23 | |
| `--d2-danger` | `#f84f57` | **3.51** | **只用于填充/图标**，不作文字 |
| `--d2-danger-soft` | `#f79f9f` | 5.84 | 错误**文字**用这个 |
| `--d2-info` | `#5bb8e6` | 5.30 | |
| `--d2-violet` | `#b790f7` | 4.68 | 装饰/渐变专用 |
| `--d2-on-accent` | `#08111c` | — | 强调色填充按钮上的文字（**不是白色**） |

现有 5 个蓝在暗色 ramp 上的实测（跨 5 表面，`min` 取最差）：

| 候选 | `#0b0e14` | `#14181f` | `#1d2129` | `#272c36` | `#323843` | 判定 |
|---|---|---|---|---|---|---|
| `#0071e3`（现用 60 次） | 4.11 | 3.79 | 3.43 | 2.98 | 2.51 | 全 fail |
| `#3b82f6`（`dark-mode.css:55`） | 5.25 | 4.84 | 4.39 | 3.81 | 3.20 | 后 3 级 fail |
| `#007aff` | 4.81 | 4.43 | 4.02 | 3.49 | 2.93 | 后 4 级 fail |
| `#2997ff`（Apple 暗色蓝） | 6.41 | 5.90 | 5.35 | 4.64 | 3.91 | 顶级 fail |
| `#60a5fa` | 7.60 | 7.00 | 6.34 | 5.51 | 4.63 | 全 pass |
| **`#4fadf3`（提案）** | 7.91 | 7.29 | 6.61 | 5.74 | 4.83 | **全 pass，且保留 Apple 蓝观感** |

**描边 / 状态层（各 3 档，替代约 400 处手写 alpha）**

| Token | 值 | 合成后 vs s-1 |
|---|---|---|
| `--d2-line-1` | `rgba(255,255,255,.07)` | 1.20（分隔线） |
| `--d2-line-2` | `rgba(255,255,255,.12)` | 1.42（卡片边框） |
| `--d2-line-3` | `rgba(255,255,255,.19)` | 1.82（输入框边框） |
| `--d2-state-hover` | `rgba(255,255,255,.055)` | 1.16 |
| `--d2-state-selected` | `rgba(255,255,255,.09)` | 1.29 |
| `--d2-state-pressed` | `rgba(255,255,255,.14)` | 1.51 |

**语义 tint（一次 `color-mix` 生成，替代手写 rgba）**

| 组合 | 实测 |
|---|---|
| `--d2-brand` 14% on s-1 → `#1c2d3d`，品牌文字在其上 | 5.77 |
| `--d2-success` 14% → `#1d312d` | 6.82 |
| `--d2-warning` 14% → `#322e23` | 7.16 |
| `--d2-danger` 15% → `#362027` | 4.49 |
| `--d2-text-1` 在各 tint 上 | 11.87 – 13.22 |

**热力图 5 档（`--boh-heat-*` 现有暗色值保留但收敛到同色相）**：`rgba(255,255,255,.07) → #145246 → #1d8a70 → #26b894 → #4fd8b3`，0 档必须"浮"在 surface-1 之上。

### 5.3 配套机制改造（比调色更值钱）

| 措施 | 做法 | 收益 |
|---|---|---|
| **M1 全局 `color-scheme`** | `[data-theme="dark"]{color-scheme:dark}`，并删掉 `views/Login/index.vue:1356` 的 `color-scheme:light` | 原生滚动条 / 表单控件 / `input[type=date]` / 自动填充黄底 一次性交给浏览器正确渲染；可**删掉** `themes/dark-mode.css:104-120` 的 webkit 滚动条手写规则（非 Chromium 内核下那套是死代码） |
| **M2 `accent-color` 集中** | `input{accent-color:var(--d2-brand)}`，替换全站 14 处硬编码 | 复选框/单选/滑块在暗色下不再出现 `#1d1d1f` 近黑色 |
| **M3 单一挂载真源** | 只保留 `documentElement[data-theme]`；废弃 13 容器白名单（`theme-manager.js:93-117`）与 12 处组件自绑 | 新页面**自动**获得暗色，R2/R4 结构性止血 |
| **M4 接通 Tailwind 暗色变体** | `@custom-variant dark (&:where([data-theme=dark],[data-theme=dark] *));` | 组件级暗色可用 `dark:` 表达，不必再新开 `[data-theme="dark"] .foo` 全局选择器（后者正是 413 处 `!important` 的来源） |
| **M5 确定性加载** | `theme-css-loader.js:28` 的 `Promise.allSettled` 改为 `for…of await`；或把 8 个文件合成 1 个 | 消灭"靠运气的层叠顺序"，`src/style.css:225` 死代码可安全删除 |
| **M6 暗色裸色门禁** | 新增 `scripts/check-dark-tokens.mjs`（复用 `scripts/dark-token-scan.mjs` 的扫描逻辑），基线取当次扫描值，**只降不升**，新增即 fail | 让 R1 不可复发。项目已有 3 道同型门禁，文化上零摩擦 |
| **M7 修 DataManagement 旁路** | `DataAdmin.vue` 改用 themeManager；`base.css:164` 的 `:not([data-theme="light"])` 依赖修复 | 修掉"用户选浅色但后台仍变暗"的确定性 bug |
| **M8 暗色可访问性门禁** | 把 `probe-dark-audit.mjs` 纳入 `build:ci`，severe 基线 29 → 0 逐档收紧；补 `prefers-contrast: more` 与 `forced-colors` 适配（当前 0 处） | 让 R6 不可复发 |

---

## 6. 迁移路线（不推倒重来，按性价比排序）

| 阶段 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| **P0 立即止血** | M1 `color-scheme` + M2 `accent-color` + M3 DataManagement 旁路收编 + 修 `base.css:164` | ~0.5 天 | 极低，纯增量 |
| **P1 冻结腐化** | M6 门禁上线，基线锁定扫描值；同时把 M3 的 8 个 `@media (prefers-color-scheme: dark)` 全部改为 `data-theme` 驱动 | ~1 天 | 低 |
| **P2 落地 token** | 新增 `src/styles/themes/dark-2-tokens.css`；把 11 个族的锚点值**别名**到新 ramp（`--boh-bg-primary: var(--d2-canvas)` 等），旧字面量继续工作 | ~1 天 | 中（需逐屏比对） |
| **P3 高杠杆清扫** | 按实测 severe 数排序逐页把裸色换成同文件已有的 `var()`：**Shop(7) → Home 画布 → ai-chat/BOHAI 黑压黑 → login 白压白 → forum → user-space** | 每页 0.5–1 天 | 中 |
| **P4 消除 !important** | 每完成一页，删掉该页主题文件里因优先级追赶而写的 `!important`；`check-important-budget.mjs` 基线 360 同步下压 | 持续 | 中 |
| **P5 补齐 18 个页面** | 因 M3 让 `data-theme` 只在 `html` 上生效，多数页面在 P2 之后即"自动可用"，只需补局部 tint/图片 scrim | ~3 天 | 低 |
| **P6 验证闭环** | M8 进 CI + 每页暗色截图基线（复用 `debug-screenshots/` 既有流程） | ~1 天 | 低 |

**关键取舍**：P2 阶段刻意**不改视觉**（新 ramp 只做别名，不改数值），先把"能不能一处改全站"这件事钉死；P3 起才真正换色。这样任何视觉回归都能被单独归因，而不是和结构改造混在一起。

---

## 7. Demo 说明

`docs/dark-mode-demo.html` —— 单文件、零依赖、零构建、**不改动应用任何源码**，双击即可打开。
验证探针：`scripts/probes/probe-dark2-demo.mjs`（Playwright + 系统 Chrome，截图输出到 `debug-screenshots/dark2-demo-*.png`）。

### 7.1 结构

1. **同一份标记、两套 token**：组件 HTML 只写一次并注入左右两个 pane，两个 pane 的差异**仅是顶部 token 块**。因此 demo 本身就在证明本报告的核心论点 —— token 化之后，换配色只需要改一处。
2. **实时 WCAG 计算**：角标数值由浏览器 `getComputedStyle` 取实际绘制色、沿祖先链做 alpha 合成后算出，不是写死的常量。左栏因此会如实报出 `1.00:1`、`2.49:1` 这类失败值。
3. **五个区块**：组件实景（导航/论坛流/商品卡/个人空间/BOHAI/玻璃模态/表单态/热力图/骨架）→ 层级与色板 → 品牌蓝横评 → 迁移映射 → 八条设计原则。
4. **反例开关**：勾选"只换 token、组件仍写死白卡"，可见 P3 未做时白块依旧存在 —— 说明换 token 不等于修完。

### 7.2 实测结果（2026-09-18，probe 输出）

| 指标 | 现状 pane | Dark 2.0 pane |
|---|---|---|
| 检测的 fg/bg 配对 | 66 | 66 |
| **未达 AA** | **41（62%）** | **0** |
| 其中 < 3.0（严重） | 10 | 0 |
| 3.0–4.5（仅够大号） | 31 | 0 |
| 全站最低比 | **1.00:1** | **4.52:1** |
| 控制台错误 | 0 | 0 |

### 7.3 保真度校验（demo 复刻值 vs 线上实测值）

左栏刻意不修正文字色，因此它复现的是真实缺陷，且与 2026-09-08 的运行时审计吻合：

| demo 场景 | demo 算出 | 线上审计 | 偏差 |
|---|---|---|---|
| Shop 卡 `#f5f5f7` on `rgba(255,255,255,.6)`→`#9d9d9f` | 2.49 | `/shop` `#f5f5f7` on `#9e9e9f` = **2.45** | 0.04 |
| Shop 积分 `#0071e3` on `#9d9d9f` | 1.73 | `/shop` `#0071e3` on `#9e9e9f` = **1.76** | 0.03 |
| Home 底 `#f5f5f7` 上 `#f5f5f7` 文字 | 1.00 | `/login` `#ffffff` on `#ffffff` = **1.00** | 0 |
| 论坛 muted `#71717a` on `#21222c` | 3.27 | 静态测算区间 **3.13–4.09** | 落在区间内 |

各卡片底色按页面真实取值分别挂载（Home `#f5f5f7`、Forum `#21222c`、Shop `rgba(255,255,255,.6)`、UserSpace `#1a1a24`、BOHAI `#2f2f2f`），
所以左栏一屏之内就能看到"同一个卡片角色有 5 种底色"的碎片化本身，而不是把现状画得比实际更糟。

---

## 附录 A：本文数据如何复现

```bash
node scripts/dark-token-scan.mjs   # 暗色块内字面量/!important/表面色碎片化统计
node scripts/dark-palette-calc.mjs # OKLCH→sRGB + 全部对比度实测值
python3 - <<'PY'            # 运行时 severe / 浅底残留统计
import json,collections
d=json.load(open('dark-audit-results.json')); r=d['results']
print(len(r), sum(x['severeCount'] for x in r), sum(x['warnCount'] for x in r))
PY
```

## 附录 B：既有文档中需要更正的结论

- `docs/boh-full-health-check-2026-06-26.md:336,348,568` 记"9 个主题 CSS 文件 / 深色模式完善 / 设计得分 82"。实际 `src/styles/themes/` 现有 **8 个**文件，`boh-note-dark.css` 已下线（`dark-mode.css:233-237` 有迁移说明），且该"完善"结论被 2026-09-08 实测的 **29 severe** 直接推翻。
- 同一文档的暗色评分应改为：**结构可用（9/27 页覆盖），质量不达标（29 severe / 115 warn）**。
