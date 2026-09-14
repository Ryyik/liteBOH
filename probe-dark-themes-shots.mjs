/**
 * A2 截图对比探针：暗色下覆盖 7 个暗色主题文件涉及的全部页面。
 * 用同一份清单在删除前后各跑一次，逐文件比对渲染结果。
 *
 * 用法：node probe-dark-themes-shots.mjs <baseUrl> <label>
 *
 * 约定（来自项目既有踩坑经验）：
 *  - 暗色必须用 addInitScript 预设 localStorage boh-theme（CSS 懒加载，
 *    渲染后再 setAttribute 会误报）
 *  - 伪造登录：等页面挂载后现注 pinia；userInfo 是 reactive({}) 需 Object.assign
 *    原地改；id 必须是合法 UUID，否则后端请求 400
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const LABEL = process.argv[3] || 'X';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home', '/#/'],
  ['shop', '/#/shop'],
  ['download', '/#/download'],
  ['forum', '/#/forum'],
  ['us-community', '/#/user-space?tab=community'],
  ['us-posts', '/#/user-space?tab=posts'],
  ['us-assets', '/#/user-space?tab=assets'],
  ['us-messages', '/#/user-space?tab=messages'],
  ['us-settings', '/#/user-space?tab=settings'],
  ['account-security', '/#/user-space/account-security'],
  ['pushplus', '/#/user-space/pushplus-settings'],
  ['shared-memory', '/#/user-space/shared-memories'],
  ['tags-impressions', '/#/user-space/tags-impressions'],
  ['ai-chat', '/#/ai-chat'],
  ['lab', '/#/lab'],
  ['mbti', '/#/mbti'],
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('boh-theme', 'dark'); } catch {} });

const page = await ctx.newPage();

const injectSession = async () => {
  // 必须等 vue app 挂载后再注入（固定 sleep 会在 store 未初始化时静默失败，
  // 受保护路由随之被重定向到首页——表现为多张截图内容相同）
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return;
      auth.isLoggedIn = true;
      if (auth.userInfo && typeof auth.userInfo === 'object') {
        // 必须是合法 UUID，否则后端请求 400
        Object.assign(auth.userInfo, {
          id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
          username: 'Ryyik',
          role: 'user',
          points: 14,
        });
      }
      const n = pinia?.state?.value?.notifications;
      if (n && 'unreadCount' in n) n.unreadCount = 0;
    } catch {}
  });
};

const results = [];
for (const [name, hashPath] of PAGES) {
  const file = `${OUT}/a2-${LABEL}-${name}.png`;
  try {
    await page.goto(`${BASE}${hashPath}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(800);
    await injectSession();
    await page.waitForTimeout(2500);
    // 记录实际落点路由，便于发现「被重定向」的情况
    const landed = await page.evaluate(() => location.hash);
    await page.screenshot({ path: file });
    const size = fs.statSync(file).size;
    results.push({ name, file, size, landed });
    console.log(`  ${name.padEnd(18)} ${String(size).padStart(8)} bytes  landed=${landed}`);
  } catch (e) {
    console.log(`  ${name.padEnd(18)} 失败: ${String(e.message).slice(0, 55)}`);
    results.push({ name, file: null, size: 0, landed: null });
  }
}

fs.writeFileSync(`${OUT}/a2-${LABEL}-manifest.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(`\n${LABEL} 截图完成 → ${OUT}/a2-${LABEL}-*.png`);
