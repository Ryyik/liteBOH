/**
 * BOHAI 聊天错误消息工具
 *
 * 统一管理聊天引擎中所有面向用户的错误消息，
 * 确保消息格式一致、可维护。
 */

/**
 * 将错误对象转为安全的用户可读消息。
 * 如果错误对象包含 message，取其前 300 字符；
 * 否则返回兜底文案。
 *
 * @param {Error|unknown} error - 捕获的错误对象
 * @param {string} [fallback='网络请求异常'] - 兜底文案
 * @returns {string} 截断后的错误消息
 */
export function safeErrorDetail(error, fallback = '网络请求异常') {
  if (error && typeof error.message === 'string') {
    return error.message.slice(0, 300);
  }
  if (error && typeof error === 'string') {
    return error.slice(0, 300);
  }
  return fallback;
}

/**
 * 判断是否为用户主动取消的 AbortError。
 *
 * @param {Error|unknown} error
 * @returns {boolean}
 */
export function isAbortError(error) {
  return !!(error && error.name === 'AbortError');
}

// ---- 错误归类（2026-11-12 用户口径：出错要给「能看懂 + 知道不花钱」的话，不要甩原始 JSON）----

/**
 * 上游/平台错误的归类结果。
 *
 * 来源实证（2026-11-12 用户截图）：岛里直接显示了
 * `详情：{"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}`
 * —— 智谱的 1302 = 账号级速率限制（provider 侧），既不是我们的额度用完，也不是密钥错。
 *
 * 归类只**决定文案**，不改任何重试/计费行为：
 *  · `rate-limit` → 「我们遇到速率问题，请重试。本次不扣减额度。」
 *  · `quota`     → 我们自己的额度/积分用尽（EF 在流开始前就返回，不会进到流里）
 *  · `auth`      → 密钥/鉴权问题（换模型救不了，见 EF 的 shouldFallbackToNextModel）
 *  · `network`   → 网络层失败
 *  · `upstream`  → 其它上游错误
 */
export const CHAT_ERROR_KINDS = {
  RATE_LIMIT: 'rate-limit',
  QUOTA: 'quota',
  AUTH: 'auth',
  NETWORK: 'network',
  UPSTREAM: 'upstream',
  UNKNOWN: 'unknown',
};

/** 把各种形态的错误对象压成一段可检索的文本（Error / string / JSON 串 / {error:{message}}） */
export function errorTextOf(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const nested = error.error?.message || error.errorMessage || error.message || error.detail;
    if (typeof nested === 'string' && nested) return nested;
    try {
      return JSON.stringify(error);
    } catch {
      return '';
    }
  }
  return String(error);
}

/**
 * 从错误文本里抽出「人话」细节：
 *  · 纯 JSON（EF 把上游响应体原样回抛）⇒ 取 `error.message` / `message`，不把大括号甩给用户；
 *  · 普通文本 ⇒ 截断 300 字。
 * 归类为 `rate-limit` 时**不要**用它 —— 那条走固定文案（见 CHAT_ERROR_MESSAGES.rateLimited）。
 */
export function sanitizeErrorDetail(error, fallback = '网络请求异常') {
  const raw = errorTextOf(error).trim();
  if (!raw) return fallback;
  // 上游响应体常常整段是 JSON：`{"error":{"code":"1302","message":"…"}}`
  if (/^[[{]/.test(raw)) {
    try {
      const parsed = JSON.parse(raw);
      const nested =
        parsed?.error?.message || parsed?.message || parsed?.error_description || parsed?.detail;
      if (typeof nested === 'string' && nested.trim()) return nested.trim().slice(0, 300);
    } catch {
      /* 不是合法 JSON：按普通文本处理 */
    }
  }
  // 形如 `event: error\ndata: {...}` 的 SSE 残片：把 JSON 段抽出来再试一次
  const jsonStart = raw.indexOf('{');
  if (jsonStart > 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const nested = parsed?.error?.message || parsed?.message;
      if (typeof nested === 'string' && nested.trim()) return nested.trim().slice(0, 300);
    } catch {
      /* 忽略 */
    }
  }
  return raw.slice(0, 300);
}

/** 速率限制的判定（智谱 1302 / HTTP 429 / 各家 rate limit 文案都算） */
const RATE_LIMIT_RE =
  /(速率限制|频率限制|请求频率|过于频繁|请求过快|rate[\s_-]?limit|too many requests|\b429\b|\b1302\b|\bTPM\b|\bRPM\b)/i;
/** 我们自己的额度/积分用尽（与上游限流区分：这条不是「稍后重试」能解的） */
const QUOTA_RE =
  /(额度已用完|额度不足|积分不足|daily_burn_cap|insufficient_points|quota exceeded)/i;
const AUTH_RE = /(api key|apikey|未授权|鉴权|unauthorized|\b401\b|\b403\b)/i;
const NETWORK_RE = /(network|networkerror|failed to fetch|timeout|timed out|网络|超时|连接失败)/i;

/**
 * 归类一条聊天错误。
 * @param {unknown} error Error / string / JSON 串 / 结构化对象
 * @returns {'rate-limit'|'quota'|'auth'|'network'|'upstream'|'unknown'}
 */
export function classifyChatError(error) {
  const text = errorTextOf(error);
  if (!text) return CHAT_ERROR_KINDS.UNKNOWN;
  if (RATE_LIMIT_RE.test(text)) return CHAT_ERROR_KINDS.RATE_LIMIT;
  if (QUOTA_RE.test(text)) return CHAT_ERROR_KINDS.QUOTA;
  if (AUTH_RE.test(text)) return CHAT_ERROR_KINDS.AUTH;
  if (NETWORK_RE.test(text)) return CHAT_ERROR_KINDS.NETWORK;
  if (/^[[{]/.test(text.trim()) || /请求失败|不可用|服务异常/.test(text)) {
    return CHAT_ERROR_KINDS.UPSTREAM;
  }
  return CHAT_ERROR_KINDS.UNKNOWN;
}

// ---- 面向用户的错误消息模板 ----

export const CHAT_ERROR_MESSAGES = {
  /** 通用生成失败 */
  generationFailed: (detail) =>
    detail ? `服务暂时繁忙，请稍后重试。\n\n详情：${detail}` : `服务暂时繁忙，请稍后重试。`,

  /**
   * 上游速率限制（2026-11-12 用户口径）。
   *
   * 用户原话：「显示当前我们遇到速率问题，请重试，**本次不扣减额度**」。
   * 两句话缺一不可：① 说人话（不是 provider 的 code/JSON）；② 明确不花钱 ——
   * 这是真的：EF 在拿不到 ok 的流时走 `release_ai_token_quota` 把预扣退掉
   * （见 supabase/functions/api-key-vault/index.ts 的流式失败分支）。
   */
  rateLimited: () => `我们遇到速率问题，请重试。\n\n本次不扣减额度。`,

  /** 资源搜索失败 */
  resourceSearchFailed: () => `资源搜索暂时失败，你也可以先打开资源中心手动搜索。`,

  /** 回答内容异常 */
  abnormalReply: '回答内容出现异常，请重新发送一次。',

  /** 无有效内容 */
  noValidContent: '我暂时没有生成到有效内容，请再试一次。',

  /** 用户主动停止 */
  generationStopped: '已停止生成。',

  /** 带已有内容的停止提示 */
  generationStoppedWithContent: (content) => `${content}\n\n（已停止生成）`,

  /** 生成超时 */
  generationTimeout: '生成超时已自动停止，请重试。',

  /** 回答异常自动停止 */
  degenerateReplyStopped: '回答出现异常已自动停止，请重试。',

  /** 资源搜索已停止 */
  resourceSearchStopped: '资源搜索已停止。',
};

/**
 * 「这条 AI 消息其实是一条失败提示」—— 任务面板据此把状态判成「需要处理」。
 *
 * ⚠️ 单一真源：`useBohShell` 曾自己写死 `/^(?:服务暂时繁忙|请求失败|…)/` 的前缀正则，
 * 新增一条失败文案（如 `rateLimited`）时它会**静默失配**，面板把失败显示成「已完成」。
 * 所以判定必须放在文案旁边：前缀从模板本身取（`FAILURE_TEMPLATE_KEYS`），
 * **新增失败文案只需在这一处登记 key**，不再抄一份字面量。
 * ⚠️ 只登记「失败」：`generationStopped` 这类用户主动停止**不算**失败，
 *    否则「停止生成」也会被面板标成需要处理。
 */
const FAILURE_TEMPLATE_KEYS = ['generationFailed', 'rateLimited', 'noValidContent'];

export const isGenerationErrorText = (text = '') => {
  const value = String(text || '').trim();
  if (!value) return false;
  const prefixes = FAILURE_TEMPLATE_KEYS.map((key) => {
    const template = CHAT_ERROR_MESSAGES[key];
    const sample = typeof template === 'function' ? template('') : template;
    return String(sample || '').split('\n')[0];
  }).filter(Boolean);
  return (
    prefixes.some((prefix) => value.startsWith(prefix)) ||
    // 兜底：历史消息里可能是旧版文案 / 引擎各处的直接错误串
    /^(?:服务暂时繁忙|请求失败|发生错误|连接失败|无法连接|API Key 管理服务异常|我们遇到速率问题)/u.test(
      value,
    )
  );
};

/**
 * 为 catch 块中的 AbortError 生成用户可见的停止消息。
 *
 * @param {string} [currentContent=''] - 当前已有的回复内容
 * @param {object} [options]
 * @param {boolean} [options.timedOut=false] - 是否超时
 * @param {boolean} [options.isDegenerate=false] - 是否退化回复
 * @returns {string}
 */
export function getAbortMessage(
  currentContent = '',
  { timedOut = false, isDegenerate = false } = {},
) {
  if (timedOut) return CHAT_ERROR_MESSAGES.generationTimeout;
  if (isDegenerate) return CHAT_ERROR_MESSAGES.degenerateReplyStopped;
  if (currentContent) return CHAT_ERROR_MESSAGES.generationStoppedWithContent(currentContent);
  return CHAT_ERROR_MESSAGES.generationStopped;
}
