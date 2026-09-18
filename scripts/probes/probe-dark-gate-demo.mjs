/**
 * 探针：暗色裸色门禁评审 demo（dark-gate-demo.html）
 *
 * 用 file:// 直开，不需要 dev server。
 * 反证：DEMO_FILE=file:///tmp/xxx.html node scripts/probes/probe-dark-gate-demo.mjs
 *   （反证副本把"三档语义 + 分区严格"改回去，第 4/5 项必须变红）
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FILE = process.env.DEMO_FILE || 'file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/dark-gate-demo.html';
const OUT = 'debug-screenshots';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(FILE, { waitUntil: 'load' });
await page.waitForSelector('.pick', { timeout: 8000 });

const setMode = async (m) => {
  await page.locator(`#modeSeg button[data-mode="${m}"]`).click();
  await page.waitForTimeout(180);
};
const chipOf = async (id, m) => {
  await page.locator(`.pick[data-id="${id}"]`).click();
  await setMode(m);
  await page.waitForTimeout(1000);
  return page.locator('#buildChip').innerText();
};

// 1 列表/分组渲染数量
const picks = await page.locator('.pick').count();
const groups = await page.locator('.picker .grp').count();
check('1 场景条目与分组渲染完整（5 项 / 3 组）', picks === 5 && groups === 3, `pick=${picks} grp=${groups}`);

// 2 默认项跑出结论卡
await page.waitForSelector('.verdict.on', { timeout: 8000 });
const firstVerdict = await page.locator('.verdict h4').innerText();
const firstNodes = await page.locator('#path .node').count();
const firstNodesOn = await page.locator('#path .node.on').count();
check('2 默认场景跑完，结论卡与判定链全部点亮', firstNodes > 0 && firstNodesOn === firstNodes, `node.on=${firstNodesOn}/${firstNodes}`);

// 3 换对象后结论确实变了
await page.locator('.pick[data-id="move"]').click();
await page.waitForTimeout(1400);
const secondVerdict = await page.locator('.verdict h4').innerText();
check('3 换场景后结论文案确实不同', firstVerdict !== secondVerdict, `"${firstVerdict}" vs "${secondVerdict}"`);

// 4 三档 × 场景：搬移全放行 / 真实新增随档位变化
const moveObserve = await chipOf('move', 'observe');
const moveScoped = await chipOf('move', 'scoped');
const moveStrict = await chipOf('move', 'strict');
const addObserve = await chipOf('add1', 'observe');
const addScoped = await chipOf('add1', 'scoped');
const addStrict = await chipOf('add1', 'strict');
check(
  '4a 搬移在三档下都放行（重构不会被判红）',
  moveObserve.includes('通过') && moveScoped.includes('通过') && moveStrict.includes('通过'),
  `${moveObserve} | ${moveScoped} | ${moveStrict}`
);
check(
  '4b 真实新增：档1/档2 只报告，档3 才失败',
  addObserve.includes('报告') && addScoped.includes('报告') && addStrict.includes('失败'),
  `${addObserve} | ${addScoped} | ${addStrict}`
);

// 5 分区严格：已清扫区域回退 —— 档2 也必须拦（这是"牙齿长在干净处"的核心）
const regObserve = await chipOf('regress', 'observe');
const regScoped = await chipOf('regress', 'scoped');
const regStrict = await chipOf('regress', 'strict');
check(
  '5 已清扫区回退：档2 与档3 都判失败（分区严格不受观察模式影响）',
  regObserve.includes('报告') && regScoped.includes('失败') && regStrict.includes('失败'),
  `${regObserve} | ${regScoped} | ${regStrict}`
);

// 6 不判红的"注释"场景必须放行（假红已修）
const commentChip = await chipOf('comment', 'strict');
check('6 注释里的 !important 场景放行（假红已修）', commentChip.includes('通过'), commentChip);

// 7 状态类卫生：切换瞬间旧高亮必须清空
await page.locator('.pick[data-id="newfile"]').click();
await page.waitForTimeout(50);
const residual = await page.locator('#path .node.on').count();
check('7 切换瞬间旧判定链高亮被清空（无残留）', residual <= 1, `切换后 50ms 仍点亮的节点=${residual}`);

// 8 面板切换：表格与清单重渲染 + 列序稳定
await page.locator('.tab[data-tab="2"]').click();
await page.waitForTimeout(700);
const heads = await page.locator('table thead th').allInnerTexts();
const rowCount = await page.locator('table tbody tr').count();
check(
  '8a 差异表列序固定为 维度 | 改前 | 改后（切换不换列）',
  heads.length === 3 && heads[1].includes('改前') && heads[2].includes('改后'),
  heads.join(' | ')
);
check('8b 差异表含策略维度行（可阻断范围）', rowCount >= 6 && (await page.locator('table').innerText()).includes('可阻断范围'), `rows=${rowCount}`);

await page.locator('.tab[data-tab="3"]').click();
await page.waitForTimeout(400);
const items = await page.locator('#adopt li').count();
const boxes = await page.locator('#adopt .box').count();
const circs = await page.locator('#adopt .circ').count();
check('9 采用清单渲染完整（11 项：6 可勾 + 5 状态点）', items === 11 && boxes === 6 && circs === 5, `li=${items} box=${boxes} circ=${circs}`);

// 9 不可操作项点不动
const circItem = page.locator('#adopt li').filter({ has: page.locator('.circ') }).first();
const before = await circItem.getAttribute('aria-checked');
await circItem.locator('.tog').click();
await circItem.locator('.tog').click();
const after = await circItem.getAttribute('aria-checked');
check('10 圆形状态点项不可勾选（点两次仍为 false）', before === 'false' && after === 'false', `${before} -> ${after}`);

// 10 可勾选项能勾
const boxItem = page.locator('#adopt li').filter({ has: page.locator('.box') }).first();
const boxBefore = await boxItem.getAttribute('aria-checked');
await boxItem.locator('.tog').click();
const boxAfter = await boxItem.getAttribute('aria-checked');
check('11 方形勾选项可切换', boxBefore === 'true' && boxAfter === 'false', `${boxBefore} -> ${boxAfter}`);

// 11 运行时错误
check('12 无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

// 截图（正式运行的最后一步，避免被反证运行覆盖）
await page.locator('.tab[data-tab="1"]').click();
await setMode('observe');
await page.locator('.pick[data-id="regress"]').click();
await page.waitForTimeout(1400);
await setMode('scoped');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/dark-gate-demo-panel1.png`, fullPage: true });
await page.locator('.tab[data-tab="2"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/dark-gate-demo-panel2.png`, fullPage: true });
await page.locator('.tab[data-tab="3"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/dark-gate-demo-panel3.png`, fullPage: true });
console.log(`\n截图：${OUT}/dark-gate-demo-panel{1,2,3}.png`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} PASS / ${failed.length} FAIL`);
if (failed.length) {
  failed.forEach((f) => console.log('  - ' + f.name));
  process.exit(1);
}
