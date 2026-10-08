/**
 * retrieval.ts — **检索主体**阶段（plans/025 v2 · Step 5-2 第七刀，也是 5-2 的核心）
 *
 * `sendMessage` 的「站内检索 + 联网搜索」并行编排：两路 promise 同时起，先 await 知识检索、
 * 展示目标标签与命中数，再 await 联网搜索、写进度与 meta，最后把结果交回壳。
 *
 * ⚠️ **进度闭包与 `currentContent` 刻意留在壳里**（不在本文件）：
 *   `setProgressContent` / `appendProgressContent` 会写壳的 `currentContent`，而后者在**流式阶段**
 *   还要接着被追加（`sendMessage` 里 post-retrieval 有 2 处用）。若把闭包搬进来，壳与阶段会各持
 *   一份 `currentContent` ⇒ 流式进度丢失。所以这里只**调用**它们（由 `deps` 注入），不持有状态。
 *
 * 本阶段**无早退**（对比 `agent-cluster.ts`），只做「起 promise → await → 写进度/meta → 返回状态」。
 * 返回值由壳解构成 `let`，因此**下游代码零改动**。
 */
import { BOHAI_CONNECTOR_IDS } from '@/utils/bohai-connectors.js';
import { logger } from '@/utils/logger.js';
import { computeRetrievalTargets } from './retrieval-targets';

/** 联网搜索结果（`useWebSearchLifecycle.runWebSearch` 产出）。 */
export interface WebSearchResultLike {
  ok?: boolean;
  disabled?: boolean;
  count?: number;
  context?: string;
  message?: string;
  aiAnswer?: string;
  results?: Array<{ title?: string; url?: string; content?: string }>;
  error?: { name?: string } | null;
}

/** 知识检索结果（`useKnowledgeRetrieval.buildAutoKnowledgeContext` 产出）。 */
export interface KnowledgeResultLike {
  ok: boolean;
  retrievalPlan?: Record<string, unknown>;
  routingReasons?: unknown[];
  connectorResults?: Array<{
    ok?: boolean;
    connectorId?: string;
    total?: number;
    metadata?: { posts?: unknown[] };
  }>;
  retrievalTrace?: unknown;
  treeholeTotal?: number;
  sharedMemoryTotal?: number;
  userPrivateLabels?: unknown[];
  evidenceRefs?: unknown[];
  contextText?: string;
  error?: unknown;
}

export interface RetrievalStageDeps {
  // ── 进度 / 内容回调（**写壳的 currentContent**，见文件头）──
  setProgressContent: (text: string) => void;
  appendProgressContent: (text: string) => void;
  updateContent: (text: string) => void;
  resetGenerationStallTimeout: (reason?: string) => void;
  markGenerationProgress: (status?: string) => void;
  // ── 检索 ──
  runWebSearch: (query: string, signal: AbortSignal) => Promise<WebSearchResultLike>;
  resolveKnowledgeRoutingPlan: (query: string) => { plan: Record<string, boolean> };
  getRetrievalTargetLabels: (plan: Record<string, boolean>) => string[];
  buildAutoKnowledgeContext: (
    query: string,
    options: Record<string, unknown>,
  ) => Promise<KnowledgeResultLike>;
  isLatestForumSummaryQuery: (query: string) => boolean;
  // ── meta ──
  mergeAssistantMessageMeta: (
    sessionIndex: number,
    messageIndex: number,
    patch: Record<string, unknown>,
  ) => void;
  updateAssistantActionNotes: (sessionIndex: number, messageIndex: number, notes: string[]) => void;
  webSearchDisabledNoticeShownFor: Set<number>;
  // ── 响应式 ref ──
  communitySearchActive: { value: boolean };
  isForumSearchEnabled: { value: boolean };
  isSearching: { value: boolean };
  // ── 本轮请求控制器（用于派生子 signal）──
  requestController: AbortController;
  // ── 意图标志（壳由 computeIntentFlags 算出；**不可在本文件重算**，见文件尾注）──
  communityNeedsEvidence: boolean;
}

export interface RetrievalStageOptions {
  sessionIndex: number;
  messageIndex: number;
  userText: string;
  routingQueryText: string;
  enableSearch: boolean;
  webSearchQueryText: string;
  psychInterviewActive: boolean;
  autoDecision: { shouldReferenceCloud?: boolean } | null | undefined;
}

export interface RetrievalStageResult {
  internalEvidenceContext: string;
  webEvidenceContext: string;
  groundingEvidenceRefs: unknown[];
  searchResultCount: number;
  webSearchVerified: boolean;
  hasKnowledgeContext: boolean;
  healthAnalysisActive: boolean;
  latestForumSummaryPosts: unknown[];
  webSearchResult: WebSearchResultLike | null;
}

export const runRetrievalStage = async (
  deps: RetrievalStageDeps,
  {
    sessionIndex,
    messageIndex,
    userText,
    routingQueryText,
    enableSearch,
    webSearchQueryText,
    psychInterviewActive,
    autoDecision,
  }: RetrievalStageOptions,
): Promise<RetrievalStageResult> => {
  let internalEvidenceContext = '';
  let webEvidenceContext = '';
  let groundingEvidenceRefs: unknown[] = [];
  let searchResultCount = 0;
  let webSearchVerified = false;
  let hasKnowledgeContext = false;
  // 本轮是否命中 BOH Health 本机健康数据（决定要不要注入健康分析附录）
  let healthAnalysisActive = false;
  let latestForumSummaryPosts: unknown[] = [];

  const WEB_SEARCH_TIMEOUT_MS = 30_000; // 30s web search timeout
  const webSearchSignal =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any([deps.requestController.signal, AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS)])
      : deps.requestController.signal;
  const webSearchPromise: Promise<WebSearchResultLike> =
    enableSearch && !psychInterviewActive
      ? deps.runWebSearch(webSearchQueryText || userText, webSearchSignal)
      : Promise.resolve({ ok: true, disabled: false, count: 0, context: '', results: [] });

  if (enableSearch) {
    deps.markGenerationProgress('正在并行搜索网络资料...');
    deps.setProgressContent('正在搜索相关网络资料...\n\n');
  }

  // C1 fix: 知识检索与联网搜索并行启动，减少串行等待时间
  // 心理访谈是封闭域：连检索都不启动（而不是「检索完再丢弃」）。
  // 注意：上一版只把 routingPreview.plan 置 false —— 那只是给进度文案用的预览，
  // 真正执行检索的是下面的 buildAutoKnowledgeContext，它内部会重算一次 plan，
  // 所以健康/社区证据照样注入了。这是接线探针抓出来的 bug。
  if (psychInterviewActive) {
    // 访谈期间社区/联网搜索一律不参与，UI 也不显示「正在搜索…」
    deps.communitySearchActive.value = false;
  }
  const knowledgePromise: Promise<KnowledgeResultLike> = psychInterviewActive
    ? Promise.resolve({
        ok: true,
        retrievalPlan: {},
        routingReasons: [],
        connectorResults: [],
        retrievalTrace: null,
        treeholeTotal: 0,
        sharedMemoryTotal: 0,
        userPrivateLabels: [],
        evidenceRefs: [],
        contextText: '',
      })
    : (async () => {
        deps.communitySearchActive.value = Boolean(
          deps.communityNeedsEvidence || deps.isForumSearchEnabled.value,
        );
        try {
          deps.markGenerationProgress('正在判断需要查看哪些 BOH 资料...');
          const routingPreview = deps.resolveKnowledgeRoutingPlan(routingQueryText);
          if (deps.isForumSearchEnabled.value) {
            routingPreview.plan.forum = true;
          }
          // 心理访谈是封闭域：关掉全部站内检索与联网。
          // 心理评估只应基于对话本身 —— 拉健康/记忆/私域数据既干扰访谈
          // （实测气泡下方出现「来源 BOH Health 数据」），也没拿到用户授权。
          if (psychInterviewActive) {
            Object.keys(routingPreview.plan).forEach((key) => {
              routingPreview.plan[key] = false;
            });
          }
          const previewTargets = deps.getRetrievalTargetLabels(routingPreview.plan);
          if (previewTargets.length > 0) {
            deps.markGenerationProgress(`正在查看 ${previewTargets.join('、')}...`);
          }

          const {
            retrievalPlan,
            routingReasons,
            connectorResults,
            retrievalTrace,
            treeholeTotal,
            sharedMemoryTotal,
            userPrivateLabels,
            evidenceRefs,
            contextText,
          } = await deps.buildAutoKnowledgeContext(routingQueryText, {
            forceTreehole: Boolean(autoDecision?.shouldReferenceCloud),
          });
          return {
            ok: true,
            retrievalPlan,
            routingReasons,
            connectorResults,
            retrievalTrace,
            treeholeTotal,
            sharedMemoryTotal,
            userPrivateLabels,
            evidenceRefs,
            contextText,
          };
        } catch (knowledgeError) {
          logger.error('boh-ai', 'Knowledge retrieval failed', knowledgeError);
          return { ok: false, error: knowledgeError };
        }
      })();

  // 等待知识检索完成，先展示结果
  {
    const knowledgeResult = await knowledgePromise;
    if (knowledgeResult.ok) {
      const {
        retrievalPlan,
        routingReasons,
        connectorResults,
        retrievalTrace,
        treeholeTotal,
        sharedMemoryTotal,
        userPrivateLabels,
        evidenceRefs,
        contextText,
      } = knowledgeResult;
      const successfulConnectorResults = Array.isArray(connectorResults)
        ? connectorResults.filter((item) => item?.ok)
        : [];
      const forumConnectorResult = successfulConnectorResults.find(
        (item) => item?.connectorId === BOHAI_CONNECTOR_IDS.forum,
      );
      if (
        deps.isLatestForumSummaryQuery(routingQueryText) &&
        Array.isArray(forumConnectorResult?.metadata?.posts)
      ) {
        latestForumSummaryPosts = forumConnectorResult.metadata.posts;
      }
      const { targets: retrievalTargets, healthAnalysisActive: healthTargetActive } =
        computeRetrievalTargets({
          retrievalPlan,
          treeholeTotal: Number(treeholeTotal || 0),
          sharedMemoryTotal: Number(sharedMemoryTotal || 0),
          userPrivateLabels,
          successfulConnectorResults,
        });
      if (healthTargetActive) healthAnalysisActive = true;

      deps.mergeAssistantMessageMeta(sessionIndex, messageIndex, { ragTrace: retrievalTrace });

      if (retrievalTargets.length > 0) {
        deps.appendProgressContent(`正在检索 ${retrievalTargets.join('、')}...\n\n`);
      }

      if (Array.isArray(routingReasons) && routingReasons.length > 0) {
        deps.appendProgressContent(`检索路径：${routingReasons.slice(0, 4).join('；')}\n\n`);
      }

      if (contextText) {
        hasKnowledgeContext = true;
        // C2 fix: 不在此处独立截断，统一在 buildStructuredUserPrompt 前用共享预算处理
        internalEvidenceContext = contextText;
        groundingEvidenceRefs = Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 32) : [];
        if (retrievalTargets.length > 0) {
          deps.appendProgressContent('已找到相关资料\n\n');
          deps.markGenerationProgress('已找到相关资料，正在整理回答依据...');
        }
      } else if (retrievalTargets.length > 0) {
        deps.appendProgressContent('未找到相关站内资料\n\n');
        deps.markGenerationProgress('未找到明确资料，正在分析问题本身...');
      }
    } else {
      deps.appendProgressContent(`站内检索暂时不可用\n\n`);
      deps.markGenerationProgress('资料检索失败，正在尝试直接回答...');
    }
  }

  const webSearchResult = await webSearchPromise;

  if (enableSearch) {
    try {
      if (webSearchResult?.disabled) {
        if (deps.isSearching.value) {
          deps.isSearching.value = false;
        }
        // 会话级去重：同一会话已经提示过"联网搜索未配置"就不再刷一次。
        if (!deps.webSearchDisabledNoticeShownFor.has(sessionIndex)) {
          deps.webSearchDisabledNoticeShownFor.add(sessionIndex);
          deps.updateAssistantActionNotes(sessionIndex, messageIndex, [
            '联网搜索未配置，已跳过外部检索。',
          ]);
        }
        deps.setProgressContent(`${webSearchResult.message}，已跳过网络检索。\n\n`);
      } else if (webSearchResult?.ok) {
        searchResultCount = Number(webSearchResult.count || 0);
        if (webSearchResult.context) {
          // C2 fix: 不在此处独立截断，统一在 buildStructuredUserPrompt 前用共享预算处理
          webEvidenceContext = webSearchResult.context;
        }
        const results = Array.isArray(webSearchResult.results) ? webSearchResult.results : [];
        webSearchVerified = results.length > 0;
        if (results.length > 0) {
          deps.setProgressContent(
            `找到 ${results.length} 个结果：\n${results.map((r, i) => `${i + 1}. [${r?.title || '无标题'}](${r?.url || ''})`).join('\n')}\n\n`,
          );
        } else {
          deps.setProgressContent('未找到相关结果\n\n');
        }
      } else {
        if (webSearchResult?.error && webSearchResult.error?.name !== 'AbortError') {
          logger.error('boh-ai', 'Search failed', webSearchResult.error);
        }
        deps.updateAssistantActionNotes(sessionIndex, messageIndex, [
          '联网搜索失败，已尝试继续回答。',
        ]);
        deps.appendProgressContent(`搜索服务暂时不可用\n\n`);
      }
    } catch (searchError) {
      if ((searchError as Error)?.name !== 'AbortError') {
        logger.error('boh-ai', 'Search failed', searchError);
        deps.updateAssistantActionNotes(sessionIndex, messageIndex, [
          '联网搜索失败，已尝试继续回答。',
        ]);
        deps.appendProgressContent(`搜索暂时失败\n\n`);
      }
    }
  }

  // 把本轮搜索结果存到 assistant 消息 meta，供下一轮追问复用（保持对话连贯）
  // 只存精简版（url+title+截断content），避免 localStorage 持久化膨胀
  if (enableSearch && webSearchResult?.ok && webEvidenceContext) {
    const compactResults = (Array.isArray(webSearchResult.results) ? webSearchResult.results : [])
      .slice(0, 5)
      .map((r) => ({
        title: String(r?.title || '').slice(0, 120),
        url: String(r?.url || '').slice(0, 240),
        content: String(r?.content || '').slice(0, 400),
      }));
    deps.mergeAssistantMessageMeta(sessionIndex, messageIndex, {
      searchContext: {
        query: String(webSearchQueryText || userText).slice(0, 600),
        results: compactResults,
        aiAnswer: String(webSearchResult?.aiAnswer || '').slice(0, 600),
      },
    });
  }
  // 内部证据（知识库/论坛/Cloud+）也写入 meta，供追问时复用
  // 解决"追问 [F1] 是谁时模型不知道 [F1] 内容"的割裂问题
  if (internalEvidenceContext && groundingEvidenceRefs.length > 0) {
    deps.mergeAssistantMessageMeta(sessionIndex, messageIndex, {
      evidenceContext: String(internalEvidenceContext).slice(0, 4000),
      evidenceRefs: groundingEvidenceRefs.slice(0, 16),
    });
  }

  return {
    internalEvidenceContext,
    webEvidenceContext,
    groundingEvidenceRefs,
    searchResultCount,
    webSearchVerified,
    hasKnowledgeContext,
    healthAnalysisActive,
    latestForumSummaryPosts,
    webSearchResult,
  };
};
