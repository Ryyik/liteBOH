import { describe, expect, it } from 'vitest';
import {
  formatSeenAnchorLabel,
  resolveForumSeenDivider,
} from '@/composables/useForumSeenDivider.js';

/** 造帖子：`offsetMinutes` 为距锚点的分钟数（正数 = 锚点之后 = 新帖） */
const postAt = (offsetMinutes, id = `p-${offsetMinutes}`) => ({
  id,
  created_at: new Date(baseMs + offsetMinutes * 60000).toISOString(),
});

const baseMs = new Date(2026, 10, 8, 22, 14, 0).getTime();
const anchorIso = new Date(baseMs).toISOString();

describe('resolveForumSeenDivider', () => {
  it('新帖在列表头部连续时，分隔线落在第一条旧帖之前', () => {
    const posts = [postAt(120), postAt(60), postAt(-10), postAt(-60), postAt(-120)];
    expect(resolveForumSeenDivider({ posts, anchorIso })).toEqual({
      visible: true,
      splitIndex: 2,
      newCount: 2,
    });
  });

  it('首次登录（合成 7 天锚点）不画：没有「上次」可言', () => {
    const posts = [postAt(120), postAt(-10)];
    expect(resolveForumSeenDivider({ posts, anchorIso, isFirstLogin: true }).visible).toBe(false);
  });

  it('无锚点 / 锚点不可解析时不画', () => {
    const posts = [postAt(120), postAt(-10)];
    expect(resolveForumSeenDivider({ posts, anchorIso: null }).visible).toBe(false);
    expect(resolveForumSeenDivider({ posts, anchorIso: 'not-a-date' }).visible).toBe(false);
  });

  it('全部是新帖时不提示（2026-11-10 拍板：整页都新就不显示任何东西）', () => {
    const posts = [postAt(120), postAt(60), postAt(30)];
    expect(resolveForumSeenDivider({ posts, anchorIso }).visible).toBe(false);
  });

  it('没有新帖时不画', () => {
    const posts = [postAt(-10), postAt(-60)];
    expect(resolveForumSeenDivider({ posts, anchorIso }).visible).toBe(false);
  });

  it('不足两条时不画（无从区分新旧）', () => {
    expect(resolveForumSeenDivider({ posts: [postAt(60)], anchorIso }).visible).toBe(false);
    expect(resolveForumSeenDivider({ posts: [], anchorIso }).visible).toBe(false);
  });

  it('遇到不可解析的时间就停止计数（宁可少标，不可错标）', () => {
    const posts = [postAt(120), { id: 'broken', created_at: 'oops' }, postAt(-10)];
    expect(resolveForumSeenDivider({ posts, anchorIso })).toEqual({
      visible: true,
      splitIndex: 1,
      newCount: 1,
    });
  });

  it('缺少 created_at 的帖子同样停止计数', () => {
    const posts = [postAt(120), { id: 'no-date' }, postAt(-10)];
    expect(resolveForumSeenDivider({ posts, anchorIso }).newCount).toBe(1);
  });

  it('非时间倒序 / 有筛选（enabled=false）时不画', () => {
    const posts = [postAt(120), postAt(-10)];
    expect(resolveForumSeenDivider({ posts, anchorIso, enabled: false }).visible).toBe(false);
  });

  it('恰好与锚点同一时刻的帖子算旧帖（边界含在内）', () => {
    const posts = [postAt(60), postAt(0), postAt(-60)];
    expect(resolveForumSeenDivider({ posts, anchorIso }).newCount).toBe(1);
  });
});

describe('formatSeenAnchorLabel', () => {
  it('同年只给 MM-DD HH:mm', () => {
    const iso = new Date(2026, 10, 8, 22, 14).toISOString();
    expect(formatSeenAnchorLabel(iso, new Date(2026, 10, 10, 11, 0))).toBe('11-08 22:14');
  });

  it('跨年补年份，避免「01-03」看不出是哪一年', () => {
    const iso = new Date(2025, 0, 3, 9, 5).toISOString();
    expect(formatSeenAnchorLabel(iso, new Date(2026, 10, 10, 11, 0))).toBe('2025-01-03 09:05');
  });

  it('空值 / 非法时间返回空串（模板里就不会输出多余的「 · 」）', () => {
    expect(formatSeenAnchorLabel('', new Date())).toBe('');
    expect(formatSeenAnchorLabel('nope', new Date())).toBe('');
    expect(formatSeenAnchorLabel(null, new Date())).toBe('');
  });
});
