import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

describe('data admin density overhaul', () => {
  it('keeps row actions single-line (primary inline + overflow menu)', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('getRowActionModel(item).primary');
    expect(view).toContain('getRowActionModel(item).menu');
    expect(view).toContain('row-float-menu');
    // 表格行内删除图标仅保留卡片视图一处，表格 actions 列已收进 ⋯ 菜单
    const deleteIconCount = view.split('class="icon-btn delete"').length - 1;
    expect(deleteIconCount).toBe(1);
    expect(view).toContain('lottery-card-actions');
  });

  it('compresses toolbars into title row + floating bulk bar', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('bulk-bar');
    expect(view).toContain('toolbarMenuItems');
    expect(view).toContain('density-toggle');
    expect(view).not.toContain('table-mini-stats');
    // 列 hug 内容：表格按内容撑宽，多余空白留右侧而非摊进列间距
    expect(view).toContain('width: max-content');
  });

  it('truncates UUID id columns', () => {
    const tables = read('src/views/DataManagement/config/tables.js');
    expect(tables).toContain("label: 'ID', maxLength: 12");
    expect(tables).not.toContain("label: 'ID', maxLength: 24");
  });
});

describe('data admin editing flow', () => {
  it('remembers drawer groups and supports save-and-next', () => {
    const drawer = read('src/views/DataManagement/components/EditDrawer.vue');
    expect(drawer).toContain('dm-drawer-groups-v1');
    expect(drawer).toContain('save-and-next');
    expect(drawer).toContain('save-and-create');
    expect(drawer).toContain('revealField');
    expect(drawer).toContain('onImagePaste');
    expect(drawer).toContain('onImageDrop');
  });

  it('routes cell pencils to inline edit or drawer field focus', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('quickEditCell');
    expect(view).toContain('isCellEditable');
    expect(view).toContain('focusField');
  });

  it('patches single rows and advances moderation with undo', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('patchStoreRow');
    expect(view).toContain('moderateAndAdvance');
    expect(view).toContain('undoModeration');
    expect(view).toContain('toast-action');
  });

  it('expands collapsed sidebar on hover and persists preference', () => {
    const sidebar = read('src/views/DataManagement/components/AdminSidebar.vue');
    expect(sidebar).toContain('.is-collapsed:hover');
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('dm-sidebar-collapsed');
  });

  it('treats landscape phones as mobile and compresses short viewports', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('pointer: coarse');
    expect(view).toContain('computeMobileView');
    const css = read('src/views/DataManagement/styles/responsive.css');
    expect(css).toContain('(orientation: landscape) and (max-height: 500px)');
  });
});
describe('data admin overview cockpit', () => {
  it('renders todo band + KPI drill + quick grid without tabs', () => {
    const overview = read('src/views/DataManagement/components/AdminOverview.vue');
    expect(overview).toContain('g-todo-band');
    expect(overview).toContain('g-quick-grid');
    expect(overview).toContain('g-cloud-details');
    expect(overview).toContain("quick-create', 'lotteries'");
    expect(overview).not.toContain('DashboardTabs');
  });
});
