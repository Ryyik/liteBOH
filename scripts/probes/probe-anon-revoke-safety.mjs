#!/usr/bin/env node
/**
 * anon EXECUTE 收尾 · 「哪些函数可以安全撤权」判定器（只读）
 *
 * 起因：2026-09-29 排查签到 bug 时发现 `get_weekly_checkin_status` 对 anon 可执行。
 * 顺着查下去发现 **51 个「SECURITY DEFINER + 引用 auth.uid()」的函数都对 anon 可执行** ——
 * 说明 `2026090906` / `2026092101` 那两轮撤权是按**显式名字清单**做的，漏了一整个家族。
 *
 * 但「能不能撤」不能凭名字猜。本脚本把两条硬规则做成可执行的判定：
 *   规则一：**被任何 RLS 策略引用 → 不可撤**。策略按「查询者角色」求值，
 *          撤 anon 会让这些表上的游客查询直接 42501。
 *          （实测：`current_user_is_admin` 被 113 条策略引用，这正是 2026092101 刻意保留它的原因。）
 *   规则二：**匿名态存在前端调用点 → 不可撤**（脚本只能列出调用点，最终仍需人工确认那处是否游客可达）。
 *
 * 用法：node scripts/probes/probe-anon-revoke-safety.mjs
 *   需要放开沙箱网络（见 AGENTS.md：CLI 直连 5432 时断，走 Management API + 钥匙串 token）。
 *
 * 输出四类：可安全撤 / 需人工确认 / 不可撤（RLS 引用）/ 门禁漏计（prokind != 'f'，期望为空）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF_FILE = path.join(ROOT, 'supabase/.temp/project-ref');
const SRC = path.join(ROOT, 'src');

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

const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

// 候选：anon 可执行 + SECURITY DEFINER + 引用 auth.uid()
const candidates = await sql(
  `select p.proname as name
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%auth.uid()%'`,
);
const names = [...new Set(candidates.map((r) => r.name))].sort();

// 规则一：被 RLS 策略引用
const alt = names.join('|');
const policyRows = await sql(
  `select coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as expr
     from pg_policy pol
    where (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ '(${alt})'
        or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ '(${alt})')`,
);
const inPolicy = new Set();
for (const { expr } of policyRows) {
  for (const n of names) if (new RegExp(`\\b${n}\\b`).test(expr)) inPolicy.add(n);
}

// 规则二：前端调用点（grep src 里的 rpc('name') / rpc("name")）
const callSites = new Map();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else if (/\.(js|ts|vue)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const n of names) {
        if (new RegExp(`rpc\\(\\s*['"\`]${n}['"\`]`).test(text)) {
          if (!callSites.has(n)) callSites.set(n, []);
          callSites.get(n).push(path.relative(ROOT, full));
        }
      }
    }
  }
};
if (fs.existsSync(SRC)) walk(SRC);

// 门禁漏计：anon 可执行但 prokind != 'f'（棘轮的查询带了 prokind='f' 过滤）
const missed = await sql(
  `select p.proname as name, p.prokind
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prokind <> 'f'`,
);

const safe = [];
const manual = [];
const blocked = [];
for (const n of names) {
  if (inPolicy.has(n)) blocked.push(n);
  else if (callSites.has(n)) manual.push(n);
  else safe.push(n);
}

console.log(`候选（anon 可执行 + SECURITY DEFINER + 引用 auth.uid()）：${names.length} 个\n`);
console.log(`✅ 可安全撤（不在任何 RLS 策略、且前端无调用点）：${safe.length}`);
if (safe.length) {
  console.log(`   ${safe.join(', ')}`);
  console.log('   ⚠️ 「无调用点」只扫了 src/ —— 落库前还须确认 Edge Functions 与 cron 也没调它。');
  console.log('');
}
console.log(`⚠️ 需人工确认（前端有调用点，要确认那处是否游客可达）：${manual.length}`);
for (const n of manual) console.log(`   - ${n}  ← ${callSites.get(n).join(', ')}`);
console.log(`\n⛔ 不可撤（被 RLS 策略引用，撤了会让游客查询 42501）：${blocked.length}`);
if (blocked.length) console.log(`   ${blocked.join(', ')}`);
console.log(`\n门禁漏计（anon 可执行且 prokind != 'f'，期望为空）：${missed.length}`);
if (missed.length) console.log(`   ${JSON.stringify(missed)}`);

console.log(
  '\n提醒：撤权不等于增加防线。函数体内部只信 auth.uid()，authenticated 同样能调用它 ——' +
    '\n      无论撤不撤 anon，「内部守卫」都是唯一那道防线，故边际安全收益有限。' +
    '\n      撤之前先跑一次「撤销 → 全站游客路径冒烟」。',
);
