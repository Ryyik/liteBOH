/**
 * 「导航时先切构建」的守约（2026-10-13）
 *
 * 动机：用户一直开着页面时，轮询/可见性检查发现新构建只会弹 toast，页面继续跑旧构建。
 * 他下一次点导航，正好去请求**已被新部署删掉的 hash 资源** —— 实测表现为
 * 「点底栏毫无反应」或「半样式」，只能等恢复链整页兜。所以在导航这一拍先切构建，
 * 落点由 hash 保留，用户感知是「点了就到位」。
 *
 * 本文件锁四件事（真行为）：
 *   1. 没有挂起更新时不动作（不能影响正常导航）；
 *   2. 有挂起更新时发起带目标 buildId 的整页导航，并让调用方取消本次导航；
 *   3. **同一目标只试一次**（护栏复用 boh_version_reload_target）—— 这是防刷新循环的关键；
 *   4. 目标换成新的 buildId 后可以再试（不是一个会话只刷一次）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource } from '../helpers/source.js';
import {
  applyPendingUpdateBeforeNavigation,
  clearPendingUpdate,
  markUpdateAvailable,
} from '../../src/utils/version-checker.js';

const root = resolve(import.meta.dirname, '../..');

let replaceSpy;
let store;

const installEnv = () => {
  store = new Map();
  replaceSpy = vi.fn();
  const define = (key, value) =>
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  // 'serviceWorker' in navigator 必须为 false ⇒ 走「注销 SW + 直连网络」那条兜底分支
  define('navigator', {});
  define('window', {
    location: { href: 'https://app.example/#/user-space?tab=posts', replace: replaceSpy },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  });
  define('sessionStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
};

const dropEnv = () => {
  for (const key of ['navigator', 'window', 'sessionStorage']) delete globalThis[key];
};

beforeEach(() => {
  installEnv();
  clearPendingUpdate();
});
afterEach(() => {
  clearPendingUpdate();
  dropEnv();
});

describe('applyPendingUpdateBeforeNavigation', () => {
  it('没有挂起更新：不动、不导航（返回 false，让本次导航照常继续）', () => {
    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('有挂起更新：发起带目标 buildId 的整页导航，并要求取消本次导航', async () => {
    markUpdateAvailable('9.9.9', 'build-new');

    expect(applyPendingUpdateBeforeNavigation()).toBe(true);
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1));

    const url = String(replaceSpy.mock.calls[0][0]);
    expect(url).toContain('__boh_update=build-new');
    expect(url).toContain('#/user-space?tab=posts'); // 落点（hash）必须保留
  });

  it('同一目标只试一次（防刷新循环）', async () => {
    markUpdateAvailable('9.9.9', 'build-new');
    expect(applyPendingUpdateBeforeNavigation()).toBe(true);
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1));

    // 第二次：目标已记进 boh_version_reload_target ⇒ 不再尝试
    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  it('换成新的 buildId 后可以再试一次（不是一个会话只刷一次）', async () => {
    markUpdateAvailable('9.9.9', 'build-new');
    expect(applyPendingUpdateBeforeNavigation()).toBe(true);
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1));

    markUpdateAvailable('9.9.10', 'build-newer');
    expect(applyPendingUpdateBeforeNavigation()).toBe(true);
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(2));
    expect(String(replaceSpy.mock.calls[1][0])).toContain('__boh_update=build-newer');
  });

  it('清掉挂起态后不再动作（版本一致时会清）', () => {
    markUpdateAvailable('9.9.9', 'build-new');
    clearPendingUpdate();
    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('buildId 缺失时不进入挂起态（避免拿空目标去刷）', () => {
    markUpdateAvailable('9.9.9', '');
    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
  });
});

describe('路由守卫的接线', () => {
  const routerSrc = readFileSync(resolve(root, 'src/router/index.ts'), 'utf8');

  it('在 beforeEach 最前面就判、并 next(false) 取消本次导航', () => {
    const code = squeezeSource(routerSrc);
    const guardIdx = code.indexOf('router.beforeEach(');
    const applyIdx = code.indexOf('applyPendingUpdateBeforeNavigation()');
    const authIdx = code.indexOf('initAuthStore()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(guardIdx);
    // 放在鉴权初始化之前：既然马上要整页换构建，守卫链没必要跑完
    expect(applyIdx).toBeLessThan(authIdx);
    expect(code).toContain('if (applyPendingUpdateBeforeNavigation()) return next(false);');
  });
});
