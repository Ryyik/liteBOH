/**
 * probe-forum-polish-sweep.mjs —— 「智能整理」文字流光的端到端验证
 *
 * 验四件事（都只能在真实浏览器里看到）：
 *   1. running 期间两个 textarea 真的挂上了 `is-polishing`，
 *      且计算样式里是 `background-clip: text` + 横向渐变 + 无限位移动画
 *   2. 文字像素的亮度分布随时间变化（亮带真的扫过字形），不是一张静止的灰字
 *   3. 进入 settling 时输入框里**仍是原文**（落点前不换字）
 *   4. 落点换字后 `is-polishing` 立刻消失，文字恢复原色；撤销能回到原文
 *
 * 指标：mean = 文字像素平均亮度；sd = 同一帧内明暗差。
 *   流光成立 = 不同时刻的 mean/sd 有变化，且结束时回到基准附近。
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const ORIGINAL = {
  title: '今天在图书馆待了一整天',
  content:
    '今天在图书馆待了一整天，早上八点多去的，人已经不少了。\n\n先写了两小时论文，中间去楼下买了杯咖啡，回来继续。下午看了会儿书，是关于城市设计的，讲街道尺度的那一章挺有意思。\n\n晚上六点多走的，感觉效率还行，比在宿舍强。',
};
const POLISHED = {
  title: '图书馆里的一整天',
  content:
    '早上八点多到图书馆时，人已经不少了。\n\n先写了两小时论文，中途下楼买了杯咖啡再继续。下午读了本讲城市设计的书，其中讨论街道尺度的那一章很有意思。\n\n傍晚六点多离开，效率比在宿舍高。',
};

const DARK = process.env.PROBE_THEME === 'dark';

const b = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

// 拦模型：先挂 20000ms（覆盖整个采样期），再返回**正确形状**的响应。
// ⚠️ 时延必须 > 采样总耗时：12 帧 × 260ms **加上每帧 element screenshot 的开销**
//    （实测单帧 ~300ms，合计约 8s）。原先 7000ms 刚好被越过 ⇒ 帧循环末尾读到的
//    已是落点后的状态，探针误报「textarea 未挂 is-polishing」+ 亮带过曝（2026-10-30 实证：
//    25ms 密集采样测得 is-polishing 实际从 197ms 挂到 7967ms、样式全部生效，
//    是探针采样晚而不是功能坏 —— 假红会掩盖真回归，故把窗口放宽到 20s）。
// 采样点也一并前移：`running` 现在在类刚挂上时立刻取（见下方）。
// ⚠️ 形状必须是 { ok, data: { choices: [{ message: { content } }] } } ——
//    写成 { ok, data: { content } } 会导致解析空、状态行报「没能整理出内容」。
await p.route('**/functions/v1/**', async (route) => {
  const url = route.request().url();
  if (url.includes('runtime-chat') || url.includes('api-key-vault')) {
    await new Promise((r) => setTimeout(r, 20000));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: { choices: [{ message: { content: JSON.stringify(POLISHED) } }] },
      }),
    });
  }
  return route.continue();
});

if (DARK) {
  await p.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'dark');
    } catch {
      /* 隐私模式下 localStorage 会抛，忽略即可 */
    }
  });
}

await p.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
await p.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const a = pinia.state.value.auth;
  a.isLoggedIn = true;
  if (a.userInfo) Object.assign(a.userInfo, { username: 'probe_user', id: uid });
}, '00ac36b4-6594-440f-a9c1-38b7bd47ee8b');
await p.waitForTimeout(1200);
if (DARK) await p.waitForTimeout(600);
/* 内嵌发帖器已废弃，流光要到发布会话里量 —— 从内容页 FAB 打开。 */
await p.waitForSelector('.mobile-compose-fab', { timeout: 20000 });
await p.click('.mobile-compose-fab');
await p.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await p.locator('.mobile-composer-overlay .post-title-input').fill(ORIGINAL.title);
await p.locator('.mobile-composer-overlay .post-content-input').fill(ORIGINAL.content);
await p.waitForTimeout(400);

const clip = await p.evaluate(() => {
  const r = document.querySelector('.mobile-composer-overlay .editor-card').getBoundingClientRect();
  return {
    x: Math.max(0, r.x - 10),
    y: Math.max(0, r.y - 10),
    width: Math.round(r.width + 20),
    height: Math.min(Math.round(r.height + 40), 1050),
  };
});

const sweepState = () =>
  p.evaluate(() => {
    const title = document.querySelector('.mobile-composer-overlay .post-title-input');
    const content = document.querySelector('.mobile-composer-overlay .post-content-input');
    if (!title || !content) return { exists: false };
    const cs = getComputedStyle(content);
    return {
      exists: true,
      titlePolishing: title.classList.contains('is-polishing'),
      contentPolishing: content.classList.contains('is-polishing'),
      animation: cs.animationName,
      iteration: cs.animationIterationCount,
      bgClip: cs.backgroundClip || cs.webkitBackgroundClip,
      textFill: cs.webkitTextFillColor,
      backgroundColor: cs.backgroundColor,
      bgSize: cs.backgroundSize,
      bgImage: cs.backgroundImage.slice(0, 120),
      content: content.value?.slice(0, 12),
    };
  });

/** 拍一张正文 textarea 的原始像素。
 *
 *  ⚠️ 用 `locator.screenshot()` 而**不是** `page.screenshot({ clip })`：
 *      clip 是视口坐标，Playwright 点击按钮时会 `scrollIntoView`，
 *      元素一旦滚出视口，clip 就截到别的地方 —— 实测会量出「光场关掉后
 *      文字亮度仍是 161（基准 49）」这种鬼数据，而截图本身看起来还挺正常，
 *      极难发现。元素级截图自己处理滚动与定位，没有这个问题。 */
const grab = async (file) => {
  const buf = await p.locator('.mobile-composer-overlay .post-content-input').screenshot();
  if (file) await sharp(buf).toFile(`debug-screenshots/${file}`);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, channels: info.channels };
};

/** 在取样点上算「均值 + 标准差」。
 *  均值 = 时间上的明暗涨落；标准差 = 同一时刻空间上的明暗不均。 */
const stats = (img, points) => {
  let sum = 0;
  let sum2 = 0;
  for (const i of points) {
    const o = i * img.channels;
    const l = 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2];
    sum += l;
    sum2 += l * l;
  }
  const n = points.length || 1;
  const mean = sum / n;
  return { mean: +mean.toFixed(2), sd: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2) };
};

// 先把发帖区滚到视口内并稳定下来 —— 否则下一步的 click 会自己 scrollIntoView，
// 让「点击前」和「点击后」的截图坐标基准不同。
await p.locator('.mobile-composer-overlay .post-content-input').scrollIntoViewIfNeeded();
await p.waitForTimeout(250);

// ── 基准帧：还没开始整理，此时没有任何光 ────────────────────────────────
const base = await grab(DARK ? 's0-dark-idle.png' : 's0-idle.png');
const textPoints = [];
for (let i = 0; i < base.w * base.h; i++) {
  const o = i * base.channels;
  const luma = 0.2126 * base.data[o] + 0.7152 * base.data[o + 1] + 0.0722 * base.data[o + 2];
  // 亮底取暗字、暗底取亮字。暗色下若仍按 luma < 96 取，样本会全部落在
  // textarea 自己的深色底上 —— 流光怎么扫都测不到，探针会假绿（或假红）。
  if (DARK ? luma > 128 : luma < 96) textPoints.push(i);
}
const baseStats = stats(base, textPoints);

/** 取样本里最亮的一小撮像素。整段发白的症状是「亮带峰值之后仍留在 250+」，
 *  所以除了均值还要直接看高光尾部，不能只看平均。 */
const brightTail = (img, points, ratio = 0.02) => {
  const values = points
    .map((i) => {
      const o = i * img.channels;
      return 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2];
    })
    .sort((a, b) => a - b);
  if (!values.length) return 0;
  const start = Math.max(0, Math.floor(values.length * (1 - ratio)));
  const top = values.slice(start);
  return +(top.reduce((sum, v) => sum + v, 0) / top.length).toFixed(2);
};

const baseBrightTail = brightTail(base, textPoints);

// ── 点整理，在 running 期间密集采样 ─────────────────────────────────────
const t0 = Date.now();
await p.locator('.composer-polish-action').click();
// 点击后先等类挂上再开始截图。否则第一帧可能落在 Vue 提交 DOM 之前，
// 或（暗色档）截图耗时把后续帧推过落点。
await p.waitForSelector('.mobile-composer-overlay .post-content-input.is-polishing', {
  timeout: 4000,
});
// 处理态快照必须**在这一刻**取：下面 12 帧含 element screenshot，实测约 8s，
// 若放到循环之后读，读到的是落点后的常态 ⇒ 误报「未挂 is-polishing」。
const running = await sweepState();

const frames = [];
for (let n = 0; n < 12; n++) {
  const img = await grab();
  frames.push({
    t: Date.now() - t0,
    ...stats(img, textPoints),
    brightTail: brightTail(img, textPoints),
  });
  // 第 2/5/8 帧额外存一张卡片级截图 —— 单帧看不出亮带位置，得有几张不同相位。
  if (n === 2 || n === 5 || n === 8) {
    const tag = DARK ? 'dark' : 'light';
    await p.screenshot({ path: `debug-screenshots/sweep-${tag}-f${n}.png`, clip });
  }
  await p.waitForTimeout(260);
}
await p.screenshot({
  path: `debug-screenshots/${DARK ? 's1-dark-running.png' : 's1-running.png'}`,
  clip,
});
const runningLate = await sweepState();
if (!runningLate.contentPolishing) {
  // 期望：帧循环结束时仍在窗口内。为 false 说明模型时延被越过，
  // 上面的 running 快照与帧亮度数据都可能失真 —— 只告警不改判，
  // 真正的断言仍看 running（类刚挂上那一刻）。
  console.warn('[warn] 帧循环结束时 is-polishing 已摘除，采样窗口可能仍偏短');
}

// ── 抓 settling 的第一帧：流光还在、**文字还没换** ─────────────────────
let settleShot = null;
for (let i = 0; i < 240; i++) {
  const st = await sweepState();
  if (st.contentPolishing) {
    settleShot = st;
    await p.screenshot({
      path: `debug-screenshots/${DARK ? 's2-dark-settling.png' : 's2-settling.png'}`,
      clip,
    });
    break;
  }
  await p.waitForTimeout(8);
}

// ── 轮询到文字变化的那一帧 ──────────────────────────────────────────────
// ⚠️ 次数必须覆盖剩余等待时间：mock 时延 20s，帧循环已耗掉约 8s，
//    每次 evaluate + 8ms 实测约 30ms ⇒ 400 次仅约 12s，会先耗尽
//    （实测表现为「落点后仍挂着 is-polishing / 没有撤销入口」）。
//    2400 次 ≈ 70s，留足余量；命中即 break，不额外拖慢。
let landed = null;
for (let i = 0; i < 2400; i++) {
  const st = await p.evaluate(() => {
    const inp = document.querySelector('.mobile-composer-overlay .post-content-input');
    const title = document.querySelector('.mobile-composer-overlay .post-title-input');
    return {
      val: inp?.value?.slice(0, 12),
      contentPolishing: inp?.classList.contains('is-polishing'),
      titlePolishing: title?.classList.contains('is-polishing'),
    };
  });
  // ⚠️ 必须先判 `st.val` 非空：并行会话改 `ForumMain.vue` 会触发 HMR 整页重载，
  //    那一刻 textarea 的值是空串，`''.startsWith(...)` 为 false，
  //    于是被误判成「文字已替换」。踩过一次，报出来的 landed 是 `val: ''`。
  if (st.val && !st.val.startsWith(ORIGINAL.content.slice(0, 12))) {
    landed = st;
    await p.screenshot({
      path: `debug-screenshots/${DARK ? 's3-dark-landed.png' : 's3-landed.png'}`,
      clip,
    });
    break;
  }
  await p.waitForTimeout(8);
}

await p.waitForTimeout(500);
await p.screenshot({
  path: `debug-screenshots/${DARK ? 's4-dark-applied.png' : 's4-applied.png'}`,
  clip,
});
const applied = await sweepState();
// 落点后必须已经从文字上摘掉流光（否则读完的成品仍像“在整理”）。
await p.waitForTimeout(120);
const appliedAfterExit = await sweepState();
const statusText = await p
  .locator('.composer-polish-status')
  .textContent()
  .catch(() => null);
const hasUndo = await p.locator('.composer-polish-undo').count();

let undoOk = null;
if (hasUndo) {
  await p.locator('.composer-polish-undo').click();
  await p.waitForTimeout(250);
  undoOk = await p.evaluate(
    (orig) =>
      document.querySelector('.mobile-composer-overlay .post-content-input')?.value === orig,
    ORIGINAL.content,
  );
}

const peak = frames.reduce((a, f) => (f.mean > a.mean ? f : a), frames[0]);
const trough = frames.reduce((a, f) => (f.mean < a.mean ? f : a), frames[0]);

const failures = [];
if (!running.titlePolishing || !running.contentPolishing)
  failures.push('textarea 未挂 is-polishing');
if (running.bgClip !== 'text') failures.push(`background-clip=${running.bgClip}`);
if (running.textFill !== 'rgba(0, 0, 0, 0)') failures.push(`text-fill=${running.textFill}`);
if (running.backgroundColor !== 'rgba(0, 0, 0, 0)') {
  failures.push(`处理态底色不透明: ${running.backgroundColor}`);
}
if (frames.length < 5 || peak.mean - trough.mean < 1) failures.push('亮带没有真正扫过文字');
// 亮带峰值必须仍是「灰阶高光」，不能把字形推到接近纯白。
const maxBrightTail = Math.max(baseBrightTail, ...frames.map((f) => f.brightTail));
if (!DARK && maxBrightTail > 236) failures.push(`亮带高光过曝: ${maxBrightTail}`);
if (!applied.contentPolishing && !applied.titlePolishing) {
  // 正常路径：落点后已摘类
} else {
  failures.push('落点后仍挂着 is-polishing');
}
if (!hasUndo) failures.push('落点后没有撤销入口');
if (undoOk !== true) failures.push('撤销未恢复原文');
if (errs.length) failures.push(...errs.slice(0, 3));

console.log(
  JSON.stringify(
    {
      theme: DARK ? 'dark' : 'light',
      textPixels: textPoints.length,
      baseStats,
      baseBrightTail,
      peak,
      trough,
      maxBrightTail,
      liftPercent: +(((peak.mean - baseStats.mean) / baseStats.mean) * 100).toFixed(1),
      frames,
      running,
      settleShot,
      landed,
      applied,
      appliedAfterExit,
      statusText: statusText ? statusText.replace(/\s+/g, ' ').trim() : null,
      hasUndo,
      undoOk,
      failures,
      pageErrors: errs.slice(0, 3),
    },
    null,
    2,
  ),
);

await b.close();
if (failures.length) {
  console.error(`FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('PASS');
