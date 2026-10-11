import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：横屏左栏「更多」（主题 / 退出登录）浮层可见性
//   回归对象（2026-10-11 用户报障「折叠/窄栏下内容显示不全」）：
//   `.userspace-rail-menu` 挂在 `.userspace-rail-scroll`（overflow-x: hidden +
//   overflow-y: auto）内部，绝对定位向右/向上展开时被滚动容器的 padding box 裁掉，
//   表现为窄栏（88px）下只剩图标 + 半个字（「深色模式」→「深」）。
//   断言口径：浮层矩形必须完整落在**所有裁剪祖先的交集**内，且菜单项文字
//   本身没有被压缩（scrollWidth ≤ clientWidth）。
//   反证：COUNTERPROOF=1 时注入 `.userspace-rail-scroll{overflow:visible!important}`
//   让裁剪消失——不对，反证方向相反，见文件末尾说明。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/rail-more-menu';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

async function open(width, height, tag, theme) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(700);
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
  await page.waitForSelector('.userspace-rail-item', { timeout: 20000 });
  if (theme === 'dark') {
    await page.evaluate(() =>
      document.querySelector('.user-space-page')?.setAttribute('data-theme', 'dark'),
    );
  }
  await page.waitForTimeout(2200);
  return { context, page };
}

/* 打开「更多」后量浮层：返回浮层矩形、被裁剪后的实际可见矩形、文字是否被压扁 */
const measureMenu = (page) =>
  page.evaluate(() => {
    const R = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const menu = document.querySelector('.userspace-rail-menu');
    const btn = document.querySelector('.userspace-rail-more');
    if (!menu) return { menuExists: false, btnExists: !!btn };

    const mr = R(menu);
    // 裁剪祖先交集：从自身往上收集所有 overflow-x/y != visible 的祖先
    let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    const clippers = [];
    for (
      let el = menu.parentElement;
      el && el !== document.documentElement;
      el = el.parentElement
    ) {
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      const oy = cs.overflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      const r = R(el);
      clippers.push({
        cls:
          el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : el.tagName,
        overflow: `${ox}/${oy}`,
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      });
      clip.left = Math.max(clip.left, r.left);
      clip.right = Math.min(clip.right, r.right);
      clip.top = Math.max(clip.top, r.top);
      clip.bottom = Math.min(clip.bottom, r.bottom);
    }

    const items = [...menu.querySelectorAll('.userspace-rail-menu-item')].map((b) => {
      const span = b.querySelector('span');
      const br = R(b);
      const sr = span ? R(span) : null;
      return {
        action: b.dataset.railAction,
        text: span ? span.textContent.trim() : '',
        spanLeft: sr ? Math.round(sr.left) : null,
        spanRight: sr ? Math.round(sr.right) : null,
        spanWidth: sr ? Math.round(sr.width) : null,
        // 文字被压扁 ⇒ scrollWidth > clientWidth（nowrap + 容器变窄的典型症状）
        spanClipped: span ? span.scrollWidth > span.clientWidth + 1 : null,
        itemWidth: Math.round(br.width),
      };
    });

    const visibleW = Math.max(0, Math.min(mr.right, clip.right) - Math.max(mr.left, clip.left));
    // 遮挡检测：浮层右端内侧必须仍是菜单自身 —— 只测「有没有被祖先裁」不够，
    // 被内容层盖住同样是「看不见」（窄栏下浮层要向右越出 88px 栏、压到内容区上）
    const probe = { x: Math.round(mr.right - 14), y: Math.round(mr.top + mr.height / 2) };
    const hit = document.elementFromPoint(probe.x, probe.y);
    return {
      menuExists: true,
      btnExists: !!btn,
      railWidth: Math.round(
        document.querySelector('.userspace-rail').getBoundingClientRect().width,
      ),
      menu: {
        left: Math.round(mr.left),
        top: Math.round(mr.top),
        right: Math.round(mr.right),
        bottom: Math.round(mr.bottom),
        width: Math.round(mr.width),
        height: Math.round(mr.height),
      },
      clip: {
        left: Math.round(clip.left),
        top: Math.round(clip.top),
        right: Math.round(clip.right),
        bottom: Math.round(clip.bottom),
      },
      clippers,
      visibleWidth: Math.round(visibleW),
      widthLoss: Math.round(mr.width - visibleW),
      notOccluded: !!hit && menu.contains(hit),
      hitDesc: hit ? `${hit.tagName}.${String(hit.className || '').slice(0, 40)}` : 'NULL',
      inViewport: mr.left >= -0.5 && mr.right <= window.innerWidth + 0.5 && mr.top >= -0.5,
      items,
    };
  });

// ───────── 档 1：1100×800 窄栏（用户报障档） ─────────
{
  const { context, page } = await open(1100, 800, 'narrow1100');
  await page.click('.userspace-rail-more');
  await page.waitForTimeout(260);
  const m = await measureMenu(page);
  console.log('\n[窄栏 1100×800] 原始测量：');
  console.log(JSON.stringify(m, null, 2));
  if (m.menuExists) {
    check(
      'N1 浮层被裁剪量 = 0（完整可见）',
      m.widthLoss === 0,
      `宽度损失 ${m.widthLoss}px / 浮层 ${m.menu.width}px`,
    );
    check(
      'N2 浮层落在视口内',
      m.inViewport === true,
      `left=${m.menu.left} right=${m.menu.right} vw=${1100}`,
    );
    const theme = m.items.find((i) => i.action === 'theme');
    check(
      'N3 主题项文字未被压扁',
      theme && theme.spanClipped === false,
      theme ? `"${theme.text}" span=${theme.spanWidth}px clipped=${theme.spanClipped}` : 'ABSENT',
    );
    check('N4 浮层未被内容层遮挡', m.notOccluded === true, `命中 ${m.hitDesc}`);
  } else {
    check('N1 浮层被裁剪量 = 0（完整可见）', false, '菜单未渲染');
  }
  await page.screenshot({ path: `${OUT}/narrow1100.png` }).catch(() => {});
  await context.close();
}

// ───────── 档 2：1440×900 宽栏（不得回归） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440');
  await page.click('.userspace-rail-more');
  await page.waitForTimeout(260);
  const m = await measureMenu(page);
  console.log('\n[宽栏 1440×900] 原始测量：');
  console.log(JSON.stringify(m, null, 2));
  if (m.menuExists) {
    check('W1 浮层被裁剪量 = 0（完整可见）', m.widthLoss === 0, `宽度损失 ${m.widthLoss}px`);
    check('W2 浮层未被内容层遮挡', m.notOccluded === true, `命中 ${m.hitDesc}`);
    const logout = m.items.find((i) => i.action === 'logout');
    check(
      'W3 退出项存在且文字未压扁',
      !!logout && logout.spanClipped === false,
      logout ? `"${logout.text}"` : 'ABSENT',
    );
  } else {
    check('W1 浮层被裁剪量 = 0（完整可见）', false, '菜单未渲染');
  }
  await page.screenshot({ path: `${OUT}/wide1440.png` }).catch(() => {});
  await context.close();
}

// ───────── 档 3：AI 页左栏（恒 88px，命中宽栏断点） ─────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('aichat: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: crypto.randomUUID(),
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
  const railOk = await page
    .waitForSelector('.userspace-rail-more', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!railOk) {
    check('A1 AI 页左栏存在（浮层可测）', false, '未找到 .userspace-rail-more');
  } else {
    await page.click('.userspace-rail-more');
    await page.waitForTimeout(260);
    const m = await measureMenu(page);
    check(
      'A1 AI 页窄栏浮层完整可见',
      m.menuExists && m.widthLoss === 0,
      `宽度损失 ${m.widthLoss}px / 栏宽 ${m.railWidth}`,
    );
    check('A2 AI 页浮层未被内容层遮挡', m.notOccluded === true, `命中 ${m.hitDesc}`);
    await page.screenshot({ path: `${OUT}/aichat.png` }).catch(() => {});
  }
  await context.close();
}

// ───────── 档 5：首页论坛层（body.page-home，左栏 fixed + 开场画 opacity） ─────────
//   首页的左栏是 fixed + `opacity: var(--forum-p)`，层级与 UserSpace 不同，
//   窄栏下浮层要越出 88px 栏压到论坛层上，必须单独验「不被内容遮挡」。
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* localStorage 不可用时照常走开场画 */
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('home: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: 'a1b2c3d4-0000-4000-8000-000000000003',
      username: 'probe_home_rail',
      role: 'user',
      points: 42,
    });
  });
  const railOk = await page
    .waitForSelector('.userspace-rail-more', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!railOk) {
    check('H1 首页窄栏浮层完整可见', false, '未找到 .userspace-rail-more');
  } else {
    // 等左栏显影（opacity 吃 --forum-p）再点，否则测得的是开场画期间的状态
    await page
      .waitForFunction(
        () => Number(getComputedStyle(document.querySelector('.userspace-rail')).opacity) > 0.9,
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    await page.click('.userspace-rail-more');
    await page.waitForTimeout(260);
    const m = await measureMenu(page);
    check(
      'H1 首页窄栏浮层完整可见',
      m.menuExists && m.widthLoss === 0,
      `宽度损失 ${m.widthLoss}px / 栏宽 ${m.railWidth}`,
    );
    check('H2 首页浮层未被论坛层遮挡', m.notOccluded === true, `命中 ${m.hitDesc}`);
    await page.screenshot({ path: `${OUT}/home1100.png` }).catch(() => {});
  }
  await context.close();
}

// ───────── 档 4：反证自检（把浮层搬回滚动容器 ⇒ 断言必须能测出裁剪） ─────────
//   这条不是测产品，是测**本探针有牙**：DOM 还原成 2026-10-11 之前的层级
//   （more-wrap 作为 .userspace-rail-scroll 的子元素），同一套测量函数必须报出
//   widthLoss > 0。它防的是「入口搬家 / 测量口径写错导致断言永远绿」。
{
  const { context, page } = await open(1100, 800, 'counterproof');
  await page.evaluate(() => {
    const wrap = document.querySelector('.userspace-rail-more-wrap');
    document.querySelector('.userspace-rail-scroll').appendChild(wrap);
  });
  await page.click('.userspace-rail-more');
  await page.waitForTimeout(260);
  const m = await measureMenu(page);
  check(
    'R1 反证：浮层搬回滚动容器后，测量必须报出裁剪（widthLoss > 0）',
    m.menuExists && m.widthLoss > 0,
    `宽度损失 ${m.widthLoss}px / 浮层 ${m.menu?.width}px`,
  );
  check('R2 反证：此时「完整可见」断言必须为假', m.widthLoss !== 0, `widthLoss=${m.widthLoss}`);
  await page.screenshot({ path: `${OUT}/counterproof-clipped.png` }).catch(() => {});
  await context.close();
}

// ───────── 档 6：1024×600 极矮窗（紧凑档，浮层向上弹不得出视口顶） ─────────
//   矮窗是浮层最容易被裁的场景：它是向上弹的，下方没有空间可退。
{
  const { context, page } = await open(1024, 600, 'compact1024');
  await page.click('.userspace-rail-more');
  await page.waitForTimeout(260);
  const m = await measureMenu(page);
  check(
    'S1 1024×600 浮层完整可见',
    m.menuExists && m.widthLoss === 0,
    `宽度损失 ${m.widthLoss}px / 浮层 ${m.menu?.width}px`,
  );
  check(
    'S2 1024×600 浮层不出视口（含向上弹的 top）',
    m.inViewport === true && m.menu.top >= 0,
    `top=${m.menu?.top} bottom=${m.menu?.bottom} vh=600`,
  );
  check('S3 1024×600 浮层未被内容层遮挡', m.notOccluded === true, `命中 ${m.hitDesc}`);
  await page.screenshot({ path: `${OUT}/compact1024.png` }).catch(() => {});
  await context.close();
}

const realErrors = errors.filter(
  (e) => !/Failed to load resource|net::|the server responded with a status/.test(e),
);
console.log('\n──── 汇总 ────');
console.log(`PASS ${pass} / FAIL ${fail}`);
if (realErrors.length) {
  console.log('未捕获异常:');
  realErrors.slice(0, 6).forEach((e) => console.log('  ', e));
}
await browser.close();
process.exit(fail > 0 ? 1 : 0);
