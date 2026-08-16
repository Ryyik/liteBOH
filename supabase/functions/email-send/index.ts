import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID') || '';
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID') || '';
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID') || '';
const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

type AuthenticatedUser = {
  ok: true;
  userId: string;
  email: string;
};

type AuthError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

const verifyAuth = async (request: Request): Promise<AuthenticatedUser | AuthError> => {
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

  return { ok: true, userId: data.user.id, email: String(data.user.email || '').trim() };
};

const formatOrderTime = (value: unknown) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const sanitizeTemplateParams = (templateParams: Record<string, unknown>) => {
  const safeParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(templateParams)) {
    safeParams[key] = String(value ?? '').trim().slice(0, 5000);
  }
  return safeParams;
};

const buildMerchandiseTemplateParams = async (user: AuthenticatedUser, orderId: string): Promise<Record<string, string>> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error('订单 ID 格式无效。');
  }

  const client = createServiceClient();
  const { data: order, error: orderError } = await client
    .from('shop_points_orders')
    .select('order_no, contact_type, contact_value, items, points_used, rmb_total, payment_mode, created_at')
    .eq('id', orderId)
    .eq('user_id', user.userId)
    .maybeSingle();

  if (orderError) throw new Error('读取订单失败。');
  if (!order) throw new Error('订单不存在或无权发送该订单邮件。');

  const { data: profile } = await client
    .from('profiles')
    .select('username, role')
    .eq('id', user.userId)
    .maybeSingle();

  const items = Array.isArray(order.items) ? order.items : [];
  const productList = items.length
    ? items.map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const title = String(record.title || '未命名商品').trim();
      const specification = String(record.selected_spec_label || '默认规格').trim();
      const quantity = Math.max(1, Number(record.quantity) || 1);
      return `${title} (${specification}) x${quantity}`;
    }).join('\n- ')
    : '无商品';
  const paymentMode = String(order.payment_mode || 'points_only');
  const points = Math.max(0, Number(order.points_used) || 0);
  const rmb = Math.max(0, Number(order.rmb_total) || 0);
  const paymentSummary = paymentMode === 'rmb_only'
    ? `现金 ¥${(rmb / 100).toFixed(2)}`
    : paymentMode === 'combined'
      ? `${points} 积分 + 现金 ¥${(rmb / 100).toFixed(2)}`
      : `${points} 积分`;
  const contactLabel = order.contact_type === 'qq' ? 'QQ' : '微信';
  const buyerName = String(profile?.username || '未命名用户').trim();

  return {
    product: '方块之家周边订单',
    specifications: productList,
    giftOptions: '周边购物',
    paymentMethod: paymentSummary,
    paymentAmount: paymentSummary,
    deliveryMethod: '待管理员确认',
    totalPrice: paymentSummary,
    giftMessage: `订单号: ${order.order_no}\n账户邮箱: ${user.email || '未绑定'}\n联系方式: ${contactLabel}: ${order.contact_value}`,
    buyerName,
    buyerRole: String(profile?.role || '普通用户'),
    isLoggedIn: '是',
    orderTime: formatOrderTime(order.created_at),
  };
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

    let safeParams: Record<string, string> = {};
    if (templateType === 'merchandise_settlement') {
      const orderId = String(templateParams.orderId || '').trim();
      // H2: 结算邮件必须携带订单 ID，服务端始终以数据库快照为准，不再回退透传任意模板参数。
      if (!orderId) {
        return jsonResponse({ ok: false, code: 'MISSING_ORDER_ID', message: '缺少订单参数，无法发送结算邮件。' }, 400, origin);
      }
      safeParams = await buildMerchandiseTemplateParams(authResult, orderId);
    } else {
      safeParams = sanitizeTemplateParams(templateParams);
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
