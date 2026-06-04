import { AGENT_AGENT_ROLES } from '../core/agent-events.js';
import { logger } from '@/utils/logger.js';

const safeString = (value) => (value == null ? '' : String(value));

export const createChatEngineAgent = (options = {}) => {
  const {
    invoke,
    defaultMode = 'auto',
    historyProvider
  } = options;

  return {
    name: 'chat-engine',
    role: AGENT_AGENT_ROLES.CHAT_ENGINE,
    tag: 'chat-engine',
    label: '对话',
    category: 'knowledge',
    timeoutMs: 60000,
    enabled: typeof invoke === 'function',
    async run({ task, context, signal, emit }) {
      if (typeof invoke !== 'function') {
        return {
          ok: false,
          output: null,
          status: 'skipped',
          error: { message: 'ChatEngineAgent 未注入 invoke' },
          notes: ['未注入 invoke 回调']
        };
      }

      const query = safeString(task?.input?.query || context?.bus?.getQuery?.() || '');
      const history = historyProvider ? historyProvider(context) : context?.history || [];

      const onStream = (delta) => {
        if (typeof emit === 'function') emit(delta);
      };

      try {
        const result = await invoke({
          query,
          history,
          clusterMode: context?.clusterMode || defaultMode,
          historySummary: context?.historySummary || '',
          signal,
          onStream,
          context
        });

        return {
          ok: Boolean(result?.ok ?? true),
          output: {
            answer: safeString(result?.answer || result?.content || ''),
            mode: safeString(result?.mode || defaultMode),
            extra: result?.extra || null
          },
          evidence: Array.isArray(result?.evidence) ? result.evidence : [],
          sources: Array.isArray(result?.sources) ? result.sources : [],
          draftKey: result?.draftKey || null,
          draft: result?.draft ?? null,
          notes: Array.isArray(result?.notes) ? result.notes : [],
          tokens: Number.isFinite(result?.tokens) ? Number(result.tokens) : 800
        };
      } catch (error) {
        logger.error('bohai-cluster', 'ChatEngineAgent 失败', error);
        return {
          ok: false,
          output: null,
          status: 'failed',
          error: { message: safeString(error?.message || error) },
          notes: [`ChatEngine 调用失败：${safeString(error?.message || error).slice(0, 120)}`]
        };
      }
    }
  };
};
