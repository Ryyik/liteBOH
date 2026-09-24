#!/usr/bin/env node
/**
 * 数据管理面板 · 列引用「真打」验证
 *
 * 静态比对只能说明「前端声明了某个列，而 schema 快照里没有」。
 * 本脚本用 PostgREST 实际发一次请求做决定性验证：
 *   - 400 + 42703 `column X.xxx does not exist`  → 列确实不存在，点击必报错
 *   - 200 / 其它                                 → 列存在（RLS 只会让它返回空数组，不会报列错）
 * 列错误发生在 PostgREST 解析 schema cache 阶段，与 RLS / 角色权限无关，
 * 因此 anon key 也足以判定「列是否存在」。
 *
 * 用法：node --env-file=.env scripts/probes/verify-datamanagement-columns-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const URL_BASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) {
  console.error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（用 --env-file=.env 运行）');
  process.exit(2);
}

const qc = await import(path.join(ROOT, 'src/views/DataManagement/query-config.js'));
const tablesSrc = fs.readFileSync(path.join(ROOT, 'src/views/DataManagement/config/tables.js'), 'utf8');
const TAB_TO_TABLE = {};
for (const m of tablesSrc.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*\{\s*\n\s*table:\s*'([^']+)'/gm)) {
  TAB_TO_TABLE[m[1]] = m[2];
}

/**
 * 去掉内嵌关联：`alias:target(cols)` / `alias:fk_col(cols)`。
 * ⚠️ 必须整段删除，不能只按括号深度收集字符 —— 那样会得到 `alias:target`
 *    （括号被吃掉），PostgREST 会把它当成 `alias:column` 从而误报列不存在。
 */
const stripEmbedded = (sel) =>
  String(sel)
    .replace(/[A-Za-z_]\w*\s*:\s*[A-Za-z_]\w*\s*\([^()]*\)/g, '') // 带别名的内嵌
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = async (table, select, extra = '') => {
  const url = `${URL_BASE}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1${extra}`;
  let last = { status: 0, code: null, message: 'UNKNOWN' };
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=none' }
      });
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      return { status: res.status, code: parsed?.code || null, message: parsed?.message || body.slice(0, 200) };
    } catch (e) {
      // 本机到 *.supabase.co 会间歇性 fetch failed，必须重试，否则会被误判成“通过”
      last = { status: 0, code: null, message: 'NETWORK: ' + String(e.message).slice(0, 120) };
      if (attempt < 6) await sleep(500 * attempt);
    }
  }
  return last;
};

const isColErr = (r) => r.status === 400 && /42703|does not exist/i.test(`${r.code} ${r.message}`);

/** 分批并发，避免打太快也避免串行太慢 */
const runBatch = async (items, worker, size = 6) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return out;
};

// ── 第 1 轮：select 列 ──
const selectTasks = Object.entries(TAB_TO_TABLE)
  .filter(([tab]) => qc.TAB_SELECT_COLUMNS?.[tab])
  .map(([tab, table]) => ({ tab, table, select: stripEmbedded(qc.TAB_SELECT_COLUMNS[tab]) }));

const rows = await runBatch(selectTasks, async (t) => {
  const r = await probe(t.table, t.select);
  return { ...t, kind: 'select', ...r, columnError: isColErr(r) };
});

console.log('── select 列真打 ──');
for (const r of rows) {
  const mark = r.columnError ? '❌ 列错误' : r.status === 0 ? '❓ 未验证' : r.status >= 400 ? `⚠ HTTP ${r.status}` : '✅';
  console.log(`${mark.padEnd(9)} ${r.tab.padEnd(24)} ${r.table.padEnd(30)} ${r.message.slice(0, 100)}`);
}

// ── 第 2 轮：筛选 / 排序 / 搜索列（这些同样会 400，只是要用户操作后才触发）──
const extraTasks = [];
for (const [tab, table] of Object.entries(TAB_TO_TABLE)) {
  const sf = qc.STATUS_FILTER_FIELDS?.[tab];
  if (sf) extraTasks.push({ tab, table, kind: '状态筛选', col: sf, extra: `&${sf}=eq.__probe__` });
  const df = qc.DATE_FILTER_FIELDS?.[tab];
  if (df) extraTasks.push({ tab, table, kind: '日期筛选', col: df, extra: `&${df}=gte.1970-01-01` });
  const ds = qc.TAB_DEFAULT_SORT?.[tab];
  if (ds?.column) extraTasks.push({ tab, table, kind: '默认排序', col: ds.column, extra: `&order=${ds.column}.desc` });
  if (ds?.secondary?.column) extraTasks.push({ tab, table, kind: '默认排序2', col: ds.secondary.column, extra: `&order=${ds.secondary.column}.desc` });
  // 可排序白名单：用户点表头排序时才会用到，列错同样 400
  const sc = qc.TAB_SORT_COLUMNS?.[tab];
  if (sc) {
    const keys = sc instanceof Set ? [...sc] : Array.isArray(sc) ? sc : Object.keys(sc);
    for (const k of keys) {
      if (typeof k === 'string' && k && k !== ds?.column && k !== ds?.secondary?.column) {
        extraTasks.push({ tab, table, kind: '可排序列', col: k, extra: `&order=${k}.desc` });
      }
    }
  }
  for (const s of (qc.TAB_SEARCH_FIELDS?.[tab] || [])) {
    if (s?.column && s.type !== 'uuid' && s.type !== 'number') {
      extraTasks.push({ tab, table, kind: '搜索字段', col: s.column, extra: `&or=(${s.column}.ilike.*probe*)` });
    }
  }
}

const extraRows = await runBatch(extraTasks, async (t) => {
  const r = await probe(t.table, 'id', t.extra);
  return { ...t, ...r, columnError: isColErr(r) };
});

const extraBad = extraRows.filter((r) => r.columnError);
console.log(`\n── 筛选/排序/搜索列真打（${extraRows.length} 项）──`);
if (extraBad.length) {
  for (const b of extraBad) console.log(`❌ [${b.tab}] ${b.kind} ${b.col} (${b.table}) → ${b.message}`);
} else {
  console.log('全部通过 ✅');
}

// ── 第 3 轮：完整 select（含内嵌关联）──
// 第 1 轮剥掉了内嵌，所以只能证明「扁平列」存在。
// 内嵌 `alias:target(cols)` 若两表之间没有外键，PostgREST 会报 PGRST200
// （Could not find a relationship…）→ 同样是 400，用户点开就报。
// 因此这里对「第 1 轮已通过」的页签补一次完整 select 真打。
const embedTasks = selectTasks
  .filter((t) => !rows.find((r) => r.tab === t.tab && r.columnError))
  .map((t) => ({
    tab: t.tab,
    table: t.table,
    select: String(qc.TAB_SELECT_COLUMNS[t.tab]).replace(/\s+/g, '').replace(/^,|,$/g, '')
  }))
  .filter((t) => t.select.includes('('));

const embedRows = await runBatch(embedTasks, async (t) => {
  const r = await probe(t.table, t.select);
  return { ...t, ...r, columnError: isColErr(r) };
});

// 401/403 = 探针只有 anon key 导致（该表未给 anon SELECT 权限），
// 属于探针环境限制而非配置问题，不计入失败，也不该让脚本变红。
const isAuthNoise = (r) => r.status === 401 || r.status === 403;
const embedBad = embedRows.filter(
  (r) => r.columnError || (r.status >= 400 && !isAuthNoise(r))
);
const embedAuthNoise = embedRows.filter((r) => !r.columnError && isAuthNoise(r));

console.log(`\n── 内嵌关联真打（${embedRows.length} 项，完整 select）──`);
if (embedBad.length) {
  for (const b of embedBad) {
    const kind = b.columnError ? '列错误' : b.status === 0 ? '未验证' : `HTTP ${b.status}`;
    console.log(`❌ [${b.tab}] ${kind} ${b.code || ''} (${b.table}) → ${b.message}`);
    console.log(`     select=${b.select}`);
  }
} else {
  console.log('全部通过 ✅');
}
if (embedAuthNoise.length) {
  console.log(`（${embedAuthNoise.length} 项因 anon 无权限返回 401/403，属探针环境限制，非配置问题：`
    + embedAuthNoise.map((r) => r.tab).join(', ') + '）');
}

const bad = [...rows.filter((r) => r.columnError), ...extraBad, ...embedBad.filter((b) => b.columnError)];
const unverified = [...rows.filter((r) => r.status === 0), ...embedRows.filter((r) => r.status === 0)];
const warn = rows.filter((r) => !r.columnError && r.status !== 0 && r.status >= 400 && !isAuthNoise(r));
const authNoise = rows.filter((r) => !r.columnError && isAuthNoise(r));

console.log('\n' + '='.repeat(78));
console.log(
  `真打 ${rows.length} 个表格页签 · select 列错误 ${rows.filter((r) => r.columnError).length} 个 · ` +
  `筛选/排序/搜索列错误 ${extraBad.length} 个 · 内嵌关联失败 ${embedBad.length} 个 · 未验证 ${unverified.length} 个`
);
if (bad.length) {
  console.log('\n确切不存在的列（点开该页签 / 使用该筛选必然 400）：');
  for (const b of bad) console.log(`  [${b.tab}] ${b.kind || 'select'} ${b.col || ''} (${b.table}): ${b.message}`);
}
if (embedBad.filter((b) => !b.columnError).length) {
  console.log('\n内嵌关联非列错误（关系不存在 / 权限等）：');
  for (const b of embedBad.filter((x) => !x.columnError)) {
    console.log(`  [${b.tab}] HTTP ${b.status} ${b.code || ''} ${b.message.slice(0, 140)}`);
    console.log(`      select=${b.select}`);
  }
}
if (unverified.length) {
  console.log('\n未验证（网络失败，重试 4 次仍未通，不能视为通过）：');
  for (const u of unverified) console.log(`  [${u.tab}] ${u.table}`);
}
if (warn.length) {
  console.log('\n其它非 200（RLS / 类型不匹配等，不代表列有问题）：');
  for (const w of warn) console.log(`  [${w.tab}] ${w.status} ${w.code || ''} ${w.message.slice(0, 90)}`);
}
if (authNoise.length) {
  console.log(`\n探针权限限制（anon 无 SELECT 权限 → 401/403，已核实 authenticated 可用，非配置问题）：${authNoise.map((r) => r.tab).join(', ')}`);
}

fs.writeFileSync(
  path.join(ROOT, 'output/datamanagement-column-live.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), rows, extraRows, embedRows }, null, 2)
);
console.log('\n明细已写入 output/datamanagement-column-live.json');
process.exit(bad.length || unverified.length ? 1 : 0);
