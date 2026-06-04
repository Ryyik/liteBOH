import { AGENT_AGENT_ROLES } from '../core/agent-events.js';
import { logger } from '@/utils/logger.js';

const safeString = (value, max = 1200) => (value == null ? '' : String(value)).slice(0, max);

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeEvidence = (items, fallbackSource) => safeArray(items).map((item, index) => ({
  text: safeString(item?.text || item?.summary || item?.content || item?.snippet || ''),
  source: safeString(item?.source || item?.connector || fallbackSource, 40) || fallbackSource,
  ref: safeString(item?.ref || item?.evidenceRef || `R${index + 1}`, 24),
  confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.6
})).filter((item) => item.text);

const normalizeSources = (items) => safeArray(items).map((item) => ({
  id: safeString(item?.id || item?.connector || 'unknown', 80),
  label: safeString(item?.label || item?.connector || item?.id || '', 80),
  source: safeString(item?.source || item?.label || '', 80)
})).filter((item) => item.id);

export const createRetrieverAgent = (options = {}) => {
  const {
    invokeRetrieval,
    modelClient,
    ragKnowledge,
    siteGuide,
    forumPosts,
    webSearch,
    defaultModel = 'Qwen/Qwen3-8B'
  } = options;

  return {
    name: 'retriever',
    role: AGENT_AGENT_ROLES.RETRIEVER,
    tag: 'retriever',
    label: '检索',
    category: 'knowledge',
    timeoutMs: 30000,
    enabled: true,
    async run({ task, context }) {
      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const hints = safeArray(task?.input?.hints);
      const bus = context?.bus;

      const result = {
        summary: '',
        evidence: [],
        notes: [],
        sources: [],
        contextBlocks: []
      };

      const runConnector = async (label, sourceName, reader) => {
        if (typeof reader !== 'function') return;
        try {
          const res = await reader({ query, hints, bus });
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
        } catch (error) {
          logger.warn('bohai-cluster', `Retriever connector ${sourceName} failed`, error);
          result.notes.push(`${label} 失败：${safeString(error?.message || error, 80)}`);
        }
      };

      if (typeof invokeRetrieval === 'function') {
        try {
          const res = await invokeRetrieval({ query, hints, bus });
          if (res?.evidence) result.evidence.push(...normalizeEvidence(res.evidence, 'RAG'));
          if (res?.sources) result.sources.push(...normalizeSources(res.sources));
          if (res?.context) result.contextBlocks.push({ source: 'RAG', text: safeString(res.context, 1500) });
        } catch (error) {
          result.notes.push(`RAG 总入口失败：${safeString(error?.message || error, 80)}`);
        }
      } else {
        await runConnector('知识库', 'RAG-Knowledge', ragKnowledge);
        await runConnector('操作手册', 'RAG-SiteGuide', siteGuide);
        await runConnector('论坛', 'Forum', forumPosts);
        await runConnector('联网', 'Web', webSearch);
      }

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
            maxTokens: 500
          });
          if (content) result.summary = safeString(content, 1500);
        } catch (error) {
          logger.warn('bohai-cluster', 'Retriever 总结失败，使用原始证据', error);
        }
      }

      return {
        ok: result.evidence.length > 0,
        output: {
          summary: result.summary,
          evidenceCount: result.evidence.length
        },
        evidence: result.evidence,
        sources: result.sources,
        notes: result.notes.length ? result.notes : ['无可用证据'],
        tokens: Math.max(300, result.evidence.length * 80)
      };
    }
  };
};
