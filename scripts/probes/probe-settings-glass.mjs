// 探针：设置子页液态玻璃统一验证
// - settings 主页（2026-11-10 平铺改版：组头 + 全部条目一页列完，无分类钻取层）
// - 通知设置（原 pushplus 页，路径沿用旧 slug）/ 数据与隐私（右栏内嵌）/ data-export
// - 明暗双主题 + 手机横竖屏
// 运行：node probe-settings-glass.mjs（dev 5173 需已启动）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

// 伪造登录 + 可选暗色（localStorage 预置，确保暗色 css 懒加载生效）
const newPage = async ({ theme = 'light', viewport = { width: 420, height: 900 } } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript((t) => {
    localStorage.setItem('boh-theme', t);
  }, theme);
  return { context, page, errors };
};

const injectLogin = async (page) => {
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    const pinia = app.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) {
      s.userInfo.username = '测试用户';
      s.userInfo.id = '';
      s.userInfo.email = 'ryyik@bohrite.example.com';
    }
  });
  await page.waitForTimeout(900);
};

// requiresLogin 路由守卫会拦截未登录的首次导航；
// 先落公共页 → 注入登录 → hash SPA 跳转（不刷新，pinia 状态保留）
const loginThenGo = async (page, hash) => {
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(1500);
};

const results = [];
const assertions = [];
const assert = (name, ok, detail = '') => {
  assertions.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` · ${detail}` : ''}`);
};
const shot = async (page, name, path) => {
  await page.screenshot({ path: `${SHOT_DIR}/${path}` });
  results.push({ name, path });
};

/* 2026-09-30 新增：iOS 式分组骨架 + 设置搜索。
   骨架断言针对 settings-glass.css（5 个设置类页面共用），所以只跑一次即可；
   搜索只在设置主页存在。 */
const assertSettingsCardAndSearch = async (page) => {
  const card = await page.evaluate(() => {
    const cs = (n, p) => getComputedStyle(n)[p];
    const r = (n) => n.getBoundingClientRect();
    const container = document.querySelector('.glass-settings');
    const groups = [...document.querySelectorAll('.gs-group')];
    const cards = [...document.querySelectorAll('.gs-rows')];
    const firstCard = cards[0];
    // ⚠️ 「账户」组只有一行，取相邻行必须找第一张**多行**卡片
    const multiCard = cards.find((el) => el.children.length > 1);
    const secondRow = multiCard?.children[1];
    return {
      containerGap: parseFloat(cs(container, 'gap')),
      cardRadius: cs(firstCard, 'borderTopLeftRadius'),
      groupGap: groups.length > 1 ? Math.round(r(groups[1]).top - r(groups[0]).bottom) : -1,
      // 分隔线内缩：::before 的 left 应为「内边距 + 图标宽 + 间距」，而不是 0（通栏）
      lineLeft: secondRow ? parseFloat(getComputedStyle(secondRow, '::before').left) : -1,
      // 卡片所在行的左内边距，用于核对内缩量是否真的越过图标
      rowPadLeft: multiCard ? parseFloat(cs(multiCard.firstElementChild, 'paddingLeft')) : -1,
    };
  });
  assert(
    '骨架：分组容器为 flex 且有组间留白（≥20px）',
    card.containerGap >= 20,
    `gap=${card.containerGap}px`,
  );
  assert(
    '骨架：卡片有独立圆角（16px，非 0）',
    Math.abs(parseFloat(card.cardRadius) - 16) < 0.5,
    `radius=${card.cardRadius}`,
  );
  assert(
    '骨架：组与组之间是留白而非紧贴（≥20px）',
    card.groupGap >= 20,
    `groupGap=${card.groupGap}px`,
  );
  assert(
    '骨架：行分隔线内缩到文字起始处（越过图标宽度）',
    card.lineLeft > card.rowPadLeft,
    `lineLeft=${card.lineLeft}px > rowPadLeft=${card.rowPadLeft}px`,
  );

  // 搜索框可见且未被顶部固定导航覆盖（elementFromPoint 命中自身）
  const searchVisible = await page.evaluate(() => {
    const el = document.querySelector('.gs-search-input');
    if (!el) return { ok: false, reason: 'missing' };
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      ok: el === hit || el.contains(hit),
      height: Math.round(b.height),
      top: Math.round(b.top),
    };
  });
  assert(
    '搜索：输入框可见且未被顶部导航遮挡（命中测试）',
    searchVisible.ok === true && searchVisible.height >= 36,
    `top=${searchVisible.top} height=${searchVisible.height}`,
  );

  const readSearch = () =>
    page.evaluate(() => ({
      labels: [...document.querySelectorAll('.glass-settings .gs-label')].map((n) =>
        n.textContent.trim(),
      ),
      // 2026-11-10 层级定稿：首页不再有组头（组是行不是标题），用 6 个组行是否齐全代替
      hasGroupList: ['个人信息', '账户与安全', '数据', '通知', '内容与存储', '通用'].every((t) =>
        [...document.querySelectorAll('.gs-label')].some((n) => n.textContent.trim() === t),
      ),
      clearBtn: !!document.querySelector('.gs-search-clear'),
    }));

  await page.fill('.gs-search-input', '深色');
  await page.waitForTimeout(300);
  const hitTheme = await readSearch();
  const titleAboveCard = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.gs-group')].find(
      (el) => el.querySelector('.gs-group-title')?.textContent.trim() === '搜索结果',
    );
    if (!group) return false;
    const title = group.querySelector('.gs-group-title').getBoundingClientRect();
    const card = group.querySelector('.gs-rows').getBoundingClientRect();
    return Math.round(title.bottom) <= Math.round(card.top);
  });
  assert('骨架：搜索组标题在卡片外部（不叠在卡片里）', titleAboveCard);
  assert(
    '搜索：「深色」命中主题设置',
    hitTheme.labels.includes('主题设置'),
    hitTheme.labels.join(' / '),
  );
  assert('搜索：命中时一级组列表让位', hitTheme.hasGroupList === false);
  assert('搜索：有输入时出现清除按钮', hitTheme.clearBtn === true);

  await page.fill('.gs-search-input', '推送');
  await page.waitForTimeout(300);
  const hitPush = await readSearch();
  assert(
    '搜索：跨子页命中「通知设置」',
    hitPush.labels.includes('通知设置'),
    hitPush.labels.join(' / '),
  );

  await page.fill('.gs-search-input', 'zzzznothing');
  await page.waitForTimeout(300);
  const empty = await readSearch();
  assert('搜索：无结果时给出空态提示', empty.labels.includes('没有找到设置项'));

  await page.fill('.gs-search-input', '');
  await page.waitForTimeout(300);
  const restored = await readSearch();
  assert('搜索：清空后回到一级组列表', restored.hasGroupList === true);
};

// 竖屏卡片几何（2026-11-24 改版的新锁）
// 改版把 ≤767px 从「拉平通栏」改成「左右内缩 16 + 圆角 20 + 单行 44」。
// 这四条以前没有任何门禁保护 —— 改回通栏也全绿。锁住它们，
// 是为了让「三 tab 语言不再强求统一」这个决定有据可查，而不是靠注释说服后来的人。
const assertPortraitCardGeometry = async (page, theme) => {
  const m = await page.evaluate(() => {
    const cs = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const shell = document.querySelector('.settings-shell');
    const rows = document.querySelectorAll('.settings-shell .gs-row');
    return {
      shellWidth: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
      card: rect('.settings-shell .gs-rows'),
      radius: cs('.settings-shell .gs-rows', 'borderTopLeftRadius'),
      shadow: cs('.settings-shell .gs-rows', 'boxShadow'),
      searchLeft: rect('.settings-shell .gs-search')?.left,
      rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : -1,
      labelWeight: cs('.settings-shell .gs-label', 'fontWeight'),
      // 首页组行不该再有副标题 / 「N 项」徽标
      descCount: document.querySelectorAll('.settings-shell .gs-group .gs-desc').length,
      itemBadges: [...document.querySelectorAll('.settings-shell .gs-value')].filter((n) =>
        /^\d+\s*项$/.test(n.textContent.trim()),
      ).length,
    };
  });

  assert(`竖屏[${theme}]：卡片左右内缩 16px`, m.card && m.card.left === 16, `left=${m.card?.left}`);
  assert(
    `竖屏[${theme}]：卡片右侧同样内缩（宽度 = 屏宽 - 32）`,
    m.card && m.card.width === m.shellWidth - 32,
    `card=${m.card?.width} shell=${m.shellWidth}`,
  );
  assert(
    `竖屏[${theme}]：卡片圆角 20px（不再是 0 的通栏方角）`,
    Math.abs(parseFloat(m.radius) - 20) < 0.5,
    `radius=${m.radius}`,
  );
  assert(
    `竖屏[${theme}]：卡片保留一档轻投影（托起卡片，不能是 none）`,
    m.shadow !== 'none',
    m.shadow === 'none' ? 'none' : 'present',
  );
  assert(
    `竖屏[${theme}]：搜索框与卡片左边缘对齐同一沟槽`,
    m.searchLeft === 16,
    `searchLeft=${m.searchLeft}`,
  );
  assert(`竖屏[${theme}]：首页组行为单行 44px`, Math.abs(m.rowH - 44) <= 1, `${m.rowH}px`);
  assert(`竖屏[${theme}]：标签字重 500（不再是 600）`, m.labelWeight === '500', m.labelWeight);
  assert(`竖屏[${theme}]：组行不再有副标题`, m.descCount === 0, `desc 数=${m.descCount}`);
  assert(`竖屏[${theme}]：组行不再有「N 项」徽标`, m.itemBadges === 0, `徽标数=${m.itemBadges}`);
};

// B 层：账户降级为卡片首行（2026-11-24）
// 三件事必须同时成立，缺一个都说明降级做坏了：
//   ① 竖屏不再有 151px 的居中身份卡
//   ② 第一张卡的首行是「账户」，且它与其他组行**左对齐**（文字起点同一条竖线）
//   ③ 桌面两栏仍保留身份卡（右栏没有组行列表可收，降级会让它变空白 —— 2026-11-10 那次报障）
const assertAccountRowDemotion = async (page, theme) => {
  const m = await page.evaluate(() => {
    const txtLeft = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().left) : null;
    };
    const acctRow = document.querySelector('.gs-acct-row');
    const firstGroupLabel = document.querySelector('.gs-group:not(.gs-acct) .gs-label');
    return {
      hasIdentity: !!document.querySelector('.gs-identity'),
      hasAcct: !!document.querySelector('.gs-acct'),
      acctLabel: txtLeft('.gs-acct-row .gs-label'),
      groupLabel: firstGroupLabel ? Math.round(firstGroupLabel.getBoundingClientRect().left) : null,
      acctRowH: acctRow ? Math.round(acctRow.getBoundingClientRect().height) : -1,
      hasMail: !!document.querySelector('.gs-acct-mail'),
      mailLeft: document.querySelector('.gs-acct-mail-btn')
        ? Math.round(document.querySelector('.gs-acct-mail-btn').getBoundingClientRect().left)
        : null,
    };
  });

  assert(
    `降级[${theme}]：竖屏不再渲染居中身份卡`,
    m.hasIdentity === false,
    `identity=${m.hasIdentity}`,
  );
  assert(`降级[${theme}]：竖屏出现「账户」首行`, m.hasAcct === true);
  assert(
    `降级[${theme}]：账户行与其他组行文字左对齐（±1px）`,
    m.acctLabel !== null && m.groupLabel !== null && Math.abs(m.acctLabel - m.groupLabel) <= 1,
    `acct=${m.acctLabel} group=${m.groupLabel}`,
  );
  assert(
    `降级[${theme}]：账户行是标准的单行 44px`,
    Math.abs(m.acctRowH - 44) <= 1,
    `${m.acctRowH}px`,
  );
  assert(`降级[${theme}]：邮箱复制入口仍在（不能因为降级丢掉能力）`, m.hasMail === true);
};

// 桌面两栏：身份卡必须还在（这是降级不能碰的那一档）
// ⚠️ 必须**独立开一个横屏 context**，不能在竖屏页里 setViewportSize 改大 —— 实测过：
//    两栏的断点是 `(orientation: landscape) and (min-width:1024px) and (min-height:600px)`，
//    matchMedia 的 change 事件在同一个页面里改视口后不保证及时；断言可能跑在
//    「其实还是一栏」的环境里，于是**即使把降级条件写成 isHome（桌面也降级、右栏空白）
//    这条断言照样全绿** —— 反证时实测到过这个假绿。
//    所以这里先断言「两栏真的生效（.gs-nav 在）」，再断言身份卡在。
const assertDesktopKeepsIdentity = async (browser, theme) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('boh-theme', t);
  }, theme);
  await loginThenGo(page, '#/user-space?tab=settings');
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => ({
    hasNav: !!document.querySelector('.gs-nav'),
    isTwoPane: !!document.querySelector('.glass-settings.is-two-pane'),
    hasIdentity: !!document.querySelector('.gs-identity'),
    hasAcct: !!document.querySelector('.gs-acct'),
  }));
  assert(
    '降级：桌面环境确实是两栏（.is-two-pane + 左栏目录）',
    m.isTwoPane && m.hasNav,
    `twoPane=${m.isTwoPane} nav=${m.hasNav}`,
  );
  assert(
    '降级：桌面两栏**保留**身份卡（右栏不会变空白）',
    m.hasIdentity === true,
    `identity=${m.hasIdentity}`,
  );
  assert(
    '降级：桌面两栏不渲染「账户」首行（它只在单栏出现）',
    m.hasAcct === false,
    `acct=${m.hasAcct}`,
  );
  await context.close();
};

// C 层（2026-11-24）：二级页单行化 + 卡下脚注 + 主题就地展开
// 三件事各自都有「看起来改好了其实没有」的失败形态，所以要分开断言：
//   ① 单行化：行内不能再有 .gs-desc（否则又回到双行 ~90px）
//   ② 脚注：只有「卡里恰一个可交互项」才出，多项卡出脚注是**语义错误**
//      （实测：6 行卡片下挂「登录与找回密码，点击更换」，读起来像在说整组）
//   ③ 主题就地展开：点行当场出选项、选中项打勾、不离开当前页
const assertSecondaryRowPattern = async (page, theme) => {
  // 进「账户与安全」（多行卡，不该有脚注）
  const enterGroup = async (label) => {
    await page.evaluate((l) => {
      const r = [...document.querySelectorAll('.gs-row')].find(
        (x) => x.querySelector('.gs-label')?.textContent.trim() === l,
      );
      r?.click();
    }, label);
    await page.waitForTimeout(800);
  };
  const leaveGroup = async () => {
    await page.evaluate(() => document.querySelector('.gs-inline-back')?.click());
    await page.waitForTimeout(700);
  };

  await enterGroup('账户与安全');
  const sec = await page.evaluate(() => ({
    title: document.querySelector('.gs-inline-title')?.textContent,
    rowCount: document.querySelectorAll('.gs-row').length,
    heights: [...document.querySelectorAll('.gs-row')].map((r) =>
      Math.round(r.getBoundingClientRect().height),
    ),
    inRowDesc: document.querySelectorAll('.gs-row .gs-desc').length,
    footnotes: [...document.querySelectorAll('.gs-footnote')].map((n) => n.textContent.trim()),
  }));
  assert(
    `C[${theme}]：二级页每行都是单行 44px（行内无副标题）`,
    sec.inRowDesc === 0 && sec.heights.every((h) => Math.abs(h - 44) <= 1),
    `desc=${sec.inRowDesc} heights=${sec.heights.join(',')}`,
  );
  assert(
    `C[${theme}]：多行卡**不出**脚注（出脚注会指错对象）`,
    sec.footnotes.length === 0,
    sec.footnotes.join(' / ') || '(none)',
  );

  // 进「数据」（2 行，也不该有脚注）
  await leaveGroup();
  await enterGroup('数据');
  const data = await page.evaluate(() => ({
    rows: document.querySelectorAll('.gs-row').length,
    footnotes: document.querySelectorAll('.gs-footnote').length,
  }));
  assert(
    `C[${theme}]：2 行卡同样不出脚注`,
    data.footnotes === 0,
    `rows=${data.rows} foot=${data.footnotes}`,
  );
  await leaveGroup();

  // 进「通用」测主题就地展开
  await enterGroup('通用');
  const beforeExpand = await page.evaluate(() => ({
    rows: document.querySelectorAll('.gs-row').length,
    opts: document.querySelectorAll('.gs-mail-freq-option').length,
    title: document.querySelector('.gs-inline-title')?.textContent,
  }));
  assert(`C[${theme}]：主题展开前没有选项行`, beforeExpand.opts === 0, `opts=${beforeExpand.opts}`);

  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.gs-row')].find(
      (x) => x.querySelector('.gs-label')?.textContent.trim() === '主题设置',
    );
    r?.click();
  });
  await page.waitForTimeout(800);
  const afterExpand = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('.gs-mail-freq-option')].map((r) => ({
      label: r.querySelector('.gs-label')?.textContent.trim(),
      checked: !!r.querySelector('.gs-icon.is-green'),
      /* ⚠️ 取 svg 的 class（`lucide-moon-icon` 这类），不能取 outerHTML 前 N 个字符 ——
         所有 lucide svg 都以 `<svg data-v-xxx xmlns=... width=16` 开头，
         截前 40 字符会全部相同，让「图标互不相同」这条断言**恒假红**
         （实测踩过：图标其实是 check/moon/monitor/cat/cake 五个不同的）。 */
      icon: r.querySelector('.gs-icon svg')?.getAttribute('class') || '',
    })),
    title: document.querySelector('.gs-inline-title')?.textContent,
    url: window.location.hash,
  }));
  assert(
    `C[${theme}]：点主题行**就地**展开 5 个选项`,
    afterExpand.opts.length === 5,
    afterExpand.opts.map((o) => o.label).join('/'),
  );
  assert(
    `C[${theme}]：就地展开后**没有离开**当前页（标题仍是「通用」）`,
    afterExpand.title === '通用',
    afterExpand.title,
  );
  assert(
    `C[${theme}]：展开的选项恰好一个带勾（当前主题）`,
    afterExpand.opts.filter((o) => o.checked).length === 1,
    `勾=${
      afterExpand.opts
        .filter((o) => o.checked)
        .map((o) => o.label)
        .join(',') || '无'
    }`,
  );
  assert(
    `C[${theme}]：选项图标互不相同（不能 5 个都画同一个灰点）`,
    new Set(afterExpand.opts.map((o) => o.icon)).size >= 4,
    `唯一图标数=${new Set(afterExpand.opts.map((o) => o.icon)).size}`,
  );
  await leaveGroup();
};

/* ---------- 竖屏子页沉浸态 + 极简页头（2026-11-24 用户口径） ----------
   用户原话：「返回和 title 也需要这么极简，类似当前的设置和返回按钮，不要条，
   然后二级三级页面都要占满屏幕，不挂导航栏了，做好适配和过渡动画，横屏还是挂导航栏的。」

   要锁四件事：
     ① 页头**没有底板**（旧版是白色胶囊：background + backdrop-filter + 圆角）
     ② 返回是**圆形按钮**（首页那颗），标题**居中**、17px —— 与首页页头同一套骨架
     ③ 竖屏进子页后**导航岛不再渲染**，顶部留白随之归零（否则白留一道 78px 空档）
     ④ 返回按钮与卡片左缘对齐（页头内缩 16 后，三个"内容根无 .gs-card"的面板
        必须自己补 16px，否则卡片贴屏幕边、按钮缩进一格）
   ⚠️ 不能只在二级页测：三级表单（修改密码）走的是 inlinePanel 分支，
      另一条渲染路径，页头是同一个组件但挂载点不同。 */
const assertImmersiveSubpage = async (page, theme) => {
  const read = () =>
    page.evaluate(() => {
      const cs = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), top: Math.round(b.top), w: Math.round(b.width) };
      };
      const bar = document.querySelector('.gs-inline-bar');
      const title = document.querySelector('.gs-inline-title');
      const shell = document.querySelector('.profile-subpage-shell');
      return {
        island: !!document.getElementById('unified-nav-container'),
        shellPadTop: shell ? Math.round(parseFloat(getComputedStyle(shell).paddingTop) || 0) : null,
        barBg: cs('.gs-inline-bar', 'backgroundColor'),
        barRadius: cs('.gs-inline-bar', 'borderTopLeftRadius'),
        barShadow: cs('.gs-inline-bar', 'boxShadow'),
        backRadius: cs('.gs-inline-back', 'borderTopLeftRadius'),
        backW: cs('.gs-inline-back', 'width'),
        titleAlign: cs('.gs-inline-title', 'textAlign'),
        titleSize: cs('.gs-inline-title', 'fontSize'),
        titleText: title?.textContent?.trim(),
        back: rect('.gs-inline-back'),
        card: rect('.gs-main .gs-row') || rect('.gs-main .gs-card'),
        barW: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        innerW: window.innerWidth,
      };
    });

  const enterGroup = async (label) => {
    await page.evaluate((l) => {
      const r = [...document.querySelectorAll('.gs-row')].find(
        (x) => x.querySelector('.gs-label')?.textContent.trim() === l,
      );
      r?.click();
    }, label);
    await page.waitForTimeout(800);
  };
  /* 本函数自己的返回动作（assertSecondaryRowPattern 里的同名函数在别的作用域） */
  const leaveGroup = async () => {
    await page.evaluate(() => document.querySelector('.gs-inline-back')?.click());
    await page.waitForTimeout(700);
  };

  // ① 二级页
  await enterGroup('账户与安全');
  const sec = await read();
  assert(
    `H[${theme}]：二级页页头**没有底板**（背景透明 / 无圆角 / 无投影）`,
    sec.barBg === 'rgba(0, 0, 0, 0)' && sec.barRadius === '0px' && sec.barShadow === 'none',
    `bg=${sec.barBg} radius=${sec.barRadius} shadow=${sec.barShadow}`,
  );
  assert(
    `H[${theme}]：返回是**圆形按钮**（border-radius 50%、40px）`,
    sec.backRadius === '50%' && sec.backW === '40px',
    `radius=${sec.backRadius} w=${sec.backW}`,
  );
  assert(
    `H[${theme}]：标题**居中**且 17px（与首页页头同档）`,
    sec.titleAlign === 'center' && sec.titleSize === '17px',
    `align=${sec.titleAlign} size=${sec.titleSize}`,
  );
  assert(
    `H[${theme}]：竖屏进子页后**导航岛不再渲染**`,
    sec.island === false,
    `island=${sec.island}`,
  );
  assert(
    `H[${theme}]：导航岛卸载后顶部留白归零（不留 78px 空档）`,
    sec.shellPadTop !== null && sec.shellPadTop <= 12,
    `padding-top=${sec.shellPadTop}px`,
  );
  assert(
    `H[${theme}]：返回按钮与首行左缘对齐（差 ≤1px）`,
    sec.back && sec.card && Math.abs(sec.back.left - sec.card.left) <= 1,
    `back=${sec.back?.left} card=${sec.card?.left}`,
  );

  // ② 三级表单（inlinePanel 分支，另一条渲染路径）
  await leaveGroup();
  await enterGroup('账户与安全');
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.gs-row')].find(
      (x) => x.querySelector('.gs-label')?.textContent.trim() === '修改密码',
    );
    r?.click();
  });
  await page.waitForTimeout(900);
  const third = await read();
  assert(
    `H[${theme}]：三级表单页头同样极简（无底板 + 圆形返回 + 居中标题）`,
    third.barBg === 'rgba(0, 0, 0, 0)' &&
      third.backRadius === '50%' &&
      third.titleAlign === 'center' &&
      third.titleSize === '17px',
    `bg=${third.barBg} back=${third.backRadius} align=${third.titleAlign} size=${third.titleSize}`,
  );
  assert(
    `H[${theme}]：三级表单标题取自表单名（${third.titleText}）`,
    third.titleText === '修改密码',
    third.titleText,
  );
  assert(
    `H[${theme}]：三级表单里导航岛同样不渲染`,
    third.island === false,
    `island=${third.island}`,
  );
  await page.evaluate(() => document.querySelector('.gs-inline-back')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.gs-inline-back')?.click());
  await page.waitForTimeout(700);
};

/* ---------- 横屏必须**保留**导航岛（用户：「横屏还是挂导航栏的」） ----------
   ⚠️ 必须独立开 context：同页 setViewportSize 后 matchMedia 的 change 不保证及时，
      断言会跑在"其实还是竖屏"的环境里（B 层降级断言踩过这个坑，假绿过一轮）。
   也先断言「两栏真的生效」，否则"岛在"可能只是因为压根没进子页。 */
const assertLandscapeKeepsIsland = async (browser, theme) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/#/user-space?tab=settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await injectLogin(page);
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.gs-nav-item')].find(
      (x) => x.textContent.trim() === '账户与安全',
    );
    item?.click();
  });
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    const back = document.querySelector('.gs-inline-back');
    return {
      twoPane: !!document.querySelector('.glass-settings.is-two-pane'),
      island: !!document.getElementById('unified-nav-container'),
      shellPadTop: Math.round(
        parseFloat(getComputedStyle(document.querySelector('.profile-subpage-shell')).paddingTop) ||
          0,
      ),
      backRadius: back ? getComputedStyle(back).borderTopLeftRadius : null,
      titleAlign: getComputedStyle(document.querySelector('.gs-inline-title')).textAlign,
    };
  });
  assert(`H[${theme}]：横屏确实是两栏（前置条件）`, m.twoPane === true, `twoPane=${m.twoPane}`);
  assert(
    `H[${theme}]：横屏进子页**仍然挂导航岛**（用户：「横屏还是挂导航栏的」）`,
    m.island === true,
    `island=${m.island}`,
  );
  assert(
    `H[${theme}]：横屏留白保留岛高（不是 0）`,
    m.shellPadTop >= 60,
    `padding-top=${m.shellPadTop}px`,
  );
  assert(
    `H[${theme}]：横屏页头同样极简（圆形返回 + 居中标题）`,
    m.backRadius === '50%' && m.titleAlign === 'center',
    `back=${m.backRadius} align=${m.titleAlign}`,
  );
  /* 三级表单：会写 URL（?view=account-security），此时导航岛由**路由判据**隐藏 ——
     但横屏按用户口径必须保留，所以这条要单独验。改前这里踩过一个真 bug：
     留白被「子页归零」逻辑压成 0，而岛其实还在 ⇒ 胶囊直接压在右栏页头上。 */
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.gs-row')].find(
      (x) => x.querySelector('.gs-label')?.textContent.trim() === '修改密码',
    );
    r?.click();
  });
  await page.waitForTimeout(1100);
  const third = await page.evaluate(() => ({
    island: !!document.getElementById('unified-nav-container'),
    pad: Math.round(
      parseFloat(getComputedStyle(document.querySelector('.profile-subpage-shell')).paddingTop) ||
        0,
    ),
    title: document.querySelector('.gs-inline-title')?.textContent?.trim(),
  }));
  assert(
    `H[${theme}]：横屏三级表单**岛与留白同时成立**（岛压页头 = 真 bug）`,
    !third.island || third.pad >= 60,
    `island=${third.island} padding-top=${third.pad}px`,
  );
  await context.close();
};

// 返回按钮可按性体检：滚到中部后对按钮中心做 elementFromPoint 命中测试
const hitTestBack = async (page, label) => {
  const btn = page.locator('.user-center-back-btn').first();
  const count = await btn.count();
  if (!count) {
    console.log(`[${label}] 无返回按钮（可能 showBack=false）`);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(400);
  const info = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const chain = [];
    let node = hit;
    while (node && chain.length < 4) {
      chain.push(
        `${node.tagName?.toLowerCase?.()}.${String(node.className?.baseVal ?? node.className ?? '')
          .split(' ')
          .slice(0, 2)
          .join('.')}`,
      );
      node = node.parentElement;
    }
    return {
      rect: {
        top: Math.round(r.top),
        left: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      hitIsInside: el.contains(hit) || hit === el,
      hitChain: chain,
      scrollY: window.scrollY,
      stickyTop: getComputedStyle(el.closest('.user-center-page-header') || el).top,
      position: getComputedStyle(el.closest('.user-center-page-header') || el).position,
    };
  });
  console.log(
    `[${label}] back btn rect=${JSON.stringify(info.rect)} scrollY=${info.scrollY} pos=${info.position} stickyTop=${info.stickyTop} 命中自身=${info.hitIsInside} 命中链=${info.hitChain.join(' < ')}`,
  );
};

// ---------- 1. 设置主页（竖屏，明暗） ----------
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await page.goto(`${BASE}/#/user-space?tab=settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await injectLogin(page);
  await shot(page, `设置主页-${theme}`, `settings-home-${theme}.png`);
  // 验证邮箱行
  const emailRow = await page.getByText('登录邮箱').count();
  const emailValue = await page.getByText('ryyik@bohrite.example.com').count();
  console.log(
    `[settings-home-${theme}] 登录邮箱行: ${emailRow > 0 ? 'OK' : 'MISSING'}, 邮箱值: ${emailValue > 0 ? 'OK' : 'MISSING'}`,
  );
  // ⚠️ 骨架断言（组间留白 ≥20 / 分隔线内缩）量的是**桌面档**几何 ——
  // 宽视口仍 <1024 且竖屏 ⇒ 不进两栏，但组间 gap 是 26（竖屏 14）。
  // 2026-11-24 起竖屏**不再拍平**（radius 20 / 内缩 16 / 单行 44），
  // 那一档由下面的 assertPortraitCardGeometry 单独锁 —— 两者都要过。
  // 420 竖屏截图照常拍，量骨架前把视口放宽到 800。
  if (theme === 'light') {
    await assertPortraitCardGeometry(page, theme);
    await assertAccountRowDemotion(page, theme);
    await assertSecondaryRowPattern(page, theme);
    await assertImmersiveSubpage(page, theme);
    await assertDesktopKeepsIdentity(browser, theme);
    await assertLandscapeKeepsIsland(browser, theme);
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(500);
    await assertSettingsCardAndSearch(page);
  }
  await context.close();
}

// ---------- 2. 设置主页横屏 ----------
{
  const { context, page } = await newPage({ viewport: { width: 844, height: 420 } });
  await page.goto(`${BASE}/#/user-space?tab=settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await injectLogin(page);
  await shot(page, '设置主页-横屏', 'settings-home-landscape-light.png');
  await context.close();
}

// ---------- 3. 通知设置页（明暗 + 横屏） ----------
// 2026-11-10：Pushplus 下线，这一页现在是「应用内推送 / 邮件 / 审核 / 生日」四个开关，
// 根容器类名同步改成 .notification-settings（页面在暗色主题里的钩子是 .notification-settings-page）。
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await loginThenGo(page, '#/user-space/pushplus-settings?from=userspace-settings');
  await shot(page, `通知设置-${theme}`, `notification-settings-${theme}.png`);
  const panel = await page.locator('.notification-settings .glass-settings').count();
  console.log(`[notification-settings-${theme}] 玻璃面板: ${panel > 0 ? 'OK' : 'MISSING'}`);
  await hitTestBack(page, `notification-settings-${theme}`);
  await context.close();
}
{
  const { context, page } = await newPage({ viewport: { width: 844, height: 420 } });
  await loginThenGo(page, '#/user-space/pushplus-settings?from=userspace-settings');
  await shot(page, '通知设置-横屏', 'notification-settings-landscape-light.png');
  await context.close();
}

// ---------- 4. 账户与隐私（2026-10-26 起在设置页右栏内展开，不再独立开页） ----------
// ⚠️ 判据换成右栏返回条 `.gs-inline-back`（旧页头已撤）：子页开着时它必须存在且可点。
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await loginThenGo(page, '#/user-space?tab=settings&view=account-security');
  await shot(page, `账户与隐私-更换邮箱-${theme}`, `account-security-${theme}.png`);
  const inlineTitle = await page
    .locator('.gs-inline-title')
    .innerText()
    .catch(() => '');
  const backCount = await page.locator('.gs-inline-back').count();
  console.log(
    `[account-security-${theme}] 右栏子页标题: ${inlineTitle || 'MISSING'} / 返回条: ${backCount ? 'OK' : 'MISSING'}`,
  );
  await hitTestBack(page, `account-security-${theme}`);
  // 返回条 → 一级首页，经「账户与安全」组页点「修改密码」进改密面板
  //   （2026-11-10 层级定稿：一级组 → 二级组页 → 三级表单）
  await page.locator('.gs-inline-back').first().click();
  await page.waitForTimeout(500);
  await page.getByText('账户与安全').first().click();
  await page.waitForTimeout(600);
  await page.getByText('修改密码').first().click();
  await page.waitForTimeout(700);
  await shot(page, `账户与隐私-改密面板-${theme}`, `account-security-password-${theme}.png`);
  await context.close();
}

// ---------- 5. 数据导出 / 数据与隐私 ----------
{
  const { context, page } = await newPage({ theme: 'light' });
  await page.goto(`${BASE}/#/user-space?tab=settings&view=data-export`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await injectLogin(page);
  await shot(page, '数据导出-light', 'data-export-light.png');
  await hitTestBack(page, 'data-export');
  await page.goto(`${BASE}/#/user-space?tab=settings&view=data-management`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  await shot(page, '数据与隐私-light', 'data-management-light.png');
  await context.close();
}

await browser.close();

const missingShots = results.filter((r) => !r.path);
console.log(`\n完成 ${results.length - missingShots.length}/${results.length} 张截图`);
for (const r of results) console.log(`  ${r.name}: ${r.path}`);

const failedAssertions = assertions.filter((a) => !a.ok);
if (failedAssertions.length) {
  console.error(`\n❌ 断言失败 ${failedAssertions.length}/${assertions.length}`);
  for (const a of failedAssertions) console.error(`   - ${a.name}`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ 断言全通过 ${assertions.length}/${assertions.length}`);
}
