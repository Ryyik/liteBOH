/**
 * db-image-url.js —— 「数据库里存的图片地址 → 可渲染 URL」的单一真源
 *
 * 为什么需要它：数据库的图片列（`activities.image` / `news.image` /
 * `posts.cover_image_url` / `user_photos.url` …）实际混存两种形态：
 *
 *   ① `@/assets/images/xxx.webp` —— 早期用 Vite 别名写的本地资源，
 *      必须经 `getImageUrl()` 映射成打包后带 hash 的 URL，否则 `<img src="@/...">` 必然 404。
 *   ② `https://res.cloudinary.com/<cloud>/image/upload/...` —— Cloudinary 原始地址。
 *      **该域名在中国大陆不可达**，全站统一改写到自建 CDN（`CLOUDINARY_DELIVERY_BASE_URL`，
 *      见 `utils/cloudinary-client.js`）。实测 2026-09-29：
 *        `curl -o /dev/null -w '%{http_code}' https://res.cloudinary.com/...png`        → 000
 *        `curl -o /dev/null -w '%{http_code}' https://cdn.blockofhome.cn/...png`        → 200（1,162,521 B）
 *        加 `f_auto,q_auto:good,w_600` 后同一张图                                       → 200（40,135 B，约 1/29）
 *
 * 只做 `getImageUrl()` 而不做 Cloudinary 改写，形态 ② 就会裂图。
 * 2026-09-29 活动页 id=16/17（八周年、剧本杀）两条裂图即此成因——它们恰好是最新、
 * 排在页面最前面的两张卡，所以一眼就能看见。
 *
 * ⚠️ 顺序固定为「先 getImageUrl，再 Cloudinary 改写」，不可颠倒：
 *   - `getImageUrl` 对 http(s)/data:/blob: 原样直通，只对别名与相对路径做本地解析；
 *   - `getCloudinaryTransformedUrl` 对非 Cloudinary 地址是**恒等变换**（内部走 getCloudinaryDisplayUrl）。
 * 反过来先改写，`@/assets/...` 会被 `new URL()` 抛错吞掉，永远进不了本地解析分支。
 *
 * 收敛进度（2026-09-29）：SmartOverview 与 forum-format 的同类实现已改为调用本模块；
 * `Newsroom/index.vue` 的 `getNewsImageUrl` 与 `Newsroom/NewsDetailPage.vue` 的 `coverUrl`
 * 仍是内联副本（逻辑等价），待后续一并收敛。
 */
import { getImageUrl } from './asset-helper.js';
import { getCloudinaryDisplayUrl, getCloudinaryTransformedUrl } from './cloudinary-client.js';

/** 卡片类封面（列表卡、轨道卡）。活动卡图框 aspect-ratio 为 16/11、宽约 300px，2x 下约 600×412 */
export const DB_CARD_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_640,h_440';

/** 详情类封面（详情岛 / 详情页）。c_limit 只压不拉，避免小图被放大糊掉 */
export const DB_DETAIL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';

/**
 * 方块积分卡卡面（`profiles.points_card_image_url` / `points_card_presets.image_url`）。
 *
 * 为什么单独一档、而且必须 `c_limit` 而不是 `c_fill`：卡面是**用户上传的一整幅画**，
 * 框选区域完全由卡面的 `object-fit: cover` + `aspect-ratio` 决定（卡片 8/5、compact 2.08/1，
 * 两种比例还不一样）。若在 CDN 侧按某个固定框 `c_fill` 预裁，等于把裁切决策提前到服务端，
 * 主体（人脸、文字）容易被砍掉，且换比例时无法回退。故只压不裁，裁切交给 CSS。
 *
 * `w_1280` 的依据：卡面最宽出现在 Profile / 用户中心的通栏布局（约 640px），2x 屏下约 1280。
 */
export const DB_POINTS_CARD_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1280';

/**
 * Cloud+ 相册格子（图库密铺 /「一张图一格」）。
 *
 * 为什么必须单独一档：格子是 78px（竖屏 5 列）~ 200px（宽屏）的方块，而 Cloud+ 落库的是
 * 上传返回的**原图 `secure_url`**（无任何变换），格子此前直接用 `getCloudinaryDisplayUrl`
 * —— 那只是把主机改成自建 CDN，不做尺寸/格式变换。结果是「78px 的格子拉 1200px 的原图」。
 * 实测（2026-10-19，`curl -s -o /dev/null -w '%{size_download}'`，资产
 * `dkqae7j1m/image/upload/v1786894948/boh-points-cards/m6walmpg0whumxmpe4hv.png`）：
 *   原图 1,108,821 B / image/png　→　加本变换后 17,977 B / image/jpeg（约 1/62）。
 * 症状即报障的「相册滚动总是闪白、不流畅」：每格都要下+解码一张百万像素位图。
 *
 * `c_fill` 方形与格子的 `aspect-ratio: 1/1` + `object-fit: cover` 同口径；
 * `w_400` 的依据：竖屏 5 列格宽约 78px、宽屏档格宽上限约 200px，2x 屏下 400 有富余。
 */
export const DB_CLOUD_TILE_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_400,h_400';

/**
 * Cloud+ 相册格子的 LQIP（模糊小图占位）。
 *
 * 与论坛列表同口径（见 utils/api/forum-format.js 的 `FORUM_LIST_LQIP_TRANSFORM`）：
 * 把一张 32px + `e_blur:1500` 的极模糊图铺在格子底下，原图淡入时就不会从「一块近白」
 * 里蹦出来 —— 闪白的观感主要来自**占位色是近白**，而不是加载速度本身。
 */
export const DB_CLOUD_TILE_LQIP_TRANSFORM = 'f_auto,q_1,c_fill,w_32,h_32,e_blur:1500';

/** Cloud+ 条目封面（分享档的卡片列表）。保留原始比例，只压不裁，避免裁切改变卡片几何 */
export const DB_CLOUD_COVER_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_800';

/**
 * 解析数据库图片地址为可直接进 `<img src>` 的 URL。
 * @param {string} rawUrl 数据库原始值（`@/assets/...` / 绝对 http(s) / data: / 空）
 * @param {string} [transform] Cloudinary 变换串；留空则只做 CDN 改写不做尺寸变换
 * @returns {string} 可渲染 URL；输入为空时返回空串（调用方据此走占位，不要渲染空 src 的 img）
 */
export function resolveDbImageUrl(rawUrl, transform = '') {
  const safe = String(rawUrl || '').trim();
  if (!safe) return '';

  // 本地别名 → 打包后 URL；http(s) 等合法地址原样直通
  const resolved = getImageUrl(safe, { silent: true }) || safe;

  return transform
    ? getCloudinaryTransformedUrl(resolved, transform)
    : getCloudinaryDisplayUrl(resolved);
}

/** 卡片尺寸封面 */
export const resolveDbCardImage = (rawUrl) => resolveDbImageUrl(rawUrl, DB_CARD_IMAGE_TRANSFORM);

/** 详情尺寸封面 */
export const resolveDbDetailImage = (rawUrl) =>
  resolveDbImageUrl(rawUrl, DB_DETAIL_IMAGE_TRANSFORM);

/** 方块积分卡卡面（自定义皮肤；blank / cats 皮肤不走这里） */
export const resolveDbPointsCardImage = (rawUrl) =>
  resolveDbImageUrl(rawUrl, DB_POINTS_CARD_IMAGE_TRANSFORM);

/** Cloudinary **原图**地址判定。变换段只能插在 `res.cloudinary.com` 的 `/image/upload/` 之后，
    其余形态（已是自建 CDN 的地址、外链、`@/assets` 本地资源、`data:` / `blob:`）都不该走这层。 */
function isCloudinaryUploadUrl(rawUrl) {
  const safe = String(rawUrl || '').trim();
  if (!safe) return false;
  try {
    const parsed = new URL(safe);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      parsed.pathname.includes('/image/upload/')
    );
  } catch {
    return false;
  }
}

/** Cloud+ 相册格子图 */
export const resolveDbCloudTileImage = (rawUrl) =>
  resolveDbImageUrl(rawUrl, DB_CLOUD_TILE_IMAGE_TRANSFORM);

/** Cloud+ 相册格子占位（LQIP）。非 Cloudinary 地址返回空串 —— 不给本地/blob 图白发一次请求 */
export const resolveDbCloudTileLqip = (rawUrl) =>
  isCloudinaryUploadUrl(rawUrl) ? resolveDbImageUrl(rawUrl, DB_CLOUD_TILE_LQIP_TRANSFORM) : '';

/** Cloud+ 条目封面（分享档卡片） */
export const resolveDbCloudCoverImage = (rawUrl) =>
  resolveDbImageUrl(rawUrl, DB_CLOUD_COVER_IMAGE_TRANSFORM);
