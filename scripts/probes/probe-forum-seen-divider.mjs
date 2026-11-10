import { chromium } from 'playwright';

/* 探针：「上次看到这里」分隔线（2026-11-10，分隔线方案 B 的第一步）
   覆盖：
     A 有 N 条新帖 → 分隔线存在，且插在**第一条旧帖之前**（不是第一条之后、也不是列表顶部）
     B 全部是新帖 → 不画（线会落在末尾，纯噪声）
     C 真·首次登录（合成锚点）→ 不画（没有「上次」）
     D 拿不到锚点（未登录 / 锚点为 null）→ 不画
     E 暗色下截图（肉眼过对比度；本探针不判色值，只负责出图）

   ⚠️ 分层：**判定逻辑**（该不该画、画在第几条）的真源是
   `src/composables/useForumSeenDivider.js`，边界由 `tests/unit/forum-seen-divider.test.js` 锁；
   本探针只证明「接进真实论坛列表后位置与显隐对」—— 两者不能互相替代。
   ⚠️ 网络全程 mock，且只 mock 列表 RPC：本探针不关心帖子内容，只关心线上位置。

   反证记录（写完当场跑过）：
     · 把模板判断从 `getVisiblePostIndex(item.visIndex) === splitIndex` 改成
       `item.visIndex === splitIndex` → 非虚拟化路径不变（<40 条时 startIndex 恒 0），
       所以**单靠本探针抓不到**这类「窗口偏移」错误；40 条以上的窗口场景归
       `probe-forum-virtual-jump.mjs` 那类测试管，别在这里造第二份。
     · 把 `posts.length < 2` 的守卫删掉 → B/D 仍绿（newCount>=length 分支兜住了），属良性冗余。
     · 把 `enabled` 恒置 true → 本探针全绿（因为探针不切筛选）。**这是已知覆盖缺口**，
       补它需要「热门排序 / 搜索结果」场景，交给后续改动时一并加，别当它已经测过。 */

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
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

/** 锚点：本地 11-08 22:14（探针只比「11-08」这一段，避免时区把断言绑死） */
const ANCHOR = '2026-11-08T14:14:00Z';

const row = (id, createdAt, extra = {}) => ({
  id,
  content: `探针帖 ${id}`,
  title: `探针帖 ${id}`,
  body: `探针帖 ${id} 的正文`,
  tag: 'daily',
  author_id: '00000000-0000-0000-0000-0000000000b1',
  author_username: 'probe_seen_user',
  author_avatar_url: '',
  author_avatar_frame_url: null,
  created_at: createdAt,
  updated_at: createdAt,
  status: 'approved',
  comment_count: 0,
  like_count: 0,
  is_liked: false,
  image_count: 0,
  cover_image_url: '',
  images: [],
  replies: [],
  replies_has_more: false,
  hot_score: 0,
  has_more: false,
  ...extra,
});

/** 2 条新帖（锚点之后）+ 3 条旧帖（锚点之前），按时间倒序 */
const ROWS_MIXED = [
  row('00000000-0000-0000-0000-0000000000c1', '2026-11-10T02:00:00Z'),
  row('00000000-0000-0000-0000-0000000000c2', '2026-11-09T10:00:00Z'),
  row('00000000-0000-0000-0000-0000000000c3', '2026-11-07T20:00:00Z'),
  row('00000000-0000-0000-0000-0000000000c4', '2026-11-07T18:00:00Z'),
  row('00000000-0000-0000-0000-0000000000c5', '2026-11-06T09:00:00Z'),
];

const ROWS_ALL_NEW = ROWS_MIXED.slice(0, 3).map((r, i) => row(r.id, `2026-11-10T0${i}:00:00Z`));

const openForum = async ({ rows, anchor = ANCHOR, isFirstLogin = false }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  const json = { status: 200, contentType: 'application/json', body: JSON.stringify(rows) };
  await page.route('**/rest/v1/rpc/list_forum_posts', (route) => route.fulfill(json));
  await page.route('**/rest/v1/posts*', (route) =>
    route.fulfill({
      ...json,
      headers: {
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      },
    }),
  );

  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.forum-page', { timeout: 25000 });
  await page.waitForTimeout(800);

  // 锚点注入：真源是 authStore.offlineAnchorAt（会话级快照），这里直接改 store 状态。
  // 不种 sb-*-auth-token —— 那会走真实登录链，反而把锚点覆盖成刚写入的 now。
  const seeded = await page.evaluate(
    ({ anchorIso, firstLogin }) => {
      const app = document.querySelector('#app')?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return { ok: false, keys: Object.keys(pinia?.state?.value || {}) };
      auth.offlineAnchorAt = anchorIso;
      auth.isFirstLoginSession = firstLogin;
      return { ok: true };
    },
    { anchorIso: anchor, firstLogin: isFirstLogin },
  );
  await page.waitForTimeout(400);
  // 等列表真的渲染出来再断言：mock 响应与首帧之间没有固定时序，只 sleep 会偶发「0 张卡」
  // （2026-11-10 实测：B 场景首跑就撞上过，表现为 B2 假红）。
  await page.waitForSelector('[data-forum-virtual-index]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
  return { context, page, errors, seeded };
};

/** 读分隔线在哪：绝对下标（data-forum-virtual-index）+ 文案 */
const readDivider = (page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-forum-virtual-index]')];
    const at = items.findIndex((el) => el.querySelector('.forum-seen-divider'));
    const divider = document.querySelector('.forum-seen-divider');
    return {
      count: document.querySelectorAll('.forum-seen-divider').length,
      atItem: at,
      absoluteIndex: at >= 0 ? Number(items[at].dataset.forumVirtualIndex) : -1,
      label: (divider?.querySelector('.forum-seen-divider-label')?.textContent || '').trim(),
      itemCount: items.length,
    };
  });

/** 分隔线文案的实际对比度（前景合成透明度后 vs 最近的不透明祖先背景）
    为什么手算而不是引 axe：axe 对「半透明文字」的判定依赖它自己猜背景，
    而这条线恰恰是靠 opacity 变淡的 —— 手算能把 opacity 链和背景合成一起算清。 */
const labelContrast = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.forum-seen-divider-label');
    if (!el) return null;
    const parse = (value) => {
      const n = (value.match(/[\d.]+/g) || []).map(Number);
      return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
    };
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

    let opacity = 1;
    for (let node = el; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity || 1);
    }
    const fg = parse(getComputedStyle(el).color);

    let bg = { r: 255, g: 255, b: 255 };
    for (let node = el.parentElement; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.a > 0.95) {
        bg = c;
        break;
      }
    }

    const blend = {
      r: fg.r * opacity + bg.r * (1 - opacity),
      g: fg.g * opacity + bg.g * (1 - opacity),
      b: fg.b * opacity + bg.b * (1 - opacity),
    };
    const l1 = lum(blend);
    const l2 = lum(bg);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  });

try {
  // ---------------- A：2 新 + 3 旧 ----------------
  {
    const { context, page, errors, seeded } = await openForum({ rows: ROWS_MIXED });
    console.log('\n--- A 混合（2 新 / 3 旧）---');
    check('A0 锚点注入成功', seeded.ok, JSON.stringify(seeded));
    const info = await readDivider(page);
    check('A1 渲染出 1 条分隔线', info.count === 1, `count=${info.count}`);
    check(
      'A2 插在第 3 张卡里（= 前 2 条新帖之后）',
      info.absoluteIndex === 2,
      `at=${info.absoluteIndex}`,
    );
    check('A3 文案是「上次看到这里 · 11-08」', /上次看到这里 · 11-08/.test(info.label), info.label);
    check('A4 无页面异常', errors.length === 0, errors.join(' | '));
    const lightContrast = await labelContrast(page);
    check('A5 浅色下文案对比度 ≥ 4.5', lightContrast >= 4.5, `ratio=${lightContrast}`);

    // 截图必须把分隔线滚进视口 —— 只截首屏拍到的是两张新帖，肉眼验收会漏掉「线是否可见」。
    await page.locator('.forum-seen-divider').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/probe-seen-divider-light.png`, fullPage: false });

    // 暗色：必须按 theme-manager.applyTheme 的**同一套属性**切换（html[data-theme] + .dark +
    // 每个容器自己的 data-theme），见 src/utils/theme-manager.js:95-117。
    // ⚠️ 早先这里自己编了个 data-boh-theme，结果只把文字色切了、背景没切 —— 截图里
    // 分隔线变成「白字白底看不见」，一眼看去像真 bug，其实是探针伪造出了现实中不存在的状态。
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
      document
        .querySelectorAll('.forum-page, .user-space-page')
        .forEach((el) => el.setAttribute('data-theme', 'dark'));
    });
    await page.waitForTimeout(300);
    await page.locator('.forum-seen-divider').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/probe-seen-divider-dark.png`, fullPage: false });
    const darkStillThere = (await readDivider(page)).count === 1;
    check('A6 暗色下依然只有 1 条', darkStillThere);
    const darkContrast = await labelContrast(page);
    check('A7 暗色下文案对比度 ≥ 4.5', darkContrast >= 4.5, `ratio=${darkContrast}`);
    // ⚠️ 只读 .forum-page 的 background-color 会假绿：它本身是 transparent，
    // 真正的底色在更外层（html / body）。必须向上找到第一个不透明背景。
    const darkBg = await page.evaluate(() => {
      const parse = (value) => {
        const n = (value.match(/[\d.]+/g) || []).map(Number);
        return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
      };
      for (let node = document.querySelector('.forum-page'); node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c.a > 0.95) return `${c.r},${c.g},${c.b}`;
      }
      return 'none';
    });
    check(
      'A8 暗色确实生效（页面底色是深的）',
      darkBg !== 'none' && !/^255,255,255$/.test(darkBg),
      darkBg,
    );
    await context.close();
  }

  // ---------------- B：全部是新帖 ----------------
  {
    const { context, page } = await openForum({ rows: ROWS_ALL_NEW });
    console.log('\n--- B 全部新帖 ---');
    const info = await readDivider(page);
    check('B1 不画分隔线', info.count === 0, `count=${info.count}`);
    check('B2 列表本身正常渲染', info.itemCount === ROWS_ALL_NEW.length, `items=${info.itemCount}`);
    await context.close();
  }

  // ---------------- C：真·首次登录 ----------------
  {
    const { context, page } = await openForum({ rows: ROWS_MIXED, isFirstLogin: true });
    console.log('\n--- C 首次登录 ---');
    check('C1 不画分隔线', (await readDivider(page)).count === 0);
    await context.close();
  }

  // ---------------- D：拿不到锚点 ----------------
  {
    const { context, page } = await openForum({ rows: ROWS_MIXED, anchor: null });
    console.log('\n--- D 无锚点 ---');
    check('D1 不画分隔线', (await readDivider(page)).count === 0);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${results.join('\n')}`);
console.log(`\n[probe-forum-seen-divider] ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
