import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'fs/promises';
import {
  authStorage,
  isPersistentSessionEnabled,
  setPersistentSessionEnabled,
  REMEMBER_ME_STORAGE_KEY,
} from '@/utils/auth-storage.js';

/**
 * 「记住我」真源（2026-11-16 B1）的行为锁。
 *
 * node 环境没有 window，这里手搓两个 storage；auth-storage 内部是**运行时**判断
 * `typeof window`，所以挂到 globalThis 上就能生效。
 */

const createStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
  };
};

const AUTH_KEY = 'sb-test-auth-token';

let local;
let session;

beforeEach(() => {
  local = createStorage();
  session = createStorage();
  globalThis.window = { localStorage: local, sessionStorage: session };
});

afterEach(() => {
  delete globalThis.window;
});

describe('auth-storage：「记住我」决定会话落在哪个 storage', () => {
  it('默认（没有 flag）⇒ 写 localStorage，关浏览器后仍登录', () => {
    expect(isPersistentSessionEnabled()).toBe(true);
    authStorage.setItem(AUTH_KEY, 'token-a');
    expect(local.getItem(AUTH_KEY)).toBe('token-a');
    expect(session.getItem(AUTH_KEY)).toBeNull();
  });

  it('flag = 0 ⇒ 写 sessionStorage，关标签页即失效', () => {
    setPersistentSessionEnabled(false);
    authStorage.setItem(AUTH_KEY, 'token-b');
    expect(session.getItem(AUTH_KEY)).toBe('token-b');
    expect(local.getItem(AUTH_KEY)).toBeNull();
  });

  it('切换 flag 时写新位置、清旧位置（否则下次会读到过期副本）', () => {
    authStorage.setItem(AUTH_KEY, 'old-persistent');
    expect(local.getItem(AUTH_KEY)).toBe('old-persistent');

    setPersistentSessionEnabled(false);
    authStorage.setItem(AUTH_KEY, 'new-ephemeral');

    expect(session.getItem(AUTH_KEY)).toBe('new-ephemeral');
    expect(local.getItem(AUTH_KEY)).toBeNull();
  });

  it('读时双边 fallback：flag 刚切、令牌还在旧侧时不能"凭空掉线"', () => {
    session.setItem(AUTH_KEY, 'still-here');
    setPersistentSessionEnabled(true); // primary 变成 localStorage，但令牌在 sessionStorage
    expect(authStorage.getItem(AUTH_KEY)).toBe('still-here');
  });

  it('removeItem 双侧删除：退出登录后两边都不能留令牌', () => {
    local.setItem(AUTH_KEY, 'x');
    session.setItem(AUTH_KEY, 'y');
    authStorage.removeItem(AUTH_KEY);
    expect(local.getItem(AUTH_KEY)).toBeNull();
    expect(session.getItem(AUTH_KEY)).toBeNull();
  });

  it('flag 键本身不进 PII 清理名单（它是偏好，不是身份数据）', async () => {
    const source = await readFile('src/utils/safe-storage.js', 'utf-8');
    expect(source).not.toContain(`'${REMEMBER_ME_STORAGE_KEY}'`);
  });
});

describe('接线守卫：supabase client 必须用这层 storage', () => {
  it('supabase-client 不再硬编码 window.localStorage', async () => {
    const source = await readFile('src/utils/supabase-client.js', 'utf-8');
    expect(source).toMatch(/storage:\s*authStorage/);
    expect(source).not.toMatch(/storage:\s*window\.localStorage/);
  });
});
