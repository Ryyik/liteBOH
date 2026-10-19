import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：Cloud+ 发布面板（2026-10-18 重构后新增）
//
//   背景（用户报障）：「按钮繁多、横竖屏适配一般」。
//   改造前实测（844×390 横屏）：`.composer-panel` 高 **892px**，发布按钮 y=818
//   ⇒ 要往下滚约 450px 才够得着「发布」；面板内 **12 个 button** + 4 个纯装饰 chip。
//   竖屏 390×844：9 个情绪胶囊常驻占 3 行 117px，overlay 自身也溢出（909 > 844）。
//
//   本探针锁的就是这些数字，以及重构后新引入的三条不变量：
//     A 常驻按钮 ≤ 4（关闭 / 图片 / 心情 / 发布）—— 心情抽屉里的 9 个胶囊不算常驻
//     B/C/D 发布按钮恒在视口内、overlay 自身不滚动、面板不超出视口（4 档视口，含横屏）
//     F 正文「多字扩展」真的生效（且被 CSS 的 max-height 封顶，不在 JS 里写第二份像素）
//     J 有草稿时关闭要先确认（旧实现点 × 直接静默丢弃正文与已上传图片）
//     K Esc 走同一条确认路径（不能绕过草稿保护）
//     L 暗色下材质/文字跟随主题（面板用 --liquid-*，不写死亮色）
//
//   ⚠️ 三条实测坑：
//     ① 探针账号 Cloud+ 是 0 条内容，但发布面板**不依赖内容**，所以不需要 mock 路由；
//        入口仍必须走真实路径（设置 → Cloud+ → 内容），不能直接 goto（路由守卫在注入登录前就拦了）；
//     ② 长正文必须用 `type` 而不是 `fill`：auto-grow 监听的是 input 事件，
//        fill 虽然也派发 input，但不会经过逐字输入的组字路径，测不出真实手感 —— 两者都触发，
//        这里用 type 是为了顺带覆盖 composition 分支不炸；
//     ③ 读「发布按钮是否在视口内」必须用 rect.bottom <= innerHeight，
//        不能读 offsetTop（面板内部有滚动容器，offsetTop 是相对 .composer-body 的）。
//
//   反证（五条都实跑过，不是推演）：
//     A 把 `{{ failed.error }}` 改成空串（原因不再渲染）→ **Q 当场红**（"没有渲染失败清单"）；
//     B 删掉上传调用里的 `pendingSource`（回到 'generic' 桶）→ **R 当场红**
//        （body 变成 `{"source":"generic",...}`）—— 这条就是「上传链路和论坛不一样」的判据；
//     C 把 `.cp-tray-enter-active` 的 animation 改成 none → **S 当场红**（animationName=both）；
//     D 把 closeComposer 里的 `hasComposerDraft` 分支短路 → **L / M / N 红**
//        （点 × 直接关、没有确认框、正文静默丢失）；
//     E 把 `.composer-overlay` 的 background 改成 transparent → **E 断言在 5 档全红**。
//    ⚠️ 一条**没做成**的反证，留作记录：只删 `folder: CLOUD_PLUS_CLOUDINARY_FOLDER`
//       时 R 仍然绿 —— 因为 cloudinary-client 的 DEFAULT_FOLDER 也是同一个目录，
//       请求体看不出区别（真正能区分的是 source，见反证 B）。原来的"folder 出现即算对齐"
//       断言就是因此被删掉的，别再加回来。
//    ⚠️ 另一条没做成的：只把 `.composer-panel` 的 `max-height` 删掉时 B/C/D/J 仍绿 ——
//       新布局足够紧凑，844×390 与 740×320 的最坏内容仍装得下，收敛实际由
//       `.composer-body{overflow-y:auto}` + 面板 `overflow:hidden` 承担。
//       那四条锁的是**报障现象**（旧版 844×390 下发布按钮 y=818、overlay 可滚），
//       不是某一条 CSS。
// =====================================================================

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  // 740x320：安卓横屏的下界。加这一档是因为 844x390 的「最坏内容」恰好还能装下
  // （面板 280 + 心情抽屉 100 ≈ 380 < 390），去掉 max-height 也照样绿 ——
  // 那样 B/C/D/J 就不是有牙的断言，只是一串恒真的数字（反证实测踩到）。
  { name: '740x320', width: 740, height: 320, touch: true },
  { name: '1024x768', width: 1024, height: 768, touch: true },
  { name: '1440x900', width: 1440, height: 900, touch: false },
];

const LONG_TEXT =
  '今天去了海边，风很大，浪一层一层推上来。坐在堤岸上写了很久，把最近反复想的那件事终于写清楚了。';

// 1×1 PNG（探针自带的合法图片样本：够小、能被 validateImageFileBasics 接受）
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const results = [];
/** 全流程页面错误（上传链路那一组跨多个 action，单独收集，最后统一断言一次） */
const pageErrors = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const skip = (name, detail = '') => {
  results.push({ name, pass: null, detail });
  console.log(`SKIP  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

// pinia 伪造登录（探针惯例：reactive 须 Object.assign，id 用合法 UUID）
const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
    });
  });
};

const openCloudGallery = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForTimeout(3000);
  const entered = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.settings-shell button')].find((b) =>
      /Cloud\s*\+?/i.test(b.textContent || ''),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!entered) return { ok: false, why: '设置页里没找到 Cloud+ 入口' };
  await page.waitForTimeout(5000);
  const switched = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find((b) =>
      /内容/.test(b.textContent || ''),
    );
    if (!item) return false;
    item.click();
    return true;
  });
  if (!switched) return { ok: false, why: 'Cloud+ 底栏没有「内容」分页' };
  await page.waitForSelector('#cloud-search', { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ok: true };
};

const openComposer = async (page) => {
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('.gallery-header-actions .primary-btn');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!opened) return false;
  try {
    await page.waitForSelector('.composer-panel', { timeout: 4000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(400);
  return true;
};

const readGeometry = () =>
  `(() => {
  const q = (s) => document.querySelector(s);
  const rect = (el) => { const b = el.getBoundingClientRect();
    return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const panel = q('.composer-panel');
  const body = q('.composer-body');
  const overlay = q('.composer-overlay');
  const ta = q('.composer-text-input');
  const submit = q('.composer-submit');
  const taStyle = ta ? getComputedStyle(ta) : null;
  const overlayStyle = overlay ? getComputedStyle(overlay) : null;
  return {
    vh: window.innerHeight,
    panel: panel ? rect(panel) : null,
    body: body ? { ...rect(body), sh: body.scrollHeight, ch: body.clientHeight } : null,
    overlay: overlay ? { sh: overlay.scrollHeight, ch: overlay.clientHeight,
                          bg: overlayStyle.backgroundColor } : null,
    textareaH: ta ? Math.round(ta.getBoundingClientRect().height) : null,
    textareaMax: taStyle ? parseFloat(taStyle.maxHeight) : null,
    submit: submit ? rect(submit) : null,
    // 常驻按钮 = 面板内除情绪胶囊之外的所有 button
    residentButtons: [...document.querySelectorAll('.composer-panel button')]
      .filter((b) => !b.classList.contains('mood-chip')).length,
    moodChips: document.querySelectorAll('.mood-chip').length,
    panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
    panelBlur: panel ? (getComputedStyle(panel).backdropFilter
      || getComputedStyle(panel).webkitBackdropFilter) : null,
    titleColor: (() => { const t = q('.composer-head h3'); return t ? getComputedStyle(t).color : null; })(),
  };
})()`;

/** 读 rgba/rgb 的亮度（0~255），用于判断暗色下文字是不是浅色 */
const luminanceOf = (color) => {
  const m = String(color).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (!m) return null;
  return Math.round(0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]));
};
/** 读 rgba 的 alpha */
const alphaOf = (color) => {
  const m = String(color).match(/rgba\([^)]*,\s*([\d.]+)\)/);
  if (m) return Number(m[1]);
  return /^rgb\(/.test(String(color)) ? 1 : null;
};

const browser = await launch();

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => {
      errs.push(String(e));
      pageErrors.push(String(e));
    });
    const p = (s) => `[${vp.name}] ${s}`;
    // 供最后的「上传链路」组使用：整条 Q–U 流程的页面错误收集在这里汇总
    globalThis.__cloudComposerPageErrors = errs;

    const entered = await openCloudGallery(page);
    if (!entered.ok) {
      skip(p('进入 Cloud+ 图库'), entered.why);
      await ctx.close();
      continue;
    }
    const opened = await openComposer(page);
    if (!opened) {
      skip(p('打开发布面板'), '点「＋新建」后面板没出现');
      await ctx.close();
      continue;
    }

    const empty = await page.evaluate(readGeometry());

    // A 常驻按钮 ≤ 4
    check(
      p('A 常驻按钮 ≤ 4（关闭 / 图片 / 心情 / 发布）'),
      empty.residentButtons <= 4,
      `resident=${empty.residentButtons}（改造前 12）`,
    );

    // B 空态：发布按钮在视口内
    check(
      p('B 空态「发布」在视口内'),
      Boolean(empty.submit) && empty.submit.bottom <= empty.vh && empty.submit.y >= 0,
      `submit y=${empty.submit?.y} bottom=${empty.submit?.bottom} vh=${empty.vh}`,
    );

    // C 遮罩自身不滚动（滚动只发生在 .composer-body）
    check(
      p('C 遮罩层自身不滚动'),
      empty.overlay.sh <= empty.overlay.ch + 1,
      `overlay ${empty.overlay.sh}/${empty.overlay.ch}`,
    );

    // D 面板不超出视口
    check(
      p('D 面板高度不超出视口'),
      empty.panel.bottom <= empty.vh && empty.panel.y >= 0,
      `panel ${empty.panel.y}~${empty.panel.bottom} vh=${empty.vh}`,
    );

    // E 遮罩是半透明（能看到底下的图库，而不是旧版的不透明白底全屏）
    const scrimAlpha = alphaOf(empty.overlay.bg);
    check(
      p('E 遮罩为半透明（alpha < 1）'),
      scrimAlpha !== null && scrimAlpha > 0 && scrimAlpha < 1,
      `background=${empty.overlay.bg}`,
    );

    // F 材质是液态玻璃（模糊在、底色半透明）
    check(
      p('F 面板材质为液态玻璃（blur + 半透明底）'),
      /blur\(/.test(String(empty.panelBlur)) && (alphaOf(empty.panelBg) ?? 1) < 1,
      `bg=${empty.panelBg} blur=${empty.panelBlur}`,
    );

    // G 情绪抽屉默认收起
    check(p('G 心情抽屉默认收起'), empty.moodChips === 0, `moodChips=${empty.moodChips}`);

    // H 长正文后：多字扩展生效 + 发布按钮仍在视口内
    await page.fill('.composer-title-input', '海边的一个下午');
    await page.click('.composer-text-input');
    // ×6（约 300 字）而不是 ×3：宽屏 672px 下 150 字只占 3~4 行、不到 rows=5 的初始高度，
    // 高度「不长」其实是正确行为，×3 会让本断言在 1024/1440 上假红（实测踩到）。
    await page.type('.composer-text-input', LONG_TEXT.repeat(6), { delay: 0 });
    await page.waitForTimeout(400);
    const filled = await page.evaluate(readGeometry());

    const grew = filled.textareaH > empty.textareaH + 20;
    const atCap = empty.textareaH >= (empty.textareaMax ?? Infinity) - 1;
    check(
      p('H 正文多字扩展（高度增长，或被 CSS 上限封顶）'),
      grew || atCap,
      `空=${empty.textareaH}px 长文=${filled.textareaH}px max=${filled.textareaMax}px`,
    );

    check(
      p('I 正文高度不超过 CSS 上限'),
      filled.textareaH <= (filled.textareaMax ?? Infinity) + 1,
      `h=${filled.textareaH} max=${filled.textareaMax}`,
    );

    // J 长正文 + 心情展开后，发布按钮仍在视口内（旧版横屏在这一步就出屏）
    await page.evaluate(() => {
      [...document.querySelectorAll('.composer-tool')]
        .find((b) => /心情/.test(b.textContent || ''))
        ?.click();
    });
    await page.waitForTimeout(350);
    const withMood = await page.evaluate(readGeometry());
    check(
      p('J 展开心情后「发布」仍在视口内'),
      withMood.moodChips === 9 &&
        Boolean(withMood.submit) &&
        withMood.submit.bottom <= withMood.vh &&
        withMood.submit.y >= 0,
      `chips=${withMood.moodChips} submit y=${withMood.submit?.y} bottom=${withMood.submit?.bottom} vh=${withMood.vh}`,
    );

    if (errs.length) check(p('K 零页面错误'), false, errs.slice(0, 2).join(' | '));
    else check(p('K 零页面错误'), true, '');

    await page.screenshot({ path: `${OUT}/probe-cloud-composer-${vp.name}.png` });
    await ctx.close();
  }

  // ── 草稿保护 / Esc / 暗色（只在竖屏跑一次，逻辑与视口无关）──
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const entered = await openCloudGallery(page);
  if (!entered.ok) {
    skip('草稿保护 / Esc / 暗色', entered.why);
  } else {
    await openComposer(page);
    await page.click('.composer-text-input');
    await page.type('.composer-text-input', '写了一半就想关掉', { delay: 0 });
    await page.waitForTimeout(200);

    // L 点 × → 必须弹确认
    await page.click('.composer-close');
    await page.waitForTimeout(350);
    const confirmShown = await page.evaluate(() => {
      const modal = document.querySelector('.confirm-modal');
      return modal ? (modal.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    check(
      'L 有草稿点「×」先弹确认（不静默丢弃）',
      Boolean(confirmShown) && /放弃这次编辑/.test(confirmShown),
      confirmShown ? confirmShown.slice(0, 60) : '没有弹出确认框',
    );

    // M 选「继续编辑」→ 面板还在、正文还在
    const stillOpen = await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.confirm-btn.cancel')][0];
      if (!cancel) return null;
      cancel.click();
      return true;
    });
    await page.waitForTimeout(350);
    const kept = await page.evaluate(() => {
      const ta = document.querySelector('.composer-text-input');
      return { open: Boolean(document.querySelector('.composer-panel')), text: ta ? ta.value : '' };
    });
    check(
      'M 「继续编辑」后面板与正文都还在',
      stillOpen === true && kept.open && kept.text.includes('写了一半'),
      `open=${kept.open} text="${kept.text.slice(0, 12)}"`,
    );

    // N Esc 走同一条确认路径
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const escConfirm = await page.evaluate(() => {
      const modal = document.querySelector('.confirm-modal');
      return modal ? (modal.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    check(
      'N Esc 也先弹确认（不能绕过草稿保护）',
      Boolean(escConfirm) && /放弃这次编辑/.test(escConfirm),
      escConfirm ? escConfirm.slice(0, 40) : 'Esc 直接关掉了面板',
    );

    // O 选「放弃」→ 面板真的关闭
    await page.evaluate(() => {
      [...document.querySelectorAll('.confirm-btn.primary')][0]?.click();
    });
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => !document.querySelector('.composer-panel'));
    check('O 选「放弃」后面板关闭', closed === true, `closed=${closed}`);

    // P 暗色：面板底色变深、标题文字变浅（说明材质走的是 --liquid-* 而不是写死亮色）
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await openComposer(page);
    const dark = await page.evaluate(readGeometry());
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    const bgLum = luminanceOf(dark.panelBg);
    const textLum = luminanceOf(dark.titleColor);
    check(
      'P 暗色下面板变深、标题变浅（材质跟随 --liquid-*）',
      bgLum !== null && textLum !== null && bgLum < 90 && textLum > 180,
      `panelBg=${dark.panelBg}(lum ${bgLum}) title=${dark.titleColor}(lum ${textLum})`,
    );
    await page.screenshot({ path: `${OUT}/probe-cloud-composer-dark.png` });

    // ── Q–U 上传链路 / 失败原因 / 开合过渡（2026-10-18 第二轮报障）──
    // 背景（用户原话）：「为啥还有图片上传失败 @image 也不显示原因，上传链路和论坛
    // 最新的上传链路是一样的吗？然后加入一些过渡动画」。
    //
    // 做法：把 Cloudinary 上传端点**整个打桩**，先回 400（带一条可识别的原因文案），
    // 再回成功。这样既能验证「原因被渲染到面板上」，又不依赖外网与真实配额。
    // 签名网关（cloudinary-sign-upload）打成 404 —— 等价于「EF 未部署」，
    // 前端会立刻落到 unsigned 分支，否则要等 12s 超时（那条路径另由单测守卫）。
    const STUB_REASON = 'Cloudinary Upload API: 单张图片超过限制（探针桩）';
    let uploadMode = 'fail';
    // 观察经过网络层的相关请求（签名网关 / 上传端点 / pending 登记）
    const seenRequests = [];
    const trackRequest = (r) => {
      if (/cloudinary|functions\/v1|rest\/v1\/cloudinary/.test(r.url())) {
        seenRequests.push({ url: r.url(), body: r.postData() || '' });
      }
    };
    page.on('request', trackRequest);
    await page.route('**/functions/v1/cloudinary-sign-upload', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/image/upload', (route) => {
      if (uploadMode === 'fail') {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: STUB_REASON } }),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secure_url:
            'https://res.cloudinary.com/dkqae7j1m/image/upload/v1/boh-cloud-plus/probe.png',
          public_id: 'boh-cloud-plus/probe',
          width: 1,
          height: 1,
          format: 'png',
          delete_token: 'probe-delete-token',
          original_filename: 'probe',
        }),
      });
    });

    await openComposer(page);
    // 1×1 PNG 直接以 buffer 送进 file input（不落临时文件，探针可移植）
    await page.setInputFiles('.hidden-file-input', {
      name: 'cloud-probe.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    let failedUi = null;
    try {
      await page.waitForSelector('.composer-failed-reason', { timeout: 20000 });
      failedUi = await page.evaluate(() => ({
        name: document.querySelector('.composer-failed-name')?.textContent || '',
        reason: document.querySelector('.composer-failed-reason')?.textContent || '',
        title: document.querySelector('.composer-failed-title')?.textContent || '',
        role: document.querySelector('.composer-status.is-error')?.getAttribute('role') || '',
      }));
    } catch {
      failedUi = null;
    }

    check(
      'Q 上传失败时面板显示**真实原因**（不只是「N 张图片上传失败」）',
      Boolean(failedUi) &&
        failedUi.reason.includes('单张图片超过限制') &&
        failedUi.name.includes('cloud-probe') &&
        failedUi.title.includes('1 张图片上传失败') &&
        failedUi.role === 'alert',
      failedUi
        ? `name="${failedUi.name.trim()}" reason="${failedUi.reason.trim()}"`
        : '没有渲染失败清单',
    );

    // 与论坛链路对齐的判据：签名网关收到的 source / folder。改造前 Cloud+ 一个都不传，
    // source 落到 'generic'（与装修台等路径共用限流桶）、folder 走客户端默认值。
    const signRequests = seenRequests.filter((r) => /cloudinary-sign-upload/.test(r.url));
    const signBody = signRequests.map((r) => r.body).join(' ');
    check(
      'R 上传走 Cloud+ 专属标记（签名网关收到 source=cloud_plus + folder=boh-cloud-plus）',
      signRequests.length > 0 &&
        signBody.includes('"source":"cloud_plus"') &&
        signBody.includes('"folder":"boh-cloud-plus"'),
      signRequests.length
        ? `${signRequests.length} 次请求，body=${signBody.slice(0, 120)}`
        : '没有观察到签名网关请求',
    );

    // S 心情抽屉开合真的有过渡（瞬时类必须在动画窗口内读）
    await page.evaluate(() => {
      [...document.querySelectorAll('.composer-tool')]
        .find((b) => /心情/.test(b.textContent || ''))
        ?.click();
    });
    const tray = await page.evaluate(() => {
      const el = document.querySelector('.mood-tray');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        animation: cs.animationName,
        duration: cs.animationDuration,
        overflow: cs.overflow,
        chips: document.querySelectorAll('.mood-chip').length,
      };
    });
    check(
      'S 心情抽屉开合带过渡动画（高度 + 淡入，且不裁内容）',
      Boolean(tray) &&
        /cpTrayHeight/.test(String(tray.animation)) &&
        Number.parseFloat(tray.duration) > 0.1,
      tray
        ? `animation=${tray.animation} duration=${tray.duration} overflow=${tray.overflow} chips=${tray.chips}`
        : '抽屉没有出现',
    );

    // T 重试（换成成功桩）→ 缩略图出现、失败清单消失
    uploadMode = 'ok';
    await page.evaluate(() => {
      [...document.querySelectorAll('.composer-text-btn')]
        .find((b) => /重试/.test(b.textContent || ''))
        ?.click();
    });
    let retried = null;
    try {
      await page.waitForSelector('.upload-card', { timeout: 20000 });
      // ⚠️ 失败清单是「退场动画未结束就不算消失」—— 必须等节点真摘掉再读，
      //    否则读到的是 cp-status 的 leaving 节点（本地实测踩到，与坑①同源）。
      await page.waitForFunction(() => !document.querySelector('.composer-failed-reason'), {
        timeout: 5000,
      });
      retried = await page.evaluate(() => ({
        thumbs: document.querySelectorAll('.upload-card').length,
        failedGone: !document.querySelector('.composer-failed-reason'),
        count: document.querySelector('.composer-tool-count')?.textContent || '',
      }));
    } catch {
      retried = null;
    }
    check(
      'T 重试成功后缩略图出现、失败清单消失',
      Boolean(retried) && retried.thumbs === 1 && retried.failedGone && retried.count === '1',
      retried ? JSON.stringify(retried) : '重试后没有出现缩略图',
    );

    check(
      'U 整条上传链路（失败 → 原因上屏 → 重试成功）无页面报错',
      pageErrors.length === 0,
      pageErrors.slice(0, 2).join(' | ') || '无',
    );
  }
  await ctx.close();
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass === true).length;
const failed = results.filter((r) => r.pass === false).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\nCloud+ 发布面板：${passed} PASS / ${failed} FAIL / ${skipped} SKIP`);
process.exit(failed > 0 ? 1 : 0);
