import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';

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
const PROVIDER_OPTIONS = new Set(['siliconflow', 'zhipu', 'openrouter', 'tavily', 'cloudinary', 'turnstile', 'custom']);
const STATUS_OPTIONS = new Set(['active', 'disabled']);

const sanitizeMessage = (msg: string, maxLen = 240) => {
  return String(msg || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g, '')
    .trim()
    .slice(0, maxLen);
};

const toText = (value: unknown, max = 0) => {
  const text = String(value || '').trim();
  return max > 0 && text.length > max ? text.slice(0, max) : text;
};

const toMetadata = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

// 安全修复 C-3：校验 runtime-chat / test 的目标 apiUrl，防止 SSRF。
// 规则：仅允许 https:（开发环境允许 http: 但拒绝私有地址）；
// 拒绝 localhost、私有 IP 段、链路本地地址（含云元数据 169.254.169.254）。
const isPrivateOrLocalHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  // IPv4 私有/保留段
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // 链路本地 / 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // 组播/保留
  }
  // IPv6 私有/链路本地
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
};

const validateRuntimeApiUrl = (rawUrl: string, fallback: string): string => {
  const candidate = toText(rawUrl, 240) || fallback;
  if (!candidate) return '';
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fallback; // 非法 URL 回退到安全默认值
  }
  // 仅允许 http/https
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fallback;
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    return fallback;
  }
  return candidate;
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
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(rawIv) },
      key,
      base64ToBytes(rawCiphertext),
    );
  } catch (_err) {
    // 避免错误信息中泄露明文片段
    throw new Error('密钥解密失败，请检查 API_KEY_VAULT_MASTER_KEY 或重新录入。');
  }
  return TEXT_DECODER.decode(plaintext);
};

const maskSecret = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length < 12) return `${text[0] || ''}****${text[text.length - 1] || ''}`;
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

// 仅要求用户登录（非管理员），用于 runtime-chat / runtime-chat-stream
const requireUser = async (request: Request, client: ReturnType<typeof createServiceClient>) => {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, code: 'UNAUTHORIZED', message: '请先登录。' };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  const userId = String(authData?.user?.id || '').trim();
  if (authError || !userId) {
    return { ok: false as const, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效。' };
  }

  return { ok: true as const, userId };
};

const getClientIp = (request: Request) => (
  request.headers.get('cf-connecting-ip')?.trim()
  || request.headers.get('x-real-ip')?.trim()
  || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || 'unknown'
);

const resolveRuntimeIdentity = async (
  request: Request,
  client: ReturnType<typeof createServiceClient>,
) => {
  const token = getBearerToken(request);
  if (token) {
    const { data } = await client.auth.getUser(token).catch(() => ({ data: null }));
    const userId = String(data?.user?.id || '').trim();
    if (userId) return { userId, ipAddress: null, tier: await resolveUserTier(client, userId) };
  }
  return { userId: null, ipAddress: getClientIp(request), tier: 'guest' };
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

const buildKeyInfo = (row: VaultRow) => ({
  id: row.id || '',
  provider: row.provider,
  purpose: row.purpose,
  label: row.label || `${row.provider} ${row.purpose}`,
  maskedValue: row.masked_value || '',
  source: row.source || (row.id ? 'vault' : 'server_secret_fallback'),
  readonly: Boolean(row.readonly)
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
  const openrouterFallback = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();
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
  if (openrouterFallback && !existingKeys.has('openrouter:chat')) {
    fallbackRows.push({
      id: 'fallback:openrouter:chat',
      provider: 'openrouter',
      purpose: 'chat',
      label: 'OpenRouter Chat（Secrets 兜底）',
      encrypted_value: '',
      masked_value: maskSecret(openrouterFallback),
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

const deleteKey = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  body: Record<string, unknown>,
) => {
  const id = toText(body.id, 80);
  if (!id) throw new Error('缺少 API Key id。');
  if (id.startsWith('fallback:')) throw new Error('Secrets 兜底项不可删除，请调整环境变量。');

  const { data: existing, error: lookupError } = await client
    .from('api_key_vault')
    .select(selectColumns)
    .eq('id', id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('未找到该 API Key。');

  const { error } = await client.from('api_key_vault').delete().eq('id', id);
  if (error) throw error;
  await writeAuditLog(client, actorId, 'delete', existing as VaultRow, {
    provider: (existing as VaultRow).provider,
    purpose: (existing as VaultRow).purpose,
  });
  return { id };
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
  // 安全修复 C-3：校验 apiUrl 防止 SSRF（admin 配置的 metadata.apiUrl 仍需校验）
  const apiUrl = validateRuntimeApiUrl(toText(metadata.apiUrl, 240), 'https://api.siliconflow.cn/v1/chat/completions');
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
  // 安全修复 C-3：校验 apiUrl 防止 SSRF
  const apiUrl = validateRuntimeApiUrl(toText(metadata.apiUrl, 240), 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
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

const testOpenRouter = async (apiKey: string, metadata: Record<string, unknown>) => {
  const apiUrl = validateRuntimeApiUrl(toText(metadata.apiUrl, 240), 'https://openrouter.ai/api/v1/chat/completions');
  const model = toText(metadata.model, 120) || 'openai/gpt-4o-mini';
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
  return 'OpenRouter 连接正常。';
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

// ============================================================
// 模型自动发现：调用中转站 GET /v1/models，返回可用模型列表
// ============================================================
// 与 testKey 不同，这里调用 OpenAI 兼容的 models 列表接口。
// 各 provider 的 models 端点：
//   siliconflow: https://api.siliconflow.cn/v1/models
//   zhipu:       https://open.bigmodel.cn/api/paas/v4/models
//   openrouter:  https://openrouter.ai/api/v1/models
//   custom:      从 metadata.apiUrl 推导（剥掉 /chat/completions 后缀，附加 /models）
const DEFAULT_MODELS_URL: Record<string, string> = {
  siliconflow: 'https://api.siliconflow.cn/v1/models',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

const deriveModelsUrl = (provider: string, metadata: Record<string, unknown>): string => {
  const fallback = DEFAULT_MODELS_URL[provider] || '';
  const chatUrl = toText(metadata.apiUrl, 240);
  if (chatUrl) {
    const trimmed = chatUrl.replace(/\/+$/, '');
    // 标准情况：以 /chat/completions 结尾 → 替换为 /models
    if (/\/chat\/completions$/i.test(trimmed)) {
      return validateRuntimeApiUrl(trimmed.replace(/\/chat\/completions$/i, '/models'), fallback);
    }
    // 以 /v1 /v2 等版本号结尾 → 附加 /models
    if (/\/v\d+$/i.test(trimmed)) {
      return validateRuntimeApiUrl(`${trimmed}/models`, fallback);
    }
    // 以 /models 结尾 → 已经是 models URL，直接用
    if (/\/models$/i.test(trimmed)) {
      return validateRuntimeApiUrl(trimmed, fallback);
    }
    // 其他情况：附加 /v1/models（兼容只填了域名的中转站）
    return validateRuntimeApiUrl(`${trimmed}/v1/models`, fallback);
  }
  return validateRuntimeApiUrl(fallback, fallback);
};

type DiscoveredModel = {
  id: string;
  name?: string;
  owned_by?: string;
};

type DiscoveryResult = {
  ok: boolean;
  status: 'success' | 'fetch_failed' | 'parse_failed' | 'not_configured' | 'invalid_key' | 'unsupported_provider' | 'disabled_key';
  message: string;
  upstreamStatus?: number;
  upstreamBodyPreview?: string;
  modelsUrl: string;
  apiBaseUrl: string;
  provider: string;
  purpose: string;
  models: DiscoveredModel[];
  total: number;
};

const discoverProviderModels = async (
  apiKey: string,
  provider: string,
  metadata: Record<string, unknown>,
  overrideModelsUrl?: string,
): Promise<{ ok: true; models: DiscoveredModel[]; modelsUrl: string } | { ok: false; status: DiscoveryResult['status']; message: string; upstreamStatus?: number; upstreamBodyPreview?: string; modelsUrl: string }> => {
  // 优先使用前端传入的 overrideModelsUrl（仍做 SSRF 校验），否则走自动推导
  let modelsUrl = '';
  if (overrideModelsUrl) {
    modelsUrl = validateRuntimeApiUrl(toText(overrideModelsUrl, 240), '');
    if (!modelsUrl) {
      return {
        ok: false,
        status: 'not_configured',
        message: `手动指定的 models URL 不合法（被 SSRF 校验拒绝或格式错误）：${overrideModelsUrl}`,
        modelsUrl: '',
      };
    }
  } else {
    modelsUrl = deriveModelsUrl(provider, metadata);
  }
  if (!modelsUrl) {
    return {
      ok: false,
      status: 'not_configured',
      message: `Provider "${provider}" 未配置 models 端点。请在表单中填写 api_url（chat completions URL，会自动推导出 /models 端点），或在弹窗里手动指定 models URL。`,
      modelsUrl: '',
    };
  }
  let response: Response;
  try {
    response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return {
      ok: false,
      status: 'fetch_failed',
      message: `请求 ${modelsUrl} 失败：${e instanceof Error ? e.message : '网络错误'}`,
      modelsUrl,
    };
  }
  // 把原始响应体读出来（用于诊断）
  const rawText = await response.text().catch(() => '');
  if (!response.ok) {
    // 尝试从 JSON 中提取错误信息
    let upstreamMessage = '';
    try {
      const payload = JSON.parse(rawText);
      upstreamMessage = String(payload?.error?.message || payload?.message || payload?.error || '');
    } catch { /* 非 JSON 响应，直接走 HTTP 状态码 */ }
    const status: DiscoveryResult['status'] = response.status === 401 || response.status === 403 ? 'invalid_key' : 'fetch_failed';
    return {
      ok: false,
      status,
      message: upstreamMessage
        ? `中转站返回 HTTP ${response.status}：${upstreamMessage}`
        : `中转站返回 HTTP ${response.status}（${response.statusText || '错误'}）`,
      upstreamStatus: response.status,
      upstreamBodyPreview: rawText.slice(0, 400),
      modelsUrl,
    };
  }
  // 解析 JSON
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      status: 'parse_failed',
      message: `中转站返回了非 JSON 响应（可能是 HTML 错误页或该接口不支持 /v1/models）。响应内容前 200 字符：${rawText.slice(0, 200)}`,
      upstreamStatus: response.status,
      upstreamBodyPreview: rawText.slice(0, 400),
      modelsUrl,
    };
  }
  // OpenAI 兼容格式：{ data: [{ id, object, owned_by }, ...] }
  // 部分中转站可能直接返回数组：[{ id, ... }]
  const rawList = Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data : [];
  const models: DiscoveredModel[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const id = toText((item as { id?: unknown }).id, 200);
    if (!id) continue;
    models.push({
      id,
      name: toText((item as { name?: unknown; id?: unknown }).name || (item as { id?: unknown }).id, 200) || undefined,
      owned_by: toText((item as { owned_by?: unknown; owner?: unknown }).owned_by || (item as { owner?: unknown }).owner, 120) || undefined,
    });
  }
  // 去重（按 id）
  const seen = new Set<string>();
  const deduped = models.filter((m) => {
    const key = m.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: true, models: deduped, modelsUrl };
};

const discoverModels = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
): Promise<DiscoveryResult> => {
  const row = String(body.id || '').startsWith('fallback:')
    ? (await resolveActiveSecret(
      client,
      toText(body.provider, 40).toLowerCase(),
      toText(body.purpose, 60).toLowerCase(),
    )).row
    : await resolveRow(client, body);

  const apiBaseUrl = toText(row.metadata?.apiUrl, 240) || DEFAULT_MODELS_URL[row.provider] || '';
  const baseResult = {
    provider: row.provider,
    purpose: row.purpose,
    apiBaseUrl,
    models: [] as DiscoveredModel[],
    total: 0,
  };

  if (row.status !== 'active') {
    return {
      ok: false,
      status: 'disabled_key',
      message: '该 API Key 已停用，请先启用后再发现模型。',
      modelsUrl: '',
      ...baseResult,
    };
  }
  const supported = ['siliconflow', 'zhipu', 'openrouter', 'custom'];
  if (!supported.includes(row.provider)) {
    return {
      ok: false,
      status: 'unsupported_provider',
      message: `Provider "${row.provider}" 暂不支持模型发现，仅支持 ${supported.join(' / ')}。`,
      modelsUrl: '',
      ...baseResult,
    };
  }

  let apiKey: string;
  try {
    apiKey = row.encrypted_value
      ? await decryptSecret(row.encrypted_value)
      : (await resolveActiveSecret(client, row.provider, row.purpose)).apiKey;
  } catch (e) {
    return {
      ok: false,
      status: 'invalid_key',
      message: `解密 API Key 失败：${e instanceof Error ? e.message : '未知错误'}`,
      modelsUrl: '',
      ...baseResult,
    };
  }

  const result = await discoverProviderModels(
    apiKey,
    row.provider,
    row.metadata || {},
    toText(body.modelsUrl, 240) || undefined,
  );
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.message,
      upstreamStatus: result.upstreamStatus,
      upstreamBodyPreview: result.upstreamBodyPreview,
      modelsUrl: result.modelsUrl,
      ...baseResult,
    };
  }
  return {
    ok: true,
    status: 'success',
    message: `成功获取 ${result.models.length} 个模型。`,
    modelsUrl: result.modelsUrl,
    models: result.models,
    total: result.models.length,
    ...baseResult,
  };
};

const resolveActiveSecret = async (
  client: ReturnType<typeof createServiceClient>,
  provider: string,
  purpose: string,
) => {
  console.log('[vault] resolveActiveSecret called, provider:', provider, 'purpose:', purpose);
  const attemptResolve = async (p: string) => {
    const row = await resolveRow(client, { provider, purpose: p });
    if (row.status !== 'active') throw new Error(`${provider}/${p} API Key 已停用。`);
    return {
      row,
      apiKey: await decryptSecret(row.encrypted_value),
    };
  };
  try {
    return await attemptResolve(purpose);
  } catch (error) {
    // 当 chat purpose 在数据库中未找到时，回退到 default purpose（custom provider 场景：
    // custom provider 的 key 默认 purpose 为 'default'，但 runtime chat 硬编码查找 'chat'）
    if (purpose === 'chat' && String(error?.message || '').includes('未找到')) {
      try {
        console.log('[vault] chat purpose not found, falling back to default purpose');
        return await attemptResolve('default');
      } catch {
        // default 也找不到，继续走环境变量回退
      }
    }
    console.log('[vault] resolveRow failed, trying fallback secrets:', error.message);
    let fallbackKey = '';
    if (provider === 'tavily') {
      fallbackKey = String(Deno.env.get('TAVILY_API_KEY') || '').trim();
    } else if (provider === 'zhipu') {
      fallbackKey = String(Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('BIGMODEL_API_KEY') || '').trim();
    } else if (provider === 'openrouter') {
      fallbackKey = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();
    } else {
      fallbackKey = String(
        (purpose === 'moderation' ? Deno.env.get('MODERATION_API_KEY') : '')
          || Deno.env.get('SILICON_CLOUD_API_KEY')
          || '',
      ).trim();
    }
    console.log('[vault] fallback key found:', fallbackKey ? 'yes (length: ' + fallbackKey.length + ')' : 'no');

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
  policy: RuntimeModelPolicy,
) => {
  const provider = policy.provider;
  const purpose = 'chat';
  const { row, apiKey } = await resolveActiveSecret(client, provider, purpose);
  let defaultApiUrl = 'https://api.siliconflow.cn/v1/chat/completions';
  if (provider === 'zhipu') {
    defaultApiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  } else if (provider === 'openrouter') {
    defaultApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }
  // 安全修复 C-3：对 body.apiUrl（用户可篡改）和 metadata.apiUrl 均做 SSRF 校验，
  // 非法 URL（私有 IP/localhost/非 http 协议）回退到安全默认值。
  const apiUrl = validateRuntimeApiUrl(policy.apiUrl, defaultApiUrl);
  const payload = buildRuntimePayload(body, policy, false);

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
      keyInfo: buildKeyInfo(row),
    };
  }
  return { ok: true, status: response.status, data, keyInfo: buildKeyInfo(row) };
};

const runtimeChatCompletionStream = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
  origin: string | null,
  quota: TokenQuota,
  policy: RuntimeModelPolicy,
) => {
  const provider = policy.provider;
  const purpose = 'chat';
  const { row, apiKey } = await resolveActiveSecret(client, provider, purpose);

  const streamHeaders = {
    ...buildCorsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  let defaultApiUrl = 'https://api.siliconflow.cn/v1/chat/completions';
  if (provider === 'zhipu') {
    defaultApiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  } else if (provider === 'openrouter') {
    defaultApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }
  // 安全修复 C-3：对 body.apiUrl（用户可篡改）和 metadata.apiUrl 均做 SSRF 校验，
  // 非法 URL（私有 IP/localhost/非 http 协议）回退到安全默认值。
  const apiUrl = validateRuntimeApiUrl(policy.apiUrl, defaultApiUrl);
  const payload = {
    ...buildRuntimePayload(body, policy, true),
    ...(provider === 'zhipu' ? {} : {
      stream_options: {
        ...toMetadata(toMetadata(body.payload).stream_options),
        include_usage: true,
      },
    }),
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

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const message = text.slice(0, 500) || `${provider} 流式请求失败：${response.status}`;
    await releaseTokenReservation(client, quota).catch(() => undefined);
    return new Response(
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message, keyInfo: buildKeyInfo(row) })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  if (!response.body) {
    await releaseTokenReservation(client, quota).catch(() => undefined);
    return new Response(
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message: '模型服务未返回可读流。', keyInfo: buildKeyInfo(row) })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  const keyInfoPayload = JSON.stringify({ ok: true, keyInfo: buildKeyInfo(row) });
  const metaEvent = `event: meta\ndata: ${keyInfoPayload}\n\n`;
  const metaEncoder = new TextEncoder();
  let metaFlushed = false;
  const usageDecoder = new TextDecoder();
  let usageBuffer = '';
  let streamedText = '';
  let upstreamUsage: Record<string, unknown> | null = null;
  let usageSettled = false;

  const inspectUsageLines = (chunkText: string, flush = false) => {
    usageBuffer += chunkText;
    const lines = usageBuffer.split(/\r?\n/);
    usageBuffer = flush ? '' : (lines.pop() || '');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payloadText = line.slice(5).trim();
      if (!payloadText || payloadText === '[DONE]') continue;
      try {
        const data = JSON.parse(payloadText) as Record<string, unknown>;
        if (data.usage && typeof data.usage === 'object') {
          upstreamUsage = data.usage as Record<string, unknown>;
        }
        const choices = Array.isArray(data.choices) ? data.choices : [];
        const firstChoice = (choices[0] || {}) as Record<string, unknown>;
        const delta = (firstChoice.delta || {}) as Record<string, unknown>;
        if (delta.content) streamedText += String(delta.content);
      } catch (_error) {
        // Ignore malformed or provider-specific SSE payloads.
      }
    }
  };

  const settleUsage = async (status = 'success') => {
    if (usageSettled) return;
    usageSettled = true;
    inspectUsageLines(usageDecoder.decode(), true);
    const usage = normalizeTokenUsage(upstreamUsage, body, streamedText);
    await logTokenUsage(client, quota, body, usage, status, policy.quotaMultiplier);
  };

  const proxiedStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(metaEncoder.encode(metaEvent));
      metaFlushed = true;
      const reader = response.body!.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              await settleUsage('success').catch((error) => {
                console.error('[vault] token settlement failed:', error);
              });
              controller.close();
              return;
            }
            inspectUsageLines(usageDecoder.decode(value, { stream: true }));
            controller.enqueue(value);
          }
        } catch (err) {
          await settleUsage('partial').catch((error) => {
            console.error('[vault] partial token settlement failed:', error);
          });
          controller.error(err);
        } finally {
          try { reader.releaseLock(); } catch (_e) { /* ignore */ }
        }
      };
      pump();
    },
    async cancel(reason) {
      try { await response.body?.cancel?.(reason); } catch (_e) { /* ignore */ }
      await settleUsage('cancelled').catch((error) => {
        console.error('[vault] cancelled token settlement failed:', error);
      });
    }
  });

  return new Response(proxiedStream, {
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
  const searchDepth = toText(rawPayload.search_depth, 20) || 'advanced';
  const payload: Record<string, unknown> = {
    ...rawPayload,
    api_key: apiKey,
    query: toText(rawPayload.query, 500),
    search_depth: searchDepth,
    max_results: clampInt(rawPayload.max_results, 5, 1, 8),
  };
  // advanced 模式支持 days 参数（限制返回结果的时间范围，提升实时性）
  const days = clampInt(rawPayload.days, 30, 1, 365);
  if (searchDepth === 'advanced' && days > 0) {
    payload.days = days;
  }
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

const runtimeFreeSearch = async (body: Record<string, unknown>) => {
  const rawPayload = toMetadata(body.payload);
  const query = toText(rawPayload.query, 500);
  const searchDepth = toText(rawPayload.search_depth, 20) || 'advanced';
  const maxResults = clampInt(rawPayload.max_results, 5, 1, 8);
  if (!query) throw new Error('搜索关键词不能为空。');

  const response = await fetch('https://searchfree.site/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(clampInt(body.timeoutMs, 25000, 3000, 60000)),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: String(data?.error || data?.message || `Free Search 请求失败：${response.status}`),
      data,
    };
  }
  return { ok: true, status: response.status, data };
};

const runtimeResolveActiveKey = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
) => {
  const provider = toText(body.provider || 'siliconflow', 40).toLowerCase();
  const purpose = toText(body.purpose || 'chat', 60).toLowerCase();
  if (!PROVIDER_OPTIONS.has(provider)) {
    return { ok: false, message: 'Provider 无效。' };
  }
  if (!purpose || !/^[a-z0-9_-]{2,60}$/.test(purpose)) {
    return { ok: false, message: 'Purpose 格式无效。' };
  }
  try {
    const { row } = await resolveActiveSecret(client, provider, purpose);
    return { ok: true, data: { keyInfo: buildKeyInfo(row) } };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '获取当前活跃 Key 失败。',
    };
  }
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
    } else if (row.provider === 'openrouter') {
      message = await testOpenRouter(apiKey, row.metadata || {});
    } else if (row.provider === 'tavily') {
      message = await testTavily(apiKey);
    } else {
      message = '该 Provider 暂未配置真实连通性测试，仅完成了解密校验。';
    }
  } catch (error) {
    status = 'failed';
    message = sanitizeMessage(error instanceof Error ? error.message : '测试失败。');
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
type QuotaPolicy = { tokenLimit: number; webSearchLimit: number };
const QUOTA_CONFIG_CACHE = new Map<string, { policy: QuotaPolicy; fetchedAt: number }>();

// 5 分钟内存缓存：减少 runtime-chat 热路径上的 DB 往返。
// - USER_TIER_CACHE: user_subscriptions 行级数据，按 user_id 索引
// - MODEL_CONFIG_CACHE: bohai_model_configs 原始行（active 状态），按 mode_id 小写索引
// 缓存命中时仍会基于当前 tier 重新计算策略，避免 tier 变更导致越权。
const RUNTIME_CACHE_TTL_MS = 5 * 60_000;
type UserTierRow = { plans: string[] };
const USER_TIER_CACHE = new Map<string, { row: UserTierRow; fetchedAt: number }>();
type ModelConfigRow = Record<string, unknown> & { min_tier?: string };
const MODEL_CONFIG_CACHE = new Map<string, { row: ModelConfigRow; fetchedAt: number }>();

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
};

type TokenQuota = {
  unit: 'tokens';
  allowed: boolean;
  used: number;
  limit: number;
  usedTokens: number;
  tokenLimit: number;
  remainingTokens: number;
  resetAt: string;
  tier: string;
  userId: string | null;
  ipAddress: string | null;
  reservationId?: string;
};

type RuntimeModelPolicy = {
  mode: string;
  provider: string;
  apiUrl: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  quotaMultiplier: number;
};

const TIER_RANK: Record<string, number> = {
  guest: 0,
  free: 1,
  plus: 2,
  pro: 3,
  max: 4,
  ultra: 5,
};

const WEB_SEARCH_DAILY_LIMIT_FALLBACKS: Record<string, number> = {
  guest: 0,
  free: 10,
  plus: 30,
  pro: 60,
  max: 120,
  ultra: 240,
};

// BOH AI Coding 附加包额度加成：与订阅页 CODING_PLANS 文案一致，按 active 订阅叠加。
const CODING_PLAN_BONUSES: Record<string, { tokenBonus: number; webSearchBonus: number }> = {
  'coding-lite': { tokenBonus: 500_000, webSearchBonus: 10 },
  'coding-plus': { tokenBonus: 1_500_000, webSearchBonus: 30 },
  'coding-pro': { tokenBonus: 3_000_000, webSearchBonus: 60 },
  'coding-ultra': { tokenBonus: 6_000_000, webSearchBonus: 120 },
};

const sumCodingBonuses = (plans: Set<string>): { tokenBonus: number; webSearchBonus: number } => {
  let tokenBonus = 0;
  let webSearchBonus = 0;
  for (const code of plans) {
    const bonus = CODING_PLAN_BONUSES[code];
    if (bonus) {
      tokenBonus += bonus.tokenBonus;
      webSearchBonus += bonus.webSearchBonus;
    }
  }
  return { tokenBonus, webSearchBonus };
};

// Coding 附加包档位：用于 min_tier 为 coding 计划码时的模式访问门槛校验。
const CODING_PLAN_RANK: Record<string, number> = {
  'coding-lite': 1,
  'coding-plus': 2,
  'coding-pro': 3,
  'coding-ultra': 4,
};

const getCodingPlanRank = (plans: Set<string>): number => {
  let rank = 0;
  for (const code of plans) {
    const r = CODING_PLAN_RANK[code];
    if (r !== undefined && r > rank) rank = r;
  }
  return rank;
};

const TIER_MAX_OUTPUT_TOKENS: Record<string, number> = {
  free: 1200,
  plus: 1800,
  pro: 2400,
  max: 4096,
  ultra: 4096,
};

// Model mode IDs are billing classes, independent from the user's subscription tier.
// Keep these integer multipliers aligned with get_ai_mode_token_multiplier() in the
// database migration so reservations and final settlements charge the same amount.
const MODE_TOKEN_MULTIPLIERS: Record<string, number> = {
  pro: 2,
  max: 3,
  ultra: 4,
};

const normalizeModeId = (mode: unknown): string => toText(mode, 80).toLowerCase();
const getModeTokenMultiplier = (mode: unknown): number => (
  MODE_TOKEN_MULTIPLIERS[normalizeModeId(mode)] || 1
);
const normalizeQuotaMultiplier = (value: unknown, mode: unknown): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 100) return parsed;
  return getModeTokenMultiplier(mode);
};
const getBilledTokenCountForMultiplier = (tokens: number, multiplier: unknown): number => Math.min(
  2_147_483_647,
  Math.max(0, Math.ceil(Number(tokens || 0) * normalizeQuotaMultiplier(multiplier, ''))),
);

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

async function resolveUserPlans(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set();
  // 5 分钟内存缓存：订阅变更（升级/降级）最多延迟 5 分钟生效，可接受。
  // 注意：缓存的是 plan_code 列表，过期判断（expires_at > now）在每次调用时重新计算。
  const cached = USER_TIER_CACHE.get(userId);
  let plans: Set<string>;
  if (cached && Date.now() - cached.fetchedAt < RUNTIME_CACHE_TTL_MS) {
    plans = new Set(cached.row.plans);
  } else {
    const { data } = await client
      .from('user_subscriptions')
      .select('plan_code, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active');
    const nowIso = new Date().toISOString();
    const activePlans = (data || [])
      .filter((r: Record<string, unknown>) => String(r.expires_at || '') > nowIso)
      .map((r: Record<string, unknown>) => String(r.plan_code || ''));
    USER_TIER_CACHE.set(userId, { row: { plans: activePlans }, fetchedAt: Date.now() });
    plans = new Set(activePlans);
  }
  return plans;
}

async function resolveUserTier(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
): Promise<string> {
  if (!userId) return 'guest';
  const plans = await resolveUserPlans(client, userId);
  if (plans.has('ultra')) return 'ultra';
  if (plans.has('max') || plans.has('boh-max')) return 'max';
  if (plans.has('pro') || plans.has('boh-pro')) return 'pro';
  if (plans.has('plus') || plans.has('boh-ai-plus')) return 'plus';
  return 'free';
}

const normalizeTier = (tier: string) => (TIER_RANK[tier] === undefined ? 'free' : tier);

const tierAllows = (tier: string, requiredTier: string) => (
  (TIER_RANK[normalizeTier(tier)] || 0) >= (TIER_RANK[normalizeTier(requiredTier)] || 0)
);

const runtimeAccessError = (message: string, status = 403, code = 'RUNTIME_ACCESS_DENIED') => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

async function resolveRuntimeModelPolicy(
  client: ReturnType<typeof createServiceClient>,
  requestedMode: string,
  tier: string,
  userId: string | null,
): Promise<RuntimeModelPolicy> {
  const mode = normalizeModeId(requestedMode) || 'fast';
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(mode)) {
    throw runtimeAccessError('模式 ID 格式无效。', 400, 'MODE_ID_INVALID');
  }
  // 5 分钟内存缓存：模式配置是低频变更的元数据，缓存原始行数据。
  // tier 检查仍每次执行，确保用户降级后立即被拦截。
  const cacheKey = mode.toLowerCase();
  const cached = MODEL_CONFIG_CACHE.get(cacheKey);
  let data: ModelConfigRow | null = null;
  if (cached && Date.now() - cached.fetchedAt < RUNTIME_CACHE_TTL_MS) {
    data = cached.row;
  } else {
    const { data: dbData, error } = await client
      .from('bohai_model_configs')
      .select('mode_id, provider, model_id, api_url, max_tokens, temperature, top_p, frequency_penalty, quota_multiplier, status, min_tier')
      .ilike('mode_id', mode)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !dbData) {
      // 缓存未命中且 DB 查询失败，清理可能存在的旧缓存避免脏数据。
      MODEL_CONFIG_CACHE.delete(cacheKey);
      throw runtimeAccessError('当前模式暂不可用，请重新选择。', 400, 'MODE_UNAVAILABLE');
    }
    data = dbData as ModelConfigRow;
    MODEL_CONFIG_CACHE.set(cacheKey, { row: data, fetchedAt: Date.now() });
  }

  const minTier = toText(data.min_tier, 'free').toLowerCase();
  const codingRank = CODING_PLAN_RANK[minTier];
  if (codingRank !== undefined) {
    if (getCodingPlanRank(await resolveUserPlans(client, userId)) < codingRank) {
      throw runtimeAccessError('当前订阅暂不支持此 Coding 模式，请订阅对应的 Coding 附加包后重试。');
    }
  } else {
    const requiredTier = normalizeTier(minTier);
    if (!tierAllows(tier, requiredTier)) {
      throw runtimeAccessError('当前订阅暂不支持此模式，请升级后重试。');
    }
  }

  const provider = toText(data.provider, 'siliconflow').toLowerCase();
  if (!PROVIDER_OPTIONS.has(provider) || provider === 'tavily') {
    throw runtimeAccessError('当前模式配置无效，请联系管理员。', 500, 'MODE_CONFIG_INVALID');
  }
  return {
    mode: normalizeModeId(String(data.mode_id || '')),
    provider,
    modelId: toText(data.model_id, 120),
    apiUrl: toText(data.api_url, 240),
    maxTokens: Math.min(
      clampInt(data.max_tokens, 1200, 1, 4096),
      TIER_MAX_OUTPUT_TOKENS[normalizeTier(tier)] || TIER_MAX_OUTPUT_TOKENS.free,
    ),
    temperature: Number(data.temperature ?? 0.2),
    topP: Number(data.top_p ?? 0.75),
    frequencyPenalty: Number(data.frequency_penalty ?? 0.06),
    quotaMultiplier: normalizeQuotaMultiplier(data.quota_multiplier, data.mode_id),
  };
}

const buildRuntimePayload = (body: Record<string, unknown>, policy: RuntimeModelPolicy, stream: boolean) => {
  const rawPayload = toMetadata(body.payload);
  return {
    ...rawPayload,
    model: policy.modelId,
    stream,
    max_tokens: policy.maxTokens,
    temperature: policy.temperature,
    top_p: policy.topP,
    frequency_penalty: policy.frequencyPenalty,
  };
};

async function getQuotaPolicy(
  client: ReturnType<typeof createServiceClient>,
  tier: string,
): Promise<QuotaPolicy> {
  const cached = QUOTA_CONFIG_CACHE.get(tier);
  if (cached && Date.now() - cached.fetchedAt < QUOTA_CACHE_TTL_MS) {
    return cached.policy;
  }
  const { data, error } = await client
    .from('ai_quota_config')
    .select('daily_token_limit, web_search_daily_limit')
    .eq('tier', tier)
    .maybeSingle();
  let tokenLimit = Number(data?.daily_token_limit ?? 0);
  let webSearchLimit = Number(data?.web_search_daily_limit ?? WEB_SEARCH_DAILY_LIMIT_FALLBACKS[tier] ?? 0);
  if (error) {
    // Deployment-order fallback while the migration and function roll out.
    const legacy = await client
      .from('ai_quota_config')
      .select('daily_limit')
      .eq('tier', tier)
      .maybeSingle();
    const legacyLimit = Number(legacy.data?.daily_limit ?? 0);
    tokenLimit = legacyLimit === -1 ? -1 : Math.max(0, legacyLimit * 10000);
    webSearchLimit = WEB_SEARCH_DAILY_LIMIT_FALLBACKS[tier] ?? 0;
  }
  const policy = { tokenLimit, webSearchLimit };
  QUOTA_CONFIG_CACHE.set(tier, { policy, fetchedAt: Date.now() });
  return policy;
}

async function countTodayWebSearchUsage(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
): Promise<number> {
  if (!userId) return 0;
  const { count, error } = await client
    .from('ai_web_search_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', getBeijingTodayStartUTC())
    .in('status', ['pending', 'success']);
  if (error) return 0;
  return Math.max(0, Number(count || 0));
}

async function countTodayTokenUsage(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
  ipAddress: string | null,
): Promise<number> {
  const todayStart = getBeijingTodayStartUTC();
  const { data, error } = await client.rpc('get_ai_token_usage_since', {
    p_user_id: userId,
    p_ip_address: ipAddress,
    p_since: todayStart,
  });
  if (!error) return Math.max(0, Number(data || 0));

  // Migration-order fallback. Old rows have no token value and therefore do
  // not consume the new allowance during the transition day.
  let query = client
    .from('ai_quota_log')
    .select('billed_tokens')
    .gte('created_at', todayStart);
  if (userId) query = query.eq('user_id', userId);
  else if (ipAddress) query = query.eq('ip_address', ipAddress);
  const fallback = await query;
  return (fallback.data || []).reduce(
    (sum: number, row: Record<string, unknown>) => sum + Math.max(0, Number(row.billed_tokens || 0)),
    0,
  );
}

const estimateTextTokens = (value: unknown): number => {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (!text) return 0;
  const cjkCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const otherCount = Math.max(0, text.length - cjkCount);
  return cjkCount + Math.ceil(otherCount / 4);
};

const estimatePromptTokens = (body: Record<string, unknown>): number => {
  const payload = (body.payload || {}) as Record<string, unknown>;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.reduce((sum: number, message: unknown) => {
    const row = (message || {}) as Record<string, unknown>;
    return sum + 4 + estimateTextTokens(row.content || '');
  }, 2);
};

const normalizeTokenUsage = (
  rawUsage: Record<string, unknown> | null | undefined,
  body: Record<string, unknown>,
  completionText = '',
): TokenUsage => {
  const promptTokens = Math.max(0, clampInt(
    rawUsage?.prompt_tokens ?? rawUsage?.input_tokens,
    estimatePromptTokens(body),
    0,
    10_000_000,
  ));
  const completionTokens = Math.max(0, clampInt(
    rawUsage?.completion_tokens ?? rawUsage?.output_tokens,
    estimateTextTokens(completionText),
    0,
    10_000_000,
  ));
  const suppliedTotal = Number(rawUsage?.total_tokens);
  const totalTokens = Number.isFinite(suppliedTotal) && suppliedTotal >= 0
    ? Math.trunc(suppliedTotal)
    : promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(totalTokens, promptTokens + completionTokens),
    estimated: !rawUsage || !Number.isFinite(Number(rawUsage.total_tokens)),
  };
};

async function logTokenUsage(
  client: ReturnType<typeof createServiceClient>,
  quota: TokenQuota,
  body: Record<string, unknown>,
  usage: TokenUsage,
  status = 'success',
  quotaMultiplier = 1,
): Promise<void> {
  if (quota.reservationId) {
    const payload = (body.payload || {}) as Record<string, unknown>;
    const { error } = await client.rpc('settle_ai_token_quota', {
      p_reservation_id: quota.reservationId,
      p_prompt_tokens: usage.promptTokens,
      p_completion_tokens: usage.completionTokens,
      p_total_tokens: usage.totalTokens,
      p_model: String(payload.model || ''),
      p_mode: String(body.mode || ''),
      p_status: usage.estimated ? `${status}_estimated` : status,
    });
    if (error) throw error;
    return;
  }
  const payload = (body.payload || {}) as Record<string, unknown>;
  await client.from('ai_quota_log').insert([{
    user_id: quota.userId,
    ip_address: quota.ipAddress,
    model: String(payload.model || ''),
    mode: String(body.mode || ''),
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    billed_tokens: getBilledTokenCountForMultiplier(usage.totalTokens, quotaMultiplier),
    status: usage.estimated ? `${status}_estimated` : status,
    created_at: new Date().toISOString(),
  }]);
}

async function releaseTokenReservation(
  client: ReturnType<typeof createServiceClient>,
  quota: TokenQuota,
): Promise<void> {
  if (!quota.reservationId) return;
  const { error } = await client.rpc('release_ai_token_quota', {
    p_reservation_id: quota.reservationId,
  });
  if (error) throw error;
}

async function reserveTokenQuota(
  client: ReturnType<typeof createServiceClient>,
  quota: TokenQuota,
  body: Record<string, unknown>,
  maxOutputTokens: number,
  quotaMultiplier: number,
): Promise<TokenQuota> {
  if (quota.tokenLimit === -1) return quota;
  const reservationId = crypto.randomUUID();
  const rawReserveTokens = Math.max(1, estimatePromptTokens(body) + Math.max(1, maxOutputTokens));
  const reserveTokens = getBilledTokenCountForMultiplier(rawReserveTokens, quotaMultiplier);
  const { data, error } = await client.rpc('reserve_ai_token_quota', {
    p_reservation_id: reservationId,
    p_user_id: quota.userId,
    p_ip_address: quota.ipAddress,
    p_since: getBeijingTodayStartUTC(),
    p_token_limit: quota.tokenLimit,
    p_reserved_tokens: reserveTokens,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.allowed) {
    return { ...quota, allowed: false, remainingTokens: Math.max(0, Number(row?.remaining_tokens || 0)) };
  }
  return {
    ...quota,
    reservationId,
    remainingTokens: Math.max(0, Number(row.remaining_tokens || 0)),
  };
}

async function checkTokenQuota(
  client: ReturnType<typeof createServiceClient>,
  request: Request,
  preResolved?: { userId: string | null; ipAddress: string | null; tier: string },
): Promise<TokenQuota> {
  // P1-5: runtime-chat 热路径已由 resolveRuntimeIdentity 解析过身份与 tier，
  // 此处复用预解析结果，避免重复调用 auth.getUser（每次约 30-80ms 网络往返）。
  let userId: string | null = preResolved?.userId ?? null;
  let ipAddress: string | null = preResolved?.ipAddress ?? null;
  let tier: string = preResolved?.tier ?? 'guest';

  if (!preResolved) {
    const token = getBearerToken(request);
    if (token) {
      const { data: userData } = await client.auth.getUser(token).catch(() => ({ data: null }));
      userId = userData?.user?.id || null;
    }
    if (!userId) {
      ipAddress = getClientIp(request);
    }
    tier = await resolveUserTier(client, userId);
  }

  const policy = await getQuotaPolicy(client, tier);
  let tokenLimit = policy.tokenLimit;
  if (userId && tokenLimit !== -1) {
    const bonuses = sumCodingBonuses(await resolveUserPlans(client, userId));
    tokenLimit += bonuses.tokenBonus;
  }
  const usedTokens = tokenLimit === -1 ? 0 : await countTodayTokenUsage(client, userId, ipAddress);
  const remainingTokens = tokenLimit === -1 ? -1 : Math.max(0, tokenLimit - usedTokens);
  return {
    unit: 'tokens',
    allowed: tokenLimit === -1 || remainingTokens > 0,
    used: usedTokens,
    limit: tokenLimit,
    usedTokens,
    tokenLimit,
    remainingTokens,
    resetAt: tokenLimit === -1 ? '' : getTomorrowBeijingStartUTC(),
    tier,
    userId,
    ipAddress,
  };
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
    ipAddress = getClientIp(request);
  }

  const tier = await resolveUserTier(client, userId);
  const policy = await getQuotaPolicy(client, tier);
  let tokenLimit = policy.tokenLimit;
  let webSearchLimit = policy.webSearchLimit;
  if (userId) {
    const bonuses = sumCodingBonuses(await resolveUserPlans(client, userId));
    if (tokenLimit !== -1) tokenLimit += bonuses.tokenBonus;
    if (webSearchLimit !== -1) webSearchLimit += bonuses.webSearchBonus;
  }
  const usedTokens = tokenLimit === -1 ? 0 : await countTodayTokenUsage(client, userId, ipAddress);
  const remainingTokens = tokenLimit === -1 ? -1 : Math.max(0, tokenLimit - usedTokens);
  const webSearchUsed = webSearchLimit === -1 ? 0 : await countTodayWebSearchUsage(client, userId);
  const webSearchRemaining = webSearchLimit === -1 ? -1 : Math.max(0, webSearchLimit - webSearchUsed);

  return {
    unit: 'tokens',
    tier,
    used: usedTokens,
    limit: tokenLimit,
    usedTokens,
    tokenLimit,
    remainingTokens,
    webSearchUsed,
    webSearchLimit,
    webSearchRemaining,
    resetAt: tokenLimit === -1 ? '' : getTomorrowBeijingStartUTC(),
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  console.log('[vault] request started, method:', request.method, 'origin:', origin);
  
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    console.log('[vault] method not allowed');
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  try {
    const client = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const action = toText(body.action || 'list', 30);
    console.log('[vault] action:', action, 'provider:', body.provider, 'purpose:', body.purpose);

    if (action === 'runtime-chat') {
      const identity = await resolveRuntimeIdentity(request, client);
      // M-6 修复：服务端短期速率限制（每用户每分钟 10 次），防止客户端限流被绕过
      const rateKey = `ai_chat_rt:${identity.userId || `guest:${identity.ipAddress}`}`;
      const rate = await checkRateLimitDb(rateKey, 10, 60_000);
      if (!rate.ok) {
        return jsonResponse({ ok: false, status: 429, code: 'RATE_LIMITED', message: `请求过于频繁，请 ${rate.retryAfter} 秒后再试。` }, 429, origin);
      }
      const tier = identity.tier;
      const policy = await resolveRuntimeModelPolicy(client, toText(body.mode, 80), tier, identity.userId);
      console.log('[vault] user auth ok, checking token quota');
      // P1-5: 复用 identity 避免重复 auth.getUser 往返
      let quota = await checkTokenQuota(client, request, { userId: identity.userId, ipAddress: identity.ipAddress, tier });
      quota = await reserveTokenQuota(client, quota, body, policy.maxTokens, policy.quotaMultiplier);
      if (!quota.allowed) {
        console.log('[vault] quota exceeded');
        return jsonResponse({ ok: false, status: 429, data: { quota }, message: '今日 BOH AI Token 额度已用完，明天 0:00 重置' }, 429, origin);
      }
      console.log('[vault] calling runtimeChatCompletion');
      let result;
      try {
        result = await runtimeChatCompletion(client, body, policy);
        if (result.ok) {
          const responseData = (result.data || {}) as Record<string, unknown>;
          const choices = Array.isArray(responseData.choices) ? responseData.choices : [];
          const firstChoice = (choices[0] || {}) as Record<string, unknown>;
          const message = (firstChoice.message || {}) as Record<string, unknown>;
          const usage = normalizeTokenUsage(
            responseData.usage as Record<string, unknown> | undefined,
            { ...body, mode: policy.mode, payload: buildRuntimePayload(body, policy, false) },
            String(message.content || ''),
          );
          await logTokenUsage(
            client,
            quota,
            { ...body, mode: policy.mode, payload: buildRuntimePayload(body, policy, false) },
            usage,
            'success',
            policy.quotaMultiplier,
          );
        } else {
          await releaseTokenReservation(client, quota);
        }
      } catch (error) {
        await releaseTokenReservation(client, quota).catch(() => undefined);
        throw error;
      }
      console.log('[vault] runtimeChatCompletion result:', result.ok ? 'ok' : 'failed', result.message || '');
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'runtime-chat-stream') {
      const identity = await resolveRuntimeIdentity(request, client);
      // M-6 修复：服务端短期速率限制（每用户每分钟 10 次）
      const rateKey = `ai_chat_rt:${identity.userId || `guest:${identity.ipAddress}`}`;
      const rate = await checkRateLimitDb(rateKey, 10, 60_000);
      if (!rate.ok) {
        return jsonResponse({ ok: false, status: 429, code: 'RATE_LIMITED', message: `请求过于频繁，请 ${rate.retryAfter} 秒后再试。` }, 429, origin);
      }
      const tier = identity.tier;
      const policy = await resolveRuntimeModelPolicy(client, toText(body.mode, 80), tier, identity.userId);
      // P1-5: 复用 identity 避免重复 auth.getUser 往返
      let quota = await checkTokenQuota(client, request, { userId: identity.userId, ipAddress: identity.ipAddress, tier });
      quota = await reserveTokenQuota(client, quota, body, policy.maxTokens, policy.quotaMultiplier);
      if (!quota.allowed) {
        console.log('[vault] quota exceeded');
        return jsonResponse({ ok: false, status: 429, data: { quota }, message: '今日 BOH AI Token 额度已用完，明天 0:00 重置' }, 429, origin);
      }
      console.log('[vault] calling runtimeChatCompletionStream');
      try {
        return await runtimeChatCompletionStream(
          client,
          { ...body, mode: policy.mode, payload: buildRuntimePayload(body, policy, true) },
          origin,
          quota,
          policy,
        );
      } catch (error) {
        await releaseTokenReservation(client, quota).catch(() => undefined);
        throw error;
      }
    }
    if (action === 'runtime-search') {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse({ ok: false, code: user.code, message: user.message }, user.status, origin);
      }
      const tier = await resolveUserTier(client, user.userId);
      const searchRate = await checkRateLimitDb(`ai_web_rt:${user.userId}`, 6, 60_000);
      if (!searchRate.ok) {
        return jsonResponse({ ok: false, code: 'SEARCH_RATE_LIMITED', message: `联网搜索过于频繁，请 ${searchRate.retryAfter} 秒后再试。` }, 429, origin);
      }
      let dailyLimit = (await getQuotaPolicy(client, tier)).webSearchLimit;
      if (dailyLimit !== -1) {
        const bonuses = sumCodingBonuses(await resolveUserPlans(client, user.userId));
        dailyLimit += bonuses.webSearchBonus;
      }
      if (dailyLimit === 0) {
        return jsonResponse({ ok: false, code: 'SEARCH_DAILY_LIMIT', message: '当前订阅暂不支持联网搜索。' }, 429, origin);
      }
      if (dailyLimit === -1) {
        const result = await runtimeTavilySearch(client, body);
        return jsonResponse(result, result.ok ? 200 : 502, origin);
      }
      const { data: reservation, error: reservationError } = await client.rpc('reserve_ai_web_search', {
        p_user_id: user.userId,
        p_tier: tier,
        p_daily_limit: dailyLimit,
        p_since: getBeijingTodayStartUTC(),
      });
      if (reservationError) throw reservationError;
      const searchReservation = Array.isArray(reservation) ? reservation[0] : null;
      if (!searchReservation?.allowed) {
        return jsonResponse({ ok: false, code: 'SEARCH_DAILY_LIMIT', message: '今日联网搜索额度已用完，明天 0:00 重置。' }, 429, origin);
      }
      try {
        const result = await runtimeTavilySearch(client, body);
        await client.rpc('settle_ai_web_search', {
          p_request_id: searchReservation.request_id,
          p_status: result.ok ? 'success' : 'failed',
        });
        return jsonResponse(result, result.ok ? 200 : 502, origin);
      } catch (error) {
        try {
          await client.rpc('settle_ai_web_search', {
            p_request_id: searchReservation.request_id,
            p_status: 'failed',
          });
        } catch (_settleError) {
          // The stale pending row expires automatically on the next reservation.
        }
        throw error;
      }
    }
    if (action === 'runtime-free-search') {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse({ ok: false, code: user.code, message: user.message }, user.status, origin);
      }
      const result = await runtimeFreeSearch(body);
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'runtime-resolve') {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse({ ok: false, code: user.code, message: user.message }, user.status, origin);
      }
      const result = await runtimeResolveActiveKey(client, body);
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'quota-status') {
      const data = await handleQuotaStatus(client, request);
      return jsonResponse({ ok: true, data }, 200, origin);
    }
    if (action === 'clear-user-tier-cache') {
      const targetUserId = String(body?.targetUserId || '').trim();
      if (targetUserId) {
        const admin = await requireAdmin(request, client);
        if (!admin.ok) {
          return jsonResponse({ ok: false, code: admin.code, message: admin.message }, admin.status, origin);
        }
        const cleared = USER_TIER_CACHE.delete(targetUserId);
        console.log(`[vault] user tier cache cleared for target ${targetUserId} by admin ${admin.userId}, wasCached=${cleared}`);
        return jsonResponse({ ok: true, data: { cleared } }, 200, origin);
      }
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse({ ok: false, code: user.code, message: user.message }, user.status, origin);
      }
      const cleared = USER_TIER_CACHE.delete(user.userId);
      console.log(`[vault] user tier cache cleared for ${user.userId}, wasCached=${cleared}`);
      return jsonResponse({ ok: true, data: { cleared } }, 200, origin);
    }

    const admin = await requireAdmin(request, client);
    if (!admin.ok) {
      return jsonResponse({ ok: false, code: admin.code, message: admin.message }, admin.status, origin);
    }

    // 清除模型配置内存缓存：管理员在数据面板修改模型配置后调用，使新配置立即生效
    if (action === 'clear-model-cache') {
      const before = MODEL_CONFIG_CACHE.size;
      MODEL_CONFIG_CACHE.clear();
      console.log(`[vault] model config cache cleared by admin, removed ${before} entries`);
      return jsonResponse({ ok: true, data: { cleared: before } }, 200, origin);
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
    if (action === 'delete') {
      return jsonResponse({ ok: true, data: await deleteKey(client, admin.userId, body) }, 200, origin);
    }
    if (action === 'test') {
      return jsonResponse({ ok: true, data: await testKey(client, admin.userId, body) }, 200, origin);
    }
    if (action === 'discover-models') {
      return jsonResponse({ ok: true, data: await discoverModels(client, body) }, 200, origin);
    }

    return jsonResponse({ ok: false, code: 'UNKNOWN_ACTION', message: '未知操作。' }, 400, origin);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'API Key 管理服务异常。';
    const status = Math.min(599, Math.max(400, Number((error as { status?: number })?.status || 500)));
    const code = toText((error as { code?: string })?.code, 80) || 'API_KEY_VAULT_ERROR';
    return jsonResponse(
      {
        ok: false,
        code,
        message: sanitizeMessage(rawMessage),
      },
      status,
      origin,
    );
  }
});
