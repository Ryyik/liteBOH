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
  /** 最小 CSSStyleDeclaration：够本模块用的四条（含 important 优先级）。 */
  const makeStyle = () => {
    const props = new Map();
    const style = {
      setProperty(name, value, priority = '') {
        props.set(name, { value: String(value), priority: priority || '' });
      },
      getPropertyValue(name) {
        return props.get(name)?.value ?? '';
      },
      getPropertyPriority(name) {
        return props.get(name)?.priority ?? '';
      },
      removeProperty(name) {
        props.delete(name);
      },
    };
    // body 侧是直赋 `style.overflow`，映射到同一份存储，读写才一致
    Object.defineProperty(style, 'overflow', {
      get: () => style.getPropertyValue('overflow'),
      set: (v) => (v ? style.setProperty('overflow', v) : style.removeProperty('overflow')),
    });
    return style;
  };

  const style = makeStyle();
  /* 根元素（真正的滚动容器）：clientWidth 比 innerWidth 少 8px ⇒ 量出常驻滚动条宽度，
     用来验证「上锁时补位、解锁时摘掉」那条。 */
  const rootStyle = makeStyle();
  const documentElement = {
    style: rootStyle,
    clientWidth: 1000,
    ownerDocument: { defaultView: { innerWidth: 1008 } },
  };
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
    documentElement,
    createElement: makeEl,
    createTextNode: () => ({}),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  return { style, rootStyle, makeDoc: () => globalThis.document };
});

import {
  acquireBodyScrollLock,
  getBodyScrollLockCount,
} from '../../src/composables/useBodyScrollLock.js';

const style = env.style;
const rootStyle = env.rootStyle;
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
  rootStyle.removeProperty('overflow-y');
  rootStyle.removeProperty('padding-right');
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

/* 2026-11-10（用户报障「商城详情的滚动还是在滚动商品列表页，而不是详情页」）：
   本站真正的滚动容器是 **html** —— `src/style.css` 写死了
     `html { overflow-y: auto !important }` + `body { overflow-y: visible !important }`
   于是只写 `document.body.style.overflow = 'hidden'` 会被样式表盖掉，锁了个寂寞。
   这组用例锁住修法本身：必须同时锁根元素、必须带 important、必须补滚动条宽度。 */
describe('acquireBodyScrollLock 锁的是真正的滚动容器（html）', () => {
  it('上锁同时写根元素：hidden + important', () => {
    lock('shop');

    expect(rootStyle.getPropertyValue('overflow-y')).toBe('hidden');
    // 少这个 important 就会被样式表里那条 `!important` 压回去 —— 等于没锁
    expect(rootStyle.getPropertyPriority('overflow-y')).toBe('important');
  });

  it('上锁补回滚动条宽度，解锁整条摘掉（不留 padding 垃圾）', () => {
    const release = lock('shop');

    // 1008 - 1000 = 8px 常驻滚动条
    expect(rootStyle.getPropertyValue('padding-right')).toBe('8px');

    release();

    expect(rootStyle.getPropertyValue('padding-right')).toBe('');
    expect(rootStyle.getPropertyValue('overflow-y')).toBe('');
  });

  it('多层叠着时只有最后一层释放才解锁根元素', () => {
    const releaseDetail = lock('detail');
    const releaseCheckout = lock('checkout');

    releaseDetail();
    expect(rootStyle.getPropertyValue('overflow-y')).toBe('hidden');

    releaseCheckout();
    expect(rootStyle.getPropertyValue('overflow-y')).toBe('');
  });

  it('根元素被外部接管后不抢着还原（防整站永久锁死）', () => {
    const release = lock('shop');

    rootStyle.setProperty('overflow-y', 'auto'); // 外部按自己的口径接管（无 important）

    release();

    expect(rootStyle.getPropertyValue('overflow-y')).toBe('auto');
  });
});
