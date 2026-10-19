/**
 * 2026-10-17 全面审查 P2-11：登出时清掉「共享相册令牌」。
 *
 * 报障（源码级）：`Cloud+` 把最近一次使用的共享相册令牌写进 localStorage
 * （key 真源 `Cloud+/CloudPlusMain.vue` 的 `SHARED_TOKEN_STORAGE_KEY`），
 * 但 `safe-storage.js` 的清理名单里没有它 ⇒ 同设备换账号后，新用户能直接
 * 复用上一任的共享链接（read 级泄露）。
 *
 * 这里锁两件事：
 *   ① 清理名单**包含**该 key（key 字面量必须与组件一致，写错等于没修）；
 *   ② `clearSensitiveLocalStorage()` 真的把它删掉（不是只在数组里躺着）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clearSensitiveLocalStorage } from '@/utils/safe-storage.js';

const SHARED_TOKEN_KEY = 'boh_cloud:last_shared_token';

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn((key) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((i) => [...store.keys()][i] ?? null),
    get length() {
      return store.size;
    },
    __store: store,
  };
}

describe('safe-storage · 登出清理', () => {
  let storage;

  beforeEach(() => {
    storage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('清掉共享相册令牌（P2-11 回归锁）', () => {
    storage.setItem(SHARED_TOKEN_KEY, 'tok_share_secret');
    storage.setItem('boh_theme', 'dark'); // 非敏感偏好：必须保留

    clearSensitiveLocalStorage();

    expect(storage.getItem(SHARED_TOKEN_KEY)).toBeNull();
    expect(storage.getItem('boh_theme')).toBe('dark');
  });

  it('清理名单里的 key 字面量与 Cloud+ 组件一致（防改名单改漏）', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'src/views/user-center/Cloud+/CloudPlusMain.vue'),
      'utf8',
    );
    expect(src).toContain(`'${SHARED_TOKEN_KEY}'`);
  });

  it('单个 key 删除抛错时不中断其余 key（Safari 隐私模式的真实形态）', () => {
    // 真机上 localStorage 本身在，是 removeItem/setItem 抛 QuotaExceeded/SecurityError；
    // 这里让 removeItem 对所有 key 抛错，断言函数整体不抛、且继续遍历（每个 key 都被尝试过）。
    storage.removeItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearSensitiveLocalStorage()).not.toThrow();
    expect(storage.removeItem.mock.calls.length).toBeGreaterThan(1);
  });
});
