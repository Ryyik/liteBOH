/**
 * follow-mail-send —— 关注邮件投递端
 *
 * 通道身份：
 *   1. POST action=send   —— 内部投递凭证（Bearer = BOH_PUSH_DISPATCH_KEY）。
 *      由 DB 触发器（boh_enqueue_follow_mail → net.http_post）调用，投递单条账本。
 *   2. POST action=retry  —— 同上凭证。由 pg_cron 每 5 分钟调用，批量补投未成功的。
 *
 * ⚠️ 为什么复用 push 的内部投递 key 而不是新开一个 secret：
 *    两者是同一信任级别的「DB 触发器 → EF」内部调用，再配一个 secret 只是多一处要维护的
 *    漂移点（历史上 MAIL_KEEPALIVE_TOKEN 就因为两侧不同步排查了半天）。
 *    EF 侧读 BOH_PUSH_DISPATCH_KEY，Vault 侧读 push_dispatch_key，值必须逐字节相同。
 *
 * ⚠️ 邮箱从哪来：profiles 表**没有 email 列**（这是好事，少一个泄露面）。
 *    邮箱只在 auth.users 里，通过 security definer RPC boh_get_user_emails 批量取，
 *    且只返回 email_confirmed_at 非空的 —— 未验证邮箱发信会被 Brevo 拒、且伤域名信誉。
 *
 * ⚠️ 发信走 Brevo HTTP API 而不是 SMTP：
 *    Supabase Edge Runtime 里没有可用的 SMTP 客户端，且 SMTP relay 对动态出口 IP 不友好。
 *    HTTP API 只认 api-key，配合「Brevo 后台已关闭 API keys 的 IP 限制」即可。
 */

import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const BREVO_API_KEY = String(Deno.env.get('BREVO_API_KEY') || '').trim();
const DISPATCH_KEY = String(Deno.env.get('BOH_PUSH_DISPATCH_KEY') || '').trim();
const SENDER_EMAIL = String(Deno.env.get('MAIL_SENDER_EMAIL') || 'noreply@blockofhome.cn').trim();
const SENDER_NAME = String(Deno.env.get('MAIL_SENDER_NAME') || '方块之家 BOH').trim();

/** 站点绝对地址。DB 调本函数时没有 Origin 头，只能靠 secret。 */
const SITE_ORIGIN = String(Deno.env.get('VITE_SITE_URL') || 'https://www.blockofhome.cn')
  .trim()
  .replace(/\/+$/, '');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** 单条最多试几次；超了就置 failed，不再重投 */
const MAX_ATTEMPTS = 3;
/** 兜底重投只处理「落库超过 1 分钟」的，避免和触发器的即时投递打架 */
const RETRY_MIN_AGE_MS = 60_000;
/** 邮件正文摘要上限（字符） */
const EXCERPT_MAX = 180;
/** 邮件里最多展示几张图 */
const MAX_IMAGES = 3;

type OutboxRow = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  kind: 'follow_post' | 'follow_reply';
  post_id: string | null;
  comment_id: string | null;
  status: string;
  attempts: number;
};

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const truncate = (value: unknown, max: number) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** 转义，防止帖子正文里的 < > 破坏邮件结构 */
const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Cloudinary 缩略图。
 * 原始 url 形如 https://res.cloudinary.com/<cloud>/image/upload/v123/path.png
 * 在 /upload/ 后插入变换段即可，不需要重新拼 public_id（拼错就裂图）。
 * 已经带变换的（/upload/ 后紧跟非 v 数字的段）原样返回，避免叠加两层。
 */
const thumbUrl = (url: string, width = 480) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (!raw.includes('/upload/')) return raw;
  const after = raw.split('/upload/')[1] || '';
  if (!/^v\d+\//.test(after)) return raw;
  return raw.replace('/upload/', `/upload/w_${width},q_auto,f_auto,c_limit/`);
};

const buildHtml = ({
  senderName,
  kind,
  headline,
  postTitle,
  excerpt,
  images,
  targetUrl,
}: {
  senderName: string;
  kind: 'follow_post' | 'follow_reply';
  headline: string;
  postTitle: string;
  excerpt: string;
  images: string[];
  targetUrl: string;
}) => {
  const imagesBlock = images.length
    ? `<tr><td style="padding:0 0 16px">
        ${images
          .map(
            (src) =>
              `<img src="${escapeHtml(src)}" alt="帖子配图" width="160" style="display:inline-block;width:160px;max-width:160px;height:auto;border-radius:8px;margin:0 8px 8px 0;border:1px solid #eee" />`,
          )
          .join('')}
      </td></tr>`
    : '';

  const titleBlock = postTitle
    ? `<tr><td style="padding:0 0 8px;font-size:15px;font-weight:600;color:#111">${escapeHtml(postTitle)}</td></tr>`
    : '';

  const accent = kind === 'follow_post' ? '#2f6fed' : '#0f9d58';
  const actionText = kind === 'follow_post' ? '去看看这条帖子' : '去回复 TA';

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif">
  <tr><td style="padding:0 0 18px;font-size:13px;color:#8a8f98;letter-spacing:0.3px">方块之家 BOH</td></tr>
  <tr><td style="padding:0 0 6px;font-size:17px;font-weight:600;color:#111;line-height:1.5">${escapeHtml(headline)}</td></tr>
  <tr><td style="padding:0 0 16px;font-size:13px;color:#8a8f98">你关注的人 ${escapeHtml(senderName)} ${kind === 'follow_post' ? '发布了新帖' : '回复了你'}</td></tr>
  ${titleBlock}
  <tr><td style="padding:0 0 16px;font-size:14px;color:#333;line-height:1.75">${escapeHtml(excerpt)}</td></tr>
  ${imagesBlock}
  <tr><td style="padding:0 0 22px">
    <a href="${escapeHtml(targetUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;padding:11px 22px;border-radius:999px">${actionText}</a>
  </td></tr>
  <tr><td style="padding:16px 0 0;border-top:1px solid #eef0f3;font-size:12px;color:#9aa0a6;line-height:1.7">
    你收到这封信，是因为你在「通知设置」里开启了「关注的人邮件通知」。<br>
    <a href="${SITE_ORIGIN}/#/user-space/pushplus-settings" style="color:#9aa0a6">去通知设置关闭</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
};

const buildText = (headline: string, senderName: string, excerpt: string, targetUrl: string) =>
  `${headline}\n\n你关注的人 ${senderName} 有新动态。\n\n${excerpt}\n\n查看：${targetUrl}\n\n（不想再收到？去 ${SITE_ORIGIN}/#/user-space/pushplus-settings 关闭「关注的人邮件通知」）`;

const buildPayload = async (
  client: ReturnType<typeof createServiceClient>,
  row: OutboxRow,
  email: string,
): Promise<MailPayload | null> => {
  // 发件人昵称
  let senderName = '有人';
  if (row.sender_id) {
    const { data: sender } = await client
      .from('profiles')
      .select('username')
      .eq('id', row.sender_id)
      .maybeSingle<{ username: string | null }>();
    if (sender?.username) senderName = sender.username;
  }

  if (row.kind === 'follow_post') {
    if (!row.post_id) return null;
    const { data: post } = await client
      .from('posts')
      .select('id, title, content, post_kind, status')
      .eq('id', row.post_id)
      .maybeSingle<{ id: string; title: string | null; content: string | null; post_kind: string | null; status: string | null }>();
    if (!post) return null;
    // 帖子可能已被删除或转为不可见，这时不再发
    if (post.status && post.status !== 'approved' && post.status !== 'limited') return null;

    const { data: imageRows } = await client
      .from('forum_post_images')
      .select('url, sort_order')
      .eq('post_id', row.post_id)
      .eq('moderation_status', 'approved')
      .order('sort_order', { ascending: true })
      .limit(MAX_IMAGES);

    const images = (imageRows || [])
      .map((img) => thumbUrl(String(img.url || '')))
      .filter(Boolean);

    const postTitle = truncate(post.title, 60);
    const excerpt = truncate(post.content, EXCERPT_MAX) || '（无文字内容）';
    const headline = `${senderName} 发布了新帖`;
    const targetUrl = `${SITE_ORIGIN}/#/post/${row.post_id}`;

    return {
      to: email,
      subject: postTitle ? `${senderName}：${postTitle}` : `${senderName} 发布了新帖`,
      html: buildHtml({ senderName, kind: 'follow_post', headline, postTitle, excerpt, images, targetUrl }),
      text: buildText(headline, senderName, excerpt, targetUrl),
    };
  }

  // follow_reply：评论内容 + 所在帖标题
  if (!row.comment_id) return null;
  const { data: comment } = await client
    .from('comments')
    .select('content, status')
    .eq('id', row.comment_id)
    .maybeSingle<{ content: string | null; status: string | null }>();
  if (!comment) return null;
  if (comment.status && comment.status !== 'approved') return null;

  let postTitle = '';
  if (row.post_id) {
    const { data: post } = await client
      .from('posts')
      .select('title')
      .eq('id', row.post_id)
      .maybeSingle<{ title: string | null }>();
    postTitle = truncate(post?.title, 60);
  }

  const excerpt = truncate(comment.content, EXCERPT_MAX) || '（无文字内容）';
  const headline = `${senderName} 回复了你`;
  const targetUrl = row.post_id ? `${SITE_ORIGIN}/#/post/${row.post_id}` : `${SITE_ORIGIN}/#/forum`;

  return {
    to: email,
    subject: postTitle ? `${senderName} 回复了你：${postTitle}` : `${senderName} 回复了你`,
    html: buildHtml({ senderName, kind: 'follow_reply', headline, postTitle, excerpt, images: [], targetUrl }),
    text: buildText(headline, senderName, excerpt, targetUrl),
  };
};

const sendViaBrevo = async (payload: MailPayload) => {
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.html,
      textContent: payload.text,
      tags: ['follow-mail'],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`BREVO_${response.status}: ${body.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body) as { messageId?: string };
  } catch {
    return {};
  }
};

const sendOne = async (outboxId: string) => {
  const client = createServiceClient();

  const { data: row, error: rowError } = await client
    .from('mail_outbox')
    .select('id, recipient_id, sender_id, kind, post_id, comment_id, status, attempts')
    .eq('id', outboxId)
    .maybeSingle<OutboxRow>();

  if (rowError) throw rowError;
  if (!row) return { outcome: 'failed' as const, detail: '账本行不存在' };
  if (row.status === 'sent') return { outcome: 'skipped' as const, detail: '已投递' };

  const attempts = Number(row.attempts || 0) + 1;

  // 用户可能中途把开关关了 —— 已入账但还没发的，尊重最新意图
  const { data: pref } = await client
    .from('profiles')
    .select('follow_mail_enabled')
    .eq('id', row.recipient_id)
    .maybeSingle<{ follow_mail_enabled: boolean | null }>();
  if (!pref?.follow_mail_enabled) {
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: null })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail: '收件人已关闭邮件通知' };
  }

  // 取邮箱（只返回已验证的）
  const { data: emailRows, error: emailError } = await client.rpc('boh_get_user_emails', {
    p_ids: [row.recipient_id],
  });
  if (emailError) throw emailError;
  const email = String((emailRows as Array<{ email: string | null }> | null)?.[0]?.email || '').trim();
  if (!email) {
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: '无可用邮箱' })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail: '无可用邮箱' };
  }

  const payload = await buildPayload(client, row, email);
  if (!payload) {
    // 内容已不可见（删帖 / 审核不通过）—— 重试也不会好，直接放弃
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: '内容已不可见' })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail: '内容已不可见' };
  }

  try {
    const result = await sendViaBrevo(payload);
    await client
      .from('mail_outbox')
      .update({
        status: 'sent',
        attempts,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', row.id);
    return { outcome: 'sent' as const, detail: result.messageId || undefined };
  } catch (error) {
    const detail = truncate(error instanceof Error ? error.message : String(error), 500);
    const exhausted = attempts >= MAX_ATTEMPTS;
    await client
      .from('mail_outbox')
      .update({ status: exhausted ? 'failed' : 'pending', attempts, last_error: detail })
      .eq('id', row.id);
    return { outcome: exhausted ? ('failed' as const) : ('retrying' as const), detail };
  }
};

const isDispatchAuthorized = (request: Request) => {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(DISPATCH_KEY) && token === DISPATCH_KEY;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  }

  if (!BREVO_API_KEY) {
    return jsonResponse(
      { ok: false, code: 'BREVO_KEY_MISSING', message: '邮件服务未配置（缺 BREVO_API_KEY）' },
      500,
      origin,
    );
  }

  if (!isDispatchAuthorized(request)) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED' }, 401, origin);
  }

  const body = await request.json().catch(() => ({}));
  const action = String((body as Record<string, unknown>)?.action || 'send').trim();

  if (action === 'send') {
    const outboxId = String((body as Record<string, unknown>)?.outboxId || '').trim();
    if (!outboxId) {
      return jsonResponse({ ok: false, code: 'MISSING_OUTBOX_ID' }, 400, origin);
    }
    try {
      const result = await sendOne(outboxId);
      return jsonResponse({ ok: true, ...result }, 200, origin);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          code: 'SEND_FAILED',
          message: error instanceof Error ? error.message : '投递失败',
        },
        500,
        origin,
      );
    }
  }

  if (action === 'retry') {
    const limit = Math.min(Math.max(Number((body as Record<string, unknown>)?.limit) || 20, 1), 50);
    const client = createServiceClient();
    const cutoff = new Date(Date.now() - RETRY_MIN_AGE_MS).toISOString();

    const { data: rows, error } = await client
      .from('mail_outbox')
      .select('id')
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_ATTEMPTS)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return jsonResponse({ ok: false, code: 'QUERY_FAILED', message: error.message }, 500, origin);
    }

    const results: Array<{ id: string; outcome: string }> = [];
    for (const row of rows || []) {
      try {
        const r = await sendOne(String(row.id));
        results.push({ id: String(row.id), outcome: r.outcome });
      } catch (e) {
        results.push({ id: String(row.id), outcome: `error:${String(e).slice(0, 80)}` });
      }
    }

    return jsonResponse({ ok: true, processed: results.length, results }, 200, origin);
  }

  return jsonResponse({ ok: false, code: 'UNKNOWN_ACTION' }, 400, origin);
});
