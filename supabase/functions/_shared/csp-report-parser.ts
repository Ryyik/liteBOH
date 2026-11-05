/**
 * CSP 违规上报解析（纯函数，无 Deno 依赖，便于单测）
 *
 * 为什么单独抽出来（2026-11-03 线上取证）：
 *   csp-report 上线后从真实浏览器收到了上报，但日志里是
 *   `{"directive":"","blocked":"","document":"","source":"","line":null,"disposition":"report"}`
 *   —— 只有 disposition 有值，其余全空。
 *
 *   原因：浏览器有两条上报通道，字段命名完全不同。
 *     · report-uri（legacy，Content-Type: application/csp-report）
 *         {"csp-report":{"document-uri":…,"blocked-uri":…,"violated-directive":…,"line-number":…}}
 *     · report-to（Reporting API，Content-Type: application/reports+json）
 *         [{"type":"csp-violation","body":{"documentURL":…,"blockedURL":…,"effectiveDirective":…,"lineNumber":…}}]
 *   原实现只认连字符键名，而 `disposition` 两种写法同名 —— 于是「只有它填上了」。
 *   这类漏读不会报错、不会 4xx，只会让可观测性静默失效，正因如此必须两种都认。
 *
 * 两条通道都可能到达（我们同时下发了 report-uri 与 report-to），故两者都要覆盖。
 */

/** body 上限：超过即丢弃，避免匿名端点被当成日志放大通道 */
export const MAX_BODY_BYTES = 8 * 1024;

export type CspReportFormat = 'legacy' | 'reporting-api' | 'unknown';

export type NormalizedCspReport = {
  directive: string;
  blocked: string;
  document: string;
  source: string;
  line: number | null;
  disposition: string;
  format: CspReportFormat;
  /**
   * 报告对象的键名清单（只有键名，不含值）。
   * 为什么保留它：本轮就是因为「字段全空却不报错」才排查了很久 ——
   * 有键名清单的话，一条上报就能自证形状，不必再猜是驼峰还是连字符、
   * 也不必反复发版。键名不含用户数据，无隐私风险。
   */
  keys: string;
};

/** 单字段截断：既防日志膨胀，也防把控制字符注进日志行 */
export const clip = (value: unknown, max = 300): string => {
  const text = String(value ?? '');
  // 换行会伪造日志行，统一压平成空格
  return text.replace(/[\r\n\t]+/g, ' ').slice(0, max);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** 按优先级取第一个「有内容」的键 —— 同一语义不同通道的键名都列在这里 */
const pick = (raw: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined || value === null || value === '') continue;
    return value;
  }
  return undefined;
};

const toLineNumber = (value: unknown): number | null => {
  const line = Number(value);
  return Number.isFinite(line) && line > 0 ? line : null;
};

/**
 * 从任意上报载荷里取出「报告对象」数组。
 * 兼容三种形态：
 *   1. legacy report-uri：{ "csp-report": {…} }
 *   2. Reporting API 批量：  [ { type, body: {…} }, … ]
 *   3. 单个 Reporting API 报告：{ type, body: {…} }
 */
export const extractRawReports = (body: unknown): Record<string, unknown>[] => {
  if (!body || typeof body !== 'object') return [];

  if (Array.isArray(body)) {
    return body.map((item) => (isPlainObject(item) ? item.body : undefined)).filter(isPlainObject);
  }

  const record = body as Record<string, unknown>;
  const legacy = record['csp-report'];
  if (isPlainObject(legacy)) return [legacy];

  if (isPlainObject(record.body)) return [record.body];

  // 兜底：调用方直接发了一个裸报告对象
  const hasKnownKey = [
    'document-uri',
    'documentURL',
    'effective-directive',
    'effectiveDirective',
    'violated-directive',
    'blocked-uri',
    'blockedURL',
  ].some((key) => key in record);
  return hasKnownKey ? [record] : [];
};

const detectFormat = (raw: Record<string, unknown>): CspReportFormat => {
  if (
    'effectiveDirective' in raw ||
    'documentURL' in raw ||
    'blockedURL' in raw ||
    'lineNumber' in raw
  ) {
    return 'reporting-api';
  }
  if ('document-uri' in raw || 'effective-directive' in raw || 'violated-directive' in raw) {
    return 'legacy';
  }
  return 'unknown';
};

const reportRefs = (raw: Record<string, unknown>): Record<string, unknown>[] => {
  // Reporting API 里违规点可能挂在 body.reports 下（嵌套批量上报）
  const nested = raw.reports;
  return Array.isArray(nested) ? nested.filter(isPlainObject) : [raw];
};

/** 把一条原始报告压成可安全落日志的固定结构 */
export const normalizeReport = (raw: Record<string, unknown>): NormalizedCspReport => {
  const leaf = reportRefs(raw)[0] ?? raw;
  return {
    directive: clip(
      pick(leaf, [
        'effective-directive',
        'effectiveDirective',
        'violated-directive',
        'violatedDirective',
      ]),
      120,
    ),
    blocked: clip(pick(leaf, ['blocked-uri', 'blockedURL', 'blockedUri']), 300),
    document: clip(pick(leaf, ['document-uri', 'documentURL', 'documentUri']), 300),
    source: clip(pick(leaf, ['source-file', 'sourceFile', 'source_file']), 240),
    line: toLineNumber(pick(leaf, ['line-number', 'lineNumber', 'line_number'])),
    disposition: clip(pick(leaf, ['disposition']), 20),
    format: detectFormat(leaf),
    keys: clip(Object.keys(leaf).slice(0, 12).join(','), 200),
  };
};

/** 一步到位：载荷 → 归一化报告列表（最多 limit 条，防批量灌注） */
export const parseCspReports = (body: unknown, limit = 5): NormalizedCspReport[] => {
  const raws = extractRawReports(body);
  const out: NormalizedCspReport[] = [];
  for (const raw of raws) {
    for (const item of reportRefs(raw)) out.push(normalizeReport(item));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
};

/**
 * 浏览器给 `blocked-uri` 的特殊关键字（不是 URL）。
 * 这几个值的含义是「被拦的是内联脚本 / eval / data: 资源」，本身就是要观察的重点，
 * 不能当成 URL 去取 host（会变成空字符串，全被归进同一个 unknown 桶）。
 */
const BLOCKED_KEYWORDS = new Set([
  'inline',
  'eval',
  'data',
  'blob',
  'filesystem',
  'wasm-eval',
  'self',
  'none',
]);

/**
 * `blocked-uri` → 可用于聚合的来源标识。
 * 目的：把「同一个第三方域名」的上报收敛成一行，而不是每条 URL 各占一行。
 */
export const toBlockedHost = (value: unknown, max = 160): string => {
  const text = clip(value, 300).trim();
  if (!text) return 'unknown';

  const lower = text.toLowerCase();
  if (BLOCKED_KEYWORDS.has(lower)) return lower;

  try {
    const url = new URL(text);
    if (url.host) return clip(url.host, max);
    const protocol = url.protocol.replace(/:$/, '');
    return clip(protocol || 'unknown', max);
  } catch {
    // 不是绝对 URL：原样保留（截断），至少还能看出是哪个来源
    return clip(lower, max);
  }
};

/**
 * `document-uri` → 只保留路径。
 *
 * ⚠️ 这是隐私边界，不是格式化：
 *   报告的 document-uri 是完整 URL，**查询串里可能带分享 token、邀请码、邮箱确认链接**。
 *   原样入库等于把用户凭证写进一张「所有人都可能来查」的台账。
 *   ⇒ 这里必须剥掉 `?` 之后的部分，别在图省事把它挪到 SQL 里做。
 *
 * 非 http(s) 的（about:blank、chrome-extension:// 等）只保留协议：
 *   扩展 URL 里带扩展 ID，属于浏览器指纹的一部分，没有留存价值。
 */
export const toPathOnly = (value: unknown, max = 200): string => {
  const text = clip(value, 300).trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return clip(url.pathname || '/', max);
    }
    return clip(url.protocol.replace(/:$/, ''), max);
  } catch {
    return clip(text.split('?')[0].split('#')[0], max);
  }
};

/** 落库行：与 `public.csp_violations` 的列一一对应（天由数据库算，不传） */
export type CspLedgerRow = {
  directive: string;
  blocked_host: string;
  disposition: string;
  document_path: string;
  format: CspReportFormat;
};

export const toLedgerRow = (report: NormalizedCspReport): CspLedgerRow => ({
  directive: report.directive || 'unknown',
  blocked_host: toBlockedHost(report.blocked),
  disposition: report.disposition || 'report',
  document_path: toPathOnly(report.document),
  format: report.format,
});
