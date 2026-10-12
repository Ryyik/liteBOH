import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';
import {
  clamp01,
  computeStageProgress,
  readReducedMotion,
  useScrollStage,
} from '../../src/composables/useScrollStage.js';

// ─────────────────────────────────────────────────────────────────────────────
// 固定视窗滚动分镜（pin 分镜）公共机制的防回归锁（2026-10-12 抽取时补）。
//
// 抽它的原因：同一套机制被手写了三遍（BOHApp / AboutUs / BOH8YearsJourney），
// 每写一遍都要重新踩「body 变成滚动容器 ⇒ sticky 降级成普通块」这个坑。真源现在只有一处。
// 本文件锁两件事：
//   ① 进度换算与 reduce 读取的**纯函数契约** —— 逻辑都在这里，且不依赖 DOM；
//   ② **接线守卫** —— 机制真的收在 composable 里（加/摘 html 类、rAF 节流、卸载清理），
//      且两个宿主**不再各写一份**（BOHApp / AIPlaza 已迁走，用反证式断言钉住）。
//
// ⚠️ 测试环境是 node（本仓没有 jsdom / happy-dom / @vue/test-utils）⇒ 不挂载组件；
//    生命周期钩子的接线用源码守卫锁，行为部分用纯函数覆盖。
// ⚠️ 改断言前先读 tests/helpers/source.js（prettier 会重排源码，逐字断言必须走归一工具）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const COMPOSABLE = 'src/composables/useScrollStage.js';
const CONSUMERS = [
  { path: 'src/views/BOHApp/index.vue', scrollClass: 'boh-app-scroll', stageRef: 'stageRef' },
  { path: 'src/views/AIPlaza/index.vue', scrollClass: 'ai-intro-scroll', stageRef: 'modesSection' },
];

describe('clamp01 · 进度截断', () => {
  it('小于 0 截到 0', () => {
    expect(clamp01(-0.4)).toBe(0);
  });

  it('大于 1 截到 1', () => {
    expect(clamp01(1.6)).toBe(1);
  });

  it('区间内原样返回', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('computeStageProgress · 进度换算', () => {
  // travel = height - viewportHeight = 2000 - 800 = 1200
  const stage = { top: 400, height: 2000, viewportHeight: 800 };

  it('不传参数时恒为 0（宿主据此退化成静态布局）', () => {
    expect(computeStageProgress()).toBe(0);
  });

  it('内容短于一屏（没有可滚距离）时为 0', () => {
    expect(computeStageProgress({ scrollY: 500, top: 0, height: 800, viewportHeight: 800 })).toBe(
      0,
    );
    expect(computeStageProgress({ scrollY: 500, top: 0, height: 700, viewportHeight: 800 })).toBe(
      0,
    );
  });

  it('分镜顶部尚未到达视口顶时为 0', () => {
    expect(computeStageProgress({ scrollY: 100, ...stage })).toBe(0);
  });

  it('刚好滚到分镜顶部时为 0', () => {
    expect(computeStageProgress({ scrollY: 400, ...stage })).toBe(0);
  });

  it('行程中点返回 0.5', () => {
    expect(computeStageProgress({ scrollY: 400 + 600, ...stage })).toBe(0.5);
  });

  it('滚到分镜底部对齐视口底时为 1', () => {
    expect(computeStageProgress({ scrollY: 400 + 1200, ...stage })).toBe(1);
  });

  it('滚过头被截到 1，不会越界', () => {
    expect(computeStageProgress({ scrollY: 99999, ...stage })).toBe(1);
  });
});

describe('readReducedMotion · 偏好读取的兜底', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('没有 window 时返回 false（node / SSR 不炸）', () => {
    vi.stubGlobal('window', undefined);
    expect(readReducedMotion()).toBe(false);
  });

  it('window 上没有 matchMedia 时返回 false', () => {
    vi.stubGlobal('window', {});
    expect(readReducedMotion()).toBe(false);
  });

  it('matchMedia 抛错时返回 false（不把页面带崩）', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('boom');
      },
    });
    expect(readReducedMotion()).toBe(false);
  });

  it('命中 reduce 时返回 true', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(readReducedMotion()).toBe(true);
  });

  it('未命中时返回 false', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(readReducedMotion()).toBe(false);
  });
});

describe('useScrollStage · 机制收口在 composable 里（源码守卫）', () => {
  const code = stripComments(read(COMPOSABLE));

  it('导出的是 composable', () => {
    expect(typeof useScrollStage).toBe('function');
  });

  it('复位 body overflow：挂载加类、卸载摘类', () => {
    expect(squeezeSource(code)).toContain(
      squeezeSource('document.documentElement.classList.add(scrollClass)'),
    );
    expect(squeezeSource(code)).toContain(
      squeezeSource('document.documentElement.classList.remove(scrollClass)'),
    );
  });

  it('滚动进度走 rAF 节流，且卸载时取消未执行的那一帧', () => {
    expect(squeezeSource(code)).toContain(squeezeSource('frame = requestAnimationFrame('));
    expect(squeezeSource(code)).toContain(squeezeSource('cancelAnimationFrame(frame)'));
  });

  it('卸载时摘掉 scroll / resize 监听与 ResizeObserver', () => {
    expect(squeezeSource(code)).toContain(squeezeSource("removeEventListener('scroll'"));
    expect(squeezeSource(code)).toContain(squeezeSource("removeEventListener('resize'"));
    expect(squeezeSource(code)).toContain(squeezeSource('observer?.disconnect()'));
  });

  it('reduce 偏好下短路：进度取固定值，不再按滚动算', () => {
    expect(squeezeSource(code)).toContain(squeezeSource('prefers-reduced-motion: reduce'));
    expect(squeezeSource(code)).toContain(squeezeSource('progress.value = reducedProgress'));
  });

  it('几何量只在 measure() 里读一次 —— scroll 回调不触发强制同步布局', () => {
    expect((code.match(/getBoundingClientRect/g) || []).length).toBe(1);
  });
});

describe('两个宿主的接线（源码守卫）', () => {
  it.each(CONSUMERS)(
    '$path 从单一真源引入并传自己的 scrollClass',
    ({ path, scrollClass, stageRef }) => {
      const code = squeezeSource(stripComments(scriptSection(read(path))));
      expect(code).toMatch(/from ['"]@\/composables\/useScrollStage\.js['"]/);
      expect(code).toContain(squeezeSource(`useScrollStage(${stageRef}`));
      expect(code).toContain(squeezeSource(`scrollClass: '${scrollClass}'`));
    },
  );

  // 反证式断言：这三件正是被抽走的机制，宿主必须不再自己写。
  // ⚠️ 别顺手加 `requestAnimationFrame` 或 `getBoundingClientRect` 的否定断言 ——
  //    AIPlaza 仍在用它们做**别的事**（首屏进场标记 / 点档位时把滚动位置搬过去），
  //    那是宿主自己的语义，不属于被抽走的机制（2026-10-12 实测踩过）。
  it.each(CONSUMERS)('$path 不再自写滚动机制（抽了必须真的接线）', ({ path }) => {
    const code = squeezeSource(stripComments(scriptSection(read(path))));
    expect(code).not.toContain('documentElement.classList'); // html 类复位
    expect(code).not.toContain('new ResizeObserver'); // 几何量重测
    expect(code).not.toContain('matchMedia'); // reduce 偏好读取
    expect(code).not.toContain("addEventListener('scroll'"); // 进度滚动监听
  });

  it('两个宿主各自的样式里放开 body overflow（类名与传参一致）', () => {
    expect(squeezeSource(read('src/views/BOHApp/style.scoped.css'))).toContain(
      squeezeSource(':global(html.boh-app-scroll body)'),
    );
    expect(squeezeSource(read('src/views/AIPlaza/index.vue'))).toContain(
      squeezeSource(':global(html.ai-intro-scroll body)'),
    );
  });
});
