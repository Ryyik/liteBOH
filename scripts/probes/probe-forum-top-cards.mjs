import { chromium } from 'playwright';

// 论坛「最新」顶部两卡：签到卡 + 圣诞运营卡。
// 覆盖两个宿主、仅最新分区、关闭持久化、签到后消失与极简几何。
const BASE = process.env.BASE || 'http://[::1]:5173';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const injectAuth = async (page) => {
  await page
    .waitForFunction(
      () =>
        document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
          ?.auth?.isInitialized,
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  for (let i = 0; i < 20; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return;
      auth.isLoggedIn = true;
      auth.userInfo = {
        id: 'probe-forum-card-user',
        username: 'probe_card',
        role: 'user',
        points: 42,
      };
    });
    await page.waitForTimeout(200);
    if (
      (await page.locator('.section-checkin').count()) &&
      (await page.locator('.forum-top-card').count())
    ) {
      return;
    }
  }
};

const open = async (url, viewport = { width: 390, height: 844 }) => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/#${url}`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.section-checkin', { timeout: 15000 }).catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll('.forum-top-card').length >= 2, null, {
      timeout: 15000,
    })
    .catch(() => {});
  await page.waitForTimeout(300);
  return { context, page };
};

const cardInfo = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.forum-top-card')).map((el) => {
      const rect = el.getBoundingClientRect();
      const cta = el.querySelector('.forum-promo-cta, .forum-top-card-cta');
      return {
        cls: el.className,
        text: el.innerText.replace(/\n/g, ' | '),
        x: +rect.x.toFixed(1),
        y: +rect.y.toFixed(1),
        h: +rect.height.toFixed(1),
        w: +rect.width.toFixed(1),
        ctaHref: cta?.getAttribute('href') || '',
      };
    }),
  );

try {
  // ---------- A. UserSpace 竖屏：两张卡、顺序与几何 ----------
  {
    const { context, page } = await open('/user-space?tab=community');
    const cards = await cardInfo(page);
    check('A1 UserSpace 最新分区展示两张卡', cards.length === 2, `count=${cards.length}`);
    check(
      'A2 顺序为签到卡 → 圣诞运营卡',
      cards[0]?.cls.includes('is-checkin') && cards[1]?.cls.includes('is-promo'),
      cards.map((card) => card.cls).join(' / '),
    );
    check(
      'A3 圣诞卡文案来自 Christmas Hero',
      cards[1]?.text.includes('圣诞交换礼物') && cards[1]?.text.includes('挂上头像，随机配对'),
      cards[1]?.text,
    );
    check('A4 圣诞卡 CTA 指向 /xmas', cards[1]?.ctaHref.endsWith('/xmas'), cards[1]?.ctaHref);
    check(
      'A5 签到卡紧凑、运营卡呈论坛帖卡形态',
      cards[0]?.h <= 60 && cards[1]?.h >= 90 && cards[1]?.h <= 170,
      cards.map((card) => card.h).join('/'),
    );

    const geometry = await page.evaluate(() => {
      const tabs = document.querySelector('.segment-tabs-row').getBoundingClientRect();
      const group = document.querySelector('.forum-top-cards').getBoundingClientRect();
      const post = document.querySelector('.post-card-v2').getBoundingClientRect();
      return {
        gapTabs: +(group.top - tabs.bottom).toFixed(1),
        cardW: +group.width.toFixed(1),
        postW: +post.width.toFixed(1),
        firstPostBelow: post.top > group.bottom,
      };
    });
    check(
      'A6 页签与卡位间距 ≤16px',
      geometry.gapTabs >= 0 && geometry.gapTabs <= 16,
      `${geometry.gapTabs}px`,
    );
    check(
      'A7 卡位与首帖同宽',
      Math.abs((cards[0]?.w || 0) - geometry.postW) <= 1,
      `card=${cards[0]?.w} post=${geometry.postW}`,
    );
    check('A8 首帖在两张卡之后', geometry.firstPostBelow);

    // ---------- B. 关闭持久化 ----------
    await page.locator('.forum-top-card.is-promo .forum-top-card-close').click();
    await page.waitForTimeout(200);
    check(
      'B1 关闭圣诞卡后只剩签到卡',
      (await page.locator('.forum-top-card.is-promo').count()) === 0 &&
        (await page.locator('.forum-top-card').count()) === 1,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectAuth(page);
    await page.waitForSelector('.forum-top-card.is-checkin', { timeout: 15000 });
    check('B2 刷新后圣诞卡仍关闭', (await page.locator('.forum-top-card.is-promo').count()) === 0);

    await page.locator('.forum-top-card.is-checkin .forum-top-card-close').click();
    await page.waitForTimeout(200);
    const weekKey = await page.evaluate(() =>
      localStorage.getItem('boh-forum-checkin-card-dismissed-week'),
    );
    check('B3 关闭签到卡写入本周键', /^\d{4}-\d{2}-\d{2}$/.test(weekKey || ''), weekKey || 'EMPTY');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectAuth(page);
    await page.waitForTimeout(800);
    check('B4 刷新后两张卡都关闭', (await page.locator('.forum-top-card').count()) === 0);
    await context.close();
  }

  // ---------- C. 签到成功后签到卡消失 ----------
  {
    const { context, page } = await open('/user-space?tab=community');
    await page.evaluate(() => {
      const shell = document.querySelector('.forum-section-shell');
      const state = shell?.__vueParentComponent?.setupState?.weeklyCheckinStatus;
      if (state) state.hasSignedThisWeek = true;
    });
    await page.waitForTimeout(250);
    check(
      'C1 本周已签后签到卡消失、运营卡保留',
      (await page.locator('.forum-top-card.is-checkin').count()) === 0 &&
        (await page.locator('.forum-top-card.is-promo').count()) === 1,
    );
    await context.close();
  }

  // ---------- D. 仅最新分区 ----------
  {
    const { context, page } = await open('/user-space?tab=community');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.segment-tab'));
      tabs.find((tab) => tab.textContent.trim() === '官方')?.click();
    });
    await page.waitForTimeout(300);
    check('D1 切到官方分区后卡位隐藏', (await page.locator('.forum-top-card').count()) === 0);
    await context.close();
  }

  // ---------- E. 首页宿主 ----------
  {
    const { context, page } = await open('/');
    check('E1 首页论坛同样展示两张卡', (await page.locator('.forum-top-card').count()) === 2);
    await page.screenshot({ path: 'debug-screenshots/forum-top-cards-home.png' });
    await context.close();
  }

  // ---------- F. 桌面宽屏 ----------
  {
    const { context, page } = await open('/user-space?tab=community', {
      width: 1440,
      height: 900,
    });
    const cards = await cardInfo(page);
    const layout = await page.evaluate(() => {
      const toolbar = document.querySelector('.forum-toolbar').getBoundingClientRect();
      const post = document.querySelector('.post-card-v2').getBoundingClientRect();
      return {
        toolbarBottom: +toolbar.bottom.toFixed(1),
        postW: +post.width.toFixed(1),
      };
    });
    check('F1 桌面双宿主共用卡位', cards.length === 2, `count=${cards.length}`);
    check(
      'F2 横屏卡宽 = 帖子卡宽',
      cards.every((card) => Math.abs(card.w - layout.postW) <= 1),
      cards.map((card) => card.w).join('/') + ` / post=${layout.postW}`,
    );
    check(
      'F3 两张卡位于搜索框下方',
      cards.every((card) => card.y > layout.toolbarBottom),
      cards.map((card) => `${card.y}>${layout.toolbarBottom}`).join(' / '),
    );
    check(
      'F4 搜索框与卡行间距 ≤24px',
      cards.every((card) => card.y - layout.toolbarBottom <= 24),
      cards.map((card) => +(card.y - layout.toolbarBottom).toFixed(1)).join('/'),
    );
    check(
      'F5 两张横屏卡并排占两列',
      cards[0]?.x !== cards[1]?.x,
      cards.map((card) => card.x).join('/'),
    );
    await page.screenshot({ path: 'debug-screenshots/forum-top-cards-landscape.png' });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n===== probe-forum-top-cards: ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
