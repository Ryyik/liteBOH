import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const vaultPath = resolve(projectRoot, 'supabase/functions/api-key-vault/index.ts');
const migrationPath = resolve(projectRoot, 'supabase/migrations/2026071602_ai_mode_token_multipliers.sql');

describe('BOH AI mode token multipliers', () => {
  it('charges pro, max and ultra progressively faster in the runtime', () => {
    const vault = readFileSync(vaultPath, 'utf8');
    expect(vault).toContain('pro: 2');
    expect(vault).toContain('max: 3');
    expect(vault).toContain('ultra: 4');
    expect(vault).toContain('getBilledTokenCountForMultiplier(rawReserveTokens, quotaMultiplier)');
    expect(vault).toContain('getBilledTokenCountForMultiplier(usage.totalTokens, quotaMultiplier)');
    expect(vault).toContain("quota_multiplier, status, min_tier");
  });

  it('matches mode IDs case-insensitively', () => {
    const vault = readFileSync(vaultPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');
    expect(vault).toContain("toText(mode, 80).toLowerCase()");
    // 2026-10-22：查询体抽到 `loadModelConfigRow(client, modeId)`（策略候选要走同一份缓存），
    // 参数名从 `mode` 变成 `modeId`。断言放宽成两者都接受，但仍锁住「必须走 ilike」——
    // 改成 `.eq('mode_id', ...)` 会当场红（mode_id 大小写混用：Air / Code / Ultra / 38Flash
    // vs fast / gemini，见 plans/030 D10）。
    expect(vault).toMatch(/\.ilike\('mode_id',\s*mode(Id)?\)/);
    expect(migration).toContain("lower(trim(coalesce(p_mode, '')))" );
  });

  it('enforces the same multipliers in database settlement', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain("when 'pro' then 2");
    expect(migration).toContain("when 'max' then 3");
    expect(migration).toContain("when 'ultra' then 4");
    expect(migration).toContain('ceil(v_total_tokens::numeric * public.get_ai_mode_token_multiplier(p_mode))');
    expect(migration).toContain('quota_multiplier numeric(6, 2)');
  });

  it('supports configurable Web Searching limits and an admin reset', () => {
    const vault = readFileSync(vaultPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');
    expect(vault).toContain('web_search_daily_limit');
    expect(vault).toContain('webSearchRemaining');
    expect(migration).toContain('admin_reset_all_ai_quotas');
    expect(migration).toContain('delete from public.ai_web_search_log');
  });
});
