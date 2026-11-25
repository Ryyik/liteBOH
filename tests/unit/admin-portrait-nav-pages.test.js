import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NAV_GROUPS,
  NAV_ROW_BY_ID,
  HIDDEN_TAB_IDS,
  LISTED_TAB_IDS,
  resolveNavAncestryForRow,
  resolveNavAncestryForTab,
  resolveNavContainer,
  resolveNavRowIdForModule,
} from '@/views/DataManagement/config/nav-groups.js';
import { tabs, tabModules } from '@/views/DataManagement/config/tabs.js';

/**
 * 竖屏「一页一层」整页目录的结构守卫（plans/049 期 1，2026-11-25）。
 *
 * ── 这道守卫防的是什么 ──────────────────────────────────────────────
 * 用户否掉了「侧拉面板切页面」，要求「像设置页一样一页一个完整页面」。
 * 整页目录的分层完全由 `config/nav-groups.js` 的树决定，没有类型能保证：
 *   · 某一行既不在任何组里、也没有 children ⇒ 它在整页模式下**永远点不到**
 *     （桌面侧栏看得见是因为从顶层平铺渲染，整页模式只渲染「当前层的 children」）
 *   · 某个容器 id 拼错 ⇒ `resolveNavContainer` 返回 null ⇒ 点进去是一片空白
 *   · 层级超过两层 ⇒ 返回条只能回到上一层，第三层的用户要连按三次才能出去
 *
 * ── 反证（改任一条都必须让它变红）───────────────────────────────────
 *   1) 把「保底中心」从 lottery 组里删掉 ⇒ 「每个可达页签都有祖先链」红
 *   2) 把 `resolveNavContainer` 的 `NAV_GROUPS.find` 改成找不存在的字段 ⇒ 「每个容器可解析」红
 *   3) 给「诊断」再加一层 children ⇒ 「层级深度 ≤ 2」红
 *   4) 在 `AdminSidebar.vue` 里加回 `translateX(-100%)` ⇒ 「窄屏抽屉已移除」红
 *   5) 把 `AdminNavPages` 的层级状态改成写 URL ⇒ 「目录层级不写 URL」红
 */

/** 模块 tabIds 里真实可达的页签（排除只为旧深链保留定义的 api-keys / freemodels） */
const reachableTabIds = () => {
  const set = new Set();
  tabModules.forEach((mod) => (mod.tabIds || []).forEach((id) => set.add(id)));
  return set;
};

/** 所有容器 id（分组 + 带 children 的行） */
const allContainerIds = () => {
  const ids = NAV_GROUPS.map((group) => group.id);
  NAV_ROW_BY_ID.forEach((row) => {
    if (Array.isArray(row.children) && row.children.length) ids.push(row.id);
  });
  return ids;
};

const readSrc = (relPath) => {
  const abs = resolve(process.cwd(), relPath);
  expect(existsSync(abs), `${relPath} 必须存在`).toBe(true);
  return readFileSync(abs, 'utf8');
};

/**
 * 去掉注释与字符串字面量后的「真实代码」。
 *
 * ⚠️ 源码级断言必须做这一步，否则断言会被**说明性注释**误伤：
 *    这些文件里到处写着「原来这里是 translateX(-100%)」「不能退化成 innerWidth < 768」
 *    —— 那是解释为什么删，不是代码本身。用原文匹配会得到「注释越详细、测试越红」
 *    这种荒谬结果（本测试第一版就是这么挂的）。
 */
const stripComments = (src) =>
  src
    // 块注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 行注释（避开 http:// 这类）
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('后台竖屏整页目录 · 分层完整性', () => {
  it('每个可达页签都能在层级树里找到祖先链（否则整页模式点不到它）', () => {
    const reachable = reachableTabIds();
    const hidden = new Set(HIDDEN_TAB_IDS);
    const orphans = [];
    tabs.forEach((tab) => {
      if (!reachable.has(tab.id)) return; // 旧深链遗留定义，不在导航里是刻意的
      if (hidden.has(tab.id)) return; // 刻意删入口（表保留），没有行是对的
      if (resolveNavAncestryForTab(tab.id).length === 0) orphans.push(tab.id);
    });
    expect(orphans, `这些页签没有祖先链，竖屏整页目录里无法到达`).toEqual([]);
  });

  it('每个「有独立行」的页签确实在该行的组里', () => {
    const mismatched = [];
    LISTED_TAB_IDS.forEach((tabId) => {
      const anc = resolveNavAncestryForTab(tabId);
      if (anc.length === 0) mismatched.push(tabId);
      // 最后一环必须是「包含该行」的容器，不能是空数组
      const last = anc[anc.length - 1];
      if (last && resolveNavContainer(last) === null) mismatched.push(`${tabId}:${last}`);
    });
    expect(mismatched).toEqual([]);
  });

  it('每个容器 id 都能解析出非空行列表（拼错会静默打开一个空页）', () => {
    const broken = [];
    allContainerIds().forEach((id) => {
      const container = resolveNavContainer(id);
      if (!container) broken.push(`${id}: null`);
      else if (!container.rows.length) broken.push(`${id}: empty`);
    });
    expect(broken).toEqual([]);
  });

  it('层级深度 ≤ 2（组 + 带子页的行），否则返回条要连按多次', () => {
    const tooDeep = [];
    tabs.forEach((tab) => {
      const depth = resolveNavAncestryForTab(tab.id).length;
      if (depth > 2) tooDeep.push(`${tab.id}: depth=${depth}`);
    });
    expect(tooDeep).toEqual([]);
  });

  it('叶子容器的行内不再有 children（第三层会破掉上面的深度假设）', () => {
    const nested = [];
    NAV_GROUPS.forEach((group) => {
      group.rows.forEach((row) => {
        if (!Array.isArray(row.children)) return;
        row.children.forEach((child) => {
          if (Array.isArray(child.children) && child.children.length) {
            nested.push(`${group.id}/${row.id}/${child.id}`);
          }
        });
      });
    });
    expect(nested).toEqual([]);
  });

  it('删除入口（HIDDEN_TAB_IDS）确实不在任何容器里（删入口 ≠ 留个死角）', () => {
    const leaked = HIDDEN_TAB_IDS.filter((id) => LISTED_TAB_IDS.has(id));
    expect(leaked).toEqual([]);
  });

  it('4 个装修控制台都能反查到「视觉装修」那一行', () => {
    ['hero-console', 'gate-console', 'xmas-console', 'avatar-console'].forEach((moduleId) => {
      const rowId = resolveNavRowIdForModule(moduleId);
      expect(rowId, `${moduleId} 必须有一行`).not.toBe('');
      expect(resolveNavAncestryForRow(rowId)).toContain('operations');
    });
  });
});

describe('后台竖屏整页目录 · 交互形态锁定', () => {
  /**
   * 这几条是**源码级**断言，不是行为断言。理由：本页的形态是「有没有抽屉」
   * 这类结构性事实，行为测试要靠探针（需要起 dev server），
   * 而源码里出现 translateX(-100%) 就一定意味着抽屉回来了。
   */
  it('AdminSidebar 里不再有窄屏滑出抽屉（translateX(-100%)）', () => {
    const src = stripComments(readSrc('src/views/DataManagement/components/AdminSidebar.vue'));
    expect(src).not.toContain('translateX(-100%)');
  });

  it('DataAdmin 在窄屏下不再渲染 AdminSidebar（改渲染整页目录）', () => {
    const src = readSrc('src/views/DataManagement/DataAdmin.vue');
    // 侧栏必须被 isNarrowNav 门控
    expect(src).toMatch(/<AdminSidebar\s+v-if="!isNarrowNav"/);
    // 整页目录必须在窄屏下渲染
    expect(src).toMatch(/<AdminNavPages\s+v-if="isNarrowNav/);
  });

  it('窄屏不再有遮罩层（整页目录是独立一页，不是浮层）', () => {
    const src = readSrc('src/views/DataManagement/DataAdmin.vue');
    // 模板里不应再有 sidebar-scrim 的实例
    const templatePart = src.slice(0, src.indexOf('<script'));
    expect(templatePart).not.toContain('sidebar-scrim');
  });

  it('AdminNavPages 的层级状态不写 URL（与设置页同一口径）', () => {
    const src = readSrc('src/views/DataManagement/components/AdminNavPages.vue');
    // 目录层级是纯内存态：写 URL 会让浏览器返回键在目录里打转
    expect(src).not.toMatch(/router\.(push|replace)/);
    expect(src).not.toContain('useRouter');
  });

  it('AdminNavPages 每层只渲染一张卡片 + 内缩发丝线（设置页 .gs-row 同款）', () => {
    const src = readSrc('src/views/DataManagement/components/AdminNavPages.vue');
    expect(src).toContain('.ap-rows');
    expect(src).toContain('--liquid-bg-strong');
    expect(src).toContain('--liquid-radius-md');
    // 发丝线必须是「+」相邻选择器（首行无线），不能是每行都画
    expect(src).toContain('.ap-row + .ap-row::before');
    // 选中态三通道里的蓝条用 ::after（::before 已被发丝线占用）
    expect(src).toContain('.ap-row.is-active::after');
  });

  it('竖屏目录行高 ≥ 44px（手指命中区底线）', () => {
    const src = readSrc('src/views/DataManagement/components/AdminNavPages.vue');
    const match = src.match(/\.ap-row\s*\{[^}]*min-height:\s*(\d+)px/);
    expect(match, '.ap-row 必须显式声明 min-height').toBeTruthy();
    expect(Number(match[1])).toBeGreaterThanOrEqual(44);
  });

  it('断点判据是 orientation 而不是 innerWidth（768×1024 竖屏平板也要走整页）', () => {
    const src = stripComments(readSrc('src/views/DataManagement/composables/useAdminViewport.js'));
    // 媒体查询串是字符串字面量，stripComments 不会动它
    expect(src).toContain('orientation: landscape');
    expect(src).toContain('min-width: 1024px');
    expect(src).toContain('min-height: 600px');
    // 不能退化成「窄屏才整页」，那样手机横屏(844×390)会被误判进两栏
    expect(src).not.toMatch(/innerWidth\s*[<>]=?\s*\d+/);
  });
});

describe('后台竖屏整页目录 · 搜索口径', () => {
  it('目录搜索复用 function-index（与侧栏同一份索引，不另造一份）', () => {
    const src = readSrc('src/views/DataManagement/components/AdminNavPages.vue');
    expect(src).toContain("from '../config/function-index.js'");
    expect(src).toContain('searchAdminFunctions');
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * 新增记录对象页（plans/049 期 2）—— 四条**实测踩出来的**缺陷
 *
 * 这一组全部来自浏览器实测（不是推理），每条都真实发生过：
 *   ① 路由顺序：`:tab/new` 排在 `:tab/:id` 之后 ⇒ 被通配吞掉
 *   ② 判据写错：拿 params.id === 'new' 判 ⇒ 恒 false（静态段不进 params）
 *   ③ TDZ：isCreateRecordPage 定义在使用点之后 ⇒ 整页白屏报错
 *   ④ 串页：新增页与列表共用组件，列表条件没排除新增态 ⇒ 两页叠在一起
 * 这四条都有「不报错、只是行为不对」或「整页崩」的特征，必须靠守卫锁住。
 * ══════════════════════════════════════════════════════════════════════ */
describe('新增记录对象页 · 实测缺陷守卫', () => {
  const routesSrc = () => readSrc('src/router/routes/admin.ts');
  const adminSrc = () => readSrc('src/views/DataManagement/DataAdmin.vue');

  it('① 新增路由必须排在 :tab/:id 之前（否则被通配吞掉）', () => {
    const src = routesSrc();
    const createIdx = src.indexOf("path: '/admin/data-management/:tab/new'");
    const recordIdx = src.indexOf("path: '/admin/data-management/:tab/:id'");
    expect(createIdx, '找不到新增路由').toBeGreaterThan(-1);
    expect(recordIdx, '找不到详情路由').toBeGreaterThan(-1);
    expect(createIdx, '新增路由必须写在详情路由之前').toBeLessThan(recordIdx);
  });

  it("② 新增页判据必须用路由名，不能用 params.id === 'new'", () => {
    // 只看代码，不看注释 —— 源码里有一段注释专门写「不能按 id 判」，
    // 直接匹配原文会被那段解释误伤（注释越详细、测试越红）。
    const src = stripComments(adminSrc());
    // 静态段 `new` 不会进 params —— 按 id 判会恒 false 且无任何报错
    expect(src).toContain("route.name === 'DataManagementCreate'");
    expect(src).not.toMatch(/params\.id\s*===\s*['"]new['"]/);
  });

  it('③ isCreateRecordPage 必须在使用点之前定义（TDZ 会打崩整页）', () => {
    const src = adminSrc();
    const defIdx = src.indexOf('const isCreateRecordPage = computed');
    const firstUseIdx = src.indexOf('isCreateRecordPage.value');
    const templateUseIdx = src.indexOf('v-if="isCreateRecordPage');
    expect(defIdx, '找不到 isCreateRecordPage 定义').toBeGreaterThan(-1);
    expect(firstUseIdx, '找不到 script 里的使用点').toBeGreaterThan(-1);
    expect(defIdx, '定义必须在 script 首个使用点之前').toBeLessThan(firstUseIdx);
    // 模板在文件最前面（<template> 在前），它的求值发生在 setup 之后 —— 只要
    // script 内部顺序对，模板就安全。这里仍断言模板确实用到了它。
    expect(templateUseIdx).toBeGreaterThan(-1);
  });

  it('④ 列表 section 必须排除新增态（否则两页串成一页）', () => {
    const src = adminSrc();
    // 列表分支是 id="data-console" 那个 section
    const listSection = src.match(
      /<section\s+v-if="isDataConsoleSection[^"]*"\s+id="data-console"/,
    );
    expect(listSection, '找不到列表 section，或条件已被改写').toBeTruthy();
    expect(listSection[0], '列表条件必须同时排除 recordId 与 isCreateRecordPage').toContain(
      '!isCreateRecordPage',
    );
  });

  it('⑤ 编辑表单绑定只有一份真源（三个实例共用 editorBindings）', () => {
    const src = adminSrc();
    const instances = src.match(/<EditDrawer[\s\S]*?\/>/g) || [];
    expect(instances.length, '详情 / 新增 / 兜底 三个实例').toBe(3);
    instances.forEach((tag) =>
      expect(tag, '每个实例都必须 v-bind="editorBindings"').toContain('v-bind="editorBindings"'),
    );
  });

  it('⑥ 操作条给表单让出的底部留白 ≥ 操作条高度（否则最后一项点不到）', () => {
    const src = adminSrc();
    const pad = src.match(/\.create-record-section\s*\{[^}]*padding-bottom:\s*calc\((\d+)px/);
    expect(pad, '找不到 .create-record-section 的 padding-bottom').toBeTruthy();
    // 实测操作条 66px（44 按钮 + 20 内距 + 边框），留白必须大于它
    expect(Number(pad[1]), '留白小于操作条高度时，滚到底也够不到最后一项').toBeGreaterThanOrEqual(
      66,
    );
  });
});
