/**
 * CSP 违规上报接收端点
 *
 * 为什么需要它（2026-11-03 安全复审，P1）：
 *   `scripts/cloudflare-security-headers.mjs` 下发的 CSP 一直是
 *   `Content-Security-Policy-Report-Only`，但 **没有任何 report-to / report-uri**。
 *   按 CSP3 规范，没有上报端点时浏览器会直接丢弃违规报告 ——
 *   也就是说这套 CSP 跑了两个月，一条违规都没被观测到，
 *   因而永远无法把 `'unsafe-inline'` 换掉、永远转不了 enforce。
 *
 * 设计约束（这是**匿名可写**端点，必须限制滥用面）：
 *   1. 不写数据库 —— 只 console.log，零存储增长，不会变成资源消耗通道
 *   2. 单 IP 30 次/分钟（复用 check_rate_limit）
 *   3. body 上限 8 KB，超限直接 204
 *   4. 只提取白名单字段并逐个截断，防日志注入与日志膨胀
 *   5. 任何异常都吞掉并返回 204：上报端点自己绝不能成为故障源
 *
 * 部署：本函数必须关掉 JWT 校验（浏览器上报不带 Authorization）：
 *   supabase functions deploy csp-report --no-verify-jwt
 *
 * 看报告：Supabase Dashboard → Edge Functions → csp-report → Logs，
 *   检索 `[csp-report]` 即可。
 */

import { buildCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';

const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

/** 单字段截断：既防日志膨胀，也防把控制字符注进日志行 */
const clip = (value: unknown, max = 300): string => {
  const text = String(value ?? '');
  // 换行会伪造日志行，统一压平成空格
  return text.replace(/[\r\n\t]+/g, ' ').slice(0, max);
};

const emptyResponse = (origin: string | null) =>
  new Response(null, { status: 204, headers: buildCorsHeaders(origin) });

type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'effective-directive'?: string;
  'blocked-uri'?: string;
  'source-file'?: string;
  'line-number'?: number;
  disposition?: string;
};

/** 兼容两种上报格式：application/csp-report 与 application/reports+json */
const extractReports = (body: unknown): CspReport[] => {
  if (!body) return [];
  if (Array.isArray(body)) {
    return body
      .map((item: any) => (item && typeof item === 'object' ? item.body : null))
      .filter(Boolean) as CspReport[];
  }
  if (typeof body === 'object') {
    const legacy = (body as any)['csp-report'];
    if (legacy && typeof legacy === 'object') return [legacy as CspReport];
    const nested = (body as any).body;
    if (nested && typeof nested === 'object') return [nested as CspReport];
  }
  return [];
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: buildCorsHeaders(origin) });
  }

  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    // 匿名端点：限流是唯一防线。超限静默丢弃（浏览器不关心响应体）。
    const rateCheck = await checkRateLimitDb(clientIp, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateCheck.ok) return emptyResponse(origin);

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return emptyResponse(origin);

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyResponse(origin);
    }

    const reports = extractReports(parsed);
    for (const report of reports.slice(0, 5)) {
      console.log('[csp-report]', JSON.stringify({
        directive: clip(report['effective-directive'] || report['violated-directive'], 120),
        blocked: clip(report['blocked-uri'], 300),
        document: clip(report['document-uri'], 300),
        source: clip(report['source-file'], 240),
        line: Number(report['line-number']) || null,
        disposition: clip(report.disposition, 20),
      }));
    }
  } catch (error) {
    // 上报端点自身绝不报错给浏览器：静默吞掉，最多留一行诊断
    console.error('[csp-report] handler failed:', error instanceof Error ? error.message : 'unknown');
  }

  return emptyResponse(origin);
});
