/**
 * notification-list-view.test.js — 消息中心列表视图整形纯函数(2026-11-21)
 *
 * 锁两件事:
 *  1. buildAggregateEntries 同帖点赞聚合的边界(成员 <2 不渲染聚合壳——首个版本
 *     在这里漏过判,单条点赞也渲染聚合行,列表顶部出现无点无摘要的幽灵行);
 *  2. buildDateGroups 组头只在组键变化处插入,非单调顺序不重复插。
 * 数据形状与 Messages/index.vue 的 filteredMessages 对齐(type/sender/post/status/created_at)。
 */
import { describe, expect, it } from 'vitest';
import {
  buildAggregateEntries,
  buildDateGroups,
  aggregateActorNames,
  getDateGroupKey,
} from '../../src/utils/notification-list-view.js';

const NOW = new Date('2026-11-21T12:00:00+08:00');

const like = (id, postId, { sender = '星野', status = 'unread', daysAgo = 0 } = {}) => ({
  id,
  type: 'like',
  status,
  created_at: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  sender: { id: `u-${sender}`, username: sender },
  post: postId ? { id: postId, content: '帖子正文' } : null,
  comment: null,
});

const msg = (id, type, { daysAgo = 0, postId = 'p1', status = 'read' } = {}) => ({
  id,
  type,
  status,
  created_at: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  sender: { id: 'u1', username: '星野' },
  post: { id: postId, content: '帖子正文' },
  comment: null,
});

describe('getDateGroupKey', () => {
  it('今天/昨天/7 天内/更早 的日历日边界', () => {
    expect(getDateGroupKey('2026-11-21T08:00:00+08:00', NOW)).toBe('today');
    expect(getDateGroupKey('2026-11-20T23:00:00+08:00', NOW)).toBe('yesterday');
    expect(getDateGroupKey('2026-11-15T08:00:00+08:00', NOW)).toBe('week'); // 差 6 天
    expect(getDateGroupKey('2026-11-14T08:00:00+08:00', NOW)).toBe('earlier'); // 差 7 天
  });

  it('未来时间/非法值归入 today/null,不抛错', () => {
    expect(getDateGroupKey('2026-11-22T08:00:00+08:00', NOW)).toBe('today');
    expect(getDateGroupKey('not-a-date', NOW)).toBeNull();
    expect(getDateGroupKey('', NOW)).toBeNull();
    expect(getDateGroupKey(null, NOW)).toBeNull();
  });
});

describe('buildDateGroups', () => {
  it('组键变化处插组头,条目原样透传', () => {
    const entries = [
      { kind: 'message', id: 'a', created_at: '2026-11-21T08:00:00+08:00' },
      { kind: 'message', id: 'b', created_at: '2026-11-20T08:00:00+08:00' },
    ];
    const out = buildDateGroups(entries, NOW);
    expect(out.map((e) => e.kind)).toEqual(['header', 'message', 'header', 'message']);
    expect(out[0].label).toBe('今天');
    expect(out[2].label).toBe('昨天');
  });

  it('非单调顺序下同组键不重复插头(seenKeys 守卫)', () => {
    const entries = [
      { kind: 'message', id: 'a', created_at: '2026-11-21T08:00:00+08:00' },
      { kind: 'message', id: 'b', created_at: '2026-11-14T08:00:00+08:00' },
      { kind: 'message', id: 'c', created_at: '2026-11-21T07:00:00+08:00' }, // 乱序回跳
    ];
    const out = buildDateGroups(entries, NOW);
    const headers = out.filter((e) => e.kind === 'header');
    expect(headers).toHaveLength(2); // 今天 + 更早,今天的组头不重复
  });

  it('空数组返回空数组', () => {
    expect(buildDateGroups([], NOW)).toEqual([]);
  });
});

describe('buildAggregateEntries', () => {
  it('同帖 3 条赞聚成 1 行,成员/未读数/时间取最新成员', () => {
    const out = buildAggregateEntries([
      like('l1', 'p1', { daysAgo: 0 }),
      msg('c1', 'comment', { daysAgo: 0.1 }),
      like('l2', 'p1', { sender: 'Mochi', daysAgo: 0.2 }),
      like('l3', 'p1', { sender: '阿澈', status: 'read', daysAgo: 0.3 }),
    ]);
    const aggs = out.filter((e) => e.kind === 'aggregate');
    expect(aggs).toHaveLength(1);
    expect(aggs[0].members.map((m) => m.id)).toEqual(['l1', 'l2', 'l3']);
    expect(aggs[0].unreadCount).toBe(2);
    expect(aggs[0].created_at).toBe(aggs[0].members[0].created_at);
    // 聚合行位于最新成员的位置(下标 0),评论行在聚合行之后
    expect(out[0].kind).toBe('aggregate');
    expect(out.map((e) => e.id)).toContain('c1');
  });

  it('⭐ 单条点赞退回普通行,不渲染聚合壳(幽灵行回归守卫)', () => {
    const out = buildAggregateEntries([like('l1', 'p1')]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('message');
    expect(out[0].msg.id).toBe('l1');
  });

  it('不同帖的赞不聚合;同帖评论不聚合;无 post 不聚合', () => {
    const out = buildAggregateEntries([
      like('l1', 'p1'),
      like('l2', 'p2'),
      msg('c1', 'comment', { postId: 'p1' }),
      msg('c2', 'comment', { postId: 'p1' }),
      like('l3', null),
    ]);
    expect(out.filter((e) => e.kind === 'aggregate')).toHaveLength(0);
    expect(out.filter((e) => e.kind === 'message')).toHaveLength(5);
  });

  it('展开态 = 聚合行 + 成员消息行,顺序保持', () => {
    const out = buildAggregateEntries(
      [like('l1', 'p1', { daysAgo: 0 }), like('l2', 'p1', { sender: 'Mochi', daysAgo: 1 })],
      new Set(['like:p1']),
    );
    expect(out.map((e) => e.kind)).toEqual(['aggregate', 'message', 'message']);
    expect(out[1].msg.id).toBe('l1');
    expect(out[2].msg.id).toBe('l2');
  });
});

describe('aggregateActorNames', () => {
  it('≤2 人不带「等」,超出截前两个 + 总数', () => {
    const m = (n) => ({ sender: { username: n } });
    expect(aggregateActorNames([m('星野'), m('Mochi')])).toBe('星野、Mochi');
    expect(aggregateActorNames([m('星野'), m('Mochi'), m('阿澈'), m('小满')])).toBe(
      '星野、Mochi 等 4 人',
    );
  });

  it('无用户名兜底「有人」', () => {
    expect(aggregateActorNames([{ sender: {} }, { sender: {} }])).toBe('有人');
  });
});
