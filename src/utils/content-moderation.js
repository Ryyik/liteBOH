import { callVaultSiliconChat } from './api/api-key-runtime-api.js';

const DEFAULT_SCENE = 'default';
const MODERATION_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
const QUICK_TIMEOUT_MS = 4000;
const FULL_TIMEOUT_MS = 10000;
const MODERATION_SERVICE_RETRY_DELAY_MS = 250;
const DEFAULT_MODERATION_MODEL_ID = 'Qwen/Qwen2.5-7B-Instruct';
const DEFAULT_MODERATION_MODEL_NAME = 'Qwen 2.5 7B Instruct';
const MODERATION_MAX_TOKENS = 96;
const MODERATION_REVIEW_MAX_TOKENS = 120;
const REMOTE_CONTENT_MODERATION_SETTING = String(
  import.meta.env.VITE_ENABLE_REMOTE_CONTENT_MODERATION ?? 'true'
).trim().toLowerCase();
const REMOTE_CONTENT_MODERATION_ENABLED = String(
  REMOTE_CONTENT_MODERATION_SETTING || 'true'
).trim().toLowerCase() !== 'false';
const IS_TEST_ENV = Boolean(
  (typeof process !== 'undefined' && (process.env.VITEST || process.env.NODE_ENV === 'test')) ||
  import.meta.env.MODE === 'test'
);

export const MODERATION_MODEL_ID = import.meta.env.VITE_MODERATION_MODEL_ID || DEFAULT_MODERATION_MODEL_ID;
export const MODERATION_MODEL_NAME = MODERATION_MODEL_ID === DEFAULT_MODERATION_MODEL_ID
  ? DEFAULT_MODERATION_MODEL_NAME
  : MODERATION_MODEL_ID;
export const MODERATION_STATUS_APPROVED = 'approved';
export const MODERATION_STATUS_REJECTED = 'rejected';

const LEGACY_UNDER_REVIEW_STATUS_SET = new Set(['needs_review', 'pending', 'review']);
const REJECT_DECISION_MIN_CONFIDENCE = 0.96;
const STRONG_REJECT_CONFIDENCE = 0.995;

const PASS_RESULT = { status: MODERATION_STATUS_APPROVED, message: '通过' };
const REJECT_RESULT = { status: MODERATION_STATUS_REJECTED, message: '包含严重违规内容，已拒绝' };
const LOCAL_REJECT_RESULT = { status: MODERATION_STATUS_REJECTED, message: '命中高风险违禁词，已拒绝' };
const SERVICE_REJECT_RESULT = { status: MODERATION_STATUS_REJECTED, message: '审核服务暂不可用，请稍后重试' };

const HARD_BLOCK_PATTERNS = [
  /枪支买卖/u,
  /买卖枪支/u,
  /出售枪支/u,
  /购买枪支/u,
  /制作炸弹教程/u,
  /炸药配方/u,
  /儿童色情/u,
  /未成年(人)?色(情|图|片|视频)/u,
  /贩卖毒品/u,
  /出售毒品/u,
  /购买毒品/u
];

const SEVERE_REASON_MARKERS = [
  '暴恐',
  '恐怖',
  '未成年',
  '儿童',
  '色情',
  '毒品',
  '枪支',
  '炸弹',
  '爆炸物',
  '仇恨',
  '违法交易',
  'illegal',
  'terror',
  'sexual_minor',
  'child',
  'weapon',
  'drug'
];

const BENIGN_CONTEXT_MARKERS = [
  '新闻',
  '报道',
  '转述',
  '引用',
  '学术',
  '历史',
  '科普',
  '电影',
  '游戏剧情',
  '小说',
  '谴责',
  '反对',
  '防范',
  '案例分析',
  '讨论'
];

const MALICIOUS_INTENT_MARKERS = [
  '怎么买',
  '怎么卖',
  '怎么做',
  '教程',
  '配方',
  '联系方式',
  '代购',
  '渠道',
  '交易',
  '出售',
  '贩卖',
  '求购',
  '带价'
];

const moderationSystemPrompt = [
  '你是内容安全审查助手。',
  '目标：仅在“非常确定”存在严重违规时才拒绝，尽量降低误判。',
  '严重违规示例：暴恐煽动、明确违法交易（毒品/枪支/爆炸物）、未成年人性相关内容、组织性仇恨攻击。',
  '普通吐槽、一般争论、游戏讨论、新闻转述、学术讨论、引用他人观点，默认应通过。',
  '请严格只输出 JSON，不要输出其他内容。',
  'JSON格式：{"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}'
].join('\n');

const moderationReviewPrompt = [
  '你是二次复核审查助手，目标是降低误判。',
  '只在“明确、直接、可执行”的严重违规内容时才拒绝，其余全部通过。',
  '以下内容通常应通过：新闻转述、历史讨论、学术科普、影视/游戏剧情、引用他人观点、反对或谴责违规行为。',
  '请严格只输出 JSON，不要输出其他内容。',
  'JSON格式：{"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}'
].join('\n');

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function resolveTimeoutMs(timeoutMs, fallbackMs) {
  const parsed = Number(timeoutMs);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.round(parsed);
}

function includesAny(text, markers = []) {
  if (!text || !Array.isArray(markers) || markers.length === 0) return false;
  return markers.some((marker) => text.includes(String(marker || '').toLowerCase()));
}

function hasLikelyBenignContext(content = '') {
  const text = String(content || '').toLowerCase();
  if (!text) return false;
  const benign = includesAny(text, BENIGN_CONTEXT_MARKERS);
  const maliciousIntent = includesAny(text, MALICIOUS_INTENT_MARKERS);
  return benign && !maliciousIntent;
}

function hasSevereReasonSignal(reasonCode = '', reason = '') {
  const text = `${String(reasonCode || '')} ${String(reason || '')}`.toLowerCase();
  return includesAny(text, SEVERE_REASON_MARKERS);
}

export function normalizeModerationStatus(status, fallback = MODERATION_STATUS_APPROVED) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return fallback;

  if (normalized === MODERATION_STATUS_APPROVED || normalized === 'pass' || normalized === 'allow' || normalized === 'ok') {
    return MODERATION_STATUS_APPROVED;
  }

  if (
    normalized === MODERATION_STATUS_REJECTED ||
    normalized === 'reject' ||
    normalized === 'blocked' ||
    normalized === 'block' ||
    LEGACY_UNDER_REVIEW_STATUS_SET.has(normalized)
  ) {
    return MODERATION_STATUS_REJECTED;
  }

  return fallback;
}

export function isModerationApproved(status) {
  if (!String(status || '').trim()) return false;
  return normalizeModerationStatus(status) === MODERATION_STATUS_APPROVED;
}

export function isModerationRejected(status) {
  if (!String(status || '').trim()) return false;
  return normalizeModerationStatus(status) === MODERATION_STATUS_REJECTED;
}

export function isLegacyModerationUnderReview(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return LEGACY_UNDER_REVIEW_STATUS_SET.has(normalized);
}

function quickLocalCheck(content) {
  const cleanContent = String(content || '').toLowerCase();
  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(cleanContent)) {
      return { ...LOCAL_REJECT_RESULT, fast: true };
    }
  }
  return null;
}

function buildLocalModerationResult(content, scene = DEFAULT_SCENE) {
  if (!content || content.trim().length === 0) {
    return {
      ...PASS_RESULT,
      confidence: 1,
      reasonCode: 'LOCAL_EMPTY',
      reason: PASS_RESULT.message,
      source: 'local',
      scene,
      model: MODERATION_MODEL_ID
    };
  }

  const localResult = quickLocalCheck(content);
  if (localResult) {
    return {
      status: MODERATION_STATUS_REJECTED,
      message: String(localResult.message || LOCAL_REJECT_RESULT.message),
      confidence: 1,
      reasonCode: 'LOCAL_KEYWORD_BLOCK',
      reason: String(localResult.message || LOCAL_REJECT_RESULT.message),
      source: 'local',
      scene,
      model: MODERATION_MODEL_ID
    };
  }

  return {
    ...PASS_RESULT,
    confidence: 1,
    reasonCode: 'LOCAL_PASS',
    reason: PASS_RESULT.message,
    source: 'local',
    scene,
    model: MODERATION_MODEL_ID
  };
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_error2) {
      return null;
    }
  }
}

function resolveParsedDecision(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';

  const rawDecision = parsed.status || parsed.decision || parsed.result;
  if (String(rawDecision || '').trim()) {
    return rawDecision;
  }

  const booleanDecisionFields = ['is_safe', 'safe', 'allowed', 'pass'];
  for (const field of booleanDecisionFields) {
    if (typeof parsed[field] === 'boolean') {
      return parsed[field] ? MODERATION_STATUS_APPROVED : MODERATION_STATUS_REJECTED;
    }
  }

  return '';
}

function resolveParsedConfidence(parsed, normalizedStatus) {
  const rawConfidence = parsed?.confidence ?? parsed?.score ?? parsed?.probability ?? parsed?.risk_score;
  if (rawConfidence !== undefined && rawConfidence !== null && rawConfidence !== '') {
    return clamp01(rawConfidence);
  }

  const hasBooleanDecision = ['is_safe', 'safe', 'allowed', 'pass']
    .some((field) => typeof parsed?.[field] === 'boolean');

  if (hasBooleanDecision) {
    return normalizedStatus === MODERATION_STATUS_REJECTED ? 0.72 : 1;
  }

  return normalizedStatus === MODERATION_STATUS_REJECTED ? 1 : 0;
}

function parseAIModerationResult(rawText, {
  minRejectConfidence = REJECT_DECISION_MIN_CONFIDENCE,
  failClosed = true,
  content = ''
} = {}) {
  const parsed = extractJsonObject(rawText);
  if (!parsed || typeof parsed !== 'object') {
    if (failClosed) {
      console.warn('[content-moderation] AI审核结果解析失败，按 failClosed 策略拒绝:', rawText);
    }
    return failClosed
      ? { ...SERVICE_REJECT_RESULT, source: 'fallback_parse' }
      : { ...PASS_RESULT, source: 'fallback_parse' };
  }

  const normalizedStatus = normalizeModerationStatus(resolveParsedDecision(parsed), MODERATION_STATUS_APPROVED);
  const confidence = resolveParsedConfidence(parsed, normalizedStatus);
  const reasonCode = String(parsed.reason_code || parsed.code || '').trim().slice(0, 48);
  const reason = String(parsed.reason || parsed.message || parsed.detail || '').trim().slice(0, 120);

  if (normalizedStatus === MODERATION_STATUS_REJECTED && confidence >= minRejectConfidence) {
    const severeReason = hasSevereReasonSignal(reasonCode, reason);
    const benignContext = hasLikelyBenignContext(content);
    const strongConfidence = confidence >= STRONG_REJECT_CONFIDENCE;

    if (!strongConfidence && (!severeReason || benignContext)) {
      return {
        ...PASS_RESULT,
        confidence,
        reasonCode: reasonCode || 'AI_BORDERLINE_ALLOW',
        reason: reason || PASS_RESULT.message,
        message: PASS_RESULT.message,
        source: 'ai_borderline_allow'
      };
    }

    return {
      ...REJECT_RESULT,
      confidence,
      reasonCode: reasonCode || 'AI_HIGH_RISK',
      reason: reason || REJECT_RESULT.message,
      message: reason || REJECT_RESULT.message,
      source: 'ai'
    };
  }

  return {
    ...PASS_RESULT,
    confidence,
    reasonCode: reasonCode || 'AI_ALLOW',
    reason: reason || PASS_RESULT.message,
    message: PASS_RESULT.message,
    source: 'ai'
  };
}

async function callAIModeration(content, scene, timeoutMs, {
  failClosed = true,
  systemPrompt = moderationSystemPrompt,
  maxTokens = MODERATION_MAX_TOKENS
} = {}) {
  if (IS_TEST_ENV) {
    return { ...PASS_RESULT, source: 'test_env_bypass' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      model: MODERATION_MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `场景: ${scene}\n内容: ${content}` }
      ],
      stream: false,
      temperature: 0,
      max_tokens: maxTokens
    };

    const vaultResult = await callVaultSiliconChat({
      purpose: 'moderation',
      payload,
      apiUrl: MODERATION_API_URL,
      timeoutMs
    });
    if (!vaultResult.ok) {
      return failClosed
        ? { ...SERVICE_REJECT_RESULT, source: 'no_api_key' }
        : { ...PASS_RESULT, source: 'no_api_key' };
    }
    const data = vaultResult.data || {};

    const aiText = data?.choices?.[0]?.message?.content || '';
    return parseAIModerationResult(aiText, { failClosed, content });
  } catch (error) {
    console.warn('AI审查失败，按策略处理:', error);
    return failClosed
      ? { ...SERVICE_REJECT_RESULT, source: 'fallback_error' }
      : { ...PASS_RESULT, source: 'fallback_error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAIModerationWithRetry(content, scene, timeoutMs, options = {}) {
  const firstAttempt = await callAIModeration(content, scene, timeoutMs, options);
  const source = String(firstAttempt?.source || '').trim();

  if (source === 'no_api_key' || !source.startsWith('fallback_')) {
    return firstAttempt;
  }

  await new Promise((resolve) => setTimeout(resolve, MODERATION_SERVICE_RETRY_DELAY_MS));
  const secondAttempt = await callAIModeration(content, scene, timeoutMs, options);
  const secondSource = String(secondAttempt?.source || '').trim();

  if (secondSource === 'no_api_key') {
    return secondAttempt;
  }

  return secondAttempt || firstAttempt;
}

async function runModeration(content, scene, timeoutMs, options = {}) {
  const { failClosed = true } = options || {};
  if (!content || content.trim().length === 0) {
    return { ...PASS_RESULT, scene, model: MODERATION_MODEL_ID };
  }

  const localResult = quickLocalCheck(content);
  if (localResult) {
    return { ...localResult, scene, model: MODERATION_MODEL_ID };
  }

  if (!REMOTE_CONTENT_MODERATION_ENABLED) {
    return buildLocalModerationResult(content, scene);
  }

  const firstPassResult = await callAIModerationWithRetry(content, scene, timeoutMs, { failClosed });
  let finalResult = firstPassResult;

  const needsSecondPass = firstPassResult.status === MODERATION_STATUS_REJECTED
    && firstPassResult.source === 'ai'
    && clamp01(firstPassResult.confidence) < STRONG_REJECT_CONFIDENCE;

  if (needsSecondPass) {
    const secondPassResult = await callAIModerationWithRetry(content, scene, timeoutMs, {
      failClosed: true,
      systemPrompt: moderationReviewPrompt,
      maxTokens: MODERATION_REVIEW_MAX_TOKENS
    });

    if (secondPassResult.status !== MODERATION_STATUS_REJECTED) {
      finalResult = {
        ...secondPassResult,
        source: 'ai_second_pass_allow'
      };
    }
  }

  return {
    status: normalizeModerationStatus(finalResult.status, MODERATION_STATUS_APPROVED),
    message: String(finalResult.message || (finalResult.status === MODERATION_STATUS_REJECTED ? REJECT_RESULT.message : PASS_RESULT.message)),
    confidence: clamp01(finalResult.confidence),
    reasonCode: String(finalResult.reasonCode || ''),
    reason: String(finalResult.reason || ''),
    source: finalResult.source || 'ai',
    scene,
    model: MODERATION_MODEL_ID
  };
}

// 仅本地快速关键词审查：不调用 AI，不依赖网络。
export function quickKeywordModerate(content, options = {}) {
  const scene = options.scene || DEFAULT_SCENE;
  return buildLocalModerationResult(content, scene);
}

// 快速审查：用于发帖/评论/私信同步入口，优先降低误判。
export async function quickModerate(content, options = {}) {
  const scene = options.scene || DEFAULT_SCENE;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs, QUICK_TIMEOUT_MS);
  return runModeration(content, scene, timeoutMs, options);
}

// 深度复审：用于异步二次确认。
export async function moderateWithGLM(content, options = {}) {
  const scene = options.scene || DEFAULT_SCENE;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs, FULL_TIMEOUT_MS);
  return runModeration(content, scene, timeoutMs, options);
}

export const __moderationTestUtils = {
  extractJsonObject,
  parseAIModerationResult,
  resolveParsedConfidence,
  resolveParsedDecision,
  quickLocalCheck
};
