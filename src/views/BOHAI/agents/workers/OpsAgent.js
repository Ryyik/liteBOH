import { AGENT_AGENT_ROLES } from '../core/agent-events.js';
import { logger } from '@/utils/logger.js';
import { AGENT_OPS_DEFAULT_MODEL_ID } from '../../composables/chat-engine-config.js';

const safeString = (value, max = 1500) => (value == null ? '' : String(value)).slice(0, max);

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeEvidence = (items) => safeArray(items).map((item, index) => ({
  text: safeString(item?.text || item?.summary || item?.content || '', 800),
  source: safeString(item?.source || 'SiteGuide', 40),
  ref: safeString(item?.ref || `O${index + 1}`, 24),
  confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.5
})).filter((item) => item.text);

const inferDraftType = (query = '', description = '') => {
  const text = `${query} ${description}`;
  if (/(发邮件|私信|写信|寄信)/i.test(text)) return 'mail';
  if (/(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|论坛发布|起草.{0,12}(论坛|社区|帖子))/i.test(text)) return 'post';
  if (/(网页|页面|html|创作|生成.{0,4}页面)/i.test(text)) return 'page';
  return 'none';
};

export const createOpsAgent = (options = {}) => {
  const {
    invokeSiteGuide,
    invokeDraft,
    defaultModel = AGENT_OPS_DEFAULT_MODEL_ID,
    modelClient
  } = options;

  return {
    name: 'ops',
    role: AGENT_AGENT_ROLES.OPS,
    tag: 'ops',
    label: '操作',
    category: 'action',
    timeoutMs: 30000,
    async run({ task, context }) {
      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const description = safeString(task?.description || '');
      const bus = context?.bus;

      const evidence = [];
      const sources = [];
      const notes = [];
      let summaryParts = [];
      let draft = null;

      // siteGuide 与 draft 生成相互独立（draft 只看 query+description），
      // 并行拉取以减少端到端等待
      const draftType = inferDraftType(query, description);

      const siteGuidePromise = (async () => {
        if (typeof invokeSiteGuide !== 'function') return null;
        try {
          return await invokeSiteGuide({ query, bus });
        } catch (error) {
          notes.push(`操作手册查询失败：${safeString(error?.message || error, 80)}`);
          logger.warn('bohai-cluster', 'Ops SiteGuide 失败', error);
          return null;
        }
      })();

      const draftPromise = (async () => {
        if (draftType === 'none') return null;
        if (modelClient?.call) {
          try {
            const sysPrompt = draftType === 'post'
              ? '你是 BOH AI 的发帖起草助手。基于用户问题输出 JSON：{ title, content }。内容控制在 280 字内。'
              : draftType === 'mail'
                ? '你是 BOH AI 的私信起草助手。基于用户问题输出 JSON：{ subject, content, receiver }。内容控制在 200 字内。'
                : '你是 BOH AI 的网页生成助手。基于用户问题输出 JSON：{ html }，使用 BOH Creator Studio 风格（Inter 字体、#1459d9 主色、#f7f8fb 背景）。';
            const userPrompt = `用户问题：${query}\n任务描述：${description}\n请输出 JSON。`;
            const { content } = await modelClient.call({
              model: defaultModel,
              messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.2,
              maxTokens: 1200
            });
            const parsed = modelClient.extractJson ? modelClient.extractJson(content) : null;
            if (parsed) {
              return { type: draftType, ...parsed };
            }
            notes.push('Ops 草稿解析失败，已跳过。');
            return null;
          } catch (error) {
            notes.push(`Ops 草稿生成失败：${safeString(error?.message || error, 80)}`);
            logger.warn('bohai-cluster', 'Ops 起草失败', error);
            return null;
          }
        }
        if (typeof invokeDraft === 'function') {
          try {
            return await invokeDraft({ query, description, type: draftType, bus });
          } catch (error) {
            notes.push(`Ops 起草失败：${safeString(error?.message || error, 80)}`);
            return null;
          }
        }
        return null;
      })();

      const [siteGuideRes, draftRes] = await Promise.all([siteGuidePromise, draftPromise]);

      if (siteGuideRes) {
        if (siteGuideRes?.evidence) evidence.push(...normalizeEvidence(siteGuideRes.evidence));
        if (siteGuideRes?.sources) sources.push(...siteGuideRes.sources.map((s) => ({
          id: s.id || 'site-guide',
          label: s.label || '操作手册',
          source: s.source || 'SiteGuide'
        })));
        if (siteGuideRes?.context) summaryParts.push(`[操作手册] ${safeString(siteGuideRes.context, 1500)}`);
      }

      if (draftRes) draft = draftRes;

      return {
        ok: evidence.length > 0 || Boolean(draft),
        output: {
          summary: summaryParts.join('\n').slice(0, 1500),
          draftType
        },
        evidence,
        sources,
        draftKey: draft ? `ops-${draftType}` : null,
        draft,
        notes: notes.length ? notes : (draft ? ['已生成草稿待用户确认'] : ['无可用操作方案']),
        tokens: 600
      };
    }
  };
};
