import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRouteScrollMemory,
  recallRouteScroll,
  rememberRouteScroll,
} from '../../src/utils/route-scroll-memory.js';

const route = (fullPath, meta = {}) => ({ fullPath, meta });

describe('route-scroll-memory', () => {
  beforeEach(() => clearRouteScrollMemory());

  it('只记 keepAlive 路由：非缓存页面离开就该回顶部，不该被记住', () => {
    rememberRouteScroll(route('/shop', { keepAlive: false }), 640);
    rememberRouteScroll(route('/albums/1'), 320);
    expect(recallRouteScroll(route('/shop', { keepAlive: false }))).toBeUndefined();
    expect(recallRouteScroll(route('/albums/1'))).toBeUndefined();
  });

  it('按 fullPath 分开记：同一路由的 ?tab= / ?view= 各自独立', () => {
    const meta = { keepAlive: true };
    rememberRouteScroll(route('/user-space?tab=posts', meta), 120);
    rememberRouteScroll(route('/user-space?tab=messages', meta), 480);
    expect(recallRouteScroll(route('/user-space?tab=posts', meta))).toBe(120);
    expect(recallRouteScroll(route('/user-space?tab=messages', meta))).toBe(480);
    // 没访问过的分页不给值，调用方照旧走 { top: 0 }
    expect(recallRouteScroll(route('/user-space?tab=settings', meta))).toBeUndefined();
  });

  it('四舍五入并夹到非负：滚动位置只用于 { top }，负值会让路由抛错', () => {
    const meta = { keepAlive: true };
    rememberRouteScroll(route('/user-space/note', meta), 133.6);
    expect(recallRouteScroll(route('/user-space/note', meta))).toBe(134);
    rememberRouteScroll(route('/user-space/note', meta), -9);
    expect(recallRouteScroll(route('/user-space/note', meta))).toBe(0);
  });

  it('忽略非数字读数：读不到 window.scrollY 时不能把 undefined 记成位置', () => {
    const meta = { keepAlive: true };
    rememberRouteScroll(route('/user-space/note', meta), Number.NaN);
    expect(recallRouteScroll(route('/user-space/note', meta))).toBeUndefined();
    rememberRouteScroll(route('/user-space/note', meta), undefined);
    expect(recallRouteScroll(route('/user-space/note', meta))).toBeUndefined();
  });

  it('超过上限丢最早的一条（LRU），不会无限增长', () => {
    const meta = { keepAlive: true };
    for (let i = 0; i < 30; i += 1) {
      rememberRouteScroll(route(`/user-space?tab=x${i}`, meta), i);
    }
    // 最早写入的 24 条之外的 6 条已被丢弃
    expect(recallRouteScroll(route('/user-space?tab=x0', meta))).toBeUndefined();
    expect(recallRouteScroll(route('/user-space?tab=x29', meta))).toBe(29);
  });

  it('router 真的接上了：scrollBehavior 读记忆、beforeEach 写记忆', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(import.meta.dirname, '../../src/router/index.ts'), 'utf8');

    // 读点必须在 scrollBehavior 里、且在同一父路由短路 return false 之前
    const behaviorStart = source.indexOf('scrollBehavior(');
    const recallAt = source.indexOf('recallRouteScroll(to)', behaviorStart);
    const sameParentGuard = source.indexOf(
      'to.matched[0].path === from.matched[0].path',
      behaviorStart,
    );
    expect(behaviorStart).toBeGreaterThan(-1);
    expect(recallAt).toBeGreaterThan(behaviorStart);
    expect(sameParentGuard).toBeGreaterThan(recallAt);

    // 写点必须在 beforeEach 的第一句（任何 early return 之前）
    const guardStart = source.indexOf('router.beforeEach(');
    const rememberAt = source.indexOf('rememberRouteScroll(from, window.scrollY)', guardStart);
    const firstEarlyReturn = source.indexOf('next(false)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(rememberAt).toBeGreaterThan(guardStart);
    expect(rememberAt).toBeLessThan(firstEarlyReturn);
  });
});
