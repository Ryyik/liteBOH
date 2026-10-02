import { chromium } from 'playwright';

/* 反证探针：帖子详情弹窗 chunk 加载失败链路（2026-10-02）
   背景：部署窗口期旧入口 import 旧 hash chunk 404 → defineAsyncComponent
   无 errorComponent 时渲染为空 → 「空白弹窗」。修复后应：
     A. chunk 失败 → 自动重试 ≥2 次 → 重试耗尽显示错误态（DEV 不强刷）；
     B. chunk 正常 → 弹窗内渲染出详情内容。
   入口：dev 下页面内动态 import 同一模块实例 usePostDetailModal().open(id)，
   直接驱动全局弹窗宿主（App.vue 挂载），绕开列表/登录环节。
   注意 Playwright route 按注册逆序匹配 → catch-all 必须最先注册。 */

const BASE = process.env.BASE || 'http://localhost:5173';
let pass = 0;
let fail = 0;
const results = [];
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const POST_ROW = {
  id: '00000000-0000-0000-0000-00000000a001',
  title: '探针详情帖',
  content: '这是探针用的帖子正文内容，用于验证弹窗渲染是否正常。',
  body: '这是探针用的帖子正文内容，用于验证弹窗渲染是否正常。',
  tag: 'daily',
  kind: 'post',
  author_id: '00000000-0000-0000-0000-00000000b001',
  author_username: 'probe_user',
  status: 'approved',
  comment_count: 2,
  like_count: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  author: { avatar_url: '', avatar_frame_url: null },
};

const JSON_ARR = (rows) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'content-range': '0-' + Math.max(rows.length - 1, 0) + '/' + rows.length },
  body: JSON.stringify(rows),
});

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const openPage = async ({ chunkFailure = false } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));

  let chunkHits = 0;
  if (chunkFailure) {
    await page.route('**/src/views/PostDetail/PostDetailMain.vue**', (route) => {
      chunkHits += 1;
      return route.abort('failed');
    });
  }
  // catch-all 先注册（逆序匹配 → 专门 mock 后注册优先命中）
  await page.route('**/rest/v1/**', (route) => route.fulfill(JSON_ARR([])));
  await page.route('**/rest/v1/forum_post_images**', (route) => route.fulfill(JSON_ARR([])));
  // supabase-js .single() 带 Accept: vnd.pgrst.object+json → 返回对象；列表查询返回数组
  await page.route('**/rest/v1/posts**', (route) => {
    const accept = String(route.request().headers()['accept'] || '');
    if (accept.includes('vnd.pgrst.object')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(POST_ROW),
      });
    }
    return route.fulfill(JSON_ARR([POST_ROW]));
  });

  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, {
    timeout: 20000,
  });
  await page.waitForTimeout(2000);

  // 直接驱动全局单例弹窗：同一模块实例
  await page.evaluate(async (id) => {
    const mod = await import('/src/composables/usePostDetailModal.js');
    mod.usePostDetailModal().open(id);
  }, POST_ROW.id);
  return {
    page,
    errors,
    chunkHitsRef: {
      get hits() {
        return chunkHits;
      },
    },
  };
};

/* ── 场景 A：chunk 失败 → 重试 + 错误态（不再空白） ── */
{
  const { page, chunkHitsRef, errors } = await openPage({ chunkFailure: true });
  await page.waitForTimeout(7000);

  const modal = await page.evaluate(() => {
    const overlay = document.querySelector('.pd-modal-overlay');
    if (!overlay) return { overlay: false };
    return {
      overlay: true,
      hasError: !!overlay.querySelector('.pd-modal-error'),
      errorText: (overlay.querySelector('.pd-modal-error-text')?.textContent || '').trim(),
      hasRetryBtn: !!overlay.querySelector('.pd-modal-error-retry'),
      bodyBlank: (overlay.querySelector('.pd-modal-panel')?.textContent || '').trim().length === 0,
    };
  });
  await page.screenshot({ path: 'debug-screenshots/pd-modal-chunk-fail.png' });

  check('A1 弹窗壳出现', modal.overlay === true);
  check(
    'A2 错误态组件出现（非空白）',
    modal.hasError === true && modal.hasRetryBtn === true,
    'errorText=' + modal.errorText,
  );
  check('A3 内容不再是无声空白（有兜底文案）', modal.bodyBlank === false);
  check(
    'A4 chunk 拦截生效（loader 确实失败）',
    chunkHitsRef.hits >= 1,
    'hits=' + chunkHitsRef.hits,
  );
  check(
    'A5 DEV 下不发起强刷（URL 无 __boh_update）',
    !page.url().includes('__boh_update'),
    page.url(),
  );
  check('A6 无页面 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

/* ── 场景 B：chunk 正常 → 详情内容渲染 ── */
{
  const { page, errors } = await openPage({ chunkFailure: false });
  await page.waitForTimeout(6000);

  const modal = await page.evaluate(() => {
    const overlay = document.querySelector('.pd-modal-overlay');
    if (!overlay) return { overlay: false };
    const main = overlay.querySelector('.post-detail-page');
    return {
      overlay: true,
      mainExists: !!main,
      textLen: main ? (main.textContent || '').trim().length : 0,
      hasError: !!overlay.querySelector('.pd-modal-error'),
      titleText: (overlay.querySelector('.pd-title')?.textContent || '').trim(),
    };
  });
  await page.screenshot({ path: 'debug-screenshots/pd-modal-chunk-ok.png' });

  check('B1 弹窗壳出现', modal.overlay === true);
  check('B2 详情内容渲染（.post-detail-page）', modal.mainExists === true);
  check('B3 内容非空（文本 > 50 字符）', modal.textLen > 50, 'textLen=' + modal.textLen);
  check('B4 帖子标题正确渲染', modal.titleText.includes('探针详情帖'), 'title=' + modal.titleText);
  check('B5 无错误态误报', modal.hasError === false);
  check('B6 无页面 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

await browser.close();
console.log(results.join('\n'));
console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
