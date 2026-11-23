/**
 * update-continuity —— 静默切换构建前后的现场接续。
 *
 * 为什么这块必须有测试：2026-11-23 决定「更新不弹窗、不通知」，这个决定的正当性
 * 完全建立在「用户看不出来」之上。而接续失败的表现恰好是**无声的**——
 * 用户不会报错，只会觉得「网站有时候会跳回顶部」。没有断言的话，回归永远发现不了。
 *
 * 这里测的是四条判据，每条都对应一次真实的错误方向：
 *   ① 用后即焚   —— 不清掉，用户自己按 F5 会被拽回上次的位置（比回顶更糟）
 *   ② TTL       —— 上次切换发生在几分钟前，这次刷新不该套用
 *   ③ hash 一致 —— 跨页套用位置 = 把 A 页的滚动塞进 B 页
 *   ④ 静默失败   —— 隐私模式/配额满/坏 JSON 一律当没发生，绝不抛
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSessionStorage = () => {
  const map = new Map();
  return {
    getItem: vi.fn((k) => (map.has(k) ? map.get(k) : null)),
    setItem: vi.fn((k, v) => map.set(k, String(v))),
    removeItem: vi.fn((k) => map.delete(k)),
    _dump: () => Object.fromEntries(map),
    _map: map,
  };
};

const stubWindow = ({ hash = '#/forum', scrollY = 1200, overrides = {} } = {}) => {
  const win = {
    location: { hash },
    scrollY,
    innerHeight: 800,
    history: { scrollRestoration: 'auto' },
    sessionStorage: createSessionStorage(),
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (id) => clearTimeout(id),
    scrollTo: vi.fn(),
    ...overrides,
  };
  vi.stubGlobal('window', win);
  return win;
};

const stubDocument = ({ scrollHeight = 5000, containers = {} } = {}) => {
  const doc = {
    documentElement: { scrollHeight, scrollTop: 0 },
    querySelector: vi.fn((selector) => containers[selector] || null),
    querySelectorAll: vi.fn(() => []),
  };
  vi.stubGlobal('document', doc);
  return doc;
};

describe('update-continuity 现场接续', () => {
  beforeEach(() => {
    vi.resetModules();
    /* performance.now 必须**递增**：restore 靠 deadline（8000ms）兜底退出，
       给个恒定的 now 会让 deadline 永远到不了 ⇒ 帧回调自递归爆栈。
       每帧 +16ms ≈ 60fps，与真实浏览器一致。 */
    let t = 1000;
    vi.stubGlobal('performance', { now: () => (t += 16) });
    // 代码里是裸 requestAnimationFrame（浏览器全局），同步跑一帧即可
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      fn(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('采集后能原样读回（hash / 窗口滚动 / 容器滚动）', async () => {
    const win = stubWindow({ hash: '#/forum?tab=posts', scrollY: 1234 });
    stubDocument({
      containers: {
        '.tab-page.posts-tab': { scrollTop: 640, scrollHeight: 3000, clientHeight: 700 },
      },
    });
    const { captureUpdateContinuity, consumeUpdateContinuity } =
      await import('../../src/utils/update-continuity.js');

    expect(captureUpdateContinuity()).toBe(true);
    const state = consumeUpdateContinuity();
    expect(state.hash).toBe('#/forum?tab=posts');
    expect(state.scrollY).toBe(1234);
    expect(state.containers).toEqual([{ selector: '.tab-page.posts-tab', top: 640 }]);
    // 没写过 window.scrollTo —— 采集只读不写
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it('用后即焚：读到一次之后就没有了（否则用户自己按 F5 会被拽回旧位置）', async () => {
    stubWindow();
    stubDocument();
    const { captureUpdateContinuity, consumeUpdateContinuity } =
      await import('../../src/utils/update-continuity.js');

    captureUpdateContinuity();
    expect(consumeUpdateContinuity()).not.toBeNull();
    expect(consumeUpdateContinuity()).toBeNull();
  });

  it('超过 TTL 的状态直接作废（几分钟前那次切换和这次刷新无关）', async () => {
    const win = stubWindow();
    stubDocument();
    const { captureUpdateContinuity, consumeUpdateContinuity } =
      await import('../../src/utils/update-continuity.js');

    captureUpdateContinuity();
    // 手工把时间戳改老（比 MAX_AGE_MS=60s 更久）
    const raw = JSON.parse(win.sessionStorage._map.get('boh_update_continuity'));
    raw.savedAt = Date.now() - 61 * 1000;
    win.sessionStorage._map.set('boh_update_continuity', JSON.stringify(raw));

    expect(consumeUpdateContinuity()).toBeNull();
  });

  it('hash 不一致就不套用（A 页的位置不能塞进 B 页）', async () => {
    const win = stubWindow({ hash: '#/forum' });
    stubDocument();
    const { captureUpdateContinuity, consumeUpdateContinuity } =
      await import('../../src/utils/update-continuity.js');

    captureUpdateContinuity();
    win.location.hash = '#/shop'; // 用户在两次刷新之间切了页
    expect(consumeUpdateContinuity()).toBeNull();
  });

  it('坏 JSON / 缺 savedAt / 存储抛错 ⇒ 静默返回 null，不抛', async () => {
    const win = stubWindow();
    stubDocument();
    const { consumeUpdateContinuity } = await import('../../src/utils/update-continuity.js');

    win.sessionStorage._map.set('boh_update_continuity', '{ 这不是 JSON');
    expect(() => consumeUpdateContinuity()).not.toThrow();
    expect(consumeUpdateContinuity()).toBeNull();

    win.sessionStorage._map.set('boh_update_continuity', JSON.stringify({ hash: '#/forum' }));
    expect(consumeUpdateContinuity()).toBeNull();

    // sessionStorage 整个坏掉（隐私模式）
    vi.stubGlobal('window', {
      ...win,
      get sessionStorage() {
        throw new Error('SecurityError');
      },
    });
    expect(() => consumeUpdateContinuity()).not.toThrow();
  });

  it('恢复时把浏览器自带滚动恢复切成 manual（否则会和它抢，闪一下）', async () => {
    const win = stubWindow({ scrollY: 0 });
    stubDocument({ scrollHeight: 5000 });
    win.scrollTo.mockImplementation(({ top }) => {
      win.scrollY = top;
    });
    const { restoreUpdateContinuity } = await import('../../src/utils/update-continuity.js');

    restoreUpdateContinuity({
      hash: '#/forum',
      scrollY: 900,
      containers: [],
      savedAt: Date.now(),
    });
    expect(win.history.scrollRestoration).toBe('manual');
    expect(win.scrollY).toBe(900);
  });

  it('内容还不够长时不去硬塞目标位置（等内容长高再说）', async () => {
    /* 目标页只有一屏高（数据还没回来）⇒ 不该硬塞 1200。新实现遇到这种情况
       干脆不滚（等 ResizeObserver 报告内容长高），所以断言是「没有尝试滚到 1200」，
       而不是「滚到 0」—— 后者会把「原地不动」误判成失败，是条假断言。 */
    const win = stubWindow({ scrollY: 0 });
    stubDocument({ scrollHeight: 800 });
    const { restoreUpdateContinuity } = await import('../../src/utils/update-continuity.js');

    restoreUpdateContinuity({
      hash: '#/forum',
      scrollY: 1200,
      containers: [],
      savedAt: Date.now(),
    });
    const targets = win.scrollTo.mock.calls.map((c) => c[0]?.top);
    expect(targets).not.toContain(1200);
  });

  it('路由把滚动按回 0 之后会再滚回去（探针实测失败的回归守卫）', async () => {
    /* 2026-11-23 探针实测：切换前 600px → 切换后 0px。真因之一是 router 的
       scrollBehavior 在挂载后执行 { top: 0 }，把我们刚落下的位置按回去了。
       修法改成逐帧校正；这条测试模拟「第一帧成功、第二帧被按回 0」，
       要求最终仍停在 900，并且 scrollTo 被调了不止一次。 */
    const win = stubWindow({ scrollY: 0 });
    stubDocument({ scrollHeight: 5000 });

    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      frame += 1;
      if (frame === 2) {
        win.scrollY = 0; // 模拟路由守卫把页面按回顶部
      }
      fn(0);
      return frame;
    });
    win.scrollTo.mockImplementation(({ top }) => {
      win.scrollY = top;
    });

    const { restoreUpdateContinuity } = await import('../../src/utils/update-continuity.js');
    restoreUpdateContinuity({
      hash: '#/forum',
      scrollY: 900,
      containers: [],
      savedAt: Date.now(),
    });

    expect(win.scrollY).toBe(900);
    // 至少滚两次：第一次落位、第二次是被按回后的校正
    expect(win.scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('没有采集过 ⇒ resume 返回 false 且不碰滚动', async () => {
    const win = stubWindow();
    stubDocument();
    const { resumeUpdateContinuity } = await import('../../src/utils/update-continuity.js');

    expect(resumeUpdateContinuity()).toBe(false);
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it('preserveExisting：页面已归零时不覆盖原来的 scrollY（硬重置路径的回归守卫）', async () => {
    /* 2026-11-23 实测踩出来的真 bug：硬重置发生在新文档刚加载时，此时
       scrollY=0、docH 只有一屏。若照常采集，就把上一条正确记录（600）覆盖成 0，
       用户从顶部开始 —— 比不接续更确定地丢位置。
       证据：window.name 抓到 yAtCapture:0, docH:800，而切换前实际在 600px。
       ⚠️ 两个「文档」共享同一个 sessionStorage（那正是跨导航的真实情形），
       所以第二次只改 scrollY，不换 storage。 */
    const win = stubWindow({ hash: '#/forum', scrollY: 600 });
    stubDocument();
    const { captureUpdateContinuity } = await import('../../src/utils/update-continuity.js');
    captureUpdateContinuity(); // 用户此刻真在 600px

    win.scrollY = 0; // 模拟新文档刚加载：滚动归零
    captureUpdateContinuity({ preserveExisting: true });

    const raw = JSON.parse(win.sessionStorage._map.get('boh_update_continuity'));
    expect(raw.scrollY).toBe(600);
  });

  it('preserveExisting 不阻碍「用户自己滚到新位置」的采集', async () => {
    // 非 0 说明页面真的动了（用户自己滚的），以新的为准
    const win = stubWindow({ hash: '#/forum', scrollY: 600 });
    stubDocument();
    const { captureUpdateContinuity } = await import('../../src/utils/update-continuity.js');
    captureUpdateContinuity();

    win.scrollY = 320;
    captureUpdateContinuity({ preserveExisting: true });

    const raw = JSON.parse(win.sessionStorage._map.get('boh_update_continuity'));
    expect(raw.scrollY).toBe(320);
  });
});
