const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://bohsite.netlify.app',
  'https://bohlite.netlify.app',
  'https://www.blockofhome.cn',
  'https://blockofhome.cn',
  String(Deno.env.get('VITE_SITE_URL') || '').trim().replace(/\/+$/, ''),
].filter(Boolean);

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;
  // M4: 仅使用精确列表匹配，移除任意 localhost 端口前缀匹配以避免绕过 ALLOWED_ORIGINS。
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
};

export const buildCorsHeaders = (origin: string | null, extraHeaders: string[] = []) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ['authorization', 'x-client-info', 'apikey', 'content-type', ...extraHeaders].join(', '),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  // M5: 拒绝的 origin 直接省略 ACAO 头（浏览器按同源策略拦截）。
  // 不再回退 'null' —— Origin: null（沙盒 iframe / file://）也是可被允许的合法值，回退会意外放行这些来源。
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

export const jsonResponse = (
  body: unknown,
  status = 200,
  origin: string | null = null,
  extraHeaders: string[] = [],
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin, extraHeaders),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
