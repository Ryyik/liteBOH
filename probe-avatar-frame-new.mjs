import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：仓鼠瓜子 / 奶牛抱抱 两新头像框接入回归
// 入口：/#/user-space?tab=assets → 资产中心「装扮」子 tab（AvatarFrameGrid）
// 验证：新框卡片渲染 → 即点即换预览同步 → background-image 指向新素材 → 暗色主题截图
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const launch = async (dark) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (dark) await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  return { browser, page, errors };
};

const openDecor = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000); // 等 init 期会话检查放完
  const pinia = page.locator('#app');
  await pinia.evaluate((uid) => {
    const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = p.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
  }, UUID);
  // 点「装扮」子 tab（SegmentTabs 按钮显式 role=tab，getByRole('button') 匹配不到）
  await page.getByRole('tab', { name: '装扮' }).click({ timeout: 10000 });
  await page.waitForSelector('.afg-grid', { timeout: 10000 });
  await page.waitForTimeout(600);
};

// 网格卡名与预览框 url 断言
const gridState = (page) => page.evaluate(() => ({
  cards: [...document.querySelectorAll('.afg-card-name')].map((el) => el.textContent.trim()),
  previewFrame: getComputedStyle(document.querySelector('.afg-preview .boh-avatar-frame') || document.body).backgroundImage,
  previewName: document.querySelector('.afg-preview-name-row strong')?.textContent.trim() || '',
}));

/* ---------- 亮色 ---------- */
{
  const { browser, page, errors } = await launch(false);
  await openDecor(page);
  let st = await gridState(page);
  check('网格含两新框卡片', st.cards.includes('仓鼠瓜子') && st.cards.includes('奶牛抱抱'), JSON.stringify(st.cards));
  await page.screenshot({ path: `${OUT}/frame-new-grid-light.png`, fullPage: false });

  await page.getByRole('button', { name: /奶牛抱抱/ }).first().click();
  await page.waitForTimeout(500);
  st = await gridState(page);
  check('佩戴奶牛抱抱 → 预览名同步', st.previewName === '奶牛抱抱', st.previewName);
  check('奶牛框 background-image 指向 cow-frame.png', st.previewFrame.includes('cow-frame.png'), st.previewFrame.slice(0, 120));
  await page.screenshot({ path: `${OUT}/frame-new-cow-light.png` });

  await page.getByRole('button', { name: /仓鼠瓜子/ }).first().click();
  await page.waitForTimeout(500);
  st = await gridState(page);
  check('佩戴仓鼠瓜子 → 预览名同步', st.previewName === '仓鼠瓜子', st.previewName);
  check('仓鼠框 background-image 指向 hamster-frame.png', st.previewFrame.includes('hamster-frame.png'), st.previewFrame.slice(0, 120));
  await page.screenshot({ path: `${OUT}/frame-new-hamster-light.png` });
  check('亮色无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 暗色 ---------- */
{
  const { browser, page, errors } = await launch(true);
  await openDecor(page);
  await page.getByRole('button', { name: /奶牛抱抱/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/frame-new-cow-dark.png` });
  await page.getByRole('button', { name: /仓鼠瓜子/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/frame-new-hamster-dark.png` });
  check('暗色无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
