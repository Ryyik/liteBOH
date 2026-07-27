import { supabase } from '../supabase-client.js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const runtimeFunctionUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/api-key-vault` : '';

const parseRuntimeResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      ok: false,
      status: response.status,
      message: text.slice(0, 240),
      code: 'API_KEY_RUNTIME_INVALID_JSON'
    };
  }
};

const invokeRuntime = async (payload = {}) => {
  if (!runtimeFunctionUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        message: '缺少 Supabase 运行时配置',
        code: 'MISSING_SUPABASE_RUNTIME_CONFIG'
      }
    };
  }

  const timeoutMs = Math.max(1, Number(payload.timeoutMs || 45000));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // B1 fix: 支持外部 signal，与内部超时 signal 合并
  const externalSignal = payload.signal;
  const effectiveSignal = externalSignal
    ? (typeof AbortSignal.any === 'function'
        ? AbortSignal.any([externalSignal, controller.signal])
        : controller.signal)
    : controller.signal;

  try {
    const sessionResult = await supabase.auth.getSession().catch(() => null);
    const accessToken = sessionResult?.data?.session?.access_token || supabaseAnonKey;
    const response = await fetch(runtimeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey
      },
      signal: effectiveSignal,
      body: JSON.stringify(payload)
    });
    const data = await parseRuntimeResponse(response);

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        status: Number(data?.status || response.status || 0),
        data: data?.data || null,
        error: {
          message: data?.message || `API Key 代理服务返回失败 (${response.status})`,
          code: data?.code || 'API_KEY_RUNTIME_ERROR'
        }
      };
    }

    return {
      ok: true,
      status: Number(data.status || response.status || 200),
      data: data.data,
      keyInfo: data.keyInfo || null,
      error: null
    };
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        message: isAbort ? 'API Key 代理服务调用超时' : (error?.message || 'API Key 代理服务调用失败'),
        code: isAbort ? 'API_KEY_RUNTIME_TIMEOUT' : (error?.name || 'FUNCTION_INVOKE_ERROR')
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const callVaultSiliconChatStream = async ({
  provider = 'siliconflow',
  purpose = 'chat',
  payload = {},
  apiUrl = '',
  timeoutMs = 45000,
  signal,
  mode = ''
} = {}) => {
  if (!runtimeFunctionUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 运行时配置');
  }

  const sessionResult = await supabase.auth.getSession().catch(() => null);
  const accessToken = sessionResult?.data?.session?.access_token || supabaseAnonKey;
  const timeoutSignal = AbortSignal.timeout(Math.max(1, Number(timeoutMs || 30000)));
  const requestSignal = signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeoutSignal]) : signal)
    : timeoutSignal;

  const response = await fetch(runtimeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': supabaseAnonKey
    },
    signal: requestSignal,
    body: JSON.stringify({
      action: 'runtime-chat-stream',
      provider,
      purpose,
      mode,
      payload: {
        ...payload,
        stream: true
      },
      apiUrl,
      timeoutMs
    })
  });

  if (!response.ok) {
    let errMsg;
    let errData = null;
    const rawText = await response.text().catch(() => '');
    // 优先尝试 JSON 解析
    try {
      const parsed = JSON.parse(rawText);
      errMsg = parsed?.message || `API Key 流式代理服务返回失败 (${response.status})`;
      errData = parsed?.data || null;
    } catch {
      // 如果是 SSE 格式错误（event: error\ndata: {...}），提取 data 中的 JSON
      const sseDataMatch = rawText.match(/data:\s*(.+)/);
      if (sseDataMatch) {
        try {
          const sseParsed = JSON.parse(sseDataMatch[1].trim());
          errMsg = sseParsed?.message || `API Key 流式代理服务返回失败 (${response.status})`;
          errData = sseParsed?.data || null;
        } catch {
          errMsg = rawText.slice(0, 240) || `API Key 流式代理服务返回失败 (${response.status})`;
        }
      } else {
        errMsg = rawText.slice(0, 240) || `API Key 流式代理服务返回失败 (${response.status})`;
      }
    }
    const err = new Error(errMsg);
    err.status = response.status;
    err.quota = errData?.quota || null;
    throw err;
  }

  if (!response.body) {
    throw new Error('API Key 流式代理服务未返回可读流');
  }

  return response;
};

export const callVaultSiliconChat = ({
  provider = 'siliconflow',
  purpose = 'chat',
  payload = {},
  apiUrl = '',
  timeoutMs = 45000,
  signal,
  mode = ''
} = {}) => invokeRuntime({
  action: 'runtime-chat',
  provider,
  purpose,
  mode,
  payload,
  apiUrl,
  timeoutMs,
  signal
});

/**
 * 流式调用但收集完整响应（用于长耗时生成，绕过 Edge Function 全局超时）
 * 返回格式与 callVaultSiliconChat 一致
 */
export const callVaultSiliconChatStreamCollect = async ({
  provider = 'siliconflow',
  purpose = 'chat',
  payload = {},
  apiUrl = '',
  timeoutMs = 120000,
  signal,
  mode = ''
} = {}) => {
  try {
    const response = await callVaultSiliconChatStream({
      provider,
      purpose,
      payload,
      apiUrl,
      timeoutMs,
      signal,
      mode
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let keyInfo = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (currentEvent === 'meta') {
              keyInfo = data.keyInfo || null;
            } else if (currentEvent === 'error') {
              return {
                ok: false,
                status: data.status || 502,
                data: null,
                error: {
                  message: data.message || '流式调用失败',
                  code: 'STREAM_ERROR'
                },
                keyInfo: data.keyInfo || null
              };
            } else {
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) fullContent += delta;
            }
          } catch {
            // 非 JSON 行，跳过
          }
          currentEvent = '';
        }
      }
    }

    return {
      ok: true,
      status: 200,
      data: {
        choices: [{ message: { content: fullContent } }]
      },
      error: null,
      keyInfo
    };
  } catch (error) {
    const isAbort = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        message: isAbort ? 'AI 生成超时，请重试' : (error?.message || '流式调用失败'),
        code: isAbort ? 'STREAM_TIMEOUT' : (error?.name || 'STREAM_ERROR')
      }
    };
  }
};

export const searchVaultTavily = ({
  payload = {},
  timeoutMs = 25000,
  signal
} = {}) => invokeRuntime({
  action: 'runtime-search',
  payload,
  timeoutMs,
  signal
});

export const searchVaultFree = ({
  payload = {},
  timeoutMs = 25000,
  signal
} = {}) => invokeRuntime({
  action: 'runtime-free-search',
  payload,
  timeoutMs,
  signal
});

export const resolveVaultActiveKey = ({
  provider = 'siliconflow',
  purpose = 'chat',
  timeoutMs = 5000,
  signal
} = {}) => invokeRuntime({
  action: 'runtime-resolve',
  provider,
  purpose,
  timeoutMs,
  signal
});

export const getAiQuotaStatus = ({
  timeoutMs = 5000
} = {}) => invokeRuntime({
  action: 'quota-status',
  timeoutMs
});

// 清除边缘函数的模型配置内存缓存：管理员修改模型配置后调用，使新配置立即生效
export const clearVaultModelCache = ({
  timeoutMs = 5000
} = {}) => invokeRuntime({
  action: 'clear-model-cache',
  timeoutMs
});
