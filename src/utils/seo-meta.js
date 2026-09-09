/**
 * seo-meta —— SPA 内动态注入 document.title 与 Open Graph / Twitter meta。
 *
 * 背景：站点为 hash 路由 SPA，index.html 只有一份静态 head。独立详情路由
 * （如 /news/:id）挂载时用本工具把标题/摘要/封面写入 head，使站内分享
 * （支持执行 JS 的客户端）与浏览器标签页获得正确的标题与预览。
 *
 * 边界（诚实声明）：不执行 JS 的爬虫抓到的仍是 index.html 静态 head——
 * 逐篇内容的爬虫级 OG 需要服务端/Edge Function 按 slug 输出 HTML，
 * 见 BETA 6 计划书 C3 的 gen-seo 后续项；本工具先把「页内体验 + 可执行
 * JS 场景的分享卡」补齐。
 */

const upsertMeta = (attrName, attrValue, content) => {
  if (typeof document === 'undefined' || content === undefined || content === null) return;
  const safe = String(content);
  const selector = `meta[${attrName}="${attrValue}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', safe);
};

/**
 * 应用一组 SEO/分享 meta。
 * @param {object} options
 * @param {string} options.title       文档标题（同时写 <title> 与 og:title）
 * @param {string} [options.description] 摘要（og:description / twitter:description / meta description）
 * @param {string} [options.image]     封面图绝对 URL（og:image / twitter:image）
 * @param {string} [options.url]       规范链接（og:url）
 */
export const applySeoMeta = ({ title, description = '', image = '', url = '' } = {}) => {
  if (typeof document === 'undefined') return;
  if (title) document.title = title;

  upsertMeta('property', 'og:title', title || '');
  upsertMeta('property', 'og:type', 'article');
  upsertMeta('property', 'og:description', description);
  if (image) upsertMeta('property', 'og:image', image);
  if (url) upsertMeta('property', 'og:url', url);

  upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', title || '');
  upsertMeta('name', 'twitter:description', description);
  if (image) upsertMeta('name', 'twitter:image', image);
  if (description) upsertMeta('name', 'description', description);
};
