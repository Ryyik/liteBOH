/**
 * probe-bohai-portrait.mjs — BOHAI 竖屏适配侦察 + 回归探针（2026-10-15）
 *
 * 390×844 竖屏实测：空态 / 消息流 / 模式菜单开 / 工具菜单开 四张截图 + 几何 dump
 * （菜单越界、底行挤压、面板可用宽度），供人眼判读与修复回归。
 * 登录/网络：沿用 probe-bohai-glass 口径（modes RPC mock + api-key-vault mock）。
 *
 * 用法：node scripts/probes/probe-bohai-portrait.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
let total = 0;
const violations = [];
const check = (name, ok, detail = '') => {
  total += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) violations.push(name);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
/* 刻意**不登录**：登出态的模式清单是纯本地确定性数据（当前模式一行），
   几何回归零网络依赖；多行满高场景由工具菜单（4 行固定内容）承担。
   （带假会话反而让 RPC 按用户过滤返回空 → 菜单空态，几何无从测起 —— 实测踩过。） */

/* 模式清单走真实网络（composer 探针 A2a 同口径）：mock 形状与真 RPC 有保真度差，
   会退化成单行菜单干扰几何判断（实测首跑只有 1 行）；api-key-vault 仍 mock（探针不调真模型）。 */
await page.route('**/functions/v1/api-key-vault**', (route) => {
  const body = route.request().postData() || '';
  if (!body.includes('runtime-chat-stream')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, message: '探针不调真模型' }),
  });
});

await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.boh-composer-input', { timeout: 20000 });
await page.waitForTimeout(1200);

/* ① 空态 */
await page.screenshot({ path: 'debug-screenshots/bohai-portrait-1-empty.png' });
const emptyGeom = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  return {
    page: getComputedStyle(document.querySelector('.bohai-page')).backgroundColor,
    composer: pick('.boh-composer'),
    composerWrap: pick('.boh-composer-wrap'),
    pills: [
      ...document.querySelectorAll('.boh-mode-pill, .boh-tools-pill, .boh-usage, .boh-send'),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { cls: el.className.split(' ')[0], x: Math.round(r.x), w: Math.round(r.width) };
    }),
    docScrollW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  };
});
console.log(`  [dbg] empty=${JSON.stringify(emptyGeom)}`);
check(
  '空态无横向滚动',
  emptyGeom.docScrollW <= emptyGeom.vw + 1,
  `scrollW=${emptyGeom.docScrollW} vw=${emptyGeom.vw}`,
);

/* ② 消息流（两条消息，AI 侧渲染失败占位但节点在） */
for (const text of ['竖屏适配侦察：一', '竖屏适配侦察：二']) {
  await page.fill('.boh-composer-input', text);
  await page.locator('.boh-send').click();
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'debug-screenshots/bohai-portrait-2-stream.png' });

/* ③ 模式菜单开 */
await page.click('.boh-mode-pill');
await page.waitForSelector('.boh-mode-wrap .boh-mode-menu', { timeout: 5000 });
/* 等模式清单加载稳定（竞态教训：开面板瞬间可能还在骨架态） */
await page
  .waitForFunction(() => document.querySelectorAll('.boh-mm-item').length >= 3, { timeout: 4000 })
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: 'debug-screenshots/bohai-portrait-3-model-menu.png' });
const modelGeom = await page.evaluate(() => {
  const r = document.querySelector('.boh-mode-menu')?.getBoundingClientRect();
  const anchor = document.querySelector('.boh-mode-wrap .boh-menu-anchor')?.getBoundingClientRect();
  const items = [...document.querySelectorAll('.boh-mm-item')].map((el) =>
    Math.round(el.getBoundingClientRect().height),
  );
  return {
    menu: r
      ? {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          right: Math.round(r.right),
        }
      : null,
    anchorX: anchor ? Math.round(anchor.x) : null,
    items,
    rowsChildren: document.querySelector('.boh-mm-rows')?.children?.length ?? null,
    vw: window.innerWidth,
    overflowsRight: r ? r.right > window.innerWidth + 1 : null,
    overflowsLeft: r ? r.x < -1 : null,
  };
});
console.log(`  [dbg] model=${JSON.stringify(modelGeom)}`);
check(
  '模式菜单不越出视口左右',
  modelGeom.menu && !modelGeom.overflowsRight && !modelGeom.overflowsLeft,
  JSON.stringify(modelGeom.menu),
);
check(
  '模式菜单在视口顶部内（y ≥ 0）',
  modelGeom.menu && modelGeom.menu.y >= -1,
  `y=${modelGeom.menu?.y}`,
);

/* ④ 工具菜单开 */
await page.click('.boh-mode-pill');
await page.waitForTimeout(300);
await page.click('.boh-tools-pill');
await page.waitForSelector('.boh-tools-wrap .boh-tools-menu', { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'debug-screenshots/bohai-portrait-4-tools-menu.png' });
const toolsGeom = await page.evaluate(() => {
  const r = document.querySelector('.boh-tools-menu')?.getBoundingClientRect();
  return {
    menu: r
      ? {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          right: Math.round(r.right),
        }
      : null,
    vw: window.innerWidth,
  };
});
console.log(`  [dbg] tools=${JSON.stringify(toolsGeom)}`);
check(
  '工具菜单不越出视口',
  toolsGeom.menu && toolsGeom.menu.x >= -1 && toolsGeom.menu.right <= toolsGeom.vw + 1,
  JSON.stringify(toolsGeom.menu),
);

/* 关菜单收尾 */
await page.click('.boh-tools-pill');
check('零 pageerror', errors.length === 0, errors.join(' | ').slice(0, 200));

await browser.close();
console.log(`\n──── 合计 ${total} 条，失败 ${violations.length} 条 ────`);
if (violations.length) process.exit(1);
