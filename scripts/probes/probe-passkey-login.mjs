/**
 * probe-passkey-login.mjs — 登录页通行密钥入口 E2E 探针
 *
 * 验证三件事（对应 login/index.vue 的能力门控设计）：
 *   ① 无平台认证器（headless 默认）→ `.boh-passkey-btn` 整个隐藏（不是置灰）；
 *   ② 挂 CDP 虚拟 authenticator（isUVPAA=true）→ 按钮出现；
 *   ③ 点击后走真实 GoTrue passkey 流程 —— 在 localhost 上 rpId 域不匹配，
 *      WebAuthn 仪式必然失败 → 首次使用引导文案出现（.boh-passkey-error 含「密码登录」）。
 *
 * 生产上的正向路径（真实指纹/面容 + rpId=blockofhome.cn）无法在本机自动化，
 * 由用户真机验收；本探针只覆盖协议可自动化的部分。
 *
 * 用法：先起 dev server（只听 IPv6）：
 *   npm run dev
 *   node scripts/probes/probe-passkey-login.mjs http://[::1]:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:5173';

const violations = [];
const fail = (m) => violations.push(m);
const log = (m) => console.log(`[passkey-probe] ${m}`);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// 桌面布局的表单有「登录 BOH」入口门（mobileFormOpen）—— 先把表单点开
const openLoginForm = async (page) => {
  await page.waitForSelector('.login-form-section', { timeout: 20000 });
  const gate = page.locator('.mobile-login-primary').first();
  if ((await gate.count()) > 0 && (await page.locator('.boh-login-btn').count()) === 0) {
    await gate.click({ timeout: 5000 });
  }
  await page.waitForSelector('.boh-login-btn', { timeout: 10000 });
  await page.waitForTimeout(2500); // 等 onMounted 的能力检测落定
};

try {
  // ---- 场景 A：无 WebAuthn API（模拟微信内置浏览器）→ 按钮隐藏 ----
  // 注意：本机是带 Touch ID 的 Mac，headless Chrome 的 isUVPAA 真实返回 true，
  // 不能靠"无认证器"制造阴性环境 —— 用删除 API 的方式模拟不支持的平台。
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctxA.addInitScript(() => {
    try {
      delete window.PublicKeyCredential;
    } catch {
      window.PublicKeyCredential = undefined;
    }
  });
  const pageA = await ctxA.newPage();
  await pageA.goto(`${BASE}/#/login`, { waitUntil: 'load' });
  await openLoginForm(pageA);

  const countA = await pageA.locator('.boh-passkey-btn').count();
  log(`场景 A（无 WebAuthn API）：通行密钥按钮数量 = ${countA}（期望 0）`);
  if (countA !== 0) fail('无 WebAuthn API 时按钮应当隐藏（能力检测门控失效）');

  // 顺带确认登录表单本体正常渲染
  const loginBtn = await pageA.locator('.login-form-section .boh-login-btn').count();
  if (loginBtn < 1) fail('登录表单未渲染（.boh-login-btn）');
  await ctxA.close();

  // ---- 场景 B：挂 CDP 虚拟 authenticator（isUVPAA=true）→ 按钮出现 ----
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const pageB = await ctxB.newPage();
  const cdp = await ctxB.newCDPSession(pageB);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerifiedPlatformAuthenticatorAvailable: true,
      automaticPresenceSimulation: true,
    },
  });

  await pageB.goto(`${BASE}/#/login`, { waitUntil: 'load' });
  await openLoginForm(pageB);

  const countB = await pageB.locator('.boh-passkey-btn').count();
  log(`场景 B（虚拟认证器）：通行密钥按钮数量 = ${countB}（期望 ≥1）`);
  if (countB < 1) fail('挂虚拟 authenticator 后按钮应出现（isUVPAA 门控未生效）');

  // ---- 场景 C：点击 → 走真实 GoTrue 流程 → localhost 与 rpId 不匹配 → 引导文案 ----
  if (countB >= 1) {
    await pageB.locator('.boh-passkey-btn').first().click();
    const guidance = await pageB
      .waitForSelector('.boh-passkey-error', { timeout: 15000 })
      .then((el) => el?.innerText())
      .catch(() => '');
    log(`场景 C（点击后错误引导）：「${String(guidance).replace(/\s+/g, ' ').slice(0, 60)}…」`);
    if (!guidance || !(guidance.includes('密码登录') || guidance.includes('账户安全'))) {
      fail(`点击后未出现首次使用引导文案（实际：「${guidance.slice(0, 60)}」）`);
    }
    // 登录态不得被建立
    const loggedIn = await pageB.evaluate(() => Boolean(window.localStorage.getItem('sb-nplnlefdwfgtyimfkyih-auth-token')));
    if (loggedIn) fail('失败路径不应残留会话存储');
  }

  await ctxB.close();
} catch (error) {
  fail(`探针执行异常：${error?.message || error}`);
} finally {
  await browser.close();
}

if (violations.length) {
  console.error(`[passkey-probe] FAIL（${violations.length}）：`);
  violations.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
}
console.log('[passkey-probe] PASS：显隐门控与失败引导路径全部符合预期');
