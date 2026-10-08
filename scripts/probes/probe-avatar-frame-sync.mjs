import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：头像框「跨设备同步」端到端回归
//
// 修的是什么：同步原本只挂在 UserSpace 页 onMounted —— 新设备登录后**不进「我的」页**
// 就永远不拉服务端佩戴态，表现是「换台设备头像框就没了」。现在时机收敛到
// main.js → initAvatarFrameSync（监听 auth 事件），任何页面都会对齐。
//
// 4 个场景都用独立 browser context（= 干净的一台新设备），只在 localStorage 种
// 「伪造的 supabase 会话」而**不种佩戴记录**，逼真复现「新设备」：
//   A 服务端有 url → 首页 navbar 自动戴上（核心修复点，全程不进我的页）
//   B 运营新增框（内置清单没有、只存在于 DB 清单）→ 也能反查还原
//   C 服务端 url 反查不到任何清单行 → 保持无框，且不把本机写成别的框
//   D 换号保护：本机佩戴归属别的账号 → 先清本机，再以服务端为准
//
// ⚠️ 启动：先 `npm run dev`（vite 绑 IPv6，localhost 与 [::1] 都可）。
// ⚠️ 佩戴态是模块级单例 ref，只在模块首次求值读 localStorage → 必须在页面加载前种。
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
const REF = 'nplnlefdwfgtyimfkyih';
const UID = '00000000-0000-4000-8000-000000000001';
const OTHER_UID = '00000000-0000-4000-8000-0000000000ff';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const MOCK_USER = {
  id: UID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ryyik@bohrite.example.com',
  user_metadata: { username: '瑞一颗' },
  app_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

/** 线上真实形态的清单（2026-10-06 线上库导出节选）：white-cat 的 url 已被运营改成
 *  Cloudinary 地址，frame-muh01jp3（中秋限定）是后来新增的框 —— 内置清单里两个都没有。 */
const DB_FRAMES = [
  {
    id: 'orange-cat',
    name: '橙猫手绘',
    description: '手绘小猫环绕',
    url: '/avatars/frames/orange-cat-frame.png',
    source_url: null,
    scale: 1.24,
    tier: 'free',
    free_until: null,
    points_price: null,
    sort_order: 10,
    status: 'published',
    ring: '#e8734a',
    updated_at: '2026-09-18T00:00:00Z',
  },
  {
    id: 'white-cat',
    name: '白绒猫',
    description: '白色毛绒厚环',
    url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1789798615/boh-cloud-plus/admin-avatar-frames/mupu5trhd5napiwg7zew.png',
    source_url: null,
    scale: 1.4,
    tier: 'plus',
    free_until: null,
    points_price: null,
    sort_order: 30,
    status: 'published',
    ring: '#f0e8e0',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'cow',
    name: '奶牛抱抱',
    description: '手绘奶牛',
    url: '/avatars/frames/cow-frame.png',
    source_url: null,
    scale: 1.6,
    tier: 'free',
    free_until: null,
    points_price: null,
    sort_order: 50,
    status: 'published',
    ring: '#cfcfd6',
    updated_at: '2026-09-18T00:00:00Z',
  },
  {
    id: 'frame-muh01jp3',
    name: '中秋限定',
    description: '限时活动框',
    url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1790345356/boh-cloud-plus/admin-avatar-frames/tjqkosgvp3x2tqpbpor0.png',
    source_url: null,
    scale: 1.24,
    tier: 'limit',
    free_until: '2026-09-26',
    points_price: null,
    sort_order: 100,
    status: 'published',
    ring: '',
    updated_at: '2026-09-25T00:00:00Z',
  },
];

/**
 * 开一台「新设备」：只伪造会话，不种佩戴记录。
 * @param {{serverUrl:string, localFrameId?:string, localOwner?:string}} opts
 */
async function newDevice({ serverUrl, localFrameId = null, localOwner = null }) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];

  await context.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    }),
  );
  await context.route('**/rest/v1/avatar_frames**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(DB_FRAMES),
    }),
  );
  await context.route('**/rest/v1/rpc/list_my_avatar_frame_unlocks', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await context.route('**/rest/v1/profiles**', (route) => {
    const req = route.request();
    if (req.method() === 'PATCH' || req.method() === 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
        body: JSON.stringify([]),
      });
    }
    // maybeSingle：PostgREST 单对象形状
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify({ avatar_frame_url: serverUrl || null }),
    });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  await page.addInitScript(
    ({ ref, user, frameId, owner }) => {
      localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'mock-refresh-token',
          user,
        }),
      );
      if (frameId) localStorage.setItem('boh-avatar-frame-id', frameId);
      if (owner) localStorage.setItem('boh-avatar-frame-owner', owner);
    },
    { ref: REF, user: MOCK_USER, frameId: localFrameId, owner: localOwner },
  );
  return { browser, context, page, errors };
}

/** 打开首页（而非我的页）并注入登录态 —— 登录态注入手法见 probe-messages-ui.mjs */
async function openHomeLoggedIn(page) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(2500);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isInitialized = true;
    s.isLoggedIn = true;
    if (s.userInfo)
      Object.assign(s.userInfo, {
        username: '瑞一颗',
        id: uid,
        email: 'ryyik@bohrite.example.com',
      });
  }, UID);
}

/** 轮询 navbar 用户头像的框层 CSS 变量（空串 = 没渲染框） */
async function waitNavFrame(page, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const v = await page.evaluate(() => {
      const el = document.querySelector('.nav-user-info .boh-avatar-frame');
      return el ? getComputedStyle(el).getPropertyValue('--boh-avatar-frame-url').trim() : '';
    });
    if (v) return v;
    await page.waitForTimeout(200);
  }
  return '';
}

const readLocal = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

/* ---------- A. 新设备登录 → 首页自动戴上云端框（核心修复点） ---------- */
{
  const { browser, page, errors } = await newDevice({
    serverUrl: '/avatars/frames/orange-cat-frame.png',
  });
  await openHomeLoggedIn(page);
  const bg = await waitNavFrame(page);
  check(
    'A1 新设备登录后，停在首页（不进我的页）navbar 自动戴上云端框',
    bg.includes('orange-cat-frame.png'),
    bg || 'navbar 无 .boh-avatar-frame',
  );
  check(
    'A2 同步结果写回本机（离线/下次冷启动仍显示）',
    (await readLocal(page, 'boh-avatar-frame-id')) === 'orange-cat',
    `boh-avatar-frame-id=${await readLocal(page, 'boh-avatar-frame-id')}`,
  );
  await page.screenshot({ path: `${OUT}/avatar-frame-sync-A.png` });
  check('A3 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- B. 运营新增框（内置清单没有）也能反查还原 ---------- */
{
  const { browser, page, errors } = await newDevice({
    serverUrl: DB_FRAMES[3].url,
  });
  await openHomeLoggedIn(page);
  const bg = await waitNavFrame(page);
  check(
    'B1 服务端存的是「只在 DB 清单里的框」→ 也能反查还原（证明反查依赖 DB 清单）',
    bg.includes('tjqkosgvp3x2tqpbpor0.png'),
    bg || 'navbar 无框',
  );
  check(
    'B2 本机写入该框 id',
    (await readLocal(page, 'boh-avatar-frame-id')) === 'frame-muh01jp3',
    `boh-avatar-frame-id=${await readLocal(page, 'boh-avatar-frame-id')}`,
  );
  check('B3 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- C. 反证 · 服务端 url 反查不到 → 保留本机佩戴，不回落「无框」 ---------- */
{
  // 本机戴着 cow（归属当前账号），服务端存了一个清单里查不到的 url。
  // 旧写法 `frame?.id || 'none'` 会把本机抹成「无框」—— 正是「戴着的框自己消失」的成因。
  const { browser, page, errors } = await newDevice({
    serverUrl: 'https://example.com/some-frame-we-no-longer-know.png',
    localFrameId: 'cow',
    localOwner: UID,
  });
  await openHomeLoggedIn(page);
  const bg = await waitNavFrame(page);
  check(
    'C1 服务端 url 反查不到清单行 → 保留本机佩戴（旧写法会把戴着的框抹成无框）',
    bg.includes('cow-frame.png'),
    bg || 'navbar 无框',
  );
  check(
    'C2 本机佩戴记录不被改写（照旧是 cow，而不是被写成 none）',
    (await readLocal(page, 'boh-avatar-frame-id')) === 'cow',
    `boh-avatar-frame-id=${await readLocal(page, 'boh-avatar-frame-id')}`,
  );
  check('C3 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- D. 换号保护：本机佩戴属于别人 → 先清，再以服务端为准 ---------- */
{
  const { browser, page, errors } = await newDevice({
    serverUrl: '/avatars/frames/cow-frame.png',
    localFrameId: 'elf-flower',
    localOwner: OTHER_UID,
  });
  await openHomeLoggedIn(page);
  const bg = await waitNavFrame(page);
  check(
    'D1 换号后以服务端佩戴为准（本机遗留的 elf-flower 被清掉）',
    bg.includes('cow-frame.png') && !bg.includes('elf-flower'),
    bg || 'navbar 无框',
  );
  check(
    'D2 本机记录同步为服务端的框',
    (await readLocal(page, 'boh-avatar-frame-id')) === 'cow',
    `boh-avatar-frame-id=${await readLocal(page, 'boh-avatar-frame-id')}`,
  );
  check('D3 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(`  · ${f.name}  -- ${f.detail}`);
  process.exit(1);
}
