/**
 * push-send —— Web Push 发送端
 *
 * 通道身份（三选一，按职责分工）：
 *   1. GET / POST action=config  —— 公开。下发 VAPID 公钥 + 是否已配置，
 *      前端据此决定要不要显示订阅开关。公钥不硬编码进前端产物，
 *      这样轮换密钥不需要重新部署前端。
 *   2. POST action=send          —— service_role Bearer。由 DB 触发器
 *      （boh_enqueue_web_push → net.http_post）调用，投递单条 outbox。
 *   3. POST action=retry         —— service_role Bearer。由 pg_cron 每 2 分钟
 *      调用，批量补投未成功的。
 *   4. POST action=test          —— 用户 JWT。给调用者自己的订阅发一条测试推送，
 *      供设置页「发送测试通知」验证真实链路。
 *
 * ⚠️ 为什么用 @negrel/webpush 而不是 npm:web-push：
 *    web-push 依赖 node 的 createECDH / PEM 解析，在 Supabase Edge Runtime（Deno）里
 *    会直接抛 `crypto.ECDH unimplemented` 或 `Invalid PEM label`。
 *    @negrel/webpush 基于 WebCrypto + JWK，是这个运行时里能跑通的那个。
 *
 * ⚠️ 密钥单一真相源：VAPID 密钥只以 JWK JSON 存在 `VAPID_KEYS_JSON` 一个 secret 里
 *    （结构 = @negrel/webpush 的 ExportedVapidKeys：{publicKey, privateKey}）。
 *    生成脚本见 scripts/generate-vapid-keys.mjs，不要在别处再存一份。
 */

import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.99.1';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
const vapidKeysJson = String(Deno.env.get('VAPID_KEYS_JSON') || '').trim();
const vapidSubject = String(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@blockofhome.cn').trim();

/** 单条订阅最多试几次；超了就置 failed，不再重投 */
const MAX_ATTEMPTS = 3;
/** 连续失败多少次就停用该订阅 */
const MAX_SUB_FAILURES = 5;
/** 兜底重投只处理「已落库超过 1 分钟」的，避免和触发器的即时投递打架 */
const RETRY_MIN_AGE_MS = 60_000;

/** 点开通知后统一落到消息中心 —— 那里是查看通知的唯一去处 */
const NOTIFICATION_ROUTE = '/#/user-space/messages';

type AppServer = Awaited<ReturnType<typeof webpush.ApplicationServer.new>>;

/** 带类型的动作 → 文案。sender 与帖子/评论内容在运行时拼。 */
const ACTION_TEXT: Record<string, string> = {
  like: '赞了你的帖子',
  comment: '评论了你的帖子',
  reply: '回复了你的帖子',
  repost: '转发了你的帖子',
  follow: '关注了你',
  impression: '给你留了印象',
};

/** 无 sender 或非互动型通知 → 用「标题前缀 + content」。 */
const SYSTEM_LABEL: Record<string, string> = {
  lottery_win: '抽奖结果',
  gift: '礼物通知',
  subscription: '订阅通知',
  system: '系统消息',
  post_rejected: '内容审查',
  post_report_limited: '举报处理',
  comment_rejected: '评论审查',
};

const truncate = (value: unknown, max: number) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

let cachedAppServer: AppServer | null = null;
let cachedPublicKey: string | null = null;

const getAppServer = async (): Promise<AppServer> => {
  if (cachedAppServer) return cachedAppServer;
  if (!vapidKeysJson) throw new Error('VAPID_KEYS_JSON 未配置');
  const exported = JSON.parse(vapidKeysJson);
  const keys = await webpush.importVapidKeys(exported, { extractable: false });
  cachedAppServer = await webpush.ApplicationServer.new({
    contactInformation: vapidSubject,
    vapidKeys: keys,
  });
  return cachedAppServer;
};

const getPublicKey = async (): Promise<string> => {
  if (cachedPublicKey) return cachedPublicKey;
  if (!vapidKeysJson) throw new Error('VAPID_KEYS_JSON 未配置');
  const exported = JSON.parse(vapidKeysJson);
  const keys = await webpush.importVapidKeys(exported, { extractable: true });
  cachedPublicKey = await webpush.exportApplicationServerKey(keys);
  return cachedPublicKey;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type OutboxRow = {
  id: string;
  notification_id: string;
  recipient_id: string;
  status: string;
  attempts: number;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  type: string;
  post_id: string | null;
  comment_id: string | null;
  content: string | null;
};

/** 组装推送文案。只读必要列，避免把整行通知内容塞进 payload。 */
const buildPayload = async (client: SupabaseClient, notification: NotificationRow) => {
  let senderName = '';
  if (notification.sender_id) {
    const { data } = await client
      .from('profiles')
      .select('username')
      .eq('id', notification.sender_id)
      .maybeSingle();
    senderName = truncate(data?.username, 24);
  }

  let postTitle = '';
  if (notification.post_id) {
    const { data } = await client
      .from('posts')
      .select('title, content')
      .eq('id', notification.post_id)
      .maybeSingle();
    postTitle = truncate(data?.title, 40) || truncate(data?.content, 40);
  }

  let commentContent = '';
  if (notification.comment_id) {
    const { data } = await client
      .from('comments')
      .select('content')
      .eq('id', notification.comment_id)
      .maybeSingle();
    commentContent = truncate(data?.content, 60);
  }

  // 角标数字的唯一来源（与前端徽标同一个函数口径）
  const { data: badgeValue } = await client.rpc('boh_count_unread_notifications', {
    p_recipient_id: notification.recipient_id,
  });
  const badge = Number(badgeValue ?? 0) || 0;

  const actionText = ACTION_TEXT[notification.type];
  let title: string;
  let body: string;

  if (actionText) {
    title = `${senderName || '有人'}${actionText}`;
    if (notification.type === 'comment' || notification.type === 'reply') {
      body = commentContent || postTitle || '点开看看';
    } else {
      body = postTitle || truncate(notification.content, 60) || '点开看看';
    }
  } else {
    title = SYSTEM_LABEL[notification.type] || '方块之家';
    body = truncate(notification.content, 80) || postTitle || '你有一条新消息';
  }

  return {
    title,
    body,
    url: NOTIFICATION_ROUTE,
    // 每条通知独立 tag → 各自展示，不互相顶掉（要合并展示时改这里为 type 或常量）
    tag: `boh-${notification.id}`,
    notificationId: notification.id,
    badge,
  };
};

type SendOutcome = 'sent' | 'skipped' | 'retrying' | 'failed';

/**
 * 投递单条 outbox（外层兜底）。
 *
 * ⚠️ 必须包一层：若核心逻辑抛出**意料之外的异常**（最典型 = VAPID 配错、
 *    网络整体不可用），而不把 attempts 落库，那 attempts 会永远停在 0，
 *    cron 兜底就会**无限重投**同一条 —— 这是最难发现的一类资源泄漏。
 *    所以无论成败，attempts 一定要 +1 落库。
 */
const deliverOutbox = async (
  client: SupabaseClient,
  outboxId: string,
): Promise<{ outcome: SendOutcome; detail?: string; delivered?: number }> => {
  try {
    return await deliverOutboxCore(client, outboxId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    try {
      const { data: row } = await client
        .from('push_outbox')
        .select('attempts')
        .eq('id', outboxId)
        .maybeSingle();
      const attempts = Number(row?.attempts || 0) + 1;
      await client.from('push_outbox')
        .update({
          attempts,
          last_error: truncate(detail, 500),
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        })
        .eq('id', outboxId);
    } catch (_persistError) {
      // 连账本都写不进去（数据库整体不可用）：只能放弃，下一次 cron 会重新扫到
    }
    return { outcome: 'failed', detail };
  }
};

const deliverOutboxCore = async (
  client: SupabaseClient,
  outboxId: string,
): Promise<{ outcome: SendOutcome; detail?: string; delivered?: number }> => {
  // 返回语义：sent=至少一个端点成功；skipped=该用户没有任何有效订阅（不是错误，不重投）；
  //          retrying=全部失败但还没到上限；failed=已达上限或被永久废弃。
  const { data: outbox, error: outboxError } = await client
    .from('push_outbox')
    .select('id, notification_id, recipient_id, status, attempts')
    .eq('id', outboxId)
    .maybeSingle<OutboxRow>();

  if (outboxError) throw outboxError;
  if (!outbox) return { outcome: 'failed', detail: 'outbox 不存在' };
  // 已投过就不重复投（触发器与 cron 可能同时命中同一条）
  if (outbox.status === 'sent' || outbox.status === 'skipped') {
    return { outcome: outbox.status as SendOutcome };
  }

  const attempts = Number(outbox.attempts || 0) + 1;

  const { data: notification, error: notificationError } = await client
    .from('notifications')
    .select('id, recipient_id, sender_id, type, post_id, comment_id, content')
    .eq('id', outbox.notification_id)
    .maybeSingle<NotificationRow>();

  if (notificationError) throw notificationError;
  if (!notification) {
    await client.from('push_outbox')
      .update({ status: 'failed', attempts, last_error: '通知已被删除' })
      .eq('id', outbox.id);
    return { outcome: 'failed', detail: '通知已被删除' };
  }

  const { data: subscriptions, error: subscriptionError } = await client
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', outbox.recipient_id)
    .is('disabled_at', null);

  if (subscriptionError) throw subscriptionError;

  const targets = (subscriptions || []) as SubscriptionRow[];
  if (targets.length === 0) {
    // 没有有效订阅 = 这人还没在任何设备开启推送，不是错误，不重投
    await client.from('push_outbox')
      .update({ status: 'skipped', attempts, last_error: null })
      .eq('id', outbox.id);
    return { outcome: 'skipped' };
  }

  const appServer = await getAppServer();
  const payload = JSON.stringify(await buildPayload(client, notification));
  const options = { urgency: webpush.Urgency.High, ttl: 86_400 };

  let delivered = 0;
  const failures: string[] = [];

  await Promise.all(targets.map(async (sub) => {
    try {
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      });
      await subscriber.pushTextMessage(payload, options);
      delivered += 1;
      await client.from('push_subscriptions')
        .update({ last_seen_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', sub.id);
    } catch (error) {
      const status = error instanceof webpush.PushMessageError ? error.response.status : 0;
      failures.push(`${sub.id}:${status || (error instanceof Error ? error.message : String(error))}`);

      // 404 / 410 表示这个端点被浏览器或推送服务永久回收了，直接停用
      const isGone = status === 404 || status === 410
        || (error instanceof webpush.PushMessageError && error.isGone());
      if (isGone) {
        await client.from('push_subscriptions')
          .update({ disabled_at: new Date().toISOString() })
          .eq('id', sub.id);
      } else {
        const { data: current } = await client
          .from('push_subscriptions')
          .select('failure_count')
          .eq('id', sub.id)
          .maybeSingle<{ failure_count: number }>();
        const nextFailures = Number(current?.failure_count || 0) + 1;
        const patch: Record<string, unknown> = { failure_count: nextFailures };
        if (nextFailures >= MAX_SUB_FAILURES) patch.disabled_at = new Date().toISOString();
        await client.from('push_subscriptions').update(patch).eq('id', sub.id);
      }
    }
  }));

  const lastError = failures.length ? truncate(failures.join(' | '), 500) : null;

  if (delivered > 0) {
    await client.from('push_outbox')
      .update({ status: 'sent', attempts, sent_at: new Date().toISOString(), last_error: lastError })
      .eq('id', outbox.id);
    return { outcome: 'sent', delivered, detail: lastError || undefined };
  }

  const exhausted = attempts >= MAX_ATTEMPTS;
  await client.from('push_outbox')
    .update({ status: exhausted ? 'failed' : 'pending', attempts, last_error: lastError })
    .eq('id', outbox.id);

  return { outcome: exhausted ? 'failed' : 'retrying', detail: lastError || undefined };
};

const verifyUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { ok: false as const, message: '缺少登录凭证' };
  if (!anonKey) return { ok: false as const, message: '服务未配置' };

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false as const, message: '登录状态已失效' };
  return { ok: true as const, userId: data.user.id };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(origin) });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  }
  if (!supabaseUrl) {
    return jsonResponse({ ok: false, code: 'CONFIG_MISSING', message: '服务暂不可用' }, 500, origin);
  }

  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const action = String(body?.action || url.searchParams.get('action') || 'config').trim();

  // ---------- 公开：下发公钥 ----------
  if (action === 'config') {
    if (!vapidKeysJson) {
      return jsonResponse({ ok: true, enabled: false, vapidPublicKey: null }, 200, origin);
    }
    try {
      return jsonResponse({ ok: true, enabled: true, vapidPublicKey: await getPublicKey() }, 200, origin);
    } catch (error) {
      return jsonResponse({
        ok: false,
        code: 'VAPID_INVALID',
        message: error instanceof Error ? error.message : '密钥不可用',
      }, 500, origin);
    }
  }

  if (!anonKey) {
    return jsonResponse({ ok: false, code: 'CONFIG_MISSING', message: '服务暂不可用' }, 500, origin);
  }

  // ---------- 用户通道：给自己发测试推送 ----------
  if (action === 'test') {
    const auth = await verifyUser(request);
    if (!auth.ok) return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: auth.message }, 401, origin);
    if (!vapidKeysJson) {
      return jsonResponse({ ok: false, code: 'PUSH_NOT_CONFIGURED', message: '推送服务尚未配置' }, 503, origin);
    }

    const client = createServiceClient();
    const { data: subscriptions } = await client
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', auth.userId)
      .is('disabled_at', null);
    const targets = (subscriptions || []) as SubscriptionRow[];
    if (targets.length === 0) {
      return jsonResponse({ ok: false, code: 'NO_SUBSCRIPTION', message: '当前设备还没有开启通知' }, 400, origin);
    }

    const badgeRes = await client.rpc('boh_count_unread_notifications', { p_recipient_id: auth.userId });
    const payload = JSON.stringify({
      title: '方块之家 · 通知已开启',
      body: '这是一条测试消息，后续有新的互动会这样提醒你。',
      url: NOTIFICATION_ROUTE,
      tag: 'boh-test',
      badge: Number((badgeRes as { data?: number | string | null }).data ?? 0) || 0,
    });

    const appServer = await getAppServer();
    let delivered = 0;
    const errors: string[] = [];
    await Promise.all(targets.map(async (sub) => {
      try {
        await appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }).pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 600 });
        delivered += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }));

    return jsonResponse({
      ok: delivered > 0,
      delivered,
      total: targets.length,
      message: delivered > 0 ? '测试通知已发送' : '发送失败',
      errors: errors.length ? errors : undefined,
    }, delivered > 0 ? 200 : 502, origin);
  }

  // ---------- 服务端通道：需 service_role Bearer ----------
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const isServiceCall = Boolean(
    serviceRoleKey && (request.headers.get('authorization') || '') === `Bearer ${serviceRoleKey}`,
  );
  if (!isServiceCall) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: '无权调用' }, 401, origin);
  }
  if (!vapidKeysJson) {
    return jsonResponse({ ok: false, code: 'PUSH_NOT_CONFIGURED', message: '推送服务尚未配置' }, 503, origin);
  }

  const client = createServiceClient();

  if (action === 'send') {
    const outboxId = String(body?.outboxId || '').trim();
    if (!outboxId) return jsonResponse({ ok: false, code: 'OUTBOX_ID_REQUIRED' }, 400, origin);
    const result = await deliverOutbox(client, outboxId)
      .catch((error) => ({ outcome: 'failed' as SendOutcome, detail: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ ok: result.outcome !== 'failed', ...result }, 200, origin);
  }

  if (action === 'retry') {
    const limit = Math.min(Math.max(Number(body?.limit || 20) || 20, 1), 50);
    const cutoff = new Date(Date.now() - RETRY_MIN_AGE_MS).toISOString();

    const { data: pending, error } = await client
      .from('push_outbox')
      .select('id')
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_ATTEMPTS)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return jsonResponse({ ok: false, code: 'QUERY_FAILED', message: error.message }, 500, origin);
    }

    const ids = (pending || []).map((row: { id: string }) => row.id);

    // 批量补投放到后台执行：不占 pg_net 的 5s 等待，结果全部落在 push_outbox 里可查
    EdgeRuntime.waitUntil((async () => {
      for (const id of ids) {
        await deliverOutbox(client, id).catch(() => undefined);
      }
    })());

    return jsonResponse({ ok: true, accepted: ids.length }, 202, origin);
  }

  return jsonResponse({ ok: false, code: 'UNKNOWN_ACTION', message: `未知动作：${action}` }, 400, origin);
});
