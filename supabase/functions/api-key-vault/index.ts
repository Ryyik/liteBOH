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
// M3: 日志开关，仅在显式启用时输出敏感调试信息，避免生产环境泄露密钥元信息
const DEBUG = Deno.env.get('VAULT_DEBUG') === 'true';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const PROVIDER_OPTIONS = new Set([
  'siliconflow',
  'zhipu',
  'openrouter',
  'tavily',
  'cloudinary',
  'turnstile',
  'custom',
]);
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
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    TEXT_ENCODER.encode(value),
  );
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
    return {
      ok: false as const,
      status: 401,
      code: 'INVALID_SESSION',
      message: '登录状态已失效。',
    };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || String(profile?.role || '').trim() !== 'admin') {
    return {
      ok: false as const,
      status: 403,
      code: 'FORBIDDEN',
      message: '仅管理员可管理 API Key。',
    };
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
    return {
      ok: false as const,
      status: 401,
      code: 'INVALID_SESSION',
      message: '登录状态已失效。',
    };
  }

  return { ok: true as const, userId };
};

const getClientIp = (request: Request) => {
  // L16: cf-connecting-ip 由网关设置最可信；x-real-ip 次之。
  // x-forwarded-for 取最后一跳（由可信代理追加，比首段更难被客户端伪造）。
  // 注意：Guest 用户按 IP 计量额度，仍可能被代理池轮换 IP 绕过，
  // 该问题需结合 C 段限额 / 设备指纹等风控进一步治理，此处仅作 IP 取值加固。
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
};

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
  readonly: Boolean(row.readonly),
});

const writeAuditLog = async (
  client: ReturnType<typeof createServiceClient>,
  actorId: string,
  action: string,
  row: Partial<VaultRow> = {},
  metadata: Record<string, unknown> = {},
) => {
  await client.from('api_key_vault_audit_logs').insert([
    {
      vault_id: row.id || null,
      actor_id: actorId,
      action,
      provider: row.provider || '',
      purpose: row.purpose || '',
      metadata,
    },
  ]);
};

const selectColumns =
  'id, provider, purpose, label, encrypted_value, masked_value, status, metadata, last_test_status, last_test_message, last_tested_at, updated_at, created_at';

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
  const zhipuFallback = String(
    Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('BIGMODEL_API_KEY') || '',
  ).trim();
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

  return [...rows, ...fallbackRows.map((row) => sanitizeRow(row))];
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
  if (!purpose || !/^[a-z0-9_-]{2,60}$/.test(purpose))
    throw new Error('Purpose 只能包含小写字母、数字、下划线和短横线。');
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
  await writeAuditLog(client, actorId, 'upsert', data as VaultRow, {
    label: payload.label,
    status,
  });
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

const resolveRow = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
) => {
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
  const apiUrl = validateRuntimeApiUrl(
    toText(metadata.apiUrl, 240),
    'https://api.siliconflow.cn/v1/chat/completions',
  );
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
    throw new Error(
      String(payload?.error?.message || payload?.message || `HTTP ${response.status}`),
    );
  }
  return 'SiliconFlow 连接正常。';
};

const testZhipu = async (apiKey: string, metadata: Record<string, unknown>) => {
  // 安全修复 C-3：校验 apiUrl 防止 SSRF
  const apiUrl = validateRuntimeApiUrl(
    toText(metadata.apiUrl, 240),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  );
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
    throw new Error(
      String(payload?.error?.message || payload?.message || `HTTP ${response.status}`),
    );
  }
  return '智谱 AI 连接正常。';
};

const testOpenRouter = async (apiKey: string, metadata: Record<string, unknown>) => {
  const apiUrl = validateRuntimeApiUrl(
    toText(metadata.apiUrl, 240),
    'https://openrouter.ai/api/v1/chat/completions',
  );
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
    throw new Error(
      String(payload?.error?.message || payload?.message || `HTTP ${response.status}`),
    );
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
  status:
    | 'success'
    | 'fetch_failed'
    | 'parse_failed'
    | 'not_configured'
    | 'invalid_key'
    | 'unsupported_provider'
    | 'disabled_key';
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
): Promise<
  | { ok: true; models: DiscoveredModel[]; modelsUrl: string }
  | {
      ok: false;
      status: DiscoveryResult['status'];
      message: string;
      upstreamStatus?: number;
      upstreamBodyPreview?: string;
      modelsUrl: string;
    }
> => {
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
    } catch {
      /* 非 JSON 响应，直接走 HTTP 状态码 */
    }
    const status: DiscoveryResult['status'] =
      response.status === 401 || response.status === 403 ? 'invalid_key' : 'fetch_failed';
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
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: unknown[] }).data
      : [];
  const models: DiscoveredModel[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const id = toText((item as { id?: unknown }).id, 200);
    if (!id) continue;
    models.push({
      id,
      name:
        toText(
          (item as { name?: unknown; id?: unknown }).name || (item as { id?: unknown }).id,
          200,
        ) || undefined,
      owned_by:
        toText(
          (item as { owned_by?: unknown; owner?: unknown }).owned_by ||
            (item as { owner?: unknown }).owner,
          120,
        ) || undefined,
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
    ? (
        await resolveActiveSecret(
          client,
          toText(body.provider, 40).toLowerCase(),
          toText(body.purpose, 60).toLowerCase(),
        )
      ).row
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
  if (DEBUG)
    console.log(
      '[vault] resolveActiveSecret called, provider:',
      provider?.slice(0, 2) + '***',
      'purpose:',
      purpose?.slice(0, 2) + '***',
    );
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
        if (DEBUG) console.log('[vault] chat purpose not found, falling back to default purpose');
        return await attemptResolve('default');
      } catch {
        // default 也找不到，继续走环境变量回退
      }
    }
    if (DEBUG) console.log('[vault] resolveRow failed, trying fallback secrets:', error?.message);
    let fallbackKey = '';
    if (provider === 'tavily') {
      fallbackKey = String(Deno.env.get('TAVILY_API_KEY') || '').trim();
    } else if (provider === 'zhipu') {
      fallbackKey = String(
        Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('BIGMODEL_API_KEY') || '',
      ).trim();
    } else if (provider === 'openrouter') {
      fallbackKey = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();
    } else {
      fallbackKey = String(
        (purpose === 'moderation' ? Deno.env.get('MODERATION_API_KEY') : '') ||
          Deno.env.get('SILICON_CLOUD_API_KEY') ||
          '',
      ).trim();
    }
    if (DEBUG) console.log('[vault] fallback key found:', fallbackKey ? 'yes' : 'no');

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

/** 小数版 clampInt（BYOK 的 temperature 用）：null / '' / NaN 一律回退到 fallback。 */
const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

/**
 * 取本次对话要用的 API Key。
 * • 官方模式：从全局 vault 按 provider/purpose 查（站方的 Key）
 * • BYOK：用**用户自己的** Key（策略阶段已解密），绝不查 vault ——
 *   否则会变成「拿站方的 Key 打用户自己的端点」，而且 vault 里根本没有 byok 这个 provider。
 */
const resolveChatSecret = async (
  client: ReturnType<typeof createServiceClient>,
  provider: string,
  purpose: string,
  policy: RuntimeModelPolicy,
) => {
  if (policy.byok) {
    return { row: null as VaultRow | null, apiKey: String(policy.apiKey || '') };
  }
  return resolveActiveSecret(client, provider, purpose);
};

/** keyInfo 回给前端展示「当前在用哪个 Key」；BYOK 没有 vault 行，用端点名合成一份。 */
const buildChatKeyInfo = (row: VaultRow | null, policy: RuntimeModelPolicy) =>
  row
    ? buildKeyInfo(row)
    : {
        id: '',
        provider: 'byok',
        purpose: 'chat',
        label: policy.keyLabel || '自有 Key',
        maskedValue: '自备',
        source: 'user_endpoint',
        readonly: true,
      };

const runtimeChatCompletion = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
  policy: RuntimeModelPolicy,
) => {
  const provider = policy.provider;
  const purpose = 'chat';
  const { row, apiKey } = await resolveChatSecret(client, provider, purpose, policy);
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
      message: String(
        data?.error?.message || data?.message || `${provider} 请求失败：${response.status}`,
      ),
      data,
      keyInfo: buildChatKeyInfo(row, policy),
    };
  }
  return { ok: true, status: response.status, data, keyInfo: buildChatKeyInfo(row, policy) };
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
  const { row, apiKey } = await resolveChatSecret(client, provider, purpose, policy);

  const streamHeaders = {
    ...buildCorsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
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
    // ⚠️ BYOK 也要跳过 stream_options：用户端点多半是 OpenAI 兼容的**中转站/自建反代**，
    //    未必认识这个字段（不认识就 400，用户只会看到「模型请求失败」）。
    //    代价是拿不到上游 usage —— 但 BYOK 本来就不记账，用量精度无所谓。
    ...(provider === 'zhipu' || policy.byok
      ? {}
      : {
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
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message, keyInfo: buildChatKeyInfo(row, policy) })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  if (!response.body) {
    await releaseTokenReservation(client, quota).catch(() => undefined);
    return new Response(
      `event: error\ndata: ${JSON.stringify({ ok: false, status: response.status, message: '模型服务未返回可读流。', keyInfo: buildChatKeyInfo(row, policy) })}\n\n`,
      { status: 502, headers: streamHeaders },
    );
  }

  const keyInfoPayload = JSON.stringify({ ok: true, keyInfo: buildChatKeyInfo(row, policy) });
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
    usageBuffer = flush ? '' : lines.pop() || '';
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
          try {
            reader.releaseLock();
          } catch (_e) {
            /* ignore */
          }
        }
      };
      pump();
    },
    async cancel(reason) {
      try {
        await response.body?.cancel?.(reason);
      } catch (_e) {
        /* ignore */
      }
      await settleUsage('cancelled').catch((error) => {
        console.error('[vault] cancelled token settlement failed:', error);
      });
    },
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

// 计量搜索公共 core：限流 → 档位限额（含 Coding 附加包加成）→ reserve → 执行搜索 → settle。
// runtime-search（Tavily 付费 key）与 runtime-free-search（免费搜索代理）共用同一套计量，
// 差异只在执行器。⚠️ 2026-10-02 之前 free-search 分支从不写 ai_web_search_log，
// 额度面板「联网搜索次数」恒 0（UI 承诺限额但实现从不计量）——本函数即该断链的修复。
const runMeteredWebSearch = async ({
  client,
  userId,
  body,
  executor,
  origin,
}: {
  client: ReturnType<typeof createServiceClient>;
  userId: string;
  body: Record<string, unknown>;
  executor: (b: Record<string, unknown>) => Promise<{ ok: boolean }>;
  origin: string | null;
}): Promise<Response> => {
  const tier = await resolveUserTier(client, userId);
  const searchRate = await checkRateLimitDb(`ai_web_rt:${userId}`, 6, 60_000);
  if (!searchRate.ok) {
    return jsonResponse(
      {
        ok: false,
        code: 'SEARCH_RATE_LIMITED',
        message: `联网搜索过于频繁，请 ${searchRate.retryAfter} 秒后再试。`,
      },
      429,
      origin,
    );
  }
  let dailyLimit = (await getQuotaPolicy(client, tier)).webSearchLimit;
  if (dailyLimit !== -1) {
    const bonuses = sumCodingBonuses(await resolveUserPlans(client, userId));
    dailyLimit += bonuses.webSearchBonus;
  }
  if (dailyLimit === 0) {
    return jsonResponse(
      { ok: false, code: 'SEARCH_DAILY_LIMIT', message: '当前订阅暂不支持联网搜索。' },
      429,
      origin,
    );
  }
  if (dailyLimit === -1) {
    const result = await executor(body);
    return jsonResponse(result, result.ok ? 200 : 502, origin);
  }
  const { data: reservation, error: reservationError } = await client.rpc('reserve_ai_web_search', {
    p_user_id: userId,
    p_tier: tier,
    p_daily_limit: dailyLimit,
    p_since: getBeijingTodayStartUTC(),
  });
  if (reservationError) throw reservationError;
  const searchReservation = Array.isArray(reservation) ? reservation[0] : null;
  if (!searchReservation?.allowed) {
    return jsonResponse(
      {
        ok: false,
        code: 'SEARCH_DAILY_LIMIT',
        message: '今日联网搜索额度已用完，明天 0:00 重置。',
      },
      429,
      origin,
    );
  }
  try {
    const result = await executor(body);
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
    ? (
        await resolveActiveSecret(
          client,
          toText(body.provider, 40).toLowerCase(),
          toText(body.purpose, 60).toLowerCase(),
        )
      ).row
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
  await writeAuditLog(client, actorId, 'test', data as VaultRow, {
    status,
    message: message.slice(0, 120),
  });
  return sanitizeRow(data as VaultRow);
};

// ============================================================
// AI 配额系统
// ============================================================

const QUOTA_CACHE_TTL_MS = 60_000;
type QuotaPolicy = { tokenLimit: number; webSearchLimit: number; pointsMultiplier: number };
const QUOTA_CONFIG_CACHE = new Map<string, { policy: QuotaPolicy; fetchedAt: number }>();

// AI 积分计费全局开关与汇率（ai_pricing_config 单行，管理面板可改）。
// 读取失败按「未启用」处理（fail-closed：行为退回纯日额度，不扣积分）。
const PRICING_CACHE_TTL_MS = 60_000;
type PricingConfig = { enabled: boolean; rateTokensPerPoint: number; dailyBurnCap: number };
let PRICING_CONFIG_CACHE: { value: PricingConfig; fetchedAt: number } | null = null;
const PRICING_CONFIG_DEFAULT: PricingConfig = {
  enabled: false,
  rateTokensPerPoint: 1_000_000,
  dailyBurnCap: 20,
};

// 5 分钟内存缓存：减少 runtime-chat 热路径上的 DB 往返。
// - USER_TIER_CACHE: user_subscriptions 行级数据，按 user_id 索引
// - MODEL_CONFIG_CACHE: bohai_model_configs 原始行（active 状态），按 mode_id 小写索引
// 缓存命中时仍会基于当前 tier 重新计算策略，避免 tier 变更导致越权。
const RUNTIME_CACHE_TTL_MS = 5 * 60_000;
type UserTierRow = { plans: string[] };
// single-flight 缓存：值持有 in-flight Promise 而非已完成的数据，
// 缓存过期时并发请求共享同一个 Promise，避免 cache stampede（B3 修复）。
// 失败的 Promise 会被清理，下次调用重新发起查询。
const USER_TIER_CACHE = new Map<string, { promise: Promise<string[]>; fetchedAt: number }>();
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
  // 积分兜底路径：本请求超出免费额度、改由积分计费
  billedViaPoints?: boolean;
  pointsReserved?: number;
  pointsError?: string;
  // BYOK（用户自带 Key，2026-10-08）：**不扣 BOH 额度** ⇒ 不预约、不记账。
  // ⚠️ 特意用一个独立标记，而不是把 tokenLimit 设成 -1 —— -1 的语义是「当前方案不限量」，
  //    会让额度面板 / 日志把自带 Key 当成会员特权，而这两件事完全无关。
  byok?: boolean;
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
  // BYOK 路径（用户自带 Key）：Key 在策略解析阶段就已解密，不再去 vault 查全局密钥；
  // 同时标记 byok=true 跳过额度预约与记账。
  byok?: boolean;
  apiKey?: string;
  keyLabel?: string;
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

// BOH AI Coding 附加包额度加成：与订阅页 CODING_PACKS 文案一致，按 active 订阅叠加。
// ⚠️ 2026-10-02：随档位额度（ai_quota_config.daily_token_limit）一起 ÷2，
//    保持包相对基础额度的占比不变（coding-lite 对 pro：250k/1M = 25%，与改动前 500k/2M 一致）。
//    改这里**必须同时改** src/utils/subscription-benefits.js 的 CODING_PACKS 展示值，
//    否则会出现「页面说 +25 万、实际加 +50 万」。
const CODING_PLAN_BONUSES: Record<string, { tokenBonus: number; webSearchBonus: number }> = {
  'coding-lite': { tokenBonus: 250_000, webSearchBonus: 10 },
  'coding-plus': { tokenBonus: 750_000, webSearchBonus: 30 },
  'coding-pro': { tokenBonus: 1_500_000, webSearchBonus: 60 },
  'coding-ultra': { tokenBonus: 3_000_000, webSearchBonus: 120 },
};

const SUBSCRIPTION_PLAN_ALIASES: Record<string, string> = {
  'boh-ai-plus': 'plus',
  'boh-plus': 'plus',
  'boh-pro': 'pro',
  'boh-max': 'max',
  'boh-ultra': 'ultra',
};

const normalizeSubscriptionPlanCode = (planCode: unknown): string => {
  const normalized = String(planCode || '')
    .trim()
    .toLowerCase();
  return SUBSCRIPTION_PLAN_ALIASES[normalized] || normalized;
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

// Model mode IDs are billing classes, independent from the user's subscription tier.
// Keep these integer multipliers aligned with get_ai_mode_token_multiplier() in the
// database migration so reservations and final settlements charge the same amount.
// 0 = 免费模型：usage 照常记账但 billed_tokens 为 0。
const MODE_TOKEN_MULTIPLIERS: Record<string, number> = {
  pro: 2,
  max: 3,
  ultra: 4,
};

const normalizeModeId = (mode: unknown): string => toText(mode, 80).toLowerCase();
const getModeTokenMultiplier = (mode: unknown): number =>
  MODE_TOKEN_MULTIPLIERS[normalizeModeId(mode)] || 1;
const normalizeQuotaMultiplier = (value: unknown, mode: unknown): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
  return getModeTokenMultiplier(mode);
};
const getBilledTokenCountForMultiplier = (tokens: number, multiplier: unknown): number =>
  Math.min(
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
  if (cached && Date.now() - cached.fetchedAt < RUNTIME_CACHE_TTL_MS) {
    // 缓存命中：await 共享的 in-flight Promise，返回新的 Set 实例避免 mutable 共享
    const plans = await cached.promise;
    return new Set(plans);
  }
  // 缓存 miss 或过期：立即创建 in-flight Promise 并存入缓存，
  // 同一 userId 的并发请求会命中 cached.promise 共享同一个 DB 查询（single-flight）
  const promise = (async () => {
    const { data } = await client
      .from('user_subscriptions')
      .select('plan_code, expires_at')
      .eq('user_id', userId)
      // 同时纳入 'trial'：试用用户应拿到对应档位的完整权益（Token 额度、模型权限）。
      // 试用期由 expires_at > now 过滤，到期自动回落 free，无需单独处理。
      .in('status', ['active', 'trial']);
    const nowIso = new Date().toISOString();
    const activePlans = (data || [])
      .filter((r: Record<string, unknown>) => String(r.expires_at || '') > nowIso)
      .map((r: Record<string, unknown>) => normalizeSubscriptionPlanCode(r.plan_code));
    return activePlans;
  })();
  USER_TIER_CACHE.set(userId, { promise, fetchedAt: Date.now() });
  // 查询失败时清理缓存，避免后续请求共享一个 rejected Promise
  promise.catch(() => {
    // 仅当 Map 中仍是同一个 Promise 时才清理，避免清掉后来的重试 Promise
    const current = USER_TIER_CACHE.get(userId);
    if (current?.promise === promise) USER_TIER_CACHE.delete(userId);
  });
  const plans = await promise;
  return new Set(plans);
}

async function resolveUserTier(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
): Promise<string> {
  if (!userId) return 'guest';
  const plans = await resolveUserPlans(client, userId);
  if (plans.has('ultra')) return 'ultra';
  if (plans.has('max')) return 'max';
  if (plans.has('pro')) return 'pro';
  if (plans.has('plus')) return 'plus';
  return 'free';
}

const normalizeTier = (tier: string) => (TIER_RANK[tier] === undefined ? 'free' : tier);

const tierAllows = (tier: string, requiredTier: string) =>
  (TIER_RANK[normalizeTier(tier)] || 0) >= (TIER_RANK[normalizeTier(requiredTier)] || 0);

const runtimeAccessError = (message: string, status = 403, code = 'RUNTIME_ACCESS_DENIED') => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

/* ══ 用户自带 Key（BYOK）的自定义厂商 / 模型（2026-10-08）═════════════════════
   数据落点（迁移 2026100802_user_ai_endpoints.sql，RLS 无 policy + 已撤 anon/authenticated）：
     · user_ai_endpoints = 厂商：名称 / Base URL / AES-GCM 加密的 Key
     · user_ai_models    = 该厂商下的模型，一条模型在运行时就是一个可选「模式」

   为什么把模型编成 `mode = 'user:<uuid>'`：现有链路前端**只传 mode**，provider / api_url /
   model 全部由服务端按 mode 决定。沿用这条约定，客户端的请求协议一个字都不用改 ——
   前端只是多拿到几个可选模式，走的还是同一条流式管道。

   ⚠️ `where id = ? and user_id = ?` 这一句是整条 BYOK 路径上**唯一**的归属断言：
      少了它，任何登录用户都能用别人的 Key、打别人的付费端点。
   ⚠️ 这里不做 tier / min_tier 校验：用自己 Key 的模型不该受 BOH 订阅档位限制。
   ⚠️ 全局 vault 的密钥**绝不能**参与这条路径（那会变成「拿站方的 Key 打用户自己的端点」，
      而且 vault 里根本没有 byok 这个 provider）。 */
const USER_MODE_PREFIX = 'user:';
const USER_MODEL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_MODEL_DEFAULT_MAX_TOKENS = 1800;
const USER_MODEL_MAX_TOKENS_CEILING = 32768;

const parseUserModeId = (mode: string): string => {
  const raw = mode.slice(USER_MODE_PREFIX.length);
  return USER_MODEL_UUID_PATTERN.test(raw) ? raw : '';
};

async function resolveUserModelPolicy(
  client: ReturnType<typeof createServiceClient>,
  mode: string,
  userId: string | null,
): Promise<RuntimeModelPolicy> {
  if (!userId) {
    throw runtimeAccessError('使用自定义模型需要先登录。', 401, 'LOGIN_REQUIRED');
  }
  const modelRowId = parseUserModeId(mode);
  if (!modelRowId) throw runtimeAccessError('自定义模型 ID 格式无效。', 400, 'MODE_ID_INVALID');

  const { data: modelRow, error: modelError } = await client
    .from('user_ai_models')
    .select('id, endpoint_id, user_id, model_id, temperature, max_tokens')
    .eq('id', modelRowId)
    .eq('user_id', userId)
    .maybeSingle();
  if (modelError || !modelRow) {
    throw runtimeAccessError('自定义模型不存在，或不属于当前账号。', 404, 'USER_MODEL_NOT_FOUND');
  }

  const { data: endpointRow, error: endpointError } = await client
    .from('user_ai_endpoints')
    .select('id, user_id, name, base_url, encrypted_value, status')
    .eq('id', modelRow.endpoint_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (endpointError || !endpointRow) {
    throw runtimeAccessError(
      '自定义厂商不存在，或不属于当前账号。',
      404,
      'USER_ENDPOINT_NOT_FOUND',
    );
  }
  if (String(endpointRow.status || 'active') !== 'active') {
    throw runtimeAccessError(
      '该自定义厂商已停用，请到设置里重新启用。',
      403,
      'USER_ENDPOINT_DISABLED',
    );
  }

  const apiUrl = validateRuntimeApiUrl(String(endpointRow.base_url || ''), '');
  if (!apiUrl) {
    throw runtimeAccessError(
      '自定义厂商的 Base URL 无效（必须是可公网访问的 http(s) 地址）。',
      400,
      'USER_ENDPOINT_URL_INVALID',
    );
  }
  const apiKey = await decryptSecret(String(endpointRow.encrypted_value || ''));
  const modelId = toText(modelRow.model_id, 120);
  if (!modelId) throw runtimeAccessError('自定义模型未填写模型 ID。', 400, 'USER_MODEL_ID_EMPTY');

  return {
    mode,
    provider: 'byok',
    apiUrl,
    modelId,
    maxTokens: clampInt(
      modelRow.max_tokens,
      USER_MODEL_DEFAULT_MAX_TOKENS,
      1,
      USER_MODEL_MAX_TOKENS_CEILING,
    ),
    temperature: clampNumber(modelRow.temperature, 0.2, 0, 2),
    topP: 0.95,
    frequencyPenalty: 0,
    // BYOK 不参与 BOH 额度计费 ⇒ 倍率固定 0，且整个预约/记账流程都会被跳过
    quotaMultiplier: 0,
    byok: true,
    apiKey,
    keyLabel: toText(endpointRow.name, 40) || '自定义模型',
  };
}

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
  // 用户自定义模型（BYOK）走独立解析：不去 bohai_model_configs 查、不受 tier 限制、
  // 也不走全局 vault 密钥。放在最前面 —— 这条路径与官方模式的配置来源完全不同。
  if (mode.startsWith(USER_MODE_PREFIX)) {
    return resolveUserModelPolicy(client, mode, userId);
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
      .select(
        'mode_id, provider, model_id, api_url, max_tokens, temperature, top_p, frequency_penalty, quota_multiplier, status, min_tier',
      )
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
      throw runtimeAccessError(
        '当前订阅暂不支持此 Coding 模式，请订阅对应的 Coding 附加包后重试。',
      );
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
    maxTokens: clampInt(data.max_tokens, 1200, 1, 4096),
    temperature: Number(data.temperature ?? 0.2),
    topP: Number(data.top_p ?? 0.75),
    frequencyPenalty: Number(data.frequency_penalty ?? 0.06),
    quotaMultiplier: normalizeQuotaMultiplier(data.quota_multiplier, data.mode_id),
  };
}

const buildRuntimePayload = (
  body: Record<string, unknown>,
  policy: RuntimeModelPolicy,
  stream: boolean,
) => {
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
    .select('daily_token_limit, web_search_daily_limit, points_multiplier')
    .eq('tier', tier)
    .maybeSingle();
  let tokenLimit = Number(data?.daily_token_limit ?? 0);
  let webSearchLimit = Number(
    data?.web_search_daily_limit ?? WEB_SEARCH_DAILY_LIMIT_FALLBACKS[tier] ?? 0,
  );
  const pointsMultiplierRaw = Number(data?.points_multiplier ?? 1);
  let pointsMultiplier =
    Number.isFinite(pointsMultiplierRaw) && pointsMultiplierRaw >= 0.1 && pointsMultiplierRaw <= 2
      ? pointsMultiplierRaw
      : 1;
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
    pointsMultiplier = 1;
  }
  const policy = { tokenLimit, webSearchLimit, pointsMultiplier };
  QUOTA_CONFIG_CACHE.set(tier, { policy, fetchedAt: Date.now() });
  return policy;
}

async function getPricingConfig(
  client: ReturnType<typeof createServiceClient>,
): Promise<PricingConfig> {
  if (PRICING_CONFIG_CACHE && Date.now() - PRICING_CONFIG_CACHE.fetchedAt < PRICING_CACHE_TTL_MS) {
    return PRICING_CONFIG_CACHE.value;
  }
  let value = PRICING_CONFIG_DEFAULT;
  try {
    const { data, error } = await client
      .from('ai_pricing_config')
      .select('enabled, rate_tokens_per_point, daily_points_burn_cap')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) {
      const rate = Number(data.rate_tokens_per_point);
      const cap = Number(data.daily_points_burn_cap);
      value = {
        enabled: Boolean(data.enabled),
        rateTokensPerPoint:
          Number.isFinite(rate) && rate >= 10000 ? rate : PRICING_CONFIG_DEFAULT.rateTokensPerPoint,
        dailyBurnCap:
          Number.isFinite(cap) && (cap >= 1 || cap === -1)
            ? cap
            : PRICING_CONFIG_DEFAULT.dailyBurnCap,
      };
    }
  } catch (_error) {
    value = PRICING_CONFIG_DEFAULT;
  }
  PRICING_CONFIG_CACHE = { value, fetchedAt: Date.now() };
  return value;
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
  let query = client.from('ai_quota_log').select('billed_tokens').gte('created_at', todayStart);
  if (userId) query = query.eq('user_id', userId);
  else if (ipAddress) query = query.eq('ip_address', ipAddress);
  const fallback = await query;
  return (fallback.data || []).reduce(
    (sum: number, row: Record<string, unknown>) =>
      sum + Math.max(0, Number(row.billed_tokens || 0)),
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

// 多模态消息（content 为部件数组）按部件估算：图片部件按固定开销计 ——
// base64 dataURL 若按字符串估 token 会把配额预扣撑爆（一张 50KB 图 ≈ 1.2 万 token），
// 实际视觉消耗与 224px 压缩图相符（Gemini 低分辨率媒体约 258 token）。
const MULTIMODAL_IMAGE_PART_TOKENS = 300;

const estimateContentPartsTokens = (content: unknown): number => {
  if (!Array.isArray(content)) return estimateTextTokens(content || '');
  return content.reduce((partSum: number, part: unknown) => {
    const partRow = (part || {}) as Record<string, unknown>;
    if (String(partRow.type || '') === 'image_url') {
      return partSum + MULTIMODAL_IMAGE_PART_TOKENS;
    }
    return partSum + estimateTextTokens(partRow.text ?? partRow.content ?? '');
  }, 0);
};

const estimatePromptTokens = (body: Record<string, unknown>): number => {
  const payload = (body.payload || {}) as Record<string, unknown>;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.reduce((sum: number, message: unknown) => {
    const row = (message || {}) as Record<string, unknown>;
    return sum + 4 + estimateContentPartsTokens(row.content);
  }, 2);
};

const normalizeTokenUsage = (
  rawUsage: Record<string, unknown> | null | undefined,
  body: Record<string, unknown>,
  completionText = '',
): TokenUsage => {
  const promptTokens = Math.max(
    0,
    clampInt(
      rawUsage?.prompt_tokens ?? rawUsage?.input_tokens,
      estimatePromptTokens(body),
      0,
      10_000_000,
    ),
  );
  const completionTokens = Math.max(
    0,
    clampInt(
      rawUsage?.completion_tokens ?? rawUsage?.output_tokens,
      estimateTextTokens(completionText),
      0,
      10_000_000,
    ),
  );
  const suppliedTotal = Number(rawUsage?.total_tokens);
  const totalTokens =
    Number.isFinite(suppliedTotal) && suppliedTotal >= 0
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
  // BYOK：用户自带 Key，**不扣 BOH 额度**（2026-10-08 用户口径），因此不记账也不结算。
  // 限流（每分钟请求数）在上游照旧生效，与「谁付钱」无关。
  if (quota.byok) return;
  if (quota.reservationId) {
    const payload = (body.payload || {}) as Record<string, unknown>;
    // 积分结算必须先于 settle_ai_token_quota：后者会把预约置为 settled，
    // 而 settle_ai_points 只认 pending。积分结算只记实结值、不改 status。
    if (quota.billedViaPoints) {
      const { error: pointsError } = await client.rpc('settle_ai_points', {
        p_reservation_id: quota.reservationId,
        p_total_tokens: usage.totalTokens,
        p_multiplier: quotaMultiplier,
        p_model: String(payload.model || ''),
        p_mode: String(body.mode || ''),
      });
      if (pointsError) throw pointsError;
    }
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
  await client.from('ai_quota_log').insert([
    {
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
    },
  ]);
}

async function releaseTokenReservation(
  client: ReturnType<typeof createServiceClient>,
  quota: TokenQuota,
): Promise<void> {
  // BYOK 从不预约额度（见 reserveTokenQuota 的短路），所以也没有可释放的预留。
  if (quota.byok) return;
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
    return {
      ...quota,
      allowed: false,
      remainingTokens: Math.max(0, Number(row?.remaining_tokens || 0)),
    };
  }
  return {
    ...quota,
    reservationId,
    remainingTokens: Math.max(0, Number(row.remaining_tokens || 0)),
  };
}

async function reservePointsForQuota(
  client: ReturnType<typeof createServiceClient>,
  quota: TokenQuota,
  body: Record<string, unknown>,
  maxOutputTokens: number,
  quotaMultiplier: number,
  pointsMultiplier: number,
  pricing: PricingConfig,
): Promise<TokenQuota> {
  // 积分兜底只对已登录的非游客生效；未启用时保持原 429 行为
  if (!pricing.enabled || !quota.userId || quota.tier === 'guest') return quota;
  const estimatedBilled = getBilledTokenCountForMultiplier(
    Math.max(1, estimatePromptTokens(body) + Math.max(1, maxOutputTokens)),
    quotaMultiplier,
  );
  if (estimatedBilled <= 0) {
    // 免费模型（倍率 0）：不占额度不扣积分，直接放行
    return { ...quota, allowed: true };
  }
  const reservationId = crypto.randomUUID();
  const { data, error } = await client.rpc('reserve_ai_points', {
    p_reservation_id: reservationId,
    p_user_id: quota.userId,
    p_ip_address: quota.ipAddress,
    p_estimated_billed: estimatedBilled,
    p_multiplier: pointsMultiplier,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.allowed) {
    return {
      ...quota,
      allowed: false,
      pointsError: String(row?.reason || 'POINTS_RESERVE_FAILED'),
    };
  }
  if (Number(row.points_estimate) <= 0) {
    return { ...quota, allowed: true };
  }
  return {
    ...quota,
    allowed: true,
    reservationId,
    billedViaPoints: true,
    pointsReserved: Number(row.points_estimate) || 0,
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

async function handleQuotaStatus(client: ReturnType<typeof createServiceClient>, request: Request) {
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
  const pricing = await getPricingConfig(client);
  let tokenLimit = policy.tokenLimit;
  let webSearchLimit = policy.webSearchLimit;
  // 附加包加成单独留一份：前端 2026-10-08 起用「档位基础额度 = 100%、附加包把满量程推到
  // 100% + 包%」的百分比口径，只返回合并后的 tokenLimit 是拆不出这两个分量的。
  let bonusTokens = 0;
  if (userId) {
    const bonuses = sumCodingBonuses(await resolveUserPlans(client, userId));
    bonusTokens = bonuses.tokenBonus;
    if (tokenLimit !== -1) tokenLimit += bonuses.tokenBonus;
    if (webSearchLimit !== -1) webSearchLimit += bonuses.webSearchBonus;
  }
  const usedTokens = tokenLimit === -1 ? 0 : await countTodayTokenUsage(client, userId, ipAddress);
  const remainingTokens = tokenLimit === -1 ? -1 : Math.max(0, tokenLimit - usedTokens);
  const webSearchUsed = webSearchLimit === -1 ? 0 : await countTodayWebSearchUsage(client, userId);
  const webSearchRemaining =
    webSearchLimit === -1 ? -1 : Math.max(0, webSearchLimit - webSearchUsed);

  // 积分计费信息：free 档在积分开启后进入「纯积分模式」；会员档展示兜底余额
  const pointsMode = Boolean(userId && pricing.enabled && tier === 'free');
  let pointsBalance: number | undefined;
  let pointsUsedToday: number | undefined;
  if (userId && pricing.enabled) {
    const { data: profile } = await client
      .from('profiles')
      .select('points')
      .eq('id', userId)
      .maybeSingle();
    pointsBalance = Math.max(0, Number(profile?.points ?? 0));
    const { data: burnRows } = await client
      .from('points_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('reason', 'ai_usage')
      .lt('amount', 0)
      .gte('created_at', getBeijingTodayStartUTC());
    pointsUsedToday = Math.abs(
      (burnRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );
  }

  return {
    unit: 'tokens',
    tier,
    used: usedTokens,
    limit: tokenLimit,
    usedTokens,
    tokenLimit,
    // 2026-10-08 新增：百分比口径要的两个分量 —— 基础额度（分母）与附加包加成。
    // baseTokenLimit = tokenLimit − bonusTokens（不限量时为 -1）。
    // free 档 daily_token_limit = 0 且买了包 ⇒ base 为 0，前端按「包即全部额度」降级处理。
    baseTokenLimit: tokenLimit === -1 ? -1 : Math.max(0, tokenLimit - bonusTokens),
    bonusTokens,
    remainingTokens,
    webSearchUsed,
    webSearchLimit,
    webSearchRemaining,
    resetAt: tokenLimit === -1 ? '' : getTomorrowBeijingStartUTC(),
    pricing: {
      enabled: pricing.enabled,
      rateTokensPerPoint: pricing.rateTokensPerPoint,
      dailyBurnCap: pricing.dailyBurnCap,
    },
    pointsMode,
    pointsMultiplier: policy.pointsMultiplier,
    pointsBalance,
    pointsUsedToday,
  };
}

/* ══ 用户自定义厂商 / 模型（BYOK）的 CRUD ═══════════════════════════════════
   规则（与整仓的密钥纪律一致）：
     · 全部要求登录；**每一条查询都带 `user_id = 当前用户`** —— 归属靠 SQL 谓词，不靠前端传参；
     · 只回**掩码**，明文 Key 永不出服务端（连测试/发现的错误信息里也不回显）；
     · Base URL 必须 https 且非内网（复用 isPrivateOrLocalHost，与 runtime 同一套 SSRF 判据）；
     · 用户填的可能是「域名 / /v1 / 完整 chat-completions 地址」三种形态，统一归一到
       chat completions 端点后再落库，运行时就不用再猜。 */
const USER_ENDPOINT_LIMIT = 8;
const USER_ENDPOINT_MODEL_LIMIT = 12;
const USER_ENDPOINT_TEST_TIMEOUT_MS = 20_000;

// supabase-js 的查询结果在本地无类型（EF 不参与 tsconfig.app.json），显式声明行形状，
// 免得整条链路都是 any（顺手把「字段名拼错」从运行期问题变成编译期问题）。
type UserEndpointRow = {
  id: string;
  name: string;
  base_url: string;
  encrypted_value?: string | null;
  masked_value: string;
  status: string;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_tested_at?: string | null;
  created_at?: string | null;
};

type UserModelRow = {
  id: string;
  endpoint_id: string;
  model_id: string;
  display_name?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  sort_order?: number | null;
};

/**
 * 把用户填的 Base URL 归一成 chat completions 端点。
 * 归一规则（至少覆盖最常见的三种填法）：
 *   · 已经以 /chat/completions 结尾 → 原样
 *   · 以 /v1、/v2… 结尾            → 追加 /chat/completions
 *   · 只有域名或其它路径            → 追加 /v1/chat/completions
 */
const normalizeUserChatUrl = (raw: unknown): { url: string; error: string } => {
  const text = toText(raw, 300);
  if (!text) return { url: '', error: '请填写 Base URL。' };
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { url: '', error: 'Base URL 格式不正确，示例：https://api.example.com/v1' };
  }
  if (parsed.protocol !== 'https:') {
    return { url: '', error: 'Base URL 必须是 https 地址（明文 http 会在公网泄露你的 Key）。' };
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    return { url: '', error: 'Base URL 不能指向本机或内网地址。' };
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(path)) {
    parsed.pathname = path;
  } else if (/\/v\d+$/i.test(path)) {
    parsed.pathname = `${path}/chat/completions`;
  } else if (!path) {
    parsed.pathname = '/v1/chat/completions';
  } else {
    parsed.pathname = `${path}/chat/completions`;
  }
  parsed.search = '';
  parsed.hash = '';
  return { url: parsed.toString(), error: '' };
};

/** 从「已保存的 id」或「本次表单里的 baseUrl + apiKey」两路取凭证（测试/发现共用）。 */
const resolveUserEndpointCredentials = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  body: Record<string, unknown>,
) => {
  const id = toText(body.id, 60);
  if (id) {
    const { data: row, error } = await client
      .from('user_ai_endpoints')
      .select('id, base_url, encrypted_value, status')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !row) throw new Error('厂商不存在，或不属于当前账号。');
    // 表单里同时给了新的 Key/URL 时以表单为准（「改完先测一下再保存」的正常用法）
    const apiKeyOverride = toText(body.apiKey, 400);
    const chatUrl = normalizeUserChatUrl(toText(body.baseUrl, 300) || row.base_url);
    if (chatUrl.error) throw new Error(chatUrl.error);
    return {
      sourceId: id,
      baseUrl: chatUrl.url,
      apiKey: apiKeyOverride || (await decryptSecret(String(row.encrypted_value || ''))),
    };
  }
  const apiKey = toText(body.apiKey, 400);
  if (!apiKey) throw new Error('请填写 API Key。');
  const chatUrl = normalizeUserChatUrl(body.baseUrl);
  if (chatUrl.error) throw new Error(chatUrl.error);
  return { sourceId: '', baseUrl: chatUrl.url, apiKey };
};

const listUserEndpoints = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
) => {
  const { data: endpoints, error } = await client
    .from('user_ai_endpoints')
    .select(
      'id, name, base_url, masked_value, status, last_test_status, last_test_message, last_tested_at, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const endpointRows = (endpoints || []) as UserEndpointRow[];

  const ids = endpointRows.map((row) => row.id);
  const { data: models, error: modelError } = ids.length
    ? await client
        .from('user_ai_models')
        .select('id, endpoint_id, model_id, display_name, temperature, max_tokens, sort_order')
        .eq('user_id', userId)
        .in('endpoint_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [], error: null };
  if (modelError) throw modelError;
  const modelRows = (models || []) as UserModelRow[];

  return {
    endpoints: endpointRows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      keyMasked: row.masked_value,
      status: row.status,
      lastTestStatus: row.last_test_status || '',
      lastTestMessage: row.last_test_message || '',
      lastTestedAt: row.last_tested_at || '',
      models: modelRows
        .filter((m) => m.endpoint_id === row.id)
        .map((m) => ({
          id: m.id,
          // 运行时就是一个模式 id：前端拿它填 currentModeId 即可，无需其它协议
          modeId: `${USER_MODE_PREFIX}${m.id}`,
          modelId: m.model_id,
          displayName: m.display_name || m.model_id,
          temperature: m.temperature,
          maxTokens: m.max_tokens,
        })),
    })),
    limits: { endpoints: USER_ENDPOINT_LIMIT, modelsPerEndpoint: USER_ENDPOINT_MODEL_LIMIT },
  };
};

const upsertUserEndpoint = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  body: Record<string, unknown>,
) => {
  const id = toText(body.id, 60);
  const name = toText(body.name, 40);
  if (!name) throw new Error('请填写厂商名称。');

  let endpointId = id;
  let encryptedValue = '';
  let maskedValue = '';
  if (id) {
    const { data: existing, error } = await client
      .from('user_ai_endpoints')
      .select('id, encrypted_value, masked_value')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !existing) throw new Error('厂商不存在，或不属于当前账号。');
    encryptedValue = String(existing.encrypted_value || '');
    maskedValue = String(existing.masked_value || '');
  }
  // Key 留空 = 不改（编辑时不想重填的正常用法）
  const apiKeyInput = toText(body.apiKey, 400);
  if (apiKeyInput) {
    if (apiKeyInput.length < 8) throw new Error('API Key 太短，请检查是否复制完整。');
    encryptedValue = await encryptSecret(apiKeyInput);
    maskedValue = maskSecret(apiKeyInput);
  }
  if (!encryptedValue) throw new Error('请填写 API Key。');

  const chatUrl = normalizeUserChatUrl(body.baseUrl);
  if (chatUrl.error) throw new Error(chatUrl.error);

  if (!endpointId) {
    const { count, error: countError } = await client
      .from('user_ai_endpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) throw countError;
    if (Number(count || 0) >= USER_ENDPOINT_LIMIT) {
      throw new Error(`最多只能添加 ${USER_ENDPOINT_LIMIT} 个自定义厂商。`);
    }
  }

  const payload = {
    user_id: userId,
    name,
    base_url: chatUrl.url,
    encrypted_value: encryptedValue,
    masked_value: maskedValue,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  if (endpointId) {
    const { error } = await client
      .from('user_ai_endpoints')
      .update(payload)
      .eq('id', endpointId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { data, error } = await client
      .from('user_ai_endpoints')
      .insert([payload])
      .select('id')
      .single();
    if (error) throw error;
    endpointId = String(data.id);
  }

  // 模型列表按「整表替换」处理：前端提交完整列表，服务端只做去重/截断/落库。
  // 比逐个 diff 简单得多，语义也更明确（保存后的列表 == 表单里的列表）。
  const seen = new Set<string>();
  const wanted = (Array.isArray(body.models) ? body.models : [])
    .map((item) => {
      const record = toMetadata(item);
      return {
        modelId: toText(record.modelId, 120),
        displayName: toText(record.displayName, 60),
        temperature: record.temperature,
        maxTokens: record.maxTokens,
      };
    })
    .filter((item) => item.modelId && !seen.has(item.modelId) && seen.add(item.modelId))
    .slice(0, USER_ENDPOINT_MODEL_LIMIT);
  if (!wanted.length) throw new Error('至少填一个模型 ID，否则这个厂商没有任何可用的模型。');

  const { data: current, error: currentError } = await client
    .from('user_ai_models')
    .select('id, model_id')
    .eq('endpoint_id', endpointId)
    .eq('user_id', userId);
  if (currentError) throw currentError;
  const currentRows = (current || []) as Array<{ id: string; model_id: string }>;

  const keepIds = new Set<string>();
  for (const [index, item] of wanted.entries()) {
    const row = {
      endpoint_id: endpointId,
      user_id: userId,
      model_id: item.modelId,
      display_name: item.displayName,
      temperature:
        item.temperature === undefined || item.temperature === null || item.temperature === ''
          ? null
          : clampNumber(item.temperature, 0.2, 0, 2),
      max_tokens:
        item.maxTokens === undefined || item.maxTokens === null || item.maxTokens === ''
          ? null
          : clampInt(
              item.maxTokens,
              USER_MODEL_DEFAULT_MAX_TOKENS,
              1,
              USER_MODEL_MAX_TOKENS_CEILING,
            ),
      sort_order: (index + 1) * 10,
    };
    const matched = currentRows.find((row2) => row2.model_id === item.modelId);
    if (matched) {
      const { error } = await client
        .from('user_ai_models')
        .update(row)
        .eq('id', matched.id)
        .eq('user_id', userId);
      if (error) throw error;
      keepIds.add(String(matched.id));
    } else {
      const { data, error } = await client
        .from('user_ai_models')
        .insert([row])
        .select('id')
        .single();
      if (error) throw error;
      keepIds.add(String(data.id));
    }
  }
  const staleIds = currentRows.filter((row) => !keepIds.has(String(row.id))).map((row) => row.id);
  if (staleIds.length) {
    const { error } = await client
      .from('user_ai_models')
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds);
    if (error) throw error;
  }
  return listUserEndpoints(client, userId);
};

const deleteUserEndpoint = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  body: Record<string, unknown>,
) => {
  const id = toText(body.id, 60);
  if (!id) throw new Error('缺少厂商 ID。');
  // 模型行由外键 on delete cascade 带走，这里只删厂商（且必须是自己那条）
  const { error } = await client
    .from('user_ai_endpoints')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
  return listUserEndpoints(client, userId);
};

const testUserEndpoint = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  body: Record<string, unknown>,
) => {
  const { sourceId, baseUrl, apiKey } = await resolveUserEndpointCredentials(client, userId, body);
  const modelId = toText(body.modelId, 120);
  if (!modelId) throw new Error('请先填写模型 ID，测试会真的向该端点发一次对话请求。');

  const startedAt = Date.now();
  let ok = false;
  let status = 0;
  let message = '';
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false,
      }),
      signal: AbortSignal.timeout(USER_ENDPOINT_TEST_TIMEOUT_MS),
    });
    status = response.status;
    ok = response.ok;
    const text = await response.text().catch(() => '');
    if (!ok) {
      // 只回上游的错误描述，**不回显任何请求头**（避免把用户的 Key 带进日志/响应）
      message = sanitizeMessage(
        (() => {
          try {
            const parsed = JSON.parse(text);
            return String(parsed?.error?.message || parsed?.message || text || '');
          } catch {
            return text;
          }
        })() || `端点返回 ${status}`,
        240,
      );
    } else {
      message = '连接成功，端点已返回可用的响应。';
    }
  } catch (error) {
    status = 0;
    ok = false;
    message =
      error instanceof Error && error.name === 'TimeoutError'
        ? `连接超时（${USER_ENDPOINT_TEST_TIMEOUT_MS / 1000}s），请检查 Base URL 是否可达。`
        : sanitizeMessage(error instanceof Error ? error.message : '连接失败', 240);
  }

  const latencyMs = Date.now() - startedAt;
  if (sourceId) {
    await client
      .from('user_ai_endpoints')
      .update({
        last_test_status: ok ? 'success' : 'failed',
        last_test_message: message,
        last_tested_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .eq('user_id', userId);
  }
  return { ok, status, latencyMs, message };
};

const discoverUserEndpointModels = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  body: Record<string, unknown>,
) => {
  const { baseUrl, apiKey } = await resolveUserEndpointCredentials(client, userId, body);
  // 复用管理端那套 models 端点推导（剥 /chat/completions 换 /models、补 /v1 等）
  const modelsUrl = deriveModelsUrl('custom', { apiUrl: baseUrl });
  if (!modelsUrl) throw new Error('无法推导出 models 端点，请检查 Base URL。');
  const result = await discoverProviderModels(apiKey, 'custom', { apiUrl: baseUrl });
  if (!result.ok) {
    return {
      ok: false,
      modelsUrl: result.modelsUrl || modelsUrl,
      models: [],
      message: result.message,
    };
  }
  return {
    ok: true,
    modelsUrl: result.modelsUrl || modelsUrl,
    models: result.models,
    message: `成功获取 ${result.models.length} 个模型。`,
  };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (DEBUG) console.log('[vault] request started, method:', request.method);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    console.log('[vault] method not allowed');
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  try {
    const client = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const action = toText(body.action || 'list', 30);
    if (DEBUG) console.log('[vault] action:', action);

    if (action === 'runtime-chat') {
      const identity = await resolveRuntimeIdentity(request, client);
      // M-6 修复：服务端短期速率限制（每用户每分钟 10 次），防止客户端限流被绕过
      const rateKey = `ai_chat_rt:${identity.userId || `guest:${identity.ipAddress}`}`;
      // 与 runtime-chat-stream 同一处理：限流与额度并行，policy 保持在限流之后。
      // 详见 runtime-chat-stream 分支的注释（plans/024 §P1-3）。
      // P1-5: 复用 identity 避免重复 auth.getUser 往返
      const [rate, initialQuota] = await Promise.all([
        checkRateLimitDb(rateKey, 10, 60_000),
        checkTokenQuota(client, request, {
          userId: identity.userId,
          ipAddress: identity.ipAddress,
          tier: identity.tier,
        }),
      ]);
      if (!rate.ok) {
        return jsonResponse(
          {
            ok: false,
            status: 429,
            code: 'RATE_LIMITED',
            message: `请求过于频繁，请 ${rate.retryAfter} 秒后再试。`,
          },
          429,
          origin,
        );
      }
      const tier = identity.tier;
      const policy = await resolveRuntimeModelPolicy(
        client,
        toText(body.mode, 80),
        tier,
        identity.userId,
      );
      console.log('[vault] user auth ok, reserving token quota');
      // BYOK（用户自带 Key，2026-10-08）**不预约 BOH 额度** —— 用户口径「不扣 BOH 额度」。
      // ⚠️ 限流不豁免：上游那次 checkRateLimitDb（每用户每分钟 10 次）照旧生效，防的是
      //    脚本刷自己的端点把 EF 打满，与「谁付钱」无关。
      // byok 分支不带 reservationId ⇒ logTokenUsage / releaseTokenReservation 双双短路。
      let quota: TokenQuota = policy.byok
        ? {
            ...initialQuota,
            allowed: true,
            byok: true,
            reservationId: undefined,
            billedViaPoints: false,
          }
        : await reserveTokenQuota(
            client,
            initialQuota,
            body,
            policy.maxTokens,
            policy.quotaMultiplier,
          );
      if (!quota.allowed) {
        // 免费额度不足 → 积分兜底（仅已登录非游客，且 ai_pricing_config.enabled）
        const pricing = await getPricingConfig(client);
        const tierPolicy = await getQuotaPolicy(client, tier);
        quota = await reservePointsForQuota(
          client,
          quota,
          body,
          policy.maxTokens,
          policy.quotaMultiplier,
          tierPolicy.pointsMultiplier,
          pricing,
        );
      }
      if (!quota.allowed) {
        console.log('[vault] quota exceeded');
        if (quota.pointsError === 'INSUFFICIENT_POINTS') {
          return jsonResponse(
            {
              ok: false,
              status: 429,
              code: 'INSUFFICIENT_POINTS',
              data: { quota },
              message: '积分不足：AI 对话将消耗积分，请先签到或领取积分后再使用。',
            },
            429,
            origin,
          );
        }
        if (quota.pointsError === 'DAILY_BURN_CAP') {
          return jsonResponse(
            {
              ok: false,
              status: 429,
              code: 'POINTS_BURN_CAP',
              data: { quota },
              message: '今日 AI 积分消耗已达上限，明天 0:00 重置。',
            },
            429,
            origin,
          );
        }
        return jsonResponse(
          {
            ok: false,
            status: 429,
            data: { quota },
            message: '今日 BOH AI Token 额度已用完，明天 0:00 重置',
          },
          429,
          origin,
        );
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
      console.log(
        '[vault] runtimeChatCompletion result:',
        result.ok ? 'ok' : 'failed',
        result.message || '',
      );
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'runtime-chat-stream') {
      const identity = await resolveRuntimeIdentity(request, client);
      // M-6 修复：服务端短期速率限制（每用户每分钟 10 次）
      const rateKey = `ai_chat_rt:${identity.userId || `guest:${identity.ipAddress}`}`;
      // 首 token 延迟优化（plans/024 §P1-3）：限流与额度查询互不依赖（都只吃 identity），
      // 并行发出，把两次串行 DB 往返压成一次。
      //
      // ⚠️ resolveRuntimeModelPolicy **必须留在限流之后**：它会抛错（模式不可用 / 订阅不足），
      // 若并进这一批，被限流的用户会先拿到「模式不可用」而不是 429 —— 等于削弱限流反馈。
      // ⚠️ checkTokenQuota 是纯读（真正的预留在后面的 reserveTokenQuota），
      // 所以被限流的请求多算一次额度没有副作用，只是浪费一次读。
      // P1-5: 复用 identity 避免重复 auth.getUser 往返
      const [rate, initialQuota] = await Promise.all([
        checkRateLimitDb(rateKey, 10, 60_000),
        checkTokenQuota(client, request, {
          userId: identity.userId,
          ipAddress: identity.ipAddress,
          tier: identity.tier,
        }),
      ]);
      if (!rate.ok) {
        return jsonResponse(
          {
            ok: false,
            status: 429,
            code: 'RATE_LIMITED',
            message: `请求过于频繁，请 ${rate.retryAfter} 秒后再试。`,
          },
          429,
          origin,
        );
      }
      const tier = identity.tier;
      const policy = await resolveRuntimeModelPolicy(
        client,
        toText(body.mode, 80),
        tier,
        identity.userId,
      );
      // BYOK（用户自带 Key，2026-10-08）**不预约 BOH 额度** —— 用户口径「不扣 BOH 额度」。
      // ⚠️ 限流不豁免：上游那次 checkRateLimitDb（每用户每分钟 10 次）照旧生效，防的是
      //    脚本刷自己的端点把 EF 打满，与「谁付钱」无关。
      // byok 分支不带 reservationId ⇒ logTokenUsage / releaseTokenReservation 双双短路。
      let quota: TokenQuota = policy.byok
        ? {
            ...initialQuota,
            allowed: true,
            byok: true,
            reservationId: undefined,
            billedViaPoints: false,
          }
        : await reserveTokenQuota(
            client,
            initialQuota,
            body,
            policy.maxTokens,
            policy.quotaMultiplier,
          );
      if (!quota.allowed) {
        // 免费额度不足 → 积分兜底（仅已登录非游客，且 ai_pricing_config.enabled）
        const pricing = await getPricingConfig(client);
        const tierPolicy = await getQuotaPolicy(client, tier);
        quota = await reservePointsForQuota(
          client,
          quota,
          body,
          policy.maxTokens,
          policy.quotaMultiplier,
          tierPolicy.pointsMultiplier,
          pricing,
        );
      }
      if (!quota.allowed) {
        console.log('[vault] quota exceeded');
        if (quota.pointsError === 'INSUFFICIENT_POINTS') {
          return jsonResponse(
            {
              ok: false,
              status: 429,
              code: 'INSUFFICIENT_POINTS',
              data: { quota },
              message: '积分不足：AI 对话将消耗积分，请先签到或领取积分后再使用。',
            },
            429,
            origin,
          );
        }
        if (quota.pointsError === 'DAILY_BURN_CAP') {
          return jsonResponse(
            {
              ok: false,
              status: 429,
              code: 'POINTS_BURN_CAP',
              data: { quota },
              message: '今日 AI 积分消耗已达上限，明天 0:00 重置。',
            },
            429,
            origin,
          );
        }
        return jsonResponse(
          {
            ok: false,
            status: 429,
            data: { quota },
            message: '今日 BOH AI Token 额度已用完，明天 0:00 重置',
          },
          429,
          origin,
        );
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
        return jsonResponse(
          { ok: false, code: user.code, message: user.message },
          user.status,
          origin,
        );
      }
      return await runMeteredWebSearch({
        client,
        userId: user.userId,
        body,
        executor: (b) => runtimeTavilySearch(client, b),
        origin,
      });
    }
    if (action === 'runtime-free-search') {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse(
          { ok: false, code: user.code, message: user.message },
          user.status,
          origin,
        );
      }
      return await runMeteredWebSearch({
        client,
        userId: user.userId,
        body,
        executor: (b) => runtimeFreeSearch(b),
        origin,
      });
    }
    if (action === 'runtime-resolve') {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse(
          { ok: false, code: user.code, message: user.message },
          user.status,
          origin,
        );
      }
      const result = await runtimeResolveActiveKey(client, body);
      return jsonResponse(result, result.ok ? 200 : 502, origin);
    }
    if (action === 'quota-status') {
      const data = await handleQuotaStatus(client, request);
      return jsonResponse({ ok: true, data }, 200, origin);
    }
    /* ── 用户自定义厂商 / 模型（BYOK）：仅需登录，不需要管理员 ────────────────
       ⚠️ 校验类失败一律回 400 + 可读文案（前端直接展示）：若让它冒到外层 catch，
          会变成 500「服务异常」，用户改个 Base URL 却看到「服务器出错了」。 */
    if (action.startsWith('user-endpoint-')) {
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse(
          { ok: false, code: user.code, message: user.message },
          user.status,
          origin,
        );
      }
      const runUserEndpointAction = async (fn: () => Promise<unknown>) => {
        try {
          return jsonResponse({ ok: true, data: await fn() }, 200, origin);
        } catch (error) {
          return jsonResponse(
            {
              ok: false,
              code: 'USER_ENDPOINT_ERROR',
              message: sanitizeMessage(error instanceof Error ? error.message : '操作失败'),
            },
            400,
            origin,
          );
        }
      };
      if (action === 'user-endpoint-list') {
        return runUserEndpointAction(() => listUserEndpoints(client, user.userId));
      }
      if (action === 'user-endpoint-upsert') {
        return runUserEndpointAction(() => upsertUserEndpoint(client, user.userId, body));
      }
      if (action === 'user-endpoint-delete') {
        return runUserEndpointAction(() => deleteUserEndpoint(client, user.userId, body));
      }
      if (action === 'user-endpoint-test') {
        // 这两个 action 会**真的向外发请求**（用户的 Base URL + 用户的 Key）⇒ 必须限流，
        // 否则登录用户可以把 EF 当免费代理去扫任意地址 / 刷对方接口。
        const rate = await checkRateLimitDb(`user_endpoint_probe:${user.userId}`, 20, 60_000);
        if (!rate.ok) {
          return jsonResponse(
            {
              ok: false,
              code: 'RATE_LIMITED',
              message: `操作过于频繁，请 ${rate.retryAfter} 秒后再试。`,
            },
            429,
            origin,
          );
        }
        return runUserEndpointAction(() => testUserEndpoint(client, user.userId, body));
      }
      if (action === 'user-endpoint-models') {
        const rate = await checkRateLimitDb(`user_endpoint_probe:${user.userId}`, 20, 60_000);
        if (!rate.ok) {
          return jsonResponse(
            {
              ok: false,
              code: 'RATE_LIMITED',
              message: `操作过于频繁，请 ${rate.retryAfter} 秒后再试。`,
            },
            429,
            origin,
          );
        }
        return runUserEndpointAction(() => discoverUserEndpointModels(client, user.userId, body));
      }
    }
    if (action === 'clear-user-tier-cache') {
      const targetUserId = String(body?.targetUserId || '').trim();
      if (targetUserId) {
        const admin = await requireAdmin(request, client);
        if (!admin.ok) {
          return jsonResponse(
            { ok: false, code: admin.code, message: admin.message },
            admin.status,
            origin,
          );
        }
        const cleared = USER_TIER_CACHE.delete(targetUserId);
        console.log(
          `[vault] user tier cache cleared for target ${targetUserId} by admin ${admin.userId}, wasCached=${cleared}`,
        );
        return jsonResponse({ ok: true, data: { cleared } }, 200, origin);
      }
      const user = await requireUser(request, client);
      if (!user.ok) {
        return jsonResponse(
          { ok: false, code: user.code, message: user.message },
          user.status,
          origin,
        );
      }
      const cleared = USER_TIER_CACHE.delete(user.userId);
      console.log(`[vault] user tier cache cleared for ${user.userId}, wasCached=${cleared}`);
      return jsonResponse({ ok: true, data: { cleared } }, 200, origin);
    }

    const admin = await requireAdmin(request, client);
    if (!admin.ok) {
      return jsonResponse(
        { ok: false, code: admin.code, message: admin.message },
        admin.status,
        origin,
      );
    }

    // 清除内存缓存：管理员在数据面板修改模型/额度/计费配置后调用，使新配置立即生效
    if (action === 'clear-model-cache') {
      const beforeModel = MODEL_CONFIG_CACHE.size;
      const beforeQuota = QUOTA_CONFIG_CACHE.size;
      const pricingBefore = PRICING_CONFIG_CACHE?.value;
      MODEL_CONFIG_CACHE.clear();
      QUOTA_CONFIG_CACHE.clear();
      PRICING_CONFIG_CACHE = null;
      console.log(
        `[vault] caches cleared by admin, model=${beforeModel} quota=${beforeQuota} pricing=${pricingBefore ? 'cleared' : 'not-loaded'}`,
      );
      return jsonResponse({ ok: true, data: { cleared: beforeModel + beforeQuota } }, 200, origin);
    }

    if (action === 'list') {
      return jsonResponse({ ok: true, data: await listKeys(client) }, 200, origin);
    }
    if (action === 'upsert') {
      return jsonResponse(
        { ok: true, data: await upsertKey(client, admin.userId, body) },
        200,
        origin,
      );
    }
    if (action === 'status') {
      return jsonResponse(
        { ok: true, data: await updateStatus(client, admin.userId, body) },
        200,
        origin,
      );
    }
    if (action === 'delete') {
      return jsonResponse(
        { ok: true, data: await deleteKey(client, admin.userId, body) },
        200,
        origin,
      );
    }
    if (action === 'test') {
      return jsonResponse(
        { ok: true, data: await testKey(client, admin.userId, body) },
        200,
        origin,
      );
    }
    if (action === 'discover-models') {
      return jsonResponse({ ok: true, data: await discoverModels(client, body) }, 200, origin);
    }

    return jsonResponse({ ok: false, code: 'UNKNOWN_ACTION', message: '未知操作。' }, 400, origin);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'API Key 管理服务异常。';
    const status = Math.min(
      599,
      Math.max(400, Number((error as { status?: number })?.status || 500)),
    );
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
