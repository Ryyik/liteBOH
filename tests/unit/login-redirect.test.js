import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'fs/promises';
import {
  rememberLoginTarget,
  consumeLoginTarget,
  clearLoginTarget,
} from '@/utils/login-redirect.js';

/**
 * B3 登录后回跳（2026-11-16）。
 *
 * 两条不变量：
 *   ① 只接受站内路径 —— 守卫记的东西来自 `to.fullPath`，但这是可被 URL 操纵的输入，
 *      必须挡住 `//evil.com`、`https://…` 与登录页自身（否则登录后原地打转）；
 *   ② 一次性消费 —— 用掉就删，避免下次主动登录又跳到上一回的目标。
 */

const createStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

beforeEach(() => {
  globalThis.window = { sessionStorage: createStorage() };
});

afterEach(() => {
  delete globalThis.window;
});

describe('login-redirect', () => {
  it('记住并消费一次后自动清除', () => {
    rememberLoginTarget('/user-space?tab=community');
    expect(consumeLoginTarget()).toBe('/user-space?tab=community');
    expect(consumeLoginTarget()).toBe('');
  });

  it('拒绝协议相对地址（开放重定向）', () => {
    rememberLoginTarget('//evil.example.com/steal');
    expect(consumeLoginTarget()).toBe('');
  });

  it('拒绝绝对 URL', () => {
    rememberLoginTarget('https://evil.example.com');
    expect(consumeLoginTarget()).toBe('');
  });

  it('拒绝登录页 / 注册页自身，避免登录后原地打转', () => {
    rememberLoginTarget('/login');
    expect(consumeLoginTarget()).toBe('');
    rememberLoginTarget('/join?ref=nav');
    expect(consumeLoginTarget()).toBe('');
  });

  it('clearLoginTarget 之后不再回跳（退出登录时调用）', () => {
    rememberLoginTarget('/messages');
    clearLoginTarget();
    expect(consumeLoginTarget()).toBe('');
  });
});

describe('接线守卫：两处「未登录」分支都要记目标', () => {
  it('router/index.ts 的 requiresLogin 与 requiresAdmin 分支各记一次', async () => {
    const source = await readFile('src/router/index.ts', 'utf-8');
    const matches = source.match(/rememberLoginTarget\(to\.fullPath\)/g) || [];
    expect(matches.length).toBe(2);
  });

  it('登录成功后消费目标是 replace 而不是 push（不污染返回栈）', async () => {
    const source = await readFile('src/views/Login/index.vue', 'utf-8');
    expect(source).toMatch(/consumeLoginTarget\(\)/);
    expect(source).toMatch(/router\.replace\(target\)/);
  });
});
