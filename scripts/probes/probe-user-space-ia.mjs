import { chromium } from 'playwright';

// 探针：用户空间 IA 回归（2026-10 收口版）
// 底栏四席 = 内容/消息/AI/我（单源 src/config/bottom-nav.ts）；
// 内容 tab = ForumSectionShell 六席分区 官方/最新/关注/新闻/活动/成员
//   （单源 src/config/forum-sections.ts，官方居首但默认落点 latest）；
// 我 tab = 三段 空间/资产/印象（UserSpaceMain.vue CONTENT_SECTION_ITEMS）；
// 资产/设置不再是底栏席：资产降为我页分段（?tab=assets 旧深链回落资产段），
// 设置经 ?tab=settings 直达且底栏高亮落「我」；
// AI 不再寄生消息 tab：底栏 AI 席是全屏跨模块落点（/ai-chat）。
const BASE = process.env.BASE || 'http://localhost:5173';
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
  args: ['--no-proxy-server'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

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
  // auth 异步初始化可能晚于注入把状态洗回未登录——重试锚定
  for (let i = 0; i < 6; i += 1) {
    await p.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-ia-user',
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
  // 登录态就绪 ≠ 页面就绪：index.html 的启动骨架要等 Vue mount + 路由 chunk 到位才清，
  // 此时断言会读到「什么都没有」。等真实的 userspace 根元素出现再返回。
  await p
    .waitForFunction(() => !!document.querySelector('.user-space-page'), null, { timeout: 20000 })
    .catch(() => {});
  // 登录态就绪还可能被更晚到达的 auth 异步初始化洗回未登录（checkAuth 落地时机不保证）——
  // 用户空间根元素出现后再补一轮锚定，否则后续依赖登录的断言（如左栏「更多」菜单的退出登录项）会假红
  for (let i = 0; i < 3; i += 1) {
    const stillIn = await p
      .evaluate(() => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return !!pinia && pinia.state.value.auth.isLoggedIn === true;
      })
      .catch(() => false);
    if (stillIn) return;
    await p
      .evaluate(() => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        pinia.state.value.auth.isLoggedIn = true;
      })
      .catch(() => {});
    await p.waitForTimeout(500);
  }
};

// 掉登录自愈：dev server 偶发模块请求失败会命中 index.html 内联的 recovery 分支
// → 带 ?forceUpdate=true 重定向 → 页面重载、pinia 里注入的登录态丢失。
// 每次切 tab 后检测一次，掉了就补注入，别让一次环境抖动污染整条链路。
const ensureLoggedIn = async () => {
  const ok = await page
    .evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return !!pinia && pinia.state.value.auth.isLoggedIn === true;
    })
    .catch(() => false);
  if (ok) return true;
  await page
    .waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 })
    .catch(() => {});
  await injectLogin(page);
  return false;
};

const navLabels = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item .nav-label')).map((el) =>
      el.textContent.trim(),
    ),
  );
const clickNav = async (label) => {
  await page.evaluate((text) => {
    const tabs = Array.from(document.querySelectorAll('.bottom-nav-glass .nav-item'));
    tabs.find((t) => t.textContent.trim().includes(text))?.click();
  }, label);
  // 页面若在切 tab 瞬间被 recovery 重载过，登录态会丢 → 补注入再继续
  await ensureLoggedIn();
};
const clickSeg = (label) =>
  page.evaluate((text) => {
    const tabs = Array.from(document.querySelectorAll('.segment-tabs')).filter(
      (t) => t.offsetParent !== null,
    );
    for (const group of tabs) {
      const hit = Array.from(group.querySelectorAll('.segment-tab')).find(
        (b) => b.textContent.trim() === text,
      );
      if (hit) {
        hit.click();
        return true;
      }
    }
    return false;
  }, label);
const segState = () =>
  page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find(
      (t) => t.offsetParent !== null,
    );
    if (!tabs) return { exists: false };
    const items = Array.from(tabs.querySelectorAll('.segment-tab'));
    const active = items.find((i) => i.classList.contains('active'));
    const indicator = tabs.querySelector('.segment-tab-indicator');
    return {
      exists: true,
      labels: items.map((i) => i.textContent.trim()),
      active: active ? active.textContent.trim() : '',
      indicatorW: indicator ? Math.round(indicator.getBoundingClientRect().width) : 0,
      transform: indicator ? getComputedStyle(indicator).transform : '',
    };
  });
const activeTab = () =>
  page.evaluate(() => {
    const el = document.querySelector('.bottom-nav-glass .nav-item.active .nav-label');
    return el ? el.textContent.trim() : 'NONE';
  });
// 条件等待：**第一个可见**页签组的文案 == 期望。
// 必须要求「第一个」而不是「任意一个」：.tab-page 是 absolute 叠放层，切 tab 时
// 离场页面的页签短期内仍可见、且可能排在更前。用 some() 会立刻命中离场组。
const waitForSeg = async (expected, timeout = 12000) => {
  const want = JSON.stringify(expected);
  try {
    await page.waitForFunction(
      (w) => {
        const groups = Array.from(document.querySelectorAll('.segment-tabs')).filter(
          (t) => t.offsetParent !== null,
        );
        if (!groups.length) return false;
        const firstLabels = JSON.stringify(
          Array.from(groups[0].querySelectorAll('.segment-tab')).map((b) => b.textContent.trim()),
        );
        return firstLabels === w;
      },
      want,
      { timeout },
    );
    await page.waitForTimeout(400); // 命中后再给离场动画收尾，避免 segState 抓到过渡态
    return true;
  } catch {
    return false;
  }
};
// 并发开发环境自保：别的 agent 正在改 src 时，vite 偶发会把 <vite-error-overlay>
// 盖在页面上拦截一切 pointer 事件（实测 Playwright click 全卡死在该浮层上）。
// 每次动作 click 前清一遍；浮层是 vite 的调试 UI，清掉不影响被测页面状态。
const clearOverlays = async (p = page) => {
  await p
    .evaluate(() => {
      document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove());
    })
    .catch(() => {});
};
const safeClick = async (p, selector, timeout = 8000) => {
  await clearOverlays(p);
  for (let i = 0; i < 3; i += 1) {
    try {
      await p.click(selector, { timeout });
      return true;
    } catch (e) {
      await clearOverlays(p);
      if (i === 2) throw e;
      await p.waitForTimeout(500);
    }
  }
  return false;
};

// ---------- 1. 默认内容 tab + 论坛六席文字页签 ----------
await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
// 冷 dev server 下首屏 chunk 编译可拖到十几秒 —— 固定 sleep 必假红，
// 等到底栏四席 + 第一组可见页签都就位再断言（与 §11 deskTabsReady 同口径）
await page
  .waitForFunction(
    () =>
      document.querySelectorAll('.bottom-nav-glass .nav-item').length > 0 &&
      Array.from(document.querySelectorAll('.segment-tabs')).some((t) => t.offsetParent !== null),
    null,
    { timeout: 30000 },
  )
  .catch(() => {});
// 指示条 width 有 300ms 过渡（SegmentTabs.vue），冷启动首帧量到 0 —— 等它落定
await page
  .waitForFunction(
    () => {
      const ind = document.querySelector('.segment-tabs .segment-tab-indicator');
      return !!ind && ind.getBoundingClientRect().width > 0;
    },
    null,
    { timeout: 10000 },
  )
  .catch(() => {});

const labels = await navLabels();
check(
  '底栏四席文案（内容/消息/AI/我）',
  JSON.stringify(labels) === JSON.stringify(['内容', '消息', 'AI', '我']),
  labels.join('/'),
);
check('内容 tab 为默认激活', (await activeTab()) === '内容');

let seg = await segState();
// 六席文案集合 = src/config/forum-sections.ts FORUM_SECTION_ITEMS（官方居首、印象已移出）
check(
  '论坛文字页签六席（官方/最新/关注/新闻/活动/成员）',
  seg.exists &&
    JSON.stringify(seg.labels) === JSON.stringify(['官方', '最新', '关注', '新闻', '活动', '成员']),
  (seg.labels || []).join('/'),
);
check('当前档 = 最新（论坛默认流，FORUM_DEFAULT_SECTION）', seg.active === '最新');
check('滑动指示条已定位（宽 > 0）', seg.indicatorW > 0, `w=${seg.indicatorW}px`);
check(
  '指示条黑色（文字主色）',
  await page.evaluate(() => {
    const ind = Array.from(document.querySelectorAll('.segment-tabs'))
      .find((t) => t.offsetParent !== null)
      ?.querySelector('.segment-tab-indicator');
    return ind ? getComputedStyle(ind).backgroundColor === 'rgb(29, 29, 31)' : false;
  }),
);
const forumTransform = seg.transform;
const gapState = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.community-shell .segment-tabs')).find(
    (t) => t.offsetParent !== null,
  );
  // 内嵌论坛宿主 = ForumSectionShell 的 .forum-section-feed（旧 .community-forum-host 包裹层已随 IA 改版移除）
  const forum = document.querySelector('.forum-section-feed .forum-page');
  if (!tabs || !forum) return { pos: 'MISSING', pt: 'MISSING', gap: -1 };
  const cs = getComputedStyle(tabs);
  const fcs = getComputedStyle(forum);
  const tabsRect = tabs.getBoundingClientRect();
  const first = forum.querySelector('.forum-main-grid, .forum-container > *');
  const gap = first ? Math.round(first.getBoundingClientRect().top - tabsRect.bottom) : -1;
  return { pos: cs.position, pt: fcs.paddingTop, gap };
});
check(
  '页签不吸附（随内容滚动）',
  gapState.pos === 'relative' || gapState.pos === 'static',
  gapState.pos,
);
check('论坛 80px 顶距已清零（shell-community.css 平铺覆盖）', gapState.pt === '0px', gapState.pt);
check(
  '页签-内容空隙收紧（≤24px）',
  gapState.gap >= 0 && gapState.gap <= 24,
  `gap=${gapState.gap}px`,
);
// FAB 归属：2026-10-05 定稿，FAB 只属于「内容」= 首页 feed 分区。
// UserSpace 内 embedded 论坛判 route.path !== '/' → 不挂载（ForumMain.vue isForumComposerFabVisible）
const fabVisible = await page.evaluate(() => {
  const fab = document.querySelector('.mobile-compose-fab.embedded-compose-fab');
  return fab ? getComputedStyle(fab).display !== 'none' : false;
});
check('UserSpace 内嵌论坛不挂发帖 FAB（FAB 只属于首页）', !fabVisible, `visible=${fabVisible}`);
const forumPad = await page.evaluate(() => {
  const c = document.querySelector('.forum-section-feed .forum-container');
  return c ? getComputedStyle(c).paddingBottom : 'MISSING';
});
check('论坛底部空隙收口（≤96px）', forumPad !== 'MISSING' && parseFloat(forumPad) <= 96, forumPad);
await page.screenshot({ path: 'debug-screenshots/ia-community-forum.png' });

// ---------- 2a. 文字页签切关注（论坛关注流；embedded 下内筛钮恒定不渲染） ----------
await clickSeg('关注');
await page.waitForTimeout(1300);
seg = await segState();
const followHostVisible = await page.evaluate(() => {
  const host = document.querySelector('.forum-section-feed');
  const inner = document.querySelector('.forum-section-feed .feed-mode-tabs');
  return (
    host &&
    getComputedStyle(host).display !== 'none' &&
    (!inner || getComputedStyle(inner).display === 'none')
  );
});
check('页签切关注 → 论坛关注流（内部筛选钮隐藏）', seg.active === '关注' && followHostVisible);
await clickSeg('最新');
await page.waitForTimeout(900);

// ---------- 2b. 文字页签切官方（英雄区舞台惰性挂载，feed 卸载） ----------
await clickSeg('官方');
await page.waitForTimeout(1200);
const officialState = await page.evaluate(() => {
  const zone = document.querySelector('.forum-section-official');
  const feed = document.querySelector('.forum-section-feed');
  return {
    zoneVisible: !!zone && getComputedStyle(zone).display !== 'none' && zone.children.length > 0,
    feedHidden: !feed || getComputedStyle(feed).display === 'none',
  };
});
check(
  '页签切官方 → 英雄区舞台挂载（feed 区卸载）',
  officialState.zoneVisible && officialState.feedHidden,
  `zone=${officialState.zoneVisible} feedHidden=${officialState.feedHidden}`,
);

// ---------- 2c. 文字页签切成员（独立面板，切走即卸载） ----------
await clickSeg('成员');
await page.waitForTimeout(1100);
seg = await segState();
const membersOk = await page.evaluate(
  () => !!document.querySelector('.community-page-grid .community-users-list .user-item'),
);
check('页签切成员 → 列表渲染', membersOk && seg.active === '成员', `${seg.active}`);
check('指示条随切换移动', seg.transform !== forumTransform, seg.transform);
await page.screenshot({ path: 'debug-screenshots/ia-community-members.png' });

// ---------- 2d. 切回最新：feed 区恢复挂载 ----------
await clickSeg('最新');
await page.waitForTimeout(900);
check(
  '页签切回最新档',
  await page.evaluate(() => {
    const feed = document.querySelector('.forum-section-feed');
    const forum = document.querySelector('.forum-section-feed .forum-page');
    return !!feed && getComputedStyle(feed).display !== 'none' && !!forum;
  }),
);

// ---------- 4. 我 tab：空间 / 资产 / 印象三段 ----------
await clickNav('我');
const mineSegReady = await waitForSeg(['空间', '资产', '印象']);
seg = await segState();
check(
  '我页签三段（空间/资产/印象）',
  mineSegReady &&
    seg.exists &&
    JSON.stringify(seg.labels) === JSON.stringify(['空间', '资产', '印象']),
  `ready=${mineSegReady} ${(seg.labels || []).join('/')}`,
);
check(
  '我当前档 = 空间（身份卡）',
  seg.active === '空间' &&
    (await page.evaluate(() => {
      const host = document.querySelector('.content-home-host .profile-page-content');
      return host && !host.querySelector('.login-prompt') && host.children.length > 0;
    })),
);
const contentGap = await page.evaluate(() => {
  const host = document.querySelector('.content-home-host');
  if (!host) return -1;
  const cs = getComputedStyle(host);
  return parseFloat(cs.paddingTop);
});
check('空间档页签下间距收紧（≤16px）', contentGap >= 0 && contentGap <= 16, `pt=${contentGap}px`);
await page.screenshot({ path: 'debug-screenshots/ia-content-home.png' });

// 资产段：AssetsHubPanel 原样内嵌于我页（首次访问后保持挂载）
await clickSeg('资产');
let assetsPanelOk = false;
try {
  await page.waitForSelector('.content-assets-host .profile-page-content > *:not(.login-prompt)', {
    timeout: 20000,
  });
  assetsPanelOk = true;
} catch {}
const assetsSegState = await segState();
// 资产已降为我页分段：不再有独立 tab-page.assets-shell；页级页签只剩「我」页自己的
// 空间/资产/印象一组（AssetsHubPanel 自带的 .ah-segment-tabs 在 posts tab 内、非 tab-page 直接子级）
const assetsState = await page.evaluate(() => ({
  standaloneAssetsTab: !!document.querySelector('.tab-page.assets-shell'),
  pageSegLabels: Array.from(document.querySelectorAll('.tab-page > .segment-tabs'))
    .filter((t) => t.offsetParent !== null)
    .map((t) => Array.from(t.querySelectorAll('.segment-tab')).map((b) => b.textContent.trim())),
}));
check(
  '切资产段 → AssetsHubPanel 渲染（embedded 于我页）',
  assetsPanelOk &&
    assetsSegState.active === '资产' &&
    !assetsState.standaloneAssetsTab &&
    assetsState.pageSegLabels.length === 1 &&
    JSON.stringify(assetsState.pageSegLabels[0]) === JSON.stringify(['空间', '资产', '印象']),
  `panel=${assetsPanelOk} active=${assetsSegState.active} standalone=${assetsState.standaloneAssetsTab} pageSegs=${JSON.stringify(assetsState.pageSegLabels)}`,
);
check('资产段底栏高亮仍落「我」（资产不再是底栏席）', (await activeTab()) === '我');
const backHidden = await page.evaluate(() => {
  const btn = document.querySelector('.assets-shell .user-center-back-button');
  return !btn || btn.offsetParent === null;
});
check('资产首屏返回按钮已取消', backHidden);
await page.screenshot({ path: 'debug-screenshots/ia-content-assets.png' });

// ---------- 4b. 资产段内层面板进 URL（?panel=，2026-10-15 机制包） ----------
// 面板值域真源 = AssetsHubPanel.betaTabIds；URL 写入唯一出口 = 组件 tab-change → 宿主。
// 覆盖：内层切换写 URL / 默认档省略 / 切走清除 / 切回归默认 / 服务行直达 / 两种深链直达。
const readPanelQuery = () =>
  page.evaluate(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    return { tab: q.get('tab'), view: q.get('view'), panel: q.get('panel') };
  });
const waitForPanel = async (expected, timeout = 6000) => {
  try {
    await page.waitForFunction(
      (exp) => {
        const q = new URLSearchParams(location.hash.split('?')[1] || '');
        return (q.get('panel') || '') === exp;
      },
      expected,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
};
const clickAssetsTab = (label) =>
  page.evaluate((text) => {
    // 限定资产内层段控（.ah-segment-tabs），与外层「我」页段控（空间/资产/印象）区分
    const tabs = document.querySelector('.ah-segment-tabs');
    const hit = tabs
      ? Array.from(tabs.querySelectorAll('.segment-tab')).find((b) => b.textContent.trim() === text)
      : null;
    hit?.click();
    return !!hit;
  }, label);
const assetsActiveTab = () =>
  page.evaluate(() => {
    const active = document.querySelector('.ah-segment-tabs .segment-tab.active');
    return active ? active.textContent.trim() : 'NONE';
  });

// A. 内层切换 → URL 写 panel 并跟随更新
await clickAssetsTab('积分');
const pointsPanelOk = await waitForPanel('points');
await page.waitForTimeout(400);
check(
  '资产内层切「积分」→ URL 写 ?panel=points',
  pointsPanelOk && (await assetsActiveTab()) === '积分',
  `active=${await assetsActiveTab()} panel=${(await readPanelQuery()).panel}`,
);
await clickAssetsTab('抽奖');
const lotteryPanelOk = await waitForPanel('lottery');
await page.waitForTimeout(400);
check(
  '资产内层切「抽奖」→ URL 跟随 ?panel=lottery',
  lotteryPanelOk && (await assetsActiveTab()) === '抽奖',
  `active=${await assetsActiveTab()} panel=${(await readPanelQuery()).panel}`,
);
// B. 切回默认档「概览」→ panel 从 URL 移除（与 view 的默认值省略同口径）
await clickAssetsTab('概览');
const panelCleared = await waitForPanel('');
await page.waitForTimeout(400);
check(
  '资产内层切回「概览」→ URL 移除 panel（默认档省略）',
  panelCleared && (await assetsActiveTab()) === '概览',
  `active=${await assetsActiveTab()}`,
);

// C. 切走资产段 → panel 清除；切回 → 面板归默认（不保留上次档，与设置分段同口径）
await clickSeg('印象');
await page.waitForTimeout(700);
check('切离资产段 → URL 移除 panel', String((await readPanelQuery()).panel || '') === '');
await clickSeg('资产');
await page.waitForTimeout(900);
check(
  '切回资产段 → 面板归默认「概览」',
  (await assetsActiveTab()) === '概览',
  `active=${await assetsActiveTab()}`,
);

// D. 空间段服务面板「资产中心」行 → 直达资产段·积分
//    （2026-10-15 行文案由「方块积分」改名「资产中心」——入口承载七类功能，旧名不副实；
//      定位兼配两种文案，避免文案再变时探针假红）
await clickSeg('空间');
await page.waitForTimeout(700);
const serviceRowClicked = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.profile-service-row'));
  const hit = rows.find(
    (r) => r.textContent.includes('资产中心') || r.textContent.includes('方块积分'),
  );
  hit?.click();
  return !!hit;
});
const servicePanelOk = await waitForPanel('points');
await page.waitForTimeout(600);
check(
  '空间段「资产中心」行 → 直达资产段·积分（?panel=points）',
  serviceRowClicked && servicePanelOk && (await assetsActiveTab()) === '积分',
  `clicked=${serviceRowClicked} active=${await assetsActiveTab()}`,
);

// E. 冷加载深链：?tab=posts&view=assets&panel=subscription 直达订阅
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=posts&view=assets&panel=subscription`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
let deepPanelOk = false;
try {
  await page.waitForSelector('.content-assets-host .profile-page-content > *:not(.login-prompt)', {
    timeout: 20000,
  });
  deepPanelOk = true;
} catch {}
await page.waitForTimeout(700);
check(
  '冷加载 ?view=assets&panel=subscription 直达订阅面板',
  deepPanelOk && (await assetsActiveTab()) === '订阅',
  `panel=${deepPanelOk} active=${await assetsActiveTab()}`,
);

// F. 旧深链 ?tab=assets&panel=points（历史 tab 形态 + 面板组合）→ 落资产段并直达积分
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets&panel=points`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
let legacyPanelOk2 = false;
try {
  await page.waitForSelector('.content-assets-host .profile-page-content > *:not(.login-prompt)', {
    timeout: 20000,
  });
  legacyPanelOk2 = true;
} catch {}
await page.waitForTimeout(900);
const legacyPanelQuery = await readPanelQuery();
check(
  '旧深链 ?tab=assets&panel=points 落资产段并直达积分（URL 回写 tab=posts&view=assets&panel=points）',
  legacyPanelOk2 &&
    (await assetsActiveTab()) === '积分' &&
    legacyPanelQuery.tab === 'posts' &&
    legacyPanelQuery.view === 'assets' &&
    legacyPanelQuery.panel === 'points',
  `active=${await assetsActiveTab()} tab=${legacyPanelQuery.tab} view=${legacyPanelQuery.view} panel=${legacyPanelQuery.panel}`,
);
// ⚠️ 本组结束时页面停在资产段·积分面板；下方「印象段」用例以 clickSeg('印象') 接力，基线不受影响。

// 印象段：原论坛第 7 席，2026-10-01 搬入我页第三分段
await clickSeg('印象');
let impressionsOk = false;
try {
  await page.waitForSelector('.content-impressions-host .profile-page-content > *', {
    timeout: 20000,
  });
  impressionsOk = true;
} catch {}
check('切印象段 → 印象面板挂载（我页第三分段）', impressionsOk);
await page.screenshot({ path: 'debug-screenshots/ia-content-impressions.png' });

// ---------- 6. 消息 tab：只剩通知收件箱（AI 段已移出为底栏全屏席） ----------
await clickNav('消息');
await page.waitForTimeout(900);
const msgState = await page.evaluate(() => {
  const msgTabs = Array.from(document.querySelectorAll('.tab-page.messages-tab > .segment-tabs'));
  const host = document.querySelector('.messages-host');
  const list = document.querySelector('.x-notifications-container');
  return {
    pageLevelTabs: msgTabs.length,
    hostChildren: host ? host.children.length : 0,
    aiHost: !!document.querySelector('.messages-tab .ai-host'),
    listTop: list ? Math.round(list.getBoundingClientRect().top) : -1,
  };
});
check(
  '消息 tab 无页级页签（AI 段已移出）',
  msgState.pageLevelTabs === 0,
  `tabs=${msgState.pageLevelTabs}`,
);
check('消息 tab 无 AI 宿主（AI 走底栏全屏席 /ai-chat）', !msgState.aiHost);
check('消息宿主挂载（通知收件箱）', msgState.hostChildren > 0, `children=${msgState.hostChildren}`);
check(
  '消息列表顶部空隙收紧（top ≤ 96px）',
  msgState.listTop >= 0 && msgState.listTop <= 96,
  `top=${msgState.listTop}px`,
);
await page.screenshot({ path: 'debug-screenshots/ia-messages.png' });

// ---------- 6b. 一键已读底部操作栏 ----------
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.x-mark-all-btn-minimal')).find(
    (b) => b.textContent.trim() === '选择',
  );
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
    disabled: primary ? primary.disabled : true,
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

// ---------- 7. 设置：经 ?tab=settings 直达（不再是底栏席，高亮落「我」） ----------
await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
let settingsPanelOk = false;
try {
  await page.waitForSelector('.settings-shell .profile-page-content > *:not(.login-prompt)', {
    timeout: 9000,
  });
  settingsPanelOk = true;
} catch {}
check('设置直达 + 面板渲染（?tab=settings）', settingsPanelOk);
check('设置 tab 底栏高亮落「我」（设置已降为资料卡入口）', (await activeTab()) === '我');
const gsState = await page.evaluate(() => {
  // iOS 式分组骨架（2026-09-30）：.glass-settings 只是透明 flex 容器，
  // 玻璃材质（backdrop-filter / 圆角）在卡片本体 .gs-rows 上
  const containers = document.querySelectorAll('.settings-shell .glass-settings');
  const cards = document.querySelectorAll('.settings-shell .gs-rows');
  const card = cards[0];
  return {
    count: containers.length,
    cards: cards.length,
    rows: document.querySelectorAll('.settings-shell .gs-row').length,
    glass: card
      ? (getComputedStyle(card).backdropFilter ||
          getComputedStyle(card).webkitBackdropFilter ||
          'none') !== 'none'
      : false,
    radius: card ? getComputedStyle(card).borderRadius : '',
  };
});
check('设置单一玻璃容器（iOS 分组骨架）', gsState.count === 1, `count=${gsState.count}`);
check('设置分组卡片就位（≥4 组）', gsState.cards >= 4, `cards=${gsState.cards}`);
check('设置行数完整（≥9 行）', gsState.rows >= 9, `rows=${gsState.rows}`);
check(
  '设置分组卡片液态玻璃生效（backdrop-filter 非 none）',
  gsState.glass,
  `radius=${gsState.radius}`,
);
await page.screenshot({ path: 'debug-screenshots/ia-settings.png' });

// ---------- 8. 旧 URL 兼容 ----------
await page.goto(`${BASE}/#/user-space?tab=profile`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
await page.waitForTimeout(1100);
check('旧 ?tab=profile 落在我 tab', (await activeTab()) === '我');

await page.goto(`${BASE}/#/user-space/posts`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await page.waitForTimeout(1100);
check('旧 /user-space/posts 重定向到内容 tab（论坛语义）', (await activeTab()) === '内容');

// 旧深链 ?tab=assets：tab 回落 posts、分段落「资产」；URL 被 setSectionRoute 回写为
// tab=posts&view=assets（分段值必须进 URL，否则刷新即丢失）。
// ⚠️ 必须**冷加载**验证：rawRequestedTab 是 setup 期常量，hash 导航（同文档）不会重算它，
// 只有全新文档加载才会走到 resolveSectionFromRoute 的 assets 回落分支。
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
let deepAssetsOk = false;
try {
  await page.waitForSelector('.content-assets-host .profile-page-content > *:not(.login-prompt)', {
    timeout: 20000,
  });
  deepAssetsOk = true;
} catch {}
const deepAssetsUrl = await page.evaluate(() => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  return { tab: q.get('tab'), view: q.get('view') };
});
check(
  '旧 ?tab=assets 深链落我页资产段（URL 回写 tab=posts&view=assets）',
  deepAssetsOk &&
    (await activeTab()) === '我' &&
    deepAssetsUrl.tab === 'posts' &&
    deepAssetsUrl.view === 'assets',
  `panel=${deepAssetsOk} active=${await activeTab()} tab=${deepAssetsUrl.tab} view=${deepAssetsUrl.view}`,
);

// ---------- 8b. AI 席：跨模块全屏落点 ----------
await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
await clickNav('AI');
let aiNavigated = false;
try {
  await page.waitForFunction(() => location.hash.startsWith('#/ai-chat'), null, { timeout: 20000 });
  aiNavigated = true;
} catch {}
check('底栏 AI 席 → 全屏 /ai-chat 跨模块导航', aiNavigated);

// ---------- 9. 暗色页签 ----------
const darkPage = await context.newPage();
const darkErrors = [];
darkPage.on('pageerror', (e) => darkErrors.push(String(e.message).slice(0, 160)));
await darkPage.addInitScript(() => {
  try {
    localStorage.setItem('boh-theme', 'dark');
  } catch {}
});
await darkPage.setViewportSize({ width: 390, height: 844 });
await darkPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await darkPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
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
    indicatorBg: indicator ? getComputedStyle(indicator).backgroundColor : 'MISSING',
  };
});
check('暗色页签存在', darkSeg.exists);
check('暗色页签无底色（随页面滚动）', darkSeg.tabsBg === 'rgba(0, 0, 0, 0)', darkSeg.tabsBg);
check('暗色当前项文字亮色', darkSeg.activeColor === 'rgb(245, 245, 247)', darkSeg.activeColor);
check(
  '暗色指示条 = 文字色（黑条暗色反白）',
  darkSeg.indicatorBg === 'rgb(245, 245, 247)',
  darkSeg.indicatorBg,
);
// 竖屏必须保持现状：左栏是横屏专用层，不得在竖屏出现（display:none）
const darkLayout = await darkPage.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const bar = document.querySelector('.bottom-nav-glass');
  const shell = document.querySelector('.tab-page');
  return {
    railHidden: !rail || getComputedStyle(rail).display === 'none',
    barShown: bar ? getComputedStyle(bar).display !== 'none' : false,
    left: shell ? Math.round(shell.getBoundingClientRect().left) : -1,
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
await mlandPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
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
    innerWidth: window.innerWidth,
  };
});
check('手机横屏（844×420）不进分栏：左栏隐藏', mlandLayout.railHidden);
check('手机横屏保持底栏可见', mlandLayout.barShown);
check(
  '手机横屏内容区未让位（left=0 且全宽）',
  mlandLayout.left === 0 && mlandLayout.width === mlandLayout.innerWidth,
  `left=${mlandLayout.left} width=${mlandLayout.width} inner=${mlandLayout.innerWidth}`,
);
await mlandPage.screenshot({ path: 'debug-screenshots/ia-mobile-landscape-unchanged.png' });
await mlandPage.close();

// ---------- 10. 横屏全宽 ----------
const landPage = await context.newPage();
const landErrors = [];
landPage.on('pageerror', (e) => landErrors.push(String(e.message).slice(0, 160)));
await landPage.setViewportSize({ width: 1180, height: 720 });
await landPage.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
await landPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(landPage);
await landPage.waitForTimeout(1200);
// 左栏与底栏共用同一份 navItems（src/config/bottom-nav.ts）：点 data-tab 比文案稳
await safeClick(landPage, '.userspace-rail-item[data-tab="posts"]');
await landPage.waitForTimeout(1100);
const landState = await landPage.evaluate(() => {
  const pc = document.querySelector('.content-home-host .profile-page-content');
  const shell = document.querySelector('.tab-page.content-shell');
  if (!pc || !shell) return { pcMax: 'MISSING', usage: 0 };
  return {
    pcMax: getComputedStyle(pc).maxWidth,
    usage: Math.round(
      (pc.getBoundingClientRect().width / shell.getBoundingClientRect().width) * 100,
    ),
  };
});
check(
  '横屏身份卡全宽（max-width 解除）',
  landState.pcMax === '100%',
  `max-width=${landState.pcMax}`,
);
check('横屏内容宽度占用 ≥95%', landState.usage >= 95, `${landState.usage}%`);

// 横屏左右分栏（1180×720 落在 1024–1279 → 88px 图标栏）
const landRail = await landPage.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const bar = document.querySelector('.bottom-nav-glass');
  // 让位/间距一律量**当前可见**的 tab-page：不可见的 tab-page rect 全 0（旧探针在这里
  // 读到 display:none 的 content-shell，left=0 假红三条）
  const shell = Array.from(document.querySelectorAll('.tab-page')).find(
    (el) => el.offsetParent !== null,
  );
  const railRect = rail ? rail.getBoundingClientRect() : null;
  const navH = Math.ceil(
    document.getElementById('unified-nav-container')?.getBoundingClientRect().height || 0,
  );
  return {
    railDisplay: rail ? getComputedStyle(rail).display : 'ABSENT',
    railW: railRect ? Math.round(railRect.width) : -1,
    railPadTop: rail ? Math.round(parseFloat(getComputedStyle(rail).paddingTop)) : -1,
    railBackdrop: rail
      ? getComputedStyle(rail).backdropFilter ||
        getComputedStyle(rail).webkitBackdropFilter ||
        'none'
      : 'ABSENT',
    barDisplay: bar ? getComputedStyle(bar).display : 'ABSENT',
    left: shell ? Math.round(shell.getBoundingClientRect().left) : -1,
    width: shell ? Math.round(shell.getBoundingClientRect().width) : -1,
    innerWidth: window.innerWidth,
    // 视觉间距 = 内容实际起点（含容器 padding-left）− 左栏右边缘
    gutter: (() => {
      const content = document.querySelector('.content-home-host .profile-page-content');
      if (!content || !railRect) return -1;
      const cs = getComputedStyle(content);
      return Math.round(
        content.getBoundingClientRect().left + parseFloat(cs.paddingLeft) - railRect.right,
      );
    })(),
    navH,
    theme: document.documentElement.getAttribute('data-theme') || 'light',
    indicatorBg: (() => {
      const el = document.querySelector('.userspace-rail-indicator');
      if (!el) return 'ABSENT';
      const cs = getComputedStyle(el);
      return cs.backgroundColor;
    })(),
  };
});
check('横屏左栏可见（电脑 / 平板横屏）', landRail.railDisplay === 'flex', landRail.railDisplay);
check('横屏底栏已隐藏', landRail.barDisplay === 'none', landRail.barDisplay);
check('左栏宽度 = 88px（1024–1279 档）', landRail.railW === 88, `${landRail.railW}px`);
check('右区让位：left = 88px', landRail.left === 88, `left=${landRail.left}`);
check(
  '右区宽度 = 视口 − 左栏',
  landRail.width === landRail.innerWidth - 88,
  `width=${landRail.width} inner=${landRail.innerWidth}`,
);
check(
  '左栏顶隙吃导航岛实测高度（不被浮岛压住）',
  landRail.railPadTop >= landRail.navH,
  `padTop=${landRail.railPadTop} navH=${landRail.navH}`,
);
// 浓度在 plans/011 里从 0.045/0.08 提到 0.075/0.12：
// 原浓度在玻璃底上读不出「选中」，只能靠文字加粗兜底；超过 0.10 又会读成禁用态
check(
  '选中指示胶囊淡染浓度（亮 .075 / 暗 .12）',
  landRail.theme === 'dark'
    ? /rgba\(255, 255, 255, 0\.12\)/.test(landRail.indicatorBg)
    : /rgba\(15, 23, 42, 0\.075\)/.test(landRail.indicatorBg),
  `${landRail.theme} ${landRail.indicatorBg}`,
);
check(
  '左栏材质为液态玻璃（backdrop-filter 非 none）',
  landRail.railDisplay !== 'ABSENT' && landRail.railBackdrop !== 'none',
  landRail.railBackdrop,
);
check('内容与左栏有呼吸间距（≥20px）', landRail.gutter >= 20, `gutter=${landRail.gutter}px`);
await landPage.screenshot({ path: 'debug-screenshots/ia-landscape-fullwidth.png' });
// ---------- 10c. 横屏左栏按钮组 ----------
const railButtons = await landPage.evaluate(() => ({
  // 四席 = 内容/消息/AI/我（src/config/bottom-nav.ts，2026-09-30 收敛）
  main: document.querySelectorAll('.userspace-rail-group [data-tab]').length,
  actions: Array.from(document.querySelectorAll('[data-rail-action]')).map(
    (el) => el.dataset.railAction,
  ),
}));
check('左栏主导航 4 项（内容/消息/AI/我）', railButtons.main === 4, `main=${railButtons.main}`);
check(
  '左栏便捷组齐全（发布/搜索）',
  ['compose', 'search'].every((id) => railButtons.actions.includes(id)),
  railButtons.actions.join(','),
);
check(
  '左栏不含「通知」（与消息 tab 的 inbox 分区重复，已删）',
  !railButtons.actions.includes('notifications'),
  railButtons.actions.join(','),
);
check(
  '左栏工具组收敛为「首页」（主题/退出登录已移入更多菜单）',
  railButtons.actions.includes('home') && !railButtons.actions.includes('logout'),
  railButtons.actions.join(','),
);

// 「更多」菜单：承载主题 / 退出登录（破坏性操作不再占一级权重）
await safeClick(landPage, '.userspace-rail-more');
let railMenuItems = [];
let railMenuOpened = false;
try {
  await landPage.waitForSelector('.userspace-rail-menu', { timeout: 4000 });
  railMenuOpened = true;
  railMenuItems = await landPage.evaluate(() =>
    Array.from(document.querySelectorAll('.userspace-rail-menu-item')).map(
      (el) => el.dataset.railAction,
    ),
  );
} catch {}
check(
  '「更多」菜单可打开且含 主题 / 退出登录',
  railMenuOpened && ['theme', 'logout'].every((id) => railMenuItems.includes(id)),
  railMenuItems.join(','),
);

// 主题 → 弹窗（入口已从一级导航挪进菜单）
await safeClick(landPage, '.userspace-rail-menu-item[data-rail-action="theme"]');
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
      h: Math.round(r.height),
    };
  });
  check(
    '主题弹窗样式就绪（overlay 为 fixed 且卡片居中出现）',
    themeModalState.pos === 'fixed' && themeModalState.dx < 80 && themeModalState.h > 200,
    `pos=${themeModalState.pos} z=${themeModalState.z} dx=${themeModalState.dx} h=${themeModalState.h}`,
  );
}
if (themeOpened) {
  await safeClick(landPage, '.theme-modal-card .primary-btn-clean').catch(() => {});
  await landPage.waitForTimeout(500);
}

// 发布 → 右区发布会话（路径 B：复用论坛 openMobileComposer）
// 记发布前左栏首项位置：用于断言「开发布会话时左栏不上移/不跳变」
const railBeforeCompose = await landPage.evaluate(() => {
  const item = document.querySelector('.userspace-rail-item');
  return item ? Math.round(item.getBoundingClientRect().y) : -1;
});
await safeClick(landPage, '[data-rail-action="compose"]');
let composerOpened = false;
try {
  await landPage.waitForSelector('.mobile-composer-overlay', { timeout: 12000 });
  composerOpened = true;
} catch {}
check('点「发布」打开发布会话（自动切回内容 tab）', composerOpened);
if (composerOpened) {
  await landPage.waitForTimeout(600);
  const composerState = await landPage.evaluate(() => {
    const overlay = document.querySelector('.mobile-composer-overlay');
    const rail = document.querySelector('.userspace-rail');
    const section = document.querySelector('.mobile-composer-section');
    const checkin = document.querySelector('.weekly-checkin-panel');
    const embeddedComposer = document.querySelector(
      '.forum-page.embedded-mode .forum-left-column > .post-creation-section',
    );
    const o = overlay ? overlay.getBoundingClientRect() : null;
    const s = section ? section.getBoundingClientRect() : null;
    const railItem = document.querySelector('.userspace-rail-item');
    const mobileTools = document.querySelector('.mobile-post-image-toolbar');
    const scrollBox = document.querySelector('.mobile-composer-scroll');
    // 会话内那个「＋ 添加图片」大方框（不是内嵌编辑器里的同名实例）
    const addMore = Array.from(document.querySelectorAll('.post-image-add-more-card')).find((el) =>
      el.closest('.mobile-composer-overlay'),
    );
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
      embeddedComposerDisplay: embeddedComposer
        ? getComputedStyle(embeddedComposer).display
        : 'ABSENT',
    };
  });
  check(
    '发布会话只覆盖右区（left = 左栏宽）',
    composerState.overlayLeft === 88,
    `left=${composerState.overlayLeft}`,
  );
  check(
    '发布会话宽度 = 视口 − 左栏',
    composerState.overlayW === composerState.innerWidth - 88,
    `w=${composerState.overlayW} vw=${composerState.innerWidth}`,
  );
  check('发布态左栏仍可见', composerState.railVisible);
  check(
    '发布会话全宽铺满右区（不限宽居中）',
    composerState.sectionW === composerState.overlayW,
    `section=${composerState.sectionW} overlay=${composerState.overlayW}`,
  );
  // 负向断言统一口径：元素「不存在」与「display:none」都算已移除（并发迭代中两种形态都出现过）
  const removed = (v) => v === 'none' || v === 'ABSENT';
  check(
    '会话内已移除移动端工具横条（标签只剩一套）',
    removed(composerState.mobileToolsDisplay),
    composerState.mobileToolsDisplay,
  );
  check(
    '开发布会话时左栏不上移（前后位置一致）',
    composerState.railFirstItemY === railBeforeCompose,
    `before=${railBeforeCompose} after=${composerState.railFirstItemY}`,
  );
  check(
    '发布会话内已移除周签到面板',
    removed(composerState.checkinDisplay),
    composerState.checkinDisplay,
  );
  check(
    '社区内嵌发帖编辑器已删除（发布会话取代）',
    removed(composerState.embeddedComposerDisplay),
    composerState.embeddedComposerDisplay,
  );
  // 用户要求：发帖页不要「整个界面滚动」→ 会话层不滚（顶栏钉住），只有内容区自己滚
  check(
    '发布会话整页不滚动（仅内容区滚动）',
    composerState.overlayOverflow === 'hidden' && composerState.scrollOverflowY === 'auto',
    `overlayOverflow=${composerState.overlayOverflow} scrollOverflowY=${composerState.scrollOverflowY}`,
  );
  // 「＋ 添加图片」大方框在横屏桌面隐藏（工具条已有 0/6 图片入口）。
  // 竖屏/窄屏仍保留 —— 由 composer.css 的取反媒体查询保证，这里锁横屏这一侧
  check(
    '发布会话内不显示「＋ 添加图片」大方框（横屏去重）',
    removed(composerState.addMoreDisplay),
    composerState.addMoreDisplay,
  );
  await landPage.screenshot({ path: 'debug-screenshots/ia-landscape-composer.png' });

  // 发布会话被 Teleport 到 body，切 tab 不会自动收起 → 点左栏其它 tab 必须先关掉它
  await safeClick(landPage, '.userspace-rail-item[data-tab="posts"]');
  let composerDismissed = false;
  try {
    await landPage.waitForFunction(
      () => !document.querySelector('.mobile-composer-overlay'),
      null,
      { timeout: 8000 },
    );
    composerDismissed = true;
  } catch {}
  check('发布态点左栏其它 tab → 会话自动收起', composerDismissed);
  await landPage.waitForTimeout(700);
}

// 搜索 → 聚焦论坛工具栏搜索框
await safeClick(landPage, '[data-rail-action="search"]');
let searchFocused = false;
try {
  await landPage.waitForFunction(
    () => document.activeElement?.classList?.contains('toolbar-search-input'),
    null,
    { timeout: 12000 },
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
  const shell = Array.from(document.querySelectorAll('.tab-page')).find(
    (el) => el.offsetParent !== null,
  );
  const sr = shell ? shell.getBoundingClientRect() : null;
  return {
    h: Math.round(r.height),
    w: Math.round(r.width),
    textAlign: cs.textAlign,
    leftGap: sr ? Math.round(r.left - sr.left) : -1,
  };
});
check('横屏搜索框已加高（≥48px）', !!landSearch && landSearch.h >= 48, `h=${landSearch?.h}`);
check(
  '横屏搜索框提示文字左对齐（对齐融合容器参考图）',
  landSearch?.textAlign === 'left',
  `text-align=${landSearch?.textAlign}`,
);
check(
  '横屏搜索框跨栏独占一行（远宽于单栏）',
  !!landSearch && landSearch.w >= 700,
  `w=${landSearch?.w}`,
);
check(
  '横屏搜索框不与左栏贴边',
  !!landSearch && landSearch.leftGap >= 20,
  `leftGap=${landSearch?.leftGap}`,
);

check('零 pageerror（横屏页）', landErrors.length === 0, landErrors.join(' | ').slice(0, 120));
await landPage.close();

// ---------- 10b. 横屏/桌面宽度：一键已读操作栏必现 ----------
const landBar = await context.newPage();
await landBar.setViewportSize({ width: 1180, height: 820 });
await landBar.goto(`${BASE}/#/user-space?tab=messages`, { waitUntil: 'domcontentloaded' });
await landBar.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(landBar);
let selBtn2 = null;
try {
  selBtn2 = await landBar.waitForSelector('.x-header-minimal .x-mark-all-btn-minimal', {
    timeout: 10000,
  });
} catch {}
if (selBtn2) {
  // 与竖屏 §6b 同口径：走 DOM click 而非 Playwright 动作 click ——
  // 横屏下该按钮可能被灵动岛/浮层短暂遮住，动作 click 会卡在 actionability 超时
  await landBar
    .evaluate(() => {
      const btn = Array.from(
        document.querySelectorAll('.x-header-minimal .x-mark-all-btn-minimal'),
      ).find((b) => b.textContent.trim() === '选择');
      btn?.click();
    })
    .catch(() => {});
}
await landBar.waitForTimeout(600);
const landBarPre = await landBar.evaluate(() => ({
  header: !!document.querySelector('.x-header-minimal'),
  btns: Array.from(document.querySelectorAll('.x-mark-all-btn-minimal')).map((b) =>
    b.textContent.trim(),
  ),
  loggedIn: (() => {
    try {
      return document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value
        .auth.isLoggedIn;
    } catch {
      return '?';
    }
  })(),
}));
console.log('  [10b pre]', JSON.stringify(landBarPre));
const landBarState = await landBar.evaluate(() => {
  const bar = document.querySelector('.x-select-action-bar');
  const inline = document.querySelector('.x-filter-actions-desktop-minimal');
  return {
    bar: bar ? getComputedStyle(bar).display : 'ABSENT',
    primary: bar?.querySelector('.x-sab-primary')?.textContent.trim() || 'MISSING',
    inline: inline ? getComputedStyle(inline).display : 'ABSENT',
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
await deskPage.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
// 固定 sleep 不够稳：index.html 内联骨架构到 Vue mount 才清，路由 chunk 之后再到位，
// 1400ms 时页面可能还停在「正在加载…」。改成条件等待（同 tabsCleared 的教训）
let deskTabsReady = false;
try {
  await deskPage.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.segment-tabs')).some((t) => t.offsetParent !== null),
    null,
    { timeout: 15000 },
  );
  deskTabsReady = true;
} catch {}
const deskTabs = await deskPage.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.segment-tabs')).find(
    (t) => t.offsetParent !== null,
  );
  if (!tabs) return { w: 0, centered: false, ref: -1 };
  const btns = Array.from(tabs.querySelectorAll('.segment-tab')).map((b) =>
    b.getBoundingClientRect(),
  );
  const left = Math.min(...btns.map((r) => r.left));
  const right = Math.max(...btns.map((r) => r.right));
  const groupW = Math.round(right - left);
  const center = (left + right) / 2;
  // 基准 = 可见 tab-page 的中心：横屏分栏后它是右区中心，未分栏时等于窗口中心
  const shell =
    Array.from(document.querySelectorAll('.tab-page')).find((el) => el.offsetParent !== null) ||
    document.querySelector('.user-space-page');
  const rect = shell.getBoundingClientRect();
  const ref = rect.left + rect.width / 2;
  return { w: groupW, centered: Math.abs(center - ref) < 40, ref: Math.round(ref) };
});
check(
  '桌面页签文字组居中（基准 = 内容区中心）',
  deskTabsReady && deskTabs.w > 0 && deskTabs.w < 420 && deskTabs.centered,
  `ready=${deskTabsReady} groupW=${deskTabs.w}px centered=${deskTabs.centered} ref=${deskTabs.ref}`,
);
await deskPage.screenshot({ path: 'debug-screenshots/ia-desktop-seg-tabs.png' });
await deskPage.close();

// ---------- 汇总 ----------
check('零 pageerror（明色主流程）', errors.length === 0, errors.join(' | ').slice(0, 120));

console.log(results.join('\n'));
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
