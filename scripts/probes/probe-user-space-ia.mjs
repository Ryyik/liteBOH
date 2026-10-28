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
  // auth 异步初始化可能晚于注入把状态洗回未登录——重试锚定。
  // ⚠️ 单次 450ms 读回**不够**：supabase 的 checkAuth 落地时机不保证，实测
  // 注入后 450ms 读回 true、再晚一点被洗回 false。冷加载深链用例的表现就是
  // 「tab / panel 都对，但页面停在 login-prompt，资产面板根本不挂载（view=NONE）」。
  // 所以要求**连续两次**读回 true 才认账。
  let stable = 0;
  for (let i = 0; i < 8; i += 1) {
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
    stable = stillIn ? stable + 1 : 0;
    if (stable >= 2) break;
  }
  if (stable >= 2) {
    // 已稳定登录：等真实根元素出现即可返回（后面的补锚定循环仍保留作兜底）
    await p
      .waitForFunction(() => !!document.querySelector('.user-space-page'), null, { timeout: 20000 })
      .catch(() => {});
    const survived = await p
      .evaluate(() => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return !!pinia && pinia.state.value.auth.isLoggedIn === true;
      })
      .catch(() => false);
    if (survived) return;
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

/**
 * 「等登录后才有的元素 / 补注入」交替循环。
 *
 * 为什么需要：冷加载用例的流程是 `goto → 注入登录 → 等面板挂载`。但 dev server
 * 里别的 agent 正在改 src 时，vite 偶发模块失败会命中 index.html 内联的 recovery
 * 分支（带 ?forceUpdate=true 重定向）→ **整页重载、注入的登录态清零**。
 * 那时单纯 waitForSelector 只能干等到超时，报出来的是「面板没挂载」，
 * 看起来像资产页坏了，实际是探针自保没做好 —— 归因成本极高。
 * 这里把两者交替：等 1.2s 不到就补一次注入，直到总超时。找到就立刻返回。
 */
const waitForAuthed = async (targetPage, selector, timeoutMs = 20000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await targetPage.waitForSelector(selector, { timeout: 1200 });
      return true;
    } catch {
      await targetPage
        .evaluate(() => {
          const pinia =
            document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
          const auth = pinia?.state?.value?.auth;
          if (!auth) return;
          auth.isLoggedIn = true;
          if (!auth.userInfo) {
            auth.userInfo = {
              id: 'probe-ia-user',
              username: 'probe_rui',
              role: 'user',
              points: 1024,
            };
          }
        })
        .catch(() => {});
    }
  }
  return false;
};
const ASSETS_READY = '.content-assets-host .profile-page-content > *:not(.login-prompt)';

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
// ⚠️ 已删 `waitForSeg`：它等的是「我」页那套 空间/资产/印象 段控，
// 段控随 2026-10-26 IA 合并整体退场后本探针不再需要它。
// 论坛的六席页签仍用 clickSeg + 下面这个 segState 逐条断言。
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
  '底栏五席文案（内容/消息/AI/图库/我）',
  JSON.stringify(labels) === JSON.stringify(['内容', '消息', 'AI', '图库', '我']),
  labels.join('/'),
);
check('内容 tab 为默认激活', (await activeTab()) === '内容');

let seg = await segState();
// 五席文案（2026-10-22）：「新闻」「活动」两席合并为「资讯」跳转入口，
// 见 ForumSectionShell 的 sectionTabs —— 注意它会**过滤掉** FORUM_SECTION_ITEMS 里的 news/activity，
// 所以这里不能直接拿 FORUM_SECTION_ITEMS 当期望值。
check(
  '论坛文字页签五席（官方/最新/关注/资讯/成员）',
  seg.exists &&
    JSON.stringify(seg.labels) === JSON.stringify(['官方', '最新', '关注', '资讯', '成员']),
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
// FAB 归属：内嵌发帖器已废弃，FAB 是 feed 页唯一常驻发帖入口。
const fabState = await page.evaluate(() => {
  const fab = document.querySelector('.mobile-compose-fab.embedded-compose-fab');
  if (!fab) return { exists: false, visible: false, hit: null, hitSelf: false };
  const cs = getComputedStyle(fab);
  const rect = fab.getBoundingClientRect();
  const visible =
    cs.display !== 'none' && cs.visibility !== 'hidden' && fab.getClientRects().length > 0;
  // 遮挡检测：底栏/浮层盖住的话「看得见」也点不到（FAB 是 Teleport 到 body 的 fixed 元素）
  const hitEl = visible
    ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    : null;
  return {
    exists: true,
    visible,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width) },
    hit: hitEl ? String(hitEl.className || hitEl.tagName) : null,
    // 命中 FAB 内部的 <span>+</span> 也算命中自身
    hitSelf: Boolean(hitEl && hitEl.closest('.mobile-compose-fab')),
  };
});
check(
  'UserSpace 内容 tab 竖屏挂载发帖 FAB（竖屏唯一发帖入口）',
  fabState.exists && fabState.visible,
  JSON.stringify(fabState),
);
check('发帖 FAB 未被底栏/浮层遮挡（命中自身）', fabState.hitSelf, `hit=${fabState.hit}`);
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

// ---------- 4. 我 tab：单一主页（2026-10-26 起无分段）+ 资产独立 tab ----------
// ⚠️ 本段原先锁「我页三段（空间/资产/印象）」与段控几何。2026-10-26 的 IA 重做把
// 资产提升为**独立 tab**、我页收成单一主页（ProfileHomePanel），段控与
// `.profile-service-row` 均已不存在 —— 断言改为锁新结构，别把旧结构写回来。
await clickNav('我');
await page.waitForTimeout(1200);
const mineState = await page.evaluate(() => {
  const visibleSegs = Array.from(document.querySelectorAll('.segment-tabs')).filter(
    (t) => t.offsetParent !== null,
  );
  return {
    homeShell: !!document.querySelector('.content-home-host .profile-home-shell'),
    segGroups: visibleSegs.map((t) =>
      Array.from(t.querySelectorAll('.segment-tab')).map((b) => b.textContent.trim()),
    ),
  };
});
check(
  '我 tab 渲染单一主页（不再有空间/资产/印象段控）',
  mineState.homeShell && mineState.segGroups.length === 0,
  `home=${mineState.homeShell} segs=${JSON.stringify(mineState.segGroups)}`,
);
check(
  '资产不在底栏席（独立 tab，靠入口与深链进入）',
  !(await navLabels()).includes('资产'),
  `nav=${(await navLabels()).join('/')}`,
);
check('资产段底栏高亮仍落「我」', (await activeTab()) === '我');
const contentGap = await page.evaluate(() => {
  const host = document.querySelector('.content-home-host');
  if (!host) return -1;
  return parseFloat(getComputedStyle(host).paddingTop);
});
check('空间档页签下间距收紧（≤16px）', contentGap >= 0 && contentGap <= 16, `pt=${contentGap}px`);

// 资产页：独立 tab（?tab=assets），宿主 = .content-assets-host
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
const assetsPanelOk = await waitForAuthed(page, ASSETS_READY, 25000);
await page.waitForTimeout(800);
const assetsState = await page.evaluate(() => ({
  // 2026-10-26 IA 合并后资产是**独立 tab**（currentTab === 'assets'，有自己的
  // .tab-page.assets-shell），不再是「我」页里的 embedded 分段 ——
  // 旧断言锁的 `!standaloneAssetsTab` 正好和现状相反，已按新结构改成正向断言。
  standaloneAssetsTab: !!document.querySelector('.tab-page.assets-shell'),
  pageSegLabels: Array.from(document.querySelectorAll('.tab-page > .segment-tabs'))
    .filter((t) => t.offsetParent !== null)
    .map((t) => Array.from(t.querySelectorAll('.segment-tab')).map((b) => b.textContent.trim())),
}));
check(
  '?tab=assets 落独立资产 tab（有自己的 tab-page 壳，且无页级段控）',
  assetsPanelOk && assetsState.standaloneAssetsTab && assetsState.pageSegLabels.length === 0,
  `panel=${assetsPanelOk} standalone=${assetsState.standaloneAssetsTab} pageSegs=${JSON.stringify(assetsState.pageSegLabels)}`,
);

/* ---------- 4a. 资产页结构：一屏首页 + 三个二级页（2026-10-26 重做） ----------
   ⚠️ 旧断言锁的是七段页签（`.ah-segment-tabs .segment-tab.active`）与「切页签 → ?panel=」，
   那套 DOM 已随重做整体删除（概览 / 抽奖 / 赞助 / 订阅四个页签并入首页）。
   新结构：
     · 首页 = `.ah-home` 下四张 `.ah-panel`（钱包 / 会员 / 装扮 / 待办）+ 一行外链；
     · 二级页 = `.ah-subpage` + `.ah-subpage-bar`（返回条 + 标题）；
     · 视图值域 home / decor / orders / points，二级页**不跳路由**。 */
const assetsView = () =>
  page.evaluate(() => {
    if (document.querySelector('.ah-home')) return 'home';
    if (document.querySelector('.ah-decor')) return 'decor';
    if (document.querySelector('.ah-fulfillment-section')) return 'orders';
    if (document.querySelector('.ah-points-subpage')) return 'points';
    return 'NONE';
  });
const homeCardCount = () =>
  page.evaluate(() => document.querySelectorAll('.ah-home .ah-panel').length);
const backBarVisible = () =>
  page.evaluate(() => {
    const bar = document.querySelector('.ah-subpage-bar');
    return !!bar && bar.offsetParent !== null;
  });
check(
  '资产首页：四张卡 + 不出现二级页壳（默认档）',
  (await assetsView()) === 'home' && (await homeCardCount()) === 4 && !(await backBarVisible()),
  `view=${await assetsView()} cards=${await homeCardCount()} backBar=${await backBarVisible()}`,
);

/* 顶部避让（用户明确要求「避开顶部导航栏」）：
   摘要条必须整个落在导航岛（.unified-nav-surface，fixed）下沿之外。
   只量「岛下沿 ≤ 摘要条上沿」，不量固定像素 —— 岛高度随状态卡变、也随断点变。 */
const navClearance = async () => {
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const surface = document.querySelector('.unified-nav-surface');
    const summary = document.querySelector('.ah-summary');
    if (!surface || !summary) return { ok: false, reason: 'missing' };
    const s = surface.getBoundingClientRect();
    const a = summary.getBoundingClientRect();
    return {
      ok: a.top >= s.bottom,
      navBottom: Math.round(s.bottom),
      summaryTop: Math.round(a.top),
      gap: Math.round(a.top - s.bottom),
    };
  });
};
const clearance = await navClearance();
check(
  '资产首页不被顶部导航岛遮挡（摘要条在岛下沿之外）',
  clearance.ok,
  `navBottom=${clearance.navBottom} summaryTop=${clearance.summaryTop} gap=${clearance.gap}`,
);
await page.screenshot({ path: 'debug-screenshots/ia-content-assets.png' });

// ---------- 4b. 资产内层进 URL（?panel=） ----------
// 视图值域真源 = AssetsHubPanel 的 VIEW_IDS + LEGACY_VIEW_MAP；URL 写入唯一出口 =
// 组件 view-change → 宿主。覆盖：入口写 URL / 返回条清除 / 切走清除 / 深链与旧值。
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
const clickIn = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.click();
    return !!el;
  }, selector);

// A. 摘要条余额 → 积分明细（原先要先进「积分」页签，现在余额本身就是入口）
const pointsEntryClicked = await clickIn('.ah-summary-points');
const pointsPanelOk = await waitForPanel('points');
await page.waitForTimeout(400);
check(
  '摘要条余额 → 积分明细（?panel=points，二级页出返回条）',
  pointsEntryClicked &&
    pointsPanelOk &&
    (await assetsView()) === 'points' &&
    (await backBarVisible()),
  `clicked=${pointsEntryClicked} view=${await assetsView()} panel=${(await readPanelQuery()).panel} backBar=${await backBarVisible()}`,
);

// B. 返回条「资产」→ 回首页，panel 从 URL 移除（默认档省略）
const backClicked = await clickIn('.ah-subpage-bar .ah-back');
const panelCleared = await waitForPanel('');
await page.waitForTimeout(400);
check(
  '二级页返回条 → 回首页且 URL 移除 panel（默认档省略）',
  backClicked && panelCleared && (await assetsView()) === 'home',
  `clicked=${backClicked} view=${await assetsView()} panel=${(await readPanelQuery()).panel}`,
);

// C. 装扮卡「换装」→ 装扮二级页
const decorClicked = await clickIn('.ah-decor-card .ah-btn');
const decorPanelOk = await waitForPanel('decor');
await page.waitForTimeout(400);
check(
  '首页装扮卡「换装」→ 装扮二级页（?panel=decor）',
  decorClicked && decorPanelOk && (await assetsView()) === 'decor',
  `clicked=${decorClicked} view=${await assetsView()} panel=${(await readPanelQuery()).panel}`,
);
// 回到首页，供后续用例从同一个基线出发
await clickIn('.ah-subpage-bar .ah-back');
await waitForPanel('');
await page.waitForTimeout(400);

// D. 切到「内容」tab → panel 清除；再回资产 → 归默认首页（不保留上次视图）
await clickNav('内容');
await page.waitForTimeout(900);
check('切离资产 tab → URL 移除 panel', String((await readPanelQuery()).panel || '') === '');
await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
await page.waitForSelector('.ah-page', { timeout: 20000 });
await page.waitForTimeout(900);
check('回到资产 → 视图归默认首页', (await assetsView()) === 'home', `view=${await assetsView()}`);

// E. 冷加载深链 ?panel=decor 直达装扮二级页
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets&panel=decor`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
const deepPanelOk = await waitForAuthed(page, ASSETS_READY, 25000);
await page.waitForTimeout(900);
check(
  '冷加载 ?tab=assets&panel=decor 直达装扮二级页',
  deepPanelOk && (await assetsView()) === 'decor' && (await backBarVisible()),
  `panel=${deepPanelOk} view=${await assetsView()}`,
);

// F. 旧值深链 ?panel=subscription：订阅页签已并入首页 ⇒ 归一为首页并把 panel 从 URL 抹掉
//    （旧值的唯一真源在组件 LEGACY_VIEW_MAP，宿主不复制一份）
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets&panel=subscription`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
const legacyViewOk = await waitForAuthed(page, ASSETS_READY, 25000);
await page.waitForTimeout(900);
check(
  '旧深链 ?panel=subscription 归一为首页，URL 不再保留已删页签',
  legacyViewOk && (await assetsView()) === 'home' && !(await readPanelQuery()).panel,
  `view=${await assetsView()} panel=${(await readPanelQuery()).panel}`,
);

// G. 旧 tab 形态深链 ?tab=posts&view=assets&panel=points → 落到资产 tab 并直达积分明细
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=posts&view=assets&panel=points`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
const legacyPanelOk2 = await waitForAuthed(page, ASSETS_READY, 25000);
await page.waitForTimeout(900);
const legacyPanelQuery = await readPanelQuery();
check(
  '旧深链 ?tab=posts&view=assets&panel=points 归一为 ?tab=assets&panel=points 并直达积分',
  legacyPanelOk2 &&
    (await assetsView()) === 'points' &&
    legacyPanelQuery.tab === 'assets' &&
    legacyPanelQuery.panel === 'points',
  `view=${await assetsView()} tab=${legacyPanelQuery.tab} panel=${legacyPanelQuery.panel}`,
);

// 印象：2026-10-26 从「我页第三段控」下调为**空间页内容面板的第三个 tab**
// （段控整体退场，同一屏三层导航压成一层内容 tab）。
// 深链形态 ?tab=posts&view=impressions，宿主把它翻成 profileContentTab='impressions'。
// ⚠️ 必须点在底栏「我」席（posts）上：`.profile-content-tabs` 在「内容」tab 里
// 并不渲染，点隐藏的那份不会切换任何状态（实测 clicked=true / mounted=false）。
await clickNav('我');
await page.waitForTimeout(1200);
const impressionsTabClicked = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.profile-content-tabs .profile-content-tab'));
  const hit = tabs.find((b) => b.textContent.trim().includes('印象'));
  hit?.click();
  return !!hit;
});
let impressionsOk = false;
try {
  await page.waitForSelector('.profile-content-impressions .profile-impressions-section', {
    timeout: 20000,
  });
  // 可见性也要断言：tab-page 是叠放层，隐藏页里的区块同样在 DOM 里
  impressionsOk = await page.evaluate(() => {
    const el = document.querySelector('.profile-content-impressions .profile-impressions-section');
    return !!el && el.offsetParent !== null;
  });
} catch {}
check(
  '内容面板「印象」tab → 印象区块挂载（原第三段控，现降为内容 tab）',
  impressionsTabClicked && impressionsOk,
  `clicked=${impressionsTabClicked} mounted=${impressionsOk}`,
);
await page.screenshot({ path: 'debug-screenshots/ia-content-impressions.png' });

// ---------- 5b. 资产：充值弹窗遮罩 + 赞助子页（2026-10-26 修复回归） ----------
// 两条都是「回退即复发」的样式级故障，症状还都容易被误归因（一个是
// 「弹窗没盖住页面」，一个是「赞助页一片纯白」），所以锁几何与挂载，不锁「存在性」。
// ⚠️ 资产**不在底栏席位里**（底栏只有 内容/消息/AI/图库/我），必须冷加载进来。
// 别用 clickNav('资产') —— 它找不到项就静默不点，然后 `mountedTabs` 里残留的
// 隐藏面板会让后面的 .ah-btn / .ah-links 选择器「命中但不可见」，
// 于是弹窗仍能打开、赞助却点不动：一条断言全绿、一条全红的假象。
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await ensureLoggedIn();
await waitForAuthed(page, '.ah-page', 25000);
await page.waitForTimeout(900);

// ① 充值弹窗：遮罩必须铺满视口、且在顶层、且没有背景模糊。
//    曾经 `position: fixed` 被祖先 transform 劫持成「相对该祖先定位」——
//    `.ah-page` 与宿主 `.tab-page` 的入场动画收尾都留下 `matrix(1,0,0,1,0,0)`，
//    单位矩阵也算非 none。实测 1440×900：遮罩只剩 1131×600 @(275,0)，
//    右侧与底部整条露底。修法是 Teleport 到 body（不是调 z-index）。
await page.evaluate(() => {
  [...document.querySelectorAll('.ah-btn')].find((b) => /充值/.test(b.textContent))?.click();
});
let rechargeGeo = null;
try {
  await page.waitForSelector('.ah-qr-overlay', { timeout: 8000 });
  await page.waitForTimeout(400);
  rechargeGeo = await page.evaluate(() => {
    const ov = document.querySelector('.ah-qr-overlay');
    const r = ov.getBoundingClientRect();
    const cs = getComputedStyle(ov);
    const hit = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return !!el && `${el.className}`.includes('ah-qr-overlay');
    };
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      vw: innerWidth,
      vh: innerHeight,
      filter: cs.backdropFilter || cs.webkitBackdropFilter,
      // 取 40px 内缩：两侧各有一条 16px 宽的 AI 边缘手势热区
      // （.ai-edge-trigger，#z-index 2147483645），它永远在一切之上，量角落会误判。
      corners: [hit(40, 40), hit(innerWidth - 40, 40), hit(40, innerHeight - 40)],
      teleported: ov.parentElement === document.body,
      // aria-modal 的模态要把焦点移进来，否则 Tab 会先跑到背后的页面上
      focusIsClose: !!document.activeElement?.classList?.contains('ah-qr-close'),
    };
  });
} catch {}
check(
  '充值弹窗遮罩铺满视口（Teleport 到 body，不被祖先 transform 劫持）',
  !!rechargeGeo &&
    rechargeGeo.teleported &&
    Math.abs(rechargeGeo.w - rechargeGeo.vw) <= 2 &&
    Math.abs(rechargeGeo.h - rechargeGeo.vh) <= 2,
  rechargeGeo
    ? `${rechargeGeo.w}x${rechargeGeo.h}@(${rechargeGeo.left},${rechargeGeo.top}) vs ${rechargeGeo.vw}x${rechargeGeo.vh}`
    : '弹窗未出现',
);
check(
  '充值弹窗无背景模糊（用户要求：不要 blur）',
  !!rechargeGeo && (rechargeGeo.filter === 'none' || rechargeGeo.filter === ''),
  rechargeGeo ? rechargeGeo.filter : 'n/a',
);
check(
  '充值弹窗遮罩在顶层（三角命中自身）',
  !!rechargeGeo && rechargeGeo.corners.every(Boolean),
  rechargeGeo ? JSON.stringify(rechargeGeo.corners) : 'n/a',
);
check(
  '充值弹窗打开后焦点移入弹窗（aria-modal 语义）',
  !!rechargeGeo && rechargeGeo.focusIsClose,
  rechargeGeo ? `focus=${rechargeGeo.focusIsClose}` : 'n/a',
);
await page.screenshot({ path: 'debug-screenshots/ia-assets-recharge.png' });

// 模态必须能键盘退出（2026-10-27 实测缺口：Esc 原本无效，只能点关闭按钮或遮罩）。
// 遮罩 Teleport 到 body，键盘监听只能挂 document —— 挂在组件根上收不到。
await page.keyboard.press('Escape');
await page.waitForTimeout(450);
const escClosed = await page.evaluate(() => !document.querySelector('.ah-qr-overlay'));
check('充值弹窗可按 Esc 关闭（模态键盘出口）', escClosed);
if (!escClosed) {
  await page.evaluate(() => document.querySelector('.ah-qr-close')?.click());
  await page.waitForTimeout(400);
}

// ② 赞助子页：hub ↔ sponsor 的档位切换**不能**用 `<transition mode="out-in">`。
//    实测 out-in 在这里会永久卡死（离场元素移除后 isLeaving 不复位），
//    之后只渲染一个注释节点 —— 用户看到的是「点『赞助方块之家』后整页纯白」。
await page.evaluate(() => {
  [...document.querySelectorAll('.ah-links button')]
    .find((b) => /赞助/.test(b.textContent))
    ?.click();
});
let sponsorOk = false;
try {
  await page.waitForSelector('.sponsor-hero', { timeout: 15000 });
  sponsorOk = true;
} catch {}
await page.waitForTimeout(600);
const sponsorGeo = await page.evaluate(() => {
  const surf = document.querySelector('.unified-nav-surface');
  const header = document.querySelector('.profile-subpage-shell > *:first-child');
  const hr = header ? header.getBoundingClientRect() : null;
  return {
    headerTop: hr ? Math.round(hr.top) : -1,
    navBottom: surf ? Math.round(surf.getBoundingClientRect().bottom) : -1,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
check('赞助子页可进入（hub → sponsor 档位切换不卡死）', sponsorOk, `mounted=${sponsorOk}`);
check(
  '赞助子页页头不被顶部导航岛遮挡（页头顶边 > 岛下沿）',
  sponsorOk && sponsorGeo.headerTop > sponsorGeo.navBottom,
  `headerTop=${sponsorGeo.headerTop} navBottom=${sponsorGeo.navBottom}`,
);
check('赞助子页无横向溢出', sponsorGeo.overflow <= 0, `overflow=${sponsorGeo.overflow}`);
await page.screenshot({ path: 'debug-screenshots/ia-assets-sponsor.png' });

// 返回：页头那颗 back 按钮必须能退回首页。
// 同一个 out-in 卡死也会表现成「进了赞助就退不回来」——只断言「能进」不够。
await page.evaluate(() => {
  const header = document.querySelector('.profile-subpage-shell > *:first-child');
  header?.querySelector('button')?.click();
});
await page.waitForTimeout(800);
const backHome = await page.evaluate(() => ({
  hub: document.querySelectorAll('.ah-page').length,
  cards: document.querySelectorAll('.ah-home .ah-panel').length,
  sponsor: document.querySelectorAll('.sponsor-hero').length,
}));
check(
  '赞助子页返回 → 回资产首页且四张卡都在',
  backHome.hub === 1 && backHome.cards === 4 && backHome.sponsor === 0,
  `hub=${backHome.hub} cards=${backHome.cards} sponsor=${backHome.sponsor}`,
);

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
  const btns = Array.from(bar.querySelectorAll('.x-sab-btn'));
  return {
    exists: true,
    visible: getComputedStyle(bar).display !== 'none',
    btns: btns.map((b) => b.textContent.trim().replace(/\s+/g, ' ')),
    disabled: btns.map((b) => b.disabled),
  };
});
check('选择后出现一键已读操作栏', sabState.exists && sabState.visible);
/* 2026-10-22 订正：原断言查 `.x-sab-primary` 的文案必须等于「完成」—— 那个类名
   只剩 CSS 死规则，模板里从来没有（`Messages/index.vue:351` 注释写明「退出入口
   统一在页头取消，此处只放动作」）。于是这条从 10-19 起一直是红的、只是没人跑。
   换成查真实的 `.x-sab-btn` 列表：两个动作（归档 / 已读）+ 未选中时全禁用。
   判据仍然有牙 —— 操作栏空壳、按钮丢失、或禁用态失效都会红。 */
check(
  '操作栏含归档/已读两个动作（未选中时禁用）',
  (sabState.btns || []).length === 2 &&
    /^归档/.test(sabState.btns[0] || '') &&
    /^已读/.test(sabState.btns[1] || '') &&
    (sabState.disabled || []).every(Boolean),
  `${(sabState.btns || []).join(' | ')} disabled=${JSON.stringify(sabState.disabled)}`,
);
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

// ?tab=assets：2026-10-26 起是**一等公民 tab**（不再是「我」页里的分段）。
// 这条锁的是「别再退回旧语义」：URL 必须原样保留 tab=assets，不能被改写成
// tab=posts&view=assets（那套分段回写已随段控一起删除）；底栏仍高亮「我」。
await page.goto('about:blank');
await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 20000,
});
await injectLogin(page);
const deepAssetsOk = await waitForAuthed(page, ASSETS_READY, 25000);
const deepAssetsUrl = await page.evaluate(() => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  return { tab: q.get('tab'), view: q.get('view') };
});
check(
  '冷加载 ?tab=assets 保持 tab=assets（不回写旧分段形态 tab=posts&view=assets）',
  deepAssetsOk &&
    (await activeTab()) === '我' &&
    deepAssetsUrl.tab === 'assets' &&
    !deepAssetsUrl.view,
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
  // 五席 = 内容/消息/AI/图库/我（src/config/bottom-nav.ts，2026-10-22 补第五席「图库」）
  main: document.querySelectorAll('.userspace-rail-group [data-tab]').length,
  actions: Array.from(document.querySelectorAll('[data-rail-action]')).map(
    (el) => el.dataset.railAction,
  ),
}));
check(
  '左栏主导航 5 项（内容/消息/AI/图库/我）',
  railButtons.main === 5,
  `main=${railButtons.main}`,
);
check(
  // 2026-10-26：左栏是**全局导航**，便捷区固定为「发布 / 资产」两项。
  // 搜索已下线该席位（它归论坛自身顶栏 / `?search=1` 深链）——同一个左栏在
  // 不同宿主里变来变去会被用户读成 bug，见 UserSpaceSideRail 的 DEFAULT_QUICK_ACTIONS。
  '左栏便捷组齐全（发布/资产）',
  ['compose', 'assets'].every((id) => railButtons.actions.includes(id)) &&
    !railButtons.actions.includes('search'),
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
    const actionBar = document.querySelector('.composer-actions');
    // 滚动面：2026-10-26 结构调整后，`.mobile-composer-scroll` 退化为
    // 「把卡片头/正文/底栏拉满剩余高度」的 flex 壳（overflow: hidden），
    // 真正滚动的是它内部的 `.composer-content-scroll`（overflow-y: auto）。
    // 旧断言量前者自然恒为 hidden —— 那是断言跟着实现跑偏，不是回归。
    const scrollBox = document.querySelector('.mobile-composer-overlay .composer-content-scroll');
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
      actionBarDisplay: actionBar ? getComputedStyle(actionBar).display : 'ABSENT',
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
    '会话内统一动作栏可见（标签 / 图片 / 智能整理 / 更多）',
    composerState.actionBarDisplay !== 'none' && composerState.actionBarDisplay !== 'ABSENT',
    composerState.actionBarDisplay,
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
    composerState.embeddedComposerDisplay === 'ABSENT',
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

// 搜索 → 聚焦论坛工具栏搜索框。
// ⚠️ 早先这里是点左栏 `[data-rail-action="search"]`；该席位已删除 ——
// 左栏是**全局导航**，便捷区只剩「发布 / 资产」（见 UserSpaceSideRail 的
// DEFAULT_QUICK_ACTIONS 注释：同一个左栏在不同宿主里变来变去会被读成 bug）。
// 搜索回到论坛自身顶栏（另有 `?search=1` 深链），所以这里先进「内容」tab
// 让论坛真正可见，再点搜索框本身 —— 验的是「论坛搜索框可聚焦 + 几何达标」。
// ⚠️ 必须用 `:visible` 定位：.tab-page 是叠放层，未激活 tab 里的 ForumToolbar
// 同样在 DOM 里（v-show 隐藏），裸选择器会命中隐藏那份，动作 click 超时。
await safeClick(landPage, '.userspace-rail-item[data-tab="community"]');
await landPage.waitForTimeout(1100);
let searchFocused = false;
try {
  await landPage
    .locator('.forum-page .toolbar-search-input:visible')
    .first()
    .click({ timeout: 12000 });
  await landPage.waitForFunction(
    () => document.activeElement?.classList?.contains('toolbar-search-input'),
    null,
    { timeout: 8000 },
  );
  searchFocused = true;
} catch {}
check('论坛搜索框可聚焦（左栏「搜索」席位已下线，搜索归论坛顶栏）', searchFocused);

// 搜索框几何（用户明确要求：横屏加高 + 提示居中 + 跨栏独占一行）。
// 只验「存在」会漏掉样式裸奔，这里量真实几何
const landSearch = await landPage.evaluate(() => {
  // 同上：只量可见那份，隐藏 tab 的输入框宽高恒为 0
  const input = Array.from(document.querySelectorAll('.forum-page .toolbar-search-input')).find(
    (el) => el.offsetParent !== null,
  );
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
  /* 真实类名是 `.x-filter-actions-desktop`（`.x-filter-actions-desktop-minimal`
     在模板与 CSS 里都不存在 —— 原断言查的正是后者，所以永远 ABSENT、永远红）。 */
  const inline = document.querySelector('.x-filter-actions-desktop');
  const btns = bar ? Array.from(bar.querySelectorAll('.x-sab-btn')) : [];
  return {
    bar: bar ? getComputedStyle(bar).display : 'ABSENT',
    btns: btns.map((b) => b.textContent.trim().replace(/\s+/g, ' ')),
    disabled: btns.map((b) => b.disabled),
    inline: inline ? getComputedStyle(inline).display : 'ABSENT',
  };
});
check('横屏选择后操作栏出现（1180px）', landBarState.bar === 'flex', landBarState.bar);
/* 2026-10-22 订正：同 §6b —— 原断言查 `.x-sab-primary` 的「完成」，那个类不存在。 */
check(
  '横屏操作栏含归档/已读两个动作（未选中时禁用）',
  landBarState.btns.length === 2 &&
    /^归档/.test(landBarState.btns[0] || '') &&
    /^已读/.test(landBarState.btns[1] || '') &&
    landBarState.disabled.every(Boolean),
  `${landBarState.btns.join(' | ')} disabled=${JSON.stringify(landBarState.disabled)}`,
);
/* 「隐藏」有两种合法形态：`.x-filter-actions-desktop` 是**桌面版顶部操作组**
   （完成 / 归档 / 已读），选择模式下模板直接不渲染它 ⇒ ABSENT。
   原断言只认 `display:none`，把「不渲染」判成失败，属于判据太窄。
   现在两者都算通过；只有「元素在场且可见」才红 —— 那才是真的重复入口。 */
check(
  '横屏顶部重复行已隐藏（不渲染或 display:none）',
  landBarState.inline === 'ABSENT' || landBarState.inline === 'none',
  landBarState.inline,
);
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

// ---------- 12. 竖屏通栏化（2026-10-22） ----------
/* 锁住「我的 · 空间」竖屏 edge-to-edge 的产物：圆角归零 + 左右贴边 + 统计行 4 等分。
   为什么需要：这批改动此前**只有肉眼验收**，而 ProfileHomePanel 首版曾因 scoped 特异性
   被后面的基础规则反超而静默失效（封面仍 120px、统计行仍缩进 24px）—— 那次没有任何
   断言能发现，只能靠人盯。 */
const portraitPage = await context.newPage();
await portraitPage.setViewportSize({ width: 390, height: 844 });
await portraitPage.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded' });
await portraitPage
  .waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 })
  .catch(() => {});
for (let i = 0; i < 6; i += 1) {
  await portraitPage
    .evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      if (!pinia?.state?.value?.auth) return;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-ia-user',
        username: 'probe_rui',
        role: 'user',
        points: 1024,
      };
    })
    .catch(() => {});
  await portraitPage.waitForTimeout(400);
}
await portraitPage
  .waitForSelector('.profile-home-shell .profile-hero-panel', { timeout: 20000 })
  .catch(() => {});
/* ⚠️ 主题复位（2026-10-27 实测踩到）：
   上面第 9 段用 `darkPage.addInitScript` 往 localStorage 写了 boh-theme=dark，
   而 **localStorage 是 context 级共享的** ⇒ 同一 context 里的竖屏页也跟着变暗色。
   不复位的话，「整页底色纯白」这条会量到 rgb(13,13,18) 并以「探针污染」的名义假红。
   （同理：任何在 context 里切换过主题的探针，量亮色读数前都要先复位。） */
await portraitPage.evaluate(() => {
  try {
    localStorage.removeItem('boh-theme');
  } catch {}
  document.documentElement.setAttribute('data-theme', 'light');
  document.querySelector('.user-space-page')?.setAttribute('data-theme', 'light');
});
await portraitPage.waitForTimeout(400);
const portraitFlush = await portraitPage.evaluate(() => {
  const panel = document.querySelector('.profile-home-shell > .profile-hero-panel');
  const stats = document.querySelector('.profile-home-shell .profile-hero-stats');
  if (!panel) return { found: false };
  const cs = getComputedStyle(panel);
  const r = panel.getBoundingClientRect();
  // 2026-10-26：统计从「4 格等分网格」改成参考产品的「纯文本一行」——
  // 只有 3 项（粉丝 / 关注 / 发帖），无分隔、无胶囊底，所以不再量
  // grid-template-columns（那会恒为 none ⇒ cols=0 的假红）。改为量
  // 项数 + 是否真的排在同一行（offsetTop 只有一个取值）。
  const items = stats ? [...stats.querySelectorAll('.stat-text')] : [];
  const tops = items.map((el) => Math.round(el.getBoundingClientRect().top));
  /* 2026-10-27 三条新增口径（用户定稿）：
     ① 整页底色纯白（原来是 #f5f5f7 的灰盒）；
     ② 「编辑资料 / 活跃轨迹」那一行必须与昵称共用左边界；
     ③ 活跃轨迹胶囊上不许再出现天数。
     ⚠️ 每条都取不到元素时置 null 并让断言 fail —— 找不到就当通过是假绿。 */
  const pageEl = document.querySelector('.user-space-page');
  const nameEl = document.querySelector(
    '.profile-home-shell .profile-hero-copy .profile-name, .profile-home-shell .profile-hero-copy h1, .profile-home-shell .profile-hero-name',
  );
  const actionsEl = document.querySelector('.profile-home-shell .profile-hero-actions');
  const pillEl = document.querySelector('.profile-home-shell .profile-activity-trigger');
  const leftOf = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null);
  return {
    found: true,
    radius: cs.borderTopLeftRadius,
    left: Math.round(r.left),
    right: Math.round(window.innerWidth - r.right),
    statCount: items.length,
    statRows: new Set(tops).size,
    pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : null,
    nameLeft: leftOf(nameEl),
    actionsLeft: leftOf(actionsEl),
    pillText: pillEl ? (pillEl.innerText || '').replace(/\s+/g, ' ').trim() : null,
  };
});
check(
  '竖屏空间段：身份卡通栏（圆角 0）',
  portraitFlush.found && portraitFlush.radius === '0px',
  portraitFlush.found ? portraitFlush.radius : '面板未渲染',
);
check(
  '竖屏空间段：身份卡左右贴边（≤1px）',
  portraitFlush.found && portraitFlush.left <= 1 && portraitFlush.right <= 1,
  portraitFlush.found ? `left=${portraitFlush.left} right=${portraitFlush.right}` : 'n/a',
);
check(
  '竖屏空间段：统计行 3 项同排（纯文本流，不再 4 等分网格）',
  portraitFlush.statCount === 3 && portraitFlush.statRows === 1,
  `items=${portraitFlush.statCount} rows=${portraitFlush.statRows}`,
);
check(
  '竖屏空间段：整页底色纯白（2026-10-27 定稿，不再是 #f5f5f7 灰盒）',
  portraitFlush.pageBg === 'rgb(255, 255, 255)',
  portraitFlush.pageBg || '页面根未渲染',
);
check(
  '竖屏空间段：主操作行与昵称同一左边界（编辑资料 / 活跃轨迹）',
  portraitFlush.nameLeft !== null &&
    portraitFlush.actionsLeft !== null &&
    Math.abs(portraitFlush.actionsLeft - portraitFlush.nameLeft) <= 1,
  portraitFlush.nameLeft === null
    ? '昵称元素未找到'
    : portraitFlush.actionsLeft === null
      ? '主操作行未找到'
      : `nameLeft=${portraitFlush.nameLeft} actionsLeft=${portraitFlush.actionsLeft}`,
);
check(
  '竖屏空间段：活跃轨迹胶囊只显示标题（不显示天数）',
  portraitFlush.pillText === '活跃轨迹',
  portraitFlush.pillText === null ? '胶囊未找到' : `text="${portraitFlush.pillText}"`,
);

/* 另两档的口径（2026-10-26 重写）：
   · 印象 = 「我」页内容面板的第三个 tab（作品 / 回复 / 印象），与空间段同为 edge-to-edge；
   · 资产 = **独立 tab**，刻意保留 16px 卡片边距（工具型网格，见
     profile-base.css 的 `.profile-page-content.assets-active`）。
   ⚠️ 旧版靠 `segFlush('印象'/'资产')` 点段控 —— 段控已随 IA 合并整体删除。
   找不到按钮时它什么都点不到，却仍会量到「我」页首个可见块并**报绿**（假绿）。
   现在每档先断言目标块真的挂载，再量边距；找不到元素直接 fail。 */
const clickContentTab = async (label) => {
  const clicked = await portraitPage
    .evaluate((text) => {
      const btn = [...document.querySelectorAll('.profile-content-tabs .profile-content-tab')].find(
        (b) => b.textContent.trim().includes(text),
      );
      btn?.click();
      return !!btn;
    }, label)
    .catch(() => false);
  await portraitPage.waitForTimeout(1400);
  return clicked;
};

const impTabClicked = await clickContentTab('印象');
const portraitImp = await portraitPage.evaluate(() => {
  const section = document.querySelector('.profile-home-shell .profile-impressions-section');
  if (!section) return { found: false };
  const r = section.getBoundingClientRect();
  return {
    found: true,
    left: Math.round(r.left),
    right: Math.round(window.innerWidth - r.right),
  };
});
check(
  '竖屏印象 tab：贴边（≤1px）+ 方角',
  impTabClicked && portraitImp.found && portraitImp.left <= 1 && portraitImp.right <= 1,
  `clicked=${impTabClicked} ${
    portraitImp.found ? `left=${portraitImp.left} right=${portraitImp.right}` : '未渲染'
  }`,
);

// 资产：独立 tab，冷加载进入（不再有「资产」段控可点）
await portraitPage.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await portraitPage
  .waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 })
  .catch(() => {});
for (let i = 0; i < 6; i += 1) {
  await portraitPage
    .evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      if (!pinia?.state?.value?.auth) return;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: 'probe-ia-user',
        username: 'probe_rui',
        role: 'user',
        points: 1024,
      };
    })
    .catch(() => {});
  await portraitPage.waitForTimeout(400);
}
await waitForAuthed(portraitPage, '.tab-page.assets-shell .ah-page', 20000);
const portraitAssets = await portraitPage.evaluate(() => {
  const page = document.querySelector('.tab-page.assets-shell .ah-page');
  if (!page) return { found: false };
  const r = page.getBoundingClientRect();
  return {
    found: true,
    left: Math.round(r.left),
    right: Math.round(window.innerWidth - r.right),
  };
});
check(
  '竖屏资产页：保留 16px 卡片边距（反向锁，工具型网格不贴边）',
  portraitAssets.found &&
    Math.abs(portraitAssets.left - 16) <= 1 &&
    Math.abs(portraitAssets.right - 16) <= 1,
  portraitAssets.found ? `left=${portraitAssets.left} right=${portraitAssets.right}` : '未渲染',
);

// 竖屏触摸目标（2026-10-27 实测缺口：主按钮 36px、「全部明细」只有 23px 高）。
// 主按钮按 Apple HIG 40 下限；纯文字链给 32 的命中区（WCAG 2.5.8 的下限只有 24）。
// ⚠️ 规则必须写在 CSS 文件末尾 —— `.ah-btn{height:36px}` 在同特异性下靠后覆盖，写在前面会静默失效。
const portraitTargets = await portraitPage.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.tab-page.assets-shell .ah-page button').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const need = el.classList.contains('ah-link-btn') ? 32 : 40;
    if (r.height + 0.5 < need || r.width < 32) {
      bad.push({
        text: el.textContent.trim().slice(0, 8),
        w: Math.round(r.width),
        h: Math.round(r.height),
        need,
      });
    }
  });
  return bad;
});
check(
  '竖屏资产页触摸目标达标（主按钮 ≥40 / 文字链 ≥32）',
  portraitTargets.length === 0,
  portraitTargets.length ? JSON.stringify(portraitTargets.slice(0, 4)) : '全部达标',
);

await portraitPage.screenshot({ path: 'debug-screenshots/ia-portrait-fullwidth.png' });
await portraitPage.close();

// ---------- 手机横屏 844×390（2026-10-27）----------
// 横屏是独立形态，不是竖屏的缩放：宽 844 越过 max-width:767 那批触摸规则，
// 高只剩 390 又撑不开常规弹窗。两个缺口都在这一档暴露过 ——
// 按钮仍是 36px、充值弹窗 436px 把二维码底部 19px 与 UID 整行切到屏外（扫码直接失败）。
const landscapePage = await context.newPage();
await landscapePage.setViewportSize({ width: 844, height: 390 });
await landscapePage.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await injectLogin(landscapePage);
await waitForAuthed(landscapePage, '.tab-page.assets-shell .ah-page', 20000);
// 首启公告（5.6s）期间岛是展开态（130px），会盖住摘要条并使点击落到浮层上
await landscapePage
  .waitForFunction(
    () => {
      const el = document.querySelector('.unified-nav-surface');
      return !el || el.getBoundingClientRect().height < 100;
    },
    null,
    { timeout: 9000 },
  )
  .catch(() => {});

const landscapeNav = await landscapePage.evaluate(() => {
  const shown = (el) =>
    !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 2;
  return {
    bar: shown(document.querySelector('.bottom-nav-glass')),
    rail: shown(document.querySelector('.userspace-rail')),
  };
});
check('横屏手机用底部胶囊、不渲染左栏', landscapeNav.bar && !landscapeNav.rail, JSON.stringify(landscapeNav));

const landscapeTargets = await landscapePage.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.tab-page.assets-shell .ah-page button').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const need = el.classList.contains('ah-link-btn') ? 32 : 40;
    if (r.height + 0.5 < need || r.width < 32) {
      bad.push({ text: el.textContent.trim().slice(0, 8), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  return bad;
});
check(
  '横屏手机触摸目标达标（主按钮 ≥40 / 文字链 ≥32）',
  landscapeTargets.length === 0,
  landscapeTargets.length ? JSON.stringify(landscapeTargets.slice(0, 4)) : '全部达标',
);

await landscapePage
  .locator('.tab-page.assets-shell .ah-btn', { hasText: '充值积分' })
  .first()
  .click({ timeout: 8000 })
  .catch(() => {});
await landscapePage.waitForTimeout(600);
const landscapeModal = await landscapePage.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const card = box(document.querySelector('.ah-qr-modal'));
  const qr = box(document.querySelector('.ah-recharge-qr'));
  const close = box(document.querySelector('.ah-qr-close'));
  const vh = window.innerHeight;
  return {
    open: !!document.querySelector('.ah-qr-overlay'),
    card,
    qr,
    close,
    vh,
    cardFits: !!card && card.top >= 0 && card.bottom <= vh,
    qrFits: !!qr && qr.top >= 0 && qr.bottom <= vh,
    closeFits: !!close && close.top >= 0 && close.bottom <= vh && close.h >= 32,
  };
});
check('横屏手机充值弹窗能打开', landscapeModal.open);
check(
  '横屏手机弹窗完整落在视口内（不留半截要盲滚）',
  landscapeModal.cardFits,
  landscapeModal.card ? `卡片 ${landscapeModal.card.h}px / 视口 ${landscapeModal.vh}px` : 'n/a',
);
check(
  '横屏手机二维码完整可见（能扫）',
  landscapeModal.qrFits,
  landscapeModal.qr ? `h=${landscapeModal.qr.h} bottom=${landscapeModal.qr.bottom}` : 'n/a',
);
check(
  '横屏手机关闭按钮可点（≥32 且在视口内）',
  landscapeModal.closeFits,
  landscapeModal.close ? `h=${landscapeModal.close.h}` : 'n/a',
);
await landscapePage.keyboard.press('Escape');
await landscapePage.waitForTimeout(400);
check('横屏手机 Esc 可关充值弹窗', await landscapePage.evaluate(() => !document.querySelector('.ah-qr-overlay')));
await landscapePage.screenshot({ path: 'debug-screenshots/ia-landscape-assets.png' });
await landscapePage.close();

// ---------- 旋转（不刷新页面）----------
// 断点 (orientation:landscape)+(min-width:1024)+(min-height:600) 同时驱动
// 「设置两栏」与「左栏收窄」。若 matchMedia 的 change 监听丢了，转屏后布局会僵在原形态。
const rotatePage = await context.newPage();
await rotatePage.setViewportSize({ width: 768, height: 1024 });
await rotatePage.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
await injectLogin(rotatePage);
await waitForAuthed(rotatePage, '.glass-settings', 20000);
// ⚠️ 左栏在竖屏仍留在 DOM 里（display:none），必须按可见性判断，
// 只写 !!querySelector 会把竖屏也判成「有左栏」。
const railVisible = () =>
  rotatePage.evaluate(() => {
    const el = document.querySelector('.userspace-rail');
    return !!el && getComputedStyle(el).display !== 'none' && el.offsetHeight > 10;
  });
const rotPortrait = {
  nav: await rotatePage.evaluate(() => !!document.querySelector('.gs-nav')),
  compact: await rotatePage.evaluate(() => document.body.classList.contains('is-rail-compact')),
  rail: await railVisible(),
};
check('旋转前 768×1024 竖屏：设置单栏、无左栏', !rotPortrait.nav && !rotPortrait.rail, JSON.stringify(rotPortrait));

await rotatePage.setViewportSize({ width: 1024, height: 768 });
await rotatePage.waitForTimeout(700);
const rotLandscape = {
  nav: await rotatePage.evaluate(() => !!document.querySelector('.gs-nav')),
  compact: await rotatePage.evaluate(() => document.body.classList.contains('is-rail-compact')),
  rail: await railVisible(),
  groups: await rotatePage.evaluate(
    () => [...document.querySelectorAll('.gs-group')].filter((el) => el.offsetHeight > 0).length,
  ),
};
check(
  '转横屏后自动切两栏（左目录 + 右详情 + 左栏收窄）',
  rotLandscape.nav && rotLandscape.rail && rotLandscape.compact,
  JSON.stringify(rotLandscape),
);

await rotatePage.setViewportSize({ width: 768, height: 1024 });
await rotatePage.waitForTimeout(700);
const rotBack = await rotatePage.evaluate(() => ({
  nav: !!document.querySelector('.gs-nav'),
  compact: document.body.classList.contains('is-rail-compact'),
  groups: [...document.querySelectorAll('.gs-group')].filter((el) => el.offsetHeight > 0).length,
}));
check(
  '转回竖屏后自动收成单栏（全组展开）',
  !rotBack.nav && !rotBack.compact && rotBack.groups >= 3,
  JSON.stringify(rotBack),
);
await rotatePage.close();

// ---------- 汇总 ----------
check('零 pageerror（明色主流程）', errors.length === 0, errors.join(' | ').slice(0, 120));

console.log(results.join('\n'));
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
