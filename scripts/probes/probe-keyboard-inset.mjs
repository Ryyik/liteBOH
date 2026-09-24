/**
 * 键盘 inset 全链路探针（2026-09-24）
 *
 * 验证目标（桌面 Chrome 无法真弹键盘，用 mock visualViewport 模拟「键盘占 300px」）：
 *   1. main.js 的 initKeyboardInset() 已接线：mock 后 dispatch resize，
 *      documentElement 应写入 --kb-inset: 300px；
 *   2. CSS 消费生效（动态）：hash 导航到 /ai-chat 等路由加载对应 chunk CSS 后，
 *      .bohai-page / .mobile-composer-overlay 的高度在 --kb-inset=300px 时
 *      应比 =0px 时恰好收缩 300px（calc 链路成立）；
 *   3. CSS 消费存在（静态）：dist-check 的 CSS 产物里必须出现
 *      calc(100dvh - var(--kb-inset, 0px))（防「路由没走到导致假绿」）。
 *
 * 用法：先起 preview（vite preview --outDir dist-check --port 4180），再 `node scripts/probes/probe-keyboard-inset.mjs`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist-check');
const BASE = process.env.PROBE_BASE || 'http://[::1]:4180/';
const KB = 300;

const result = { pass: true, checks: [] };
const check = (name, ok, detail) => {
  result.checks.push({ name, ok, detail });
  if (!ok) result.pass = false;
};

try {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(document.querySelector('#app')?.children.length), null, { timeout: 15000 });

  // ---- 1. mock visualViewport：键盘占 300px ----
  const insetVar = await page.evaluate(async (kb) => {
    const fake = {
      height: window.innerHeight - kb,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return true; },
    };
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.documentElement.style.getPropertyValue('--kb-inset').trim();
  }, KB);
  check('initKeyboardInset 写入 --kb-inset', insetVar === `${KB}px`, `实际值: "${insetVar}"`);

  // ---- 2. 动态测量：逐路由加载 chunk CSS，量容器高度差 ----
  const measureTargets = async (hash, className) => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    // 等 chunk CSS 生效（测试元素高度 > 0 即样式表已注入）
    return page.waitForFunction((cls) => {
      const probe = document.createElement('div');
      probe.className = cls;
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;';
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height > 0;
    }, className, { timeout: 15000 }).then(() => true).catch(() => false);
  };

  const readHeightDelta = (className) => page.evaluate((cls) => {
    const probe = document.createElement('div');
    probe.className = cls;
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;';
    document.body.appendChild(probe);
    const read = () => Math.round(probe.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--kb-inset', '0px');
    const noKb = read();
    document.documentElement.style.setProperty('--kb-inset', '300px');
    const withKb = read();
    probe.remove();
    return { noKb, withKb };
  }, className);

  // BOHAI：/ai-chat → BOHAI chunk
  const bohaiCssReady = await measureTargets('#/ai-chat', 'bohai-page');
  if (bohaiCssReady) {
    const d = await readHeightDelta('bohai-page');
    check('.bohai-page 高度收缩 300px', Math.abs(d.noKb - d.withKb - KB) <= 2,
      `noKb=${d.noKb} withKb=${d.withKb} Δ=${d.noKb - d.withKb}`);
  } else {
    check('.bohai-page 动态测量', false, '路由 CSS 未加载（改为看静态断言）');
  }

  // Forum 发帖 overlay：overlay CSS 在 ForumMain chunk 里，但 /forum 有登录守卫，
  // 未登录拿不到 chunk —— 直接注入产物 CSS 文本验证 calc 行为（静态断言另行确认规则存在于产物）。
  // 注意 replies-responsive.css 经 PostComposer scoped 引入，规则带 data-v-xxx 属性选择器，
  // probe 必须补上该属性才能命中。
  const forumCssFile = readdirSync(join(DIST, 'static', 'css'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('ForumMain-') && e.name.endsWith('.css'))
    .map((e) => join(DIST, 'static', 'css', e.name))[0];
  if (forumCssFile) {
    const cssText = readFileSync(forumCssFile, 'utf8');
    const scopeMatch = /\.mobile-composer-overlay\[data-v-([a-f0-9]+)\]/.exec(cssText);
    await page.addStyleTag({ content: cssText });
    const scopeAttr = scopeMatch ? `data-v-${scopeMatch[1]}` : '';
    const d = await page.evaluate((attrs) => {
      const probe = document.createElement('div');
      probe.className = 'mobile-composer-overlay';
      if (attrs) probe.setAttribute(attrs, '');
      probe.style.cssText = 'left:-9999px;top:0;'; // 保留规则里的 position:fixed
      document.body.appendChild(probe);
      const read = () => Math.round(probe.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--kb-inset', '0px');
      const noKb = read();
      document.documentElement.style.setProperty('--kb-inset', '300px');
      const withKb = read();
      probe.remove();
      return { noKb, withKb };
    }, scopeAttr);
    check('.mobile-composer-overlay 高度收缩 300px', Math.abs(d.noKb - d.withKb - KB) <= 2,
      `noKb=${d.noKb} withKb=${d.withKb} Δ=${d.noKb - d.withKb} scope=${scopeAttr || '未提取'}`);
  } else {
    check('.mobile-composer-overlay 动态测量', false, 'ForumMain CSS 产物不存在');
  }

  await browser.close();
} catch (error) {
  result.pass = false;
  result.checks.push({ name: 'probe-execution', ok: false, detail: String(error) });
}

// ---- 3. 静态断言：CSS 产物里必须出现 calc(100dvh - var(--kb-inset, 0px)) ----
const cssNeedle = 'calc(100dvh - var(--kb-inset, 0px))';
const found = { bohai: 0, composer: 0 };
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { walk(p); continue; }
    if (!entry.name.endsWith('.css')) continue;
    const text = readFileSync(p, 'utf8');
    if (!text.includes(cssNeedle)) continue;
    if (text.includes('.bohai-page')) found.bohai += 1;
    if (text.includes('.mobile-composer-overlay')) found.composer += 1;
  }
};
walk(DIST);
check('CSS 产物含 .bohai-page 的 calc(--kb-inset) 规则', found.bohai >= 1, `命中文件数: ${found.bohai}`);
check('CSS 产物含 .mobile-composer-overlay 的 calc(--kb-inset) 规则', found.composer >= 1, `命中文件数: ${found.composer}`);

for (const { name, ok, detail } of result.checks) {
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
}
console.log(result.pass ? '\nALL GREEN' : '\nRED');
process.exit(result.pass ? 0 : 1);
