/**
 * probe-bohai-pet.mjs — 全局挂件「小方」（BohPetBlock）端到端探针（2026-11-22）
 *
 * 用户口径：BOHAI 化身为全局挂件「小方」—— 贴右缘探头（露 ~40%），hover/拖拽探出，
 * 点击唤起全站唯一 AI 岛（useBohIsland().askDirect —— 不造第二聊天面），可沿右缘拖动
 * 且位置记忆（localStorage: boh_pet_block_y），竖屏拖拽下界避开底部导航。
 *
 * 场景（/ai-chat 上挂件隐藏 —— 收敛口径；选 /#/user-space 做宿主页）：
 *   P1 挂件在场（/ai-chat 之外）
 *   P2 探头态：容器宽 < 画布宽（只露一条）
 *   P3 hover 探出：容器宽 = 画布宽
 *   P4 点击 → BohIsland 打开（.boh-island-root 可见）
 *   P5 拖拽：y 位移 + localStorage 记录
 *   P6 reload → 位置恢复
 *   P7 竖屏 390×844：挂件底缘高于底部导航顶缘（避让）
 *   P8 竖屏收窄：探头宽 = SIZE/2 × 0.8
 *
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-pet.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 220) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));

// RPC 全兜空（挂件/岛不依赖 RPC 内容；模式表给合法清单防 sendMessage 静默中止）
await page.route('**/rest/v1/rpc/**', (route) => {
  if (route.request().url().includes('list_public_bohai_modes')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'fast',
          mode_id: 'fast',
          model_id: 'deepseek-ai/DeepSeek-V3',
          name: 'Fast',
          display_name: 'Fast',
          tagline: '极速响应',
          min_tier: 'free',
          status: 'active',
          sort_order: 10,
          quota_multiplier: 1,
        },
      ]),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

await page.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
// 伪造登录（全程保活，同 probe-bohai-search-status 的 A0 机制）
const keepAuthTimer = setInterval(() => {
  page
    .evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      const auth = pinia?.state.value?.auth;
      if (auth && !auth.isLoggedIn) {
        auth.isLoggedIn = true;
        if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user' });
      }
    })
    .catch(() => {});
}, 400);
await page.waitForTimeout(1100);

const readPet = () =>
  page.evaluate(() => {
    const w = document.querySelector('.boh-pet-block');
    if (!w) return { present: false };
    const r = w.getBoundingClientRect();
    const cv = w.querySelector('.boh-pet-canvas');
    return {
      present: true,
      visible: w.checkVisibility(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      right: Math.round(r.right),
      canvasW: Math.round((cv?.getBoundingClientRect().width ?? 0) * 10) / 10,
      state: w.getAttribute('data-pet-state') || '',
    };
  });

// P1 挂件在场
await page.waitForSelector('.boh-pet-block', { timeout: 10000 });
const p1 = await readPet();
check(
  'P1 挂件在场（/ai-chat 之外的用户空间页）',
  p1.present && p1.visible && p1.canvasW > 0,
  JSON.stringify(p1),
);

// P2 探头态：容器宽 < 画布宽（56）
check(
  'P2 探头态：只露一条（容器宽 < 画布宽）',
  p1.w < p1.canvasW,
  `w=${p1.w} canvas=${p1.canvasW}`,
);

// P3 hover 探出
await page.locator('.boh-pet-block').hover();
await page.waitForTimeout(350);
const p3 = await readPet();
check('P3 hover 探出全身', p3.w >= p3.canvasW - 2, `w=${p3.w} canvas=${p3.canvasW}`);

// P4 点击 → BohIsland 打开（useBohIsland.askDirect）
await page.locator('.boh-pet-block').click();
await page.waitForTimeout(600);
const islandOpen = await page.evaluate(() => {
  const root = document.querySelector('.boh-island-root');
  return !!root && !!root.checkVisibility();
});
check('P4 点击小方 → 全站唯一 AI 岛打开（askDirect 同大脑）', islandOpen);
await page.screenshot({ path: `${OUT}/bohai-pet-island-open.png` });
// 关岛（岛自身的关闭入口）——找 Island 的关闭钮；找不到就点页面空白处
const closed = await page.evaluate(() => {
  const btn = document.querySelector(
    '.boh-island-root [title*="关闭"], .boh-island-root [aria-label*="关闭"]',
  );
  if (btn) {
    btn.click();
    return 'via-btn';
  }
  return 'no-btn';
});
if (closed === 'no-btn') {
  await page.keyboard.press('Escape'); // 岛监听 Escape 关闭（外点若落在岛面板内关不掉）
}
await page.waitForTimeout(500);

// P5 拖拽（岛必须已关 —— 岛浮层 z 10001 会截走 pointerdown）：按下 → 下移 120px → 抬起；y 应变化并落 localStorage
const before = await readPet();
await page.mouse.move(before.right - 10, before.top + 10);
await page.mouse.down();
for (let i = 1; i <= 8; i += 1) {
  await page.mouse.move(before.right - 10, before.top + 10 + (120 / 8) * i);
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(1200); // 惯性滑行 + settle 落位需要 ~0.8s
const after = await readPet();
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('boh_pet_block_pos');
  if (!raw) return 0;
  try {
    return Math.round(JSON.parse(raw).y) || 0;
  } catch {
    return 0;
  }
});
check(
  'P5 拖拽移动 + localStorage 记录（松手即存；惯性/settle 方向不限）',
  Math.abs(after.top - before.top) > 20 && stored > 0,
  `top ${before.top} → ${after.top} stored=${stored}`,
);

// P6 reload → 位置恢复
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1100);
const restored = await readPet();
check(
  'P6 reload 后位置恢复（= 存储值；惯性/settle 落位自洽）',
  stored > 0 && Math.abs(restored.top - stored) <= 6,
  `top=${restored.top} 期望≈${after.top}`,
);

// P7/P8 竖屏 390×844：避底栏 + 收窄
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const portrait = await readPet();
const navTop = await page.evaluate(() => {
  const nav =
    document.querySelector('.bottom-nav') ||
    document.querySelector('[class*="bottom-nav"]') ||
    document.querySelector('[class*="tabbar"]');
  return nav ? Math.round(nav.getBoundingClientRect().top) : window.innerHeight - 60;
});
check(
  'P7 竖屏：挂件底缘高于底部导航顶缘（避让）',
  portrait.present && portrait.bottom <= navTop + 2,
  `pet bottom=${portrait.bottom} navTop=${navTop}`,
);
check(
  'P8 竖屏：探头收窄（SIZE/2 × 0.8 = 26px）',
  portrait.w === Math.round((64 / 2) * 0.8),
  `w=${portrait.w}`,
);
await page.screenshot({ path: `${OUT}/bohai-pet-portrait.png` });

// P9 /ai-chat 上挂件隐藏（收敛口径：活动行本体在场，挂件退场）
await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const onAiChat = await page.evaluate(() => {
  const pet = document.querySelector('.boh-pet-block');
  return !pet || !pet.checkVisibility();
});
check('P9 /ai-chat 路由：挂件隐藏（活动行本体在场，不双现）', onAiChat);

clearInterval(keepAuthTimer);
check('P10 零 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.screenshot({ path: `${OUT}/bohai-pet-final.png` });

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) process.exit(1);
await browser.close();
