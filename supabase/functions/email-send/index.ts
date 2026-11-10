import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { getClientIp } from '../_shared/client-ip.ts';
import { createServiceClient } from '../_shared/supabase.ts';
/* 与用户侧订单邮件同一套 Apple 极简主题：管理员这封也是「同一家发的」，
   不能再是 16px 圆角 + #2f6fed 的另一套壳。 */
import {
  MAIL_COLOR,
  MAIL_GAP,
  mailButton,
  mailCard,
  mailDivider,
  mailDocument,
  mailEyebrow,
  mailFooter,
  mailSpacer,
  mailTitle,
} from '../_shared/mail-theme.ts';

/* ── 发信通道：Brevo HTTP API（2026-11-02 起唯一通道）──────────────────
 *
 * 为什么从 EmailJS 换过来：EmailJS 免费额度/上游抖动会直接 502
 * （2026-11-02 02:42 用户下单那条就是 `POST | 502 | email-send`），
 * 订单已落库、通知却没送到，管理员只能靠翻后台发现。
 * 站内关注邮件（follow-mail-send）与认证邮件早就走 Brevo，
 * 密钥（BREVO_API_KEY）、发信域名（MAIL_SENDER_EMAIL）都是现成的 ——
 * 不再维护第二家供应商，这里直接用同一条通道。
 *
 * 收件人（2026-11-03 修正）：**管理员账号绑定的邮箱**。
 *   旧实现读 `ORDER_NOTICE_EMAIL`，线上从没配过 ⇒ 回落
 *   `MAIL_KEEPALIVE_RECIPIENT`（站长个人 Gmail，那个值本来是保活探针用的），
 *   结果订单邮件全进了私人 Gmail，QQ 邮箱一封都收不到。
 *   现在按 `profiles.role='admin'` 反查 `auth.users.email` 动态解析：
 *   管理员换登录邮箱会自动跟上，也不用再维护一份容易忘配的环境变量。
 *   `ORDER_NOTICE_EMAIL` 只作**兜底**保留（管理员行读不到时才用），
 *   **不再回落到 MAIL_KEEPALIVE_RECIPIENT** —— 回落回去就等于重放这个 bug。
 */
const BREVO_API_KEY = String(Deno.env.get('BREVO_API_KEY') || '').trim();
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const FALLBACK_NOTICE_EMAIL = String(Deno.env.get('ORDER_NOTICE_EMAIL') || '').trim();
const SENDER_EMAIL = String(Deno.env.get('MAIL_SENDER_EMAIL') || 'noreply@blockofhome.cn').trim();
const SENDER_NAME = String(Deno.env.get('MAIL_SENDER_NAME') || '方块之家 BOH').trim();
/** 后台深链要用绝对地址（邮件里没有当前站点上下文） */
const SITE_ORIGIN = String(Deno.env.get('VITE_SITE_URL') || 'https://www.blockofhome.cn')
  .trim()
  .replace(/\/+$/, '');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** 'merchandise_settlement'=下单结算通知；'shop_order_cancelled'=用户取消订单通知 */
type OrderMailKind = 'merchandise_settlement' | 'shop_order_cancelled';

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

/**
 * 解析管理员收件邮箱：profiles.role='admin' → auth.users.email。
 *
 * ⚠️ 邮箱只能从 auth.users 取 —— `profiles.email` 早已被收口（2026062202 /
 *    2026110308），从 profiles 读只会得到空值或 403。
 * ⚠️ 单个管理员读取失败只跳过本人，不让整封邮件失败（多管理员时互为冗余）。
 */
const resolveAdminRecipients = async (
  client: ReturnType<typeof createServiceClient>,
): Promise<string[]> => {
  const collected: string[] = [];

  const { data: admins, error: adminError } = await client
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (adminError) {
    console.error('[email-send] 读取管理员列表失败', { detail: adminError.message });
  }

  for (const admin of Array.isArray(admins) ? admins : []) {
    const id = String((admin as Record<string, unknown>)?.id || '').trim();
    if (!id) continue;
    const { data, error } = await client.auth.admin.getUserById(id);
    if (error) {
      console.error('[email-send] 读取管理员邮箱失败', { id, detail: error.message });
      continue;
    }
    const email = String(data?.user?.email || '').trim();
    if (EMAIL_PATTERN.test(email)) collected.push(email);
  }

  // 去重（大小写不敏感），保留首次出现的原始写法
  const seen = new Set<string>();
  const recipients = collected.filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!recipients.length && EMAIL_PATTERN.test(FALLBACK_NOTICE_EMAIL)) {
    recipients.push(FALLBACK_NOTICE_EMAIL);
  }
  return recipients;
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

const buildOrderTemplateParams = async (
  user: AuthenticatedUser,
  orderId: string,
  kind: OrderMailKind,
): Promise<Record<string, string>> => {
  if (!ORDER_ID_PATTERN.test(orderId)) {
    throw new Error('订单 ID 格式无效。');
  }

  const client = createServiceClient();
  const { data: order, error: orderError } = await client
    .from('shop_points_orders')
    .select(
      'order_no, contact_type, contact_value, items, points_used, rmb_total, payment_mode, status, created_at, updated_at',
    )
    .eq('id', orderId)
    .eq('user_id', user.userId)
    .maybeSingle();

  if (orderError) throw new Error('读取订单失败。');
  if (!order) throw new Error('订单不存在或无权发送该订单邮件。');
  /* 取消通知只对「确实已取消」的订单发：否则这个模板就变成任意订单的群发口子
     （EF 端鉴权只到「这是你的订单」，到不了「这单到底发生了什么」）。 */
  if (kind === 'shop_order_cancelled' && String(order.status || '') !== 'cancelled') {
    throw new Error('订单尚未取消，无法发送取消通知。');
  }

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
    `电话: ${maskPhone(phone || order.contact_value) || '（未填写）'}`,
    `地址: ${address || '（未填写）'}`,
  ];
  if (order.contact_type === 'qq' || order.contact_type === 'vx') {
    // 历史订单：手填的 QQ / 微信号仍要出现在邮件里，否则管理员联系不上
    contactLines.push(`原联系方式: ${contactLabel}: ${order.contact_value}`);
  }
  if (kind === 'shop_order_cancelled') {
    contactLines.push('当前状态: 已取消（用户自助）');
    contactLines.push(`取消时间: ${formatOrderTime(order.updated_at)}`);
    // cancel_shop_order 是全额退回 points_used，这里的数字就是实际到账积分
    contactLines.push(points > 0 ? `已退回: ${points} 积分` : '已退回: 无积分退款');
  }

  const isCancelled = kind === 'shop_order_cancelled';
  return {
    /* 后台深链的定位参数。原来邮件里**一个链接都没有** —— 管理员读完商品和地址，
       还得自己去后台列表里按订单号找那一行。 */
    orderId,
    product: isCancelled ? '方块之家周边订单（已取消）' : '方块之家周边订单',
    specifications: productList,
    giftOptions: isCancelled ? '周边订单取消' : '周边购物',
    paymentMethod: paymentSummary,
    paymentAmount: paymentSummary,
    deliveryMethod: isCancelled
      ? '无需发货'
      : recipient || address
        ? '按资料地址寄送'
        : '待管理员确认',
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

/**
 * 手机号脱敏（2026-11-10）。
 *
 * 起因：订单通知邮件被 QQ 在 SMTP 层硬退（`blocked by Admin`），同一发件人/收件人/IP 段的
 * 生日邮件、密码重置、回复通知都能送达 —— 差别只在正文。订单模板正文里同时出现
 * 「姓名 + 完整手机号 + 详细地址 + 金额」，是反垃圾系统判定诈骗/钓鱼的典型特征组合。
 *
 * 这里保留首 3 末 4（管理员核对身份够用），完整号码走「在后台打开」的深链。
 * ⚠️ 不要把这里改成完整号码 —— 那是刚被 QQ 拒收的那个版本。
 */
const maskPhone = (value: string) => {
  const digits = String(value || '').replace(/\s/g, '');
  if (digits.length < 8) return digits;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

type SendOutcome = { ok: true } | { ok: false; detail: string };

/* 标题刻意不带「通知」二字、也不再套 `[BOH]` 方括号前缀（2026-11-10）：
   方括号品牌前缀 + 「通知」是国内邮箱反垃圾最常命中的两个营销特征，而这类信只是
   给管理员看的业务提醒，不需要品牌前缀。改完仍要能一眼看出是什么事，所以保留事件词。 */
const MAIL_TITLES: Record<string, string> = {
  gift: '礼物申请',
  merchandise_settlement: '周边订单',
  shop_order_cancelled: '周边订单已取消',
};

/**
 * 把模板参数渲染成一封「信息完整」的通知邮件。
 * 不做花哨版式 —— 管理员要的是能一眼看完商品 / 金额 / 收件人 / 电话 / 地址。
 */
const sendBrevoMail = async (
  safeParams: Record<string, string>,
  templateType: string,
  recipients: string[],
): Promise<SendOutcome> => {
  if (!BREVO_API_KEY) {
    return { ok: false, detail: '邮件通道未配置（缺 BREVO_API_KEY）' };
  }
  if (!recipients.length) {
    return { ok: false, detail: '未解析到管理员收件邮箱' };
  }

  const title = MAIL_TITLES[templateType] || '订单通知';
  const isCancelled = templateType === 'shop_order_cancelled';

  /** 多行值（规格明细 / 地址）必须显式换行 —— <td> 不认 \n，不转就直接挤成一行 */
  const cell = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');

  /** 两列表：label 定宽灰、value 黑。无边框，靠行距承担分组 —— 与用户侧订单邮件同一套语言 */
  const renderRows = (list: Array<[string, string]>) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${list
      .map(
        ([label, value]) =>
          `<tr><td width="88" valign="top" style="padding:8px 12px 8px 0;font-size:13px;line-height:1.5;color:${MAIL_COLOR.ink3};white-space:nowrap">${escapeHtml(label)}</td><td valign="top" style="padding:8px 0;font-size:14px;line-height:1.55;color:${MAIL_COLOR.ink}">${cell(value)}</td></tr>`,
      )
      .join('')}</table>`;

  const orderRows: Array<[string, string]> = [
    ['商品', safeParams.product || '—'],
    ['规格 / 明细', safeParams.specifications || '—'],
    [
      '支付',
      safeParams.paymentSummary || safeParams.paymentMethod || safeParams.paymentAmount || '—',
    ],
    ['配送', safeParams.deliveryMethod || '—'],
    ['下单时间', safeParams.orderTime || '—'],
  ];

  /* 「收件人」刻意**不**放进上面那块：联系方式块里已经有一行「收件人」，两块都放会重复；
     而且管理员核对地址时要连着电话一起看，拆到两块反而难对。 */

  /** giftMessage 是服务端拼的「label: value」多行文本 → 拆成两列（原来的等宽 <pre> 块
   *  在 Apple 体系里很突兀，而且等宽字体的中文是回落的，看着并不「等宽」）。 */
  const contactRows: Array<[string, string]> = String(safeParams.giftMessage || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): [string, string] => {
      const at = line.indexOf(':');
      return at < 0 ? ['', line] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    });

  /* 取消类三行（状态 / 时间 / 已退回）属于**订单事实**，必须跟着商品与金额那一块走。
     留在「联系方式」尾部的话，管理员得上下两头对「扣了多少 / 退了多少」，很容易看漏。
     数据仍由服务端 giftMessage 统一拼装，这里只做分组，不改上游结构。 */
  const CANCEL_LABELS = ['当前状态', '取消时间', '已退回'];
  const isCancelRow = (row: [string, string]) => CANCEL_LABELS.includes(row[0]);
  const cancelRows = contactRows.filter(isCancelRow);
  const contactOnly = contactRows.filter((row) => !isCancelRow(row));

  /* 后台深链：原来这封邮件**一个链接都没有**，管理员读完商品和地址还得去后台列表里
     按订单号找那一行。路由真源 = /admin/data-management/:tab/:id，tab 用 tabs.js 的 id。 */
  const orderId = String(safeParams.orderId || '').trim();
  const adminLink = ORDER_ID_PATTERN.test(orderId)
    ? `${SITE_ORIGIN}/#/admin/data-management/shopOrders/${orderId}`
    : '';

  const html = mailDocument({
    preheader: `${title} · ${safeParams.buyerName || '用户'}${isCancelled ? '（已取消）' : ''}`,
    body: [
      mailCard(
        [
          mailEyebrow('方块之家 BOH'),
          mailTitle(escapeHtml(title), 24),
          mailSpacer(MAIL_GAP.m),
          renderRows([...orderRows, ...cancelRows]),
          contactOnly.length
            ? [
                mailSpacer(MAIL_GAP.l),
                mailDivider(),
                mailSpacer(MAIL_GAP.m),
                `<div style="font-size:12px;letter-spacing:.12em;color:${MAIL_COLOR.ink3}">联系方式</div>`,
                mailSpacer(MAIL_GAP.s),
                renderRows(contactOnly),
              ].join('')
            : '',
          adminLink
            ? [
                mailSpacer(MAIL_GAP.l),
                `<div style="text-align:center">${mailButton(adminLink, '在后台打开')}</div>`,
              ].join('')
            : '',
        ].join(''),
      ),
      mailFooter('订单数据以后台为准 · 本邮件由系统自动发送，请勿直接回复。'),
    ].join(''),
  });

  /* 纯文本替代部分（2026-11-10）：原来只发 htmlContent。
     只有 HTML 的邮件在国内邮箱的评分里明显吃亏，而 follow-mail-send 一直是带 textContent 的。
     文本版按「label: value」逐行拼，与 HTML 两列表同源，避免两处描述打架。 */
  const plainRows = (list: Array<[string, string]>) =>
    list.map(([label, value]) => (label ? `${label}: ${value}` : value)).join('\n');
  const textBody = [
    title,
    '',
    plainRows([...orderRows, ...cancelRows]),
    contactOnly.length ? `\n联系方式\n${plainRows(contactOnly)}` : '',
    adminLink ? `\n在后台打开: ${adminLink}` : '',
    '\n订单数据以后台为准 · 本邮件由系统自动发送，请勿直接回复。',
  ]
    .filter((part) => part !== '')
    .join('\n');

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
        to: recipients.map((email) => ({ email })),
        subject: `${title} · ${safeParams.buyerName || '用户'}`,
        htmlContent: html,
        textContent: textBody,
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
    console.log('[email-send] Brevo 发送成功', { templateType, recipients: recipients.length });
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

  if (!BREVO_API_KEY) {
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

  // IP 口径统一走 _shared/client-ip.ts（xff 首段是客户端可写的）
  const clientIp = getClientIp(request);
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

    const allowedTemplates = ['gift', 'merchandise_settlement', 'shop_order_cancelled'];
    if (!allowedTemplates.includes(templateType)) {
      return jsonResponse(
        { ok: false, code: 'INVALID_TEMPLATE', message: '不支持的邮件模板。' },
        400,
        origin,
      );
    }

    let safeParams: Record<string, string> = {};
    if (templateType === 'merchandise_settlement' || templateType === 'shop_order_cancelled') {
      const orderId = String(templateParams.orderId || '').trim();
      // H2: 结算邮件必须携带订单 ID，服务端始终以数据库快照为准，不再回退透传任意模板参数。
      if (!orderId) {
        return jsonResponse(
          { ok: false, code: 'MISSING_ORDER_ID', message: '缺少订单参数，无法发送订单邮件。' },
          400,
          origin,
        );
      }
      safeParams = await buildOrderTemplateParams(
        authResult,
        orderId,
        templateType as OrderMailKind,
      );
    } else {
      safeParams = sanitizeTemplateParams(templateParams);
    }

    const recipients = await resolveAdminRecipients(createServiceClient());
    const sent = await sendBrevoMail(safeParams, templateType, recipients);
    if (sent.ok) {
      return jsonResponse(
        {
          ok: true,
          message: '邮件发送成功。',
          channel: 'brevo',
          recipients: recipients.length,
        },
        200,
        origin,
      );
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
