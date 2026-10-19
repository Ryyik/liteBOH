/**
 * seed-boh-entities.mjs — 把 `src/data/boh-entity-aliases.json` 播种到
 * `boh_ai_entities` + `boh_ai_entity_aliases`。
 *
 * 用法：
 *   npm run seed:boh-entities -- --dry-run   # 只校验 JSON，不连库
 *   npm run seed:boh-entities                # 写库（需要 service role）
 *
 * 设计：
 *   - JSON 是 bootstrap 单一真源；DB 是运行期真源。
 *   - 每个实体按 `(entity_type, canonical_name)` upsert，随后**整体替换**它的别名
 *     （先 delete 再 insert），保证删别名也能同步，不会残留。
 *   - 不删除实体本身：实体下线走 status='archived'，避免误删历史事实的 people_ids。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { normalizeEntityText } from '../src/utils/boh-entity-normalize.js';

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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--check');
const jsonPath = path.resolve(cwd, 'src/data/boh-entity-aliases.json');
if (!fs.existsSync(jsonPath)) {
  console.error(`Missing entity alias file: ${jsonPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const entities = Array.isArray(payload.entities) ? payload.entities : [];
if (entities.length === 0) {
  console.error('No entities found in JSON.');
  process.exit(1);
}

const prepared = [];
const seenAliases = new Map();
for (const entity of entities) {
  const canonicalName = String(entity.canonicalName || '').trim();
  if (!canonicalName) {
    console.error('Entity missing canonicalName:', entity.id);
    process.exit(1);
  }
  const slug = String(entity.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/i.test(slug)) {
    console.error(`Entity "${canonicalName}" has invalid slug: "${slug}"`);
    process.exit(1);
  }
  const aliases = [];
  for (const alias of entity.aliases || []) {
    const value = String(alias.value || '').trim();
    const normalized = normalizeEntityText(value);
    if (!value || !normalized) continue;
    if (!alias.ambiguous) {
      const existing = seenAliases.get(normalized);
      if (existing && existing !== canonicalName) {
        console.error(
          `Ambiguous alias "${value}" maps to both "${existing}" and "${canonicalName}". ` +
            'Mark it is_ambiguous=true or remove the duplicate.',
        );
        process.exit(1);
      }
      seenAliases.set(normalized, canonicalName);
    }
    aliases.push({
      alias: value,
      normalized_alias: normalized,
      alias_type: String(alias.type || 'nickname').trim() || 'nickname',
      confidence: Number.isFinite(Number(alias.confidence)) ? Number(alias.confidence) : 1,
      is_ambiguous: Boolean(alias.ambiguous),
      source: 'bootstrap-json',
    });
  }
  if (aliases.length === 0) {
    console.error(`Entity "${canonicalName}" has no usable aliases.`);
    process.exit(1);
  }
  prepared.push({
    id: String(entity.id || '').trim() || null,
    entity_type: 'person',
    canonical_name: canonicalName,
    display_name: String(entity.displayName || canonicalName).trim(),
    summary: String(entity.summary || '').trim(),
    aliases,
  });
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        file: path.relative(cwd, jsonPath),
        entities: prepared.length,
        aliases: prepared.reduce((sum, entity) => sum + entity.aliases.length, 0),
        canonicalNames: prepared.map((entity) => entity.canonical_name),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

let entityCount = 0;
let aliasCount = 0;
for (const entity of prepared) {
  const { data, error } = await client
    .from('boh_ai_entities')
    .upsert(
      {
        slug: entity.id,
        entity_type: entity.entity_type,
        canonical_name: entity.canonical_name,
        display_name: entity.display_name,
        summary: entity.summary,
        status: 'active',
      },
      { onConflict: 'entity_type,canonical_name' },
    )
    .select('id')
    .single();
  if (error) {
    console.error(`Entity upsert failed (${entity.canonical_name}):`, error.message);
    process.exit(1);
  }
  const entityId = String(data?.id || '').trim();
  if (!entityId) {
    console.error(`Entity upsert returned no id (${entity.canonical_name}).`);
    process.exit(1);
  }
  entityCount += 1;

  const { error: deleteError } = await client
    .from('boh_ai_entity_aliases')
    .delete()
    .eq('entity_id', entityId);
  if (deleteError) {
    console.error(`Alias cleanup failed (${entity.canonical_name}):`, deleteError.message);
    process.exit(1);
  }

  const rows = entity.aliases.map((alias) => ({ ...alias, entity_id: entityId }));
  const { error: insertError } = await client.from('boh_ai_entity_aliases').insert(rows);
  if (insertError) {
    console.error(`Alias insert failed (${entity.canonical_name}):`, insertError.message);
    process.exit(1);
  }
  aliasCount += rows.length;
}

console.log(
  JSON.stringify(
    { ok: true, entities: entityCount, aliases: aliasCount, source: path.relative(cwd, jsonPath) },
    null,
    2,
  ),
);
