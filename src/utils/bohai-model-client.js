import {
  SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID,
  resolveSiliconFlowFreeModelId
} from './siliconflow-free-models.js';
import { CONNECTOR_TIMEOUT_MS } from './bohai-constants.js';
import { callVaultSiliconChat } from './api/api-key-runtime-api.js';

const BOHAI_CHAT_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
const ZHIPU_CHAT_API_URL = import.meta.env.VITE_ZHIPU_CHAT_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const BOHAI_DEFAULT_MODEL_ID = resolveSiliconFlowFreeModelId(
  import.meta.env.VITE_BOHAI_DEFAULT_MODEL,
  SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
);

const MODEL_RETRY_MAX = 2;
const MODEL_RETRY_BACKOFF_BASE_MS = 800;
const MODEL_HARD_TIMEOUT_MS = CONNECTOR_TIMEOUT_MS * 4;

// Orchestrator 单独的超时（毫秒），比通用超时短，避免 plan 阶段卡住。
// Orchestrator 只需要结构化 plan 输出，token 较少，3B 级别模型即可胜任。
// 注意：Supabase Edge Function 冷启动需要 5-10s，加上 SiliconFlow API 调用，18s 太紧。
export const ORCHESTRATOR_TIMEOUT_MS = 30000;
// Orchestrator 失败时的兜底模型（更小的 3B 模型，响应更快）。
export const ORCHESTRATOR_MODEL_FALLBACK = 'Qwen/Qwen2.5-3B-Instruct';

const isTimeoutError = (error) => {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('超时') || msg.includes('timeout');
};

const isRetryableStatus = (status) => status === 429 || (status >= 500 && status <= 599);

export const getBohAIModelStatus = () => ({
  hasConfig: Boolean(BOHAI_CHAT_API_URL),
  url: BOHAI_CHAT_API_URL,
  defaultModelId: BOHAI_DEFAULT_MODEL_ID,
  usesVaultFallback: true
});

export const extractBohAIJsonObject = (text = '') => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || withoutThinking;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_error) {
    return null;
  }
};

export const callBohAIModel = async ({
  model = BOHAI_DEFAULT_MODEL_ID,
  messages = [],
  temperature = 0.18,
  maxTokens = 512,
  signal,
  timeoutMs = MODEL_HARD_TIMEOUT_MS
} = {}) => {
  const safeModel = resolveSiliconFlowFreeModelId(model, BOHAI_DEFAULT_MODEL_ID);
  const provider = safeModel.startsWith('glm-') ? 'zhipu' : 'siliconflow';
  const apiUrl = provider === 'zhipu' ? ZHIPU_CHAT_API_URL : BOHAI_CHAT_API_URL;

  let lastError = null;

  for (let attempt = 0; attempt <= MODEL_RETRY_MAX; attempt += 1) {
    // Check if external signal is already aborted before each attempt
    if (signal?.aborted) {
      throw Object.assign(new DOMException('请求已被取消', 'AbortError'), { name: 'AbortError' });
    }
    try {
      const vaultResult = await callVaultSiliconChat({
        provider,
        purpose: 'chat',
        apiUrl,
        timeoutMs,
        signal,
        payload: {
          model: safeModel,
          messages,
          stream: false,
          temperature,
          max_tokens: maxTokens
        }
      });
      if (!vaultResult.ok) {
        // B2 fix: 保留 HTTP status 到 error 上，让 isRetryableStatus 能识别 429/5xx
        const err = new Error(vaultResult.error?.message || 'BOHAI 模型代理调用失败');
        err.status = vaultResult.status || 0;
        err.code = vaultResult.error?.code;
        err.quota = vaultResult.data?.quota || null;
        throw err;
      }
      const payload = vaultResult.data || {};

      return {
        payload,
        content: payload?.choices?.[0]?.message?.content || ''
      };
    } catch (error) {
      // B7 fix: AbortError 来自用户取消，不应重试。直接抛出，避免 2.4s 无意义延迟。
      if (error?.name === 'AbortError') {
        throw error;
      }
      if (isTimeoutError(error)) {
        lastError = error;
        if (attempt < MODEL_RETRY_MAX) {
          const delay = MODEL_RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`BOHAI 模型请求超时，已重试 ${MODEL_RETRY_MAX} 次仍失败。请检查网络或稍后再试。`);
      }
      // 配额超限不重试，直接抛出
      if (error.status === 429 && error.quota) {
        throw error;
      }
      if (isRetryableStatus(error.status) && attempt < MODEL_RETRY_MAX) {
        lastError = error;
        const delay = MODEL_RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('BOHAI 模型调用失败，所有重试均已耗尽。');
};
