import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('每个控制台页都套了 AdminConsoleShell（否则进页后侧栏消失，只能退回再进）', () => {
    // 真事故（2026-11-01）：四个控制台都是独立路由页，进去后整个侧栏消失，
    // 想切模块只能先退回数据管理。这类缺口不报错、不白屏，只是「不好用」，
    // 肉眼要跑一遍才感觉得到 —— 所以在这里锁死：页面必须套统一外壳。
    for (const route of consoleRoutes) {
      const id = route.path.replace('/admin/', '');
      const file = routeComponentFile(route);
      expect(file, `${route.path} 解析不到组件路径`).toBeTruthy();
      const code = readFileSync(file, 'utf8');
      expect(code, `${id} 没有使用 AdminConsoleShell（进页会变成没有侧栏的孤岛）`).toContain(
        'AdminConsoleShell',
      );
      // 允许属性被格式化换行：用正则而不是裸 toContain
      expect(
        new RegExp(`active-module\\s*=\\s*["']${id}["']`).test(code),
        `${id} 的 active-module 应等于 ${id}（否则侧栏不会高亮当前页）`,
      ).toBe(true);
    }
  });

  it('控制台壳必须关掉侧栏的两个快捷按钮（它们在独立页里没有实现 = 死按钮）', () => {
    // 真缺陷（2026-11-01 复核）：AdminSidebar 的「新增记录 / 刷新数据」emit
    // `create-record` / `refresh-data`，实现只存在于数据管理面板（需要当前列表上下文）。
    // 四个独立控制台页套壳后原来没传这个开关 ⇒ 点下去无反应、无提示的死按钮。
    const shell = readFileSync(
      resolve(
        import.meta.dirname,
        '../../src/views/DataManagement/components/AdminConsoleShell.vue',
      ),
      'utf8',
    );
    expect(
      /:?show-quick-actions\s*=\s*["']false["']/.test(shell),
      '壳必须传 show-quick-actions=false，否则四个控制台页会出现死按钮',
    ).toBe(true);

    // 侧栏侧必须真的按这个开关渲染 —— 否则壳里关的是个不存在的属性，测试会假绿
    const sidebar = readFileSync(
      resolve(import.meta.dirname, '../../src/views/DataManagement/components/AdminSidebar.vue'),
      'utf8',
    );
    expect(
      /v-if\s*=\s*["']showQuickActions["']/.test(sidebar),
      '侧栏的快捷操作区必须由 showQuickActions 控制渲染',
    ).toBe(true);
  });
});

/**
 * 从懒加载路由里取出组件文件路径。
 *
 * ⚠️ 别按 `() => import('../../views/Xxx/index.vue')` 的**源码形态**去匹配：
 * vitest 会把动态 import 改写成 `__vite_ssr_dynamic_import__("/src/views/...")`，
 * 源码里的相对路径到不了运行时（2026-11-01 实测踩到，报「解析不到组件路径」）。
 * 所以只抓「任意引号包起来的 .vue 路径」，再按是否以 / 开头分两种基准解析。
 */
function routeComponentFile(route) {
  const match = String(route.component).match(/["']([^"']+\.vue)["']/);
  if (!match) return null;
  const spec = match[1];
  // 运行时形态是项目根绝对路径 /src/views/...；源码形态是相对 src/router/routes 的 ../../views/...
  if (spec.startsWith('/')) return resolve(import.meta.dirname, '../..', spec.slice(1));
  return resolve(import.meta.dirname, '../../src/router/routes', spec);
}
