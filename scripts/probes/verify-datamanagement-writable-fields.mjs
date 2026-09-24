#!/usr/bin/env node
/**
 * 数据管理面板 · 写入白名单真打验证
 *
 * `TAB_WRITABLE_FIELDS`（config/fields.js）是「编辑/新建保存」时真正的列白名单 ——
 * saveStrategies 里 `pickWritableFields()` 只放行这里声明的键。
 * 所以这里声明的列若在 DB 不存在，**每次保存都会 400** `column X.xxx does not exist`。
 *
 * 判据：用 Management API 逐字段跑一次 `update <table> set <col> = <col> where false`
 *   - 0 行受影响（where false 永不匹配）→ 列存在，安全
 *   - 42703 column does not exist      → 列不存在，保存必炸
 * 该写法不改任何数据；语法解析失败发生在执行前。
 *
 * 用法：node scripts/probes/verify-datamanagement-writable-fields.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'nplnlefdwfgtyimfkyih';

// ---- 凭据：macOS 钥匙串（go-keyring-base64 壳，必须 base64 解码）----
let TOKEN = '';
try {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], {
    encoding: 'utf8'
  }).trim();
  TOKEN = Buffer.from(raw.split(':').slice(1).join(':'), 'base64').toString('utf8').trim();
} catch (e) {
  console.error('无法从钥匙串读取 Supabase CLI 令牌：' + String(e.message).slice(0, 120));
  process.exit(2);
}

const sql = async (q, readOnly = false) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, read_only: readOnly })
  });
  const text = await res.text();
  if (!res.ok) return { error: text.slice(0, 300) };
  try { return { data: JSON.parse(text) }; } catch { return { data: text }; }
};

const { TAB_WRITABLE_FIELDS } = await import(path.join(ROOT, 'src/views/DataManagement/config/fields.js'));
const tablesSrc = fs.readFileSync(path.join(ROOT, 'src/views/DataManagement/config/tables.js'), 'utf8');
const TAB_TO_TABLE = {};
for (const m of tablesSrc.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*\{\s*\n\s*table:\s*'([^']+)'/gm)) {
  TAB_TO_TABLE[m[1]] = m[2];
}

const problems = [];
let checked = 0;
let skipped = 0;

for (const [tab, fields] of Object.entries(TAB_WRITABLE_FIELDS)) {
  const table = TAB_TO_TABLE[tab];
  if (!table) {
    problems.push({ tab, table: '(无表映射)', column: '-', message: '配置里声明了写入白名单，但没有对应实体' });
    continue;
  }
  for (const col of fields) {
    const r = await sql(`update public.${table} set ${col} = ${col} where false`, false);
    checked++;
    if (r.error) {
      const isColErr = /42703|does not exist/i.test(r.error);
      problems.push({ tab, table, column: col, message: r.error.split('ERROR:').pop().trim().slice(0, 140), isColErr });
      const mark = isColErr ? '❌ 列不存在' : '⚠ 其它错误';
      console.log(`${mark.padEnd(10)} ${tab.padEnd(22)} ${table.padEnd(28)} ${col}  ${r.error.split('ERROR:').pop().trim().slice(0, 90)}`);
    }
  }
}

const colBad = problems.filter((p) => p.isColErr);
console.log('\n' + '='.repeat(78));
console.log(`写入白名单真打：${checked} 个字段 · 列不存在 ${colBad.length} 个 · 其它问题 ${problems.length - colBad.length} 个`);
if (colBad.length) {
  console.log('\n❌ 这些字段一旦保存就会 400（编辑/新建该页签必失败）：');
  for (const p of colBad) console.log(`  [${p.tab}] ${p.table}.${p.column} → ${p.message}`);
}
if (!problems.length) console.log('全部通过 ✅');

fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'output/datamanagement-writable-fields.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), checked, problems }, null, 2)
);
console.log('\n明细已写入 output/datamanagement-writable-fields.json');
process.exit(colBad.length ? 1 : 0);
