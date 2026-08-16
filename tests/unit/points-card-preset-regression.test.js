import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path) => readFileSync(resolve(import.meta.dirname, `../../${path}`), 'utf8');
const migration = readSource('supabase/migrations/2026081601_points_card_public_id_and_delete_recovery.sql');
const userSpace = readSource('src/views/user-center/UserSpace/UserSpaceMain.vue');

describe('points card preset regressions', () => {
  it('keeps the full Cloudinary public_id when validating the URL suffix', () => {
    expect(migration).toContain('char_length(v_path) - char_length(v_ext)');
    expect(migration).not.toContain('char_length(v_path) - char_length(v_ext) - 1');
    expect(migration).toContain("concat('/', v_image_public_id)");
  });

  it('preserves asset ownership before deleting a preset record', () => {
    expect(migration.indexOf('insert into public.cloudinary_pending_uploads')).toBeGreaterThan(-1);
    expect(migration.indexOf('insert into public.cloudinary_pending_uploads')).toBeLessThan(migration.lastIndexOf('delete from public.points_card_presets'));
  });

  it('removes the preset before starting non-blocking Cloudinary cleanup', () => {
    const deletePreset = userSpace.match(/const deletePointsCardPreset = async \(presetId\) => \{[\s\S]*?\n\};\n\nwatch\(/)?.[0] || '';
    expect(deletePreset.indexOf("supabase.rpc('delete_points_card_preset'")).toBeGreaterThan(-1);
    expect(deletePreset.indexOf("supabase.rpc('delete_points_card_preset'")).toBeLessThan(deletePreset.indexOf('void cleanupCloudinaryPointsCard'));
  });

  it('uses a free-form crop frame for points card uploads', () => {
    expect(userSpace).toContain("cropPurpose.value === 'points-card' ? null : 1");
  });
});
