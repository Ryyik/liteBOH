import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearListScrollMemory,
  consumeListScroll,
  listScrollMemorySize,
  recallListScroll,
  rememberListScroll,
} from '@/views/DataManagement/composables/list-scroll-memory.js';

/**
 * 列表滚动位置记忆（plans/049 期 3）。
 *
 * 这组测的是「整页化带来的代价有没有被补上」：
 * 抽屉时代「列表 → 编辑 → 关掉抽屉」列表原地不动；改成对象页之后
 * 每次往返都会重建实例（App.vue 的 `:key="activeRoute.path"`），
 * 不记忆就会一律回到顶部。
 *
 * 反证：
 *   - 把 `rememberListScroll` 的 `memory.delete` 去掉 ⇒ 「按 tab 覆盖」红
 *   - 把 `consumeListScroll` 改成不删除 ⇒ 「消费式读取」红
 *   - 把 LRU 上限改成 1 ⇒ 「上限」红
 */

const readSrc = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('列表滚动位置记忆', () => {
  beforeEach(() => {
    clearListScrollMemory();
  });

  it('记下再取出，值一致', () => {
    rememberListScroll('users', 840.6);
    // 取整：scrollTop 在浏览器里本来就是整数，但传进来可能是小数
    expect(recallListScroll('users')).toBe(841);
  });

  it('没记过的 tab 返回 undefined（调用方不要动滚动）', () => {
    expect(recallListScroll('users')).toBeUndefined();
  });

  it('按 tab 存，不同 tab 互不覆盖', () => {
    rememberListScroll('users', 100);
    rememberListScroll('forum', 500);
    expect(recallListScroll('users')).toBe(100);
    expect(recallListScroll('forum')).toBe(500);
  });

  it('同一个 tab 再记会覆盖（不是追加）', () => {
    rememberListScroll('users', 100);
    rememberListScroll('users', 300);
    expect(recallListScroll('users')).toBe(300);
    expect(listScrollMemorySize()).toBe(1);
  });

  it('0 与非法值不占位（回到顶部本来不需要记忆）', () => {
    rememberListScroll('users', 200);
    rememberListScroll('users', 0);
    expect(recallListScroll('users')).toBeUndefined();
    expect(listScrollMemorySize()).toBe(0);

    rememberListScroll('forum', NaN);
    expect(listScrollMemorySize()).toBe(0);
  });

  it('消费式读取：取一次就没了（避免下次误用旧位置）', () => {
    rememberListScroll('users', 640);
    expect(consumeListScroll('users')).toBe(640);
    expect(consumeListScroll('users')).toBeUndefined();
    expect(recallListScroll('users')).toBeUndefined();
  });

  it('空 tabId 一律忽略', () => {
    rememberListScroll('', 100);
    rememberListScroll(null, 100);
    expect(listScrollMemorySize()).toBe(0);
  });

  it('超过上限时丢最早的一条（LRU 语义）', () => {
    // 上限 16：塞 20 条，最早那几条应该被挤掉
    for (let i = 0; i < 20; i += 1) rememberListScroll(`tab-${i}`, (i + 1) * 10);
    expect(listScrollMemorySize()).toBeLessThanOrEqual(16);
    expect(recallListScroll('tab-0')).toBeUndefined();
    expect(recallListScroll('tab-19')).toBe(200);
  });

  it('重新记同一 key 会刷新它的 LRU 位置（不被当作最旧挤掉）', () => {
    for (let i = 0; i < 16; i += 1) rememberListScroll(`tab-${i}`, 100);
    // 刷新 tab-0 的位置
    rememberListScroll('tab-0', 999);
    // 再塞一条新的，应该挤掉 tab-1（现在最旧的）而不是 tab-0
    rememberListScroll('tab-new', 50);
    expect(recallListScroll('tab-0')).toBe(999);
    expect(recallListScroll('tab-1')).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * 接入点守卫（源码级）
 *
 * 这两条锁的是**实测踩出来的两个错误捕获/恢复时机**：
 *   ① 用 `onBeforeUnmount` 记位置 —— 列表→详情**根本不卸载**（同组件复用），
 *      一次都没记到。正确时机是 `onBeforeRouteLeave`（路由还没 commit）。
 *   ② 用 `watch(recordId 从有到无)` 恢复 —— 回列表时组件因
 *      `:key="activeRoute.path"` 重建，新实例首次 watch 拿不到「刚从对象页回来」
 *      这个信息（它随旧实例销毁了）。正确做法是 onMounted 消费式订阅。
 * 这两条都不报错、只是「没生效」，只能靠源码断言 + 浏览器实测兜。
 * ══════════════════════════════════════════════════════════════════════ */
describe('滚动记忆的接入点', () => {
  const adminSrc = () => stripComments(readSrc('src/views/DataManagement/DataAdmin.vue'));

  it('① 捕获点用 onBeforeRouteLeave，不是 onBeforeUnmount', () => {
    const src = adminSrc();
    expect(src).toContain('onBeforeRouteLeave');
    expect(src).toContain('rememberListScroll(');
    // onBeforeUnmount 在列表→详情时不会触发（同组件复用），不能用它记位置
    expect(src, '本文件不应再 import onBeforeUnmount（它记不到位置）').not.toMatch(
      /import\s*\{[^}]*onBeforeUnmount[^}]*\}\s*from\s*['"]vue['"]/,
    );
  });

  it('② 恢复点在 onMounted 里消费式读取（回列表时组件会重建）', () => {
    const src = adminSrc();
    expect(src).toMatch(/onMounted\(restoreListScrollIfNeeded\)/);
    expect(src).toContain('consumeListScroll(');
    // 等数据到位再滚：挂载那一刻表格是空的，scrollTo 会被夹到当前上限
    expect(src, '必须等 hasLoadedOnce 再滚，否则位置被夹小').toContain('watch(hasLoadedOnce');
  });
});
