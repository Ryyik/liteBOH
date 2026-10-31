import { describe, expect, it } from 'vitest';
import { adminRoutes } from '../../src/router/routes/admin.js';
import { ADMIN_PAGE_META, tabModules } from '../../src/views/DataManagement/config/tabs.js';
import { ROUTE_MAP } from '../../src/views/DataManagement/composables/useDataAdminNavigation.js';
import { canViewModule } from '../../src/views/DataManagement/config/rbac.js';

/**
 * 后台「独立控制台页」的接线完整性。
 *
 * 真事故（2026-10-31）：`/admin/gate-console` 路由建好了、概览页也有快捷格子，
 * 但**没登记进 tabModules** ⇒ 侧栏与命令面板里都没有入口，只能手敲地址或从概览页绕。
 * 这类漏不会报错、不会白屏，只是「找不到」，靠肉眼发现不了。
 *
 * 所以这里守的不是某个 id 写没写，而是**关系**：
 * 每个 /admin/<name>-console 路由，都必须在侧栏有一席之地、有落点、有页头元信息。
 */

/** 从路由表里挑出「独立控制台页」：/admin/xxx-console 且不是数据管理面板本身。 */
const consoleRoutes = adminRoutes.filter(
  (route) => /^\/admin\/[a-z0-9-]+-console$/.test(route.path) && route.name,
);

const consoleIds = consoleRoutes.map((route) => route.path.replace('/admin/', ''));

describe('独立控制台页的接线（路由 ↔ 侧栏 ↔ 落点 ↔ 权限）', () => {
  it('确实有多个控制台页（避免正则写错导致这个文件变成空跑）', () => {
    // 空数组会让下面所有 for 循环假绿 —— 这类「守卫自己先失效」比没守卫更糟
    expect(consoleIds.length).toBeGreaterThanOrEqual(3);
    expect(consoleIds).toContain('gate-console');
  });

  it('每个控制台页都在 tabModules 里有一条 page 型模块（否则侧栏里没有入口）', () => {
    for (const id of consoleIds) {
      const mod = tabModules.find((item) => item.id === id);
      expect(mod, `${id} 未登记进 tabModules`).toBeTruthy();
      expect(mod.type, `${id} 的 type 必须是 page，否则点击会走 switchTab 分支`).toBe('page');
      // 侧栏按 section 分组渲染，'data' 是唯一会出现在「数据管理」组里的值
      expect(mod.section, `${id} 的 section 必须是 data`).toBe('data');
      expect(
        mod.icon,
        `${id} 的 icon 必须是 lucide 组件（侧栏用 <component :is> 渲染）`,
      ).toBeTruthy();
      // lucide-vue-next 导出的图标是函数式组件（typeof 'function'），不是对象 —— 别按对象断言
      expect(['function', 'object']).toContain(typeof mod.icon);
      expect(String(mod.label || '').trim()).not.toBe('');
    }
  });

  it('每个控制台页都有 ROUTE_MAP 落点（否则点侧栏静默无反应）', () => {
    for (const route of consoleRoutes) {
      const id = route.path.replace('/admin/', '');
      expect(ROUTE_MAP[id], `${id} 缺少 ROUTE_MAP 条目`).toBe(route.path);
    }
  });

  it('每个控制台页都有 ADMIN_PAGE_META（页头 eyebrow/title 的单一真源）', () => {
    for (const id of consoleIds) {
      expect(ADMIN_PAGE_META[id], `${id} 缺少 ADMIN_PAGE_META`).toBeTruthy();
      expect(String(ADMIN_PAGE_META[id].title || '').trim()).not.toBe('');
    }
  });

  it('控制台页只给 admin：版主看不到侧栏条目（未声明也会兜底成 admin，这里锁死意图）', () => {
    for (const id of consoleIds) {
      expect(canViewModule('admin', id), `${id} 应对 admin 可见`).toBe(true);
      expect(canViewModule('moderator', id), `${id} 不应对 moderator 可见`).toBe(false);
      expect(canViewModule('user', id), `${id} 不应对普通用户可见`).toBe(false);
    }
  });

  it('控制台路由都要求管理员，且不进导航栏', () => {
    for (const route of consoleRoutes) {
      expect(route.meta?.requiresAdmin, `${route.path} 缺少 requiresAdmin`).toBe(true);
      expect(route.meta?.hideNavbar, `${route.path} 应 hideNavbar`).toBe(true);
    }
  });
});
