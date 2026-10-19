/**
 * grounding-verify.js — 答案级依据校验（2026-10-19）
 *
 * 背景：现有 `ensureGroundedReply` 只在「零引用」时追加免责声明；只要回答里出现任意
 * `[K1]`，哪怕 K1 讲的是另一件事，也会原样放行。`shouldRepairUngroundedReply` 写了却
 * 从未被运行期调用（只有单测引用）。
 *
 * 本模块补上**确定性的逐句校验**：
 *   ① 引用编号必须真实存在于本轮证据集合；不存在的编号直接摘掉；
 *   ② 带引用的句子，用「去人物名后的最长公共子串 + 覆盖率」做轻量支持度判断；
 *      不达标 ⇒ 记入 unsupported；
 *   ③ 没带引用、但含硬事实（数字/日期/第一/唯一/关系词/人物名）的句子 ⇒ 记入 unsupported；
 *   ④ `enforce` 时在回答末尾追加一条统一说明（不逐句改写，避免破坏可读性）。
 *
 * ⚠️ 这是**词法支持代理**，不是 NLI/蕴含模型。它擅长抓「引用张冠李戴」「整句凭空补全」，
 *    不擅长抓「同义改写但语义相反」。真正的 entailment 校验应放在 EF（rerank/小模型）里，
 *    这里先把「有引用就放行」的洞堵上。
 */

import { hasEntityAlias } from './boh-entity-resolver.js';

const INTERNAL_REF_RE = /^(?:T|S|K|G|F|U)\d+$/i;
const WEB_REF_RE = /^W\d+$/i;

const HARD_FACT_RE =
  /(\d{2,4}\s*年|\d{1,2}\s*月|\d{1,2}\s*日|\d+\s*(岁|年|个月|次|人|位|万|亿|公里|米)|第一|唯一|最[大小高低多少早晚]|冠军|亚军|结婚|离婚|出生|去世|毕业|入学|加入|创建|成立于)/;

const normalizeForSupport = (text) =>
  String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');

export const splitAnswerSentences = (text) => {
  const parts = String(text || '')
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  // 「一句话。[K1]」会被切成两段；把纯引用片段并回上一句，否则会被误判成
  // 「一句没有正文的引用」→ 假 unsupported。
  const merged = [];
  for (const part of parts) {
    if (/^(?:\[[A-Z]\d+\])+$/i.test(part) && merged.length > 0) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  }
  return merged;
};

export const extractCitationRefs = (text) => {
  const refs = [];
  const source = String(text || '');
  for (const match of source.matchAll(/\[([A-Za-z]?\d+)\]/g)) {
    const ref = String(match[1] || '').toUpperCase();
    if (INTERNAL_REF_RE.test(ref) || WEB_REF_RE.test(ref)) refs.push(ref);
  }
  return [...new Set(refs)];
};

/**
 * 从上下文（`[K1] ...` / `[F1] ...`）解析出「引用编号 → 证据正文」。
 * @param {string} contextText
 * @returns {Record<string, string>}
 */
export const buildEvidenceMap = (contextText) => {
  const source = String(contextText || '');
  const map = {};
  const blockPattern = /\[([A-Z]\d+)\]\s*([\s\S]*?)(?=\n\s*\[[A-Z]\d+\]|$)/g;
  let match = blockPattern.exec(source);
  while (match) {
    const ref = String(match[1] || '').toUpperCase();
    const body = String(match[2] || '').trim();
    if (ref && body) map[ref] = body;
    match = blockPattern.exec(source);
  }
  // 联网搜索的上下文格式是 <result index="1" ref="W1" ...>content</result>，
  // 与内部证据的 `[K1] ...` 不同；不解析它会让所有 [W1] 引用被误判成「无依据」。
  const resultPattern = /<result\b[^>]*\bref="(W\d+)"[^>]*>([\s\S]*?)<\/result>/gi;
  let resultMatch = resultPattern.exec(source);
  while (resultMatch) {
    const ref = String(resultMatch[1] || '').toUpperCase();
    const body = String(resultMatch[2] || '').trim();
    if (ref && body) map[ref] = body;
    resultMatch = resultPattern.exec(source);
  }
  return map;
};

const stripEntityAliases = (text, aliases = []) => {
  let output = String(text || '');
  const sorted = (Array.isArray(aliases) ? aliases : [])
    .map((alias) => String(alias || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    output = output.split(alias).join(' ');
  }
  return output;
};

const tokenizeForSupport = (text) => {
  const normalized = normalizeForSupport(text);
  const tokens = new Set();
  for (const run of normalized.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (run.length === 1) tokens.add(run);
    for (let index = 0; index <= run.length - 2; index += 1) {
      tokens.add(run.slice(index, index + 2));
    }
  }
  for (const word of normalized.match(/[a-z0-9]{2,}/g) || []) {
    tokens.add(word);
  }
  return tokens;
};

const longestCommonSubstringLength = (a, b) => {
  if (!a || !b) return 0;
  let best = 0;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] !== b[j - 1]) continue;
      current[j] = previous[j - 1] + 1;
      if (current[j] > best) best = current[j];
    }
    previous = current;
  }
  return best;
};

/**
 * 轻量支持度：去掉人物别名后，看句子有多少 token 被证据覆盖、最长公共子串有多长。
 * - 长句靠 ratio（覆盖率高才算支持）；
 * - 短句靠 longest（「组织能力」vs「组织者」这种同词根改写也能过）。
 */
export const scoreSentenceSupport = (sentence, evidence, entityAliases = []) => {
  const cleanSentence = stripEntityAliases(sentence, entityAliases);
  const cleanEvidence = stripEntityAliases(evidence, entityAliases);
  const sentenceTokens = tokenizeForSupport(cleanSentence);
  const evidenceTokens = tokenizeForSupport(cleanEvidence);
  if (sentenceTokens.size === 0 || evidenceTokens.size === 0) {
    return { ratio: 0, longest: 0, supported: false };
  }
  let hits = 0;
  for (const token of sentenceTokens) {
    if (evidenceTokens.has(token)) hits += 1;
  }
  const ratio = hits / sentenceTokens.size;
  const longest = longestCommonSubstringLength(
    normalizeForSupport(cleanSentence),
    normalizeForSupport(cleanEvidence),
  );
  const supported =
    longest >= 3 || ratio >= 0.35 || (longest >= 2 && sentenceTokens.size <= 8 && ratio >= 0.2);
  return { ratio, longest, supported };
};

export const containsHardFact = (sentence) => {
  const text = String(sentence || '');
  if (HARD_FACT_RE.test(text)) return true;
  // 用实体解析器而不是裸 includes：挡住「一二线城市」这类歧义用法。
  return hasEntityAlias(text);
};

/**
 * 校验整段回答。
 *
 * @param {string} answer
 * @param {{
 *   evidenceMap?: Record<string, string>,
 *   availableRefs?: string[],
 *   maxSearchRef?: number,
 *   entityAliases?: string[],
 *   enforce?: boolean,
 * }} [options]
 * @returns {{
 *   text: string,
 *   report: {
 *     checked: number,
 *     unsupportedCount: number,
 *     unsupported: Array<{ sentence: string, refs: string[], ratio?: number, longest?: number }>,
 *     unknownRefs: string[],
 *   },
 * }}
 */
export const validateAnswerGrounding = (
  answer,
  {
    evidenceMap = {},
    availableRefs = [],
    maxSearchRef = 0,
    entityAliases = [],
    enforce = false,
  } = {},
) => {
  const raw = String(answer || '');
  if (!raw.trim()) {
    return {
      text: raw,
      report: { checked: 0, unsupportedCount: 0, unsupported: [], unknownRefs: [] },
    };
  }

  const refSet = new Set(
    (Array.isArray(availableRefs) ? availableRefs : []).map((ref) =>
      String(ref || '').toUpperCase(),
    ),
  );
  const maxWebRef = Math.max(0, Math.min(99, Math.trunc(Number(maxSearchRef) || 0)));
  const sentences = splitAnswerSentences(raw);
  const unsupported = [];
  const unknownRefs = [];
  let checked = 0;

  const cleaned = sentences.map((sentence) => {
    const refs = extractCitationRefs(sentence);
    const validRefs = refs.filter((ref) => {
      if (INTERNAL_REF_RE.test(ref)) return refSet.has(ref);
      if (WEB_REF_RE.test(ref)) return Number(ref.slice(1)) <= maxWebRef;
      return false;
    });
    const invalidRefs = refs.filter((ref) => !validRefs.includes(ref));
    let text = sentence;
    for (const ref of invalidRefs) {
      unknownRefs.push(ref);
      text = text.replace(new RegExp(`\\[${ref}\\]`, 'gi'), '');
    }

    if (!enforce) return text;

    // 纯引用片段（如单独一行 [K1]）没有可校验的正文，不参与支持度统计。
    if (!text.replace(/\[[A-Z]\d+\]/gi, '').trim()) return text;

    if (validRefs.length > 0) {
      checked += 1;
      const scoringText = text.replace(/\[[A-Z]\d+\]/gi, '');
      let best = { ratio: 0, longest: 0, supported: false };
      for (const ref of validRefs) {
        const score = scoreSentenceSupport(scoringText, evidenceMap[ref] || '', entityAliases);
        if (score.supported) {
          best = score;
          break;
        }
        if (score.longest > best.longest || score.ratio > best.ratio) best = score;
      }
      if (!best.supported) {
        unsupported.push({
          sentence: text,
          refs: validRefs,
          ratio: Number(best.ratio.toFixed(3)),
          longest: best.longest,
        });
      }
      return text;
    }

    if (containsHardFact(text)) {
      checked += 1;
      unsupported.push({ sentence: text, refs: [], ratio: 0, longest: 0 });
    }
    return text;
  });

  let text = cleaned.join('');
  if (enforce && unsupported.length > 0) {
    text += `\n\n（说明：其中 ${unsupported.length} 处内容未在检索资料中找到直接依据，已按不确定处理。）`;
  }

  return {
    text,
    report: {
      checked,
      unsupportedCount: unsupported.length,
      unsupported,
      unknownRefs: [...new Set(unknownRefs)],
    },
  };
};
