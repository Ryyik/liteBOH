/**
 * exact-terms.js — 字面精确词加权（2026-11-12）
 *
 * 背景（实测）：「2019 年方块之家发生了什么」这条，命中集合的向量相似度全挤在
 * 0.591~0.635，重排把「4 / 5 / 7 周年庆典」排在了「大事记：2019 年」之前，
 * 真正的答案连候选池都没进 —— 语义模型对**年份、型号、英文专名**这类字面线索不敏感。
 *
 * 做法：从问题里抽出「字面可判」的精确词（4 位年份、含字母的拉丁词），
 * 命中这些词的切片给一个固定加成再重排。**只在确实抽到精确词时生效**，
 * 普通中文问句不受影响。
 */

/** 单个精确词命中加成。0.32 的依据：实测中噪声块与正确答案的 rerank 差约 0.05~0.2，
 *  要压过它但不足以让一个明显不相关的块反超（上限 clamp 到 1）。 */
export const EXACT_TERM_BOOST = 0.32;

const YEAR_PATTERN = /(?:19|20)\d{2}\s*年?/g;
const LATIN_PATTERN = /[A-Za-z][A-Za-z0-9.+#-]{2,}/g;

/**
 * 抽精确词。
 * @param {string} queryText
 * @returns {string[]} 去重后的词（年份去掉「年」字，便于和正文里的 `2019` 对齐）
 */
export const extractExactTerms = (queryText = '') => {
  const text = String(queryText || '');
  const terms = new Set();
  (text.match(YEAR_PATTERN) || []).forEach((token) => {
    terms.add(token.replace(/\s*年$/, ''));
  });
  (text.match(LATIN_PATTERN) || []).forEach((token) => {
    // 必须含字母：纯数字已由年份覆盖，避免把「12345」当专名
    if (/[A-Za-z]/.test(token) && token.length >= 3) terms.add(token);
  });
  return [...terms];
};

/**
 * 单个切片是否命中任一精确词。
 * @param {{title?:string, content?:string}} chunk
 * @param {string[]} terms
 */
export const chunkMatchesExactTerms = (chunk, terms = []) => {
  if (!Array.isArray(terms) || terms.length === 0) return false;
  const haystack = `${chunk?.title || ''}\n${chunk?.content || ''}`.toLowerCase();
  return terms.some((term) => term && haystack.includes(String(term).toLowerCase()));
};

/**
 * 按「字面精确词」重新排序检索块。
 *
 * ⚠️ 两条保守约束（都是为了避免把好结果搞坏）：
 *   1. 抽不到精确词 ⇒ **原样返回**（不重排、不加分）；
 *   2. 没有任何一块带 `rerankScore`（重排整个失败）⇒ 原样返回。否则我们给命中块加 0.32、
 *      其余块补 0，会凭空造出一批 0 分块，再被 `filterChunksByRerankFloor` 全清掉。
 *
 * @param {Array<{title?:string, content?:string, rerankScore?:number}>} chunks
 * @param {string} queryText
 * @returns {Array} 新数组（不改原对象）
 */
export const rankChunksByExactTerms = (chunks = [], queryText = '') => {
  const list = Array.isArray(chunks) ? chunks : [];
  const terms = extractExactTerms(queryText);
  if (terms.length === 0 || list.length === 0) return list;
  if (!list.some((chunk) => Number.isFinite(Number(chunk?.rerankScore)))) return list;

  const lowered = terms.map((term) => term.toLowerCase());
  return list
    .map((chunk, index) => {
      const haystack = `${chunk?.title || ''}\n${chunk?.content || ''}`.toLowerCase();
      const hit = lowered.some((term) => haystack.includes(term));
      const base = Number(chunk?.rerankScore);
      const score = Math.min(1, (Number.isFinite(base) ? base : 0) + (hit ? EXACT_TERM_BOOST : 0));
      return { chunk, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => ({ ...item.chunk, rerankScore: item.score }));
};
