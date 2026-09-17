/**
 * Cloudflare Worker —— Gemini 反代（供 BOH `api-key-vault` 调用）
 *
 * 与「裸转 generativelanguage.googleapis.com」的差异（三点，缺一不可）：
 *   1. 路径重写：/v1/chat/completions → /v1beta/openai/chat/completions
 *      裸转会把 OpenAI 路径原样打到 Google，结果是 404。
 *   2. body 清洗：剥掉 OpenAI 专有字段（frequency_penalty / stream_options / seed ...）
 *      vault 的 buildRuntimePayload 硬编码会发 frequency_penalty（默认 0.06），
 *      AI Studio 版的兼容层不像 Vertex 那样确定静默忽略，可能直接 400。
 *   3. 响应头清理：去掉 content-encoding / content-length，避免二次解码。
 *
 * 环境变量（Cloudflare 后台 Settings → Variables and Secrets）：
 *   GEMINI_API_KEY           必填。真实的 Gemini 密钥，只存在于 Worker，不进数据库。
 *   PROXY_TOKEN              强烈建议。调用方必须带 `Authorization: Bearer <PROXY_TOKEN>`。
 *                            这样 `api_keys` 表里只需存这个令牌，真 Key 永远不外泄。
 *   GEMINI_REASONING_EFFORT  可选，默认 low。设为 off 则不注入。
 */

const UPSTREAM_ORIGIN = 'https://generativelanguage.googleapis.com';
const OPENAI_BASE = '/v1beta/openai';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};

const STRIP_FIELDS = [
  'frequency_penalty',
  'presence_penalty',
  'stream_options',
  'seed',
  'logprobs',
  'top_logprobs',
  'n',
  'parallel_tool_calls',
  'service_tier',
  'user'
];

const json = (payload, status) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });

const resolveUpstreamPath = (pathname) => {
  const path = pathname.replace(/\/{2,}/g, '/');
  if (path.startsWith(`${OPENAI_BASE}/`)) return path;
  if (path === '/v1/chat/completions') return `${OPENAI_BASE}/chat/completions`;
  if (path === '/v1/models') return `${OPENAI_BASE}/models`;
  if (path === '/v1/embeddings') return `${OPENAI_BASE}/embeddings`;
  return '';
};

const sanitizeBody = (raw, env) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw;

  for (const key of STRIP_FIELDS) delete parsed[key];

  // reasoning_effort 只有 Gemini 系认。实测 gemma-4-31b-it / gemma-4-26b-a4b-it 一旦收到
  // 这个字段就 400「Thinking level is not supported for this model」，所以按模型名前缀放行。
  const effort = String(env.GEMINI_REASONING_EFFORT ?? 'low').trim();
  const model = String(parsed.model || '');
  if (effort && effort !== 'off' && model.startsWith('gemini')) {
    parsed.reasoning_effort = effort;
  }

  return JSON.stringify(parsed);
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    if (incoming.pathname === '/health') {
      return json(
        {
          ok: true,
          keyConfigured: Boolean(env.GEMINI_API_KEY),
          tokenRequired: Boolean(env.PROXY_TOKEN),
          reasoningEffort: String(env.GEMINI_REASONING_EFFORT ?? 'low')
        },
        200
      );
    }

    if (request.method !== 'POST' && request.method !== 'GET') {
      return json({ error: { message: '仅支持 POST / GET。' } }, 405);
    }

    const upstreamPath = resolveUpstreamPath(incoming.pathname);
    if (!upstreamPath) {
      return json({ error: { message: `不支持的路径：${incoming.pathname}` } }, 404);
    }

    const callerAuth = request.headers.get('Authorization') || '';
    const proxyToken = String(env.PROXY_TOKEN || '').trim();
    const geminiKey = String(env.GEMINI_API_KEY || '').trim();

    let upstreamAuth = callerAuth;
    if (proxyToken && geminiKey) {
      if (callerAuth !== `Bearer ${proxyToken}`) {
        return json({ error: { message: 'Unauthorized' } }, 401);
      }
      upstreamAuth = `Bearer ${geminiKey}`;
    } else if (!upstreamAuth) {
      return json({ error: { message: '缺少 Authorization。' } }, 401);
    }

    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    headers.set('Authorization', upstreamAuth);
    const accept = request.headers.get('Accept');
    if (accept) headers.set('Accept', accept);

    let body;
    if (request.method === 'POST') {
      body = sanitizeBody(await request.text(), env);
    }

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM_ORIGIN}${upstreamPath}${incoming.search}`, {
        method: request.method,
        headers,
        body
      });
    } catch (err) {
      return json({ error: { message: `上游请求失败：${err.message}` } }, 502);
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    for (const [key, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(key, value);

    if ((responseHeaders.get('content-type') || '').includes('text/event-stream')) {
      responseHeaders.set('Cache-Control', 'no-cache, no-transform');
      responseHeaders.set('X-Accel-Buffering', 'no');
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  }
};
