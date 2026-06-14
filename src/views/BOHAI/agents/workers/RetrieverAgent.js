import { AGENT_AGENT_ROLES } from '../core/agent-events.js';
import { logger } from '@/utils/logger.js';
import { AGENT_RETRIEVER_DEFAULT_MODEL_ID } from '../../composables/chat-engine-config.js';

const safeString = (value, max = 1200) => (value == null ? '' : String(value)).slice(0, max);

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeEvidence = (items, fallbackSource) => safeArray(items).map((item, index) => ({
  text: safeString(item?.text || item?.summary || item?.content || item?.snippet || ''),
  source: safeString(item?.source || item?.connector || fallbackSource, 40) || fallbackSource,
  ref: safeString(item?.ref || item?.evidenceRef || `R${index + 1}`, 24),
  confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.6
})).filter((item) => item.text);

export const createRetrieverAgent = (options = {}) => {
  const {
    invokeRetrieval,
    modelClient,
    ragKnowledge,
    siteGuide,
    forumPosts,
    webSearch,
    defaultModel = AGENT_RETRIEVER_DEFAULT_MODEL_ID
  } = options;

  return {
    name: 'retriever',
    role: AGENT_AGENT_ROLES.RETRIEVER,
    tag: 'retriever',
    label: '检索',
    category: 'knowledge',
    timeoutMs: 30000,
    enabled: true,
    hasWebSearch: typeof webSearch === 'function',
    // B8 fix: 接收 signal，让用户取消能中止检索 Agent
    async run({ task, context, signal }) {
      // 快速检查：若已取消，立即返回
      if (signal?.aborted) {
        return { ok: false, status: 'cancelled', output: null, notes: ['检索已被用户取消'] };
      }
      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const hints = safeArray(task?.input?.hints);
      const bus = context?.bus;

      // LRU 缓存：同会话里同 query 复跑时直接复用之前的证据，避免重复打到外部数据源 / LLM
      const cacheKey = 'retriever';
      const cacheParts = [query, hints.map((h) => safeString(h, 60)).join('|')];
      if (bus && typeof bus.cacheGet === 'function') {
        const cached = bus.cacheGet(cacheKey, cacheParts);
        if (cached) {
          return {
            ok: cached.evidence.length > 0,
            output: cached.output,
            evidence: cached.evidence,
            sources: cached.sources,
            notes: [...(cached.notes || []), 'LRU 命中'],
            tokens: cached.tokens || 0
          };
        }
      }

      const result = {
        summary: '',
        evidence: [],
        notes: [],
        sources: [],
        contextBlocks: []
      };

      // 把每个数据源封装成同构的 connector，统一通过 Promise.allSettled 并行拉取
      const connectors = [];
      if (typeof invokeRetrieval === 'function') {
        connectors.push({
          label: 'RAG 总入口',
          sourceName: 'RAG',
          run: async () => invokeRetrieval({ query, hints, bus })
        });
      } else {
        if (typeof ragKnowledge === 'function') connectors.push({ label: '知识库', sourceName: 'RAG-Knowledge', run: () => ragKnowledge({ query, hints, bus }) });
        if (typeof siteGuide === 'function') connectors.push({ label: '操作手册', sourceName: 'RAG-SiteGuide', run: () => siteGuide({ query, hints, bus }) });
        if (typeof forumPosts === 'function') connectors.push({ label: '论坛', sourceName: 'Forum', run: () => forumPosts({ query, hints, bus }) });
        if (typeof webSearch === 'function') connectors.push({
          label: '联网',
          sourceName: 'Web',
          // B11 fix: searchWebForPrompt 期望 (queryText, signal) 而非对象，
          // 且返回 { results, context } 而非 { evidence, context }。
          // 此处做适配桥接。
          run: async () => {
            const raw = await webSearch(query, signal);
            const results = Array.isArray(raw?.results) ? raw.results : [];
            return {
              evidence: results.map((r) => ({
                text: safeString(r?.content || r?.snippet || '', 600),
                source: safeString(r?.url || 'Web', 40),
                link: safeString(r?.url || '', 240)
              })),
              context: raw?.context || ''
            };
          }
        });
      }

      const settled = await Promise.allSettled(connectors.map((c) => c.run()));
      settled.forEach((outcome, index) => {
        const { label, sourceName } = connectors[index];
        if (outcome.status === 'rejected') {
          const message = safeString(outcome.reason?.message || outcome.reason, 80);
          result.notes.push(`${label} 失败：${message}`);
          logger.warn('bohai-cluster', `Retriever connector ${sourceName} failed`, outcome.reason);
          return;
        }
        const res = outcome.value;
        const evidence = normalizeEvidence(res?.evidence, sourceName);
        if (evidence.length) {
          result.evidence.push(...evidence);
          result.sources.push({ id: sourceName, label, source: sourceName });
          if (res?.context) {
            result.contextBlocks.push({ source: sourceName, text: safeString(res.context, 1500) });
          }
        }
        if (res?.error) {
          result.notes.push(`${label} 失败：${safeString(res.error?.message || res.error, 80)}`);
        }
      });

      result.summary = result.contextBlocks.length
        ? result.contextBlocks.map((c) => `[${c.source}] ${c.text}`).join('\n').slice(0, 1500)
        : result.evidence.slice(0, 5).map((e) => e.text).join(' / ').slice(0, 1500);

      if (modelClient?.call && result.evidence.length) {
        try {
          const { content } = await modelClient.call({
            model: defaultModel,
            messages: [
              {
                role: 'system',
                content: '你是 BOH AI 集群的 Retriever Agent。基于证据提炼简短摘要，禁止编造。'
              },
              {
                role: 'user',
                content: `用户问题：${query}\n\n证据：\n${result.evidence.map((e, i) => `${i + 1}. ${e.text}`).join('\n')}\n\n请输出 80~200 字摘要。`
              }
            ],
            temperature: 0.18,
            maxTokens: 500,
            signal
          });
          if (content) result.summary = safeString(content, 1500);
        } catch (error) {
          logger.warn('bohai-cluster', 'Retriever 总结失败，使用原始证据', error);
        }
      }

      const finalOutput = {
        summary: result.summary,
        evidenceCount: result.evidence.length
      };
      const finalTokens = Math.max(300, result.evidence.length * 80);
      const finalNotes = result.notes.length ? result.notes : ['无可用证据'];
      if (bus && typeof bus.cacheSet === 'function') {
        bus.cacheSet(cacheKey, cacheParts, {
          output: finalOutput,
          evidence: result.evidence,
          sources: result.sources,
          notes: finalNotes,
          tokens: finalTokens
        });
      }

      return {
        ok: result.evidence.length > 0,
        output: finalOutput,
        evidence: result.evidence,
        sources: result.sources,
        notes: finalNotes,
        tokens: finalTokens
      };
    }
  };
};
