import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// =====================================================================
// 探针：横屏左栏改造 demo（landscape-rail-demo.html）
//   · 实验室里「现状 / 建议稿」两态必须量出不同的指示器几何（对比断言，非恒等）
//   · 品牌位三态切换不得残留状态类，且不得推挤条目（它占用的是既有顶部空白）
//   · 已修项（A 组）不可勾选；B/C 组勾选要联动实验室
//   · 差异表列序固定，切分段只换高亮列
//   反证：DEMO_FILE=file:///tmp/xxx.html 覆盖路径（见文件末尾说明）
// =====================================================================
const FILE = process.env.DEMO_FILE || 'file://' + path.resolve('landscape-rail-demo.html');
const OUT = 'debug-screenshots/rail-demo';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 1040 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(FILE, { waitUntil: 'load' });
await page.waitForSelector('#labRail .rail-item', { timeout: 15000 });
await page.waitForTimeout(500);

const readMetrics = () => page.evaluate(() => {
  const rail = document.querySelector('#labRail');
  const ind = document.querySelector('#railInd');
  const item = document.querySelector('#railNav .rail-item.is-active');
  const ir = ind.getBoundingClientRect();
  const ar = item.getBoundingClientRect();
  return {
    iw: Math.round(ir.width), aw: Math.round(ar.width),
    dw: Math.round(ir.width - ar.width), dtop: Math.round(ir.top - ar.top),
    opacity: getComputedStyle(ind).opacity,
    legacy: rail.classList.contains('is-legacy'),
    deltaText: document.querySelector('#mDelta').textContent.trim(),
    chipOk: document.querySelector('#mDeltaChip').classList.contains('ok'),
    railW: Math.round(rail.getBoundingClientRect().width),
    firstItemTop: Math.round(document.querySelector('#railNav .rail-item').getBoundingClientRect().top)
  };
});

const preset = async (p) => {
  await page.click('#segPreset button[data-p="' + p + '"]');
  await page.waitForTimeout(450);
};
const width = async (w) => {
  await page.click('#segWidth button[data-w="' + w + '"]');
  await page.waitForTimeout(450);
};

// —— 1 结构渲染 ——
check('改造开关渲染 7 项', await page.locator('#togs .tog').count() === 7,
  (await page.locator('#togs .tog').count()) + ' 项');
check('左栏渲染 10 个条目（5 主 + 2 便捷 + 3 工具）',
  await page.locator('#labRail .rail-item').count() === 10,
  (await page.locator('#labRail .rail-item').count()) + ' 个');
check('每个开关项都带「改错了会怎样」风险条',
  await page.locator('#togs .tog .tog-risk').count() === 7,
  (await page.locator('#togs .tog .tog-risk').count()) + ' 条');

// —— 2 现状：指示器横向错位（真实缺陷复现） ——
const cur = await readMetrics();
check('现状：指示器比条目宽（横向错位复现）', cur.dw >= 20, `指示器 ${cur.iw} vs 条目 ${cur.aw}（Δ${cur.dw}）`);
check('现状：指示器可见且高度来自条目', cur.opacity === '1' && Math.abs(cur.dtop) <= 1, `opacity=${cur.opacity} Δtop=${cur.dtop}`);
check('现状：实验室处于 legacy 指示器模式', cur.legacy === true, String(cur.legacy));
check('现状：读数条标出宽度差且为告警色', cur.deltaText !== '0px' && cur.chipOk === false, `Δ=${cur.deltaText}`);

// —— 3 建议稿：等宽（对比断言） ——
await preset('proposed');
const pro = await readMetrics();
check('建议稿：指示器与条目等宽', pro.dw === 0, `Δ${pro.dw}`);
check('建议稿：离开 legacy 模式', pro.legacy === false, String(pro.legacy));
check('两态读数确实不同（非恒等断言）', pro.dw !== cur.dw, `现状 Δ${cur.dw} → 建议 Δ${pro.dw}`);
check('建议稿：读数条标为正常色', pro.deltaText === '0px' && pro.chipOk === true, `Δ=${pro.deltaText}`);

// —— 4 品牌位三态 ——
await preset('current');
const topEmpty = await readMetrics();
await page.click('#togs .tog[data-tog="topline"] button[data-v="logo"]');
await page.waitForTimeout(300);
const brandLogo = await page.evaluate(() => ({
  hasLogo: document.querySelector('#labRail').classList.contains('brand-logo'),
  h: Math.round(document.querySelector('#railBrand').getBoundingClientRect().height),
  name: document.querySelector('.rail-brand .b-name').textContent,
  logoVisible: getComputedStyle(document.querySelector('.rail-brand .b-logo')).display !== 'none'
}));
check('品牌位 logo 态：显示品牌标且有高度', brandLogo.hasLogo && brandLogo.h > 0 && brandLogo.logoVisible,
  `h=${brandLogo.h} name=${brandLogo.name}`);
const topLogo = await readMetrics();
check('品牌位占用既有顶部空白，不推挤条目', topLogo.firstItemTop === topEmpty.firstItemTop,
  `条目 top ${topEmpty.firstItemTop} → ${topLogo.firstItemTop}`);

await page.click('#togs .tog[data-tog="topline"] button[data-v="profile"]');
await page.waitForTimeout(300);
const brandProfile = await page.evaluate(() => ({
  hasProfile: document.querySelector('#labRail').classList.contains('brand-profile'),
  logoHidden: getComputedStyle(document.querySelector('.rail-brand .b-logo')).display === 'none',
  name: document.querySelector('.rail-brand .b-name').textContent
}));
check('品牌位身份卡态：头像显示、品牌标隐藏', brandProfile.hasProfile && brandProfile.logoHidden,
  `name=${brandProfile.name}`);

for (const v of ['logo', 'empty', 'profile', 'logo', 'empty', 'logo']) {
  await page.click('#togs .tog[data-tog="topline"] button[data-v="' + v + '"]');
  await page.waitForTimeout(90);
}
const brandClasses = await page.evaluate(() =>
  document.querySelector('#labRail').className.split(/\s+/).filter((c) => c.indexOf('brand-') === 0));
check('品牌位状态类不残留（三态互切后唯一）', brandClasses.length === 1, brandClasses.join(', '));

// —— 5 面板切换 + 清单 ——
await page.click('#tabs button[data-panel="list"]');
await page.waitForTimeout(300);
check('清单渲染 12 行（A2 + B7 + C3）', await page.locator('#listBody .item-row').count() === 12,
  (await page.locator('#listBody .item-row').count()) + ' 行');
check('可勾选项 10 个（B + C）', await page.locator('#listBody .box').count() === 10,
  (await page.locator('#listBody .box').count()) + ' 个');
check('已修项用状态点、不可勾选', await page.locator('#listBody .item-row[data-kind="done"] .dot').count() === 2 &&
  await page.locator('#listBody .item-row[data-kind="done"] .box').count() === 0);
const progBefore = (await page.locator('#progText').textContent()).trim();
check('初始进度 0 / 10', progBefore === '0 / 10', progBefore);

await page.click('#listBody .item-row[data-pick="topline"] .box');
await page.waitForTimeout(250);
check('勾选后进度 1 / 10', (await page.locator('#progText').textContent()).trim() === '1 / 10',
  (await page.locator('#progText').textContent()).trim());
check('勾选框状态类已置位', await page.locator('#listBody .item-row[data-pick="topline"] .box.on').count() === 1);

await page.click('#tabs button[data-panel="lab"]');
await page.waitForTimeout(300);
check('清单勾选联动实验室开关（品牌位变为 logo）',
  await page.evaluate(() => document.querySelector('#labRail').classList.contains('brand-logo')) === true);

// —— 6 对比面板：列序 + 指标条 ——
await page.click('#tabs button[data-panel="compare"]');
await page.waitForTimeout(500);
const h1 = (await page.locator('#diffTable thead th').allTextContents()).join('|');
check('差异表列序固定（维度|现状|建议）', h1 === '维度|现状|建议', h1);
await page.click('#segCmp button[data-m="tgt"]');
await page.waitForTimeout(300);
const h2 = (await page.locator('#diffTable thead th').allTextContents()).join('|');
check('切分段后表头不错位', h2 === '维度|现状|建议', h2);
check('切分段只换高亮列',
  (await page.evaluate(() => document.querySelector('#diffTable').className)).indexOf('mode-tgt') >= 0);
check('差异表 8 行', await page.locator('#diffTable tbody tr').count() === 8,
  (await page.locator('#diffTable tbody tr').count()) + ' 行');
check('指标条 7 组', await page.locator('#metrics .metric').count() === 7,
  (await page.locator('#metrics .metric').count()) + ' 组');
check('指标条两侧都有条形（14 条）', await page.locator('#metrics .m-fill').count() === 14,
  (await page.locator('#metrics .m-fill').count()) + ' 条');
const barw = await page.evaluate(() => {
  const rows = document.querySelectorAll('#metrics .metric:nth-child(2) .m-fill');
  return {
    a: rows[0].getBoundingClientRect().width, b: rows[1].getBoundingClientRect().width,
    aw: Number(rows[0].getAttribute('data-w')), bw: Number(rows[1].getAttribute('data-w'))
  };
});
check('指标条按数值落位（不是等长摆设）', barw.a > 0 && barw.b > 0 && Math.abs((barw.a / barw.b) - (barw.aw / barw.bw)) < 0.06,
  `现状 ${Math.round(barw.a)}px(${barw.aw}%) / 建议 ${Math.round(barw.b)}px(${barw.bw}%)`);

// —— 7 窄栏档 ——
await page.click('#tabs button[data-panel="lab"]');
await page.waitForTimeout(250);
await width('narrow');
await preset('current');
const narCur = await readMetrics();
check('窄栏档可见宽度 88px', narCur.railW === 88, narCur.railW + 'px');
check('窄栏档现状：指示器同样比条目宽', narCur.dw >= 10, `Δ${narCur.dw}`);
await preset('proposed');
const narPro = await readMetrics();
check('窄栏档建议稿：指示器与条目等宽', narPro.dw === 0, `Δ${narPro.dw}`);

// —— 8 暗色与图标加粗不炸 ——
await page.click('#segTheme button[data-t="dark"]');
await page.waitForTimeout(350);
check('暗色档切换后指示器仍在位', (await readMetrics()).opacity === '1');
await page.click('#segTheme button[data-t="light"]');
await page.waitForTimeout(250);

// —— 9 零错误 ——
check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

// —— 10 截图 ——
await width('wide');
await preset('current');
await page.screenshot({ path: OUT + '/1-lab-current.png', fullPage: true });
await preset('proposed');
await page.screenshot({ path: OUT + '/2-lab-proposed.png', fullPage: true });
await page.click('#tabs button[data-panel="compare"]');
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/3-compare.png', fullPage: true });
await page.click('#tabs button[data-panel="list"]');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/4-list.png', fullPage: true });

await page.click('#tabs button[data-panel="lab"]');
await page.waitForTimeout(250);
await width('narrow');
await preset('proposed');
await page.waitForTimeout(350);
await page.screenshot({ path: OUT + '/5-narrow.png', fullPage: true });
await width('wide');
await page.click('#segTheme button[data-t="dark"]');
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/6-dark.png', fullPage: true });

await browser.close();
console.log('\n=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
