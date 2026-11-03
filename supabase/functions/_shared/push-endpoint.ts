/**
 * Web Push 端点的出站白名单（2026-11-03 B3）
 *
 * 为什么需要：
 *   `push_subscriptions.endpoint` 是**用户可写**的（浏览器订阅后前端 insert）。
 *   `push-send` 会拿它直接 `fetch`（经 @negrel/webpush）—— 这是全站唯一一个
 *   「出站目标由用户决定」的入口。没有白名单时，一个登录用户可以把 endpoint
 *   填成 `https://10.0.0.1/...` 或云厂商 metadata 地址，让 Edge Function 的
 *   网络位置替他做内网探测（SSRF）。虽然推送协议要 VAPID 签名、回包内容拿不到
 *   （盲 SSRF），但「请求是否到达 / 耗时差」已经足够做端口与主机探测。
 *
 * 为什么用「域名白名单」而不是「禁内网 IP」：
 *   禁内网要枚举 RFC1918 / link-local / IPv6 ULA / 各种十进制与八进制写法，
 *   DNS 重绑定还能绕过。正向白名单只允许已知推送服务，漏一个域名最多是
 *   「某小众浏览器收不到推送」（可见、可加），而不是「内网被探测」（不可见）。
 *
 * ⚠️ 这份名单必须与 `public.is_allowed_push_endpoint()`（迁移 2026110315）保持一致：
 *    EF 侧过滤历史脏数据，DB 侧阻止新脏数据写入。两处不一致会出现
 *    「能订阅但永远发不出去」的静默故障。tests/unit/push-endpoint-guard.test.js
 *    交叉断言两份名单。
 */

/** 精确匹配的端点主机（主流浏览器推送服务的固定入口）。 */
export const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome / Edge(Chromium) / Opera / Samsung Internet
  'android.googleapis.com', // 旧版 Android WebView
  'web.push.apple.com', // Safari（macOS / iOS PWA）
];

/** 后缀匹配的端点主机（各家会按分片给不同子域，无法穷举）。 */
export const ALLOWED_PUSH_HOST_SUFFIXES = [
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com', // Edge（WNS 分片，wns2-xxx 之类）
  '.push.apple.com', // Apple 其他分片
];

/** endpoint 长度上限：真实端点在 200~400 字符量级，2048 足够宽松。 */
const MAX_ENDPOINT_LENGTH = 2048;

/**
 * 判断一个推送 endpoint 是否允许作为出站目标。
 * 纯函数，不碰网络 —— 便于单测与反证。
 */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') return false;
  const raw = endpoint.trim();
  if (!raw || raw.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  // 只允许 https；带 userinfo 或非 443 端口的 URL 一律拒绝（避免
  // `https://fcm.googleapis.com@evil.com/` 这类把可信域名塞进 userinfo 的写法）
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase();
  if (ALLOWED_PUSH_HOSTS.includes(host)) return true;

  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}
