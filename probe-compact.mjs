import { chromium } from 'playwright';

const seed = {
  profile: { sex: 'male', birthYear: 1998, heightCm: 175, weightKg: 68, targetWeightKg: 65, activityLevel: 'moderate' },
  weightLogs: [],
  dailyLogs: [],
  vaultRecords: [],
  onboardingDone: true
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.addInitScript((payload) => {
  localStorage.setItem('boh_health_v1', JSON.stringify(payload));
  localStorage.setItem('boh_health_persist', JSON.stringify(payload));
}, seed);
await page.goto('http://localhost:5173/#/health', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const scanAt = async (y) => {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.height < 4 || r.height > 400) return;
      if (r.width < window.innerWidth * 0.5) return;
      out.push({
        cls: (el.className && el.className.toString().slice(0, 40)) || el.tagName,
        pos: cs.position, z: cs.zIndex,
        top: Math.round(r.top), bottom: Math.round(r.bottom)
      });
    });
    return out;
  });
};

const at0 = await scanAt(0);
const at400 = await scanAt(400);
const at1200 = await scanAt(1200);

// 顶部内容是否被导航遮挡
const topCheck = await page.evaluate(() => {
  const date = document.querySelector('.hk-topbar-date');
  const title = document.querySelector('.hk-topbar-title');
  const nav = document.querySelector('#unified-nav-container');
  const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
  return {
    navBottom: Math.round(navBottom),
    dateTop: date ? Math.round(date.getBoundingClientRect().top) : null,
    titleTop: title ? Math.round(title.getBoundingClientRect().top) : null
  };
});

console.log(JSON.stringify({
  barsAtScroll0: at0,
  barsAtScroll400: at400,
  barsAtScroll1200: at1200,
  topCheck,
  jsErrors: errors
}, null, 2));
await browser.close();
