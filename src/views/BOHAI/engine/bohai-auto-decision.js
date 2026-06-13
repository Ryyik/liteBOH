// BOH AI Auto 模式决策合并 / 裁剪 / 解析工具
// ------------------------------------------------------------
// 把 useChatEngine.js 中的"auto 路由相关纯函数"集中到这里，
// 便于单测覆盖与未来跨模块复用。
//
// 暴露的纯函数：
//   - createNeutralAutoDecision
//   - normalizeAutoClassifierBoolean
//   - sanitizeAutoDecisionForPostDraft
//   - sanitizeAutoDecisionForLookup
//   - sanitizeAutoDecisionForUserText（组合上面两个）
//   - normalizeAutoSaveDestination
//   - shouldAskModelForAutoDecision
//   - pickMoreCapableMode
//   - computeModeFromDecision（统一 modeId 入口）
//   - mergeAutoDecisionWithLocalGuardrails
//   - hasExplicitAutoSaveIntent
//   - isLookupOrSummaryRequest
//   - safeParseAutoClassifierJson
// ------------------------------------------------------------

import {
  BOH_AUTO_MODE_ID,
  pickMoreCapableMode,
  pickModeFromLocalSignals,
  resolveBOHAIAutoModeDecision,
  EMPTY_AUTO_DECISION
} from './bohai-auto-router.js';

// AUTO 路由严格只指向 Pro / Fast 两个模式(2026-06-08 决定)。
export const AUTO_MODES = ['fast', 'pro'];

export const isAutoModeId = (id) => id === BOH_AUTO_MODE_ID;

export const createNeutralAutoDecision = () => ({
  modeId: 'fast',
  codeOrCommand: false,
  minecraftCommand: false,
  dailySummary: false,
  planMode: false,
  bohInternalFactual: false,
  complexQuestion: false,
  communityMemoryShare: false,
  personalSupport: false,
  shouldSearchWeb: false,
  shouldReferenceCloud: false,
  shouldSaveCloud: false,
  shouldSaveSharedMemory: false,
  saveDestination: 'none',
  shouldAskMemoryDestination: false,
  forceCloudReference: false,
  shouldAskSharedMemory: false,
  actionNotes: [],
  confidence: 0
});

export const normalizeAutoClassifierBoolean = (value) => (
  value === true || value === 'true' || value === 1 || value === '1'
);

export const sanitizeAutoDecisionForPostDraft = (decision) => {
  if (!decision) return decision;
  return {
    ...decision,
    shouldSearchWeb: false,
    shouldSaveCloud: false,
    shouldSaveSharedMemory: false,
    saveDestination: 'none',
    shouldAskMemoryDestination: false,
    shouldAskSharedMemory: false,
    actionNotes: dedupeActionNotes(
      (decision.actionNotes || []).filter((note) => !/联网|搜索|记忆|保存|写入/.test(String(note || '')))
    )
  };
};

export const sanitizeAutoDecisionForLookup = (decision) => {
  if (!decision) return decision;
  return {
    ...decision,
    communityMemoryShare: false,
    shouldSaveCloud: false,
    shouldSaveSharedMemory: false,
    saveDestination: 'none',
    shouldAskMemoryDestination: false,
    shouldAskSharedMemory: false,
    actionNotes: dedupeActionNotes(
      (decision.actionNotes || []).filter((note) => !/记忆|保存|写入/.test(String(note || '')))
    )
  };
};

export const sanitizeAutoDecisionForUserText = (decision, userText, helpers = {}) => {
  if (!decision) return decision;
  let result = decision;
  if (helpers.isPostDraftRequest?.(userText)) {
    result = sanitizeAutoDecisionForPostDraft(result);
  }
  const explicitSave = helpers.hasExplicitAutoSaveIntent?.(userText)
    || hasExplicitAutoSaveIntent(userText);
  const isLookup = helpers.isLookupOrSummaryRequest?.(userText)
    || isLookupOrSummaryRequest(userText);
  if (!explicitSave && isLookup) {
    result = sanitizeAutoDecisionForLookup(result);
  }
  return result;
};

export const hasExplicitAutoSaveIntent = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,20}(cloud\+|cloud|随手记|日记|笔记|公共记忆|共享记忆|社群记忆|记忆库|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下).{0,20}(这|这条|这段|内容|事情|事|到|进)?)/i.test(normalized);
};

export const isLookupOrSummaryRequest = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  const requestPattern = /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|大家在聊)/i;
  const sourcePattern = /(论坛|帖子|社区|社群|方块之家|boh|公共记忆|共享记忆|记忆库|cloud\+|cloud|随手记|日记|笔记|记录)/i;
  return requestPattern.test(normalized) && sourcePattern.test(normalized);
};

export const dedupeActionNotes = (notes = [], { maxItems = 4, maxChars = 120 } = {}) => {
  const source = Array.isArray(notes) ? notes : [notes];
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    if (raw === null || raw === undefined) continue;
    const text = String(raw).replace(/\s+/g, ' ').trim().slice(0, maxChars);
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
};

export const normalizeAutoSaveDestination = (value, decision = {}) => {
  const normalized = String(value || '').toLowerCase().trim();
  if (['cloud', 'cloud+', 'private', 'quick_note', 'note'].includes(normalized)) return 'cloud';
  if (['shared', 'public', 'memory', 'public_memory', 'shared_memory'].includes(normalized)) return 'shared';
  if (['both', 'all', 'cloud_and_shared', 'cloud+public'].includes(normalized)) return 'both';
  if (['ask', 'unclear'].includes(normalized)) return 'ask';
  if (decision.shouldSaveCloud && decision.shouldSaveSharedMemory) return 'both';
  if (decision.shouldSaveCloud) return 'cloud';
  if (decision.shouldSaveSharedMemory) return 'shared';
  return 'none';
};

export const hasHardRoute = (decision = {}) => Boolean(
  decision.codeOrCommand
  || decision.minecraftCommand
  || decision.dailySummary
  || decision.planMode
  || decision.shouldSearchWeb
  || decision.shouldReferenceCloud
  || decision.shouldSaveCloud
  || decision.shouldSaveSharedMemory
  || decision.shouldAskMemoryDestination
);

export const shouldAskModelForAutoDecision = (userText, fallback = null, { shortTextLimit = 28 } = {}) => {
  const normalized = String(userText || '').trim();
  if (!normalized) return false;
  if (fallback && Number(fallback.confidence || 0) >= 0.92) {
    if (hasHardRoute(fallback)) return false;
  }
  if (normalized.length <= shortTextLimit && !/[?？]/.test(normalized)) {
    return false;
  }
  return true;
};

export const resolveAutoModeDecisionLocally = (userText, {
  isAutoMode = false,
  cloudReferenceEnabled = false,
  isLoggedIn = false,
  helpers = {}
} = {}) => {
  const decision = resolveBOHAIAutoModeDecision(userText, {
    isAutoMode,
    cloudReferenceEnabled,
    isLoggedIn
  });
  return sanitizeAutoDecisionForUserText({
    ...decision,
    actionNotes: Array.isArray(decision.actionNotes) ? [...decision.actionNotes] : []
  }, userText, helpers);
};

export const safeParseAutoClassifierJson = (raw) => {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  text = text.replace(/^\s*\/\/.*$/gm, '');
  text = text.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(text);
  } catch (_firstError) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1'));
        if (
          parsed
          && typeof parsed === 'object'
          && !Array.isArray(parsed)
          && Object.keys(parsed).length === 0
          && text.trim().length > match[0].length
        ) {
          return null;
        }
        return parsed;
      } catch (_secondError) {
        return null;
      }
    }
    return null;
  }
};

export const computeModeFromDecision = (decision, fallback = 'fast') => {
  if (!decision) return fallback;
  const modeId = pickModeFromLocalSignals({
    codeOrCommand: decision.codeOrCommand,
    dailySummary: decision.dailySummary,
    shouldSearchWeb: decision.shouldSearchWeb,
    shouldReferenceCloud: decision.shouldReferenceCloud,
    complexQuestion: decision.complexQuestion,
    bohInternalFactual: decision.bohInternalFactual
  });
  let chosen = modeId;
  if (decision.minecraftCommand) chosen = 'pro';
  if (decision.communityMemoryShare) {
    chosen = pickMoreCapableMode(chosen, 'pro');
  }
  if (decision.personalSupport) {
    chosen = pickMoreCapableMode(chosen, 'fast');
  }
  if (!chosen && fallback) chosen = fallback;
  return chosen;
};

/**
 * Merge fast-model decision with local guardrails.
 *
 * P1-B-7 fix (2026-06-09): Added shouldSaveCloud, shouldSaveSharedMemory,
 * and shouldAskMemoryDestination to hardBooleanFields to prevent the
 * fast-model's correctly-identified "save" intent from being overwritten
 * by local regex fallbacks.
 */
export const mergeAutoDecisionWithLocalGuardrails = (modelDecision = {}, localDecision = {}) => {
  const merged = {
    ...createNeutralAutoDecision(),
    ...modelDecision
  };

  const hardBooleanFields = [
    'codeOrCommand',
    'minecraftCommand',
    'dailySummary',
    'planMode',
    'complexQuestion',
    'shouldReferenceCloud',
    'forceCloudReference',
    'bohInternalFactual',
    'personalSupport',
    // P1-B-7: Add 3 save-related fields so fast-model "save" intents
    // are NOT overwritten by local regex fallback (which is less accurate
    // at detecting natural-language save requests).
    'shouldSaveCloud',
    'shouldSaveSharedMemory',
    'shouldAskMemoryDestination'
  ];
  for (const field of hardBooleanFields) {
    merged[field] = Boolean(merged[field] || localDecision[field]);
  }

  if (localDecision.shouldSaveCloud || localDecision.shouldSaveSharedMemory || localDecision.shouldAskMemoryDestination) {
    merged.communityMemoryShare = Boolean(merged.communityMemoryShare || localDecision.communityMemoryShare);
    merged.saveDestination = localDecision.saveDestination || merged.saveDestination || 'ask';
  }

  merged.modeId = computeModeFromDecision(merged, localDecision.modeId || 'fast');
  merged.forceCloudReference = Boolean(merged.forceCloudReference || merged.shouldReferenceCloud || merged.dailySummary);
  merged.shouldAskSharedMemory = Boolean(merged.shouldSaveSharedMemory || merged.communityMemoryShare || localDecision.shouldAskSharedMemory);
  merged.confidence = Math.max(Number(merged.confidence || 0), Number(localDecision.confidence || 0));
  merged.actionNotes = dedupeActionNotes([
    ...(Array.isArray(merged.actionNotes) ? merged.actionNotes : []),
    ...(Array.isArray(localDecision.actionNotes) ? localDecision.actionNotes : [])
  ]);

  return merged;
};

export { pickMoreCapableMode, EMPTY_AUTO_DECISION };
