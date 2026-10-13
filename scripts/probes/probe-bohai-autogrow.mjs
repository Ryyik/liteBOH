/**
 * probe-bohai-autogrow.mjs — BOH AI 输入框「多字扩展」行为探针
 *
 * 背景：plans/021 阶段 3 · BOHAI 部分 —— `BohComposer.vue` 的自研 `autoResize` +
 * `modelValue` watch 已删除，改接全站单源 `composables/useAutoGrowTextarea.js`。
 * 收敛后 BOHAI 这条链路最脆弱的两点是**源码守卫看不见的行为**：
 *   ① 模板 `ref="textareaEl"` 绑定到 composable 解构回传的 ref（别名）——
 *      绑错/漏绑不报错，只是高度永不写入，肉眼看成「输入框不长高」；
 *   ② 内容源是受控 prop ⇒ 必须传 getter —— 包一层 unref 会让 watcher 永不触发，
 *      表现为「手动输入能长、程序化清空/预填不回弹」。
 * 本探针在浏览器里量真实高度，把这两条钉死。
 *
 * 与 probe-reply-autogrow.mjs（论坛/评论，跑 5174）分工：那份验单源 composable 的
 * 通用行为与窄框 placeholder 摘除；本份验 BOHAI 壳内的接线（ref 别名 + getter watch）。
 *
 * 用法（dev server 需在 5173；脚本自带登录注入，不需要真账号）：
 *   node scripts/probes/probe-bohai-autogrow.mjs
 *   BASE=http://[::1]:5173 node scripts/probes/probe-bohai-autogrow.mjs
 *
 * 反证（必须做，否则不算自证）：
 *   · 删掉 BohComposer 模板里的 `ref="textareaEl"` → A1 必红（style.height 永不写入）；
 *   · 把 `useAutoGrowTextarea({ value: () => props.modelValue })` 的 value 去掉
 *     → A4 必红（清空后高度不回弹，watcher 没了内容源）；
 *   · 把值包成 `() => unref(props.modelValue)` → A4 同样必红（unref 不解 prop）。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';

const PROBE_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 220) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(600);
};

/** 只把未捕获异常与 Vue「模板引用未定义绑定」当红（console.error 有稳定噪声，不计红） */
const newPage = async (ctx, bucket) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bucket.errors.push(`pageerror: ${String(e).slice(0, 180)}`));
  page.on('console', (m) => {
    if (
      m.type() === 'warning' &&
      /is not defined on instance|accessed during render/i.test(m.text())
    ) {
      bucket.vueWarn.push(m.text().slice(0, 180));
    }
  });
  return page;
};

const mockQuota = async (page) => {
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() || {};
    } catch {
      body = {};
    }
    if (body?.action === 'quota-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { usedTokens: 88000, tokenLimit: 100000, webSearchUsed: 3, webSearchLimit: 10 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, message: '探针环境不调用真实模型' }),
    });
  });
};

/** 读输入框当前高度 + CSS 上限 + composable 是否已写入行内高度 */
const measureInput = () => {
  const el = document.querySelector('.boh-composer-input');
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    inlineHeight: el.style.height,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    cap: parseFloat(style.maxHeight),
  };
};

// ===================== 场景 A：桌面 1440×900 增高行为 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], vueWarn: [] };
  const page = await newPage(ctx, errors);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await mockQuota(page);
  await page.waitForSelector('.boh-composer-input', { timeout: 20000 });
  // 等 composable 挂上监听后的首次 rAF 测量落定
  await page.waitForTimeout(400);

  // A1 空态：composable 已写入行内高度，且就是**单行**高度
  //     （placeholder 不参与测量；height 为空串 = ref 没绑上，auto-grow 整条链路静默死亡）
  const empty = await page.evaluate(measureInput);
  check(
    'A1 空态：行内高度已写入且为单行（≤48px）',
    !!empty && empty.inlineHeight !== '' && empty.clientHeight <= 48,
    JSON.stringify(empty),
  );

  // A2 输入五行文本 → 长高（≥ 初始 + 3 行）
  //     fill 会派发 input 事件 → 受控 prop 更新 → composable 的 input 监听立即排一次测量
  await page.fill(
    '.boh-composer-input',
    '第一行内容\n第二行内容\n第三行内容\n第四行内容\n第五行内容\n',
  );
  await page.waitForTimeout(300);
  const five = await page.evaluate(measureInput);
  check(
    'A2 输入五行 → 高度增长（≥ 空态 + 60px）',
    !!five && five.clientHeight >= empty.clientHeight + 60,
    `empty=${empty?.clientHeight} five=${five?.clientHeight}`,
  );

  // A3 输入六十行 → 封顶在 CSS max-height，且**不回落**到 rows 固有高度
  //     （`height='auto'` 后无条件写回这条纪律的行为面；提前 return 的实现会掉回 85px 左右）
  const longText = Array.from({ length: 60 }, (_, i) => `第${i + 1}行很长很长很长的内容`).join(
    '\n',
  );
  await page.fill('.boh-composer-input', longText);
  await page.waitForTimeout(300);
  const capped = await page.evaluate(measureInput);
  check(
    'A3 六十行 → 封顶在 CSS max-height（不溢出、不回弹）',
    !!capped && Math.abs(capped.clientHeight - capped.cap) < 1,
    `h=${capped?.clientHeight} cap=${capped?.cap}`,
  );

  // A4 程序化清空 → 回弹到单行高度（value getter watch 驱动的收缩路径；
  //     getter 包 unref / 整个 value 传参被删时这条必红）
  await page.fill('.boh-composer-input', '');
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(measureInput);
  check(
    'A4 清空 → 回弹单行（±2px）',
    !!cleared && Math.abs(cleared.clientHeight - empty.clientHeight) <= 2,
    `empty=${empty?.clientHeight} cleared=${cleared?.clientHeight}`,
  );

  // A5 全程零 pageerror / 零「模板引用未定义绑定」（ref 别名拼错时 Vue 会发 warning）
  check(
    'A5 全程零 pageerror / 零未定义绑定警告',
    errors.errors.length === 0 && errors.vueWarn.length === 0,
    JSON.stringify({ errors: errors.errors, vueWarn: errors.vueWarn }),
  );

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
process.exit(failed.length ? 1 : 0);
