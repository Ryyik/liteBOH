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
       `item.visIndex === splitIndex` → **本探针全绿**（2026-11-10 实测）。原因是窗口起点在
       顶部恒为 0，两种写法结果相同；要真测出来得让列表进入虚拟化并滚过窗口边界，
       而探针里推不动那个嵌套滚动容器。⇒ 这条风险**目前没有端到端覆盖**，
       改这段模板时靠人看：删掉 getVisiblePostIndex 不会有人拦你。
     · 去掉 `isFirstLogin` 守卫 → C1 红（有效）。
     · 把 `splitIndex` 写死 0 → A2 红（有效）。
     · 把 `enabled` 恒置 true → 本探针全绿（探针不切筛选）。**已知覆盖缺口**，
       补它需要「热门排序 / 搜索结果」场景，交给后续改动一并加，别当它已经测过。 */

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

/** 整整一页（POSTS_PER_PAGE = 10）全是新帖 —— 复现「越久没来、线越不出现」那一档 */
const ROWS_FULL_PAGE_NEW = Array.from({ length: 10 }, (_, i) =>
  row(
    `00000000-0000-0000-0000-0000000f${String(i).padStart(2, '0')}`,
    `2026-11-10T0${i % 9}:00:00Z`,
  ),
);

const openForum = async ({ rows, anchor = ANCHOR, isFirstLogin = false, seen = null }) => {
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

  const forumUrl = `${BASE}/#/user-space?tab=community${seen === null ? '' : `&seen=${seen}`}`;
  await page.goto(forumUrl, { waitUntil: 'domcontentloaded' });
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
    // ⚠️ 用 evaluate 而不是 locator().scrollIntoViewIfNeeded()：后者在元素不存在时会**等 30s
    // 然后抛错**，把「A1 红」（一条清楚的断言）变成「探针崩了」（看不出结论）。探针不该有
    // 这种「失败方式比失败本身更难读」的写法。
    const scrolledToDivider = await page.evaluate(() => {
      const el = document.querySelector('.forum-seen-divider');
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      return true;
    });
    check('A5b 分隔线可滚入视口（截图前置）', scrolledToDivider);
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
    await page.evaluate(() =>
      document.querySelector('.forum-seen-divider')?.scrollIntoView({ block: 'center' }),
    );
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

  // ---------------- H：整整一页都是新帖（真实场景：久未登录 ≥ 10 条新帖） ----------------
  // **这是拍板口径，不是待修项**（2026-11-10 用户明确要求：全部都是新帖就不提示）。
  // 曾提过「整页都新时在顶部画一条『以下是新内容』」，被否 —— 那种顶部条要么是废话，
  // 要么会让人以为下面还有旧的。探针把口径钉死，避免以后有人当漏判去改。
  // 注意副作用不是永久的：往下翻到第 2 页后 newCount < 已加载数，线会自己出现在真实位置。
  {
    const { context, page } = await openForum({ rows: ROWS_FULL_PAGE_NEW });
    console.log('\n--- H 整页新帖（≥10 条）---');
    const info = await readDivider(page);
    check('H1 整页都是新帖时不提示（拍板口径）', info.count === 0, `count=${info.count}`);
    check('H2 一页 10 条都渲染出来了', info.itemCount === 10, `items=${info.itemCount}`);
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
  // ---------------- E：45 条数据，但只断言「位置仍然正确」 ----------------
  // ⚠️ 这一档**没有**覆盖虚拟列表窗口偏移：列表每页 10 条，45 条要真进虚拟化得连续触底翻页，
  // 而探针里的触底（mouse.wheel）在这个宿主下推不动嵌套滚动容器（2026-11-10 实测
  // rendered 恒 10，E5 直接红）。所以这里只保留「一页内位置正确」，别把 E1 的
  // 「渲染数 < 总数」当成虚拟化生效的证据 —— 它只是「分页只回了一页」。
  {
    const many = Array.from({ length: 45 }, (_, i) =>
      row(
        `00000000-0000-0000-0000-0000000e${String(i).padStart(2, '0')}`,
        i < 3 ? `2026-11-10T0${i}:00:00Z` : `2026-11-0${(i % 6) + 1}T0${i % 9}:00:00Z`,
      ),
    );
    const { context, page, errors } = await openForum({ rows: many });
    console.log('\n--- E 45 条（实为第一页）---');
    const info = await readDivider(page);
    check('E1 渲染出 1 条分隔线', info.count === 1, `count=${info.count}`);
    check(
      'E2 插在绝对下标 3（前 3 条新帖之后）',
      info.absoluteIndex === 3,
      `at=${info.absoluteIndex}`,
    );
    check('E3 无页面异常', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---------------- F：DEV 预览开关 ?seen=N ----------------
  // 这一档防的是「开关自己坏了」：本地开发造不出真实锚点，若 ?seen= 静默失效，
  // 人就会以为是功能没生效而去改业务代码。锚点故意给 null —— 有真锚点时开关才该被忽略。
  {
    const { context, page } = await openForum({ rows: ROWS_MIXED, anchor: null, seen: 2 });
    console.log('\n--- F DEV 开关 ?seen=2（无真实锚点）---');
    const info = await readDivider(page);
    check('F1 无真实锚点时开关仍能画出线', info.count === 1, `count=${info.count}`);
    check('F2 前 2 条算新帖', info.absoluteIndex === 2, `at=${info.absoluteIndex}`);
    // 位置对但文案空 = 判定与展示吃了两个不同的锚点（2026-11-10 实测踩过的坑：
    // 开关只喂给判定、模板还写着 authStore.offlineAnchorAt ⇒ 只剩「上次看到这里」四个字）。
    check(
      'F3 文案里带上了时间（判定与展示同源）',
      /上次看到这里 · \d{2}-\d{2} \d{2}:\d{2}/.test(info.label),
      info.label,
    );
    await context.close();
  }

  // ---------------- G：开关的边界（N=1 与 N 超出范围） ----------------
  {
    const one = await openForum({ rows: ROWS_MIXED, anchor: null, seen: 1 });
    const info1 = await readDivider(one.page);
    console.log('\n--- G 开关边界 ---');
    check('G1 ?seen=1 只把第 1 条算新帖', info1.absoluteIndex === 1, `at=${info1.absoluteIndex}`);
    await one.context.close();

    const over = await openForum({ rows: ROWS_MIXED, anchor: null, seen: 99 });
    const info2 = await readDivider(over.page);
    // 越界被夹到 length-1 → 只剩最后一条是旧帖，线落在最后一条之前
    check(
      'G2 ?seen=99 夹到列表末尾而不是画到别处',
      info2.absoluteIndex === ROWS_MIXED.length - 1,
      `at=${info2.absoluteIndex}`,
    );
    await over.context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${results.join('\n')}`);
console.log(`\n[probe-forum-seen-divider] ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
