/**
 * style-load-guard 的行为守卫（2026-10-13）
 *
 * 这个单源承担「动态注入的样式失败后能自己修回来」。它的三个关键行为都是
 * **踩过坑才长出来的**，必须用真行为锁住（只写源文字面量断言，撤掉逻辑照样绿）：
 *   ① 判活必须读 cssRules 且包 try —— link 带 crossOrigin，失败/过渡态读它会抛
 *      SecurityError；只看 `sheet` 真假会把坏样式判成好的（实测）。
 *   ② 重建必须**摘旧建新、同一 href** —— `__vitePreload` 的去重表让 `import()` 重试无效。
 *   ③ 退避必须**有限**且**修好即停 / 离开页面即停 / 重新进入重置预算**。
 *
 * 依赖（doc/win/计时器）都可注入 ⇒ 本文件用假 DOM + 假计时器在 node 环境直接驱动，
 * 不需要 jsdom（本仓 vitest 环境是 node）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBoundedRepairLoop,
  createStyleSheetGuard,
  findStyleLink,
  isStyleLinkApplied,
  reloadStyleLink,
  repairStyleLinks,
} from '../../src/utils/style-load-guard.js';

const LINK_SELECTOR = 'link[rel="stylesheet"]';

/** 假 <link>：可按需造「有规则 / 0 规则 / 读 cssRules 抛错」三种 sheet */
const makeLink = (href, { rules = 0, throws = false, noSheet = false } = {}) => {
  const listeners = new Map();
  const link = {
    rel: 'stylesheet',
    href,
    parentNode: null,
    nextSibling: null,
    removed: false,
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    fire(type) {
      (listeners.get(type) || []).forEach((fn) => fn());
    },
    remove() {
      this.removed = true;
      const parent = this.parentNode;
      if (!parent?.children) return;
      const idx = parent.children.indexOf(this);
      if (idx >= 0) parent.children.splice(idx, 1); // 原地删，别换数组引用
    },
  };
  if (!noSheet) {
    Object.defineProperty(link, 'sheet', {
      get() {
        if (throws) throw new Error('SecurityError: cssRules unreadable');
        return { cssRules: new Array(rules).fill({ cssText: '' }) };
      },
    });
  } else {
    link.sheet = null;
  }
  return link;
};

/** 假文档：管理一批 link，并记录 createElement 造出来的新节点 */
const makeDoc = (links = []) => {
  const created = [];
  const doc = {
    created,
    children: links,
    querySelectorAll: (sel) => (sel === LINK_SELECTOR ? links : []),
    createElement: () => {
      const el = makeLink('', { noSheet: true });
      created.push(el);
      return el;
    },
    insertBefore(node, ref) {
      node.parentNode = doc;
      const idx = ref ? links.indexOf(ref) : -1;
      if (idx >= 0) links.splice(idx, 0, node);
      else links.push(node);
      return node;
    },
  };
  links.forEach((l) => {
    l.parentNode = doc;
  });
  return doc;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isStyleLinkApplied —— 判活口径', () => {
  it('没有 link / 没有 sheet 一律算未生效', () => {
    expect(isStyleLinkApplied(null)).toBe(false);
    expect(isStyleLinkApplied(makeLink('/a.css', { noSheet: true }))).toBe(false);
  });

  it('sheet 存在但 0 条规则算未生效（被 abort 的 link 就是这种）', () => {
    expect(isStyleLinkApplied(makeLink('/a.css', { rules: 0 }))).toBe(false);
  });

  it('有规则才算生效', () => {
    expect(isStyleLinkApplied(makeLink('/a.css', { rules: 3 }))).toBe(true);
  });

  it('读 cssRules 抛错时算未生效，且不把异常抛出去（crossOrigin 的失败 sheet）', () => {
    const broken = makeLink('/a.css', { throws: true });
    expect(() => isStyleLinkApplied(broken)).not.toThrow();
    expect(isStyleLinkApplied(broken)).toBe(false);
  });
});

describe('findStyleLink / repairStyleLinks', () => {
  it('按正则找到第一条匹配的 link；找不到返回 null', () => {
    const doc = makeDoc([
      makeLink('/x/profile-base-abc.css'),
      makeLink('/x/profile-panels-def.css'),
    ]);
    expect(findStyleLink(/profile-base-/, doc)?.href).toContain('profile-base');
    expect(findStyleLink(/nope-/, doc)).toBe(null);
  });

  it('只重建坏掉的（不碰健康的），返回仍坏的数量', async () => {
    const healthy = makeLink('/x/profile-base-abc.css', { rules: 12 });
    const broken = makeLink('/x/profile-panels-def.css', { rules: 0 });
    const doc = makeDoc([healthy, broken]);

    const pending = repairStyleLinks([/profile-base-/, /profile-panels-/], { doc });
    // 重建出来的新 link：让它在 load 后是「已生效」的
    const rebuilt = doc.created[0];
    Object.defineProperty(rebuilt, 'sheet', { get: () => ({ cssRules: [{}] }) });
    rebuilt.fire('load');

    expect(await pending).toBe(1);
    expect(healthy.removed).toBe(false); // 健康的那条不许动
    expect(broken.removed).toBe(true); // 坏的那条被摘掉
  });

  it('一条都不匹配时返回 0（首次 import 还没建出 link 的情形）', async () => {
    expect(await repairStyleLinks([/profile-base-/], { doc: makeDoc([]) })).toBe(0);
  });
});

describe('reloadStyleLink —— 摘旧建新', () => {
  it('新 link 与旧 link 同 href，且旧 link 被摘掉', async () => {
    const old = makeLink('/x/profile-base-abc.css', { rules: 0 });
    const doc = makeDoc([old]);

    const pending = reloadStyleLink(old, { doc });
    const next = doc.created[0];
    expect(next.href).toBe('/x/profile-base-abc.css');
    expect(old.removed).toBe(true);
    Object.defineProperty(next, 'sheet', { get: () => ({ cssRules: [{}] }) });
    next.fire('load');
    expect(await pending).toBe(true);
  });

  it('新 link 报错且 sheet 为空 → false', async () => {
    const old = makeLink('/x/profile-base-abc.css', { rules: 0 });
    const doc = makeDoc([old]);
    const pending = reloadStyleLink(old, { doc });
    doc.created[0].fire('error');
    expect(await pending).toBe(false);
  });

  it('既不 load 也不 error 时，超时后按实际生效状态收口（不让 promise 悬着）', async () => {
    const old = makeLink('/x/profile-base-abc.css', { rules: 0 });
    const doc = makeDoc([old]);
    const pending = reloadStyleLink(old, { doc, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toBe(false); // 新 link 仍是空 sheet
  });

  it('没有父节点时直接 false（不抛）', async () => {
    const orphan = makeLink('/x/a.css', { rules: 0 });
    expect(await reloadStyleLink(orphan, { doc: makeDoc([]) })).toBe(false);
  });
});

describe('createBoundedRepairLoop —— 有限退避', () => {
  it('按 delays 逐轮重试；修好即停并重置预算', async () => {
    const calls = [];
    const repaired = vi.fn();
    const loop = createBoundedRepairLoop({
      repair: async () => {
        calls.push('repair');
        return calls.length >= 2 ? 0 : 1; // 第二轮修好
      },
      delays: [100, 200, 400],
      onRepaired: repaired,
    });

    loop.start();
    expect(loop.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.length).toBe(1);
    expect(loop.attempts).toBe(2); // 第一轮没修好 → 排第二轮
    await vi.advanceTimersByTimeAsync(200);
    expect(calls.length).toBe(2);
    expect(repaired).toHaveBeenCalledTimes(1);
    expect(loop.attempts).toBe(0); // 修好即重置预算

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.length).toBe(2); // 不再有后续轮次
  });

  it('三轮仍坏就收手，onGiveUp 只报一次，之后 start() 变 no-op', async () => {
    const repair = vi.fn(async () => 1);
    const giveUp = vi.fn();
    const loop = createBoundedRepairLoop({ repair, delays: [10, 20, 30], onGiveUp: giveUp });

    loop.start();
    await vi.advanceTimersByTimeAsync(10 + 20 + 30 + 1);
    expect(repair).toHaveBeenCalledTimes(3);

    loop.start();
    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(loop.exhausted).toBe(true);
    expect(repair).toHaveBeenCalledTimes(3);
  });

  it('isActive() 为假时不修，也不再排下一轮（页面已离开）', async () => {
    const repair = vi.fn(async () => 1);
    let active = true;
    const loop = createBoundedRepairLoop({
      repair,
      delays: [10, 20],
      isActive: () => active,
    });
    loop.start();
    active = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(repair).not.toHaveBeenCalled();
  });

  it('stop() 取消已排的轮次；reset() 清预算后可再来完整三轮', async () => {
    const repair = vi.fn(async () => 1);
    const loop = createBoundedRepairLoop({ repair, delays: [10, 20, 30] });

    loop.start();
    loop.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(repair).not.toHaveBeenCalled();

    loop.reset();
    expect(loop.attempts).toBe(0);
    expect(loop.exhausted).toBe(false);

    loop.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it('schedule 幂等：重复 start() 不会叠加计时器', async () => {
    const repair = vi.fn(async () => 0);
    const loop = createBoundedRepairLoop({ repair, delays: [10, 20] });
    loop.start();
    loop.start();
    loop.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(repair).toHaveBeenCalledTimes(1);
  });
});

describe('createStyleSheetGuard —— 页面级门面', () => {
  it('reset() 先复核一轮，仍有坏样式才排退避重试', async () => {
    const link = makeLink('/x/profile-base-abc.css', { rules: 0 });
    const doc = makeDoc([link]);
    const guard = createStyleSheetGuard({
      matchers: [/profile-base-/],
      delays: [10, 20],
      doc,
    });

    const pending = guard.reset();
    const rebuilt = doc.created[0];
    rebuilt.fire('error'); // 重建也失败
    expect(await pending).toBe(1);

    // 排入的退避轮次会再去修（此时 link 已是重建后那条，仍坏）
    await vi.advanceTimersByTimeAsync(11);
    expect(doc.created.length).toBeGreaterThan(1);
  });

  it('repairNow() 在全部健康时返回 0 且不重建', async () => {
    const doc = makeDoc([makeLink('/x/profile-base-abc.css', { rules: 9 })]);
    const guard = createStyleSheetGuard({ matchers: [/profile-base-/], delays: [10], doc });
    expect(await guard.repairNow()).toBe(0);
    expect(doc.created.length).toBe(0);
  });
});

describe('createStyleSheetGuard.areApplied —— 同步判活（与 repairNow 的区别是契约）', () => {
  const MATCHERS = [/profile-base-/, /profile-panels-/];

  it('全部目标都有生效的 link → true', () => {
    const doc = makeDoc([
      makeLink('/x/profile-base-abc.css', { rules: 5 }),
      makeLink('/x/profile-panels-def.css', { rules: 3 }),
    ]);
    const guard = createStyleSheetGuard({ matchers: MATCHERS, delays: [10], doc });
    expect(guard.areApplied()).toBe(true);
  });

  it('缺一条 → false', () => {
    const doc = makeDoc([makeLink('/x/profile-base-abc.css', { rules: 5 })]);
    const guard = createStyleSheetGuard({ matchers: MATCHERS, delays: [10], doc });
    expect(guard.areApplied()).toBe(false);
  });

  it('link 存在但 0 规则（被 abort 的那条）→ false', () => {
    const doc = makeDoc([
      makeLink('/x/profile-base-abc.css', { rules: 0 }),
      makeLink('/x/profile-panels-def.css', { rules: 3 }),
    ]);
    const guard = createStyleSheetGuard({ matchers: MATCHERS, delays: [10], doc });
    expect(guard.areApplied()).toBe(false);
  });

  it('⚠️ link 尚未建出：areApplied=false 而 repairNow()=0 —— 就绪门不能用后者代替前者', async () => {
    const guard = createStyleSheetGuard({ matchers: MATCHERS, delays: [10], doc: makeDoc([]) });
    expect(guard.areApplied()).toBe(false);
    expect(await guard.repairNow()).toBe(0);
  });
});
