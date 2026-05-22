import { describe, expect, it } from 'vitest';
import { collectStructureReport } from '../../scripts/check-project-structure.mjs';

describe('project structure', () => {
  it('keeps route imports, view layout, and migration docs clean', () => {
    const report = collectStructureReport(process.cwd());

    expect(report.errors).toEqual([]);
  });
});
