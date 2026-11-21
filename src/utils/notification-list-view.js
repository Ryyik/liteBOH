/**
 * notification-list-view.js — 消息中心列表视图整形(纯函数,不依赖 Vue)
 *
 * 两个职责(2026-11-21 消息中心 UX 二期):
 *  1. buildAggregateEntries — 同帖点赞聚合:「星野、Mochi 等 12 人赞了你的帖子」一行 +
 *     头像堆叠,行内展开看成员(Instagram Activity feed 模式)。
 *     只聚 type='like' 且同 post 的通知;评论每条有正文要看、关注/印象语义重、
 *     系统类是服务通知——都不聚(与 Instagram/微博的边界一致)。
 *  2. buildDateGroups — 日期分组头:今天 / 昨天 / 7 天内 / 更早(iOS Mail/Gmail 模式)。
 *
 * ⚠️ 边界(都是刻意收敛,别"顺手"放宽):
 *  - 聚合在前端**已加载页内**做(24 条/页),跨分页的赞会拆成两组;服务端真聚合
 *    需要新 RPC,是独立二期项。
 *  - 成员 < 2 不聚合(单条点赞保持普通行,聚合没收益)。
 *  - 虚拟滚动(>100 条)分支不用本模块——useVirtualList 固定 itemHeight,异构行
 *    (组头/聚合行)会撑破行高假设。
 */

const DAY_MS = 86400000;

const startOfDay = (date) => {
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
};

/**
 * 日期组键。diffDays 按本地日历日差:
 *   0 → today / 1 → yesterday / 2~6 → week / ≥7 → earlier / 非法 → null(不分组)
 */
export const getDateGroupKey = (dateString, now = new Date()) => {
  if (!dateString) return null;
  const t = new Date(dateString);
  if (Number.isNaN(t.getTime())) return null;
  const diffDays = Math.round((startOfDay(now) - startOfDay(t)) / DAY_MS);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 6) return 'week';
  return 'earlier';
};

export const DATE_GROUP_LABELS = {
  today: '今天',
  yesterday: '昨天',
  week: '7 天内',
  earlier: '更早',
};

/**
 * 日期分组:输入条目流(须已按时间降序),在组键变化处插入组头条目。
 * 输入条目统一用 created_at 取日期(聚合行携带其最新成员的 created_at)。
 * 返回:[{ kind: 'header', id, label, groupKey }, ...原条目]
 */
export const buildDateGroups = (entries, now = new Date()) => {
  if (!Array.isArray(entries)) return [];
  const out = [];
  let lastKey = null;
  const seenKeys = new Set();
  for (const entry of entries) {
    if (!entry) continue;
    const key = getDateGroupKey(entry.created_at, now);
    if (key && key !== lastKey && !seenKeys.has(key)) {
      seenKeys.add(key);
      lastKey = key;
      out.push({
        kind: 'header',
        id: `group:${key}`,
        groupKey: key,
        label: DATE_GROUP_LABELS[key],
      });
    } else if (key) {
      lastKey = key;
    }
    out.push(entry);
  }
  return out;
};

/**
 * 同帖点赞聚合。expandedIds 里命中的组展开为「聚合行 + 成员消息行」。
 * 聚合行位于其最新成员的位置(列表降序,首个成员即最新),created_at 同步取该值。
 * 未命中展开且成员 ≥ 2 才输出聚合行,否则退回普通消息行。
 * 返回:[{ kind: 'aggregate', id, postId, post, members, unreadCount, ... }, { kind: 'message', id, msg }]
 */
export const buildAggregateEntries = (messages, expandedIds = new Set()) => {
  if (!Array.isArray(messages)) return [];
  const ordered = [];
  const pending = new Map();
  for (const m of messages) {
    if (!m?.id) continue;
    const key = m.type === 'like' && m.post?.id ? `like:${m.post.id}` : null;
    if (!key) {
      ordered.push({ kind: 'message', id: m.id, msg: m, created_at: m.created_at });
      continue;
    }
    if (!pending.has(key)) {
      const group = {
        kind: 'aggregate',
        id: key,
        postId: m.post.id,
        post: m.post,
        members: [],
      };
      pending.set(key, group);
      ordered.push(group);
    }
    pending.get(key).members.push(m);
  }

  const out = [];
  for (const entry of ordered) {
    if (entry.kind !== 'aggregate') {
      out.push(entry);
      continue;
    }
    const { members } = entry;
    entry.created_at = members[0]?.created_at || '';
    entry.unreadCount = members.filter((m) => m.status === 'unread').length;
    if (members.length < 2) {
      // 单成员退回普通消息行(不渲染聚合壳——首个版本在这里把聚合行也 push 了,
      // 列表顶部多出无点无摘要的幽灵行,2026-11-21 截图实测抓到)
      out.push({
        kind: 'message',
        id: members[0].id,
        msg: members[0],
        created_at: members[0].created_at,
      });
      continue;
    }
    out.push(entry);
    if (expandedIds.has(entry.id)) {
      for (const m of members) {
        out.push({ kind: 'message', id: m.id, msg: m, created_at: m.created_at });
      }
    }
  }
  return out;
};

/** 聚合行文案:「星野、Mochi 等 12 人」(≤2 人不带「等」);一个用户名都没有兜底「有人」 */
export const aggregateActorNames = (members) => {
  const names = (members || [])
    .map((m) => m?.sender?.username || '')
    .filter(Boolean)
    .slice(0, 2);
  const total = members?.length || 0;
  if (!names.length) return '有人';
  return names.length < total ? `${names.join('、')} 等 ${total} 人` : names.join('、');
};
