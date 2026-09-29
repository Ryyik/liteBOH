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
