import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { createServiceClient } from '../_shared/supabase.ts';

/* ── 发信通道：Brevo HTTP API（2026-11-02 起唯一通道）──────────────────
 *
 * 为什么从 EmailJS 换过来：EmailJS 免费额度/上游抖动会直接 502
 * （2026-11-02 02:42 用户下单那条就是 `POST | 502 | email-send`），
 * 订单已落库、通知却没送到，管理员只能靠翻后台发现。
 * 站内关注邮件（follow-mail-send）与认证邮件早就走 Brevo，
 * 密钥（BREVO_API_KEY）、发信域名（MAIL_SENDER_EMAIL）都是现成的 ——
 * 不再维护第二家供应商，这里直接用同一条通道。
 *
 * 收件人是**管理员**（订单通知本来就是给管理员看的）：
 *   ORDER_NOTICE_EMAIL 优先；没配就退回 MAIL_KEEPALIVE_RECIPIENT（站长邮箱）。
 */
const BREVO_API_KEY = String(Deno.env.get('BREVO_API_KEY') || '').trim();
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const ORDER_NOTICE_EMAIL = String(
  Deno.env.get('ORDER_NOTICE_EMAIL') || Deno.env.get('MAIL_KEEPALIVE_RECIPIENT') || '',
).trim();
const SENDER_EMAIL = String(Deno.env.get('MAIL_SENDER_EMAIL') || 'noreply@blockofhome.cn').trim();
const SENDER_NAME = String(Deno.env.get('MAIL_SENDER_NAME') || '方块之家 BOH').trim();

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
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SESSION',
      message: '登录状态已失效，请重新登录。',
    };
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
    safeParams[key] = String(value ?? '')
      .trim()
      .slice(0, 5000);
  }
  return safeParams;
};

const buildMerchandiseTemplateParams = async (
  user: AuthenticatedUser,
  orderId: string,
): Promise<Record<string, string>> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error('订单 ID 格式无效。');
  }

  const client = createServiceClient();
  const { data: order, error: orderError } = await client
    .from('shop_points_orders')
    .select(
      'order_no, contact_type, contact_value, items, points_used, rmb_total, payment_mode, created_at',
    )
    .eq('id', orderId)
    .eq('user_id', user.userId)
    .maybeSingle();

  if (orderError) throw new Error('读取订单失败。');
  if (!order) throw new Error('订单不存在或无权发送该订单邮件。');

  const { data: profile } = await client
    .from('profiles')
    .select('username, role, shipping_recipient, shipping_phone, shipping_address')
    .eq('id', user.userId)
    .maybeSingle();

  const items = Array.isArray(order.items) ? order.items : [];
  const productList = items.length
    ? items
        .map((item) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const title = String(record.title || '未命名商品').trim();
          const specification = String(record.selected_spec_label || '默认规格').trim();
          const quantity = Math.max(1, Number(record.quantity) || 1);
          return `${title} (${specification}) x${quantity}`;
        })
        .join('\n- ')
    : '无商品';
  const paymentMode = String(order.payment_mode || 'points_only');
  const points = Math.max(0, Number(order.points_used) || 0);
  const rmb = Math.max(0, Number(order.rmb_total) || 0);
  const paymentSummary =
    paymentMode === 'rmb_only'
      ? `现金 ¥${(rmb / 100).toFixed(2)}`
      : paymentMode === 'combined'
        ? `${points} 积分 + 现金 ¥${(rmb / 100).toFixed(2)}`
        : `${points} 积分`;
  /* 联系方式标签（2026-11-01）：新增 'profile' —— 结算改为一律取用户资料，
     管理员邮件里要能直接看到「收件人 / 邮箱 / 电话 / 地址」，
     不必再回后台翻订单。旧的 qq / vx 分支保留，历史订单重发邮件仍可读。 */
  const contactLabel =
    order.contact_type === 'qq' ? 'QQ' : order.contact_type === 'vx' ? '微信' : '电话';
  const buyerName = String(profile?.username || '未命名用户').trim();
  const recipient = String(profile?.shipping_recipient || '').trim();
  const phone = String(profile?.shipping_phone || '').trim();
  const address = String(profile?.shipping_address || '').trim();

  const contactLines = [
    `订单号: ${order.order_no}`,
    `昵称: ${buyerName}`,
    `账户邮箱: ${user.email || '未绑定'}`,
    `收件人: ${recipient || '（未填写）'}`,
    `电话: ${phone || order.contact_value || '（未填写）'}`,
    `地址: ${address || '（未填写）'}`,
  ];
  if (order.contact_type === 'qq' || order.contact_type === 'vx') {
    // 历史订单：手填的 QQ / 微信号仍要出现在邮件里，否则管理员联系不上
    contactLines.push(`原联系方式: ${contactLabel}: ${order.contact_value}`);
  }

  return {
    product: '方块之家周边订单',
    specifications: productList,
    giftOptions: '周边购物',
    paymentMethod: paymentSummary,
    paymentAmount: paymentSummary,
    deliveryMethod: recipient || address ? '按资料地址寄送' : '待管理员确认',
    totalPrice: paymentSummary,
    giftMessage: contactLines.join('\n'),
    buyerName: recipient || buyerName,
    buyerRole: String(profile?.role || '普通用户'),
    isLoggedIn: '是',
    orderTime: formatOrderTime(order.created_at),
  };
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type SendOutcome = { ok: true } | { ok: false; detail: string };

/**
 * 把模板参数渲染成一封「信息完整」的通知邮件。
 * 不做花哨版式 —— 管理员要的是能一眼看完商品 / 金额 / 收件人 / 电话 / 地址。
 */
const sendBrevoMail = async (
  safeParams: Record<string, string>,
  templateType: string,
): Promise<SendOutcome> => {
  if (!BREVO_API_KEY || !ORDER_NOTICE_EMAIL) {
    return { ok: false, detail: '邮件通道未配置（缺 BREVO_API_KEY 或收件邮箱）' };
  }

  const title = templateType === 'merchandise_settlement' ? '周边订单通知' : '礼物申请通知';
  const rows: Array<[string, string]> = [
    ['商品', safeParams.product || '—'],
    ['规格 / 明细', safeParams.specifications || '—'],
    [
      '支付',
      safeParams.paymentSummary || safeParams.paymentMethod || safeParams.paymentAmount || '—',
    ],
    ['收件人', safeParams.buyerName || '—'],
    ['下单时间', safeParams.orderTime || '—'],
  ];

  /* giftMessage 里是多行联系方式（订单号 / 邮箱 / 电话 / 地址），单独一段等宽展示 */
  const detailBlock = String(safeParams.giftMessage || '').trim();

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,'PingFang SC',sans-serif;color:#1d1d1f">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#86868b">BOH STORE</p>
    <h1 style="margin:0 0 18px;font-size:20px">${escapeHtml(title)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:7px 0;color:#86868b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0 7px 16px">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}
    </table>
    ${
      detailBlock
        ? `<pre style="margin:18px 0 0;padding:14px;border-radius:12px;background:#f5f5f7;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(detailBlock)}</pre>`
        : ''
    }
    <p style="margin:20px 0 0;font-size:12px;color:#86868b">订单数据以后台为准 · 本邮件由系统自动发送，请勿直接回复。</p>
  </div>
</body></html>`;

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email: ORDER_NOTICE_EMAIL }],
        subject: `[BOH] ${title} · ${safeParams.buyerName || '用户'}`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[email-send] Brevo 发送失败', {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return { ok: false, detail: `Brevo HTTP ${response.status}` };
    }
    console.log('[email-send] Brevo 发送成功', { templateType });
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[email-send] Brevo 请求异常', { detail });
    return { ok: false, detail };
  }
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  if (!BREVO_API_KEY || !ORDER_NOTICE_EMAIL) {
    return jsonResponse(
      { ok: false, code: 'MAIL_ENV_MISSING', message: '邮件服务未配置。' },
      500,
      origin,
    );
  }

  const authResult = await verifyAuth(request);
  if (!authResult.ok) {
    return jsonResponse(authResult, authResult.status, origin);
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const rateKey = `${authResult.userId}:${clientIp}`;
  const rateCheck = await checkRateLimitDb(rateKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateCheck.ok) {
    return jsonResponse(
      {
        ok: false,
        code: 'RATE_LIMITED',
        message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。`,
      },
      429,
      origin,
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const templateType = String(body?.templateType || '').trim();
    const templateParams = body?.templateParams;

    if (!templateType || !templateParams || typeof templateParams !== 'object') {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '参数不完整。' },
        400,
        origin,
      );
    }

    const allowedTemplates = ['gift', 'merchandise_settlement'];
    if (!allowedTemplates.includes(templateType)) {
      return jsonResponse(
        { ok: false, code: 'INVALID_TEMPLATE', message: '不支持的邮件模板。' },
        400,
        origin,
      );
    }

    let safeParams: Record<string, string> = {};
    if (templateType === 'merchandise_settlement') {
      const orderId = String(templateParams.orderId || '').trim();
      // H2: 结算邮件必须携带订单 ID，服务端始终以数据库快照为准，不再回退透传任意模板参数。
      if (!orderId) {
        return jsonResponse(
          { ok: false, code: 'MISSING_ORDER_ID', message: '缺少订单参数，无法发送结算邮件。' },
          400,
          origin,
        );
      }
      safeParams = await buildMerchandiseTemplateParams(authResult, orderId);
    } else {
      safeParams = sanitizeTemplateParams(templateParams);
    }

    const sent = await sendBrevoMail(safeParams, templateType);
    if (sent.ok) {
      return jsonResponse({ ok: true, message: '邮件发送成功。', channel: 'brevo' }, 200, origin);
    }

    return jsonResponse(
      { ok: false, code: 'MAIL_SEND_FAILED', message: sent.detail || '邮件发送失败。' },
      502,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'EMAIL_SEND_FAILED',
        message: error instanceof Error ? error.message : '邮件发送失败。',
      },
      500,
      origin,
    );
  }
});
