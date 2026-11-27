import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = path.resolve('output/community-minimal');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const openMembers = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => {
      const stage = document.querySelector('.home-forum-stage');
      return stage && stage.inert === false;
    },
    null,
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('.segment-tab')).find(
      (el) => el.offsetParent !== null && el.textContent.trim() === '成员',
    );
    tab?.click();
  });
  await page.waitForSelector('.community-page-grid', { timeout: 30000 });
  await page.waitForSelector('.community-user-button', { timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
};

const setTheme = async (page, theme) => {
  await page.evaluate(async (nextTheme) => {
    const { themeManager } = await import('/src/utils/theme-manager.js');
    themeManager.setTheme(nextTheme);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  }, theme);
};

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobilePage = await mobile.newPage();
const mobileErrors = [];
mobilePage.on('pageerror', (error) => mobileErrors.push(String(error.message).slice(0, 180)));
await openMembers(mobilePage);
await setTheme(mobilePage, 'dark');

const mobileDark = await mobilePage.evaluate(() => {
  const grid = document.querySelector('.community-page-grid');
  const first = document.querySelector('.community-user-button');
  const gridStyle = getComputedStyle(grid);
  const nameStyle = getComputedStyle(first.querySelector('.user-name'));
  return {
    token: gridStyle.getPropertyValue('--text-primary').trim(),
    color: nameStyle.color,
  };
});
check('首页暗色成员 token 已解析', mobileDark.token.length > 0, mobileDark.token || 'empty');
const darkRgb = mobileDark.color.match(/\d+/g)?.map(Number) || [];
check(
  '首页暗色成员文字为浅色',
  darkRgb.length >= 3 && darkRgb.slice(0, 3).every((channel) => channel > 150),
  mobileDark.color,
);

const mobileLayout = await mobilePage.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.community-main-col .community-user-button'));
  const first = cards[0];
  const statuses = Array.from(document.querySelectorAll('.community-main-col .user-status')).map(
    (el) => el.textContent.trim(),
  );
  const bios = Array.from(document.querySelectorAll('.community-main-col .user-bio')).map((el) =>
    el.textContent.trim(),
  );
  return {
    pulseCount: document.querySelectorAll('.community-pulse').length,
    headerCount: document.querySelectorAll('.community-main-header').length,
    toolsCount: document.querySelectorAll('.community-tools').length,
    programCount: document.querySelectorAll('.shows-entry-card-glass, .community-pulse-actions')
      .length,
    firstTop: first?.getBoundingClientRect().top || 0,
    cardHeights: cards.slice(0, 5).map((el) => el.getBoundingClientRect().height),
    metaCount: document.querySelectorAll('.community-main-col .user-meta').length,
    statuses,
    bios,
    filterCount: document.querySelectorAll('.community-filter-tabs button').length,
    searchVisible: !!document.querySelector('.community-search-input-glass')?.offsetParent,
    birthdayTrigger: !!document.querySelector('.community-birthday-trigger'),
  };
});
check('移除重复概览条', mobileLayout.pulseCount === 0, `count=${mobileLayout.pulseCount}`);
check('常驻主标题与独立工具区', mobileLayout.headerCount === 1 && mobileLayout.toolsCount === 1);
check('成员页不再承载节目中心入口', mobileLayout.programCount === 0);
check(
  '竖屏首成员进入首屏上部',
  mobileLayout.firstTop > 0 && mobileLayout.firstTop < 420,
  `top=${Math.round(mobileLayout.firstTop)}`,
);
check(
  '竖屏成员卡高度收敛',
  mobileLayout.cardHeights.length > 0 && mobileLayout.cardHeights.every((height) => height <= 84),
  mobileLayout.cardHeights.map((height) => Math.round(height)).join('/'),
);
check('成员卡移除生日/加入/关注元信息', mobileLayout.metaCount === 0);
check(
  '成员卡只展示在线状态',
  mobileLayout.statuses.every((status) => status === '在线'),
  mobileLayout.statuses.join('/'),
);
check(
  '空简介不再占位',
  mobileLayout.bios.every((bio) => bio && !bio.includes('这个人很懒')),
  mobileLayout.bios.join(' | ').slice(0, 180),
);
check('搜索与四枚筛选保留', mobileLayout.searchVisible && mobileLayout.filterCount === 4);

if (mobileLayout.birthdayTrigger) {
  await mobilePage.locator('.community-birthday-trigger').click();
  await mobilePage.waitForSelector('.community-main-col .birthday-users-list', { timeout: 15000 });
  check('生日仍可从紧凑标题展开', true);
} else {
  check('生日仍可从紧凑标题展开', false, 'missing .community-birthday-trigger');
}
check('移动成员页无 JS 异常', mobileErrors.length === 0, mobileErrors.join(' | '));
await setTheme(mobilePage, 'dark');
await mobilePage.screenshot({
  path: path.join(OUT, 'members-mobile-dark.png'),
  fullPage: true,
});

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktopPage = await desktop.newPage();
const desktopErrors = [];
desktopPage.on('pageerror', (error) => desktopErrors.push(String(error.message).slice(0, 180)));
await openMembers(desktopPage);
await setTheme(desktopPage, 'light');

const desktopLayout = await desktopPage.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.community-main-col .community-user-button'));
  const first = cards[0];
  const second = cards[1];
  return {
    firstTop: first?.getBoundingClientRect().top || 0,
    firstHeight: first?.getBoundingClientRect().height || 0,
    twoColumns:
      !!first &&
      !!second &&
      Math.abs(first.getBoundingClientRect().top - second.getBoundingClientRect().top) < 2 &&
      second.getBoundingClientRect().left > first.getBoundingClientRect().left,
    birthday: !!document.querySelector('.community-side-col .birthday-group-glass'),
    programCount: document.querySelectorAll('.shows-entry-card-glass, .community-pulse-actions')
      .length,
  };
});
check(
  '桌面首成员进入首屏上部',
  desktopLayout.firstTop > 0 && desktopLayout.firstTop < 480,
  `top=${Math.round(desktopLayout.firstTop)}`,
);
check(
  '桌面成员卡高度收敛',
  desktopLayout.firstHeight > 0 && desktopLayout.firstHeight <= 96,
  `height=${Math.round(desktopLayout.firstHeight)}`,
);
check('桌面成员列表保持双列', desktopLayout.twoColumns);
check('桌面生日保留且节目入口移除', desktopLayout.birthday && desktopLayout.programCount === 0);
check('桌面成员页无 JS 异常', desktopErrors.length === 0, desktopErrors.join(' | '));
await desktopPage.screenshot({
  path: path.join(OUT, 'members-desktop-light.png'),
  fullPage: true,
});

await mobile.close();
await desktop.close();
await browser.close();

const failed = results.filter((result) => !result.pass);
const report = [
  ...results.map(
    (result) =>
      `${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? ` -- ${result.detail}` : ''}`,
  ),
  '',
  `==== ${results.length - failed.length}/${results.length} PASS ====`,
].join('\n');
fs.writeFileSync(path.join(OUT, 'report.txt'), `${report}\n`);
console.log(`\n${report}`);
process.exit(failed.length ? 1 : 0);
