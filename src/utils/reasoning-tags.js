/**
 * reasoning-tags.js —— 「模型把思考写进 content」的**唯一真源**
 *
 * ## 为什么要有这个文件
 *
 * 2026-10-22 用户报障「BOHAI 里有模型把思考过程直接输出在正文里」→ 实测定位到 Z1
 * （`Code` 模式 / GLM-Z1-Flash）。成因不是「某个标签没写全」，而是**同一条规则被写了四份、
 * 四份都只认 `think`/`thinking`**：
 *
 *   · `useGenerationPipeline.filterThinkingContent`（非流式）—— 有 `^[\s\S]*</think>` 兜底；
 *   · `useGenerationPipeline.filterThinkingContentStream`（流式）—— 只在见到**开口标签**
 *     时才进入思考态；
 *   · `bohai-model-client.extractBohAIJsonObject` 与 `orchestrator-prompt.parseOrchestratorPlan`
 *     —— 各自一份只剥 `<think>` 的正则。
 *
 * ⇒ 症状是「同一个模型，非流式正常、流式泄漏」。**看到这种不对称，几乎一定是这个模块
 *   之外的第二个判断点。**
 *
 * ## 为什么必须认「裸闭合」（Z1 的形态）
 *
 * GLM-Z1 系的对齐方式是把开口标签**替模型说掉**：
 *   · 对话模板（`THUDM/GLM-Z1-9B-0414` 的 `tokenizer_config.json`）里写着
 *     `{%- set visible = content.split('</think>')[-1].strip() %}`；
 *   · 官方 README 的「Enforced Thinking：Add `<think>\n` to the first line」是同一件事。
 * 于是模型自己吐出来的是 `思考……</think>答案` —— **只有闭合、没有开口**。
 * 只认开口标签的过滤器对它**永远不生效**，整段思考连同 `</think>` 进正文。
 *
 * 实测（2026-10-22，直调 `filterThinkingContentStream`）：
 *   `好的，用户问的是 X……\n</think>\n\n这是最终答案。`
 *   ⇒ 修复前 visible 原样返回（整段泄漏，reasoning 为空）；
 *     修复后 visible 为 `这是最终答案。`，reasoning 为那段思考。
 *
 * ## 加标签的规矩
 *
 * **只认有实测证据的标签名。** 每多认一个名字，就多一条「正文被静默吞掉」的可能
 * （模型在回答里贴一段 HTML 示例也会中招）。要加，先把证据写进 commit message。
 */
export const REASONING_TAG_NAMES = Object.freeze([
  // 仓库自己的 prompt（`chat-engine-config.js` 的 plan 模式等）+ DeepSeek-R1 / Qwen3 /
  // GLM-Z1 的部分渠道
  'think',
  'thinking',
  // Gemma 实测形态（`<thought>* Input: …`，见 `cloudflare/gemini-proxy/README.md` §5；
  // `openrouter/free` 免费池里就有 Gemma）
  'thought',
]);

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TAG_ALT = REASONING_TAG_NAMES.map(escapeRe).join('|');

/**
 * 某个标签名的**所有非空前缀**（`think` ⇒ `t|th|thi|think`）。
 * 分块边界会把标签切成两半（`<thi` + `nk>`）；认不出半截，半截就先当正文吐出去，
 * 后面那半截又拼不回来 —— 整段思考就漏了。
 */
const PREFIX_ALT = REASONING_TAG_NAMES.map((name) => {
  const parts = [];
  for (let i = 1; i <= name.length; i += 1) parts.push(escapeRe(name.slice(0, i)));
  return parts.join('|');
}).join('|');

/** 完整开口标签（允许属性）：`<think>` / `<thinking type="x">` */
export const REASONING_OPEN_RE = new RegExp(`<(?:${TAG_ALT})(?:\\s[^>]*)?>`, 'i');

/** 完整闭合标签：`</think>` / `</thought >` */
export const REASONING_CLOSE_RE = new RegExp(`</(?:${TAG_ALT})\\s*>`, 'i');

/**
 * 半截闭合标签（落在块尾）：`</t` / `</th` / `</think` …
 * ⚠️ 名字保留 `PARTIAL_THINK_CLOSE_RE` —— AGENTS.md §2 与单测按这个名字引用它，**别改名**。
 */
export const PARTIAL_THINK_CLOSE_RE = new RegExp(`</(?:${PREFIX_ALT})\\s*$`, 'i');

/** 半截开口标签（落在块尾）：`<t` / `<th` / `<thi` … 与上一条配对。 */
export const PARTIAL_THINK_OPEN_RE = new RegExp(`<(?:${PREFIX_ALT})\\s*$`, 'i');

/**
 * 非流式（一次性拿到全文）时剥掉思考内容：成对的、只有开口的（流被截断）、
 * 只有闭合的（Z1）、以及剩下的孤立标签。
 *
 * ⚠️ 「只有闭合 ⇒ 闭合**之前**全算思考」不是随手写的：Z1 的模板就是这么切可见部分的
 *   （`content.split('</think>')[-1]`）。流式那边必须与它一致，否则同一个模型会出现
 *   「刷新后正文正常、生成时正文带思考」—— 那种不对称用户一定会报。
 */
export const stripReasoningBlocks = (text) => {
  let out = String(text || '');
  if (!out) return '';
  for (const name of REASONING_TAG_NAMES) {
    const tag = escapeRe(name);
    // ① 成对
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    // ② 只有开口（流被截断）⇒ 后面全算思考
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*$`, 'gi'), '');
    // ③ 只有闭合（Z1 形态）⇒ 闭合之前全算思考
    out = out.replace(new RegExp(`^[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    // ④ 剩下的孤立标签
    out = out.replace(new RegExp(`</?${tag}(?:\\s[^>]*)?>`, 'gi'), '');
  }
  return out;
};

/**
 * **只剥完整成对标签**的保守版，给「要从文本里提取 JSON」的调用方用
 * （`bohai-model-client.extractBohAIJsonObject` / `orchestrator-prompt.parseOrchestratorPlan`）。
 *
 * ⚠️ 为什么这两个地方不能用 `stripReasoningBlocks`：它的规则 ②（只有开口 ⇒ 删到结尾）
 *   和 ③（只有闭合 ⇒ 从开头删）是**按「思考一定在正文外侧」**设计的。JSON 提取器面对的
 *   恰恰是「正文本身就是我要的东西」——模型只要在 JSON 里贴一段 `<thinking>` 示例，
 *   规则 ② 就会把 JSON 后半段连同样本一起删掉，解析直接返回 null（表现为编排出错、
 *   降级成 single_worker，且**不报错**）。这里只删成对的，绝不向两侧蔓延。
 *
 * 与 `stripReasoningBlocks` 共用同一份标签名单 —— 加名字仍然只改 `REASONING_TAG_NAMES`。
 */
export const stripPairedReasoningBlocks = (text) => {
  let out = String(text || '');
  if (!out) return '';
  for (const name of REASONING_TAG_NAMES) {
    const tag = escapeRe(name);
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
  }
  return out;
};

/** 文本里是否还残留推理标签（供调用方判断「这段还需不需要再过一遍」）。 */
export const hasReasoningTag = (text) => {
  const value = String(text || '');
  return (
    REASONING_OPEN_RE.test(value) ||
    REASONING_CLOSE_RE.test(value) ||
    PARTIAL_THINK_CLOSE_RE.test(value) ||
    PARTIAL_THINK_OPEN_RE.test(value)
  );
};

/**
 * 「这个模型很可能把思考写进 content」—— **只用于决定流式要不要先按住等判定**，
 * 不发请求、不改配置、不影响任何可见文本。
 *
 * ⚠️ 为什么是启发式：**上游真实模型名不在前端**。前端拿到的是
 *   `availableModels[].id = 'boh:<mode_id>'`（见 `bohai-model-config-api.js` 的
 *   `buildBohaiRuntimeModels`），真实 provider/model 由 Edge Function 在服务端决定 ——
 *   策略行（`balance` / `intelligence`）甚至按「北京日期 + 用户 + mode_id」加权抽候选
 *   （`supabase/functions/api-key-vault/index.ts` 的 `resolveStrategyCandidate`）。
 *   所以这里刻意同时匹配 displayName 与 mode_id，**宁可多认几个**：
 *     漏认 = 正文里先闪一下思考再被撤回（有撤回兜底，最终正文仍正确）；
 *     误认 = 多等一次判定（等到 `</think>` 或超出耐心窗口就照常吐）。
 */
export const REASONING_MODEL_HINTS = Object.freeze([
  'z1',
  'glmz1',
  'glm-z1',
  'deepseek-r1',
  'deepseekr1',
  'r1-0528',
  'qwq',
  'reasoner',
]);

export const isLikelyReasoningModel = (...names) => {
  const key = names
    .filter(Boolean)
    .map((name) => String(name))
    .join(' ')
    .toLowerCase()
    .replace(/[\s_]/g, '');
  if (!key) return false;
  return REASONING_MODEL_HINTS.some((hint) => key.includes(hint.replace(/[\s_-]/g, '')));
};

/**
 * 「这个模型的思考**只有闭合标签**」（= 需要前导暂存的那一族）。
 *
 * 只收 Z1 系 —— 证据见文件头：GLM-Z1 的对话模板把开口标签替模型说了，
 * 所以模型输出以思考正文打头，字面上与「答案开头」无法区分。
 *
 * ⚠️ 为什么必须比 `REASONING_MODEL_HINTS` 窄：命中的代价是**开头被按住**（最多
 *   `LEADING_HOLD_MAX_MS` / `LEADING_HOLD_MAX_CHARS`）。开标签家族（`<think>` 打头）
 *   在第一个块就能判定，按住纯属白等；普通模型更是完全没有按住的理由。
 */
export const BARE_CLOSE_MODEL_HINTS = Object.freeze(['z1', 'glm-z1', 'glmz1']);

export const isLikelyBareCloseReasoningModel = (...names) => {
  const key = names
    .filter(Boolean)
    .map((name) => String(name))
    .join(' ')
    .toLowerCase()
    .replace(/[\s_]/g, '');
  if (!key) return false;
  return BARE_CLOSE_MODEL_HINTS.some((hint) => key.includes(hint.replace(/[\s_-]/g, '')));
};
