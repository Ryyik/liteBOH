import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'output/forum-refresh';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (predicate, label, timeout = 12000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(50);
  }
  console.log(`TIMEOUT  ${label}`);
  return false;
};

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?.state.value.auth
        ?.isInitialized,
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?.state.value.auth
        ?.isLoggedIn,
    null,
    { timeout: 10000 },
  );
};

const waitForFeedQuiet = async (getListRequests, label, quietMs = 700) => {
  let lastCount = getListRequests();
  let changedAt = Date.now();
  const deadline = changedAt + 12000;
  while (Date.now() < deadline) {
    await sleep(100);
    const nextCount = getListRequests();
    if (nextCount !== lastCount) {
      lastCount = nextCount;
      changedAt = Date.now();
    } else if (Date.now() - changedAt >= quietMs) {
      return true;
    }
  }
  console.log(`TIMEOUT  ${label} 列表请求静默`);
  return false;
};

const openForum = async (browser, { path, mobile = false }) => {
  const context = await browser.newContext({
    viewport: { width: mobile ? 390 : 1280, height: mobile ? 844 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error.message)));
  let listRequests = 0;
  page.on('request', (request) => {
    if (/\/rest\/v1\/(?:rpc\/list_forum_posts|posts\?)/.test(request.url())) {
      listRequests += 1;
    }
  });
  await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  if (path === '/?view=latest') {
    await page.waitForFunction(
      () =>
        !!document.querySelector('.home-gate') ||
        document.querySelector('.home')?.classList.contains('home-forum-settled'),
      null,
      { timeout: 30000 },
    );
    const gate = page.locator('.home-gate');
    if ((await gate.count()) > 0 && (await gate.isVisible())) {
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
    }
    await page.waitForFunction(
      () =>
        !document.querySelector('.home-gate') &&
        document.querySelector('.home')?.classList.contains('home-forum-settled'),
      null,
      { timeout: 15000 },
    );
    await page.waitForSelector('.forum-page', { state: 'visible', timeout: 15000 });
  }
  await page.waitForSelector('.forum-page', { timeout: 30000 });
  await page.waitForSelector('.post-card-v2', { timeout: 30000 });
  await waitForFeedQuiet(() => listRequests, `${mobile ? '移动端' : '桌面端'} ${path} 首屏`);
  return { context, page, pageErrors, getListRequests: () => listRequests };
};

const installRefreshRecorder = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.forum-page');
    window.__forumRefreshSeen = false;
    window.__forumRefreshObserver?.disconnect();
    window.__forumRefreshObserver = new MutationObserver(() => {
      if (root.classList.contains('is-refreshing')) window.__forumRefreshSeen = true;
    });
    window.__forumRefreshObserver.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

const findPullPoint = async (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.forum-page');
    const samples = [];
    for (const y of [520, 480, 560, 440, 600, 400, 360, 320, 280]) {
      for (const x of [24, 48, 72, 96, 120, 160, 200, 240, 280, 320, 360]) {
        const target = document.elementFromPoint(x, y);
        const blocked = !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
        samples.push({ x, y, inside: !!root?.contains(target), blocked });
        if (root?.contains(target) && !blocked) {
          return { x, y };
        }
      }
    }
    window.__pullPointDebug = {
      root: root?.getBoundingClientRect().toJSON(),
      samples: samples.filter((sample) => sample.inside).slice(0, 12),
    };
    return null;
  });

const mobilePull = async (page, { startY, endY, startX = 30, endX = 30 }) => {
  const cdp = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(startX, startY),
  });
  for (let step = 1; step <= 6; step += 1) {
    const progress = step / 6;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(startX + (endX - startX) * progress, startY + (endY - startY) * progress),
    });
    await sleep(24);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  for (const host of [
    { name: '用户空间', path: '/user-space?tab=community' },
    { name: '首页', path: '/?view=latest' },
  ]) {
    const session = await openForum(browser, { path: host.path, mobile: true });
    const { context, page, pageErrors, getListRequests } = session;
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await installRefreshRecorder(page);
      const before = getListRequests();
      const pullPoint = await findPullPoint(page);
      check(
        `${host.name} A0 找到论坛正文内的安全起点`,
        !!pullPoint,
        pullPoint
          ? JSON.stringify(pullPoint)
          : JSON.stringify(await page.evaluate(() => window.__pullPointDebug)),
      );
      if (pullPoint) {
        await mobilePull(page, {
          startX: pullPoint.x,
          endX: pullPoint.x,
          startY: pullPoint.y,
          endY: Math.min(800, pullPoint.y + 240),
        });
      }
      const during = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = document.querySelector('.forum-page');
        const container = document.querySelector('.forum-container');
        const indicator = document.querySelector('.forum-pull-indicator');
        return {
          active: root.classList.contains('is-pull-active'),
          distance: Number.parseFloat(
            getComputedStyle(root).getPropertyValue('--forum-pull-distance'),
          ),
          transform: getComputedStyle(container).transform,
          indicatorVisible: !!indicator && Number(getComputedStyle(indicator).opacity) > 0,
          indicatorText: indicator?.textContent?.trim() || '',
        };
      });
      check(
        `${host.name} A1 下拉过阈值产生回弹`,
        during.active && during.distance >= 72,
        JSON.stringify(during),
      );
      check(
        `${host.name} A2 内容真实位移且 spinner 无文字提示`,
        during.transform !== 'none' && during.indicatorVisible && during.indicatorText === '',
        JSON.stringify(during),
      );
      const refreshed = await waitUntil(
        () => getListRequests() > before,
        `${host.name} 下拉刷新请求`,
      );
      const refreshSeen = await page.evaluate(() => window.__forumRefreshSeen);
      check(
        `${host.name} A3 下拉触发强制重新取数`,
        refreshed && refreshSeen,
        `${before} -> ${getListRequests()}, seen=${refreshSeen}`,
      );
      const settled = await waitUntil(
        () =>
          page.evaluate(() => {
            const root = document.querySelector('.forum-page');
            return (
              !root?.classList.contains('is-pull-active') &&
              !root?.classList.contains('is-refreshing')
            );
          }),
        `${host.name} 下拉刷新落定`,
      );
      const seen = await page.evaluate(() => window.__forumRefreshSeen);
      check(`${host.name} A4 刷新态出现后正常收回`, settled && seen, `seen=${seen}`);
      check(`${host.name} A5 下拉不跳路由`, page.url().endsWith(`#${host.path}`), page.url());

      await page.evaluate(() => window.scrollTo(0, 0));
      const beforeShort = getListRequests();
      const shortPoint = await findPullPoint(page);
      if (shortPoint) {
        await mobilePull(page, {
          startX: shortPoint.x,
          endX: shortPoint.x,
          startY: shortPoint.y,
          endY: shortPoint.y + 40,
        });
      }
      const shortSettled = await waitUntil(
        () =>
          page.evaluate(
            () => !document.querySelector('.forum-page')?.classList.contains('is-pull-active'),
          ),
        `${host.name} 短拉回收`,
      );
      check(
        `${host.name} B1 未过阈值不刷新`,
        shortSettled && getListRequests() === beforeShort,
        `${beforeShort} -> ${getListRequests()}`,
      );

      await page.evaluate(() => window.scrollTo(0, 0));
      const beforeHorizontal = getListRequests();
      const horizontalPoint = await findPullPoint(page);
      if (horizontalPoint) {
        await mobilePull(page, {
          startX: horizontalPoint.x,
          endX: horizontalPoint.x > 210 ? horizontalPoint.x - 160 : horizontalPoint.x + 160,
          startY: horizontalPoint.y,
          endY: horizontalPoint.y + 20,
        });
      }
      await waitUntil(
        () =>
          page.evaluate(
            () => !document.querySelector('.forum-page')?.classList.contains('is-pull-active'),
          ),
        `${host.name} 横滑退出`,
      );
      check(
        `${host.name} B2 横向滑动不触发刷新`,
        getListRequests() === beforeHorizontal,
        `${beforeHorizontal} -> ${getListRequests()}`,
      );

      await page.evaluate(() => window.scrollTo(0, 600));
      await waitUntil(() => page.evaluate(() => window.scrollY > 300), `${host.name} 离开顶部`);
      const beforeScrolled = getListRequests();
      const scrolledPoint = await findPullPoint(page);
      if (scrolledPoint) {
        await mobilePull(page, {
          startX: scrolledPoint.x,
          endX: scrolledPoint.x,
          startY: scrolledPoint.y,
          endY: Math.min(800, scrolledPoint.y + 200),
        });
      }
      await sleep(500);
      check(
        `${host.name} B3 非顶部下拉让位给滚动`,
        getListRequests() === beforeScrolled,
        `${beforeScrolled} -> ${getListRequests()}`,
      );
      check(`${host.name} B4 无页面异常`, pageErrors.length === 0, pageErrors.join(' | '));
      await page.screenshot({
        path: `${OUT}/${host.name === '首页' ? 'home' : 'user-space'}-mobile.png`,
      });
    } finally {
      await context.close();
    }
  }

  for (const host of [
    { name: '用户空间', path: '/user-space?tab=community' },
    { name: '首页', path: '/?view=latest' },
  ]) {
    const session = await openForum(browser, { path: host.path });
    const { context, page, pageErrors, getListRequests } = session;
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(640, 320);
      await page.mouse.down();
      await page.mouse.move(640, 520, { steps: 8 });
      const mousePull = await page.evaluate(() => {
        const root = document.querySelector('.forum-page');
        return {
          active: root?.classList.contains('is-pull-active'),
          distance: Number.parseFloat(
            getComputedStyle(root).getPropertyValue('--forum-pull-distance'),
          ),
          indicator: !!document.querySelector('.forum-pull-indicator'),
        };
      });
      await page.mouse.up();
      check(
        `${host.name} C1 桌面鼠标拖拽不触发下拉刷新`,
        !mousePull.active && !mousePull.indicator && !(mousePull.distance > 0),
        JSON.stringify(mousePull),
      );

      await installRefreshRecorder(page);
      const beforeAvatar = getListRequests();
      await page.locator('#nav-user-info').click();
      const refreshed = await waitUntil(
        () => getListRequests() > beforeAvatar,
        `${host.name} 头像刷新请求`,
      );
      check(
        `${host.name} C2 头像点击强制刷新`,
        refreshed,
        `${beforeAvatar} -> ${getListRequests()}`,
      );
      check(
        `${host.name} C3 头像刷新不跳出当前论坛`,
        page.url().endsWith(`#${host.path}`),
        page.url(),
      );
      const top = await page.evaluate(() => window.scrollY);
      check(`${host.name} C4 头像刷新回到顶部`, top <= 1, `scrollY=${top}`);
      check(`${host.name} C5 无页面异常`, pageErrors.length === 0, pageErrors.join(' | '));
      await page.screenshot({
        path: `${OUT}/${host.name === '首页' ? 'home' : 'user-space'}-desktop.png`,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.pass);
fs.writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), results }, null, 2),
);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
