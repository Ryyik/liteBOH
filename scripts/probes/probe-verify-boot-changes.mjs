/**
 * 启动骨架回归探针（只读，不改源码）
 *
 * 三个场景，覆盖首屏骨架的全部不变量：
 *   V1 暗色首帧：data-theme 是否在首帧就已就绪、骨架/body 底色是否为暗色
 *      （修复前：首帧 theme=null、整屏 rgb(255,255,255)、骨架存活帧 0/2 处于暗色）
 *   V2 慢懒加载布局：路由 chunk 延迟 3s 时导航栏/加载态/页脚是否错位、是否出滚动条
 *      （实测页脚挂载但高度 0，无错位；探针必须用 .footer-pages，Footer.vue 根不是 <footer>）
 *   V3 暗色慢启动：拉长骨架窗口，验证骨架自身的暗色底色与"无假导航"
 *
 * 用法（BASE_URL 可指向 dist 或 dist-check）：
 *   cd dist && python3 -m http.server 4199 --bind 127.0.0.1   （run_in_background）
 *   BASE_URL=http://127.0.0.1:4199 node probe-verify-boot-changes.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200';
const OUT = process.env.PROBE_OUT || 'output/verify-boot-changes';
mkdirSync(OUT, { recursive: true });

const launchOptions = {
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
};

const frameRecorder = () => {
  window.__frames = [];
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
  };
  const sample = () => {
    const boot = document.querySelector('.boh-boot');
    const body = document.body;
    window.__frames.push({
      t: Math.round(performance.now()),
      theme: document.documentElement.getAttribute('data-theme'),
      hasBoot: !!boot,
      bootBg: boot ? getComputedStyle(boot).backgroundColor : null,
      bootNavRect: rect(document.querySelector('.boh-boot-nav')),
      realNavRect: rect(document.querySelector('#unified-nav-container') || document.querySelector('.unified-nav')),
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bodyBg: body ? getComputedStyle(body).backgroundColor : null,
      footer: !!document.querySelector('footer'),
      footerPages: !!document.querySelector('.footer-pages'),
      appLoading: !!document.querySelector('.boh-boot-body--standalone'),
      navVisible: (() => {
        const n = document.querySelector('#unified-nav-container');
        return !!n && n.getBoundingClientRect().height > 0;
      })(),
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
      docHeight: document.documentElement.scrollHeight,
    });
    if (window.__frames.length < 120) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

const V = {};

/* ---------- V1：暗色首帧 ---------- */
async function v1DarkFirstPaint(browser) {
  console.log('\n========== V1：暗色(boh-theme=dark)首帧 ==========');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('boh-theme', 'dark');
  });
  await context.addInitScript(frameRecorder);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const frames = await page.evaluate(() => window.__frames);
  const first = frames[0];
  const firstDark = frames.find((f) => f.theme === 'dark');
  console.log('首帧:', JSON.stringify(first));
  console.log('首个 data-theme=dark 帧:', JSON.stringify(firstDark));
  const bootNavFrame = frames.find((f) => f.bootNavRect);
  const realNavFrame = frames.find((f) => f.realNavRect);
  console.log('骨架假导航胶囊:', bootNavFrame ? JSON.stringify(bootNavFrame.bootNavRect) : 'null（已移除，符合预期）');
  console.log('真实导航栏:', JSON.stringify(realNavFrame && realNavFrame.realNavRect));
  if (bootNavFrame && realNavFrame) {
    const a = bootNavFrame.bootNavRect; const b = realNavFrame.realNavRect;
    console.log(`→ 几何差: 宽 ${b.w - a.w}px / 高 ${b.h - a.h}px / 顶 ${b.top - a.top}px / 左 ${b.left - a.left}px`);
  }
  const bootSeen = frames.filter((f) => f.hasBoot).length;
  console.log(`\n【V1 断言】首帧 data-theme = ${first && first.theme}（期望 dark）`);
  console.log(`【V1 断言】首帧 body 底色 = ${first && first.bodyBg}（期望 rgb(10, 10, 15)，暗色主题 CSS 懒加载期间的兜底）`);
  if (bootSeen > 0) {
    console.log(`【V1 断言】首帧骨架底色 = ${first && first.bootBg}（期望 rgb(10, 10, 15)）`);
    console.log(`【V1 断言】骨架存活 ${bootSeen} 帧，其中处于暗色主题 ${frames.filter((f) => f.hasBoot && f.theme === 'dark').length} 帧（期望与存活帧数相等）`);
  } else {
    console.log('【V1 备注】本次未采到骨架帧（本地静态服务毫秒级完成，骨架在首个 rAF 前已被 mount 清空）——骨架自身底色的验证请看 V3。');
  }
  console.log(`→ 骨架存在期间共 ${frames.filter((f) => f.hasBoot).length} 帧；其中已在暗色主题下的 ${frames.filter((f) => f.hasBoot && f.theme === 'dark').length} 帧`);
  console.log(`→ 骨架首帧背景: ${first && first.bootBg}（期望 #0a0a0f 才算暗色就绪）`);
  console.log(`→ 主题属性生效于 ${firstDark ? firstDark.t + 'ms' : 'n/a'}；骨架消失于 ${(frames.find((f) => !f.hasBoot) || {}).t}ms`);
  V.v1 = { firstBootBg: first && first.bootBg, firstTheme: first && first.theme, themeAtMs: firstDark ? firstDark.t : null };
  await page.screenshot({ path: `${OUT}/V1-dark-final.png` });
  await context.close();
}

/* ---------- V2：慢速懒加载下页脚是否同时渲染 ---------- */
async function v2SlowLazyFooter(browser) {
  console.log('\n========== V2：懒加载 chunk 延迟 3s 时的首屏布局 ==========');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript(frameRecorder);
  const page = await context.newPage();
  await page.route('**/static/js/*.js', async (route) => {
    const name = route.request().url().split('/').pop();
    if (/^(app-|vue-vendor|vue-utils-vendor|ui-icons|ui-components|supabase-vendor|state-vendor|auth-store|ui-sanitize)/.test(name)) {
      return route.continue();
    }
    await new Promise((r) => setTimeout(r, 3000));
    return route.continue();
  });
  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });
  await page.waitForTimeout(1200);
  const mid = await page.evaluate(() => {
    // Footer.vue 的根是 .footer-pages（不是 <footer> 标签），必须按真实类名探测
    const fp = document.querySelector('.footer-pages');
    const fpRect = fp ? fp.getBoundingClientRect() : null;
    const loading = document.querySelector('.boh-boot-body--standalone');
    const loadingRect = loading ? loading.getBoundingClientRect() : null;
    return {
      hasBoot: !!document.querySelector('.boh-boot'),
      appLoading: !!loading,
      loadingTop: loadingRect ? Math.round(loadingRect.top) : null,
      loadingBottom: loadingRect ? Math.round(loadingRect.bottom) : null,
      footerPagesMounted: !!fp,
      footerPagesHeight: fpRect ? Math.round(fpRect.height) : null,
      footerPagesTop: fpRect ? Math.round(fpRect.top) : null,
      footerPagesVisible: !!fpRect && fpRect.height > 0 && getComputedStyle(fp).display !== 'none',
      appChildren: [...document.querySelector('#app').children]
        .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}`),
      docHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    };
  });
  console.log('1.2s 时（路由 chunk 未到位）:', JSON.stringify(mid, null, 1));
  V.v2 = mid;
  await page.screenshot({ path: `${OUT}/V2-slow-lazy-1200ms.png`, fullPage: true });
  await page.waitForTimeout(4500);
  const after = await page.evaluate(() => ({
    appLoading: !!document.querySelector('.boh-boot-body--standalone'),
    footerPagesMounted: !!document.querySelector('.footer-pages'),
    appChildren: [...document.querySelector('#app').children]
      .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}`),
  }));
  console.log('5.7s 时（路由 chunk 已到位）:', JSON.stringify(after));
  await page.screenshot({ path: `${OUT}/V2-slow-lazy-5700ms.png` });
  await context.close();
}

/* ---------- V3：暗色 + 慢启动，验骨架自身的暗色底色 ---------- */
async function v3DarkSkeletonSlow(browser) {
  console.log('\n========== V3：暗色 + 懒加载 chunk 延迟 1.5s（验骨架暗色底色） ==========');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('boh-theme', 'dark');
  });
  await context.addInitScript(frameRecorder);
  const page = await context.newPage();
  await page.route('**/static/js/*.js', async (route) => {
    const name = route.request().url().split('/').pop();
    if (/^(app-|vue-vendor|vue-utils-vendor|ui-icons|ui-components|supabase-vendor|state-vendor|auth-store|ui-sanitize)/.test(name)) {
      return route.continue();
    }
    await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });
  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });
  await page.waitForTimeout(700);
  const frames = await page.evaluate(() => window.__frames);
  const bootFrames = frames.filter((f) => f.hasBoot);
  const sample = bootFrames[0];
  console.log(`骨架存活帧数: ${bootFrames.length}；首帧: ${JSON.stringify(sample)}`);
  console.log(`【V3 断言】骨架底色 = ${sample && sample.bootBg}（期望 rgb(10, 10, 15)，修复前恒为 rgb(255,255,255)）`);
  console.log(`【V3 断言】骨架期间 data-theme = ${sample && sample.theme}（期望 dark）`);
  console.log(`【V3 断言】骨架假导航 = ${sample && sample.bootNavRect ? '仍然存在（不应出现）' : 'null ✅'}`);
  await page.screenshot({ path: `${OUT}/V3-dark-skeleton.png` });
  await context.close();
}

const browser = await chromium.launch(launchOptions);
try {
  await v1DarkFirstPaint(browser);
  await v2SlowLazyFooter(browser);
  await v3DarkSkeletonSlow(browser);
} finally {
  await browser.close();
}
console.log(`\n截图: ${OUT}/`);
console.log('结论:', JSON.stringify(V, null, 1));
