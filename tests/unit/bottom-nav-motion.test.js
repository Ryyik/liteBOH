import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBottomNavHandoffForTests,
  beginBottomNavHandoff,
  consumeBottomNavHandoff,
  refreshBottomNavHandoff,
} from '../../src/views/user-center/UserSpace/composables/bottom-nav-motion.js';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

let now = 10_000;

beforeEach(() => {
  vi.stubGlobal('window', {});
  now = 10_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  __resetBottomNavHandoffForTests();
});

afterEach(() => {
  __resetBottomNavHandoffForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('底栏跨页选中态接力', () => {
  it('匹配目标时把来源席交给目标底栏，且只消费一次', () => {
    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: 0, navCount: 5 });

    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toEqual({
      fromId: 'community',
      toId: 'posts',
      fromIndex: 0,
    });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();
  });

  it('目标或席位数不匹配时丢弃，避免脏状态跨导航存活', () => {
    beginBottomNavHandoff({ fromId: 'community', toId: 'messages', fromIndex: 0, navCount: 5 });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();

    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: 0, navCount: 5 });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 6 })).toBeNull();
  });

  it('同一个落点不产生接力；非法来源下标也拒绝', () => {
    beginBottomNavHandoff({ fromId: 'posts', toId: 'posts', fromIndex: 4, navCount: 5 });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();

    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: -1, navCount: 5 });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();
  });

  it('过期后不消费（防止很久以后误播一次旧导航）', () => {
    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: 0, navCount: 5 });
    now += 3_500;
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();
  });

  it('refreshBottomNavHandoff 能在确认草稿期间延长有效期', () => {
    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: 0, navCount: 5 });
    now += 1_200;
    refreshBottomNavHandoff({ fromId: 'community', toId: 'posts' });
    now += 1_000;
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toEqual({
      fromId: 'community',
      toId: 'posts',
      fromIndex: 0,
    });
  });

  it('prefers-reduced-motion 下不记录接力（直接落终点）', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    beginBottomNavHandoff({ fromId: 'community', toId: 'posts', fromIndex: 0, navCount: 5 });
    expect(consumeBottomNavHandoff({ toId: 'posts', navCount: 5 })).toBeNull();
  });
});

describe('底栏动画接线守卫', () => {
  const component = read('src/views/user-center/UserSpace/components/UserSpaceBottomNav.vue');
  const code = squeezeSource(stripComments(scriptSection(component)));
  const css = read('src/views/user-center/UserSpace/components/bottom-nav.css');

  it('点击记录来源席，安装/激活时消费接力', () => {
    expect(code).toContain(
      squeezeSource(
        'beginBottomNavHandoff({ fromId, toId: itemId, fromIndex: activeIndex.value, navCount: props.navItems.length })',
      ),
    );
    expect(code).toContain('consumeBottomNavHandoff(');
    expect(code).toContain('onActivated(');
    expect(code).toContain('applyActivatedHandoff()');
  });

  it('同页 tab 切换不记录跨页接力（只由组件内 watch 做位移）', () => {
    expect(code).toContain(
      squeezeSource("const targetPath = String(target?.route || '').split('?')[0]"),
    );
    expect(code).toContain(
      squeezeSource('const leavesCurrentPage = Boolean(targetPath && targetPath !== route.path)'),
    );
    expect(code).toContain(squeezeSource('if (fromId !== itemId && leavesCurrentPage)'));
  });

  it('指示器位置由 displayIndex 派生，而不是直接吃父层 index', () => {
    expect(code).toContain(squeezeSource("'--active-nav-index': displayIndex.value"));
    expect(component).toContain(':style="resolvedNavIndicatorStyle"');
  });

  it('位移时长由 CSS 变量驱动，且缓动是收尾柔和的 ease-out 族', () => {
    expect(css).toContain('--nav-indicator-duration: 320ms');
    expect(css).toContain(
      'transform var(--nav-indicator-duration, 320ms) var(--nav-indicator-ease)',
    );
    expect(css).toContain('--nav-indicator-ease: cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('位移步长仍是一整格（胶囊宽 + 6px = 100% / 席数）', () => {
    expect(css).toContain('width: calc(100% / var(--nav-count) - 6px)');
    expect(css).toContain('translateX(calc(var(--active-nav-index, 0) * (100% + 6px)))');
  });
});
