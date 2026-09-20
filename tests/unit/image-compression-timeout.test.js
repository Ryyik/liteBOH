import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 图片压缩超时兜底 + worker libURL 同源化探针。
 *
 * 背景：browser-image-compression 2.0.2 在 useWebWorker 模式下，worker 内会
 * importScripts 默认 CDN（cdn.jsdelivr.net）。大陆网络下该 CDN 常见黑洞式挂起
 * （不报错、不返回），压缩 Promise 永不 settle，而上游上传入口（HeroConsole 等）
 * 没有超时兜底 → 按钮永久卡在「上传中」且无任何错误提示。
 *
 * 修复：① libURL 指向同源打包副本；② worker 压缩 60s 超时后降级主线程；
 * ③ 压缩库动态 import 15s 超时。
 *
 * 反证：若回退修复（无 libURL / 无超时），下方断言会变红——
 * 挂起用例在无超时实现下会让测试直接超时失败，而非静默通过。
 */

const mocks = vi.hoisted(() => ({
  compressionFn: vi.fn()
}));

vi.mock('browser-image-compression', () => ({ default: mocks.compressionFn }));

// node 环境下 ?url 资源导入由 vitest 资产管线处理，这里显式 mock 避免 fs 解析差异
vi.mock('browser-image-compression/dist/browser-image-compression.js?url', () => ({
  default: '/mock-assets/browser-image-compression.js'
}));

const makeWebpBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
const makeFile = () => new File([new Uint8Array([1, 2, 3])], 'hero.png', { type: 'image/png' });

const loadModule = async () => {
  vi.resetModules();
  return import('@/utils/image-compression.js');
};

describe('image-compression 超时兜底与 libURL 同源化', () => {
  beforeEach(() => {
    mocks.compressionFn.mockReset();
    // 只 fake timer API：动态 import / 模块求值依赖真实 microtask 与 setImmediate，
    // 全量 fake（含 queueMicrotask/nextTick）会让被测代码的异步链卡死产生假失败
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(async () => {
    // 先放行一轮真实事件循环，让上一个用例可能残留的异步续体在本用例的 spy 上结算完，
    // 再恢复真实定时器。否则残留调用会被算进下一个用例的调用次数 —— 那正是本文件曾经
    // 「一个用例偶发、相邻用例跟着报错」的级联来源。
    await new Promise((resolve) => setImmediate(resolve));
    vi.useRealTimers();
  });

  // ⚠️ 不要退回「固定 tick 数放行事件循环」的写法（历史上是 for 5 × setImmediate）。
  // setImmediate 属于事件循环的 check 阶段，可能**早于**动态 import 的真实 I/O 回调
  // （模块图解析 / fs 读）完成：本文件单独跑时 5 个 tick 够用，但整套件 100+ 文件并行、
  // 机器繁忙时就不够了。后果有两层：
  //   ① 断言拿到 0 次调用而抛错；
  //   ② 该用例里尚未 await 的 `pending` 把降级调用泄漏到下一个用例，
  //      使它报「期望 2 次、实际 3 次」—— 看起来像两个 bug，实际只有一个。
  // 因此统一改为「条件 + 真实时间上限」等待，与机器负载无关。
  const waitUntil = async (predicate, describe, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (predicate()) return;
      if (Date.now() > deadline) throw new Error(`等待超时（${timeoutMs}ms）：${describe}`);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  it('worker 模式必须显式传入同源 libURL（反证：旧实现无 libURL 字段，此断言变红）', async () => {
    const module = await loadModule();
    mocks.compressionFn.mockResolvedValue(makeWebpBlob());

    await module.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 });

    expect(mocks.compressionFn).toHaveBeenCalledTimes(1);
    const options = mocks.compressionFn.mock.calls[0][1];
    expect(options.useWebWorker).toBe(true);
    expect(typeof options.libURL).toBe('string');
    expect(options.libURL.length).toBeGreaterThan(0);
    expect(options.libURL).not.toContain('cdn.jsdelivr.net');
  });

  it('worker 挂起（永不 settle）时应在超时后降级主线程压缩并成功返回（反证：无超时实现会让本用例挂死变红）', async () => {
    const module = await loadModule();
    // 第一次调用（worker）模拟 importScripts 挂起：永不 settle
    mocks.compressionFn.mockImplementationOnce(() => new Promise(() => {}));
    // 第二次调用（主线程降级）成功
    const fallbackBlob = makeWebpBlob();
    mocks.compressionFn.mockImplementationOnce(async () => fallbackBlob);

    const pending = module.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 });

    // 等被测异步链推进到「worker 调用已发起」——按条件等待，不依赖 tick 数
    await waitUntil(() => mocks.compressionFn.mock.calls.length >= 1, 'worker 压缩调用未发起');
    expect(mocks.compressionFn).toHaveBeenCalledTimes(1);

    // 推进超过 60s 超时阈值，触发降级
    await vi.advanceTimersByTimeAsync(60000);

    const result = await pending;
    expect(result).toBeTruthy();
    expect(result.type).toBe('image/webp');
    expect(mocks.compressionFn).toHaveBeenCalledTimes(2);

    const fallbackOptions = mocks.compressionFn.mock.calls[1][1];
    expect(fallbackOptions.useWebWorker).toBe(false);
    expect(fallbackOptions.libURL).toBeUndefined();
  });

  it('worker 失败且主线程降级也失败时，应把错误抛给调用方（上游按「压缩失败」走上传原图分支）', async () => {
    const module = await loadModule();
    mocks.compressionFn.mockImplementationOnce(() => Promise.reject(new Error('worker boom')));
    mocks.compressionFn.mockImplementationOnce(() => Promise.reject(new Error('main boom')));

    await expect(
      module.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 })
    ).rejects.toThrow('main boom');
    expect(mocks.compressionFn).toHaveBeenCalledTimes(2);
  });

  it('压缩库动态 import 挂起时应在超时后抛错（反证：无超时实现会让本用例挂死变红）', async () => {
    // vi.resetModules() 不会重置 vi.mock 的实例缓存，需用 vi.doMock 覆盖注册
    vi.resetModules();
    vi.doMock('browser-image-compression', () => new Promise(() => {}));
    const hangingModule = await import('@/utils/image-compression.js');

    const pending = hangingModule.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 });
    const assertion = expect(pending).rejects.toThrow('图片压缩库加载超时');

    // 假定时器数量可直接观测：库加载超时 timer 注册完成后才推进时间
    await waitUntil(() => vi.getTimerCount() >= 1, '库加载超时 timer 未注册');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;

    // 恢复正常注册，避免污染后续用例
    vi.resetModules();
    vi.doMock('browser-image-compression', () => ({ default: mocks.compressionFn }));
  });

  it('import 超时失败后应允许下次重试（loader 缓存被清空，不残留坏 Promise）', async () => {
    vi.resetModules();
    vi.doMock('browser-image-compression', () => new Promise(() => {}));
    const hangingModule = await import('@/utils/image-compression.js');

    const first = hangingModule.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 });
    const firstAssertion = expect(first).rejects.toThrow('图片压缩库加载超时');
    await waitUntil(() => vi.getTimerCount() >= 1, '库加载超时 timer 未注册');
    await vi.advanceTimersByTimeAsync(15000);
    await firstAssertion;

    // 恢复正常模块后重试应成功
    vi.resetModules();
    vi.doMock('browser-image-compression', () => ({ default: mocks.compressionFn }));
    const okBlob = makeWebpBlob();
    mocks.compressionFn.mockResolvedValue(okBlob);
    const retryModule = await import('@/utils/image-compression.js');

    const result = await retryModule.compressImageFileToUploadLimit(makeFile(), { targetSizeMB: 9.6 });
    expect(result).toBeTruthy();
  });
});
