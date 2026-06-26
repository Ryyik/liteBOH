import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

type VaultRow = {
  id: string;
  provider: string;
  purpose: string;
  label: string;
  encrypted_value: string;
  masked_value: string;
  status: 'active' | 'disabled';
  metadata: Record<string, unknown>;
  last_test_status: string | null;
  last_test_message: string | null;
  last_tested_at: string | null;
  updated_at: string;
  created_at: string;
  readonly?: boolean;
  source?: string;
};

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const VAULT_MASTER_KEY = String(Deno.env.get('API_KEY_VAULT_MASTER_KEY') || '').trim();

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const PROVIDER_OPTIONS = new Set(['siliconflow', 'zhipu', 'tavily', 'cloudinary', 'turnstile', 'custom']);
const STATUS_OPTIONS = new Set(['active', 'disabled']);

const toText = (value: unknown, max = 0) => {
  const text = String(value || '').trim();
  return max > 0 && text.length > max ? text.slice(0, max) : text;
};

const toMetadata = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const getCryptoKey = async () => {
  if (!VAULT_MASTER_KEY || VAULT_MASTER_KEY.length < 24) {
    throw new Error('缺少 API_KEY_VAULT_MASTER_KEY，或长度不足 24 个字符。');
  }
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(VAULT_MASTER_KEY));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const encryptSecret = async (value: string) => {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TEXT_ENCODER.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
};

const decryptSecret = async (payload: string) => {
  const [rawIv, rawCiphertext] = String(payload || '').split('.');
  if (!rawIv || !rawCiphertext) throw new Error('密钥密文格式无效。');
  const key = await getCryptoKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(rawIv) },
    key,
    base64ToBytes(rawCiphertext),
  );
  return TEXT_DECODER.decode(plaintext);
};

const maskSecret = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}****${text.slice(-2)}`;
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
};

const createServiceClient = () => {
  if (!SUPABASE_URL) throw new Error('缺少环境变量 SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('缺少环境变量 SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'boh-api-key-vault' },
    },
  });
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const requireAdmin = async (request: Request, client: ReturnType<typeof createServiceClient>) => {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, code: 'UNAUTHORIZED', message: '请先登录。' };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  const userId = String(authData?.user?.id || '').trim();
  if (authError || !userId) {
    return { ok: false as const, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效。' };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || String(profile?.role || '').trim() !== 'admin') {
    return { ok: false as const, status: 403, code: 'FORBIDDEN', message: '仅管理员可管理 API Key。' };
  }

  return { ok: true as const, userId };
};

const sanitizeRow = (row: VaultRow) => ({
  id: row.id,
  provider: row.provider,
  purpose: row.purpose,
  label: row.label,
  maskedValue: row.masked_value,
  status: row.status,
  metadata: row.metadata || {},
  lastTestStatus: row.last_test_status || '',
  lastTestMessage: row.last_test_message || '',
  lastTestedAt: row.last_tested_at || '',
  updatedAt: row.updated_at,
  createdAt: row.created_at,
  readonly: Boolean(row.readonly),
  source: row.source || 'vault',
});

const writeAuditLog = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  action: string,
  row: Partial<VaultRow> = {},
  metadata: Record<string, unknown> = {},
) => {
  await client.from('api_key_vault_audit_logs').insert([{
    vault_id: row.id || null,
    actor_id: actorId,
    action,
    provider: row.provider || '',
    purpose: row.purpose || '',
    metadata,
  }]);
};

const selectColumns = 'id, provider, purpose, label, encrypted_value, masked_value, status, metadata, last_test_status, last_test_message, last_tested_at, updated_at, created_at';

const listKeys = async (client: ReturnType<typeof createServiceClient>) => {
  const { data, error } = await client
    .from('api_key_vault')
    .select(selectColumns)
    .order('provider', { ascending: true })
    .order('purpose', { ascending: true });

  if (error) throw error;
  const rows = Array.isArray(data) ? data.map((row) => sanitizeRow(row as VaultRow)) : [];
  const existingKeys = new Set(rows.map((row) => `${row.provider}:${row.purpose}`));
  const now = new Date().toISOString();
  const fallbackRows: VaultRow[] = [];
  const siliconFallback = String(Deno.env.get('SILICON_CLOUD_API_KEY') || '').trim();
  const zhipuFallback = String(Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('BIGMODEL_API_KEY') || '').trim();
  const moderationFallback = String(Deno.env.get('MODERATION_API_KEY') || '').trim();
  const tavilyFallback = String(Deno.env.get('TAVILY_API_KEY') || '').trim();

  if (siliconFallback && !existingKeys.has('siliconflow:chat')) {
    fallbackRows.push({
      id: 'fallback:siliconflow:chat',
      provider: 'siliconflow',
      purpose: 'chat',
      label: 'SiliconFlow Chat（Secrets 兜底）',
      encrypted_value: '',
      masked_value: maskSecret(siliconFallback),
      status: 'active',
      metadata: {},
      last_test_status: null,
      last_test_message: null,
      last_tested_at: null,
      updated_at: now,
      created_at: now,
      readonly: true,
      source: 'server_secret_fallback',
    });
  }
  if (moderationFallback && !existingKeys.has('siliconflow:moderation')) {
    fallbackRows.push({
      id: 'fallback:siliconflow:moderation',
      provider: 'siliconflow',
      purpose: 'moderation',
      label: 'SiliconFlow Moderation（Secrets 兜底）',
      encrypted_value: '',
      masked_value: maskSecret(moderationFallback),
      status: 'active',
      metadata: {},
      last_test_status: null,
      last_test_message: null,
      last_tested_at: null,
      updated_at: now,
      created_at: now,
      readonly: true,
      source: 'server_secret_fallback',
    });
  }
  if (zhipuFallback && !existingKeys.has('zhipu:chat')) {
    fallbackRows.push({
      id: 'fallback:zhipu:chat',
      provider: 'zhipu',
      purpose: 'chat',
      label: '智谱 GLM Chat（Secrets 兜底）',
      encrypted_value: '',
      masked_value: maskSecret(zhipuFallback),
      status: 'active',
      metadata: {},
      last_test_status: null,
      last_test_message: null,
      last_tested_at: null,
      updated_at: now,
      created_at: now,
      readonly: true,
      source: 'server_secret_fallback',
    });
  }
  if (tavilyFallback && !existingKeys.has('tavily:web_search')) {
    fallbackRows.push({
      id: 'fallback:tavily:web_search',
      provider: 'tavily',
      purpose: 'web_search',
      label: 'Tavily Web Search（Secrets 兜底）',
      encrypted_value: '',
      masked_value: maskSecret(tavilyFallback),
      status: 'active',
      metadata: {},
      last_test_status: null,
      last_test_message: null,
      last_tested_at: null,
      updated_at: now,
      created_at: now,
      readonly: true,
      source: 'server_secret_fallback',
    });
  }

  return [
    ...rows,
    ...fallbackRows.map((row) => sanitizeRow(row)),
  ];
};

const upsertKey = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  body: Record<string, unknown>,
) => {
  const provider = toText(body.provider, 40).toLowerCase();
  const purpose = toText(body.purpose, 60).toLowerCase();
  const label = toText(body.label, 80);
  const value = String(body.value || '').trim();
  const status = toText(body.status || 'active', 16).toLowerCase();
  const metadata = toMetadata(body.metadata);

  if (!PROVIDER_OPTIONS.has(provider)) throw new Error('Provider 无效。');
  if (!purpose || !/^[a-z0-9_-]{2,60}$/.test(purpose)) throw new Error('Purpose 只能包含小写字母、数字、下划线和短横线。');
  if (!value || value.length < 6) throw new Error('请输入有效的 API Key。');
  if (!STATUS_OPTIONS.has(status)) throw new Error('状态无效。');

  const encryptedValue = await encryptSecret(value);
  const payload = {
    provider,
    purpose,
    label: label || `${provider} ${purpose}`,
    encrypted_value: encryptedValue,
    masked_value: maskSecret(value),
    status,
    metadata,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('api_key_vault')
    .upsert([{ ...payload, created_by: actorId }], { onConflict: 'provider,purpose' })
    .select(selectColumns)
    .maybeSingle();

  if (error) throw error;
  await writeAuditLog(client, actorId, 'upsert', data as VaultRow, { label: payload.label, status });
  return sanitizeRow(data as VaultRow);
};

const updateStatus = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  body: Record<string, unknown>,
) => {
  const id = toText(body.id, 80);
  const status = toText(body.status, 16).toLowerCase();
  if (!id) throw new Error('缺少密钥 ID。');
  if (!STATUS_OPTIONS.has(status)) throw new Error('状态无效。');

  const { data, error } = await client
    .from('api_key_vault')
    .update({ status, updated_by: actorId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(selectColumns)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('未找到该 API Key。');
  await writeAuditLog(client, actorId, 'status', data as VaultRow, { status });
  return sanitizeRow(data as VaultRow);
};

const resolveRow = async (client: ReturnType<typeof createServiceClient>, body: Record<string, unknown>) => {
  const id = toText(body.id, 80);
  let query = client.from('api_key_vault').select(selectColumns).limit(1);

  if (id) {
    query = query.eq('id', id);
  } else {
    query = query
      .eq('provider', toText(body.provider, 40).toLowerCase())
      .eq('purpose', toText(body.purpose, 60).toLowerCase());
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('未找到该 API Key。');
  return data as VaultRow;
};

const testSiliconFlow = async (apiKey: string, metadata: Record<string, unknown>) => {
  const apiUrl = toText(metadata.apiUrl, 240) || 'https://api.siliconflow.cn/v1/chat/completions';
  const model = toText(metadata.model, 120) || 'Qwen/Qwen2.5-7B-Instruct';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error?.message || payload?.message || `HTTP ${response.status}`));
  }
  return 'SiliconFlow 连接正常。';
};

const testZhipu = async (apiKey: string, metadata: Record<string, unknown>) => {
  const apiUrl = toText(metadata.apiUrl, 240) || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const model = toText(metadata.model, 120) || 'glm-4.7-flash';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error?.message || payload?.message || `HTTP ${response.status}`));
  }
  return '智谱 AI 连接正常。';
};

const testTavily = async (apiKey: string) => {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'ping',
      search_depth: 'basic',
      max_results: 1,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error || payload?.message || `HTTP ${response.status}`));
  }
  return 'Tavily 连接正常。';
};

const resolveActiveSecret = async (
  client: ReturnType<typeof createServiceClient>,
  provider: string,
  purpose: string,
) => {
  try {
    const row = await resolveRow(client, { provider, purpose });
    if (row.status !== 'active') throw new Error(`${provider}/${purpose} API Key 已停用。`);
    return {
      row,
      apiKey: await decryptSecret(row.encrypted_value),
    };
  } catch (error) {
    let fallbackKey = '';
    if (provider === 'tavily') {
      fallbackKey = String(Deno.env.get('TAVILY_API_KEY') || '').trim();
    } else if (provider === 'zhipu') {
      fallbackKey = String(Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('BIGMODEL_API_KEY') || '').trim();
    } else {
      fallbackKey = String(
        (purpose === 'moderation' ? Deno.env.get('MODERATION_API_KEY') : '')
          || Deno.env.get('SILICON_CLOUD_API_KEY')
          || '',
      ).trim();
    }

    if (!fallbackKey) throw error;
    return {
      row: {
        id: '',
        provider,
        purpose,
        label: `${provider} ${purpose}`,
        encrypted_value: '',
        masked_value: maskSecret(fallbackKey),
        status: 'active',
        metadata: {},
        last_test_status: null,
        last_test_message: null,
        last_tested_at: null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as VaultRow,
      apiKey: fallbackKey,
    };
  }
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const runtimeChatCompletion = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
) => {
  const provider = toText(body.provider || 'siliconflow', 40).toLowerCase();
  const purpose = toText(body.purpose || 'chat', 60).toLowerCase();
  const { row, apiKey } = await resolveActiveSecret(client, provider, purpose);
  const metadata = row.metadata || {};
  const rawPayload = toMetadata(body.payload);
  const defaultApiUrl = provider === 'zhipu'
    ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    : 'https://api.siliconflow.cn/v1/chat/completions';
  const apiUrl = toText(body.apiUrl, 240) || toText(metadata.apiUrl, 240) || defaultApiUrl;
  const payload = {
    ...rawPayload,
    stream: false,
    max_tokens: clampInt(rawPayload.max_tokens, 1200, 1, 4096),
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(clampInt(body.timeoutMs, 30000, 3000, 120000)),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: String(data?.error?.message || data?.message || `${provider} 请求失败：${response.status}`),
      data,
    };
  }
  return { ok: true, status: response.status, data };
};

const runtimeChatCompletionStream = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
  origin: string | null,
) => {
  const provider = toText(body.provider || 'siliconflow', 40).toLowerCase();
  const purpose = toText(body.purpose || 'chat', 60).toLowerCase();
  const { row, apiKey } = await resolveActiveSecret(client, provider, purpose);
  const metadata = row.metadata || {};
  const rawPayload = toMetadata(body.payload);
  const defaultApiUrl = provider === 'zhipu'
    ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    : 'https://api.siliconflow.cn/v1/chat/completions';
  const apiUrl = toText(body.apiUrl, 240) || toText(metadata.apiUrl, 240) || defaultApiUrl;
  const payload = {
    ...rawPayload,
    stream: true,
    max_tokens: clampInt(rawPayload.max_tokens, 1200, 1, 4096),
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(clampInt(body.timeoutMs, 30000, 3000, 120000)),
  });

  const streamHeaders = {
    ...buildCorsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const message = text.slice(0, 500) || `${provider} 流式请求失败：${response.status}`;
    return new Response(
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  if (!response.body) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message: '模型服务未返回可读流。' })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: streamHeaders,
  });
};

const runtimeTavilySearch = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
) => {
  const { apiKey } = await resolveActiveSecret(client, 'tavily', 'web_search');
  const rawPayload = toMetadata(body.payload);
  const payload = {
    ...rawPayload,
    api_key: apiKey,
    query: toText(rawPayload.query, 500),
    search_depth: toText(rawPayload.search_depth, 20) || 'basic',
    max_results: clampInt(rawPayload.max_results, 3, 1, 8),
  };
  if (!payload.query) throw new Error('搜索关键词不能为空。');

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(clampInt(body.timeoutMs, 25000, 3000, 60000)),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: String(data?.error || data?.message || `Tavily 请求失败：${response.status}`),
      data,
    };
  }
  return { ok: true, status: response.status, data };
};

const testKey = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  body: Record<string, unknown>,
) => {
  const row = String(body.id || '').startsWith('fallback:')
    ? (await resolveActiveSecret(
      client,
      toText(body.provider, 40).toLowerCase(),
      toText(body.purpose, 60).toLowerCase(),
    )).row
    : await resolveRow(client, body);
  const now = new Date().toISOString();
  let status = 'success';
  let message = '';

  try {
    const apiKey = row.encrypted_value
      ? await decryptSecret(row.encrypted_value)
      : (await resolveActiveSecret(client, row.provider, row.purpose)).apiKey;
    if (row.status !== 'active') throw new Error('该 API Key 已停用。');
    if (row.provider === 'siliconflow') {
      message = await testSiliconFlow(apiKey, row.metadata || {});
    } else if (row.provider === 'zhipu') {
      message = await testZhipu(apiKey, row.metadata || {});
    } else if (row.provider === 'tavily') {
      message = await testTavily(apiKey);
    } else {
      message = '该 Provider 暂未配置真实连通性测试，仅完成了解密校验。';
    }
  } catch (error) {
    status = 'failed';
    message = error instanceof Error ? error.message : '测试失败。';
  }

  if (!row.encrypted_value || row.readonly) {
    return sanitizeRow({
      ...row,
      last_test_status: status,
      last_test_message: message.slice(0, 240),
      last_tested_at: now,
      updated_at: now,
    });
  }

  const { data, error } = await client
    .from('api_key_vault')
    .update({
      last_test_status: status,
      last_test_message: message.slice(0, 240),
      last_tested_at: now,
      updated_by: actorId,
      updated_at: now,
    })
    .eq('id', row.id)
    .select(selectColumns)
    .maybeSingle();

  if (error) throw error;
  await writeAuditLog(client, actorId, 'test', data as VaultRow, { status, message: message.slice(0, 120) });
  return sanitizeRow(data as VaultRow);
};

// ============================================================
// AI 配额系统
// ============================================================

const QUOTA_CACHE_TTL_MS = 60_000;
const QUOTA_CONFIG_CACHE = new Map<string, { limit: number; fetchedAt: number }>();

function getBeijingTodayStartUTC(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600000);
  beijing.setUTCHours(0, 0, 0, 0);
  return new Date(beijing.getTime() - 8 * 3600000).toISOString();
}

function getTomorrowBeijingStartUTC(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600000);
  beijing.setUTCDate(beijing.getUTCDate() + 1);
  beijing.setUTCHours(0, 0, 0, 0);
  return new Date(beijing.getTime() - 8 * 3600000).toISOString();
}

async function resolveUserTier(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
): Promise<string> {
  if (!userId) return 'guest';
  const { data } = await client
    .from('user_subscriptions')
    .select('plan_code')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());
  const plans = new Set((data || []).map((r: Record<string, unknown>) => String(r.plan_code || '')));
  if (plans.has('boh-max')) return 'boh-max';
  if (plans.has('boh-pro')) return 'boh-pro';
  if (plans.has('boh-ai-plus')) return 'boh-ai-plus';
  return 'free';
}

async function getDailyLimit(
  client: ReturnType<typeof createServiceClient>,
  tier: string,
): Promise<number> {
  const cached = QUOTA_CONFIG_CACHE.get(tier);
  if (cached && Date.now() - cached.fetchedAt < QUOTA_CACHE_TTL_MS) {
    return cached.limit;
  }
  const { data } = await client
    .from('ai_quota_config')
    .select('daily_limit')
    .eq('tier', tier)
    .maybeSingle();
  const limit = data?.daily_limit ?? 0;
  QUOTA_CONFIG_CACHE.set(tier, { limit, fetchedAt: Date.now() });
  return limit;
}

async function countTodayUsage(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
  ipAddress: string | null,
): Promise<number> {
  const todayStart = getBeijingTodayStartUTC();
  let query = client
    .from('ai_quota_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart);
  if (userId) {
    query = query.eq('user_id', userId);
  } else if (ipAddress) {
    query = query.eq('ip_address', ipAddress);
  }
  const { count } = await query;
  return count || 0;
}

async function logUsage(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
  ipAddress: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  const payload = (body.payload || {}) as Record<string, unknown>;
  await client.from('ai_quota_log').insert([{
    user_id: userId,
    ip_address: ipAddress,
    model: String(payload.model || ''),
    mode: String(body.mode || ''),
    created_at: new Date().toISOString(),
  }]);
}

async function checkAndLogRequest(
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
  request: Request,
): Promise<{ allowed: boolean; used: number; limit: number; resetAt: string; tier: string }> {
  const token = getBearerToken(request);
  let userId: string | null = null;
  let ipAddress: string | null = null;

  if (token) {
    const { data: userData } = await client.auth.getUser(token).catch(() => ({ data: null }));
    userId = userData?.user?.id || null;
  }
  if (!userId) {
    ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  }

  const tier = await resolveUserTier(client, userId);
  const limit = await getDailyLimit(client, tier);

  if (limit === -1) {
    logUsage(client, userId, ipAddress, body).catch(() => {});
    return { allowed: true, used: 0, limit: -1, resetAt: '', tier };
  }

  const used = await countTodayUsage(client, userId, ipAddress);
  if (used >= limit) {
    return { allowed: false, used, limit, resetAt: getTomorrowBeijingStartUTC(), tier };
  }

  await logUsage(client, userId, ipAddress, body).catch(() => {});
  const actualUsed = await countTodayUsage(client, userId, ipAddress);
  if (actualUsed > limit) {
    const resetAt = getTomorrowBeijingStartUTC();
    return { allowed: false, used: actualUsed, limit, resetAt, tier };
  }
  return { allowed: true, used: actualUsed, limit, resetAt: getTomorrowBeijingStartUTC(), tier };
}

async function handleQuotaStatus(
  client: ReturnType<typeof createServiceClient>,
  request: Request,
) {
  const token = getBearerToken(request);
  let userId: string | null = null;
  let ipAddress: string | null = null;

  if (token) {
    const { data: userData } = await client.auth.getUser(token).catch(() => ({ data: null }));
    userId = userData?.user?.id || null;
  }
  if (!userId) {
    ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  }

  const tier = await resolveUserTier(client, userId);
  const limit = await getDailyLimit(client, tier);
  const used = limit === -1 ? 0 : await countTodayUsage(client, userId, ipAddress);

  return { tier, used, limit, resetAt: limit === -1 ? '' : getTomorrowBeijingStartUTC() };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  try {
    const client = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const action = toText(body.action || 'list', 30);

    if (action === 'runtime-chat') {
      const quota = await checkAndLogRequest(client, body, request);
      if (!quota.allowed) {
        return jsonResponse({ ok: false, status: 429, data: { quota }, message: '今日 AI 对话额度已用完，明天 0:00 重置' }, 429, origin);
      }
      const result = await runtimeChatCompletion(client, body);
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'runtime-chat-stream') {
      const quota = await checkAndLogRequest(client, body, request);
      if (!quota.allowed) {
        return jsonResponse({ ok: false, status: 429, data: { quota }, message: '今日 AI 对话额度已用完，明天 0:00 重置' }, 429, origin);
      }
      return await runtimeChatCompletionStream(client, body, origin);
    }
    if (action === 'runtime-search') {
      const result = await runtimeTavilySearch(client, body);
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'quota-status') {
      const data = await handleQuotaStatus(client, request);
      return jsonResponse({ ok: true, data }, 200, origin);
    }

    const admin = await requireAdmin(request, client);
    if (!admin.ok) {
      return jsonResponse({ ok: false, code: admin.code, message: admin.message }, admin.status, origin);
    }

    if (action === 'list') {
      return jsonResponse({ ok: true, data: await listKeys(client) }, 200, origin);
    }
    if (action === 'upsert') {
      return jsonResponse({ ok: true, data: await upsertKey(client, admin.userId, body) }, 200, origin);
    }
    if (action === 'status') {
      return jsonResponse({ ok: true, data: await updateStatus(client, admin.userId, body) }, 200, origin);
    }
    if (action === 'test') {
      return jsonResponse({ ok: true, data: await testKey(client, admin.userId, body) }, 200, origin);
    }

    return jsonResponse({ ok: false, code: 'UNKNOWN_ACTION', message: '未知操作。' }, 400, origin);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'API_KEY_VAULT_ERROR',
        message: error instanceof Error ? error.message : 'API Key 管理服务异常。',
      },
      500,
      origin,
    );
  }
});
