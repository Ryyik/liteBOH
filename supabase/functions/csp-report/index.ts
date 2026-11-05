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
 *   1. 写库，但**只写按天聚合的行**（2026-11-05 起）—— 按
 *      「天 × 指令 × 来源域名 × disposition」归并累加 hits，行数由「不同来源的基数」
 *      决定、与请求数解耦，所以它不会变成资源消耗通道。
 *      刻意**不存原始明细**：匿名端点的存储增长必须隔离开流量，否则就是白送的放大器。
 *   2. 单 IP 30 次/分钟（复用 check_rate_limit）
 *   3. body 上限 8 KB，超限直接 204
 *   4. 只提取白名单字段并逐个截断，防日志注入与日志膨胀
 *   5. 任何异常都吞掉并返回 204：上报端点自己绝不能成为故障源
 *      （**包括落库失败** —— DB 抖动时宁可丢统计，也不能让浏览器拿到 5xx）
 *
 * 部署：本函数必须关掉 JWT 校验（浏览器上报不带 Authorization）：
 *   supabase functions deploy csp-report --no-verify-jwt
 *
 * 看实时报告：Supabase Dashboard → Edge Functions → csp-report → Logs，
 *   检索 `[csp-report]` 即可；`format` 字段标明本次走的是 report-uri(legacy)
 *   还是 report-to(reporting-api)。
 * 看台账：`public.csp_violations`（90 天保留，`prune_csp_violations` 每日清理）。
 *   ⚠️ 只有 admin 能读；`document_path` 已剥掉查询串，别在别处补回完整 URL。
 *
 * 2026-11-03 线上取证修正：
 *   上线后确实收到了真实浏览器的上报（POST 204），但解析结果里
 *   directive/blocked/document/source 全空、只有 disposition 有值。
 *   根因是 report-to 通道用驼峰键名（documentURL / effectiveDirective …），
 *   而实现只认连字符键名。解析逻辑已抽到 `_shared/csp-report-parser.ts`
 *   并同时支持两种命名，配套单测见 tests/unit/csp-report-parser.test.js。
 */

import { buildCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { getClientIp } from '../_shared/client-ip.ts';
import {
  MAX_BODY_BYTES,
  parseCspReports,
  toLedgerRow,
  type CspLedgerRow,
} from '../_shared/csp-report-parser.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const emptyResponse = (origin: string | null) =>
  new Response(null, { status: 204, headers: buildCorsHeaders(origin) });

/**
 * 把一批报告累加进 `public.csp_violations`。
 *
 * 失败**只留诊断、不上抛**：这个端点的契约是「永远 204」。
 * 浏览器虽然不看响应体，但 5xx 会在控制台留一条网络错误 —— 用户会以为是站点坏了，
 * 而实际上只是统计没写进去。丢统计可接受，丢用户体验不可接受。
 */
const recordViolations = async (rows: CspLedgerRow[]) => {
  try {
    const serviceClient = createServiceClient();
    const { error } = await serviceClient.rpc('record_csp_violations', { p_rows: rows });
    if (error) {
      console.error('[csp-report] 台账写入失败:', error.message || 'unknown');
    }
  } catch (error) {
    console.error('[csp-report] 台账写入异常:', error instanceof Error ? error.message : 'unknown');
  }
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
    // 匿名端点的唯一防线就是这条限流 ⇒ IP 必须取不可伪造的那一段
    const clientIp = getClientIp(request);

    // 匿名端点：限流是唯一防线。超限静默丢弃（浏览器不关心响应体）。
    const rateCheck = await checkRateLimitDb(
      clientIp,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rateCheck.ok) return emptyResponse(origin);

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return emptyResponse(origin);

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyResponse(origin);
    }

    const reports = parseCspReports(parsed);
    for (const report of reports) {
      console.log('[csp-report]', JSON.stringify(report));
    }

    // 台账是「能查的证据」，日志是「当下的现场」—— 两者都留，别互相替代
    if (reports.length > 0) {
      await recordViolations(reports.map(toLedgerRow));
    }
  } catch (error) {
    // 上报端点自身绝不报错给浏览器：静默吞掉，最多留一行诊断
    console.error(
      '[csp-report] handler failed:',
      error instanceof Error ? error.message : 'unknown',
    );
  }

  return emptyResponse(origin);
});
