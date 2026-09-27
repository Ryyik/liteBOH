import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectReExportRuntimeBindingIssues,
  collectStructureReport,
} from '../../scripts/check-project-structure.mjs';

describe('project structure', () => {
  it('keeps route imports, view layout, and migration docs clean', () => {
    const report = collectStructureReport(process.cwd());

    // 超时由 vitest.config.js 的 testTimeout 统一兜底（见那里的注释）：
    // 这条用例是同步全仓扫描，并发跑时受 CPU 争抢影响很大，时长不该写死在这里。
    expect(report.errors).toEqual([]);
  });

  it('catches re-exported names used as missing runtime bindings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'boh-structure-'));
    try {
      const srcDir = path.join(root, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        path.join(srcDir, 'api.js'),
        [
          "export { getThing } from './thing.js';",
          'export function runThing() {',
          '  return getThing();',
          '}',
        ].join('\n'),
      );

      const issues = collectReExportRuntimeBindingIssues(root);

      expect(issues).toEqual(['转发导出未创建本地绑定，但文件内部引用了 getThing: src/api.js']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
