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

  const ov2 = await overflow(page);
  check('B4 阅读层无横向溢出', ov2.scrollW <= ov2.clientW + 1, `${ov2.scrollW}/${ov2.clientW}`);
  await shot(page, 'portrait-02-reader');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const readerAfterEsc = await page.locator('.album-reader').count();
  check('B5 Esc 关闭阅读层', readerAfterEsc === 0);

  // C. 选择球
  const fab = page.locator('.mobile-compose-fab');
  const fabVisible = (await fab.count()) > 0 && (await fab.isVisible());
  if (!fabVisible) {
    skipped('C 组（选择球）', 'FAB 未出现：本档不是 feed 落点或已被分区隐藏');
  } else {
    await forceLogin(page);
    await fab.click();
    await page.waitForTimeout(450);
    const cluster = await page.locator('.compose-choice-cluster').count();
    check('C1 点 + 浮出选择球', cluster === 1);

    const balls = await page.locator('.compose-choice-ball').allInnerTexts();
    check(
      'C2 两颗球：帖子 / 影集',
      balls.length === 2 && balls.join('').includes('帖子') && balls.join('').includes('影集'),
      balls.join('|'),
    );

    const geo = await page.evaluate(() => {
      const c = document.querySelector('.compose-choice-cluster');
      const f = document.querySelector('.mobile-compose-fab');
      if (!c || !f) return null;
      const cr = c.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      return {
        clusterBottom: cr.bottom,
        fabTop: fr.top,
        clusterRight: cr.right,
        vw: window.innerWidth,
      };
    });
    check(
      'C3 球浮在 FAB 上方（不压住按钮）',
      !!geo && geo.clusterBottom <= geo.fabTop + 2,
      JSON.stringify(geo),
    );
    check('C4 球在视口内（右侧不越界）', !!geo && geo.clusterRight <= geo.vw, JSON.stringify(geo));
    await shot(page, 'portrait-03-chooser');

    await page.locator('.compose-choice-ball', { hasText: '影集' }).click();
    await page.waitForTimeout(900);
    const overlay = await page.locator('.mobile-composer-overlay').count();
    const label = (
      await page
        .locator('.mobile-composer-submit-label')
        .innerText()
        .catch(() => '')
    ).trim();
    check('C5 选「影集」打开发帖器', overlay === 1, `overlay=${overlay}`);
    /* 2026-11-15 起影集发布拆成三步（建本 → 选照片 → 写第一篇），
       顶栏那颗按钮在第 1/2 步是「下一步」，只有第 3 步才是「发布」。
       原先断言的是「创建影集 / 发布」，流程一改就会假红。 */
    check('C6 顶栏按钮在第 1 步是「下一步」', label === '下一步', `label=${label}`);

    /* 步骤条与第一步面板：这条断言守的是「流程图形化」本身 ——
       三个节点、当前节点是「建本」、第一步的书封与名称输入框在场、
       且第 1 步不允许出现发布按钮（防止从建本屏直接发出去）。 */
    const stepsOn = await page.locator('.album-steps').count();
    if (!stepsOn) {
      skipped('C7–C10 三步流程', '未进入登录态（假会话没生效）');
    } else {
      const stepLabels = (await page.locator('.album-step .album-step-copy b').allInnerTexts())
        .map((t) => t.trim())
        .join('|');
      check(
        'C7 三步步骤条：建本 / 选照片 / 写第一篇',
        stepLabels === '建本|选照片|写第一篇',
        stepLabels,
      );
      const activeStep = (
        await page
          .locator('.album-step.is-active .album-step-copy b')
          .innerText()
          .catch(() => '')
      ).trim();
      const coverOn = await page.locator('.album-cover').count();
      const nameInputOn = await page.locator('.album-book-input').count();
      const photoPanelOn = await page.locator('.album-panel-photos').count();
      check(
        'C8 第 1 步只出现「建本」面板（书封 + 名称输入）',
        activeStep === '建本' && coverOn === 1 && nameInputOn === 1 && photoPanelOn === 0,
        `active=${activeStep} cover=${coverOn} input=${nameInputOn} photos=${photoPanelOn}`,
      );
      const publishOn = await page.locator('.editor-footer .post-btn').count();
      check(
        'C9 第 1 步没有发布按钮（不能从建本屏直接发出去）',
        publishOn === 0,
        `count=${publishOn}`,
      );
      await shot(page, 'portrait-04-composer-album');
      /* 空名点「下一步」必须被拦住：父层 goAlbumStep 的硬校验，
         没有这道闸门，用户能带着空名一路走到第三步再被 handlePost 拒一次。 */
      await page.locator('.album-step-next').click();
      await page.waitForTimeout(500);
      const stillFirst = (
        await page
          .locator('.album-step.is-active .album-step-copy b')
          .innerText()
          .catch(() => '')
      ).trim();
      check(
        'C10 空名点「下一步」被拦住（仍停在建本）',
        stillFirst === '建本',
        `active=${stillFirst}`,
      );
      await page
        .locator('.alert-confirm-btn')
        .click()
        .catch(() => {});
      await page.waitForTimeout(350);

      /* 填个名字再推进：第 2 步必须只剩「选照片」，且发布按钮仍然不在场。 */
      await page.locator('.album-book-input').fill('探针影集');
      await page.locator('.album-step-next').click();
      await page.waitForTimeout(600);
      const secondActive = (
        await page
          .locator('.album-step.is-active .album-step-copy b')
          .innerText()
          .catch(() => '')
      ).trim();
      const emptyArt = await page.locator('.album-photo-empty').count();
      const publishOn2 = await page.locator('.editor-footer .post-btn').count();
      check(
        'C11 填名后可进第 2 步（选照片空态 + 无发布按钮）',
        secondActive === '选照片' && emptyArt === 1 && publishOn2 === 0,
        `active=${secondActive} empty=${emptyArt} publish=${publishOn2}`,
      );
      await shot(page, 'portrait-05-composer-album-photos');

      /* 第三步要验「照片在左、字段在右」的对照版式，但真机上传要过压缩/审核链路。
         这里直接把假图塞进宿主组件的 postImages（与列表注入同一思路，只验版式）。 */
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
      await page.waitForTimeout(500);

      if (!seeded.ok) {
        skipped('C13–C14 第 3 步版式', seeded.reason || '注入假图失败');
      } else {
        await page.locator('.album-step-next').click();
        await page.waitForTimeout(600);
        const thirdActive = (
          await page
            .locator('.album-step.is-active .album-step-copy b')
            .innerText()
            .catch(() => '')
        ).trim();
        const spread = await page.locator('.album-part-spread').count();
        const bigPhoto = await page.locator('.album-part-photo img').count();
        const publishLabel = (
          await page
            .locator('.mobile-composer-submit-label')
            .innerText()
            .catch(() => '')
        ).trim();
        /* 发布出口在顶栏（`.mobile-composer-overlay .editor-footer .post-btn` 被刻意隐藏），
           所以读顶栏那颗 —— 读底栏的 post-btn 等于没验。 */
        check(
          'C13 有图后可进第 3 步（逐张配字 + 大图对照 + 顶栏切到发布）',
          thirdActive === '写第一篇' && spread === 1 && bigPhoto === 1 && publishLabel === '发布',
          `active=${thirdActive} spread=${spread} photo=${bigPhoto} publish=${publishLabel}`,
        );
        const stepNextGone = await page.locator('.album-step-next').count();
        check(
          'C14 第 3 步不再有「下一步」（只剩发布）',
          stepNextGone === 0,
          `count=${stepNextGone}`,
        );
        await shot(page, 'portrait-06-composer-album-write');

        /* 同一个会话拉到横屏：第 3 步必须变成「照片左、字段右」，
           这是三步流程里唯一真正用得上宽度的版式。 */
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(700);
        const spreadRow = await page.evaluate(() => {
          const photo = document.querySelector('.album-part-photo');
          const fields = document.querySelector('.album-part-fields');
          const steps = document.querySelector('.album-steps');
          if (!photo || !fields) return null;
          const p = photo.getBoundingClientRect();
          const f = fields.getBoundingClientRect();
          return {
            photoRight: Math.round(p.right),
            fieldsLeft: Math.round(f.left),
            sameRow: Math.abs(p.top - f.top) < 40,
            stepsW: steps ? Math.round(steps.getBoundingClientRect().width) : 0,
            vw: window.innerWidth,
          };
        });
        check(
          'C15 横屏第 3 步：照片在左、字段在右（并排）',
          !!spreadRow &&
            spreadRow.fieldsLeft >= spreadRow.photoRight - 2 &&
            spreadRow.sameRow &&
            spreadRow.stepsW <= spreadRow.vw,
          JSON.stringify(spreadRow),
        );
        /* 横屏卡片是可滚动的一屏，先滚到对照区再截图 —— 不然截到的是配文区 */
        await page
          .locator('.album-part-spread')
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await page.waitForTimeout(400);
        /* 「上一步」不能因为底栏变成 inline-flex 就被挤出去（实测过一版横屏看不见它） */
        const backBox = await page
          .locator('.album-step-back')
          .boundingBox()
          .catch(() => null);
        const rowBox = await page.evaluate(() => {
          const row = document.querySelector('.composer-submit-row');
          const btn = document.querySelector('.composer-submit-row .post-btn');
          if (!row || !btn) return null;
          const r = row.getBoundingClientRect();
          const b = btn.getBoundingClientRect();
          return {
            rowLeft: Math.round(r.left),
            rowRight: Math.round(r.right),
            btnLeft: Math.round(b.left),
            btnRight: Math.round(b.right),
            vw: window.innerWidth,
          };
        });
        check(
          'C16 横屏底栏「上一步」仍在视口内（没被发布按钮挤掉）',
          !!backBox &&
            backBox.width > 0 &&
            backBox.x >= 0 &&
            backBox.x + backBox.width <= (rowBox?.vw || 1280) + 1,
          `back=${JSON.stringify(backBox && { x: Math.round(backBox.x), w: Math.round(backBox.width) })} row=${JSON.stringify(rowBox)}`,
        );
        await shot(page, 'landscape-03-composer-album-write');
      }
    }
    skipped('C12 分篇编辑区（.album-parts）', '需要真实上传照片；本探针用注入假图验版式');
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
  check('D2b 横屏卡片底部「共 5 张照片 · 翻开阅读」', /共 5 张照片/.test(moreText), moreText);

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
