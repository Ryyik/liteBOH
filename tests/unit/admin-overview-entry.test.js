import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminRoutes } from '@/router/routes/admin.ts';
import { compatRoutes } from '@/router/routes/compat.ts';

// =====================================================================
// 管理台「概览页」入口守卫（2026-11-14）
//
//   事故背景：`/admin/overview` 的组件、方案、单测都齐了，但**全仓没有任何
//   链接指向它**，也没有 `/admin` 根路由 —— 唯一打开方式是手敲 URL，
//   裸 `/admin` 直接 404。属于「做了但打不开」。
//
//   反证：把 admin.ts 里的 `/admin` redirect 去掉 → 第 1 条必红；
//        把 AdminSidebar 的 router-link 删掉 → 第 2 条必红。
// =====================================================================

describe('管理台概览页入口', () => {
  it('/admin 根路由重定向到 /admin/overview（重定向登在 compat.ts，不许散进 admin.ts）', () => {
    const root = compatRoutes.find((route) => route.path === '/admin');
    expect(root, 'compat.ts 里没有 /admin 重定向（裸 /admin 会 404）').toBeTruthy();
    expect(root.redirect).toBe('/admin/overview');
    // 反向：真页面路由文件里不许有 redirect（compat-routes.test.js 的主口径，这里就近再锁一次）
    expect(adminRoutes.some((route) => route.redirect)).toBe(false);
  });

  it('/admin/overview 路由仍然存在且指向 AdminOverview 组件', () => {
    const overview = adminRoutes.find((route) => route.path === '/admin/overview');
    expect(overview, '/admin/overview 路由丢了').toBeTruthy();
    expect(overview.name).toBe('AdminOverview');
    expect(typeof overview.component).toBe('function');
  });

  it('完整面板侧栏提供「快捷概览」链接', () => {
    // 源码断言必须格式宽容：prettier 会给属性换行/调顺序，逐字匹配会假红。
    // 这里只锁「存在一条指向 /admin/overview 的 router-link」这个事实。
    const src = readFileSync(
      resolve(import.meta.dirname, '../../src/views/DataManagement/components/AdminSidebar.vue'),
      'utf8',
    );
    expect(src).toMatch(/<router-link[\s\S]{0,200}?to=["']\/admin\/overview["']/);
    expect(src).toContain('快捷概览');
  });
});
