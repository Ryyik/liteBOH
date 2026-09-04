import { BOH_MEMBER_NAMES } from '@/views/BOHAI/composables/chat-engine-config.js';

const DEFAULT_FACTUALITY_TRIGGER_KEYWORDS = [
  '是谁', '什么是', '什么时候', '哪年', '发生了什么', '原因', '来源', '细节', '真相', '准确',
  '公告', '政策', '规则', '事实',
  '记录', '证据', '依据', '怎么回事', '能否确认'
];

const DEFAULT_FACTUALITY_QUESTION_PATTERNS = [
  /\b(what|who|when|where|which|whether|is it true|source|evidence|latest|recent|version|policy|rule|fact)\b/i,
  /(是不是|是否|有没有|准确吗|真实吗|能确认|能否确认|有依据|有证据|能证明)/,
  /(谁|什么|何时|哪里|哪一个|哪位|几号|几月|哪年).*(是|为|发生|更新|发布|规定)/,
  /(最新|最近|今日|今天|本周|本月|今年).*(公告|更新|活动|帖子|规则|消息|动态)/
];

const DEFAULT_UNCERTAINTY_PATTERN = /(未检索到明确依据|目前无法确认|暂时无法确认|不确定|信息不足|证据不足)/;
const BOH_INTERNAL_SOURCE_PATTERN = new RegExp(`(方块之家|block of home|\\bboh\\b|boh\\s*ai|boh\\s*cloud\\+?|cloud\\+|论坛|帖子|公告|周年庆|内战|${BOH_MEMBER_NAMES}|pushplus|订阅|会员)`, 'i');
const BOH_INTERNAL_FACT_PATTERN = /(是谁|是什么|什么时候|何时|哪年|哪里|在哪|最新|最近|今天|近期|本周|本月|公告|活动|规则|状态|记录|历史|来源|细节|有没有|是否|能否确认)/i;
const CREATIVE_REQUEST_PATTERN = /(写|生成|创作|改写|润色|设计|起草|文案|口号|标题|祝福|海报|宣传语|故事|诗|歌词|设定|梗图)/i;

export const INTERNAL_CITATION_ID_PATTERN = /^(?:T|S|K|G|F|U)\d+$/i;
export const SEARCH_CITATION_ID_PATTERN = /^W\d+$/i;
const FORUM_CITATION_ID_PATTERN = /^F\d+$/i;
const FORUM_URL_PATTERN = /(boh\.community\/post|(?:^|[\s"'(（<])#?\/forum\/post\/|(?:^|[\s"'(（<])https?:\/\/[^\s)\]）>]*\/forum\/post\/)/i;
const FORUM_REF_PATTERN = /\[F\d+\]/i;
const FORUM_HANDLE_CLAIM_PATTERN = /(?:论坛|帖子|社区|社群|BOH|方块之家)[^。！？\n]{0,40}@[A-Za-z0-9_-]{2,32}|@[A-Za-z0-9_-]{2,32}[^。！？\n]{0,40}(?:论坛|帖子|社区|社群|BOH|方块之家)/i;
const FORUM_SOURCE_CLAIM_PATTERN = /(论坛|帖子)[^。！？\n]{0,36}(用户|成员|作者|楼主|有人)[^。！？\n]{0,36}(分享|提到|说|表示|发了|发布|讨论|链接|帖子)/i;
const FORUM_LINK_LABEL_PATTERN = /(查看帖子|帖子链接|原帖|原文链接|发帖ID|帖子ID)/i;

export const normalizeGroundingText = (text) => String(text || '').toLowerCase().trim();

export const containsAnyGroundingKeyword = (normalizedText, keywords = []) => {
  const source = String(normalizedText || '');
  if (!source) return false;
  return keywords.some((keyword) => source.includes(String(keyword || '').toLowerCase()));
};

export const isLikelyFactualQuestion = (
  text,
  {
    operationQuestion = false,
    normalizeText = normalizeGroundingText,
    factualityTriggerKeywords = DEFAULT_FACTUALITY_TRIGGER_KEYWORDS,
    factualityQuestionPatterns = DEFAULT_FACTUALITY_QUESTION_PATTERNS
  } = {}
) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (operationQuestion) return true;
  if (containsAnyGroundingKeyword(normalized, factualityTriggerKeywords)) return true;
  return factualityQuestionPatterns.some((pattern) => pattern.test(normalized));
};

export const isLikelyBohInternalQuestion = (text, { normalizeText = normalizeGroundingText } = {}) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return BOH_INTERNAL_SOURCE_PATTERN.test(normalized);
};

export const isLikelyBohInternalFactualQuestion = (
  text,
  {
    operationQuestion = false,
    normalizeText = normalizeGroundingText
  } = {}
) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (operationQuestion) return true;
  if (!isLikelyBohInternalQuestion(normalized, { normalizeText: (value) => value })) return false;
  if (CREATIVE_REQUEST_PATTERN.test(normalized) && !BOH_INTERNAL_FACT_PATTERN.test(normalized)) return false;
  return BOH_INTERNAL_FACT_PATTERN.test(normalized) || isLikelyFactualQuestion(normalized, { normalizeText: (value) => value });
};

export const extractCitationTokensFromText = (text) => {
  const matches = String(text || '').match(/\[([^\]]+)\]/g) || [];
  const tokens = new Set();
  matches.forEach((token) => {
    const body = token.slice(1, -1);
    body
      .split(/[,，\s]+/)
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .forEach((part) => {
        tokens.add(part);
      });
  });
  return [...tokens];
};

export const extractCitationIdsFromText = (text) => {
  return extractCitationTokensFromText(text)
    .filter((token) => INTERNAL_CITATION_ID_PATTERN.test(token))
    .map((token) => token.toUpperCase());
};

export const countCitationHits = (
  text,
  {
    evidenceRefSet = new Set(),
    maxSearchRef = 0
  } = {}
) => {
  const internalRefSet = evidenceRefSet instanceof Set ? evidenceRefSet : new Set();
  const searchRefUpperBound = Number.isFinite(maxSearchRef)
    ? Math.max(0, Math.trunc(maxSearchRef))
    : 0;
  if (internalRefSet.size === 0 && searchRefUpperBound <= 0) return 0;

  const cited = extractCitationTokensFromText(text);
  if (cited.length === 0) return 0;

  let hits = 0;
  cited.forEach((token) => {
    const normalized = String(token || '').trim();
    if (!normalized) return;
    const upper = normalized.toUpperCase();
    if (internalRefSet.has(upper)) {
      hits += 1;
      return;
    }
    if (searchRefUpperBound > 0 && SEARCH_CITATION_ID_PATTERN.test(normalized)) {
      const asNumber = Number(normalized.slice(1));
      if (asNumber >= 1 && asNumber <= searchRefUpperBound) {
        hits += 1;
      }
    }
  });
  return hits;
};

export const hasExplicitUncertaintyHint = (text, uncertaintyPattern = DEFAULT_UNCERTAINTY_PATTERN) => {
  const normalized = normalizeGroundingText(text);
  if (!normalized) return false;
  return uncertaintyPattern.test(normalized);
};

export const isUncertaintyOnlyReply = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return false;

  const lines = raw
    .split(/\n+/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  let meaningfulCount = 0;
  let uncertaintyCount = 0;

  lines.forEach((line) => {
    const normalizedLine = line.replace(/^\s*[-*•\d.]+\s*/, '').trim();
    if (!normalizedLine) return;
    if (/^【[^】]{1,16}】$/.test(normalizedLine)) return;
    if (/^\[[A-Za-z]?\d+\]$/.test(normalizedLine)) return;

    meaningfulCount += 1;
    if (hasExplicitUncertaintyHint(normalizedLine)) {
      uncertaintyCount += 1;
    }
  });

  return meaningfulCount > 0 && uncertaintyCount === meaningfulCount;
};

export const shouldRepairUngroundedReply = (
  text,
  {
    evidenceRefSet = new Set(),
    maxSearchRef = 0,
    minRequiredCitations = 1
  } = {}
) => {
  const internalRefSet = evidenceRefSet instanceof Set ? evidenceRefSet : new Set();
  const searchRefUpperBound = Number.isFinite(maxSearchRef)
    ? Math.max(0, Math.trunc(maxSearchRef))
    : 0;
  if (internalRefSet.size === 0 && searchRefUpperBound <= 0) return false;

  const hits = countCitationHits(text, {
    evidenceRefSet: internalRefSet,
    maxSearchRef: searchRefUpperBound
  });
  if (hits >= Math.max(1, Number(minRequiredCitations) || 1)) return false;
  if (hits === 0 && isUncertaintyOnlyReply(text)) return false;
  return true;
};

export const hasAvailableForumEvidence = (availableEvidenceRefs = []) => {
  return (Array.isArray(availableEvidenceRefs) ? availableEvidenceRefs : [])
    .some((ref) => FORUM_CITATION_ID_PATTERN.test(String(ref || '').trim()));
};

export const hasUnsupportedCommunityEvidenceClaim = (
  text,
  {
    availableEvidenceRefs = []
  } = {}
) => {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  if (hasAvailableForumEvidence(availableEvidenceRefs)) return false;
  return FORUM_URL_PATTERN.test(raw)
    || FORUM_REF_PATTERN.test(raw)
    || FORUM_HANDLE_CLAIM_PATTERN.test(raw)
    || FORUM_SOURCE_CLAIM_PATTERN.test(raw)
    || FORUM_LINK_LABEL_PATTERN.test(raw);
};

export const sanitizeUnsupportedCommunityEvidenceClaims = (
  text,
  {
    availableEvidenceRefs = [],
    fallbackText = '这部分内容未经检索确认，已省略。'
  } = {}
) => {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  if (!hasUnsupportedCommunityEvidenceClaim(raw, { availableEvidenceRefs })) return raw;

  const hasForumEvidence = hasAvailableForumEvidence(availableEvidenceRefs);

  const segments = raw
    .split(/(?<=[。！？!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  // For each segment, remove only unsupported claim portions
  const cleanedSegments = segments.map((segment) => {
    let cleaned = segment;
    // Remove unsupported forum source claims
    cleaned = cleaned.replace(FORUM_SOURCE_CLAIM_PATTERN, '');
    // Remove unsupported @handle claims
    cleaned = cleaned.replace(FORUM_HANDLE_CLAIM_PATTERN, '');
    // Remove unsupported link labels
    cleaned = cleaned.replace(FORUM_LINK_LABEL_PATTERN, '');
    // Remove [F] citations without evidence
    if (!hasForumEvidence) {
      cleaned = cleaned.replace(/\[F\d+\]/g, '');
      cleaned = cleaned.replace(FORUM_URL_PATTERN, '');
    }
    return cleaned.trim();
  }).filter((segment) => segment.length > 0);

  // 如果清理后内容与原文相同，直接返回原文
  const cleanedText = cleanedSegments.join('\n').trim();
  if (cleanedText === raw) return raw;

  // 如果清理后内容足够多，直接返回清理后内容
  if (cleanedSegments.length >= 2) {
    return cleanedText;
  }

  // 如果清理后内容较少，在开头插入 fallback 提示
  if (cleanedText.length >= 20) {
    return `${fallbackText}\n\n${cleanedText}`;
  }
  return fallbackText;
};

export const resolveKnowledgeRoutingPlanCore = ({
  basePlan = {},
  operation = false,
  community = false,
  forumRealtime = false,
  communityHistory = false,
  hasSharedMemoryTrigger = false
} = {}) => {
  const plan = {
    treehole: false,
    sharedMemory: false,
    memory: false,
    siteGuide: false,
    forum: false,
    userPrivate: false,
    health: false,
    ...basePlan
  };

  const reasons = [];
  if (operation) {
    plan.siteGuide = true;
    plan.sharedMemory = false;
    plan.memory = false;
    plan.forum = false;
    reasons.push('操作问题 -> 优先读取站点操作知识库');
    if (plan.userPrivate) {
      reasons.push('操作中包含账号诉求 -> 同步读取当前登录用户数据');
    }
  }

  if (!operation && forumRealtime) {
    plan.forum = true;
    reasons.push('社区实时动态问题 -> 读取论坛帖子');
  }

  if (!operation && (communityHistory || hasSharedMemoryTrigger)) {
    plan.sharedMemory = true;
    plan.memory = false;
    reasons.push('社区历史事实问题 -> 读取公共记忆库');
  }

  if (community && !operation && !forumRealtime && !plan.sharedMemory) {
    plan.memory = true;
    reasons.push('社区背景/成员问答 -> 读取核心记忆库');
  }

  if (plan.treehole) {
    reasons.push('个人复盘/情绪习惯问题 -> 读取 BOH Cloud+ 私有内容');
  }

  if (plan.userPrivate && !operation) {
    reasons.push('账号私域问题 -> 读取当前登录用户数据');
  }

  // 健康分析不受 operation / community 分支影响：命中健康关键词就带上本机健康数据
  if (plan.health) {
    reasons.push('健康相关问题 -> 读取 BOH Health 本机健康数据');
  }

  return { plan, reasons };
};

export const __groundingDefaults = {
  factualityTriggerKeywords: DEFAULT_FACTUALITY_TRIGGER_KEYWORDS,
  factualityQuestionPatterns: DEFAULT_FACTUALITY_QUESTION_PATTERNS,
  uncertaintyPattern: DEFAULT_UNCERTAINTY_PATTERN
};
