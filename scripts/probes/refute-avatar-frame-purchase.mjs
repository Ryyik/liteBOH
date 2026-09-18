import { chromium } from 'playwright';

// 反证脚本：只验证一条因果 —— 「积分解锁成功后立即佩戴，且不再劝买」。
//
// 为什么独立于主探针：主探针有 31 项、跨 6 个场景，注入缺陷触发 HMR 时容易抖；
// 反证需要干净、快速、单场景，才能清楚看到「撤掉修复 → 断言转红」。
//
// 跑法：
//   node scripts/probes/refute-avatar-frame-purchase.mjs                 # 基线，应 PASS
//   # 注释掉 AvatarFrameGrid.vue 里 confirmPurchase 的 refreshMyAvatarFrameUnlocks()
//   node scripts/probes/refute-avatar-frame-purchase.mjs                 # 应 FAIL（buyBtnGone=false）
const BASE = process.env.BASE || 'http://[::1]:5173';
const FRAME_ROW = {
  id: 'probe-elf', name: '探针花环', description: '探针专用', url: '/avatars/frames/elf-flower-frame.png',
  source_url: '', scale: 2.08, tier: 'ultra', free_until: '2026-09-25', points_price: 120,
  sort_order: 90, status: 'published', ring: '#e8734a', updated_at: new Date().toISOString()
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
let purchased = false;
await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const json = (body) => {
    const rows = Array.isArray(body) ? body.length : 0;
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': rows ? `0-${rows - 1}/${rows}` : '*/0',
        'Access-Control-Expose-Headers': 'Content-Range'
      },
      body: JSON.stringify(body)
    });
  };
  if (url.includes('/rpc/get_user_subscription_tier')) return json('free');
  if (url.includes('/rpc/list_my_avatar_frame_unlocks')) return json(purchased ? ['probe-elf'] : []);
  if (url.includes('/rpc/purchase_avatar_frame')) {
    purchased = true;
    return json({ ok: true, already_owned: false, points_deducted: 120, current_points: 180 });
  }
  if (url.includes('/rest/v1/avatar_frames')) return json([FRAME_ROW]);
  if (url.includes('/rest/v1/profiles')) {
    return json([{ id: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', username: '普通用户', points: 300, role: 'user', avatar_url: null }]);
  }
  return json([]);
});

await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = p.state.value.auth;
  s.isLoggedIn = true; s.isInitialized = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '普通用户', id: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', role: 'user', avatarUrl: '', points: 300 });
});
await page.getByRole('tab', { name: '装扮' }).click({ timeout: 15000 });
await page.waitForSelector('.afg-grid', { timeout: 15000 });
await page.waitForTimeout(800);

// 前置：DB 清单必须真的进了网格（清单链路断了后面全都不成立）
if (await page.locator('.afg-card-name', { hasText: '探针花环' }).count() === 0) {
  console.log('FAIL  DB 清单里的框未出现在装扮网格（清单链路断了）');
  await browser.close();
  process.exit(1);
}

await page.getByRole('button', { name: /探针花环/ }).first().click();
await page.waitForTimeout(600);
await page.locator('.afg-buy-btn').click();
await page.waitForSelector('.afg-purchase', { timeout: 6000 });
await page.locator('.afg-p-btn.primary').click();
await page.waitForTimeout(1200);

const result = await page.evaluate(() => ({
  purchaseGone: !document.querySelector('.afg-purchase'),
  previewName: document.querySelector('.afg-preview-name-row strong')?.textContent.trim() || '',
  buyBtnGone: !document.querySelector('.afg-buy-btn')
}));

const pass = result.purchaseGone && result.previewName === '探针花环' && result.buyBtnGone;
console.log(`${pass ? 'PASS' : 'FAIL'}  积分解锁成功后立即佩戴并且不再劝买  -- ${JSON.stringify(result)}`);
await browser.close();
process.exit(pass ? 0 : 1);
