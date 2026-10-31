import { chromium } from 'playwright';

/* 探针：论坛 / 详情的「从哪来、回哪去」空间连续性（plans/035，2026-10-31）
   覆盖四组：
     A 图片查看器：从缩略图 rect 起 → 落定 → 关闭缩回 → 无残留
     B 详情入场：卡片 rect → 正文卡形变入场 → transform 归零
     C 返程：克隆层出现 → 收尾后节点全部移除 → 列表回来
     D reduce-motion：形变全部跳过（不能只剩「慢」，也就是不能只剩等待）

   ⚠️ 三条断言口径（写过一次就别改回「看起来有动画」）：
     ① **首帧矩形必须与来源矩形对上（误差 < 12px）**。只断言「有 animation」
        是没牙的 —— transform-origin 写错（默认 50% 50%）时动画照样在跑，
        只是起点整体偏 (S.w - T.w)/2，肉眼要盯很久才发现。
     ② **落定后必须是 `transform: none`**。`fill: both` 会留下
        `matrix(1,0,0,1,0,0)`，那和 none 在 CSS 层不是一回事（fixed 子元素的
        包含块照样被劫持）。
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

    const first = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 120; i += 1) {
        const el = document.querySelector('.x-post-card');
        if (el && el.getAnimations().length) {
          const anim = el.getAnimations()[0];
          const kf = anim.effect.getKeyframes();
          const b = el.getBoundingClientRect();
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
    check('B1 详情正文卡有形变动画', Boolean(first), first ? `dur=${first.dur}` : '120 帧内没等到');
    check(
      'B2 起点与卡片 rect 对齐（±12px）',
      near(first?.rect, cardRect),
      `${JSON.stringify(first?.rect)} vs ${JSON.stringify(cardRect)}`,
    );
    check(
      'B3 transform-origin 为 0 0',
      String(first?.origin || '').replace(/\s/g, '') === '0px0px',
      String(first?.origin),
    );
    check(
      'B4 形变时长走 --motion-morph-in（640）',
      Number(first?.dur) === 640,
      `dur=${first?.dur}`,
    );

    await page.waitForTimeout(900);
    const settled = await page.evaluate(() => {
      const el = document.querySelector('.x-post-card');
      if (!el) return null;
      return {
        transform: getComputedStyle(el).transform,
        inline: el.style.transform,
        anims: el.getAnimations().length,
      };
    });
    check(
      'B5 落定后 transform 是 none（不是 matrix(1,0,0,1,0,0)）',
      settled?.transform === 'none',
      String(settled?.transform),
    );
    check('B6 落定后内联 transform 已清空', !settled?.inline, String(settled?.inline));
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
          const anim = ghost.getAnimations()[0];
          const kf = anim ? anim.effect.getKeyframes() : [];
          const last = kf.length ? String(kf[kf.length - 1].transform || '') : '';
          return {
            seen: true,
            anims: ghost.getAnimations().length,
            end: last,
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
    check('C2 克隆层有一条形变动画', Number(ghostSeen.anims) >= 1, `anims=${ghostSeen.anims}`);
    /* C2b 是最关键的一条：末帧落点必须回到**入口那张卡**的矩形。
       只断言「有收缩动画」是没牙的 —— 收错地方一样在动。 */
    {
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+),\s*([-\d.]+)\)/.exec(
        ghostSeen.end || '',
      );
      const landed =
        m && ghostSeen.box
          ? {
              left: Math.round(ghostSeen.box.left + Number(m[1])),
              top: Math.round(ghostSeen.box.top + Number(m[2])),
              width: Math.round(ghostSeen.box.width * Number(m[3])),
              height: Math.round(ghostSeen.box.height * Number(m[4])),
            }
          : null;
      check(
        'C2b 末帧落在入口那张卡的矩形上（±16px）',
        near(landed, cardRect, 16),
        `${JSON.stringify(landed)} vs ${JSON.stringify(cardRect)}`,
      );
    }
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
} catch (error) {
  check('Z9 探针未抛异常', false, String(error?.message || error).slice(0, 400));
} finally {
  await browser.close();
}

console.log('\n' + results.join('\n'));
console.log(`\n===== probe-forum-motion: ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
