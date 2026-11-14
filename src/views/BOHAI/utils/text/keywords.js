/**
 * keywords.js — 关键词切分 / 抽取（含 LRU 缓存）
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import { KEYWORD_CACHE_MAX_SIZE } from '@/utils/bohai-constants.js';
import { normalizeText } from './normalize.js';

export const splitKnowledgeChunks = (rawText) => {
  return String(rawText || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 16);
};

// 使用 LRU 语义（命中时重新插入到尾部）提升高频查询场景的缓存命中率
const keywordCache = new Map();

/**
 * 通用「问法词」停用表 —— 它们不是检索内容，只是问问题的方式。
 *
 * ⚠️ 2026-11-12 用户报障：问「End 是谁」（End 是站内成员），却被拆成
 * `end / 是谁 / 叫我`，其中「是谁」「叫我」命中了 5 条**完全无关**的日常帖，
 * 模型据此罗列无关内容并回复「知识库里没找到 End」——而库里明明有
 * 「成员档案：End」「方块之家群聊人物志 / 叫我End～喵～」。
 *
 * 判据：这些词**在任何语境下都不具备检索价值**，删掉不会丢信息。
 * 只收疑问 / 人称 / 客套，**不要**往里加「资料 / 信息 / 记录」这类可能是真实主题的词。
 */
export const QUERY_STOPWORDS = new Set([
  '这个',
  '那个',
  '什么',
  '怎么',
  '如何',
  '请问',
  '一下',
  '以及',
  '然后',
  '可以',
  '一个',
  '我们',
  '你们',
  '是谁',
  '哪个',
  '哪位',
  '哪些',
  '哪里',
  '为什么',
  '多少',
  '是否',
  '有没有',
  '这是',
  '那是',
  '叫我',
  '介绍',
  '知道',
  '告诉',
  '帮我',
  '麻烦',
  '谢谢',
  '还是',
  '就是',
  '真的',
  '到底',
]);

export const clearKeywordCache = () => {
  keywordCache.clear();
};

export const extractQueryKeywords = (text) => {
  const normalized = normalizeText(text);

  if (keywordCache.has(normalized)) {
    // LRU bump: 将命中的 key 移到末尾
    const value = keywordCache.get(normalized);
    keywordCache.delete(normalized);
    keywordCache.set(normalized, value);
    return value;
  }

  const tokens = normalized.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const stopwords = QUERY_STOPWORDS;
  const expanded = new Set();

  tokens.forEach((token) => {
    if (stopwords.has(token)) return;
    expanded.add(token);

    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length >= 4 && token.length <= 12) {
      // Only expand 2-grams + full token, skip 3/4-grams to reduce O(n^2) overhead
      for (let i = 0; i <= token.length - 2; i += 1) {
        // 展开出的 2-gram 同样要过停用表 —— 否则「叫我End～喵～」会重新产出「叫我」，
        // 等于整张停用表在展开路径上被绕过（2026-11-12）。
        const gram = token.slice(i, i + 2);
        if (!stopwords.has(gram)) expanded.add(gram);
      }
    }
  });

  const result = [...expanded];

  if (keywordCache.size >= KEYWORD_CACHE_MAX_SIZE) {
    const firstKey = keywordCache.keys().next().value;
    keywordCache.delete(firstKey);
  }
  keywordCache.set(normalized, result);

  return result;
};
