import { chromium } from 'playwright';

// 探针：论坛工具栏横屏 hero 改版（2026-09-15）
// 草图规格：横屏 ≥993 工具栏 = 大号液态玻璃容器（输入区在上，底部 [签到][问BOHAI] 左 + 圆形搜索钮右）；
// 筛选下拉横屏移除，#标签名 语法筛选 + chip；问BOHAI = 查库 → 顶部 AI 岛回复（Fast）。
// 移动端 DOM 行为保持原样。
const BASE = 'http://localhost:5173';
let pass = 0;
let fail = 0;
const results = [];

const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

const injectLogin = async (targetPage) => {
  const p = targetPage;
  await p.waitForFunction(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return pinia && pinia.state.value.auth.isInitialized === true;
  }, null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 6; i += 1) {
    await p.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-toolbar-user',
        username: 'probe_rui',
        role: 'user',
        points: 1024
      };
    });
    await p.waitForTimeout(450);
    const stillIn = await p.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return !!pinia && pinia.state.value.auth.isLoggedIn === true;
    });
    if (stillIn) return;
  }
};

// ---------- 横屏档 ----------
const land = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const landPage = await land.newPage();
const landErrors = [];
landPage.on('pageerror', (e) => landErrors.push(String(e.message).slice(0, 200)));

await landPage.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await landPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(landPage);
await landPage.waitForFunction(() => !!document.querySelector('.forum-page .forum-toolbar'), null, { timeout: 20000 }).catch(() => {});
await landPage.waitForTimeout(600);

const geo = await landPage.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      display: cs.display,
      flexDirection: cs.flexDirection,
      minHeight: cs.minHeight,
      borderRadius: cs.borderRadius,
      backdropFilter: cs.backdropFilter,
      textAlign: cs.textAlign,
      background: cs.backgroundColor,
      height: Math.round(r.height),
      width: Math.round(r.width),
      x: Math.round(r.x),
      right: Math.round(r.right),
      visible: cs.display !== 'none' && r.width > 0 && r.height > 0
    };
  };
  const pillTexts = Array.from(document.querySelectorAll('.toolbar-hero-left .toolbar-hero-pill'))
    .map((el) => el.textContent.trim().replace(/\s+/g, ' '));
  const circle = pick('.toolbar-hero-search-btn');
  const pills = Array.from(document.querySelectorAll('.toolbar-hero-left .toolbar-hero-pill')).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return {
    toolbar: pick('.forum-page .forum-toolbar'),
    input: pick('.forum-page .toolbar-search-input'),
    heroBar: pick('.forum-page .toolbar-hero-bar'),
    mobileRow: pick('.forum-page .toolbar-mobile-row'),
    searchActions: pick('.forum-page .toolbar-search-actions'),
    chipDefault: pick('.forum-page .toolbar-tag-chip'),
    circle,
    pills,
    pillTexts
  };
});

check('横屏工具栏存在且可见', !!geo.toolbar && geo.toolbar.visible);
check('工具栏纵向布局（flex-direction: column）', geo.toolbar?.flexDirection === 'column', geo.toolbar?.flexDirection);
check('工具栏加高（height ≥ 140）', (geo.toolbar?.height || 0) >= 140, `h=${geo.toolbar?.height}`);
check('工具栏大圆角（borderRadius ≥ 24px）', parseFloat(geo.toolbar?.borderRadius || '0') >= 24, geo.toolbar?.borderRadius);
check('工具栏液态玻璃（backdrop-filter 含 blur）', /blur/.test(geo.toolbar?.backdropFilter || ''), geo.toolbar?.backdropFilter);
check('hero 底栏可见（display: flex）', geo.heroBar?.display === 'flex', geo.heroBar?.display);
check('移动端行隐藏（横屏）', geo.mobileRow?.display === 'none', geo.mobileRow?.display);
check('输入框内操作组隐藏（横屏）', geo.searchActions?.display === 'none', geo.searchActions?.display);
check('hero 按钮恰好三个（签到/问BOHAI/搜索圆钮）',
  geo.pillTexts.length === 2 && !!geo.circle && geo.circle.visible,
  `pills=[${geo.pillTexts.join(' | ')}] circle=${geo.circle ? 'ok' : 'missing'}`);
check('双钮在左（x 小于圆钮 x）',
  geo.pills.length === 2 && geo.circle && geo.pills.every((p) => p.x < geo.circle.x),
  `pills.x=[${geo.pills.map((p) => p.x).join(',')}] circle.x=${geo.circle?.x}`);
check('圆钮贴右缘（距工具栏右缘 ≤ 30px）',
  !!geo.circle && !!geo.toolbar && (geo.toolbar.right - geo.circle.right) <= 30,
  `gap=${geo.toolbar ? geo.toolbar.right - (geo.circle?.right || 0) : '?'}`);
check('圆钮正圆（宽≈高，radius 50%）',
  !!geo.circle && Math.abs(geo.circle.width - geo.circle.height) <= 3 && geo.circle.borderRadius === '50%',
  `${geo.circle?.width}x${geo.circle?.height} r=${geo.circle?.borderRadius}`);
check('输入区加高（height ≥ 50，左对齐裸坐容器上）',
  (geo.input?.height || 0) >= 50 && geo.input?.textAlign === 'left'
    && ['transparent', 'rgba(0, 0, 0, 0)'].includes(geo.input?.background),
  `h=${geo.input?.height} align=${geo.input?.textAlign} bg=${geo.input?.background}`);

// ---------- #标签筛选：输入 #服务器 → chip 出现 ----------
await landPage.fill('.forum-page .toolbar-search-input', '服务器问题 #服务器');
await landPage.waitForTimeout(800); // 350ms 防抖 + fetch 启动
const tagState = await landPage.evaluate(() => {
  const chip = document.querySelector('.forum-page .toolbar-tag-chip');
  const input = document.querySelector('.forum-page .toolbar-search-input');
  if (!chip) return { chip: false };
  const cs = getComputedStyle(chip);
  return {
    chip: cs.display !== 'none' && chip.getBoundingClientRect().width > 0,
    text: chip.textContent.trim(),
    inputValue: input ? input.value : ''
  };
});
check('#标签解析 → chip 可见', tagState.chip && /服务器/.test(tagState.text), `chip="${tagState.text || ''}"`);
check('输入内容不被改写（保留 #记号）', tagState.inputValue.includes('#服务器'), tagState.inputValue);

// chip × 清除
await landPage.click('.forum-page .toolbar-tag-chip');
await landPage.waitForTimeout(600);
const chipGone = await landPage.evaluate(() => !document.querySelector('.forum-page .toolbar-tag-chip'));
check('chip × 清除标签筛选', chipGone);

// ---------- 问BOHAI：点击 → 检索 → AI 岛打开（或给出提示），无页面错误 ----------
await landPage.fill('.forum-page .toolbar-search-input', '怎么快速升级');
await landPage.click('.forum-page .toolbar-hero-left .glass-pill-btn.tone-soft');
await landPage.waitForTimeout(1800);
const askState = await landPage.evaluate(() => {
  const island = document.querySelector('.bohai-island');
  const hint = document.querySelector('.forum-page .toolbar-ai-hint');
  const status = document.querySelector('.forum-page .toolbar-ai-status');
  const composer = island ? island.querySelector('textarea, [contenteditable="true"]') : null;
  return {
    islandOpen: !!island && island.getBoundingClientRect().height > 0,
    islandText: island ? island.textContent.slice(0, 400) : '',
    composerText: composer ? (composer.value || composer.textContent || '').slice(0, 120) : '',
    hint: hint ? hint.textContent.trim() : '',
    statusShown: !!status
  };
});
check('问BOHAI 无页面错误', landErrors.length === 0, landErrors.join(' ; '));
check('问BOHAI 有响应（岛打开 / 检索状态 / 提示文案）',
  askState.islandOpen || askState.statusShown || askState.hint.length > 0,
  `island=${askState.islandOpen} status=${askState.statusShown} hint="${askState.hint}"`);
const seedReached = askState.islandOpen
  && (askState.composerText.includes('怎么快速升级') || askState.islandText.includes('怎么快速升级'));
check('问题已作为种子送入 AI 岛', seedReached,
  seedReached ? 'composer 含问题文本' : `composer="${askState.composerText.slice(0, 60)}"`);

await landPage.screenshot({ path: 'output/forum-toolbar-hero-landscape.png', fullPage: false });
const shotToolbar = await landPage.$('.forum-page .forum-toolbar');
if (shotToolbar) await shotToolbar.screenshot({ path: 'output/forum-toolbar-hero-closeup.png' });

// ---------- 移动端档：确认原布局未被破坏 ----------
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobPage = await mob.newPage();
await mobPage.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await mobPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(mobPage);
await mobPage.waitForFunction(() => !!document.querySelector('.forum-page .forum-toolbar'), null, { timeout: 20000 }).catch(() => {});
await mobPage.waitForTimeout(600);
const mobGeo = await mobPage.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { display: cs.display, visible: cs.display !== 'none' && el.getBoundingClientRect().width > 0 };
  };
  return {
    toolbar: pick('.forum-page .forum-toolbar'),
    heroBar: pick('.forum-page .toolbar-hero-bar'),
    mobileRow: pick('.forum-page .toolbar-mobile-row'),
    searchActions: pick('.forum-page .toolbar-search-actions')
  };
});
check('移动端 hero 底栏隐藏', mobGeo.heroBar?.display === 'none', mobGeo.heroBar?.display);
check('移动端行可见（签到+筛选）', mobGeo.mobileRow?.display === 'flex', mobGeo.mobileRow?.display);
check('移动端输入框内操作可见', mobGeo.searchActions?.display !== 'none', mobGeo.searchActions?.display);
await mobPage.screenshot({ path: 'output/forum-toolbar-mobile.png', fullPage: false });

console.log('\n===== 论坛工具栏 hero 探针结果 =====');
for (const line of results) console.log(line);
console.log(`\nPASS ${pass} / FAIL ${fail}`);
if (landErrors.length) console.log('landErrors:', landErrors);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
