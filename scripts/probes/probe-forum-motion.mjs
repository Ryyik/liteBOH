import { chromium } from 'playwright';

/* 探针：论坛 / 详情的「从哪来、回哪去」空间连续性（plans/035，2026-10-31）
   覆盖四组：
     A 图片查看器：从缩略图 rect 起 → 落定 → 关闭缩回 → 无残留
     B 详情入场：卡片 rect → 窗口 clip-path 展开 + 内容纵深 → clip 归零
     C 返程：克隆层出现 → 收尾后节点全部移除 → 列表回来
     D reduce-motion：形变全部跳过（不能只剩「慢」，也就是不能只剩等待）

   ⚠️ 三条断言口径（写过一次就别改回「看起来有动画」）：
     ① **首帧窗口必须与来源矩形对上（误差 < 12px）**。只断言「有 animation」
        是没牙的 —— 2026-10-31 之前用 FLIP 时，transform-origin 写错（默认 50% 50%）
        动画照样在跑，只是起点整体偏 (S.w - T.w)/2，肉眼要盯很久才发现。
        现在是窗口方案，首帧信息在 `clip-path: inset(...)` 里，要换算回矩形。
     ② **落定后 clip-path 必须清空**。留着 `inset(0px 0px 0px 0px round 0px)`
        会创建绘制裁剪层，后代的浮层（编辑器、下拉）会被裁掉且查不出原因。
     ③ **返回后 morph 层的节点必须为 0**。留在 body 上的克隆看不见、但会吃掉
        后续「点到了哪里」的判断。 */

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
const PORTRAIT = { width: 390, height: 844 };
const TOLERANCE = 12;

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

const newPage = async (opts = {}) => {
  const page = await browser.newPage({ viewport: PORTRAIT, ...opts });
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  return page;
};

const near = (a, b, tol = TOLERANCE) =>
  Boolean(a && b) &&
  Math.abs(a.left - b.left) <= tol &&
  Math.abs(a.top - b.top) <= tol &&
  Math.abs(a.width - b.width) <= tol * 2 &&
  Math.abs(a.height - b.height) <= tol * 2;

/* 把 `clip-path: inset(...)` 换算回视口矩形。
   窗口方案下元素自身的 rect 永远是全尺寸，所以「起点在哪」只能从 clip 值反推 ——
   这是 B2 / C2b 两条断言的可执行依据。

   ⚠️ 必须支持 1–4 个值：浏览器会把 `inset(a b c b)` 归一成 `inset(a b c)`
   （左右相等时省略第四个），只按 4 个值解析会得到 null —— 表现为「断言失败但
   形变其实完全正确」（2026-10-31 实测踩到，B2/C2b 双双假红）。 */
const expandInset = (parts) => {
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
};

const clipRect = (box, clip) => {
  const m = /inset\(([^)]*)\)/.exec(String(clip || ''));
  if (!m || !box) return null;
  const nums = m[1]
    .replace(/\bround\b[\s\S]*$/, '')
    .trim()
    .split(/\s+/)
    .map((v) => Number.parseFloat(v))
    .filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  const [t, r, b, l] = expandInset(nums);
  return {
    left: Math.round(box.left + l),
    top: Math.round(box.top + t),
    width: Math.round(box.width - l - r),
    height: Math.round(box.height - t - b),
  };
};

try {
  /* ───────────────── A 图片查看器 ───────────────── */
  console.log('\n--- A 图片查看器：从缩略图起 ---');
  {
    const page = await newPage();
    const opened = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const thumb = document.querySelector('.post-card-v2 .image-post-thumb-shell');
      if (!thumb) return { ok: false, reason: 'feed 里没有图片帖' };
      thumb.scrollIntoView({ block: 'center' });
      await sleep(320);
      const b = thumb.getBoundingClientRect();
      window.__thumb = {
        left: Math.round(b.left),
        top: Math.round(b.top),
        width: Math.round(b.width),
        height: Math.round(b.height),
      };
      thumb.click();
      return { ok: true };
    });
    check('A0 找到带图帖子并点开', opened.ok, opened.reason || '');
    if (opened.ok) {
      // 等首帧：图片 load 之后才开始形变
      const first = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 90; i += 1) {
          const img = document.querySelector('.forum-image-viewer-img');
          if (img && img.getAnimations().length) {
            const anim = img.getAnimations()[0];
            const kf = anim.effect.getKeyframes();
            const b = img.getBoundingClientRect();
            return {
              dur: anim.effect.getTiming().duration,
              origin: kf[0].transformOrigin,
              rect: {
                left: Math.round(b.left),
                top: Math.round(b.top),
                width: Math.round(b.width),
                height: Math.round(b.height),
              },
            };
          }
          await sleep(16);
        }
        return null;
      });
      check(
        'A1 打开时有形变动画在跑',
        Boolean(first),
        first ? `dur=${first.dur}` : '90 帧内没等到动画',
      );
      check(
        'A2 形变起点是缩略图 rect',
        near(first?.rect, await page.evaluate(() => window.__thumb)),
        JSON.stringify(first?.rect),
      );
      check(
        'A3 transform-origin 为 0 0',
        String(first?.origin || '').replace(/\s/g, '') === '0px0px',
        String(first?.origin),
      );
      await page.waitForTimeout(700);
      const settled = await page.evaluate(() => {
        const img = document.querySelector('.forum-image-viewer-img');
        return img
          ? { anims: img.getAnimations().length, hasInlinePan: Boolean(img.style.transform) }
          : null;
      });
      check(
        'A4 落定后动画结束（不留 WAAPI 动画）',
        settled?.anims === 0,
        `anims=${settled?.anims}`,
      );
      const closing = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        document.querySelector('.forum-image-viewer-close')?.click();
        for (let i = 0; i < 40; i += 1) {
          const img = document.querySelector('.forum-image-viewer-img');
          if (img && img.getAnimations().length) {
            const kf = img.getAnimations()[0].effect.getKeyframes();
            return { to: kf[kf.length - 1].transform };
          }
          if (!img) break;
          await sleep(16);
        }
        return null;
      });
      check(
        'A5 关闭时有一条回缩动画（末帧带 scale）',
        Boolean(closing && /scale/.test(closing.to)),
        closing?.to || '',
      );
      await page.waitForTimeout(800);
      const gone = await page.evaluate(() => ({
        viewer: Boolean(document.querySelector('.forum-image-viewer')),
        ghost: document.querySelectorAll('.boh-morph-ghost').length,
      }));
      check(
        'A6 关闭后查看器节点消失',
        gone.viewer === false && gone.ghost === 0,
        JSON.stringify(gone),
      );

      /* A7 收尾不回弹（2026-10-31 复核实测抓到的真缺陷）：
         形变结束时若把动画 cancel 掉，元素会瞬间弹回原尺寸，而 Vue 的 leave 淡出才刚开始
         —— 实测关闭后第 374ms 图片宽度从 185px 跳回 390px，此时遮罩 opacity 仍是 1.00，
         用户看到「缩进去了 → 又弹回全屏 → 再淡出」，正好抵消掉整个返程。
         判据：**形变已结束（没有 running 动画）但遮罩仍可见（opacity > 0.3）的那些帧**，
         图片宽度必须仍在缩略图量级。这一条只有在真跑起来时才测得出，静态断言全绿也没用。 */
      {
        const live = await page.evaluate(async () => {
          const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const thumb = document.querySelector('.post-card-v2 .image-post-thumb-shell');
          if (!thumb) return { skip: true };
          thumb.scrollIntoView({ block: 'center' });
          await sleep(300);
          const thumbWidth = Math.round(thumb.getBoundingClientRect().width);
          thumb.click();
          await sleep(900);
          document.querySelector('.forum-image-viewer-close')?.click();
          const bad = [];
          for (let i = 0; i < 80; i += 1) {
            await raf();
            const img = document.querySelector('.forum-image-viewer-img');
            const root = document.querySelector('.forum-image-viewer');
            if (!img || !root) break;
            const running = img.getAnimations().filter((a) => a.playState === 'running').length;
            const rootOpacity = Number(getComputedStyle(root).opacity);
            const width = Math.round(img.getBoundingClientRect().width);
            if (running === 0 && rootOpacity > 0.3 && width > thumbWidth * 1.4) {
              bad.push({ width, thumbWidth, rootOpacity: rootOpacity.toFixed(2), frame: i });
            }
          }
          return { skip: false, bad };
        });
        check(
          'A7 收尾不回弹（形变结束后不得弹回全尺寸再淡出）',
          live.skip === true || live.bad.length === 0,
          live.skip ? 'skipped' : JSON.stringify(live.bad.slice(0, 3)),
        );
      }
    }
    await page.screenshot({ path: `${OUT}/probe-forum-motion-viewer.png` }).catch(() => {});
    await page.close();
  }

  /* ───────────────── B 详情入场 ───────────────── */
  console.log('\n--- B 详情入场：卡片 → 正文卡 ---');
  {
    const page = await newPage();
    const cardRect = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const card = document.querySelector('.post-card-v2');
      if (!card) return null;
      card.scrollIntoView({ block: 'center' });
      await sleep(320);
      const b = card.getBoundingClientRect();
      window.__card = {
        left: Math.round(b.left),
        top: Math.round(b.top),
        width: Math.round(b.width),
        height: Math.round(b.height),
      };
      card.click();
      return window.__card;
    });
    check('B0 找到帖子卡片并进入详情', Boolean(cardRect), JSON.stringify(cardRect));

    /* 形变必须**在导航那一刻**起跑，不能等数据（2026-10-31 用户反馈：
       「竖屏就是一闪然后才打开内容出现动画」—— 旧实现挂在 watch(isLoading)
       上，顺序成了「骨架屏整页闪一下 → 数据到了才演形变」）。 */
    const first = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const t0 = performance.now();
      for (let i = 0; i < 120; i += 1) {
        const el = document.querySelector('.detail-container');
        if (el && el.getAnimations().length) {
          const anims = el.getAnimations();
          // 窗口那条是带 clipPath 的；同一元素上可能还有别的，按关键帧挑
          const anim =
            anims.find((a) => {
              const k = a.effect?.getKeyframes?.() || [];
              return k.some((f) => f.clipPath);
            }) || anims[0];
          const kf = anim.effect?.getKeyframes?.() || [];
          const b = el.getBoundingClientRect();
          const windowDur = anim.effect?.getTiming?.().duration;
          /* 纵深层：`.detail-content` 上**起始 scale > 1** 的那条。
             不能按 duration 匹配（它上面还挂着 CSS 的 fade-in-up，时长可能撞上），
             也不能取 [0]（CSS animation 与 WAAPI 的返回顺序不保证）。

             ⚠️ WAAPI 的 `getKeyframes()` 对 `transform` **不一定**序列化成
             `matrix(...)`：实测 Chrome 原样返回 `"scale(1.12)"`，只写 matrix
             正则会得到 depth=0（假红）。两个都要认。 */
          const inner = el.firstElementChild;
          let depth = 0;
          for (const a of inner ? inner.getAnimations() : []) {
            const k = a.effect?.getKeyframes?.() || [];
            const raw = String(k[0]?.transform || '');
            const mm = /matrix\(([-\d.]+),/.exec(raw) || /scale\(\s*([-\d.]+)/.exec(raw);
            if (mm && Number(mm[1]) > 1.001) {
              depth = Number(mm[1]);
              break;
            }
          }
          return {
            startedIn: Math.round(performance.now() - t0),
            dur: windowDur,
            clipStart: String(kf[0]?.clipPath || ''),
            depth,
            // 首帧时是否还在加载：这是「先出界面、再出骨架」的可执行证据
            skeletonAtStart: Boolean(document.querySelector('.post-detail-skeleton')),
            box: { left: b.left, top: b.top, width: b.width, height: b.height },
          };
        }
        await sleep(16);
      }
      return null;
    });
    check(
      'B1 详情容器有窗口形变动画',
      Boolean(first),
      first ? `dur=${first.dur}` : '120 帧内没等到',
    );
    check(
      'B1b 形变在导航那一刻起跑（≤400ms，不等数据）',
      Number(first?.startedIn) <= 400,
      `startedIn=${first?.startedIn}ms`,
    );
    check(
      'B2 窗口起点与卡片 rect 对齐（±12px）',
      near(clipRect(first?.box, first?.clipStart), cardRect),
      `${JSON.stringify(clipRect(first?.box, first?.clipStart))} vs ${JSON.stringify(cardRect)}`,
    );
    check(
      'B3 纵深起点在 1.05–1.20 之间（--morph-depth）',
      Number(first?.depth) > 1.05 && Number(first?.depth) < 1.2,
      `depth=${first?.depth}`,
    );
    check(
      'B4 形变时长走 --motion-morph-in（标准档 460）',
      Number(first?.dur) === 460,
      `dur=${first?.dur}`,
    );
    check(
      'B4b 首帧窗口不是全屏（inset 至少一边 > 2px）',
      Boolean(first?.clipStart) && !/^inset\(0(px)? 0(px)? 0(px)? 0(px)?/.test(first.clipStart),
      first?.clipStart,
    );

    await page.waitForTimeout(1200);
    const settled = await page.evaluate(() => {
      const el = document.querySelector('.detail-container');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        clip: cs.clipPath,
        inlineClip: el.style.clipPath,
        anims: el.getAnimations().length,
      };
    });
    check(
      'B5 落定后 clip-path 是 none（不是 inset(0px 0px 0px 0px)）',
      settled?.clip === 'none',
      String(settled?.clip),
    );
    check('B6 落定后内联 clip-path 已清空', !settled?.inlineClip, String(settled?.inlineClip));
    check('B7 落定后无运行中动画', settled?.anims === 0, `anims=${settled?.anims}`);
    await page.screenshot({ path: `${OUT}/probe-forum-motion-detail.png` }).catch(() => {});

    /* ───────────────── C 返程 ───────────────── */
    console.log('\n--- C 返程：正文卡收回去 ---');
    const ghostSeen = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      history.back();
      for (let i = 0; i < 90; i += 1) {
        const ghost = document.querySelector('.boh-morph-ghost');
        if (ghost) {
          const b = ghost.getBoundingClientRect();
          const anims = ghost.getAnimations();
          // 收缩那条带 clipPath（另一条是 opacity），不能取 [0] 撞运气
          const anim = anims.find((a) => {
            const k = a.effect?.getKeyframes?.() || [];
            return k.some((f) => f.clipPath);
          });
          const kf = anim ? anim.effect.getKeyframes() : [];
          return {
            seen: true,
            anims: anims.length,
            end: kf.length ? String(kf[kf.length - 1].clipPath || '') : '',
            box: { left: b.left, top: b.top, width: b.width, height: b.height },
            rect: {
              left: Math.round(b.left),
              top: Math.round(b.top),
              width: Math.round(b.width),
              height: Math.round(b.height),
            },
          };
        }
        await sleep(16);
      }
      return { seen: false };
    });
    check(
      'C1 返程时出现收缩克隆层',
      ghostSeen.seen === true,
      JSON.stringify(ghostSeen.rect || null),
    );
    check(
      'C2 克隆层有窗口收缩 + 淡出两条动画',
      Number(ghostSeen.anims) >= 2,
      `anims=${ghostSeen.anims}`,
    );
    /* C2b 是最关键的一条：末帧落点必须回到**入口那张卡**的矩形。
       只断言「有收缩动画」是没牙的 —— 收错地方一样在动。
       窗口方案的末帧信息在 `clip-path: inset(...)` 里，换算回视口矩形再比。 */
    check(
      'C2b 末帧窗口落在入口那张卡的矩形上（±16px）',
      near(clipRect(ghostSeen.box, ghostSeen.end), cardRect, 16),
      `${JSON.stringify(clipRect(ghostSeen.box, ghostSeen.end))} vs ${JSON.stringify(cardRect)}`,
    );
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => ({
      ghost: document.querySelectorAll('.boh-morph-ghost').length,
      layer: document.querySelectorAll('.boh-morph-layer').length,
      list: Boolean(document.querySelector('.post-card-v2')),
      hash: location.hash,
    }));
    check(
      'C3 收尾后克隆与层节点全部移除',
      after.ghost === 0 && after.layer === 0,
      JSON.stringify(after),
    );
    check('C4 列表已回来（不是停在详情页）', after.list === true, after.hash);
    await page.screenshot({ path: `${OUT}/probe-forum-motion-back.png` }).catch(() => {});
    await page.close();
  }

  /* ───────────────── D reduce-motion 降级 ───────────────── */
  console.log('\n--- D reduce-motion：形变全部跳过 ---');
  {
    const page = await newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const reduced = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const thumb = document.querySelector('.post-card-v2 .image-post-thumb-shell');
      if (!thumb) return { skipped: true, reason: 'no thumb' };
      thumb.scrollIntoView({ block: 'center' });
      await sleep(300);
      thumb.click();
      for (let i = 0; i < 60; i += 1) {
        const img = document.querySelector('.forum-image-viewer-img');
        if (img) {
          await sleep(120);
          return { opened: true, anims: img.getAnimations().length };
        }
        await sleep(16);
      }
      return { opened: false };
    });
    check('D1 reduce 下仍能打开大图', reduced.opened !== false, JSON.stringify(reduced));
    check(
      'D2 reduce 下图片不跑形变动画',
      Number(reduced.anims || 0) === 0,
      `anims=${reduced.anims}`,
    );
    await page.close();
  }

  /* ───────────────── E 横屏弹窗：关闭也要看得见 ---
     ⚠️ 这一组是 2026-10-31 用户报障「横屏的弹窗关闭动画还是要加上」的反证。
     当时形变其实一直在跑（clip 从全开收到卡片，逐帧都对），但**面板 43ms 就
     opacity 0.00** —— `transition-property: width`（防 CSS 过渡压掉形变）的副作用
     是 `.pd-modal-leave-to` 的 opacity:0 瞬间生效，于是整段收缩在全透明里跑，
     用户只看到遮罩淡出。所以判据不能是「有没有 clip 动画」（当时也有），
     必须是「收缩中段面板还看得见」＋「末帧落在卡片上」。 */
  console.log('\n--- E 横屏弹窗：窗口展开 / 收回 ---');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const cardRect = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60; i += 1) {
        const c = document.querySelector('.post-card-v2');
        if (c) {
          c.scrollIntoView({ block: 'center' });
          await sleep(300);
          const b = c.getBoundingClientRect();
          window.__card = {
            left: Math.round(b.left),
            top: Math.round(b.top),
            width: Math.round(b.width),
            height: Math.round(b.height),
          };
          c.click();
          return window.__card;
        }
        await sleep(200);
      }
      return null;
    });
    check('E0 横屏点卡片开弹窗', Boolean(cardRect), JSON.stringify(cardRect));
    const opened = await page
      .waitForSelector('.pd-modal-panel', { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check('E1 弹窗面板出现', opened, opened ? '' : '10s 内没有 .pd-modal-panel');

    if (opened) {
      const entry = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 90; i += 1) {
          const p = document.querySelector('.pd-modal-panel');
          const anim = (p ? p.getAnimations() : []).find((a) =>
            (a.effect?.getKeyframes?.() || []).some((f) => f.clipPath),
          );
          if (anim) {
            const b = p.getBoundingClientRect();
            return {
              dur: anim.effect.getTiming().duration,
              clipStart: String(anim.effect.getKeyframes()[0]?.clipPath || ''),
              box: { left: b.left, top: b.top, width: b.width, height: b.height },
            };
          }
          await sleep(16);
        }
        return null;
      });
      check(
        'E2 入场有窗口形变动画（--motion-morph-in-near 380）',
        Boolean(entry),
        entry ? `dur=${entry.dur}` : '没等到',
      );
      check('E2b 入场时长是短距离档 380', Number(entry?.dur) === 380, `dur=${entry?.dur}`);
      /* 起点夹紧说明：卡片左缘可能落在面板左缘之外（面板此时还是 760 宽，
         卡片 232 在 260 外面）⇒ inset 不能为负，只能贴面板边界。所以容差给 40。 */
      if (entry) {
        check(
          'E2c 入场起点贴着卡片（夹紧容差 ±40）',
          near(clipRect(entry.box, entry.clipStart), cardRect, 40),
          `${JSON.stringify(clipRect(entry.box, entry.clipStart))} vs ${JSON.stringify(cardRect)}`,
        );
      }
      await page.waitForTimeout(1200);

      const closing = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const parse = (box, clip) => {
          const m = /inset\(([^)]*)\)/.exec(String(clip || ''));
          if (!m || !box) return null;
          const nums = m[1]
            .replace(/\bround\b[\s\S]*$/, '')
            .trim()
            .split(/\s+/)
            .map((v) => Number.parseFloat(v))
            .filter((v) => Number.isFinite(v));
          if (!nums.length) return null;
          const p =
            nums.length === 1
              ? [nums[0], nums[0], nums[0], nums[0]]
              : nums.length === 2
                ? [nums[0], nums[1], nums[0], nums[1]]
                : nums.length === 3
                  ? [nums[0], nums[1], nums[2], nums[1]]
                  : nums;
          return {
            left: Math.round(box.left + p[3]),
            top: Math.round(box.top + p[0]),
            width: Math.round(box.width - p[3] - p[1]),
            height: Math.round(box.height - p[0] - p[2]),
          };
        };
        const out = [];
        const t0 = performance.now();
        document.querySelector('.pd-modal-close').click();
        for (let i = 0; i < 24; i += 1) {
          const p = document.querySelector('.pd-modal-panel');
          if (!p) {
            out.push({ t: Math.round(performance.now() - t0), gone: true });
            if (i > 4) break;
          } else {
            const cs = getComputedStyle(p);
            const b = p.getBoundingClientRect();
            out.push({
              t: Math.round(performance.now() - t0),
              gone: false,
              op: Number(cs.opacity),
              window: parse(b, cs.clipPath),
              dur: (
                p
                  .getAnimations()
                  .find((a) => (a.effect?.getKeyframes?.() || []).some((f) => f.clipPath))
                  ?.effect?.getTiming?.() || {}
              ).duration,
            });
          }
          await sleep(20);
        }
        return {
          samples: out,
          leftover: document.querySelectorAll('.boh-morph-ghost, .boh-morph-layer').length,
        };
      });

      const live = closing.samples.filter((s) => !s.gone);
      const mid = live.find((s) => s.t >= 150 && s.t <= 260);
      check(
        'E3 收缩中段面板**还看得见**（2026-10-31 报障：43ms 就 op=0，等于没动画）',
        Boolean(mid) && mid.op >= 0.55,
        mid ? `t=${mid.t}ms op=${mid.op}` : '没采到 150–260ms 的帧',
      );
      check(
        'E4 退场时长走 --motion-morph-out（标准档 340）',
        live.some((s) => Number(s.dur) === 340),
        `durs=${[...new Set(live.map((s) => s.dur))].join(',')}`,
      );
      /* 末帧窗口必须落在卡片上：窗口方案下元素的 rect 恒定，唯一能验的就是 clip 反推值 */
      const last = live[live.length - 1];
      check(
        'E5 末帧窗口落在入口那张卡的矩形上（±16px）',
        near(last?.window, cardRect, 16),
        `${JSON.stringify(last?.window)} vs ${JSON.stringify(cardRect)}`,
      );
      check('E6 关闭后不留 morph 层残留', closing.leftover === 0, `leftover=${closing.leftover}`);
      const removed = await page
        .waitForSelector('.pd-modal-panel', { state: 'detached', timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      check('E7 关闭后弹窗节点被摘除', removed, removed ? '' : '4s 内还在');
    }
    await page.close();
  }
} catch (error) {
  check('Z9 探针未抛异常', false, String(error?.message || error).slice(0, 400));
} finally {
  await browser.close();
}

console.log('\n' + results.join('\n'));
console.log(`\n===== probe-forum-motion: ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
