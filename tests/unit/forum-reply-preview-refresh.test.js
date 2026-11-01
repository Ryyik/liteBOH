import { describe, expect, it } from 'vitest';
import {
  shouldRefetchReplyPreview,
  markReplyPreviewSnapshot,
} from '../../src/utils/forum-helpers.js';

/* 这组用例锁的是 2026-11-01 的一次线上报障：
   「关注的人评论了我的帖子，帖子列表与详情都看不到这条评论」。

   根因不在数据库（评论行、站内通知、邮件账本都在），而在列表卡片：
   列表 RPC 会把每条帖子的顶层评论快照塞进 `replies` 并置 `replies_preloaded = true`，
   于是旧的短路条件「replies 非空 或 replies_preloaded」对**每一条**帖子都成立 ⇒
   只要不刷新整页，卡片里的评论永远停在打开列表那一刻的快照上：
   别人新发的、自己刚发的评论都不出现，但 comment_count 已经涨了。

   ⚠️ 这些断言必须能对着「旧实现」变红，否则等于没测：
   旧实现在 A/B/C/D 四条里都会返回 false（= 不用重拉），也就是本条报障本身。 */

const post = (overrides = {}) => ({
  id: 'p1',
  comment_count: 1,
  replies: [],
  replies_preloaded: false,
  ...overrides,
});

describe('shouldRefetchReplyPreview — 什么时候必须重拉卡片回复预览', () => {
  it('A. 从没拉过（无 replies 且未预载）⇒ 必须拉', () => {
    expect(shouldRefetchReplyPreview(post())).toBe(true);
  });

  it('B. 预载过且评论数没变 ⇒ 用快照，不重复请求', () => {
    const p = post({ replies: [{ id: 'c1' }], replies_preloaded: true });
    markReplyPreviewSnapshot(p);
    expect(shouldRefetchReplyPreview(p)).toBe(false);
  });

  it('C. 预载后评论数涨了（别人刚评论）⇒ 快照过期，必须重拉', () => {
    const p = post({ replies: [{ id: 'c1' }], replies_preloaded: true });
    markReplyPreviewSnapshot(p); // 记下 comment_count = 1
    p.comment_count = 2; // 别人的新评论进来（卡片计数已刷新）
    expect(shouldRefetchReplyPreview(p)).toBe(true);
  });

  it('D. 快照是空数组但已预载，评论数从 0 涨到 1 ⇒ 必须重拉（旧实现在这里永久空列表）', () => {
    const p = post({ replies: [], replies_preloaded: true, comment_count: 0 });
    markReplyPreviewSnapshot(p);
    p.comment_count = 1;
    expect(shouldRefetchReplyPreview(p)).toBe(true);
  });

  it('E. 老对象没有快照计数（上线前的缓存/非 RPC 来源）⇒ 保持既有行为，不额外打请求', () => {
    const p = post({ replies: [{ id: 'c1' }], replies_preloaded: true });
    expect(shouldRefetchReplyPreview(p)).toBe(false);
  });

  it('F. 缺 id 的伪帖子 ⇒ 不判定为需要请求（调用方会自行 return）', () => {
    expect(shouldRefetchReplyPreview({ ...post(), id: '' })).toBe(false);
    expect(shouldRefetchReplyPreview(null)).toBe(false);
  });
});

describe('markReplyPreviewSnapshot — 快照与计数绑定', () => {
  it('记下的就是写入那一刻的 comment_count（字符串也归一为数字）', () => {
    const p = post({ comment_count: '7', replies: [{ id: 'c1' }], replies_preloaded: true });
    markReplyPreviewSnapshot(p);
    expect(p.replies_snapshot_count).toBe(7);
    p.comment_count = 7;
    expect(shouldRefetchReplyPreview(p)).toBe(false);
  });

  it('评论数缺失按 0 处理，不产生 NaN（NaN 会让判定永远「不过期」）', () => {
    const p = post({ comment_count: undefined, replies: [{ id: 'c1' }], replies_preloaded: true });
    markReplyPreviewSnapshot(p);
    expect(Number.isFinite(p.replies_snapshot_count)).toBe(true);
    expect(p.replies_snapshot_count).toBe(0);
  });
});
