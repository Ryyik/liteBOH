/**
 * follow-mail-send —— mail_outbox 的唯一投递端
 *
 * ⚠️ 名字是历史包袱：它现在消费**三种** kind，按 kind 在 sendOne 里分流 ——
 *    · follow_post / follow_reply —— 关注动态（原职责，三形态模板见文末）
 *    · shop_order                 —— 订单进度（2026-11-03 并入，模板见「订单进度邮件」段）
 *    · birthday                   —— 生日祝福（2026-11-10 并入，模板在 _shared/birthday-mail.ts）
 *    名字没改是因为改名要动 cron + 部署 + 排障手册三处，收益只是好看；
 *    真正该记住的是：**往 mail_outbox 里塞新 kind，消费端就是这里**。
 *
 * 通道身份：
 *   1. POST action=send   —— 内部投递凭证（Bearer = BOH_PUSH_DISPATCH_KEY）。
 *      由 DB 触发器（boh_enqueue_follow_mail / notify_shop_order_progress → net.http_post）调用，投递单条账本。
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
/* 生日邮件（kind=birthday）：模板单独成文件，因为它是纯函数、可被单测断言 */
import { renderBirthdayMail } from '../_shared/birthday-mail.ts';
/* 订单邮件用 Apple 极简主题；关注邮件仍用本文件自己的 FONT_STACK / TONE（那是杂志风，不该被拉平） */
import {
  MAIL_COLOR,
  MAIL_GAP,
  mailButton,
  mailCard,
  mailDivider,
  mailDocument,
  mailEyebrow,
  mailFooter,
  mailParagraph,
  mailSpacer,
  mailTitle,
} from '../_shared/mail-theme.ts';

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
  /** shop_order = 订单进度（2026-11-03 并入本账本）；birthday = 生日祝福（2026-11-10）；其余是关注类 */
  kind: 'follow_post' | 'follow_reply' | 'shop_order' | 'birthday';
  post_id: string | null;
  comment_id: string | null;
  /** kind=shop_order 时指向 shop_points_orders.id */
  order_id: string | null;
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

  const buttonLabel =
    n === 1 ? (kind === 'follow_reply' ? '去回复 TA' : '去看看这条帖子') : '查看全部动态';
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

/* ────────────────────────── 订单进度邮件（2026-11-03）──────────────────────────
 *
 * 用户口径：「下单确认不用发邮件，订单有新进度的时候发给用户」。
 *
 * 与关注邮件共用同一张账本、同一个投递端、同一把内部凭证，但**模板语义完全不同**：
 * 关注邮件是「有人跟你互动」（要展示是谁、说了什么），
 * 订单邮件是「你买的东西到哪了」（只回答：哪一单、到哪一步、去哪看）。
 * 所以这里不显示发件人、不带正文摘要，也不需要聚合。
 *
 * ⚠️ 订单分支**不读** follow_mail_enabled：进度通知是事务性邮件，
 *    不是订阅内容，不该被「关注邮件开关」连带关掉。
 */

type OrderStatusKey = 'preparing' | 'shipped' | 'completed' | 'cancelled';

/* ⚠️ 刻意**不带 tone / bg / label**：状态只由标题文案表达，不配彩色徽章、不画进度条。
   一封信里出现 2~3 个色块或者一条流程线，这套极简版式立刻不成立。
   要加状态色或进度条，先读 _shared/mail-theme.ts 的设计纪律第 1 条。 */
const ORDER_STATUS_META: Record<OrderStatusKey, { headline: string; desc: string }> = {
  preparing: {
    headline: '订单已确认，正在准备',
    desc: '我们正在为你打包，发货后会再通知你一次。',
  },
  shipped: {
    headline: '你的订单已发货',
    desc: '包裹已经寄出，请留意查收。',
  },
  completed: {
    headline: '你的订单已完成',
    desc: '订单已完结，感谢支持。',
  },
  cancelled: {
    headline: '你的订单已取消',
    desc: '支付积分已原路退回，订单流程已终止，无需等待发货。',
  },
};

const resolveOrderStatus = (value: unknown): OrderStatusKey => {
  const key = String(value || '') as OrderStatusKey;
  return key in ORDER_STATUS_META ? key : 'preparing';
};

/**
 * 商品行：有绝对地址的图才渲染（items 快照里的 image 可能是相对路径，邮件里会裂图）。
 *
 * ⚠️ 这里必须是 table，不能沿用卡片的 flex：Outlook 桌面版不认 flex，
 *    原实现（display:flex）在 Outlook 里会塌成「图一行、标题一行、数量一行」。
 */
const buildOrderItemRows = (items: unknown[]) => {
  const list = (Array.isArray(items) ? items : []).slice(0, 6);
  if (!list.length) return '';
  const rows = list
    .map((raw, index) => {
      const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const title = String(item.title || '商品');
      const spec = String(item.selected_spec_label || '');
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const image = String(item.image || '');
      const thumb = /^https?:\/\//i.test(image)
        ? `<img src="${escapeHtml(image)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:10px;object-fit:cover;border:0" />`
        : `<div style="width:44px;height:44px;border-radius:10px;background:${MAIL_COLOR.page}"></div>`;
      const divider =
        index === list.length - 1 ? '' : `border-bottom:0.5px solid ${MAIL_COLOR.hairline};`;
      return `<tr>
        <td width="44" valign="middle" style="padding:14px 0;${divider}">${thumb}</td>
        <td valign="middle" style="padding:14px 12px 14px 14px;${divider}">
          <div style="font-size:15px;line-height:1.4;color:${MAIL_COLOR.ink}">${escapeHtml(title)}</div>
          ${spec ? `<div style="font-size:13px;line-height:1.4;color:${MAIL_COLOR.ink3};margin-top:4px">${escapeHtml(spec)}</div>` : ''}
        </td>
        <td valign="middle" align="right" style="padding:14px 0;${divider}font-size:14px;color:${MAIL_COLOR.ink2};white-space:nowrap">×${quantity}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`;
};

const buildShopOrderPayload = (order: Record<string, unknown>, to: string): MailPayload => {
  const status = resolveOrderStatus(order.status);
  const meta = ORDER_STATUS_META[status];
  const orderNo = String(order.order_no || '').trim();
  const targetUrl = `${SITE_ORIGIN}/#/shop?tab=order`;
  const updatedAt = new Date(String(order.updated_at || order.created_at || ''));
  const updatedText = Number.isNaN(updatedAt.getTime())
    ? ''
    : updatedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const html = mailDocument({
    preheader: `${meta.headline}${orderNo ? ` · 订单 ${orderNo}` : ''}`,
    body: [
      mailCard(
        [
          mailEyebrow('方块之家 BOH'),
          mailTitle(escapeHtml(meta.headline)),
          mailParagraph(escapeHtml(meta.desc)),
          /*
           * 刻意**不画进度条**（用户 2026-11-03 明确要求）。
           * 三段线 + 圆点会把「哪一步」重复讲一遍 —— 标题已经说了「已发货」，
           * 再画一条线只是多一层装饰。极简的做法是让标题承担状态，正文承担说明。
           */
          mailSpacer(MAIL_GAP.l),
          mailDivider(),
          mailSpacer(MAIL_GAP.m),
          `<div style="font-size:13px;color:${MAIL_COLOR.ink3}">订单 ${escapeHtml(orderNo)}</div>`,
          buildOrderItemRows((order.items as unknown[]) || []),
          mailSpacer(MAIL_GAP.l),
          `<div style="text-align:center">${mailButton(targetUrl, '查看订单')}</div>`,
        ].join(''),
      ),
      mailFooter(
        /*
         * 主动断成两行：单行 27 个汉字在 375px 手机上会正好卡在行尾，
         * 浏览器按 CJK 规则硬断，会把「退订」拆成「退 / 订」—— 视觉上像错字。
         * 断点放在语义边界上，桌面和手机都不会出现拆词。
         */
        `${updatedText ? `更新于 ${escapeHtml(updatedText)}<br>` : ''}此邮件是订单进度通知<br>发送到你的账号邮箱，无法单独退订。`,
      ),
    ].join(''),
  });

  const text = [
    meta.headline,
    '',
    `订单 ${orderNo}`,
    meta.desc,
    '',
    `查看订单：${targetUrl}`,
    '',
    '此邮件是订单进度通知，会发送到你的账号邮箱，无法单独退订。',
  ].join('\n');

  return {
    to,
    subject: `${meta.headline}｜${orderNo}`,
    html,
    text,
  };
};

/**
 * 订单进度投递。与关注邮件共用账本，所以状态回写逻辑必须一致
 * （sent / pending / failed + attempts），否则会被重投 cron 反复扫到。
 */
const sendShopOrderMail = async (
  client: ReturnType<typeof createServiceClient>,
  row: OutboxRow,
  attempts: number,
) => {
  const markSkipped = async (detail: string) => {
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: detail })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail };
  };

  if (!row.order_id) return markSkipped('订单缺失');

  const { data: order, error: orderError } = await client
    .from('shop_points_orders')
    .select('id, order_no, items, status, updated_at, created_at')
    .eq('id', row.order_id)
    .maybeSingle<Record<string, unknown>>();

  if (orderError) throw orderError;
  if (!order) return markSkipped('订单不存在');

  // 只发已验证邮箱（与关注邮件同口径：未验证邮箱会被 Brevo 拒，且伤域名信誉）
  const { data: emailRows, error: emailError } = await client.rpc('boh_get_user_emails', {
    p_ids: [row.recipient_id],
  });
  if (emailError) throw emailError;
  const email = String(
    (emailRows as Array<{ email: string | null }> | null)?.[0]?.email || '',
  ).trim();
  if (!email) return markSkipped('无可用邮箱');

  const payload = buildShopOrderPayload(order, email);

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

/* ────────────────────────── 生日邮件（2026-11-10）──────────────────────────
 *
 * 入账口是 DB 的 boh_enqueue_birthday_mails()（cron 每天 16:00 UTC = 00:00 CST），
 * 这里只负责「按账本发出去」。模板在 _shared/birthday-mail.ts。
 *
 * 与另外两类邮件的关键差异：
 *   · **不读** follow_mail_enabled —— 阅读偏好跟生日祝福没关系；
 *     它有自己的开关 profiles.birthday_mail_enabled。
 *   · 一个寿星一天只可能有一封（DB 侧 dedupe_key=birthday:<uid>:<年>），
 *     所以这里不需要聚合、不需要窗口。
 *   · 发送失败仍然走统一的 attempts / pending / failed 回写，
 *     否则会被 5 分钟的重投 cron 反复扫到。
 */
const sendBirthdayMail = async (
  client: ReturnType<typeof createServiceClient>,
  row: OutboxRow,
  attempts: number,
) => {
  const markSkipped = async (detail: string) => {
    await client
      .from('mail_outbox')
      .update({ status: 'skipped', attempts, last_error: detail })
      .eq('id', row.id);
    return { outcome: 'skipped' as const, detail };
  };

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('username, birthday_mail_enabled, join_date')
    .eq('id', row.recipient_id)
    .maybeSingle<{
      username: string | null;
      birthday_mail_enabled: boolean | null;
      join_date: string | null;
    }>();
  if (profileError) throw profileError;
  if (!profile) return markSkipped('收件人不存在');

  // 入账到今天之间用户可能已经把开关关了 —— 尊重最新意图（与关注邮件同口径）
  if (!profile.birthday_mail_enabled) return markSkipped('收件人已关闭生日邮件');

  const { data: emailRows, error: emailError } = await client.rpc('boh_get_user_emails', {
    p_ids: [row.recipient_id],
  });
  if (emailError) throw emailError;
  const email = String(
    (emailRows as Array<{ email: string | null }> | null)?.[0]?.email || '',
  ).trim();
  if (!email) return markSkipped('无可用邮箱');

  /* 「来了多久」：profiles.**join_date**（date 列，站内语义的加入日期），
     ⚠️ 这张表**没有 created_at** —— 2026-11-10 首版就写错成 created_at，
     线上实测整封邮件 500「投递失败」，账本停在 pending/attempts=0。
     join_date 是 date（无时区），按 UTC 午夜解析后换算成「北京时间的今天」再取整，
     否则晚上 8 点后会出现「差一天」。解析失败就传 null ——
     宁可少一行，也不要显示 NaN 天。 */
  const joinedAt = Date.parse(`${String(profile.join_date || '')}T00:00:00Z`);
  const DAY_MS = 86_400_000;
  const daysTogether = Number.isNaN(joinedAt)
    ? null
    : Math.max(
        0,
        Math.floor((Date.now() + 8 * 3_600_000) / DAY_MS) - Math.floor(joinedAt / DAY_MS),
      );

  const rendered = renderBirthdayMail({
    name: profile.username || '',
    daysTogether,
    siteOrigin: SITE_ORIGIN,
  });

  const payload: MailPayload = {
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };

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

const sendOne = async (outboxId: string) => {
  const client = createServiceClient();

  const { data: row, error: rowError } = await client
    .from('mail_outbox')
    .select(
      'id, recipient_id, sender_id, kind, post_id, comment_id, order_id, status, attempts, extra_items',
    )
    .eq('id', outboxId)
    .maybeSingle<OutboxRow>();

  if (rowError) throw rowError;
  if (!row) return { outcome: 'failed' as const, detail: '账本行不存在' };
  if (row.status === 'sent') return { outcome: 'skipped' as const, detail: '已投递' };

  const attempts = Number(row.attempts || 0) + 1;

  /* 订单进度走独立分支：必须在 follow_mail_enabled 判定**之前**分流 ——
     进度通知是事务性邮件，不该被「关注邮件开关」连带关掉。 */
  if (row.kind === 'shop_order') {
    return sendShopOrderMail(client, row, attempts);
  }

  /* 生日祝福同理：它有自己的开关（birthday_mail_enabled），
     读 follow_mail_enabled 会把「关了关注摘要但想收生日祝福」的人一起丢掉。 */
  if (row.kind === 'birthday') {
    return sendBirthdayMail(client, row, attempts);
  }

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
  const email = String(
    (emailRows as Array<{ email: string | null }> | null)?.[0]?.email || '',
  ).trim();
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
      /* ⚠️ 必须把非 Error 的 message 也透出来：supabase-js 的 PostgrestError 是
         **普通对象**（不是 Error 实例），旧写法 `error instanceof Error ? … : '投递失败'`
         会把「column profiles.created_at does not exist」这种决定性信息吞成四个字，
         2026-11-10 线上实测就被它挡了整整一轮排障。 */
      const detail =
        error instanceof Error
          ? error.message
          : String((error as { message?: unknown } | null)?.message || '投递失败');
      return jsonResponse(
        {
          ok: false,
          code: 'SEND_FAILED',
          message: detail,
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
