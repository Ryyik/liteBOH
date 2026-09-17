/**
 * 心理访谈引擎 · 状态与注入文本构造
 *
 * 职责分工（关键设计，别混）：
 * - 【计数类】轮次 / 向下追问深度 / 距上次小结 / 短答连击 → 本文件负责。代码数得准，模型数不准。
 * - 【判断类】这个面覆盖了吗 / 这句是不是例外 / 该不该收尾 → 交给模型。它擅长判断，不擅长计数。
 *
 * 所以本文件不做覆盖打勾、不做「例外」识别 —— 只给模型「检查清单 + 可数的状态」。
 * 假信号比没信号更糟：误判会误导模型去追问不存在的东西。
 *
 * 另一个约束：这里只做「文本构造」，不改 UI、不碰渲染。
 * 状态挂会话对象、随会话持久化（见 bohai-chat-session-store.js 白名单）。
 */

import { PSYCH_TRACKS, PSYCH_L2_RULES, PSYCHOLOGIST_ROLE_ID } from './psychologist.js';

export const INTERVIEW_LIMITS = Object.freeze({
  ladderingMax: 2,
  summaryEvery: 4,
  wrapHintAt: 14,
  hardStopAt: 18,
  evidenceMax: 8,
  evidenceMaxChars: 80,
  stateBlockEvidenceItems: 3,
  stateBlockEvidenceChars: 60,
  shortReplyChars: 12,
  shortReplyStreak: 2
});

/** 信号词表：只用于给 L2 规则选取提供依据，不作为事实断言 */
export const SIGNAL_PATTERNS = Object.freeze({
  absolute: /(总是|从来|每次都|都这样|所有人|人人都|我就是|改不了|永远|根本|压根|没有一次|一直)/,
  should: /(应该|必须|不能|不应该|得先|一定要|本该|要是早点)/,
  body: /(胸口|心口|闷|喘不上气|心跳|手抖|发抖|胃|头疼|头皮|发紧|累|烦|难受|空落落)/,
  avoid: /(不知道|想不起来|没什么|就那样|还行|说不好|懒得|算了吧|反正)/,
  timeAnchor: /(小学|初中|高中|小时候|那时|那年|岁的时候|上学的时候|刚工作|以前)/,
  others: /(我妈|我爸|家里|老师|同学|朋友|室友|同事|领导|对象|男朋友|女朋友)/,
  exception: /(有一次|那次|上个月|上周有|那天我|居然|竟然|反而|还是做|做完了|没停)/
});

/** 反映性倾听的识别标志词（用于复位向下追问深度） */
const REFLECTION_RE = /(我听到|听起来|所以我理解|我理解得|换句话说|你的意思是|让我确认|我先复述|我把它记下来)/;
/** 意义类追问的识别标志词（用于累加向下追问深度） */
const LADDER_RE = /(意味着什么|说明什么|那说明你|对你来说意味|最让你|最坏|所以你是什么样|这说明了)/;

const CONCRETE_RE = /(\d|上周|上个月|昨天|前天|那天|有一次|每次|小学|初中|高中|我妈|我爸|老师|朋友|同事|室友|领导|工作|学校|考试|项目|计划)/;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * 是否处于心理访谈（封闭域）。
 * 用于两件事：① 关闭全部站内检索与记忆读写 ② 决定是否注入状态块与规则。
 * 只要会话挂着心理专家的 expertState 就算——报告阶段也算，访谈内容同样敏感。
 */
export const isPsychInterviewState = (expertState) =>
  Boolean(expertState && expertState.roleId === PSYCHOLOGIST_ROLE_ID);

export const findTrack = (trackId) =>
  PSYCH_TRACKS.find((track) => track.id === trackId) || PSYCH_TRACKS[1];

/** 抽取信号（返回命中的信号 key；无命中返回空数组） */
export const extractSignals = (text = '') => {
  const source = String(text || '');
  return Object.keys(SIGNAL_PATTERNS).filter((key) => SIGNAL_PATTERNS[key].test(source));
};

/** 从一轮回答里挑一条「可被追问的原话」（挑不出就返回 null，绝不硬凑） */
export const pickEvidence = (text = '') => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 10) return null;
  if (!CONCRETE_RE.test(clean)) return null;
  return clip(clean, INTERVIEW_LIMITS.evidenceMaxChars);
};

export const createExpertState = ({
  trackId = 'blindspot',
  birthDateSource = 'profile',
  now = Date.now()
} = {}) => ({
  roleId: 'psychologist',
  trackId,
  phase: 'interview',
  birthDateSource,
  askedCount: 0,
  ladderingDepth: 0,
  lastSummaryAt: 0,
  shortReplyStreak: 0,
  signals: [],
  evidence: [],
  lastUserText: '',
  startedAt: now,
  finishedAt: 0
});

/** 记录一轮用户回答（纯函数：返回新对象，不改原对象） */
export const recordUserTurn = (state = {}, text = '') => {
  const raw = String(text || '');
  const hits = extractSignals(raw);
  const short = raw.replace(/\s+/g, '').length < INTERVIEW_LIMITS.shortReplyChars;
  const nextEvidence = pickEvidence(raw);
  const evidence = nextEvidence && !(state.evidence || []).includes(nextEvidence)
    ? [...(state.evidence || []), nextEvidence].slice(-INTERVIEW_LIMITS.evidenceMax)
    : (state.evidence || []);
  const signals = Array.from(new Set([...(state.signals || []), ...hits])).slice(-24);

  return {
    ...state,
    askedCount: (Number(state.askedCount) || 0) + 1,
    shortReplyStreak: short ? (Number(state.shortReplyStreak) || 0) + 1 : 0,
    signals,
    evidence,
    lastUserText: clip(raw.replace(/\s+/g, ' '), 200)
  };
};

/**
 * 记录一轮 AI 回复。作用有二：
 * - 检测到「反映」→ 深度归零，并把本轮记为小结点
 * - 检测到「意义类追问」→ 深度 +1（上限略高于限制值，便于守门判定）
 * 启发式宁可宽松：漏判会让深度虚高、注入不必要的「禁止追问」，比误判更伤体验。
 */
export const recordAssistantTurn = (state = {}, text = '') => {
  const raw = String(text || '');
  const reflected = REFLECTION_RE.test(raw);
  const laddered = LADDER_RE.test(raw);
  let ladderingDepth = Number(state.ladderingDepth) || 0;
  let lastSummaryAt = Number(state.lastSummaryAt) || 0;

  if (reflected) {
    ladderingDepth = 0;
    lastSummaryAt = Number(state.askedCount) || 0;
  } else if (laddered) {
    ladderingDepth = Math.min(ladderingDepth + 1, INTERVIEW_LIMITS.ladderingMax + 1);
  }

  return { ...state, ladderingDepth, lastSummaryAt };
};

/**
 * 选取本轮要注入的 L2 情景规则（最多 2 条，顺序即优先级）。
 * 只使用可靠信号：深度与轮次是代码数出来的，短答连击是长度算出来的。
 */
export const pickL2Rules = (state = {}) => {
  const rules = [];
  const depth = Number(state.ladderingDepth) || 0;
  const asked = Number(state.askedCount) || 0;
  const sinceSummary = asked - (Number(state.lastSummaryAt) || 0);

  if (depth >= INTERVIEW_LIMITS.ladderingMax) rules.push(PSYCH_L2_RULES.laddering);
  if (sinceSummary >= INTERVIEW_LIMITS.summaryEvery) rules.push(PSYCH_L2_RULES.summary);
  if ((Number(state.shortReplyStreak) || 0) >= INTERVIEW_LIMITS.shortReplyStreak) rules.push(PSYCH_L2_RULES.shorten);
  if (asked >= INTERVIEW_LIMITS.wrapHintAt) rules.push(PSYCH_L2_RULES.wrap);

  return rules.slice(0, 2);
};

/** 构造状态块：让模型看得见自己走到哪（它数不准轮次，所以必须喂） */
export const buildStateBlock = (state = {}, track = null) => {
  const currentTrack = track || findTrack(state.trackId);
  const asked = Number(state.askedCount) || 0;
  const depth = Number(state.ladderingDepth) || 0;
  const sinceSummary = asked - (Number(state.lastSummaryAt) || 0);
  const evidence = Array.isArray(state.evidence) ? state.evidence : [];

  const lines = [
    '<interview_state>',
    `轨道：${currentTrack.name}（第 ${asked + 1} 轮）`
  ];
  if (Array.isArray(currentTrack.coverage) && currentTrack.coverage.length) {
    lines.push(`应覆盖的面（自查，未覆盖的先补）：${currentTrack.coverage.join(' · ')}`);
  }
  lines.push(
    `向下追问深度：${depth} / ${INTERVIEW_LIMITS.ladderingMax}` +
    (depth >= INTERVIEW_LIMITS.ladderingMax ? '（再追一层之前必须先做反映）' : '')
  );
  lines.push(`距上次小结：${sinceSummary} 轮（满 ${INTERVIEW_LIMITS.summaryEvery} 轮需做一次）`);
  lines.push(`已采集原话依据：${evidence.length} 条`);
  evidence.slice(-INTERVIEW_LIMITS.stateBlockEvidenceItems).forEach((item) => {
    lines.push(`  · ${clip(item, INTERVIEW_LIMITS.stateBlockEvidenceChars)}`);
  });
  lines.push('</interview_state>');
  return lines.join('\n');
};

/** 构造末尾锚定块：放在离生成最近的位置（finalPrompt 结尾），拉行为底线 */
export const buildAnchorBlock = (state = {}, track = null) => {
  const currentTrack = track || findTrack(state.trackId);
  const asked = Number(state.askedCount) || 0;
  const depth = Number(state.ladderingDepth) || 0;
  const lines = [
    '【本轮唯一动作】只问一个问题。不给选项。不用技术名词。',
    `【当前状态】${currentTrack.name} · 第 ${asked + 1} 轮 · 向下深度 ${depth}/${INTERVIEW_LIMITS.ladderingMax}`
  ];
  pickL2Rules(state).forEach((rule) => lines.push(`【本轮必须】${rule}`));
  return lines.join('\n');
};

/** 是否该收尾（计数类判定；真正的收尾仍由模型与用户决定） */
export const shouldWrapUp = (state = {}) => {
  const asked = Number(state.askedCount) || 0;
  if (asked >= INTERVIEW_LIMITS.hardStopAt) return true;
  return asked >= INTERVIEW_LIMITS.wrapHintAt && (state.evidence || []).length >= 3;
};

/** 供前端调用：一次拿到本轮要注入的全部文本 */
export const buildPromptInjections = (state = {}, track = null) => ({
  stateBlock: buildStateBlock(state, track),
  anchorBlock: buildAnchorBlock(state, track),
  l2Rules: pickL2Rules(state),
  shouldWrapUp: shouldWrapUp(state)
});
