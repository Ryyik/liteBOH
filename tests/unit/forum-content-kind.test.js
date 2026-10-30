import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { stripComments } from '../helpers/source.js';

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
import { deriveForumPostKind } from '../../src/utils/forum-post-format.js';

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

/* ── 内容类型派生单源（2026-10-30 P2-2）──────────────────────────────────
   这段逻辑此前有 4 份副本，且**已经漂移**：数据层兜底 'post'、视图层兜底 'unknown'。
   单源后兜底值必须仍按调用方传入 —— 本组用例同时钉住「行为」和「兜底值不被统一」。 */
describe('deriveForumPostKind（派生单源）', () => {
  it('post_kind 字段优先，空白值视为没有', () => {
    expect(deriveForumPostKind({ post_kind: 'repost', content: '【新闻】x' })).toBe('repost');
    expect(deriveForumPostKind({ post_kind: '   ', content: '【新闻】x' })).toBe('news');
    expect(deriveForumPostKind({ post_kind: '', content: '【活动】x' })).toBe('activity');
  });

  it('按行首前缀兜底（必须锚定，正文中间的【】不算）', () => {
    expect(deriveForumPostKind({ content: '【新闻】标题\n正文' })).toBe('news');
    expect(deriveForumPostKind({ content: '【活动】标题\n正文' })).toBe('activity');
    expect(deriveForumPostKind({ content: '正文里提到【新闻】两个字' })).toBe('post');
  });

  it('兜底值由调用方决定：数据层 post / 视图层 unknown', () => {
    expect(deriveForumPostKind({ content: '普通帖' })).toBe('post');
    expect(deriveForumPostKind({ content: '普通帖' }, { fallback: 'unknown' })).toBe('unknown');
  });

  it('titleIndex 只在没有字段也没有前缀时生效（视图层补全链路）', () => {
    const titleIndex = {
      newsByTitle: new Map([['某新闻标题', { id: 'n1' }]]),
      activityByTitle: new Map([['某活动标题', { id: 'a1' }]]),
    };
    expect(
      deriveForumPostKind({ content: '无前缀', title: '某新闻标题' }, { fallback: 'unknown', titleIndex }),
    ).toBe('news');
    expect(
      deriveForumPostKind({ content: '无前缀', title: '某活动标题' }, { fallback: 'unknown', titleIndex }),
    ).toBe('activity');
    expect(
      deriveForumPostKind({ content: '无前缀', title: '没收录的标题' }, { fallback: 'unknown', titleIndex }),
    ).toBe('unknown');
    // 前缀优先级高于 titleIndex
    expect(
      deriveForumPostKind({ content: '【活动】x', title: '某新闻标题' }, { fallback: 'unknown', titleIndex }),
    ).toBe('activity');
  });

  it('不传 titleIndex 时不会误判（Map 不存在也不炸）', () => {
    expect(deriveForumPostKind({ content: '普通', title: '某新闻标题' })).toBe('post');
  });
});

/* ── 源码守卫：派生只许有一份（2026-10-30 P2-2）────────────────────────────
   为什么要有它：这段逻辑的失效方式是**静默的** —— 4 份副本里改 1 处，剩下 3 处
   照旧跑，症状只是「某个入口的类型过滤结果和别的入口不一样」（2026-10-22 资讯空列表
   就是这么来的，当时只收敛了「筛选」没收敛「派生」）。
   ⚠️ 断言按「出现该字面量的文件集合」比，不是数次数 —— 单源文件里出现两次
   （news / activity 各一条）是正常的；换成计数会在加一行注释时假红。 */
describe('内容类型派生的源码守卫', () => {
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(js|ts|vue|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  it('【新闻】/【活动】前缀判断只允许出现在单源文件里', () => {
    const offenders = walk('src').filter((file) => {
      // 先剥注释：单源文件的注释里也提到了这两个前缀，那是说明不是实现
      const code = stripComments(readFileSync(file, 'utf8'));
      return code.includes('【新闻】') || code.includes('【活动】');
    });
    expect(offenders).toEqual(['src/utils/forum-post-format.js']);
  });
});
