import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 探针：头像框控制台方案 demo（avatar-frame-console-demo.html）
// 从仓库根运行；DEMO_FILE 环境变量可指向副本用于反证（不要把缺陷写回源文件再改回来）
const REL = 'avatar-frame-console-demo.html';
const FILE = process.env.DEMO_FILE
  ? pathToFileURL(path.resolve(process.env.DEMO_FILE)).href
  : pathToFileURL(path.resolve(process.cwd(), REL)).href;
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1120, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

await page.goto(FILE, { waitUntil: 'load' });
await page.waitForTimeout(400);

const text = (sel) => page.locator(sel).first().innerText();
const readout = () => page.evaluate(() => {
  const pick = (label) => {
    const rows = [...document.querySelectorAll('#readout .kv')];
    const r = rows.find((x) => x.querySelector('span')?.textContent.includes(label));
    return r ? r.querySelector('b').textContent.trim() : '';
  };
  return {
    scale: pick('scale'),
    ratio: pick('内孔占比'),
    margin: pick('最紧档余量'),
    offset: pick('孔心偏移'),
    verdict: document.querySelector('#verdict strong')?.textContent.trim() || '',
    verdictCls: document.querySelector('#verdict')?.className || '',
    alerts: [...document.querySelectorAll('#alertBox .alert')].map((e) => e.textContent.trim()),
    alertCls: [...document.querySelectorAll('#alertBox .alert')].map((e) => e.className.replace('alert ', '')),
  };
});

/* ---------- 1. 列表渲染 ---------- */
{
  const n = await page.locator('#picker .picker-item').count();
  check('素材选择列表渲染 3 项', n === 3, `${n} 项`);
  const names = await page.locator('#picker .picker-item b').allInnerTexts();
  check('列表项名称正确', names.join(',') === '菊花梨,奇丽草,白底未抠图', names.join(','));
}

/* ---------- 2. 默认项跑出结论卡 ---------- */
await page.waitForSelector('.verdict strong', { timeout: 5000 });
{
  const r = await readout();
  check('默认项渲染结论卡', !!r.verdict, r.verdict);
  check('默认项为菊花梨且 scale 与手算一致（1/0.345=2.90）', Math.abs(parseFloat(r.scale) - 2.9) < 0.02, `scale=${r.scale}`);
  check('默认项内孔占比 = 34.5%', r.ratio === '34.5%', r.ratio);
  check('默认项判定为不能发布（框层超 116px）', r.verdict.includes('不能发布'), r.verdict);
  check('默认项有红色溢出警告', r.alertCls.includes('bad'), JSON.stringify(r.alertCls));
}

/* ---------- 3. 缩放改变 scale 读数（核心交互） ---------- */
{
  const before = await readout();
  await page.locator('#zoomRange').evaluate((el) => {
    el.value = '150';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const after = await readout();
  check('缩放后 scale 读数确实变化', before.scale !== after.scale, `${before.scale} → ${after.scale}`);
  check('放大 1.5× 后 scale = 2.90/1.5 = 1.93', Math.abs(parseFloat(after.scale) - 1.933) < 0.02, after.scale);
  check('放大后 116px 溢出警告消失', !after.alertCls.includes('bad'), JSON.stringify(after.alertCls));
}

/* ---------- 4. 一键自动适配 ---------- */
{
  await page.locator('#btnAuto').click();
  await page.waitForTimeout(150);
  const r = await readout();
  const target = (116 - 10) / 52; // 2.038：按 52px 头像 × 116px 卡片预留 10px 余量
  check('自动适配后 scale 落在目标附近（2.04）', Math.abs(parseFloat(r.scale) - target) < 0.02, `${r.scale} vs ${target.toFixed(3)}`);
  check('自动适配后余量为正', r.margin.startsWith('+'), r.margin);
  check('自动适配后结论转为可发布', r.verdict === '可以发布', r.verdict);
  check('自动适配后警告转为 ok', r.alertCls.length === 1 && r.alertCls[0] === 'ok', JSON.stringify(r.alertCls));
}

/* ---------- 5. 拖动改变孔心偏移（核心交互） ---------- */
{
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const r = await readout();
  check('拖动后孔心偏移读数 > 0', parseInt(r.offset, 10) > 10, r.offset);
  check('孔心偏移触发红色警告', r.alertCls.includes('bad'), JSON.stringify(r.alertCls));
  check('偏移后判定为不能发布（孔心未居中）', r.verdict.includes('孔心未居中') || r.verdict.includes('不能发布'), r.verdict);
  await page.locator('#btnCenter').click();
  await page.waitForTimeout(120);
  const r2 = await readout();
  check('点「居中」后偏移归零', parseInt(r2.offset, 10) === 0, r2.offset);
}

/* ---------- 6. 切换素材：结论变化 + 状态类卫生 ---------- */
{
  const before = await readout();
  await page.locator('#picker .picker-item').nth(2).click();
  await page.waitForTimeout(200);
  const after = await readout();
  check('切换素材后 scale 读数变化', before.scale !== after.scale, `${before.scale} → ${after.scale}`);
  check('切到白底素材出现抠底提示', after.alerts.some((a) => a.includes('抠白底')), JSON.stringify(after.alerts.map((a) => a.slice(0, 16))));
  check('切素材后读数整体换成新素材（内孔占比 62.0%，非旧值 34.5%）', after.ratio === '62.0%', after.ratio);
  check('切素材后缩放重置为 1.00×（scale = 1/0.620 = 1.61）', after.scale === '1.61', after.scale);
  check('切素材后警告区无旧素材残留（不应再出现 34.5%）',
    !after.alerts.some((a) => a.includes('34.5%')), JSON.stringify(after.alerts.map((a) => a.slice(0, 20))));
}

/* ---------- 7. 面板切换 + 列序稳定 ---------- */
{
  await page.locator('.tab[data-tab="compare"]').click();
  await page.waitForTimeout(250);
  const head1 = await page.locator('table.diff th').allInnerTexts();
  check('对比面板激活', await page.locator('[data-panel="compare"]').evaluate((el) => el.classList.contains('on')));
  check('对比表列序固定（维度/手工/控制台）', head1.join('|') === '维度|手工流程|控制台流程', head1.join('|'));
  const manualHl = await page.locator('table.diff td:nth-child(2).hl').count();
  await page.locator('#seg button[data-case="console"]').click();
  await page.waitForTimeout(250);
  const head2 = await page.locator('table.diff th').allInnerTexts();
  const consoleHl = await page.locator('table.diff td:nth-child(3).hl').count();
  check('切换后表头保持不变（不错位）', head1.join('|') === head2.join('|'), head2.join('|'));
  check('切换后高亮列从手工换到控制台', manualHl > 0 && consoleHl > 0, `手工高亮 ${manualHl} 行 / 控制台高亮 ${consoleHl} 行`);
  const rows = await page.locator('table.diff tbody tr').count();
  check('对比表渲染 6 行差异', rows === 6, `${rows} 行`);

  await page.locator('.tab[data-tab="checklist"]').click();
  await page.waitForTimeout(200);
  const items = await page.locator('#clist .cl-item').count();
  check('清单渲染 17 项', items === 17, `${items} 项`);
}

/* ---------- 8. 不可操作项点不动 / 可操作项可勾选 ---------- */
{
  const lockedIdx = await page.evaluate(() => [...document.querySelectorAll('#clist .cl-item')].findIndex((x) => x.classList.contains('locked')));
  check('存在 1 项不可操作（UGC 明确不做）', lockedIdx === 16, `index=${lockedIdx}`);
  await page.locator(`#clist .mark[data-i="${lockedIdx}"]`).click();
  await page.waitForTimeout(100);
  const lockedOn = await page.locator(`#clist .mark[data-i="${lockedIdx}"]`).evaluate((el) => el.classList.contains('on'));
  check('不可操作项点击后仍为未勾选（非空断言）', lockedOn === false, `class=${lockedOn}`);

  await page.locator('#clist .mark[data-i="0"]').click();
  await page.waitForTimeout(100);
  const on0 = await page.locator('#clist .mark[data-i="0"]').evaluate((el) => el.classList.contains('on'));
  check('可操作项点击后可勾选', on0 === true, `class=${on0}`);
  const sum = await text('#clSum');
  check('汇总文案跟随勾选更新', sum.includes('已确认 1 /'), sum.slice(0, 24));
}

/* ---------- 9. 无 JS 错误 ---------- */
check('无 JS 运行时错误', errors.length === 0, errors.join(' | '));

/* ---------- 10. 截图 ---------- */
await page.locator('.tab[data-tab="editor"]').click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/avatar-console-demo-editor.png` });
await page.locator('.tab[data-tab="compare"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/avatar-console-demo-compare.png` });
await page.locator('.tab[data-tab="checklist"]').click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/avatar-console-demo-checklist.png` });

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项:\n' + failed.map((f) => `  - ${f.name}  ${f.detail}`).join('\n'));
process.exit(failed.length ? 1 : 0);
