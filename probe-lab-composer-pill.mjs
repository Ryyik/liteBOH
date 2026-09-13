import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：输入框参数列表框回归（思考五档列表框 / 样式集 8 套列表框 / 双向同步 / 外点关闭）
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

await page.goto(`${BASE}/#/lab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(3000);

const pillSel = (text) => `Array.from(document.querySelectorAll('.composer-pill')).find(el => (el.textContent || '').includes('${text}'))`;

// 1) 思考列表框：点击 pill 弹出五档（带说明）
await page.evaluate((sel) => { eval(sel)?.click(); }, pillSel('思考'));
await page.waitForTimeout(350);
const thinkMenu = await page.evaluate(() => {
  const menu = document.querySelector('.pill-menu:not(.pill-menu--grid)');
  if (!menu) return null;
  return {
    items: Array.from(menu.querySelectorAll('.pill-menu-item')).map((el) => ({
      label: el.querySelector('.pill-menu-label')?.textContent.trim() || '',
      hint: el.querySelector('.pill-menu-hint')?.textContent.trim() || '',
    })),
    activeIdx: Array.from(menu.querySelectorAll('.pill-menu-item')).findIndex((el) => el.classList.contains('active')),
    opaque: getComputedStyle(menu).backgroundColor,
  };
});
check('思考 pill 弹出五档列表框', !!thinkMenu && thinkMenu.items.length === 5, thinkMenu ? thinkMenu.items.map((i) => i.label).join('/') : '未弹出');
check('列表框项带说明文案', !!thinkMenu && thinkMenu.items.every((i) => i.hint), thinkMenu ? thinkMenu.items[2]?.hint : '');
check('当前档位（中）默认勾选', thinkMenu?.activeIdx === 2, `activeIdx=${thinkMenu?.activeIdx}`);
check('列表框实底背景（可读性）', !!thinkMenu && /rgba/.test(thinkMenu.opaque) && !/0,\s*0,\s*0,\s*0\)/.test(thinkMenu.opaque), thinkMenu?.opaque);
await page.screenshot({ path: `${OUT}/lab-pillmenu-thinking.png` });

// 2) 点选「高」→ pill 文字更新 + 菜单关闭
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.pill-menu:not(.pill-menu--grid) .pill-menu-item'));
  items.find((el) => el.textContent.includes('高') && !el.textContent.includes('偏高'))?.click();
});
await page.waitForTimeout(350);
const afterThink = await page.evaluate(() => ({
  pill: Array.from(document.querySelectorAll('.composer-pill')).find((el) => (el.textContent || '').includes('思考'))?.textContent?.trim() || '',
  menuOpen: !!document.querySelector('.pill-menu:not(.pill-menu--grid)'),
}));
check('点选「高」后 pill 更新', afterThink.pill.includes('高') && !afterThink.pill.includes('偏高'), `pill="${afterThink.pill}"`);
check('点选后列表框自动关闭', !afterThink.menuOpen);

// 3) 岛卡同步：展开岛 → 思考 tab 应显示「高」
await page.click('#unified-nav-container .lab-quota-island .lq-compact');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-tab'));
  tabs.find((el) => el.textContent.trim() === '思考')?.click();
});
await page.waitForTimeout(350);
const islandThink = await page.evaluate(() => {
  const island = document.querySelector('#unified-nav-container .lab-quota-island');
  const items = Array.from(island?.querySelectorAll('.lq-preset-item') || []);
  return items.findIndex((el) => el.classList.contains('is-active'));
});
check('输入框选「高」→ 岛卡思考同步勾选', islandThink === 4, `activeIdx=${islandThink}`);

// 4) 岛里改回「中」→ 输入框 pill 同步
await page.evaluate(() => {
  const items = document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-preset-item');
  items[2]?.click();
});
await page.waitForTimeout(350);
const pillSync = await page.evaluate((sel) => eval(sel)?.textContent?.trim() || '', pillSel('思考'));
check('岛内改「中」→ 输入框 pill 同步', pillSync.includes('中'), `pill="${pillSync}"`);

// 5) 样式集列表框：8 套两列网格 + 当前勾选
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.evaluate(() => {
  const pills = Array.from(document.querySelectorAll('.composer-pill')).filter((el) => !(el.textContent || '').includes('思考'));
  pills[0]?.click();
});
await page.waitForTimeout(350);
const presetMenu = await page.evaluate(() => {
  const menu = document.querySelector('.pill-menu--grid');
  if (!menu) return null;
  const items = Array.from(menu.querySelectorAll('.pill-menu-item'));
  return {
    count: items.length,
    names: items.map((el) => el.querySelector('.pill-menu-label')?.textContent.trim() || ''),
    activeIdx: items.findIndex((el) => el.classList.contains('active')),
  };
});
check('样式 pill 弹出 8 套列表框（两列）', !!presetMenu && presetMenu.count === 8, presetMenu ? presetMenu.names.join('/') : '未弹出');
check('样式列表框当前项勾选', (presetMenu?.activeIdx ?? -1) >= 0, `activeIdx=${presetMenu?.activeIdx}`);
await page.screenshot({ path: `${OUT}/lab-pillmenu-style.png` });

// 6) 点选样式 → pill 更新 + 菜单关闭
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.pill-menu--grid .pill-menu-item'));
  items.find((el) => el.textContent.includes('学术'))?.click();
});
await page.waitForTimeout(400);
const afterPreset = await page.evaluate(() => ({
  pill: Array.from(document.querySelectorAll('.composer-pill')).filter((el) => !(el.textContent || '').includes('思考'))[0]?.textContent?.trim() || '',
  menuOpen: !!document.querySelector('.pill-menu--grid'),
}));
check('点选「学术专业」→ pill 更新', afterPreset.pill.includes('学术'), `pill="${afterPreset.pill}"`);
check('样式列表框点选后关闭', !afterPreset.menuOpen);

// 7) 点击外部关闭
await page.evaluate((sel) => { eval(sel)?.click(); }, pillSel('思考'));
await page.waitForTimeout(250);
await page.mouse.click(640, 500);
await page.waitForTimeout(250);
const closedByOutside = await page.evaluate(() => !document.querySelector('.pill-menu'));
check('点击列表框外自动关闭', closedByOutside);

check('无页面运行时错误', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
