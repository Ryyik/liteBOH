import createDOMPurify from 'dompurify';
import { isAllowedImageSrc } from './image-origins.js';

const purifier = typeof window !== 'undefined' ? createDOMPurify(window) : null;

/**
 * `img[src]` 白名单钩子（2026-10-16，为「AI 回答图文并茂」加）。
 *
 * 为什么必须在**这里**校验、而不是在 markdown 渲染器里：
 *   `marked` 会原样透传模型输出里的**裸内联 HTML**（`<img src=x>` 不走 `renderer.image`），
 *   所以渲染器侧过滤能被绕过。DOMPurify 才是安全边界，校验必须落在它这一层。
 *
 * 为什么用钩子而不是 `ALLOWED_URI_REGEXP`：
 *   那个选项是**全局**的，会连带把 `<a href>` 也限制成只允许图片域名 ——
 *   而 AI 回答必须能引用任意外部来源链接（引用 [W1] 等）。所以只能按标签区分。
 *
 * 为什么读取 `config.allowedImageOrigins` 而不是模块常量：
 *   同一个 purifier 实例被全站共用；只有**显式声明**了白名单的调用方
 *   （目前只有 `boh-markdown.js`）才受此约束，其他消费方行为逐字不变。
 */
if (purifier) {
  purifier.addHook('afterSanitizeAttributes', (node, _data, config) => {
    const origins = config?.allowedImageOrigins;
    if (!Array.isArray(origins) || origins.length === 0) return;
    if (!node || String(node.tagName || '').toUpperCase() !== 'IMG') return;

    const src = typeof node.getAttribute === 'function' ? node.getAttribute('src') : '';
    if (isAllowedImageSrc(src, origins)) return;

    if (typeof node.remove === 'function') node.remove();
    else node.parentNode?.removeChild(node);
  });
}

const escapeHtml = (text) =>
  String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const DOMPurify = {
  sanitize(input, options = {}) {
    if (!purifier) {
      // SSR/非浏览器环境兜底，确保不回传原始 HTML。
      return escapeHtml(input);
    }
    return purifier.sanitize(String(input ?? ''), options);
  },
};

export default DOMPurify;
