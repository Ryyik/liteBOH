import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：BOH Camera Beta —— 实时滤镜取景 / 变焦 / 层叠相册 / 交接（plans/041）
//
//   为什么要假摄像头：真实的 getUserMedia 在 CI/无人值守环境拿不到设备。
//   Chromium 的 `--use-fake-device-for-media-stream` 会给一路 1920×1440 的
//   动态测试图，足以验证「起流 → 预览 → 快门 → 裁切尺寸 → 暂存」整条链；
//   它验证不了的是**真机上的取景流畅度与 iOS 授权手势**（那两条只能人测）。
//
//   断言（A–H）：
//     A 图库头部存在相机入口（含 Beta 角标），且可点击进入相机页
//     B 相机页起流：video.readyState ≥ 2 且 videoWidth > 0
//     C 12 档滤镜逐档切换，video 的 computed filter 与 resolveFilterLook 完全一致
//     D 强度拖到 0 → filter 回到 none（「强度 0 必须严格等于原图」在相机侧也成立）
//     E 快门 → 层叠相册出现、计数 1、缩略图是 blob:
//     F 连拍 3 张 → 计数 3；点开暂存相册 → 3 格；删 1 张 → 2 格
//     G 变焦 2× → video 的 transform 矩阵缩放为 2（数码变焦必须真的作用在画面上）
//     H 点「完成」→ 回到图库且「新建」面板打开；离开后原 stream 的 track 全部 ended
//     I 无 mediaDevices 的环境 → 显示不可用文案，且不出现「重试」（没有可重试的东西）
//     N 未授权首次进入 → **不进页面就调 getUserMedia**（调用数 0）、显示开机台；
//       点「开启相机」后才请求一次并出画面（iOS 手势链的回归测试）
//     O 权限已被记住「拒绝」→ 不发起注定失败的请求，文案指向站点设置，给的是刷新而非重试
//     P 保存的幂等性 → 二轮只存新增那张（文件名 -03），前两张不重复下载、序号不前移
//
//   counter-proof（做过）：
//     把 videoStyle 里的 `scale(${digitalZoom})` 去掉 → G 必红（矩阵恒为 1）；
//     把 shots 改成只保留最后一张 → F 的「计数 3 / 3 格」必红。
//
//   BASE 环境变量可覆盖（默认 http://localhost:5188）：
//     BASE=http://[::1]:5173 node scripts/probes/probe-camera-live.mjs
// =====================================================================

const BASE = process.env.BASE || 'http://localhost:5188';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

/** 本地 playwright 缓存的 chrome-for-testing（CI 用默认安装即可） */
const CHROME =
  process.env.CHROME_BIN ||
  '/Users/ryyik/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const VIEWPORT = { width: 390, height: 844 };

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const normalizeCss = (value) => String(value || '').replace(/\s+/g, '');

const launch = () =>
  chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

const newContext = async (browser, extraPermissions = true) =>
  browser.newContext({
    viewport: VIEWPORT,
    ...(extraPermissions ? { permissions: ['camera'] } : {}),
  });

/** 注入登录态：**必须等应用自己的 initLoginState 跑完再注入**（否则守卫会覆盖） */
async function injectLogin(page) {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    pinia.state.value.auth.isInitialized = true;
    Object.assign(pinia.state.value.auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
    });
  });
}

async function gotoHash(page, hash) {
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
}

async function waitCameraReady(page) {
  await page.waitForSelector('.boh-cam__video', { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const video = document.querySelector('.boh-cam__video');
      return video && video.readyState >= 2 && video.videoWidth > 0;
    },
    null,
    { timeout: 15000 },
  );
}

// 数字角标已退役，计数口径改成卷号牌上的格数
const readStackCount = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="camera-roll"] .boh-cam__roll-num b');
    return el ? Number(el.textContent.trim()) : -1;
  });

async function main() {
  const browser = await launch();

  /* ── 场景 1：入口 + 起流 + 滤镜 + 变焦 + 连拍 + 交接 ─────────────────── */
  const context = await newContext(browser);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectLogin(page);

  // A 图库入口
  await gotoHash(page, '#/user-space/note');
  await page.waitForTimeout(3200);
  const entry = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="gallery-camera-entry"]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return {
      text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  check('A1 图库头部有相机入口', Boolean(entry?.visible), JSON.stringify(entry));
  check('A2 入口带 Beta 角标', Boolean(entry?.text?.includes('Beta')), entry?.text || '');
  await page.screenshot({ path: `${OUT}/camera-A-gallery-entry.png` });

  await page.click('[data-testid="gallery-camera-entry"]');
  await waitCameraReady(page);
  check('A3 点入口进入相机页', page.url().includes('/user-space/note/camera'), page.url());

  // B 起流
  const streamInfo = await page.evaluate(() => {
    const video = document.querySelector('.boh-cam__video');
    return {
      readyState: video.readyState,
      width: video.videoWidth,
      height: video.videoHeight,
      hasStream: Boolean(video.srcObject),
      playsinline: video.hasAttribute('playsinline'),
      muted: video.muted,
    };
  });
  check(
    'B1 起流成功',
    streamInfo.readyState >= 2 && streamInfo.width > 0,
    JSON.stringify(streamInfo),
  );
  check('B2 video 带 playsinline + muted', streamInfo.playsinline && streamInfo.muted);

  // K 胶卷机质感：胶卷盒滤镜条 + 卷号牌
  const filmUi = await page.evaluate(() => {
    const boxes = document.querySelectorAll('.boh-cam__box');
    const swatch = document.querySelector('.boh-cam__swatch');
    const roll = document.querySelector('[data-testid="camera-roll"]');
    return {
      boxes: boxes.length,
      boxName: boxes[1]?.querySelector('.boh-cam__box-name')?.textContent?.trim() || '',
      swatchHidden: swatch ? getComputedStyle(swatch).display === 'none' : true,
      roll: roll?.querySelector('.boh-cam__roll-num b')?.textContent?.trim() || '',
      total: roll?.querySelector('.boh-cam__roll-num span')?.textContent?.trim() || '',
      stock: roll?.querySelector('.boh-cam__roll-name')?.textContent?.trim() || '',
    };
  });
  check(
    'K1 16 档都渲染成胶卷盒，色块已隐藏',
    filmUi.boxes === 16 && filmUi.swatchHidden,
    JSON.stringify(filmUi),
  );
  check(
    'K2 卷号牌从 00 / 36 起',
    filmUi.roll === '00' && filmUi.total === '36',
    JSON.stringify(filmUi),
  );
  check(
    'K3 卷名有值（盒面与卷号牌同源）',
    filmUi.boxName.length > 0 && filmUi.stock.length > 0,
    JSON.stringify(filmUi),
  );

  // C 逐档滤镜
  const presets = await page.evaluate(async () => {
    const mod = await import('/src/utils/image-editor-filters.js');
    return mod.IMAGE_EDITOR_FILTERS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      css: mod.resolveFilterLook(preset.id, 1).css,
    }));
  });
  let filterMismatch = null;
  for (let index = 0; index < presets.length; index += 1) {
    await page.locator('.boh-cam__chip').nth(index).click();
    await page.waitForTimeout(90);
    const actual = await page.evaluate(() => {
      const video = document.querySelector('.boh-cam__video');
      return getComputedStyle(video).filter;
    });
    if (normalizeCss(actual) !== normalizeCss(presets[index].css)) {
      filterMismatch = `${presets[index].label}: 期望 ${presets[index].css} / 实际 ${actual}`;
      break;
    }
  }
  check(
    'C1 全部滤镜的预览 CSS 与预设一致',
    !filterMismatch,
    filterMismatch || `${presets.length} 档`,
  );

  // D 强度 0 = 原图
  await page.evaluate(() => {
    const input = document.querySelector('.boh-cam__strength input');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(160);
  const zeroFilter = await page.evaluate(
    () => getComputedStyle(document.querySelector('.boh-cam__video')).filter,
  );
  check('D1 强度 0 时 filter 回到 none', zeroFilter === 'none', zeroFilter);

  // 恢复到一档有物理层的滤镜，供截图与快门用
  await page.locator('.boh-cam__chip').nth(1).click();
  await page.evaluate(() => {
    const input = document.querySelector('.boh-cam__strength input');
    input.value = '100';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);

  // G 变焦
  const zoomSteps = (await page.locator('.boh-cam__zoom-step').allTextContents()).map((text) =>
    text.trim(),
  );
  await page.locator('.boh-cam__zoom-step').nth(1).click();
  await page.waitForTimeout(260);
  const zoomState = await page.evaluate(() => {
    const video = document.querySelector('.boh-cam__video');
    const matrix = getComputedStyle(video).transform;
    const match = /matrix\(([-\d.]+)/.exec(matrix);
    return { matrix, scale: match ? Number(match[1]) : 1 };
  });
  check('G1 变焦 2× 作用在预览上', Math.abs(zoomState.scale - 2) < 0.01, JSON.stringify(zoomState));
  check('G2 变焦档位齐全（1×/2×/3×）', zoomSteps.join('') === '1×2×3×', zoomSteps.join(' '));
  const zoomCaption = await page.evaluate(
    () => document.querySelector('.boh-cam__zoom-caption')?.textContent?.trim() || '',
  );
  // 假摄像头没有 zoom 约束 ⇒ 文案必须是「数码变焦」；真机上可能是「1×–10× 变焦」。
  // 刻意不写「镜头」：zoom.max 常是数码上限（128×），写「镜头」会暗示整段都是光学
  check('G3 标注了本机的真实变焦能力', /数码变焦|变焦/.test(zoomCaption), zoomCaption);

  // J 点按对焦：能真正触发 AF 的机型很少，但「点了要有框」是纯交互，必须成立
  await page.mouse.click(195, 430);
  await page.waitForTimeout(180);
  const focusBox = await page.evaluate(() => {
    const box = document.querySelector('.boh-cam__focus');
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    return { visible: rect.width > 0 && rect.height > 0, left: Math.round(rect.left) };
  });
  check('J1 点按取景框出现对焦框', Boolean(focusBox?.visible), JSON.stringify(focusBox));
  await page.screenshot({ path: `${OUT}/camera-G-focus.png` });
  await page.waitForTimeout(900);
  const focusGone = await page.evaluate(() => !document.querySelector('.boh-cam__focus'));
  check('J2 对焦框 1s 内自动消失', focusGone);
  await page.screenshot({ path: `${OUT}/camera-B-zoom.png` });

  // E 快门 → 过片 → 暂存
  // 采样器必须在点击前装好：动画只有 520ms，waitForFunction 的轮询可能整段错过。
  await page.evaluate(() => {
    window.__fly = { samples: [], t0: 0 };
    const tick = () => {
      const el = document.querySelector('.boh-cam__fly');
      if (el) {
        if (!window.__fly.t0) window.__fly.t0 = performance.now();
        const r = el.getBoundingClientRect();
        window.__fly.samples.push({
          t: Math.round(performance.now() - window.__fly.t0),
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
      if (!window.__fly.t0 || performance.now() - window.__fly.t0 < 900) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await page.click('[data-testid="camera-shutter"]');
  await page.waitForTimeout(1500);
  const fly = await page.evaluate(() => window.__fly);
  const flyFirst = fly.samples[0] || {};
  const flyLast = fly.samples[fly.samples.length - 1] || {};
  check('E0 成片有「过片」飞行动画', fly.samples.length > 0, `${fly.samples.length} 帧`);
  // 这条是反证用的核心断言：scoped CSS 对 createElement 的元素无效时，
  // 副本会按整屏宽渲染（实测 390px），看起来像「屏幕左边闪一下」而不是飞卡片。
  check(
    'E0b 副本是 46px 小卡，不是整屏宽',
    fly.samples.length > 0 && fly.samples.every((s) => s.w >= 44 && s.w <= 60),
    JSON.stringify(fly.samples.slice(0, 3)),
  );
  check(
    'E0c 从快门飞到片位（横向位移 > 100px）',
    Math.abs((flyLast.x || 0) - (flyFirst.x || 0)) > 100,
    `Δx=${(flyLast.x || 0) - (flyFirst.x || 0)}`,
  );
  check('E0d 动画时长够看清（> 400ms）', (flyLast.t || 0) > 400, `${flyLast.t}ms`);
  await page.waitForTimeout(400);
  const afterOne = await page.evaluate(() => {
    const cards = document.querySelectorAll('.boh-cam__stack-card');
    return {
      roll:
        document
          .querySelector('[data-testid="camera-roll"] .boh-cam__roll-num b')
          ?.textContent?.trim() || '',
      cards: cards.length,
      src: cards[cards.length - 1]?.getAttribute('src')?.slice(0, 5) || '',
      fly: document.querySelectorAll('.boh-cam__fly').length,
    };
  });
  check('E1 快门后进入层叠相册且卷号跳到 01', afterOne.roll === '01', JSON.stringify(afterOne));
  check('E2 缩略图是本地 blob', afterOne.src === 'blob:', afterOne.src);

  // F 连拍
  await page.click('[data-testid="camera-shutter"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="camera-shutter"]');
  await page.waitForTimeout(1400);
  const count3 = await readStackCount(page);
  check('F1 连拍计数为 3', count3 === 3, String(count3));
  await page.screenshot({ path: `${OUT}/camera-C-stack.png` });

  await page.click('[data-testid="camera-stack"]');
  await page.waitForTimeout(420);
  const reviewCount = await page.evaluate(
    () => document.querySelectorAll('.boh-cam__review-item').length,
  );
  check('F2 暂存相册列出 3 张', reviewCount === 3, String(reviewCount));
  const filmBase = await page.evaluate(() => {
    const caps = Array.from(document.querySelectorAll('.boh-cam__review-cap'));
    return {
      caps: caps.length,
      first: caps[0]?.textContent?.replace(/\s+/g, ' ').trim() || '',
      paper: getComputedStyle(document.querySelector('.boh-cam__review-item')).backgroundColor,
    };
  });
  check(
    'F4 每张都带片基卷号（BOH 卷名 · 序号）',
    filmBase.caps === 3 && /\d{2}$/.test(filmBase.first),
    JSON.stringify(filmBase),
  );
  await page.screenshot({ path: `${OUT}/camera-D-review.png` });

  // F5–F11 选片：大图预览 / 切换 / 预览内删除 / 存到本地入口
  await page.locator('.boh-cam__review-open').first().click();
  await page.waitForTimeout(420);
  const preview1 = await page.evaluate(() => ({
    open: Boolean(document.querySelector('.boh-cam__preview')),
    count: document.querySelector('.boh-cam__preview-count')?.textContent?.trim() || '',
    hasPrev: Boolean(document.querySelector('.boh-cam__preview-nav.is-prev')),
    hasNext: Boolean(document.querySelector('.boh-cam__preview-nav.is-next')),
    imgW: Math.round(
      document.querySelector('.boh-cam__preview-img')?.getBoundingClientRect().width || 0,
    ),
  }));
  check(
    'F5 点缩略图打开大图预览（1 / 3）',
    preview1.open && preview1.count === '1 / 3',
    JSON.stringify(preview1),
  );
  check('F6 第一张没有「上一张」、有「下一张」', !preview1.hasPrev && preview1.hasNext);
  check('F7 大图铺满可视宽度', preview1.imgW >= 380, String(preview1.imgW));
  await page.screenshot({ path: `${OUT}/camera-I-preview.png` });

  await page.click('.boh-cam__preview-nav.is-next');
  await page.waitForTimeout(260);
  check('F8 下一张切到 2 / 3', (await page.textContent('.boh-cam__preview-count')) === '2 / 3');

  // 预览内删除最危险：删的是当前张时，索引要自动落到下一张而不是越界
  await page.click('.boh-cam__preview-actions .boh-cam__ghost.is-danger');
  await page.waitForTimeout(320);
  const afterPreviewRemove = await page.evaluate(() => ({
    count: document.querySelector('.boh-cam__preview-count')?.textContent?.trim() || 'closed',
    tiles: document.querySelectorAll('.boh-cam__review-open').length,
  }));
  check(
    'F9 预览内删除后停在下一张（2 / 2）',
    afterPreviewRemove.count === '2 / 2' && afterPreviewRemove.tiles === 2,
    JSON.stringify(afterPreviewRemove),
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('F10 Esc 关闭预览', (await page.locator('.boh-cam__preview').count()) === 0);

  const saveBtn = page.locator('[data-testid="camera-save-all"]');
  check(
    'F11 暂存相册有「存到本地」入口',
    (await saveBtn.count()) === 1 && (await saveBtn.isEnabled()),
  );

  await page.locator('.boh-cam__review-remove').first().click();
  await page.waitForTimeout(320);
  const afterRemove = await page.evaluate(
    () => document.querySelectorAll('.boh-cam__review-item').length,
  );
  check('F3 网格删除再删一张后剩 1 张', afterRemove === 1, String(afterRemove));

  // H 完成 → 交接 + 停流
  await page.evaluate(() => {
    window.__probeStream = document.querySelector('.boh-cam__video').srcObject;
  });
  await page.locator('.boh-cam__review-foot .boh-cam__primary').click();
  await page.waitForTimeout(3000);
  const afterFinish = await page.evaluate(() => ({
    hash: location.hash,
    composerOpen: Boolean(document.querySelector('.composer-overlay')),
    tracksEnded: (() => {
      const tracks = window.__probeStream?.getTracks?.() || [];
      return tracks.length > 0 && tracks.every((track) => track.readyState === 'ended');
    })(),
  }));
  check(
    'H1 完成后回到图库',
    afterFinish.hash.includes('/user-space/note') && !afterFinish.hash.includes('camera'),
    afterFinish.hash,
  );
  check('H2 图库的「新建」面板自动打开', afterFinish.composerOpen);
  check('H3 离开相机后轨道全部 ended', afterFinish.tracksEnded);
  await page.screenshot({ path: `${OUT}/camera-E-handoff.png` });

  check('X1 页面无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await context.close();

  /* ── 场景 2：首次进入（未授权）—— 不许自动请求，必须先等一次点击 ──────
   *
   * 这是 2026-11-06 用户报的「打开就黑屏、系统不弹权限框」的回归测试。
   * 真因是 onMounted 里直接调 getUserMedia：iOS Safari 会**静默拒绝**（不弹窗、
   * 不抛给用户），页面就停在黑帧上。所以这里断言两件事：
   *   ① 进页面时 getUserMedia 的调用次数必须是 0
   *   ② 点「开启相机」后才变成 1，并且真的出画面
   * 只要有人把取流挪回 onMounted，①立刻变红。
   *
   * ⚠️ 必须 stub `permissions.query`：Chromium 在本套件的启动参数下
   * （`--use-fake-ui-for-media-stream`）会把 camera 直接报成 granted，
   * 那条真实分支走的是「已授权静默开」，测不到首次授权。 */
  const stubPermission = (permState) => {
    window.__gumCalls = 0;
    const originalGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__gumCalls += 1;
      return originalGum(...args);
    };
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (desc) =>
      desc?.name === 'camera'
        ? Promise.resolve({ state: permState, onchange: null })
        : originalQuery(desc);
  };

  /* ⚠️ 这一组用**独立浏览器实例**：Chromium 的假摄像头在前一个上下文刚关闭时
   * 偶尔会给出「流起来了但没有帧」的轨道（实测过一次偶发红），
   * 那会让这条回归测试本身变得不可信。 */
  const gateBrowser = await launch();

  const openGatePage = async (state) => {
    const context = await gateBrowser.newContext({ viewport: VIEWPORT });
    // ⚠️ 参数必须走 addInitScript 的第二个实参：闭包变量会被序列化丢掉
    await context.addInitScript(stubPermission, state);
    const page = await context.newPage();
    await page.bringToFront();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await injectLogin(page);
    await gotoHash(page, '#/user-space/note/camera');
    await page.waitForSelector('.boh-cam', { timeout: 15000 });
    await page.waitForTimeout(1500);
    return { context, page };
  };

  const gateRun = await openGatePage('prompt');
  const gatePage = gateRun.page;
  const gateState = await gatePage.evaluate(() => ({
    calls: window.__gumCalls,
    title: document.querySelector('.boh-cam__gate-title')?.textContent?.trim() || '',
    hasFallback: Boolean(document.querySelector('.boh-cam__fallback')),
  }));
  check(
    'N1 进页面不自动请求摄像头（未授权时必须等点击）',
    gateState.calls === 0,
    `getUserMedia 调用 ${gateState.calls} 次`,
  );
  check('N2 显示「开启相机」中转屏而不是黑屏', gateState.title.length > 0, gateState.title);
  check('N3 未授权时不误报「不可用」', !gateState.hasFallback);
  await gatePage.screenshot({ path: `${OUT}/camera-N-gate.png` });

  await gatePage.click('.boh-cam__gate-btn');
  await gatePage.waitForFunction(
    () => {
      const video = document.querySelector('.boh-cam__video');
      return video && video.readyState >= 2 && video.videoWidth > 0;
    },
    null,
    { timeout: 20000 },
  );
  const afterTap = await gatePage.evaluate(() => ({
    calls: window.__gumCalls,
    gateGone: !document.querySelector('[data-testid="camera-gate"]'),
    width: document.querySelector('.boh-cam__video')?.videoWidth || 0,
  }));
  check(
    'N4 点「开启相机」后才真正请求，且只请求一次',
    afterTap.calls === 1,
    String(afterTap.calls),
  );
  check(
    'N5 点击后中转屏消失并出画面',
    afterTap.gateGone && afterTap.width > 0,
    JSON.stringify(afterTap),
  );
  await gatePage.screenshot({ path: `${OUT}/camera-N-live.png` });
  await gateRun.context.close();

  /* ── 场景 2b：权限已被浏览器记住「拒绝」—— 不能再装作能重试 ────────── */
  const deniedRun = await openGatePage('denied');
  const deniedPage = deniedRun.page;
  const deniedState = await deniedPage.evaluate(() => ({
    calls: window.__gumCalls,
    text:
      document.querySelector('.boh-cam__fallback')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    buttons: Array.from(document.querySelectorAll('.boh-cam__retry')).map((el) =>
      el.textContent.trim(),
    ),
  }));
  check(
    'N6 已被拒绝时不去调 getUserMedia（调了也不会弹窗）',
    deniedState.calls === 0,
    String(deniedState.calls),
  );
  check(
    'N7 文案指出去站点设置改，而不是让人点「重试」',
    deniedState.text.includes('站点设置'),
    deniedState.text,
  );
  check(
    'N8 给的是「刷新页面」而不是无效的「重试」',
    deniedState.buttons.some((label) => label.includes('刷新')) &&
      !deniedState.buttons.includes('重试'),
    deniedState.buttons.join(' / '),
  );
  await deniedPage.screenshot({ path: `${OUT}/camera-O-blocked.png` });
  await deniedRun.context.close();

  /* ── 场景 2c：保存的幂等性 —— 第二轮不许把第一轮再存一遍 ──────────────
   *
   * 用户反馈：存过一轮，再拍几张点保存，相册里会出现重复照片。
   * 真因是 saveAllShots() 永远把整个 shots 数组交出去，且没有「已存」标记。
   * 断言口径用**真实下载文件名**：第一轮 `-01/-02`，第二轮只应出现 `-03`。
   * 序号错位（变成 -01）同样算红 —— 那会让用户以为存错了。 */
  const saveContext = await gateBrowser.newContext({ viewport: VIEWPORT });
  // ⚠️ 必须关掉 Web Share：无头 Chrome 里 `navigator.share` 存在但**会挂住**
  //    （实测：既不 resolve 也不 reject，按钮一直 disabled），
  //    不关掉就永远测不到下载通道。分享通道本身没法在无人值守下验证（要人点面板）。
  await saveContext.addInitScript(() => {
    for (const name of ['share', 'canShare']) {
      try {
        Object.defineProperty(navigator, name, { value: undefined, configurable: true });
      } catch {
        /* ignore */
      }
    }
  });
  const savePage = await saveContext.newPage();
  const downloads = [];
  savePage.on('download', (item) => downloads.push(item.suggestedFilename()));
  await savePage.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectLogin(savePage);
  await gotoHash(savePage, '#/user-space/note/camera');
  // 这个实例带 `--use-fake-ui-for-media-stream`，通常直接就是 granted；
  // 万一落到开机台，先点一下再等画面（与真实用户动作一致）
  await savePage.waitForSelector('.boh-cam', { timeout: 15000 });
  if (await savePage.$('.boh-cam__gate-btn')) await savePage.click('.boh-cam__gate-btn');
  await waitCameraReady(savePage);

  const waitDownloads = async (expected) => {
    const start = Date.now();
    while (downloads.length < expected && Date.now() - start < 9000) {
      await savePage.waitForTimeout(120);
    }
    return downloads.length;
  };

  // 第一轮：拍 2 张 → 存整批
  for (let i = 0; i < 2; i += 1) {
    await savePage.click('[data-testid="camera-shutter"]');
    await savePage.waitForTimeout(1000);
  }
  await savePage.click('[data-testid="camera-stack"]');
  await savePage.waitForTimeout(420);
  const firstSaveLabel = await savePage.textContent('[data-testid="camera-save-all"]');
  await savePage.click('[data-testid="camera-save-all"]');
  await waitDownloads(2);
  check('P1 整批保存前按钮写明待存张数', firstSaveLabel.includes('2'), firstSaveLabel.trim());
  // 卷名跟着当前滤镜走（默认「原图」= RAW），这里只钉序号，不钉卷名
  check(
    'P2 一轮 2 张全部落盘，文件名按序号',
    downloads.length === 2 && /-01\.jpg$/.test(downloads[0]) && /-02\.jpg$/.test(downloads[1]),
    downloads.join(','),
  );

  const afterSave = await savePage.evaluate(() => ({
    savedMarks: document.querySelectorAll('.boh-cam__review-saved').length,
    label: document.querySelector('[data-testid="camera-save-all"]')?.textContent?.trim() || '',
    disabled: document.querySelector('[data-testid="camera-save-all"]')?.disabled ?? null,
  }));
  check('P3 已存的每张都有 ✓ 标记', afterSave.savedMarks === 2, String(afterSave.savedMarks));
  check(
    'P4 全部存过后按钮变成不可点的「已存到本地」',
    afterSave.disabled === true && afterSave.label.includes('已存'),
    JSON.stringify(afterSave),
  );

  // 第二轮：回去再拍 1 张 → 再存
  await savePage.click('[data-testid="camera-review-continue"]');
  await savePage.waitForTimeout(400);
  await savePage.click('[data-testid="camera-shutter"]');
  await savePage.waitForTimeout(1100);
  await savePage.click('[data-testid="camera-stack"]');
  await savePage.waitForTimeout(420);
  const secondLabel = await savePage.textContent('[data-testid="camera-save-all"]');
  // 混态截图：前两张带 ✓、第三张没有 —— 正是用户反馈的那个场景
  await savePage.screenshot({ path: `${OUT}/camera-Q2-mixed.png` });
  await savePage.click('[data-testid="camera-save-all"]');
  await waitDownloads(3);

  check(
    'P5 第二轮待存数只算新增的那一张',
    secondLabel.includes('1') && !secondLabel.includes('3'),
    secondLabel.trim(),
  );
  check(
    'P6 🔴 第二轮不重复存前两张（只多出 -03）',
    downloads.length === 3 && /-03\.jpg$/.test(downloads[2]),
    downloads.join(','),
  );
  check(
    'P7 第一轮的两张没有被二次下载',
    downloads.filter((name) => /-01\.jpg$/.test(name)).length === 1 &&
      downloads.filter((name) => /-02\.jpg$/.test(name)).length === 1,
    downloads.join(','),
  );
  await savePage.screenshot({ path: `${OUT}/camera-Q-saved.png` });
  await saveContext.close();

  await gateBrowser.close();

  /* ── 场景 3：不支持摄像头的环境 ──────────────────────────────────────── */
  const plainContext = await newContext(browser, false);
  await plainContext.addInitScript(() => {
    // 模拟「没有开放摄像头接口」的浏览器（HTTP 或受限 WebView）
    try {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    } catch {
      /* ignore */
    }
  });
  const plainPage = await plainContext.newPage();
  await plainPage.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectLogin(plainPage);
  await gotoHash(plainPage, '#/user-space/note/camera');
  await plainPage.waitForSelector('.boh-cam', { timeout: 15000 });
  await plainPage.waitForTimeout(1200);
  const fallback = await plainPage.evaluate(() => {
    const box = document.querySelector('.boh-cam__fallback');
    return {
      text: box?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasRetry: Boolean(document.querySelector('.boh-cam__retry')),
    };
  });
  check(
    'I1 无摄像头接口时给出明确文案',
    fallback.text.includes('摄像头接口'),
    fallback.text || '(无)',
  );
  check('I2 不支持时不显示「重试」', !fallback.hasRetry);
  await plainPage.screenshot({ path: `${OUT}/camera-F-unsupported.png` });
  await plainContext.close();

  await browser.close();

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
