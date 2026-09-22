import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：真实注册页（src/views/Join/index.vue，路由 /#/join）验收
// 用法：node scripts/probes/probe-join-real.mjs（需要 dev server 在 :5173）
//   ⚠️ 绝不真实注册：/auth/v1/signup 与 profiles 的 POST 全部被拦截成合成响应
//   ⚠️ 同一 path 只注册一条 page.route（后注册会短路前序）
const BASE = process.env.JOIN_BASE || 'http://localhost:5173';
const OUT = process.env.SHOT_DIR || 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UA_DESKTOP = { viewport: { width: 1440, height: 960 } };

const boot = async (browser, { mockSignup = 'session', passkey = false, ...ctxOpts } = {}) => {
  const context = await browser.newContext({ ...UA_DESKTOP, ...ctxOpts });
  const page = await context.newPage();
  // 两类错误分开收：
  //  · pageErrors —— 真正的 JS 异常，严格，一条都不放过；
  //  · consoleErrors —— 过滤掉两类**已知非页面缺陷**的噪声：
  //      ① mock 出来的假 token 让 app 级通知轮询拿 401（PGRST301）；
  //      ② Vite dev server 在探针压力下的传输层 reset/abort（连接级，不是 JS 错误）。
  //    真 404 / 5xx 资源错误不会被过滤掉。
  const pageErrors = [];
  const consoleErrors = [];
  const NOISE = /401|PGRST301|Expected 3 parts in JWT|ERR_CONNECTION_RESET|ERR_ABORTED|ERR_CONNECTION_REFUSED/;
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 180)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push('console: ' + m.text().slice(0, 160));
  });

  // 通行密钥能力探测：默认「不支持」；需要时用 addInitScript 声明可用
  if (passkey) {
    // ⚠️ 只声明 PublicKeyCredential 不够：supabase-js 的 browserSupportsWebAuthn() 还要
    // navigator.credentials.create / get 是函数，而 headless Chrome 不提供这两个 →
    // 会在发请求之前就判定「浏览器不支持」，永远观察不到「运行态」。
    await page.addInitScript(() => {
      window.PublicKeyCredential = function () {};
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
      window.PublicKeyCredential.isConditionalMediationAvailable = async () => true;
      const c = { create: async () => { throw new Error('probe: no authenticator'); },
        get: async () => { throw new Error('probe: no authenticator'); } };
      try { Object.defineProperty(navigator, 'credentials', { value: c, configurable: true }); } catch { /* 已存在 */ }
      try { navigator.credentials.create = c.create; navigator.credentials.get = c.get; } catch { /* 只读 */ }
    });
  }

  // 拦截注册写入：GET（查重）放行做真实只读验证，POST 一律合成 —— 一个 path 一条 route
  await page.route('**/rest/v1/profiles**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, headers: { 'Access-Control-Expose-Headers': 'Content-Range' }, body: '[]' });
    }
    return route.continue();
  });
  await page.route('**/auth/v1/signup**', (route) => {
    const body = mockSignup === 'session'
      ? {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: '11111111-2222-4333-8444-555555555555', email: 'probe@example.com', identities: [{ id: 'i1' }] },
      }
      : { id: '11111111-2222-4333-8444-555555555555', email: 'probe@example.com', identities: [{ id: 'i1' }] };
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(body),
    });
  });
  // 通行密钥注册端点：延迟 900ms 再 500 —— 让「运行态」可观察，且失败原因确定
  await page.route('**/auth/v1/passkeys/**', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    return route.fulfill({
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify({ code: 500, msg: 'probe: forced passkey failure' }),
    });
  });

  await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.join-card', { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { context, page, pageErrors, consoleErrors };
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// ============================ 场景 1：结构 / 材质 / 可及性 ============================
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser);

  const s = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const nav = document.querySelector('.unified-nav');
    const card = document.querySelector('.join-card');
    return {
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
      navPos: nav ? getComputedStyle(nav).position : null,
      card: rect('.join-card'),
      heroLoaded: (() => { const i = document.querySelector('.join-hero'); return i ? i.naturalWidth : 0; })(),
      cardFilter: getComputedStyle(card).backdropFilter,
      cardBg: getComputedStyle(card).backgroundColor,
      steps: document.querySelectorAll('.join-step').length,
      dots: document.querySelectorAll('.join-dot').length,
      links: document.querySelectorAll('.join-link').length,
      activeSteps: document.querySelectorAll('.join-step.is-active').length,
      labels: [...document.querySelectorAll('.join-label')].map((l) => l.textContent.trim()),
      labelFor: document.querySelectorAll('.join-step label[for]').length,
      autocompletes: [...document.querySelectorAll('.join-step input:not([type=file]):not([type=checkbox]),.join-step select')].map((i) => i.getAttribute('autocomplete')),
      innerBlur: [...card.querySelectorAll('*')].filter((el) => {
        const f = getComputedStyle(el).backdropFilter;
        return f && f !== 'none';
      }).map((el) => (el.className || el.tagName).toString().slice(0, 26)),
      hiddenViolations: [...document.querySelectorAll('[hidden]')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => (el.id || el.className || el.tagName).toString().slice(0, 28)),
      passkeyBlock: !!document.querySelector('.join-fld[data-field="passkey"]'),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      savedTermsKey: window.localStorage.getItem('boh_agreed_to_terms'),
    };
  });

  check('卡片没被固定导航压住', s.navPos === 'fixed' && s.card.y >= s.navBottom, `nav.bottom=${s.navBottom} card.y=${s.card.y}`);
  check('外卡走项目液态玻璃（backdrop-filter 出 blur）', /blur\(/.test(s.cardFilter), s.cardFilter);
  check('one-active-blur-layer：子树内活跃模糊层为 0', s.innerBlur.length === 0, s.innerBlur.join(' , '));
  check('左栏侧边图真的加载了', s.heroLoaded > 0, `naturalWidth=${s.heroLoaded}`);
  check('3 个步骤 + 3 点 2 连线', s.steps === 3 && s.dots === 3 && s.links === 2, `${s.steps}/${s.dots}/${s.links}`);
  check('只有第 1 步处于 active', s.activeSteps === 1);
  check('每个字段都有常驻 label（通行密钥块出现时多一条）',
    s.labels.length === (s.passkeyBlock ? 6 : 5), s.labels.join(' | '));
  check('输入型字段 label[for] 关联', s.labelFor === 4, String(s.labelFor));
  check('每个输入都有 autocomplete', s.autocompletes.every((a) => a && a.length > 0), JSON.stringify(s.autocompletes));
  // 真机 Chrome 有平台认证器时能力探测为 true —— 这里只断言「块与能力一致」，隐藏逻辑放到场景 6
  const capReal = await page.evaluate(() => typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable === 'function');
  check('通行密钥块的可见性跟能力探测一致', s.passkeyBlock === capReal, `block=${s.passkeyBlock} capability=${capReal}`);
  check('带 hidden 的元素真的被隐藏（无更高特异性 display 压过）', s.hiddenViolations.length === 0, s.hiddenViolations.join(' , '));
  check('页面无横向溢出', s.horizontalOverflow === false);
  check('协议勾选不写 localStorage（不污染登录页）', s.savedTermsKey === null, String(s.savedTermsKey));

  // 焦点环：键盘用户必须看得见
  const focusRing = await page.evaluate(() => {
    const input = document.querySelector('#joinAccount');
    input.focus();
    const cs = getComputedStyle(input);
    return { shadow: cs.boxShadow, border: cs.borderColor, outline: cs.outlineStyle };
  });
  check('输入框有可见焦点环（不是 outline:none 干样子）',
    (focusRing.shadow && focusRing.shadow !== 'none') || (focusRing.outline && focusRing.outline !== 'none'),
    JSON.stringify(focusRing));

  // 对比度（浅色）
  const contrast = () => page.evaluate(() => {
    const parse = (c) => { const m = String(c).match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const blend = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const chan = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
    const surfaceOf = (el) => {
      const chain = []; let e = el;
      while (e) { chain.push(parse(getComputedStyle(e).backgroundColor)); e = e.parentElement; }
      chain.push({ r: 255, g: 255, b: 255, a: 1 });
      let acc = chain[chain.length - 1];
      for (let i = chain.length - 2; i >= 0; i--) acc = blend(chain[i], acc);
      return acc;
    };
    const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
    const pairs = [
      ['字段标签', '.join-label'], ['字段提示', '.join-hint'], ['步骤文本', '.join-progress-text'],
      ['侧栏标语', '.join-aside-copy p'], ['侧栏统计', '.join-stats i'], ['侧栏隐私', '.join-aside-privacy'],
      ['协议文本', '.join-terms-text'], ['协议小注', '.join-terms-note'], ['引导句', '.join-lead'],
      ['placeholder', '#joinAccount', true],
    ];
    return pairs.map(([name, sel, ph]) => {
      const el = document.querySelector(sel);
      if (!el) return { name, ratio: null };
      const cs = ph ? getComputedStyle(el, '::placeholder') : getComputedStyle(el);
      return { name, ratio: ratio(parse(cs.color), surfaceOf(el)) };
    });
  });
  const show = (list) => list.filter((p) => p.ratio !== null && p.ratio < 4.5).map((p) => `${p.name}=${p.ratio.toFixed(2)}`);
  const light = await contrast();
  check('浅色：所有正文 ≥ 4.5:1', show(light).length === 0, show(light).join(' , '));

  await page.screenshot({ path: `${OUT}/real-join-step1.png` });

  // 暗色跟随（页面不写暗色覆盖，全靠 --liquid-* 派生）
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(400);
  const darkCard = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.join-card'));
    return { bg: cs.backgroundColor, text: getComputedStyle(document.querySelector('.join-label')).color };
  });
  const dark = await contrast();
  const darkLow = show(dark);
  check('暗色跟随（卡片材质随 --liquid-* 翻转）',
    /rgba?\(2[0-9]|rgba?\(3[0-9]|rgba?\(4[0-9]/.test(darkCard.bg), `${themeBefore} → ${darkCard.bg} / ${darkCard.text}`);
  check('暗色：所有正文 ≥ 4.5:1', darkLow.length === 0, darkLow.join(' , '));
  await page.screenshot({ path: `${OUT}/real-join-dark.png` });
  await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); });

  check('场景 1 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  await context.close();
}

// ============================ 场景 2：交互 / 校验 / 实时查重 ============================
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser);

  // 空提交 → 字段级错误 + 摘要
  await page.click('.join-btn-primary');
  await page.waitForTimeout(500);
  const empty = await page.evaluate(() => ({
    alerts: document.querySelectorAll('.join-alerts li').length,
    accountMsg: document.querySelector('#joinMsgAccount').textContent.trim(),
    emailMsg: document.querySelector('#joinMsgEmail').textContent.trim(),
    shownMsg: [...document.querySelectorAll('.join-msg')].filter((el) => getComputedStyle(el).display !== 'none').length,
  }));
  check('空提交：字段级错误贴在字段下方', empty.accountMsg.length > 0 && empty.emailMsg.length > 0, JSON.stringify(empty));
  check('空提交：顶部摘要出现且两条', empty.alerts === 2, String(empty.alerts));
  check('错误不会回到第 1 步之外（仍停在第 1 步）',
    (await page.evaluate(() => document.querySelector('.join-progress-text').textContent.trim())) === '第 1 步 / 共 3 步');

  // 查重走真实 Supabase，等「不再是检查中」而不是拍一个固定毫秒（固定值在机器忙时会偶发失败）
  const waitAccountSettled = () => page.waitForFunction(() => {
    const el = document.querySelector('.join-state');
    return !!el && el.textContent.trim() !== '' && !el.textContent.includes('检查中');
  }, null, { timeout: 10000 });

  // ID 实时查重（真实只读）：'CELLINIA' 是线上真实存在的用户名
  await page.fill('#joinAccount', 'CELLINIA');
  await waitAccountSettled();
  const taken = await page.evaluate(() => ({
    state: document.querySelector('.join-state')?.textContent?.trim() || '',
    msg: document.querySelector('#joinMsgAccount').textContent.trim(),
    suggest: [...document.querySelectorAll('.join-suggest button')].map((b) => b.textContent.trim()),
  }));
  check('真实已占用的 ID → 不可用 + 给候选', taken.state === '不可用' && taken.suggest.length >= 2,
    `${taken.state} / ${taken.suggest.join(',『')}`);
  await page.screenshot({ path: `${OUT}/real-join-taken.png` });

  // 可用 ID → 标绿
  await page.fill('#joinAccount', 'probe_free_name_9527');
  await waitAccountSettled();
  const free = await page.evaluate(() => document.querySelector('.join-state')?.textContent?.trim() || '');
  check('可用 ID → 标绿「可用」', free === '可用', free);

  // 推进到第 2 步
  await page.fill('#joinEmail', 'probe@example.com');
  await page.click('.join-btn-primary');
  await page.waitForTimeout(700);
  const step2 = await page.evaluate(() => ({
    stepText: document.querySelector('.join-progress-text').textContent.trim(),
    asideTitle: document.querySelector('.join-aside-copy h1').textContent.trim(),
    passwordVisible: !!document.querySelector('#joinPassword'),
    inert1: document.querySelector('.join-step').inert,
  }));
  check('推进到第 2 步且侧栏文案跟随', step2.stepText === '第 2 步 / 共 3 步' && step2.asideTitle.includes('密码'),
    `${step2.stepText} / ${step2.asideTitle}`);
  check('第 1 步 inert（不可聚焦不可点）', step2.inert1 === true, String(step2.inert1));
  check('第 2 步出现「上一步」', await page.isVisible('.join-btn-ghost'));

  // 密码：7 位被拒、规则实时打勾、强度条
  await page.fill('#joinPassword', 'Abcdef1');
  await page.waitForTimeout(200);
  await page.click('.join-btn-primary');
  await page.waitForTimeout(500);
  const pw7 = await page.evaluate(() => ({
    msg: document.querySelector('#joinMsgPassword').textContent.trim(),
    step: document.querySelector('.join-progress-text').textContent.trim(),
  }));
  check('7 位密码被拒（下限已提到 8）', pw7.msg.includes('8 位') && pw7.step === '第 2 步 / 共 3 步', pw7.msg);
  await page.fill('#joinPassword', 'Abcdef12!');
  await page.waitForTimeout(300);
  const pwOk = await page.evaluate(() => ({
    level: document.querySelector('.join-meter').getAttribute('data-level'),
    levelText: document.querySelector('.join-meter-label').textContent.trim(),
    rules: document.querySelectorAll('.join-rules li').length,
    hit: document.querySelectorAll('.join-rules li.is-hit').length,
  }));
  check('强度条到 3 档 + 4 条规则全打勾',
    pwOk.level === '3' && pwOk.rules === 4 && pwOk.hit === 4, JSON.stringify(pwOk));

  // 显示密码开关
  await page.click('.join-toggle');
  await page.waitForTimeout(200);
  check('显示密码开关生效', (await page.getAttribute('#joinPassword', 'type')) === 'text');

  // 第 3 步
  await page.click('.join-btn-primary');
  await page.waitForTimeout(800);
  check('推进到第 3 步', (await page.textContent('.join-progress-text')).includes('第 3 步'));

  // 生日：月驱动天数（闰年口径，2 月 = 29）
  await page.selectOption('#joinBirthMonth', '2');
  await page.waitForTimeout(300);
  const feb = await page.$$eval('.join-birth select:nth-child(2) option', (o) => o.length - 1);
  check('birth 2 月 = 29 天（闰年口径，不再固定 31）', feb === 29, String(feb));
  await page.selectOption('#joinBirthMonth', '4');
  await page.waitForTimeout(300);
  const apr = await page.$$eval('.join-birth select:nth-child(2) option', (o) => o.length - 1);
  check('4 月 = 30 天', apr === 30, String(apr));

  // 协议未勾选 → 主按钮不禁用，点了才拦
  const disabledAttr = await page.getAttribute('.join-btn-primary', 'disabled');
  check('主按钮不用 disabled 挡人', disabledAttr === null, String(disabledAttr));
  await page.click('.join-btn-primary');
  await page.waitForTimeout(600);
  const gate = await page.evaluate(() => ({
    done: !!document.querySelector('.join-done'),
    invalid: document.querySelector('.join-terms').classList.contains('is-invalid'),
    note: document.querySelector('.join-terms-note').textContent.trim(),
    alerts: document.querySelector('.join-alerts')?.textContent?.trim() || '',
    focusAgree: document.activeElement === document.querySelector('.join-terms input'),
    savedTermsKey: window.localStorage.getItem('boh_agreed_to_terms'),
  }));
  check('未勾协议：被拦下 + 高亮 + 焦点 + 摘要', gate.done === false && gate.invalid === true
    && gate.note.includes('勾选协议') && gate.alerts.includes('协议') && gate.focusAgree === true,
    JSON.stringify(gate).slice(0, 140));
  check('勾选前不写 localStorage', gate.savedTermsKey === null, String(gate.savedTermsKey));

  // 勾选协议 → 勾选后也不写 localStorage
  await page.check('.join-terms input');
  await page.waitForTimeout(300);
  check('勾选后依然不写 localStorage', (await page.evaluate(() => window.localStorage.getItem('boh_agreed_to_terms'))) === null);

  // 提交（signup 已被 mock，不会真的建号）
  await page.click('.join-btn-primary');
  await page.waitForTimeout(2000);
  const done = await page.evaluate(() => ({
    exists: !!document.querySelector('.join-done'),
    title: document.querySelector('.join-done h2')?.textContent?.trim() || '',
    body: document.querySelector('.join-done p')?.textContent?.trim() || '',
    passkeyCard: !!document.querySelector('.join-passkey-card'),
  }));
  check('提交后进入完成页（直登分支）', done.exists === true && done.title === '注册成功', `${done.title} / ${done.body.slice(0, 30)}`);
  check('完成页带出注册的方块 ID', done.body.includes('probe_free_name_9527'), done.body.slice(0, 40));
  check('没勾通行密钥就不出现卡片', done.passkeyCard === false);
  await page.screenshot({ path: `${OUT}/real-join-done.png` });

  check('场景 2 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  await context.close();
}

// ============================ 场景 3：邮箱确认分支 ============================
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, { mockSignup: 'no-session' });
  await page.fill('#joinAccount', 'probe_pending_mail');
  await page.fill('#joinEmail', 'probe@example.com');
  await page.click('.join-btn-primary');
  await page.waitForTimeout(600);
  await page.fill('#joinPassword', 'Abcdef12!');
  await page.waitForTimeout(200);
  await page.click('.join-btn-primary');
  await page.waitForTimeout(700);
  await page.check('.join-terms input');
  await page.click('.join-btn-primary');
  await page.waitForTimeout(2000);
  const pend = await page.evaluate(() => ({
    title: document.querySelector('.join-done h2')?.textContent?.trim() || '',
    body: document.querySelector('.join-done p')?.textContent?.trim() || '',
    resendVisible: !!document.querySelector('.join-resend-note, .join-done-actions .join-btn-ghost'),
    passkeyCard: !!document.querySelector('.join-passkey-card'),
  }));
  check('无 session → 走「还差一步」分支', pend.title.includes('还差一步'), pend.title);
  check('无 session 分支带出邮箱', pend.body.includes('probe@example.com'), pend.body.slice(0, 36));
  check('无 session 不给通行密钥卡片（点了必然失败）', pend.passkeyCard === false);
  await page.screenshot({ path: `${OUT}/real-join-pending.png` });
  check('场景 3 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  await context.close();
}

// ============================ 场景 4：通行密钥（能力为真） ============================
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, { passkey: true });
  const block = await page.evaluate(() => {
    const el = document.querySelector('.join-fld[data-field="passkey"]');
    const sw = document.querySelector('.join-switch-input');
    return {
      exists: !!el,
      hidden: el ? !!el.hidden : null,
      role: sw ? sw.getAttribute('role') : null,
      describedBy: sw ? sw.getAttribute('aria-describedby') : null,
      checked: sw ? sw.checked : null,
    };
  });
  check('能力为真时出现通行密钥开关', block.exists === true, JSON.stringify(block));
  check('开关默认关闭（不主动弹系统验证窗）', block.checked === false, String(block.checked));
  check('开关是 role=switch + aria-describedby', block.role === 'switch' && block.describedBy === 'joinPasskeyHint',
    `${block.role} / ${block.describedBy}`);

  // 走完流程并勾选通行密钥
  await page.fill('#joinAccount', 'probe_passkey_user');
  await page.fill('#joinEmail', 'probe@example.com');
  await page.click('.join-btn-primary');
  await page.waitForTimeout(600);
  await page.fill('#joinPassword', 'Abcdef12!');
  await page.waitForTimeout(200);
  await page.click('.join-btn-primary');
  await page.waitForTimeout(800);
  await page.check('.join-switch-input');
  await page.waitForTimeout(200);
  await page.check('.join-terms input');
  await page.click('.join-btn-primary');
  await page.waitForTimeout(2200);

  const card = await page.evaluate(() => ({
    exists: !!document.querySelector('.join-passkey-card'),
    addText: document.querySelector('.join-passkey-actions .join-btn-primary')?.textContent?.trim() || '',
    skipExists: document.querySelectorAll('.join-passkey-actions .join-btn-ghost').length,
  }));
  check('已勾选 + 有 session → 完成页出现通行密钥卡片', card.exists === true, JSON.stringify(card));
  check('卡片有「添加」与「以后再说」两条出路', card.addText.includes('添加') && card.skipExists === 1, card.addText);

  // ⚠️ 已知覆盖缺口（不假装通过）：运行态（按钮禁用 +「请在设备上完成验证…」）在无头环境
  // **不可能**观察到 —— headless Chrome 没有平台认证器，supabase-js 会在真正 await 仪式之前
  // 就判定失败，running 与 error 落在同一个 tick 里，Vue 只渲染最终态。
  // 能观察到的四个态（卡片出现 → 失败可读 → 可重试 → 可跳过）都在下面断言了。
  // 运行态的真实性只能在真机 / HTTPS 域名下人工确认（本地 [::1] 的 rp_id 也不匹配）。
  await page.click('.join-passkey-actions .join-btn-primary');
  await page.waitForTimeout(1800);
  const failed = await page.evaluate(() => ({
    text: document.querySelector('.join-passkey-actions .join-btn-primary')?.textContent?.trim(),
    state: document.querySelector('.join-passkey-state')?.textContent?.trim() || '',
    skipDisabled: document.querySelector('.join-passkey-actions .join-btn-ghost')?.disabled,
  }));
  check('仪式失败给出可读原因且可重试',
    failed.text === '重试' && failed.state.length > 0 && failed.skipDisabled === false,
    `${failed.text} / ${failed.state.slice(0, 30)}`);
  await page.screenshot({ path: `${OUT}/real-join-passkey.png` });

  await page.click('.join-passkey-actions .join-btn-ghost');
  await page.waitForTimeout(300);
  check('「以后再说」静默收起卡片', (await page.evaluate(() => !document.querySelector('.join-passkey-card'))) === true);

  check('场景 4 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  await context.close();
}

// ============================ 场景 5：窄屏 ============================
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const m = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { y: Math.round(b.y), h: Math.round(b.height) };
    };
    const nav = document.querySelector('.unified-nav');
    const card = document.querySelector('.join-card');
    return {
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
      card: rect('.join-card'),
      cols: getComputedStyle(card).gridTemplateColumns.split(' ').length,
      terms: rect('.join-terms'),
      viewportH: window.innerHeight,
      scrollH: document.documentElement.scrollHeight,
      innerBlur: [...card.querySelectorAll('*')].filter((el) => {
        const f = getComputedStyle(el).backdropFilter;
        return f && f !== 'none';
      }).length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check('窄屏：卡片让位给导航（不重叠）', m.card.y >= m.navBottom, `nav=${m.navBottom} card.y=${m.card.y}`);
  check('窄屏：单列布局', m.cols === 1, String(m.cols));
  check('窄屏：协议条完整在视野内', m.terms.y + m.terms.h <= m.viewportH + 1, `terms.bottom=${m.terms.y + m.terms.h} vh=${m.viewportH}`);
  check('窄屏：页面不产生纵向滚动（内部滚）', m.scrollH <= m.viewportH + 1, `${m.scrollH} vs ${m.viewportH}`);
  check('窄屏：内层不叠模糊（只有外卡一层）', m.innerBlur === 0, String(m.innerBlur));
  check('窄屏：无横向溢出', m.overflowX === false);
  await page.screenshot({ path: `${OUT}/real-join-mobile.png` });
  check('场景 5 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  await context.close();
}

// ============================ 场景 6：显式「本机不支持通行密钥」 ============================
{
  const context = await browser.newContext(UA_DESKTOP);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  // 抹掉平台认证器能力（等价于微信/QQ 内置浏览器：有 PublicKeyCredential 但没有平台认证器）
  await page.addInitScript(() => {
    window.PublicKeyCredential = function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  });
  await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.join-card', { timeout: 25000 });
  await page.waitForTimeout(1500);
  // 走到第 3 步才有那个块
  const gone = await page.evaluate(() => document.querySelectorAll('.join-step').length);
  check('场景 6：仍然是 3 步（页面未受能力探测影响）', gone === 3, String(gone));
  const block = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.join-fld[data-field="passkey"]')];
    return { count: els.length };
  });
  check('场景 6：平台认证器不可用时通行密钥整块隐藏（不是置灰）', block.count === 0, JSON.stringify(block));
  const labels = await page.evaluate(() => [...document.querySelectorAll('.join-label')].map((l) => l.textContent.trim()));
  check('场景 6：字段标签回到 5 个', labels.length === 5, labels.join(' | '));
  check('场景 6 无 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
