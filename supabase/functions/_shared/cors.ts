const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://bohsite.netlify.app',
  'https://bohlite.netlify.app',
  'https://www.blockofhome.cn',
  'https://blockofhome.cn',
  String(Deno.env.get('VITE_SITE_URL') || '').trim().replace(/\/+$/, ''),
].filter(Boolean);

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
};

export const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0] || '',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
});

export const jsonResponse = (
  body: unknown,
  status = 200,
  origin: string | null = null,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
