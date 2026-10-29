import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * createPanelAsync 工厂的真行为测试。
 *
 * 做法：mock 掉 vue 的 defineAsyncComponent（捕获工厂实际传进去的配置）+
 * mock reportEvent（观察上报）。这样能真跑 onError 的两个分支，而不是只断言
 * 「源码里有 onError 这三个字」—— 后者撤掉渲染逻辑照样绿。
 */

const captured = [];
const reportEvent = vi.fn();
const recoverDynamicImportFailure = vi.fn(() => true);

vi.mock('vue', () => ({
  defineAsyncComponent: (config) => {
    captured.push(config);
    return { __asyncConfig: config };
  },
  // 工厂用 h 造失败态；这里给个能反映结构的假实现
  h: (type, props, children) => ({ type, props, children }),
}));

vi.mock('../../src/utils/monitoring.js', () => ({
  reportEvent: (...args) => reportEvent(...args),
}));

// 失败兜底现在会主动发起「强刷自愈」（部署窗口期只有它能救），单测里必须隔离掉
vi.mock('../../src/utils/vite-preload-recovery.js', () => ({
  recoverDynamicImportFailure: () => recoverDynamicImportFailure(),
}));

const { createPanelAsync } = await import('../../src/utils/async-component.js');

/** 把 h() 假结构里的文本抽出来 —— 断言「用户到底看到了什么字」 */
const collectText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join('');
  return collectText(node.children);
};

/** 跑一遍 errorComponent 的 setup()，拿到它真正会渲染的 vnode 树 */
const renderFallback = (config) => config.errorComponent.setup()();

beforeEach(() => {
  captured.length = 0;
  reportEvent.mockClear();
  recoverDynamicImportFailure.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPanelAsync', () => {
  it('把 loader 原样交给 defineAsyncComponent，并带上默认 delay/timeout', () => {
    const loader = () => Promise.resolve({});
    createPanelAsync(loader, { label: 'X' });
    expect(captured).toHaveLength(1);
    expect(captured[0].loader).toBe(loader);
    expect(captured[0].delay).toBe(120);
    expect(captured[0].timeout).toBe(20000);
  });

  it('默认兜底是「继续显示加载态」而不是错误卡（2026-10-27 用户定稿），自定义可覆盖', () => {
    createPanelAsync(() => Promise.resolve({}), { label: 'A' });
    expect(captured[0].errorComponent).toBeTruthy();

    // 真实渲染树：有「正在加载」，绝不能出现「加载失败 / 请检查网络」那套说法
    const tree = renderFallback(captured[0]);
    const text = collectText(tree);
    expect(text).toContain('正在加载');
    expect(text).not.toContain('加载失败');
    expect(text).not.toContain('请检查网络');
    // 反面证据：老的错误卡是一圈虚线（border: 1px dashed currentColor）—— 撤掉视觉就必须一起红
    expect(tree.props.style.border).toBeUndefined();
    // 三个点还在（用户要的就是这个动画；点了 class 才能吃到 index.html 的内联 keyframes）
    const dots = tree.children[0];
    expect(dots.props.class).toContain('boh-boot-dots');
    expect(dots.children).toHaveLength(3);

    const custom = { name: 'CustomError' };
    createPanelAsync(() => Promise.resolve({}), { label: 'B', errorComponent: custom });
    expect(captured[1].errorComponent).toBe(custom);
  });

  it('silent: true 时失败兜底是「什么都不渲染」（浮层 / 触发器专用，2026-10-29）', () => {
    createPanelAsync(() => Promise.resolve({}), { label: 'Overlay', silent: true });
    expect(captured[0].errorComponent.name).toBe('AsyncPanelSilent');
    // 真实渲染树就是 null —— 文档流里不留任何「正在加载…」占位。
    // 背景：App.vue 常驻三浮层（AiEdgeTrigger/AdminConfirmModal/AccountBindPrompt）
    // 曾走默认 AsyncPanelQuiet，部署窗口期 chunk 失败后每页底部裸露三块加载占位
    // （用户报障「更新完第一次进网页很多加载中」的根因）。
    expect(renderFallback(captured[0])).toBeNull();

    // 显式 errorComponent 仍然优先于 silent（显式选择不被 silent 覆盖）
    const custom = { name: 'CustomError' };
    createPanelAsync(() => Promise.resolve({}), {
      label: 'C',
      silent: true,
      errorComponent: custom,
    });
    expect(captured[1].errorComponent).toBe(custom);
  });

  it('默认（未传 silent）仍是「继续显示加载态」——内容型面板行为不变', () => {
    createPanelAsync(() => Promise.resolve({}), { label: 'Content' });
    expect(captured[0].errorComponent.name).toBe('AsyncPanelQuiet');
    expect(collectText(renderFallback(captured[0]))).toContain('正在加载');
  });

  it('源码守卫：浮层 / 触发器型面板必须传 silent: true（部署窗口期不再裸露加载块）', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const root = resolve(import.meta.dirname, '../..');
    const read = (p) => readFileSync(resolve(root, p), 'utf-8');

    // App.vue 四个常驻 / 按需浮层（silent 或显式 errorComponent 都算有失败态主见）
    const app = read('src/App.vue');
    for (const label of ['AiEdgeTrigger', 'AdminConfirmModal', 'AccountBindPrompt', 'LoginView']) {
      const pattern = new RegExp(`label: '${label}',\\s*(?:silent: true|errorComponent)`);
      expect({ file: 'App.vue', label, hit: pattern.test(app) }).toMatchObject({
        file: 'App.vue',
        label,
        hit: true,
      });
    }

    // UserSpaceMain 的两个弹窗型面板
    const userspace = read('src/views/user-center/UserSpace/UserSpaceMain.vue');
    for (const label of ['AvatarCropModal', 'AvatarFramePickerModal']) {
      const pattern = new RegExp(`label: '${label}',\\s*silent: true`);
      expect({ file: 'UserSpaceMain.vue', label, hit: pattern.test(userspace) }).toMatchObject({
        file: 'UserSpaceMain.vue',
        label,
        hit: true,
      });
    }
  });

  it('onError 在前两次失败时退避重试（不 fail、不上报）', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'Retry' });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 1);
    expect(fail).not.toHaveBeenCalled();
    expect(reportEvent).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled(); // 退避是延迟的
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledTimes(1);

    onError(new Error('boom'), retry, fail, 2);
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
  });

  it('onError 超过重试次数：上报 + 发起恢复 + fail（闭包保留 label）', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'GiveUp' });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 3);
    vi.runAllTimers();

    expect(retry).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith('async_component_failure', { label: 'GiveUp' });
    // 放弃之前必须先给恢复链一次机会（部署窗口期的唯一出口）；漏了它页面就会永远转圈
    expect(recoverDynamicImportFailure).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('重试阶段不发起恢复（别在瞬时抖动时清缓存）', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'RetryOnly' });
    const { onError } = captured[0];
    onError(new Error('boom'), vi.fn(), vi.fn(), 1);
    vi.runAllTimers();
    expect(recoverDynamicImportFailure).not.toHaveBeenCalled();
  });

  it('retries 可配置：retries:0 时首次失败即上报并放弃', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'NoRetry', retries: 0 });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 1);
    vi.runAllTimers();
    expect(retry).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith('async_component_failure', { label: 'NoRetry' });
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
