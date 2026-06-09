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

import { BOH_AUTO_MODE_ID, pickMoreCapableMode, pickModeFromLocalSignals, EMPTY_AUTO_DECISION } from './bohai-auto-router.js';

// AUTO 路由严格只指向 Pro / Fast 两个模式(2026-06-08 决定)。
// 旧 design 包含 plan / agent-cluster,但那会导致用户对"AUTO"的预期混乱:
// 用户开 AUTO 是为了"自动选 Pro 还是 Fast",不应该被偷偷切到 Plan / Agent。
// Plan / Agent 模式仍保留为用户主动选择(顶部下拉框),但不在 AUTO 路由出口里。
export const AUTO_MODES = ['fast', 'pro'];

export const isAutoModeId = (id) => id === BOH_AUTO_MODE_ID;

// 与原 useChatEngine 中一致的"中性"初始决策。
// 不冻结：merge 过程会写回新字段；只在 EMPTY 那个"空输入快返回"路径冻结。
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

// 论坛发帖草稿的"自动保存意图"裁剪：
// 发帖不是 Cloud+ / 共享记忆写入，应清理一切 saveDestination 标志。
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

// 查询/总结类请求的"自动保存"裁剪：
// 读取型请求不应该触发"是否要保存"对话框，但模型返回的 save 标志要清掉。
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

// 兼容旧入口：保留原 sanitizeAutoDecisionForUserText 行为。
// 内部按意图顺序应用 postDraft → lookup 两种裁剪。
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

// 是否还有必要让 fast-model 二次校验当前决策？
// 命中任一 hard-route 时直接走本地，跳过 fast-model 一次往返。
export const hasHardRoute = (decision = {}) => Boolean(
  decision.codeOrCommand
  || decision.minecraftCommand
  || decision.dailySummary
  || decision.planMode
  || decision.shouldReferenceCloud
  || decision.shouldSearchWeb
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

// 把 model 返回的 JSON 字符串解析为结构化 decision，
// 容忍 ```json 包裹、注释、尾随逗号等脏格式。
export const safeParseAutoClassifierJson = (raw) => {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  // 去掉 Markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  // 去掉行注释
  text = text.replace(/^\s*\/\/.*$/gm, '');
  // 把对象/数组之外的尾随逗号清理掉（简单处理）
  text = text.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(text);
  } catch (_firstError) {
    // 容错：尝试抓第一个 {...} 块
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1'));
        // 提取出来是空对象、且原文还有其他字符 → 说明 regex 太贪心误判，整段当非 JSON 处理
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

// 统一 modeId 选择：所有路由路径（local / merged / post-parse）
// 都走这一个函数，避免规则漂移。
// AUTO 模式严格只输出 'fast' | 'pro'。
//   - 'plan' 由用户主动从下拉框选,AUTO 不会越权
//   - 'agent-cluster' 同上
//   - 'think' 已被 Pro 吸收,不再单独存在
export const computeModeFromDecision = (decision, fallback = 'fast') => {
  if (!decision) return fallback;
  const modeId = pickModeFromLocalSignals({
    codeOrCommand: decision.codeOrCommand,
    dailySummary: decision.dailySummary,
    shouldReferenceCloud: decision.shouldReferenceCloud,
    complexQuestion: decision.complexQuestion,
    bohInternalFactual: decision.bohInternalFactual,
    shouldSearchWeb: decision.shouldSearchWeb
  });
  // 处理 minecraftCommand / communityMemoryShare 等"非模式入口"的副信号：
  // - minecraftCommand 直接走 pro(指令型,需要 Pro 的结构化能力)
  // - communityMemoryShare 视作"需要思考"的轻量信号 → 提升到 pro
  //   (新设计: 思考已被 Pro 吸收,这里直接用 pro,后续 Pro 会再判 Qwen/DeepSeek)
  // 注意:这里不再处理 planMode — AUTO 严格不越权切到 plan,真要 plan 由用户手动选
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

// 把 fast-model 返回的 decision 与本地 fallback 合并：
// - 硬布尔位任一为 true 即视为 true（保守，宁可多准备也不漏）
// - saveDestination / shouldAskMemoryDestination 等"写动作"以本地为准，
//   因为这些语义判断严重依赖本地正则。
// - modeId 用 computeModeFromDecision 统一算
// - confidence 取两者最大值
// - actionNotes 合并并去重
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
    'shouldSearchWeb',
    'shouldReferenceCloud',
    'forceCloudReference',
    'bohInternalFactual',
    'personalSupport'
  ];
  for (const field of hardBooleanFields) {
    merged[field] = Boolean(merged[field] || localDecision[field]);
  }

  if (localDecision.shouldSaveCloud || localDecision.shouldSaveSharedMemory || localDecision.shouldAskMemoryDestination) {
    merged.shouldSaveCloud = Boolean(merged.shouldSaveCloud || localDecision.shouldSaveCloud);
    merged.shouldSaveSharedMemory = Boolean(merged.shouldSaveSharedMemory || localDecision.shouldSaveSharedMemory);
    merged.shouldAskMemoryDestination = Boolean(merged.shouldAskMemoryDestination || localDecision.shouldAskMemoryDestination);
    merged.communityMemoryShare = Boolean(merged.communityMemoryShare || localDecision.communityMemoryShare);
    merged.saveDestination = localDecision.saveDestination || merged.saveDestination || 'ask';
  }

  merged.modeId = computeModeFromDecision(merged, localDecision.modeId || 'fast');
  merged.forceCloudReference = Boolean(merged.forceCloudReference || merged.shouldReferenceCloud || merged.dailySummary);
  merged.shouldAskSharedMemory = Boolean(merged.shouldSaveSharedMemory || merged.communityMemoryShare || localDecision.shouldAskSharedMemory);
  merged.confidence = Math.max(Number(merged.confidence || 0), Number(localDecision.confidence || 0));
  merged.actionNotes = dedupeActionNotes([
    // 模型返回的 notes 优先（更具上下文语义），本地兜底 notes 作为补充
    ...(Array.isArray(merged.actionNotes) ? merged.actionNotes : []),
    ...(Array.isArray(localDecision.actionNotes) ? localDecision.actionNotes : [])
  ]);

  return merged;
};

export { pickMoreCapableMode, EMPTY_AUTO_DECISION };
