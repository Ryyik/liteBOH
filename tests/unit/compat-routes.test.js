import { describe, expect, it } from 'vitest';
import { adminRoutes } from '../../src/router/routes/admin.js';
import { communityRoutes } from '../../src/router/routes/community.js';
import { compatRoutes } from '../../src/router/routes/compat.js';
import { publicRoutes } from '../../src/router/routes/public.js';
import { userSpaceRoutes } from '../../src/router/routes/user-space.js';

const findCompat = (path) => compatRoutes.find((route) => route.path === path);
const userCenterFold = (rest) =>
  findCompat('/user-center/:rest(.*)').redirect({ query: {}, params: { rest } });

describe('compat route registry（兼容层唯一登记处）', () => {
  it('重定向只许住在 compat.ts：各真页面路由文件里不再有 redirect 条目', () => {
    const strays = [...publicRoutes, ...communityRoutes, ...userSpaceRoutes, ...adminRoutes]
      .filter((route) => route.redirect)
      .map((route) => route.path);

    expect(strays).toEqual([]);
  });

  it('已被删除的零引用路径不再存在', () => {
    const allPaths = compatRoutes.map((route) => route.path);

    for (const gone of [
      '/user-center-v2',
      '/creator-studio',
      '/user-space/settings/beta-preview',
    ]) {
      expect(allPaths).not.toContain(gone);
    }
  });

  it('/user-center 折叠保持 11 条原直条的逐条落点（折而不变）', () => {
    expect(userCenterFold('info')).toEqual({ path: '/user-space', query: { tab: 'posts' } });
    expect(userCenterFold('points')).toEqual({ path: '/user-space', query: { tab: 'assets' } });
    expect(userCenterFold('subscriptions')).toEqual({
      path: '/user-space',
      query: { tab: 'assets' },
    });
    expect(userCenterFold('address')).toEqual({ path: '/user-space', query: { tab: 'assets' } });
    expect(userCenterFold('messages')).toEqual({
      path: '/user-space',
      query: { tab: 'messages', section: 'notifications' },
    });
    expect(userCenterFold('tags-impressions')).toEqual({
      path: '/user-space',
      query: { tab: 'posts', view: 'impressions' },
    });
    expect(userCenterFold('partners')).toEqual({ path: '/', query: { view: 'members' } });
    expect(userCenterFold('pushplus')).toEqual({
      path: '/user-space/pushplus-settings',
      query: {},
    });
    expect(userCenterFold('pushplus-settings')).toEqual({
      path: '/user-space/pushplus-settings',
      query: {},
    });
    expect(userCenterFold('shared-memories')).toEqual({
      path: '/user-space/shared-memories',
      query: {},
    });
  });

  it('折叠透传 query；任意深度子路径落默认段而不是 404', () => {
    const fold = findCompat('/user-center/:rest(.*)');

    expect(fold.redirect({ query: { from: 'x' }, params: { rest: 'points/detail' } })).toEqual({
      path: '/user-space',
      query: { from: 'x', tab: 'assets' },
    });
    expect(fold.redirect({ query: {}, params: { rest: 'unknown-page/sub' } })).toEqual({
      path: '/user-space',
      query: { tab: 'posts' },
    });
  });

  it('/forum 落首页论坛分区（2026-10-15 修正：不再误落「我」页）', () => {
    const forum = findCompat('/forum');

    expect(forum.redirect({ query: {} })).toEqual({ path: '/', query: { view: 'latest' } });
    expect(forum.redirect({ query: { view: 'activity' } })).toEqual({
      path: '/',
      query: { view: 'activity' },
    });
    // 非法 view 回落默认分区（resolveForumSection 口径：旧 ?view=impressions 等不再 404）
    expect(forum.redirect({ query: { view: 'bogus' } })).toEqual({
      path: '/',
      query: { view: 'latest' },
    });
  });

  it('/user-space/partners 孤儿页收编 → 论坛「成员」分区（2026-10-19）', () => {
    const partners = findCompat('/user-space/partners');
    expect(partners.redirect({ query: {} })).toEqual({ path: '/', query: { view: 'members' } });
    // query 透传（与 /forum 同款口径）
    expect(partners.redirect({ query: { from: 'x' } })).toEqual({
      path: '/',
      query: { from: 'x', view: 'members' },
    });
  });

  it('user-space 旧 tab 深链保持原落点（posts ↔ community 是互换成对）', () => {
    expect(findCompat('/user-space/posts').redirect({ query: {} })).toEqual({
      path: '/user-space',
      query: { tab: 'community' },
    });
    expect(findCompat('/user-space/community').redirect({ query: {} })).toEqual({
      path: '/user-space',
      query: { tab: 'posts' },
    });
  });

  it('命名跳转保持：BlockWall / Activities 仍可按 name 解析（CommunityTab 在用）', () => {
    expect(findCompat('/block-wall').name).toBe('BlockWall');
    expect(findCompat('/activities').name).toBe('Activities');
    expect(findCompat('/activities').children.map((child) => child.name)).toEqual([
      'ActivitiesPhotoWall',
      'ActivitiesList',
    ]);
  });
});
