import {
  SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID,
  resolveSiliconFlowFreeModelId
} from './siliconflow-free-models.js';
import { CONNECTOR_TIMEOUT_MS } from './bohai-constants.js';

const BOHAI_CHAT_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
const BOHAI_CHAT_API_KEY = import.meta.env.VITE_SILICON_CLOUD_API_KEY || '';
const BOHAI_DEFAULT_MODEL_ID = resolveSiliconFlowFreeModelId(
  import.meta.env.VITE_BOHAI_DEFAULT_MODEL,
  SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
);

const MODEL_RETRY_MAX = 2;
const MODEL_RETRY_BACKOFF_BASE_MS = 800;
const MODEL_HARD_TIMEOUT_MS = CONNECTOR_TIMEOUT_MS * 4;

// Orchestrator 单独的超时（毫秒），比通用超时短，避免 plan 阶段卡住。
// Orchestrator 只需要结构化 plan 输出，token 较少，3B 级别模型即可胜任。
export const ORCHESTRATOR_TIMEOUT_MS = 18000;
// Orchestrator 失败时的兜底模型（更小的 3B 模型，响应更快）。
export const ORCHESTRATOR_MODEL_FALLBACK = 'Qwen/Qwen2.5-3B-Instruct';

const isRetryableStatus = (status) => status === 429 || (status >= 500 && status <= 599);

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new DOMException(timeoutMessage || '请求超时', 'TimeoutError'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
};

export const getBohAIModelStatus = () => ({
  hasConfig: Boolean(BOHAI_CHAT_API_URL && BOHAI_CHAT_API_KEY),
  url: BOHAI_CHAT_API_URL,
  defaultModelId: BOHAI_DEFAULT_MODEL_ID
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
  stream = false,
  signal,
  timeoutMs = MODEL_HARD_TIMEOUT_MS
} = {}) => {
  if (!BOHAI_CHAT_API_KEY) {
    throw new Error('BOHAI 模型未配置 API Key');
  }
  const safeModel = resolveSiliconFlowFreeModelId(model, BOHAI_DEFAULT_MODEL_ID);

  let lastError = null;

  for (let attempt = 0; attempt <= MODEL_RETRY_MAX; attempt += 1) {
    try {
      const fetchPromise = fetch(BOHAI_CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BOHAI_CHAT_API_KEY}`
        },
        body: JSON.stringify({
          model: safeModel,
          messages,
          stream,
          temperature,
          max_tokens: maxTokens
        }),
        signal
      });

      const response = await withTimeout(fetchPromise, timeoutMs, 'BOHAI 模型请求超时');

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        const text = await response.text().catch(() => '');
        throw new Error(`BOHAI API 返回非 JSON 响应（${response.status}）：${text.slice(0, 200)}`);
      }

      if (!response.ok) {
        const errorMsg = payload?.error?.message || payload?.message || `BOHAI 模型调用失败（${response.status}）`;
        const error = new Error(errorMsg);
        error.status = response.status;
        throw error;
      }

      return {
        payload,
        content: payload?.choices?.[0]?.message?.content || ''
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.name === 'TimeoutError') {
        lastError = error;
        if (attempt < MODEL_RETRY_MAX) {
          const delay = MODEL_RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`BOHAI 模型请求超时，已重试 ${MODEL_RETRY_MAX} 次仍失败。请检查网络或稍后再试。`);
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
