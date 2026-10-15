import { describe, expect, it } from 'vitest';
import { communityRoutes } from '../../src/router/routes/community.js';
import { compatRoutes } from '../../src/router/routes/compat.js';
import { userSpaceRoutes } from '../../src/router/routes/user-space.js';

describe('forum route compatibility', () => {
  it('keeps legacy /forum links landing on the home forum section', () => {
    // 2026-10-15 修正：/forum 原 target 是 `?tab=posts`，但 09-30 tab 语义翻转后
    // 那是「我」页 —— 旧论坛链接被误导进个人空间。现落首页论坛分区（与顶栏同款）。
    const forumRoute = compatRoutes.find((route) => route.path === '/forum');

    expect(forumRoute?.name).toBe('Forum');
    expect(typeof forumRoute?.redirect).toBe('function');
    expect(forumRoute.redirect({ query: { restore: '1', returnKey: 'forum' } })).toEqual({
      path: '/',
      query: {
        restore: '1',
        returnKey: 'forum',
        view: 'latest',
      },
    });
  });

  it('keeps post detail share links stable', () => {
    const detailRoute = communityRoutes.find((route) => route.path === '/forum/post/:id');

    expect(detailRoute?.name).toBe('PostDetail');
    expect(detailRoute?.component).toBeTypeOf('function');
  });

  it('allows the user-space shell to render for logged-out visitors', () => {
    const userSpaceRoute = userSpaceRoutes.find((route) => route.path === '/user-space');

    expect(userSpaceRoute?.name).toBe('UserSpace');
    expect(userSpaceRoute?.meta?.requiresLogin).not.toBe(true);
  });
});
