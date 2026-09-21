#!/usr/bin/env node
/**
 * check-anon-execute.mjs — 匿名可执行面棘轮门禁
 *
 * ## 为什么需要这道门禁
 *
 * 2026-09-21 实测（见 docs/2026-09-21-安全审计报告核验与全量复检.md §6.7）证明：
 * **`alter default privileges` 这条路在本项目保证不了增量安全。**
 *
 * 具体表现：
 *   1. `alter default privileges in schema public revoke execute on functions from anon, public`
 *      执行成功，但**新建函数**（owner=postgres）的 ACL 仍是 `{=X/postgres, ...}`
 *      —— PUBLIC 的 EXECUTE 依然在，anon 经 PUBLIC 继承，`has_function_privilege('anon', …)` = true。
 *   2. 根因是**还存在另一条 `defaclrole = supabase_admin` 的默认权限条目**，而修改它会报
 *      `42501 permission denied to change default privileges` —— 项目侧碰不到。
 *
 * 也就是说：**存量能修（`revoke … from anon, public` 有效），增量护栏不存在。**
 * 此后每新增一个未加固的 public 函数，就是一个新的匿名入口，而没有任何机制会提醒你。
 *
 * 既然数据库侧的默认权限改不动，就把护栏放在**仓库侧**：用棘轮（ratchet）锁死
 * 当前匿名可执行面，任何新增即失败。这与项目既有的 `check-important-budget.mjs`
 * 同一套路（存量锁死、只允许单调递减）。
 *
 * ## 用法
 *
 *   node scripts/check-anon-execute.mjs            # 校验（超出基线即 exit 1）
 *   node scripts/check-anon-execute.mjs --update   # 以当前状态重写基线（仅在有意外泄后使用）
 *
 * ## 凭据与降级
 *
 * 需要 Supabase Management API access token（**不是** anon key —— 需要读 pg_catalog）。
 *   - 优先读环境变量 `SUPABASE_ACCESS_TOKEN`
 *   - macOS 上回落读取 Supabase CLI 的 keychain 条目
 *   - 无 token / 网络不可达 → **告警 + exit 0**，不阻断发布
 *     （与仓库既有 `cloudflare-security-headers.mjs` 同策略：门禁不该因为
 *      拿不到远端而变成发布的硬阻塞）
 *
 * ## 与 CI 的关系
 *
 * **不接入 `build:ci`**：CI 只有 anon key，没有 Management API token，接了也永远是
 * 降级跳过（等于假门禁）。它是**发布前的本地检查**（`npm run security:anon-check`）。
 * 若要让它进 CI，需在 GitHub Secrets 里加 `SUPABASE_ACCESS_TOKEN`。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'anon-execute-baseline.json');
const REF_FILE = join(ROOT, 'supabase', '.temp', 'project-ref');
const UPDATE = process.argv.includes('--update');
const QUIET = process.argv.includes('--quiet');

const log = (...args) => {
  if (!QUIET) {
    console.log(...args);
  }
};
const warn = (...args) => console.warn(...args);

/** 读取 Management API token：环境变量优先，macOS 回落 keychain。 */
const readAccessToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (process.platform !== 'darwin') {
    return '';
  }
  try {
    const raw = execSync(
      'security find-generic-password -s "Supabase CLI" -a supabase -w',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    // Supabase CLI 以 go-keyring 格式存储：go-keyring-base64:<base64>
    const payload = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    const decoded = Buffer.from(payload, 'base64').toString('utf-8').trim();
    return decoded || '';
  } catch {
    return '';
  }
};

const readProjectRef = () => {
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (existsSync(REF_FILE)) {
    return readFileSync(REF_FILE, 'utf-8').trim();
  }
  return '';
};

/**
 * 计划校验的两个面：
 *   - functions.anonExecutable → 匿名可执行函数名集合（棘轮：只许减少）
 *   - tables.anonWritable      → 匿名持有 INSERT/UPDATE/DELETE/TRUNCATE 的表名集合
 *     期望恒为空（`2026092101` 已回收；TRUNCATE 不受 RLS 约束，一并纳入）
 */
const QUERIES = {
  anonExecutable: `select p.proname as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
   group by 1
   order by 1`,
  anonWritable: `select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE')
       or has_table_privilege('anon', c.oid, 'TRUNCATE'))
   order by 1`,
};

const runQuery = async (ref, token, query) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: true }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Management API HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Management API 返回了非数组：${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows.map((row) => String(row.name)).filter(Boolean);
};

const diff = (baseline, current) => {
  const baseSet = new Set(baseline);
  const currSet = new Set(current);
  return {
    added: current.filter((name) => !baseSet.has(name)).sort(),
    removed: baseline.filter((name) => !currSet.has(name)).sort(),
  };
};

const emptyBaseline = { total: 0, names: [], tables: [] };

const main = async () => {
  const token = readAccessToken();
  const ref = readProjectRef();

  if (!token || !ref) {
    warn('[check:anon-execute] Skipped — 缺少凭据，无法核验匿名可执行面。');
    warn(`   token: ${token ? '有' : '无（设 SUPABASE_ACCESS_TOKEN，或本机 Supabase CLI 已登录）'} | project ref: ${ref || '无'}`);
    warn('   这是一道**本地发布前检查**，跳过不代表通过。');
    process.exit(0);
  }

  let current = {};
  try {
    current.anonExecutable = await runQuery(ref, token, QUERIES.anonExecutable);
    current.anonWritable = await runQuery(ref, token, QUERIES.anonWritable);
  } catch (error) {
    warn(`[check:anon-execute] Skipped — 远端查询失败：${error.message}`);
    process.exit(0);
  }

  const baseline = existsSync(BASELINE_FILE)
    ? JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
    : emptyBaseline;

  if (UPDATE) {
    const next = {
      total: current.anonExecutable.length,
      names: current.anonExecutable,
      tables: current.anonWritable,
      note: '匿名可执行面基线（棘轮）。只能通过显式 revoke … from anon, public 下调。'
        + '见 scripts/check-anon-execute.mjs 顶部说明与 docs/2026-09-21-安全审计报告核验与全量复检.md §6.7。',
    };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    log(`[check:anon-execute] 基线已更新：函数 ${baseline.names?.length ?? 0} → ${next.total}，表 ${next.tables.length}`);
    process.exit(0);
  }

  if (!existsSync(BASELINE_FILE)) {
    warn('[check:anon-execute] Skipped — 基线文件不存在。先跑一次 --update 建基线。');
    process.exit(0);
  }

  const fnDiff = diff(baseline.names || [], current.anonExecutable);
  const tableDiff = diff(baseline.tables || [], current.anonWritable);

  const newTables = tableDiff.added;
  const failures = [];
  if (fnDiff.added.length) {
    failures.push(`新增 ${fnDiff.added.length} 个匿名可执行函数`);
  }
  if (newTables.length) {
    failures.push(`新增 ${newTables.length} 张匿名可写表`);
  }

  // 表级匿名写是「应为零」的硬约束（2026092101 已回收），任何非空都属于回归。
  if (current.anonWritable.length > 0 && newTables.length === 0) {
    failures.push(`存在 ${current.anonWritable.length} 张匿名可写表（期望 0）`);
  }

  if (failures.length === 0) {
    log(`[check:anon-execute] Passed. 匿名可执行函数 ${current.anonExecutable.length}/${baseline.names?.length ?? 0}（未超出基线）；匿名可写表 ${current.anonWritable.length}。`);
    if (fnDiff.removed.length) {
      log(`  可下调基线：${fnDiff.removed.length} 个函数已不再匿名可执行 → ${fnDiff.removed.slice(0, 8).join(', ')}${fnDiff.removed.length > 8 ? ' …' : ''}`);
      log('  收紧基线：node scripts/check-anon-execute.mjs --update');
    }
    process.exit(0);
  }

  console.error('[check:anon-execute] 发现匿名可达面**新增**——每个都是一条新的未加固入口：');
  for (const name of fnDiff.added) {
    console.error(`  + 函数 ${name}`);
  }
  for (const name of newTables) {
    console.error(`  + 表   ${name}（anon 可写）`);
  }
  if (current.anonWritable.length > 0 && newTables.length === 0) {
    console.error(`  ! 当前匿名可写表 ${current.anonWritable.length} 张（期望 0）：${current.anonWritable.slice(0, 10).join(', ')}`);
  }
  console.error('');
  console.error('修法：在新函数的同一条迁移里显式收权（alter default privileges 在本项目无效，见文件顶部说明）：');
  console.error('  revoke execute on function public.<fn>(<args>) from anon, public;   -- 匿名入口');
  console.error('  revoke execute on function public.<fn>(<args>) from anon, authenticated, public;  -- 仅服务端调用');
  console.error('确认这道新增是**有意为之**后，才可用 --update 更新基线。');
  process.exit(1);
};

main();
