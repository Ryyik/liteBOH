import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  USAGE_COUNTERS_KEY,
  USAGE_DETAIL_EDIT,
  USAGE_DRAWER_QUICK_EDIT,
  bumpUsageCounter,
  readUsageCounter,
  readUsageCounters,
} from '@/views/DataManagement/composables/data-admin-usage-counter.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

describe('本机使用计数（plans/042 B2）', () => {
  it('自增并累加，互不干扰', () => {
    const storage = fakeStorage();
    expect(readUsageCounter(USAGE_DRAWER_QUICK_EDIT, storage)).toBe(0);
    expect(bumpUsageCounter(USAGE_DRAWER_QUICK_EDIT, storage)).toBe(1);
    expect(bumpUsageCounter(USAGE_DRAWER_QUICK_EDIT, storage)).toBe(2);
    expect(bumpUsageCounter(USAGE_DETAIL_EDIT, storage)).toBe(1);
    expect(readUsageCounters(storage)).toEqual({
      [USAGE_DRAWER_QUICK_EDIT]: 2,
      [USAGE_DETAIL_EDIT]: 1,
    });
  });

  it('脏数据不炸：非 JSON / 数组 / 空串都当 0', () => {
    const storage = fakeStorage();
    for (const raw of ['{坏掉的', '[]', '', 'null']) {
      storage.setItem(USAGE_COUNTERS_KEY, raw);
      expect(readUsageCounters(storage)).toEqual({});
      expect(bumpUsageCounter(USAGE_DETAIL_EDIT, storage)).toBe(1);
    }
  });

  it('写失败（配额/隐私模式）返回新计数而不是抛错 —— 计数绝不影响业务动作', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => bumpUsageCounter(USAGE_DETAIL_EDIT, storage)).not.toThrow();
    expect(bumpUsageCounter(USAGE_DETAIL_EDIT, storage)).toBe(1);
  });
});

describe('接线守卫：两个入口都要打点', () => {
  it('抽屉逃生口与详情页编辑各有一个 bump', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('bumpUsageCounter(USAGE_DRAWER_QUICK_EDIT)');
    expect(view).toContain('bumpUsageCounter(USAGE_DETAIL_EDIT)');
    // 计数必须发生在打开之前，否则「打开失败」也会被记成用过
    const drawer = view.slice(view.indexOf('bumpUsageCounter(USAGE_DRAWER_QUICK_EDIT)'));
    expect(drawer.indexOf('openEditModal(item)')).toBeGreaterThan(0);
  });
});
