/**
 * response-rules.ts — **回答约束块**拼装（plans/025 v2 · Step 5-2 第三刀）
 *
 * `sendMessage` 在检索完成后，根据「本轮命中什么」拼出 4 段 `<constraints>` 规则：
 *   - responseRules    通用（永远有）
 *   - communityRules   站内事实题（`bohInternalFactualQuestion`）
 *   - evidenceRules    需要依据（`shouldEnforceGrounding`）
 *   - operationRules   操作类提问（`operationQuestion`）
 * 并顺带算出 `actualExtraChars`（供「实际注入字符数」观测口径）。
 *
 * 这段是**纯字符串拼装**（只依赖布尔标志与两个上下文的长度），所以能整块搬出来。
 *
 * ⚠️ 四段规则的**文本逐字保留** —— 它们是喂给模型的提示词，改一个字就是改行为。
 * ⚠️ `actualExtraChars` 的口径（只算这 4 段 + 两个上下文长度）也**不可改**，
 *    它是 `updateLastActualExtraChars` 的输入，观测口径一变历史数据就不可比。
 */

export interface ResponseRuleBlocksInput {
  /** 是否有论坛证据（`F1` 类引用）—— 决定要不要加「用发帖者信息指代」那段 */
  hasForumEvidence: boolean;
  /** 是否个人支持类请求（情绪/困扰）—— 决定要不要加「先接住情绪」那段 */
  personalSupportMode: boolean;
  /** 是否 Plan 模式 */
  isPlanMode: boolean;
  /** 是否「总结论坛最新内容」类提问 */
  latestForumSummaryMode: boolean;
  /** 是否站内事实题（BOH/论坛/成员/活动） */
  bohInternalFactualQuestion: boolean;
  /** 是否需要强制依据（事实题 / 操作题 / 联网 / 社区需证据） */
  shouldEnforceGrounding: boolean;
  /** 是否操作类提问 */
  operationQuestion: boolean;
  /** 内部证据上下文长度（字符） */
  internalEvidenceChars: number;
  /** 联网证据上下文长度（字符） */
  webEvidenceChars: number;
}

export interface ResponseRuleBlocks {
  responseRules: string;
  communityRules: string;
  evidenceRules: string;
  operationRules: string;
  /** 4 段规则 + 两个上下文的总字符数（观测口径，见文件头） */
  actualExtraChars: number;
}

/**
 * 拼装 4 段回答约束块。
 */
export const buildResponseRuleBlocks = ({
  hasForumEvidence,
  personalSupportMode,
  isPlanMode,
  latestForumSummaryMode,
  bohInternalFactualQuestion,
  shouldEnforceGrounding,
  operationQuestion,
  internalEvidenceChars,
  webEvidenceChars,
}: ResponseRuleBlocksInput): ResponseRuleBlocks => {
  const responseRules = `<constraints>
- 涉及社区事实时，优先依据检索内容回答。
- 涉及用户个人复盘时，优先结合 BOH Cloud+ 私有内容给出总结和建议。
- 追问时承接上一轮的结论直接推进，不要从头重新解释背景。
- 对于通用知识问题（非方块之家站内内容），直接给出最佳回答，不确定的部分标注不确定即可；不要建议用户去论坛搜索、不要提供搜索步骤，也不要问"你是想了解 X 还是想在论坛查帖子"。
${
  hasForumEvidence
    ? `- 总结论坛帖子时，用检索资料中的发帖者信息指代，不要泛称"有人提到"。
- 不要编造论坛用户、帖子或链接；没有检索到论坛资料时，不要提及论坛内容。`
    : ''
}
${personalSupportMode ? '- 用户在表达自己的困扰、情绪或身体状态时，先用 1-2 句接住他的处境和感受，再给最多 2-3 个低压力、今晚就能做的小动作；不要上来就列长清单，不要把普通困扰写成医学建议。结尾可以轻轻问一句具体情况，让用户愿意继续说。' : ''}
${isPlanMode ? '- Plan 模式下需要提问时用【追问】格式，不要直接在对话中发问；信息充足后用 - [ ] 输出结构化计划。' : ''}
${latestForumSummaryMode ? '- 用户要求总结论坛最新内容时，必须严格按 [F1]、[F2]、[F3]、[F4]、[F5] 的顺序输出；[F1] 是最新发布，后面依次更早。不得按热度、重要性或主题重排；若不足 5 条，只输出已检索到的条目。' : ''}
</constraints>`;

  let communityRules = '';
  if (bohInternalFactualQuestion) {
    communityRules = `<constraints>
- 涉及方块之家、BOH、论坛帖子、成员、活动、历史等内容时，依据检索到的资料回答。
- 不要凭印象补全人物、事件、时间线或统计数字。
- 资料没有覆盖的点，直接说“未检索到相关依据”即可。
</constraints>`;
  }

  let evidenceRules = '';
  if (shouldEnforceGrounding) {
    evidenceRules = `<constraints>
- 优先基于检索到的资料回答，不确定的部分直接说明不确定。
- 回答要自然流畅，不需要标注来源编号。
</constraints>`;
  }

  let operationRules = '';
  if (operationQuestion) {
    operationRules = `<constraints>
- 给出入口路径和操作步骤；简单操作用自然段落说明，复杂操作用编号步骤。
- 如果无法从已检索资料确认路径，直接说“无法确认该功能的准确路径”。
- 禁止猜测未出现过的页面路径或按钮文案。
</constraints>`;
  }

  const actualExtraChars =
    (internalEvidenceChars || 0) +
    (webEvidenceChars || 0) +
    (communityRules.length || 0) +
    (evidenceRules.length || 0) +
    (operationRules.length || 0);

  return { responseRules, communityRules, evidenceRules, operationRules, actualExtraChars };
};
