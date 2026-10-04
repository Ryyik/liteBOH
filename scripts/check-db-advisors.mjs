#!/usr/bin/env node
/**
 * check-db-advisors.mjs — 线上库 **RLS / 函数安全** 静态检查（棘轮）
 *
 * ## 为什么需要
 *
 * `supabase db lint`（见 `scripts/check-db-lint.mjs`）只查**函数体的类型错误**；
 * 它**不看** RLS 是否启用、策略是否缺失、SECURITY DEFINER 函数有没有固定 search_path。
 * 这三类问题在 Supabase 里由 **splinter**（dashboard 的 Advisors 背后那套 lint）负责，
 * 但 splinter **没有 CLI 入口** —— 所以这里把它最有价值的三条**按同语义**实现成查询，
 * 用棘轮锁死存量（只许降不许升），新增即失败。
 *
 * 参考：https://supabase.github.io/splinter/
 *
 * ## 三条检查（对应 splinter 的同名 lint）
 *
 * | 本脚本 | splinter | 为什么危险 |
 * | --- | --- | --- |
 * | `searchPathMutable` | `function_search_path_mutable` | SECURITY DEFINER 函数没固定 `search_path` ⇒ 调用者可劫持 search_path 指向恶意 schema，函数以 owner 身份执行 ⇒ **提权** |
 * | `rlsDisabled` | `rls_disabled_in_public` | `public` 表未启用 RLS ⇒ PostgREST 直接暴露给 anon/authenticated |
 * | `rlsNoPolicy` | `rls_enabled_no_policy` | 启用 RLS 但**一条策略都没有** ⇒ 该表对所有非 owner 角色**完全不可访问**（常见于「加了 RLS 忘了加策略」） |
 *
 * ## 用法
 *
 *   node scripts/check-db-advisors.mjs            # 校验（任一列表比基线变长即 exit 1）
 *   node scripts/check-db-advisors.mjs --update   # 以当前状态重写基线（清理后用，下调是好方向）
 *
 * ## 凭据与降级
 *
 * 需要 Supabase Management API access token（**不是** anon key）。拿不到 / 网络不可达
 * → **告警 + exit 0**，不阻断发布（与 `check-anon-execute.mjs`、`cloudflare-security-headers.mjs` 同策略）。
 *
 * ⚠️ **刻意不接入 `verify` / `build:ci`**：CI 里没有 token，接进去只会永远降级跳过，
 * 变成「假门禁」。它是**发布前的本地检查**。
 *
 * ⚠️ 与 `check-anon-execute.mjs` 的分工：那个锁的是**匿名可执行面**（函数 EXECUTE 权限 +
 * 匿名可写表），这里锁的是 **RLS / 策略 / search_path**。两者互补，不要合并。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAccessToken, readProjectRef, runQuery } from './lib/supabase-admin-api.mjs';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'db-advisors-baseline.json');
const UPDATE = process.argv.includes('--update');

const warn = (...a) => console.warn(...a);

/** 三条检查的 SQL —— 与 splinter 同名 lint 同语义，只取「违规对象名单」。 */
const CHECKS = {
  searchPathMutable: {
    title: 'SECURITY DEFINER 函数未固定 search_path（提权风险）',
    query: `select p.proname as name
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.prokind = 'f'
               and p.prosecdef = true
               and not exists (
                 select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                  where cfg like 'search_path=%'
               )
             order by 1`,
  },
  rlsDisabled: {
    title: 'public 表未启用 RLS',
    query: `select c.relname as name
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relkind = 'r'
               and c.relrowsecurity = false
             order by 1`,
  },
  rlsNoPolicy: {
    title: 'public 表启用了 RLS 但没有任何策略（对该表完全不可访问）',
    query: `select c.relname as name
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relkind = 'r'
               and c.relrowsecurity = true
               and not exists (
                 select 1 from pg_policies pol
                  where pol.schemaname = 'public' and pol.tablename = c.relname
               )
             order by 1`,
  },
};

const token = readAccessToken();
const ref = readProjectRef(ROOT);
if (!token || !ref) {
  warn(
    '[check:db-advisors] ⚠️ 跳过：缺少 Supabase Management API access token 或 project-ref。',
    '\n                    设 SUPABASE_ACCESS_TOKEN（需能读 pg_catalog 的 token，不是 anon key）后重试。',
  );
  process.exit(0);
}

let current;
try {
  current = {};
  for (const [key, def] of Object.entries(CHECKS)) {
    const rows = await runQuery({ ref, token, query: def.query });
    current[key] = rows.map((r) => String(r.name)).sort();
  }
} catch (e) {
  warn(`[check:db-advisors] ⚠️ 跳过：查询失败（${String(e.message).slice(0, 200)}）。`);
  process.exit(0);
}

if (UPDATE) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), ...current }, null, 2)}\n`,
  );
  const total = Object.values(current).reduce((a, l) => a + l.length, 0);
  console.log(`[check:db-advisors] ✅ 基线已更新：${total} 条存量`);
  for (const [k, v] of Object.entries(current)) console.log(`    ${k.padEnd(20)} ${v.length}`);
  process.exit(0);
}

if (!existsSync(BASELINE_FILE)) {
  warn(
    `[check:db-advisors] ⚠️ 跳过：找不到基线 ${BASELINE_FILE}。`,
    '\n                    首次使用请先跑 node scripts/check-db-advisors.mjs --update',
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const regressions = [];

for (const [key, def] of Object.entries(CHECKS)) {
  const base = new Set(baseline[key] || []);
  const now = current[key] || [];
  const added = now.filter((n) => !base.has(n));
  const removed = [...base].filter((n) => !now.includes(n));
  const line = `  ${key.padEnd(20)} 当前 ${String(now.length).padStart(3)} / 基线 ${String(base.size).padStart(3)}`;
  if (added.length) {
    regressions.push({ key, title: def.title, added });
    console.log(`${line}  ❌ 新增 ${added.length}`);
  } else if (removed.length) {
    console.log(`${line}  ✅ 已削减 ${removed.length}（记得 --update 下调基线）`);
  } else {
    console.log(`${line}  持平`);
  }
}

if (!regressions.length) {
  console.log('\n[check:db-advisors] ✅ 通过：RLS / 策略 / search_path 均未新增问题。');
  process.exit(0);
}

console.error(`\n[check:db-advisors] ❌ 发现 ${regressions.length} 类新增问题：`);
for (const r of regressions) {
  console.error(`\n  【${r.key}】${r.title}`);
  for (const n of r.added) console.error(`      + ${n}`);
}
console.error('\n  存量债只许下降；新增即失败。修完后跑 --update 下调基线（下调不用交代理由）。');
console.error('  参考：https://supabase.github.io/splinter/');
process.exit(1);
