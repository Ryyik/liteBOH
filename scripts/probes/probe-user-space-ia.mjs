import { chromium } from 'playwright';

// 探针：用户空间 IA 回归（2026-09 面板上提 + 抖音式文字页签）
// 底栏 = 社区/内容/资产/消息/设置；分区切换 = 页面顶部纯文字页签（当前项加粗放大 + 滑动下划线）
const BASE = 'http://localhost:5173';
let pass = 0;
let fail = 0;
const results = [];

const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

const injectLogin = async (targetPage) => {
  const p = targetPage;
  await p.waitForFunction(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return pinia && pinia.state.value.auth.isInitialized === true;
  }, null, { timeout: 15000 }).catch(() => {});
  // auth 异步初始化可能晚于注入把状态洗回未登录——重试锚定
  for (let i = 0; i < 6; i += 1) {
    await p.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-ia-user',
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
  // 登录态就绪 ≠ 页面就绪：index.html 的启动骨架要等 Vue mount + 路由 chunk 到位才清，
  // 此时断言会读到「什么都没有」（实测 rail/底栏/导航容器全 ABSENT，15 条假红）。
  // 等真实的 userspace 根元素出现再返回，把固定 sleep 让位给条件等待
  await p.waitForFunction(
    () => !!document.querySelector('.user-space-page'),
    null,
    { timeout: 20000 }
  ).catch(() => {});
};

// 掉登录自愈：dev server 偶发模块请求失败会命中 index.html 内联的 recovery 分支
// → 带 ?forceUpdate=true 重定向 → 页面重载、pinia 里注入的登录态丢失。
// 之后的断言就全变成「页面没内容」（rail/底栏/面板全 ABSENT，一次十几条假红）。
// 每次切 tab 后检测一次，掉了就补注入，别让一次环境抖动污染整条链路。
const ensureLoggedIn = async () => {
  const ok = await page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return !!pinia && pinia.state.value.auth.isLoggedIn === true;
  }).catch(() => false);
  if (ok) return true;
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 }).catch(() => {});
  await injectLogin(page);
  return false;
};

const navLabels = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item span')).map((el) => el.textContent.trim())
);
const clickNav = async (label) => {
  await page.evaluate((text) => {
    const tabs = Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item'));
    tabs.find((t) => t.textContent.trim().includes(text))?.click();
  }, label);
  // 页面若在切 tab 瞬间被 recovery 重载过，登录态会丢 → 补注入再继续
  await ensureLoggedIn();
};
const clickSeg = (label) => page.evaluate((text) => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).filter((t) => t.offsetParent !== null);
  for (const group of tabs) {
    const hit = Array.from(group.querySelectorAll('.segment-tab')).find((b) => b.textContent.trim() === text);
    if (hit) { hit.click(); return true; }
  }
  return false;
}, label);
const segState = () => page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  if (!tabs) return { exists: false };
  const items = Array.from(tabs.querySelectorAll('.segment-tab'));
  const active = items.find((i) => i.classList.contains('active'));
  const indicator = tabs.querySelector('.segment-tab-indicator');
  return {
    exists: true,
    labels: items.map((i) => i.textContent.trim()),
    active: active ? active.textContent.trim() : '',
    indicatorW: indicator ? Math.round(indicator.getBoundingClientRect().width) : 0,
    transform: indicator ? getComputedStyle(indicator).transform : ''
  };
});
const activeTab = () => page.evaluate(() => {
  const el = document.querySelector('.bottom-nav-glass .nav-item.active span');
  return el ? el.textContent.trim() : 'NONE';
});
// 条件等待：**第一个可见**页签组的文案 == 期望。
// 必须要求「第一个」而不是「任意一个」：.tab-page 是 absolute 叠放层，切 tab 时
// 离场页面的页签短期内仍可见、且可能排在更前（实测切到「消息」时读到的是资产页的
// 概览/装扮/积分…）。用 some() 会立刻命中离场组 → 后面 segState 也读到它。
const waitForSeg = async (expected, timeout = 12000) => {
  const want = JSON.stringify(expected);
  try {
    await page.waitForFunction((w) => {
      const groups = Array.from(document.querySelectorAll('.segment-tabs')).filter((t) => t.offsetParent !== null);
      if (!groups.length) return false;
      const firstLabels = JSON.stringify(Array.from(groups[0].querySelectorAll('.segment-tab'))
        .map((b) => b.textContent.trim()));
      return firstLabels === w;
    }, want, { timeout });
    await page.waitForTimeout(400); // 命中后再给离场动画收尾，避免 segState 抓到过渡态
    return true;
  } catch { return false; }
};
const urlTab = () => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] || '').get('tab'));

// ---------- 1. 默认社区 tab + 文字页签 ----------
await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(page);
await page.waitForTimeout(1500);

const labels = await navLabels();
check('底栏五 tab 文案', JSON.stringify(labels) === JSON.stringify(['社区', '我的', '资产', '消息', '设置']), labels.join('/'));
check('社区 tab 为默认激活', (await activeTab()) === '社区');

let seg = await segState();
check('文字页签出现（社区六档）', seg.exists && JSON.stringify(seg.labels) === JSON.stringify(['最新', '关注', '新闻', '活动', '成员', '印象']),
  (seg.labels || []).join('/'));
check('当前档 = 最新（加粗态 = 论坛默认流）', seg.active === '最新');
check('滑动指示条已定位（宽 > 0）', seg.indicatorW > 0, `w=${seg.indicatorW}px`);
check('指示条黑色（文字主色）', await page.evaluate(() => {
  const ind = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null)?.querySelector('.segment-tab-indicator');
  return ind ? getComputedStyle(ind).backgroundColor === 'rgb(29, 29, 31)' : false;
}));
const forumTransform = seg.transform;
const gapState = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  const forum = document.querySelector('.community-forum-host .forum-page');
  if (!tabs || !forum) return { pos: 'MISSING', pt: 'MISSING', gap: -1 };
  const cs = getComputedStyle(tabs);
  const fcs = getComputedStyle(forum);
  const tabsRect = tabs.getBoundingClientRect();
  const first = forum.querySelector('.forum-content-area > *, .forum-main-grid, .forum-container > *');
  const gap = first ? Math.round(first.getBoundingClientRect().top - tabsRect.bottom) : -1;
  return { pos: cs.position, pt: fcs.paddingTop, gap };
});
check('页签不吸附（随内容滚动）', gapState.pos === 'relative' || gapState.pos === 'static', gapState.pos);
check('论坛 80px 顶距已清零', gapState.pt === '0px', gapState.pt);
check('页签-内容空隙收紧（≤24px）', gapState.gap >= 0 && gapState.gap <= 24, `gap=${gapState.gap}px`);
await page.screenshot({ path: 'debug-screenshots/ia-community-forum.png' });

// ---------- 2a. 文字页签切关注（论坛关注流） ----------
await clickSeg('关注');
await page.waitForTimeout(1300);
seg = await segState();
const followHostVisible = await page.evaluate(() => {
  const host = document.querySelector('.community-forum-host');
  const inner = document.querySelector('.feed-mode-tabs');
  return host && getComputedStyle(host).display !== 'none' && (!inner || getComputedStyle(inner).display === 'none');
});
check('页签切关注 → 论坛关注流（内部筛选钮隐藏）', seg.active === '关注' && followHostVisible);
await clickSeg('最新');
await page.waitForTimeout(900);

// ---------- 2. 文字页签切成员 ----------
await clickSeg('成员');
await page.waitForTimeout(1100);
seg = await segState();
const membersOk = await page.evaluate(() => !!document.querySelector('.community-page-grid .community-users-list .user-item'));
check('页签切成员 → 列表渲染（原设计）', membersOk && seg.active === '成员', `${seg.active}`);
check('指示条随切换移动', seg.transform !== forumTransform, seg.transform);
await page.screenshot({ path: 'debug-screenshots/ia-community-members.png' });

// ---------- 3. 收藏已删除（用户拍板），印象 back 回最新 ----------
await clickSeg('印象');
await page.waitForTimeout(1100);
check('页签切印象档', await page.evaluate(() => !!document.querySelector('.community-list-content')));
await clickSeg('最新');
await page.waitForTimeout(600);
check('页签切回最新档', await page.evaluate(() => {
  const host = document.querySelector('.community-forum-host');
  return host && getComputedStyle(host).display !== 'none';
}));

// FAB + 底部空隙
const fabVisible = await page.evaluate(() => {
  const fab = document.querySelector('.embedded-compose-fab');
  return fab ? getComputedStyle(fab).display !== 'none' : false;
});
check('论坛发帖 FAB 可见', fabVisible);
const forumPad = await page.evaluate(() => {
  const c = document.querySelector('.community-forum-host .forum-container');
  return c ? getComputedStyle(c).paddingBottom : 'MISSING';
});
check('论坛底部空隙收口（≤96px）', forumPad !== 'MISSING' && parseFloat(forumPad) <= 96, forumPad);

// ---------- 4. 我的 tab：空间 / Cloud+ ----------
await clickNav('我的');
const mineSegReady = await waitForSeg(['空间', 'Cloud+']);
seg = await segState();
check('我的页签两档', mineSegReady && seg.exists && JSON.stringify(seg.labels) === JSON.stringify(['空间', 'Cloud+']),
  `ready=${mineSegReady} ${(seg.labels || []).join('/')}`);
check('我的当前档 = 空间（身份卡）', seg.active === '空间' && await page.evaluate(() => {
  const host = document.querySelector('.content-home-host .profile-page-content');
  return host && !host.querySelector('.login-prompt') && host.children.length > 0;
}));
const contentGap = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  const host = document.querySelector('.content-home-host');
  if (!tabs || !host) return -1;
  const cs = getComputedStyle(host);
  return parseFloat(cs.paddingTop);
});
check('空间档页签下间距收紧（≤16px）', contentGap >= 0 && contentGap <= 16, `pt=${contentGap}px`);
await page.screenshot({ path: 'debug-screenshots/ia-content-home.png' });

await clickSeg('Cloud+');
let cloudOk = false;
try {
  await page.waitForSelector('.content-cloud-host .cloud-page', { timeout: 12000 });
  cloudOk = true;
} catch {}
check('页签切 Cloud+ → 云盘面板挂载（embedded）', cloudOk && await page.evaluate(() => {
  const pageEl = document.querySelector('.content-cloud-host .cloud-page');
  return pageEl && pageEl.classList.contains('embedded') && pageEl.querySelector('.cloud-main');
}));
await page.screenshot({ path: 'debug-screenshots/ia-content-cloud.png' });

// ---------- 5. 资产：无页签直接切 ----------
await clickNav('资产');
await page.waitForTimeout(600);
let assetsPanelOk = false;
try {
  await page.waitForSelector('.assets-shell .profile-page-content > *:not(.login-prompt)', { timeout: 9000 });
  assetsPanelOk = true;
} catch {}
// 只看「页级页签」= .tab-page 的直接子级（社区/内容/消息各自的分区页签）。
// 资产面板自 2026-09-11 起内置了自己的分类页签（.ah-segment-tabs，AssetsHubPanel.vue:32），
// 它也命中 .segment-tabs —— 早期用全局计数会把它算进来，导致本条在登录态恒定 FAIL。
// 同时上一步切过内容档，离场动画未结束时旧页签仍可见 → 用条件等待而非固定 sleep。
let tabsCleared = false;
try {
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('.tab-page > .segment-tabs')).some((t) => t.offsetParent !== null),
    null,
    { timeout: 5000 }
  );
  tabsCleared = true;
} catch {}
const assetsState = await page.evaluate(() => ({
  shell: !!document.querySelector('.tab-page.assets-shell'),
  visibleTabs: Array.from(document.querySelectorAll('.tab-page > .segment-tabs'))
    .filter((t) => t.offsetParent !== null).length
}));
const assetsUrlTab = await urlTab();
check('资产直接切（无页级页签）',
  assetsState.shell && tabsCleared && assetsState.visibleTabs === 0 && assetsUrlTab === 'assets',
  `shell=${assetsState.shell} tabsCleared=${tabsCleared} visibleTabs=${assetsState.visibleTabs} urlTab=${assetsUrlTab}`);
check('AssetsHubPanel 渲染', assetsPanelOk);
const backHidden = await page.evaluate(() => {
  const btn = document.querySelector('.assets-shell .user-center-back-button');
  return !btn || btn.offsetParent === null;
});
check('资产首屏返回按钮已取消', backHidden);
await page.screenshot({ path: 'debug-screenshots/ia-assets.png' });

// ---------- 6. 消息 tab：页签两档 ----------
await clickNav('消息');
const msgSegReady = await waitForSeg(['消息', 'BOH AI']);
seg = await segState();
const msgTabsTop = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  return tabs ? Math.round(tabs.getBoundingClientRect().top) : -1;
});
check('消息页签两档（BOH AI）', msgSegReady && seg.exists && JSON.stringify(seg.labels) === JSON.stringify(['消息', 'BOH AI']),
  `ready=${msgSegReady} ${(seg.labels || []).join('/')}`);
check('消息页签顶部空隙收紧（top ≤ 96px）', msgTabsTop >= 0 && msgTabsTop <= 96, `top=${msgTabsTop}px`);
await clickSeg('BOH AI');
await page.waitForTimeout(1100);
check('页签切 BOH AI → AI 档挂载', await page.evaluate(() => {
  const host = document.querySelector('.messages-tab .ai-host');
  return host && getComputedStyle(host).display !== 'none';
}));
const aiState = await page.evaluate(() => {
  const host = document.querySelector('.messages-tab .ai-host');
  if (!host) return { h: 0, radius: '', scrollable: false, wsPad: '?', fill: 0 };
  const r = host.getBoundingClientRect();
  const chat = host.querySelector('.chat-container');
  const ws = host.querySelector('.ai-workspace');
  const bp = host.querySelector('.bohai-page');
  const fill = bp && ws ? Math.round(bp.getBoundingClientRect().width / ws.getBoundingClientRect().width * 100) : 0;
  return {
    h: Math.round(r.height),
    radius: getComputedStyle(host).borderRadius,
    scrollable: chat ? getComputedStyle(chat).overflowY : 'MISSING',
    wsPad: ws ? getComputedStyle(ws).paddingTop : '?',
    fill
  };
});
check('BOH AI 满屏卡片（高 ≥ 60vh）', aiState.h >= 506, `h=${aiState.h}px`);
check('BOH AI 卡片圆角（24px 玻璃卡）', aiState.radius === '24px', aiState.radius);
check('BOH AI 旧限宽/大 padding 已清（workspace pt=0）', aiState.wsPad === '0px', aiState.wsPad);
check('BOH AI 页面铺满宿主（宽 ≥95%）', aiState.fill >= 95, `${aiState.fill}%`);
check('BOH AI 滚动链（有界高度 + chat-container 就位）', aiState.scrollable !== 'MISSING', aiState.scrollable);
await page.screenshot({ path: 'debug-screenshots/ia-messages-ai.png' });

// ---------- 6b. 一键已读底部操作栏 ----------
await clickSeg('消息');
await page.waitForTimeout(900);
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.x-mark-all-btn-minimal')).find((b) => b.textContent.trim() === '选择');
  btn?.click();
});
await page.waitForTimeout(400);
const sabState = await page.evaluate(() => {
  const bar = document.querySelector('.x-select-action-bar');
  if (!bar) return { exists: false };
  const primary = bar.querySelector('.x-sab-primary');
  return {
    exists: true,
    visible: getComputedStyle(bar).display !== 'none',
    primaryText: primary ? primary.textContent.trim() : 'MISSING',
    disabled: primary ? primary.disabled : true
  };
});
check('选择后出现一键已读操作栏', sabState.exists && sabState.visible);
check('操作栏主按钮文案（完成）', (sabState.primaryText || '') === '完成', sabState.primaryText);
await page.screenshot({ path: 'debug-screenshots/ia-messages-select-bar.png' });
await page.evaluate(() => {
  const btn = document.querySelector('.x-select-action-bar .x-sab-btn');
  btn?.click();
});
await page.waitForTimeout(300);

// ---------- 7. 设置直接切 ----------
await clickNav('设置');
await page.waitForTimeout(600);
let settingsPanelOk = false;
try {
  await page.waitForSelector('.settings-shell .profile-page-content > *:not(.login-prompt)', { timeout: 9000 });
  settingsPanelOk = true;
} catch {}
check('设置直接切 + 面板渲染', (await activeTab()) === '设置' && settingsPanelOk);
const gsState = await page.evaluate(() => {
  const surfaces = document.querySelectorAll('.settings-shell .glass-settings');
  const rows = document.querySelectorAll('.settings-shell .gs-row');
  const surface = surfaces[0];
  return {
    count: surfaces.length,
    rows: rows.length,
    glass: surface ? getComputedStyle(surface).backdropFilter !== 'none' : false,
    radius: surface ? getComputedStyle(surface).borderRadius : ''
  };
});
check('设置连续玻璃面板（单一 surface）', gsState.count === 1, `count=${gsState.count}`);
check('设置行数完整（≥9 行）', gsState.rows >= 9, `rows=${gsState.rows}`);
check('设置面板液态玻璃生效', gsState.glass, `radius=${gsState.radius}`);
await page.screenshot({ path: 'debug-screenshots/ia-settings.png' });

// ---------- 8. 旧 URL 兼容 ----------
await page.goto(`${BASE}/#/user-space?tab=profile`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(page);
await page.waitForTimeout(1100);
check('旧 ?tab=profile 落在我的 tab', (await activeTab()) === '我的');

await page.goto(`${BASE}/#/user-space/posts`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(1100);
check('旧 /user-space/posts 重定向到社区（论坛语义）', (await activeTab()) === '社区');

// ---------- 9. 暗色页签 ----------
const darkPage = await context.newPage();
const darkErrors = [];
darkPage.on('pageerror', (e) => darkErrors.push(String(e.message).slice(0, 160)));
await darkPage.addInitScript(() => {
  try { localStorage.setItem('boh-theme', 'dark'); } catch {}
});
await darkPage.setViewportSize({ width: 390, height: 844 });
await darkPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await darkPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(darkPage);
await darkPage.waitForTimeout(1500);
const darkSeg = await darkPage.evaluate(() => {
  const tabs = document.querySelector('.segment-tabs');
  const active = tabs ? tabs.querySelector('.segment-tab.active') : null;
  const indicator = tabs ? tabs.querySelector('.segment-tab-indicator') : null;
  return {
    exists: !!tabs,
    tabsBg: tabs ? getComputedStyle(tabs).backgroundColor : 'MISSING',
    activeColor: active ? getComputedStyle(active).color : 'MISSING',
    indicatorBg: indicator ? getComputedStyle(indicator).backgroundColor : 'MISSING'
  };
});
check('暗色页签存在', darkSeg.exists);
check('暗色页签无底色（随页面滚动）', darkSeg.tabsBg === 'rgba(0, 0, 0, 0)', darkSeg.tabsBg);
check('暗色当前项文字亮色', darkSeg.activeColor === 'rgb(245, 245, 247)', darkSeg.activeColor);
check('暗色指示条 = 文字色（黑条暗色反白）', darkSeg.indicatorBg === 'rgb(245, 245, 247)', darkSeg.indicatorBg);
// 竖屏必须保持现状：左栏是横屏专用层，不得在竖屏出现（display:none）
const darkLayout = await darkPage.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const bar = document.querySelector('.bottom-nav-glass');
  const shell = document.querySelector('.tab-page');
  return {
    railHidden: !rail || getComputedStyle(rail).display === 'none',
    barShown: bar ? getComputedStyle(bar).display !== 'none' : false,
    left: shell ? Math.round(shell.getBoundingClientRect().left) : -1
  };
});
check('竖屏不进分栏：左栏隐藏', darkLayout.railHidden);
check('竖屏保持底栏可见', darkLayout.barShown);
check('竖屏内容区未让位（left = 0）', darkLayout.left === 0, `left=${darkLayout.left}`);
await darkPage.screenshot({ path: 'debug-screenshots/ia-community-dark.png' });
check('零 pageerror（暗色页）', darkErrors.length === 0, darkErrors.join(' | ').slice(0, 120));
await darkPage.close();

// ---------- 9b. 手机横屏（844×420）必须保持现状：min-width:1024 把它挡在分栏之外 ----------
const mlandPage = await context.newPage();
await mlandPage.setViewportSize({ width: 844, height: 420 });
await mlandPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await mlandPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(mlandPage);
await mlandPage.waitForTimeout(900);
const mlandLayout = await mlandPage.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const bar = document.querySelector('.bottom-nav-glass');
  const shell = document.querySelector('.tab-page');
  return {
    railHidden: !rail || getComputedStyle(rail).display === 'none',
    barShown: bar ? getComputedStyle(bar).display !== 'none' : false,
    left: shell ? Math.round(shell.getBoundingClientRect().left) : -1,
    width: shell ? Math.round(shell.getBoundingClientRect().width) : -1,
    innerWidth: window.innerWidth
  };
});
check('手机横屏（844×420）不进分栏：左栏隐藏', mlandLayout.railHidden);
check('手机横屏保持底栏可见', mlandLayout.barShown);
check('手机横屏内容区未让位（left=0 且全宽）',
  mlandLayout.left === 0 && mlandLayout.width === mlandLayout.innerWidth,
  `left=${mlandLayout.left} width=${mlandLayout.width} inner=${mlandLayout.innerWidth}`);
await mlandPage.screenshot({ path: 'debug-screenshots/ia-mobile-landscape-unchanged.png' });
await mlandPage.close();

// ---------- 10. 横屏全宽 ----------
const landPage = await context.newPage();
const landErrors = [];
landPage.on('pageerror', (e) => landErrors.push(String(e.message).slice(0, 160)));
await landPage.setViewportSize({ width: 1180, height: 720 });
await landPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await landPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(landPage);
await landPage.waitForTimeout(1200);
await landPage.evaluate(() => {
  // 双通道：≥1024 横屏走左侧栏，其余走底部胶囊 —— 同一份探针覆盖两种形态
  const items = Array.from(document.querySelectorAll('.userspace-rail-item, .bottom-nav-glass .nav-item'));
  const visible = items.filter((el) => el.offsetParent !== null);
  (visible.length ? visible : items).find((el) => el.textContent.trim().includes('我的'))?.click();
});
await landPage.waitForTimeout(1100);
const landState = await landPage.evaluate(() => {
  const pc = document.querySelector('.content-home-host .profile-page-content');
  const shell = document.querySelector('.tab-page.content-shell');
  if (!pc || !shell) return { pcMax: 'MISSING', usage: 0 };
  return {
    pcMax: getComputedStyle(pc).maxWidth,
    usage: Math.round(pc.getBoundingClientRect().width / shell.getBoundingClientRect().width * 100)
  };
});
check('横屏身份卡全宽（max-width 解除）', landState.pcMax === '100%', `max-width=${landState.pcMax}`);
check('横屏内容宽度占用 ≥95%', landState.usage >= 95, `${landState.usage}%`);

// 横屏左右分栏（1180×720 落在 1024–1279 → 88px 图标栏）
const landRail = await landPage.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const bar = document.querySelector('.bottom-nav-glass');
  const shell = document.querySelector('.tab-page.content-shell');
  const railRect = rail ? rail.getBoundingClientRect() : null;
  const navH = Math.ceil(document.getElementById('unified-nav-container')?.getBoundingClientRect().height || 0);
  return {
    railDisplay: rail ? getComputedStyle(rail).display : 'ABSENT',
    railW: railRect ? Math.round(railRect.width) : -1,
    railPadTop: rail ? Math.round(parseFloat(getComputedStyle(rail).paddingTop)) : -1,
    railBackdrop: rail ? (getComputedStyle(rail).backdropFilter || getComputedStyle(rail).webkitBackdropFilter || 'none') : 'ABSENT',
    barDisplay: bar ? getComputedStyle(bar).display : 'ABSENT',
    left: shell ? Math.round(shell.getBoundingClientRect().left) : -1,
    width: shell ? Math.round(shell.getBoundingClientRect().width) : -1,
    innerWidth: window.innerWidth,
    // 视觉间距 = 内容实际起点（含容器 padding-left）− 左栏右边缘
    gutter: (() => {
      const content = document.querySelector('.content-home-host .profile-page-content');
      if (!content || !railRect) return -1;
      const cs = getComputedStyle(content);
      return Math.round(content.getBoundingClientRect().left + parseFloat(cs.paddingLeft) - railRect.right);
    })(),
    navH,
    theme: document.documentElement.getAttribute('data-theme') || 'light',
    indicatorBg: (() => {
      const el = document.querySelector('.userspace-rail-indicator');
      if (!el) return 'ABSENT';
      const cs = getComputedStyle(el);
      return cs.backgroundColor;
    })()
  };
});
check('横屏左栏可见（电脑 / 平板横屏）', landRail.railDisplay === 'flex', landRail.railDisplay);
check('横屏底栏已隐藏', landRail.barDisplay === 'none', landRail.barDisplay);
check('左栏宽度 = 88px（1024–1279 档）', landRail.railW === 88, `${landRail.railW}px`);
check('右区让位：left = 88px', landRail.left === 88, `left=${landRail.left}`);
check('右区宽度 = 视口 − 左栏', landRail.width === landRail.innerWidth - 88, `width=${landRail.width} inner=${landRail.innerWidth}`);
check('左栏顶隙吃导航岛实测高度（不被浮岛压住）', landRail.railPadTop >= landRail.navH,
  `padTop=${landRail.railPadTop} navH=${landRail.navH}`);
check('选中指示胶囊 = 问BOHAI 同款淡染材质（亮深染/暗白染）',
  landRail.theme === 'dark'
    ? landRail.indicatorBg === 'rgba(255, 255, 255, 0.08)'
    : landRail.indicatorBg === 'rgba(15, 23, 42, 0.045)',
  `${landRail.theme} ${landRail.indicatorBg}`);
check('左栏材质为液态玻璃（backdrop-filter 非 none）',
  landRail.railDisplay !== 'ABSENT' && landRail.railBackdrop !== 'none',
  landRail.railBackdrop);
check('内容与左栏有呼吸间距（≥20px）', landRail.gutter >= 20, `gutter=${landRail.gutter}px`);
await landPage.screenshot({ path: 'debug-screenshots/ia-landscape-fullwidth.png' });
// ---------- 10c. 横屏左栏按钮组 ----------
const railButtons = await landPage.evaluate(() => ({
  main: document.querySelectorAll('.userspace-rail-group [data-tab]').length,
  actions: Array.from(document.querySelectorAll('[data-rail-action]')).map((el) => el.dataset.railAction)
}));
check('左栏主导航 5 项', railButtons.main === 5, `main=${railButtons.main}`);
check('左栏便捷组齐全（发布/搜索）',
  ['compose', 'search'].every((id) => railButtons.actions.includes(id)),
  railButtons.actions.join(','));
check('左栏不含「通知」（与消息 tab 的 inbox 分区重复，已删）',
  !railButtons.actions.includes('notifications'),
  railButtons.actions.join(','));
check('左栏工具组齐全（主题/首页/退出登录）',
  ['theme', 'home', 'logout'].every((id) => railButtons.actions.includes(id)),
  railButtons.actions.join(','));

// 主题 → 弹窗
await landPage.click('[data-rail-action="theme"]');
let themeOpened = false;
try {
  await landPage.waitForSelector('.theme-modal-card', { timeout: 6000 });
  themeOpened = true;
} catch {}
check('点「主题」打开主题弹窗', themeOpened);
// 弹窗样式来自按需加载的 profile-panels.css：社区 tab 下必须先预载，
// 否则 .modal-overlay 会退化成 static 块（弹窗裸奔在页面流里）
if (themeOpened) {
  const themeModalState = await landPage.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    const card = document.querySelector('.modal-card.theme-modal-card');
    if (!overlay || !card) return { pos: 'ABSENT', z: 'ABSENT', dx: -1, h: 0 };
    const cs = getComputedStyle(overlay);
    const r = card.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    return {
      pos: cs.position,
      z: cs.zIndex,
      dx: Math.round(Math.abs(centerX - window.innerWidth / 2)),
      h: Math.round(r.height)
    };
  });
  check('主题弹窗样式就绪（overlay 为 fixed 且卡片居中出现）',
    themeModalState.pos === 'fixed' && themeModalState.dx < 80 && themeModalState.h > 200,
    `pos=${themeModalState.pos} z=${themeModalState.z} dx=${themeModalState.dx} h=${themeModalState.h}`);
}
if (themeOpened) {
  await landPage.click('.theme-modal-card .primary-btn-clean').catch(() => {});
  await landPage.waitForTimeout(500);
}

// 发布 → 右区发布会话（路径 B：复用论坛 openMobileComposer）
// 记发布前左栏首项位置：用于断言「开发布会话时左栏不上移/不跳变」
const railBeforeCompose = await landPage.evaluate(() => {
  const item = document.querySelector('.userspace-rail-item');
  return item ? Math.round(item.getBoundingClientRect().y) : -1;
});
await landPage.click('[data-rail-action="compose"]');
let composerOpened = false;
try {
  await landPage.waitForSelector('.mobile-composer-overlay', { timeout: 12000 });
  composerOpened = true;
} catch {}
check('点「发布」打开发布会话（自动切回社区 tab）', composerOpened);
if (composerOpened) {
  await landPage.waitForTimeout(600);
  const composerState = await landPage.evaluate(() => {
    const overlay = document.querySelector('.mobile-composer-overlay');
    const rail = document.querySelector('.userspace-rail');
    const section = document.querySelector('.mobile-composer-section');
    const checkin = document.querySelector('.weekly-checkin-panel');
    const embeddedComposer = document.querySelector('.forum-page.embedded-mode .forum-left-column > .post-creation-section');
    const o = overlay ? overlay.getBoundingClientRect() : null;
    const s = section ? section.getBoundingClientRect() : null;
    const railItem = document.querySelector('.userspace-rail-item');
    const mobileTools = document.querySelector('.mobile-post-image-toolbar');
    const scrollBox = document.querySelector('.mobile-composer-scroll');
    // 会话内那个「＋ 添加图片」大方框（不是内嵌编辑器里的同名实例）
    const addMore = Array.from(document.querySelectorAll('.post-image-add-more-card'))
      .find((el) => el.closest('.mobile-composer-overlay'));
    return {
      addMoreDisplay: addMore ? getComputedStyle(addMore).display : 'ABSENT',
      overlayOverflow: overlay ? getComputedStyle(overlay).overflow : 'ABSENT',
      scrollOverflowY: scrollBox ? getComputedStyle(scrollBox).overflowY : 'ABSENT',
      overlayLeft: o ? Math.round(o.left) : -1,
      overlayW: o ? Math.round(o.width) : -1,
      overlayCenter: o ? Math.round(o.left + o.width / 2) : -1,
      sectionW: s ? Math.round(s.width) : -1,
      sectionCenter: s ? Math.round(s.left + s.width / 2) : -1,
      innerWidth: window.innerWidth,
      railVisible: rail ? getComputedStyle(rail).display !== 'none' : false,
      railFirstItemY: railItem ? Math.round(railItem.getBoundingClientRect().y) : -1,
      checkinDisplay: checkin ? getComputedStyle(checkin).display : 'ABSENT',
      mobileToolsDisplay: mobileTools ? getComputedStyle(mobileTools).display : 'ABSENT',
      embeddedComposerDisplay: embeddedComposer ? getComputedStyle(embeddedComposer).display : 'ABSENT'
    };
  });
  check('发布会话只覆盖右区（left = 左栏宽）', composerState.overlayLeft === 88, `left=${composerState.overlayLeft}`);
  check('发布会话宽度 = 视口 − 左栏',
    composerState.overlayW === composerState.innerWidth - 88,
    `w=${composerState.overlayW} vw=${composerState.innerWidth}`);
  check('发布态左栏仍可见', composerState.railVisible);
  check('发布会话全宽铺满右区（不限宽居中）',
    composerState.sectionW === composerState.overlayW,
    `section=${composerState.sectionW} overlay=${composerState.overlayW}`);
  check('会话内已移除移动端工具横条（标签只剩一套）',
    composerState.mobileToolsDisplay === 'none',
    composerState.mobileToolsDisplay);
  check('开发布会话时左栏不上移（前后位置一致）',
    composerState.railFirstItemY === railBeforeCompose,
    `before=${railBeforeCompose} after=${composerState.railFirstItemY}`);
  check('发布会话内已移除周签到面板', composerState.checkinDisplay === 'none', composerState.checkinDisplay);
  check('社区内嵌发帖编辑器已删除（发布会话取代）',
    composerState.embeddedComposerDisplay === 'none',
    composerState.embeddedComposerDisplay);
  // 用户要求：发帖页不要「整个界面滚动」→ 会话层不滚（顶栏钉住），只有内容区自己滚
  check('发布会话整页不滚动（仅内容区滚动）',
    composerState.overlayOverflow === 'hidden' && composerState.scrollOverflowY === 'auto',
    `overlayOverflow=${composerState.overlayOverflow} scrollOverflowY=${composerState.scrollOverflowY}`);
  // 「＋ 添加图片」大方框在横屏桌面隐藏（工具条已有 0/6 图片入口）。
  // 竖屏/窄屏仍保留 —— 由 composer.css 的取反媒体查询保证，这里锁横屏这一侧
  check('发布会话内不显示「＋ 添加图片」大方框（横屏去重）',
    composerState.addMoreDisplay === 'none',
    composerState.addMoreDisplay);
  await landPage.screenshot({ path: 'debug-screenshots/ia-landscape-composer.png' });

  // 发布会话被 Teleport 到 body，切 tab 不会自动收起 → 点左栏其它 tab 必须先关掉它
  await landPage.click('.userspace-rail-item[data-tab="posts"]');
  let composerDismissed = false;
  try {
    await landPage.waitForFunction(() => !document.querySelector('.mobile-composer-overlay'), null, { timeout: 8000 });
    composerDismissed = true;
  } catch {}
  check('发布态点左栏其它 tab → 会话自动收起', composerDismissed);
  await landPage.waitForTimeout(700);
}

// 搜索 → 聚焦论坛工具栏搜索框
await landPage.click('[data-rail-action="search"]');
let searchFocused = false;
try {
  await landPage.waitForFunction(
    () => document.activeElement?.classList?.contains('toolbar-search-input'),
    null,
    { timeout: 12000 }
  );
  searchFocused = true;
} catch {}
check('点「搜索」聚焦论坛搜索框', searchFocused);

// 搜索框几何（用户明确要求：横屏加高 + 提示居中 + 跨栏独占一行）。
// 只验「存在」会漏掉样式裸奔，这里量真实几何
const landSearch = await landPage.evaluate(() => {
  const input = document.querySelector('.forum-page .toolbar-search-input');
  if (!input) return null;
  const cs = getComputedStyle(input);
  const r = input.getBoundingClientRect();
  const shell = Array.from(document.querySelectorAll('.tab-page')).find((el) => el.offsetParent !== null);
  const sr = shell ? shell.getBoundingClientRect() : null;
  return {
    h: Math.round(r.height),
    w: Math.round(r.width),
    textAlign: cs.textAlign,
    leftGap: sr ? Math.round(r.left - sr.left) : -1
  };
});
check('横屏搜索框已加高（≥48px）', !!landSearch && landSearch.h >= 48, `h=${landSearch?.h}`);
check('横屏搜索框提示文字左对齐（对齐融合容器参考图）', landSearch?.textAlign === 'left', `text-align=${landSearch?.textAlign}`);
check('横屏搜索框跨栏独占一行（远宽于单栏）', !!landSearch && landSearch.w >= 700, `w=${landSearch?.w}`);
check('横屏搜索框不与左栏贴边', !!landSearch && landSearch.leftGap >= 20, `leftGap=${landSearch?.leftGap}`);

check('零 pageerror（横屏页）', landErrors.length === 0, landErrors.join(' | ').slice(0, 120));
await landPage.close();

// ---------- 10b. 横屏/桌面宽度：一键已读操作栏必现 ----------
const landBar = await context.newPage();
await landBar.setViewportSize({ width: 1180, height: 820 });
await landBar.goto(`${BASE}/#/user-space?tab=messages`, { waitUntil: 'domcontentloaded' });
await landBar.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(landBar);
let selBtn2 = null;
try {
  selBtn2 = await landBar.waitForSelector('.x-header-minimal .x-mark-all-btn-minimal', { timeout: 10000 });
} catch {}
if (selBtn2) {
  try { await selBtn2.click({ timeout: 5000 }); } catch (e) { console.log('  [10b click fail]', String(e.message).slice(0, 100)); }
}
await landBar.waitForTimeout(600);
const landBarPre = await landBar.evaluate(() => ({
  header: !!document.querySelector('.x-header-minimal'),
  btns: Array.from(document.querySelectorAll('.x-mark-all-btn-minimal')).map((b) => b.textContent.trim()),
  loggedIn: (() => { try { return document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.auth.isLoggedIn; } catch { return '?'; } })()
}));
console.log('  [10b pre]', JSON.stringify(landBarPre));
const landBarState = await landBar.evaluate(() => {
  const bar = document.querySelector('.x-select-action-bar');
  const inline = document.querySelector('.x-filter-actions-desktop-minimal');
  return {
    bar: bar ? getComputedStyle(bar).display : 'ABSENT',
    primary: bar?.querySelector('.x-sab-primary')?.textContent.trim() || 'MISSING',
    inline: inline ? getComputedStyle(inline).display : 'ABSENT'
  };
});
check('横屏选择后操作栏出现（1180px）', landBarState.bar === 'flex', landBarState.bar);
check('横屏操作栏主按钮（完成）', landBarState.primary === '完成', landBarState.primary);
check('横屏顶部重复行已隐藏', landBarState.inline === 'none', landBarState.inline);
await landBar.screenshot({ path: 'debug-screenshots/ia-landscape-select-bar.png' });
await landBar.close();

// ---------- 11. 桌面页签居中 ----------
const deskPage = await context.newPage();
await deskPage.setViewportSize({ width: 1280, height: 860 });
await deskPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await deskPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
// 固定 sleep 不够稳：index.html 内联骨架构到 Vue mount 才清，路由 chunk 之后再到位，
// 1400ms 时页面可能还停在「正在加载…」。改成条件等待（同 §9 tabsCleared 的教训）
let deskTabsReady = false;
try {
  await deskPage.waitForFunction(
    () => Array.from(document.querySelectorAll('.segment-tabs')).some((t) => t.offsetParent !== null),
    null,
    { timeout: 15000 }
  );
  deskTabsReady = true;
} catch {}
const deskTabs = await deskPage.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  if (!tabs) return { w: 0, centered: false, ref: -1 };
  const btns = Array.from(tabs.querySelectorAll('.segment-tab')).map((b) => b.getBoundingClientRect());
  const left = Math.min(...btns.map((r) => r.left));
  const right = Math.max(...btns.map((r) => r.right));
  const groupW = Math.round(right - left);
  const center = (left + right) / 2;
  // 基准 = 可见 tab-page 的中心：横屏分栏后它是右区中心，未分栏时等于窗口中心
  const shell = Array.from(document.querySelectorAll('.tab-page')).find((el) => el.offsetParent !== null)
    || document.querySelector('.user-space-page');
  const rect = shell.getBoundingClientRect();
  const ref = rect.left + rect.width / 2;
  return { w: groupW, centered: Math.abs(center - ref) < 40, ref: Math.round(ref) };
});
check('桌面页签文字组居中（基准 = 内容区中心）',
  deskTabsReady && deskTabs.w > 0 && deskTabs.w < 420 && deskTabs.centered,
  `ready=${deskTabsReady} groupW=${deskTabs.w}px centered=${deskTabs.centered} ref=${deskTabs.ref}`);
await deskPage.screenshot({ path: 'debug-screenshots/ia-desktop-seg-tabs.png' });
await deskPage.close();

// ---------- 汇总 ----------
check('零 pageerror（明色主流程）', errors.length === 0, errors.join(' | ').slice(0, 120));

console.log(results.join('\n'));
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
