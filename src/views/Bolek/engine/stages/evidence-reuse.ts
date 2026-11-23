/**
 * evidence-reuse.ts — **跨轮证据复用 + 时效护栏**（plans/025 v2 · Step 5-2 第四刀）
 *
 * 三段逻辑（原 `sendMessage` 内联，现整块搬出）：
 *   ① **跨轮复用**：本轮没检索到证据时，从上一轮 assistant 消息的 meta 里恢复
 *      `searchContext` / `evidenceContext`，解决「追问 [F1] 是谁时模型不知道 [F1] 内容」。
 *   ② **时效护栏**：命中时效词（最新/最近/今天…）时**禁止复用**，改为注入「本轮没检索到
 *      新资料」的说明 —— 否则模型会拿上一轮的旧帖冒充「最新」，这是「AI 胡说」投诉主因。
 *   ③ **搜索状态兜底**：用户开了联网但本轮搜索失败/无结果且无可复用结果时，把失败状态
 *      注入 `webEvidenceContext`，让模型据实告知，而不是答「我没有访问实时数据的能力」。
 *
 * 纯函数：只读入参、返回新值，不碰任何响应式状态。
 *
 * ⚠️ 三条**顺序不可换**：复用 → 时效护栏 → 状态兜底。护栏必须在复用之后（它要判断
 *    复用是否发生），状态兜底必须最后（它只在「最终仍无 webEvidenceContext」时兜）。
 */
import { ROUTING_FORUM_REALTIME_PATTERN } from '../../composables/chat-engine-config.js';
import { buildSearchResultsContext } from '../../utils/web/search.js';

/** 证据引用（`{ url }` / `{ source }` 两种形态都存在）。 */
export type EvidenceRef = { url?: string; source?: string; [key: string]: unknown };

export interface SearchContextLike {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  aiAnswer?: string;
}

export interface HistoryMessageLike {
  role?: string;
  meta?: {
    searchContext?: SearchContextLike;
    evidenceContext?: string;
    evidenceRefs?: EvidenceRef[];
  };
}

export interface WebSearchResultLike {
  disabled?: boolean;
  ok?: boolean;
  message?: string;
  results?: Array<{ url?: string; title?: string; content?: string }>;
}

export interface CrossTurnEvidenceInput {
  internalEvidenceContext: string;
  webEvidenceContext: string;
  groundingEvidenceRefs: EvidenceRef[];
  searchResultCount: number;
  webSearchVerified: boolean;
  /** 用于时效词判定（消解后的追问文本） */
  routingQueryText: string;
  /** 本轮对话历史（从后往前找上一轮 assistant 消息） */
  historyMessagesForCurrentTurn: HistoryMessageLike[];
  /** 用户是否开启联网搜索 */
  enableSearch: boolean;
  /** 本轮联网搜索结果 */
  webSearchResult: WebSearchResultLike | null | undefined;
}

export interface CrossTurnEvidenceResult {
  internalEvidenceContext: string;
  webEvidenceContext: string;
  groundingEvidenceRefs: EvidenceRef[];
  searchResultCount: number;
  webSearchVerified: boolean;
}

/**
 * 应用跨轮证据复用与三段护栏，返回**更新后**的证据状态。
 */
export const resolveCrossTurnEvidence = ({
  internalEvidenceContext,
  webEvidenceContext,
  groundingEvidenceRefs,
  searchResultCount,
  webSearchVerified,
  routingQueryText,
  historyMessagesForCurrentTurn,
  enableSearch,
  webSearchResult,
}: CrossTurnEvidenceInput): CrossTurnEvidenceResult => {
  let nextInternal = internalEvidenceContext;
  let nextWeb = webEvidenceContext;
  let nextRefs = groundingEvidenceRefs;
  let nextSearchCount = searchResultCount;
  let nextVerified = webSearchVerified;

  const isRealtimeQuery = ROUTING_FORUM_REALTIME_PATTERN.test(String(routingQueryText || ''));
  const STALE_EVIDENCE_PREFIX =
    '（以下资料来自上一轮检索，可能已过时；若与用户本轮问的时效性内容冲突，请以「未获取到最新资料」作答）';
  let reusedFromPreviousTurn = false;

  const history = Array.isArray(historyMessagesForCurrentTurn) ? historyMessagesForCurrentTurn : [];

  // ① 对话连贯性修复：当前轮未搜索时，复用上一轮 assistant 消息的搜索结果
  if (!nextWeb && !isRealtimeQuery && history.length >= 2) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const prevMsg = history[i];
      if (prevMsg?.role !== 'assistant') continue;
      const prevSearch = prevMsg?.meta?.searchContext;
      if (!prevSearch || !Array.isArray(prevSearch.results) || prevSearch.results.length === 0) {
        break;
      }
      const restoredResults = prevSearch.results.map((r) => ({
        title: String(r?.title || ''),
        url: String(r?.url || ''),
        content: String(r?.content || ''),
      }));
      nextWeb = buildSearchResultsContext(restoredResults, String(prevSearch.aiAnswer || ''));
      nextSearchCount = restoredResults.length;
      nextVerified = true;
      reusedFromPreviousTurn = true;
      break;
    }
  }

  // ② 内部证据跨轮恢复：当前轮未检索到内部证据时，复用上一轮的 evidenceContext
  if (!nextInternal && !isRealtimeQuery && history.length >= 2) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const prevMsg = history[i];
      if (prevMsg?.role !== 'assistant') continue;
      const prevEvidence = prevMsg?.meta?.evidenceContext;
      const prevRefs = prevMsg?.meta?.evidenceRefs;
      if (!prevEvidence) break;
      nextInternal = String(prevEvidence);
      if (Array.isArray(prevRefs) && prevRefs.length > 0) {
        nextRefs = prevRefs.slice(0, 32);
      }
      reusedFromPreviousTurn = true;
      break;
    }
  }

  if (reusedFromPreviousTurn) {
    if (nextInternal) {
      nextInternal = `${STALE_EVIDENCE_PREFIX}\n${nextInternal}`;
    }
    if (nextWeb) {
      nextWeb = `${STALE_EVIDENCE_PREFIX}\n${nextWeb}`;
    }
  }

  // 命中时效词但没有本轮证据：显式告知「本轮没检索到新的」，避免模型拿旧料充数
  if (isRealtimeQuery && !nextInternal && !nextWeb) {
    nextInternal = `<stale_evidence_note>\n用户问的是有时效性的内容（最新/最近/今天等），但本轮没有检索到新资料，也没有可复用的上一轮结果。请直接说明「本轮没有检索到最新资料」，不要凭记忆或旧印象作答。\n</stale_evidence_note>`;
    nextRefs = [];
  }

  // ③ 搜索状态兜底：用户开启了联网搜索但当前轮搜索失败/无结果，且没有上一轮结果可复用时，
  //    把失败状态注入 webEvidenceContext，让模型据实告知用户。
  if (enableSearch && !nextWeb) {
    let searchStatusReason = '搜索未能完成';
    if (webSearchResult?.disabled) {
      searchStatusReason = '联网搜索未配置（Tavily Key 缺失）';
    } else if (webSearchResult?.ok && nextSearchCount === 0) {
      searchStatusReason = '未找到相关搜索结果';
    } else if (!webSearchResult?.ok) {
      const failMsg = String(webSearchResult?.message || '').trim();
      searchStatusReason = failMsg || '搜索服务暂时不可用';
    }
    nextWeb = `<web_search_status>\n用户已开启联网搜索，但${searchStatusReason}。请在回答开头用一句话简要告知用户搜索未能完成及原因，再基于你已有的知识尽力回答用户问题；不要说"我没有访问实时数据的能力"这类话。\n</web_search_status>`;
  }

  return {
    internalEvidenceContext: nextInternal,
    webEvidenceContext: nextWeb,
    groundingEvidenceRefs: nextRefs,
    searchResultCount: nextSearchCount,
    webSearchVerified: nextVerified,
  };
};
