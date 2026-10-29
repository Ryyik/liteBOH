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
 *    漂移点。EF 侧读 BOH_PUSH_DISPATCH_KEY，Vault 侧读 push_dispatch_key，值必须逐字节相同。
 *
 * ⚠️ 邮箱从哪来：profiles 表**没有 email 列**（这是好事，少一个泄露面）。
 *    邮箱只在 auth.users 里，通过 security definer RPC boh_get_user_emails 批量取，
 *    且只返回 email_confirmed_at 非空的 —— 未验证邮箱发信会被 Brevo 拒、且伤域名信誉。
 *
 * ⚠️ 发信走 Brevo HTTP API 而不是 SMTP：Edge Runtime 里没有可用 SMTP 客户端，
 *    HTTP API 只认 api-key（Brevo 后台需关闭 API keys 的 IP 限制）。
 *
 * ── 渲染形态（2026-10-29 定稿，三种）────────────────────────────────
 *   ① 杂志风：内容 = 单条发帖（无回复）。大图顶置 + 大标题 + 署名行 + 文字链接。
 *      「最激进」的方向 —— 单帖没有列表要表达，就把帖子本身当杂志封面。
 *   ② 行卡·单回复：内容 = 单条回复。引号占位 + 「在《帖子》下」上下文 + 评论内容。
 *   ③ 行卡·聚合：多条动作按 发帖/回复 分组，新帖行卡带 44px 首图缩略。
 *   三种共享页眉/页脚；发帖=蓝系、回复=绿系（头像底色与按钮同色）。
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
/** 邮件正文摘要上限（字符） */
const EXCERPT_MAX = 180;
/** 聚合邮件最多渲染的动态条数（超出部分静默截断，防单封邮件体积失控） */
const MAX_ENTRIES = 8;

type OutboxRow = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  kind: 'follow_post' | 'follow_reply';
  post_id: string | null;
  comment_id: string | null;
  status: string;
  attempts: number;
  extra_items: Array<{
    kind: string;
    post_id: string | null;
    comment_id: string | null;
  }> | null;
};

/** 一条动态渲染所需的全部数据（主条目与聚合条目同构） */
type MailEntry = {
  kind: 'follow_post' | 'follow_reply';
  title: string;
  excerpt: string;
  /** 帖子首图小缩略（w_120，行卡用）；回复恒空 */
  thumbUrl: string;
  /** 帖子首图大图（w_600，杂志风顶置用）；回复恒空 */
  heroUrl: string;
  /** 回复的上下文（在《帖子》下）；发帖恒空 */
  contextText: string;
  targetUrl: string;
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
 * Cloudinary 缩略图：在 /upload/ 后插变换段（不重拼 public_id，拼错就裂图）。
 * 已带变换的原样返回，避免叠加两层。
 */
const thumbUrl = (url: string, width: number) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (!raw.includes('/upload/')) return raw;
  const after = raw.split('/upload/')[1] || '';
  if (!/^v\d+\//.test(after)) return raw;
  return raw.replace('/upload/', `/upload/w_${width},q_auto,f_auto,c_limit/`);
};

/* ────────────────────────── 条目加载 ────────────────────────── */

const loadMailEntry = async (
  client: ReturnType<typeof createServiceClient>,
  kind: string,
  postId: string | null,
  commentId: string | null,
): Promise<MailEntry | null> => {
  if (kind === 'follow_post' && postId) {
    const { data: post } = await client
      .from('posts')
      .select('title, content, status')
      .eq('id', postId)
      .maybeSingle<{ title: string | null; content: string | null; status: string | null }>();
    if (!post) return null;
    if (post.status && post.status !== 'approved' && post.status !== 'limited') return null;

    const { data: img } = await client
      .from('forum_post_images')
      .select('url')
      .eq('post_id', postId)
      .eq('moderation_status', 'approved')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle<{ url: string | null }>();

    return {
      kind: 'follow_post',
      title: truncate(post.title, 60) || '（无标题）',
      excerpt: truncate(post.content, EXCERPT_MAX) || '（无文字内容）',
      thumbUrl: img?.url ? thumbUrl(String(img.url), 120) : '',
      heroUrl: img?.url ? thumbUrl(String(img.url), 600) : '',
      contextText: '',
      targetUrl: `${SITE_ORIGIN}/#/post/${postId}`,
    };
  }

  if (kind === 'follow_reply' && commentId) {
    const { data: comment } = await client
      .from('comments')
      .select('content, status, post_id')
      .eq('id', commentId)
      .maybeSingle<{ content: string | null; status: string | null; post_id: string | null }>();
    if (!comment) return null;
    if (comment.status && comment.status !== 'approved') return null;

    let contextText = '在你的帖子下';
    if (comment.post_id) {
      const { data: post } = await client
        .from('posts')
        .select('title')
        .eq('id', comment.post_id)
        .maybeSingle<{ title: string | null }>();
      contextText = post?.title ? `在你帖子《${truncate(post.title, 40)}》下` : contextText;
    }

    return {
      kind: 'follow_reply',
      title: truncate(comment.content, 60),
      excerpt: truncate(comment.content, EXCERPT_MAX) || '（无文字内容）',
      thumbUrl: '',
      heroUrl: '',
      contextText,
      targetUrl: comment.post_id
        ? `${SITE_ORIGIN}/#/post/${comment.post_id}`
        : `${SITE_ORIGIN}/#/forum`,
    };
  }

  return null;
};

/* ────────────────────────── HTML 渲染 ────────────────────────── */

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/** 发帖=蓝系、回复=绿系：头像底色与按钮同源，扫一眼即知动作类型。
 *  ⚠️ 显式 Record<MailKind, …>：写成字面量对象再拿 string 索引会触发 TS7053（CI deno check 阻断过一次）。 */
type MailKind = 'follow_post' | 'follow_reply';

const TONE: Record<MailKind, { avatarBg: string; avatarColor: string; button: string }> = {
  follow_post: { avatarBg: '#E6F1FB', avatarColor: '#185FA5', button: '#2f6fed' },
  follow_reply: { avatarBg: '#E1F5EE', avatarColor: '#0F6E56', button: '#0f9d58' },
};

const avatarBlock = (senderName: string, kind: MailKind, size: number) => {
  const tone = TONE[kind] || TONE.follow_post;
  const initial = escapeHtml([...senderName][0] || '方');
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${tone.avatarBg};color:${tone.avatarColor};display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.4)}px;font-weight:500;">${initial}</div>`;
};

/** 页眉 + 页脚的公共壳（三种形态共用） */
const buildShell = (inner: string) =>
  `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;font-family:${FONT_STACK};border:0.5px solid #eef0f3">
${inner}
<tr><td style="padding:14px 22px 18px;border-top:0.5px solid #eef0f3;font-size:12px;color:#9aa0a6;line-height:1.7">你在「通知设置」开启了关注邮件通知 · <a href="${SITE_ORIGIN}/#/user-space/pushplus-settings" style="color:#2f6fed">去关闭</a></td></tr>
</table>
</td></tr></table>
</body></html>`;

/** 行卡：发帖（44 缩略 + 标题 + 摘要）与回复（引号 + 上下文 + 内容）同构 */
const entryRow = (entry: MailEntry, withDivider: boolean) => {
  const divider = withDivider ? 'border-bottom:0.5px solid #eef0f3;' : '';
  const thumb = entry.thumbUrl
    ? `<img src="${escapeHtml(entry.thumbUrl)}" alt="" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:8px;object-fit:cover;border:0;" />`
    : `<div style="flex-shrink:0;width:44px;height:44px;border-radius:8px;background:${TONE[entry.kind].avatarBg};color:${TONE[entry.kind].avatarColor};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500;">${escapeHtml([...entry.title][0] || '方')}</div>`;

  const body =
    entry.kind === 'follow_reply'
      ? `<div style="min-width:0;">
          <div style="font-size:12px;color:#8a8f98;margin-bottom:2px;">${escapeHtml(entry.contextText)}</div>
          <div style="font-size:13px;color:#333;line-height:1.55;">${escapeHtml(entry.excerpt)}</div>
        </div>`
      : `<div style="min-width:0;">
          <div style="font-size:13px;font-weight:500;color:#111;">${escapeHtml(entry.title)}</div>
          <div style="font-size:12px;color:#8a8f98;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(entry.excerpt)}</div>
        </div>`;

  return `<div style="display:flex;gap:10px;padding:10px;${divider}">${thumb}${body}</div>`;
};

/** 形态②/③：头像行 + 分组行卡 + 胶囊按钮 */
const buildCardsHtml = (senderName: string, entries: MailEntry[], digest: boolean) => {
  const kind = entries[0].kind;
  const tone = TONE[kind];
  const n = entries.length;

  const posts = entries.filter((e) => e.kind === 'follow_post');
  const replies = entries.filter((e) => e.kind === 'follow_reply');

  const group = (label: string, list: MailEntry[]) =>
    list.length
      ? `<tr><td style="padding:0 22px 14px">
          <div style="font-size:12px;font-weight:500;color:#8a8f98;letter-spacing:0.5px;margin-bottom:8px">${escapeHtml(label)} · ${list.length}</div>
          <div style="border:0.5px solid #eef0f3;border-radius:10px;overflow:hidden">
            ${list.map((e, i) => entryRow(e, i < list.length - 1)).join('')}
          </div>
        </td></tr>`
      : '';

  const buttonLabel = n === 1 ? (kind === 'follow_reply' ? '去回复 TA' : '去看看这条帖子') : '查看全部动态';
  const targetUrl = entries[0].targetUrl;
  const headline =
    n === 1
      ? `${senderName} ${kind === 'follow_reply' ? '回复了你' : '发布了新帖'}`
      : `${senderName} 的 ${n} 条新动态`;
  const headSub = `${digest ? '聚合摘要' : '及时通知'}${n === 1 ? '' : ` · 窗口内已合并 ${n} 条`}`;

  return `<tr><td style="padding:18px 22px 14px">
      <div style="font-size:12px;color:#8a8f98;letter-spacing:0.3px;margin-bottom:16px">方块之家 BOH</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        ${avatarBlock(senderName, kind, 40)}
        <div>
          <div style="font-size:15px;font-weight:500;color:#111">${escapeHtml(headline)}</div>
          <div style="font-size:12px;color:#8a8f98">${escapeHtml(headSub)}</div>
        </div>
      </div>
    </td></tr>
    ${group('新帖', posts)}
    ${group('回复', replies)}
    <tr><td style="padding:2px 22px 18px;text-align:center">
      <a href="${escapeHtml(targetUrl)}" style="display:inline-block;background:${tone.button};color:#ffffff;text-decoration:none;font-size:14px;padding:10px 26px;border-radius:999px">${escapeHtml(buttonLabel)}</a>
    </td></tr>`;
};

/** 形态①：杂志风 —— 大图顶置 + 大标题 + 署名行 + 文字链接（单帖专属） */
const buildMagazineHtml = (senderName: string, entry: MailEntry) => `
<tr>${entry.heroUrl ? `<td style="padding:0"><img src="${escapeHtml(entry.heroUrl)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0;" /></td>` : `<td style="padding:0"><div style="height:150px;background:#E6F1FB"></div></td>`}</tr>
<tr><td style="padding:18px 22px 6px">
      <div style="font-size:12px;color:#8a8f98;letter-spacing:0.3px">方块之家 BOH · 关注动态</div>
    </td></tr>
<tr><td style="padding:0 22px 10px">
      <div style="font-size:20px;font-weight:500;color:#111;line-height:1.35">${escapeHtml(entry.title)}</div>
    </td></tr>
<tr><td style="padding:0 22px 12px">
      <div style="display:flex;align-items:center;gap:8px">
        ${avatarBlock(senderName, 'follow_post', 26)}
        <span style="font-size:13px;color:#555">${escapeHtml(senderName)} · 刚刚</span>
      </div>
    </td></tr>
<tr><td style="padding:0 22px 14px">
      <p style="font-size:13px;color:#333;line-height:1.7;margin:0">${escapeHtml(entry.excerpt)}</p>
    </td></tr>
<tr><td style="padding:0 22px 18px">
      <a href="${escapeHtml(entry.targetUrl)}" style="font-size:14px;color:#2f6fed;text-decoration:none">在浏览器中查看 →</a>
    </td></tr>`;

/* ────────────────────────── 纯文本版 ────────────────────────── */

const buildTextVersion = (senderName: string, entries: MailEntry[], digest: boolean) => {
  const n = entries.length;
  const lines = entries.map((e) =>
    e.kind === 'follow_post'
      ? `· 新帖：${e.title}${e.excerpt ? ` —— ${e.excerpt}` : ''}`
      : `· 回复（${e.contextText}）：${e.excerpt}`,
  );
  const head =
    n === 1
      ? `${senderName} ${entries[0].kind === 'follow_reply' ? '回复了你' : '发布了新帖'}`
      : `${senderName} 的 ${n} 条新动态`;
  const windowNote = digest ? `（聚合摘要，窗口内动作已合并）` : '';
  return [
    head,
    windowNote,
    '',
    ...lines,
    '',
    `查看：${entries[0].targetUrl}`,
    '',
    `（不想再收到？去 ${SITE_ORIGIN}/#/user-space/pushplus-settings 关闭「关注的人邮件通知」）`,
  ].join('\n');
};

/* ────────────────────────── 投递 ────────────────────────── */

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
    .select('id, recipient_id, sender_id, kind, post_id, comment_id, status, attempts, extra_items')
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

  // 主条目 + 聚合条目 → 统一条目（加载失败/已删的条目被过滤，全部失效则放弃）
  const rawItems = [
    { kind: row.kind, post_id: row.post_id, comment_id: row.comment_id },
    ...(row.extra_items || []),
  ].slice(0, MAX_ENTRIES);

  const entries: MailEntry[] = [];
  for (const item of rawItems) {
    const entry = await loadMailEntry(
      client,
      item.kind === 'follow_reply' ? 'follow_reply' : 'follow_post',
      item.post_id,
      item.comment_id,
    );
    if (entry) entries.push(entry);
  }

  if (!entries.length) {
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: '内容已不可见' })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail: '内容已不可见' };
  }

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

  // 渲染分支：单帖无回复 = 杂志风；其余 = 行卡体系
  // digest 判定用「实际条目数」而不是 delivery 快照 —— 及时模式同窗单条也走杂志风
  const digest = entries.length > 1;
  const isMagazine = entries.length === 1 && entries[0].kind === 'follow_post';
  const html = isMagazine
    ? buildShell(buildMagazineHtml(senderName, entries[0]))
    : buildShell(buildCardsHtml(senderName, entries, digest));
  const text = buildTextVersion(senderName, entries, digest);

  const subject = isMagazine
    ? `${senderName}：${entries[0].title}`
    : entries.length === 1 && entries[0].kind === 'follow_reply'
      ? `${senderName} 回复了你`
      : `${senderName} 的 ${entries.length} 条新动态`;

  const payload: MailPayload = { to: email, subject, html, text };

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

    // due_at 统一两种投递模式：
    //   instant = 入账 + 60s（即时投递失败后的重投节奏）
    //   digest  = 入账 + 窗口（聚合要等窗口结束，首封才有完整摘要）
    const { data: rows, error } = await client
      .from('mail_outbox')
      .select('id')
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_ATTEMPTS)
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
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
