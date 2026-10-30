import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* P3-1（2026-10-30）：`document.body.style.overflow` 的引用计数单源。

   旧实现是各组件直写 `= 'hidden'` / `= ''`，且**多数是「无条件清零」**。
   两个持有者叠加时，先离场的那个会清掉还在场者的锁 ⇒ 蒙层背后能滚（滚动穿透）。
   这类 bug 只在「两层浮层叠着、其中一个先卸载」时出现，截图和常规单测都抓不到。

   这组用例锁 5 条语义，其中第 2 条（两次 acquire 只 release 一次仍锁）——
   在旧实现下必然失败，是「修复有效」的证明；其余四条守的是别被顺手改坏。

   ⚠️ 环境：vitest 配置是 `environment: 'node'`，没有 DOM。而 composable 顶层
   `import ... from 'vue'` 会在导入时就让 runtime-dom 摸 `document`（它要
   `doc.createElement('template')`）。所以 document 桩必须用 `vi.hoisted` 写在
   `import` 之前 —— 普通语句会被提升顺序打乱，注释掉就会拿到
   `TypeError: doc.createElement is not a function`。
   ⚠️ 不用 `vi.resetModules()`：那会连 vue 一起重新初始化（慢且要补齐更多 DOM 桩）。
   改为「每条用例结束把所有 release 跑一遍」，把持锁者集合清回 0。 */

const env = vi.hoisted(() => {
  const style = { overflow: '' };
  const makeEl = () => ({
    style: {},
    content: {},
    innerHTML: '',
    setAttribute() {},
    appendChild() {},
    removeChild() {},
  });
  globalThis.document = {
    body: { style },
    createElement: makeEl,
    createTextNode: () => ({}),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  return { style, makeDoc: () => globalThis.document };
});

import {
  acquireBodyScrollLock,
  getBodyScrollLockCount,
} from '../../src/composables/useBodyScrollLock.js';

const style = env.style;
const createdDoc = env.makeDoc();

/** 记下所有 release，afterEach 统一释放，保证用例之间持锁集合归零。 */
const activeReleases = [];
const lock = (owner) => {
  const release = acquireBodyScrollLock(owner);
  activeReleases.push(release);
  return release;
};

beforeEach(() => {
  globalThis.document = createdDoc;
  style.overflow = '';
});

afterEach(() => {
  while (activeReleases.length) activeReleases.pop()();
});

describe('acquireBodyScrollLock 引用计数（P3-1）', () => {
  it('acquire 一次即上锁', () => {
    const release = lock('a');

    expect(style.overflow).toBe('hidden');
    expect(getBodyScrollLockCount()).toBe(1);

    release();
    expect(style.overflow).toBe('');
    expect(getBodyScrollLockCount()).toBe(0);
  });

  it('acquire 两次、release 一次时仍然锁定（旧实现这里会被提前解锁）', () => {
    const releaseA = lock('a');
    const releaseB = lock('b');
    expect(getBodyScrollLockCount()).toBe(2);

    releaseA(); // 先离场的是 A，B 还在场

    expect(style.overflow).toBe('hidden');
    expect(getBodyScrollLockCount()).toBe(1);

    releaseB();
    expect(style.overflow).toBe('');
    expect(getBodyScrollLockCount()).toBe(0);
  });

  it('解锁恢复的是 acquire 前的原值，而不是硬写空串', () => {
    style.overflow = 'auto'; // 模拟静态 CSS 给 body 设过 overflow

    const release = lock('a');
    expect(style.overflow).toBe('hidden');

    release();
    expect(style.overflow).toBe('auto'); // 不是 ''
  });

  it('同一个 release 调两次只减一次（幂等）', () => {
    const releaseA = lock('a');
    lock('b');

    releaseA();
    releaseA(); // 重复调用
    releaseA();

    // 计数必须仍是 1，否则 B 的锁会被 A 的重复释放清掉
    expect(getBodyScrollLockCount()).toBe(1);
    expect(style.overflow).toBe('hidden');
  });

  /* 2026-10-30 复审：全站还有 41 处直写会**无条件清零**（UnifiedNavbar 四处、
     usePostDetailModal 等）。若本模块不看归属就写回 savedOverflow，会出现反向事故：
     acquire 时恰好是别人的 'hidden' ⇒ 对方关闭时清成 '' ⇒ 我们 release 又把 'hidden'
     写回 ⇒ 之后整站不能滚动，且再没有任何组件会去清它。
     下面这条在旧实现下必然失败（旧实现会写回 'hidden'）。 */
  it('外部直写清零后，release 不得把 savedOverflow 写回（防整站永久锁死）', () => {
    style.overflow = 'hidden'; // 别的模块已经上锁
    const release = lock('forum');

    style.overflow = ''; // 外部无条件清零（存量直写派的典型写法）

    release();

    expect(style.overflow).toBe(''); // 旧实现这里是 'hidden'
    expect(getBodyScrollLockCount()).toBe(0);
  });

  it('外部改成了别的值时也不覆盖它', () => {
    const release = lock('forum');
    style.overflow = 'auto'; // 外部按自己的口径接管

    release();

    expect(style.overflow).toBe('auto');
  });

  it('无 document 环境（SSR）返回空函数且不抛错', () => {
    delete globalThis.document;

    const release = acquireBodyScrollLock('a');
    expect(typeof release).toBe('function');
    expect(() => release()).not.toThrow();
    // 没有 document 就不该占用计数，否则回到浏览器后会「凭空多一把锁」
    expect(getBodyScrollLockCount()).toBe(0);
  });
});
