/**
 * 咖啡店布局探针（plans/026 P0-5）
 *
 * 立这条探针的理由：旧版「拥挤」不是 overflow bug —— 探针实测
 * `overlaps: []` `overflow: []`，但竖屏面板占屏 59.7%、字号压到 7px。
 * 也就是说「挤」是布局算出来的，只测重叠会假绿。
 *
 * 所以判据是**占屏比例 + 最小字号 + 关键区域高度**，
 * 任何一条退化就转红。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = process.env.SHOT_DIR || '';
const results = [];
const check = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''));
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

async function openCafe(viewport, scale = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#/anniversary-cafe`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /开始营业/ }).click();
  await page.waitForTimeout(1200);
  return { page, errors };
}

const measure = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const overlap = (a, b) => {
      if (!a || !b) return 0;
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return ix > 4 && iy > 4 ? ix * iy : 0;
    };
    // ⚠️ 包含关系不是重叠：.hud 是 .top-bar 的子元素、.equipment-bar 是
    // .stage-floor 的子元素，父子天然相交。把它们算成「重叠」会让探针假红
    //（第一版就踩了：实测 top-bar×hud 19847px² 其实完全正常）。
    const SEL = [
      '.top-bar',
      '.order-strip',
      '.stage-floor',
      '.equipment-bar',
      '.workbench',
      '.hud',
      '.deck-station',
      '.ticket-rail',
      '.control-bay',
    ];
    const PARENTS = {
      '.hud': '.top-bar',
      '.equipment-bar': '.stage-floor',
    };
    const boxes = Object.fromEntries(SEL.map((sel) => [sel, box(sel)]).filter(([, v]) => v));
    const related = (a, b) => PARENTS[a] === b || PARENTS[b] === a;
    const pairs = [
      ['.top-bar', '.order-strip'],
      ['.order-strip', '.stage-floor'],
      ['.stage-floor', '.workbench'],
      ['.equipment-bar', '.stage-floor'],
      ['.top-bar', '.hud'],
      ['.equipment-bar', '.workbench'],
    ];
    // ⚠️ 「面板占屏」必须排除装置区（.deck-station）。
    //装置是**玩法画面**（咖啡机在动、豆子在落、水在画圈），
    // 把它算成「界面面板」会让判据失去意义：
    // 第一版判据把整个 .workbench 都算进面板，新版实测 59.7% 与旧版 69.9% 只差 10pt，
    // 但其实新版玩法画面从旧版的 ~19% 涨到了 50.6% —— 判据掩盖了真实改善。
    // 现在口径：纯 UI chrome（顶栏 + 订单条 + 步骤条 + 控制区）vs 玩法画面（舞台 + 装置）。
    const chromeHeight = ['.top-bar', '.order-strip', '.ticket-rail', '.control-bay'].reduce(
      (sum, sel) => sum + (boxes[sel]?.h || 0),
      0,
    );
    const playHeight = (boxes['.stage-floor']?.h || 0) + (boxes['.deck-station']?.h || 0);
    // 最小可见字号 —— 报出到底是哪个元素太小，否则无法定位
    let minFont = 999;
    let minFontSel = '';
    for (const el of document.querySelectorAll('.cafe-game *')) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      if (!hasText) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size > 0 && size < minFont) {
        minFont = size;
        minFontSel = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
      }
    }
    return {
      viewport: { w: innerWidth, h: innerHeight },
      boxes,
      overlaps: pairs
        .filter(([a, b]) => !related(a, b))
        .map(([a, b]) => ({ a, b, area: overlap(boxes[a], boxes[b]) }))
        .filter((x) => x.area > 0),
      overflow: Object.entries(boxes)
        .filter(
          ([, v]) =>
            v.y + v.h > innerHeight + 2 || v.x + v.w > innerWidth + 2 || v.x < -2 || v.y < -2,
        )
        .map(([k, v]) => `${k} bottom=${Math.round(v.y + v.h)}`),
      panelRatio: chromeHeight / innerHeight,
      playRatio: playHeight / innerHeight,
      floorHeight: boxes['.stage-floor']?.h || 0,
      minFont,
      minFontSel,
      interactiveCount: document.querySelectorAll('.cafe-game button').length,
    };
  });

// ═══════════════ 场景 A：竖屏 390×844 ═══════════════
{
  const { page, errors } = await openCafe({ width: 390, height: 844 }, 2);
  const m = await measure(page);
  if (OUT) await page.screenshot({ path: `${OUT}/cafe-vertical.png` });

  check('A1 无元素重叠', m.overlaps.length === 0, JSON.stringify(m.overlaps));
  check('A2 无元素溢出视口', m.overflow.length === 0, m.overflow.join(', '));
  // P0-5 目标：纯 UI chrome 收窄。
  // 基线来自 2026-10-08 实测而非估算：旧版顶栏167+订单93+设备58 ≈ 350px/844 ≈ 41%，
  // 且玩法画面（舞台+装置）只占 ~19%。新版 chrome 42.4% / 玩法 53%，
  // chrome 里绝大部分是必要信息（订单队列 + 反馈 + 操作按钮）。
  // 所以**玩法画面占比才是这次重构的主判据**，chrome 阈值只防退化。
  check(
    'A3 UI chrome 占屏 < 46%（防退化）',
    m.panelRatio < 0.46,
    `实测 ${(m.panelRatio * 100).toFixed(1)}%`,
  );
  // 玩法画面（舞台 + 装置）必须占多数 —— 旧版实测仅 ~19%
  check(
    'A3b 玩法画面占屏 ≥ 45%（旧版 ~19%）',
    m.playRatio >= 0.45,
    `实测 ${(m.playRatio * 100).toFixed(1)}%`,
  );
  // 最小字号 ≥ 11px（旧版有 7px）
  check('A4 最小字号 ≥ 11px（旧版 7px）', m.minFont >= 11, `实测 ${m.minFont}px @ ${m.minFontSel}`);
  // 舞台（真正的游戏画面）要有可用高度
  check('A5 舞台高度 ≥ 140px', m.floorHeight >= 140, `实测 ${Math.round(m.floorHeight)}px`);
  check('A6 无 JS 错误', errors.length === 0, errors.join(' | '));

  // 装置必须是**真装置**：有可操作的 SVG 画面，且读数条可见。
  // ⚠️ 反证记录（2026-10-08）：只断言「玩法画面占屏 ≥45%」会假绿——
  // 把 .deck-station 的 min-height 压到 10px、.station-art 的 max-height 压到 8px 后，
  // 占比数字几乎不变（53.0%），断言通过但装置其实已经塌成一条。
  // 所以必须**直接测装置内部**：SVG 有实高、读数条可见、金区有宽度。
  // 判据放在竖屏场景（A）里，因为竖屏才是布局最紧的那一档。
  const station = await page.evaluate(() => {
    const box = document.querySelector('.deck-station');
    const art = document.querySelector('.station-art') || document.querySelector('.station-serve');
    const readout = document.querySelector('.station-readout');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const artRect = r(art);
    const readRect = r(readout);
    return {
      stationH: r(box)?.height || 0,
      artH: artRect?.height || 0,
      artVisible: artRect ? artRect.width > 20 && artRect.height > 20 : false,
      readoutVisible: readRect ? readRect.height > 8 : false,
      // 读数条里的金区（可学性）必须真的有宽度
      windowW: r(document.querySelector('.readout-window'))?.width || 0,
    };
  });
  check(
    'A7 装置 SVG 有实高（反证：压到 8px 曾假绿）',
    station.artH >= 40 && station.artVisible,
    `实测 ${Math.round(station.artH)}px`,
  );
  check(
    'A8 读数条可见且金区有宽度（P0-3 可学性）',
    station.readoutVisible && station.windowW > 4,
    `读数${Math.round(station.readoutVisible)} 金区${Math.round(station.windowW)}px`,
  );
  check(
    'A9 装置整体 ≥ 80px（不是塌成一条）',
    station.stationH >= 80,
    `实测 ${Math.round(station.stationH)}px`,
  );
  await page.close();
}

// ═══════════════ 场景 B：桌面 1440×900 —— 填掉中部空洞 ═══════════════
{
  const { page, errors } = await openCafe({ width: 1440, height: 900 });
  const m = await measure(page);
  if (OUT) await page.screenshot({ path: `${OUT}/cafe-desktop.png` });

  check('B1 无元素重叠', m.overlaps.length === 0, JSON.stringify(m.overlaps));
  check(
    'B2 舞台高度 ≥ 260px（旧版中部 300px 空洞）',
    m.floorHeight >= 260,
    `实测 ${Math.round(m.floorHeight)}px`,
  );
  check(
    'B3 UI chrome 占屏 < 50%（防退化）',
    m.panelRatio < 0.5,
    `实测 ${(m.panelRatio * 100).toFixed(1)}%`,
  );
  check('B3b 玩法画面占屏 ≥ 55%', m.playRatio >= 0.55, `实测 ${(m.playRatio * 100).toFixed(1)}%`);
  // 顾客立绘应被放大（旧版桌面 210px × 0.78 scale，且中部留300px 空洞）
  const customer = await page.evaluate(() => {
    const el = document.querySelector('.mc-customer');
    return el ? el.getBoundingClientRect().width : 0;
  });
  check(
    'B4 顾客立绘 ≥ 110px（旧版 scale 后约 164px 但中部空）',
    customer >= 110,
    `实测 ${Math.round(customer)}px`,
  );
  check('B5 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 C：中间宽度也成立（旧版只有 390/1440 能看）═══════════════
{
  const { page } = await openCafe({ width: 760, height: 900 });
  const m = await measure(page);
  check('C1 平板竖屏无重叠', m.overlaps.length === 0, JSON.stringify(m.overlaps));
  check(
    'C2 平板竖屏 UI chrome 占屏 < 40%',
    m.panelRatio < 0.4,
    `实测 ${(m.panelRatio * 100).toFixed(1)}%`,
  );
  await page.close();
}

// ═══════════════ 场景 D：交互元素可达（八类机制都渲染出操作入口）═══════════════
{
  const { page } = await openCafe({ width: 1440, height: 900 });
  const stations = await page.evaluate(() => {
    const out = {};
    for (const sel of [
      'oscillate',
      'staged',
      'swirl',
      'texture',
      'layer',
      'timed',
      'sequenced',
      'trace',
    ]) {
      out[sel] = document.querySelector(`.kind-${sel}`) ? 1 : 0;
    }
    return out;
  });
  // 当前步骤只会渲染一种机制，这里断言「至少渲染了一种且 readout 条存在」
  const rendered = Object.entries(stations)
    .filter(([, v]) => v)
    .map(([k]) => k);
  check('D1 当前步骤渲染出装置舞台', rendered.length >= 1, rendered.join(','));
  const hasReadout = await page.evaluate(() => Boolean(document.querySelector('.station-readout')));
  check('D2 读数条存在（金区可见可学）', hasReadout);
  const hasLegend = await page.evaluate(() => Boolean(document.querySelector('.grade-legend')));
  check('D3 判定档位图例存在（玩家能预知惩罚）', hasLegend);
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
