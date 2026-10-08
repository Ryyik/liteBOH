# BOHAI 对齐 ChatGPT / Codex 桌面版：优化方案 + 斜杠命令可用性修复

> 状态：**方案，未动代码**。按本仓惯例，拍板后转成 `plans/027-*.md` 执行计划。
> 需求（用户原话）：「让 BOHAI 更像 ChatGPT Codex，给出优化方案，并且让 `/` 命令可用」。
>
> 本文是**调研 + 方案**，分两部分：
> - **第一部分（§1–§4）**：`/` 命令为什么不可用，以及怎么修 —— 这部分**根因已实测锁死**，可直接开工。
> - **第二部分（§5–§8）**：BOHAI 外壳与 Codex 的差距盘点、分档优化建议 —— 这部分是**建议**，需拍板。
>
> **与既有文档的关系**（别重复劳动）：
> - `plans/025-bohai-module-split.md` —— BOHAI 全量重写（Step 6 UI 树替换已全部完成）。
>   本文**不改它的结论**，只在其成果（`Boh*` 组件族）之上做增量。
> - `docs/DESIGN-BOHAI.md` —— 现役设计真源（令牌 / 断点 / 布局矩阵 / 能力公式）。
>   本文提出的新 UI 元素**必须遵守它的令牌与断点纪律**，§7 逐条标了约束。
> - `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md` —— 视角是「BOHAI 缺哪些**能力**」
>   （生成产物 / 工具层）。本文视角是「**外壳交互**与 Codex 的差距」，两者不重叠。

---

## 0. 结论速览

**关于 `/` 命令（用户明确要求）**：

BOHAI **已经有一套斜杠命令**（`/web` `/community` `/cloud` `/health` + 每个对话模式一条），
菜单能正常唤起、能过滤、能键盘上下选。**但它只在一个入口上生效**：

| 入口 | 行为 | 实测结果 |
| --- | --- | --- |
| 菜单开着时按 **Enter** | ✅ 本地执行（改开关 / 切模式） | 正常 |
| 菜单里 **点击**某一项 | ✅ 本地执行 | 正常 |
| 点**发送键**（↑ 圆钮） | ❌ **把 `/cloud` 当普通文本发给模型** | 复现成功 |
| 输入 `/cloud 素材盘点成表格`（带参数）后按 Enter | ❌ 同上 | 复现成功 |
| 移动端（触屏）**任何**入口 | ❌ 同上 —— Enter 被移动端语义接管，只剩发送键 | 复现成功 |

**根因一句话**：斜杠命令的执行逻辑只挂在「键盘 keydown 拦截器」和「菜单项的 mousedown」上，
**发送路径（`emit('send') → sendMessage`）完全没有斜杠分支**；
逻辑层（`useChatEngine.js` / `engine/` / `domain/`）里 `slash` 出现 **0 次**。

**修法一句话**：把「输入是否是一条斜杠命令」抽成一个**纯函数**（单一真源），
在 **3 个入口**（发送按钮 / Enter / 菜单点击）统一先过它；
能本地执行的命令**绝不发给模型**，带参数的命令**剥掉命令字再发**。
另需补一条**兜底护栏**：命令字不认识时**不静默当文本发**，而是提示。

**关于「更像 Codex」（§5 起）**：BOHAI 的**信息架构已经与 Codex 同构**
（左栏会话列表 + 中间消息流 + 底部 composer + 空态居中），差距集中在**交互密度与细节**。
按性价比分三档：

| 档 | 内容 | 工作量 | 建议 |
| --- | --- | --- | --- |
| **P0** | 斜杠命令修复 + `/` 键入即开菜单 + 悬浮提示 + 空态文案统一 | 小 | **立刻做** |
| **P1** | composer 加 `+` 附件钮 / 消息加「重新生成」/ 会话列表加项目分组 / 顶部元信息条 | 中 | **下一批** |
| **P2** | 推理过程可展开 / 键盘快捷键补齐 / 审批模式语义 | 大 | **取决于要不要做 Agent 形态** |

---

# 第一部分：`/` 命令可用性

## 1. 复现（三条失败路径，全部实测）

> 判据已落成**正式探针**（随仓库分发、可重跑）：
> `node scripts/probes/probe-bohai-slash-commands.mjs`
>
> **在当前（未修复）代码上实测 1/7 通过** —— 失败的 6 条正是本方案要修的：
>
> ```
> FAIL  A1 点发送键执行 /web …          chat请求=5 联网on=false 气泡=["/web"]
> FAIL  A2 带参数 /cloud 剥掉命令字 …    <task>="/cloud 素材盘点成表格"
> FAIL  A3 未知命令不静默放行 …          chat请求=5 <task>="/zzz-not-a-command"
> PASS  A4 非命令输入的 "/" 不被误判 …   <task>="路径是 /user-space?tab=posts 怎么走"
> FAIL  B1 触屏：点发送键执行 /web …     coarse=true chat请求=5 联网on=false
> FAIL  B2 触屏：带参数命令剥掉命令字 …  <task>="/cloud 素材盘点成表格"
> FAIL  C1 空态建议卡剥离命令字 …        填入="/cloud 素材盘点成表格"
> ```
>
> A4 是「别误伤普通输入」的护栏 —— 它**今天本就该绿**，修复后也不许变红。

### 1.1 点发送键 → 字面量进模型

```
结论：输入 `/cloud` 后点发送键，会把字面量 "/cloud" 作为用户消息发给模型（5 次 chat 请求里末条 user 消息含 `<task>\n/cloud\n</task>`）
判据：node scripts/probes/probe-bohai-slash-commands.mjs 的 A1   （2026-10-08 实测，dev server 5173）
```

实测输出：

```
FAIL  A1 点发送键执行 /web（不把字面量发给模型，且联网真的打开）
      -- 菜单=true chat请求=5 联网on=false 气泡=["/web"]
```

**注意「气泡=["/web"]」**：用户消息里已经出现了一个 `/web` —— 这与用户截图里
「你发送了 /cloud 指令」的 AI 回复完全对应。也就是说**截图里的现象已复现**。

同一探针里还有一条对照（A2 的前置观测，来自 `output/repro-slash-cmd.mjs` 的取证件）：

```
④ 菜单开着按 Enter → 气泡: "/cloud" | 输入框残留: ""
   此时到模型的 chat 请求数: 0
```

**同样输入、两个入口、两种结果** —— 这就是「斜杠命令」与「发送」两条路各自为政的直接证据。

### 1.2 带参数时菜单必关 → 无路可走

```
结论：`/cloud 素材盘点成表格` 因含空格使 slashQuery 返回 null（BOHAIMain.vue:1644），菜单不开、Enter 直发，命令字原样进 `<task>` 段
判据：node scripts/probes/probe-bohai-slash-commands.mjs 的 A2   （2026-10-08 实测）
```

实测输出：

```
FAIL  A2 带参数 /cloud 剥掉命令字（送进模型的 <task> 不含 "/cloud"）
      -- 菜单=false chat请求=5 <task>="/cloud 素材盘点成表格"
```

这条比 1.1 更隐蔽：**用户以为自己用了命令**（因为空态建议卡就是这么教的，见 1.3），
实际上命令字变成了任务描述的一部分。

### 1.3 空态建议卡主动教用户写错

```
结论：Work 形态空态第 4 张建议卡带 `/cloud` 前缀，点击后填入「/cloud 素材盘点成表格」，按 Enter 后 `/cloud` 原样进 `<task>` 段
判据：node scripts/probes/probe-bohai-slash-commands.mjs 的 C1   （2026-10-08 实测）
```

实测输出：

```
FAIL  C1 空态建议卡「/cloud 素材…」剥掉命令字
      -- 填入="/cloud 素材盘点成表格" chat请求=5 <task>="/cloud 素材盘点成表格"
```

**这是产品主动制造的错误预期**：UI 用 `/cloud` 前缀暗示「这是命令」，
而实现只认「整条输入是一整个命令字」这一种形态 —— 两者对不上。

### 1.4 移动端：全部入口都失效

```
结论：pointer:coarse 下 Enter 语义被移动端分支接管（BOHAIMain.vue:1502 直接 return），斜杠命令仅剩「点菜单项」一条路；而带参数时菜单不开 ⇒ 触屏上斜杠命令基本不可用
判据：node scripts/probes/probe-bohai-slash-commands.mjs 的 B1 / B2   （2026-10-08 实测，390×844 + hasTouch）
```

实测输出：

```
FAIL  B1 触屏：点发送键执行 /web（移动端唯一可用路径）
      -- coarse=true 菜单=true chat请求=5 联网on=false 气泡=["/web"]
FAIL  B2 触屏：带参数命令剥掉命令字 -- chat请求=5 <task>="/cloud 素材盘点成表格"
```

**比桌面端更糟**：桌面端至少「菜单开着按 Enter」能执行命令，
移动端因为 `isCoarsePointer` 短路，那个入口也不工作
（取证件实测：菜单开着按 Enter → 输入框内容变成带 `\n` 的原文，命令没执行也没发）；
而 B1 说明移动端唯一畅通的路径恰好是**错的那条**（字面量发给模型）。

---

## 2. 根因

### 2.1 执行逻辑挂错了层

现有实现全部长在 `BOHAIMain.vue` 的**视图层事件处理器**里：

| 函数 | 位置 | 职责 |
| --- | --- | --- |
| `slashQuery` | `BOHAIMain.vue:1642` | 输入是否「以 `/` 开头且不含空白」 |
| `slashCommands` | `BOHAIMain.vue:1648` | 命令清单（4 固定 + N 模式） |
| `filteredSlashCommands` | `BOHAIMain.vue:1689` | 过滤 |
| `slashMenuOpen` | `BOHAIMain.vue:1698` | 菜单开关 |
| `runSlashCommand` | `BOHAIMain.vue:1702` | **唯一执行处** |
| `handleComposerKeydown` | `BOHAIMain.vue:1746` | 菜单开着时拦截 ↑↓ / Esc / Enter |

`runSlashCommand` 的调用点**只有两个**（已全仓核实）：

```
BOHAIMain.vue:171   @run-slash-command="runSlashCommand"     ← 菜单项 mousedown
BOHAIMain.vue:1764  runSlashCommand(...)                     ← keydown 拦截器里的 Enter
```

而发送按钮走的是完全独立的一条线：

```
BohComposer.vue:325   @click="emit('send')"
BOHAIMain.vue:164     @send="sendMessage"
useChatEngine.js:1128 const sendMessage = async () => { … }   ← 开头 3 个 early return，零斜杠分支
```

⇒ **两条线没有任何交汇点。** 谁先被触发，取决于用户点哪儿。

### 2.2 「命令」这个概念没有真源

- `slashCommand` 的**语义**（关键字 / 标签 / 干什么）只存在于 `BOHAIMain.vue` 的一个 computed 里；
- **执行**散在 `runSlashCommand` 的 `if (command.action === 'web')` 一串分支里；
- **逻辑层零感知**（`grep slash` 在 `composables/` `engine/` `domain/` 命中 **0** 次）。

⇒ 这正是本仓最高纲领 1 说的形态：**同一条规则没有单一真源**，
于是「加了新入口就忘接命令」变成必然，而不是意外。

### 2.3 顺带发现的两处已死代码（不是本次新增的债）

| # | 现象 | 判据 |
| --- | --- | --- |
| 1 | `isCommandMode` 只被置 `false`、**从不被置 `true`** ⇒ 互斥 watch（`useChatEngine.js:650-663`）的两条分支恒不触发 | `grep -rn "isCommandMode.value = true" src/` → 空（2026-10-08） |
| 2 | `boh-ai-focus-composer` 事件**只有派发没有监听**（`App.vue:229` 发，全仓 0 个 listener）⇒ 「岛已开着时按 ⌘K 聚焦输入框」这条链断了 | `grep -rn "boh-ai-focus-composer" src/ \| wc -l` → **1**（2026-10-08） |

这两条**不阻塞** `/` 命令修复，但都属于「用户按了没反应、也不报错」类缺陷，
建议在 P1 一并处理（§6.3 / §6.4）。**别在本次修复里顺手改** —— 会让自证范围失控。

---

## 3. 修复设计

### 3.1 抽出单一真源：`bohai-slash-commands.js`

新增 `src/views/BOHAI/BOHAI/bohai-slash-commands.js`（**纯函数模块，零副作用**），
放四件东西：

```js
/**
 * 斜杠命令的**唯一真源**：定义 + 解析 + 执行意图三合一。
 * 为什么必须抽出来（2026-10-08 事故）：
 *   原实现把「执行」挂在 keydown 拦截器上，发送按钮走另一条线且零斜杠分支，
 *   于是「点发送键」把 `/cloud` 当普通文本发给了模型（复现见 output/repro-slash-cmd.mjs）。
 *   规则散在两处 ⇒ 入口一多必然漏，这正是本仓最高纲领 1 要消灭的形态。
 */

// ① 命令定义（关键字 / 标签 / 说明 / 种类 / 是否吃参数）
export const BOH_SLASH_COMMANDS = [ … ];

// ② 解析：任何输入 → 结构化结果。这是**唯一的解析入口**，不许在别处再写 startsWith('/')
export const parseSlashInput = (raw) => {
  // 返回 { kind: 'none' | 'command' | 'unknown', keyword, args, command }
};

// ③ 菜单项构造（把「模式」这类动态命令拼进来）
export const buildSlashMenuItems = ({ chatModes = [] } = {}) => [ … ];

// ④ 过滤（关键字 + 标签模糊匹配，供菜单用）
export const filterSlashItems = (items, query) => [ … ];
```

**`parseSlashInput` 的返回契约**（这是修复的核心，三个入口共用）：

| `kind` | 何时 | 调用方该做什么 |
| --- | --- | --- |
| `'none'` | 不是斜杠输入（普通消息） | 正常发送 |
| `'command'` | 命中已知命令 | **执行**；`args` 非空时**剥掉命令字**，把 `args` 当消息发 |
| `'unknown'` | 以 `/` 开头但没命中 | **不发**，提示「未知命令」并保持输入框内容 |

**关键规则**：

1. **命令字与参数的分隔**：第一个空格之前是命令字，之后是参数。
   `/cloud 素材盘点成表格` ⇒ `keyword='cloud'`, `args='素材盘点成表格'`。
   这直接修掉 §1.2/§1.3。
2. **`unknown` 不静默放行**：这是**唯一**能防止「未来再加命令时又漏一条入口」的护栏 ——
   用户输错了会**当场知道**，而不是拿到一个把 `/xxx` 当任务描述的 AI 回复。
   ⚠️ 但要注意**误伤**：用户真的想发一条以 `/` 开头的普通消息（如「/开头的是什么路径」）怎么办？
   ⇒ 见 §3.4 的「逃生口」。
3. **中文全角 `/`**：`／` 也认（中文输入法下极易打出），归一成半角再解析。

### 3.2 三个入口统一过同一个闸门

改动点共 **3 处**，行为变一处、不变两处：

| 入口 | 现在 | 改成 |
| --- | --- | --- |
| `BohComposer` 发送按钮 | `emit('send')` 直通 | 不变（**发送逻辑仍在壳里**，改的是壳的 `@send` 处理器） |
| `BOHAIMain.handleSend` | （现为 `sendMessage` 直通，`@send="sendMessage"`） | **新增** `handleSend`：`parseSlashInput` → 分流 |
| `BOHAIMain.handleComposerKeydown` | 菜单开着才拦截 | 菜单**开着**仍走「执行高亮项」；菜单**关着**且输入是命令 ⇒ 走同一个 `executeSlashCommand` |
| 菜单项 mousedown | `runSlashCommand` | 保留，但内部改调 `executeSlashCommand(command, args='')` |

**伪代码（壳里的新闸门）**：

```js
/** 唯一的发送闸门：所有「用户想发出这条输入」的路径都到这里 */
const handleSend = () => {
  const parsed = parseSlashInput(inputMessage.value);
  if (parsed.kind === 'unknown') {
    notifyUnknownCommand(parsed.keyword);   // 见 §3.4
    return;                                   // 不发、不清空
  }
  if (parsed.kind === 'command') {
    executeSlashCommand(parsed.command);      // 本地副作用
    if (!parsed.args) return;                 // 纯命令：不发消息
    inputMessage.value = parsed.args;         // 带参数：剥掉命令字再发
  }
  return sendMessage();
};
```

所有现存调用 `sendMessage()` 的地方（`BOHAIMain` 里 8 处）**除发送闸门外都不动** ——
它们是程序化发送（种子提问 / 内联追问 / 任务重试），**不该**被斜杠解析，
否则「用户问的内容里含 `/`」会被误判。

### 3.3 命令表（本次不进新增能力，只把已有能力接全）

**原则：每条命令都指向一个已经存在的函数**，不引入新行为。
下表右列已逐个核实「函数存在」（`grep` 判据见 §10）。

| 命令 | 语义 | 目标（已存在） | 吃参数 |
| --- | --- | --- | --- |
| `/web` | 开联网 | `toggleSearch` / `isSearching` | ❌ |
| `/community` | 开社区搜索 | `toggleForumSearch` | ❌ |
| `/cloud` | 开个人 Cloud+ | `handleTreeholeMemoryToggle` | ❌ |
| `/health` | 开健康分析 | `toggleHealthAnalysis` | ❌ |
| `/chat` | 切 Chat 形态 | `setSurface('chat')` | ❌ |
| `/work` | 切 Work 形态 | `setSurface('work')` | ❌ |
| `/new` | 新对话 | `startNewChat` | ❌ |
| `/temp` | 临时对话 | `startTemporaryChat` | ❌ |
| `/model <名>` | 切对话模式 | `selectMode` | ✅ |
| `/clear` | 清当前对话（走确认框） | `clearCurrentChat` | ❌ |
| `/settings` | 打开设置 | `openSettings` | ❌ |
| `/usage` | 打开设置并滚到用量卡 | `openUsageInSettings` | ❌ |
| `/compress` | 整理上下文 | `handleManualCompress` | ❌ |
| `/stop` | 停止生成 | `stopGeneration` | ❌ |
| `/help` | 列出全部命令 | （新，纯 UI） | ❌ |

**关于 `/stop` 与 `/new` 的命名冲突**：现有模式命令是**动态**的，
`keyword` 由模式名 slug 而来（`BOHAIMain.vue:1680-1686`）。
如果某个对话模式恰好叫「stop」/「new」，会与固定命令**撞名**。
⇒ 解析器里**固定命令优先**，且构造菜单时**跳过撞名的模式**（在 `buildSlashMenuItems` 里做，带注释说明）。

### 3.4 「以 `/` 开头但不是命令」的逃生口

护栏不能把用户的正常输入也拦掉。规则：

- `unknown` 时**不清空输入框**，并给一个**可撤回的提示**（岛消息 + 输入框下方一行小字）；
- 提示里给两条出路：**「改一下」**（默认，什么都不做）与 **「就按普通消息发送」**（显式按钮）；
- 或者更简单：**`//` 前缀表示转义**，`//foo` ⇒ 发送字面量 `/foo`。
  ⇒ **建议只做后者**（成本最低，且是 `//` 这个直觉的通用约定），
  前者需要新增一个交互态，与 §4 的自证成本不成比例。

### 3.5 顺带修：`/` 键入即开菜单

现状菜单是**响应式地跟着输入框值**出现的（`slashQuery` 计算），
**没有 `keydown` 监听 `/`** —— 也就是说，用户必须**先点进输入框**才知道有命令。
Codex / ChatGPT 的惯例是 `/` 是一个显式的「唤起命令」键（在空输入框按下即开菜单）。

⇒ 在 `handleComposerKeydown` 里加：**输入框为空且按 `/`** 时，
`preventDefault()` 不必要（让 `/` 正常落进输入框即可，菜单会自然出现），
**关键是让菜单立刻可见**（现有 reactive 已能做到，只要 `slashDismissed` 被复位 ——
这一点 `handleComposerInput` 已处理）。
⇒ **实际要修的是「空态要告诉用户有这个功能」**：

- 空态副标题已有 `输入 / 唤起命令`（chat 形态），**work 形态没有**（见 §5.3 表格）；
- 建议空态**底部加一行极弱化的提示**：`输入 / 查看全部命令`，
  且只在**从未用过任何命令**时显示（localStorage 一个标记），避免长期占用视觉。

---

## 4. 自证方案（命令修复）

| 层 | 内容 | 判据 |
| --- | --- | --- |
| 单测（**新增**） | `parseSlashInput` 的 6 类用例：纯命令 / 带参数 / 未知 / 非斜杠 / 全角 `／` / `//` 转义 | `./node_modules/.bin/vitest run tests/unit/bohai-slash-commands.test.js --pool=forks` |
| 单测（**接线守卫**） | 断言壳里 `handleSend` 存在且**不再**直接绑 `sendMessage`；断言三个入口都调 `executeSlashCommand` | 同上（读源码文本，用 `tests/helpers/source.js` 的 `squeezeSource`） |
| 探针（**已落盘，当前预期红**） | `scripts/probes/probe-bohai-slash-commands.mjs` —— 7 条：点发送键执行 / 带参数剥前缀 / 未知命令拦住 / 普通输入不误伤 / 触屏两条 / 空态卡一条 | `node scripts/probes/probe-bohai-slash-commands.mjs`（修复前 **1/7**，修复后须 **7/7**） |
| 反证 | 把 `handleSend` 的斜杠分支删掉 → A1 / A3 / C1 / B1 必红；把剥前缀改成透传 → A2 / B2 必红 | 必做，否则不算自证 |

**⚠️ 探针的现有盲区（本次必须补）**：
`probe-bohai-composer.mjs` 的 A8 **只断言菜单里的文案**（`['/web','/community','/cloud','/health']` 存在），
**从未点击过任何一个命令项**（`grep -c "boh-slash-item" scripts/probes/probe-bohai-composer.mjs` → **0**），
也**从未验证命令是否真的执行**。⇒ 这正是「22 条断言全绿、功能却不可用」的原因。
新探针 `probe-bohai-slash-commands.mjs` 补的就是这一层（**只断言执行语义与「字面量没进模型」**），
与 A8 的「菜单渲染」断言互补、不重复。

---

# 第二部分：对齐 Codex 的优化建议

## 5. 现状盘点（实测）

### 5.1 已经与 Codex 同构的部分

| 维度 | BOHAI 现状 | 与 Codex 的差距 |
| --- | --- | --- |
| 左栏会话列表 | 有，按 **日期**分组（置顶/今天/昨天/本周/本月/更早，`BohSidebar.vue:382-387`）+ 置顶/重命名/删除 | Codex 按**项目**分组，无日期档 |
| 中列消息流 | 有，纯文字流（用户气泡 + AI 无气泡） | 基本一致 |
| 底部 composer | 有，圆形发送键 + 底部「内容由 AI 生成」 | **缺 `+` 附件、缺顶部元信息条、缺审批模式** |
| 空态 | 有，Logo + 标题 + 副标题 + 建议卡 | 结构一致，**文案与形态联动有缺口**（§5.3） |
| 工作台右栏 | 有（`BohWorkPanel`，仅 ≥1024×600） | Codex 无对应物 —— 这是 BOHAI 的**差异化优势** |

**结论：骨架不缺，缺的是交互密度。** 下面按「用户能感知到的收益」排序。

### 5.2 P0（建议立刻做，与命令修复同批）

| # | 项 | 为什么 | 成本 |
| --- | --- | --- | --- |
| 1 | **斜杠命令修复**（第一部分） | 用户明确要求；且现在是「UI 主动教用户写错」 | 小 |
| 2 | **空态副标题按形态给全** | work 形态没有快捷键提示（见 §5.3） | 极小 |
| 3 | **未知命令不静默当文本发** | 防止未来加命令时再次漏入口 | 极小 |
| 4 | **修 `isCommandMode` 死代码** | 只被置 false、从不置 true ⇒ 两条互斥 watch 恒不触发；属死代码，lint 棘轮也受益 | 小 |

### 5.3 空态文案缺口（实测）

```
结论：空态副标题按形态取值，work 形态的 subtitle 只讲产物、不含任何快捷键/命令提示；chat 形态的 subtitle 含 Enter/Shift+Enter/`/` 三条提示
判据：读 src/views/BOHAI/BOHAI/components/BohEmptyState.vue:86-95   （2026-10-08）
```

现状（`BohEmptyState.vue` 的 `COPY`）：

| surface | title | subtitle |
| --- | --- | --- |
| `chat` | 今天想聊点什么? | `Enter 发送 · Shift + Enter 换行 · 输入 / 唤起命令` |
| `work` | 今天要做点什么? | `产物会在右侧工作台生成，可预览与下载` |

⇒ **work 形态的用户不知道有 `/` 命令**（而 work 恰恰是建议卡带 `/cloud` 的那个形态，§1.3）——
这是把「教用户用命令」和「命令不可用」两个缺陷叠在了一起。

### 5.4 P1（下一批，中等成本）

| # | 项 | 现状证据 | 收益 |
| --- | --- | --- | --- |
| 1 | **composer 加 `+` 附件钮** | 全 BOHAI 零附件入口（`grep -i paperclip src/views/BOHAI/` → 0） | 对齐 Codex 最显眼的一处；但**依赖上传/解析能力**（见 `docs/2026-10-05` 的 P1 ⑥） |
| 2 | **消息操作加「重新生成」** | 助手消息操作行只有：复制 / 赞同 / 不赞同 / 更多 / 删除（`BohChatStream.vue:254-290`）；`regenerate` 全仓 0 命中 | 高频操作，纯前端（截断到该条 + 重发） |
| 3 | **会话列表项目分组** | 现按日期分组，无 project 概念；会话存 localStorage（`bohai-chat-session-store.js`，上限 **20** 条） | ⚠️ **成本被低估的陷阱**：会话只存 localStorage 且上限 20 ⇒ 项目分组要么接受「项目也是本地态、只对本人可见」，要么先做会话上云。**建议先做前者**（标记为主观分组，不做同步） |
| 4 | **composer 顶部元信息条** | Codex 在输入框上方显示「项目 / 本地 / 分支」。BOHAI 的对应物是**已附加的页面上下文**（`attachedContext`）—— ⚠️ 但该入口**当前不可达**：`setAttachedContext` 被 expose 却**零调用点** | 把不可达的 UI 接上，或删掉。二选一，别留着 |
| 5 | **修 `boh-ai-focus-composer` 断链** | `App.vue:229` 派发，全仓 0 监听（见 §2.3） | 让 ⌘K 在岛已打开时真的聚焦输入框 |

### 5.5 P2（大改动，先拍板再设计）

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | **推理过程可展开** | 现状推理内容被**主动剥离**（`useGenerationPipeline.js:315` / `:345`），消息流里只有一颗呼吸点（`boh-thinking-dot`）。要做成 Codex 那种「Thought for Ns ▾」可展开块，需**改剥离逻辑为分流**（保留而非丢弃）—— 动到生成管线的核心，须先评估对既有「纯文字流」口径的冲击（`plans/023` 用户拍板过「保留纯文字流」） |
| 2 | **键盘快捷键补齐** | 现状：`/` 不是快捷键（只靠输入）、无命令面板、无焦点快捷键（`boh-ai-focus-composer` 断链）。⚠️ `⌘K` **已被 AI 岛占用**（`useGlobalAiPreferences.js:57`），`/` 已给全局搜索（`AGENTS.md` §全局搜索）。⇒ 新快捷键必须先做占用表，否则必然冲突 |
| 3 | **审批模式（Codex 的「请求批准」）** | BOHAI 的任务面板有 `pending`（标签「待开始」）但**没有任何用户审批闸门**。做这个的前提是 Work 形态真的有「会改动外部状态的动作」—— 即 `docs/2026-10-05` 的 generator/agents 落地之后。**现在做等于给不存在的功能做 UI** |

---

## 6. 明确不建议做的（避免为了「像」而破坏既有设计）

| # | 不建议 | 理由 |
| --- | --- | --- |
| 1 | **照搬 Codex 的「项目 / 分支」到会话列表首位** | BOHAI 的会话是**个人问答**，不是代码仓库；没有 git 语义可挂。P1-3 的「主观分组」是上限 |
| 2 | **删掉 Work 面板去对齐 Codex 的单列布局** | 工作台是 BOHAI 的**差异化能力**（Codex 没有产物面板），删了是自伤 |
| 3 | **把用户气泡也去掉** | 已拍板（`plans/023` 步骤 ⑥）：保留用户气泡、AI 回复不放气泡 |
| 4 | **为斜杠命令新增独立浮层组件** | 现有 `.boh-slash` 已满足（含 listbox 语义 / `aria-selected` / 键盘导航），**不要因为「像 Codex」而重写一个**。本次只改数据流（§3.1），不动 DOM |
| 5 | **在 `verify` 链里新增门禁来解决本问题** | 本次缺陷的性质是「**接线漏了**」，而这正是探针 + 单测接线守卫的职责（本仓惯例：探针不进 CI，接线由单测锁）。新增门禁无法机器化判断「未来第 4 个入口是否也接了命令」 |

---

## 7. 与三道棘轮 / 设计真源的关系（开工前必读）

| 约束 | 影响 |
| --- | --- |
| `check:important-budget`（BOHAI 名下约 497） | §3 的修复**不应新增任何 `!important`**；若必须，先想办法绕开 |
| `check:dark-tokens:strict` | 新提示文案若加样式，**裸色值必须走 `--boh-*` 令牌**（真源 `BOHAI/BOHAI/styles/tokens.css`） |
| `check:layering`（169/37 文件） | §3 新增的 `bohai-slash-commands.js` 是**纯函数**，不得出现 `supabase.from/rpc/functions.invoke` |
| 组件行数阈值 | `BOHAIMain.vue` 现 **2,203 行**；`plans/025` Step 7 目标「组件 400 行」**未达**。§3 的改动应在 `BOHAIMain` **之内**完成（新增 `handleSend` 约 15 行），**不要**顺手抽 composable —— 那是 Step 7 的工作，混做会让自证范围失控 |
| `plans/025` 红线 1 | `agents/` + `expert-roles/` + `engine/` 三层**不动**。§3 的新模块放在 `BOHAI/BOHAI/`（视图层旁），不碰这三层 |
| 三形态 | 改动必须在 **独立页 / AI 岛** 两形态下都自证（第三种「用户空间内嵌」已随底栏收席下线） |

---

## 8. 建议的落地顺序

```
第 1 步（P0，一次提交）：斜杠命令修复
  ├── 新增 bohai-slash-commands.js（定义 + 解析 + 菜单构造）
  ├── BOHAIMain 加 handleSend 闸门，改 @send 绑定
  ├── 空态 work subtitle 补命令提示
  ├── 新增 tests/unit/bohai-slash-commands.test.js（6 类解析 + 接线守卫）
  ├── 扩展 probe-bohai-composer.mjs（A8 后加 3 条执行语义断言；场景 B 加 1 条）
  └── 自证：verify + 上述探针 + 反证一次

第 2 步（P0，可与第 1 步同批或紧随）：清死代码
  ├── isCommandMode（只被置 false）
  └── 二选一：接上 setAttachedContext，或删掉这段不可达 UI

第 3 步（P1，需拍板）：composer + 消息操作
  ├── 消息「重新生成」
  └── composer `+` 附件钮（依赖上传能力，见 docs/2026-10-05 P1⑥）

第 4 步（P1/P2，需拍板）：推理过程可展开（动生成管线，单独评估）
```

---

## 9. 待用户拍板的问题

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 未知命令（`/xyz`）**拦住**还是**放行当文本**？ | **拦住 + 提示**，并留 `//` 转义做逃生口（§3.4） |
| 2 | 带参数命令（`/cloud 素材…`）语义是「开开关 + 把参数当消息发」吗？ | **是**（否则 §1.3 的建议卡永远无法工作） |
| 3 | 会话「项目分组」要不要做？ | **可做，但只做本地主观分组**，不要先做会话上云 |
| 4 | 推理过程要不要展开显示？ | 涉及「纯文字流」既定口径，**建议单独决策** |
| 5 | 本次是否**顺带**抽 `plans/025` Step 7 的 composable？ | **不建议**。混做会让自证范围失控 |

---

## 10. 判据索引（本文所有量化结论的可重跑命令）

| 结论 | 判据 | 实测日期 |
| --- | --- | --- |
| 三条失败路径（桌面/带参数/未知命令/触发空态卡）全部实测 | `node scripts/probes/probe-bohai-slash-commands.mjs` → **1/7 通过**（修复前） | 2026-10-08 |
| 移动端 `pointer:coarse` 为 true 且命令全部失效 | 同上，场景 B（`hasTouch` + `isMobile`） | 2026-10-08 |
| `runSlashCommand` 只有 2 个调用点 | `grep -rn "runSlashCommand" src/ \| wc -l` → 3（含定义） | 2026-10-08 |
| 逻辑层零斜杠处理 | `grep -rn "slash" src/views/BOHAI/{composables,engine,domain}/ \| wc -l` → **0** | 2026-10-08 |
| `isCommandMode` 只被置 false | `grep -rn "isCommandMode.value = true" src/` → 空 | 2026-10-08 |
| `boh-ai-focus-composer` 只有派发无监听 | `grep -rn "boh-ai-focus-composer" src/ \| wc -l` → **1** | 2026-10-08 |
| `setAttachedContext` 被 expose 但零调用 | `grep -rn "setAttachedContext" src/ \| wc -l` → 4（定义 + 2 传递 + 1 expose） | 2026-10-08 |
| `data-surface` 无 CSS 消费者 | `grep -rn "data-surface" src/ --include="*.css" \| wc -l` → **0** | 2026-10-08 |
| 原探针从未验证命令执行 | `grep -c "boh-slash-item" scripts/probes/probe-bohai-composer.mjs` → 0 | 2026-10-08 |
| 助手消息无「重新生成」 | `grep -cE "regenerate\|retryMessage\|editMessage" src/views/BOHAI/BOHAI/components/BohChatStream.vue` → 0 | 2026-10-08 |
| BOHAI 无附件入口 | `grep -ri "paperclip" src/views/BOHAI/ \| wc -l` → 0 | 2026-10-08 |
| 会话上限 20 条且只存 localStorage | `grep -n "MAX_ITEMS\|STORAGE_KEY" src/utils/bohai-chat-session-store.js` | 2026-10-08 |
| 外壳行数（修 bug 前基线） | `BOHAIMain.vue` 2,203 / `BohComposer.vue` 650 / `BohSidebar.vue` 517 / `BohChatStream.vue` 563 / `BohaiSettingsPanel.vue` 2,704 | 2026-10-08 |

> 判据脚本 `scripts/probes/probe-bohai-slash-commands.mjs` **已随仓库落盘**（探针目录随 clone 分发），
> 不依赖 `output/`（已 gitignore，不随仓库走）。
> 它现在是**预期红**的判据 —— 修复完成后应转 7/7 全绿，且必须做文件头列出的三条反证。
