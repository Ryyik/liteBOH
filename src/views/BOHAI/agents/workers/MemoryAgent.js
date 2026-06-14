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
    // B8 fix: 接收 signal，让用户取消能中止记忆 Agent
    async run({ task, context, signal }) {
      if (signal?.aborted) {
        return { ok: false, status: 'cancelled', output: null, notes: ['记忆查询已被用户取消'] };
      }
      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const bus = context?.bus;
      const userId = context?.userId || bus?.getSharedContext?.('userId') || null;

      // LRU 缓存：同会话里同 query 复跑时直接复用（userId 也作为 key 的一部分）
      const cacheKey = 'memory';
      const cacheParts = [userId || 'anon', query];
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

      const notes = [];
      const evidence = [];
      const sources = [];
      const summaryParts = [];

      // 登录守门：所有 userId-required 源在并行前先确认 userId，避免无效调用
      const hasUser = Boolean(userId);
      if (requireUser && !hasUser) {
        notes.push('需要登录后才能访问私域数据。');
      }

      // 并行调用所有可用的 memory 源；空 invoke 直接跳过
      const tasks = [];
      if (typeof invokeCloud === 'function') {
        tasks.push({
          label: 'Cloud+',
          sourceId: 'cloud',
          sourceLabel: 'Cloud+',
          sourceKind: 'Cloud+',
          gate: () => !requireUser || hasUser,
          run: () => invokeCloud({ query, userId, bus })
        });
      }
      if (typeof invokeSharedMemory === 'function') {
        tasks.push({
          label: '公共记忆',
          sourceId: 'memory',
          sourceLabel: '公共记忆',
          sourceKind: 'PublicMemory',
          gate: () => true,
          run: () => invokeSharedMemory({ query, bus })
        });
      }
      if (typeof invokeUserPrivate === 'function') {
        tasks.push({
          label: '账号私域',
          sourceId: 'user',
          sourceLabel: '账号资料',
          sourceKind: 'UserPrivate',
          gate: () => !requireUser || hasUser,
          run: () => invokeUserPrivate({ query, userId, bus })
        });
      }

      const allowedTasks = tasks.filter((t) => {
        if (t.gate()) return true;
        notes.push(`${t.label} 跳过：未登录。`);
        return false;
      });

      const settled = await Promise.allSettled(allowedTasks.map((t) => t.run()));
      settled.forEach((outcome, index) => {
        const t = allowedTasks[index];
        if (outcome.status === 'rejected') {
          const message = safeString(outcome.reason?.message || outcome.reason, 80);
          notes.push(`${t.label} 失败：${message}`);
          logger.warn('bohai-cluster', `Memory ${t.sourceKind} 失败`, outcome.reason);
          return;
        }
        const res = outcome.value;
        if (res?.evidence) evidence.push(...normalizeEvidence(res.evidence, t.sourceKind));
        if (res?.sources) sources.push(...res.sources.map((s) => ({
          id: s.id || t.sourceId,
          label: s.label || t.sourceLabel,
          source: s.source || t.sourceKind
        })));
        if (res?.context) summaryParts.push(`[${t.sourceKind}] ${safeString(res.context, 800)}`);
      });

      if (!evidence.length && !summaryParts.length) {
        notes.push('没有可用的记忆数据。');
      }

      const finalOutput = {
        summary: summaryParts.join('\n').slice(0, 1500),
        evidenceCount: evidence.length
      };
      const finalTokens = Math.max(200, evidence.length * 60);
      if (bus && typeof bus.cacheSet === 'function') {
        bus.cacheSet(cacheKey, cacheParts, {
          output: finalOutput,
          evidence,
          sources,
          notes,
          tokens: finalTokens
        });
      }

      return {
        ok: evidence.length > 0,
        output: finalOutput,
        evidence,
        sources,
        notes,
        tokens: finalTokens
      };
    }
  };
};
