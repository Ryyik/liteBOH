import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：Lab 页灵动岛综合管理 回归（配额/生成状态/模型/样式集/思考预算 全接入导航灵动岛）
// 入口：/#/lab
// 断言：
//  1) 旧横条全移除：顶栏 .lab-topbar、底部 .lab-statusbar、配额徽章 .quota-badge、样式集弹窗 .preset-modal 均不存在
//  2) 灵动岛常驻卡挂载 + 紧凑行配额展示
//  3) 展开区为分区式：tabs（配额/模型/样式/思考）内部点击出现对应列表
//     - 模型 tab：默认模型 + BOHAI 模式（含倍率徽标）
//     - 样式 tab：8 套样式集点选持久选中
//     - 思考 tab：五档点选
//  4) 顶部安全距离：--lab-nav-h 变量存在且 ≥ 导航高度
//  5) 亮/暗双主题
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

const runTheme = async (theme) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  if (theme === 'dark') {
    await page.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

  await page.goto(`${BASE}/#/lab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);

  // 1) 旧横条/弹窗全移除
  const legacy = await page.evaluate(() => ({
    topbar: !!document.querySelector('.lab-topbar'),
    statusbar: !!document.querySelector('.lab-statusbar'),
    quotaBadge: !!document.querySelector('.quota-badge'),
    presetModal: !!document.querySelector('.preset-modal'),
  }));
  check(`[${theme}] 顶栏 BOH Agent Preview 横条已移除`, !legacy.topbar);
  check(`[${theme}] 底部状态栏横条已移除`, !legacy.statusbar);
  check(`[${theme}] 配额徽章已移除`, !legacy.quotaBadge);
  check(`[${theme}] 样式集弹窗已移除`, !legacy.presetModal);

  // 4) 顶部安全距离变量
  const navPad = await page.evaluate(() => {
    const page = document.querySelector('.lab-page');
    return {
      varSet: page?.style.getPropertyValue('--lab-nav-h') || '',
      paddingTop: page ? getComputedStyle(page).paddingTop : '',
    };
  });
  check(`[${theme}] 导航安全距离变量已同步`, navPad.varSet !== '' && /px/.test(navPad.paddingTop), `--lab-nav-h="${navPad.varSet}" padding=${navPad.paddingTop}`);

  // 2) 灵动岛常驻卡
  const island = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const compact = nav?.querySelector('.lab-quota-island .lq-compact');
    if (!compact) return null;
    return {
      inNav: !!nav.contains(compact),
      label: compact.querySelector('.lq-label')?.textContent?.trim() || '',
      sub: compact.querySelector('.lq-sub')?.textContent?.trim() || '',
    };
  });
  check(`[${theme}] 灵动岛常驻卡挂载于导航 surface`, !!island && island.inNav);
  check(`[${theme}] 紧凑行显示配额`, !!island && /剩余|无限/.test(island.sub), island?.sub || '');

  // 3) 展开 → 分区 tabs
  await page.click('#unified-nav-container .lab-quota-island .lq-compact');
  await page.waitForTimeout(450);
  const tabsInfo = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const tabs = Array.from(nav.querySelectorAll('.lab-quota-island .lq-tab')).map((el) => el.textContent.trim());
    const panelVisible = !!nav.querySelector('.lab-quota-island .lq-panel');
    return { tabs, panelVisible };
  });
  check(`[${theme}] 展开区为分区 tabs（配额/模型/样式/思考）`, tabsInfo.tabs.join(',') === '配额,模型,样式,思考', tabsInfo.tabs.join(','));
  check(`[${theme}] 默认显示配额面板`, tabsInfo.panelVisible);

  // 模型 tab：点击出现列表
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-tab'));
    tabs.find((el) => el.textContent.trim() === '模型')?.click();
  });
  await page
    .waitForFunction(() => document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-model-item').length > 1, null, { timeout: 15000 })
    .catch(() => {});
  const modelPanel = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const items = Array.from(nav.querySelectorAll('.lab-quota-island .lq-model-item'));
    return {
      count: items.length,
      names: items.map((el) => el.querySelector('.lq-model-name')?.textContent.trim().split('\n')[0] || ''),
      mults: items.map((el) => el.querySelector('.lq-model-mult')?.textContent.trim() || ''),
      defaultActive: items[0]?.classList.contains('is-active'),
    };
  });
  check(`[${theme}] 模型 tab 出现列表（默认+BOHAI 模式）`, modelPanel.count >= 2, `count=${modelPanel.count} names=${modelPanel.names.join('/')}`);
  check(`[${theme}] 模型项带配额倍率徽标`, modelPanel.mults.some(Boolean), modelPanel.mults.join(','));
  check(`[${theme}] 默认模型选中态`, modelPanel.defaultActive);
  await page.screenshot({ path: `${OUT}/lab-island-model-tab-${theme}.png` });

  // 样式 tab：8 套样式集
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-tab'));
    tabs.find((el) => el.textContent.trim() === '样式')?.click();
  });
  await page.waitForTimeout(400);
  const stylePanel = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const items = Array.from(nav.querySelectorAll('.lab-quota-island .lq-preset-item'));
    return {
      count: items.length,
      names: items.map((el) => el.textContent.trim()),
      activeIdx: items.findIndex((el) => el.classList.contains('is-active')),
    };
  });
  check(`[${theme}] 样式 tab 出现 8 套样式集列表`, stylePanel.count === 8, `count=${stylePanel.count} ${stylePanel.names.slice(0, 3).join('/')}…`);
  check(`[${theme}] 样式集有默认选中项`, stylePanel.activeIdx >= 0, `activeIdx=${stylePanel.activeIdx}`);
  // 点选第 3 套样式集
  await page.evaluate(() => {
    const items = document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-preset-item');
    items[2]?.click();
  });
  await page.waitForTimeout(400);
  const stylePicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-preset-item'));
    return items.findIndex((el) => el.classList.contains('is-active'));
  });
  check(`[${theme}] 样式集点选后选中态切换`, stylePicked === 2, `activeIdx=${stylePicked}`);
  await page.screenshot({ path: `${OUT}/lab-island-style-tab-${theme}.png` });

  // 思考 tab：五档
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-tab'));
    tabs.find((el) => el.textContent.trim() === '思考')?.click();
  });
  await page.waitForTimeout(400);
  const thinkPanel = await page.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container');
    const items = Array.from(nav.querySelectorAll('.lab-quota-island .lq-preset-item'));
    const active = items.findIndex((el) => el.classList.contains('is-active'));
    return { count: items.length, labels: items.map((el) => el.textContent.trim()), active };
  });
  check(`[${theme}] 思考 tab 出现五档`, thinkPanel.count === 5 && thinkPanel.labels.join(',') === '低,偏低,中,偏高,高', thinkPanel.labels.join(','));
  check(`[${theme}] 当前档位（中）选中`, thinkPanel.active === 2, `active=${thinkPanel.active}`);
  // 点「高」
  await page.evaluate(() => {
    const items = document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-preset-item');
    items[4]?.click();
  });
  await page.waitForTimeout(400);
  const thinkPicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-preset-item'));
    return items.findIndex((el) => el.classList.contains('is-active'));
  });
  check(`[${theme}] 思考档位点选生效`, thinkPicked === 4, `active=${thinkPicked}`);

  // Esc 收起
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const collapsed = await page.evaluate(() => !document.querySelector('#unified-nav-container .lab-quota-island .lq-detail'));
  check(`[${theme}] Esc 收起展开区`, collapsed);

  await page.screenshot({ path: `${OUT}/lab-island-compact-${theme}.png` });
  check(`[${theme}] 无页面运行时错误`, errors.length === 0, errors.join(' | '));

  await context.close();
};

await runTheme('light');
await runTheme('dark');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
