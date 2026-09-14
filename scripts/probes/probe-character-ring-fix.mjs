import { chromium } from 'playwright';

const url = 'http://localhost:5173/#/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const hero = page.locator('.showcase-hero.is-character-ring');
  await hero.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await hero.screenshot({ path: `debug-screenshots/ring-redo-${name}.png` });
  const sizes = await page.evaluate(() => {
    const measure = (img) => {
      try {
        const w = Math.min(img.naturalWidth, 320);
        const h = Math.max(1, Math.round(img.naturalHeight * (w / img.naturalWidth)));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let top = h, bottom = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 12) { if (y < top) top = y; bottom = y; break; }
          }
        }
        return bottom > top ? (bottom - top + 1) / h : 1;
      } catch { return -1; }
    };
    return [...document.querySelectorAll('.showcase-hero.is-character-ring .showcase-character')].map((el) => {
      const img = el.querySelector('img');
      const r = el.getBoundingClientRect();
      const ir = img ? img.getBoundingClientRect() : null;
      const ratio = measure(img);
      return {
        src: (img?.src || '').split('/').pop().split('?')[0],
        box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        imgBox: ir ? `${Math.round(ir.width)}x${Math.round(ir.height)}` : 'none',
        imgNatural: img ? `${img.naturalWidth}x${img.naturalHeight}` : '',
        ratio: ratio.toFixed(2),
        visibleH: Math.round(r.height * ratio),
        scaleVar: el.style.getPropertyValue('--ring-scale'),
      };
    });
  });
  console.log(`=== ${name} ===`);
  console.log(sizes.map((s) => `${s.src}: box=${s.box} img=${s.imgBox} natural=${s.imgNatural} ratio=${s.ratio} visible=${s.visibleH} scale=${s.scaleVar}`).join('\n'));
  await page.close();
}
await browser.close();
