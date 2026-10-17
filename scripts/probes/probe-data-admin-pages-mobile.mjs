#!/usr/bin/env node
/**
 * probe-data-admin-pages-mobile.mjs — 页面型子页 竖屏(390×844) 抽查
 *
 * 覆盖 PAGE_TAB_COMPONENTS 的 9 个页面型 tab + lotteries 操作台，共 10 页：
 * 每页断言 ① 无横向溢出（scrollWidth ≤ clientWidth）② 有内容渲染
 * ③ 零 pageerror。其余美观/交互问题看截图（debug-screenshots/pages-mobile-*.png）。
 *
 * 默认诊断模式 exit 0；`--strict` 有失败即 exit 1。
 * 运行：node scripts/probes/probe-data-admin-pages-mobile.mjs [--strict]
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
// section 取自 config/tabs.js 的 tabModules（页面型 tab 都在 data 段；
// api-keys/freemodels 是过渡期深链 tab，不在 tabModules 里，实测 section=data 可达）。
const TABS = [
  { tab: 'keys-models', section: 'data' },
  { tab: 'api-keys', section: 'data' },
  { tab: 'freemodels', section: 'data' },
  { tab: 'ai-quota', section: 'data' },
  { tab: 'moderation-model', section: 'data' },
  { tab: 'lab-ai-model', section: 'data' },
  { tab: 'points-grant', section: 'data' },
  { tab: 'pity-grant', section: 'data' },
  { tab: 'subscriptions-grant', section: 'data' },
  { tab: 'lotteries', section: 'data' },
];

// 各 Console 读取字段的超集（AiQuota 的 plan_code/quota_multiplier、
// Moderation 的 mode_id/api_url、Lab 的 feature_key/temperature 等）
const RICH_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'ok',
  title: '行 1',
  name: '行 1',
  label: '行 1',
  enabled: true,
  is_active: true,
  weight: 1,
  quota: 1000,
  used: 10,
  points_cost: 100,
  plan_code: 'standard',
  billing_cycle: 'monthly',
  duration_months: 1,
  quota_multiplier: 1,
  points_multiplier: 1,
  web_search_daily_limit: 10,
  daily_token_limit: 100000,
  daily_points_limit: 500,
  mode_id: 'moderation-default',
  model_id: 'mock-model',
  model_name: 'mock-model',
  provider: 'openai',
  base_url: 'https://example.com/v1',
  api_url: 'https://example.com/v1/chat/completions',
  api_key: 'sk-mock',
  feature_key: 'chat',
  feature_label: '对话',
  temperature: 0.7,
  max_tokens: 2048,
  description: '',
  user_id: '00000000-0000-4000-8000-000000000001',
  username: 'user_1',
  consecutive_losses: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  progress: 3,
  plan: 'standard',
  note: '',
  cycles: { monthly: { points_cost: 1 }, yearly: { points_cost: 10 } },
  stats: { total: 12, ok: 12, failed: 0 },
  config: {},
  tags: [],
};

const results = [];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 140)));

await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/rpc/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, users: 12, forum: 137, lotteries: 3 }),
    });
  }
  // .single()/.maybeSingle()（Accept 带 vnd.pgrst.object）返回单对象；数组会让
  // postgrest-js 抛 "JSON object requested"，部分 Console 的行映射随之 crash。
  const accept = route.request().headers().accept || '';
  if (accept.includes('vnd.pgrst.object') || url.includes('id=eq.')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(RICH_ROW),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'content-range': '0-11/12',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    },
    // 行形状取各 Console 实际读取字段的超集（缺字段会让页面抛
    // "Cannot read properties of undefined"——那是 mock 缺形状，不是页面缺陷）。
    // AiQuotaConfigConsole 的模板对每个 pack 无条件读 cycles.monthly 与
    // cycles.yearly（缺任一即整页崩，见 P2 遗留），因此 mock 给全 9 档 × 双周期。
    body: JSON.stringify(
      ['free', 'plus', 'boh-plus', 'pro', 'boh-pro', 'max', 'boh-max', 'ultra', 'standard'].flatMap(
        (code, ci) =>
          ['monthly', 'yearly'].map((cycle, i) => ({
            ...RICH_ROW,
            id: `row-${ci}-${i}`,
            plan_code: code,
            billing_cycle: cycle,
            points_cost: i === 0 ? 100 : 1000,
          })),
      ),
    ),
  });
});
await page.route('**/functions/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
);

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(1500);
await page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  s.isAdmin = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
}, ADMIN_UUID);

for (const { tab, section } of TABS) {
  pageErrors.length = 0;
  await page.goto(`${BASE}/#/admin/data-management?section=${section}&tab=${tab}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2600);
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    container: Boolean(
      document.querySelector('.page-tab-container')?.getBoundingClientRect().height > 0,
    ),
    anyText: (document.querySelector('.admin-main')?.innerText || '').trim().length,
    // 应用级错误边界的报错文本（mock 形状缺字段时会在这里暴露具体读哪个字段）
    boundary: (document.body.innerText.match(/页面出了点问题[\s\S]{0,120}/) || [''])[0]
      .replace(/\n/g, ' ')
      .slice(0, 140),
  }));
  const passOverflow = m.scrollWidth <= m.clientWidth + 1;
  // 页面型 tab 看 .page-tab-container；表格型（lotteries 等走运营工作台 + 表格）
  // 没有 container，用正文长度 + 无错误边界判定。
  const passContent = !m.boundary && (m.container || m.anyText > 80);
  const passError = pageErrors.length === 0;
  results.push({ tab, passOverflow, passContent, passError, m, errors: [...pageErrors] });
  console.log(
    `${passOverflow && passContent && passError ? 'PASS' : 'FAIL'}  ${tab}  overflow=${m.scrollWidth}/${m.clientWidth} rendered=${passContent} errors=${pageErrors.length}`,
  );
  if (!passError) console.log('   ↳', pageErrors.slice(0, 3).join(' | '));
  if (!passContent && m.boundary) console.log('   ↳ boundary:', m.boundary);
  await page.screenshot({ path: `debug-screenshots/pages-mobile-${tab}.png`, fullPage: false });
}

const failed = results.filter((r) => !(r.passOverflow && r.passContent && r.passError));
console.log(`\n──── ${TABS.length} 页，失败 ${failed.length} 页 ────`);
await browser.close();
process.exit(process.argv.includes('--strict') && failed.length ? 1 : 0);
