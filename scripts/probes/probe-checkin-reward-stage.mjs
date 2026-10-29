/**
 * probe-checkin-reward-stage.mjs —— 签到「卡面 3D + 极简到账」回归探针（竖屏 / 横屏两档）
 *
 * 替代的是旧的「每周签到」弹窗链路，所以第 2 条断言是**反证**：`.checkin-overlay` 必须不存在
 * —— 否则说明用户又被关进面板里点第二次了。
 *
 * 三条已实测的坑（都写进了断言，别再靠肉眼）：
 *   1. **`img.complete` 不等于可绘制**。真正的门槛是 `decode()`，所以断言必须查
 *      `naturalWidth > 0`，并且 `data-asset-ready` 要在**首帧旋转之前**就是 "1"
 *      —— 舞台是「挂载即起播」，晚一步就是先闪一帧白框。
 *   2. **「加了 class 但没动」是假绿**。旋转必须是视觉值：采样 `getComputedStyle().transform`
 *      并换算成角度，断言峰值 > 30°，别只断言 `animation-name` 存在。
 *   3. **横屏别只看「元素可见」**。短横屏（1180×520）走的是左右并排，要断言文案真的在
 *      卡片右侧（x 超过卡片右边缘），而不是被挤到卡片下方看不见的地方。
 *
 * 网络全部 mock（RPC 走 page.route，卡面用内联 SVG data URL），所以本探针**不依赖**：
 *   - 真实登录态（注入 pinia auth）
 *   - 线上积分函数到底「每周 +5」还是「每 4 周 +5」（mock 固定返回 points_awarded: 5）
 *
 * 依赖：本地 dev server `vite --port 5173 --host ::`
 * 跑法：node scripts/probes/probe-checkin-reward-stage.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const FAKE_USER_ID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

/* 卡面用内联 SVG：离线可跑，且和真实卡面一样会走 preload→decode 这条链 */
const CARD_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">' +
    '<rect width="640" height="400" fill="#1b2b3a"/>' +
    '<circle cx="520" cy="80" r="130" fill="#2c4a63"/>' +
    '<rect y="300" width="640" height="100" fill="#12202c"/></svg>',
)}`;

const STATUS_NOT_SIGNED = {
  ok: true,
  already_signed: false,
  has_signed_this_week: false,
  current_streak: 0,
  points_awarded: 0,
  current_points: 100,
  next_reward_in: 4,
  current_week_start: '2026-10-26',
  message: 'OK',
};

const SIGN_SUCCESS = {
  ok: true,
  already_signed: false,
  has_signed_this_week: true,
  current_streak: 1,
  points_awarded: 5,
  current_points: 105,
  next_reward_in: 3,
  current_week_start: '2026-10-26',
  message: 'CHECKIN_SUCCESS',
};

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/* 已签再点 = 纯本地重播，**不该**再打 submit RPC（否则等于每周多点几次都在撞后端）。
   用计数断言，而不是只看「界面看起来没变」。 */
const rpcCalls = { submit: 0 };

const mockBackend = async (page) => {
  await page.route('**/rest/v1/rpc/submit_weekly_checkin', (route) => {
    rpcCalls.submit += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SIGN_SUCCESS),
    });
  });
  await page.route('**/rest/v1/rpc/get_weekly_checkin_status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STATUS_NOT_SIGNED),
    }),
  );
};

const fakeLogin = async (page) => {
  await page
    .waitForFunction(
      () => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return Boolean(pinia) && pinia.state.value.auth.isInitialized === true;
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {});

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(
      ({ userId, cardUrl }) => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const auth = pinia.state.value.auth;
        auth.isLoggedIn = true;
        Object.assign(auth.userInfo, {
          id: userId,
          username: 'Ryyik',
          role: 'user',
          points: 100,
          pointsCardSkin: 'custom',
          pointsCardImageUrl: cardUrl,
        });
      },
      { userId: FAKE_USER_ID, cardUrl: CARD_SVG },
    );
    await page.waitForTimeout(450);
    const stillIn = await page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return Boolean(pinia) && pinia.state.value.auth.isLoggedIn === true;
    });
    if (stillIn) return;
  }
};

/** 采样 transform → 角度峰值（matrix3d 的 m11/m13 就是 rotateY 的 cos/sin） */
const sampleSpinAngle = (page) =>
  page.evaluate(async () => {
    const card = document.querySelector('[data-checkin-stage] .checkin-card-3d');
    if (!card) return { peak: 0, samples: 0 };
    let peak = 0;
    let samples = 0;
    const started = performance.now();
    while (performance.now() - started < 1100) {
      const raw = getComputedStyle(card).transform;
      const matrix = new DOMMatrix(raw === 'none' ? undefined : raw);
      const angle = Math.abs((Math.atan2(-matrix.m13, matrix.m11) * 180) / Math.PI);
      peak = Math.max(peak, Math.round(angle));
      samples += 1;
      await new Promise((resolve) => setTimeout(resolve, 24));
    }
    return { peak, samples };
  });

/* ⚠️ 必须 `Object.assign` 原地改：auth store 里的 `userInfo` 是 `reactive({...})`，
   整体赋值只换掉 pinia state 上那个属性，组件里 `const { userInfo } = authStore`
   拿到的仍是旧对象 ⇒ 卡面永远 blank（表现为找不到 <img>，断言全成空转）。 */
const setCardSkin = (page) =>
  page.evaluate(
    ({ userId, cardUrl }) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: userId,
        username: 'Ryyik',
        role: 'user',
        points: 100,
        pointsCardSkin: 'custom',
        pointsCardImageUrl: cardUrl,
      });
    },
    { userId: FAKE_USER_ID, cardUrl: CARD_SVG },
  );

const waitStage = (page, timeout = 2500) =>
  page
    .waitForSelector('[data-checkin-stage]', { timeout })
    .then(() => true)
    .catch(() => false);

/* ========== 场景 A：竖屏 390×844 ========== */
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await mockBackend(page);
await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page
  .waitForFunction(() => Boolean(document.querySelector('.forum-page .forum-toolbar')), null, {
    timeout: 20000,
  })
  .catch(() => {});
await fakeLogin(page);
await page.waitForTimeout(1200);

const checkinButton = page.locator('.toolbar-checkin-inline').first();
const hasButton = (await checkinButton.count()) > 0;
check(
  '竖屏：签到入口存在（行内文字钮）',
  hasButton,
  hasButton ? '' : '未找到 .toolbar-checkin-inline',
);

check(
  '点击前：没有常驻舞台（v-if 未挂载）',
  (await page.locator('[data-checkin-stage]').count()) === 0,
);

const beforeText = hasButton ? (await checkinButton.innerText()).trim() : '';
// 临点前再补一次卡面字段：auth store 初始化完成后会把 userInfo 覆盖回空对象
await setCardSkin(page);
if (hasButton) await checkinButton.click();

const mounted = await waitStage(page);
check('点击后：舞台出现（无需再点第二次）', mounted);
check(
  '旧弹窗已下线：.checkin-overlay 不存在',
  (await page.locator('.checkin-overlay').count()) === 0,
);

if (mounted) {
  const assetReady = await page.getAttribute('[data-checkin-stage]', 'data-asset-ready');
  check(
    '资源就绪标记 data-asset-ready="1"（起播前落位）',
    assetReady === '1',
    `实际=${assetReady}`,
  );

  const spin = await sampleSpinAngle(page);
  check(
    '卡面真的在 3D 旋转（transform 峰值角 > 30°）',
    spin.peak > 30,
    `peak=${spin.peak}° samples=${spin.samples}`,
  );

  const cardInfo = await page.evaluate(() => {
    const stage = document.querySelector('[data-checkin-stage]');
    const card = stage?.querySelector('.points-card');
    const img = stage?.querySelector('.points-card-custom-image');
    const persp = stage?.querySelector('.checkin-card-persp');
    const copy = stage?.querySelector('.checkin-stage-copy');
    const rect = persp?.getBoundingClientRect();
    return {
      text: stage?.innerText || '',
      hasCard: Boolean(card),
      img: img
        ? { complete: img.complete, naturalWidth: img.naturalWidth, src: img.getAttribute('src') }
        : null,
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      copyRect: copy
        ? (({ x, y, width, height }) => ({ x, y, width, height }))(copy.getBoundingClientRect())
        : null,
      touchAction: getComputedStyle(stage).touchAction,
      overscroll: getComputedStyle(stage).overscrollBehaviorY,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  check('卡面用的是用户自己的卡面（.points-card 已挂载）', cardInfo.hasCard);
  check(
    '卡面图已解码完成（complete && naturalWidth > 0）',
    Boolean(cardInfo.img?.complete && cardInfo.img?.naturalWidth > 0),
    cardInfo.img ? `complete=${cardInfo.img.complete} nw=${cardInfo.img.naturalWidth}` : '无 img',
  );
  check(
    '卡面尺寸合理（200 < 宽 ≤ 390，高 > 0）',
    Boolean(cardInfo.rect && cardInfo.rect.width > 200 && cardInfo.rect.width <= 390),
    cardInfo.rect
      ? `w=${Math.round(cardInfo.rect.width)} h=${Math.round(cardInfo.rect.height)}`
      : '无包围盒',
  );
  check('文案含「签到成功」', cardInfo.text.includes('签到成功'));
  check(
    '文案含后端返回的积分（+5 积分）',
    cardInfo.text.includes('+5 积分'),
    cardInfo.text.replace(/\n/g, ' | ').slice(0, 80),
  );
  check(
    '舞台关掉了触摸滚动（touch-action: none + overscroll-behavior: contain）',
    cardInfo.touchAction === 'none' && cardInfo.overscroll === 'contain',
    `touch-action=${cardInfo.touchAction} overscroll-y=${cardInfo.overscroll}`,
  );
  check(
    '竖屏布局：文案在卡片下方（copy.y ≥ 卡片底部）',
    Boolean(cardInfo.copyRect && cardInfo.rect && cardInfo.copyRect.y >= cardInfo.rect.y),
    cardInfo.copyRect
      ? `cardBottom=${Math.round(cardInfo.rect.y + cardInfo.rect.height)} copyTop=${Math.round(cardInfo.copyRect.y)}`
      : '无文案包围盒',
  );

  /* 真实滚轮事件：舞台期间页面不许跟着动 */
  const lock = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
  }));
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  const afterWheel = await page.evaluate(() => window.scrollY);
  check(
    '舞台期间滚轮不会带动页面（scrollY 不变）',
    afterWheel === lock.scrollY,
    `before=${lock.scrollY} after=${afterWheel} 页面可滚=${lock.scrollable}`,
  );

  await page.screenshot({ path: `${OUT}/checkin-reward-stage-portrait.png` });
}

/* 点任意处关闭 */
if (mounted) {
  await page.mouse.click(195, 120);
  const gone = await page
    .waitForSelector('[data-checkin-stage]', { state: 'detached', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  check('点任意处可在 1.5s 内关闭舞台', gone);
}

await page.waitForTimeout(400);

/* 已签态：再点 = 「再看一遍」。用户明确要的行为（2026-10-29）：
   同一套舞台重播，文案换成「已签到」，且**不再提交**后端。 */
if (hasButton) {
  const signedText = (await checkinButton.innerText()).trim();
  check(
    '签到后按钮翻成「已签」',
    signedText.includes('已签'),
    `点击前=${beforeText} 之后=${signedText}`,
  );

  const submitBefore = rpcCalls.submit;
  await setCardSkin(page);
  await checkinButton.click();
  const replayMounted = await waitStage(page);
  check('已签状态再点：重播舞台（不是提示岛）', replayMounted);

  if (replayMounted) {
    const replay = await page.evaluate(() => {
      const stage = document.querySelector('[data-checkin-stage]');
      return {
        alreadySigned: stage?.getAttribute('data-already-signed'),
        award: stage?.getAttribute('data-award'),
        assetReady: stage?.getAttribute('data-asset-ready'),
        hasCard: Boolean(stage?.querySelector('.points-card')),
        text: stage?.innerText || '',
      };
    });
    check(
      '重播标记 data-already-signed="1"',
      replay.alreadySigned === '1',
      `实际=${replay.alreadySigned}`,
    );
    check('重播不带到账数字（data-award="0"）', replay.award === '0', `实际=${replay.award}`);
    check(
      '重播文案是「已签到」且不出现「+N 积分」',
      replay.text.includes('已签到') && !/\+\d+\s*积分/.test(replay.text),
      replay.text.replace(/\s*\n+\s*/g, ' | '),
    );
    check('重播仍用用户自己的卡面', replay.hasCard);
    check(
      '重播同样先就绪再起播（data-asset-ready="1"）',
      replay.assetReady === '1',
      `实际=${replay.assetReady}`,
    );

    const replaySpin = await sampleSpinAngle(page);
    check(
      '重播也是真的在转（transform 峰值角 > 30°）',
      replaySpin.peak > 30,
      `peak=${replaySpin.peak}° samples=${replaySpin.samples}`,
    );

    check(
      '已签再点不重复提交 RPC（submit 次数没涨）',
      rpcCalls.submit === submitBefore,
      `before=${submitBefore} after=${rpcCalls.submit}`,
    );

    await page.mouse.click(195, 120);
    await page.waitForTimeout(400);
  }
}

await context.close();

/* ========== 场景 B：短横屏 1180×520（≥1024 才有 hero 胶囊钮） ========== */
rpcCalls.submit = 0;
const landContext = await browser.newContext({ viewport: { width: 1180, height: 520 } });
const landPage = await landContext.newPage();
await mockBackend(landPage);
await landPage.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await landPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await landPage
  .waitForFunction(() => Boolean(document.querySelector('.forum-page .forum-toolbar')), null, {
    timeout: 20000,
  })
  .catch(() => {});
await fakeLogin(landPage);
await landPage.waitForTimeout(1200);

const heroButton = landPage.locator('.toolbar-hero-pill').first();
const hasHero = (await heroButton.count()) > 0;
check('横屏：签到入口存在（hero 胶囊钮）', hasHero);
await setCardSkin(landPage);
if (hasHero) await heroButton.click();

const landMounted = await waitStage(landPage);
check('横屏：舞台出现', landMounted);

if (landMounted) {
  const layout = await landPage.evaluate(() => {
    const stage = document.querySelector('[data-checkin-stage]');
    const persp = stage.querySelector('.checkin-card-persp').getBoundingClientRect();
    const copy = stage.querySelector('.checkin-stage-copy').getBoundingClientRect();
    const imgs = [...stage.querySelectorAll('img')].map((img) => ({
      complete: img.complete,
      nw: img.naturalWidth,
    }));
    return {
      card: {
        x: persp.x,
        y: persp.y,
        right: persp.right,
        width: persp.width,
        height: persp.height,
      },
      copy: { x: copy.x, y: copy.y, width: copy.width, height: copy.height },
      imgs,
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
    };
  });

  check(
    '横屏布局：文案排在卡片右侧（不是压在下面）',
    layout.copy.x >= layout.card.right - 12,
    `cardRight=${Math.round(layout.card.right)} copyX=${Math.round(layout.copy.x)}`,
  );
  check(
    '横屏布局：卡片与文案都在视口内（不越界、不撑出滚动条）',
    layout.card.x >= 0 &&
      layout.copy.x + layout.copy.width <= layout.vw + 1 &&
      layout.copy.y >= 0 &&
      layout.copy.y + layout.copy.height <= layout.vh + 1 &&
      layout.card.y >= 0 &&
      layout.card.height <= layout.vh,
    [
      `card.x=${Math.round(layout.card.x)}`,
      `card.y=${Math.round(layout.card.y)}`,
      `cardBot=${Math.round(layout.card.y + layout.card.height)}`,
      `copy.x=${Math.round(layout.copy.x)}`,
      `copyRight=${Math.round(layout.copy.x + layout.copy.width)}`,
      `copyBot=${Math.round(layout.copy.y + layout.copy.height)}`,
      `vw=${layout.vw}`,
      `vh=${layout.vh}`,
    ].join(' '),
  );
  check(
    '横屏：卡面图仍然解码完成',
    layout.imgs.length > 0 && layout.imgs.every((item) => item.complete && item.nw > 0),
    JSON.stringify(layout.imgs.slice(0, 3)),
  );
  check('横屏：舞台自身不产生页面滚动', !layout.scrollable);

  await landPage.screenshot({ path: `${OUT}/checkin-reward-stage-landscape.png` });
}

await landContext.close();
await browser.close();

const total = results.length;
const failed = results.filter((item) => !item.pass).length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
