/**
 * build-boh-entity-seed-sql.mjs — 从 `src/data/boh-entity-aliases.json` 生成
 * 可重复执行的 seed 迁移 `supabase/migrations/2026101902_seed_boh_entities.sql`。
 *
 * 为什么不用 `seed-boh-entities.mjs` 直接写库：本机到 Supabase REST 的 HTTPS 被拦
 * （SSL_ERROR_SYSCALL），但 Supabase CLI 的数据库连接是通的。seed 迁移走 CLI 的
 * `db push`，能把同一份 JSON 灌进去；REST 恢复后仍可用原脚本做增量更新。
 *
 * 用法：npm run seed:boh-entities:sql && supabase db push --yes
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { normalizeEntityText } from '../src/utils/boh-entity-normalize.js';

const cwd = process.cwd();
const jsonPath = path.resolve(cwd, 'src/data/boh-entity-aliases.json');
const outputPath = path.resolve(cwd, 'supabase/migrations/2026101902_seed_boh_entities.sql');

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const entities = Array.isArray(payload.entities) ? payload.entities : [];
if (entities.length === 0) {
  console.error('No entities found in JSON.');
  process.exit(1);
}

const escapeSql = (value) => String(value ?? '').replace(/'/g, "''");

const entityValues = entities
  .map(
    (entity) =>
      `  ('${escapeSql(entity.id)}', 'person', '${escapeSql(entity.canonicalName)}', '${escapeSql(
        entity.displayName || entity.canonicalName,
      )}', '${escapeSql(entity.summary || '')}')`,
  )
  .join(',\n');

const aliasValues = entities
  .flatMap((entity) =>
    (entity.aliases || []).map((alias) => {
      const confidence = Number.isFinite(Number(alias.confidence)) ? Number(alias.confidence) : 1;
      return `  ('${escapeSql(entity.id)}', '${escapeSql(alias.value)}', '${escapeSql(
        normalizeEntityText(alias.value),
      )}', '${escapeSql(alias.type || 'nickname')}', ${confidence}, ${
        alias.ambiguous ? 'true' : 'false'
      })`;
    }),
  )
  .join(',\n');

const sql = `-- 由 scripts/build-boh-entity-seed-sql.mjs 从 src/data/boh-entity-aliases.json 生成。
-- 不要手改；改 JSON 后重新生成并 db push。
-- 幂等：实体按 (entity_type, canonical_name) upsert；只替换 source='bootstrap-json' 的别名，
-- 不会覆盖后台手工维护的别名。

begin;

insert into public.boh_ai_entities (slug, entity_type, canonical_name, display_name, summary)
values
${entityValues}
on conflict (entity_type, canonical_name) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  summary = excluded.summary,
  status = 'active';

delete from public.boh_ai_entity_aliases where source = 'bootstrap-json';

insert into public.boh_ai_entity_aliases
  (entity_id, alias, normalized_alias, alias_type, source, confidence, is_ambiguous)
select
  e.id,
  v.alias,
  v.normalized_alias,
  v.alias_type,
  'bootstrap-json',
  v.confidence,
  v.is_ambiguous
from (values
${aliasValues}
) as v(slug, alias, normalized_alias, alias_type, confidence, is_ambiguous)
join public.boh_ai_entities e on e.slug = v.slug;

commit;
`;

fs.writeFileSync(outputPath, sql, 'utf8');
console.log(
  JSON.stringify(
    {
      ok: true,
      output: path.relative(cwd, outputPath),
      entities: entities.length,
      aliases: entities.reduce((sum, entity) => sum + (entity.aliases || []).length, 0),
    },
    null,
    2,
  ),
);
