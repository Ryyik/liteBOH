/**
 * probe-glass-repro-page.mjs — 独立对照页 `/#/__dev/glass-repro` 的能量判据（2026-10-14）
 *
 * 配套页面：`src/views/Dev/GlassBackdropRepro.vue`（DEV only）。
 * 三组宿主唯一差别 = **是不是堆叠上下文**：H1 `relative` / H2 `relative+z-index` / H3 `fixed`。
 * 判据：同一区域「玻璃开着 / 关掉」的梯度能量，开 < 关 × 50% 才算**这个宿主能糊**。
 *
 * 用法（先起 dev server）：
 *   node scripts/probes/probe-glass-repro-page.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
await page.goto(`${BASE}/#/__dev/glass-repro`, { waitUntil: 'load' });
await page.waitForTimeout(2200);

const energy = async (clip) => {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let sum = 0;
    for (let y = 0; y < c.height - 1; y++) {
      for (let x = 0; x < c.width - 1; x++) {
        const i = (y * c.width + x) * 4;
        sum += Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + c.width * 4));
      }
    }
    return sum / (c.width * c.height);
  }, b64);
};

const glassCount = await page.locator('.boh-glass-under').count();
console.log(`[页面] 找到 ${glassCount} 个玻璃实例（应为 3）`);

const measure = async (hostSel, label) => {
  const box = await page.locator(hostSel).boundingBox();
  if (!box) return console.log(`SKIP ${label}（找不到宿主）`);
  const clip = {
    x: Math.round(box.x + 20),
    y: Math.round(box.y + 10),
    width: Math.round(box.width - 40),
    height: Math.round(box.height - 20),
  };
  const on = await energy(clip);
  await page.evaluate((sel) => {
    const g = document.querySelector(`${sel} .boh-glass-under`);
    if (g) g.style.display = 'none';
  }, hostSel);
  await page.waitForTimeout(320);
  const off = await energy(clip);
  await page.evaluate((sel) => {
    const g = document.querySelector(`${sel} .boh-glass-under`);
    if (g) g.style.display = '';
  }, hostSel);
  await page.waitForTimeout(240);
  const works = off > 1 && on < off * 0.5;
  console.log(
    `${works ? '✅ 能糊  ' : '❌ 采不到'}  ${label}  on=${on.toFixed(2)} off=${off.toFixed(2)}`,
  );
};

await measure('.host-h1', 'H1 宿主 relative（非堆叠上下文）—— BOHAI 同款');
await measure('.host-h2', 'H2 宿主 relative + z-index:1（堆叠上下文）');
await measure('.host-h3', 'H3 宿主 fixed（堆叠上下文）—— 顶栏尝试 2 同款');

await page.screenshot({ path: 'debug-screenshots/glass-repro-page.png' });
await browser.close();
