import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const boundary = read('src/components/GlobalErrorBoundary.vue');
const app = read('src/App.vue');
const boundaryStyle = boundary.slice(boundary.indexOf('<style scoped>'));

// App.vue 的 script 注释里也出现了 "<Suspense>" 字样，按全文 indexOf 会被注释命中的
// 假阳性干扰，因此所有结构断言都从 <template> 开始切片。
const templateStart = app.indexOf('<template>');
const appTemplate = app.slice(templateStart);

describe('GlobalErrorBoundary wiring in App.vue', () => {
  it('wraps Suspense/RouterView so a render error cannot leave a blank page', () => {
    const open = appTemplate.indexOf('<GlobalErrorBoundary');
    const close = appTemplate.indexOf('</GlobalErrorBoundary>');
    const block = appTemplate.slice(open, close);

    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    expect(block).toContain('<Suspense>');
    expect(block).toContain('</Suspense>');
    expect(block).toContain('<RouterView');
    expect(block).toContain('</RouterView>');
  });

  it('keeps the boundary outside Suspense and after the boot placeholder', () => {
    const bootIdx = appTemplate.indexOf('class="boh-boot-body');
    const boundaryIdx = appTemplate.indexOf('<GlobalErrorBoundary');
    const suspenseIdx = appTemplate.indexOf('<Suspense>');
    const suspenseCloseIdx = appTemplate.indexOf('</Suspense>');
    const boundaryCloseIdx = appTemplate.indexOf('</GlobalErrorBoundary>');

    // 边界若被放进 Suspense 内部，异步 chunk 失败就捕获不到；
    // 顺序必须是：启动骨架 → 边界开 → Suspense 开 → Suspense 闭 → 边界闭
    expect(bootIdx).toBeGreaterThan(-1);
    expect(boundaryIdx).toBeGreaterThan(bootIdx);
    expect(suspenseIdx).toBeGreaterThan(boundaryIdx);
    expect(suspenseIdx).toBeLessThan(suspenseCloseIdx);
    expect(suspenseCloseIdx).toBeLessThan(boundaryCloseIdx);
  });

  it('resets the boundary on route change so one crash does not poison later pages', () => {
    expect(app).toMatch(/const boundaryKey = ref\(0\);/);
    expect(app).toMatch(/:key="boundaryKey"/);
    expect(app).toMatch(/boundaryKey\.value \+= 1;/);
    // 必须挂在路由变化上，而不是只挂在 recover 回调里
    expect(app).toMatch(/watch\(\s*\n?\s*\(\) => route\.path,/);
  });

  it('rebuilds the page tree only while actually errored, not on every route change', () => {
    // 2026-09-20 补的**语义**守卫。上一条只要求「换页面时边界被重置」，而「重置」有两种实现：
    //   ① 清 hasError（便宜，不动 DOM 树）；
    //   ② 重建整棵树（昂贵——key 挂在包住整个 RouterView 的边界上，自增一次会把**路由级
    //      KeepAlive 的缓存一并销毁**，目的页面连同全部子组件重新挂载、重新取数）。
    // 无条件自增 = 每次换页面都选 ②。实测（scripts/probes/probe-userspace-pages.mjs，
    // 限速 1.2Mbps）从子页返回 /user-space：页面根节点复用 0/9 → 9/9、返回期间请求
    // 188 → 13、「数据就位」3240~4003ms → 579~1118ms。所以无条件自增必须被拦住。
    const watcherStart = app.indexOf('() => route.path,');
    expect(watcherStart).toBeGreaterThan(-1);
    const watcher = app.slice(watcherStart, watcherStart + 260);

    const guardIdx = watcher.indexOf('boundaryErrored.value');
    const bumpIdx = watcher.indexOf('boundaryKey.value += 1;');
    expect(guardIdx).toBeGreaterThan(-1); // 必须先看错误态
    expect(watcher).toMatch(/if \(!boundaryErrored\.value\) return;/);
    expect(bumpIdx).toBeGreaterThan(guardIdx); // 自增只能在守卫之后

    // 错误态必须真的会被置位 —— 否则守卫恒为假，等于「换页面永不重建」，
    // 那是把「一次崩溃污染后续页面」的回归放回来（方向相反的错）。
    expect(app).toMatch(/const boundaryErrored = ref\(false\);/);
    const errorHandler = app.slice(
      app.indexOf('const handleBoundaryError'),
      app.indexOf('const handleBoundaryRecover'),
    );
    expect(errorHandler).toMatch(/boundaryErrored\.value = true;/);

    // recover（重试 / 回首页）仍要重建，让出错的实例重新初始化 —— 原语义不变
    const recoverHandler = app.slice(app.indexOf('const handleBoundaryRecover'));
    expect(recoverHandler).toMatch(/boundaryErrored\.value = false;/);
    expect(recoverHandler).toMatch(/boundaryKey\.value \+= 1;/);
  });

  it('does not key the boundary off route.fullPath (would rebuild the whole page tree per query change)', () => {
    // boundaryKey 挂在包住整个 RouterView 的边界上，自增一次 = 整棵页面树销毁重建。
    // fullPath 含 query，而 UserSpace 的分区切换（?tab=…&view=…）、论坛筛选等都只改 query：
    // 用 fullPath 会让「同页换参数」也重建整页 —— 实测每切一次社区分区就重跑
    // UserSpaceMain（1.2 万行 + 5 个面板）及其全部 onMounted 取数（14~28 个数据请求），
    // 页面根节点每次都换新，路由级 KeepAlive 也随之失效。
    // 用 path 作粒度既保住了「换页面即重置边界」的原意，又不会因同页改参数重建。
    // 由 scripts/probes/probe-userspace-switch.mjs 的「逐层节点身份」做端到端兜底。
    expect(app).not.toMatch(/\(\) => route\.fullPath,/);
  });

  it('ignores the boundary when the boot placeholder is still on screen', () => {
    // v-else 链：!bootReady 时走骨架，bootReady 后才可能进入边界
    expect(app).toMatch(/<GlobalErrorBoundary\s*\n?\s*v-else/);
  });
});

describe('GlobalErrorBoundary behaviour', () => {
  it('captures descendant errors and stops propagation', () => {
    expect(boundary).toContain('onErrorCaptured');
    expect(boundary).toMatch(/return false;/);
  });

  it('renders the slot only when no error was captured', () => {
    expect(boundary).toMatch(/<div v-if="hasError" class="geb-root"/);
    expect(boundary).toMatch(/<slot v-else \/>/);
  });

  it('offers three distinct exits and never leaves the user stuck', () => {
    const buttons = boundary.match(/class="geb-btn[^"]*"/g) || [];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    expect(boundary).toContain('handleRetry');
    expect(boundary).toContain('handleGoHome');
    expect(boundary).toContain('handleHardReload');
  });

  it('reuses the existing clean-reload routine instead of reinventing cache busting', () => {
    expect(boundary).toContain("import('@/utils/version-checker.js')");
    expect(boundary).toContain('forceCleanAndReload');
  });

  it('tolerates the clean-reload import failing', () => {
    // 组件本身处于出错路径上，加载额外模块也可能失败，必须有最终兜底
    expect(boundary).toMatch(/catch \{[\s\S]*?window\.location\.reload\(\);/);
  });

  it('exposes stack details only when explicitly asked', () => {
    expect(boundary).toMatch(/showDetails: \{ type: Boolean, default: false \}/);
    expect(boundary).toMatch(/v-if="showDetails && errorStack"/);
  });
});

describe('GlobalErrorBoundary styling contract', () => {
  it('reuses the shared liquid-glass material instead of raw backdrop-filter', () => {
    expect(boundary).toContain('liquid-glass');
    expect(boundaryStyle).not.toMatch(/backdrop-filter\s*:\s*blur\(/);
  });

  it('only consumes globally defined liquid tokens for theme colours', () => {
    const vars = [...boundaryStyle.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);

    // 这些变量只活在某个视图作用域的局部定义里（Lab 版 ErrorBoundary 就踩了这个坑，
    // 其中 --radius-sm 全站根本没有定义 → 圆角静默失效）。提到全局后必须改用 --liquid-*。
    const scopedOnly = [
      '--card',
      '--foreground',
      '--muted-foreground',
      '--border',
      '--popover',
      '--accent',
      '--primary',
      '--destructive',
      '--radius',
      '--radius-sm',
      '--radius-md',
      '--font-sans'
    ];
    for (const name of scopedOnly) {
      expect(vars).not.toContain(name);
    }

    expect(vars.filter((v) => v.startsWith('--liquid-')).length).toBeGreaterThan(5);
    // 文字色必须派生自 token，暗色翻转靠 token 自身完成
    expect(boundaryStyle).toContain('var(--liquid-text-primary)');
    expect(boundaryStyle).toContain('var(--liquid-text-secondary)');
  });

  it('targets the project theme attribute rather than a host class', () => {
    // 全站暗色由 html[data-theme="dark"] 驱动；写死 .dark 或某个宿主 class 会失真
    expect(boundaryStyle).toContain('html[data-theme="dark"]');
    expect(boundaryStyle).not.toMatch(/\n\s*\.dark[\s{]/);
  });

  it('does not add to the !important budget', () => {
    expect(boundary).not.toContain('!important');
  });
});
