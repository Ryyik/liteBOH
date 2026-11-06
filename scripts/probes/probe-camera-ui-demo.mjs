/**
 * boh-camera-ui-demo.html 的自证探针（UI 原型型）。
 *
 * 直接 file:// 加载，不需要 dev server。
 *   node scripts/probes/probe-camera-ui-demo.mjs
 *   DEMO_FILE=file:///tmp/rev.html node scripts/probes/probe-camera-ui-demo.mjs   # 反证
 *
 * 关键断言是「两种模式的差异真的存在」和「标注气泡真的看得见」——
 * 后者只能用 elementFromPoint 判，尺寸和 visibility 都测不出来。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DEMO_FILE =
  process.env.DEMO_FILE ||
  `file://${path.resolve(process.cwd(), 'docs/demos/boh-camera-ui-demo.html')}`;
const OUT = path.resolve(process.cwd(), 'debug-screenshots');
const EXPECT_RED = (process.env.EXPECT_RED || '').trim();

const CHROME =
  '/Users/ryyik/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) process.exitCode = 1;
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

mkdirSync(OUT, { recursive: true });

await page.goto(DEMO_FILE, { waitUntil: 'load' });
await page.waitForTimeout(400);

/* 1. 结构与默认态 */
const chipCount = await page.locator('.chip').count();
check('01 滤镜条 12 档', chipCount === 12, `实际 ${chipCount}`);

const itemCount = await page.locator('.item').count();
check('02 侧栏 6 条改动', itemCount === 6, `实际 ${itemCount}`);

check(
  '03 默认是「建议」态',
  await page
    .locator('#modeSeg button[data-mode="advice"]')
    .evaluate((b) => b.classList.contains('is-on')),
);

/* 4. 建议态的四项可见性 */
const adviceVis = await page.evaluate(() => {
  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' ? 'on' : 'off';
  };
  return {
    roll: vis('.roll'),
    info: vis('.info'),
    box: vis('.box'),
    swatch: vis('.swatch'),
  };
});
check(
  '04 建议态：卷号/信息条/胶卷盒 可见，色块 隐藏',
  adviceVis.roll === 'on' &&
    adviceVis.info === 'on' &&
    adviceVis.box === 'on' &&
    adviceVis.swatch === 'off',
  JSON.stringify(adviceVis),
);

await page.screenshot({ path: path.join(OUT, 'demo-A-advice-live.png') });

/* 5. 切到现状 */
await page.click('#modeSeg button[data-mode="now"]');
await page.waitForTimeout(260);
const nowVis = await page.evaluate(() => {
  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' ? 'on' : 'off';
  };
  return { roll: vis('.roll'), info: vis('.info'), box: vis('.box'), swatch: vis('.swatch') };
});
check(
  '05 现状态：卷号/信息条/胶卷盒 隐藏，色块 可见',
  nowVis.roll === 'off' && nowVis.info === 'off' && nowVis.box === 'off' && nowVis.swatch === 'on',
  JSON.stringify(nowVis),
);

/* 6. 现状态拍照：计数角标 +1，无飞行层残留 */
await page.click('#shutter');
await page.waitForTimeout(420);
const nowShot = await page.evaluate(() => ({
  badge: document.querySelector('.stack-count')?.textContent || '',
  fly: document.querySelectorAll('.fly').length,
}));
check(
  '06 现状拍照 → 角标 1 且没有飞行层',
  nowShot.badge === '1' && nowShot.fly === 0,
  JSON.stringify(nowShot),
);

await page.screenshot({ path: path.join(OUT, 'demo-B-now-live.png') });

/* 7. 回建议态，连拍 3 张：卷号 07 → 11 */
await page.click('#modeSeg button[data-mode="advice"]');
await page.waitForTimeout(200);
const before = await page.locator('#rollNow').textContent();
await page.click('#shutter');
await page.waitForTimeout(120);
const flyMid = await page.locator('.fly').count(); // 飞行中的那一帧
await page.waitForTimeout(500);
await page.click('#shutter');
await page.waitForTimeout(620);
await page.click('#shutter');
await page.waitForTimeout(620);
const after = await page.locator('#rollNow').textContent();
const stackAfter = await page
  .locator('.stack-count')
  .evaluate((el) => getComputedStyle(el).display);
check('07 过片动效真的有一帧飞行层', flyMid >= 1, `飞行动画中层数 ${flyMid}`);
check('08 连拍 3 张卷号 08 → 11', before === '08' && after === '11', `${before} → ${after}`);
check('09 建议态隐藏数字角标（改用卷号）', stackAfter === 'none', stackAfter);

await page.screenshot({ path: path.join(OUT, 'demo-C-advice-stack.png') });

/* 10. 标注：点第 2 条 → 气泡可见且可点中 */
await page.click('.item[data-note="2"]');
await page.waitForTimeout(300);
const noteInfo = await page.evaluate(() => {
  const n = document.querySelector('#note');
  const cs = getComputedStyle(n);
  const r = n.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    visible: cs.opacity !== '0' && cs.display !== 'none',
    inside: !!(hit && n.contains(hit)),
    hit: hit ? hit.className && String(hit.className) : 'null',
    top: Math.round(r.top),
    left: Math.round(r.left),
  };
});
check('10 标注气泡可见', noteInfo.visible, JSON.stringify(noteInfo));
check(
  '11 气泡没被裁剪/遮挡（elementFromPoint 命中自身）',
  noteInfo.inside,
  JSON.stringify(noteInfo),
);

await page.screenshot({ path: path.join(OUT, 'demo-D-note.png') });

/* 12. 气泡不能跑出手屏 */
const inBounds = await page.evaluate(() => {
  const scr = document.querySelector('#scr').getBoundingClientRect();
  const n = document.querySelector('#note').getBoundingClientRect();
  return (
    n.left >= scr.left - 1 &&
    n.right <= scr.right + 1 &&
    n.top >= scr.top - 1 &&
    n.bottom <= scr.bottom + 1
  );
});
check('12 气泡在手机屏内（不溢出）', inBounds);

/* 13. 暂存相册 + 片基 */
await page.click('#stack');
await page.waitForTimeout(320);
const rv = await page.evaluate(() => {
  const items = document.querySelectorAll('.rv-item');
  const neg = document.querySelector('.rv-item .neg');
  return {
    count: items.length,
    negVisible: neg ? getComputedStyle(neg).display !== 'none' : false,
    plainVisible: (() => {
      const p = document.querySelector('.rv-item .plain');
      return p ? getComputedStyle(p).display !== 'none' : false;
    })(),
    head: document.querySelector('.rv-head b')?.textContent?.trim() || '',
  };
});
check(
  '13 暂存相册 4 张且片基可见',
  rv.count === 4 && rv.negVisible && !rv.plainVisible,
  JSON.stringify(rv),
);

await page.screenshot({ path: path.join(OUT, 'demo-E-review.png') });

/* 14. 删一张 */
await page.click('.rv-item .rv-rm');
await page.waitForTimeout(200);
const afterRm = await page.locator('.rv-item').count();
check('14 删除一张后剩 3', afterRm === 3, `剩 ${afterRm}`);

/* 15. 完成 → 回到图库提示 */
await page.click('#rvDone');
await page.waitForTimeout(200);
const toast = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#scr div'))
    .map((d) => d.textContent || '')
    .some((t) => t.includes('上传队列')),
);
check('15 完成后有交接提示', toast);

/* 16. 标注关掉后气泡消失 */
await page.click('#notesOn');
await page.waitForTimeout(320);
const noteOff = await page.evaluate(
  () => getComputedStyle(document.querySelector('#note')).opacity,
);
check('16 关掉标注后气泡不可见', noteOff === '0', `opacity ${noteOff}`);

/* 17. 重置 */
await page.click('#resetBtn');
await page.waitForTimeout(200);
const resetState = await page.evaluate(() => ({
  roll: document.querySelector('#rollNow').textContent,
  empty: document.querySelector('#stack').classList.contains('is-empty'),
  chip: document.querySelector('.chip.is-on')?.getAttribute('data-id'),
}));
check(
  '17 重置：卷号 07 / 空片位 / 滤镜回 Gold',
  resetState.roll === '07' && resetState.empty && resetState.chip === 'gold',
  JSON.stringify(resetState),
);

/* 18. 无 JS 错误 */
check('18 无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

/* 输出 */
const pass = results.filter((r) => r.ok).length;
console.log(`\n${DEMO_FILE}\n`);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.detail}`);
}
console.log(`\n${pass}/${results.length} passed`);

if (EXPECT_RED) {
  const firstFail = results.find((r) => !r.ok);
  const matched = firstFail && EXPECT_RED.split(',').some((k) => firstFail.name.includes(k.trim()));
  console.log(
    matched
      ? `\n[反证成功] 预期变红的断言确实红了：${firstFail.name}`
      : `\n[反证失败] 没有在预期断言上变红（期望含 ${EXPECT_RED}，实际首个失败：${firstFail?.name || '无'}）`,
  );
  if (!matched) process.exitCode = 1;
}
