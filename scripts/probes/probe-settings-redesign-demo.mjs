const FILE =
  process.env.DEMO_FILE ||
  'file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/docs/demos/settings-redesign-demo.html';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({
  viewport: { width: 1180, height: 1100 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const results = [];
const assert = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` · ${detail}` : ''}`);
};

await page.goto(FILE, { waitUntil: 'load' });
await page.waitForTimeout(500);

// 1 两侧渲染
const rows = await page.evaluate(() => ({
  now: document.querySelectorAll('.now .row').length,
  new_: document.querySelectorAll('.new .row').length,
}));
assert('两侧都渲染出行', rows.now === 6 && rows.new_ === 9, `now=${rows.now} new=${rows.new_}`);

// 2 标注点：4 个且可见（elementFromPoint 命中自身）
const dots = await page.evaluate(() => {
  const ds = [...document.querySelectorAll('.dot')];
  return ds.map((d) => {
    const r = d.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: d.textContent, w: Math.round(r.width), h: Math.round(r.height), hit: hit === d };
  });
});
assert('标注点数量 = 4', dots.length === 4, JSON.stringify(dots.map((d) => d.text)));
assert(
  '标注点全部可见（elementFromPoint 命中自身）',
  dots.every((d) => d.hit),
  JSON.stringify(dots),
);
assert(
  '标注点尺寸 19×19 未被撑大',
  dots.every((d) => d.w === 19 && d.h === 19),
  JSON.stringify(dots.map((d) => `${d.w}x${d.h}`)),
);

// 3 行高差异真实存在
const geo = await page.evaluate(() => {
  const h = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().height) : -1;
  };
  const radius = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).borderTopLeftRadius : '';
  };
  const bleed = (sel) => {
    const el = document.querySelector(sel);
    const p = el.closest('.scroll').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left - p.left),
      width: Math.round(r.width),
      pWidth: Math.round(p.width),
    };
  };
  return {
    nowRow: h('.now .row'),
    newRow: h('.new [data-row="probe"]'),
    acctRow: h('.new .acct-row'),
    nowRadius: radius('.now .card'),
    newRadius: radius('.new .card'),
    newCard: bleed('.new .card'),
  };
});
assert('行高现在 68px', geo.nowRow === 68, `${geo.nowRow}px`);
assert('行高改后 44px（普通行）', geo.newRow === 44, `${geo.newRow}px`);
assert('账户行因 26px 头像而 48px', geo.acctRow === 48, `${geo.acctRow}px`);
assert('现在卡片方角（0px）', geo.nowRadius === '0px', geo.nowRadius);
assert('改后卡片 20px 圆角', geo.newRadius === '20px', geo.newRadius);
assert(
  '改后卡片左右内缩 16px',
  geo.newCard.left === 16 && geo.newCard.width === geo.newCard.pWidth - 32,
  JSON.stringify(geo.newCard),
);

// 4 主题切换
await page.click('.seg[data-key="theme"] button[data-val="dark"]');
await page.waitForTimeout(300);
const dark = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-theme'),
  pageBg: getComputedStyle(document.body).backgroundColor,
  pressed: document
    .querySelector('.seg[data-key="theme"] button[data-val="dark"]')
    .getAttribute('aria-pressed'),
}));
assert('切深色：根属性切换', dark.attr === 'dark', dark.attr);
assert('切深色：按钮 aria-pressed 更新', dark.pressed === 'true', dark.pressed);

// 5 材质切换：平卡 vs 玻璃的 backdrop 差异
await page.click('.seg[data-key="material"] button[data-val="flat"]');
await page.waitForTimeout(300);
const flat = await page.evaluate(() => {
  const el = document.querySelector('.new .card');
  const cs = getComputedStyle(el);
  return {
    backdrop: cs.backdropFilter,
    shadow: cs.boxShadow,
    mat: document.documentElement.getAttribute('data-material'),
  };
});
assert('切平卡：材质属性生效', flat.mat === 'flat', flat.mat);
assert('切平卡：backdrop-filter 被移除', flat.backdrop === 'none', flat.backdrop);
assert('切平卡：投影被移除', flat.shadow === 'none', flat.shadow);

// 5b 材质开关必须看得见差别。getComputedStyle 只能证明属性被设置 —— 底是纯色时
//     backdrop-filter 写了也等于没写。
//     ⚠️ 不能拿「玻璃 vs 平卡」比：两者填充色本来就不同，永远有差，等于恒真断言。
//     正确做法：**固定背景为品牌主图，只摘掉 backdrop-filter**，比较卡片内逐列亮度
//     的离散度 —— 背后的高频纹理被模糊后会渗进卡片，不模糊则各列几乎一致。
const stripStats = async () => {
  const box = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#phone-new .card')];
    const big = cards.reduce((a, b) =>
      a.getBoundingClientRect().height > b.getBoundingClientRect().height ? a : b,
    );
    const r = big.getBoundingClientRect();
    return {
      x: Math.round(r.x) + 12,
      y: Math.round(r.top) + 6,
      width: Math.round(r.width) - 24,
      height: 5,
    };
  });
  const buf = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const cols = [];
  for (let x = 0; x < info.width; x += 1) {
    let lum = 0;
    for (let y = 0; y < info.height; y += 1) {
      const i = (y * info.width + x) * info.channels;
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    cols.push(lum / info.height);
  }
  const mean = cols.reduce((a, v) => a + v, 0) / cols.length;
  const sd = Math.sqrt(cols.reduce((a, v) => a + (v - mean) ** 2, 0) / cols.length);
  return { mean: +mean.toFixed(2), sd: +sd.toFixed(2) };
};

// 背景切品牌主图（玻璃要有东西可模糊才谈得上「玻璃」）
await page.click('.seg[data-key="bg"] button[data-val="image"]');
await page.click('.seg[data-key="material"] button[data-val="glass"]');
await page.waitForTimeout(700);
const withBlur = await stripStats();

// 只摘掉模糊，其它一律不动
await page.addStyleTag({
  content:
    '#phone-new .card{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
});
await page.waitForTimeout(500);
const noBlur = await stripStats();
console.log('withBlur', JSON.stringify(withBlur), 'noBlur', JSON.stringify(noBlur));
assert(
  '材质：有背景图时玻璃确实起模糊作用（sd 明显下降）',
  noBlur.sd > 1.5 && withBlur.sd < noBlur.sd * 0.75,
  `有模糊 sd=${withBlur.sd} / 无模糊 sd=${noBlur.sd}`,
);

// 6 标注开关
await page.click('.seg[data-key="annot"] button[data-val="off"]');
await page.waitForTimeout(300);
const offDots = await page.evaluate(
  () =>
    [...document.querySelectorAll('.dot')].filter((d) => {
      const r = d.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === d;
    }).length,
);
assert('隐藏标注后无可见标注点', offDots === 0, `可见=${offDots}`);

// 7 对比度（浅色 / 深色各测）
const contrast = async () =>
  page.evaluate(() => {
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (s) =>
      s
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const alphaOf = (s) => {
      const p = s.match(/[\d.]+/g);
      return p && p.length > 3 ? Number(p[3]) : 1;
    };
    const bg = (el) => {
      let acc = [255, 255, 255];
      const chain = [];
      let n = el;
      while (n) {
        chain.push(n);
        n = n.parentElement;
      }
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const cs = getComputedStyle(chain[i]);
        if (cs.backgroundColor === 'transparent') continue;
        const a = alphaOf(cs.backgroundColor);
        if (a === 0) continue;
        const c = parse(cs.backgroundColor);
        acc = [0, 1, 2].map((k) => c[k] * a + acc[k] * (1 - a));
      }
      return acc;
    };
    const ratio = (el) => {
      if (!el) return -1;
      const fg = parse(getComputedStyle(el).color);
      const b = bg(el);
      const l1 = lum(fg);
      const l2 = lum(b);
      return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
    };
    return {
      rowLabel: ratio(document.querySelector('.new .row .t')),
      cardNote: ratio(document.querySelector('.cardnote')),
      sideValue: ratio(document.querySelector('.new .row .side')),
      caption: ratio(document.querySelector('figcaption')),
      legend: ratio(document.querySelector('.legend li')),
      th: ratio(document.querySelector('table.diff th')),
      td: ratio(document.querySelector('table.diff td:nth-child(2)')),
    };
  });

await page.click('.seg[data-key="theme"] button[data-val="light"]');
await page.click('.seg[data-key="material"] button[data-val="glass"]');
await page.waitForTimeout(400);
const cLight = await contrast();
await page.screenshot({ path: 'debug-screenshots/demo-settings-light.png', fullPage: true });
await page.click('.seg[data-key="theme"] button[data-val="dark"]');
await page.waitForTimeout(400);
const cDark = await contrast();
await page.screenshot({ path: 'debug-screenshots/demo-settings-dark.png', fullPage: true });

console.log('light', JSON.stringify(cLight));
console.log('dark ', JSON.stringify(cDark));
for (const [k, v] of Object.entries(cLight)) assert(`浅色对比度 ${k} ≥ 4.5`, v >= 4.5, `${v}:1`);
for (const [k, v] of Object.entries(cDark)) assert(`深色对比度 ${k} ≥ 4.5`, v >= 4.5, `${v}:1`);

assert('无 JS 运行时错误', errors.length === 0, errors.join(' | '));

const fail = results.filter((r) => !r.ok);
console.log(`\n${results.length - fail.length}/${results.length} 通过`);
if (fail.length) {
  console.log('失败：');
  fail.forEach((f) => console.log(' - ' + f.name));
  process.exitCode = 1;
}
await browser.close();
