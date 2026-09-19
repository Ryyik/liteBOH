import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：他人空间（/profile/:username）横屏同体系分栏验收（2026-09-19）
//   断言：rail 渲染与几何 / 内容右移与无重叠 / 页头右区居中 /
//         无选中高亮 / 导航跳转 / 主题切换 / 暗色淡染 / 竖屏零副作用
//   反证：COUNTERPROOF=1 时注入 CSS 模拟「撤掉修复」（rail 隐藏 +
//         padding-left 归零），对应断言必须转红；源码零改动
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/profile-rail';
fs.mkdirSync(OUT, { recursive: true });

const COUNTERPROOF = process.env.COUNTERPROOF === '1';

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const errors = [];

/* ── Supabase mock：一条 route + 规则表（后注册优先的坑 → 只注册一次）──
   profile 页登录后并发打 profiles/posts/follows 等；伪造 id 是随机 UUID，
   不会撞真库用户。空集合 Content-Range 照真 Supabase 语义给 *\/0。 */
const PROBE_ID = crypto.randomUUID();
const PROBE_PROFILE = {
  id: PROBE_ID,
  username: 'probe_user',
  bio: 'probe bio',
  avatar_url: '',
  avatar_frame_url: '',
  join_date: '2025-01-01',
  points: 42,
  birth_month: null,
  birth_day: null,
  experience: 0,
  tags: [],
  role: 'user',
  is_boh_creator: false,
  creator_platform_ids: [],
  creator_platform_visibility: {},
  showcase_post_ids: [],
  hide_online_status: false,
  hide_follow_data: false,
  profile_background_url: '',
  points_card_skin: 'blank',
  points_card_image_url: ''
};

const json = (body, range = '*/0') => ({
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Expose-Headers': 'Content-Range',
    'Content-Range': range
  },
  body: JSON.stringify(body)
});

async function open(width, height, tag, theme) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));

  await page.route('**://*/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rest/v1/profiles')) {
      const method = route.request().method();
      if (method === 'GET' && url.includes('username=eq.probe_user')) {
        return route.fulfill(json([PROBE_PROFILE], '0-0/1'));
      }
      return route.fulfill(json([]));
    }
    return route.fulfill(json([]));
  });
  // auth/边缘函数一律失败即可：探针登录态走 pinia 注入，不依赖真会话
  await page.route('**://*/auth/v1/**', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.route('**://*/functions/v1/**', (route) => route.fulfill({ status: 404, body: '{}' }));

  await page.goto(`${BASE}/#/profile/probe_user`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: crypto.randomUUID(),
      username: 'probe_visitor',
      role: 'user',
      points: 42
    });
  });
  await page.waitForSelector('.profile-page', { timeout: 20000 });
  if (theme === 'dark') {
    // 不能手动 setAttribute：:data-theme="currentTheme" 是 Vue 绑定，数据加载
    // 触发重渲染时会改回 light。派发真实事件走 onThemeChanged 同步 ref → 绑定生效
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: 'dark' } })));
  }
  if (COUNTERPROOF) {
    // 模拟「撤掉修复」：rail 隐藏 + 内容左移归零 —— 全部走注入，源码零改动
    await page.addStyleTag({
      content: '.profile-page { padding-left: 0 !important; } .userspace-rail { display: none !important; }'
    });
  }
  await page.waitForTimeout(2400);
  return { context, page };
}

const measure = (page) => page.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const page_ = document.querySelector('.profile-page');
  const shell = document.querySelector('.profile-home-shell');
  const headerInner = document.querySelector('.user-center-page-header-inner');
  const indicator = document.querySelector('.userspace-rail-indicator');
  const R = (el) => (el ? el.getBoundingClientRect() : null);
  const rr = R(rail); const sr = R(shell); const hr = R(headerInner);
  const brand = document.querySelector('.userspace-rail-brand');
  const navItem = document.querySelector('.userspace-rail-item[data-tab="posts"]');
  const homeItem = document.querySelector('.userspace-rail-item[data-rail-action="home"]');
  return {
    pageExists: !!page_,
    railExists: !!rail,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    railPosition: rail ? getComputedStyle(rail).position : null,
    railW: rr ? Math.round(rr.width) : null,
    railRight: rr ? Math.round(rr.right) : null,
    railTop: rr ? Math.round(rr.top) : null,
    railBottom: rr ? Math.round(rr.bottom) : null,
    brandVisible: !!brand && brand.getBoundingClientRect().top >= 0 && brand.getBoundingClientRect().top < window.innerHeight,
    navItemVisible: !!navItem && navItem.getBoundingClientRect().top >= 0 && navItem.getBoundingClientRect().top < window.innerHeight,
    homeItemTop: homeItem ? Math.round(homeItem.getBoundingClientRect().top) : null,
    padLeft: page_ ? getComputedStyle(page_).paddingLeft : null,
    shellLeft: sr ? Math.round(sr.left) : null,
    shellCenter: sr ? Math.round(sr.left + sr.width / 2) : null,
    headerCenter: hr ? Math.round(hr.left + hr.width / 2) : null,
    indicatorOpacity: indicator ? getComputedStyle(indicator).opacity : null,
    pillBg: page_ ? getComputedStyle(page_).getPropertyValue('--rail-pill-bg').trim() : null,
    bodyPageClass: document.body.className,
    viewportW: window.innerWidth
  };
});

// ───────── 档 1：1440×900 宽栏（明） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440');
  const m = await measure(page);
  check('A1 body 挂 page-userprofile', /page-userprofile/.test(m.bodyPageClass), m.bodyPageClass);
  check('A2 rail 渲染且可见', m.railDisplay === 'flex', m.railDisplay);
  check('A3 宽档栏宽 240', m.railW === 240, m.railW + 'px');
  check('B1 内容右移：padding-left = 栏宽', m.padLeft === `${m.railW}px`, m.padLeft);
  check('B2 内容与 rail 无重叠（shell 左缘 ≥ rail 右缘）',
    m.shellLeft !== null && m.railRight !== null && m.shellLeft >= m.railRight - 1,
    `shell.left=${m.shellLeft} rail.right=${m.railRight}`);
  check('B3 限宽内容居中于右区（非整页）',
    m.shellCenter !== null && Math.abs(m.shellCenter - (240 + 1440) / 2) <= 8,
    `shell.center=${m.shellCenter} right.center=${(240 + 1440) / 2}`);
  check('B4 sticky 页头同相位（中心与内容中心一致）',
    m.headerCenter !== null && m.shellCenter !== null && Math.abs(m.headerCenter - m.shellCenter) <= 8,
    `header.center=${m.headerCenter}`);
  check('C1 无选中高亮（指示器隐藏）', m.indicatorOpacity === '0', m.indicatorOpacity);
  check('C2 亮色淡染变量挂载', /(\b|[^0-9.])\.?0?75\b/.test(m.pillBg.replace(/\s/g, '')) && /rgba|hsla/.test(m.pillBg), m.pillBg);
  check('C3 rail 锁视口（fixed 而非 absolute）', m.railPosition === 'fixed', m.railPosition);
  check('C4 rail 高度=视口（top 0 / bottom 0）',
    m.railTop === 0 && m.railBottom === 900, `top=${m.railTop} bottom=${m.railBottom}`);

  // 滚动场景：页面滚到中部，rail 必须钉在视口（品牌位/导航组/首页按钮都可见）
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(400);
  const s = await measure(page);
  check('H1 滚动 800px 后 rail 仍贴视口顶（top 0）', s.railTop === 0, `top=${s.railTop}`);
  check('H2 滚动后品牌位仍在视口内', s.brandVisible === true);
  check('H3 滚动后主导航条目仍在视口内', s.navItemVisible === true);
  check('H4 滚动后首页按钮仍在视口内（非文档底部）',
    s.homeItemTop !== null && s.homeItemTop > 0 && s.homeItemTop < 900, `top=${s.homeItemTop}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // 交互：点击左栏「我的」→ 跳我的空间对应 tab
  await page.click('.userspace-rail-item[data-tab="posts"]');
  await page.waitForTimeout(900);
  const navUrl = await page.evaluate(() => location.hash);
  check('D1 点击主导航跳转我的空间对应 tab', navUrl.includes('/user-space') && navUrl.includes('tab=posts'), navUrl);
  await page.screenshot({ path: `${OUT}/wide1440-light.png` }).catch(() => {});
  await context.close();
}

// ───────── 档 2：暗色淡染翻转 ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440-dark', 'dark');
  const m = await measure(page);
  check('E1 暗色淡染 = 白染 0.12', /(\b|[^0-9.])\.?0?12\b/.test(m.pillBg.replace(/\s/g, '')), m.pillBg);
  await page.screenshot({ path: `${OUT}/wide1440-dark.png` }).catch(() => {});
  await context.close();
}

// ───────── 档 3：主题切换（rail more 菜单 → theme） ─────────
{
  const { context, page } = await open(1440, 900, 'theme-toggle');
  const before = await page.evaluate(() => document.querySelector('.profile-page')?.getAttribute('data-theme'));
  await page.click('.userspace-rail-more');
  await page.waitForTimeout(240);
  await page.click('.userspace-rail-menu-item[data-rail-action="theme"]');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.querySelector('.profile-page')?.getAttribute('data-theme'));
  check('F1 rail 更多菜单切换主题', !!before && !!after && before !== after, `${before} → ${after}`);
  await context.close();
}

// ───────── 档 4：竖屏 390×844 零副作用 ─────────
{
  const { context, page } = await open(390, 844, 'portrait');
  const m = await measure(page);
  check('G1 竖屏 rail 不可见', m.railDisplay === 'none' || m.railDisplay === null, m.railDisplay);
  check('G2 竖屏内容不右移（padding-left 0）',
    m.padLeft === '0px', m.padLeft);
  await page.screenshot({ path: `${OUT}/portrait.png` }).catch(() => {});
  await context.close();
}

// ───────── 汇总 ─────────
const realErrors = errors.filter((e) => !/Failed to load resource|net::|the server responded with a status/.test(e));
console.log('\n──── 汇总 ────');
console.log(`PASS ${pass} / FAIL ${fail}`);
if (realErrors.length) {
  console.log('未捕获异常:');
  realErrors.slice(0, 6).forEach((e) => console.log('  ', e));
}
console.log(COUNTERPROOF ? '【反证模式】预期 FAIL > 0' : '【正常模式】预期 FAIL = 0');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
