/**
 * probe-profile-post-card-dark.mjs — 个人主页 / 他人空间「帖子卡片」暗色可读性实测
 *
 * 用户报障（2026-10-19）：暗色模式下 /user-space?tab=posts 的作品格卡片**底色仍是白**，
 * 而标题/摘要用的是 var(--text-primary)（暗色下接近纯白）⇒ 白底白字，字看不见。
 * 同一份卡片样式有两个宿主：
 *   A. 我的 → 内容 → 空间   /user-space?tab=posts         （ProfileHomePanel.vue，scoped）
 *   B. 他人空间              /profile/:username           （ProfileMain.vue + profile-base.css）
 * 断言必须**两个宿主都量**：只测 A 会漏掉 B（B 的暗色覆盖写在另一个文件里），
 * 只测 B 会漏掉 A（A 的卡片底色写在 scoped 里、优先级压过全局 base）。
 *
 * 判据是**实测对比度**，不是「有没有那条 CSS」：
 *   ① 卡片实际计算底色（含父级叠加）必须是暗色（相对亮度 < 0.3）；
 *   ② 标题文字与卡片底色的 WCAG 对比度 ≥ 4.5（正文）、≥ 3.0（次要信息，12~13px 粗体）；
 *   ③ 浅色模式仍是白底深字（对比度同样达标）—— 防止把亮色一起改坏。
 *
 * ⚠️ 实测踩坑（本探针自己踩过的，改断言前先读）：
 *   1) `elementFromPoint` 拿不到「实际底色」：卡片底色可能来自祖先（透明卡片坐在面板上），
 *      所以底色解析要**逐级向上叠**到第一个不透明背景为止，不能只读卡片自己的 backgroundColor。
 *   2) scoped CSS 的 `[data-v-*]` 会让选择器特异性 +1 —— `.profile-post-card` 本地规则会
 *      压过全局 `.user-space-page[data-theme='dark'] .profile-post-card`，所以修法不能只写全局。
 *   3) 探针里伪造登录（pinia 注入）有 2 分钟心跳会打回未登录 ⇒ 每次测量前幂等补打。
 *   4) 帖子数据必须 route mock：真实库里「我的帖子」可能是空的，空网格会让断言空过。
 *
 * 用法：
 *   npm run dev            # 或 npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/probes/probe-profile-post-card-dark.mjs [baseUrl]
 *   退出码：0 = 全绿；1 = 有 FAIL。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const ADMIN_ID = '00000000-0000-4000-8000-00000000beef';
const TARGET_USERNAME = '方块之家';
/* 代表作置顶只认 UUID（normalizeShowcasePostIds 会丢弃非 UUID），
   所以第一条 mock 帖子用真 UUID；非 UUID 会让 showcase 段整段不渲染，
   对应断言变成「null 跳过」= 永远绿。 */
const SHOWCASE_POST_ID = '00000000-0000-4000-8000-0000000000a1';
const TARGET_ID = '00000000-0000-4000-8000-0000000000aa';

const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * 864e5).toISOString();

/* ---------- mock 数据：4 条帖子，2 条有封面、2 条纯文本（纯文本是报障图里的那种） ---------- */
const POSTS = [
  {
    id: SHOWCASE_POST_ID,
    title: '大家平时现在有什么照片呢？',
    content: '周末去公园拍了一下午，光线刚刚好，顺手整理了几张。',
    body: '',
    author_id: TARGET_ID,
    author_username: TARGET_USERNAME,
    created_at: iso(1),
    like_count: 3,
    comment_count: 1,
    images: [],
    forum_post_images: [],
    moderation_status: 'approved',
    status: 'approved',
  },
  {
    id: 'mock-post-2',
    title: '没想到今年最后一个节假日这么快',
    content: '国庆都没咋玩，每个人都有自己的生活吧！（不是） 好累，返校要…',
    body: '',
    author_id: TARGET_ID,
    author_username: TARGET_USERNAME,
    created_at: iso(2),
    like_count: 2,
    comment_count: 0,
    images: [],
    forum_post_images: [],
    moderation_status: 'approved',
    status: 'approved',
  },
  {
    id: 'mock-post-3',
    title: '晚上要去亲戚家吃饭',
    content: '明天家里还要来客人，还那个晚…',
    body: '',
    author_id: TARGET_ID,
    author_username: TARGET_USERNAME,
    created_at: iso(3),
    like_count: 3,
    comment_count: 2,
    images: [],
    forum_post_images: [
      {
        id: 'img-1',
        url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjUwMCIgZmlsbD0iIzg3ODc4NyIvPjwvc3ZnPg==',
        public_id: null,
        width: 800,
        height: 500,
        format: 'svg',
        sort_order: 0,
        moderation_status: 'approved',
      },
    ],
    moderation_status: 'approved',
    status: 'approved',
  },
  {
    id: 'mock-post-4',
    title: '2026BQ20 for!',
    content: '我只有没课的时候才不是早八',
    body: '',
    author_id: TARGET_ID,
    author_username: TARGET_USERNAME,
    created_at: iso(4),
    like_count: 1,
    comment_count: 0,
    images: [],
    forum_post_images: [],
    moderation_status: 'approved',
    status: 'approved',
  },
];

const PROFILE = {
  id: TARGET_ID,
  username: TARGET_USERNAME,
  bio: '这个人很认真地搭着自己的方块。',
  avatar_url: '',
  avatar_frame_url: '',
  join_date: iso(400),
  points: 1200,
  birth_month: 6,
  birth_day: 18,
  experience: 320,
  tags: [],
  role: 'user',
  is_boh_creator: false,
  creator_platform_ids: [],
  creator_platform_visibility: {},
  creator_platform_order: [],
  showcase_post_ids: [SHOWCASE_POST_ID],
  last_active_at: iso(0),
  hide_online_status: false,
  hide_follow_data: false,
  profile_background_url: '',
  profile_background_public_id: '',
  points_card_skin: 'default',
  points_card_image_url: '',
  points_card_image_public_id: '',
};

/* Cloud+ 笔记也进同一个作品格（无封面 → 文字封面 + 同样的 copy 区），
   所以暗色缺口必须一起量：只测帖子卡会放过「纯文字笔记卡白底白字」。 */
const CLOUD_NOTE = {
  id: 'mock-note-1',
  user_id: TARGET_ID,
  entry_date: iso(5).slice(0, 10),
  legacy_note_date: null,
  title: '山野徒步小记',
  entry_type: 'note',
  visibility: 'public',
  content_text: '今天的风很大，走完十公里之后整个人都空了，但抬头看到云的时候又觉得值得。',
  content_blocks: [
    { id: 'blk-1', type: 'text', text: '今天的风很大，走完十公里之后整个人都空了。' },
  ],
  cover_image_url: '',
  mood: 'calm',
  source: 'manual',
  created_at: iso(5),
  updated_at: iso(5),
};

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * 请求 mock：只拦数据接口，静态资源全放行。
 * ⚠️ 同一 path 只注册一条 route（逆序匹配，catch-all 要最先注册）。
 */
const setupRoutes = async (page) => {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/rest/v1/', '');
    const headers = { 'content-range': 'results 0-3/4' };

    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      return route.fulfill({ status: 204, headers, body: '' });
    }
    if (path.startsWith('rpc/')) return json(route, []);
    if (path.startsWith('profiles')) {
      if (url.searchParams.get('username') === `eq.${TARGET_USERNAME}`) return json(route, PROFILE);
      return json(route, PROFILE);
    }
    if (path.startsWith('posts')) return json(route, POSTS);
    if (path.startsWith('post_likes') || path.startsWith('likes')) return json(route, []);
    if (path.startsWith('comments')) return json(route, []);
    if (path.startsWith('follows')) return json(route, []);
    if (path.startsWith('user_impressions')) return json(route, []);
    if (path.includes('boh_cloud_entries')) return json(route, [CLOUD_NOTE]);
    if (path.includes('notifications')) return json(route, []);
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '[]' });
  });
  // functions（热力图等）：直接给空数组，避免真实网络
  await page.route('**/functions/v1/**', (route) => json(route, []));
};

/**
 * 伪造登录（项目既有口径）：注入 pinia，**不种** sb-*-auth-token。
 * ⚠️ setup-store 的状态挂在 `$pinia.state.value.auth`，action 在 `$pinia._s.get('auth')` 上；
 *    `_s.get('auth')` 上暴露的是 **ref**，所以直接给 `s.isLoggedIn` 赋值不会解包 ——
 *    必须走 `.value`，否则 isLoggedIn 仍是 false（页面显示「未登录」，卡片网格根本挂不出来）。
 */
const login = async (page, uid) => {
  const ok = await page.evaluate((id) => {
    const app = document.querySelector('#app');
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    if (!pinia) return false;
    const store = pinia._s.get('auth');
    const s = pinia.state.value.auth;
    if (!store || !s) return false;
    if (store.isLoggedIn && typeof store.isLoggedIn === 'object') store.isLoggedIn.value = true;
    else if (store.isLoggedIn !== undefined) store.isLoggedIn = true;
    if (store.isInitialized && typeof store.isInitialized === 'object')
      store.isInitialized.value = true;
    else if (store.isInitialized !== undefined) store.isInitialized = true;
    if (!s.userInfo) s.userInfo = {};
    Object.assign(s.userInfo, {
      id,
      username: '方块之家',
      role: 'user',
      avatarUrl: '',
      points: 1200,
      bio: '这个人很认真地搭着自己的方块。',
      joinDate: '2024-06-18',
    });
    return true;
  }, uid);
  return ok;
};

/** 补打登录态直到「我的空间」真的渲染出卡片网格（自带重试，防心跳打回未登录） */
const ensureOwnSpaceCards = async (page, uid) => {
  for (let i = 0; i < 8; i++) {
    await login(page, uid);
    const has = await page.evaluate(
      () => document.querySelectorAll('.content-home-host .profile-post-card').length > 0,
    );
    if (has) return true;
    await page.waitForTimeout(600);
  }
  return false;
};

/* ---------- 实测函数：在页面里取卡片底色 + 文字色 + 对比度 ---------- */
const MEASURE_FN = ({ cardSel, titleSel, textSel, metaSel, coverSel }) => {
  const parse = (s) => {
    const raw = String(s || '').trim();
    /* ⚠️ 必须同时吃 `color(srgb r g b / a)`：`color-mix()` 在 Chrome 里的
       computed value 就是这个格式（不是 rgb()）。只认 rgba() 会让所有
       color-mix 出来的字色读成 null，断言变成 "null on #... = null" 假红
       （2026-10-20 实测：徽标/删除按钮修好后反而报 null）。 */
    const srgb = /^color\(srgb\s+([^)]+)\)$/i.exec(raw);
    if (srgb) {
      const p = srgb[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
      // srgb 的 0..1 归一到 0..255，与 rgb() 分支共用后面的亮度计算
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    const m = /rgba?\(([^)]+)\)/.exec(raw);
    if (!m) return null;
    const p = m[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map((x) => parseFloat(x));
    if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    const a = top.a;
    const mix = (t, b) => Math.round(t * a + b * (1 - a));
    return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
  };
  /** 逐级向上叠到第一个不透明背景（透明卡片坐在面板上的情形很常见） */
  const effectiveBg = (el) => {
    const chain = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.01) {
        chain.push(c);
        if (c.a >= 0.99) break;
      }
      node = node.parentElement;
    }
    // 从最外层往里叠
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) base = over(chain[i], base);
    return base;
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const x = Math.max(a, b);
    const y = Math.min(a, b);
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (c) =>
    '#' +
    [c.r, c.g, c.b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');

  const cards = [...document.querySelectorAll(cardSel)];
  const rows = cards.slice(0, 6).map((card, idx) => {
    const bg = effectiveBg(card);
    const title = card.querySelector(titleSel);
    const text = card.querySelector(textSel);
    const meta = card.querySelector(metaSel);
    const read = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const color = parse(cs.color);
      const size = parseFloat(cs.fontSize) || 14;
      const weight = Number(cs.fontWeight) || 400;
      // 文字自身若带半透明，先叠到卡片底色上
      const solid = color ? (color.a < 0.99 ? over(color, bg) : color) : null;
      const elBg = effectiveBg(el);
      return {
        text: (el.textContent || '').trim().slice(0, 24),
        color: color ? hex(solid) : null,
        bg: hex(elBg),
        alpha: color ? color.a : null,
        fontSize: size,
        fontWeight: weight,
        contrast: solid ? Number(ratio(lum(solid), lum(elBg)).toFixed(2)) : null,
      };
    };
    return {
      idx,
      cardBg: hex(bg),
      cardLum: Number(lum(bg).toFixed(3)),
      hasCover: !!card.querySelector(coverSel),
      title: read(title),
      text: read(text),
      meta: read(meta),
      /* 卡片内的次级元素：它们各自有写死的字色（公开徽标 / 笔记动作按钮 / 置顶按钮），
         和卡片底色一样会踩「白底近白字」，所以一并量。 */
      badge: read(card.querySelector('.profile-note-public-badge')),
      actionPrimary: read(card.querySelector('.profile-note-action-btn:not(.danger)')),
      actionDanger: read(card.querySelector('.profile-note-action-btn.danger')),
      pin: read(card.querySelector('.pin-post-btn')),
    };
  });
  // 卡片外的同类按钮（加载更多）
  const readEl = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const color = parse(cs.color);
    if (!color) return null;
    const bgEl = effectiveBg(el);
    const solid = color.a < 0.99 ? over(color, bgEl) : color;
    return {
      text: (el.textContent || '').trim().slice(0, 16),
      color: hex(solid),
      bg: hex(bgEl),
      contrast: Number(ratio(lum(solid), lum(bgEl)).toFixed(2)),
    };
  };
  const extra = {
    loadMore: (() => {
      const btn = document.querySelector('.profile-load-more-btn, .load-more-btn');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      const color = parse(cs.color);
      const bgEl = effectiveBg(btn);
      return {
        text: (btn.textContent || '').trim().slice(0, 16),
        color: color ? hex(color) : null,
        bg: hex(bgEl),
        contrast: color ? Number(ratio(lum(color), lum(bgEl)).toFixed(2)) : null,
      };
    })(),
    /* 代表作置顶（只在「他人空间」有）：同一条数据层的卡片语言，
       亮色写死 #0f1419/#536471，暗色底 #1a1a24 上等于隐形（2026-10-20 实测 1.07:1）。 */
    showcaseTitle: readEl('.showcase-item-header h4'),
    showcaseText: readEl('.showcase-item p'),
    showcaseHeader: readEl('.showcase-header h3'),
  };
  return { count: cards.length, rows, extra };
};

const launch = async (theme) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('boh-theme', t);
      localStorage.setItem('boh-theme-mode', t);
    } catch {
      /* ignore */
    }
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await setupRoutes(page);
  return { browser, context, page, errors };
};

const gotoHash = async (page, hash) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
};

/* ---------- A：我的空间（/user-space?tab=posts） ---------- */
const measureOwnSpace = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  await login(page, ADMIN_ID);
  await page.waitForTimeout(600);
  // 让「空间」分段成为当前档位（默认可能是别的档）
  const switched = await page
    .evaluate(() => {
      const tabs = [
        ...document.querySelectorAll('.content-shell .segment-tab, .content-shell [role="tab"]'),
      ];
      const target = tabs.find((el) => /空间/.test(el.textContent || ''));
      if (target) {
        target.click();
        return true;
      }
      return false;
    })
    .catch(() => false);
  if (!switched) {
    // 兜底：直接给 hash 带上分段参数
    await gotoHash(page, '#/user-space?tab=posts');
  }
  const ready = await ensureOwnSpaceCards(page, ADMIN_ID);
  if (!ready) {
    const diag = await page.evaluate(() => ({
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
      loggedIn: !!document.querySelector('.login-prompt'),
      cards: document.querySelectorAll('.profile-post-card').length,
    }));
    console.log('[probe] 我的空间未渲染卡片，诊断：', JSON.stringify(diag));
  }
  await page.waitForTimeout(800);
  // 截图要对准作品格本身（首屏是 hero，卡片在下面，截首屏等于没截）
  await page
    .evaluate(() => {
      document
        .querySelector('.content-home-host .profile-post-grid')
        ?.scrollIntoView({ block: 'center' });
    })
    .catch(() => {});
  await page.waitForTimeout(500);
  const measured = await page.evaluate(MEASURE_FN, {
    cardSel: '.content-home-host .profile-post-card',
    titleSel: '.profile-post-copy h3',
    textSel: '.profile-post-copy p',
    metaSel: '.profile-post-meta',
    coverSel: '.profile-post-cover',
  });
  const themeAttr = await page.evaluate(() => {
    const el = document.querySelector('.user-space-page');
    return {
      page: el?.getAttribute('data-theme'),
      html: document.documentElement.getAttribute('data-theme'),
    };
  });
  return { measured, themeAttr };
};

/* ---------- B：他人空间（/profile/:username） ---------- */
const measureVisitorSpace = async (page) => {
  await gotoHash(page, `#/profile/${encodeURIComponent(TARGET_USERNAME)}`);
  await page.waitForSelector('.profile-page', { timeout: 25000 }).catch(() => null);
  await page.waitForTimeout(1500);
  await page
    .evaluate(() => {
      document
        .querySelector('.profile-page .profile-post-grid')
        ?.scrollIntoView({ block: 'center' });
    })
    .catch(() => {});
  await page.waitForTimeout(500);
  const measured = await page.evaluate(MEASURE_FN, {
    cardSel: '.profile-page .profile-post-card',
    titleSel: '.profile-post-copy h3',
    textSel: '.profile-post-copy p',
    metaSel: '.profile-post-meta',
    coverSel: '.profile-post-cover',
  });
  const themeAttr = await page.evaluate(() => {
    const el = document.querySelector('.profile-page');
    return {
      page: el?.getAttribute('data-theme'),
      html: document.documentElement.getAttribute('data-theme'),
    };
  });
  return { measured, themeAttr };
};

const assertReadable = (label, { measured, themeAttr }, theme) => {
  const { count, rows } = measured;
  check(
    `${label} · 卡片渲染`,
    count > 0,
    `count=${count} pageTheme=${themeAttr.page} htmlTheme=${themeAttr.html}`,
  );
  if (!count) return;
  const dark = theme === 'dark';
  rows.forEach((r) => {
    const tag = `${label}[${r.idx}]`;
    if (dark) {
      check(`${tag} · 卡片底色是暗色`, r.cardLum < 0.3, `bg=${r.cardBg} lum=${r.cardLum}`);
    } else {
      check(`${tag} · 浅色下卡片底色是亮色`, r.cardLum > 0.6, `bg=${r.cardBg} lum=${r.cardLum}`);
    }
    if (r.title) {
      check(
        `${tag} · 标题对比度 ≥ 4.5`,
        r.title.contrast >= 4.5,
        `「${r.title.text}」 ${r.title.color} on ${r.cardBg} = ${r.title.contrast}`,
      );
    }
    if (r.text) {
      check(
        `${tag} · 摘要对比度 ≥ 4.5`,
        r.text.contrast >= 4.5,
        `「${r.text.text}」 ${r.text.color} on ${r.cardBg} = ${r.text.contrast}`,
      );
    }
    if (r.meta) {
      check(
        `${tag} · 元信息对比度 ≥ 3.0`,
        r.meta.contrast >= 3.0,
        `「${r.meta.text}」 ${r.meta.color} on ${r.cardBg} = ${r.meta.contrast}`,
      );
    }
    // 次级控件（徽标 / 笔记动作 / 置顶）：小字 + 彩色，阈值按 3.0
    [
      ['公开徽标', r.badge],
      ['笔记动作', r.actionPrimary],
      ['删除动作', r.actionDanger],
      ['置顶按钮', r.pin],
    ].forEach(([name, node]) => {
      if (!node) return;
      check(
        `${tag} · ${name}对比度 ≥ 3.0`,
        node.contrast >= 3.0,
        `「${node.text}」 ${node.color} on ${node.bg} = ${node.contrast}`,
      );
    });
  });
  if (measured.extra?.loadMore) {
    const lm = measured.extra.loadMore;
    check(
      `${label} · 加载更多对比度 ≥ 4.5`,
      lm.contrast >= 4.5,
      `「${lm.text}」 ${lm.color} on ${lm.bg} = ${lm.contrast}`,
    );
  }
  // 代表作置顶（仅他人空间）：有就量，没有就跳过（我的空间不渲染这一段）
  [
    ['代表作标题', measured.extra?.showcaseHeader],
    ['代表作卡标题', measured.extra?.showcaseTitle],
    ['代表作卡摘要', measured.extra?.showcaseText],
  ].forEach(([name, node]) => {
    if (!node) return;
    check(
      `${label} · ${name}对比度 ≥ 4.5`,
      node.contrast >= 4.5,
      `「${node.text}」 ${node.color} on ${node.bg} = ${node.contrast}`,
    );
  });
};

const run = async (theme) => {
  console.log(`\n========== ${theme.toUpperCase()} ==========`);
  const { browser, page, errors } = await launch(theme);
  try {
    const own = await measureOwnSpace(page);
    assertReadable('我的空间', own, theme);
    await page.screenshot({ path: `${OUT}/profile-card-dark-own-${theme}.png`, fullPage: false });

    const visitor = await measureVisitorSpace(page);
    assertReadable('他人空间', visitor, theme);
    await page.screenshot({
      path: `${OUT}/profile-card-dark-visitor-${theme}.png`,
      fullPage: false,
    });

    check(`${theme} · 无页面 JS 错误`, errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
};

await run('dark');
await run('light');

const failed = results.filter((r) => !r.pass);
console.log(
  `\n[probe-profile-post-card-dark] ${results.length - failed.length}/${results.length} PASS`,
);
if (failed.length) {
  console.log('FAIL 明细：');
  failed.forEach((r) => console.log(`  ✗ ${r.name}  -- ${r.detail}`));
  process.exit(1);
}
