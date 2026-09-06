import { chromium } from 'playwright';

const base = 'http://localhost:5173';

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. 下载分段
  await page.goto(`${base}/#/download`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'debug-screenshots/resources-download-seg.png' });

  // 2. 切到教程分段
  await page.click('.segment-btn:nth-child(2)');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'debug-screenshots/resources-tutorial-seg.png' });

  // 3. 查询参数直达教程
  await page.goto(`${base}/#/download?tab=tutorial`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const segActive = await page.$eval('.segment-btn.active', el => el.textContent.trim());
  console.log('query tab=tutorial -> active segment:', segActive);

  // 4. /tutorial 重定向
  await page.goto(`${base}/#/tutorial`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('after /tutorial redirect url:', page.url());

  // 5. 移动端
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#/download`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug-screenshots/resources-mobile.png' });

  await browser.close();
};

run().catch(e => { console.error(e); process.exit(1); });
