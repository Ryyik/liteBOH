import { chromium } from 'playwright';

const seed = {
  profile: { sex: 'male', birthYear: 1998, heightCm: 175, weightKg: 68, targetWeightKg: 65, activityLevel: 'moderate' },
  weightLogs: [],
  dailyLogs: [],
  vaultRecords: [],
  onboardingDone: true
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));

await page.addInitScript((p) => {
  localStorage.setItem('boh_health_v1', JSON.stringify(p));
  localStorage.setItem('boh_health_persist', JSON.stringify(p));
}, seed);

await page.goto('http://localhost:5173/#/health', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.locator('.hk-row', { hasText: '用 BOH AI 分析' }).first().click();
await page.waitForTimeout(6000);

const found = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
    hasUserMessage: body.includes('帮我分析一下最近的健康数据'),
    mentionsBohHealth: /BOH Health/.test(body),
    snippet: body.split('\n').filter((l) => /BOH Health|健康数据/.test(l)).slice(0, 6)
  };
});

console.log(JSON.stringify({ ...found, jsErrors: errors.slice(0, 5) }, null, 2));
await browser.close();
