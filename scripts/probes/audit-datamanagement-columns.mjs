#!/usr/bin/env node
/**
 * 数据管理面板「列错误」静态查错
 *
 * 原理：后台每个 tab 点击后会向 PostgREST 发一条带 select/filter/order 的查询。
 * 只要引用了 DB 里不存在的列，PostgREST 直接返回 400
 *   `column X.xxx does not exist` / `relation "public.xxx" does not exist`
 * 前端表现为「点到某个 tab 就报错」。
 *
 * 本脚本把前端配置里所有列引用，与远端真实 schema 快照逐条比对。
 *
 * 用法：
 *   node scripts/probes/audit-datamanagement-columns.mjs [schema.json]
 *   （schema.json 由 scripts/probes/fetch-db-schema.py 生成）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const schemaFile = process.argv[2] || path.join(ROOT, 'docs/db-schema-snapshot.json');
if (!fs.existsSync(schemaFile)) {
  console.error(`找不到 schema 快照：${schemaFile}\n先跑 scripts/probes/fetch-db-schema.py`);
  process.exit(2);
}
const { schema, objects } = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));

const relkinds = new Map((objects || []).map((o) => [o.table_name, o.relkind]));
const colsOf = (t) => new Set((schema[t] || []).map((c) => c.column));
const tableExists = (t) => Boolean(schema[t]);

const qc = await import(path.join(ROOT, 'src/views/DataManagement/query-config.js'));

// ---- 抽 tab -> 物理表名 ----
const tablesSrc = fs.readFileSync(path.join(ROOT, 'src/views/DataManagement/config/tables.js'), 'utf8');
const TAB_TO_TABLE = {};
for (const m of tablesSrc.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*\{\s*\n\s*table:\s*'([^']+)'/gm)) {
  TAB_TO_TABLE[m[1]] = m[2];
}

// ---- 收集问题 ----
const problems = [];   // { level, tab, table, column, where }
const notFoundTabs = new Set();

const add = (level, tab, table, column, where) =>
  problems.push({ level, tab, table, column, where });

/** 解析 PostgREST select 串：逗号分隔，支持 `alias:fk_col(inner)` */
function parseSelect(sel) {
  const out = [];
  let depth = 0, buf = '';
  for (const ch of String(sel)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

function checkSelect(tab, table, sel) {
  if (!sel) return;
  for (const token of parseSelect(sel)) {
    const nested = token.match(/^([A-Za-z_][\w]*):([A-Za-z_][\w]*)\((.*)\)$/);
    if (nested) {
      // PostgREST 内嵌有两种写法：
      //   alias:关联表名(内层列)   ← 走 FK 关系推断，target 必须是个表/视图
      //   alias:本表FK列名(内层列) ← 显式指定外键列
      // 两者都不满足才是真错误。
      const [, alias, target, inner] = nested;
      const isTable = tableExists(target);
      const isLocalCol = colsOf(table).has(target);
      if (!isTable && !isLocalCol) {
        add('P0', tab, table, target, `select 内嵌关联目标既不是表也不是本表列（alias=${alias}）`);
      } else if (isTable) {
        add('INFO', tab, table, `${alias}:${target}(${inner})`, '内嵌关联查询');
      }
      continue;
    }
    const plain = token.match(/^([A-Za-z_][\w]*):([A-Za-z_][\w]*)$/); // alias:col
    const col = plain ? plain[2] : token;
    if (!colsOf(table).has(col)) add('P0', tab, table, col, 'select 列');
  }
}

for (const [tab, table] of Object.entries(TAB_TO_TABLE)) {
  if (!tableExists(table)) {
    add('P0', tab, table, '(整表)', '表/视图不存在');
    notFoundTabs.add(tab);
    continue;
  }
  const known = colsOf(table);

  // 1) select 列
  checkSelect(tab, table, qc.TAB_SELECT_COLUMNS?.[tab]);

  // 2) 状态筛选列
  const sf = qc.STATUS_FILTER_FIELDS?.[tab];
  if (sf && !known.has(sf)) add('P0', tab, table, sf, 'STATUS_FILTER_FIELDS');

  // 3) 日期筛选列
  const df = qc.DATE_FILTER_FIELDS?.[tab];
  if (df && !known.has(df)) add('P0', tab, table, df, 'DATE_FILTER_FIELDS');

  // 4) 默认排序（secondary 是同形状对象）
  const ds = qc.TAB_DEFAULT_SORT?.[tab];
  if (ds) {
    const entries = [['column', ds.column], ['secondary', ds.secondary?.column]];
    for (const [key, col] of entries) {
      if (col && !known.has(col)) add('P0', tab, table, col, `TAB_DEFAULT_SORT.${key}`);
    }
  }

  // 5) 可排序白名单（值是 Set / Array / Object 三种形态都出现过）
  const sortCols = qc.TAB_SORT_COLUMNS?.[tab];
  if (sortCols) {
    const keys = sortCols instanceof Set
      ? [...sortCols]
      : Array.isArray(sortCols) ? sortCols : Object.keys(sortCols);
    for (const k of keys) {
      if (typeof k === 'string' && k && !known.has(k)) add('P1', tab, table, k, 'TAB_SORT_COLUMNS');
    }
  }

  // 6) 搜索字段
  const search = qc.TAB_SEARCH_FIELDS?.[tab];
  if (Array.isArray(search)) {
    for (const s of search) {
      if (s?.column && !known.has(s.column)) add('P0', tab, table, s.column, 'TAB_SEARCH_FIELDS');
    }
  }
}

// ---- 补：query-config 里出现但没有任何 tab 映射的键（孤儿配置）----
const orphanSelect = Object.keys(qc.TAB_SELECT_COLUMNS || {}).filter((t) => !(t in TAB_TO_TABLE));
const orphanStatus = Object.keys(qc.STATUS_FILTER_FIELDS || {}).filter((t) => !(t in TAB_TO_TABLE));
const orphanDate = Object.keys(qc.DATE_FILTER_FIELDS || {}).filter((t) => !(t in TAB_TO_TABLE));

// ---- 第 7 类：会被写进 payload 的列（真判据是 TAB_WRITABLE_FIELDS）----
// saveStrategies 里 `pickWritableFields()` 只放行 TAB_WRITABLE_FIELDS 声明的键，
// 所以 dataConfig.fields 里的多余字段**不会**进 payload（那只是编辑器 UI）。
// 真正会让「保存」400 的是 TAB_WRITABLE_FIELDS 里声明了 DB 不存在的列。
// columns/fields 里其它不存在列归为 INFO —— 它们多半是由代码派生填充的展示字段，
// 需要人工确认，不要当成错误直接改。
const { TAB_WRITABLE_FIELDS } = await import(
  path.join(ROOT, 'src/views/DataManagement/config/fields.js')
);

const fieldProblems = [];
for (const [tab, fields] of Object.entries(TAB_WRITABLE_FIELDS || {})) {
  const table = TAB_TO_TABLE[tab];
  if (!table) {
    fieldProblems.push({ level: 'P0', tab, table: '(无表映射)', column: '-', where: '写入白名单没有对应实体' });
    continue;
  }
  if (!tableExists(table)) {
    fieldProblems.push({ level: 'P0', tab, table, column: '(整表)', where: '写入白名单指向的表不存在' });
    continue;
  }
  const known = colsOf(table);
  for (const k of fields) {
    if (!known.has(k)) {
      fieldProblems.push({ level: 'P0', tab, table, column: k, where: '写入白名单（保存即 400）' });
    }
  }
}

// 展示用列里的缺失列：仅提示，供人工判断是否为派生字段
const displayInfo = [];
{
  const blockRe = /^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*\{\s*\n([\s\S]*?)^ {2}\},$/gm;
  const writableSet = new Map(
    Object.entries(TAB_WRITABLE_FIELDS || {}).map(([t, arr]) => [t, new Set(arr)])
  );
  for (const bm of tablesSrc.matchAll(blockRe)) {
    const tab = bm[1];
    const body = bm[2];
    const table = TAB_TO_TABLE[tab];
    if (!table || !tableExists(table)) continue;
    const known = colsOf(table);
    for (const kind of ['columns', 'fields']) {
      const sub = body.match(new RegExp(`${kind}\\s*:\\s*\\[([\\s\\S]*?)\\n {4}\\]`));
      if (!sub) continue;
      const keys = [...sub[1].matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
      for (const k of new Set(keys)) {
        if (known.has(k)) continue;
        if (writableSet.get(tab)?.has(k)) continue; // 已在 P0 里报过
        displayInfo.push({ tab, table, column: k, kind });
      }
    }
  }
}

// ---- 输出 ----
const P0 = problems.filter((p) => p.level === 'P0');
const P1 = problems.filter((p) => p.level === 'P1');

console.log('='.repeat(78));
console.log('数据管理面板 · 列引用静态查错');
console.log('='.repeat(78));
console.log(`schema 快照: ${path.relative(ROOT, schemaFile)}`);
console.log(`远端表/视图: ${Object.keys(schema).length}   列总数: ${Object.values(schema).reduce((a, b) => a + b.length, 0)}`);
console.log(`前端 tab: ${Object.keys(TAB_TO_TABLE).length}   select 配置: ${Object.keys(qc.TAB_SELECT_COLUMNS || {}).length}`);
console.log(`P0（点击即 400）: ${P0.length}    P1（排序触发才 400）: ${P1.length}`);

const grouped = new Map();
for (const p of [...P0, ...P1]) {
  if (!grouped.has(p.tab)) grouped.set(p.tab, []);
  grouped.get(p.tab).push(p);
}

if (grouped.size) {
  console.log('\n' + '─'.repeat(78));
  for (const [tab, list] of grouped) {
    const table = list[0].table;
    console.log(`\n▸ ${tab}  →  ${table}`);
    for (const p of list) {
      console.log(`   [${p.level}] ${p.where}: ${p.column}`);
    }
    // 给出该表真实列，便于对照
    if (tableExists(table)) {
      console.log(`   真实列: ${[...colsOf(table)].join(', ')}`);
    }
  }
} else {
  console.log('\n✅ 所有 select / 筛选 / 排序 / 搜索列引用在 DB 中均存在');
}

if (orphanSelect.length || orphanStatus.length || orphanDate.length) {
  console.log('\n' + '─'.repeat(78));
  console.log('孤儿配置（query-config 里声明了，但 tables.js 没有对应实体映射）');
  console.log('  TAB_SELECT_COLUMNS:', orphanSelect.join(', ') || '—');
  console.log('  STATUS_FILTER_FIELDS:', orphanStatus.join(', ') || '—');
  console.log('  DATE_FILTER_FIELDS:', orphanDate.join(', ') || '—');
}

const info = problems.filter((p) => p.level === 'INFO');
if (info.length) {
  console.log('\n' + '─'.repeat(78));
  console.log(`待人工确认的内嵌关联查询 ${info.length} 处：`);
  for (const i of info.slice(0, 30)) console.log(`   ${i.tab}: ${i.column}`);
}

const fieldP0 = fieldProblems.filter((p) => p.level === 'P0');
if (fieldP0.length) {
  console.log('\n' + '─'.repeat(78));
  console.log(`写入白名单错配（保存必 400）：${fieldP0.length} 处`);
  for (const p of fieldP0) {
    console.log(`  [${p.tab}] ${p.table}.${p.column}  ← ${p.where}`);
  }
}

if (displayInfo.length) {
  console.log('\n' + '─'.repeat(78));
  console.log(`展示列里 DB 不存在的 key：${displayInfo.length} 处（多为代码派生的展示字段，需人工确认，勿直接改）`);
  const byTab = new Map();
  for (const p of displayInfo) {
    if (!byTab.has(p.tab)) byTab.set(p.tab, []);
    byTab.get(p.tab).push(p);
  }
  for (const [tab, list] of byTab) {
    console.log(`  ▸ ${tab} → ${list[0].table}: ${list.map((x) => x.column).join(', ')}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'output/datamanagement-column-audit.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    schemaFile,
    problems,
    fieldProblems,
    displayInfo,
    orphanSelect,
    orphanStatus,
    orphanDate
  }, null, 2)
);
console.log('\n明细已写入 output/datamanagement-column-audit.json');
process.exit(P0.length || fieldP0.length ? 1 : 0);
