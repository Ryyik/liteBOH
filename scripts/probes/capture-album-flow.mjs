#!/usr/bin/env node
/**
 * capture-album-flow.mjs — 影集发布全流程**逐帧截图**（不是门禁，是取证/讲解工具）
 *
 * 与 probe-album-post.mjs 的分工：
 *   · probe-*  → 带断言，红了要修代码；
 *   · capture-* → 只出图，按流程顺序编号，用来肉眼过一遍给人看。
 * 数据全部走 route 注入 + 假登录（pinia auth），不碰真库、不真上传。
 *
 * 产出：
 *   debug-screenshots/album-flow/NN-*.png     逐帧原图
 *   debug-screenshots/album-flow/index.html   带说明的storyboard
 *   debug-screenshots/album-flow-storyboard.png  整页拼图（一张图看完全流程）
 *
 * 运行：npm run dev 之后 node scripts/probes/capture-album-flow.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots/album-flow';

const svg = (w, h, color, label) => {
  const body =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${color}"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-size="${Math.round(h / 8)}" fill="#fff" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
};

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
  body: `第 ${i + 1} 张的正文。两段之间空一行，与真实内容一致。\n\n第二段。`,
}));

const ALBUM_ROW = {
  id: '00000000-0000-0000-0000-00000000a001',
  content: '【示意】三十天与一次出走',
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
  ...ALBUM_ROW,
  id: '00000000-0000-0000-0000-00000000a002',
  content: '【普通帖】用来确认影集卡混在流里能分得开',
  title: '普通帖',
  body: '普通帖正文。',
  author_id: '00000000-0000-0000-0000-00000000a0d2',
  author_username: 'probe_normal_user',
  image_count: 0,
  album_entries: [],
  images: [],
  likes_count: [{ count: 1 }],
  comments: [{ count: 0 }],
  comment_count: 0,
  created_at: '2026-11-14T11:00:00Z',
  updated_at: '2026-11-14T11:00:00Z',
};

const rows = [ALBUM_ROW, NORMAL_ROW];

const shots = [];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

fs.mkdirSync(OUT, { recursive: true });

const shot = async (page, name, title, note = '') => {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  shots.push({ file: `${name}.png`, title, note });
  return file;
};

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
      /* 隐私模式忽略 */
    }
  });
  const page = await context.newPage();
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
  return { context, page };
}

/** 假登录：直接改 pinia 里的 auth（同 probe-forum-seen-divider）。 */
const forceLogin = async (page) => {
  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const auth = pinia?.state?.value?.auth;
    if (!auth) return;
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
  });
  await page.waitForTimeout(400);
};

/** 把宿主的 ref 改写掉（setupState 是 proxyRefs，赋值即写 .value）。 */
const patchHost = (page, patch) =>
  page.evaluate((p) => {
    const el = document.querySelector('.post-creation-section');
    let c = el?.__vueParentComponent;
    while (c && !c.setupState?.postImages) c = c.parent;
    if (!c) return false;
    Object.entries(p).forEach(([key, value]) => {
      c.setupState[key] = value;
    });
    return true;
  }, patch);

/* ─────────────── 竖屏全流程 ─────────────── */
const { context, page } = await openApp({ width: 390, height: 844, mobile: true });

await shot(
  page,
  '01-feed-album-card',
  '① 影集在信息流里的样子',
  '同一条流：影集帖是「一张纸」，普通帖仍是普通卡；底部写明共几张照片。',
);

await page.locator('.album-card').click();
await page.waitForSelector('.album-reader', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(700);
await shot(
  page,
  '02-album-reader',
  '② 点开是整本连读',
  '卷首 + 逐张照片与文字，可以一路读到底 —— 这就是发布之后别人看到的形态。',
);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await forceLogin(page);
await page.locator('.mobile-compose-fab').click();
await page.waitForTimeout(450);
await shot(
  page,
  '03-choice-balls',
  '③ 点 ＋ 先选发什么',
  '两颗球：帖子 / 影集。影集走的是同一场发布会话，只换形态。',
);
await page.locator('.compose-choice-ball', { hasText: '影集' }).click();
await page.waitForTimeout(900);

await shot(
  page,
  '04-step1-empty',
  '④ 第 1 步 · 建本（空态）',
  '书封先出现在眼前：名字与简介怎么填，封面就长什么样。名字必填、简介可留空。',
);

/* 空名点下一步：被父层拦回，弹提示 */
await page.locator('.album-step-next').click();
await page.waitForTimeout(600);
await shot(
  page,
  '05-step1-guard',
  '⑤ 空名不许往下走',
  '推进闸门在父层（顶栏与底栏共用一个函数），所以两条路都绕不过去。',
);
await page.locator('.alert-confirm-btn').click();
await page.waitForTimeout(350);

await page.locator('.album-book-input').fill('波海的四季');
await page.locator('.album-book-intro').fill('一些海风、一些路上的人。');
await page.waitForTimeout(400);
await shot(
  page,
  '06-step1-filled',
  '⑥ 第 1 步 · 填好名字与简介',
  '封面实时跟着变；姓名 30 字上限、简介 200 字。这一屏只问这一次。',
);

await page.locator('.album-step-next').click();
await page.waitForTimeout(600);
await shot(
  page,
  '07-step2-empty',
  '⑦ 第 2 步 · 挑照片（空态）',
  '这一篇 1–10 张照片，第一张作封面；右上角是 0/10 的额度计数。',
);

await patchHost(page, {
  postImages: SPECS.slice(0, 3).map((spec, i) => {
    const url = svg(spec.w, spec.h, spec.color, spec.label);
    return {
      uploadId: `shot-album-${i}`,
      localPreviewUrl: url,
      url,
      uploadedUrl: url,
      uploadStatus: 'approved',
      name: `shot-${i}.png`,
      width: spec.w,
      height: spec.h,
    };
  }),
});
await page.waitForTimeout(500);
await shot(
  page,
  '08-step2-selected',
  '⑧ 第 2 步 · 选好 3 张',
  '缩略图左上角是阅读顺序 01/02/03；长按可拖动换序。',
);

await page.locator('.album-step-next').click();
await page.waitForTimeout(700);
await shot(
  page,
  '09-step3-top',
  '⑨ 第 3 步 · 写第一篇（上半屏）',
  '先写一句卷首配文（可留空），再往下逐张配字。底栏变成「上一步 / 发布第一篇」。',
);

await page
  .locator('.album-part-spread')
  .scrollIntoViewIfNeeded()
  .catch(() => {});
await page.waitForTimeout(500);
await shot(
  page,
  '10-step3-spread',
  '⑩ 第 3 步 · 一张图配一段字',
  '左边是这一张的大图（标着「第 01 张」），右边是标题 / 日期 / 地点 / 正文 —— 与最终卡片同构。',
);

await page.locator('.album-part-title').fill('一杯冰的');
await page.locator('.album-part-date').fill('2026.11.09');
await page.locator('.album-part-place').fill('温州 · 五马街');
await page
  .locator('.album-part-body')
  .fill('下午三点，店门口的塑料凳还是烫的。\n\n冰块化得比人走得快。');
await page.waitForTimeout(400);
await shot(
  page,
  '11-step3-filled',
  '⑪ 第 3 步 · 这一篇写好了',
  '每一张都独立成段，空一行就是分段；其余张可以继续点缩略图切过去写。',
);

/* 已建本的第二轮：本子已存在 → 第 1 步打勾并显示书名，第 2 步仍是选照片。
   （真实用户重开一次发布会话会直接落在第 2 步；这里用「上一步」回到同一状态，
     避免为了截图去走关闭会话的草稿确认链。） */
await patchHost(page, { albumBook: { title: '波海的四季', intro: '一些海风、一些路上的人。' } });
await page.waitForTimeout(500);
await page.locator('.album-step-back').click();
await page.waitForTimeout(600);
await shot(
  page,
  '12-existing-book',
  '⑫ 已经建过本的人：不再问名字',
  '步骤条第 1 步直接打勾并显示《波海的四季》，这一步不可再进 —— 名字只在第一次问。',
);

await page.locator('.album-step-next').click();
await page.waitForTimeout(700);
await shot(
  page,
  '13-existing-book-publish',
  '⑬ 往已有的一本里再加一篇',
  '底栏按钮变成「发布这一篇」；顶栏也从「创建影集」变成「发布到《波海的四季》」。',
);

/* ─────────────── 横屏：第 3 步的对照版式 ─────────────── */
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(800);
await page
  .locator('.album-part-spread')
  .scrollIntoViewIfNeeded()
  .catch(() => {});
await page.waitForTimeout(500);
await shot(
  page,
  '14-landscape-step3',
  '⑭ 横屏：照片在左、字段在右',
  '宽屏才用得上并排；竖屏是上下（照片在上）。同一个组件，两种排法。',
);

await context.close();

/* ─────────────── storyboard ─────────────── */
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>影集发布全流程</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 32px 64px;
    background: #f5f5f7; color: #1d1d1f;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  }
  header { max-width: 1320px; margin: 0 auto 28px; }
  h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: -0.01em; }
  p.lede { margin: 0; font-size: 14px; line-height: 1.8; color: #6b6b70; }
  .grid { max-width: 1320px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; }
  figure { margin: 0; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 28px -22px rgba(15,23,42,.4); }
  figure img { display: block; width: 100%; height: auto; background: #f4f4f6; }
  figcaption { padding: 12px 14px 14px; }
  figcaption b { display: block; font-size: 13.5px; margin-bottom: 6px; }
  figcaption span { display: block; font-size: 12px; line-height: 1.75; color: #6b6b70; }
</style>
</head>
<body>
  <header>
    <h1>影集发布 · 全流程</h1>
    <p class="lede">建本 → 选照片 → 写第一篇。每一步只做一件事；空名与空图都会被闸门拦回上一步。
    截图由 <code>scripts/probes/capture-album-flow.mjs</code> 在真实页面里逐帧采（假登录 + 假数据，不碰线上）。</p>
  </header>
  <div class="grid">
${shots
  .map(
    (s) => `    <figure>
      <img src="${s.file}" alt="${s.title}" loading="lazy" />
      <figcaption><b>${s.title}</b><span>${s.note}</span></figcaption>
    </figure>`,
  )
  .join('\n')}
  </div>
</body>
</html>
`;

fs.writeFileSync(`${OUT}/index.html`, html, 'utf8');

/* 整页拼图：一张图看完全流程 */
const board = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 1,
});
await board.goto(`file://${process.cwd()}/${OUT}/index.html`, { waitUntil: 'load' });
await board.waitForTimeout(700);
await board.screenshot({ path: 'debug-screenshots/album-flow-storyboard.png', fullPage: true });
await board.close();

await browser.close();

console.log(`\n影集全流程截图：${shots.length} 张 → ${OUT}`);
shots.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2, '0')}  ${s.title}`));
console.log('\nstoryboard：debug-screenshots/album-flow/index.html + album-flow-storyboard.png');
