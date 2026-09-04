import { chromium } from 'playwright';

const seed = {
  profile: { sex: 'male', birthYear: 1998, heightCm: 175, weightKg: 68, targetWeightKg: 65, activityLevel: 'moderate' },
  weightLogs: [],
  dailyLogs: [],
  vaultRecords: [],
  onboardingDone: true
};

const viewports = [
  { w: 1280, h: 800, name: 'desktop' },
  { w: 768, h: 1024, name: 'tablet' },
  { w: 390, h: 844, name: 'mobile' }
];

const browser = await chromium.launch({ channel: 'chrome' });

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.addInitScript((p) => {
    localStorage.setItem('boh_health_v1', JSON.stringify(p));
    localStorage.setItem('boh_health_persist', JSON.stringify(p));
  }, seed);
  await page.goto('http://localhost:5173/#/health', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const date = document.querySelector('.hk-topbar-date');
    const bmi = document.querySelector('.hk-bmi-value');
    return {
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
      dateTop: date ? Math.round(date.getBoundingClientRect().top) : null,
      bmiTop: bmi ? Math.round(bmi.getBoundingClientRect().top) : null
    };
  });

  const safe = r.dateTop !== null && r.navBottom !== null ? r.dateTop >= r.navBottom : null;
  console.log(vp.name + ': navBottom=' + r.navBottom + ' dateTop=' + r.dateTop + ' bmiTop=' + r.bmiTop + '  safe=' + (safe ? 'OK' : 'FAIL'));
  await page.close();
}

await browser.close();
