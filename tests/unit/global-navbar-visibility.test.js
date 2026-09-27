import { describe, it, expect } from 'vitest';
import { isGlobalNavbarVisible } from '../../src/utils/global-navbar-visibility.js';

/**
 * 护栏：全局导航栏可见性判据（**单一真源**）。
 *
 * 为什么要有这个单测：`showIsland.ai()` 能否打开 AI 岛，取决于导航栏是否渲染
 * （岛体挂在导航栏内）。这条判据曾经在 App.vue 与 useGlobalAiOverlay.canOpen 里
 * **各写一份且不一致** —— canOpen 只判 hideNavbar，于是下面这几类「导航栏已隐藏但
 * meta 没标记」的路由上 canOpen=true，`showIsland.ai()` 静默返回 false，
 * 用户看到「AI 岛当前不可用，请稍后再试」（必然失败却像是偶发）。
 *
 * 本测试把「哪些路由没有导航栏」钉死：改判据必须同时改这里，
 * 从而不可能再出现两份漂移的实现。
 */
const route = (patch) => ({
  name: 'Home',
  path: '/',
  query: {},
  meta: {},
  ...patch,
});

describe('isGlobalNavbarVisible（导航栏可见性单一真源）', () => {
  it('普通页面显示导航栏', () => {
    expect(isGlobalNavbarVisible(route({}))).toBe(true);
    expect(isGlobalNavbarVisible(route({ name: 'Home', path: '/' }))).toBe(true);
    expect(
      isGlobalNavbarVisible(
        route({ name: 'UserSpace', path: '/user-space', query: { tab: 'community' } }),
      ),
    ).toBe(true);
  });

  it('route 缺失时按可见处理（首屏路由未就绪）', () => {
    expect(isGlobalNavbarVisible(null)).toBe(true);
    expect(isGlobalNavbarVisible(undefined)).toBe(true);
  });

  it('meta.hideNavbar 隐藏（PostDetail / UserProfile / admin 等）', () => {
    expect(isGlobalNavbarVisible(route({ name: 'PostDetail', meta: { hideNavbar: true } }))).toBe(
      false,
    );
    expect(isGlobalNavbarVisible(route({ name: 'UserProfile', meta: { hideNavbar: true } }))).toBe(
      false,
    );
  });

  it('桌面嵌入模式隐藏（?embed=desktop）', () => {
    expect(isGlobalNavbarVisible(route({ query: { embed: 'desktop' } }))).toBe(false);
  });

  it('从用户空间跳出的页面隐藏（?from=userspace*）—— 这正是 canOpen 曾漏判的一类', () => {
    expect(isGlobalNavbarVisible(route({ query: { from: 'userspace' } }))).toBe(false);
    expect(isGlobalNavbarVisible(route({ query: { from: 'userspace-detail' } }))).toBe(false);
    // 注意：论坛自己的详情跳转用的是 user-space（带连字符），不受此条影响
    expect(isGlobalNavbarVisible(route({ query: { from: 'user-space' } }))).toBe(true);
    expect(isGlobalNavbarVisible(route({ query: { from: 'forum' } }))).toBe(true);
  });

  it('user-space「我的」子视图隐藏（tab=profile + view≠home）—— 论坛列表在这里仍会渲染', () => {
    expect(
      isGlobalNavbarVisible(
        route({ path: '/user-space', query: { tab: 'profile', view: 'posts' } }),
      ),
    ).toBe(false);
    expect(
      isGlobalNavbarVisible(
        route({ path: '/user-space', query: { tab: 'profile', view: 'likes' } }),
      ),
    ).toBe(false);
    // view=home（或没有 view）是分区首页，导航栏照常
    expect(
      isGlobalNavbarVisible(
        route({ path: '/user-space', query: { tab: 'profile', view: 'home' } }),
      ),
    ).toBe(true);
    expect(isGlobalNavbarVisible(route({ path: '/user-space', query: { tab: 'profile' } }))).toBe(
      true,
    );
  });

  it('user-space 设置子视图隐藏（tab=settings + view≠home）', () => {
    expect(
      isGlobalNavbarVisible(
        route({ path: '/user-space', query: { tab: 'settings', view: 'privacy' } }),
      ),
    ).toBe(false);
    expect(
      isGlobalNavbarVisible(
        route({ path: '/user-space', query: { tab: 'settings', view: 'home' } }),
      ),
    ).toBe(true);
  });

  it('同样的 tab/view 在其他页面上不误伤', () => {
    expect(
      isGlobalNavbarVisible(route({ path: '/', query: { tab: 'profile', view: 'posts' } })),
    ).toBe(true);
    expect(
      isGlobalNavbarVisible(route({ path: '/forum', query: { tab: 'settings', view: 'privacy' } })),
    ).toBe(true);
  });
});
