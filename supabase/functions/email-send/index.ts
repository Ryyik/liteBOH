import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';

const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID') || '';
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID') || '';
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID') || '';
const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const verifyAuth = async (request: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; code: string; message: string }> => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: '缺少登录凭证。' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, code: 'ENV_MISSING', message: '服务器配置缺失。' };
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效，请重新登录。' };
  }

  return { ok: true, userId: data.user.id };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_USER_ID) {
    return jsonResponse({ ok: false, code: 'EMAILJS_ENV_MISSING', message: '邮件服务未配置。' }, 500, origin);
  }

  const authResult = await verifyAuth(request);
  if (!authResult.ok) {
    return jsonResponse(authResult, authResult.status, origin);
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rateKey = `${authResult.userId}:${clientIp}`;
  const rateCheck = await checkRateLimitDb(rateKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateCheck.ok) {
    return jsonResponse(
      { ok: false, code: 'RATE_LIMITED', message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。` },
      429,
      origin,
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const templateType = String(body?.templateType || '').trim();
    const templateParams = body?.templateParams;

    if (!templateType || !templateParams || typeof templateParams !== 'object') {
      return jsonResponse({ ok: false, code: 'INVALID_INPUT', message: '参数不完整。' }, 400, origin);
    }

    const allowedTemplates = ['gift', 'merchandise_settlement'];
    if (!allowedTemplates.includes(templateType)) {
      return jsonResponse({ ok: false, code: 'INVALID_TEMPLATE', message: '不支持的邮件模板。' }, 400, origin);
    }

    const safeParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateParams)) {
      safeParams[key] = String(value ?? '').trim().slice(0, 5000);
    }

    const response = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_USER_ID,
        template_params: safeParams,
      }),
    });

    const result = await response.text();
    if (!response.ok) {
      return jsonResponse({ ok: false, code: 'EMAILJS_FAILED', message: result || '邮件发送失败。' }, 502, origin);
    }

    return jsonResponse({ ok: true, message: '邮件发送成功。' }, 200, origin);
  } catch (error) {
    return jsonResponse(
      { ok: false, code: 'EMAIL_SEND_FAILED', message: error instanceof Error ? error.message : '邮件发送失败。' },
      500,
      origin,
    );
  }
});
