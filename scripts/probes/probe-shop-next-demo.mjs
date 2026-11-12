// 探针：周边商城「下一步」原型 demo（shop-next-demo.html）
//
// 这个 demo 是给决策用的，不是线上代码 —— 所以探针守的不是「实现对不对」，
// 而是「演示是否真的演示了它声称的差异」。最常见的失效方式是**静默断链**：
// 切了模式但样式没变、点了清理但数组没动、结论区是上一次的文案。
// 这类问题页面看着正常，只有量出来才知道。
//
// 用法（从仓库根跑，不需要 dev server；原型本体在 docs/demos/，
// 根目录不放新的沙盒 html —— check:root-clean 会拦）：
//   node scripts/probes/probe-shop-next-demo.mjs
// 反证（改一份带缺陷的副本，断言必须变红）：
//   DEMO_FILE=file:///tmp/bad.html node scripts/probes/probe-shop-next-demo.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FILE = process.env.DEMO_FILE || pathToFileURL(resolve('docs/demos/shop-next-demo.html')).href;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

const click = (sel) => page.click(sel);
const hiddenInvariant = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[hidden]')).every(
      (el) => getComputedStyle(el).display === 'none',
    ),
  );

try {
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForSelector('#grid .card', { timeout: 15000 });

  /* ── ① 骨架 ───────────────────────────────────────────── */
  check(
    '三张面板 / 三个 tab 都渲染出来了',
    await page.evaluate(() => {
      return (
        document.querySelectorAll('.panel').length === 3 &&
        document.querySelectorAll('#tabs .tab').length === 3
      );
    }),
  );

  check(
    '商品卡数量与数据源一致（5 张）',
    await page.evaluate(() => {
      return document.querySelectorAll('#grid .card').length === 5;
    }),
  );

  /* ── ② 价格主视觉：现状 12px 灰 → 建议 17px 品牌色 ─────── */
  const nowPrice = await page.evaluate(() => {
    const el = document.querySelector('#grid .card .price b');
    const cs = getComputedStyle(el);
    return { size: parseFloat(cs.fontSize), color: cs.color, weight: cs.fontWeight };
  });
  check(
    '现状：价格数字是 12px 的二级灰（注脚级）',
    nowPrice.size === 12 && nowPrice.color === 'rgb(134, 134, 139)',
    JSON.stringify(nowPrice),
  );

  await click('#seg-mode [data-mode="fix"]');
  await page.waitForTimeout(80);
  const fixPrice = await page.evaluate(() => {
    const el = document.querySelector('#grid .card .price b');
    const cs = getComputedStyle(el);
    return { size: parseFloat(cs.fontSize), color: cs.color, weight: Number(cs.fontWeight) };
  });
  check(
    '建议：价格升到 17px / 700 / 品牌色（主视觉）',
    fixPrice.size >= 17 && fixPrice.weight >= 700 && fixPrice.color === 'rgb(0, 113, 227)',
    JSON.stringify(fixPrice),
  );

  /* ── ③ 售罄角标 ───────────────────────────────────────── */
  const soldNow = await page.evaluate(() => {
    // 现状态由 mode 重置回去单独量
    return document.querySelectorAll('#grid .card[data-sold="1"] .badge').length;
  });
  await click('#seg-mode [data-mode="now"]');
  await page.waitForTimeout(60);
  const soldBefore = await page.evaluate(() => document.querySelectorAll('#grid .badge').length);
  check('现状：售罄卡没有任何角标', soldBefore === 0, `badge=${soldBefore}`);
  await click('#seg-mode [data-mode="fix"]');
  await page.waitForTimeout(60);
  check(
    '建议：售罄卡出现角标',
    (await page.evaluate(
      () => document.querySelectorAll('#grid .card[data-sold="1"] .badge').length,
    )) === 1,
    `fix 态 badge=${soldNow}`,
  );

  /* ── ④ 列数：手机 2 列 / 桌面建议 ≥4 列 ───────────────── */
  const colsAt = () =>
    page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#grid .card'));
      const firstTop = cards[0].getBoundingClientRect().top;
      return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - firstTop) < 2).length;
    });
  const phoneCols = await colsAt();
  check('手机视口 2 列', phoneCols === 2, `cols=${phoneCols}`);

  await click('#seg-device [data-device="desk"]');
  await page.waitForTimeout(120);
  const deskCols = await colsAt();
  check('桌面 + 建议态 ≥4 列（现状只有 3 列）', deskCols >= 4, `cols=${deskCols}`);

  await click('#seg-mode [data-mode="now"]');
  await page.waitForTimeout(80);
  const deskColsNow = await colsAt();
  check(
    '桌面 + 现状态仍是 3 列（差异是真的）',
    deskColsNow === 3 && deskCols > deskColsNow,
    `now=${deskColsNow} fix=${deskCols}`,
  );
  await click('#seg-device [data-device="phone"]');
  await page.waitForTimeout(80);

  /* ── ⑤ 标注开关 ───────────────────────────────────────── */
  const annoOn = await page.evaluate(() => document.querySelectorAll('.anno').length);
  await click('#seg-anno [data-anno="off"]');
  await page.waitForTimeout(80);
  const annoOff = await page.evaluate(() => ({
    chips: document.querySelectorAll('.anno').length,
    legend: getComputedStyle(document.querySelector('#legend')).display,
  }));
  check(
    '标注可关：关掉后圆标清空且说明栏隐藏',
    annoOn > 0 && annoOff.chips === 0 && annoOff.legend === 'none',
    JSON.stringify({ annoOn, ...annoOff }),
  );

  await click('#seg-anno [data-anno="on"]');
  await page.waitForTimeout(80);
  /* 每个圆标都必须自己能被点中 —— 只测第一个会漏掉「浮标压在按钮上」这类问题
     （实测踩过：购物袋失效行的圆标原本放在 top-right，正好盖住移除按钮） */
  const hit = await page.evaluate(() => {
    // 只量可见的圆标：隐藏面板里的圆标 rect 全是 0，拿去 elementFromPoint 只会得到假红
    const chips = Array.from(document.querySelectorAll('.anno')).filter(
      (chip) => chip.getClientRects().length > 0,
    );
    if (!chips.length) return { total: 0, ok: 0 };
    const ok = chips.filter((chip) => {
      const r = chip.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === chip;
    }).length;
    return { total: chips.length, ok };
  });
  check(
    '标注圆标全部可命中（没被卡片/角标/按钮盖住）',
    hit.total > 0 && hit.ok === hit.total,
    JSON.stringify(hit),
  );

  /* ── ⑥ 购物袋：旧行为 vs 推荐行为 ─────────────────────── */
  await click('#tabs [data-tab="bag"]');
  await page.waitForSelector('[data-panel="bag"] .row', { timeout: 8000 });

  const oldBag = await page.evaluate(() => ({
    rows: document.querySelectorAll('#bag .row').length,
    tags: document.querySelectorAll('#bag .row-tag').length,
    ctaDisabled: document.querySelector('#bag-cta').disabled,
    total: document.querySelector('#bag-total').textContent.trim(),
  }));
  check(
    '旧行为：4 件全在、无失效标签、结算按钮照样可点',
    oldBag.rows === 4 && oldBag.tags === 0 && oldBag.ctaDisabled === false,
    JSON.stringify(oldBag),
  );

  await click('#seg-bag [data-bag="new"]');
  await page.waitForTimeout(80);
  const newBag = await page.evaluate(() => ({
    tags: document.querySelectorAll('#bag .row-tag').length,
    invalidRows: document.querySelectorAll('#bag .row[data-valid="0"]').length,
    ctaDisabled: document.querySelector('#bag-cta').disabled,
    why: document.querySelector('#bag-why').hidden
      ? ''
      : document.querySelector('#bag-why').textContent.trim(),
    total: document.querySelector('#bag-total').textContent.replace(/\s+/g, ' ').trim(),
  }));
  check(
    '推荐行为：2 件失效被标注并拦下提交',
    newBag.tags >= 2 &&
      newBag.invalidRows === 2 &&
      newBag.ctaDisabled === true &&
      newBag.why.length > 0,
    JSON.stringify(newBag),
  );
  check(
    '推荐行为：合计只算可结算行（175 积分 + ¥11.90）',
    newBag.total.includes('175') && newBag.total.includes('¥11.90'),
    newBag.total,
  );

  /* 圆标曾经压在失效行的移除按钮上（top-right 撞位）—— 只测「圆标本身能不能点中」抓不到，
     得反过来测「按钮还能不能被点中」。 */
  const removeHit = await page.evaluate(() => {
    const btn = document.querySelector('#bag .row[data-valid="0"] .row-x');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === btn;
  });
  check('失效行的移除按钮没被标注圆标盖住', removeHit);
  /* 快照口径：55 + 40×2 + 30 + 0 = 165 积分；现金 11.90 + 39.00 = 50.90。
     失效的两件（下架 30 积分 / 售罄 ¥39.00）照样被算进合计 —— 这正是旧行为的毛病。 */
  check(
    '旧行为合计把失效行也算进去（165 积分 + ¥50.90）',
    oldBag.total.includes('165') && oldBag.total.includes('¥50.90'),
    oldBag.total,
  );

  await click('#btn-clean');
  await page.waitForTimeout(80);
  const cleaned = await page.evaluate(() => ({
    rows: document.querySelectorAll('#bag .row').length,
    ctaDisabled: document.querySelector('#bag-cta').disabled,
  }));
  check(
    '移除失效后只剩 2 件且可以提交',
    cleaned.rows === 2 && cleaned.ctaDisabled === false,
    JSON.stringify(cleaned),
  );

  /* ── ⑦ 决策开关真的改预览 ─────────────────────────────── */
  await click('#tabs [data-tab="decide"]');
  await page.waitForSelector('#pv-amount .amt-row', { timeout: 8000 });

  const freeText = await page.textContent('#pv-amount');
  check('默认运费=包邮：金额区写「包邮」', freeText.includes('包邮'));

  await click('[data-segkey="freight"] [data-val="threshold"]');
  await page.waitForTimeout(80);
  const thrText = await page.evaluate(() => ({
    amount: document.querySelector('#pv-amount').textContent.replace(/\s+/g, ' '),
    note: document.querySelector('[data-note="freight"]').textContent.replace(/\s+/g, ' '),
    total: document.querySelector('#pv-amount .is-total b').textContent.replace(/\s+/g, ''),
    result: document.querySelector('#pv-result .pv-title').textContent,
  }));
  check(
    '切「满 99 包邮」：金额区出现 ¥8.00 且应付变 ¥19.90',
    thrText.amount.includes('¥8.00') && thrText.total.includes('¥19.90'),
    JSON.stringify(thrText),
  );
  check(
    '运费口径变了，代价说明跟着变（不是恒等文案）',
    thrText.note.includes('同口径') && !thrText.note.includes('不动表结构'),
  );

  await click('[data-segkey="pay"] [data-val="wechat"]');
  await page.waitForTimeout(80);
  const wechat = await page.evaluate(() => ({
    title: document.querySelector('#pv-result .pv-title').textContent,
    chip: document.querySelector('#pv-result .pv-chip').textContent,
  }));
  check(
    '收款=微信支付：结果页才敢说「支付成功」',
    wechat.title.includes('支付成功') && wechat.chip.includes('已付款'),
    JSON.stringify(wechat),
  );

  await click('[data-segkey="pay"] [data-val="points"]');
  await page.waitForTimeout(80);
  const pointsOnly = await page.evaluate(() => ({
    title: document.querySelector('#pv-result .pv-title').textContent,
    sub: document.querySelector('#pv-result .pv-sub').textContent,
  }));
  check(
    '收款=纯积分：标题回到「礼物已提交」，且没有待付款态',
    pointsOnly.title.includes('礼物已提交') && !pointsOnly.title.includes('待付'),
    JSON.stringify(pointsOnly),
  );

  await click('[data-segkey="pay"] [data-val="offline"]');
  await page.waitForTimeout(80);
  const offline = await page.evaluate(
    () => document.querySelector('#pv-result .pv-title').textContent,
  );
  check(
    '收款=线下：标题带「待付」金额（现状最危险的那一格）',
    offline.includes('待付') && offline.includes('19.90'),
    offline,
  );

  /* ── ⑧ 主题 ───────────────────────────────────────────── */
  await click('#seg-theme [data-theme="dark"]');
  await page.waitForTimeout(120);
  const dark = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.querySelector('.tab')).color,
    device: getComputedStyle(document.querySelector('.device')).backgroundColor,
  }));
  check(
    '深色：页面底色与正文都翻转（不是只换卡片）',
    dark.body === 'rgb(16, 17, 20)' && dark.device === 'rgb(28, 28, 30)',
    JSON.stringify(dark),
  );

  /* ── ⑨ 不变式 ─────────────────────────────────────────── */
  check('[hidden] 不变式：带 hidden 的元素都真的不显示', await hiddenInvariant());
  check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' / '));
} catch (error) {
  check('探针执行未抛异常', false, String(error).slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${failed === 0 ? '全绿' : `失败 ${failed} 项`}  (${FILE})`);
process.exit(failed === 0 ? 0 : 1);
