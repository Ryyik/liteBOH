/**
 * BOH AI 能力决策的裁剪工具 —— 2026-10-02 收口
 * ------------------------------------------------------------
 * 历史：本文件原是「auto 模式」决策的合并/裁剪/解析层，含 10 个导出与一条
 * `mergeAutoDecisionWithLocalGuardrails` 合并链。auto 模式 2026-06-08 移除后，
 * 生产代码只剩一个入口 `resolveAutoModeDecisionLocally`，其余导出仅被单测引用。
 * 收口依据见 `plans/024-bohai-rules-and-latency-slimming.md` §1.4。
 *
 * 现在只做一件事：把 `resolveBOHAIAutoModeDecision` 的 5 个能力字段，
 * 按「本轮是不是发帖草稿 / 查询总结」裁剪掉不该出现的保存意图。
 *
 * 维护约定：本文件的每个导出都必须有生产消费方；新增前先确认调用点。
 * ------------------------------------------------------------
 */

import { resolveBOHAIAutoModeDecision } from './bohai-auto-router.js';

/**
 * 保存意图全关。
 * 发帖草稿与查询总结类请求不该触发「要保存到哪里」的追问 ——
 * 前者是创作、后者是读取，都不是「沉淀记忆」的语境。
 */
const SAVE_INTENT_OFF = Object.freeze({
  shouldSaveSharedMemory: false,
  saveDestination: 'none',
});

export const hasExplicitAutoSaveIntent = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,20}(cloud\+|cloud|随手记|日记|笔记|公共记忆|共享记忆|社群记忆|记忆库|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下).{0,20}(这|这条|这段|内容|事情|事|到|进)?)/i.test(
    normalized,
  );
};

export const isLookupOrSummaryRequest = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  const requestPattern =
    /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|大家在聊)/i;
  const sourcePattern =
    /(论坛|帖子|社区|社群|方块之家|boh|公共记忆|共享记忆|记忆库|cloud\+|cloud|随手记|日记|笔记|记录)/i;
  return requestPattern.test(normalized) && sourcePattern.test(normalized);
};

/**
 * 本地能力决策入口（纯函数，不调模型）。
 *
 * @param {string} userText
 * @param {{ helpers?: { isPostDraftRequest?: (text: string) => boolean } }} [options]
 */
export const resolveAutoModeDecisionLocally = (userText, { helpers = {} } = {}) => {
  const decision = { ...resolveBOHAIAutoModeDecision(userText) };

  // 发帖草稿：无论是否显式说了「存」，都不弹保存追问（沿用 2026-06 之前的既有行为）
  if (helpers.isPostDraftRequest?.(userText)) {
    return { ...decision, ...SAVE_INTENT_OFF };
  }

  // 查询/总结：只有用户没显式表达保存意图时才裁剪
  const explicitSave =
    helpers.hasExplicitAutoSaveIntent?.(userText) || hasExplicitAutoSaveIntent(userText);
  const isLookup =
    helpers.isLookupOrSummaryRequest?.(userText) || isLookupOrSummaryRequest(userText);
  if (!explicitSave && isLookup) {
    return { ...decision, ...SAVE_INTENT_OFF };
  }

  return decision;
};
