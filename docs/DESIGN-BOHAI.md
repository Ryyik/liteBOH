# DESIGN-BOHAI —— BOH AI 设计系统与响应式规范（2026-10-06）

> **本文是 BOH AI 全量重写（`plans/025` v2）的视觉/交互规格真源。** 工程路径见 `plans/025`，
> 产品形态见 `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md`。
>
> **事实基准**：`output/boh-ui-demo/index.html`（已验收的 UI 预览件，`output/` 已 gitignore、**不入库**）。
> 本文**已把它的全部数值自含抄录** —— 后续实现只读本文，不依赖那个本地文件。
>
> **纪律**：本文里的每一条量化规格（色值、断点、尺寸）都是**可直接写进 CSS 的字面值**；
> 若与预览件不符，**以预览件为准**并在此更正（见 §0.2 的冲突标注）。

---

## 0. 定位与三条设计原则

### 0.1 三条原则

1. **黑白灰，无彩色 accent。** 强调 = **墨色**（浅色 near-black / 深色 near-white），
   **主操作底色随主题反转**，配 `--boh-accent-contrast` 保证其上文字可读。
   **品牌绿不出现在 BOH AI**（品牌绿属于站点，不属于 AI 模块）。
2. **移动优先。** 基础样式 = 竖屏手机；`min-width` 渐进增强；**零 `!important`**（棘轮）。
3. **单一真源。** 令牌一处定义、断点一个文件、时长一个文件、`--kb-inset` 只写一处（见 §8）。

### 0.2 ⚠️ 事实基准与冲突标注

预览件 `output/boh-ui-demo/index.html` 是**已验收的事实基准**。落地时若发现提示词（`plans/025` v2 的任务书）
与预览件不一致，**以预览件为准**。已发现并标注如下（**共 3 处**）：

| # | 项 | 提示词记 | 预览件实测（**以此为准**） | 处置 |
| --- | --- | --- | --- | --- |
| C1 | 输入框（composer 外壳）圆角 | **12** | `--boh-radius-xl` = **14** | 本文记 **14**；若要按 12 落地须改预览件并重新验收 |
| C2 | AI 岛（≤768 档）高度上限 | `min(54vh, 460px)` | `max-height: min(58%, 460px)` | 本文记 **`min(58%, 460px)`** |
| C3 | 全仓超阈值文件总数 | 18 | **19**（16 个在 BOHAI 外） | 见 `plans/025` §1.2（另有 1 处差异疑与并行会话写入有关） |

> ⚠️ 圆角刻度本身（**8 / 10 / 12 / 14**，外壳 20）两处一致；冲突只在「输入框用哪一档」。

---

## 1. 令牌体系

> **落地位置**：`src/views/BOHAI/BOHAI/styles/tokens.css`（单一真源）。
> **组件 CSS 零裸色值**（`check:dark-tokens:strict` 棘轮）；暗色**只切令牌值，不写第二套规则**。

### 1.1 灰度阶 0–1000（OpenAI 体系，浅色为正序）

| 令牌 | 色值 | 令牌 | 色值 |
| --- | --- | --- | --- |
| `--boh-gray-0` | `#ffffff` | `--boh-gray-600` | `#525252` |
| `--boh-gray-50` | `#fafafa` | `--boh-gray-700` | `#404040` |
| `--boh-gray-100` | `#f5f5f5` | `--boh-gray-800` | `#262626` |
| `--boh-gray-200` | `#e5e5e5` | `--boh-gray-850` | `#303030`（暗色描边档） |
| `--boh-gray-300` | `#d4d4d4` | `--boh-gray-900` | `#171717` |
| `--boh-gray-400` | `#a3a3a3` | `--boh-gray-950` | `#0f0f0f` |
| `--boh-gray-500` | `#737373` | `--boh-gray-1000` | `#0a0a0a` |

> **刻度**：灰度阶 **0–1000**，共 **14 个令牌键**
> （`0 / 50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 850 / 900 / 950 / 1000`），习惯称「十二档」。
> `850` 是**实现补档**：§1.3 的暗色描边 `#303030` 必须有一个**非暗色块**的落点 ——
> `check:dark-tokens` 只允许裸值出现在 `:root`，写进 `[data-boh-theme='dark']` 块会当场推高棘轮。
> 语义别名只引用其中一部分；暗色下灰度键**不改值**（绝对色阶），只有语义别名切值（§1.3）。

### 1.2 语义别名（**浅色**）

| 语义令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--boh-bg-page` | `--boh-gray-0` (`#ffffff`) | 页面/面板底色 |
| `--boh-bg-card` | `--boh-gray-100` (`#f5f5f5`) | 卡片/用户气泡/代码区 |
| `--boh-bg-hover` | `rgba(0, 0, 0, 0.045)` | 悬停底 |
| `--boh-bg-active` | `rgba(0, 0, 0, 0.08)` | 选中/激活底 |
| `--boh-border` | `--boh-gray-200` (`#e5e5e5`) | 常规描边 |
| `--boh-border-strong` | `--boh-gray-300` (`#d4d4d4`) | 强调描边/聚焦边 |
| `--boh-text-1` | `--boh-gray-1000` (`#0a0a0a`) | 主文字 |
| `--boh-text-2` | `--boh-gray-500` (`#737373`) | 次要文字/图标 |
| `--boh-text-3` | `--boh-gray-400` (`#a3a3a3`) | 三级文字/占位/时间戳 |
| `--boh-accent` | `--boh-gray-1000` (`#0a0a0a`) | **强调 = 墨色** |
| `--boh-accent-contrast` | `--boh-gray-0` (`#ffffff`) | 墨色底上的文字/图标 |
| `--boh-accent-soft` | `rgba(0, 0, 0, 0.06)` | 聚焦光环 |
| `--boh-code-bg` | `--boh-gray-50` (`#fafafa`) | 代码块底 |
| `--boh-code-head` | `--boh-gray-100` (`#f5f5f5`) | 代码块标题条 |
| `--boh-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | 轻投影 |
| `--boh-shadow-md` | `0 4px 14px rgba(0, 0, 0, 0.08)` | 卡片/输入框 |
| `--boh-shadow-lg` | `0 14px 40px rgba(0, 0, 0, 0.16)` | 浮层/抽屉/岛 |
| `--boh-backdrop` | `rgba(23, 23, 23, 0.34)` | 抽屉遮罩 |

### 1.3 暗色映射表（`[data-boh-theme="dark"]`）

> **真源是 `theme-manager.js`**；BOHAI 挂 `data-boh-theme`（**不是**站点 `data-theme`）。
> 只有下列键**改变值**，其余继承浅色定义。

| 语义令牌 | 浅色 | **暗色** |
| --- | --- | --- |
| `--boh-bg-page` | `--boh-gray-0` | **`--boh-gray-900` (`#171717`)** |
| `--boh-bg-card` | `--boh-gray-100` | **`--boh-gray-800` (`#262626`)** |
| `--boh-bg-hover` | `rgba(0,0,0,0.045)` | **`rgba(255, 255, 255, 0.06)`** |
| `--boh-bg-active` | `rgba(0,0,0,0.08)` | **`rgba(255, 255, 255, 0.1)`** |
| `--boh-border` | `--boh-gray-200` | **`#303030`** |
| `--boh-border-strong` | `--boh-gray-300` | **`--boh-gray-700` (`#404040`)** |
| `--boh-text-1` | `--boh-gray-1000` | **`#f5f5f5`** |
| `--boh-text-2` | `--boh-gray-500` | **`--boh-gray-400` (`#a3a3a3`)** |
| `--boh-text-3` | `--boh-gray-400` | **`--boh-gray-500` (`#737373`)** |
| `--boh-accent` | `--boh-gray-1000` | **`#f5f5f5`（墨色反转）** |
| `--boh-accent-contrast` | `--boh-gray-0` | **`#0a0a0a`** |
| `--boh-accent-soft` | `rgba(0,0,0,0.06)` | **`rgba(255, 255, 255, 0.1)`** |
| `--boh-code-bg` | `--boh-gray-50` | **`--boh-gray-950` (`#0f0f0f`)** |
| `--boh-code-head` | `--boh-gray-100` | **`--boh-gray-900` (`#171717`)** |
| `--boh-shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | **`0 1px 2px rgba(0, 0, 0, 0.4)`** |
| `--boh-shadow-md` | `0 4px 14px rgba(0,0,0,0.08)` | **`0 4px 14px rgba(0, 0, 0, 0.5)`** |
| `--boh-shadow-lg` | `0 14px 40px rgba(0,0,0,0.16)` | **`0 14px 40px rgba(0, 0, 0, 0.6)`** |
| `--boh-backdrop` | `rgba(23,23,23,0.34)` | **`rgba(0, 0, 0, 0.5)`** |

> 灰度 12 档**在暗色下不改**（它们是绝对色阶）；只有语义别名切值。

### 1.4 几何 / 版式 / 动效 / 布局令牌

| 类别 | 令牌 | 值 |
| --- | --- | --- |
| **圆角** | `--boh-radius-sm` | `8px` |
| | `--boh-radius-md` | `10px` |
| | `--boh-radius-lg` | `12px` |
| | `--boh-radius-xl` | `14px` |
| | `--boh-radius-shell` | `20px`（AI 岛外壳；≤768 档降 18px） |
| **字体** | `--boh-font-ui` | `ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif` |
| | `--boh-font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| **字距** | `--boh-ls-body` | `-0.01em` |
| | `--boh-ls-head` | `-0.02em` |
| **动效** | `--boh-dur-fast` | `150ms` |
| | `--boh-dur-med` | `200ms` |
| | `--boh-dur-bob` | `1.1s`（检索进度条） |
| | `--boh-dur-spin` | `0.9s`（集群进度） |
| | `--boh-dur-breath` | `2s`（思考圆点，旧版口径） |
| | `--boh-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| **布局常量** | `--boh-rail-w` | `88px` |
| | `--boh-sidebar-w` | `280px` |
| | `--boh-work-w` | `360px` |
| | `--boh-content-w` | `768px` |

> **系统字体栈、不引 Web 字体** —— 大陆可达性硬约束（本仓已实测多个海外 CDN 域名返回 `000`）。

---

## 2. 版式 / 间距 / 圆角 / 动效规范

### 2.1 字号与字重

| 语义 | 字号 | 字重 | 备注 |
| --- | --- | --- | --- |
| 空态主标题 | `22px` | 600 | 矮横屏降 `19px`；岛内降 `17px` |
| 会话标题 / 品牌名 | `14.5–15px` | 600 | `--boh-ls-head` |
| 正文（消息） | `14.5px` | 400 | 行高 `1.65–1.75` |
| 按钮 / 菜单项 | `13–13.5px` | 400/500 | 选中 `500` |
| 次要标签 | `12–12.5px` | 400 | `--boh-text-2` |
| 三级信息 / 时间戳 | `11–11.5px` | 400 | `--boh-text-3` |
| 小标题（大写式） | `11–11.5px` | 600 | `letter-spacing: 0.02–0.03em`（**正字距是小标签例外**） |
| 用量角标 | `10–10.5px` | 600 | |

**字重刻度**：**400 / 500 / 600 / 700** 四档，不外扩。

### 2.2 间距（**4px 基准步长**）

- **基准步长 4px**；常用刻度 **4 / 8 / 12 / 16 / 20 / 24 / 32 / 40**。
- 预览件在紧凑区（图标间隙、分段控件）用了少量细调值（`3 / 5 / 6 / 7 / 9 / 10 / 11 / 14`），
  落地时**优先吸附到 4px 刻度**，确需微调才保留。
- **典型值**：面板内边距 `10–16px`；区块间距 `8–14px`；消息之间 `24px`（矮横屏 `18px`）；
  流内边距 `16px`（桌面 `28px 32px`，宽屏 `32px 40px`）。

### 2.3 圆角用法表

| 组件 | 圆角 |
| --- | --- |
| 输入框外壳 `.boh-composer` | **14**（`--boh-radius-xl`；见 §0.2 C1） |
| 用户气泡 | **14**（右下角单独 `4px`） |
| 浮层菜单（模式/斜杠/形态切换） | **12**（`--boh-radius-lg`） |
| 卡片（空态卡 / 产物卡 / 代码块） | **12** |
| 新对话按钮 | **12** |
| 列表项 / 图标按钮 / 搜索框 | **10**（`--boh-radius-md`） |
| 分段控件内按钮 / 下载按钮 | **8** |
| 胶囊（chip / 工具行 / 模式 pill / 发送键） | `999px`（圆形/全圆） |
| AI 岛外壳 | **20**（≤768 档 `18px`） |

### 2.4 动效（**克制**）

- **只有两个时长**：`150ms`（`--boh-dur-fast`，悬停/颜色/描边）与 `200ms`（`--boh-dur-med`，抽屉/展开/淡入）。
- **唯一缓动**：`cubic-bezier(0.4, 0, 0.2, 1)`（`--boh-ease`）。
- **CSS 里不许写字面时长**（时长唯一真源 = 令牌）。
- 入场/循环动画仅三处：检索进度条滑动 `--boh-dur-bob`（`1.1s`）、集群进度转圈 `--boh-dur-spin`（`0.9s`）、
  **思考圆点呼吸 `--boh-dur-breath`（`2s`）**。
  > ⚠️ **思考圆点按旧版口径保留**（2026-10-08 用户拍板：「思考状态依旧保持旧版圆点」）——
  > 形状 / 动画逐字沿用旧 `messages.css` 的 `.thinking` + `.thinking-dot` + `@keyframes thinkingBreath`
  > （`scale .72→1.22` / `opacity .55→1` / `2s ease-in-out`）。**不要**换成 Demo 预览件里的三点打字动画：
  > 等待动作与输出格式属「不变项」（同 `plans/023` 的原话「AI 的等待动作和输出的格式不变」）。
- **必须尊重 `prefers-reduced-motion: reduce`**（预览件已内置降级）。
- ⚠️ `animation-fill-mode: both` 会让该属性从此不可过渡，离场必须走关键帧（仓库既有坑）。

---

## 3. 断点体系与「断点单文件」纪律

### 3.1 断点表（**4 + 1**）

| 档 | 条件 | 定位 |
| --- | --- | --- |
| **小手机** | `max-width: 480px` | 竖屏小屏：顶栏 `46px`、流内边距 `12px`、用户气泡 `≤88%`、空态卡两列 |
| **手机/平板竖屏** | `≤ 768px` | 竖屏基准档（基础样式即此档） |
| **桌面** | `≥ 1024px` | 三/四栏布局起点（与横屏左栏契约同界） |
| **宽屏** | `≥ 1440px` | 内容区加宽、Work 默认展开 |
| **矮横屏** | `orientation: landscape` 且 `max-height: 600px` | 横屏手机：单列宽版、纵向间距收紧 |

> **合并说明**：现状（`src/views/BOHAI/`）有 **560 / 600 两档矮横屏**并存 —— 重写**合并为一档
> `max-height: 600px`**。现状实测：BOHAI 目录内共 **10 条不同 `@media` 条件**、
> **8 个不同像素断点值**（560/600/640/767/768/1023/1024/1440），且 **767 与 768 并存漂移**。
> 判据：`grep -rhoE "@media[^{]*" src/views/BOHAI/ | sort -u`。（2026-10-06 实测）

### 3.2 ⭐ 「断点只允许出现在一个 layout 文件」

**纯 CSS media query 引用不了变量 ⇒ 断点的真源只能是「单一文件」。**

- **唯一落点**：`src/views/BOHAI/BOHAI/styles/layout.css`（或 `layout/` 目录的单一入口）。
- 组件自己的 CSS **只写基础（竖屏）样式**，任何 `@media` / `@container` **一律上收到 layout.css**。
- **AI 岛**（§6）的两条 `@container` 规则（≤768 全宽、矮横屏）**也必须落在 layout.css**，
  不得留在岛组件里（预览件为演示方便把岛的两条 query 留在 §6，**落地时归并**）。
- 边界写法：`≥1024` 与 `≤1023` 成对（避免重叠），`≤768` 与 `≥769` 同理。

> ⚠️ **与「横屏左栏契约」的关系**：横屏左栏（`UserSpace/styles/landscape-rail.css` 的
> `body.page-aichat` 段，横屏 `≥1024×600`、rail `88px` fixed）的断点**已在 4 个文件手工同步**
> （`landscape-rail.css` / `shell-community.css` / `side-rail.css` / `bottom-nav.css`）。
> **不得新增第 5 处** —— BOHAI 侧一律引用该契约，不复制条件。

---

## 4. 布局矩阵（**两形态 × 4+1 档**）

> 形态 = **Chat / Work**（见 §7）。矩阵里的栏宽即 §1.4 的布局常量。

| 档 | Chat 形态 | Work 形态 |
| --- | --- | --- |
| **≤480 / ≤768（竖屏）** | **单列**：会话侧栏 = **Teleport 抽屉**（`min(78vw, 280px)` + 遮罩）；composer 贴底，高度走 `--kb-inset`；**Work 入口隐藏**（`≤1023` 隐藏） | 同 Chat（Work 面板在竖屏不出现，能力经对话/产物卡体现） |
| **矮横屏（landscape ≤600 高）** | **单列宽版**：顶栏 `44px`、流内边距 `12px 20px`、消息间距 `18px`、输入框 `min-height 30 / max-height 60`、隐藏底部说明与空态副标题、空态建议 **4 列** | 同上 |
| **≥1024（桌面）** | **三栏**：横屏左栏 `88` + 会话侧栏 `280` + 内容区 `768`（居中）；侧栏收起 = **宽度收拢 + 内容定宽裁切**（**不是 translateX**）；遮罩 `display: none` | **四栏**：+ Work 面板 `360`（可折叠）；**切到 Work 桌面档自动展开工作台** |
| **≥1440（宽屏）** | 桌面布局；内容区加宽（`32px 40px`） | **Work 默认展开** |

**AI 岛**（浮层形态，`≤768` 档）：

- 位置：`left: 5px; right: 5px`（**全宽 − 10px**）、`bottom: 64px`、`border-radius: 18px`；
- 高度上限：**`min(58%, 460px)`**（见 §0.2 C2；提示词记 `min(54vh,460px)`）；
- 矮横屏：`bottom: 58px`、`max-height: calc(100% - 118px)`、空态建议 4 列；
- 桌面档：`width: min(680px, calc(100% - 20px))`、居中、`max-height: calc(100% - 150px)`。

> **桌面侧栏收起的准确语义**：**宽度收拢（`width: 280 → 0`，`overflow: hidden`，子项 `min-width: 280px`
> 定宽被裁）**，**不是** `translateX`。预览件已验证（`plans/025` §2 红线 6）。

---

## 5. 组件树与 `Boh*` 命名契约

> **命名契约**：新组件一律 **`Boh*` 前缀**；**旧类名不做迁移**（旧 DOM 一起死、旧 CSS 整体删）。
> **探针落成后名字冻结** —— 探针断言锚在类名上，改名 = 断言全红。

```
BOHAIMain.vue                        # 壳：布局装配 + 形态切换（< 400 行）
├─ BohSurfaceSwitcher                # 侧栏左上角 大模式切换器（Chat / Work）
├─ BohSidebar                        # 会话侧栏（Teleport 抽屉 / 静态列）
│  ├─ BohSessionSearch
│  ├─ BohSessionItem
│  └─ BohSidebarFoot                 # 设置入口 + 今日额度
├─ BohChatStream                     # 消息流
│  ├─ BohChatMessage                 # 单条（含 markdown / 思考块 / 引用）
│  ├─ BohSearchChips                 # 检索来源 chip（T/S/K/G/F）
│  └─ BohInlineFollowUp              # 内联追问
├─ BohEmptyState                     # 空态（建议随形态切换）
├─ BohComposer                       # 输入区
│  ├─ BohUsageOrb                    # 上下文环 + 额度浮层
│  ├─ BohModeMenu                    # 五模式 + 强度分段
│  └─ BohSlashMenu                   # /web /community /cloud /health
└─ BohWorkPanel                      # Work 面板（≥1024 才挂载）
   ├─ BohArtifactCard                # 产物（docx/pptx/xlsx）+ 下载
   ├─ BohSourceRow                   # 检索来源
   └─ BohClusterSteps                # 集群进度
```

**⚠️ 探针锚定的类名**（改名即红，务必先建探针再定名）：输入区 `composer-panel` 族、
用量圆钮 `usage-orb-wrap` 族、二级菜单 `composer-submenu*` 族 —— 现状
`probe-bohai-composer.mjs` **22 条**断言锚在这些类名上。重写时**新组件用新名 + 新探针同批落**。

---

## 6. （预留）AI 岛形态的布局要点

见 §4 的「AI 岛」段（位置/高度/断点）。岛的两条 `@container` 规则按 §3.2 归并进 `layout.css`。
岛内空态：`h2` 降到 `17px`、建议卡两列（矮横屏四列）、`gap 8px`。

---

## 7. 两层模式体系（**大模式 / 对话模式，正交**）

> ⚠️ **不要混淆**：**大模式 = 产品形态**（决定有哪些工具、产物落到哪），
> **对话模式 = 模型档位**（决定用哪个模型、给多少预算）。**两者正交，不可压成一维**
> （不要把 `chat`/`work` 塞进 `bohai_model_configs`）。

### 7.1 第一层：大模式 = 形态 surface（**Chat / Work**）

- **落点**：**侧栏左上角切换器**（Codex 式），点击弹菜单，两项：
  - **Chat** —— 副标题「**创作、学习与探索**」
  - **Work** —— 副标题「**构建、交付与执行**」
- **切换效果**：① 切到 **Work 桌面档自动展开工作台**（`≥1024`）；② 空态建议与占位文案随形态切换
  （`今天想聊点什么?` ↔ `今天要做点什么?`）；③ 输入框 placeholder 随形态切换。
- **存储**：前端设置（仿现有 `MODE_SETTING_KEY` 口径，如 `boh_ai_surface_v1`）+ 路由。

### 7.2 第二层：对话模式 + 思考强度

| 维度 | 真源 | 现状 |
| --- | --- | --- |
| **对话模式** | **数据库 `bohai_model_configs`**（运行时 RPC 读取） | **Fast / Air / Code / Ultra / Gemini**（用户确认的库现状） |
| **思考强度** | `src/views/BOHAI/composables/chat-engine-config.js:270`（`THINKING_SPEED_OPTIONS`） | **低 / 中 / 高**，默认 **中**（`BOH_DEFAULT_THINKING_SPEED_ID = 'medium'`） |

**硬规则**：

1. **模式清单运行时从 `bohai_model_configs` 读取，不进前端硬编码**（新增/下线模式只改库）。
2. ⚠️ `chat-engine-config.js:511-518` 的注释仍是 **2026-06-08 口径**（Fast / Pro / Plan / Agent），
   **与线上库不一致** —— 重写时**以 DB 为真源，并更正该注释**。
3. **composer 右下角 pill** 形如「**Fast · 中**」（对齐 Codex 的「5.6 Sol High」式）；
   点击弹菜单 = **五模式（单选）+ 思考强度分段（低/中/高）**。

> 判据：`THINKING_SPEED_OPTIONS` 读 `chat-engine-config.js:270-293`（低/中/高 + 默认 `medium`）；
> 模式注释读 `chat-engine-config.js:505-520`。（2026-10-06 实测）

---

## 8. 能力公式（Chat / Work 工具子集）

> **⚠️ 本节修订 companion 文档 §5.3**：原公式 `Chat = retrieval + web` / `Work = retrieval + web + generator`
> **漏了 `action`、没提编码**。修订如下（已同步声明进 `plans/025` §6）：

```
Chat = retrieval + web + action(轻量写：发帖 / 记忆)      —— 日常问答，联网搜索是招牌
Work = retrieval + web + generator(docx / pptx / xlsx + 代码) + agents 集群  —— 编码与交付物
```

| 工具类别 | Chat | Work | 说明 |
| --- | --- | --- | --- |
| `retrieval`（站内读连接器 ×8） | ✅ | ✅ | Cloud+/公共记忆/知识库/操作手册/论坛/私域/健康/站内活动 |
| `web`（联网搜索 + 深读） | ✅ | ✅ | Tavily → free 降级链；Chat 的招牌能力 |
| `action`（写：发帖 / 记忆） | ✅（轻量） | ✅ | `createPost` / `saveSharedMemory` / `createPage` |
| `generator`（docx/pptx/xlsx + 代码） | ❌ | ✅ | Work 的交付物能力 |
| `agents` 集群（多步任务） | ❌ | ✅ | 复用 `agents/`（现被 DB 开关闸住，Work 默认挂上） |

> ⇒ **切换形态 = 换工具子集 + 换系统提示 + 换默认产出**，**不复制两套引擎**（避免引擎行数翻倍）。

---

## 9. 「不许丢」机制清单（重写期逐条核对）

> 这些机制**跨文件、易在重写中静默丢失**（丢了不报错、只是布局/交互错）。**每条都在探针或单测里锁着**。

| # | 机制 | 真源 | 重写期注意 |
| --- | --- | --- | --- |
| 1 | **`--kb-inset`（键盘遮挡）** | `src/composables/useKeyboardInset.js` | 高度 `calc(100dvh - var(--kb-inset, 0px))` **只写一处**。现状**双源**：`adaptive-layout.css:21` 与 `shell-header.css:28` —— **重写收敛为一处** |
| 2 | **会话侧栏 Teleport 抽屉 + `--bohai-sidebar-left` 杠杆** | `BohaiSidebar.vue:925`（消费）/ `landscape-rail.css:356`（置位） | AI 会话侧栏 **Teleport 到 body** ⇒ 其 `left` 由变量驱动；**改既有 `!important` 的值而非新增** |
| 3 | **safe-area 三处用法** | — | 顶部/底部/左右三处 `env(safe-area-inset-*)`，重写时逐处保留 |
| 4 | **横屏左栏契约** | `UserSpace/styles/landscape-rail.css` 的 `body.page-aichat` 段 | 横屏 **≥1024×600**、rail **88px fixed**；断点在 **4 个文件手工同步**，**不得新增第 5 处**；`BOHAIMain` 必须**按页引入**该文件（不引则左栏渲染但定位/让位全不生效） |
| 5 | **岛展开时左栏 top 避让** | 同上 | 岛展开时左栏内容需下移避让 |
| 6 | **桌面侧栏收起 = 宽度收拢 + 内容定宽裁切** | 预览件已验证 | **不是 `translateX`**（§4） |
| 7 | **`--liquid-*` 一字不动，BOHAI 不再消费** | 全局 `tokens.css` | BOHAI 不压全局玻璃变量 |

---

## 10. 探针重建计划（三档视口）

> 现状 `probe-bohai-composer.mjs` **22 条断言全在桌面档**，**竖屏与矮横屏零覆盖** —— **必须补的缺口**。

| 探针 | 目标视口 | 断言 |
| --- | --- | --- |
| `probe-bohai-composer.mjs` | **1440×900 / 390×844 / 844×390** 三档 | **30 条**（A1–A19 桌面全量交互 / B1–B6 竖屏 / C1–C5 矮横屏），只增不减 |
| `probe-bohai-shell.mjs` | 1440×900 / 390×844 / 844×390 | **25 条**（壳骨架 + 左栏 + 侧栏静态列/抽屉 + 顶栏三档 + 空态 + Work 面板挂载） |
| `probe-aichat-landscape-rail.mjs` | 1440×900 / 390×844 | 14（左栏 fixed + 岛心居中 + 会话侧栏 left:88px） |
| `probe-ai-island-rail.mjs` | 1280×900 | 7（岛展开不顶动左栏与页签） |
| `probe-ai-panels.mjs` | 1440×900 | 设置面板惰性挂载 + 壳/侧栏/顶栏存在 |
| `probe-bohai-mode-loading.mjs` | 1280×900 | 6（骨架 → 释放 → 空态兜底 → 即时就绪，全部离线 mock） |

**纪律**：

- **每块 UI 替换 = 新组件 + 新样式 + 新探针 + 旧组件/旧样式/旧探针同批删**（`plans/025` §4 Step 6）。
- 探针**在动画窗口内读瞬时类**（进场类 120ms 读；600ms 会拿到 `animation: none` 假红）。
- 判绿：三档视口全绿 + 断言总数 **≥ 现值（BOHAI 相关只增不减）**。

---

## 11. 与三道 CSS 棘轮的关系

| 棘轮 | 现值 | 本设计系统如何满足 |
| --- | --- | --- |
| **零裸色值**（`check:dark-tokens:strict`） | **2,785**（2026-10-08 由 2,854 下调） | 组件 CSS **只消费 `--boh-*`**；暗色**只切令牌值**，不写第二套规则、不写裸 hex |
| **零 `!important`**（`check:important-budget`） | **701**（2026-10-08 由 1,217 下调；旧 BOHAI 名下约 497 + `BOHAIIsland.vue` 73 已随旧 CSS / 旧 `:global()` 覆盖一起消失） | 新 CSS **零 `!important`**；降级动效**只把时长令牌归零**，不写 `!important` |
| **时长唯一真源** | 令牌 | **CSS 里不许写字面时长**，一律 `var(--boh-dur-*)` + `var(--boh-ease)` |

> 判据：`node -e "console.log(require('./scripts/important-budget.json').total)"`（→1217）、
> 同法读 `dark-token-budget.json`（→2854）。（2026-10-06 实测）
> ⚠️ 三道棘轮**都只允许下降**；被卡住时先想别的办法，**不要用 `--update` 抬基线**
> （抬基线必须在 commit message 里交代理由）。
