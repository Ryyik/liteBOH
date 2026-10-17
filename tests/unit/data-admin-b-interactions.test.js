import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('batch B interactions wiring', () => {
  const view = read('src/views/DataManagement/DataAdmin.vue');

  it('4.1 悬停复制：CopyCell 存在（含降级路径）并接进表格 cell 分支', () => {
    const cell = read('src/views/DataManagement/components/shared/CopyCell.vue');
    expect(cell).toContain('execCommand');
    expect(cell).toContain('copy-failed');
    expect(view).toContain('<CopyCell');
    expect(view).toContain('col.copyable');
    expect(view).toContain('复制失败，请手动选择');
  });

  it('4.1 列配置：columns 里的 id/email 列全部带 copyable', () => {
    const tables = read('src/views/DataManagement/config/tables.js');
    const idEmailCols = tables.match(/^      \{ key: '(?:id|email)'.*$/gm) || [];
    const withCopyable = idEmailCols.filter((line) => line.includes('copyable: true'));
    expect(idEmailCols.length).toBeGreaterThan(30);
    expect(withCopyable.length).toBe(idEmailCols.length);
  });

  it('4.2 Shift 区间选择：三处勾选框（桌面表格/移动卡片/卡片视图）都走 onRowCheckboxChange', () => {
    expect(view).toContain('lastSelectedIndex');
    expect(view).toMatch(/const onRowCheckboxChange = \(item, event\) =>/);
    const bindings = view.match(/@click="onRowCheckboxChange\(item, \$event\)"/g) || [];
    expect(bindings.length).toBe(3);
    // ⚠️ 必须挂 @click：change 是普通 Event 不带 shiftKey（探针实测）
    expect(view).not.toContain('@change="onRowCheckboxChange');
    expect(view).not.toContain('@change="toggleSelect(item)"');
  });

  it('4.5 ? 快捷键：帮助浮层组件 + ? 分支 + J/K 行移动 + Esc 先关帮助', () => {
    const help = read('src/views/DataManagement/components/shared/ShortcutHelp.vue');
    // 遮罩复用命令面板类（不新增裸色值）
    expect(help).toContain('command-palette-overlay');
    expect(help).toContain('lastActive');
    const sc = read('src/views/DataManagement/composables/useDataAdminShortcuts.js');
    expect(sc).toContain("e.key === '?'");
    expect(sc).toContain("e.key === 'j'");
    expect(sc).toContain("e.key === 'k'");
    expect(sc).toContain('shortcutHelpRef.value = false');
    expect(view).toContain('<ShortcutHelp');
    expect(view).toContain('showShortcutHelp');
  });

  it('S1 回归：「跨页全选」保持归零', () => {
    expect(view).not.toContain('跨页全选');
  });
});
