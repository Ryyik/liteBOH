import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/2026100501_fix_ai_points_fraction_reservation.sql'),
  'utf8',
);

describe('AI 积分 reservation / fraction 越界防护', () => {
  it('预留按 points - fraction 扣除已有 pending，而不是只检查整分余额', () => {
    expect(migration).toContain(
      'v_available := greatest(0::numeric, v_points::numeric - v_fraction);',
    );
    expect(migration).toContain('IF v_pending + v_estimate > v_available THEN');
    expect(migration).not.toContain('IF v_points < 1 THEN');
  });

  it('结算对实际用量做可用余额上限保护', () => {
    expect(migration).toContain(
      'v_cost := least(v_cost, greatest(0::numeric, v_points::numeric - v_fraction));',
    );
    expect(migration).toContain('ai_points_fraction = coalesce(v_fraction, 0) + v_cost - v_deduct');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
