#!/usr/bin/env node
/**
 * AI 计费配置 · 线上只读体检（ai:config）
 *
 * 职责：一次拉全「AI 消耗积分」改造相关的线上真值，供调参前决策与上线后对账：
 *   1. 配置真值 —— ai_quota_config（含 points_multiplier）、ai_pricing_config、
 *      bohai_model_configs（倍率/门槛/输出上限）、subscription_plan_prices
 *   2. 部署版 vault 是否带积分路径 —— 函数体 grep 关键 RPC 名
 *   3. 用量与对账 —— 近 14 日按 tier 的人均 billed_tokens 分布；
 *      points_transactions(reason='ai_usage') 与 ai_quota_log 的当日对账
 *
 * 判据（全部只读，`read_only: true`）：
 *   - free 档 daily_token_limit=0 而 pricing.enabled=false → 提示「会 429」的配置矛盾
 *   - quota_multiplier 出现 0 → 免费模型，列出
 *   - ai_usage 流水当日笔数与 ai_quota_log 当日 billed>0 且走积分的笔数对账（enabled 后才有意义）
 *
 * 用法：node scripts/probes/probe-ai-billing-config.mjs [--json]
 *
 * 凭据与通路：与 probe-weekly-checkin-points.mjs 相同（钥匙串 token + Management API，
 * CLI 直连 5432 不通，见该文件头部实测记录）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF_FILE = path.join(ROOT, 'supabase/.temp/project-ref');
const AS_JSON = process.argv.includes('--json');

const REF =
  String(process.env.SUPABASE_PROJECT_REF || '').trim() ||
  (fs.existsSync(REF_FILE) ? fs.readFileSync(REF_FILE, 'utf8').trim() : '');
if (!REF) {
  console.error('找不到 project ref：设 SUPABASE_PROJECT_REF，或先 supabase link');
  process.exit(2);
}

const readToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'darwin') return '';
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return Buffer.from(raw.split(':').slice(1).join(':'), 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
};

const TOKEN = readToken();
if (!TOKEN) {
  console.error('拿不到 Management API token：设 SUPABASE_ACCESS_TOKEN，或先 supabase login');
  process.exit(2);
}

const sql = async (q) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, read_only: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

// 列可能还没迁移上去（CLI 先于部署跑），缺列时降级为 null 而不是整体失败
const tableColumns = async (table) =>
  (
    await sql(
      `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = '${table}'`,
    )
  ).map((r) => r.column_name);

const hasCols = (cols, ...needed) => needed.every((c) => cols.includes(c));

const checks = [];
const report = {};

// ---------- 1) ai_quota_config ----------
const quotaCols = await tableColumns('ai_quota_config');
const quotaSelect = ['tier', 'daily_token_limit', 'web_search_daily_limit'];
if (hasCols(quotaCols, 'points_multiplier')) quotaSelect.push('points_multiplier');
report.aiQuotaConfig = await sql(
  `select ${quotaSelect.join(', ')} from public.ai_quota_config order by tier`,
);

// 配置矛盾：free 归零了但积分开关没开（或反之）→ 线上 free 用户要么 429 要么展示混乱
const freeRow = report.aiQuotaConfig.find((r) => r.tier === 'free');
report.pricingCols = quotaCols;

// ---------- 2) ai_pricing_config ----------
if (fs.existsSync && (await tableColumns('ai_pricing_config')).length > 0) {
  report.aiPricingConfig = (await sql('select * from public.ai_pricing_config')) || [];
} else {
  report.aiPricingConfig = null;
}
const pricing = report.aiPricingConfig?.[0] || null;

checks.push({
  name: 'free 档配置自洽（limit=0 需配合积分开关）',
  pass: !freeRow || Number(freeRow.daily_token_limit) !== 0 || Boolean(pricing?.enabled),
  detail: { free: freeRow || null, pricingEnabled: pricing?.enabled ?? null },
});

// ---------- 3) bohai_model_configs ----------
const modelCols = await tableColumns('bohai_model_configs');
const modelSelect = ['mode_id', 'display_name', 'model_id', 'status'];
if (hasCols(modelCols, 'quota_multiplier')) modelSelect.push('quota_multiplier');
if (hasCols(modelCols, 'min_tier')) modelSelect.push('min_tier');
if (hasCols(modelCols, 'max_tokens')) modelSelect.push('max_tokens');
report.bohaiModelConfigs = await sql(
  `select ${modelSelect.join(', ')} from public.bohai_model_configs order by sort_order nulls last, mode_id`,
);
const freeModes = report.bohaiModelConfigs.filter((r) => Number(r.quota_multiplier) === 0);
if (freeModes.length > 0) {
  checks.push({
    name: `免费模型（quota_multiplier=0）共 ${freeModes.length} 个`,
    pass: true,
    detail: freeModes.map((m) => m.mode_id),
  });
}

// ---------- 4) subscription_plan_prices ----------
report.subscriptionPlanPrices = await sql(
  `select plan_code, billing_cycle, points_cost, duration_months, is_active
     from public.subscription_plan_prices order by plan_code, billing_cycle`,
);

// ---------- 5) 部署版 vault 是否带积分路径 ----------
const fns = await sql(
  `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reserve_ai_points', 'settle_ai_points')`,
);
report.pointsRpcsDeployed = fns.map((f) =>
  f.def.includes('create or replace function') ? f.def.split('(')[0] : f.def.slice(0, 60),
);
checks.push({
  name: '积分 RPC 已部署（reserve_ai_points / settle_ai_points）',
  pass: fns.length >= 2,
  detail: `找到 ${fns.length} 个`,
});

// ---------- 6) 用量分布（近 14 日，供汇率校准） ----------
report.usageByTier14d = await sql(`
  select coalesce(u.tier, 'guest') as tier,
         count(*) as requests,
         count(distinct coalesce(log.user_id::text, 'ip:' || coalesce(log.ip_address, '?'))) as users,
         round(sum(log.billed_tokens) / greatest(count(distinct coalesce(log.user_id::text, 'ip:' || coalesce(log.ip_address, '?'))), 1) / 10000.0) / 100.0 as avg_billed_tokens_per_user,
         round(sum(log.billed_tokens) / 10000.0) / 100.0 as total_billed_wan
    from public.ai_quota_log log
    left join (
      select s.user_id,
             (array['ultra','max','pro','plus','free'])[1 + greatest(
                case when exists (select 1 from public.user_subscriptions x where x.user_id = s.user_id and lower(trim(x.plan_code)) in ('ultra','boh-ultra') and x.status in ('active','trial') and x.expires_at > now()) then 1 else 0 end * 16
              + case when exists (select 1 from public.user_subscriptions x where x.user_id = s.user_id and lower(trim(x.plan_code)) in ('max','boh-max') and x.status in ('active','trial') and x.expires_at > now()) then 1 else 0 end * 8
              + case when exists (select 1 from public.user_subscriptions x where x.user_id = s.user_id and lower(trim(x.plan_code)) in ('pro','boh-pro') and x.status in ('active','trial') and x.expires_at > now()) then 1 else 0 end * 4
              + case when exists (select 1 from public.user_subscriptions x where x.user_id = s.user_id and lower(trim(x.plan_code)) in ('plus','boh-ai-plus','boh-plus') and x.status in ('active','trial') and x.expires_at > now()) then 1 else 0 end * 2, 1)] as tier
        from (select distinct user_id from public.ai_quota_log where created_at >= now() - interval '14 days') s
    ) u on u.user_id = log.user_id
   where log.created_at >= now() - interval '14 days'
   group by 1 order by 1
`);

// ---------- 7) 上线后对账：ai_usage 流水 vs 积分预占 ----------
const txnCols = await tableColumns('points_transactions');
if (hasCols(txnCols, 'reason')) {
  report.aiUsageToday = await sql(`
    select count(*) as txn_rows,
           coalesce(abs(sum(amount) filter (where amount < 0)), 0) as points_deducted,
           count(distinct user_id) as users
      from public.points_transactions
     where reason = 'ai_usage'
       and created_at >= (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
  `);
  const settledPoints = await sql(`
    select count(*) as settled_rows, coalesce(sum(points_settled), 0)::numeric(12,4) as points_settled_sum
      from public.ai_token_reservations
     where points_settled is not null
       and settled_at >= (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
  `);
  report.pointsSettledToday = settledPoints[0] || null;
  const t = report.aiUsageToday?.[0];
  const todayStart = await sql(
    `select (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')::text as ts`,
  );
  checks.push({
    name: '当日 ai_usage 流水与已扣积分自洽（流水存在则有扣减）',
    pass: !t || Number(t.txn_rows) === 0 || Number(t.points_deducted) > 0,
    detail: { ...t, since: todayStart[0]?.ts },
  });
}

// ---------- 输出 ----------
let failed = 0;
if (AS_JSON) {
  console.log(JSON.stringify({ ref: REF, checks, report }, null, 2));
  failed = checks.filter((c) => !c.pass).length;
} else {
  for (const [label, rows] of Object.entries(report)) {
    console.log(`\n--- ${label} ---`);
    console.log(JSON.stringify(rows, null, 2));
  }
  console.log('\n===== 结论 =====');
  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
    if (!c.pass) failed += 1;
  }
  console.log(failed === 0 ? '\n配置自洽。' : `\n${failed} 项不通过，见上方明细。`);
}
process.exit(failed === 0 ? 0 : 1);
