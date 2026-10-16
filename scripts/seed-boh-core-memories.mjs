/**
 * seed-boh-core-memories.mjs — 把 `src/data/ai-memory.js` 的正文迁入云端官方事实库。
 *
 * 背景（2026-10-16 实测）：
 *   线上 `boh_ai_core_memories` 只有 1 条、`boh_ai_knowledge_bases` 为 0 条，
 *   而本地 `src/data/ai-memory.js`（14KB / 157 行）的社区事实从未入库 ——
 *   表、后台 UI（数据管理 → coreMemories）、向量索引链路都已存在，缺的只是**内容**。
 *
 * 本脚本只做一件事：把那份正文按章节拆成条目，写进 `boh_ai_core_memories`。
 *   ① 段落切分规则见 `extractEntries()`，正文一字不改（只 trim）。
 *   ② id 由内容 slug 做 md5 派生的稳定 UUID ⇒ 重复执行是 UPDATE 而非插重复行。
 *   ③ 跳过 `【重要指令】/【使用说明】/【绝对诚实】` 等**指令性文字** ——
 *      那是提示词层的事，不属于「事实」，塞进记忆库会污染检索结果。
 *
 * ⚠️ 源文件 `src/data/ai-memory.js` 已于 2026-10-16 迁移完成后**删除**（单一真源：
 *    官方事实只在云端 `boh_ai_core_memories` 一处维护，后台「数据管理 → 官方事实」可增删改）。
 *    如需重跑本脚本（例如云端数据被误删），先从 git 取回源文件：
 *      git log --oneline --diff-filter=D -- src/data/ai-memory.js   # 找删除它的那次提交
 *      git show <commit>^:src/data/ai-memory.js > src/data/ai-memory.js
 *    跑完再删掉即可。
 *
 * 用法：
 *   node scripts/seed-boh-core-memories.mjs              # dry-run，只打印将要写入的条目
 *   node scripts/seed-boh-core-memories.mjs --sql        # 打印可人工审阅的 SQL
 *   node scripts/seed-boh-core-memories.mjs --sql --out /tmp/seed.sql
 *   node scripts/seed-boh-core-memories.mjs --apply      # 真正写入线上库
 *
 * 凭据：`--apply` 需要 Supabase Management API token，按以下顺序取
 *   ① 环境变量 `SUPABASE_ACCESS_TOKEN`
 *   ② macOS 钥匙串条目 `Supabase CLI`（`go-keyring-base64:` 前缀需 base64 解码）
 * 脚本不会打印 token。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PROJECT_REF = 'nplnlefdwfgtyimfkyih';
const SOURCE_FILE = 'src/data/ai-memory.js';
const SOURCE_LABEL = 'BOH 核心记忆库';

/** 各章节 → 分类 / 优先级（priority 0~100，检索时既影响排序也影响关键词加权） */
const SECTION_META = {
  1: { category: 'community_overview', priority: 90 },
  2: { category: 'member_profile', priority: 70 },
  3: { category: 'timeline', priority: 60 },
  4: { category: 'culture', priority: 50 },
};

/** 记忆库正文的起止标记：只取两者之间的部分 */
const KB_START_MARKER = '【核心记忆库：方块之家 (BOH)】';
const KB_END_MARKER = '**重要原则：【绝对诚实】**';

const cwd = process.cwd();
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const readArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

if (hasFlag('--help') || hasFlag('-h')) {
  console.log('Usage: node scripts/seed-boh-core-memories.mjs [--sql] [--apply] [--out <file>]');
  console.log('  (default)  dry-run：打印将写入的条目摘要');
  console.log('  --sql      打印 SQL（不执行）');
  console.log('  --out <f>  把 SQL 写到文件');
  console.log('  --apply    通过 Supabase Management API 写入线上库');
  process.exit(0);
}

/* ------------------------------------------------------------------ 解析 */

const stableUuid = (seed) => {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-3${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const readLiteral = (sourceText) => {
  const matched = sourceText.match(/export const AI_MEMORY = `([\s\S]*)`;\s*$/);
  if (!matched) throw new Error('未能从 ai-memory.js 解析出 AI_MEMORY 模板字符串');
  return matched[1];
};

/** 按 `^[N] 标题` 把正文切成顶层章节 */
const splitSections = (body) => {
  const headerPattern = /^\[(\d+)\]\s*(.+)$/gm;
  const headers = [...body.matchAll(headerPattern)].map((match) => ({
    num: Number(match[1]),
    title: match[2].trim(),
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (headers.length === 0) throw new Error('未找到任何 [N] 章节标记');

  return headers.map((header, index) => ({
    num: header.num,
    title: header.title,
    text: body
      .slice(header.end, index + 1 < headers.length ? headers[index + 1].start : body.length)
      .trim(),
  }));
};

/** 按行首标记切块：返回 [{ title, text }]，未命中则整段作一块 */
const splitBlocks = (text, pattern, buildTitle) => {
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return [{ title: buildTitle('', text), text: text.trim() }];

  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const block = text.slice(start, end).trim();
    return { title: buildTitle(match[1] || match[0], block), text: block };
  });
};

const firstSentence = (text, max = 30) => {
  const line =
    String(text || '')
      .split('\n')
      .find((item) => item.trim()) || '';
  const cleaned = line
    .replace(/^[-*\s]+/, '')
    .replace(/[:：].*$/, '')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned || '未命名';
};

const extractTags = (text, extra = []) => {
  const tags = new Set(extra.filter(Boolean));
  const aliasLine = text.match(/别名[:：]\s*(.+)/);
  if (aliasLine) {
    aliasLine[1]
      .split(/[、,，/]/)
      .map((item) => item.trim().replace(/[。；;].*$/, ''))
      .filter((item) => item && item.length <= 20)
      .forEach((item) => tags.add(item));
  }
  return [...tags].slice(0, 30);
};

const extractEntries = (sourceText) => {
  const literal = readLiteral(sourceText);

  let body = literal;
  const startIndex = body.indexOf(KB_START_MARKER);
  if (startIndex < 0) throw new Error(`未找到正文起始标记：${KB_START_MARKER}`);
  body = body.slice(startIndex + KB_START_MARKER.length);
  const endIndex = body.indexOf(KB_END_MARKER);
  if (endIndex >= 0) body = body.slice(0, endIndex);

  const entries = [];
  for (const section of splitSections(body)) {
    const meta = SECTION_META[section.num] || { category: 'general', priority: 50 };
    const push = (title, content, tags = []) => {
      const text = String(content || '').trim();
      if (!text) return;
      entries.push({
        slug: `${section.num}-${slugify(title) || entries.length}`,
        title: title.slice(0, 160),
        content: text.slice(0, 12000),
        category: meta.category,
        tags: tags.slice(0, 30),
        priority: meta.priority,
      });
    };

    if (section.num === 2) {
      // 核心成员档案：按 `1. 姓名 (性别)` 切，一人一条
      for (const block of splitBlocks(section.text, /^(\d+)\.\s*(.+)$/gm, (_key, text) => {
        const line = String(text || '').split('\n')[0] || '';
        return line.replace(/^\d+\.\s*/, '').trim();
      })) {
        const name = block.title.replace(/\s*[（(].*$/, '').trim() || block.title;
        push(`成员档案：${name}`, block.text, extractTags(block.text, [name, '成员档案']));
      }
      continue;
    }

    if (section.num === 3) {
      // 大事记：按 `- 2018 年（…）：` 切，一年一条
      for (const block of splitBlocks(section.text, /^-\s*(\d{2,4})\s*年/gm, (key) => key)) {
        const year = Number(block.title);
        const validYear = Number.isFinite(year) && year >= 1900 && year <= 2100;
        const label = validYear ? `${year} 年` : '（年份待确认）';
        const tags = validYear ? [`${year} 年`, '大事记'] : ['大事记', '年份待确认'];
        push(`大事记：${label}`, block.text, tags);
      }
      continue;
    }

    if (section.num === 4) {
      // 社区文化与梗：按行首 `- ` 切，一条一梗
      for (const block of splitBlocks(section.text, /^-\s+/gm, (_key, text) =>
        firstSentence(text),
      )) {
        push(`社区梗：${block.title}`, block.text, extractTags(block.text, ['社区文化']));
      }
      continue;
    }

    push(section.title, section.text, [section.title]);
  }

  return entries.map((entry) => ({
    ...entry,
    id: stableUuid(`boh-core-memory:${entry.slug}`),
  }));
};

/* ------------------------------------------------------------------ SQL */

const sqlText = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;
const sqlJson = (value) => `${sqlText(JSON.stringify(value))}::jsonb`;

const buildSql = (entries) => {
  const values = entries
    .map(
      (entry) =>
        `  (${[
          sqlText(entry.id),
          sqlText(entry.title),
          sqlText(entry.content),
          sqlText(entry.category),
          sqlJson(entry.tags),
          String(entry.priority),
          sqlText(SOURCE_LABEL),
          sqlText(''),
          sqlText('active'),
        ].join(', ')})`,
    )
    .join(',\n');

  return [
    'insert into public.boh_ai_core_memories',
    '  (id, title, content, category, tags, priority, source_label, source_url, status)',
    'values',
    values,
    'on conflict (id) do update set',
    '  title = excluded.title,',
    '  content = excluded.content,',
    '  category = excluded.category,',
    '  tags = excluded.tags,',
    '  priority = excluded.priority,',
    '  source_label = excluded.source_label,',
    '  status = excluded.status;',
  ].join('\n');
};

/* ------------------------------------------------------------------ 凭据 */

const resolveAccessToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const base64 = raw.replace(/^go-keyring-base64:/, '');
    const decoded = raw.startsWith('go-keyring-base64:')
      ? Buffer.from(base64, 'base64').toString('utf8').trim()
      : raw;
    return decoded;
  } catch (_error) {
    return '';
  }
};

const runSql = async (token, sql) => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Management API ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  return payload;
};

/* ------------------------------------------------------------------ 主流程 */

const sourcePath = path.resolve(cwd, SOURCE_FILE);
if (!fs.existsSync(sourcePath)) {
  console.error(`源文件不存在：${sourcePath}`);
  process.exit(1);
}

const entries = extractEntries(fs.readFileSync(sourcePath, 'utf8'));
if (entries.length === 0) {
  console.error('未解析出任何条目。');
  process.exit(1);
}

const byCategory = entries.reduce((acc, entry) => {
  acc[entry.category] = (acc[entry.category] || 0) + 1;
  return acc;
}, {});

if (hasFlag('--sql')) {
  const sql = buildSql(entries);
  const outFile = readArg('--out');
  if (outFile) {
    fs.writeFileSync(path.resolve(cwd, outFile), `${sql}\n`, 'utf8');
    console.log(`SQL 已写入 ${outFile}（${entries.length} 条）`);
  } else {
    console.log(sql);
  }
  process.exit(0);
}

if (hasFlag('--apply')) {
  const token = resolveAccessToken();
  if (!token) {
    console.error(
      '未取到 Management API token（环境变量 SUPABASE_ACCESS_TOKEN 或钥匙串「Supabase CLI」）。',
    );
    process.exit(1);
  }
  const result = await runSql(token, buildSql(entries));
  console.log(`已写入 ${entries.length} 条。返回：${JSON.stringify(result).slice(0, 300)}`);
  console.log(
    '下一步：到数据管理 → 官方事实 保存任意一条以触发向量索引，或调 EF action=sync sourceTypes=[core_memory]。',
  );
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun: true,
      source: SOURCE_FILE,
      total: entries.length,
      byCategory,
      entries: entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        priority: entry.priority,
        tags: entry.tags,
        contentChars: entry.content.length,
        preview: entry.content.slice(0, 60).replace(/\n/g, ' '),
      })),
    },
    null,
    2,
  ),
);
