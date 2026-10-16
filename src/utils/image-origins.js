/**
 * image-origins.js —— **图片域名白名单的单一真源**
 *
 * 为什么要有这个文件：同一份「哪些域名能出图」的知识原本散在两处，改一处漏一处就会
 * 出现**静默裂图**（渲染器放行但 CSP 拦截，或反之），而这类问题在本地开发环境
 * （CSP 当前是 Report-Only）根本看不出来。所以收敛成一处，由单测锁住包含关系。
 *
 * 两个消费方：
 *   ① CSP `img-src` —— `scripts/cloudflare-security-headers.mjs`
 *   ② AI 回答的渲染白名单 —— `views/BOHAI/BOHAI/components/boh-markdown.js`
 *
 * 两个清单**刻意不同**，不是笔误：
 *   - `CSP_IMAGE_ORIGINS` 是**页面级外边界**（还要覆盖头像、论坛封面、活动图等所有历史数据），
 *     必须留 `res.cloudinary.com` —— 库里仍存着 Cloudinary 原址。
 *   - `AI_ANSWER_IMAGE_ORIGINS` 是**更窄的策略**，只放行自建 CDN。
 *
 * 为什么 AI 回答不放行 `res.cloudinary.com`（实测记录见 `utils/db-image-url.js` 头部）：
 *   该域名**中国大陆不可达**（`curl` 实测 000），而 `cdn.blockofhome.cn` 返回 200。
 *   模型回答里给用户一张**裂图**，比不给图更糟 —— 所以这里宁可不出图。
 *   正常链路也不会踩到：`utils/api/forum-format.js` 的 `normalizePostListRecord`
 *   已把 `cover_image_url` 统一改写为 CDN 地址，进上下文的本来就是 CDN URL。
 */

/** 页面级允许的图片来源（CSP `img-src` 用）。顺序不重要，内容即真源。 */
export const CSP_IMAGE_ORIGINS = ['https://res.cloudinary.com', 'https://cdn.blockofhome.cn'];

/**
 * AI 回答里允许出现的图片来源（`CSP_IMAGE_ORIGINS` 的**子集**）。
 * ⚠️ 必须保持子集关系：单测 `ai-answer-image-policy.test.js` 会断言，放宽时要一并想清楚 CSP。
 */
export const AI_ANSWER_IMAGE_ORIGINS = ['https://cdn.blockofhome.cn'];

/** 内联图片（本地预览、粘贴上传的临时图）允许；只认图片 MIME，避免 `data:text/html`。 */
const DATA_IMAGE_URI_PATTERN = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,/i;
const BLOB_URI_PATTERN = /^blob:/i;

/**
 * 判断一个 `img[src]` 是否可渲染。
 *
 * 拒绝规则（按顺序）：
 *   - 空值 / 非字符串
 *   - `//host/x`（协议相对地址）：会指向任意外域，`new URL()` 也会因缺少 base 而抛错
 *   - 非 `https:` 协议（`http:`、`javascript:`、`file:` …）
 *   - 解析出的 origin 不在白名单里（`new URL` 会把 `https://cdn.blockofhome.cn@evil.com/x`
 *     的 host 正确解析为 `evil.com` ⇒ 天然挡住 userinfo 伪装）
 *
 * 放行：同源绝对路径（`/xxx.webp`）、`data:image/*;base64,`、`blob:`、白名单 origin。
 *
 * @param {unknown} src
 * @param {string[]} [origins] 允许的 origin 列表，默认 AI 回答白名单
 * @returns {boolean}
 */
export const isAllowedImageSrc = (src, origins = AI_ANSWER_IMAGE_ORIGINS) => {
  const value = String(src ?? '').trim();
  if (!value) return false;
  if (DATA_IMAGE_URI_PATTERN.test(value) || BLOB_URI_PATTERN.test(value)) return true;
  // 协议相对地址（`//evil.com/x`）必须先挡：它不是同源路径，也不能当相对路径解析
  if (value.startsWith('//')) return false;
  // 同源绝对路径
  if (value.startsWith('/')) return true;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    // 相对路径（`a.webp`）与畸形值一律拒绝：AI 回答里的图片必须是可验证来源
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return Array.isArray(origins) && origins.includes(parsed.origin);
};
