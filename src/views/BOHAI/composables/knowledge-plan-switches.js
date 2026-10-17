/**
 * knowledge-plan-switches.js — 知识源开关对检索计划的统一应用（2026-10-17）。
 *
 * 背景（用户报告）：「官方记忆开着，第二次问 AI 就不从记忆库找了」——
 * 旧行为里开关只能"关"（off ⇒ memory/siteGuide 强制 false），"开"时仍由
 * `shouldUseMemoryContext` 的关键词路由决定查不查 ⇒ 第二问措辞没命中关键词就静默跳过，
 * 开关形同虚设。
 *
 * 新语义：`isKnowledgeBaseEnabled` 是**显式用户意图** —— ON ⇒ 官方记忆（core_memory +
 * knowledge_base + forum_memory）每条消息必查，压过内容路由；OFF ⇒ 维持原强制关闭。
 * siteGuide（站点操作手册）不在开关语义内，保持路由判定。
 *
 * 成本论证：官方库很小（事实 28 条 + 论坛卡少量），每条消息多一次 embedding + 一次
 * 小向量检索可忽略；无关内容由 minSimilarity + 重排 + 上下文压缩兜底。
 *
 * @param {Record<string, boolean>} plan 路由产出的检索计划（不会被原地修改）。
 * @param {{ knowledgeBaseEnabled?: boolean }} switches
 * @returns {Record<string, boolean>} 新计划对象。
 */
export const applyKnowledgeSourceSwitches = (plan = {}, { knowledgeBaseEnabled } = {}) => {
  const next = { ...plan };
  if (!knowledgeBaseEnabled) {
    next.memory = false;
    next.siteGuide = false;
    return next;
  }
  next.memory = true;
  return next;
};
