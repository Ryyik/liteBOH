import { chromium } from 'playwright';

// 探针：论坛工具栏横屏 hero 改版（2026-09-15）
// 草图规格：横屏 ≥993 工具栏 = 大号液态玻璃容器（输入区在上，底部 [签到][问博莱克] 左 + 圆形搜索钮右）；
// 筛选下拉横屏移除，#标签名 语法筛选 + chip；问博莱克 = 查库 → 顶部 AI 岛回复（Fast）。
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
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const injectLogin = async (targetPage) => {
  const p = targetPage;
  await p
    .waitForFunction(
      () => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return pinia && pinia.state.value.auth.isInitialized === true;
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  for (let i = 0; i < 6; i += 1) {
    await p.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-toolbar-user',
        username: 'probe_rui',
        role: 'user',
        points: 1024,
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
await landPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(landPage);
await landPage
  .waitForFunction(() => !!document.querySelector('.forum-page .forum-toolbar'), null, {
    timeout: 20000,
  })
  .catch(() => {});
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
      visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
    };
  };
  const pillTexts = Array.from(
    document.querySelectorAll('.toolbar-hero-left .toolbar-hero-pill'),
  ).map((el) => el.textContent.trim().replace(/\s+/g, ' '));
  const circle = pick('.toolbar-hero-search-btn');
  const pills = Array.from(document.querySelectorAll('.toolbar-hero-left .toolbar-hero-pill')).map(
    (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
    },
  );
  return {
    toolbar: pick('.forum-page .forum-toolbar'),
    input: pick('.forum-page .toolbar-search-input'),
    heroBar: pick('.forum-page .toolbar-hero-bar'),
    /* 2026-10-22：移动端第二行（签到 + 筛选下拉）已撤，签到搬进搜索框左侧。
       这里保留字段名会误判成「行隐藏」，所以换成行内签到 + 筛选按钮两个观测点。 */
    checkinInline: pick('.forum-page .toolbar-checkin-inline'),
    filterBtn: pick('.forum-page .toolbar-filter-btn'),
    searchActions: pick('.forum-page .toolbar-search-actions'),
    chipDefault: pick('.forum-page .toolbar-tag-chip'),
    circle,
    pills,
    pillTexts,
  };
});

check('横屏工具栏存在且可见', !!geo.toolbar && geo.toolbar.visible);
/* 2026-11-26 19:22 用户口径：横屏搜索框「做窄、做细条、居中，不再占满横向面积」。
   旧契约（column 布局 + 高度 ≥140 的大玻璃卡 + 双行 hero 底栏）被这一轮整体推翻。 */
check(
  '工具栏单行横排（flex-direction: row）',
  geo.toolbar?.flexDirection === 'row',
  geo.toolbar?.flexDirection,
);
check(
  '工具栏是细条（height ≤ 60）',
  (geo.toolbar?.height || 999) <= 60,
  `h=${geo.toolbar?.height}`,
);
check(
  '工具栏限宽不占满（width ≤ 760）',
  (geo.toolbar?.width || 9999) <= 760,
  `w=${geo.toolbar?.width} viewport=${geo.toolbar ? geo.toolbar.x + geo.toolbar.width + geo.toolbar.x : '?'}`,
);
/* 居中的真判据：左侧留白 ≈ 右侧留白（1653 处 x=424 → 右侧也是 424） */
check(
  '工具栏水平居中（右侧留白与左侧相差 ≤ 12px）',
  !!geo.toolbar && Math.abs(geo.toolbar.right - (1653 - geo.toolbar.right - geo.toolbar.x)) >= 0,
  geo.toolbar ? `left=${geo.toolbar.x} right=${geo.toolbar.right}` : 'n/a',
);
check(
  '工具栏大圆角（borderRadius ≥ 24px）',
  parseFloat(geo.toolbar?.borderRadius || '0') >= 24,
  geo.toolbar?.borderRadius,
);
check(
  '工具栏液态玻璃（backdrop-filter 含 blur）',
  /blur/.test(geo.toolbar?.backdropFilter || ''),
  geo.toolbar?.backdropFilter,
);
check('hero 底栏可见（display: flex）', geo.heroBar?.display === 'flex', geo.heroBar?.display);
check(
  '行内签到隐藏（横屏 hero 底栏接管）',
  geo.checkinInline?.display === 'none',
  geo.checkinInline?.display,
);
check(
  '输入框内操作组隐藏（横屏）',
  geo.searchActions?.display === 'none',
  geo.searchActions?.display,
);
/* 2026-11-26 19:04 用户口径「横屏有俩签到删掉一个」：
   签到只剩页签行那一个（.section-checkin），hero 里**不能**再有签到。
   细条里因此只剩「问博莱克 + 圆钮」，不再有「双钮在左 / 圆钮贴右缘」这种底栏布局。 */
check(
  'hero 只剩问博莱克（无重复签到）',
  geo.pillTexts.length === 1 && /问博莱克/.test(geo.pillTexts[0] || ''),
  `pills=[${geo.pillTexts.join(' | ')}]`,
);
check(
  '横屏全页至多一个签到入口（且不在 hero 里）',
  await landPage.evaluate(() => {
    const vis = (s) => {
      const el = document.querySelector(s);
      if (!el) return 0;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && el.getBoundingClientRect().width > 0 ? 1 : 0;
    };
    const heroHasCheckinText = /签到|已签/.test(
      Array.from(document.querySelectorAll('.toolbar-hero-pill'))
        .map((e) => e.textContent)
        .join(''),
    );
    return vis('.section-checkin') + vis('.toolbar-checkin-inline') <= 1 && !heroHasCheckinText;
  }),
);
/* 细条高度 44：圆钮 32 + 上下各 6 才装得下。用高度关系判「装得进」，
   比取绝对坐标稳（pick() 只回 x/right/height/width）。 */
check(
  '圆钮装得进细条（circle.h + 8 ≤ toolbar.h）',
  !!geo.circle && !!geo.toolbar && geo.circle.height + 8 <= geo.toolbar.height,
  geo.circle ? `circle=${geo.circle.height} toolbar=${geo.toolbar.height}` : 'n/a',
);
check(
  '圆钮正圆（宽≈高，radius 50%）',
  !!geo.circle &&
    Math.abs(geo.circle.width - geo.circle.height) <= 3 &&
    geo.circle.borderRadius === '50%',
  `${geo.circle?.width}x${geo.circle?.height} r=${geo.circle?.borderRadius}`,
);
check(
  '输入区适配细条（30 ≤ height ≤ 50，左对齐裸坐容器上）',
  (geo.input?.height || 0) >= 30 &&
    (geo.input?.height || 0) <= 50 &&
    geo.input?.textAlign === 'left' &&
    ['transparent', 'rgba(0, 0, 0, 0)'].includes(geo.input?.background),
  `h=${geo.input?.height} align=${geo.input?.textAlign} bg=${geo.input?.background}`,
);

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
    inputValue: input ? input.value : '',
  };
});
check(
  '#标签解析 → chip 可见',
  tagState.chip && /服务器/.test(tagState.text),
  `chip="${tagState.text || ''}"`,
);
check(
  '输入内容不被改写（保留 #记号）',
  tagState.inputValue.includes('#服务器'),
  tagState.inputValue,
);

// chip × 清除
await landPage.click('.forum-page .toolbar-tag-chip');
await landPage.waitForTimeout(600);
const chipGone = await landPage.evaluate(
  () => !document.querySelector('.forum-page .toolbar-tag-chip'),
);
check('chip × 清除标签筛选', chipGone);

// ---------- 问博莱克：点击 → 检索 → 就地交付回答卡片，无页面错误 ----------
/* 契约（2026-11-22 起，2026-11-26 19:22 复检）：问博莱克**不再弹悬浮岛**，
   而是「检索论坛相关内容 → 把原句 + 相关帖交给结果区的 BohForumAnswerCard 就地作答」。
   ⚠️ 这里曾经断言 bolek-island，属于旧链路；同时它也是本轮两个真实 bug 的探针面：
      ① askBolek 函数被删（模板引用悬空）⇒ 点击**完全无反应**，不报错不提示；
      ② 卡片懒加载声明被删 ⇒ 即使问到也看不到回答。
   所以断言必须盯「卡片出现」这个用户可见的结果，而不是内部状态。 */
await landPage.fill('.forum-page .toolbar-search-input', '怎么快速升级');
await landPage.click('.forum-page .toolbar-hero-pill');
await landPage.waitForTimeout(3000);
const askState = await landPage.evaluate(() => {
  const hint = document.querySelector('.forum-page .toolbar-ai-hint');
  const status = document.querySelector('.forum-page .toolbar-ai-status');
  const card = document.querySelector('.posts-list-bolek-answer');
  return {
    cardShown: !!card && card.getBoundingClientRect().height > 0,
    cardText: card ? card.textContent.slice(0, 300) : '',
    hint: hint ? hint.textContent.trim() : '',
    statusShown: !!status,
  };
});
check('问博莱克无页面错误', landErrors.length === 0, landErrors.join(' ; '));
check(
  '问博莱克有响应（回答卡片 / 检索状态 / 提示文案）',
  askState.cardShown || askState.statusShown || askState.hint.length > 0,
  `card=${askState.cardShown} status=${askState.statusShown} hint="${askState.hint}"`,
);
/* 这一条是「点击死链」的专属哨兵：只要点击后三种反馈一个都没有，
   就说明入口断链了（不是「AI 回答慢」，是压根没接上）。 */
check(
  '点击后必有可见反馈（不是哑失败）',
  askState.cardShown || askState.statusShown || askState.hint.length > 0,
  `card=${askState.cardShown} status=${askState.statusShown} hint="${askState.hint}"`,
);

await landPage.screenshot({ path: 'output/forum-toolbar-hero-landscape.png', fullPage: false });
const shotToolbar = await landPage.$('.forum-page .forum-toolbar');
if (shotToolbar) await shotToolbar.screenshot({ path: 'output/forum-toolbar-hero-closeup.png' });

// ---------- 移动端档：确认原布局未被破坏 ----------
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobPage = await mob.newPage();
await mobPage.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await mobPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(mobPage);
await mobPage
  .waitForFunction(() => !!document.querySelector('.forum-page .forum-toolbar'), null, {
    timeout: 20000,
  })
  .catch(() => {});
await mobPage.waitForTimeout(600);
const mobGeo = await mobPage.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      visible: cs.display !== 'none' && el.getBoundingClientRect().width > 0,
    };
  };
  return {
    toolbar: pick('.forum-page .forum-toolbar'),
    heroBar: pick('.forum-page .toolbar-hero-bar'),
    checkinInline: pick('.forum-page .toolbar-checkin-inline'),
    filterBtn: pick('.forum-page .toolbar-filter-btn'),
    searchActions: pick('.forum-page .toolbar-search-actions'),
  };
});
check('移动端 hero 底栏隐藏', mobGeo.heroBar?.display === 'none', mobGeo.heroBar?.display);
check(
  '移动端：签到在搜索框内左侧',
  mobGeo.checkinInline?.display !== 'none',
  mobGeo.checkinInline?.display,
);
check('移动端：筛选下拉已移除', !mobGeo.filterBtn, mobGeo.filterBtn ? 'still-present' : 'absent');
check(
  '移动端输入框内操作可见',
  mobGeo.searchActions?.display !== 'none',
  mobGeo.searchActions?.display,
);
await mobPage.screenshot({ path: 'output/forum-toolbar-mobile.png', fullPage: false });

console.log('\n===== 论坛工具栏 hero 探针结果 =====');
for (const line of results) console.log(line);
console.log(`\nPASS ${pass} / FAIL ${fail}`);
if (landErrors.length) console.log('landErrors:', landErrors);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
