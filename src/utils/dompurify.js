import createDOMPurify from 'dompurify';

const purifier = typeof window !== 'undefined' ? createDOMPurify(window) : null;

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
  }
};

export default DOMPurify;
