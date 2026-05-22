import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();

const loadEnvFile = (filename) => {
  const filePath = path.join(cwd, filename);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
};

loadEnvFile('.env');
loadEnvFile('.env.local');

const defaultCandidates = [
  'src/data/boh-knowledge-base.jsonl',
  'src/data/data:boh-knowledge-base.jsonl',
];

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const dryRun = hasFlag('--dry-run') || hasFlag('--check');
const inputArg = args.find((arg) => !arg.startsWith('-'));

if (hasFlag('--help') || hasFlag('-h')) {
  console.log('Usage: npm run import:boh-kb -- [--dry-run] [path/to/knowledge-base.jsonl]');
  console.log('Default path: src/data/boh-knowledge-base.jsonl');
  console.log('--dry-run / --check: validate JSONL and print an import summary without calling Supabase.');
  process.exit(0);
}

const inputPath = inputArg || defaultCandidates.find((candidate) => fs.existsSync(path.join(cwd, candidate)));

if (!inputPath) {
  console.error('Missing JSONL path. Example: npm run import:boh-kb -- src/data/boh-knowledge-base.jsonl');
  process.exit(1);
}

const absoluteInputPath = path.resolve(cwd, inputPath);
if (!fs.existsSync(absoluteInputPath)) {
  console.error(`JSONL file not found: ${absoluteInputPath}`);
  process.exit(1);
}

const jsonl = fs.readFileSync(absoluteInputPath, 'utf8').trim();
const rows = jsonl.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (rows.length === 0) {
  console.error('JSONL file is empty.');
  process.exit(1);
}

let firstChunk = {};
const chunkIds = new Set();
for (let index = 0; index < rows.length; index += 1) {
  try {
    const parsed = JSON.parse(rows[index]);
    if (index === 0) firstChunk = parsed;
    const chunkId = String(parsed.chunk_id || parsed.chunkId || '').trim();
    if (chunkId) chunkIds.add(chunkId);
  } catch (error) {
    console.error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    process.exit(1);
  }
}

const slug = String(firstChunk.source_id || firstChunk.sourceId || 'boh_kb_v1').trim();
const title = String(firstChunk.title || 'BOH AI 知识库').trim();
const version = String(firstChunk.version || new Date().toISOString().slice(0, 10)).trim();

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    file: path.relative(cwd, absoluteInputPath),
    slug,
    title,
    version,
    rows: rows.length,
    uniqueChunkIds: chunkIds.size,
  }, null, 2));
  process.exit(0);
}

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = String(
  process.env.VITE_SUPABASE_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || ''
).trim();
const syncSecret = String(process.env.BOH_AI_RETRIEVAL_SYNC_SECRET || '').trim();

if (!supabaseUrl || !anonKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

if (!syncSecret) {
  console.error('Missing BOH_AI_RETRIEVAL_SYNC_SECRET. Import requires admin sync secret.');
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/functions/v1/boh-ai-retrieval`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'x-retrieval-sync-secret': syncSecret,
  },
  body: JSON.stringify({
    action: 'import_knowledge_base',
    slug,
    title,
    version,
    visibility: 'public',
    jsonl,
    metadata: {
      importedFrom: path.relative(cwd, absoluteInputPath),
      importedAt: new Date().toISOString(),
      format: 'jsonl',
    },
  }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok || payload.ok === false) {
  console.error(`Import failed (${response.status}): ${payload.message || response.statusText}`);
  process.exit(1);
}

console.log(JSON.stringify(payload.data, null, 2));
