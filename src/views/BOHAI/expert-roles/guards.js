/**
 * 心理访谈输出守门（生成后校验）
 *
 * 为什么需要它：prompt 是软约束。
 * 2026-09-16 两次真实访谈都出现了「问句里塞选项」「一轮多问」「替用户编造经历」，
 * 而这些句式在 prompt 里已经明令禁止过。基础模型的「助手惯性」（理解问题→给方案→给选择）
 * 强于文字规则，只能靠代码兜底。
 *
 * 分工：
 * - 本文件只做「检测 + 给出重写指令」，不发起请求、不改消息（保持纯函数，好测）。
 * - 真正调用重写的地方在 useChatEngine（接线层），由它决定要不要多花一次调用。
 *
 * 「编造」不做自动检测：它需要语义判断，正则误报会伤到正常回答（假阳性比漏检更糟）。
 * 编造只能靠 prompt 里的【只能用他说过的话】+ 人工反馈来收敛。
 */

export const VIOLATION_TYPES = Object.freeze({
  OPTIONS: 'options',
  MULTI_QUESTION: 'multi_question',
  REPEAT: 'repeat',
  PARROT: 'parrot',
  TERMS: 'terms',
  ADVICE: 'advice'
});

/** 直接毁掉访谈体验、必须重写的类型 */
export const HARD_VIOLATIONS = Object.freeze([
  VIOLATION_TYPES.OPTIONS,
  VIOLATION_TYPES.MULTI_QUESTION,
  VIOLATION_TYPES.REPEAT,
  VIOLATION_TYPES.PARROT
]);

/**
 * 「复述对方原话」的阈值：AI 回复与用户上一句的包含度超过它，
 * 说明这句回复基本是把对方的话重排了一遍（实测最主要的退化形态）。
 * 取 0.75 要求「原话的大部分都被照搬」，只提几个词的正常承接不会命中。
 */
export const PARROT_SIMILARITY_THRESHOLD = 0.75;

/**
 * 「换个说法又问同一件事」的相似度阈值。
 * 取 0.7 偏高是为了防误报 —— 正常承接本来就会复现对方几个词，
 * 误报会让守门频繁触发重写（多一次调用 + 明显延迟），比漏检更伤。
 */
export const REPEAT_SIMILARITY_THRESHOLD = 0.7;

/** 二元组重合率（无外部依赖，中文按字切） */
export const gramsOf = (text = '') => {
  const s = String(text).replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
};

/**
 * 二元组「包含度」= 交集 / 较小集合大小。
 * 必须用对称度量：第一版拿第二个参数当分母，于是「上一问很长、当前问很短」时
 * 相似度被算得极低 —— 实测漏掉了一次逐字重复的提问（轮 2 与轮 1 完全同句）。
 */
export const similarity = (a = '', b = '') => {
  const gx = gramsOf(a);
  const gy = gramsOf(b);
  if (gx.size < 3 || gy.size < 3) return 0;
  let intersection = 0;
  gy.forEach((gram) => { if (gx.has(gram)) intersection += 1; });
  return intersection / Math.min(gx.size, gy.size);
};

const TERM_PATTERN = /(向下箭头|向上箭头|例外问句|量尺问句|独特结果|外化对话|OARS|P[0-6]\s*命中|优先级\s*P\d)/;
const ADVICE_PATTERN = /(你可以试试|你可以尝试|建议你|我的建议是|不妨|不如你|试试看能不能)/;
const QUOTE_PATTERN = /[「『“"][^」』”"]*[」』”"]/g;

/** 拆句：只把问句纳入判定，避免把陈述里的「还是」误判成选项 */
export const splitQuestions = (text = '') =>
  String(text || '')
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[？?]/.test(sentence));

/**
 * 检测一轮回复里的违规。
 * @returns {Array<{type: string, sample?: string, count?: number}>}
 */
export const detectViolations = (text = '', { prevReply = '', prevUserText = '' } = {}) => {
  const raw = String(text || '');
  const findings = [];
  const questions = splitQuestions(raw);

  // 0a) 复述对方原话（把他的话重排一遍当「接住」）—— 实测里最主要的退化形态
  if (prevUserText) {
    const parrotScore = similarity(raw, prevUserText);
    if (parrotScore >= PARROT_SIMILARITY_THRESHOLD) {
      findings.push({ type: VIOLATION_TYPES.PARROT, score: Number(parrotScore.toFixed(2)) });
    }
  }

  // 0b) 与上一问几乎重复 —— 实测里最伤人的一种：对方答了「不知道」，它换个说法又问一遍
  if (prevReply) {
    const score = similarity(raw, prevReply);
    if (score >= REPEAT_SIMILARITY_THRESHOLD) {
      findings.push({ type: VIOLATION_TYPES.REPEAT, score: Number(score.toFixed(2)) });
    }
  }

  // 1) 举例式 / 二选一式选项：去掉引号内的引用再判定
  questions.forEach((question) => {
    const stripped = question.replace(QUOTE_PATTERN, '');
    if (/(还是|或者)/.test(stripped)) {
      findings.push({ type: VIOLATION_TYPES.OPTIONS, sample: question.slice(0, 60), reason: '还是/或者' });
    } else if (/(比如|例如)/.test(stripped)) {
      findings.push({ type: VIOLATION_TYPES.OPTIONS, sample: question.slice(0, 60), reason: '比如/例如' });
    }
  });

  // 2) 一轮多问
  if (questions.length > 1) {
    findings.push({ type: VIOLATION_TYPES.MULTI_QUESTION, count: questions.length });
  }

  // 3) 技术术语泄露
  if (TERM_PATTERN.test(raw)) {
    findings.push({ type: VIOLATION_TYPES.TERMS });
  }

  // 4) 访谈期给建议
  if (ADVICE_PATTERN.test(raw)) {
    findings.push({ type: VIOLATION_TYPES.ADVICE });
  }

  return findings;
};

export const hasHardViolation = (findings = []) =>
  findings.some((finding) => HARD_VIOLATIONS.includes(finding.type));

/** 是否需要重写：硬违规一律重写；术语/建议也重写（它们同样破坏访谈姿态） */
export const shouldRewrite = (findings = []) =>
  findings.some((finding) => Object.values(VIOLATION_TYPES).includes(finding.type));

const REWRITE_HINTS = Object.freeze({
  [VIOLATION_TYPES.OPTIONS]:
    '你上一轮的问题里塞了举例或选项。去掉所有「比如」「例如」「还是」「或者」，只留一个开放问题；要问细节就直接问，不要举例。',
  [VIOLATION_TYPES.MULTI_QUESTION]:
    '你上一轮问了不止一个问题。只保留最关键的那一个问句，其余全删。',
  [VIOLATION_TYPES.TERMS]:
    '上一轮出现了技术名词。用大白话重说同一件事，不要出现任何术语。',
  [VIOLATION_TYPES.ADVICE]:
    '上一轮给了建议。访谈期不给建议——删掉建议，改成一句追问。',
  [VIOLATION_TYPES.PARROT]:
    '你这一轮把对方刚说的话重排了一遍当「接住」——那不是接住，是复述。删掉复述部分，只留问题；如果你的确想确认理解，用你自己的词说成一句短话（不超过 15 字），不要照搬他的原句。',
  [VIOLATION_TYPES.REPEAT]:
    '你这一问和上一问几乎是同一件事，等于把同一个问题又抛了一遍。必须换入口：从对方最新那句话里挑一个具体词，或者把问题缩小到他某一次具体经历。不要再问同一件事。'
});

/**
 * 构造重写指令（拼进下一次生成的提示）。
 * 去重：同一类型只提示一次。
 */
export const buildRewriteInstruction = (findings = []) => {
  const types = Array.from(new Set(findings.map((finding) => finding.type)));
  const lines = types.map((type) => REWRITE_HINTS[type]).filter(Boolean);
  if (!lines.length) return '';
  return [
    '【重写要求】你上一轮的输出违反了访谈规则，请重新输出这一轮的内容：',
    ...lines.map((line) => `- ${line}`),
    '重写后仍然只输出：一句接住（可选）+ 一个问题。不要解释你做错了什么。'
  ].join('\n');
};

/** 供日志/观测用的一行摘要 */
export const summarizeViolations = (findings = []) =>
  findings.map((finding) => finding.type).join(',') || 'none';
