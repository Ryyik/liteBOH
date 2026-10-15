import { describe, expect, it } from 'vitest';
import { buildUnreadDigest, UNREAD_DIGEST_MIN } from '../../src/utils/notification-digest.js';

// =====================================================================
// 灵动岛未读聚合文案（notification-digest）
//
//   口径：点开消息中心且未读 ≥ 4 条才弹岛（UNREAD_DIGEST_MIN），
//   文案唯一形态 = 类型计数档「N 条未读：点赞 x · 评论 y …」。
//
//   反证：把 notification-digest.js 的 UNREAD_DIGEST_MIN 改回 1 或把
//   SYSTEM_GROUP_TYPES 里的 'lottery_win' 删掉 → 对应断言必红。
// =====================================================================

const row = (over = {}) => ({
  id: `n-${Math.random().toString(36).slice(2, 8)}`,
  type: 'like',
  status: 'unread',
  archived_at: null,
  ...over,
});

const nOf = (type, count, extra = {}) =>
  Array.from({ length: count }, (_, i) => row({ type, ...extra, id: `${type}-${i}` }));

describe('buildUnreadDigest 阈值与守卫', () => {
  it('UNREAD_DIGEST_MIN 恒为 4（拍板口径：>3 条才弹）', () => {
    expect(UNREAD_DIGEST_MIN).toBe(4);
  });

  it('空列表 / 非数组输入返回 null', () => {
    expect(buildUnreadDigest([])).toBeNull();
    expect(buildUnreadDigest(null)).toBeNull();
    expect(buildUnreadDigest(undefined)).toBeNull();
    expect(buildUnreadDigest('not-an-array')).toBeNull();
  });

  it('未读不足 4 条返回 null（1 条 / 3 条档不弹岛）', () => {
    expect(buildUnreadDigest(nOf('like', 1))).toBeNull();
    expect(buildUnreadDigest(nOf('like', 3))).toBeNull();
  });

  it('已读与已归档行不计数：4 条未读里 2 条已读 → null', () => {
    const rows = [
      ...nOf('like', 2),
      row({ type: 'comment', status: 'read' }),
      row({ type: 'comment', archived_at: '2026-10-01T00:00:00Z' }),
    ];
    expect(buildUnreadDigest(rows)).toBeNull();
  });
});

describe('buildUnreadDigest 文案形态', () => {
  it('单类型 4 条：N = 未读数', () => {
    expect(buildUnreadDigest(nOf('like', 4))).toBe('4 条未读：点赞 4');
  });

  it('多类型按数量降序，同数量按首现序（输出稳定）', () => {
    const rows = [...nOf('comment', 2), ...nOf('like', 2), ...nOf('follow', 3)];
    expect(buildUnreadDigest(rows)).toBe('7 条未读：关注 3 · 评论 2 · 点赞 2');
  });

  it('超过 3 类截前 3 类并追加「等 N 类」', () => {
    const rows = [
      ...nOf('like', 3),
      ...nOf('comment', 2),
      ...nOf('follow', 1),
      ...nOf('impression', 1),
    ];
    expect(buildUnreadDigest(rows)).toBe('7 条未读：点赞 3 · 评论 2 · 关注 1 等 4 类');
  });

  it('恰好 3 类不追加「等」', () => {
    const rows = [...nOf('like', 2), ...nOf('comment', 1), ...nOf('follow', 1)];
    expect(buildUnreadDigest(rows)).toBe('4 条未读：点赞 2 · 评论 1 · 关注 1');
  });
});

describe('buildUnreadDigest 类型归组', () => {
  it('系统组统一计为「系统」（system/gift/中奖/订阅/审查）', () => {
    const rows = [
      ...nOf('like', 2),
      row({ type: 'system' }),
      row({ type: 'gift' }),
      row({ type: 'lottery_win' }),
      row({ type: 'subscription' }),
    ];
    expect(buildUnreadDigest(rows)).toBe('6 条未读：系统 4 · 点赞 2');
  });

  it('未收录类型兜底「消息」', () => {
    const rows = [...nOf('like', 2), ...nOf('mystery_type', 2)];
    expect(buildUnreadDigest(rows)).toBe('4 条未读：点赞 2 · 消息 2');
  });
});

describe('buildUnreadDigest 总数口径', () => {
  it('totalCount（角标）大于列表未读数时作为 N（分页截断场景）', () => {
    expect(buildUnreadDigest(nOf('like', 4), { totalCount: 9 })).toBe('9 条未读：点赞 4');
  });

  it('totalCount 不大于列表未读数时忽略（用列表数）', () => {
    expect(buildUnreadDigest(nOf('like', 4), { totalCount: 3 })).toBe('4 条未读：点赞 4');
    expect(buildUnreadDigest(nOf('like', 4), { totalCount: null })).toBe('4 条未读：点赞 4');
    expect(buildUnreadDigest(nOf('like', 4), { totalCount: NaN })).toBe('4 条未读：点赞 4');
  });
});
