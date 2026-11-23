/**
 * probe-ui-kit-demo.mjs — BOH 统一组件库 Demo v0 验收探针
 * 用法: node scripts/probes/probe-ui-kit-demo.mjs
 * 环境变量: DEMO_FILE 覆盖被测文件路径（反证用）
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const FILE = process.env.DEMO_FILE || 'file://' + resolve(ROOT, 'docs/demos/boh-ui-kit-demo.html');
const SHOT_DIR = resolve(ROOT, 'output/probe-ui-kit-demo');
const EXPECT_RED = (process.env.EXPECT_RED || '')
  .split(',')
  .filter(Boolean)
  .map((s) => s.trim());

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ` — ${detail}` : ''));
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(FILE);
await page.waitForTimeout(400);

try {
  // 1. 清单渲染数量：19 张卡 = 18 必选 + BohCard 第二批
  const kitCount = await page.locator('.kit-card').count();
  check('清单渲染 19 个组件卡（18 必选 + 第二批）', kitCount === 19, `实际 ${kitCount}`);
  const mandatory = await page.locator('.kit-card.mandatory').count();
  check('必选标记 18 个（BohCard 为第二批）', mandatory === 18, `实际 ${mandatory}`);
  const navCard = await page
    .locator('.kit-card:has-text("导航头"), .kit-card:has-text("下拉")')
    .count();
  check('扫描新增件已入清单（导航头/下拉）', navCard >= 2, `实际 ${navCard}`);

  // 2. 默认交互链路：primary 按钮 → toast 出现
  await page.locator('.btn-primary').first().click();
  await page.waitForSelector('.toast.show', { timeout: 2000 });
  check('primary 按钮触发 toast 且出现动画完成', true);
  const toastText = await page.locator('.toast.show').first().textContent();
  check('toast 文案非空', toastText.trim().length > 0, toastText.trim());
  await page.waitForTimeout(3000); // 等自动消失

  // 3. 换语义触发不同 toast（分支差异）
  await page.locator('.btn-danger').first().click();
  await page.waitForSelector('#ov-confirm.show', { timeout: 2000 });
  await page.locator('#ov-confirm .btn-danger').click();
  await page.waitForSelector('.toast.show', { timeout: 2000 });
  const errToastIcon = await page.locator('.toast.show .ticon').getAttribute('class');
  check('危险确认走 err 语义 toast（与 ok 分支不同）', errToastIcon.includes('err'), errToastIcon);
  await page.waitForTimeout(3000);

  // 4. Modal 开 / 关（含遮罩点击关闭）
  await page.locator('.post-card').click();
  await page.waitForSelector('#ov-modal.show', { timeout: 2000 });
  const bodyLocked = await page.evaluate(() => document.body.style.overflow === 'hidden');
  check('Modal 打开后滚动锁生效', bodyLocked);
  await page.locator('#ov-modal').click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(400);
  const modalClosed = await page.evaluate(
    () => !document.querySelector('#ov-modal').classList.contains('show'),
  );
  const bodyUnlocked = await page.evaluate(() => document.body.style.overflow === '');
  check('Modal 点遮罩关闭 + 滚锁释放', modalClosed && bodyUnlocked);

  // 5. Sheet 开 / 关
  await page.locator('button:has-text("底部 Sheet")').last().click();
  await page.waitForSelector('#ov-sheet.show', { timeout: 2000 });
  await page.locator('#ov-sheet .btn-secondary').click();
  await page.waitForTimeout(400);
  check(
    'Sheet 开关链路正常',
    await page.evaluate(() => !document.querySelector('#ov-sheet').classList.contains('show')),
  );

  // 6. 按钮 loading 态：点击 → spinner 可见 → 1.2s 后复原
  const asyncBtn = page.locator('#btn-async');
  await asyncBtn.click();
  // 注：.btn 是 flex 容器，子项的 inline-block 会被 blockify 成 block，故只断言「可见」
  const loadingOn = await asyncBtn.evaluate(
    (el) =>
      el.classList.contains('loading') &&
      getComputedStyle(el.querySelector('.spinner')).display !== 'none',
  );
  check('按钮 loading 态生效（spinner 可见）', loadingOn);
  await page.waitForTimeout(1600);
  const loadingOff = await asyncBtn.evaluate((el) => !el.classList.contains('loading'));
  check('loading 态 1.2s 后复原', loadingOff);

  // 7. 输入错误态分支
  const inp = page.locator('#d-input');
  await inp.fill('abc');
  await inp.blur();
  const errShown = await page.evaluate(
    () =>
      document.querySelector('#d-input').classList.contains('is-error') &&
      document.querySelector('#d-err').classList.contains('show'),
  );
  check('输入 <4 字失焦出错误态', errShown);
  await inp.fill('一个合法的标题');
  const errCleared = await page.evaluate(
    () => !document.querySelector('#d-input').classList.contains('is-error'),
  );
  check('继续输入错误态即时清除', errCleared);

  // 7b. 导航头返程动画（leaving 类 + 返程 toast；toast.show 需双 rAF 后落上，用 waitFor）
  await page.locator('.back-btn').click();
  const navLeaving = await page.evaluate(() =>
    document.querySelector('#d-navheader').classList.contains('leaving'),
  );
  const navToastEl = await page
    .waitForSelector('.toast.show:has-text("返程")', { timeout: 2000 })
    .catch(() => null);
  check(
    '导航头返回触发返程动画 + 返程提示',
    navLeaving && navToastEl !== null,
    `leaving=${navLeaving}`,
  );
  await page.waitForTimeout(3200);

  // 7c. 下拉/Popover：开 → 外点关 → 选项目产生 toast
  const dd = page.locator('#d-dd');
  await dd.locator('button.btn').click();
  check(
    '下拉面板展开',
    await page.evaluate(() => document.querySelector('#d-dd').classList.contains('open')),
  );
  await page.mouse.click(20, 400); // 外点关闭
  check(
    '外点关闭下拉',
    await page.evaluate(() => !document.querySelector('#d-dd').classList.contains('open')),
  );
  await dd.locator('button.btn').click();
  await dd.locator('.dd-item').first().click();
  const ddClosed = await page.evaluate(
    () => !document.querySelector('#d-dd').classList.contains('open'),
  );
  const ddToastEl = await page
    .waitForSelector('.toast.show:has-text("统一下拉通道")', { timeout: 2000 })
    .catch(() => null);
  check('下拉选项目 → 关面板 + toast', ddClosed && ddToastEl !== null, `closed=${ddClosed}`);
  await page.waitForTimeout(3200);

  // 8. 主题切换真的换了 token（背景与文字都变）
  const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('#theme-seg button[data-t="dark"]').click();
  await page.waitForTimeout(500);
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('主题切换改变页面底色', bgLight !== bgDark, `${bgLight} → ${bgDark}`);
  const htmlTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('data-theme 属性落到 html', htmlTheme === 'dark');
  await page.screenshot({ path: resolve(SHOT_DIR, 'dark.png'), fullPage: true });

  // 9. 暗色下 Modal 也可开（材质在暗色下成立）
  await page.locator('.post-card').click();
  await page.waitForSelector('#ov-modal.show', { timeout: 2000 });
  await page.locator('#ov-modal .btn-primary').click();
  await page.waitForTimeout(300);
  check('暗色下 Modal 主按钮触发 toast 正常', (await page.locator('.toast.show').count()) > 0);
  await page.waitForTimeout(3000);
  await page.locator('#theme-seg button[data-t="light"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(SHOT_DIR, 'light.png'), fullPage: true });

  // 10. 对比度（浅色 + 暗色各一遍，阈值 4.5；辅助函数必须在 evaluate 上下文内定义）
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(400);
    const fails = await page.evaluate(() => {
      const parseColor = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1].split(',').map(Number);
        return [r, g, b, a];
      };
      const composite = (fg, bg) => {
        const a = fg[3] === undefined ? 1 : fg[3];
        return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
      };
      const lum = ([r, g, b]) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const contrast = (fg, bg) => {
        const l1 = lum(fg),
          l2 = lum(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const BG =
        document.documentElement.getAttribute('data-theme') === 'dark'
          ? [10, 10, 15]
          : [255, 255, 255];
      const targets = [
        ['正文', '.sec-desc'],
        ['总纲', '.mantra'],
        ['组件卡说明', '.kit-card .why'],
        ['痛点标签', '.kit-card .pain'],
        ['注释行', '.cell-note'],
        ['primary 按钮', '.btn-primary'],
        ['accent 标签', '.tag-accent'],
        ['danger 标签', '.tag-danger'],
      ];
      return targets
        .map(([label, sel]) => {
          const el = document.querySelector(sel);
          if (!el) return `${label}: 选择器不存在`;
          const fg = parseColor(getComputedStyle(el).color);
          if (!fg) return `${label}: 颜色解析失败`;
          let bg = [0, 0, 0, 0];
          let accA = 0; // 已累计的不透明度：到 1 即停，不再叠更外层的半透明底
          let node = el;
          while (node && node !== document.documentElement && accA < 0.999) {
            const c = parseColor(getComputedStyle(node).backgroundColor);
            if (c && c[3] > 0) {
              bg = composite(c, bg);
              accA = c[3] + accA * (1 - c[3]);
            }
            node = node.parentElement;
          }
          bg = composite([bg[0], bg[1], bg[2], 1], BG);
          const ratio = contrast(fg, bg);
          return ratio >= 4.5 ? null : `${label}: ${ratio.toFixed(2)}:1`;
        })
        .filter(Boolean);
    });
    check(`对比度 ≥ 4.5:1（${theme}）`, fails.length === 0, fails.join('; ') || '全部通过');
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  // 11. 标注开关真的在起作用（开 = 有伪元素内容生效的 padding，关 = 无）
  const noteOn = await page.evaluate(() => document.body.classList.contains('notes-on'));
  await page.locator('#note-seg button[data-n="off"]').click();
  const noteOff = await page.evaluate(() => !document.body.classList.contains('notes-on'));
  check('标注开关可切换', noteOn && noteOff);
  await page.locator('#note-seg button[data-n="on"]').click();

  // 12. 无 JS 运行时错误
  check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

/* ── 汇总 ── */
const failed = results.filter((r) => !r.ok);
if (EXPECT_RED.length) {
  const hit = EXPECT_RED.filter((name) => results.some((r) => r.name.includes(name) && !r.ok));
  console.log(
    `\n反证模式：期望红 ${EXPECT_RED.length} 条，实际变红 ${hit.length} 条 → ${hit.join(', ')}`,
  );
  if (hit.length === EXPECT_RED.length) {
    console.log('反证成立：断言有牙');
    process.exit(0);
  }
  console.log('反证不成立：存在该红没红的断言（摆设）');
  process.exit(1);
}
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败项: ' + failed.map((f) => f.name).join(', '));
  process.exit(1);
}
