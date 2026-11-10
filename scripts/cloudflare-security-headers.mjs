#!/usr/bin/env node
/**
 * 给 Cloudflare 注入安全响应头（Zone 级 Response Header Transform Rules）
 *
 * 背景：站点托管在 GitHub Pages，**不支持自定义响应头**（public/_headers 线上完全不生效）。
 *       域名在 Cloudflare 之后，所以边缘注入是唯一落点。
 *
 * 安全设计：
 *   1. 只管理带 `[boh-security-headers]` 与 `[boh-sw-cache]` 标记的**两条**规则，
 *      读-改-写，**不会覆盖**你手工加在该 phase 里的其他规则。
 *      · `[boh-security-headers]` —— host 级，6 个安全头 + CSP。
 *      · `[boh-sw-cache]` —— 路径级，只对 sw.js / push-sw.js 下发 `Cache-Control: no-cache`。
 *        它们名字不带 hash、内容每次构建都变，却被 GitHub Pages 发了 max-age=14400；
 *        缓存住就等于「更新检查看到旧字节 → 点立即更新仍落旧壳」
 *        （2026-11-10 弹窗循环，见 `docs/gate-matrix.md` §C-10）。
 *   2. 未配置 token / 权限不足 / 任何网络失败 → 一律「告警 + exit 0」，
 *      绝不阻断发布（与仓库现有 purge 步骤同一策略）。
 *      ⚠️ 但**发布后**的 `check-security-headers-live.mjs` 是硬断言：
 *      规则没生效就让它红，别让「防护/新鲜度静默失效」穿过 CI。
 *   3. CSP 默认只以 Report-Only 下发（--csp-enforce 才强制）。
 *
 * 用法：
 *   node scripts/cloudflare-security-headers.mjs --dry-run        # 只打印将提交的规则
 *   node scripts/cloudflare-security-headers.mjs                  # 应用（CSP 为 Report-Only）
 *   node scripts/cloudflare-security-headers.mjs --csp-enforce    # CSP 转强制（确认报告收敛后再用）
 *   node scripts/cloudflare-security-headers.mjs --remove         # 只删掉本脚本管理的规则
 *
 * 需要的环境变量：
 *   CLOUDFLARE_API_TOKEN  —— 需具备 Zone / Transform Rules / Edit 权限
 *                            ⚠️ 仅 Cache Purge 权限的 token 会 403，见文件末尾说明
 *   CLOUDFLARE_ZONE_ID
 *   SECURITY_HEADER_HOSTS —— 可选，逗号分隔；默认两个裸域/子域
 *   CSP_REPORT_URI        —— 可选，CSP 违规上报端点。默认推导为
 *                            `<SUPABASE_URL>/functions/v1/csp-report`
 *                            （对应 supabase/functions/csp-report，部署需 --no-verify-jwt）
 */

// 图片域名白名单单一真源（渲染白名单也从这里取）
import { CSP_IMAGE_ORIGINS } from '../src/utils/image-origins.js';
// 头的定义单一真源（发布后探测脚本共用同一份，见该文件头）
import {
  buildSecurityHeaders,
  buildServiceWorkerCacheHeaders,
  SW_CACHE_PATHS,
} from './lib/security-headers-config.mjs';

const RULE_MARKER = '[boh-security-headers]';
// sw.js / push-sw.js 的缓存钉死规则：同一 phase，独立的 marker 与路径表达式。
// 为什么不并进上面那条：那条是 host 级、作用于全站所有响应；
// 这条只对两个无 hash 的入口脚本生效，混在一起会让「谁负责什么」变模糊。
const SW_CACHE_RULE_MARKER = '[boh-sw-cache]';
const MANAGED_RULE_MARKERS = [RULE_MARKER, SW_CACHE_RULE_MARKER];
const PHASE = 'http_response_headers_transform';
const API_BASE = 'https://api.cloudflare.com/client/v4';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CSP_ENFORCE = argv.includes('--csp-enforce');
const REMOVE = argv.includes('--remove');

const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const zoneId = String(process.env.CLOUDFLARE_ZONE_ID || '').trim();
const hosts = String(process.env.SECURITY_HEADER_HOSTS || 'www.blockofhome.cn,blockofhome.cn')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

/**
 * CSP 违规上报端点。
 *
 * 2026-11-03 之前 CSP 是 Report-Only 却**没有 report-to / report-uri** ——
 * 按 CSP3 规范浏览器会直接丢弃违规报告，于是「观察期」形同虚设：
 * 既收不到数据，也永远没有依据把 'unsafe-inline' 换掉、转成 enforce。
 */
const SUPABASE_URL = String(
  process.env.CSP_REPORT_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://nplnlefdwfgtyimfkyih.supabase.co',
)
  .trim()
  .replace(/\/+$/, '');
const CSP_REPORT_URI = String(
  process.env.CSP_REPORT_URI || `${SUPABASE_URL}/functions/v1/csp-report`,
).trim();

/**
 * ⚠️ 头的**定义**不在这里 —— 全部在 `./lib/security-headers-config.mjs`。
 * 本文件只负责「把那份定义推到 Cloudflare」，不负责决定有哪些头。
 * 这样发布后探测脚本（`check-security-headers-live.mjs`）断言的就是同一份数据，
 * 不会出现「注入改成 A、断言还按 B 校验」的静默分叉。
 */
const buildHeaders = () =>
  buildSecurityHeaders({
    cspEnforce: CSP_ENFORCE,
    cspReportUri: CSP_REPORT_URI,
    imageOrigins: CSP_IMAGE_ORIGINS,
  });

const buildRule = () => {
  const headerEntries = {};
  for (const [name, value] of Object.entries(buildHeaders())) {
    headerEntries[name] = { operation: 'set', value };
  }

  const expression = hosts.map((host) => `(http.host eq "${host}")`).join(' or ');

  return {
    action: 'rewrite',
    action_parameters: { headers: headerEntries },
    expression,
    description: `${RULE_MARKER} ${CSP_ENFORCE ? 'CSP enforced' : 'CSP report-only'}`,
    enabled: true,
  };
};

/**
 * sw.js / push-sw.js：无 hash 的入口脚本必须每次回源校验，否则浏览器/中间层会用满
 * origin 的 `max-age=14400`（GitHub Pages 对 .js 的默认值）—— 那是「点立即更新
 * 还是弹新版本」的直接成因之一（见 `docs/gate-matrix.md` §C-10）。
 * 值来自 `lib/security-headers-config.mjs`，与发布后断言共用。
 */
const buildSwCacheRule = () => {
  const headerEntries = {};
  for (const [name, value] of Object.entries(buildServiceWorkerCacheHeaders())) {
    headerEntries[name] = { operation: 'set', value };
  }

  const hostExpression = hosts.map((host) => `(http.host eq "${host}")`).join(' or ');
  const pathExpression = SW_CACHE_PATHS.map((path) => `(http.request.uri.path eq "${path}")`).join(
    ' or ',
  );

  return {
    action: 'rewrite',
    action_parameters: { headers: headerEntries },
    expression: `(${hostExpression}) and (${pathExpression})`,
    description: `${SW_CACHE_RULE_MARKER} 无 hash 入口脚本不缓存`,
    enabled: true,
  };
};

const api = async (method, path, body) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, payload };
};

const entrypointPath = `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`;

const main = async () => {
  const managedRules = [buildRule(), buildSwCacheRule()];

  if (DRY_RUN) {
    console.log('[security-headers] DRY RUN，将提交以下规则：');
    console.log(JSON.stringify({ rules: managedRules }, null, 2));
    return;
  }

  if (!token || !zoneId) {
    console.log(
      '::notice::security-headers skipped: 需要 CLOUDFLARE_API_TOKEN 与 CLOUDFLARE_ZONE_ID。',
    );
    return;
  }

  // 读现有规则（404 = 该 phase 还没有 entrypoint，属正常）
  const existing = await api('GET', entrypointPath);
  if (!existing.ok && existing.status !== 404) {
    const detail = JSON.stringify(existing.payload?.errors || existing.payload).slice(0, 300);
    console.log(
      `::warning::security-headers 读取现有规则失败（HTTP ${existing.status}）：${detail}`,
    );
    if (existing.status === 403) {
      console.log(
        '::warning::token 权限不足：需在 Cloudflare My Profile → API Tokens 追加 Zone / Transform Rules / Edit；当前 token 仅 Cache Purge。',
      );
    }
    return;
  }

  const currentRules = Array.isArray(existing.payload?.result?.rules)
    ? existing.payload.result.rules
    : [];
  const foreignRules = currentRules.filter(
    (item) =>
      !MANAGED_RULE_MARKERS.some((marker) => String(item?.description || '').startsWith(marker)),
  );

  const nextRules = REMOVE ? foreignRules : [...foreignRules, ...managedRules];

  const result = await api('PUT', entrypointPath, { rules: nextRules });

  if (!result.ok) {
    const detail = JSON.stringify(result.payload?.errors || result.payload).slice(0, 400);
    console.log(`::warning::security-headers 应用失败（HTTP ${result.status}）：${detail}`);
    return;
  }

  const applied = Array.isArray(result.payload?.result?.rules)
    ? result.payload.result.rules.length
    : nextRules.length;
  console.log(
    `[security-headers] ${REMOVE ? '已移除' : '已应用'}安全响应头规则；该 phase 现有 ${applied} 条规则（其中本脚本管理 ${managedRules.length} 条）。`,
  );
  for (const rule of managedRules) {
    console.log(
      `[security-headers] ${rule.description}：${Object.keys(rule.action_parameters.headers).join(', ')}`,
    );
  }
};

main().catch((error) => {
  console.log(`::warning::security-headers 未预期错误（不阻断发布）：${error?.message || error}`);
});
