import { supabase } from '../../supabase-client.js';
import { logger } from '../../logger.js';
import { createNotification, sendPushplusForNotification } from '../notifications-api.js';
import { writeModerationAuditLog } from '../../unified-content-moderation.js';

/**
 * 把「可能非法」的数值入参归一成非负数（转不了就用 fallback）。
 *
 * ⚠️ 为什么不能用 `Math.max(0, Number(x))` 代替：`Number('abc')` 是 `NaN`，而
 * **`Math.max(0, NaN) === NaN`**（不是 0）—— 夹逼对 NaN 是恒等传播，不是兜底。
 * 深链 `?page=abc` / 外部组件传字符串就是最近的触发面：`NaN` 会一路流进
 * `.range(NaN, NaN)` 或 RPC 的 `p_page: NaN`，表现为 400 或静默空列表。
 *
 * 语义：能转成有限数就夹到 ≥0（**不取整**，不在这里偷偷改口径）；否则用 fallback。
 */
export function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * 同 `toNonNegativeNumber`，但下界是 1，且**取整**（函数名就是承诺：page / pageSize / limit
 * 最终都进 PostgREST 的 `.range()` 或 RPC 的 `p_page`，那里只接受整数）。
 *
 * ⚠️ `0 / null / '' / false / 负数` 一律视为「没传」，走 fallback —— 不能夹到 1：
 * 它们是 falsy（或根本不存在负页码），旧实现 `Math.max(1, Number(v || fallback))`
 * 走的就是 fallback；换成「有限数就夹 ≥1」后 `pageSize: 0` 会从「默认 10 条」静默变成
 * 「1 条」，列表页只剩一条、还看不出报错（2026-10-30 复核实测）。
 */
export function toPositiveInt(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    const safeFallback = Math.floor(Number(fallback));
    return Number.isFinite(safeFallback) && safeFallback >= 1 ? safeFallback : 1;
  }
  return Math.floor(n);
}

export function isMissingRpcFunctionError(error, functionName) {
  if (!error) return false;
  if (String(error.code || '') === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('could not find the function') &&
    message.includes(String(functionName || '').toLowerCase())
  );
}

/**
 * 「写入的列还不存在」判定 —— 给「前端已上线、迁移未 apply」这个窗口用。
 *
 * 为什么需要：前端是 CI 自动部署，迁移要人工 apply，两者顺序不可控。
 * 2026-10-29 新增 posts.edited_at 时，若前端先上线，updatePost 会带一个不存在的列
 * → PostgREST 直接 400 ⇒ **编辑帖子整体失败**。有这条判定就能降级重试（少个标记而已）。
 *
 * 三种形态都要认（PostgREST 不同版本报法不同）：
 *   · 42703            PostgreSQL undefined_column
 *   · PGRST204         PostgREST「could not find the 'x' column ... in the schema cache」
 *   · 文案匹配         兜底，覆盖网关改写过的 message
 */
export function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error.message || '').toLowerCase();
  const column = String(columnName || '').toLowerCase();
  const mentionsMissing =
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('schema cache');
  if (!mentionsMissing) return false;
  return column ? message.includes(column) : message.includes('column');
}

// —— 转发原帖批量回源（论坛列表引用框 / 个人空间帖子网格共用，真相源单一） ——
// 转发帖只存转发留言，原帖靠 repost_of_post_id 引用；会话级缓存，
// 查不到（limited 非本人/rejected/删除）也缓存 null 防重复查询。
//
// 2026-10-30 P3-3：此前是裸 Map，**无上限、无淘汰、会话级存活** —— 长会话里翻得越久
// 记得越多，且永远不释放。加 LRU 上限 200（一个论坛列表页最多 10~20 条转发帖，
// 200 足够覆盖「来回翻几页」的热集）。
// ⚠️ 不用「超限就 clear()」：null 条目是**刻意**缓存的（防重复查询），整表清空会让
// 已确认查不到的 id 重新发请求，反而制造流量。按插入顺序淘汰最旧的一条即可。
const QUOTED_POST_CACHE_MAX = 200;
const quotedPostCache = new Map();

/** 写缓存并维持 LRU 顺序（命中的键先摘下再重插，保证排到队尾）。 */
const rememberQuotedPost = (key, value) => {
  if (quotedPostCache.has(key)) quotedPostCache.delete(key);
  quotedPostCache.set(key, value);
  while (quotedPostCache.size > QUOTED_POST_CACHE_MAX) {
    const oldest = quotedPostCache.keys().next().value;
    quotedPostCache.delete(oldest);
  }
};

/** 读缓存并刷新 LRU 顺序；未命中返回 undefined（注意与「命中且值为 null」区分）。 */
const readQuotedPostCache = (key) => {
  if (!quotedPostCache.has(key)) return undefined;
  const value = quotedPostCache.get(key);
  quotedPostCache.delete(key);
  quotedPostCache.set(key, value);
  return value;
};

export async function fetchQuotedPostsByIds(ids = []) {
  const allIds = [
    ...new Set(
      (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean),
    ),
  ];
  const missing = allIds.filter((id) => !quotedPostCache.has(id));

  // ⚠️ 结果必须由「本次命中的数据」直接构建，**不能**写完缓存再回读：
  // 缓存是有界 LRU（上限 200），单批要查的 id 超过上限时，最早写入的条目会在回读前
  // 被自己挤掉 ⇒ 那几个 id 静默消失、引用框空白，而且下次渲染还会再发一次请求。
  // 先收已命中的（含「确认查不到」的 null），再补本次抓到的。
  const result = new Map();
  allIds.forEach((id) => {
    const cached = readQuotedPostCache(id);
    // undefined = 未命中；null = 命中但确认查不到（两者都要区分）
    if (cached !== undefined) result.set(id, cached);
  });

  if (missing.length) {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, body, content, author_id, author_username, created_at, cover_image_url')
        .in('id', missing);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const found = new Set();
      rows.forEach((row) => {
        rememberQuotedPost(row.id, row);
        result.set(row.id, row);
        found.add(row.id);
      });
      missing.forEach((id) => {
        if (!found.has(id)) {
          rememberQuotedPost(id, null);
          result.set(id, null);
        }
      });
    } catch (error) {
      logger.warn('forum-api', '转发原帖批量回源失败（引用展示降级）', { ids: missing, error });
      // 降级不丢已命中的：回源失败时把缓存里那部分照常返回，
      // 否则「本来能显示的引用框」会因为一次网络抖动整块变空。
      return result;
    }
  }

  return result;
}

export function getCachedQuotedPost(id) {
  const key = String(id || '').trim();
  return key ? (readQuotedPostCache(key) ?? null) : null;
}

export async function writeAsyncModerationLog(targetId, targetType, moderationResult = {}) {
  await writeModerationAuditLog({
    targetId,
    targetType,
    result: moderationResult,
    moderatorId: null,
  });
}

export async function ensureModerationNotification({
  recipientId,
  type,
  postId = null,
  commentId = null,
} = {}) {
  const safeRecipientId = String(recipientId || '').trim();
  const safeType = String(type || '').trim();
  const safePostId = String(postId || '').trim();
  const safeCommentId = String(commentId || '').trim();

  if (!safeRecipientId || !safeType) return;

  try {
    let existingQuery = supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', safeRecipientId)
      .eq('type', safeType);

    if (safePostId) existingQuery = existingQuery.eq('post_id', safePostId);
    if (safeCommentId) existingQuery = existingQuery.eq('comment_id', safeCommentId);

    const { data: existingRows, error: existingError } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      logger.warn('forum-api', '查询既有审查通知失败，降级为直接插入', {
        recipientId: safeRecipientId,
        type: safeType,
        postId: safePostId || null,
        commentId: safeCommentId || null,
        error: existingError,
      });
    } else if (Array.isArray(existingRows) && existingRows.length > 0) {
      return;
    }

    const payload = {};
    if (safePostId) payload.post_id = safePostId;
    if (safeCommentId) payload.comment_id = safeCommentId;

    const result = await createNotification(safeRecipientId, null, safeType, payload);
    if (!result.ok) {
      logger.warn('forum-api', '写入审查通知失败（不阻断）', {
        recipientId: safeRecipientId,
        type: safeType,
        postId: safePostId || null,
        commentId: safeCommentId || null,
        error: result.error,
      });
    }
  } catch (error) {
    logger.warn('forum-api', '写入审查通知异常（不阻断）', {
      recipientId: safeRecipientId,
      type: safeType,
      postId: safePostId || null,
      commentId: safeCommentId || null,
      error,
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   给帖子作者发 Pushplus 推送 —— 单源（2026-10-30 P2-1d）

   此前 comment / like / repost 各有一份 37 行的复制粘贴，差异只有 4 处：
   `type`、两处日志文案、comment 多一个 `comment_id`。
   合并的边界就卡在这 4 处：**文案按 type 查表，不做统一** —— 合并成一句
   「推送未发送」会让排障时分不清是哪条链在响（这三个函数的日志是唯一线索）。

   调用面零改动：三个导出名与签名都保留，内部委托。
   等价性由 `tests/unit/forum-notify-post-author.test.js`（22 条）锁死 ——
   它先对三份副本全绿，再对合并后的实现全绿，这才是等价而不是「看着一样」。

   ⚠️ 转发（repost）的**通知行**由 `create_forum_quote_repost` RPC 落库
   （migration 2026091101），这里只负责 Pushplus 推送 —— 别以为合并时漏了写通知。
   ───────────────────────────────────────────────────────────────────────── */

const POST_AUTHOR_PUSH_KINDS = {
  comment: { label: '评论', requiresCommentId: true },
  like: { label: '点赞', requiresCommentId: false },
  repost: { label: '转发', requiresCommentId: false },
};

async function notifyPostAuthorByPush({ type, postId, senderId, commentId } = {}) {
  const kind = POST_AUTHOR_PUSH_KINDS[type];
  // 不认识的 type 一律不推送：旧实现没有这个入口，合并后有了，得自己兜住
  if (!kind) return;

  const safePostId = String(postId || '').trim();
  const safeSenderId = String(senderId || '').trim();
  const safeCommentId = String(commentId || '').trim();
  if (!safePostId || !safeSenderId) return;
  if (kind.requiresCommentId && !safeCommentId) return;

  try {
    const { data: postInfo, error: postError } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', safePostId)
      .single();

    if (postError || !postInfo?.author_id || postInfo.author_id === safeSenderId) {
      return;
    }

    const pushPayload = {
      recipient_id: postInfo.author_id,
      sender_id: safeSenderId,
      type,
      post_id: safePostId,
    };
    if (kind.requiresCommentId) pushPayload.comment_id = safeCommentId;

    const pushResult = await sendPushplusForNotification(pushPayload);
    if (!pushResult?.success) {
      const warnPayload = {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
      };
      if (kind.requiresCommentId) warnPayload.commentId = safeCommentId;
      warnPayload.recipientId = postInfo.author_id;
      logger.warn('forum-api', `${kind.label} Pushplus 推送未发送`, warnPayload);
    }
  } catch (pushError) {
    logger.warn('forum-api', `${kind.label} Pushplus 推送失败(静默)`, pushError);
  }
}

export async function notifyPostAuthorForComment({ postId, senderId, commentId } = {}) {
  return notifyPostAuthorByPush({ type: 'comment', postId, senderId, commentId });
}

export async function notifyPostAuthorForLike({ postId, senderId } = {}) {
  return notifyPostAuthorByPush({ type: 'like', postId, senderId });
}

export async function notifyPostAuthorForRepost({ postId, senderId } = {}) {
  return notifyPostAuthorByPush({ type: 'repost', postId, senderId });
}

/* ─────────────────────────────────────────────────────────────────────────
   身份/权限 —— 单源（2026-10-30 P2-1c）

   本函数此前在 `post-api.js` 与 `comment-api.js` 各有一份（逻辑一致、文案不同）。
   搬到这里的原因不只是去重：它的 **fallback 语义**是权限判定的关键，
   两份副本各改各的等于埋雷（见 P2-6）。
   ───────────────────────────────────────────────────────────────────────── */

/**
 * 取「权威身份」：以服务端 `auth.getUser()` 为准，角色以 `profiles.role` 为准。
 *
 * ⚠️ 回退语义（2026-10-30 P2-6 起）：拿不到 profiles 时**只回退 userId，不回退 role**。
 * 旧实现会把调用方传进来的 `userRole`（本地状态、可能来自旧登录态）当成真实角色，
 * 等于「客户端自称 admin 就先按 admin 判权限」。真门仍是 RLS（42501），所以这不是
 * 越权漏洞，但它让错误发生在错误的层：用户看到「删除失败」而不是「没有权限」。
 *
 * ⚠️ `roleResolved` 告诉调用方「角色到底知不知道」：
 * 查不到 profiles（网络/离线/列权限）时它是 false，此时**非作者**的请求会被本地拦下；
 * 若调用方不区分，管理员就会看到「没有权限删除此帖子」—— 真实原因是网络。
 * 所以 3 个调用点都按 `!roleResolved` 改回可重试文案（2026-10-30 复核修正）。
 * 作者本人不受影响：回退保留了调用方传入的 userId，本人判定先命中。
 */
export async function resolveAuthoritativeForumActor(fallbackUserId = '') {
  const fallback = {
    userId: String(fallbackUserId || '').trim(),
    role: '',
    roleResolved: false,
  };
  try {
    if (!supabase.auth?.getUser) return fallback;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = String(authData?.user?.id || '').trim();
    if (!userId) {
      // 「没有会话」是**确定结论**（角色就是无），别报成网络异常。
      // 只有「报错且不是会话缺失」才算没查到身份 ⇒ roleResolved=false。
      const missingSession =
        !authError ||
        authError.name === 'AuthSessionMissingError' ||
        Number(authError.status) === 401;
      if (!missingSession) return fallback;
      // 保留调用方 userId：作者本人判定照旧生效（真门仍是 RLS），与旧行为一致
      return { userId: fallback.userId, role: '', roleResolved: true };
    }
    if (authError) return fallback;
    const profileQuery = supabase.from('profiles').select('role').eq('id', userId);
    if (typeof profileQuery?.maybeSingle !== 'function') return fallback;
    const { data: profile, error: profileError } = await profileQuery.maybeSingle();
    // 离线/单测 mock 下 profile 可能缺字段：缺 role 就当普通用户，别拿客户端声明顶上
    if (
      profileError ||
      profile === undefined ||
      profile === null ||
      !Object.prototype.hasOwnProperty.call(profile, 'role')
    ) {
      return fallback;
    }
    return { userId, role: String(profile?.role || '').trim(), roleResolved: true };
  } catch (_error) {
    return fallback;
  }
}

/**
 * 是否有权修改（删除/编辑）某条内容：作者本人，或 admin/superadmin。
 * 只做判定，不决定错误文案与返回形状 —— 4 个调用点的错误结构与文案各不相同，
 * 强行合并会改用户看到的提示。
 */
export function canMutateForumContent(actor, authorId) {
  const selfId = String(actor?.userId || '').trim();
  const ownerId = String(authorId || '').trim();
  if (selfId && ownerId && selfId === ownerId) return true;
  return ['admin', 'superadmin'].includes(String(actor?.role || '').trim());
}
