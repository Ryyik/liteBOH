#!/usr/bin/env node
/**
 * probe-feed-image-gutter.mjs — 帖子卡片图片内衬验收（2026-10-22）
 *
 * 口径（用户 2026-10-22 明确）：
 *   · **单图帖**：不贴边，图片落在卡片 padding 内，左右对称；
 *   · **多图帖**：允许贴边（右缘贴边是为了让下一张露出来，暗示可横滑）。
 *
 * 判据：
 *   A. 单图：左右间隙都 ≈ 卡片 padding（竖屏 16 / 横屏 24），且左右对称
 *   B. 多图：右缘贴边（间隙 ≤ 2），左缘保留呼吸（> 8）
 *   C. 两种视口各测一遍（390 竖屏 / 1440 横屏）
 *
 * 用法：node scripts/probes/probe-feed-image-gutter.mjs [--assert]
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}   ${name}${detail ? `\n        ${detail}` : ''}`);
};

const probe = async (browser, w, h, label) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 30000 });
  await page.waitForTimeout(8000);
  const data = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.post-card-v2').forEach((card, i) => {
      if (i > 5) return;
      const wrap = card.querySelector('.image-post-strip-wrap');
      if (!wrap) return;
      const strip = wrap.querySelector('.image-post-strip');
      if (!strip) return;
      const cr = card.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const cs = getComputedStyle(card);
      out.push({
        single: strip.classList.contains('is-single'),
        cardPad: parseFloat(cs.paddingLeft) || 0,
        gapL: +(wr.x - cr.x).toFixed(1),
        gapR: +(cr.right - wr.right).toFixed(1),
      });
    });
    return out;
  });
  await ctx.close();

  const singles = data.filter((d) => d.single);
  const multis = data.filter((d) => !d.single);

  if (singles.length) {
    const s = singles[0];
    const tol = 2;
    const okL = Math.abs(s.gapL - s.cardPad) <= tol;
    const okR = Math.abs(s.gapR - s.cardPad) <= tol;
    const symmetric = Math.abs(s.gapL - s.gapR) <= tol;
    rec(
      `${label} A. 单图不贴边（左右 ≈ padding ${s.cardPad}px）`,
      okL && okR && symmetric,
      `实测 左 ${s.gapL} / 右 ${s.gapR}（卡片 padding ${s.cardPad}）`,
    );
  } else {
    rec(`${label} A. 单图不贴边`, false, '样本里没有单图帖，无法判定');
  }

  if (multis.length) {
    const m = multis[0];
    rec(
      `${label} B. 多图允许贴边（右缘贴边 + 左缘留呼吸）`,
      m.gapR <= 2 && m.gapL > 8,
      `实测 左 ${m.gapL} / 右 ${m.gapR}`,
    );
  } else {
    console.log(`  （${label} 无多图样本，跳过 B）`);
  }
};

const run = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  await probe(browser, 390, 844, '竖屏');
  await probe(browser, 1440, 900, '横屏');
  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n小结  ${passed}/${results.length} 项达标`);
  if (ASSERT && passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error('探针异常：', e.message);
  if (ASSERT) process.exit(1);
});
