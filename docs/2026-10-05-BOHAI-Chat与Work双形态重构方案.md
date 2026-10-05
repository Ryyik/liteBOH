# BOHAI 双形态重构方案 —— BOHAI Chat / BOHAI Work（2026-10-05）

> 需求（用户原话）：把 BOHAI 彻底重构，支持 **BOHAI Chat**（注重网络搜索与实时准度）与
> **BOHAI Work**（注重 PPT / Word 能力），并"接入 GitHub 上好用的插件"，重构整个产品形态。
>
> 本文是**调研 + 方案**，不是执行计划。拍板后应转成 `plans/025-*.md`（按本仓惯例，`plans/` 放编号执行计划）。
>
> **与既有文档的关系（重要，别重复劳动）**：
> - `docs/2026-09-24-BOHAI-AI配置开源方案调研.md` —— 视角是**"多平台多 key 的模型接入层"**（provider 降级链、LiteLLM/Portkey 语义）。本文 §4 直接复用它已定稿的 `fallback_chain` 设计，不重开。
> - `docs/2026-10-04-GitHub开源可引入方案调研.md` —— 视角是**"让 AI 更好地开发本项目"**（Supabase MCP / Chrome DevTools MCP / Knip / ast-grep 等**开发工具链**，不进产物）。
> - **本文视角是第三种：让 BOHAI 产品本身获得新能力**（联网搜索质量 + 文档产物）。三者互不重叠。

---

## 0. 结论速览

**一句话**：BOHAI 现在是一个**"很会查站内、不太会查外网、完全不会出文件"**的站内问答助手。
要变成双形态，缺的不是"再加几个功能"，而是**缺一层统一的"工具/能力层"**——
现有 9 个读连接器是它的雏形，但只有"读"，没有"生成"，也没有"形态"概念。

**三步走**：

| 阶段 | 做什么 | 为什么是这一步 |
| --- | --- | --- |
| **P0** | ① 形态开关（Chat / Work）② 接一路正式搜索 API（博查）并打通时效标注 ③ Work 最小闭环：docx 生成 → 下载 | 三件互相独立、都能单独交付自证 |
| **P1** | ④ PPT 生成（HTML 中间层 + 导出）⑤ 抽 `Tool Registry` 把 connector/generator/action 统一 ⑥ 上传文件解析（PDF/DOCX/XLSX 当上下文） | 建立在 P0 的产物闭环上；Registry 是"插件化"的实体 |
| **P2** | ⑦ Work 接 `agents/` 集群（多步任务）⑧ 修「发送到创作工作台」断链 ⑨ 可选 MCP 桥接 | 依赖前面稳定；P2 是锦上添花，可砍 |

**关于"插件"**：这个词有三种可能含义，方案必须分开处理（见 §2）。
**推荐 A + B**（前端 JS 库 + 自研工具层），**不建议现在接 MCP（C）**，理由见 §2.3。

---

## 1. 现状诊断：BOHAI 有什么、缺什么

> 本节结论来自代码勘察（文件 + 行号），不是印象。

### 1.1 已经有的（真的在跑）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| 主编排 | `src/views/BOHAI/composables/useChatEngine.js`（**2696 行**） | 真跑 |
| 真流式生成 | `useChatEngine.js:2252` 直连 `callVaultSiliconChatStream` + 自建 SSE 解析 | 真跑 |
| 9 个只读连接器 | `useKnowledgeRetrieval.js`（Cloud+/公共记忆/知识库/操作手册/论坛/私域/健康/站内活动） | 真跑 |
| 3 个写动作 | `utils/bohai-connectors.js:31`（createPost / saveSharedMemory / createPage） | 真跑 |
| **真联网搜索** | `bohai-engine-helpers.js:823` → EF `runtime-free-search` → `searchfree.site/api/search` | 真跑（免费通道） |
| Tavily 通道 | EF `api-key-vault/index.ts:1259` 已实现，前端封装 `searchVaultTavily` 已存在 | **已建未接** |
| 模式体系 | DB `bohai_model_configs` → RPC → `useModelConfig.js`（fast/pro/multimodal/plan/agent-cluster） | 真跑 |
| Agent 集群 | `agents/` 全套（Orchestrator/Synthesizer/workers/MessageBus/TaskScheduler） | **活但被 DB 开关闸住**（需 `mode_id='agent-cluster'` 存在才可达） |
| 会话导出 | `BOHAIMain.vue:1194`（JSON blob 下载） | 真跑 |

### 1.2 缺的（本方案要补的）

| 缺口 | 证据 | 影响 |
| --- | --- | --- |
| **没有任何文档产物能力** | 全仓无 PPT/Word/Excel 生成代码 | Work 形态的全部内容 |
| **网页生成 →「发送到创作工作台」是断链** | `action-draft-formatters.js:17` 只输出提示文案；全仓无消费 `pageHtml` 送进 Creator Studio 的代码 | 已有能力白做 |
| **搜索结果无时效标注** | 搜索通道只回内容，不带 `published_date` 的强制使用 | Chat"实时准度"的核心 |
| **模式级 `promptAppendix` 不生效** | `useChatEngine.js:1139` 读了 `runtimeChatModes.find(...)?.promptAppendix`，但 `buildBohaiRuntimeModels`（`bohai-model-config-api.js:123-133`）**没有输出该字段** → 恒空 | 模式只靠"换模型+换参数"区分，形态语义无处承载 |
| **无"形态"概念** | 现在只有"模式"（= 模型档位） | Chat/Work 无处挂 |
| **EF 无跨 provider 降级** | `api-key-vault/index.ts:936/978` 单次 fetch，无重试 | 搜索/生成任一路挂掉就整体失败 |

### 1.3 一个必须先纠正的认知

**"模式"≠"形态"。** 现在的 5 个模式（fast/pro/plan/…）语义是**"用哪个模型、给多少预算"**，
是商业化档位（`min_tier` + `quota_multiplier`）。而 Chat/Work 是**产品形态**——
决定"有哪些工具可用、产物落到哪里"。

⇒ **不要在 `bohai_model_configs` 里塞 `mode_id='chat'/'work'`**，那会把"模型档位"和"产品形态"
两个正交维度耦合成一维。正确做法见 §7。

---

## 2. 先厘清：你说的"插件"是哪种

"接入 GitHub 上好用的插件"有三种完全不同的技术路径，混在一起会做错。

### 2.1 A. 前端 JS 库（npm 引入）—— 最直接

把 GitHub 上的开源库直接 `npm install`，在浏览器里跑。

| 用途 | 库 | 说明 |
| --- | --- | --- |
| **生成 PPTX** | `pptxgenjs`（6.2k★） | 纯浏览器，OOXML 原生，支持母版/图表/表格/亚洲字体；双 ESM/CJS，零运行时依赖（仅 JSZip） |
| **HTML → 可编辑 PPTX** | `dom-to-pptx`（34K 周下载） | 把 DOM 逐元素映射成原生 PowerPoint 形状，保留渐变/阴影/圆角；支持 `svgAsVector` 让图表保持可编辑 |
| **生成 DOCX** | `docx`（dolanmiu，9.8.1） | TS 优先、零依赖、浏览器+Node；表格/图片/形状/图表/页眉页脚/TOC/脚注齐全 |
| **生成 DOCX（新版）** | `@office-open/docx` | 额外提供 `parseDocument` / `patchDocument`（模板占位符替换），JSON Schema 友好，**更适合 AI 生成结构化输入** |
| **生成 XLSX** | `SheetJS`（xlsx） | 事实标准 |
| **生成 PDF** | `pdf-lib` | 纯前端 |
| **解析 PDF** | `pdf.js` | Mozilla 官方 |
| **解析 DOCX** | `mammoth.js` | → 干净 HTML，**适合"把文档当上下文"**（vs `docx-preview` 是给人看的保真预览） |
| **解析 XLSX** | `SheetJS` | 同上 |

**成本**：几乎为零（无服务器）。**风险**：bundle 体积（见 §9.2 的懒加载要求）。

### 2.2 B. 自研"工具层"（Tool Registry）—— 真正让 BOHAI 可扩展的那层

把"能力"抽象成声明式工具：`id / label / 形态归属 / 触发 / 参数 schema / 执行器 / 权限计费 / 产出形态`。

**现有代码其实已经是雏形**：`src/utils/bohai-connectors.js` 的
`createBohAIConnector({ id, planKey, label, layer, requiresLogin, read })` —— 但它只有"读"。

借 Open WebUI / Dify 的思路（**只借设计，不引框架**）：
- **Open WebUI**：`Tools`（模型可调用的能力）+ `Functions`（Pipe/Filter/Action/Event，改平台行为）+ `Valves`（每个插件的配置项）。插件是 Python 模块，**无沙箱**。
- **Dify**：`Plugin Daemon`（独立 Go 服务）+ 权限声明（`memory_size_mb` / `max_execution_time_seconds` / `permission.tool.enabled` …）+ `.difypkg` 包 + Marketplace。

⇒ **Dify 那套（独立守护进程 + 隔离运行时 + 插件市场）对 BOH 是过度设计**：
那需要一台常驻服务 + 沙箱 + 签名链，而你的插件作者就是你自己。
**要借的是"声明式 + 权限位 + 可开关"，不是"第三方上传沙箱"。**

### 2.3 C. MCP 服务器（远程桥接）—— 不建议现在做

MCP 生态确实火（`markitdown` 119k★、官方 `modelcontextprotocol/servers` 84k★），
但**接入到 BOHAI 这个 Web 多租户 SPA 里，收益极低、成本极高**：

| 障碍 | 具体 |
| --- | --- |
| **传输** | stdio 需进程共存（Web 端不可能）；唯一远程传输 Streamable HTTP，SSE 已于 **2026-04-01 EOL** |
| **鉴权** | 远程 MCP 要求 OAuth 2.1 + RFC 9728/8414/7591/8707 + PKCE，**每个 server 要单独注册 client** |
| **成本** | 每个连接的 MCP server 光 schema 注入就烧 **2000–5000 token** |
| **业务错配** | 主流 MCP 是给**开发者桌面**用的（GitHub / Figma / Linear / Notion / Sentry / Stripe / Postgres），**BOH 站内用户用不上** |
| **架构冲突** | 本仓既有判断已否掉 LangChain.js / Vercel AI SDK（"OpenAI 协议直发 + 自建 EF"下是负收益），MCP 桥接属同类引入 |

**例外**：如果 BOHAI 要服务**站长/开发者**场景（"帮我查这个 PR"、"这个库的 API 是什么"），
可以 P2 桥接 **GitHub MCP**（官方，Go，`api.githubcopilot.com/mcp`）或 **Context7**（拉版本锁定的库文档）。
那时是**在 EF 里做 MCP client**，不是在前端接。

### 2.4 小结

| 解读 | 做不做 | 何时 |
| --- | --- | --- |
| A 前端 JS 库 | ✅ **做**，这是"接入 GitHub 好用的插件"最直接的答案 | P0-P1 |
| B 自研 Tool Registry | ✅ **做**，这是"重构产品形态"的骨架 | P1 |
| C MCP 桥接 | ❌ 现在不做；只**借鉴 tool schema 设计** | P2（且仅开发者场景） |

---

## 3. Chat 形态：网络搜索与实时准度

### 3.1 现状的真实水平

- **当前生效的通道（2026-10-05 起）**：Tavily 优先 → `searchfree.site/api/search` 兜底（见 §3.5）；
- Tavily 的 key 走 **EF 环境变量 `TAVILY_API_KEY`** —— `api_key_vault` 表里**没有** tavily 记录，
  靠 `resolveActiveSecret` 的 env 回落（`index.ts:989-1023`）⇒ **现网无需在控制台额外配 key**；
- ⚠️ **实测：联网搜索已两个多月零流量** —— `ai_web_search_log` 全表仅 **22 行**，集中在
  2026-07-16 ~ 07-27，之后一条都没有（查询口径见 §3.5）。**接 Tavily 之前先确认这条路还跑得通**；
- EF 的 provider 白名单里**已有 `tavily`**（`api-key-vault/index.ts:31`）；
- 搜索结果**没有强制时效标注**；
- ⚠️ **时效参数只有 Tavily 路径能生效**：前端已按 `getWebSearchFreshnessDays`（`bohai-engine-helpers.js:807`：
  命中"今天/这几天"→7 天，"最近/最新/本周/本月/新闻"→30 天）算出 `days` 并放进 payload，
  Tavily 分支（`runtimeTavilySearch:1253-1256`）会透传；但免费分支 `runtimeFreeSearch`
  （`index.ts:1285-1293`）重建请求体时会**丢掉 `days`** ⇒ 兜底路径上没有时效收窄（待确认上游是否支持后修）。
- EF **没有跨 provider 降级** —— 本次只做了**前端**的优先/兜底（足以覆盖当前需要），
  EF 内的 `fallback_chain` 仍属未做项。

### 3.2 候选选型（按"大陆可达 + 成本 + 质量"）

| 方案 | 价格 | 大陆直连 | 特点 | 定位 |
| --- | --- | --- | --- | --- |
| **博查 Bocha** | **¥0.036/次**（36元/千次），1000 次免费 | ✅ | 专为 AI 优化，响应 0.15s，返回标题/链接/**摘要/发布时间**；自然语言 + 时间范围 + 站点范围 | ⭐ **主力** |
| 阿里云百炼 Web Search | 8–29 元/千次，2000 次免费 | ✅ | 支付宝直付；MCP 形态也有 | ⭐ **降级备选** |
| Tavily | $0.004/次，1000/月免费 | ⚠️ 需代理 | agent 原生，<1s，官方 MCP | 英文/研究场景 |
| Brave Search | $0.003/次，2000/月免费 | ⚠️ 需代理 | **独立索引**（不依赖 Google/Bing），2026 基准准确率最高（14.89） | 可选 |
| Exa | $0.004/次 | ⚠️ 需代理 | 神经/语义检索 | 可选（找论文/相似源） |
| Firecrawl | $16/月起 | ⚠️ 需代理 | 抓取+搜索一体，JS 渲染，96% 覆盖率 | **网页深读** |
| Jina Reader | 免费额度大（r.jina.ai 前缀即用） | ⚠️ 需代理 | 单页 → markdown，**原生支持 PDF 提取** | **网页深读（首选）** |
| 现状 free-search | 免费 | ✅ | 不可控 | 兜底 |

> ⚠️ **大陆可达性是硬约束**：本仓已实测 `huggingface.co` / `cdn-lfs.huggingface.co` 返回 **000**，
> `res.cloudinary.com` 同样不可达。海外搜索 API 必须**经 EF/Worker 代理**，且要有超时兜底。

### 3.3 推荐架构：EF 内多路搜索 + 降级链

**直接复用 `docs/2026-09-24-BOHAI-AI配置开源方案调研.md` 已定稿的 `fallback_chain` 设计**
（那篇已论证过语义：等价候选静默切换、临时候选 UI 明示、按实际模型扣费）。搜索侧只需：

```
search 请求
  ├─ 候选 1: 博查（中文实时，主力）
  ├─ 候选 2: 百炼 / Tavily（降级）
  └─ 兜底:   现有 free-search（免费）
深读（需要打开具体页面时）
  └─ Jina Reader（免费优先） → Firecrawl（JS 重站 / 需要结构化抽取）
```

**落点**：`supabase/functions/api-key-vault/index.ts` 的 `runtimeFreeSearch`（`:1278`）旁边加
`runtimeBochaSearch`，走同一套 `resolveActiveSecret` + `validateRuntimeApiUrl`。

### 3.4 "实时准度"不只是换 API —— 五件事一起做

换搜索源只解决"能不能搜到"，"准不准、新不新"还要做五件：

| # | 动作 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 请求带 `freshness`（day/week/month） | EF + `searchWebForPrompt`（`bohai-engine-helpers.js:823`） | 时效词命中时收窄时间窗 |
| 2 | 结果**强制**带 `published_date` 进 prompt | `buildStructuredUserPrompt`（`useChatEngine.js:1903`） | 现在只回内容，模型无法判断新旧 |
| 3 | 与既有 `<stale_evidence_note>` 打通 | `plans/024` 已落地的陈旧证据机制 | 搜索证据走同一条时效裁决 |
| 4 | 热查询短 TTL 缓存 | 复用 `createMemoryTtlCache` | 省钱 + 提速，同一问不重复计费 |
| 5 | 引用编号 `[W1]/[W2]` 覆盖新通道 | `utils/ai-chat-grounding.js` | 已有协议，新通道必须产出同样编号 |

> `EVIDENCE_SOURCE_WEIGHTS`（`bohai-constants.js:20`）里目前**没有 web 源**——
> 联网证据在多源竞争预算时落 `defaultSourceScore` 垫底。接正式搜索后应给它一个权重位。

### 3.5 已落地：Tavily 优先 + 免费兜底（2026-10-05）

**只改了一个文件**（EF 侧零改动 —— 执行器、计量、key 回落本来就都齐了）：

| 文件 | 改动 |
| --- | --- |
| `src/views/BOHAI/composables/bohai-engine-helpers.js` | `searchWebForPrompt` 改为 Tavily 优先、失败回落免费通道；新增 `resetTavilySearchAvailability()` 导出与 `provider` 返回字段 |
| `tests/unit/bohai-web-search-fallback.test.js` | **新增 · 9 条**（这条链路此前**零覆盖**） |

**行为要点**：

- **两段式超时**（各 12s，合计 ≤24s），不撞 `useChatEngine` 那层 30s 的 `AbortSignal`；
- **配置类失败只白试一次**：Tavily 报「未找到该 API Key / 已停用」时置模块级标志，其后直接走免费通道
  （避免每轮多一次无效请求）；补配 key 后需刷新页面。瞬态失败（网络/超时/5xx）**不记标志**，下一轮仍优先试 Tavily。
- `disabled` 语义**不变**：只由兜底通道的错误判定 —— 瞬态错误不会误关用户的联网开关。
- 返回值新增 `provider: 'tavily' | 'free' | null`，便于观测与后续探针断言。

**成本口径（必须记住）**：Tavily key 是**全站共享一把**，免费 1000 次/月（≈33 次/天），
超出 $0.004/次（≈¥0.029）；而 `web_search_daily_limit`（free 10 / plus 30 / pro 60 / max 120 / ultra 240）
是**每用户**限额，拦不住总量。当前实际用量为 0（见 §3.1），短期无压力；一旦上量，要么收敛触发条件，要么换博查。

**上线前应先确认的事**：`ai_web_search_log` 两个多月零记录，既可能「没人用」也可能「路断了」。
建议先在前端手动开一次联网搜索、把 Tavily 与免费两条路径各走一遍，再判断是否需要更深排查。

**查询口径**（Management API，只读）：

```sql
select count(*), min(created_at), max(created_at) from public.ai_web_search_log;
select provider, purpose, status from public.api_key_vault order by provider, purpose;
```

---

## 4. Work 形态：文档产物

### 4.1 核心技术决策：产物在前端生成，不在后端

| | **前端生成**（推荐） | 后端生成（EF/Worker/Python） |
| --- | --- | --- |
| 候选 | `pptxgenjs` / `docx` / `dom-to-pptx` / `SheetJS` | `python-pptx` / `python-docx` / `PPT Master`(55k★, Python) |
| 服务器成本 | **零** | Supabase EF 有 CPU/wall 时间限制；大文件易超时 |
| 隐私 | 文件不出浏览器 | 需上传到服务端 |
| 体验 | **即时下载 + 可预览可编辑**（改文字不用重跑 AI） | 需轮询/回调 |
| 移动端 | 内存吃紧（见 §9.2） | 服务端承担 |

**推荐前端生成**：这三个库**都明确支持浏览器**（PptxGenJS 官方文档点名 `Serverless / Edge Functions` 与 Vite/React/Vue；
`docx` 官方有浏览器/Vue 示例；`dom-to-pptx` 就是客户端库）。零服务器成本 + 预览编辑 = 能做出 Gamma 式体验。

### 4.2 Work 主链路

```
用户需求（"帮我做个 XX 的项目汇报 PPT"）
  ↓ 【规划】LLM 输出结构化 spec（JSON：标题 / 每页标题+要点+备注 / 需要的图表数据）
  ↓ 【渲染】前端把 spec 渲染成 HTML 幻灯片（可预览、可就地改文字）
  ↓ 【导出】PPTX: dom-to-pptx 或 PptxGenJS ｜ DOCX: docx ｜ XLSX: SheetJS ｜ PDF: pdf-lib
  ↓ 【下载】Blob → 本地
```

**为什么加一层 HTML 中间层**（而不是直接用 PptxGenJS API 硬拼）：
1. 能复用现有设计语言（液态玻璃 / tokens），产物**好看**；
2. **可预览可编辑**——用户改一个错别字不必重跑 AI；
3. `dom-to-pptx` 保留渐变/阴影/圆角/SVG 矢量，保真度高。

**两条路都留**：
- 视觉简单、结构化强（数据表 / 纯文字 deck）→ `PptxGenJS` 直接生成（更可控，原生母版/图表）；
- 视觉复杂、要好看 → HTML → `dom-to-pptx`。

### 4.3 上传文档当上下文（Work 的另一半）

用户说"把这份 PDF 变成 PPT"——就必须先能**读**：

| 格式 | 库 | 说明 |
| --- | --- | --- |
| PDF | `pdf.js` | 行业标准，文本选择/搜索 |
| DOCX | `mammoth.js` | → 干净 HTML，适合喂 LLM（**不是**给人看的保真预览） |
| XLSX | `SheetJS` | 解析 → JSON |
| PPTX | 需解 OOXML（`JSZip`）或只取文本 | ⚠️ 没有像 mammoth 那样成熟的"PPTX → 结构化"JS 库 |

> 备份方案：GitHub 上的 `microsoft/markitdown`（119k★，PDF/Office/HTML/图片 → Markdown）
> **是 Python**，要放后端（EF/Worker 里跑不了）。如果 Work 形态以后端为主，它是首选；前端方案里用 mammoth/pdf.js 替代。

### 4.4 图片

Work 产物大概率要配图。BOHAI **当前没有图片生成能力**。三个选择：
① 复用站内素材库；② 接文生图；③ 留白让用户自己插。
⚠️ 若接文生图，**必须过现有 `utils/content-moderation.js`**，且注意成本与合规。

---

## 5. 插件体系：Tool Registry 设计（B 方案）

这是"重构产品形态"的骨架。目标：把现有散落的 connector / action / 未来的 generator 收进**一张注册表**。

### 5.1 工具的形状

```js
// src/views/BOHAI/tools/types.js（示意）
{
  id: 'bochaSearch',
  label: '联网搜索',
  category: 'web',              // retrieval | web | generator | action
  surfaces: ['chat', 'work'],   // 形态归属 —— 这是"形态"概念的落点
  trigger: { keywords: [...], intents: [...], modelDecided: true },
  params: { type: 'object', properties: { query: {...}, freshness: {...} } },
  run: async (params, ctx) => ({ ok, data, context, evidenceRefs, artifacts }),
  requiresLogin: false,
  minTier: 'guest',
  quotaMultiplier: 1,
  output: 'context',            // context（喂模型） | artifact（给用户下载）
}
```

### 5.2 四类工具与现有代码的映射

| category | 现有落点 | 改造 |
| --- | --- | --- |
| `retrieval` | `createBohAIConnector` + 9 个连接器 | **包一层，不改内部** |
| `web` | `searchWebForPrompt`（free-search） | 升级为多路 + 新增深读 |
| `generator` | **无** | 新增（docx/pptx/xlsx） |
| `action` | `createBohAIAction` + 3 个写动作 | **包一层，不改内部** |

### 5.3 形态 = 工具集的子集

```
Chat 形态 = retrieval + web                        （偏"回答"）
Work 形态 = retrieval + web + generator            （偏"交付物"）
```

这样"切换形态"就只是**换工具集 + 换系统提示 + 换默认产出**，
不需要复制两套引擎——避免 `useChatEngine.js` 从 2696 行变 5400 行。

### 5.4 与 agents/ 集群的关系（顺带激活一个死能力）

`agents/`（Orchestrator / Synthesizer / workers / MessageBus / TaskScheduler）**已经写好了**，
只是被 `mode_id='agent-cluster'` 这个 DB 开关闸着。它天然适合 Work 形态的**多步任务**：

```
Work 任务："做一份 20 页的市场分析 PPT"
  → Orchestrator 拆解（大纲 → 数据 → 配图 → 排版）
  → 多个 worker 并行产出各章节（RetrieverAgent 负责搜数据）
  → Synthesizer 合并成 spec
  → 前端渲染 + 导出
```

⇒ **P2 不必新写，只需让 Work 形态默认挂上集群**。这也顺带回答了"agents 目录是不是死代码"——
它不是死代码，是**未被接入的能力**。

---

## 6. 架构改造总览

```
现状                                    目标
─────────────────────────              ─────────────────────────
  [用户]
    │
  useChatEngine.js (2696行)              [用户]
    │                                      │
    ├─ 8 connector（硬编码）            [形态路由] Chat / Work
    ├─ 1 搜索（free）                      │
    ├─ 3 action（硬编码）              useChatEngine（瘦身：只做编排）
    └─ agents 集群（DB闸住）               │
                                      [Tool Registry]
                                         ├─ retrieval（9 连接器）
                                         ├─ web（博查/Tavily + Jina/Firecrawl）
                                         ├─ generator（docx/pptx/xlsx）
                                         ├─ action（3 写动作）
                                         └─ cluster（agents/ 集群，Work 默认）
                                            │
                                       [产出层]
                                         ├─ context（喂模型）
                                         └─ artifact（预览 + 导出下载）
```

**`useChatEngine.js` 只做三件事**（现在它做了七件）：形态路由、工具编排、流式渲染。
其余下沉到 Registry。这是"彻底重构"最实质的一步。

---

## 7. 关键设计决定（避免踩坑）

### 7.1 形态不要塞进 `bohai_model_configs`

形态是**产品维度**，模式是**模型/计费维度**，两者正交。落点建议：
- 形态 → 前端设置（`boh_ai_surface_v1`，仿现有 `MODE_SETTING_KEY` 的口径）+ 路由（`/ai-chat` 与 `/ai-work`，或同页 tab）
- 模式 → 保持现状（DB 驱动）

⚠️ 顺带修掉一个既有缺陷：`buildBohaiRuntimeModels`（`bohai-model-config-api.js:123-133`）
**没有输出 `promptAppendix`**，导致 `useChatEngine.js:1139` 读到恒空。
如果 Chat/Work 要靠"形态级系统提示"区分，这个字段必须先补上（否则你以为配了、其实没生效）。

### 7.2 产物生成必须懒加载

`pptxgenjs` + `docx` + `SheetJS` + `pdf.js` + `mammoth` 加起来的体积**不能进首屏**。
- 用 `defineAsyncComponent` / 动态 `import()`，只在进入 Work 形态且真要点"导出"时才加载；
- ⚠️ 本仓有硬约束：**动态模块加载失败要有恢复**（复用 `vite-preload-recovery.js` 的
  `recoverDynamicImportFailure`），组件级 `defineAsyncComponent` 若是全局壳必须带
  `onError` retry + `errorComponent`，否则 chunk 404 = **无声空白**（症状"时好时坏"）。

### 7.3 新增依赖要过门禁

本仓 `check-project-structure` / `lint --max-warnings` 棘轮 / `important-budget` / `dark-tokens`
对**新增依赖与文件位置**敏感（既有调研已就此警告过 unpic 的引入）。新增工具目录
（`src/views/BOHAI/tools/`）前先确认目录规则，并预期 lint 警告数**只许降不许升**。

### 7.4 产物要过内容审核

`utils/content-moderation.js` 目前覆盖对话文本。Work 产出的文档**同样要审**（用户可生成任意内容）。
别让新链路成为审核盲区。

---

## 8. 路线图（可独立交付、可回滚）

### P0（建议先做，三件互不依赖）

| # | 事项 | 落点 | 自证 |
| --- | --- | --- | --- |
| 1 | **形态开关** Chat/Work（含形态级系统提示，先修 `promptAppendix` 断链） | 新 `composables/useSurface.js` + `chat-engine-config.js` + `bohai-model-config-api.js` | 单测 + 探针：切形态后工具集/提示不同 |
| 2 | **接一路正式搜索**（博查）+ 时效标注五件事（§3.4） | EF `index.ts` + `bohai-engine-helpers.js` + `buildStructuredUserPrompt` | 探针断言：结果含日期、时效词收窄窗口 |
| 3 | **Work 最小闭环**：docx 生成 → 预览 → 下载 | 新 `tools/generators/docx.js` + 一个 UI 入口 | 端到端探针：点导出→拿到 Blob→MIME/大小校验 |

### P1

| # | 事项 | 说明 |
| --- | --- | --- |
| 4 | **PPT 生成** | HTML 中间层 + `dom-to-pptx` / `PptxGenJS`；含预览编辑 |
| 5 | **Tool Registry 抽取** | 把 connector/web/generator/action 统一成一张表；`useChatEngine` 瘦身 |
| 6 | **上传文件解析** | PDF/DOCX/XLSX 当上下文 |

### P2（可砍）

| # | 事项 | 说明 |
| --- | --- | --- |
| 7 | Work 接 `agents/` 集群 | 多步任务（大纲→数据→排版→合并） |
| 8 | 修「发送到创作工作台」断链 | 让已有 HTML 生成真正落进 Creator Studio |
| 9 | MCP 桥接（GitHub / Context7） | 仅当要服务开发者场景 |

---

## 9. 成本与风险

### 9.1 搜索成本（必须算清楚）

博查 ¥0.036/次。**日 1000 次 = ¥36/天 ≈ ¥1100/月**。控制手段（现有体系可复用）：
- 复用 `min_tier` / `quota_multiplier`（`bohai_model_configs`）做搜索配额；
- **热查询短 TTL 缓存**（同一问不重复计费）；
- **意图过滤**（`useIntentDetection` 已有，别让"你好"也触发搜索）；
- ⚠️ 口径提醒：预测成本要按"**真实搜索次数**"而不是"请求数"——
  一次对话可能触发 1~7 次内部搜索。

### 9.2 风险清单

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| **移动端内存** | 前端生成大 PPT/XLSX 可能 OOM | 文件大小上限 + worker + 流式导出 |
| **bundle 体积** | 5 个库合计不小 | 强制懒加载（§7.2） |
| **审核盲区** | 产物内容未过审 | 导出前过 `content-moderation` |
| **上游单点** | EF 无降级，搜索/生成任一挂→整体失败 | 复用 `fallback_chain` 设计 |
| **大陆可达性** | 海外库/API/权重域名可能 000 | 一律经 EF/Worker 代理 + 超时兜底 |
| **门禁冲突** | 新依赖可能撞 lint 棘轮 / 结构门禁 | §7.3 |
| **形态与模式耦合** | 塞进同一张表会导致维度爆炸 | §7.1 |

---

## 10. 待你拍板的五件事

1. **"插件"指的是哪种？** A 前端库 / B 自研工具层 / C MCP —— 我的建议是 **A+B，C 暂缓**（§2）。
2. **Work 产物在前端还是后端生成？** 我的建议是**前端**（零服务器成本 + 可预览编辑）。
3. **搜索预算能到多少？** 博查主力 ≈ ¥1100/月 @ 1000 次/天；预算紧就降到"仅时效词触发 + 强缓存"。
4. **Chat / Work 是"两个页面"还是"一个页面的两个模式"？** 影响路由与 IA 设计。
5. **`agents/` 集群要不要作为 Work 底座激活？** 代码是现成的，激活只是放开 DB 开关 + 接线。

---

## 附：本方案的调研来源

| 主题 | 来源 |
| --- | --- |
| 搜索 API 对比 | apiscout.dev Best AI Search APIs 2026；tavily.com 官方对比文；dexto.ai 7 Best Web Search APIs；tokenfind.cn 国内实测（含博查/百炼报价） |
| 博查定价 | 阿里云云市场 + bocha-ai.feishu.cn 官方定价页（¥0.036/次） |
| PPTX 生成 | gitbrent/PptxGenJS（GitHub，6.2k★）；ysmr101/dom-to-pptx；hugohe3/ppt-master（55k★，Python）；presenton（10.6k★，TS） |
| DOCX 生成 | docx.js.org（dolanmiu/docx 9.8.1）；@office-open/docx；docx-templates |
| 文档解析 | pdf.js / mammoth.js / SheetJS 中文网；microsoft/markitdown（119k★） |
| 插件架构参考 | Open WebUI docs（Tools/Functions/Valves）；DeepWiki Dify Plugin Daemon；LobeChat Architecture Design |
| MCP | mcp.directory OAuth 2.1 详解；CodeAlive MCP Transport Types（SSE EOL 2026-04-01）；awesome-mcp.tools 2026 排行 |
| 本仓现状 | `src/views/BOHAI/**`、`src/utils/bohai-*.js`、`supabase/functions/api-key-vault/index.ts`、`docs/2026-09-24-*`、`docs/2026-10-04-*`、`docs/未完成任务清单.md` |
