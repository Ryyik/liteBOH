import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldMarkBootReady } from '../../src/utils/boot-readiness.js';

/**
 * 启动态「壳已就绪」判据 + App.vue 接线守卫。
 *
 * 背景：`router.isReady()` 是一次性的，首次导航 reject 后永不再 resolve；
 * 2026-10-27 用户截图里「上面正在加载、下面内容已经渲染出来（两块面板失败态）」
 * 就是这个状态。补的 afterEach 兜底必须同时满足三件事，缺一件就是假绿：
 *   ① 判 `failure`（导航失败也会触发 afterEach，不判会把失败当成就绪）；
 *   ② 幂等（已就绪不重复处理）；
 *   ③ 真的置位 bootReady 并撤掉「加载超时」卡。
 */

describe('shouldMarkBootReady', () => {
  it('首次成功导航 ⇒ 就绪（failure 为 undefined / null 都算）', () => {
    expect(shouldMarkBootReady(undefined, false)).toBe(true);
    expect(shouldMarkBootReady(null, false)).toBe(true);
  });

  it('导航失败 / 被取消（failure 非空）⇒ 绝不能撤掉启动态', () => {
    expect(
      shouldMarkBootReady(new Error('Failed to fetch dynamically imported module'), false),
    ).toBe(false);
    // vue-router 的 NavigationFailure 对象（aborted / cancelled / duplicated）
    expect(shouldMarkBootReady({ type: 4, message: 'cancelled' }, false)).toBe(false);
  });

  it('已就绪后不重复处理（afterEach 每次导航都会跑）', () => {
    expect(shouldMarkBootReady(undefined, true)).toBe(false);
    expect(shouldMarkBootReady(new Error('x'), true)).toBe(false);
  });
});

describe('App.vue 的启动态接线', () => {
  const app = readFileSync(resolve(import.meta.dirname, '../../src/App.vue'), 'utf8');

  /** 截出某个调用的整段（从 needle 到其后第一个 `});`）—— 比写死缩进/换行稳 */
  const sliceCall = (source, needle) => {
    const start = source.indexOf(needle);
    if (start === -1) return '';
    const end = source.indexOf('});', start);
    return end === -1 ? source.slice(start) : source.slice(start, end);
  };

  it('注册了 afterEach 兜底，并把 failure 交给同一个判据', () => {
    // 不判 failure 就等于「导航失败也当成就绪」—— 直接把启动态提前撤掉
    expect(app).toMatch(/router\.afterEach\(\s*\([^)]*failure[^)]*\)\s*=>/);
    expect(app).toMatch(/shouldMarkBootReady\(\s*failure\s*,\s*bootReady\.value\s*\)/);
  });

  it('回调体里真的置位 bootReady 并撤掉「加载超时」卡', () => {
    const body = sliceCall(app, 'router.afterEach');
    expect(body).not.toBe('');
    expect(body).toMatch(/bootReady\.value\s*=\s*true/);
    expect(body).toMatch(/bootTimedOut\.value\s*=\s*false/);
  });

  it('判据逻辑不在 App.vue 里现写第二份', () => {
    // 判据只有 utils/boot-readiness.js 一处；组件里出现 `!failure && !bootReady` 就是抄了第二份
    expect(app).not.toMatch(/!\s*failure\s*&&\s*!\s*bootReady/);
  });
});
