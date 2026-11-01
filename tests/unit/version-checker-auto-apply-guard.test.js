/**
 * 自动强刷护栏 —— 未提交内容 / 媒体播放 必须让路。
 *
 * 背景：`initVersionChecker` 启动时会 autoApply 一次；`visibilityHandler` 在离开
 * ≥30s 切回时也会 autoApply。这两条路径都会 `forceCleanAndReload`（可能注销 SW +
 * 清 Cache Storage + 强制导航）—— 在用户填了东西没提交时执行 = 内容凭空消失。
 *
 * ⚠️ 这里测的是**「不刷新」这个否定断言**，所以每条拦截用例都必须配一条
 *    「同样的前置条件、只去掉那个拦截因素 ⇒ 确实会刷新」的对照，
 *    否则「根本没走到刷新逻辑」也会让断言绿。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createStorage = () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

const createWindow = () => ({
  location: {
    href: 'https://example.com/app/?from=test#/forum',
    replace: vi.fn(),
    reload: vi.fn(),
  },
  history: { state: null, replaceState: vi.fn() },
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (id) => clearTimeout(id),
  dispatchEvent: vi.fn(),
});

/**
 * document stub。
 * @param {object} opts
 * @param {object} [opts.activeElement] 当前焦点元素（默认 body ⇒ 「焦点已离开输入框」）
 * @param {object[]} [opts.editables] 页面上现存的 input/textarea/contenteditable
 * @param {object[]} [opts.media] 页面上现存的 video/audio
 */
const stubDocument = ({ activeElement = { tagName: 'BODY' }, editables = [], media = [] } = {}) => {
  const listeners = new Map();
  const doc = {
    visibilityState: 'visible',
    activeElement,
    querySelector: vi.fn((selector) => ({
      getAttribute: () => (selector.includes('boh-build-id') ? 'local-build' : '4.9.0'),
    })),
    querySelectorAll: vi.fn((selector) => {
      if (selector === 'video, audio') return media;
      if (selector.includes('input, textarea')) return editables;
      return [];
    }),
    addEventListener: vi.fn((type, handler) => {
      listeners.set(type, handler);
    }),
    removeEventListener: vi.fn((type) => {
      listeners.delete(type);
    }),
  };
  vi.stubGlobal('document', doc);
  return { doc, listeners };
};

const mockRemoteBuild = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '5.0.0', buildId: 'remote-build' }),
    })),
  );

/** 文本输入元素：用户打过字、值仍非空 */
const textArea = (value) => ({ nodeType: 1, tagName: 'TEXTAREA', value, isContentEditable: false });

describe('version-checker 自动强刷护栏', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', createWindow());
    vi.stubGlobal('sessionStorage', createStorage());
    vi.stubGlobal('navigator', {});
    vi.stubGlobal(
      'CustomEvent',
      class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('用户填过内容且焦点已离开 ⇒ 不自动强刷，退化成弹提示', async () => {
    const field = textArea('写了一半的帖子');
    // activeElement 是 body：模拟「打完字点了别处」—— 这正是 isTypingInForm 失效的场景
    const { listeners } = stubDocument({ editables: [field] });
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    // init 里的 autoCheck 卡在 await fetch 上，此刻同步补一次 input 事件 = 用户刚打过字
    listeners.get('input')?.({ target: field });

    await vi.waitFor(() => expect(window.dispatchEvent).toHaveBeenCalledOnce());

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(window.dispatchEvent.mock.calls[0][0].detail.remoteBuildId).toBe('remote-build');
    destroyVersionChecker();
  });

  it('对照：同样的页面，只是没填过东西 ⇒ 确实会自动强刷', async () => {
    // 同一个 textarea 存在、但从未收到 input 事件（程序化回填不算用户输入）
    const field = textArea('页面载入时就有内容');
    stubDocument({ editables: [field] });
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();

    await vi.waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith(
        '/app/?from=test&__boh_update=remote-build#/forum',
      ),
    );
    destroyVersionChecker();
  });

  it('内容被清空后不再拦截（用户自己删干净了）', async () => {
    const field = textArea('先写点东西');
    const { listeners } = stubDocument({ editables: [field] });
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    listeners.get('input')?.({ target: field });
    // 用户全选删除：值变空 ⇒ 标记撤销
    field.value = '   ';
    listeners.get('input')?.({ target: field });

    await vi.waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith(
        '/app/?from=test&__boh_update=remote-build#/forum',
      ),
    );
    destroyVersionChecker();
  });

  it('媒体播放中不自动强刷（切回继续看的场景）', async () => {
    const { doc } = stubDocument({ media: [{ paused: false, ended: false }] });
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    await vi.waitFor(() => expect(doc.querySelectorAll).toHaveBeenCalled());

    expect(window.location.replace).not.toHaveBeenCalled();
    destroyVersionChecker();
  });

  it('有文件正在上传 ⇒ 不自动强刷（传输不可续传，中断等于从头重传）', async () => {
    // 这个场景原来三道护栏都覆盖不到：只传图、一个字没打的（相册补图 / Cloud+ 传
    // 素材 / 换封面），activeElement 是 body、没有脏输入、也没有媒体在播。
    stubDocument();
    mockRemoteBuild();
    const { beginUpload } = await import('../../src/utils/upload-activity.js');
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    // 必须在 autoCheck 拿到 fetch 结果前就置位
    beginUpload();
    initVersionChecker();
    // upload 护栏排在最前，会短路掉后面的 media/editing 探测（所以不能等 querySelectorAll），
    // 直接等流程的必经出口「弹提示」
    await vi.waitFor(() => expect(window.dispatchEvent).toHaveBeenCalledOnce());

    expect(window.location.replace).not.toHaveBeenCalled();
    destroyVersionChecker();
  });

  it('对照：上传已结束（begin/end 净零）⇒ 确实会自动强刷', async () => {
    // 防止护栏退化成「开过上传就永久禁止自动更新」
    stubDocument();
    mockRemoteBuild();
    const { beginUpload, endUpload } = await import('../../src/utils/upload-activity.js');
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    beginUpload();
    endUpload();
    initVersionChecker();

    await vi.waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith(
        '/app/?from=test&__boh_update=remote-build#/forum',
      ),
    );
    destroyVersionChecker();
  });

  it('导航前应用挂起更新时，上传中不刷新（返回 false 让导航继续）', async () => {
    stubDocument();
    mockRemoteBuild();
    const { beginUpload } = await import('../../src/utils/upload-activity.js');
    const { markUpdateAvailable, applyPendingUpdateBeforeNavigation } =
      await import('../../src/utils/version-checker.js');

    markUpdateAvailable('5.0.0', 'remote-build');
    beginUpload();

    expect(applyPendingUpdateBeforeNavigation()).toBe(false);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('对照：同样挂起更新，没有上传在跑 ⇒ 发起切构建并返回 true', async () => {
    stubDocument();
    mockRemoteBuild();
    const { markUpdateAvailable, applyPendingUpdateBeforeNavigation } =
      await import('../../src/utils/version-checker.js');

    markUpdateAvailable('5.0.0', 'remote-build');

    expect(applyPendingUpdateBeforeNavigation()).toBe(true);
    await vi.waitFor(() => expect(window.location.replace).toHaveBeenCalled());
  });

  it('复选框 / 下拉框不算「未提交内容」（否则列表页一碰筛选就永久禁用更新）', async () => {
    const checkbox = {
      nodeType: 1,
      tagName: 'INPUT',
      type: 'checkbox',
      value: 'on',
      checked: true,
      isContentEditable: false,
    };
    const { listeners } = stubDocument({ editables: [checkbox] });
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    listeners.get('input')?.({ target: checkbox });

    await vi.waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith(
        '/app/?from=test&__boh_update=remote-build#/forum',
      ),
    );
    destroyVersionChecker();
  });

  it('destroy 时摘掉 input 监听（避免重复初始化后双份追踪）', async () => {
    const { doc } = stubDocument();
    mockRemoteBuild();
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    destroyVersionChecker();

    expect(doc.removeEventListener).toHaveBeenCalledWith('input', expect.any(Function), true);
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
