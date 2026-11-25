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
    // 用正则而不是固定字符串：列对象上除了 maxLength 还会挂 defaultVisible /
    // copyable 等属性，2026-11-12 加 defaultVisible 就把 toContain 打断了。
    // 断言的是「ID 列一律 12 字截断」，跟属性顺序无关。
    expect(tables).toMatch(/label: 'ID',[^}]*maxLength: 12/);
    expect(tables).not.toMatch(/label: 'ID',[^}]*maxLength: (?!12\b)\d+/);
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
    // 2026-11-23 plans/045 阶段 1：手写 toast 换全站 bohtoast 通道，
    // 「撤销」从 toast-action 按钮改为 bohtoast action 对象（宿主渲染）
    expect(view).toContain('boh-toast-controller.js');
    expect(view).toContain("label: '撤销'");
    expect(view).toContain('run: () => undoModeration');
  });

  it('narrow/short-landscape uses a full-page nav instead of a drawer', () => {
    /* 2026-11-25 行为变更（plans/049 期 1）：用户明确否掉了抽屉形态 ——
       「不再采用侧拉面板切页面了，而是改成像现在网站的设置页一样一页一个完整页面」。
       原来的断言（锁 `.g-sidebar` 的 translateX(-100%) + `.g-sidebar.open`）
       现在锁定的是**已废弃的行为**，必须改写成锁新行为。

       ⚠️ 这条测试的名字也一起改了：名字写着 drawer 但断言整页目录，
          下一个人读测试列表时会以为断言写错了。

       新口径：窄屏不渲染侧栏，改渲染整页目录（AdminNavPages），
       且侧栏里不应再残留抽屉的 transform。 */
    const sidebar = read('src/views/DataManagement/components/AdminSidebar.vue');
    expect(sidebar).not.toContain('transform: translateX(-100%)');

    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toMatch(/<AdminSidebar\s+v-if="!isNarrowNav"/);
    expect(view).toMatch(/<AdminNavPages\s+v-if="isNarrowNav/);
    // 竖屏整页目录必须有返回条（一页一层，靠它退出）
    const navPages = read('src/views/DataManagement/components/AdminNavPages.vue');
    expect(navPages).toContain('ap-back');
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

describe('data admin density tiers (plans/027 4.4)', () => {
  const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

  it('standard 为默认档，三档齐全', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain("['compact', 'standard', 'comfortable']");
    expect(view).toContain("density === 'standard'");
    expect(view).toContain("data-density='standard']");
    // 三档 padding：compact 4px / standard 8px / comfortable 12px
    expect(view).toContain("data-density='comfortable']");
  });
});
