#!/usr/bin/env node
/**
 * 给 Cloudflare 注入安全响应头（Zone 级 Response Header Transform Rules）
 *
 * 背景：站点托管在 GitHub Pages，**不支持自定义响应头**（public/_headers 线上完全不生效）。
 *       域名在 Cloudflare 之后，所以边缘注入是唯一落点。
 *
 * 安全设计：
 *   1. 只管理带 `[boh-security-headers]` 标记的那一条规则，读-改-写，
 *      **不会覆盖**你手工加在该 phase 里的其他规则。
 *   2. 未配置 token / 权限不足 / 任何网络失败 → 一律「告警 + exit 0」，
 *      绝不阻断发布（与仓库现有 purge 步骤同一策略）。
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
 */

const RULE_MARKER = '[boh-security-headers]';
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

/** 零风险四件套 + HSTS：只收紧默认行为，不拦截任何现有资源，可随时上 */
const SAFE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * CSP：收得很紧，必须逐步放开。
 * 先以 Report-Only 观察（--csp-enforce 前不要强制）。
 */
const CSP_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://cdn.blockofhome.cn",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.cloudinary.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const buildHeaders = () => {
  const headers = { ...SAFE_HEADERS };
  headers[CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'] = CSP_VALUE;
  return headers;
};

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
  const rule = buildRule();

  if (DRY_RUN) {
    console.log('[security-headers] DRY RUN，将提交以下规则：');
    console.log(JSON.stringify({ rules: [rule] }, null, 2));
    return;
  }

  if (!token || !zoneId) {
    console.log('::notice::security-headers skipped: 需要 CLOUDFLARE_API_TOKEN 与 CLOUDFLARE_ZONE_ID。');
    return;
  }

  // 读现有规则（404 = 该 phase 还没有 entrypoint，属正常）
  const existing = await api('GET', entrypointPath);
  if (!existing.ok && existing.status !== 404) {
    const detail = JSON.stringify(existing.payload?.errors || existing.payload).slice(0, 300);
    console.log(`::warning::security-headers 读取现有规则失败（HTTP ${existing.status}）：${detail}`);
    if (existing.status === 403) {
      console.log('::warning::token 权限不足：需在 Cloudflare My Profile → API Tokens 追加 Zone / Transform Rules / Edit；当前 token 仅 Cache Purge。');
    }
    return;
  }

  const currentRules = Array.isArray(existing.payload?.result?.rules) ? existing.payload.result.rules : [];
  const foreignRules = currentRules.filter((item) => !String(item?.description || '').startsWith(RULE_MARKER));

  const nextRules = REMOVE ? foreignRules : [...foreignRules, rule];

  const result = await api('PUT', entrypointPath, { rules: nextRules });

  if (!result.ok) {
    const detail = JSON.stringify(result.payload?.errors || result.payload).slice(0, 400);
    console.log(`::warning::security-headers 应用失败（HTTP ${result.status}）：${detail}`);
    return;
  }

  const applied = Array.isArray(result.payload?.result?.rules) ? result.payload.result.rules.length : nextRules.length;
  console.log(
    `[security-headers] ${REMOVE ? '已移除' : '已应用'}安全响应头规则；该 phase 现有 ${applied} 条规则（其中本脚本管理 1 条）。`,
  );
  console.log(`[security-headers] 头：${Object.keys(rule.action_parameters.headers).join(', ')}`);
};

main().catch((error) => {
  console.log(`::warning::security-headers 未预期错误（不阻断发布）：${error?.message || error}`);
});
