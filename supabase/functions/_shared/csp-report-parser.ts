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
    return body
      .map((item) => (isPlainObject(item) ? item.body : undefined))
      .filter(isPlainObject);
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
  if ('effectiveDirective' in raw || 'documentURL' in raw || 'blockedURL' in raw || 'lineNumber' in raw) {
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
      pick(leaf, ['effective-directive', 'effectiveDirective', 'violated-directive', 'violatedDirective']),
      120,
    ),
    blocked: clip(pick(leaf, ['blocked-uri', 'blockedURL', 'blockedUri']), 300),
    document: clip(pick(leaf, ['document-uri', 'documentURL', 'documentUri']), 300),
    source: clip(pick(leaf, ['source-file', 'sourceFile', 'source_file']), 240),
    line: toLineNumber(pick(leaf, ['line-number', 'lineNumber', 'line_number'])),
    disposition: clip(pick(leaf, ['disposition']), 20),
    format: detectFormat(leaf),
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
