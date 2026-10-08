/**
 * grounding-guard.ts — **依据护栏**（plans/025 v2 · Step 5-3 第一刀）
 *
 * 生成前的最后一道「别编造」防线，两个函数：
 *   ① `sanitizeCommunityEvidenceClaims` —— 把「社区里有人说…」这类**没有证据支撑**的断言洗掉；
 *   ② `ensureGroundedReply` —— 无内部证据 / 无引用时，给回答**追加不确定声明**（不拦截回答）。
 *
 * 抽出来的价值：这两个闭包原先藏在 `sendMessage` 的装配段里，捕获了 8 个布尔与 1 个引用数组，
 * 且 `ensureGroundedReply` 有**5 条分支**（含心理访谈封闭域的特例）。现在它是纯工厂 + 可单测。
 *
 * ⚠️ 三条**语义不可改**：
 *   1. 心理访谈是**封闭域**：检索是被主动关闭的，不是「没找到」⇒ **不加**「未检索到相关站内资料」尾巴；
 *   2. 有 `needsInternalEvidence` 且零引用时，**返回固定话术**而不是原回答（避免凭印象补全 BOH 内部内容）；
 *   3. 其余分支一律**原样放行**（只可能前置一句「联网未验证」）。
 */
import { sanitizeUnsupportedCommunityEvidenceClaims } from '@/utils/ai-chat-grounding.js';

export interface GroundingGuardInput {
  groundingEvidenceRefs: unknown[];
  searchResultCount: number;
  enableSearch: boolean;
  factualQuestion: boolean;
  webSearchVerified: boolean;
  communityNeedsEvidence: boolean;
  bohInternalFactualQuestion: boolean;
  psychInterviewActive: boolean;
  shouldEnforceGrounding: boolean;
}

export interface GroundingGuards {
  /** 证据引用集合（大写归一） */
  groundingRefSet: Set<string>;
  /** 联网可引用的最大编号（0~9） */
  maxSearchCitationRef: number;
  /** 内部引用数 + 联网引用数 */
  totalGroundingRefCount: number;
  needsInternalEvidence: boolean;
  noInternalEvidence: boolean;
  /** 洗掉无证据的社区断言 */
  sanitizeCommunityEvidenceClaims: (reply: string) => string;
  /** 依据校验：无内部证据时追加不确定声明（不拦截回答） */
  ensureGroundedReply: (rawReply: string) => string;
}

export const buildGroundingGuards = ({
  groundingEvidenceRefs,
  searchResultCount,
  enableSearch,
  factualQuestion,
  webSearchVerified,
  communityNeedsEvidence,
  bohInternalFactualQuestion,
  psychInterviewActive,
  shouldEnforceGrounding,
}: GroundingGuardInput): GroundingGuards => {
  const groundingRefSet = new Set(
    (Array.isArray(groundingEvidenceRefs) ? groundingEvidenceRefs : []).map((id) =>
      String(id).toUpperCase(),
    ),
  );
  const maxSearchCitationRef = enableSearch
    ? Math.max(0, Math.min(9, Math.trunc(Number(searchResultCount) || 0)))
    : 0;
  const totalGroundingRefCount = groundingRefSet.size + maxSearchCitationRef;

  const needsInternalEvidence = communityNeedsEvidence || bohInternalFactualQuestion;
  const noInternalEvidence = needsInternalEvidence && totalGroundingRefCount <= 0;

  const sanitizeCommunityEvidenceClaims = (reply: string) =>
    sanitizeUnsupportedCommunityEvidenceClaims(reply, {
      availableEvidenceRefs: groundingEvidenceRefs,
      fallbackText: '我没有检索到对应的 BOH 论坛帖子或用户，不能把这件事说成社区里有人分享过。',
    });

  // 依据校验：无内部证据时追加不确定声明，不拦截回答
  const ensureGroundedReply = (rawReply: string) => {
    const safeReply = String(rawReply || '').trim();
    const realtimeVerificationNote =
      enableSearch && factualQuestion && !webSearchVerified
        ? '（联网搜索未返回可用结果，以下内容未经过实时网络验证。）\n\n'
        : '';
    if (noInternalEvidence && safeReply) {
      // 心理访谈是封闭域：检索是被主动关闭的，不是「没找到资料」。
      // 不加这句尾巴 —— 否则每轮回答后面都挂一句「未检索到相关站内资料」，很出戏。
      if (psychInterviewActive) return realtimeVerificationNote + safeReply;
      return (
        realtimeVerificationNote + safeReply + '\n\n（未检索到相关站内资料，以上回答基于通用知识）'
      );
    }
    if (!safeReply) return realtimeVerificationNote.trim();
    if (!shouldEnforceGrounding) return realtimeVerificationNote + safeReply;
    if (totalGroundingRefCount <= 0) {
      if (needsInternalEvidence) {
        return '未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。';
      }
      return realtimeVerificationNote + safeReply;
    }
    return realtimeVerificationNote + safeReply;
  };

  return {
    groundingRefSet,
    maxSearchCitationRef,
    totalGroundingRefCount,
    needsInternalEvidence,
    noInternalEvidence,
    sanitizeCommunityEvidenceClaims,
    ensureGroundedReply,
  };
};
