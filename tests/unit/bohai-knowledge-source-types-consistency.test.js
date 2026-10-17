import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// 知识源白名单「三处一致性」守卫 —— knowledge-search-api.js 头注释里的铁律：
//   EF SOURCE_TYPES ↔ DB CHECK（迁移）↔ 前端 ALLOWED_KNOWLEDGE_SOURCE_TYPES
// 任一漏加 = 检索**静默**少一类结果（不报错，2026-10-16 活动报名明细同款事故形态）。
// 2026-10-17 加 site_news / site_activity（官方新闻/活动自动扩充知识库）时建此守卫。
// 新增知识源时：改三处 + 本文件的 EXPECTED，一处都不能少。

const EXPECTED = [
  'core_memory',
  'shared_memory',
  'cloud_entry',
  'knowledge_base',
  'forum_memory',
  'site_news',
  'site_activity',
];

const extractFromEf = (text) => {
  const block = text.match(/const SOURCE_TYPES = new Set<SourceType>\(\[[\s\S]*?\]\);/);
  return block ? [...block[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
};

const extractFromMigration = (text) => {
  const block = text.match(/add constraint boh_ai_knowledge_chunks_source_type_check[\s\S]*?\);/);
  return block ? [...block[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
};

const extractFromFrontend = (text) => {
  const block = text.match(/const ALLOWED_KNOWLEDGE_SOURCE_TYPES = \[[\s\S]*?\];/);
  return block ? [...block[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
};

describe('知识源白名单三处一致性（EF ↔ DB CHECK ↔ 前端）', () => {
  const efTypes = extractFromEf(read('supabase/functions/boh-ai-retrieval/index.ts'));
  const dbTypes = extractFromMigration(
    read('supabase/migrations/2026101701_boh_ai_site_content_sources.sql'),
  );
  const frontendTypes = extractFromFrontend(read('src/utils/api/treehole/knowledge-search-api.js'));

  it('三类提取器都真的抓到了内容（防选择器写错导致空断言假绿）', () => {
    expect(efTypes.length).toBeGreaterThan(0);
    expect(dbTypes.length).toBeGreaterThan(0);
    expect(frontendTypes.length).toBeGreaterThan(0);
  });

  it('EF SOURCE_TYPES 与期望集合一致', () => {
    expect([...efTypes].sort()).toEqual([...EXPECTED].sort());
  });

  it('DB CHECK 白名单与期望集合一致', () => {
    expect([...dbTypes].sort()).toEqual([...EXPECTED].sort());
  });

  it('前端 ALLOWED_KNOWLEDGE_SOURCE_TYPES 与期望集合一致', () => {
    expect([...frontendTypes].sort()).toEqual([...EXPECTED].sort());
  });
});
