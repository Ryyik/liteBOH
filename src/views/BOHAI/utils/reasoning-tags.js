/**
 * reasoning-tags.js —— 推理内容标签的**唯一真源**
 *
 * 2026-10-22（用户报障「Z1 也有推理把思考过程泄露到正文」）：
 *   起因不是「某个标签没写全」，而是**流式与非流式各写了一份标签判断**，
 *   两份都只认 `think` / `thinking`：
 *     · 流式（filterThinkingContentStream）只在见到**开口标签**时才进入思考态；
 *     · 非流式（filterThinkingContent）有 `^[\s\S]*</think>` 兜底，所以**非流式不漏、流式漏**。
 *   ⇒ 「同一个模型，非流式正常、流式泄漏」这种不对称，几乎一定是这个模块之外的第二个判断点。
 *
 * ⚠️ 为什么必须有**裸闭合**这一支（本文件的 `BARE_*`）：
 *   GLM-Z1 系的对话模板（`THUDM/GLM-Z1-9B-0414` 的 `tokenizer_config.json`）里写着
 *   `set visible = content.split('</think>')[-1].strip()` —— 模型输出形如
 *   `思考……</think>答案`，**开口标签由模板替它先说了**，模型自己不会再吐 `<think>`。
 *   官方 README 的「Enforced Thinking：Add <think>\n to the first line」也是同一件事。
 *   所以「只认开口标签」的过滤器对 Z1 **永远不生效**，整段思考连同 `</think>` 进正文。
 *   实测（2026-10-22，`filterThinkingContentStream` 直调）：
 *     `好的，用户问的是 X……\n</think>\n\n这是最终答案。`
 *     ⇒ 修复前 visible 原样返回（整段泄漏）；修复后 visible 为 `这是最终答案。`
 *
 * ⚠️ 新增推理模型时**只改本文件的 `REASONING_TAG_NAMES`**，不要再去两份过滤器里加正则。
 */

/**
 * 会被当作「推理块」包裹的标签名（小写）。
 *
 * · `think` / `thinking` —— DeepSeek-R1、Qwen3、GLM-Z1 的部分渠道、以及我们自己 prompt 里的标签；
 * · `thought` —— Gemma 实测形态（`<thought>* Input: ...`，见 cloudflare/gemini-proxy/README.md §5）；
 * · `analysis` / `reasoning` —— 部分中转站与反代会把思考改名成这两个（OpenAI 兼容层的常见变体）。
 */
export const REASONING_TAG_NAMES = Object.freeze([
  'think',
  'thinking',
  'thought',
  'analysis',
  'reasoning',
]);

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 生成「某个标签名的任意非空前缀」的正则片段（`think` ⇒ `t|th|thi|think`）。
 * 用途：分块边界把标签切开时（`<thi` + `nk>`），必须能把半截标签认出来留在缓冲区，
 * 否则半截会先当正文吐出去，剩下的半截又拼不回来 —— 整段思考就漏了。
 */
const prefixesPattern = (names) =>
  names
    .map((name) => {
      const parts = [];
      for (let i = 1; i <= name.length; i += 1) parts.push(escapeRe(name.slice(0, i)));
      return parts.join('|');
    })
    .join('|');

const TAG_ALT = REASONING_TAG_NAMES.map(escapeRe).join('|');

/** 完整的开口标签（允许属性）：`<think>` / `<thinking type="x">` / `<analysis >` */
export const REASONING_OPEN_RE = new RegExp(`<(?:${TAG_ALT})(?:\\s[^>]*)?>`, 'i');

/** 完整的闭合标签：`</think>` / `</thinking >` */
export const REASONING_CLOSE_RE = new RegExp(`</(?:${TAG_ALT})\\s*>`, 'i');

/**
 * 半截闭合标签（块尾）：`</t` / `</th` / `</think` / `</thou` …
 * 名字保留 `PARTIAL_THINK_CLOSE_RE` —— AGENTS.md §2 与单测都按这个名字引用它，
 * **不要改名**（改名会让文档与断言同时需要动，属于无收益的连锁修改）。
 */
export const PARTIAL_THINK_CLOSE_RE = new RegExp(
  `</(?:${prefixesPattern(REASONING_TAG_NAMES)})\\s*$`,
  'i',
);

/**
 * 半截开口标签（块尾）：`<t` / `<th` / `<thi` / `<thou` …
 * 与 PARTIAL_THINK_CLOSE_RE 配对：一个守「开口被切开」，一个守「闭合被切开」。
 */
export const PARTIAL_THINK_OPEN_RE = new RegExp(
  `<(?:${prefixesPattern(REASONING_TAG_NAMES)})\\s*$`,
  'i',
);

/** 只用于「非流式全文清洗」的成对替换式（内容 + 标签一起删）。 */
export const stripReasoningBlocks = (text) =>
  String(text || '')
    .replace(new RegExp(`<(${TAG_ALT})(?:\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>`, 'gi'), '')
    // 只有开口没有闭合（流被截断）⇒ 后面全算推理
    .replace(new RegExp(`<(${TAG_ALT})(?:\\s[^>]*)?>[\\s\\S]*$`, 'gi'), '')
    // ★ Z1 形态：只有闭合没有开口 ⇒ 闭合**之前**全算推理
    .replace(new RegExp(`^[\\s\\S]*?</(?:${TAG_ALT})\\s*>`, 'gi'), '')
    // 剩下的孤立标签
    .replace(new RegExp(`</?(?:${TAG_ALT})(?:\\s[^>]*)?>`, 'gi'), '');

/**
 * 是否「已知会把思考写进 content」的模型 —— 只用于**生成期提示**（不发请求、不改配置）。
 *
 * ⚠️ 前端拿到的 `availableModels[].id` 是 `boh:<mode_id>`（见 bohai-model-config-api.js 的
 *   `buildBohaiRuntimeModels`），**真实 upstream 模型名不在前端**。所以这里刻意同时匹配
 *   mode_id 与 display_name，宁可多认几个：漏认的代价是「思考闪一下再被收进推理块」，
 *   误认的代价只是多等一次判断，不会丢内容。
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

export const isLikelyReasoningModel = (name) => {
  const key = String(name || '')
    .toLowerCase()
    .replace(/[\s_]/g, '');
  if (!key) return false;
  return REASONING_MODEL_HINTS.some((hint) => key.includes(hint.replace(/[\s_-]/g, '')));
};
