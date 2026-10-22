#!/usr/bin/env node
/**
 * probe-post-detail-adaptive-media.mjs — 左栏随图比例自适应验收（2026-10-22）
 *
 * 用户定稿口径：
 *   Q1 信息列固定 460px（文案/评论区宽度恒定，不随图抖动）
 *   Q2 宽图时面板真的变宽（上限 = min(视口可用宽, 1040)；1040 为用户二次口径）
 *   Q3 多图切换实时变 + 慢速优雅过渡
 *
 * 判据：
 *   A. 信息列恒为 460px（任意比例下）
 *      ⚠️ 断言设计要点（踩过）：最初的反证是把 CSS 从 `var(--pd-info-col)` 改回
 *      `minmax(340px, 1fr)`，结果 A 仍然 PASS —— 因为面板宽恰好等于「媒体列 + 460」，
 *      1fr 会自动填成 460，**探针区分不出「固定」与「自动填满」**。
 *      有效的反证是把信息列写成与 JS 不一致的固定值（如 400px），A 才会 FAIL。
 *      改这条断言前先确认它能被证伪。
 *   B. 1:1 图：媒体列宽 ≈ 列高（不浪费、不留白）
 *   C. 竖图（9:16）：面板变窄，媒体列跟随变窄
 *   D. 极端长竖（0.2）：媒体列夹在下限 380，面板不塌
 *   E. 极端宽（4.0）：媒体列夹在上限（视口可用宽−460），面板不溢出视口
 *   F. 面板声明了 width 过渡（≤1s 的缓动，不是瞬跳）
 *   G. 像素数字徽标已移除（.post-detail-image-meta 不存在）
 *
 * 用法：node scripts/probes/probe-post-detail-adaptive-media.mjs [--assert]
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
const POST = '0ac059e1-b258-41ee-8407-0e0a5752f6a7';
const INFO_COL = 460;
const MEDIA_MIN = 380;
const results = [];
const rec = (n, pass, d) => {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}   ${n}${d ? `\n        ${d}` : ''}`);
};

const run = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 30000 });
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_user', role: 'user' });
  });
  await page.evaluate(async (id) => {
    const m = await import('/src/composables/usePostDetailModal.js');
    m.usePostDetailModal().open(id);
  }, POST);
  await page.waitForSelector('.pd-modal-overlay', { timeout: 20000 });
  await page.waitForTimeout(6000);

  // G. 像素数字徽标已移除
  const badge = await page.$('.post-detail-image-meta');
  rec('G. 不再显示图片像素数字', !badge, badge ? '仍存在 .post-detail-image-meta' : '模板与样式均已移除');

  // F. 过渡存在（在面板上读 transition-duration）
  const trans = await page.evaluate(() => {
    const el = document.querySelector('.pd-modal-panel');
    const cs = getComputedStyle(el);
    return { prop: cs.transitionProperty, dur: cs.transitionDuration };
  });
  const durMs = parseFloat(trans.dur) * (trans.dur.includes('ms') ? 1 : 1000);
  rec(
    'F. 面板宽度有慢速过渡（不瞬跳）',
    trans.prop.includes('width') && durMs >= 300 && durMs <= 1000,
    `property=${trans.prop} duration=${trans.dur}`,
  );

  // 驱动 mediaRatio 测各档
  const setRatio = async (r) => {
    await page.evaluate((rt) => {
      const panel = document.querySelector('.pd-modal-panel');
      let inst = panel.__vueParentComponent;
      while (inst && !('mediaRatio' in (inst.setupState || {}))) inst = inst.parent;
      if (inst?.setupState && 'mediaRatio' in inst.setupState) inst.setupState.mediaRatio = rt;
    }, r);
    await page.waitForTimeout(950); // 等过渡走完
    return page.evaluate(() => {
      const panel = document.querySelector('.pd-modal-panel');
      const body = document.querySelector('.pd-modal-body');
      const cols = getComputedStyle(body).gridTemplateColumns.split(' ').map(parseFloat);
      return {
        panelW: +panel.getBoundingClientRect().width.toFixed(0),
        mediaCol: cols[0],
        infoCol: cols[1],
        vw: window.innerWidth,
      };
    });
  };

  // A. 信息列恒定
  const rs = [1.0, 1.5, 0.5625, 0.2, 4.0];
  const infos = [];
  const geos = {};
  for (const r of rs) {
    const g = await setRatio(r);
    geos[r] = g;
    infos.push(g.infoCol);
  }
  const infoOk = infos.every((v) => Math.abs(v - INFO_COL) <= 2);
  rec('A. 信息列恒为 460px（不随图抖动）', infoOk, `各档实测 ${infos.map((v) => v.toFixed(0)).join(' / ')}`);

  // B. 宽图吃满媒体列上限（面板硬上限 1040 − 信息列 460 = 580）
  // ⚠️ 判据在 2026-10-22 变过一次，旧结论已作废：
  //    用户先要「宽图左栏尽量长出来」，那时 1:1 图媒体列可到 852（≈列高、零留白）；
  //    随后用户改口径「面板不要太特别宽，比参考例图再宽一点点」⇒ 面板硬上限 1040，
  //    媒体列最多 580，1:1/横图必然在 580 处被夹、留下横向留白。
  //    所以这里**不能**再断言「≈列高」，而是断言「吃满 580 上限」。
  const g1 = geos[1.0];
  const mediaCap = 1040 - INFO_COL; // 580
  rec(
    'B. 宽图吃满媒体列上限（面板 1040 − 信息列 460）',
    Math.abs(g1.mediaCol - mediaCap) <= 4,
    `媒体列 ${g1.mediaCol}px / 上限 ${mediaCap}px（面板硬上限 1040 由用户二次口径定）`,
  );

  // C. 竖图变窄
  const gV = geos[0.5625];
  rec(
    'C. 竖图面板与媒体列同步收窄',
    gV.mediaCol < g1.mediaCol && gV.panelW < g1.panelW,
    `9:16 媒体列 ${gV.mediaCol} vs 1:1 ${g1.mediaCol}；面板 ${gV.panelW} vs ${g1.panelW}`,
  );

  // D. 极端长竖夹下限
  const gN = geos[0.2];
  rec(
    'D. 极端长竖夹在媒体列下限 380',
    Math.abs(gN.mediaCol - MEDIA_MIN) <= 2 && gN.panelW >= 700,
    `媒体列 ${gN.mediaCol}（下限 ${MEDIA_MIN}），面板 ${gN.panelW}`,
  );

  // E. 极端宽不溢出视口
  const gW = geos[4.0];
  rec(
    'E. 极端宽不溢出视口',
    gW.panelW <= gW.vw - 40 && gW.mediaCol <= gW.vw - INFO_COL,
    `面板 ${gW.panelW} ≤ 视口 ${gW.vw}−40；媒体列 ${gW.mediaCol} ≤ 视口−${INFO_COL}`,
  );

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n小结  ${passed}/${results.length} 项达标`);
  if (ASSERT && passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error('探针异常：', e.message);
  if (ASSERT) process.exit(1);
});
