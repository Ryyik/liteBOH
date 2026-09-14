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
};

const navLabels = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item span')).map((el) => el.textContent.trim())
);
const clickNav = (label) => page.evaluate((text) => {
  const tabs = Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item'));
  tabs.find((t) => t.textContent.trim().includes(text))?.click();
}, label);
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
await page.waitForTimeout(1200);
seg = await segState();
check('我的页签两档', seg.exists && JSON.stringify(seg.labels) === JSON.stringify(['空间', 'Cloud+']),
  (seg.labels || []).join('/'));
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
const assetsState = await page.evaluate(() => ({
  shell: !!document.querySelector('.tab-page.assets-shell'),
  noTabs: !Array.from(document.querySelectorAll('.segment-tabs')).some((t) => t.offsetParent !== null)
}));
check('资产直接切（无页签）', assetsState.shell && assetsState.noTabs && (await urlTab()) === 'assets');
check('AssetsHubPanel 渲染', assetsPanelOk);
const backHidden = await page.evaluate(() => {
  const btn = document.querySelector('.assets-shell .user-center-back-button');
  return !btn || btn.offsetParent === null;
});
check('资产首屏返回按钮已取消', backHidden);
await page.screenshot({ path: 'debug-screenshots/ia-assets.png' });

// ---------- 6. 消息 tab：页签两档 ----------
await clickNav('消息');
await page.waitForTimeout(1200);
seg = await segState();
const msgTabsTop = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  return tabs ? Math.round(tabs.getBoundingClientRect().top) : -1;
});
check('消息页签两档（BOH AI）', seg.exists && JSON.stringify(seg.labels) === JSON.stringify(['消息', 'BOH AI']),
  (seg.labels || []).join('/'));
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
await darkPage.screenshot({ path: 'debug-screenshots/ia-community-dark.png' });
check('零 pageerror（暗色页）', darkErrors.length === 0, darkErrors.join(' | ').slice(0, 120));
await darkPage.close();

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
  const tabs = Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item'));
  tabs.find((t) => t.textContent.trim().includes('我的'))?.click();
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
await landPage.screenshot({ path: 'debug-screenshots/ia-landscape-fullwidth.png' });
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
await deskPage.waitForTimeout(1400);
const deskTabs = await deskPage.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find((t) => t.offsetParent !== null);
  if (!tabs) return { w: 0, centered: false };
  const btns = Array.from(tabs.querySelectorAll('.segment-tab')).map((b) => b.getBoundingClientRect());
  const left = Math.min(...btns.map((r) => r.left));
  const right = Math.max(...btns.map((r) => r.right));
  const groupW = Math.round(right - left);
  const center = (left + right) / 2;
  return { w: groupW, centered: Math.abs(center - window.innerWidth / 2) < 40 };
});
check('桌面页签文字组居中', deskTabs.w > 0 && deskTabs.w < 420 && deskTabs.centered,
  `groupW=${deskTabs.w}px centered=${deskTabs.centered}`);
await deskPage.screenshot({ path: 'debug-screenshots/ia-desktop-seg-tabs.png' });
await deskPage.close();

// ---------- 汇总 ----------
check('零 pageerror（明色主流程）', errors.length === 0, errors.join(' | ').slice(0, 120));

console.log(results.join('\n'));
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
