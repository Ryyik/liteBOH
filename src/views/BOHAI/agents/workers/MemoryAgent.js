import { AGENT_AGENT_ROLES } from '../core/agent-events.js';
import { logger } from '@/utils/logger.js';

const safeString = (value, max = 1200) => (value == null ? '' : String(value)).slice(0, max);

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeEvidence = (items, source) => safeArray(items).map((item, index) => ({
  text: safeString(item?.text || item?.summary || item?.content || '', 800),
  source: safeString(item?.source || source, 40),
  ref: safeString(item?.ref || `M${index + 1}`, 24),
  confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.5
})).filter((item) => item.text);

export const createMemoryAgent = (options = {}) => {
  const {
    invokeCloud,
    invokeSharedMemory,
    invokeUserPrivate,
    requireUser = true
  } = options;

  return {
    name: 'memory',
    role: AGENT_AGENT_ROLES.MEMORY,
    tag: 'memory',
    label: '记忆',
    category: 'knowledge',
    timeoutMs: 25000,
    async run({ task, context }) {
      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const bus = context?.bus;
      const userId = context?.userId || bus?.getSharedContext?.('userId') || null;

      const notes = [];
      const evidence = [];
      const sources = [];
      let summaryParts = [];

      const ensureUser = () => {
        if (requireUser && !userId) {
          notes.push('需要登录后才能访问私域数据。');
          return false;
        }
        return true;
      };

      if (typeof invokeCloud === 'function' && ensureUser()) {
        try {
          const res = await invokeCloud({ query, userId, bus });
          if (res?.evidence) evidence.push(...normalizeEvidence(res.evidence, 'Cloud+'));
          if (res?.sources) sources.push(...res.sources.map((s) => ({ id: s.id || 'cloud', label: s.label || 'Cloud+', source: s.source || 'Cloud+' })));
          if (res?.context) summaryParts.push(`[Cloud+] ${safeString(res.context, 800)}`);
        } catch (error) {
          notes.push(`Cloud+ 查询失败：${safeString(error?.message || error, 80)}`);
          logger.warn('bohai-cluster', 'Memory Cloud+ 失败', error);
        }
      }

      if (typeof invokeSharedMemory === 'function') {
        try {
          const res = await invokeSharedMemory({ query, bus });
          if (res?.evidence) evidence.push(...normalizeEvidence(res.evidence, 'PublicMemory'));
          if (res?.sources) sources.push(...res.sources.map((s) => ({ id: s.id || 'memory', label: s.label || '公共记忆', source: s.source || 'PublicMemory' })));
          if (res?.context) summaryParts.push(`[PublicMemory] ${safeString(res.context, 800)}`);
        } catch (error) {
          notes.push(`公共记忆查询失败：${safeString(error?.message || error, 80)}`);
          logger.warn('bohai-cluster', 'Memory SharedMemory 失败', error);
        }
      }

      if (typeof invokeUserPrivate === 'function' && ensureUser()) {
        try {
          const res = await invokeUserPrivate({ query, userId, bus });
          if (res?.evidence) evidence.push(...normalizeEvidence(res.evidence, 'UserPrivate'));
          if (res?.sources) sources.push(...res.sources.map((s) => ({ id: s.id || 'user', label: s.label || '账号资料', source: s.source || 'UserPrivate' })));
          if (res?.context) summaryParts.push(`[UserPrivate] ${safeString(res.context, 800)}`);
        } catch (error) {
          notes.push(`账号私域查询失败：${safeString(error?.message || error, 80)}`);
          logger.warn('bohai-cluster', 'Memory UserPrivate 失败', error);
        }
      }

      if (!evidence.length && !summaryParts.length) {
        notes.push('没有可用的记忆数据。');
      }

      return {
        ok: evidence.length > 0,
        output: {
          summary: summaryParts.join('\n').slice(0, 1500),
          evidenceCount: evidence.length
        },
        evidence,
        sources,
        notes,
        tokens: Math.max(200, evidence.length * 60)
      };
    }
  };
};
