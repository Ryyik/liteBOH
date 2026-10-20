/**
 * knowledge-plan-switches.js — 知识源开关对检索计划的统一应用（2026-10-17 建立，2026-10-19 合并）。
 *
 * 背景（用户报告）：「官方记忆开着，第二次问 AI 就不从记忆库找了」——
 * 旧行为里开关只能"关"（off ⇒ memory/siteGuide 强制 false），"开"时仍由
 * `shouldUseMemoryContext` 的关键词路由决定查不查 ⇒ 第二问措辞没命中关键词就静默跳过，
 * 开关形同虚设。
 *
 * 新语义：`isKnowledgeBaseEnabled` 是**显式用户意图** —— ON ⇒ 官方记忆（core_memory +
 * knowledge_base + forum_memory）、社区帖子（forum）、AI 公共记忆（shared_memory）每条消息
 * 必查，压过内容路由；OFF ⇒ 这三者与 siteGuide 全部强制关闭。
 * siteGuide（站点操作手册）不在开关语义内，ON 时保持路由判定。
 *
 * 2026-10-19 合并：原先「官方记忆」（`isKnowledgeBaseEnabled`）、「社区搜索」
 * （`isForumSearchEnabled`）、「社区知识」（`isSharedMemoryEnabled`）是三个独立开关，
 * 现按用户口径合并为**一个**持久化开关（沿用「官方记忆」这个名字），默认 ON。
 * 语义真源只此一处 —— 别在别处再写第二份「论坛/公共记忆是否开启」判断。
 *
 * 成本论证：官方库很小（事实 28 条 + 论坛卡少量），公共记忆有 RPC 缓存，
 * 每条消息多一两次小向量检索可忽略；无关内容由 minSimilarity + 重排 + 上下文压缩兜底。
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
    next.forum = false;
    next.sharedMemory = false;
    return next;
  }
  next.memory = true;
  next.forum = true;
  next.sharedMemory = true;
  return next;
};
