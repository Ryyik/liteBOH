/**
 * points-card-assets —— 签到 3D 舞台的「卡面可绘制就绪」判定
 *
 * 守四件事：
 *   1. 三种皮肤各自要预取哪些 URL（blank 无图 / cats 十张 / custom 一张 CDN 改写后的）
 *   2. 单张失败不阻塞其它（cats 坏一张不该整块不播）
 *   3. 预算超时 resolve `{ready:false}` 而**不是 reject** —— 积分已经到账，
 *      图片挂了也不能把成功反馈吞掉
 *   4. 同一 URL 只解码一次（模块级缓存），重复签到不重复下载
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPointsCardAssetCache,
  collectPointsCardAssetUrls,
  loadImageDecoded,
  preloadPointsCardAssets,
} from '../../src/utils/points-card-assets.js';
import { HOME_CAT_ASSETS } from '../../src/utils/home-cat-theme.js';

const CLOUDINARY_URL =
  'https://res.cloudinary.com/dkqae7j1m/image/upload/v1786894948/boh-points-cards/m6walmpg0whumxmpe4hv.png';

/** 默认 loader：可控成功/失败/挂起，并记录调用次数 */
const createLoader = (behaviour = 'ok') => {
  const calls = [];
  const loader = (url) => {
    calls.push(url);
    if (behaviour === 'pending') return new Promise(() => {});
    if (behaviour === 'throw') return Promise.reject(new Error('boom'));
    if (behaviour === 'fail') return Promise.resolve(false);
    return Promise.resolve(true);
  };
  return { loader, calls };
};

describe('collectPointsCardAssetUrls', () => {
  it('blank 皮肤没有图片资源', () => {
    expect(collectPointsCardAssetUrls({ skin: 'blank' })).toEqual([]);
    expect(collectPointsCardAssetUrls({})).toEqual([]);
    expect(collectPointsCardAssetUrls()).toEqual([]);
  });

  it('custom 皮肤只需要一张，且已经过 CDN 改写', () => {
    const urls = collectPointsCardAssetUrls({ skin: 'custom', imageUrl: CLOUDINARY_URL });
    expect(urls).toHaveLength(1);
    // 原始 Cloudinary 域名在大陆不可达，必须被改写到自建 CDN（见 utils/db-image-url.js）
    expect(urls[0]).not.toContain('res.cloudinary.com');
    expect(urls[0]).toContain('c_limit,w_1280');
  });

  it('custom 但没有 imageUrl 时等同 blank（不预取、不报错）', () => {
    expect(collectPointsCardAssetUrls({ skin: 'custom', imageUrl: '' })).toEqual([]);
  });

  it('cats 皮肤去重后覆盖全部本地猫图', () => {
    const urls = collectPointsCardAssetUrls({ skin: 'cats' });
    expect(urls).toHaveLength(new Set(Object.values(HOME_CAT_ASSETS)).size);
    expect(urls.every((url) => typeof url === 'string' && url.length > 0)).toBe(true);
  });
});

describe('preloadPointsCardAssets', () => {
  it('无图皮肤直接 ready，不产生任何加载', async () => {
    const { loader, calls } = createLoader();
    const result = await preloadPointsCardAssets({ skin: 'blank' }, { loader });
    expect(result).toEqual({ ready: true, failed: [], timedOut: false });
    expect(calls).toEqual([]);
  });

  it('全部就绪 → ready:true', async () => {
    const { loader, calls } = createLoader('ok');
    const result = await preloadPointsCardAssets(
      { skin: 'custom', imageUrl: CLOUDINARY_URL },
      { loader },
    );
    expect(result.ready).toBe(true);
    expect(result.failed).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('单张失败不 reject，而是把失败 URL 报回去（调用方据此降级卡面）', async () => {
    const { loader } = createLoader('fail');
    const result = await preloadPointsCardAssets(
      { skin: 'custom', imageUrl: CLOUDINARY_URL },
      { loader },
    );
    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.failed).toHaveLength(1);
  });

  it('loader 自己抛错也只算失败，绝不冒到调用点', async () => {
    const { loader } = createLoader('throw');
    await expect(
      preloadPointsCardAssets({ skin: 'custom', imageUrl: CLOUDINARY_URL }, { loader }),
    ).resolves.toMatchObject({ ready: false });
  });

  it('预算耗尽 → ready:false 且 timedOut:true（不是 reject）', async () => {
    const { loader } = createLoader('pending');
    const result = await preloadPointsCardAssets(
      { skin: 'custom', imageUrl: CLOUDINARY_URL },
      { loader, budgetMs: 20 },
    );
    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('cats 十张里失败一张，其余仍然继续加载（不是短路）', async () => {
    const seen = [];
    const loader = (url) => {
      seen.push(url);
      return Promise.resolve(url !== HOME_CAT_ASSETS.decor);
    };
    const result = await preloadPointsCardAssets({ skin: 'cats' }, { loader });
    expect(seen).toHaveLength(Object.keys(HOME_CAT_ASSETS).length);
    expect(result.ready).toBe(false);
    expect(result.failed).toHaveLength(1);
  });
});

describe('loadImageDecoded 与模块级缓存', () => {
  const realImage = globalThis.Image;

  beforeEach(() => {
    clearPointsCardAssetCache();
  });

  afterEach(() => {
    if (realImage) globalThis.Image = realImage;
    else delete globalThis.Image;
    vi.restoreAllMocks();
  });

  it('没有 Image 的环境（vitest 的 node 环境）直接判不可绘制，不抛错', async () => {
    delete globalThis.Image;
    await expect(loadImageDecoded('https://example.com/a.png')).resolves.toBe(false);
  });

  it('走 decode() 而不是只等 onload —— 只 load 不算「可绘制」', async () => {
    const decode = vi.fn(() => Promise.resolve());
    let constructed = 0;
    globalThis.Image = class {
      constructor() {
        constructed += 1;
      }
      set src(value) {
        this._src = value;
        // 模拟浏览器：字节到手先触发 onload
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
      decode() {
        return decode();
      }
    };

    const ok = await loadImageDecoded('https://example.com/decode.png');
    expect(ok).toBe(true);
    expect(constructed).toBe(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('同一 URL 第二次预取命中缓存，不重复解码', async () => {
    let constructed = 0;
    globalThis.Image = class {
      constructor() {
        constructed += 1;
      }
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
      decode() {
        return Promise.resolve();
      }
    };

    const target = { skin: 'custom', imageUrl: CLOUDINARY_URL };
    await preloadPointsCardAssets(target);
    await preloadPointsCardAssets(target);
    expect(constructed).toBe(1);
  });

  it('解码失败但字节完整时仍判可绘制（避免整块不播）', async () => {
    globalThis.Image = class {
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
      decode() {
        return Promise.reject(new Error('decode failed'));
      }
    };

    await expect(loadImageDecoded('https://example.com/bad-decode.png')).resolves.toBe(true);
  });

  it('超时兜底：onload 一直不来就判失败，不会永远挂着', async () => {
    globalThis.Image = class {
      set src(value) {
        this._src = value;
      }
      get src() {
        return this._src;
      }
    };

    await expect(loadImageDecoded('https://example.com/hang.png', { timeoutMs: 10 })).resolves.toBe(
      false,
    );
  });
});
