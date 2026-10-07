/**
 * followup.js — 追问判定 + 上下文追问查询改写
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import { MAX_HISTORY_MESSAGE_CHARS } from '../../composables/chat-engine-config.js';
import { normalizePromptLine, truncateText } from '../text/normalize.js';

const ELLIPTICAL_ELABORATION_PATTERN =
  /^(?:(?:请|麻烦)\s*)?(?:介绍(?:一?下)?|简单介绍(?:一?下)?|详细介绍(?:一?下)?|讲讲|讲一?下|说说|说一?下|展开讲讲|展开说说)(?:呢|吧|可以吗)?[？?。！!]*$/i;

export const isEllipticalElaborationFollowUp = (text = '') => {
  const normalized = normalizePromptLine(text, 80);
  return Boolean(normalized && ELLIPTICAL_ELABORATION_PATTERN.test(normalized));
};

export const isContextDependentFollowUp = (text = '') => {
  const normalized = normalizePromptLine(text, 200);
  if (!normalized) return false;
  // 显式追问词：代词/时间副词/延续动词/编号引用
  const explicitFollowUpPattern =
    /(这个|那个|上面|刚才|刚刚|前面|继续|展开|详细|多说|那|它|其|然后呢|还有呢|刚才提到|你说的|上一条|前面提到|接着|接下来|进一步|深入|细说)/i;
  // 编号引用追问：[W1]、F1、第2点、第二条等
  const referenceFollowUpPattern =
    /\[?[wfd]\d+\]?|第[一二三四五六七八九十\d]+\s*[条点步个]|上面\s*第\s*\d+\s*点/i;
  const shortAttributeQuestionPattern =
    /^(?:这个|那个|它|那)?(?:作用|用途|原理|好处|区别|怎么做|怎么练|有什么用|为什么|是什么|怎么办|咋办)(?:是?什么|呢|吗|呀|啊)?$/i;
  // 用户常用短句修正上一轮问题的时间范围。缺少主题时必须携带上一轮话题去检索，
  // 否则搜索引擎会把“最近呢，就这几天”当成词义问题。
  const temporalScopeFollowUpPattern =
    /^(?:(?:那|不(?:是)?|我是说|我的意思是)\s*[，,]?\s*)?(?:(?:最近|近期)(?:(?:几|两|三|一)天|一周|一个月)?(?:内|呢|的)?|(?:就\s*)?(?:这|近|过去)(?:几|两|三|一)天(?:内|呢)?)(?:\s*[，,]?\s*(?:就\s*)?(?:这|近|过去)(?:几|两|三|一)天(?:内|呢)?)?[？?。！!]*$/i;
  return (
    (explicitFollowUpPattern.test(normalized) ||
      referenceFollowUpPattern.test(normalized) ||
      shortAttributeQuestionPattern.test(normalized) ||
      temporalScopeFollowUpPattern.test(normalized) ||
      isEllipticalElaborationFollowUp(normalized)) &&
    normalized.length <= 120
  );
};

export const buildContextualFollowUpQuery = (
  userText = '',
  historyMessages = [],
  { maxChars = 900 } = {},
) => {
  const current = normalizePromptLine(userText, MAX_HISTORY_MESSAGE_CHARS);
  if (!current || !isContextDependentFollowUp(current)) return current;

  const source = Array.isArray(historyMessages) ? historyMessages : [];
  const previousTurns = [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (item?.meta?.kind === 'memory_saved_notice') continue;
    if (item?.role !== 'assistant' && item?.role !== 'user') continue;
    const content = truncateText(String(item?.content || '').trim(), 600);
    if (!content) continue;
    previousTurns.unshift(`${item.role === 'assistant' ? '助手' : '用户'}：${content}`);
    if (previousTurns.length >= 4) break;
  }

  if (previousTurns.length === 0) return current;
  return truncateText(`最近对话：${previousTurns.join(' | ')}\n当前追问：${current}`, maxChars);
};

// 联网检索默认只继承用户表达过的主题。“介绍一下”这类完全省略对象的追问会额外
// 携带上一轮回答用于定位实体，但明确标记为待核实，避免把它直接当成已确认事实。
export const buildContextualWebSearchQuery = (
  userText = '',
  historyMessages = [],
  { maxChars = 600 } = {},
) => {
  const current = normalizePromptLine(userText, MAX_HISTORY_MESSAGE_CHARS);
  if (!current || !isContextDependentFollowUp(current)) return current;

  const source = Array.isArray(historyMessages) ? historyMessages : [];
  const previousUserTurns = [];
  let previousAssistantTurn = '';
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (item?.meta?.kind === 'memory_saved_notice') continue;
    if (!previousAssistantTurn && item?.role === 'assistant') {
      previousAssistantTurn = normalizePromptLine(item?.content, 240);
      continue;
    }
    if (item?.role !== 'user') continue;
    const content = normalizePromptLine(item?.content, 260);
    if (!content || content === current) continue;
    previousUserTurns.unshift(content);
    if (previousUserTurns.length >= 2) break;
  }

  if (previousUserTurns.length === 0) return current;
  const queryParts = [`用户话题：${previousUserTurns.join('；')}`];
  if (isEllipticalElaborationFollowUp(current) && previousAssistantTurn) {
    queryParts.push(`上一轮回答提到（仅用于定位对象，请联网核实）：${previousAssistantTurn}`);
  }
  queryParts.push(`当前追问：${current}`);
  return truncateText(queryParts.join('；'), maxChars);
};
