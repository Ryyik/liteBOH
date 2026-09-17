import { chromium } from 'playwright';

const FILE = process.env.CF_DEMO_FILE
  || 'file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/cloudflare-config-demo.html';
const OUT = '/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/debug-screenshots';
const results = [];
const check = (name, pass, extra = '') => {
  results.push({ name, pass, extra });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(FILE, { waitUntil: 'load' });

// 1. 面板一：资源列表渲染
const items = await page.locator('.ritem').count();
check('请求模拟器渲染全部资源项', items === 16, `${items} 项`);

const groups = await page.locator('.pg').count();
check('资源分组渲染', groups === 5, `${groups} 组`);

// 2. 默认选中第一项，等动画跑完（决策 + 结论）
await page.waitForSelector('.verdict', { timeout: 6000 });
const v1 = await page.locator('.vtitle').first().innerText();
check('默认项结论 = 边缘长缓存', v1.includes('365 天'), v1);

const badge1 = await page.locator('[data-n="edge"] .nbadge').first().innerText();
check('边缘节点徽标 = 缓存命中', badge1.includes('缓存命中'), badge1);

const originOn1 = await page.locator('[data-n="origin"]').first().evaluate((el) => el.classList.contains('on'));
check('长缓存项不回源（上游节点未点亮）', originOn1 === false, `origin.on=${originOn1}`);

// 3. 切到 index.html（第 4 项）—— 必须回源
await page.locator('.ritem').nth(3).click();
await page.waitForTimeout(2600);
const v2 = await page.locator('.vtitle').first().innerText();
check('index.html 结论 = 每次回源校验', v2.includes('每次回源校验'), v2);
const originOn2 = await page.locator('[data-n="origin"]').first().evaluate((el) => el.classList.contains('on'));
check('index.html 会点亮上游节点', originOn2 === true, `origin.on=${originOn2}`);
const risk2 = await page.locator('.risk').first().innerText();
check('index.html 展示配错后果', risk2.includes('白屏'), risk2.slice(0, 40).replace(/\n/g, ' '));

// 4. 切到登录接口（第 9 项）—— 绝不缓存 + 越权风险
await page.locator('.ritem').nth(8).click();
await page.waitForTimeout(2600);
const v3 = await page.locator('.vtitle').first().innerText();
check('登录接口结论 = 绝不缓存', v3.includes('绝不缓存'), v3);
const badge3 = await page.locator('[data-n="edge"] .nbadge').first().innerText();
check('登录接口边缘徽标 = 放行不落缓存', badge3.includes('放行'), badge3);
const risk3 = await page.locator('.risk').first().innerText();
check('登录接口标注越权风险', risk3.includes('会话令牌'), risk3.slice(0, 40).replace(/\n/g, ' '));

// 类名卫生：从「每次校验」切到「绝不缓存」后，虚线标记必须被清掉
const dashLeft = await page.locator('.link[data-l="1"]').evaluate((el) => el.classList.contains('dash'));
check('切换品类后无遗留 dash 类', dashLeft === false, `dash=${dashLeft}`);

await page.screenshot({ path: `${OUT}/cf-demo-1-simulator.png`, fullPage: true });

// 5. 面板二：搬迁对比
await page.locator('.tab[data-tab="mig"]').click();
await page.waitForTimeout(500);

const migNodes = await page.locator('#migPath .node').count();
check('搬迁链路图渲染三个节点', migNodes === 3, `${migNodes} 个`);

const ghBadge = await page.locator('#migPath .node').nth(1).locator('.nbadge').innerText();
check('GH 模式边缘徽标 = 未命中', ghBadge.includes('未命中'), ghBadge);

const ghReturnLink = await page.locator('#migPath .link').nth(1).evaluate((el) => el.classList.contains('on'));
check('GH 模式回源链路点亮', ghReturnLink === true, `on=${ghReturnLink}`);

const ghRowCells = await page.locator('table.cmp tr').nth(1).locator('td').allInnerTexts();
check('GH 模式列序 = 当前在前', ghRowCells[1].includes('美国源站') && ghRowCells[2].includes('边缘节点'),
  ghRowCells.slice(1).join(' | '));

await page.locator('.seg button[data-m="cf"]').click();
await page.waitForTimeout(700);

const cfBadge = await page.locator('#migPath .node').nth(1).locator('.nbadge').innerText();
check('CF 模式边缘徽标 = 命中且 headers 生效', cfBadge.includes('命中') && cfBadge.includes('_headers'), cfBadge);

const cfReturnLink = await page.locator('#migPath .link').nth(1).evaluate((el) => el.classList.contains('on'));
check('CF 模式回源链路熄灭（这一步消失）', cfReturnLink === false, `on=${cfReturnLink}`);

const cfTailDim = await page.locator('#migPath .node').nth(2).evaluate((el) => el.classList.contains('dimmed'));
check('CF 模式源站节点置灰', cfTailDim === true, `dimmed=${cfTailDim}`);

// 列序稳定性：切换后表头与数据列不得错位（这是修过的 bug）
const cfRowCells = await page.locator('table.cmp tr').nth(1).locator('td').allInnerTexts();
check('CF 模式列序不变，无错位', cfRowCells[1].includes('美国源站') && cfRowCells[2].includes('边缘节点'),
  cfRowCells.slice(1).join(' | '));

const hlCols = await page.locator('table.cmp col').evaluateAll((els) => els.map((e) => e.classList.contains('hl')));
check('高亮列跟随选择（第 3 列）', hlCols[1] === false && hlCols[2] === true, JSON.stringify(hlCols));

const latBars = await page.locator('.lat-bar').count();
check('延迟对比渲染 6 条（3 指标 × 2 侧）', latBars === 6, `${latBars} 条`);

const latVals = await page.locator('.lat-val').allInnerTexts();
check('延迟数值正确', latVals[0] === '420 ms' && latVals[1] === '22 ms' && latVals[5] === '0 次',
  latVals.join(' / '));

const barW = await page.locator('.lat-bar').first().locator('.lat-fill').evaluate((el) => el.style.width);
check('延迟条宽度已写入（非零宽空断言）', barW === '100%', `width=${barW}`);

await page.screenshot({ path: `${OUT}/cf-demo-2-migrate.png`, fullPage: true });

// 6. 面板三：开关清单
await page.locator('.tab[data-tab="flags"]').click();
await page.waitForTimeout(300);
const flagCount = await page.locator('.flag').count();
check('开关清单渲染', flagCount === 11, `${flagCount} 项`);

const scoreBefore = await page.locator('#fscore').innerText();
check('初始得分为 5/5', scoreBefore.includes('5 / 5'), scoreBefore.slice(0, 30));

// 取消勾选一项可点的 → 分数应变化
await page.locator('.flag[data-f="0"]').click();
await page.waitForTimeout(200);
const scoreAfter = await page.locator('#fscore').innerText();
const toggled = await page.locator('.flag[data-f="0"]').evaluate((el) => el.classList.contains('checked'));
check('点击可切换建议项', toggled === false, `checked=${toggled}`);
check('得分随之更新为 4/5', scoreAfter.includes('4 / 5'), scoreAfter.slice(0, 30));

// 不可点的项（已下线）点击不应有反应
await page.locator('.flag[data-f="6"]').click();
await page.waitForTimeout(150);
const deadChecked = await page.locator('.flag[data-f="6"]').evaluate((el) => el.classList.contains('checked'));
check('已下线项不可勾选（非空断言）', deadChecked === false, `checked=${deadChecked}`);

// 不可勾选项必须用状态圆点，避免「看似可勾」的误导
const staticBoxes = await page.locator('.flag.static-item .fbox.static').count();
check('不可勾选项用状态圆点而非空方框', staticBoxes === 6, `${staticBoxes} 个`);
const glyph = (await page.locator('.flag[data-f="6"] .fbox').innerText()).trim();
check('已下线项圆点带状态符号', glyph === '×', `glyph="${glyph}"`);
const clickableBoxes = await page.locator('.flag.clickable .fbox:not(.static)').count();
check('可勾选项仍是方形勾选框', clickableBoxes === 5, `${clickableBoxes} 个`);

await page.screenshot({ path: `${OUT}/cf-demo-3-flags.png`, fullPage: true });

// 7. 无运行时报错
check('无 JS 运行时错误', errors.length === 0, errors.join(' ; ') || '无');

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n汇总：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
