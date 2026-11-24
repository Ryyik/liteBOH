import { chromium } from 'playwright';

// =====================================================================
// 探针：浮层「从哪来、回哪去」形变契约（plans/047 第一步）
//
// 背景：全站 5 个浮层都在做同一件事 —— 从被点中的那张卡片**推开**、关闭时
//   **收回**卡片。原实现各写一份，每份踩过同一组坑。2026-11-24 抽出
//   `useBohMorphSurface` + 壳的 `morph` prop，本探针钉住「抽出来之后行为没变」。
//
// ⚠️⚠️ 这道探针的存在理由（先读再改）：
//   **形变失效时，全站没有任何测试会红。**
//   实测过三种静默失效，每种都表现为「弹窗照常打开、内容全对、只是没有动画」：
//     ① 壳的 `boh-pop` transition 把 `transform` 通道抢走 ⇒ WAAPI 被压掉；
//     ② `surfaceRef` 指到了宿主内层而非壳的 dialog ⇒ 形变作用于看不见的层；
//     ③ 退场时 `emit('close')` 让父级 `v-if` 立即卸载 ⇒ 节点 8ms 就被摘除，
//        形变一帧都没跑（用户看到的是「硬切消失」）。
//   所以这里不测「有没有打开」（那是内容探针的事），只测**动画本身的证据**：
//   关键帧里有没有 clipPath、offset 顺序对不对、两条动画是否并行、末帧是否保留。
//
// 判别性断言（缺一即失效）：
//   A3/A4 进场 clipPath 存在且窗口真的在收敛；B1/B2 退场两条动画**并行**存在；
//   B3 transparency 的 4 个 offset 与 0/0.65 归零；B5 退场节点至少存活到动画跑完。
//   其余（A1/A2/B4/R*）是回归兜底，不单独判别。
//
// 用法：PROBE_BASE=http://localhost:5173 node scripts/probes/probe-boh-morph-surface.mjs
// =====================================================================
const BASE = process.env.PROBE_BASE || 'http://localhost:5173';

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};

const browser = await chromium.launch({
  channel: process.env.PROBE_CHANNEL || 'chrome',
  args: ['--no-sandbox', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

/** 开一个商城页并等首屏商品卡就绪（形变的来源卡片就是它）。 */
async function openShop(width, height, tag) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));
  await page.route('**/rest/v1/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-0/0',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: '[]',
    }),
  );
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card .p-name'), null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);
  return { page, context };
}

/* 把一段动画的「结构」读出来：作用于哪些属性、几个关键帧、offset 序列。
   ⚠️ 不能只看 getComputedStyle().clipPath —— WAAPI 的中间值**不反映**在静态读法里
   （实测全程读到 `none`，误判成「形变没播」）。必须走 getAnimations()。 */
const READ_ANIMS = `(el) => (el.getAnimations ? el.getAnimations() : []).map((a) => {
  const kf = a.effect?.getKeyframes?.() || [];
  const timing = a.effect?.getComputedTiming?.() || {};
  const props = Object.keys(kf[0] || {}).filter(
    (k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k),
  );
  return {
    props,
    duration: Math.round(timing.duration || 0),
    frameCount: kf.length,
    offsets: kf.map((k) => k.computedOffset ?? k.offset),
    values: kf.map((k) => k[props[0]] ?? null),
    fill: a.effect?.getTiming?.().fill || '',
  };
})`;

// ── A 组：进场形变（从卡片推开） ──────────────────────────────────
{
  const { page, context } = await openShop(1280, 900, 'enter');

  const result = await page.evaluate(async () => {
    const card = document.querySelector('.p-card');
    const cardRect = card.getBoundingClientRect();
    const samples = [];
    card.click();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const el = document.querySelector('.detail-surface');
        if (el) {
          const anims = el.getAnimations ? el.getAnimations() : [];
          const box = el.getBoundingClientRect();
          samples.push({
            t: Math.round(performance.now() - t0),
            n: anims.length,
            // clip-path 的中间值取不到就取首帧的静态值（进场第一帧被刻意钉住）
            clip: getComputedStyle(el).clipPath,
            w: Math.round(box.width),
            h: Math.round(box.height),
          });
        }
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return {
      samples,
      cardRect: {
        x: Math.round(cardRect.x),
        y: Math.round(cardRect.y),
        w: Math.round(cardRect.width),
        h: Math.round(cardRect.height),
      },
    };
  });

  const alive = result.samples.filter((s) => s.n >= 0);
  const clipSeen = alive.filter((s) => /inset\(/.test(s.clip));
  check(
    'A1 进场：面板上确实挂了动画',
    alive.some((s) => s.n > 0),
    `首帧 n=${alive[0]?.n ?? '(无面板)'}`,
  );
  check(
    'A2 进场：动画作用于 clipPath（窗口方案，不是缩放）',
    alive.length > 0,
    `采样 ${alive.length} 帧`,
  );
  /* 判别性：进场窗口必须从「卡片矩形」开始 —— 首帧 clip-path 应含 inset 且
     上边距明显大于 0（卡片不在视口顶端）。全尺寸起开时 inset 全为 0。 */
  const firstClip = clipSeen[0]?.clip || '';
  check(
    'A3 进场：起点窗口是来源卡片矩形（非全屏）',
    /inset\(/.test(firstClip) && !/inset\(0px\)/.test(firstClip),
    firstClip.slice(0, 60) || '(没采到 inset)',
  );

  // 结束时窗口必须完全打开
  await page.waitForTimeout(200);
  const settled = await page.evaluate((read) => {
    const el = document.querySelector('.detail-surface');
    const anims = new Function('return ' + read)()(el);
    return {
      n: anims.length,
      clip: getComputedStyle(el).clipPath,
      w: Math.round(el.getBoundingClientRect().width),
    };
  }, READ_ANIMS);
  check(
    'A4 进场结束后动画已清空（不把 fill 留在元素上）',
    settled.n === 0 && (!settled.clip || settled.clip === 'none'),
    `n=${settled.n} clip=${settled.clip}`,
  );

  // ── B 组：退场形变（收回卡片）────────────────────────────────
  const out = await page.evaluate(async (read) => {
    const parseAnims = new Function('return ' + read)();
    const samples = [];
    const t0 = performance.now();
    document.querySelector('.surface-close').click();
    /* 60ms 时抓一次动画结构：此时两条都还在跑，能读到完整关键帧 */
    let captured = null;
    await new Promise((resolve) => {
      const tick = () => {
        const el = document.querySelector('.detail-surface');
        if (el) {
          if (!captured && performance.now() - t0 > 50) captured = parseAnims(el);
          samples.push({
            t: Math.round(performance.now() - t0),
            n: (el.getAnimations ? el.getAnimations() : []).length,
            gone: false,
          });
        } else {
          samples.push({ t: Math.round(performance.now() - t0), n: -1, gone: true });
        }
        if (performance.now() - t0 < 800) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return { captured: captured || [], samples };
  }, READ_ANIMS);

  const al = out.samples.filter((s) => !s.gone);
  const goneAt = out.samples.find((s) => s.gone)?.t ?? 9999;
  const clipAnim = out.captured.find((a) => a.props.includes('clipPath'));
  const opAnim = out.captured.find((a) => a.props.includes('opacity'));

  check(
    'B1 退场：clipPath 与 opacity 是**两条并行**动画',
    Boolean(clipAnim) && Boolean(opAnim),
    out.captured.map((a) => a.props.join('+')).join(' | ') || '(没抓到动画)',
  );
  check(
    'B2 退场：形变窗口收回（关键帧 2 帧：开 → 卡片矩形）',
    Boolean(clipAnim) && clipAnim.frameCount === 2,
    clipAnim ? `${clipAnim.frameCount} 帧 / ${clipAnim.duration}ms` : '缺失',
  );
  /* 判别性：淡出窗口必须是 0 / 0.25 / 0.65 / 1，且在 0.65 已归零。
     末帧漏写 offset 1 会被 WAAPI 补一个 underlying 帧（opacity 1）⇒ 反弹事故。 */
  const offsets = opAnim?.offsets || [];
  const ops = (opAnim?.values || []).map((v) => Number(v));
  check(
    'B3 退场：透明度 4 帧且末帧显式 offset 1（不反弹）',
    offsets.length === 4 &&
      Math.abs(offsets[0]) < 0.001 &&
      Math.abs(offsets[3] - 1) < 0.001 &&
      ops[2] === 0 &&
      ops[3] === 0,
    `offsets=${JSON.stringify(offsets)} opacity=${JSON.stringify(opAnim?.values)}`,
  );
  check(
    'B4 退场：两条都保留终态（fill forwards，不 cancel 弹回）',
    clipAnim?.fill === 'forwards' && opAnim?.fill === 'forwards',
    `clip=${clipAnim?.fill} opacity=${opAnim?.fill}`,
  );
  /* 判别性：节点至少要活到动画跑完。实测缺陷版是 8ms 被摘除。 */
  check(
    'B5 退场：节点存活到形变跑完（不是硬切消失）',
    goneAt > 120,
    `移除于 ${goneAt}ms，存活 ${al.length} 帧`,
  );

  await context.close();
}

// ── R 组：降级路径（prefers-reduced-motion 时不该播）────────────────
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('reduced: ' + String(e).slice(0, 160)));
  await page.route('**/rest/v1/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-0/0',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: '[]',
    }),
  );
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card .p-name'), null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  await page.locator('.p-card').first().click();
  await page.waitForSelector('.detail-surface', { timeout: 10000 });
  await page.waitForTimeout(600);

  const reduced = await page.evaluate(() => ({
    matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    n: (document.querySelector('.detail-surface').getAnimations?.() || []).length,
    // 降级时面板必须直接是全尺寸可见的，不能缩成一条缝
    w: Math.round(document.querySelector('.detail-surface').getBoundingClientRect().width),
    opacity: Number(getComputedStyle(document.querySelector('.detail-surface')).opacity),
  }));
  check(
    'R1 reduced-motion 下不播形变（面板直接可用）',
    reduced.matches && reduced.n === 0 && reduced.w > 100 && reduced.opacity > 0.9,
    `matches=${reduced.matches} n=${reduced.n} w=${reduced.w} opacity=${reduced.opacity}`,
  );

  // 关闭必须还能用（降级不能把 close 一起吞了）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const closed = await page.evaluate(() => !document.querySelector('.detail-surface'));
  check('R2 reduced-motion 下关闭仍生效', closed, closed ? '已关闭' : '仍存在');
  await context.close();
}

// ── C 组：壳的 morph 模式不渲染自己的装饰 ────────────────────────
{
  const { page, context } = await openShop(1280, 900, 'chrome');
  await page.locator('.p-card').first().click();
  await page.waitForSelector('.detail-surface', { timeout: 10000 });
  await page.waitForTimeout(700);

  const shell = await page.evaluate(() => {
    const dlg = document.querySelector('.boh-modal__dialog');
    const overlay = document.querySelector('.boh-modal__overlay');
    if (!dlg) return null;
    const cs = getComputedStyle(dlg);
    const head = dlg.querySelector('.boh-modal__head');
    return {
      hasMorphClass: dlg.classList.contains('boh-modal__dialog--morph'),
      bg: cs.backgroundColor,
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow,
      overflow: cs.overflow,
      headHeight: head ? Math.round(head.getBoundingClientRect().height) : 0,
      overlayBlur: overlay ? getComputedStyle(overlay).backdropFilter : '',
    };
  });
  /* morph 模式下 dialog 只是定位容器：一旦它还画着玻璃底/边框/圆角，
     就会与宿主面板叠成「双层外壳」，形变缩回时看起来是两块一起缩。 */
  check(
    'C1 morph 模式：壳的 dialog 退化成纯定位容器（无底/边框/圆角/阴影）',
    Boolean(shell) &&
      shell.hasMorphClass &&
      (shell.bg === 'rgba(0, 0, 0, 0)' || shell.bg === 'transparent') &&
      shell.border === '0px' &&
      Number.parseFloat(shell.radius) === 0 &&
      (shell.shadow === 'none' || !shell.shadow),
    shell
      ? `bg=${shell.bg} border=${shell.border} radius=${shell.radius} shadow=${(shell.shadow || '').slice(0, 24)}`
      : '找不到 dialog',
  );
  check(
    'C2 morph 模式：不渲染壳的空 header（否则撑高 52px）',
    Boolean(shell) && shell.headHeight === 0,
    `head 高 ${shell?.headHeight}px`,
  );
  check(
    'C3 morph 模式：遮罩仍保留模糊（形变不该把材质一起丢掉）',
    Boolean(shell) && /blur/.test(shell.overlayBlur || ''),
    (shell?.overlayBlur || '(空)').slice(0, 40),
  );
  await context.close();
}

check('Z1 全程无 pageerror', errors.length === 0, errors.join(' | ') || '0 条');

await browser.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
