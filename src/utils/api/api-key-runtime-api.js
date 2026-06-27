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
    try {
      const parsed = await response.json().catch(() => null);
      errMsg = parsed?.message || `API Key 流式代理服务返回失败 (${response.status})`;
      errData = parsed?.data || null;
    } catch {
      const text = await response.text().catch(() => '');
      errMsg = text.slice(0, 240) || `API Key 流式代理服务返回失败 (${response.status})`;
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

export const searchVaultTavily = ({
  payload = {},
  timeoutMs = 25000
} = {}) => invokeRuntime({
  action: 'runtime-search',
  payload,
  timeoutMs
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
