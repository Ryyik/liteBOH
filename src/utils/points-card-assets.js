/**
 * points-card-assets.js —— 积分卡卡面资源「可绘制就绪」判定的单一真源
 *
 * 为什么需要它（2026-10-29 签到 3D 舞台）：
 * 签到成功后要把用户自己的卡面转起来。卡面有三种皮肤：
 *   - `blank`  —— 无图，纯 CSS 底色
 *   - `cats`   —— 本地打包的 10 张 webp（`HOME_CAT_ASSETS`）
 *   - `custom` —— `profiles.points_card_image_url`，经 `resolveDbPointsCardImage()` 改写
 *                成自建 CDN + `c_limit,w_1280`（原始 Cloudinary 域名大陆不可达，见 db-image-url.js）
 *
 * ⚠️ 关键口径：`img.onload` 只代表**字节到手**，不代表**可绘制**。解码发生在首次绘制，
 * 1280px 的卡面图在低端机上会让旋转动画的第一帧直接卡掉（表现为「先闪一下白框再开始转」）。
 * 所以这里等的是 `img.decode()`，不是 `onload`。
 *
 * ⚠️ 第二条口径：**超时不 reject**。签到积分已经到账了，动画晚到可以、降级可以，
 * 但不能因为图片挂了就把成功反馈吞掉。调用方拿 `ready:false` 自行决定降级（换成 blank 卡面）。
 */

import { HOME_CAT_ASSETS } from './home-cat-theme.js';
import { resolveDbPointsCardImage } from './db-image-url.js';

/** 预算：从「点击」到「起播」最多等这么久，超时降级起播 */
export const DEFAULT_PRELOAD_BUDGET_MS = 1500;

/** 单张图的硬超时（预算是外层 race，这个是单个 URL 的自保） */
const DEFAULT_IMAGE_TIMEOUT_MS = 8000;

/**
 * 某套卡面需要预取的图片 URL 列表（纯函数，无 DOM 依赖 —— 单测直接打这里）。
 * @param {{ skin?: string, imageUrl?: string }} target
 * @returns {string[]}
 */
export function collectPointsCardAssetUrls({ skin, imageUrl } = {}) {
  if (skin === 'cats') {
    return [...new Set(Object.values(HOME_CAT_ASSETS).filter(Boolean))];
  }
  if (skin === 'custom' && imageUrl) {
    const resolved = resolveDbPointsCardImage(imageUrl);
    return resolved ? [resolved] : [];
  }
  // blank：无图；custom 但没有 url：等同 blank
  return [];
}

/**
 * 载入并解码一张图。永不 reject —— 失败/超时都 resolve false。
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} 是否**可绘制**
 */
export function loadImageDecoded(url, { timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS } = {}) {
  if (!url) return Promise.resolve(false);
  if (typeof Image === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };

    timer = setTimeout(() => finish(false), timeoutMs);

    const img = new Image();
    img.onload = () => {
      // decode() 不可用（老 Firefox）时退回 onload 语义
      if (typeof img.decode !== 'function') {
        finish(true);
        return;
      }
      img
        .decode()
        .then(() => finish(true))
        .catch(() => {
          // 解码失败但字节完整时，绘制仍可能成功；不因此判定「资源没准备好」
          finish(true);
        });
    };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/**
 * 模块级缓存：url → Promise<boolean>。
 * 缓存的是 **Promise 而不是结果**，所以并发调用天然去重（cats 10 张图不会因为
 * 两次签到被下载两遍）。失败不留在缓存里 —— 下次还能重试。
 */
const decodedCache = new Map();

/** 仅供单测使用：清空缓存，避免用例互相污染 */
export function clearPointsCardAssetCache() {
  decodedCache.clear();
}

function loadWithCache(url, options) {
  if (decodedCache.has(url)) return decodedCache.get(url);
  const task = loadImageDecoded(url, options).then((ok) => {
    if (!ok) decodedCache.delete(url);
    return ok;
  });
  decodedCache.set(url, task);
  return task;
}

/**
 * 预取一套卡面，最多等 `budgetMs`。
 *
 * @param {{ skin?: string, imageUrl?: string }} target
 * @param {{
 *   budgetMs?: number,
 *   timeoutMs?: number,
 *   loader?: (url: string, options?: object) => Promise<boolean>
 * }} [options] loader 可注入（单测用），注入时不走模块缓存
 * @returns {Promise<{ ready: boolean, failed: string[], timedOut: boolean }>}
 *   - ready=true  全部可绘制
 *   - ready=false 且 timedOut=true：预算内没等到 → 调用方降级起播
 *   - ready=false 且 failed 非空：确实有图失败 → 调用方降级起播
 */
export async function preloadPointsCardAssets(target, options = {}) {
  const {
    budgetMs = DEFAULT_PRELOAD_BUDGET_MS,
    timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
    loader,
  } = options;

  const urls = collectPointsCardAssetUrls(target);
  if (urls.length === 0) return { ready: true, failed: [], timedOut: false };

  const load = loader || ((url, opts) => loadWithCache(url, opts));
  const all = Promise.all(
    urls.map((url) =>
      load(url, { timeoutMs })
        .then((ok) => ({ url, ok }))
        // loader 自己不该 reject，但注入方可能抛 —— 一律当失败，绝不让它冒到调用点
        .catch(() => ({ url, ok: false })),
    ),
  );

  let timer = 0;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });

  const settled = await Promise.race([all, budget]);
  if (timer) clearTimeout(timer);

  if (!settled) return { ready: false, failed: [], timedOut: true };

  const failed = settled.filter((item) => !item.ok).map((item) => item.url);
  return { ready: failed.length === 0, failed, timedOut: false };
}
