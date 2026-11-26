import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 注册页（/#/join）探针的共享引导层。
 *
 * 为什么要抽出来：七屏「邮箱优先」流程有 6 个可交互步骤 + 1 个完成态，
 * 每个场景都要「从第 ① 屏走到第 N 屏」——如果每个探针各写一份，
 * 流程一改就要改四处（这正是 2026-11-25 改版后 4 个探针同时失效的原因）。
 *
 * ⚠️ 绝不真实注册：所有会写库的端点都被拦成合成响应。
 *   · POST /auth/v1/otp        —— 发码（会真发信、真建 auth.users）
 *   · POST /auth/v1/verify     —— 验证码（会真建会话）
 *   · PATCH /rest/v1/profiles  —— 写 ID / 生日 / signup_completed_at
 *   · PUT  /auth/v1/user       —— 设密码
 *   · POST /auth/v1/passkeys/** —— 通行密钥
 *   · POST /storage/v1/object/** —— 头像
 *   只有 **GET** 被放行（真实 ID 查重、真实 profile 读取），因为读不产生副作用，
 *   而且「ID 已被占用」这个文案必须靠真实数据才能验。
 */

export const BASE = process.env.JOIN_BASE || 'http://localhost:5173';
export const OUT = process.env.SHOT_DIR || 'debug-screenshots';

/**
 * anon key：查重要用**匿名身份**打真库。
 *
 * 为什么不能让请求带着探针自己造的假 JWT：GoTrue 的 JWT 有签名，
 * profiles 的 RLS 会先验签名再放行 —— 假 token 一律 401（PGRST301
 * "Expected 3 parts in JWT"），于是「ID 已被占用」永远查不出来，
 * 表现是**任何名字都显示「可用」**（假绿）。2026-11-25 实测踩到。
 *
 * 真实用户在那一刻拿的是真 JWT，读到的行与 anon 读到的相同
 * （profiles 的 username 本来就必须对外可见，用于查重与主页），
 * 所以用 anon 替身不改变被验的语义，只是绕开假 token 的签名问题。
 */
/** 读 .env 里的某个 VITE_* 变量 —— node 不会自动加载 .env，得自己读 */
const readEnvValue = (name) => {
  if (process.env[name]) return process.env[name].trim();
  try {
    const env = fs.readFileSync(path.resolve('.env'), 'utf8');
    const m = env.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
};

const readAnonKey = () => readEnvValue('VITE_SUPABASE_ANON_KEY');
const ANON_KEY = readAnonKey();
const SUPABASE_URL = readEnvValue('VITE_SUPABASE_URL').replace(/\/+$/, '');

/**
 * 把真实 ALTCHA 挑战解出来，得到一份**合法签名**的 payload。
 *
 * 为什么必须真解而不是塞假 payload：`completeIdentity` 里有一道硬闸
 *   `if (altchaEnabled && altchaState !== 'verified') return`
 * 塞假 payload 只会让 state 停在 unverified，第 ③ 屏永远过不去。
 * 而这道闸是**真实存在**的反滥用设计，不该为了好测就砍掉 ——
 * 所以探针必须走完整条仪式：拉挑战 → 暴力出 number → 拼 payload。
 *
 * 算法（ALTCHA v1）：challenge === SHA256(salt + number)，number ∈ [0, maxnumber]。
 * maxnumber 是 75000，暴力枚举在 Node 里约 100~300ms —— 完全可接受。
 *
 * @returns {Promise<{algorithm:string,challenge:string,number:number,salt:string,signature:string}|null>}
 */
const solveAltcha = async () => {
  const base = SUPABASE_URL;
  if (!base || !ANON_KEY) return null;
  try {
    const res = await fetch(`${base}/functions/v1/altcha-challenge?scope=signup`, {
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return null;
    const c = await res.json();
    if (!c?.challenge || !c?.salt) return null;
    const max = Number(c.maxnumber) || 100000;
    for (let n = 0; n <= max; n += 1) {
      const h = createHash('sha256')
        .update(c.salt + n)
        .digest('hex');
      if (h === c.challenge) {
        return {
          algorithm: c.algorithm || 'SHA-256',
          challenge: c.challenge,
          number: n,
          salt: c.salt,
          signature: c.signature,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const CHROME_ARGS = [
  '--no-proxy-server',
  '--proxy-server=direct://',
  '--proxy-bypass-list=*',
];

export const DESKTOP = { viewport: { width: 1440, height: 960 } };
export const MOBILE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};
export const LANDSCAPE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true };

/** 探针用假账号 —— 与线上真实用户不可能重名 */
/**
 * 「已在库里」的邮箱样本 —— 用来验证第 ① 屏的「已注册」判定。
 *
 * 为什么不写死一个值：库里真实存在哪些邮箱会变（测试账号会被清理），
 * 写死一个就会在某个时点悄悄失效（探针还以为在测，其实测的是「不存在」分支）。
 * 所以启动时打一次真库现取；取不到就退化成 .invalid 地址 —— 那种地址
 * 一定不存在，于是「已注册」这条断言会**明确失败**，而不是假绿。
 */
const fetchRegisteredEmail = async () => {
  const base = (process.env.VITE_SUPABASE_URL || readEnvValue('VITE_SUPABASE_URL') || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base || !ANON_KEY) return '';
  const sample = '2190444167@qq.com';
  try {
    const res = await fetch(`${base}/rest/v1/rpc/is_email_registered`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: sample }),
    });
    const body = (await res.text()).trim();
    // 只有确认「这个样本确实存在」才把它当样本用
    return body === 'true' ? sample : '';
  } catch {
    return '';
  }
};

export const REAL_REGISTERED_EMAIL =
  (await fetchRegisteredEmail()) || 'known-absent@example.invalid';

export const FAKE = {
  email: 'probe.join.flow@example.invalid',
  otp: '12345678',
  account: 'probe_flow_name',
  password: 'Abcdef12!',
  userId: '11111111-2222-4333-8444-555555555555',
};

export const ensureOut = () => fs.mkdirSync(OUT, { recursive: true });

/**
 * 建立一条「什么都没发生过」的注册页上下文。
 *
 * @param {object} browser
 * @param {object} opts
 * @param {'incomplete'|'completed'|'nosession'|'error'} opts.signupState
 *        第 ② 屏验证通过后 checkSignupState 看到的状态：
 *          incomplete —— signup_completed_at 为 null（新号 / 半成品）⇒ 进第 ③ 屏
 *          completed  —— 非 null（老用户）⇒ 被挡回登录
 *          nosession  —— getUser 拿不到人 ⇒ 视作未建完（fail-open）
 *          error      —— profiles 查询 500 ⇒ 同样 fail-open
 * @param {boolean} opts.passkey 是否声明「本机支持通行密钥」
 * @param {number}  opts.passkeyDelay 通行密钥端点延迟（毫秒），用于观察 running 态
 * @param {{username:string,signup_completed_at:string|null}|null} opts.profileRow
 *        第 ③ 屏 checkSignupState 读到的 profile 行
 */
export async function boot(browser, opts = {}) {
  const {
    signupState = 'incomplete',
    passkey = false,
    passkeyDelay = 900,
    profileRow = null,
    journey = null,
    altcha = false,
    preview = false,
    ...ctxOpts
  } = opts;

  const context = await browser.newContext({ ...DESKTOP, ...ctxOpts });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  // 已知噪声（都不是页面缺陷）：
  //  · mock 出来的假 token 让 app 级轮询拿 401（PGRST301 / JWT 解析失败）
  //  · Vite dev server 在探针压力下的传输层 reset/abort
  //  · 被 route 拦下后 abort 掉的请求
  const NOISE =
    /401|403|PGRST301|Expected 3 parts in JWT|JWT expired|ERR_CONNECTION_RESET|ERR_ABORTED|ERR_CONNECTION_REFUSED|Failed to fetch|NetworkError/i;
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text()))
      consoleErrors.push('console: ' + m.text().slice(0, 180));
  });

  if (passkey) {
    // ⚠️ 只声明 PublicKeyCredential 不够：supabase-js 的 browserSupportsWebAuthn()
    //    还要求 navigator.credentials.create/get 是函数，而 headless Chrome 不提供
    //    ⇒ 会在发请求之前就判定「浏览器不支持」，永远观察不到运行态。
    await page.addInitScript(() => {
      window.PublicKeyCredential = function () {};
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
      window.PublicKeyCredential.isConditionalMediationAvailable = async () => true;
      const c = {
        create: async () => {
          throw new Error('probe: no authenticator');
        },
        get: async () => {
          throw new Error('probe: no authenticator');
        },
      };
      try {
        Object.defineProperty(navigator, 'credentials', { value: c, configurable: true });
      } catch {
        /* 已存在 */
      }
      try {
        navigator.credentials.create = c.create;
        navigator.credentials.get = c.get;
      } catch {
        /* 只读 */
      }
    });
  }

  // ── 写操作：全部合成 ────────────────────────────────────────────────
  // 🔴 顺序即是优先级：Playwright **后注册的 route 先执行**（同名 path 后者短路前者）。
  //    所以「兜底」必须先注册，具体规则后注册 —— 反过来会让兜底吃掉专门的 mock。
  //    2026-11-25 踩过：兜底 `**/rest/v1/**` 写在 profiles 之后，
  //    于是 checkSignupState 的查询真的打到了线上库、拿假 JWT 得 401 ⇒
  //    探针把「老用户被挡回」看成「fail-open 放行」，场景 3 假红。

  // 兜底：其它表的 GET 放行（读无副作用），写操作一律合成
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'GET' || method === 'HEAD') return route.continue();
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Expose-Headers': 'Content-Range',
      },
      body: '[]',
    });
  });

  await page.route('**/auth/v1/otp**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Expose-Headers': 'Content-Range',
      },
      body: '{}',
    });
  });

  await page.route('**/auth/v1/verify**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    // verify 成功后 supabase-js 直接把 session 存进来，后续 getUser 走下面的 mock
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Expose-Headers': 'Content-Range',
      },
      body: JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: FAKE.userId,
          aud: 'authenticated',
          email: FAKE.email,
          created_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        },
      }),
    });
  });

  await page.route('**/auth/v1/user**', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (signupState === 'nosession') {
        return route.fulfill({
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 401, msg: 'probe: no session' }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: FAKE.userId,
          aud: 'authenticated',
          email: FAKE.email,
          created_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        }),
      });
    }
    // PUT —— 设密码
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: FAKE.userId,
        aud: 'authenticated',
        email: FAKE.email,
        created_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
      }),
    });
  });

  /* 只读 RPC 放行到真库。
     ⚠️ 必须写在**兜底之后**：Playwright 的路由是后注册者优先（最后注册的最先
     匹配并短路），写在兜底之前等于没写。2026-11-26 实测两次才确认 ——
     请求确实发出去了，但响应是兜底合成的 `[]`，前端拿到 `[] !== true`
     ⇒ registered:false ⇒「已注册邮箱」那条断言假红（页面显示「可用」）。
     本页唯一的「读语义 POST」就是 is_email_registered。 */
  await page.route('**/rest/v1/rpc/is_email_registered**', (route) => route.continue());

  await page.route('**/auth/v1/passkeys/**', async (route) => {
    await new Promise((r) => setTimeout(r, passkeyDelay));
    return route.fulfill({
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Expose-Headers': 'Content-Range',
      },
      body: JSON.stringify({ code: 500, msg: 'probe: forced passkey failure' }),
    });
  });

  // ② profiles：GET 分两种 —— 自查询（checkSignupState，按 id=eq.<uuid>）走 mock，
  //    其它（isUsernameAvailable 的 ilike 查重）放行到真库（只读，用来验「已被占用」）
  await page.route('**/rest/v1/profiles**', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      const idFilter = url.searchParams.get('id') || '';
      // 不是「查自己」⇒ 是 ID 查重（username=ilike.…）：换成 anon 身份打真库。
      // 见 ANON_KEY 注释 —— 假 JWT 会被 RLS 401 掉，那样任何名字都显示「可用」。
      if (!idFilter.startsWith('eq.')) {
        if (!ANON_KEY) return route.continue();
        const headers = {
          ...route.request().headers(),
          apikey: ANON_KEY,
          authorization: `Bearer ${ANON_KEY}`,
        };
        return route.continue({ headers });
      }

      if (signupState === 'error') {
        return route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: '500', message: 'probe: profiles read failure' }),
        });
      }
      const row =
        profileRow ||
        (signupState === 'completed'
          ? { signup_completed_at: new Date().toISOString(), username: 'probe_existing' }
          : { signup_completed_at: null, username: 'probe_flow_name' });
      // maybeSingle() 用 Accept: vnd.pgrst.object+json 要对象；普通 select 要数组
      const accept = route.request().headers().accept || '';
      const body = accept.includes('vnd.pgrst.object')
        ? JSON.stringify(row)
        : JSON.stringify([row]);
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Expose-Headers': 'Content-Range',
        },
        body,
      });
    }
    // PATCH / POST / DELETE —— 一律合成成功
    return route.fulfill({
      status: method === 'POST' ? 201 : 204,
      headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
      body: method === 'POST' ? '[]' : '',
    });
  });

  await page.route('**/storage/v1/object/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Key: 'probe/avatar.png' }),
    });
  });

  // 头像公开 URL：别去真网络拉，免得多等几秒（后注册 ⇒ 优先级高于上一条）
  await page.route('**/storage/v1/object/public/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );

  // ALTCHA：需要过第 ③ 屏的场景要先拿到一份合法 payload（得在页面脚本之前注入）
  if (altcha) await injectAltcha(page);

  // ?preview=1：DEV 下的管理员跳步预览条（ADMIN_PREVIEW_FORCED）。
  // 注意 hash 路由的查询串在 # 里面 —— 写成 `/?preview=1#/join` 也能被
  // hasPreviewFlag 兜住，但用标准位置更不容易让人误以为是 hack。
  await page.goto(`${BASE}/#/join${preview ? '?preview=1' : ''}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForSelector('.join-card', { timeout: 25000 });
  await page.waitForTimeout(1200);

  // Vite 编译错误遮罩会盖住整页（可能来自并行会话正在改的别的文件），
  // 截图前关掉，否则取证图全是红框。
  await page.evaluate(() => {
    document
      .querySelector('vite-error-overlay')
      ?.shadowRoot?.querySelector('.window')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  if (journey) await runJourney(page, journey);

  return { context, page, pageErrors, consoleErrors };
}

/* ──────────────────────── 流程驱动 ──────────────────────── */

/**
 * 读当前所在的步号（不依赖内部 ref）。
 *
 * ⚠️ 读的是 `data-step` 而**不是**可见文本。2026-11-26 把进度文案从
 * 「第 1 步 / 共 6 步」收成「1/6」之后，原来那条 `第\s*(\d+)\s*步`
 * 正则就一条都匹配不上了 —— 整套 waitStep 会静默失败（返回 null，
 * 而 null !== target 于是每次都等到超时）。
 * 现在文案与语义分开：可见的部分随便改，探针认 attribute。
 */
export const readStep = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.join-progress-text');
    const n = Number(el?.dataset?.step);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

/** 等步号变成 n（用轮询而不是固定 sleep，机器忙时会偶发失败） */
export const waitStep = async (page, n, timeout = 20000) => {
  await page.waitForFunction(
    (target) => {
      const el = document.querySelector('.join-progress-text');
      return Number(el?.dataset?.step) === target;
    },
    n,
    { timeout },
  );
};

/** 等欢迎页出现（完成态不是第 7 步，没有进度文本可等） */
export const waitDone = (page, timeout = 20000) => page.waitForSelector('.join-done', { timeout });

/** 点完之后等落到某一步；超时返回 false 而不是抛错（好让断言带上现场） */
const settle = async (page, target, timeout = 20000) => {
  try {
    await waitStep(page, target, timeout);
    return true;
  } catch {
    return false;
  }
};

/** 点主按钮（唯一样式化路径，避免各场景写不同选择器） */
export const clickPrimary = async (page) => {
  await page.click('.join-btn-primary');
};

/** 填一个字段并等它稳定（React/Vue 的 v-model 需要一个 tick 才反映到内部状态） */
export const fill = async (page, selector, value) => {
  await page.fill(selector, value);
  await page.waitForTimeout(120);
};

/**
 * 第 ① 屏 → 第 ② 屏：邮箱 + 协议 + 发码。
 * 返回是否成功进入第 ② 屏（失败时由调用方自己断言 alert 文案）。
 */
export async function submitEmailStep(page, email = FAKE.email) {
  await fill(page, '#joinEmail', email);
  // 协议是第 ① 屏内的必选项（不是卡底常驻条）
  const box = await page.$('.join-consent input[type="checkbox"]');
  if (box && !(await box.isChecked())) await box.check();
  await clickPrimary(page);
  return settle(page, 2);
}

/** 第 ② 屏 → 第 ③ 屏：填满 8 位验证码并提交 */
export async function submitOtpStep(page, code = FAKE.otp) {
  // OtpCodeInput 是「一个真输入框 + 视觉分格」，所以要往 .otp-native 里敲
  const native = await page.$('.otp-native');
  if (!native) throw new Error('probe: .otp-native 不存在，验证码组件未渲染');
  await native.fill(code);
  await page.waitForTimeout(150);
  await clickPrimary(page);
  return settle(page, 3);
}

/** 第 ③ 屏 → 第 ④ 屏：BOH ID + 密码 */
export async function submitIdentityStep(
  page,
  { account = FAKE.account, password = FAKE.password } = {},
) {
  await fill(page, '#joinAccount', account);
  await fill(page, '#joinPassword', password);
  // 等 ID 查重（真实 GET）落定，否则提交时 fieldMsg.account 还空着会被判「没填」。
  // ⚠️ 必须限定 [data-field="account"]：邮箱字段在「已填且无错」时也会渲染
  // 一个 `.join-state`「可用」徽标，裸选择器会先命中它 —— 那就永远等不到
  // 「检查中」消失的时刻（邮箱徽标一直是「可用」），或者反过来提前放行。
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('.join-fld[data-field="account"] .join-state');
        return !!el && el.textContent.trim() !== '' && !el.textContent.includes('检查中');
      },
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await clickPrimary(page);
  return settle(page, 4);
}

/**
 * 过关人机验证（ALTCHA）。
 *
 * 线上 `.env` 里 `VITE_ALTCHA_ENABLED=true`，所以第 ③ 屏有一道硬闸：
 * 没 verified 就点「创建账户」会被拦（`人机验证：请先完成…`）。
 * 探针不能靠「关掉这道闸」来绕过 —— 那会让线上真正生效的反滥用机制在测试里消失。
 *
 * 做法：先在 Node 侧把真实挑战解出来（见 solveAltcha），再把结果作为
 * `statechange` 事件派发给 `<altcha-widget>`。事件通路正是组件自己用的那一条
 * （AltchaWidget.handleStateChange → emit → Join.handleAltchaStateChange），
 * 所以走完之后前端的判断与真解一次完全一致。
 *
 * @returns {Promise<boolean>} 是否成功置为 verified
 */
export async function passAltcha(page) {
  const idle = await page.$('.join-altcha-idle');
  if (idle) {
    await idle.click(); // 挂载组件（默认 auto="off"，点了才解题）
    await page.waitForTimeout(400);
  }
  const ok = await page.evaluate(async () => {
    const w = document.querySelector('altcha-widget');
    if (!w) return false;
    const payload = window.__JOIN_PROBE_ALTCHA__;
    if (!payload) return false;
    w.dispatchEvent(
      new CustomEvent('statechange', {
        detail: { state: 'verified', payload: JSON.stringify(payload) },
      }),
    );
    return true;
  });
  await page.waitForTimeout(200);
  return ok && (await page.textContent('.join-altcha-status').catch(() => '')).includes('已完成');
}

/** 把解出来的 payload 提前注入页面（必须在 passAltcha 之前调用） */
export const injectAltcha = async (page) => {
  const payload = await solveAltcha();
  await page.addInitScript((p) => {
    window.__JOIN_PROBE_ALTCHA__ = p;
  }, payload);
  return payload;
};

/** 第 ④ 屏 → 第 ⑤ 屏：生日（可跳过 → 直接进完成页） */
export async function submitBirthStep(page, { skip = true, month = '', day = '' } = {}) {
  if (skip) {
    // ⚠️ 不能按 nth-of-type 取「跳过」：第 ④ 屏的按钮顺序是
    //    上一步(ghost) / 主按钮(primary) / 跳过(ghost)，nth-of-type(2) 是主按钮。
    //    按可见文案取，改版后顺序变了也不会点错人。
    await clickByText(page, '.join-actions button', '跳过');
    await page.waitForTimeout(800);
    return;
  }
  if (month) await page.selectOption('#joinBirthMonth', String(month));
  await page.waitForTimeout(200);
  if (day) await page.selectOption('.join-birth select:nth-of-type(2)', String(day));
  await clickPrimary(page);
  await page.waitForTimeout(800);
}

/** 按可见文案点按钮 —— 比 nth-of-type 稳，改版改顺序不会点错 */
export const clickByText = async (page, selector, text) => {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = (await h.textContent()) || '';
    if (t.trim().includes(text)) {
      await h.click();
      return true;
    }
  }
  throw new Error(`probe: 找不到文案含「${text}」的 ${selector}`);
};

/** 一路走到第 n 屏（默认走到第 ④ 屏为止，因为 ③ 之后没有真实副作用） */
export async function walkTo(page, target) {
  if (target >= 2 && (await readStep(page)) === 1) await submitEmailStep(page);
  if (target >= 3 && (await readStep(page)) === 2) await submitOtpStep(page);
  if (target >= 4 && (await readStep(page)) === 3) await submitIdentityStep(page);
  if (target >= 5 && (await readStep(page)) === 4) await submitBirthStep(page, { skip: false });
  if (target >= 6 && (await readStep(page)) === 5) await clickPrimary(page);
}

export const runJourney = async (page, journey) => {
  for (const step of journey) {
    if (step === 'email') await submitEmailStep(page);
    else if (step === 'otp') await submitOtpStep(page);
    else if (step === 'identity') await submitIdentityStep(page);
    else if (step === 'birth') await submitBirthStep(page, { skip: false });
    else if (step === 'birth-skip') await submitBirthStep(page, { skip: true });
    else if (step === 'next') {
      await clickPrimary(page);
      await page.waitForTimeout(800);
    } else throw new Error(`probe: 未知的 journey 步骤 ${step}`);
  }
};

/* ──────────────────────── 断言与取证 ──────────────────────── */

export const makeChecker = () => {
  const results = [];
  const check = (name, pass, detail = '') => {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  };
  const summary = () => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} PASS`);
    return { results, failed };
  };
  return { check, summary };
};

/**
 * 页面内「横向溢出」判定。
 * 只报**真的溢出**的元素：宽高为 0 的（隐藏节点）与 position:fixed 的浮层
 * 不算 —— 后者靠 transform 移出视口是有意为之。
 *
 * ⚠️ 这些 probe 函数是 `page.evaluate` 的入参，会被 toString() 序列化后
 * 送到浏览器里执行 —— 所以**不能引用模块作用域的任何变量**，且必须是
 * 单一函数表达式（不能拆成 helper + 调用）。
 */
export const overflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  /**
   * 「真的溢出了吗」不能只看 getBoundingClientRect()。
   *
   * 原因：getBoundingClientRect 返回的是 **transform 之后**的视觉盒，
   * 而被祖级 `overflow: hidden` 裁掉的部分仍然算在这个盒子里。
   * 2026-11-26 实测踩到：注册页 6 个非激活屏各自 translate(±24px) 停在
   * 「待入场」位置，rect 报出 right=394 > vw=390 —— 看着像溢出，
   * 但 documentElement.scrollWidth 仍是 390，页面根本滚不动。
   * 那条报错是**裁剪**造成的视觉边界，不是布局溢出。
   *
   * 正确判据（两层）：
   *   ① 容器级：documentElement.scrollWidth > clientWidth ⇒ 真的能横向滚
   *   ② 元素级：只追究「有自己滚动能力」的容器（overflow-x 允许滚动）——
   *      单纯被祖级裁掉的元素不算违规。
   */
  const reallyScrolls = document.documentElement.scrollWidth > vw + 1;

  const bad = [];
  document.querySelectorAll('.join-page *').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    // 只关心「它自己就能横向滚」的元素 —— 那才会真的产生滚动条
    const selfScrollsX =
      ['auto', 'scroll'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (!selfScrollsX) return;
    bad.push({
      cls: (el.className || el.tagName).toString().slice(0, 48),
      left: Math.round(b.left),
      right: Math.round(b.right),
      w: Math.round(b.width),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    });
  });
  return {
    vw,
    scrollWidth: document.documentElement.scrollWidth,
    reallyScrolls,
    bad: bad.slice(0, 10),
  };
};

/**
 * 对比度（AA）：沿祖先链合成实际背景色，逐对算比值。
 * 只查有意义的正文类，不查装饰性发丝线。
 *
 * 颜色一律交给浏览器解析（canvas 1×1 读回像素），**不自己写正则拆色值**。
 * 理由：本项目大量使用 `color-mix(in srgb, …)` 与 `oklch(…)`，它们的
 * computed value 形如 `color(srgb 0.546 …)` / `oklch(0.922 0 0)` ——
 * 分量是 0–1 或「亮度+色度」，按 0–255 拆会把 `oklch(0.922 0 0)`
 * （纯灰）读成 rgb(235,0,0)（纯红）。2026-11-25 实测踩过两次：
 * 一次把深色底上的浅灰字算成 1.23:1，一次把灰色描边报成「彩色元素」。
 * canvas 的 fillStyle 走的是浏览器的色彩管理，任何色域都能落到 RGBA。
 *
 * @param {Array<[string,string,string?]>} pairs [名称, 选择器, 伪元素?]
 */
export const contrastProbe = (pairs) => {
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const toRGB = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const blend = (f, b) => ({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  });
  const chan = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const surfaceOf = (el) => {
    const chain = [];
    let e = el;
    while (e) {
      chain.push(toRGB(getComputedStyle(e).backgroundColor));
      e = e.parentElement;
    }
    // 链底兜一层白：body 之外没有更多背景可依
    chain.push({ r: 255, g: 255, b: 255, a: 1 });
    let acc = chain[chain.length - 1];
    for (let i = chain.length - 2; i >= 0; i--) acc = blend(chain[i], acc);
    return acc;
  };
  const ratio = (fg, bg) => {
    const a = lum(fg);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  return pairs.map(([name, sel, pseudo]) => {
    const el = document.querySelector(sel);
    if (!el) return { name, ratio: null };
    const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
    return { name, ratio: ratio(toRGB(cs.color), surfaceOf(el)) };
  });
};

/** 统计「彩色元素」：黑白页面上任何非灰的实色都算违规 */
export const chromaticProbe = () => {
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const toRGB = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const isChromatic = (c) => {
    if (!c || c.a === 0) return false;
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    return max - min > 6; // 6 是「肉眼几乎看不出」的容差
  };
  const hits = [];
  document.querySelectorAll('.join-page, .join-page *').forEach((el) => {
    const cs = getComputedStyle(el);
    const props = [
      ['color', cs.color],
      ['background-color', cs.backgroundColor],
      ['border-top-color', cs.borderTopColor],
      ['border-bottom-color', cs.borderBottomColor],
      ['border-left-color', cs.borderLeftColor],
      ['border-right-color', cs.borderRightColor],
    ];
    for (const [prop, val] of props) {
      const c = toRGB(val);
      if (!c || c.a === 0) continue;
      if (isChromatic(c)) {
        hits.push({ cls: (el.className || el.tagName).toString().slice(0, 40), prop, val });
        break;
      }
    }
  });
  return { count: hits.length, hits: hits.slice(0, 12) };
};
