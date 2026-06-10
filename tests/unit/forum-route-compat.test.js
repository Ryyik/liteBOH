import { describe, expect, it } from 'vitest';
import { communityRoutes } from '../../src/router/routes/community.js';
import { userSpaceRoutes } from '../../src/router/routes/user-space.js';

describe('forum route compatibility', () => {
  it('keeps legacy /forum links landing in user-space posts', () => {
    const forumRoute = communityRoutes.find((route) => route.path === '/forum');

    expect(forumRoute?.name).toBe('Forum');
    expect(typeof forumRoute?.redirect).toBe('function');
    expect(forumRoute.redirect({ query: { restore: '1', returnKey: 'forum' } })).toEqual({
      path: '/user-space',
      query: {
        restore: '1',
        returnKey: 'forum',
        tab: 'posts'
      }
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
