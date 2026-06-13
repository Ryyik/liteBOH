import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectReExportRuntimeBindingIssues,
  collectStructureReport
} from '../../scripts/check-project-structure.mjs';

describe('project structure', () => {
  it('keeps route imports, view layout, and migration docs clean', () => {
    const report = collectStructureReport(process.cwd());

    expect(report.errors).toEqual([]);
  });

  it('catches re-exported names used as missing runtime bindings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'boh-structure-'));
    try {
      const srcDir = path.join(root, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(path.join(srcDir, 'api.js'), [
        "export { getThing } from './thing.js';",
        'export function runThing() {',
        '  return getThing();',
        '}'
      ].join('\n'));

      const issues = collectReExportRuntimeBindingIssues(root);

      expect(issues).toEqual([
        '转发导出未创建本地绑定，但文件内部引用了 getThing: src/api.js'
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
