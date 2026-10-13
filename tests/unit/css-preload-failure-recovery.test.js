/**
 * CSS 预加载失败的恢复语义守卫（2026-10-12）
 *
 * 事故：路由级 CSS 由 __vitePreload 动态注入 <link>（不在 index.html 里）。
 * 它在「CSS deps 全部 settle → 依次 dispatch 每个 rejected → 最后 loadModule()」
 * 的时序里，reportError 抛出的错误会让整条链 reject、loadModule() 永不执行 ——
 * 实测表现为**整个路由 chunk 的 import() 被一条 CSS 404 炸掉、导航被吞**
 * （在首页点底栏「方块」毫无反应，见 scripts/probes/probe-css-load-failure.mjs）。
 *
 * 本文件锁三条契约：
 *   1. CSS 失败即便恢复被限流也必须吞掉（否则导航不可用）；
 *   2. JS chunk 失败维持原语义（恢复被限流时继续上抛）；
 *   3. 「我的」页三个全局样式有绕开 __vitePreload 去重表的重试路径，
 *      而不是只写 `void preloadProfileStyles()`。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, squeezeSource, stripComments } from '../helpers/source.js';
import { shouldSwallowPreloadError } from '../../src/utils/vite-preload-recovery.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const recoverySrc = read('src/utils/vite-preload-recovery.js');
const asyncLoaders = read('src/views/user-center/UserSpace/async-loaders.js');

// 一律先剥注释：本文件的注释里会**合法地**复述被否定的写法（例如裸的
// defineAsyncComponent(loader) 简写），不剥会假红。
const loadersCode = stripComments(asyncLoaders);
const recoveryCode = stripComments(recoverySrc);

describe('vite:preloadError 的吞/抛判定', () => {
  it('CSS 预加载失败：恢复未发起时也必须吞掉（否则整条 import 链被判死）', () => {
    const cssError = new Error(
      'Unable to preload CSS for https://x/static/css/profile-base-abc.css',
    );
    expect(shouldSwallowPreloadError(cssError, false)).toBe(true);
  });

  it('CSS 判定对大小写与措辞变体宽容', () => {
    expect(shouldSwallowPreloadError(new Error('unable to preload css for /a/b.css'), false)).toBe(
      true,
    );
    // 兜底分支：消息里带 .css 资源地址
    expect(shouldSwallowPreloadError('preload failed: https://x/static/css/a-b.css', false)).toBe(
      true,
    );
  });

  it('JS chunk 失败不受影响：恢复被限流时仍然上抛', () => {
    const jsError = new Error(
      'Failed to fetch dynamically imported module: https://x/static/js/index-abc.js',
    );
    expect(shouldSwallowPreloadError(jsError, false)).toBe(false);
  });

  it('恢复已发起时一律吞掉（两种失败都不再把错误上抛）', () => {
    const jsError = new Error('Failed to fetch dynamically imported module: https://x/a.js');
    expect(shouldSwallowPreloadError(jsError, true)).toBe(true);
    expect(shouldSwallowPreloadError(new Error('Unable to preload CSS for /a.css'), true)).toBe(
      true,
    );
  });

  it('payload 缺失时不抛异常、也不误吞 JS 侧的非 CSS 失败', () => {
    expect(shouldSwallowPreloadError(undefined, false)).toBe(false);
    expect(shouldSwallowPreloadError(null, true)).toBe(true);
  });
});

describe('setupVitePreloadErrorRecovery 的接线', () => {
  it('preventDefault 只发生在「该吞」的分支里', () => {
    const code = squeezeSource(recoveryCode);
    const listenerStart = code.indexOf("window.addEventListener('vite:preloadError'");
    expect(listenerStart).toBeGreaterThan(-1);
    const listener = code.slice(listenerStart);

    expect(listener).toContain('shouldSwallowPreloadError(event?.payload, handled)');
    expect(listener).toContain('event.preventDefault()');
    // 判定式与 preventDefault 必须同处一个分支：把 recovered||cssFailure 删掉（只留 recovered）
    // 会让单测第 1 条变红，但源结构也要锁住，防止有人改成无条件 preventDefault
    // （那会让 JS chunk 失败彻底静默）。
    const guardIdx = listener.indexOf('shouldSwallowPreloadError');
    const preventIdx = listener.indexOf('event.preventDefault()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(guardIdx);
  });

  it('无关错误不会被误吞（判定不能退化成「一律吞掉」）', () => {
    expect(shouldSwallowPreloadError(new Error('TypeError: x is not a function'), false)).toBe(
      false,
    );
    expect(shouldSwallowPreloadError('', false)).toBe(false);
    expect(
      shouldSwallowPreloadError(
        new Error('Failed to fetch dynamically imported module: https://x/static/js/index-abc.js'),
        false,
      ),
    ).toBe(false);
  });
});

describe('「我的」页三样式的失败自愈（复用单源 guard）', () => {
  it('参数与入口留在这里，判活/重建/退避的实现必须来自单源 guard', () => {
    const code = squeezeSource(loadersCode);
    // 三个样式文件与退避表是这一层的业务参数
    expect(code).toContain(squeezeSource("import('./styles/profile-base.css')"));
    expect(code).toContain(squeezeSource("import('./styles/profile-panels.css')"));
    expect(code).toContain(squeezeSource("import('./styles/responsive-integrations.css')"));
    expect(code).toContain('const PROFILE_STYLE_REPAIR_DELAYS = [700, 1800, 4000]');
    // 必须走 guard（写死这条是为了防止「再抄一份实现」——那正是本类问题的复发姿势）
    expect(code).toContain(
      squeezeSource("import { createStyleSheetGuard } from '@/utils/style-load-guard.js';"),
    );
    expect(code).toContain('createStyleSheetGuard(');
    // 反面：本地不许再自建 link / 自读 cssRules（实现只该有一处）
    expect(code).not.toContain(squeezeSource("document.createElement('link')"));
    expect(loadersCode).not.toContain('cssRules');
  });

  it('preloadProfileStyles 走「import → guard 复核 → 必要时排退避」，且不再 reject', () => {
    const code = squeezeSource(loadersCode);
    const fnIdx = code.indexOf('export const preloadProfileStyles =');
    expect(fnIdx).toBeGreaterThan(-1);
    const fn = code.slice(fnIdx, code.indexOf('const communityComponentLoader'));

    expect(fn).toContain('.catch((error) => error)'); // 吞掉，不上抛
    expect(fn).toContain('await profileStyleGuard.repairNow()');
    expect(fn).toContain('if (stillBroken > 0) profileStyleGuard.schedule()');
    // 旧语义（catch 里 rethrow）必须消失：那会让 `await` 的调用点（主题弹窗）中断
    expect(fn).not.toContain('throw error');
  });

  it('离开用户空间停计时器、重新进入重置预算', () => {
    const code = squeezeSource(loadersCode);
    const idx = code.indexOf('export const setUserSpaceMountedForPreload');
    const fn = code.slice(idx, code.indexOf('const idlePreloadHandles'));
    expect(fn).toContain('resetProfileStyleRepair()');
    expect(fn).toContain('stopProfileStyleRepair()');
    expect(code).toContain('profileStyleGuard.stop()');
    expect(code).toContain('profileStyleGuard.reset()');
  });
});

describe('暗色主题 CSS 的失败自愈', () => {
  const themeSrc = read('src/utils/theme-css-loader.js');
  const themeCode = stripComments(themeSrc);

  it('loadedThemeSet 只能在「复核通过」之后落位（原实现写在 await 之前 ⇒ 永不重试）', () => {
    const code = squeezeSource(themeCode);
    const assignIdx = code.indexOf('loadedThemeSet = theme');
    const repairIdx = code.indexOf('await guard.repairNow()');
    expect(repairIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(repairIdx); // 顺序即契约
    // 有残留时提前 return，绝不落位
    const block = code.slice(repairIdx, assignIdx);
    expect(block).toContain('if (stillBroken > 0)');
    expect(block).toContain('guard.schedule()');
    expect(block).toContain('return');
  });

  it('matcher 由同一份声明派生（key 即产物文件名前缀），不另抄一份正则', () => {
    const code = squeezeSource(themeCode);
    expect(code).toContain('key:');
    // ⚠️ 不硬碰转义：只断言「matcher 是从 DARK_THEME_CSS 派生、且用 key 拼正则」这个结构
    expect(code).toMatch(/matchers: DARK_THEME_CSS\.map\(/);
    expect(code).toMatch(/new RegExp\(`\/\$\{key\}[^`]*`\)/);
  });

  it('8 个暗色样式一个不少（漏一个就是「半暗」页面）', () => {
    const keys = [...themeCode.matchAll(/key: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([
      'dark-mode',
      'navbar-dark',
      'forum-dark',
      'post-detail-dark',
      'user-space-dark',
      'user-center-dark',
      'bohai-dark',
      'messages-dark',
    ]);
  });
});

describe('「成员」分区面板的异步加载', () => {
  it('AsyncCommunity 必须带 onError 重试，不能退回无 UI 的简写', () => {
    const code = flattenSource(loadersCode);
    expect(code).not.toContain(
      flattenSource('AsyncCommunity=defineAsyncComponent(communityComponentLoader)'),
    );
    const idx = code.indexOf(flattenSource('exportconstAsyncCommunity=defineAsyncComponent('));
    expect(idx).toBeGreaterThan(-1);
    const block = code.slice(idx, idx + 240);
    expect(block).toContain('loader:');
    expect(block).toContain('onError');
    expect(block).toContain('retry()');
  });
});
