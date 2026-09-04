/**
 * useIntentDetection — 意图检测纯函数
 *
 * 从 useChatEngine 中提取的所有意图判定逻辑，无副作用、无响应式依赖
 * （shouldUseTreeholeContext 除外，需外部传入响应式状态）。
 */

import {
  normalizeText,
  isOperationQuestion,
  containsAnyKeyword,
  normalizePromptLine
} from './bohai-engine-helpers.js';
import { normalizeActionDecisionText } from '@/utils/bohai-action-draft-intent.js';
import { SHARED_MEMORY_TRIGGER_KEYWORDS, BOH_MEMBER_NAMES, HEALTH_TRIGGER_KEYWORDS } from './chat-engine-config.js';

// ─── 社群意图 ────────────────────────────────────────────────────────────────

export const isCommunityQuestion = (text) => {
  // 参数验证：确保text是有效的字符串
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const memberNames = BOH_MEMBER_NAMES.split('|');
  // 高频通用词（boh/mc/lol/服务器/联机/活动/成员）已移除，避免普通问题被误判为社区问题
  const communityKeywords = [
    '方块之家', '社区', ...memberNames,
    '论坛', '帖子', '公告', '周年庆', '内战',
    'hypixel', '我的世界', 'minecraft', '英雄联盟', '王者荣耀'
  ];
  const normalized = normalizeText(text);
  return communityKeywords.some(keyword => normalized.includes(keyword));
};

export const isCommunityCreativeRequest = (text) => {
  // 参数验证：确保text是有效的字符串
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return /(写|生成|创作|改写|润色|设计|起草|文案|口号|标题|祝福|海报|宣传语|故事|诗|歌词|设定|梗图)/.test(normalized);
};

// ─── 记忆上下文路由 ──────────────────────────────────────────────────────────

export const shouldUseMemoryContext = (text) => {
  // 参数验证：确保text是有效的字符串
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  if (isOperationQuestion(text)) return false;
  return isCommunityQuestion(text);
};

export const shouldUseSharedMemoryContext = (text) => {
  // 参数验证：确保text是有效的字符串
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (isOperationQuestion(normalized)) return false;

  // 先做关键词判断：只有"可能涉及公共记忆事实"的问题才触发共享记忆检索。
  if (containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS)) {
    return true;
  }

  if (!isCommunityQuestion(normalized)) {
    return false;
  }

  const memoryJudgementPattern = /(谁|什么|发生|提到|记得|之前|曾经|最近|历史|往事|来源|细节|介绍)/;
  return memoryJudgementPattern.test(normalized);
};

// ─── BOH Health 健康意图 ────────────────────────────────────────────────────

export const isHealthQuestion = (text) => {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalized = normalizeText(text);
  if (!normalized) return false;
  // 站点操作类问题（例如「健康页面在哪里」）不走健康数据检索
  if (isOperationQuestion(normalized)) return false;

  return containsAnyKeyword(normalized, HEALTH_TRIGGER_KEYWORDS);
};

/**
 * shouldUseHealthContext — 命中健康关键词即读取本机 BOH Health 数据。
 * 数据来源是 localStorage，不要求登录。
 * @param {string} text
 */
export const shouldUseHealthContext = (text) => isHealthQuestion(text);

// ─── 树洞意图 ────────────────────────────────────────────────────────────────

export const isTreeholeReflectionQuestion = (text) => {
  // 参数验证：确保text是有效的字符串
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (isOperationQuestion(normalized)) return false;

  const explicitKeywords = [
    'note', '日记', '笔记', '记录', '记忆', '复盘', '回顾', '总结我', '我的情况', '我的状态',
    '我的情绪', '我的习惯', '我最近', '我一直', '我总是', '给我建议', '我的计划'
  ];
  if (explicitKeywords.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const reflectivePattern = /(我|我的|自己).*(最近|一直|总是|复盘|回顾|习惯|情绪|状态|变化|记录|记忆|总结|日记|笔记)/;
  return reflectivePattern.test(normalized);
};

/**
 * shouldUseTreeholeContext — 需要外部传入响应式状态
 * @param {string} text
 * @param {{ isTreeholeMemoryEnabled: boolean, isLoggedIn: boolean, userInfo: { id: string }|null }} state
 */
export const shouldUseTreeholeContext = (text, state) => {
  // 参数验证：确保text和state是有效的
  if (!text || typeof text !== 'string') {
    return false;
  }
  if (!state || typeof state !== 'object') {
    return false;
  }
  
  if (!state.isTreeholeMemoryEnabled) return false;
  if (!state.isLoggedIn || !state.userInfo?.id) return false;
  return isTreeholeReflectionQuestion(text);
};

// ─── 树洞创建确认/拒绝 ──────────────────────────────────────────────────────

export const isTreeholeCreateConfirm = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  const allowList = new Set([
    '是', '是的', '好', '好的', '可以', '行', '确认', '同意', '需要',
    '创建', '创建树洞', '帮我创建', '帮我创建树洞', 'ok', 'yes', 'y'
  ]);
  return allowList.has(normalized);
};

export const isTreeholeCreateReject = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  const denyList = new Set([
    '否', '不用', '不需要', '取消', '算了', '暂不', '不要', 'no', 'n'
  ]);
  return denyList.has(normalized);
};

// ─── 共享记忆保存确认/拒绝 ──────────────────────────────────────────────────

export const isSharedMemorySaveConfirm = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  return new Set(['是', '是的', '好', '好的', '可以', '行', '确认', '确定', '同意', '写入', '保存', '记录', '加入记忆库', 'ok', 'yes', 'y']).has(normalized);
};

export const isSharedMemorySaveReject = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  return new Set(['否', '不用', '不需要', '取消', '算了', '暂不', '不要', '不写入', '不保存', '不记录', 'no', 'n']).has(normalized);
};

export const resolveMemorySaveDestinationFromText = (text, fallback = 'ask') => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return fallback;
  if (/(两者|两个都|都存|都保存|都写入|同时|一起|cloud\+和公共|公共记忆和cloud)/i.test(normalized)) return 'both';
  if (/(cloud\+|cloud|随手记|日记|私有|私人|个人记录)/i.test(normalized)) return 'cloud';
  if (/(公共记忆|公共|共享记忆|社群记忆|记忆库)/i.test(normalized)) return 'shared';
  if (isSharedMemorySaveConfirm(text) && ['cloud', 'shared', 'both'].includes(fallback)) return fallback;
  return fallback;
};

export const formatMemorySavePrompt = (content, destination = 'ask') => {
  const safeContent = normalizePromptLine(content, 320);
  if (destination === 'cloud') {
    return `要把这条内容记录到 BOH Cloud+ 吗？\n\n${safeContent}\n\n回复"确认"保存，回复"取消"跳过。`;
  }
  if (destination === 'shared') {
    return `要把这条内容写入 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复"确认"写入，回复"取消"跳过。`;
  }
  if (destination === 'both') {
    return `要把这条内容同时保存到 BOH Cloud+ 和 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复"确认"保存到两处，回复"取消"跳过。`;
  }
  return `这条内容要保存到哪里？\n\n${safeContent}\n\n可以回复 Cloud+、公共记忆、两者都保存，或"不保存"。`;
};

// ─── 思考主题摘要 ────────────────────────────────────────────────────────────

export const summarizeThinkingSubject = (text) => {
  const normalized = normalizePromptLine(text, 28);
  if (!normalized) return '这个问题';
  return normalized.length >= 28 ? `${normalized.slice(0, 25)}...` : normalized;
};
