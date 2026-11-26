import { chromium } from 'playwright';
import {
  BASE,
  OUT,
  CHROME_ARGS,
  DESKTOP,
  MOBILE,
  LANDSCAPE,
  FAKE,
  REAL_REGISTERED_EMAIL,
  ensureOut,
  boot,
  readStep,
  waitStep,
  clickPrimary,
  clickByText,
  fill,
  submitEmailStep,
  submitOtpStep,
  submitIdentityStep,
  passAltcha,
  makeChecker,
  overflowProbe,
  contrastProbe,
  chromaticProbe,
} from '../lib/join-probe.mjs';

/**
 * 探针：真实注册页（src/views/Join/index.vue，路由 /#/join）
 *
 * 2026-11-25 七屏「邮箱优先」改版后重写。旧版断言围绕「三步 + 左栏」，
 * 改版删掉了左栏（.join-hero / .join-aside-copy / .join-stats / .join-terms）
 * 并把流程拆成 6 步 + 完成态，所以整份探针不再是「补丁式改选择器」。
 *
 * 用法：node scripts/probes/probe-join-real.mjs
 *   需要 dev server 在 :5173（npm run dev）
 *
 * ⚠️ 绝不真实注册：/auth/v1/otp、/auth/v1/verify、profiles 写入、
 *    /auth/v1/user 的 PUT 全部拦成合成响应（见 lib/join-probe.mjs）。
 *    唯一放行的是 **GET**：真实 ID 查重必须打真库，否则「已被占用」
 *    这条文案永远验不到。
 *
 * 🔴 两种形态必须分开验：这一页有**两套外观**，由 orientation 决定 ——
 *    · 竖屏（含竖持平板）：纯极简，卡片无背景/无描边/无圆角/无阴影；
 *    · 横屏（含所有桌面显示器）：从导航岛长出来的下半岛，
 *      有发丝线、有投影、只留下面两角。
 *    只测一种会漏掉另一种 —— 而桌面永远是 landscape。
 */
const { check, summary } = makeChecker();
ensureOut();

const PORTRAIT_DESKTOP = { viewport: { width: 1024, height: 1366 } };

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });

/* ══════════════════ 场景 1：结构 / 极简纪律（竖屏形态）══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, PORTRAIT_DESKTOP);

  const s = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    };
    const nav = document.querySelector('.unified-nav');
    const card = document.querySelector('.join-card');
    return {
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
      navPos: nav ? getComputedStyle(nav).position : null,
      card: rect('.join-card'),
      steps: document.querySelectorAll('.join-step').length,
      dots: document.querySelectorAll('.join-dot').length,
      // 旧版有「步骤间连线」(.join-link)，新版刻意没有：细线本身就是量尺
      links: document.querySelectorAll('.join-link').length,
      activeSteps: document.querySelectorAll('.join-step.is-active').length,
      inertCount: [...document.querySelectorAll('.join-step')].filter((el) => el.inert).length,
      labels: [...document.querySelectorAll('.join-label')].map((l) => l.textContent.trim()),
      labelFor: document.querySelectorAll('.join-step label[for]').length,
      autocompletes: [
        ...document.querySelectorAll(
          '.join-step input:not([type=file]):not([type=checkbox]), .join-step select',
        ),
      ].map((i) => i.getAttribute('autocomplete')),
      // 极简纪律：整页不能有图片 / 玻璃 / 阴影
      imgs: document.querySelectorAll('.join-page img').length,
      heroExists: Boolean(document.querySelector('.join-hero')),
      cardFilter: card ? getComputedStyle(card).backdropFilter : null,
      cardShadow: card ? getComputedStyle(card).boxShadow : null,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      cardRadius: card ? getComputedStyle(card).borderTopLeftRadius : null,
      innerBlur: card
        ? [...card.querySelectorAll('*')].filter((el) => {
            const f = getComputedStyle(el).backdropFilter;
            return f && f !== 'none';
          }).length
        : 0,
      hiddenViolations: [...document.querySelectorAll('[hidden]')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => (el.id || el.className || el.tagName).toString().slice(0, 28)),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      savedTermsKey: window.localStorage.getItem('boh_agreed_to_terms'),
      title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
      // 读 data-step 而不是文本：「1/6」是给人看的，语义在 attribute 上
      progress: (() => {
        const el = document.querySelector('.join-progress-text');
        return el ? `${el.dataset.step}/${el.dataset.total}` : '';
      })(),
      // 协议勾选行：可点区靠 min-height 撑到 44px。
      // 2026-11-26 起说明文字已删，负外边距只留上方 —— 若有人把下沿也拉进去，
      // 这 12px 会落到 .join-viewport（overflow:hidden）之外被裁掉。
      consentRowH: (() => {
        const el = document.querySelector('.join-consent-row');
        return el ? Math.round(el.getBoundingClientRect().height) : null;
      })(),
      // 放行规则与「文案瘦身」的守卫：没填对/没勾协议 ⇒ 按钮禁用；
      // 汇总卡（.join-alerts）与协议说明文字（.join-consent-note）不许回潮。
      primaryDisabled: document.querySelector('.join-btn-primary')?.disabled ?? null,
      alertCards: document.querySelectorAll('.join-alerts').length,
      consentNotes: document.querySelectorAll('.join-consent-note').length,
    };
  });

  check(
    '卡片没被固定导航压住',
    s.navPos === 'fixed' && s.card.y >= s.navBottom,
    `nav.bottom=${s.navBottom} card.y=${s.card.y}`,
  );
  check(
    '6 步 6 点、无连线（细线即量尺）',
    s.steps === 6 && s.dots === 6 && s.links === 0,
    `${s.steps}步/${s.dots}点/${s.links}线`,
  );
  check('只有第 1 步处于 active', s.activeSteps === 1);
  check('非当前步全部 inert（不可聚焦/不可点）', s.inertCount === 5, String(s.inertCount));
  check('进度与步号一致（视觉是 1/6，语义在 data-step）', s.progress === '1/6', s.progress);
  check('首屏标题是邮箱屏', s.title.includes('BOH 社区'), s.title);

  // 触控目标：勾选行 ≥44px（WCAG 2.5.5 / iOS HIG）
  check('协议勾选行可点区 ≥44px', s.consentRowH >= 44, `${s.consentRowH}px`);
  check(
    '初始状态：空邮箱 + 未勾协议 ⇒ 主按钮禁用（「不给下一步」）',
    s.primaryDisabled === true,
    String(s.primaryDisabled),
  );
  check(
    '文案瘦身：错误汇总卡与协议说明文字都不在页面上',
    s.alertCards === 0 && s.consentNotes === 0,
    `alerts=${s.alertCards} notes=${s.consentNotes}`,
  );

  check('极简纪律：整页无图片', s.imgs === 0, String(s.imgs));
  check('极简纪律：左栏 .join-hero 已下线', s.heroExists === false);
  check(
    '极简纪律：竖屏卡片无毛玻璃',
    s.cardFilter === 'none' || !s.cardFilter,
    String(s.cardFilter),
  );
  check('极简纪律：竖屏卡片无阴影', s.cardShadow === 'none' || !s.cardShadow, String(s.cardShadow));
  check('极简纪律：竖屏卡片无背景色', s.cardBg === 'rgba(0, 0, 0, 0)', String(s.cardBg));
  check('极简纪律：竖屏卡片无圆角', s.cardRadius === '0px', String(s.cardRadius));
  check('one-active-blur-layer：子树内活跃模糊层为 0', s.innerBlur === 0, String(s.innerBlur));

  check('每个字段都有常驻 label', s.labels.length === 6, s.labels.join(' | '));
  check('输入型字段 label[for] 关联', s.labelFor === 5, String(s.labelFor));
  check(
    '每个输入都有 autocomplete',
    s.autocompletes.every((a) => a && a.length > 0),
    JSON.stringify(s.autocompletes),
  );
  check(
    '带 hidden 的元素真的被隐藏',
    s.hiddenViolations.length === 0,
    s.hiddenViolations.join(' , '),
  );
  check('页面无横向溢出', s.horizontalOverflow === false);
  check(
    '协议勾选不写 localStorage（不污染登录页）',
    s.savedTermsKey === null,
    String(s.savedTermsKey),
  );

  // 焦点环：键盘用户必须看得见
  const focusRing = await page.evaluate(() => {
    const el = document.getElementById('joinEmail');
    el.focus();
    const cs = getComputedStyle(el);
    return { shadow: cs.boxShadow, outline: cs.outlineStyle, border: cs.borderColor };
  });
  check(
    '输入框有可见焦点环（不是 outline:none 干样子）',
    (focusRing.shadow && focusRing.shadow !== 'none') || focusRing.outline !== 'none',
    JSON.stringify(focusRing),
  );

  // 黑白纪律：整页零彩色
  const chromatic = await page.evaluate(chromaticProbe);
  check(
    '黑白纪律：竖屏全页彩色元素计数为 0',
    chromatic.count === 0,
    JSON.stringify(chromatic.hits.slice(0, 4)),
  );

  const PAIRS = [
    ['字段标签', '.join-label'],
    ['字段提示', '.join-hint'],
    ['步骤文本', '.join-progress-text'],
    ['引导句', '.join-lead'],
    ['协议文本', '.join-consent-text'],
    ['placeholder', '#joinEmail', '::placeholder'],
  ];
  const show = (list) =>
    list
      .filter((p) => p.ratio !== null && p.ratio < 4.5)
      .map((p) => `${p.name}=${p.ratio.toFixed(2)}`);

  const light = await page.evaluate(contrastProbe, PAIRS);
  check('浅色：所有正文 ≥ 4.5:1', show(light).length === 0, show(light).join(' , '));
  await page.screenshot({ path: `${OUT}/join-real-portrait.png` });

  // 暗色跟随：本页没有任何 [data-theme] 覆盖，全靠 --boh-gate-* 派生
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  const darkBg = await page.evaluate(() => ({
    page: getComputedStyle(document.querySelector('.join-page')).backgroundColor,
    ink: getComputedStyle(document.querySelector('.join-wordmark')).color,
  }));
  const dark = await page.evaluate(contrastProbe, PAIRS);
  const darkLow = show(dark);
  check('暗色跟随（页面底色翻成纯黑 #0a0a0a）', darkBg.page === 'rgb(10, 10, 10)', darkBg.page);
  check('暗色：所有正文 ≥ 4.5:1', darkLow.length === 0, darkLow.join(' , '));
  const darkChromatic = await page.evaluate(chromaticProbe);
  check(
    '暗色：彩色元素计数为 0',
    darkChromatic.count === 0,
    JSON.stringify(darkChromatic.hits.slice(0, 4)),
  );
  await page.screenshot({ path: `${OUT}/join-real-dark.png` });
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  check(
    '场景 1 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0,
    [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 2：第 ① 屏校验 + 真实 ID 查重 + 密码 ══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser);

  /* 第 ① 屏的放行规则（用户口径 2026-11-26）：「没写好或者没同意就不给下一步」。
     表达方式是**主按钮禁用**，不再弹汇总卡 —— 所以这里不点按钮
     （Playwright 会一直等 disabled 变 enabled 直到超时），直接断言状态。 */
  const stateOf = async () =>
    page.evaluate(() => {
      const btn = document.querySelector('.join-btn-primary');
      const el = document.querySelector('.join-progress-text');
      return {
        disabled: btn ? btn.disabled : null,
        step: el ? `${el.dataset.step}/${el.dataset.total}` : '',
        emailMsg: document.getElementById('joinMsgEmail')?.textContent.trim() || '',
        alertCards: document.querySelectorAll('.join-alerts').length,
      };
    });

  const initial = await stateOf();
  check(
    '初始：主按钮禁用、停在第 1 步',
    initial.disabled === true && initial.step === '1/6',
    JSON.stringify(initial),
  );

  /* ── 邮箱「可用」徽标必须是真实判定 ──
     用户口径（2026-11-26）：「注册的邮箱可用判定是什么？怎么我输入什么都可以判定可用？」
     根因：改版前模板是 `v-if="!fieldMsg.email && formData.email"` —— 只要填了、
     格式又没报错就点亮「可用」，从来没问过服务端。随便写 zzzz@example.com 也绿。
     现在走 RPC is_email_registered。这三条就是锁住它别再退回去。 */
  const badgeOf = async () => {
    const el = await page.$('.join-fld[data-field="email"] .join-state');
    if (!el) return { text: '', cls: '' };
    return {
      text: (await el.textContent()).trim(),
      cls: (await el.getAttribute('class')) || '',
    };
  };

  // ① 格式不合法：不该出现任何徽标（既不能说「可用」也不能说「已注册」），
  //    错误只落在字段下方那一行，按钮保持禁用
  await fill(page, '#joinEmail', 'abc');
  await page.waitForTimeout(900);
  const badBadge = await badgeOf();
  const badState = await stateOf();
  check(
    '邮箱格式错 → 不显示任何可用性徽标（不冒充可用）',
    badBadge.text === '',
    `${badBadge.text} / ${badBadge.cls}`,
  );
  check(
    '邮箱格式错 → 字段下方给一行提示，按钮仍禁用、不弹汇总卡',
    badState.emailMsg.includes('有效的邮箱') &&
      badState.disabled === true &&
      badState.alertCards === 0,
    JSON.stringify(badState),
  );

  // ② 真实存在的老账号：必须报「已注册」，且提示去登录
  await fill(page, '#joinEmail', REAL_REGISTERED_EMAIL);
  await page.waitForTimeout(1400);
  const takenBadge = await badgeOf();
  const takenMsg = (await page.textContent('#joinMsgEmail'))?.trim() || '';
  check(
    '邮箱已被注册 → 徽标「已注册」（真实查询，不是凭格式放行）',
    takenBadge.text === '已注册',
    `${takenBadge.text} / ${takenBadge.cls}`,
  );
  check(
    '邮箱已被注册 → 提示去登录而不是继续说可用',
    takenMsg.includes('已经注册') && takenMsg.includes('登录'),
    takenMsg.slice(0, 50),
  );

  // ③ 确定不存在的邮箱：才允许显示「可用」
  await fill(page, '#joinEmail', FAKE.email);
  await page.waitForTimeout(1400);
  const freeBadge = await badgeOf();
  check(
    '未注册邮箱 → 徽标「可用」',
    freeBadge.text === '可用' && freeBadge.cls.includes('is-ok'),
    `${freeBadge.text} / ${freeBadge.cls}`,
  );
  // 邮箱合法但没勾协议 → 仍然不放行（协议在账户创建之前）
  const noTerms = await stateOf();
  check(
    '邮箱合法但未勾协议 → 按钮禁用、停在第 1 步',
    noTerms.disabled === true && noTerms.step === '1/6',
    JSON.stringify(noTerms),
  );

  // 勾上协议 → 立刻放行；取消 → 立刻收回（状态机是实时的，不靠提交时才判）
  await page.check('.join-consent input[type="checkbox"]');
  await page.waitForTimeout(200);
  const ready = await stateOf();
  check('邮箱合法 + 已勾协议 → 主按钮放行', ready.disabled === false, String(ready.disabled));
  await page.uncheck('.join-consent input[type="checkbox"]');
  await page.waitForTimeout(150);
  check('取消勾选 → 立即收回放行', (await stateOf()).disabled === true);
  await page.check('.join-consent input[type="checkbox"]');
  await page.waitForTimeout(150);

  check(
    '协议勾选不写 localStorage',
    (await page.evaluate(() => window.localStorage.getItem('boh_agreed_to_terms'))) === null,
  );

  await page.screenshot({ path: `${OUT}/join-real-step1-ready.png` });

  // 发码 → 第 2 步（POST 被合成，不会真发信）
  const toStep2 = await submitEmailStep(page);
  check(
    '填好邮箱+协议 → 进第 2 步（验证码）',
    toStep2 === true,
    await page.textContent('.join-progress-text'),
  );
  await waitStep(page, 2);

  const step2 = await page.evaluate(() => ({
    otpCells: document.querySelectorAll('.otp-cell').length,
    otpMounted: Boolean(document.querySelector('.otp-native')),
    emailEcho: document.querySelector('.join-email-em')?.textContent?.trim() || '',
    resend: document.querySelector('.join-otp-actions .join-mini')?.textContent?.trim() || '',
    canBack: [...document.querySelectorAll('.join-otp-actions button')].some((b) =>
      b.textContent.includes('邮箱填错了'),
    ),
    // 第 2 步不该有「上一步」——回退入口刻意做成「邮箱填错了」这个具体动作
    ghostBack: Boolean(document.querySelector('.join-actions .join-btn-ghost')),
  }));
  check(
    '验证码是 8 格（对齐线上 mailer_otp_length）',
    step2.otpCells === 8,
    String(step2.otpCells),
  );
  check('验证码组件已挂载真实输入框', step2.otpMounted === true);
  check('第 2 步回显邮箱', step2.emailEcho === FAKE.email, step2.emailEcho);
  check('第 2 步有重发入口', step2.resend.length > 0, step2.resend);
  check('第 2 步提供「邮箱填错了」回退入口', step2.canBack === true);

  // 「邮箱填错了」→ 回第 1 步，且清掉「已发码」标记
  await clickByText(page, '.join-otp-actions button', '邮箱填错了');
  await waitStep(page, 1);
  const backTo1 = await page.evaluate(() => ({
    email: document.getElementById('joinEmail').value,
    focus: document.activeElement === document.getElementById('joinEmail'),
  }));
  check('回退到第 1 步后邮箱值保留（不用重敲）', backTo1.email === FAKE.email, backTo1.email);
  check('回退后焦点落回邮箱输入框', backTo1.focus === true);

  // 再发码 → 第 2 步 → 验证 → 第 3 步
  await submitEmailStep(page);
  await waitStep(page, 2);
  const toStep3 = await submitOtpStep(page);
  check(
    '验证码填满提交 → 进第 3 步（选填项不阻断）',
    toStep3 === true,
    await page.textContent('.join-progress-text'),
  );

  const step3 = await page.evaluate(() => ({
    verified: document.querySelector('.join-verified-text')?.textContent?.trim() || '',
    backBtn: [...document.querySelectorAll('.join-actions .join-btn-ghost')].some((b) =>
      b.textContent.includes('上一步'),
    ),
    pass: Boolean(document.getElementById('joinPassword')),
    title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
    mainLabel: document.querySelector('.join-btn-primary').textContent.trim(),
  }));
  check('第 3 步只读回显「邮箱已验证」', step3.verified.includes(FAKE.email), step3.verified);
  check('第 3 步不给「上一步」（账号已按该邮箱建好）', step3.backBtn === false);
  check(
    '第 3 步标题是「创建你的 BOH ID」而不是「设置密码」',
    step3.title.includes('BOH ID'),
    step3.title,
  );
  check('第 3 步主按钮文案是「创建账户」', step3.mainLabel === '创建账户', step3.mainLabel);

  // 真实 ID 查重：CELLINIA 是线上真实存在的用户名
  // ⚠️ 必须限定到 [data-field="account"]：邮箱字段在「已填且无错」时也会渲染
  // 一个 `.join-state is-ok`「可用」徽标，裸 querySelector('.join-state')
  // 会先命中它 —— 于是不管 ID 是否被占用，读到的都是「可用」（假绿）。
  // 2026-11-25 实测：查重请求返回 200 且带 CELLINIA，徽标却显示可用。
  const ACCOUNT_STATE = '.join-fld[data-field="account"] .join-state';
  const waitAccountSettled = () =>
    page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.textContent.trim() !== '' && !el.textContent.includes('检查中');
      },
      ACCOUNT_STATE,
      { timeout: 10000 },
    );
  await fill(page, '#joinAccount', 'CELLINIA');
  await waitAccountSettled();
  const taken = await page.evaluate(
    (sel) => ({
      state: document.querySelector(sel)?.textContent?.trim() || '',
      msg: document.getElementById('joinMsgAccount').textContent.trim(),
      suggest: [...document.querySelectorAll('.join-suggest button')].map((b) =>
        b.textContent.trim(),
      ),
    }),
    ACCOUNT_STATE,
  );
  check(
    '真实已占用的 ID → 不可用 + 给候选',
    taken.state === '不可用' && taken.suggest.length >= 2,
    `${taken.state} / ${taken.suggest.join('、')}`,
  );
  await page.screenshot({ path: `${OUT}/join-real-taken.png` });

  await fill(page, '#joinAccount', FAKE.account);
  await waitAccountSettled();
  const free = await page.evaluate(
    (sel) => document.querySelector(sel)?.textContent?.trim() || '',
    ACCOUNT_STATE,
  );
  check('可用 ID → 标「可用」', free === '可用', free);

  // 密码：7 位被拒（下限 8）—— 按钮保持禁用，错误写在字段下方
  await fill(page, '#joinPassword', 'Abcdef1');
  await page.waitForTimeout(400);
  const pw7 = await page.evaluate(() => ({
    msg: document.getElementById('joinMsgPassword').textContent.trim(),
    step: (() => {
      const el = document.querySelector('.join-progress-text');
      return el ? `${el.dataset.step}/${el.dataset.total}` : '';
    })(),
    disabled: document.querySelector('.join-btn-primary')?.disabled,
  }));
  check(
    '7 位密码被拒（下限 8）：按钮禁用、停在第 3 步',
    pw7.msg.includes('8') && pw7.step === '3/6' && pw7.disabled === true,
    JSON.stringify(pw7),
  );

  await fill(page, '#joinPassword', FAKE.password);
  await page.waitForTimeout(300);
  const pwOk = await page.evaluate(() => ({
    level: document.querySelector('.join-meter')?.getAttribute('data-level'),
    rules: document.querySelectorAll('.join-rules li').length,
    hit: document.querySelectorAll('.join-rules li.is-hit').length,
  }));
  check(
    '强度条到 3 档 + 4 条规则全打勾',
    pwOk.level === '3' && pwOk.rules === 4 && pwOk.hit === 4,
    JSON.stringify(pwOk),
  );

  await page.click('.join-toggle');
  await page.waitForTimeout(200);
  check('显示密码开关生效', (await page.getAttribute('#joinPassword', 'type')) === 'text');

  check(
    '场景 2 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0,
    [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 3：老用户保护（不能静默改写老账号）══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, {
    signupState: 'completed',
  });
  await submitEmailStep(page);
  await waitStep(page, 2);
  // 验证码通过后 checkSignupState 说「已建完」⇒ 必须挡回去
  const native = await page.$('.otp-native');
  await native.fill(FAKE.otp);
  await page.waitForTimeout(150);
  await clickPrimary(page);
  await page.waitForTimeout(1500);

  const blocked = await page.evaluate(() => {
    // 密码框在 DOM 里**始终存在**（六屏全渲染、靠 inert 拦），
    // 所以判据必须是「第 ③ 屏没被激活」而不是「元素不存在」。
    const pwStep = document.getElementById('joinPassword')?.closest('.join-step');
    return {
      step: (() => {
        const el = document.querySelector('.join-progress-text');
        return el ? `${el.dataset.step}/${el.dataset.total}` : '';
      })(),
      otpMsg:
        document.querySelector('.join-fld[data-field="otp"] .join-msg')?.textContent?.trim() || '',
      otpValue: document.querySelector('.otp-native')?.value || '',
      pwStepActive: pwStep ? pwStep.classList.contains('is-active') : null,
      pwStepInert: pwStep ? pwStep.inert : null,
    };
  });
  check('已注册邮箱 → 停在第 2 步，不进第 3 步', blocked.step === '2/6', blocked.step);
  check(
    '已注册邮箱 → 提示去登录（而不是"密码错误"）',
    blocked.otpMsg.includes('已经注册') && blocked.otpMsg.includes('登录'),
    blocked.otpMsg.slice(0, 60),
  );
  check('已注册邮箱 → 清空验证码，逼用户重输', blocked.otpValue === '', blocked.otpValue);
  check(
    '已注册邮箱 → 第 3 步始终未激活（密码框 inert 不可达）',
    blocked.pwStepActive === false && blocked.pwStepInert === true,
    `active=${blocked.pwStepActive} inert=${blocked.pwStepInert}`,
  );
  await page.screenshot({ path: `${OUT}/join-real-existing.png` });

  check(
    '场景 3 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0,
    [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 4：半成品账号可继续（安全阀）══════════════════ */
{
  // signup_completed_at 为 null ⇒ 允许继续，否则中途放弃者的邮箱永久失效
  const { context, page, pageErrors } = await boot(browser, { signupState: 'incomplete' });
  await submitEmailStep(page);
  await waitStep(page, 2);
  const advanced = await submitOtpStep(page);
  check(
    '半成品账号（signup_completed_at 为 null）→ 允许继续到第 3 步',
    advanced === true,
    await page.textContent('.join-progress-text'),
  );

  // 查询失败时必须 fail-open（宁可多填一屏，也不能把新用户卡死）
  await context.close();
  const err = await boot(browser, { signupState: 'error' });
  await submitEmailStep(err.page);
  await waitStep(err.page, 2);
  const advancedErr = await submitOtpStep(err.page);
  check(
    'checkSignupState 查询失败 → fail-open 放行（不卡死新用户）',
    advancedErr === true,
    await err.page.textContent('.join-progress-text'),
  );
  check(
    '场景 4 无 JS 异常',
    pageErrors.length === 0 && err.pageErrors.length === 0,
    [...pageErrors, ...err.pageErrors].slice(0, 3).join(' | '),
  );
  await err.context.close();
}

/* ══════════════════ 场景 5：第 ④~⑥ 屏与完成页 ══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, { altcha: true });

  await submitEmailStep(page);
  await waitStep(page, 2);
  await submitOtpStep(page);
  await waitStep(page, 3);
  await passAltcha(page);
  await submitIdentityStep(page);
  await waitStep(page, 4);

  const step4 = await page.evaluate(() => ({
    title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
    backBtn: [...document.querySelectorAll('.join-actions .join-btn-ghost')].some((b) =>
      b.textContent.includes('上一步'),
    ),
    skipBtn: [...document.querySelectorAll('.join-actions .join-btn-ghost')].some((b) =>
      b.textContent.includes('跳过'),
    ),
  }));
  check(
    '第 4 步是生日（可回上一步、可跳过）',
    step4.title === '生日' && step4.backBtn === true && step4.skipBtn === true,
    JSON.stringify(step4),
  );

  // 生日：月驱动天数（闰年口径）
  await page.selectOption('#joinBirthMonth', '2');
  await page.waitForTimeout(300);
  const feb = await page.$$eval('.join-birth select:nth-of-type(2) option', (o) => o.length - 1);
  check('birth 2 月 = 29 天（闰年口径）', feb === 29, String(feb));
  await page.selectOption('#joinBirthMonth', '4');
  await page.waitForTimeout(300);
  const apr = await page.$$eval('.join-birth select:nth-of-type(2) option', (o) => o.length - 1);
  check('4 月 = 30 天', apr === 30, String(apr));

  // 只填月不填日 → 软提示但放行
  await page.selectOption('.join-birth select:nth-of-type(2)', '15');
  await clickPrimary(page);
  await waitStep(page, 5);
  check('第 4 步填好 → 第 5 步（头像）', (await readStep(page)) === 5);

  const step5 = await page.evaluate(() => ({
    title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
    drop: Boolean(document.querySelector('.join-avatar-drop')),
    pick: [...document.querySelectorAll('.join-avatar-btns button')].some((b) =>
      b.textContent.includes('选择图片'),
    ),
  }));
  check(
    '第 5 步是头像（有选图入口）',
    step5.title.includes('头像') && step5.drop && step5.pick,
    JSON.stringify(step5),
  );

  await clickPrimary(page);
  await waitStep(page, 6);
  check('第 5 步未选图也能过（选填）', (await readStep(page)) === 6);

  const step6 = await page.evaluate(() => ({
    title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
    hasSwitch: Boolean(document.querySelector('.join-switch-input')),
    mainLabel: document.querySelector('.join-btn-primary').textContent.trim(),
    skipBtn: [...document.querySelectorAll('.join-actions .join-btn-ghost')].some((b) =>
      b.textContent.includes('跳过'),
    ),
  }));
  check(
    '第 6 步是通行密钥，主按钮文案是「完成」',
    step6.title.includes('快速登录') && step6.mainLabel === '完成',
    `${step6.title} / ${step6.mainLabel}`,
  );
  check('第 6 步必须能跳过（无认证器的设备不能卡死）', step6.skipBtn === true);

  // 完成 → 欢迎页
  await clickPrimary(page);
  await page.waitForTimeout(1200);
  const done = await page.evaluate(() => ({
    exists: Boolean(document.querySelector('.join-done')),
    title: document.querySelector('.join-done h2')?.textContent?.trim() || '',
    body: document.querySelector('.join-done p')?.textContent?.trim() || '',
    progressGone: !document.querySelector('.join-progress'),
    loginBtn: Boolean(document.querySelector('.join-done .join-btn-primary')),
  }));
  check('走完 6 步 → 进入欢迎页', done.exists === true, done.title);
  check('欢迎页不再显示进度条（完成态不是第 7 步）', done.progressGone === true);
  check('欢迎页带出本机的 BOH ID', done.body.includes(FAKE.account), done.body.slice(0, 60));
  check('欢迎页有「去登录」出口', done.loginBtn === true);
  await page.screenshot({ path: `${OUT}/join-real-done.png` });

  check(
    '场景 5 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0,
    [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 6：通行密钥四态（能力为真）══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, {
    passkey: true,
    altcha: true,
  });

  const block = await page.evaluate(() => {
    // 块在第 6 步，但 DOM 里始终存在（非当前步 inert），所以直接查存在性
    const el = document.querySelector('.join-fld[data-field="passkey"]');
    const sw = document.querySelector('.join-switch-input');
    return {
      exists: Boolean(el),
      role: sw?.getAttribute('role') || null,
      describedBy: sw?.getAttribute('aria-describedby') || null,
      checked: sw?.checked ?? null,
    };
  });
  check('能力为真时出现通行密钥开关', block.exists === true, JSON.stringify(block));
  check('开关默认关闭（不主动弹系统验证窗）', block.checked === false, String(block.checked));
  check(
    '开关是 role=switch + aria-describedby',
    block.role === 'switch' && block.describedBy === 'joinPasskeyHint',
    `${block.role} / ${block.describedBy}`,
  );

  // 走到第 6 步并勾选
  await submitEmailStep(page);
  await waitStep(page, 2);
  await submitOtpStep(page);
  await waitStep(page, 3);
  await passAltcha(page);
  await submitIdentityStep(page);
  await waitStep(page, 4);
  await page.click('.join-actions .join-btn-primary');
  await waitStep(page, 5);
  await clickPrimary(page);
  await waitStep(page, 6);

  await page.check('.join-switch-input');
  await page.waitForTimeout(200);
  await clickPrimary(page);
  await page.waitForTimeout(1200);

  const card = await page.evaluate(() => ({
    exists: Boolean(document.querySelector('.join-passkey-card')),
    addText:
      document.querySelector('.join-passkey-actions .join-btn-primary')?.textContent?.trim() || '',
    skipCount: document.querySelectorAll('.join-passkey-actions .join-btn-ghost').length,
  }));
  check('勾选 + 有会话 → 欢迎页出现通行密钥卡片', card.exists === true, JSON.stringify(card));
  check(
    '卡片有「添加」与「以后再说」两条出路',
    card.addText.includes('添加') && card.skipCount === 1,
    `${card.addText} / ${card.skipCount}`,
  );

  // ⚠️ 已知覆盖缺口（不假装通过）：running 态（按钮禁用 +「请在设备上完成验证…」）
  // 在无头环境**不可能**观察到 —— headless Chrome 没有平台认证器，supabase-js 会在
  // 真正 await 仪式之前就判定失败，running 与 error 落在同一个 tick 里，Vue 只渲染最终态。
  // 能观察到的四个态（卡片出现 → 失败可读 → 可重试 → 可跳过）都在下面断言了。
  await page.click('.join-passkey-actions .join-btn-primary');
  await page.waitForTimeout(2000);
  const failed = await page.evaluate(() => ({
    text: document.querySelector('.join-passkey-actions .join-btn-primary')?.textContent?.trim(),
    state: document.querySelector('.join-passkey-state')?.textContent?.trim() || '',
    skipDisabled: document.querySelector('.join-passkey-actions .join-btn-ghost')?.disabled,
  }));
  check(
    '仪式失败给出可读原因且可重试',
    failed.text === '重试' && failed.state.length > 0 && failed.skipDisabled === false,
    `${failed.text} / ${failed.state.slice(0, 30)}`,
  );
  await page.screenshot({ path: `${OUT}/join-real-passkey.png` });

  await page.click('.join-passkey-actions .join-btn-ghost');
  await page.waitForTimeout(300);
  check(
    '「以后再说」静默收起卡片',
    (await page.evaluate(() => !document.querySelector('.join-passkey-card'))) === true,
  );

  // ⚠️ 这里的 console 500 是**探针自己造的**（通行密钥端点被强制返回 500，
  //    用来验证「失败可读 + 可重试」）。它不是页面缺陷，所以只滤这一条 500。
  const realConsole = consoleErrors.filter((e) => !/status of 500/.test(e));
  check(
    '场景 6 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && realConsole.length === 0,
    [...pageErrors, ...realConsole].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 7：窄屏 390 ══════════════════ */
{
  const { context, page, pageErrors, consoleErrors } = await boot(browser, MOBILE);
  const m = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom) };
    };
    const nav = document.querySelector('.unified-nav');
    const card = document.querySelector('.join-card');
    return {
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
      card: rect('.join-card'),
      consent: rect('.join-consent'),
      primary: rect('.join-btn-primary'),
      viewportH: window.innerHeight,
      scrollH: document.documentElement.scrollHeight,
      cols: getComputedStyle(card).gridTemplateColumns.split(' ').length,
    };
  });
  check(
    '窄屏：卡片让位给导航（不重叠）',
    m.card.y >= m.navBottom,
    `nav=${m.navBottom} card.y=${m.card.y}`,
  );
  check('窄屏：单列布局', m.cols === 1, String(m.cols));
  check(
    '窄屏：协议勾选完整在视野内',
    m.consent.bottom <= m.viewportH + 1,
    `consent.bottom=${m.consent.bottom} vh=${m.viewportH}`,
  );
  check(
    '窄屏：主按钮在首屏可见（不用滚才找得到）',
    m.primary.bottom <= m.viewportH + 1,
    `primary.bottom=${m.primary.bottom} vh=${m.viewportH}`,
  );
  check('窄屏：页面不产生纵向滚动', m.scrollH <= m.viewportH + 1, `${m.scrollH} vs ${m.viewportH}`);

  const overflow = await page.evaluate(overflowProbe);
  // 判据两层都要过：① 文档真的不能横向滚 ② 没有自带横向滚动的子容器
  check(
    '窄屏：无横向溢出',
    overflow.reallyScrolls === false && overflow.bad.length === 0,
    `scrollW=${overflow.scrollWidth} vw=${overflow.vw} bad=${JSON.stringify(overflow.bad.slice(0, 3))}`,
  );
  await page.screenshot({ path: `${OUT}/join-real-mobile.png` });

  check(
    '场景 7 无 JS 异常 + 无意外 console 错误',
    pageErrors.length === 0 && consoleErrors.length === 0,
    [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '),
  );
  await context.close();
}

/* ══════════════════ 场景 8：横屏岛（844×390）══════════════════ */
{
  const { context, page, pageErrors } = await boot(browser, LANDSCAPE);

  const l = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      // bottom 必须显式给出来 —— 缺了它「卡片顶边接住导航底边」这类断言全是
      // undefined 比较（NaN 假红），踩过一次。
      return {
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
        right: Math.round(b.right),
        bottom: Math.round(b.bottom),
      };
    };
    const card = document.querySelector('.join-card');
    const cs = card ? getComputedStyle(card) : null;
    return {
      // ⚠️ 岛是 .unified-nav-surface，不是 .unified-nav：
      //    后者是全宽容器（844），只有前者会收成 720 的胶囊。
      //    拿容器量宽度会得出「导航 844 / 卡片 720、岛形断裂」的假结论。
      nav: rect('.unified-nav-surface'),
      card: rect('.join-card'),
      stage: rect('.join-stage'),
      radius: cs
        ? [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomRightRadius,
            cs.borderBottomLeftRadius,
          ]
        : [],
      title: rect('.join-step.is-active h2'),
      primary: rect('.join-actions .join-btn-primary'),
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
      // 真正该问的是「内容滚到底能不能看见主按钮」，不是「文档有没有滚动条」：
      // 横屏 ≤430px 高时卡片本身限高，纵向滚动发生在 .join-inner 里。
      innerScrollable: (() => {
        const el = document.querySelector('.join-inner');
        return el ? el.scrollHeight > el.clientHeight + 1 : false;
      })(),
    };
  });

  check(
    '横屏：卡片与导航同宽（两半拼成一张岛）',
    Math.abs(l.card.w - l.nav.w) <= 2,
    `nav.w=${l.nav.w} card.w=${l.card.w}`,
  );
  // 契约是「不露缝」，不是「恰好叠 2px」：卡片顶边必须 ≤ 导航底边（允许重叠，
  // 不允许间隙）。纵向位置随导航形态变化，钉死像素值会在导航改版后假红。
  check(
    '横屏：卡片与导航无缝拼接（不露白）',
    l.card.y - l.nav.bottom <= 0,
    `nav.bottom=${l.nav.bottom} card.y=${l.card.y} gap=${l.card.y - l.nav.bottom}`,
  );
  check(
    '横屏：只留下面两角（上面两角归导航）',
    l.radius[0] === '0px' && l.radius[1] === '0px' && parseFloat(l.radius[2]) > 0,
    l.radius.join(' / '),
  );
  check(
    '横屏：卡片不超出视口',
    l.card.right <= l.viewportW + 1,
    `right=${l.card.right} vw=${l.viewportW}`,
  );
  check(
    '横屏：主按钮在首屏可见（≤430px 高再压一档）',
    l.primary !== null && l.primary.bottom <= l.viewportH + 1,
    `primary.bottom=${l.primary?.bottom} vh=${l.viewportH}`,
  );
  check(
    '横屏：卡片内容不用滚就能看到主按钮（.join-inner 不溢出）',
    l.innerScrollable === false,
    String(l.innerScrollable),
  );

  const overflow = await page.evaluate(overflowProbe);
  check(
    '横屏：无横向溢出',
    overflow.reallyScrolls === false && overflow.bad.length === 0,
    `scrollW=${overflow.scrollWidth} vw=${overflow.vw} bad=${JSON.stringify(overflow.bad.slice(0, 3))}`,
  );
  await page.screenshot({ path: `${OUT}/join-real-landscape.png` });

  // 暗色横屏：岛必须与导航同色拼接，按钮反相
  // （空表单下按钮是禁用态，但禁用只压 opacity —— 底色仍跟 --j-ink 反相，
  //   比色断言照常成立，不需要先填表把它解锁。）
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  const darkIsland = await page.evaluate(() => ({
    cardBg: getComputedStyle(document.querySelector('.join-card')).backgroundColor,
    // 同一条纪律：量岛面而不是容器（容器透明）
    navBg: getComputedStyle(document.querySelector('.unified-nav-surface')).backgroundColor,
    btnBg: getComputedStyle(document.querySelector('.join-btn-primary')).backgroundColor,
    btnColor: getComputedStyle(document.querySelector('.join-btn-primary')).color,
  }));
  check(
    '暗色横屏：岛与导航同底色',
    darkIsland.cardBg === darkIsland.navBg,
    `${darkIsland.cardBg} vs ${darkIsland.navBg}`,
  );
  check(
    '暗色横屏：主按钮反相（浅底深字）',
    /rgba?\(\s*2[0-9]{2}/.test(darkIsland.btnBg),
    `${darkIsland.btnBg} / ${darkIsland.btnColor}`,
  );
  const darkChromatic = await page.evaluate(chromaticProbe);
  check(
    '暗色横屏：彩色元素计数为 0',
    darkChromatic.count === 0,
    JSON.stringify(darkChromatic.hits.slice(0, 3)),
  );
  await page.screenshot({ path: `${OUT}/join-real-landscape-dark.png` });
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  check('场景 8 无 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await context.close();
}

/* ══════════════════ 场景 9：能力不可用（微信/QQ 内置浏览器）══════════════════ */
{
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  await page.addInitScript(() => {
    window.PublicKeyCredential = function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  });
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? route.continue()
      : route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Expose-Headers': 'Content-Range',
          },
          body: '[]',
        }),
  );
  await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.join-card', { timeout: 25000 });
  await page.waitForTimeout(1200);

  const gone = await page.evaluate(() => ({
    steps: document.querySelectorAll('.join-step').length,
    passkeyBlock: document.querySelectorAll('.join-fld[data-field="passkey"]').length,
    unsupportedNote: document.querySelector('.join-passkey-unsupported')?.textContent?.trim() || '',
    labels: [...document.querySelectorAll('.join-label')].map((l) => l.textContent.trim()),
  }));
  check('能力不可用：仍是 6 步（页面结构不受能力探测影响）', gone.steps === 6, String(gone.steps));
  check(
    '能力不可用：通行密钥整块隐藏（不是置灰）',
    gone.passkeyBlock === 0,
    String(gone.passkeyBlock),
  );
  check(
    // 文案在 2026-11-26 精简过（用户口径：「这些啰嗦的文案删除」），
    // 断言跟着认「跳过」这个动作词，而不是原文那句长句。
    '能力不可用：给出「可跳过」的说明文案',
    gone.unsupportedNote.includes('跳过'),
    gone.unsupportedNote.slice(0, 40),
  );
  check('能力不可用：字段标签仍是 6 个', gone.labels.length === 6, gone.labels.join(' | '));
  check('场景 9 无 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
const { failed } = summary();
process.exit(failed.length ? 1 : 0);
