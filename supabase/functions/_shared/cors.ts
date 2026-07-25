const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:4173',
  'https://bohsite.netlify.app',
  'https://bohlite.netlify.app',
  'https://www.blockofhome.cn',
  'https://blockofhome.cn',
  String(Deno.env.get('VITE_SITE_URL') || '').trim().replace(/\/+$/, ''),
].filter(Boolean);

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;
  // 允许所有 localhost 端口
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
};

export const buildCorsHeaders = (origin: string | null, extraHeaders: string[] = []) => ({
  'Access-Control-Allow-Headers': ['authorization', 'x-client-info', 'apikey', 'content-type', ...extraHeaders].join(', '),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': origin && isOriginAllowed(origin) ? origin : 'null',
  'Access-Control-Allow-Credentials': 'true',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
});

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
