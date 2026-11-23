/**
 * intent.ts — **意图标志**阶段（plans/025 v2 · Step 5-2 的第一刀）
 *
 * `sendMessage` 在检索前要先算 6 个布尔意图标志，决定后面走哪条检索/规则分支。
 * 它们全是**纯函数**（只依赖两个文本 + 4 个谓词），所以能整块搬出来。
 *
 * ⚠️ 这里刻意**不引入 `ctx`**：本阶段不碰任何响应式状态（对比 `shortcuts.ts` 需要 ctx 注入
 * 有状态的 handler）。阶段签名统一为 `(options)`，需要状态时才升级成 `(ctx, options)`。
 */
import {
  isLikelyBohInternalFactualQuestion,
  isLikelyFactualQuestion,
} from '@/utils/ai-chat-grounding.js';
import {
  isCommunityCreativeRequest,
  isCommunityQuestion,
} from '../../composables/useIntentDetection.js';
import { isOperationQuestion } from '../../utils/intent/rules.js';

export interface IntentFlagsOptions {
  /** 用于意图判定的问题文本（可能是**消解后的追问**） */
  routingQueryText: string;
  /** 用户本轮**原话** —— 判定「社区创作请求」必须用它，不是消解后的文本 */
  userText: string;
}

export interface IntentFlags {
  operationQuestion: boolean;
  communityQuestion: boolean;
  communityCreativeRequest: boolean;
  communityNeedsEvidence: boolean;
  bohInternalFactualQuestion: boolean;
  factualQuestion: boolean;
}

/**
 * 计算 6 个意图标志。
 *
 * ⚠️ 两条**顺序/口径**不能改：
 *   1. `bohInternalFactualQuestion` 先算，`factualQuestion` 再把它 **或** 进去；
 *   2. `communityCreativeRequest` 必须用 `userText`（原话）—— 用消解后的 `routingQueryText`
 *      会把「帮我写个帖子」这类请求判成普通社区提问。
 */
export const computeIntentFlags = ({
  routingQueryText,
  userText,
}: IntentFlagsOptions): IntentFlags => {
  const operationQuestion = isOperationQuestion(routingQueryText);
  const communityQuestion = isCommunityQuestion(routingQueryText);
  const communityCreativeRequest = communityQuestion && isCommunityCreativeRequest(userText);
  const communityNeedsEvidence = communityQuestion && !communityCreativeRequest;
  const bohInternalFactualQuestion = isLikelyBohInternalFactualQuestion(routingQueryText, {
    operationQuestion,
  });
  const factualQuestion =
    isLikelyFactualQuestion(routingQueryText, { operationQuestion }) || bohInternalFactualQuestion;

  return {
    operationQuestion,
    communityQuestion,
    communityCreativeRequest,
    communityNeedsEvidence,
    bohInternalFactualQuestion,
    factualQuestion,
  };
};
