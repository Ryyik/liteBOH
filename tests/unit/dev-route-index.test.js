import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../../src/router/routes/public.js';
import { scriptSection, stripComments } from '../helpers/source.js';

describe('dev route index launcher', () => {
  it('registers /__dev/routes as a lazily loaded DEV page', () => {
    const route = publicRoutes.find((entry) => entry.path === '/__dev/routes');

    expect(route).toBeDefined();
    expect(route?.name).toBe('RouteIndex');
    expect(typeof route?.component).toBe('function');
    expect(route?.meta?.hideFooter).toBe(true);
  });

  it('keeps the launcher inside the DEV-gated block with its siblings', () => {
    const devPaths = publicRoutes
      .filter((entry) => entry.path.startsWith('/__dev/'))
      .map((entry) => entry.path);

    expect(devPaths).toEqual([
      '/__dev/motion',
      '/__dev/liquid-glass-nav',
      '/__dev/glass-repro',
      '/__dev/routes',
    ]);
  });

  it('RouteIndex 的 catch-all 过滤不会误伤参数化兼容路由', () => {
    // 2026-10-15 实证：用 `path.includes('(.*)')` 兜底判 catch-all，
    // 会把 /user-center/:rest(.*)（compat.ts 的折叠路由）一起滤掉 ——
    // 索引页少一行、重定向计数少 1，冒烟当场抓出。只允许按 pathMatch / NotFound 排除。
    // ⚠️ 断言前必须剥注释：本条说明文字里就写着那个禁用模式（第一次写就自伤了一次）。
    // 归一链按 helpers/source.js 的纪律：.vue 先 scriptSection() 排掉模板区，再 stripComments()。
    const source = stripComments(
      scriptSection(
        readFileSync(new URL('../../src/views/Dev/RouteIndex.vue', import.meta.url), 'utf8'),
      ),
    );

    expect(source).not.toMatch(/path\.includes\(\s*'\(\.\*\)'\s*\)/);
  });
});
