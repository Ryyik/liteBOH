/**
 * 安全响应头的**单一真源**（注入侧与断言侧共用）
 *
 * ## 为什么要有这个文件
 *
 * 安全头有两条消费路径，它们必须永远说的是同一件事：
 *   1. `scripts/cloudflare-security-headers.mjs` —— 往 Cloudflare Zone 注入
 *   2. `scripts/check-security-headers-live.mjs` —— 发布后向线上断言
 *
 * 两边各写一份清单的后果是**静默分叉**：注入侧删了一个头，断言侧还在按旧清单
 * 校验（永远绿）；或者注入侧改了值，断言侧正则不认（永远红）。2026-11-03 外部
 * 审查的 F8 正是这一类 —— 头丢了，CI 全绿，没人知道。
 * ⇒ 所以「有哪些头、值长什么样、CSP 必须有哪几条指令」只允许在这里定义一次。
 *
 * ## 与 CSP_IMAGE_ORIGINS 的关系
 *
 * `img-src` 的域名清单不在本文件里硬编码 —— 由调用方传入（真源仍是
 * `src/utils/image-origins.js`）。原因见 `cloudflare-security-headers.mjs` 的
 * 文件头：渲染白名单与 CSP 必须同源，两处手写必然漂移，而漂移的表现是
 * 「渲染器放行、CSP 拦截」的静默裂图。
 *
 * ## 改这里会怎样
 *
 * - 加头/改值 ⇒ 下一次 `deploy.yml` 发布时自动注入，同时发布后探测按新清单断言。
 * - 删头 ⇒ 探测侧会跟着少校验一条。**删之前先确认它真的不需要了**，
 *   因为这时门禁不会替你拦。
 */

export const CSP_REPORT_GROUP = 'csp-endpoint';

/**
 * 零风险四件套 + HSTS + Reporting-Endpoints。
 * 只收紧默认行为，不拦截任何现有资源，可随时上/随时撤。
 */
export const buildSafeHeaders = (cspReportUri) => ({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Reporting API 的端点声明：Chrome 系通过 `report-to` 走这里
  'Reporting-Endpoints': `${CSP_REPORT_GROUP}="${cspReportUri}"`,
});

/**
 * CSP 必须存在的指令。
 *
 * 断言侧用它做「指令级」校验（而不是逐字比对整串）：整串比对会在每次
 * 调整域名清单时把门禁染红，指令级则只关心「这条约束还在不在」。
 *
 * ⚠️ `report-uri` / `report-to` 在 enforce 之后依然必须保留 —— 否则违规
 * 会被浏览器静默丢弃，等于回到 2026-11-03 之前那种「跑着 CSP 但一无所知」。
 */
export const CSP_REQUIRED_DIRECTIVES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-ancestors',
  'base-uri',
  'form-action',
  'object-src',
  'report-uri',
  'report-to',
];

/**
 * @param {{ cspReportUri: string, imageOrigins: string[] }} opts
 */
export const buildCspValue = ({ cspReportUri, imageOrigins }) =>
  [
    "default-src 'self'",
    // ⚠️ script-src 里**不再有 'unsafe-inline'**（2026-11-05）。
    //
    // 它唯一的来源是 index.html 的 4 段内联启动脚本，已全部外置到 public/boot.js。
    // 只要那条还在，CSP 对注入型 XSS 就没有边界 —— 攻击者注入的 <script> 同样被放行，
    // 等于把 CSP 最大的价值让掉了。
    //
    // static.cloudflareinsights.com：Zone 级 Web Analytics 由 Cloudflare 边缘自动注入，
    // 不是项目代码引入的。放行它只为消掉一条已证实的上报（2026-11-03），
    // 该脚本被拦不影响任何功能，只丢访问统计。
    //
    // ⚠️ 已知待观察：Cloudflare 的自动注入若以内联形式出现，去掉 unsafe-inline 后
    // 它会开始出现在违规报告里。当前 CSP 是 Report-Only，不拦截，所以先观察——
    // 若确实是它，再改成手动 beacon（外链 script，不需要 unsafe-inline）。
    "script-src 'self' https://static.cloudflareinsights.com",
    // style-src 的 'unsafe-inline' 仍保留：index.html 的内联骨架 <style> 还在
    // （它必须早于所有 CSS 生效，外置会引入一次渲染阻塞往返）。下一批用 hash 收敛。
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${imageOrigins.join(' ')}`,
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.cloudinary.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // 上报：report-uri 覆盖 Safari/Firefox，report-to 覆盖 Chrome（配 Reporting-Endpoints）
    `report-uri ${cspReportUri}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');

/**
 * 完整头集合。`cspEnforce` 决定用 enforcing 还是 Report-Only 头名 ——
 * 这是全站唯一的「CSP 当前处于哪个模式」的判定点。
 *
 * @param {{ cspEnforce: boolean, cspReportUri: string, imageOrigins: string[] }} opts
 */
export const buildSecurityHeaders = ({ cspEnforce, cspReportUri, imageOrigins }) => {
  const headers = buildSafeHeaders(cspReportUri);
  headers[cspEnforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'] =
    buildCspValue({ cspReportUri, imageOrigins });
  return headers;
};

/** 小写化的头名，供探测侧做大小写无关匹配 */
export const SECURITY_HEADER_NAMES = Object.keys(
  buildSecurityHeaders({ cspEnforce: false, cspReportUri: 'x', imageOrigins: [] }),
).map((name) => name.toLowerCase());
