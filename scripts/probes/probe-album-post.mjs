#!/usr/bin/env node
/**
 * probe-album-post.mjs — 影集帖（album post）竖屏 / 横屏自证
 *
 * 背景：2026-11-14 上线「影集帖」——帖子就是影集（A 投影），信息流里换一张纸、
 * 点开是整本连读；竖屏发帖 FAB 改成「帖子 / 影集」两颗选择球。
 *
 * 为什么用 route 拦截而不是真数据：影集帖需要 `posts.album_entries`（迁移未 apply 前
 * 线上没有这一列），本探针只验**展示层与交互**，因此按 REST 返回体注入假行。
 *
 * 断言组：
 *   A 信息流卡片（分派 / 不裁切 / 照片数 / 无横向溢出）
 *   B 阅读层（照片数 / 每张图不裁切 / Esc 关闭 / 无横向溢出）
 *   C 影集发布三步走（选择球 → 建本 → 选照片 → 写第一篇；空名/空图不得被带过去）
 *   D 横屏（≥1024×600）同一份数据：卡片走图左文右，阅读层图片限高
 *
 * 运行：
 *   npm run dev                     # 另开一个终端
 *   node scripts/probes/probe-album-post.mjs
 *   BASE=http://localhost:5173 node scripts/probes/probe-album-post.mjs
 *
 * 反证（改了要变红）：
 *   · 把 ForumMain 里的 `<AlbumPostCard v-else-if="isAlbumPost(...)">` 删掉 → A1/A2 红
 *   · 把 `.album-figure img` 的 height:auto 改回 aspect-ratio 3/2 + cover → A3/B3 红
 *   · 把 FAB 的 @click 改回 openMobileComposer → C1/C2 红
 *   · 把三步流程退回一屏（去掉 albumStep 分步）→ C7/C8/C13 红
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots/album-post';

let pass = 0;
let fail = 0;
let skip = 0;
const results = [];
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const skipped = (name, why) => {
  skip += 1;
  results.push(`SKIP  ${name} — ${why}`);
};

const svg = (w, h, color, label) => {
  const body =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${color}"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-size="${Math.round(h / 8)}" fill="#fff" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
};

/* 混合竖图（3:4，用户真实素材的常见形态）与横图（4:3），专门验「不裁切」 */
const SPECS = [
  { w: 900, h: 1200, color: '#8a6f4e', label: '1' },
  { w: 900, h: 1200, color: '#4e6f8a', label: '2' },
  { w: 1200, h: 900, color: '#6f8a4e', label: '3' },
  { w: 900, h: 1200, color: '#8a4e6f', label: '4' },
  { w: 900, h: 1200, color: '#4e8a6f', label: '5' },
];

const ENTRIES = ['一杯冰的', '三十天', '塔在雾里', '洞头的风', '回程'].map((title, i) => ({
  image_index: i,
  title,
  date: `2026.11.${String(9 - i).padStart(2, '0')}`,
  place: i === 3 ? '洞头 · 海边' : '温州',
  body: `第 ${i + 1} 张的正文。探针用假数据，只验版式与交互；两段之间空一行，与真实内容一致。\n\n第二段。`,
}));

const ALBUM_ROW = {
  id: '00000000-0000-0000-0000-00000000a001',
  content: '【探针影集】三十天与一次出走',
  title: '三十天与一次出走',
  body: '还有三十多天考六级。上周末去了洞头的海边，风超级大。',
  tag: 'daily',
  author_id: '00000000-0000-0000-0000-00000000a0d1',
  author_username: 'probe_album_user',
  created_at: '2026-11-14T12:00:00Z',
  updated_at: '2026-11-14T12:00:00Z',
  status: 'approved',
  comment_count: 3,
  like_count: 12,
  is_liked: false,
  image_count: SPECS.length,
  cover_image_url: '',
  album_entries: ENTRIES,
  images: SPECS.map((spec, index) => ({
    id: `probe-album-img-${index}`,
    url: svg(spec.w, spec.h, spec.color, spec.label),
    originalUrl: svg(spec.w, spec.h, spec.color, spec.label),
    width: spec.w,
    height: spec.h,
    sortOrder: index,
  })),
  author: { avatar_url: '', avatar_frame_url: null, is_banned: false },
  comments: [{ count: 3 }],
  likes_count: [{ count: 12 }],
  replies: [],
  hot_score: 0,
};

const NORMAL_ROW = {
  id: '00000000-0000-0000-0000-00000000a002',
  content: '【普通帖】用来确认影集卡混在流里能分得开',
  title: '普通帖',
  body: '普通帖正文。',
  tag: 'daily',
  author_id: '00000000-0000-0000-0000-00000000a0d2',
  author_username: 'probe_normal_user',
  created_at: '2026-11-14T11:00:00Z',
  updated_at: '2026-11-14T11:00:00Z',
  status: 'approved',
  comment_count: 0,
  like_count: 1,
  is_liked: false,
  image_count: 0,
  cover_image_url: '',
  album_entries: [],
  images: [],
  author: { avatar_url: '', avatar_frame_url: null, is_banned: false },
  comments: [{ count: 0 }],
  likes_count: [{ count: 1 }],
  replies: [],
  hot_score: 0,
};

const rows = [ALBUM_ROW, NORMAL_ROW];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const overflow = async (page) =>
  page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));

/** 图片是否「按原比例完整显示」（displayed w/h 与原图比例差 ≤3%） */
const imgNotCropped = async (page, selector) =>
  page.evaluate((sel) => {
    const img = document.querySelector(sel);
    if (!img || !img.naturalWidth) return { ok: false, why: 'no image' };
    const rect = img.getBoundingClientRect();
    const natural = img.naturalWidth / img.naturalHeight;
    const shown = rect.width / rect.height;
    const drift = Math.abs(shown - natural) / natural;
    return {
      ok: drift <= 0.03,
      why: `natural=${natural.toFixed(3)} shown=${shown.toFixed(3)} drift=${(drift * 100).toFixed(1)}%`,
    };
  }, selector);

async function openApp({ width, height, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* 隐私模式下忽略 */
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

  const json = { status: 200, contentType: 'application/json', body: JSON.stringify(rows) };
  await page.route('**/rest/v1/rpc/list_forum_posts', (route) => route.fulfill(json));
  await page.route('**/rest/v1/posts*', (route) =>
    route.fulfill({
      ...json,
      headers: {
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': `0-${rows.length - 1}/${rows.length}`,
      },
    }),
  );
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.album-card', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

fs.mkdirSync(OUT, { recursive: true });

/* 假登录：影集的三步流程只在登录态下渲染（未登录时编辑器被登录卡替换）。
   直接改 pinia 里的 auth 状态（与 probe-forum-seen-divider 同法），
   不种 `sb-*-auth-token` —— 那会走真实登录链去连 Supabase。 */
const forceLogin = async (page) => {
  const result = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const auth = pinia?.state?.value?.auth;
    if (!auth) return { ok: false, reason: 'no auth store' };
    auth.isLoggedIn = true;
    auth.userInfo = {
      ...(auth.userInfo || {}),
      id: '00000000-0000-0000-0000-00000000a0d1',
      username: 'probe_album_user',
      nickname: 'probe_album_user',
      avatarUrl: '',
      role: 'user',
      points: 0,
      isMuted: false,
    };
    return { ok: true };
  });
  await page.waitForTimeout(400);
  return result;
};

/* ─────────────── 竖屏 390×844 ─────────────── */
{
  const { context, page, errors } = await openApp({ width: 390, height: 844, mobile: true });

  // A. 卡片
  const cardCount = await page.locator('.album-card').count();
  check('A1 影集帖渲染为影集卡', cardCount === 1, `count=${cardCount}`);

  const normalInFeed = await page.locator('.post-card-v2').count();
  check('A2 同一流里的普通帖仍是普通卡', normalInFeed >= 1, `post-card-v2=${normalInFeed}`);

  const cardImg = await imgNotCropped(page, '.album-card .album-figure img');
  check('A3 封面不裁切（竖图按原比例）', cardImg.ok, cardImg.why);

  /* 用语守卫（2026-11-15 用户纠正）：「篇」= 一次发布，篇内是「张」。
     竖屏只显示卡片头部的「5 张」（底部那句 `共 N 张照片` 是横屏才 display:inline），
     所以这里读 `.album-meta`；横屏那句由 D2b 守。 */
  const metaText = (await page.locator('.album-card .album-meta').innerText()).trim();
  check('A4 卡片头部写明「5 张照片」（不只是「5 张」）', metaText === '5 张照片', metaText);

  const ov1 = await overflow(page);
  check('A5 信息流无横向溢出', ov1.scrollW <= ov1.clientW + 1, `${ov1.scrollW}/${ov1.clientW}`);
  await shot(page, 'portrait-01-feed');

  /* 暗色：卡片的纸色来自组件内的局部变量（[data-theme='dark'] .album-card），
     这里只验「底色真的变深了」——色值调整不该让卡片在暗色下还是白纸。 */
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelectorAll('.forum-page').forEach((el) => el.setAttribute('data-theme', 'dark'));
  });
  await page.waitForTimeout(350);
  const darkBg = await page.evaluate(() => {
    const el = document.querySelector('.album-card');
    return el ? getComputedStyle(el).backgroundColor : '';
  });
  const darkRgb = (darkBg.match(/\d+/g) || []).slice(0, 3).map(Number);
  check('A6 暗色下卡片换成深纸底', darkRgb.length === 3 && darkRgb[0] < 60, darkBg);

  /* 字体（2026-11-16 第二次定稿）：只留宋体，选项已撤销。
     断言「渲染出来的确实是衬线宋体栈」—— 若哪天被改成无衬线，这条会红。 */
  const cardFont = await page.evaluate(() => {
    const el = document.querySelector('.album-card .album-prose, .album-card .album-name');
    return el ? getComputedStyle(el).fontFamily : '';
  });
  check(
    'A7 卡片固定宋体渲染',
    /Songti|SimSun|serif/i.test(cardFont) && !/PingFang|sans-serif/i.test(cardFont),
    cardFont,
  );

  await shot(page, 'portrait-01b-feed-dark');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document
      .querySelectorAll('.forum-page')
      .forEach((el) => el.setAttribute('data-theme', 'light'));
  });
  await page.waitForTimeout(250);

  // B. 阅读层
  await page.locator('.album-card').click();
  await page.waitForSelector('.album-reader', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const readerOpen = await page.locator('.album-reader').count();
  check('B1 点卡片翻开阅读层', readerOpen === 1);

  const entryCount = await page.locator('.album-reader .album-entry').count();
  const readerCount = (
    await page
      .locator('.album-reader-count')
      .innerText()
      .catch(() => '')
  ).trim();
  check(
    'B2 阅读层 5 张照片全在（计数写成「5 张照片」）',
    entryCount === 5 && readerCount === '5 张照片',
    `count=${entryCount} label=${readerCount}`,
  );

  const firstEntryImg = await imgNotCropped(page, '.album-reader .album-entry:first-of-type img');
  check('B3 阅读层首图不裁切', firstEntryImg.ok, firstEntryImg.why);

  const readerFont = await page.evaluate(() => {
    /* ⚠️ 不能写成 `.album-entry-prose, .album-reader` —— querySelector 按**文档顺序**
       返回首个命中，而根节点 `.album-reader` 在最前面，永远先命中它（拿到无衬线）。 */
    const el = document.querySelector('.album-reader .album-entry-prose');
    return el ? getComputedStyle(el).fontFamily : '';
  });
  check(
    'B6 阅读层沿用同一款宋体',
    /Songti|SimSun|serif/i.test(readerFont) && !/PingFang|sans-serif/i.test(readerFont),
    readerFont,
  );

  const ov2 = await overflow(page);
  check('B4 阅读层无横向溢出', ov2.scrollW <= ov2.clientW + 1, `${ov2.scrollW}/${ov2.clientW}`);
  await shot(page, 'portrait-02-reader');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const readerAfterEsc = await page.locator('.album-reader').count();
  check('B5 Esc 关闭阅读层', readerAfterEsc === 0);

  // C. 发帖格式（2026-11-16 降级：不再有外层选择球，格式在编辑器内切换）
  const fab = page.locator('.mobile-compose-fab');
  const fabVisible = (await fab.count()) > 0 && (await fab.isVisible());
  if (!fabVisible) {
    skipped('C 组（发帖格式）', 'FAB 未出现：本档不是 feed 落点或已被分区隐藏');
  } else {
    await forceLogin(page);
    await fab.click();
    await page.waitForTimeout(850);

    const overlay = await page.locator('.mobile-composer-overlay').count();
    const balls = await page.locator('.compose-choice-ball').count();
    check(
      'C1 点 + 直接打开编辑器（不再有「帖子 / 影集」选择球）',
      overlay === 1 && balls === 0,
      `overlay=${overlay} balls=${balls}`,
    );

    const modeLabels = (await page.locator('.composer-mode-btn').allInnerTexts())
      .map((t) => t.trim())
      .join('|');
    check('C2 编辑器内有格式切换：常规 / 图文', modeLabels === '常规|图文', modeLabels);

    const defaultMode = (
      await page.locator('.composer-mode-btn[aria-selected="true"]').innerText()
    ).trim();
    check('C3 默认是常规格式', defaultMode === '常规', defaultMode);

    const partsInPost = await page.locator('.album-parts').count();
    check('C4 常规格式不显示逐张配字区', partsInPost === 0, `parts=${partsInPost}`);

    /* 先写标题，再切图文：内容必须还在 —— 「随时可改格式、内容不丢」是这次降级的硬要求 */
    await page.locator('.post-title-input').fill('切格式不丢内容');
    await page.locator('.composer-mode-btn', { hasText: '图文' }).click();
    await page.waitForTimeout(450);

    const albumTitle = (await page.locator('.mobile-composer-title').innerText()).trim();
    check('C5 切到图文：顶栏标题变「发布图文」', albumTitle === '发布图文', albumTitle);
    const keptTitle = await page.locator('.post-title-input').inputValue();
    check('C6 切格式保留已填标题', keptTitle === '切格式不丢内容', keptTitle);

    /* 字体（2026-11-16 第二次定稿）：固定宋体，**不给选择** ——
       「宋体/黑体/楷体」三颗按钮已按用户要求撤掉，这里守「别再被加回来」。 */
    const fontBtns = await page.locator('.album-font-btn').count();
    const hintText = (
      await page
        .locator('.album-mode-hint')
        .innerText()
        .catch(() => '')
    ).trim();
    check(
      'C6b 图文不给字体选择（固定宋体）',
      fontBtns === 0 && hintText === '图文模式，每张照片可写一段文字。',
      `btns=${fontBtns} hint=${hintText}`,
    );

    /* 真机上传要过压缩/审核链路；这里直接把假图塞进宿主的 postImages（只验版式） */
    const seeded = await page.evaluate(
      (urls) => {
        const el = document.querySelector('.post-creation-section');
        let c = el?.__vueParentComponent;
        while (c && !c.setupState?.postImages) c = c.parent;
        if (!c) return { ok: false, reason: 'no host component' };
        c.setupState.postImages = urls.map((url, i) => ({
          uploadId: `probe-album-${i}`,
          localPreviewUrl: url,
          url,
          uploadedUrl: url,
          uploadStatus: 'approved',
          name: `probe-${i}.png`,
          width: 900,
          height: 1200,
        }));
        return { ok: true, count: urls.length };
      },
      SPECS.slice(0, 3).map((s) => svg(s.w, s.h, s.color, s.label)),
    );
    await page.waitForTimeout(600);

    if (!seeded.ok) {
      skipped('C7–C11 逐张配字', seeded.reason || '注入假图失败');
    } else {
      const partsOn = await page.locator('.album-parts').count();
      check('C7 图文格式 + 有图 ⇒ 出现逐张配字区', partsOn === 1, `parts=${partsOn}`);

      const bigPhoto = await page.locator('.album-part-photo').count();
      check('C8 逐张配字区没有左侧大图（只留缩略图条 + 字段）', bigPhoto === 0, `big=${bigPhoto}`);

      const partsH = await page.evaluate(() => {
        const el = document.querySelector('.album-parts');
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      });
      check('C9 逐张配字区 ≤460px（不再吃掉整屏）', partsH > 0 && partsH <= 460, `h=${partsH}`);

      await page.locator('.album-part-title').first().fill('第一张的标题');
      await page.waitForTimeout(300);

      /* 配字字段的字体 = 发布后卡片的字体（同一份 ALBUM_FONT_STACK）。
         ⚠️ 断言 computed fontFamily 而不是「有没有写某条规则」：
         `.editor-card input/textarea { font-family: inherit }` 特异性更高，写错位置就静默不生效。 */
      const previewFont = await page.evaluate(() => {
        const el = document.querySelector('.album-part-title');
        return el ? getComputedStyle(el).fontFamily : '';
      });
      check(
        'C9b 配字字段预览用宋体（与发布后同栈）',
        /Songti|SimSun|serif/i.test(previewFont) && !/PingFang|sans-serif/i.test(previewFont),
        previewFont,
      );

      await page.locator('.composer-mode-btn', { hasText: '常规' }).click();
      await page.waitForTimeout(450);
      const partsInPost2 = await page.locator('.album-parts').count();
      const titleInPost = await page.locator('.post-title-input').inputValue();
      check(
        'C10 切回常规：配字区收起、标题仍在',
        partsInPost2 === 0 && titleInPost === '切格式不丢内容',
        `parts=${partsInPost2} title=${titleInPost}`,
      );

      await page.locator('.composer-mode-btn', { hasText: '图文' }).click();
      await page.waitForTimeout(450);
      const entryBack = await page.locator('.album-part-title').first().inputValue();
      check('C11 再切回图文：逐张配字原样恢复', entryBack === '第一张的标题', entryBack);
    }
    await shot(page, 'portrait-03-format');
  }

  check('D0 竖屏无 JS 报错', errors.length === 0, errors.join(' | ').slice(0, 240));
  await context.close();
}

/* ─────────────── 横屏 1280×800 ─────────────── */
{
  const { context, page, errors } = await openApp({ width: 1280, height: 800, mobile: false });

  const cardCount = await page.locator('.album-card').count();
  check('D1 横屏同样渲染影集卡', cardCount === 1, `count=${cardCount}`);

  const layout = await page.evaluate(() => {
    const fig = document.querySelector('.album-card .album-figure');
    const text = document.querySelector('.album-card .album-text');
    if (!fig || !text) return null;
    const f = fig.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    return { figLeft: f.left, figRight: f.right, textLeft: t.left, figTop: f.top, textTop: t.top };
  });
  check(
    'D2 横屏改成图左文右（并排而非上下）',
    !!layout &&
      layout.textLeft >= layout.figRight - 4 &&
      Math.abs(layout.textTop - layout.figTop) < 120,
    JSON.stringify(layout),
  );
  await shot(page, 'landscape-01-feed');

  /* 横屏卡片底部才显示整句：用语守卫的第二处（篇 ≠ 张）。 */
  const moreText = (
    await page
      .locator('.album-card .album-more')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  check('D2b 横屏卡片底部「共 5 张照片 · 查看」', /共 5 张照片/.test(moreText), moreText);

  await page.locator('.album-card').click();
  await page.waitForSelector('.album-reader', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const entryCount = await page.locator('.album-reader .album-entry').count();
  check('D3 横屏阅读层 5 张照片', entryCount === 5, `count=${entryCount}`);

  const imgH = await page.evaluate(() => {
    const img = document.querySelector('.album-reader .album-entry:first-of-type img');
    return img ? img.getBoundingClientRect().height / window.innerHeight : null;
  });
  check(
    'D4 横屏图片限高 ≤70vh（不把整屏撑死）',
    imgH !== null && imgH <= 0.7,
    `height=${(imgH * 100).toFixed(1)}vh`,
  );

  const ov = await overflow(page);
  check('D5 横屏阅读层无横向溢出', ov.scrollW <= ov.clientW + 1, `${ov.scrollW}/${ov.clientW}`);
  await shot(page, 'landscape-02-reader');

  check('D6 横屏无 JS 报错', errors.length === 0, errors.join(' | ').slice(0, 240));
  await context.close();
}

await browser.close();

console.log(`\n影集帖探针：${pass} 通过 / ${fail} 失败 / ${skip} 跳过\n`);
console.log(results.join('\n'));
console.log(`\n截图：${OUT}`);
process.exit(fail ? 1 : 0);
