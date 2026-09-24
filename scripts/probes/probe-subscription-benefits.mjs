import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：订阅页（/user-space/subscriptions）· 权益单源对齐回归
//   A. 卡片权益：四档统一顺序（AI → Cloud+ → 实验室 → 昵称 → 保底），数值正确
//   B. 对比表：昵称效果 / 抽奖保底门槛 两行补齐；全档一致的「多模态交互」
//      「定制化看板」移入公共说明；表头价格带「积分」单位
//   C. 卡片 vs 表格数值一致性（P1 验收核心）
//   D. 月付 / 年付切换（表头价格随周期变化）
//   E. 手机端（390px）：表格横滑可用、卡片单列、页面无横向溢出
//
//   反证：把 comparisonRows 换回手写旧数据（缺昵称/保底行）→ B 组必红；
//         把 buildCardFeatures 改回手工数组（Pro 顺序漂移）→ A 组必红。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/subscription-benefits';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};
const digits = (s) => (String(s).match(/[\d.]+/g) || []).join('');
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

async function openSubscription(page) {
  await page.goto(`${BASE}/#/user-space/subscriptions`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.apple-pricing.v2 .plan-card', { timeout: 20000 });
  await page.waitForSelector('.apple-pricing.v2 .table-scroll table', { timeout: 20000 });
}

async function readCards(page) {
  return page.evaluate(() => [...document.querySelectorAll('.apple-pricing.v2 .plan-card')].map((card) => ({
    name: card.querySelector('.plan-head h2')?.textContent?.trim(),
    features: [...card.querySelectorAll('.benefits li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  })));
}

async function readTable(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.apple-pricing.v2 .table-scroll table');
    return {
      heads: [...t.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim()),
      rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({
        label: tr.querySelector('th')?.textContent?.trim(),
        cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim()),
      })),
      note: document.querySelector('.apple-pricing.v2 .comparison-note')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
}

/* ===== 桌面场景 ===== */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await openSubscription(page);

  // A. 卡片权益顺序与数值
  const cards = await readCards(page);
  check('A1 卡片为四档（Plus/Pro/Max/Ultra）', JSON.stringify(cards.map((c) => c.name)) === JSON.stringify(['Plus', 'Pro', 'Max', 'Ultra']), cards.map((c) => c.name).join('/'));
  const expectCards = {
    Plus: ['BOH AI 80 万 Token / 天', 'Cloud+ 300 张', '实验室 PPT / Word 15 次 / 月', '蓝色昵称', '连续 24 场未中奖可兑保底礼'],
    Pro: ['BOH AI 200 万 Token / 天', 'Cloud+ 450 张', '实验室 PPT / Word 20 次 / 月', '银色昵称', '连续 18 场未中奖可兑保底礼'],
    Max: ['BOH AI 500 万 Token / 天', 'Cloud+ 900 张', '实验室 PPT / Word 30 次 / 月', '金色昵称', '连续 12 场未中奖可兑保底礼'],
    Ultra: ['BOH AI 1000 万 Token / 天', 'Cloud+ 1200 张', '实验室 PPT / Word 不限次数', '彩虹昵称', '连续 8 场未中奖可兑保底礼'],
  };
  for (const [tier, expected] of Object.entries(expectCards)) {
    const card = cards.find((c) => c.name === tier);
    check(`A2 ${tier} 卡片五项且顺序统一（AI→云盘→实验室→昵称→保底）`,
      !!card && JSON.stringify(card.features) === JSON.stringify(expected),
      card ? card.features.join(' | ') : '未找到卡片');
  }

  // B. 对比表结构
  const table = await readTable(page);
  const rowMap = Object.fromEntries(table.rows.map((r) => [r.label, r.cells]));
  check('B1 表头四档价格均带「积分」单位', table.heads.slice(1).every((h) => h.includes('积分')), table.heads.slice(1).join(' / '));
  check('B2 昵称效果行：—/蓝色/银色/金色/彩虹', JSON.stringify(rowMap['昵称效果']) === JSON.stringify(['—', '蓝色', '银色', '金色', '彩虹']), (rowMap['昵称效果'] || []).join('/'));
  check('B3 抽奖保底门槛行：—/24 场/18 场/12 场/8 场', JSON.stringify(rowMap['抽奖保底门槛']) === JSON.stringify(['—', '24 场', '18 场', '12 场', '8 场']), (rowMap['抽奖保底门槛'] || []).join('/'));
  check('B4 客服优先级保留明确标注（无差别档为「普通」非空白）', JSON.stringify(rowMap['客服优先级']) === JSON.stringify(['普通', '普通', '普通', '优先', '最高优先级']), (rowMap['客服优先级'] || []).join('/'));
  check('B5 全档一致的「多模态交互」「定制化看板」不再占表行', !rowMap['多模态交互'] && !rowMap['定制化看板']);
  check('B6 公共权益说明含多模态交互与定制化看板 + 保底口径（连续未中奖/清零）',
    table.note.includes('多模态交互') && table.note.includes('定制化看板') && table.note.includes('连续未中奖场次') && table.note.includes('清零'), table.note);

  // C. 卡片 vs 表格数值一致性（P1 验收核心）
  const colIdx = { Plus: 1, Pro: 2, Max: 3, Ultra: 4 };
  for (const card of cards) {
    const col = colIdx[card.name];
    const pick = (re) => card.features.find((f) => re.test(f)) || '';
    const cell = (label) => (rowMap[label] || [])[col] || '';
    const pairs = [
      ['AI 额度', digits(pick(/^BOH AI/)), digits(cell('BOH AI Token / 天'))],
      ['Cloud+', digits(pick(/^Cloud\+/)), digits(cell('Cloud+ 存储空间'))],
      ['实验室', pick(/^实验室/).replace(/^实验室 PPT \/ Word /, ''), cell('实验室 PPT / Word')],
      ['昵称', pick(/昵称$/).replace(/昵称$/, ''), cell('昵称效果')],
      ['保底', digits(pick(/保底礼$/)), digits(cell('抽奖保底门槛'))],
    ];
    for (const [name, cardVal, tableVal] of pairs) {
      check(`C ${card.name} · ${name} 卡片与表格一致`, cardVal === tableVal && cardVal !== '', `卡片「${cardVal}」vs 表格「${tableVal}」`);
    }
  }

  // D. 月付 / 年付切换
  await page.click('.apple-pricing.v2 .seg-btn:has-text("单年")');
  await page.waitForTimeout(900);
  const yearlyTable = await readTable(page);
  check('D1 切年付：Pro 表头价格 200 积分 / 年', yearlyTable.heads.some((h) => h.includes('200 积分 / 年')), yearlyTable.heads.join(' / '));
  check('D2 切年付：Plus 表头价格 80 积分 / 年', yearlyTable.heads.some((h) => h.includes('80 积分 / 年')));
  await page.screenshot({ path: `${OUT}/desktop-yearly.png`, fullPage: true });
  await page.click('.apple-pricing.v2 .seg-btn:has-text("单月")');
  await page.waitForTimeout(900);
  const monthlyTable = await readTable(page);
  check('D3 切回月付：Pro 表头价格 20 积分 / 月', monthlyTable.heads.some((h) => h.includes('20 积分 / 月')), monthlyTable.heads.join(' / '));
  await page.screenshot({ path: `${OUT}/desktop-monthly.png`, fullPage: true });
  await context.close();
}

/* ===== 手机场景（390 × 844）===== */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openSubscription(page);

  const layout = await page.evaluate(() => {
    const tableScroll = document.querySelector('.apple-pricing.v2 .table-scroll');
    const firstCard = document.querySelector('.apple-pricing.v2 .plan-card');
    const cards = document.querySelectorAll('.apple-pricing.v2 .plan-card');
    return {
      tableScrollable: !!tableScroll && tableScroll.scrollWidth > tableScroll.clientWidth,
      tableScrollWidth: tableScroll?.querySelector('table')?.offsetWidth || 0,
      cardWidth: firstCard?.offsetWidth || 0,
      singleColumn: cards.length > 1 && Math.abs(cards[1].offsetTop - cards[0].offsetTop) > (cards[0]?.offsetHeight || 0) / 2,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  check('E1 手机端表格可横滑（内容宽 640+，容器内滚动）', layout.tableScrollable && layout.tableScrollWidth >= 640, `表格内容 ${layout.tableScrollWidth}px`);
  check('E2 手机端卡片单列排布', layout.singleColumn, `卡宽 ${layout.cardWidth}px`);
  check('E3 页面无横向溢出（不撑破 body）', !layout.pageOverflowX);
  await page.screenshot({ path: `${OUT}/mobile-top.png` });
  await page.evaluate(() => document.querySelector('.apple-pricing.v2 .comparison')?.scrollIntoView());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mobile-table.png` });
  await context.close();
}

await browser.close();
console.log(`\n===== ${pass} pass / ${fail} fail =====`);
process.exit(fail > 0 ? 1 : 0);
