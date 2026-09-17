/**
 * probe-release-p0-fixes.mjs
 *
 * 验证 release 报告批次 0 的两处修复，逐条对应报告里的「验收」条款：
 *   T1-1  全局 ErrorBoundary UI 缺失（S6）
 *         → 渲染期抛错不再白屏，出现带出口的提示卡；换路由自动复位
 *   T0-1  SharedMemoryManagement 的 dialog 未定义（N1）
 *         → 编辑与删除各成功执行一次；写接口失败时乐观值回滚、按钮可再点
 *
 * 崩溃用真实数据触发，不篡改组件内部：
 *   localStorage['boh_health_persist'].profile = null
 *   → Health 页模板读已持久化的空 profile
 *   → TypeError（正是报告 S11（固定 key 持久化）+ S16（模板深层解引用）的交叉点）
 *
 * 反证记录：撤掉 App.vue 的边界包裹 → A2~A14 转红；
 *           删掉 SharedMemoryManagement 的 dialog 实例 → B4/B7/B8 转红。
 *
 * 用法（从仓库根）：node scripts/probes/probe-release-p0-fixes.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:5173';
const OUT_DIR = 'output/probe-release-p0-fixes';
const PROBE_USER_ID = '11111111-1111-4111-8111-111111111111';
const FAKE_MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const FAKE_CONTENT = '探针假数据：用于验证编辑与删除入口';
const EDITED_CONTENT = '探针改写后的内容';

mkdirSync(OUT_DIR, { recursive: true });

let pass = 0;
let fail = 0;
const results = [];
const check = (ok, name, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const note = (text) => results.push(`      （${text}）`);
const section = (title) => results.push(`\n── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`);

const FAKE_ROW = {
  id: FAKE_MEMORY_ID,
  owner_user_id: PROBE_USER_ID,
  content: FAKE_CONTENT,
  mood: '',
  tags: [],
  confidence: 0.9,
  evidence: [],
  source: 'probe',
  status: 'active',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const apiCalls = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('request', (req) => {
  if (/rest\/v1/.test(req.url())) apiCalls.push(`${req.method()} ${req.url().slice(0, 100)}`);
});
// 写请求的响应诊断：DELETE 依赖 Content-Range 取受影响行数，拿不到会被判成「不存在」
const writeResponses = [];
page.on('response', (res) => {
  const m = res.request().method();
  if (m !== 'GET' && /boh_ai_shared_memories/.test(res.url())) {
    writeResponses.push(
      `${m} ${res.status()} content-range=${res.headers()['content-range'] || '(none)'}`
    );
  }
});

// 写接口的可控行为：ok / http500（supabase 转成 { error }，走 !result.ok 回滚分支）
let writeMode = 'ok';

// Content-Range 是响应头，跨域下浏览器默认不把它暴露给脚本 —— 必须显式
// Access-Control-Expose-Headers，否则 supabase-js 读不到 count（真实 Supabase 会发）。
// 漏了这条，delete({ count:'exact' }) 会被判成「不存在或无权限」而回滚。
const jsonHeaders = {
  'content-type': 'application/json',
  'access-control-expose-headers': 'Content-Range'
};

await page.route('**/rest/v1/boh_ai_shared_memories**', (route) => {
  const method = route.request().method();

  if (method === 'GET') {
    return route.fulfill({
      status: 200,
      headers: { ...jsonHeaders, 'content-range': '0-0/1' },
      body: JSON.stringify([FAKE_ROW])
    });
  }

  if (writeMode === 'http500') {
    return route.fulfill({
      status: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ message: '探针强制失败', code: 'PROBE_FORCED_FAILURE' })
    });
  }

  if (method === 'DELETE') {
    // delete({ count: 'exact' }) 依赖 Content-Range 取受影响行数，缺了会被判成
    // 「不存在或无权限」而回滚。这里显式带上 0-0/1 与 JSON body，避免空 body
    // 触发 supabase-js 的 JSON 解析失败。
    return route.fulfill({
      status: 200,
      headers: { ...jsonHeaders, 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: FAKE_MEMORY_ID }])
    });
  }
  // PATCH 走 .select().maybeSingle()，必须回单行对象
  return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ ...FAKE_ROW }) });
});
await page.route('**/rest/v1/rpc/**', (route) =>
  route.fulfill({ status: 200, headers: jsonHeaders, body: '[]' })
);

const injectLogin = async () => {
  await page
    .waitForFunction(
      () => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return pinia && pinia.state.value.auth.isInitialized === true;
      },
      null,
      { timeout: 15000 }
    )
    .catch(() => {});

  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(
      ({ uid }) => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const auth = pinia.state.value.auth;
        auth.isLoggedIn = true;
        const info = { id: uid, username: 'probe_rui', role: 'user', points: 1024 };
        // userInfo 是 reactive({})，Object.assign 比整体替换更稳（既有探针纪律）
        if (auth.userInfo && typeof auth.userInfo === 'object') Object.assign(auth.userInfo, info);
        else auth.userInfo = info;
      },
      { uid: PROBE_USER_ID }
    );
    await page.waitForTimeout(420);
    const stillIn = await page
      .evaluate(() => {
        const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
        return !!pinia?.state.value.auth.isLoggedIn && !!pinia.state.value.auth.userInfo?.id;
      })
      .catch(() => false);
    if (stillIn) return true;
  }
  return false;
};

const isBlankScreen = () =>
  page.evaluate(() => {
    const app = document.querySelector('#app');
    if (!app) return true;
    const kids = Array.from(app.children).filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
    if (kids.length === 0) return true;
    return kids.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) < 80;
  });

const boundaryGeometry = () =>
  page.evaluate(() => {
    const card = document.querySelector('.geb-card');
    const root = document.querySelector('.geb-root');
    if (!card || !root) return null;
    const cs = getComputedStyle(card);
    const cr = card.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('.geb-btn')).map((b) => {
      const bs = getComputedStyle(b);
      const br = b.getBoundingClientRect();
      return {
        text: b.textContent.trim(),
        w: Math.round(br.width),
        h: Math.round(br.height),
        display: bs.display,
        visibility: bs.visibility
      };
    });
    return {
      w: Math.round(cr.width),
      h: Math.round(cr.height),
      background: cs.backgroundColor,
      radius: cs.borderTopLeftRadius,
      display: cs.display,
      visibility: cs.visibility,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      title: document.querySelector('.geb-title')?.textContent.trim() || '',
      message: document.querySelector('.geb-message')?.textContent.trim() || '',
      buttons
    };
  });

// ═══════════════════════════════════════════════════════════
// Part A · T1-1 全局 ErrorBoundary
// ═══════════════════════════════════════════════════════════
section('T1-1 全局 ErrorBoundary（渲染期抛错不再白屏）');

await page.addInitScript(() => {
  try {
    window.localStorage.setItem(
      'boh_health_persist',
      JSON.stringify({
        profile: null,
        weightLogs: [],
        dailyLogs: [],
        vaultRecords: null,
        onboardingDone: true
      })
    );
  } catch {
    /* localStorage 不可用时跳过 */
  }
});

await page.goto(`${BASE}/#/health`, { waitUntil: 'domcontentloaded' });
await injectLogin();

const boundaryShown = await page
  .waitForSelector('.geb-root', { timeout: 9000 })
  .then(() => true)
  .catch(() => false);

const geo = await boundaryGeometry();
// onErrorCaptured 返回 false 会阻止错误继续冒泡，window 上不会有 pageerror ——
// 「没有 pageerror」恰恰是边界生效的证据。判据是卡片正文带出了原始错误信息。
check(
  /Cannot read properties of null/.test(geo?.message || ''),
  'A1 畸形持久化数据确实触发了真实渲染错误（错误信息被边界接住）',
  (geo?.message || pageErrors[0] || '').slice(0, 100)
);
check(boundaryShown, 'A2 抛错后渲染出错误边界提示卡（未白屏）');
check(pageErrors.length === 0, 'A3 错误未冒泡到 window（onErrorCaptured 返回 false 生效）');

if (boundaryShown && geo) {
  check(!(await isBlankScreen()), 'A4 页面有可见内容，不是白屏');
  check(geo.w > 200 && geo.h > 100, 'A5 提示卡尺寸正常', `${geo.w}×${geo.h}`);
  check(
    geo.background !== 'rgba(0, 0, 0, 0)' && geo.background !== 'transparent',
    'A6 卡片背景不透明（玻璃材质已生效）',
    geo.background
  );
  check(parseFloat(geo.radius) > 8, 'A7 圆角生效（--liquid-radius-* 已解析，非 0）', geo.radius);
  check(geo.display !== 'none' && geo.visibility === 'visible', 'A8 卡片可见未隐藏');
  check(geo.backdrop !== 'none', 'A9 玻璃滤镜生效', geo.backdrop);
  check(geo.title.length > 0, 'A10 标题有文案', geo.title);
  check(geo.message.length > 0, 'A11 正文有文案', geo.message.slice(0, 36));

  const visibleBtns = geo.buttons.filter(
    (b) => b.w > 40 && b.h > 20 && b.display !== 'none' && b.visibility === 'visible'
  );
  check(visibleBtns.length >= 3, 'A12 三个出口按钮均可见可点', visibleBtns.map((b) => b.text).join(' / '));
  check(
    geo.buttons.some((b) => b.text.includes('清除缓存')),
    'A13 提供「清除缓存后重载」出口（chunk 404 自愈场景）'
  );

  await page.screenshot({ path: `${OUT_DIR}/boundary-light.png` });

  // 就地切暗色验证 token 翻转。组件样式只依赖全局 --liquid-*，不该依赖任何宿主 class；
  // 就地改 data-theme 比重走一次「重载 + 崩溃复现」更精准，也不受 boot 时序影响。
  const lightTitleColor = await page.evaluate(
    () => getComputedStyle(document.querySelector('.geb-title')).color
  );
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  const darkColors = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('.geb-title')).color,
    card: getComputedStyle(document.querySelector('.geb-card')).backgroundColor
  }));
  check(
    darkColors.title !== lightTitleColor,
    'A13a 暗色下标题文字翻转为亮色（token 自动翻转）',
    `${lightTitleColor} → ${darkColors.title}`
  );
  await page.screenshot({ path: `${OUT_DIR}/boundary-dark.png` });
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.geb-btn'))
      .find((b) => b.textContent.includes('回到首页'))
      ?.click();
  });
  await page
    .waitForFunction(() => !document.querySelector('.geb-root'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(600);

  const hashNow = await page.evaluate(() => location.hash);
  check((await page.$('.geb-root')) === null, 'A14 点「回到首页」后卡片消失');
  check(hashNow === '#/' || hashNow === '', 'A15 路由已回到首页', hashNow);
  check(!(await isBlankScreen()), 'A16 首页正常渲染（边界已复位）');
  await page.screenshot({ path: `${OUT_DIR}/boundary-recovered.png` });
} else {
  check(false, 'A4 提示卡几何读取失败');
}

// 换路由自动复位
await page.goto(`${BASE}/#/health`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await injectLogin();
if (await page.waitForSelector('.geb-root', { timeout: 9000 }).then(() => true).catch(() => false)) {
  await page.evaluate(() => {
    document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/');
  });
  await page
    .waitForFunction(() => !document.querySelector('.geb-root'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  check((await page.$('.geb-root')) === null, 'A17 换路由后边界自动复位（一次崩溃不污染后续页面）');
} else {
  check(false, 'A17 第二次崩溃未复现，无法验证路由复位');
}

// ═══════════════════════════════════════════════════════════
// Part B · T0-1 公共记忆编辑/删除
// ═══════════════════════════════════════════════════════════
section('T0-1 公共记忆编辑/删除（dialog 未定义修复）');

apiCalls.length = 0;
await page.goto(`${BASE}/#/user-space/shared-memories`, { waitUntil: 'domcontentloaded' });
await injectLogin();
await page.waitForSelector('.shared-memory-page', { timeout: 20000 }).catch(() => {});
// 等列表真正落定。注意不能等 [class*="memory"]：.shared-memory-page 自身就含
// "memory" 子串，会立即命中，等于没有等待。
const settled = await page
  .waitForFunction(
    () =>
      !!document.querySelector('.memory-card') ||
      !!document.querySelector('.empty-state') ||
      !!document.querySelector('.loading-state'),
    null,
    { timeout: 15000 }
  )
  .then(() =>
    page.evaluate(() => {
      if (document.querySelector('.memory-card')) return 'cards';
      if (document.querySelector('.empty-state')) return 'empty';
      if (document.querySelector('.loading-state')) return 'loading';
      return 'unknown';
    })
  )
  .catch(() => 'timeout');

note(`列表落定：${settled} · rest/v1 请求 ${apiCalls.length} 条`);
for (const c of apiCalls.slice(0, 3)) note(c);

check((await page.$('.shared-memory-page')) !== null, 'B1 公共记忆页真实根元素已就绪');
check(settled === 'cards', 'B2 列表落定为卡片态', settled);

const entryState = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  return {
    edit: btns.filter((b) => /编辑/.test(b.textContent || '')).length,
    del: btns.filter((b) => /删除/.test(b.textContent || '')).length
  };
});
check(entryState.edit > 0, 'B3 编辑入口已渲染', `${entryState.edit} 个`);
check(entryState.del > 0, 'B4 删除入口已渲染', `${entryState.del} 个`);

const clickEntry = (label) =>
  page.evaluate((text) => {
    Array.from(document.querySelectorAll('button'))
      .find((b) => new RegExp(text).test(b.textContent || ''))
      ?.click();
  }, label);

const dialogState = () =>
  page.evaluate(() => {
    const card = document.querySelector('.confirm-modal');
    if (!card) return null;
    const cs = getComputedStyle(card);
    const r = card.getBoundingClientRect();
    const input = document.querySelector('.confirm-input');
    return {
      visible: cs.display !== 'none' && cs.visibility === 'visible' && r.width > 100,
      w: Math.round(r.width),
      title: document.querySelector('.confirm-title')?.textContent.trim() || '',
      message: document.querySelector('.confirm-message')?.textContent.trim() || '',
      confirmText: document.querySelector('.confirm-btn.primary')?.textContent.trim() || '',
      background: cs.backgroundColor,
      radius: cs.borderTopLeftRadius,
      hasInput: !!input,
      inputValue: input?.value ?? null
    };
  });

const fillPrompt = (value) =>
  page.evaluate((v) => {
    const input = document.querySelector('.confirm-input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, value);

const submitDialog = () =>
  page.evaluate(() => {
    document.querySelector('.confirm-btn.primary')?.click();
  });

const cardState = () =>
  page.evaluate(() => {
    const card = document.querySelector('.memory-card');
    const editBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /编辑/.test(b.textContent || '')
    );
    return {
      count: document.querySelectorAll('.memory-card').length,
      content: document.querySelector('.memory-content')?.textContent.trim() || '',
      notice: document.querySelector('.notice')?.textContent.trim() || '',
      editDisabled: editBtn?.disabled ?? null,
      modalOpen: !!document.querySelector('.confirm-modal')
    };
  });

// ── B5 失败回滚（先测，不影响后续成功路径）────────────────
writeMode = 'http500';
await clickEntry('编辑');
await page.waitForTimeout(700);
const promptBefore = await dialogState();
check(promptBefore?.visible === true, 'B5 点「编辑」后确认弹窗真实弹出（几何校验，非仅 DOM 存在）');
check(promptBefore?.hasInput === true, 'B6 编辑弹窗带输入框（prompt 模式）');
check(promptBefore?.inputValue === FAKE_CONTENT, 'B7 输入框预填当前内容', JSON.stringify(promptBefore?.inputValue));
check(
  promptBefore && promptBefore.background !== 'rgba(0, 0, 0, 0)' && parseFloat(promptBefore.radius) > 4,
  'B8 弹窗材质与圆角生效',
  promptBefore ? `${promptBefore.background} / ${promptBefore.radius}` : ''
);
await page.screenshot({ path: `${OUT_DIR}/edit-dialog.png` });

if (promptBefore?.visible) {
  await fillPrompt('失败路径不应落盘的内容');
  await submitDialog();
  await page.waitForTimeout(1400);
  const afterFail = await cardState();
  check(!afterFail.modalOpen, 'B9 提交后弹窗关闭');
  check(
    afterFail.content === FAKE_CONTENT,
    'B10 写接口失败时乐观值已回滚（内容恢复原值）',
    afterFail.content.slice(0, 30)
  );
  check(afterFail.editDisabled === false, 'B11 失败后按钮可再次点击', `disabled=${afterFail.editDisabled}`);
  check(/失败|错误|不存在|无权限/.test(afterFail.notice), 'B12 失败有可见提示', afterFail.notice.slice(0, 40));
} else {
  check(false, 'B9~B12 编辑弹窗未弹出，失败路径无法验证');
}

// ── B13 编辑成功执行一次 ────────────────────────────────────
writeMode = 'ok';
await page.waitForTimeout(400);
await clickEntry('编辑');
await page.waitForTimeout(600);
if ((await dialogState())?.visible) {
  await fillPrompt(EDITED_CONTENT);
  await submitDialog();
  await page.waitForTimeout(700);
  const afterEdit = await cardState();
  check(afterEdit.content === EDITED_CONTENT, 'B13 编辑成功执行一次（卡片内容已更新）', afterEdit.content.slice(0, 30));
} else {
  check(false, 'B13 编辑弹窗未弹出，成功路径无法验证');
}

// ── B14 删除成功执行一次 ────────────────────────────────────
// 注：写操作成功后会排一个 3s 静默刷新，必须在它把假数据拉回来之前断言
await page.waitForTimeout(400);
await clickEntry('删除');
await page.waitForTimeout(700);
const delPrompt = await dialogState();
check(delPrompt?.visible === true, 'B14 点「删除」后确认弹窗真实弹出', delPrompt ? `${delPrompt.w}px` : '无弹窗');
check(delPrompt?.confirmText === '删除', 'B15 删除弹窗主按钮文案明确', delPrompt?.confirmText || '');
await page.screenshot({ path: `${OUT_DIR}/delete-dialog.png` });

if (delPrompt?.visible) {
  await submitDialog();
  await page.waitForTimeout(600);
  const afterDel = await cardState();
  note(`删除请求响应：${writeResponses.join(' | ') || '(无写请求)'}`);
  check(
    afterDel.count === 0,
    'B16 删除成功执行一次（卡片已从列表移除）',
    `剩 ${afterDel.count} 张 · notice="${afterDel.notice}"`
  );
  check(!afterDel.modalOpen, 'B17 删除后弹窗关闭');
  await page.screenshot({ path: `${OUT_DIR}/after-delete.png` });
} else {
  check(false, 'B16~B17 删除弹窗未弹出，成功路径无法验证');
}

section('汇总');
results.push(`\n${pass} passed / ${fail} failed`);
writeFileSync(`${OUT_DIR}/report.txt`, results.join('\n'), 'utf8');
console.log(results.join('\n'));

await browser.close();
process.exit(fail > 0 ? 1 : 0);
