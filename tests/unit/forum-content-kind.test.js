import { describe, expect, it, vi } from 'vitest';

/* post-api 会初始化 supabase client（依赖 VITE_SUPABASE_*），单测里整体打桩，
   只保留纯函数逻辑 —— 与 tests/unit/weekly-checkin-contract.test.js 同一套做法。 */
vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import {
  matchesForumContentKind,
  normalizeForumKindFilter,
} from '../../src/utils/api/forum/post-api.js';

/**
 * 线上事故（2026-10-22）：论坛把顶部「新闻」「活动」并成「资讯」一席后，
 * 点「资讯」是空列表、并显示「没有找到「」相关的内容」。
 *
 * 根因不在取数：服务端确实返回了 10 行（news + activity），
 * 但 ForumMain 的 prepareForumPosts 用 `kind === selectedContentType` 精确匹配，
 * 'news'/'activity' 都不等于 'info' ⇒ 10 行被全部过滤掉。
 * 另外 CONTENT_TYPE_LABELS 里没有 'info'，空态文案里的类型名就成了空括号。
 *
 * 这组用例锁住两件事：
 *   ① info = news + activity（展示层与取数层口径必须一致）
 *   ② normalizeForumKindFilter('info') 明确「服务端不过滤 + 客户端补筛」
 */
describe('论坛内容类型筛选', () => {
  describe('matchesForumContentKind', () => {
    it('未选中时不过滤任何行', () => {
      for (const kind of ['post', 'repost', 'news', 'activity', 'unknown', '']) {
        expect(matchesForumContentKind(kind, '')).toBe(true);
        expect(matchesForumContentKind(kind, null)).toBe(true);
      }
    });

    it('资讯 = 官方新闻 + 活动', () => {
      expect(matchesForumContentKind('news', 'info')).toBe(true);
      expect(matchesForumContentKind('activity', 'info')).toBe(true);
      expect(matchesForumContentKind('post', 'info')).toBe(false);
      expect(matchesForumContentKind('repost', 'info')).toBe(false);
      expect(matchesForumContentKind('unknown', 'info')).toBe(false);
    });

    it('论坛 = 普通帖 + 转发 + 未知类型', () => {
      expect(matchesForumContentKind('post', 'post')).toBe(true);
      expect(matchesForumContentKind('repost', 'post')).toBe(true);
      expect(matchesForumContentKind('unknown', 'post')).toBe(true);
      expect(matchesForumContentKind('', 'post')).toBe(true);
      expect(matchesForumContentKind('news', 'post')).toBe(false);
    });

    it('单类型仍按精确匹配（旧深链 ?view=news / activity 不受影响）', () => {
      expect(matchesForumContentKind('news', 'news')).toBe(true);
      expect(matchesForumContentKind('activity', 'news')).toBe(false);
      expect(matchesForumContentKind('activity', 'activity')).toBe(true);
      expect(matchesForumContentKind('news', 'activity')).toBe(false);
    });

    it('大小写/空白容错', () => {
      expect(matchesForumContentKind('news', ' INFO ')).toBe(true);
      expect(matchesForumContentKind('activity', 'Activity')).toBe(true);
    });
  });

  describe('normalizeForumKindFilter', () => {
    it('info 不下推服务端单值，改为客户端补筛两类', () => {
      expect(normalizeForumKindFilter('info')).toEqual({
        kindFilter: null,
        kindValues: ['news', 'activity'],
        clientOnly: true,
      });
    });

    it('news / activity 仍然走服务端单值', () => {
      expect(normalizeForumKindFilter('news')).toEqual({
        kindFilter: 'news',
        kindValues: ['news'],
      });
      expect(normalizeForumKindFilter('activity')).toEqual({
        kindFilter: 'activity',
        kindValues: ['activity'],
      });
    });

    it('post 覆盖转发', () => {
      expect(normalizeForumKindFilter('post')).toEqual({
        kindFilter: 'post',
        kindValues: ['post', 'repost'],
      });
    });

    it('未知值一律不过滤', () => {
      expect(normalizeForumKindFilter('')).toEqual({ kindFilter: null, kindValues: null });
      expect(normalizeForumKindFilter('whatever')).toEqual({
        kindFilter: null,
        kindValues: null,
      });
    });
  });
});
