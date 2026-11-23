/**
 * request-body.ts — **请求体装配**（plans/025 v2 · Step 5-3 第二刀）
 *
 * 把 system prompt + 历史消息 + 本轮 finalPrompt 拼成发给模型的 `requestBody`，
 * 并按「思考速度」档位叠加 temperature / top_p / max_tokens 偏移，最后用分层压缩裁消息数组。
 *
 * 纯函数：只依赖入参与常量，不碰响应式状态。
 *
 * ⚠️ 三条**数值口径不可改**：
 *   1. `temperature` 夹到 `[0, 2]`、`top_p` 夹到 `[0, 1]`；
 *   2. `max_tokens` 在**有速度档位时**才乘 `maxTokensScale`（否则原样），并取整、下限 1；
 *   3. 压缩用 `compactMessages(messages, MAX_MESSAGES_TOTAL_TOKENS)`，且**预算日志只在 high/full 时打**。
 */
import { MAX_MESSAGES_TOTAL_TOKENS } from '../../composables/chat-engine-config.js';
import { CONTEXT_CATEGORIES } from '../../utils/context-budget.js';
import { compactMessages } from '../../utils/generation-profile.js';
import { logger } from '@/utils/logger.js';

export interface ChatMessageLike {
  role: string;
  content: string;
}

export interface GenerationProfileLike {
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  max_tokens?: number;
}

export interface ThinkingSpeedDeltaLike {
  temperature?: number;
  topP?: number;
  maxTokensScale?: number;
}

/** `createContextBudgetTracker()` 的返回值（只用到这三个方法）。 */
export interface BudgetTrackerLike {
  addEstimate: (category: string, text: string) => void;
  getUsage: () => { level?: string };
  getDegradationPlan: () => { drops: unknown[] };
}

export interface RequestBodyInput {
  generationModel: { id: string };
  systemPromptContent: string;
  recentMessages: ChatMessageLike[];
  finalPrompt: string;
  generationProfile: GenerationProfileLike;
  /** 当前「思考速度」档位的偏移量（可能为 undefined） */
  thinkingSpeedDeltas: ThinkingSpeedDeltaLike | undefined;
  budgetTracker: BudgetTrackerLike;
}

export interface RequestBodyResult {
  requestBody: Record<string, unknown>;
  budgetState: { level?: string };
}

export const buildRequestBody = ({
  generationModel,
  systemPromptContent,
  recentMessages,
  finalPrompt,
  generationProfile,
  thinkingSpeedDeltas,
  budgetTracker,
}: RequestBodyInput): RequestBodyResult => {
  const hasSpeedOverride =
    thinkingSpeedDeltas &&
    (thinkingSpeedDeltas.temperature !== 0 ||
      thinkingSpeedDeltas.topP !== 0 ||
      thinkingSpeedDeltas.maxTokensScale !== 1);

  const requestBody: Record<string, unknown> = {
    model: generationModel.id,
    messages: [
      { role: 'system', content: systemPromptContent },
      ...recentMessages,
      { role: 'user', content: finalPrompt },
    ],
    stream: true,
    temperature: Math.max(
      0,
      Math.min(
        2,
        generationProfile.temperature +
          (hasSpeedOverride ? thinkingSpeedDeltas?.temperature || 0 : 0),
      ),
    ),
    top_p: Math.max(
      0,
      Math.min(
        1,
        generationProfile.top_p + (hasSpeedOverride ? thinkingSpeedDeltas?.topP || 0 : 0),
      ),
    ),
    frequency_penalty: generationProfile.frequency_penalty,
    max_tokens: hasSpeedOverride
      ? Math.max(
          1,
          Math.round(
            (generationProfile.max_tokens || 4096) * (thinkingSpeedDeltas?.maxTokensScale || 1),
          ),
        )
      : generationProfile.max_tokens,
  };

  // C1 fix + 优化1/3: 发送前裁剪 messages 数组，使用分层压缩
  budgetTracker.addEstimate(
    CONTEXT_CATEGORIES.HISTORY,
    recentMessages.map((m) => m.content).join(' '),
  );
  const budgetState = budgetTracker.getUsage();
  requestBody.messages = compactMessages(
    requestBody.messages as ChatMessageLike[],
    MAX_MESSAGES_TOTAL_TOKENS,
  );
  if (budgetState.level === 'high' || budgetState.level === 'full') {
    const degPlan = budgetTracker.getDegradationPlan();
    if (degPlan.drops.length > 0) {
      logger.info(
        'boh-ai',
        'Context budget',
        JSON.stringify({ level: budgetState.level, drops: degPlan.drops }),
      );
    }
  }

  return { requestBody, budgetState };
};
