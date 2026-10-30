/**
 * `document.body.style.overflow` 的唯一真源（引用计数 + 保存原值）。
 *
 * 为什么需要它：全仓曾有 40+ 处直接写这个全局属性，且**多数是「无条件清零」**
 * （`= ''`）。任意两个持有者叠加时，先离场的那个会把还在场者的锁清掉 ⇒ 蒙层背后的
 * 页面能滚了（滚动穿透）。这类 bug 只在「两个浮层叠着、其中一个先卸载」时出现，
 * 单测和截图都抓不到。
 *
 * 三条语义（与直接写不等价，迁移时别按「看起来一样」处理）：
 *  1. **引用计数**：第一个 acquire 才真正上锁，最后一个 release 才真正解锁；
 *  2. **保存原值**：解锁时恢复 acquire 前的值，而不是硬写 `''` ——
 *     静态 CSS 里给 `body` 设过 `overflow` 的页面不会被重置；
 *     **但只在「锁还是自己设的 hidden」时才恢复**：全站还有 40+ 处直写会无条件清零/改值，
 *     一旦被外人改过就说明现在不归自己管，此时再写回原值会把页面永久锁死
 *     （acquire 时恰好是别人的 hidden ⇒ release 把 hidden 写回，之后没人再清）。
 *  3. **release 幂等**：同一个 release 函数调两次只减一次；
 *     传进来的 owner 只用于调试识别，不参与去重（两次 acquire 就是两份锁）。
 *
 * 用法：
 * ```js
 * // 命令式
 * let release = null;
 * const lock   = () => { release ??= acquireBodyScrollLock('my-modal'); };
 * const unlock = () => { release?.(); release = null; };
 *
 * // 声明式（随 ref 自动开关，组件卸载/作用域销毁自动释放）
 * useBodyScrollLock(isOpenRef, 'my-modal');
 * ```
 *
 * ⚠️ 不要再用 `document.body.style.overflow = 'hidden' / ''` 直写。
 * 护栏：`tests/unit/body-scroll-lock-single-source.test.js`（禁止论坛/通用组件新增直写）。
 */

import { onScopeDispose, watch } from 'vue';

/** 当前持锁者集合；size === 0 表示未上锁。用 Set 而非计数，便于排障时看谁在持锁。 */
const holders = new Set();

/** 上锁前的 `overflow` 原值，解锁时恢复。 */
let savedOverflow = '';

/**
 * 申请一把 body 滚动锁。
 * @param {string} owner 持锁方标识（只用于调试/排障，不参与去重）
 * @returns {() => void} 释放函数，幂等
 */
export function acquireBodyScrollLock(owner = 'anonymous') {
  // SSR / 非浏览器环境：返回空释放函数，调用方无需判空
  if (typeof document === 'undefined' || !document.body) return () => {};

  const token = Symbol(String(owner || 'anonymous'));

  // 只在「从 0 到 1」时上锁：中间层的 acquire 不重复写样式，
  // 也就不会覆盖掉别人（或静态样式）已经设好的值。
  if (holders.size === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  holders.add(token);

  let released = false;
  return function release() {
    if (released) return; // 幂等：重复释放不重复减计数
    released = true;
    holders.delete(token);
    if (holders.size === 0) {
      // 归属校验：只有「当前值仍是本模块设的 hidden」才还原。
      // 若期间被外部直写改过（清零 / 改成别的值），说明锁已经不在我们手上，
      // 这时写回 savedOverflow 可能把别人刚解开的页面重新锁死（且再无人清）。
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = savedOverflow;
      }
    }
  };
}

/** 当前持锁数量（仅供测试与排障；业务代码不应依赖它做判断）。 */
export function getBodyScrollLockCount() {
  return holders.size;
}

/**
 * 声明式用法：`source` 为真时持锁，为假时释放；所在作用域销毁时兜底释放。
 * @param {import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>|(() => boolean)} source
 * @param {string} owner
 * @returns {() => void} 手动释放函数
 */
export function useBodyScrollLock(source, owner = 'useBodyScrollLock') {
  let release = null;

  const sync = (locked) => {
    if (locked) {
      release ??= acquireBodyScrollLock(owner);
    } else {
      release?.();
      release = null;
    }
  };

  watch(source, sync, { immediate: true });

  const dispose = () => {
    release?.();
    release = null;
  };
  onScopeDispose(dispose);
  return dispose;
}
