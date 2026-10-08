/**
 * dedupe.js — 记忆去重比较 + 显式记忆内容抽取
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import { stripWrappingQuotes, truncateText } from '../text/normalize.js';

export const normalizeMemoryCompareText = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '')
    .trim();

/**
 * 子串包含是否算「同一条」的长度门槛。
 *
 * ⚠️ 为什么不能无条件 `includes`（2026-10-08 修）：旧实现是双向 `includes`，
 * 于是「我喜欢猫」（6 字）会被「我喜欢猫和狗，也养过金鱼」（15 字）判成重复而被丢弃
 * —— **短的新事实被长的旧记忆吞掉**，该记的没记。同一类问题还有
 * 「我的生日是 3 月 1 号」vs「我的生日是 3 月 1 号号」，只是标点差异（那是真重复）。
 *
 * 取 0.5：两条归一化文本长度差在一倍以上时，它们大概率是**不同的两句话**，
 * 而不是同一句话的详略版本。真正的重复（同句、增删标点、加个语气词）长度比远高于 0.5，
 * 不受影响。
 */
const SUBSET_DUPLICATE_LENGTH_RATIO = 0.5;

const isSubsetDuplicate = (normalized, normalizedCandidate) => {
  if (normalized === normalizedCandidate) return true;
  if (!normalized.includes(normalizedCandidate) && !normalizedCandidate.includes(normalized)) {
    return false;
  }
  const shorter = Math.min(normalized.length, normalizedCandidate.length);
  const longer = Math.max(normalized.length, normalizedCandidate.length);
  return longer === 0 || shorter / longer >= SUBSET_DUPLICATE_LENGTH_RATIO;
};

export const isLikelyMemoryDuplicate = (candidate, existingItems = []) => {
  const normalizedCandidate = normalizeMemoryCompareText(candidate);
  if (!normalizedCandidate) return false;

  return existingItems.some((item) => {
    const content = typeof item === 'string' ? item : item?.content;
    const normalized = normalizeMemoryCompareText(content);
    if (!normalized) return false;
    return isSubsetDuplicate(normalized, normalizedCandidate);
  });
};

/**
 * 最长公共子串长度（DP）。
 *
 * ⚠️ 为什么不用「长度比」当同主题信号（2026-10-08 实现期踩到）：第一版用
 * `shorter/longer >= 0.5` 判「同主题改口」，结果「我这周开始学吉他」(8) 与
 * 「我现在住在上海」(7) 的长度比 0.875 —— 两条**完全无关**的记忆被判成改口，
 * 于是记「学吉他」会误归档「住上海」。长度相近是废话信号，不是主题信号。
 *
 * 真正的同主题改口特征是**句式高度重合、只有取值槽位不同**：
 *   「我现在住在上海」vs「我现在住在北京」⇒ 公共子串「我现在住在」= 5/7
 *   「我现在住在上海」vs「我这周开始学吉他」⇒ 公共子串「我」= 1/7
 * 归一化后已去掉标点，直接逐字比即可。文本都 ≤320 字，O(n·m) 完全够用。
 */
const longestCommonSubstringLength = (a, b) => {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] !== b[j - 1]) continue;
      curr[j] = prev[j - 1] + 1;
      if (curr[j] > best) best = curr[j];
    }
    prev = curr;
  }
  return best;
};

/** 同主题判定门槛：公共子串占较短一条的比例。 */
const SAME_TOPIC_RATIO = 0.6;

/** 两条记忆是否「同主题」——同主题且内容不等 ⇒ 用户改口了。 */
const isSameTopic = (normalized, normalizedCandidate) => {
  const shorter = Math.min(normalized.length, normalizedCandidate.length);
  if (shorter === 0) return false;
  return (
    longestCommonSubstringLength(normalized, normalizedCandidate) / shorter >= SAME_TOPIC_RATIO
  );
};

/**
 * 记忆写入分类（2026-10-08 新增）。
 *
 * 为什么需要「第三种结果」：旧实现只有 true/false 两个出口 —— 判重就跳过。
 * 但「同一条事实被用户改口」不是重复：
 *   旧记忆「我在上海」 → 用户说「记住我现在在北京」 → 判成重复跳过
 *   ⇒ 库里永远只有「我在上海」，AI 之后一直答错，且用户无从纠正。
 *
 * 三个出口：
 *   - `exact`     同一句话说两遍 ⇒ 跳过（原本行为，仍然正确）
 *   - `supersede` 同主题改口 ⇒ 归档旧记忆 + 写入新事实
 *   - `none`      其余 ⇒ 正常写入
 */
export const classifyMemoryWrite = (candidate, existingItems = []) => {
  const normalizedCandidate = normalizeMemoryCompareText(candidate);
  if (!normalizedCandidate) return 'none';

  const items = Array.isArray(existingItems) ? existingItems : [];
  let sawSameTopic = false;

  for (const item of items) {
    const content = typeof item === 'string' ? item : item?.content;
    const normalized = normalizeMemoryCompareText(content);
    if (!normalized) continue;

    if (normalized === normalizedCandidate) return 'exact';
    if (isSubsetDuplicate(normalized, normalizedCandidate)) return 'exact';

    if (isSameTopic(normalized, normalizedCandidate)) sawSameTopic = true;
  }

  return sawSameTopic ? 'supersede' : 'none';
};

/**
 * 找出被新事实取代的那条（返回对象，含 id 供归档）。找不到返回 null。
 *
 * ⚠️ 选「最同主题」的那条（公共子串占比最高），不是第一条命中的 ——
 * 库里可能同时有「我现在住在上海」和「我养了一只猫」两条同长度记忆，
 * 按顺序命中会归档错的那条。
 */
export const findSupersededMemory = (candidate, existingItems = []) => {
  const normalizedCandidate = normalizeMemoryCompareText(candidate);
  if (!normalizedCandidate) return null;

  const items = Array.isArray(existingItems) ? existingItems : [];
  let best = null;
  let bestRatio = 0;

  for (const item of items) {
    // ⚠️ 只认带 id 的对象：没有 id 就无法归档，宁可不处理（调用方会退化成并存写入）。
    if (!item || typeof item === 'string') continue;
    const normalized = normalizeMemoryCompareText(item?.content);
    if (!normalized || normalized === normalizedCandidate) continue;
    if (!isSameTopic(normalized, normalizedCandidate)) continue;
    // ⚠️ 分母必须是**候选自身**长度，不是两者较短值（实现期踩过）：
    //   候选「我现在住在广州」(7) vs 旧「我现在住在上海市浦东新区」(12)：公共子串「我现在住在」=5。
    //   若按 shorter=7 算比值得 0.71，按旧句自身 12 算只有 0.42 ——
    //   前者会让**更长更具体**的旧记忆得分反而更高，恰好选错归档对象。
    //   「越具体越该被短的新事实取代」不符合预期：应当选与新事实**同等具体度**的那条。
    const ratio =
      normalized.length === 0
        ? 0
        : longestCommonSubstringLength(normalized, normalizedCandidate) / normalized.length;
    if (ratio <= bestRatio) continue;
    bestRatio = ratio;
    best = item;
  }

  return best;
};

export const extractExplicitMemoryContent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /^(?:请|麻烦|帮我)?(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)[：:，,\s]*(.+)$/u,
    /^(?:我要|我想|请)?(?:上传|添加|保存|沉淀)(?:一条)?记忆[：:，,\s]*(.+)$/u,
    /^(?:记忆沉淀|记忆)[：:，,\s]*(.+)$/u,
    /^(?:请|麻烦|帮我)?把(.+?)(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)(?:吧|一下)?$/u,
  ];

  for (const pattern of patterns) {
    const matched = raw.match(pattern);
    if (!matched?.[1]) continue;
    const cleaned = stripWrappingQuotes(matched[1]);
    if (cleaned.length >= 2) return truncateText(cleaned, 320);
  }

  return '';
};
