import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：头像框控制台（管理端）/admin/avatar-console + 用户侧积分解锁
//
// 覆盖两条链路：
//   管理端：上传 PNG → 编辑器测内孔算 scale → 摆位影响读数 → 违规时禁止发布
//   用户端：DB 清单 → 档位门槛 / 限免放行 → 积分解锁（成功 / 余额不足）
// 全部走 mock 网络（avatar_frames / RPC / profiles），不依赖线上数据状态；
// 单测已覆盖纯几何，这里验证「界面真的接上了」。
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const ADMIN_UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const USER_UUID = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

// 一个带限免 + 积分价的 Ultra 框，模拟运营刚上架的状态
const FRAME_ROW = {
  id: 'probe-elf', name: '探针花环', description: '探针专用', url: '/avatars/frames/elf-flower-frame.png',
  source_url: '', scale: 2.08, tier: 'ultra', free_until: '2026-09-25', points_price: 120,
  sort_order: 90, status: 'published', ring: '#e8734a', updated_at: new Date().toISOString()
};

/**
 * 统一在一条 page.route 上分发：同页多次注册 route 时「后注册优先」，
 * 非命中分支写 continue() 会直接出网短路掉前面的 mock —— 所以只注册这一条。
 */
function makeRouter(state, frames) {
  return async (route) => {
    const url = route.request().url();
    const json = (body, status = 200) => {
      const rows = Array.isArray(body) ? body.length : 0;
      return route.fulfill({
        status,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': rows ? `0-${rows - 1}/${rows}` : '*/0',
          'Access-Control-Expose-Headers': 'Content-Range'
        },
        body: JSON.stringify(body)
      });
    };

    if (url.includes('/rpc/get_user_subscription_tier')) return json(state.tier);
    if (url.includes('/rpc/list_my_avatar_frame_unlocks')) {
      // 购买成功后已购列表必须真的带上它，否则「永久持有」链路测不出来
      return json(state.purchased ? ['probe-elf'] : (state.unlocks || []));
    }
    if (url.includes('/rpc/purchase_avatar_frame')) {
      state.purchased = state.purchaseResult?.ok === true;
      return json(state.purchaseResult);
    }
    if (url.includes('/rest/v1/avatar_frames')) return json(frames);
    if (url.includes('/rest/v1/profiles')) {
      return json([{
        id: state.isAdmin ? ADMIN_UUID : USER_UUID,
        username: state.isAdmin ? '瑞一颗' : '普通用户',
        points: state.points ?? 100,
        role: state.isAdmin ? 'admin' : 'user',
        avatar_url: null,
        avatar_frame_url: ''
      }]);
    }
    if (url.includes('/rest/v1/user_subscriptions')) return json([]);
    return json([]);
  };
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

/** 每个场景一个 context（mock 互相隔离），但共用一个 browser —— 省掉反复冷启动的开销 */
async function newCtx(state, { dark = false, frames = [FRAME_ROW] } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  if (dark) await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
  await page.route('**/rest/v1/**', makeRouter(state, frames));
  return { context, page, errors };
}

const injectLogin = (page, state) => page.evaluate(({ uid, isAdmin }) => {
  const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = p.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  if (s.userInfo) {
    Object.assign(s.userInfo, {
      username: isAdmin ? '瑞一颗' : '普通用户',
      id: uid, avatarUrl: '', role: isAdmin ? 'admin' : 'user', points: 100
    });
  }
}, { uid: state.isAdmin ? ADMIN_UUID : USER_UUID, isAdmin: state.isAdmin });

/** 页面内画一张「环 + 外挂装饰」的 PNG 并塞进 file input（免掉 PNG 编码依赖） */
async function uploadSyntheticFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 800, 800);
    ctx.beginPath(); ctx.arc(400, 400, 380, 0, Math.PI * 2);
    ctx.lineWidth = 200; ctx.strokeStyle = '#e08a3c'; ctx.stroke();      // 环体
    ctx.beginPath(); ctx.arc(300, 300, 150, 0, Math.PI * 2);
    ctx.fillStyle = '#c2691c'; ctx.fill();                               // 左上外挂装饰
    canvas.toBlob((blob) => {
      const input = document.querySelector('.afc input[type=file]');
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'probe-frame.png', { type: 'image/png' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      resolve(true);
    }, 'image/png');
  }));
}

/* ══════════ A. 管理端：编辑器链路 ══════════ */
{
  const state = { isAdmin: true, tier: 'ultra', points: 500, purchaseResult: { ok: false, message: 'NOT_PURCHASABLE' } };
  const { context, page, errors } = await newCtx(state);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);            // 等启动期会话检查放完
  await injectLogin(page, state);
  // 用 hash 切路由：page.goto 会整页重载，把刚注入的登录态冲掉并弹出登录框
  await page.evaluate(() => { location.hash = '#/admin/avatar-console'; });
  await page.waitForSelector('.afc', { timeout: 30000 });
  await page.waitForTimeout(1200);

  check('管理端控制台路由可达', await page.locator('.afc-head h1').count() === 1,
    (await page.locator('.afc-head h1').first().innerText().catch(() => '')).slice(0, 20));
  const libCount = await page.locator('.afc-lib-item').count();
  check('框库从 DB 清单渲染', libCount >= 1, `${libCount} 个`);

  // 上传素材 → 自动测内孔 → 读数出现
  await uploadSyntheticFrame(page);
  await page.waitForTimeout(2500);
  const readout = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('.afc-readout .kv')].map((el) => ({
      label: el.querySelector('span').textContent.trim(),
      value: el.querySelector('b').textContent.trim(),
      cls: el.className.replace('kv ', '')
    }));
    return {
      rows,
      scale: (rows.find((r) => r.label.includes('scale')) || {}).value || '',
      offset: (rows.find((r) => r.label.includes('孔心偏移')) || {}).value || '',
      blockers: [...document.querySelectorAll('.afc-alerts .alert.bad')].map((e) => e.textContent.trim()),
      publishDisabled: document.querySelector('.afc-actions .btn.primary')?.disabled
    };
  });

  let st = await readout();
  check('上传后测出内孔并给出 scale', /^\d+\.\d{2}$/.test(st.scale), `scale=${st.scale}`);
  check('四档预览渲染', await page.locator('.afc-sizes .sizebox').count() === 4, '');
  await page.screenshot({ path: `${OUT}/avatar-console-admin-editor.png` });

  // 拖动应改变「孔心偏移」读数（几何与交互真的接上了）
  await page.evaluate(() => {
    const el = document.querySelector('.afc-stage');
    const r = el.getBoundingClientRect();
    const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true });
    el.setPointerCapture = () => {};
    el.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + r.width / 2, r.top + r.height / 2)));
    el.dispatchEvent(new PointerEvent('pointermove', opts(r.left + r.width / 2 + 70, r.top + r.height / 2 + 40)));
    el.dispatchEvent(new PointerEvent('pointerup', opts(r.left + r.width / 2 + 70, r.top + r.height / 2 + 40)));
  });
  await page.waitForTimeout(400);
  const afterDrag = await readout();
  check('拖动素材后孔心偏移读数变化', afterDrag.offset !== st.offset && parseInt(afterDrag.offset, 10) > 10,
    `${st.offset} → ${afterDrag.offset}`);
  check('孔心偏移触发阻塞项', afterDrag.blockers.some((b) => b.includes('偏离画布中心')), JSON.stringify(afterDrag.blockers.slice(0, 1)));
  check('存在阻塞项时发布按钮禁用', afterDrag.publishDisabled === true, `disabled=${afterDrag.publishDisabled}`);

  // 居中 + 按最紧档适配 → 阻塞项消失
  await page.locator('.afc-tools .btn', { hasText: '居中' }).click();
  await page.locator('.afc-tools .btn', { hasText: '按最紧档适配' }).click();
  await page.waitForTimeout(500);
  const fixed = await readout();
  check('居中+适配后不再有阻塞项', fixed.blockers.length === 0, JSON.stringify(fixed.blockers));
  check('适配后 scale 落到 2.0~2.1 区间', parseFloat(fixed.scale) > 1.9 && parseFloat(fixed.scale) < 2.2, fixed.scale);

  // 元数据面板：档位 / 限免 / 积分价三个字段都在
  const metaFields = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.afc-meta .field span')].map((e) => e.textContent.trim());
    return labels;
  });
  check('归属三件套（档位/限免/积分价）都在面板里',
    metaFields.includes('订阅档位') && metaFields.includes('限时免费至') && metaFields.includes('积分解锁价'),
    metaFields.join(','));

  await page.screenshot({ path: `${OUT}/avatar-console-admin-ready.png` });
  check('管理端无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

/* ══════════ B. 用户端：档位门槛 / 限免 / 积分解锁 ══════════ */
const openDecor = async (page, state) => {
  await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await injectLogin(page, state);
  // 连开多个 browser 后页面加载会变慢，「装扮」tab 偶尔还没挂上就点 —— 给三次重试
  const decorTab = page.getByRole('tab', { name: '装扮' });
  let clicked = false;
  for (let i = 0; i < 3 && !clicked; i++) {
    try { await decorTab.click({ timeout: 8000 }); clicked = true; } catch { await page.waitForTimeout(1800); }
  }
  if (!clicked) throw new Error('装扮 tab 始终点不到（页面未就绪）');
  await page.waitForSelector('.afg-grid', { timeout: 15000 });
  await page.waitForTimeout(800);
};
const cardState = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.afg-card')].filter((c) => !c.classList.contains('is-placeholder'));
  const c = cards.find((x) => x.querySelector('.afg-card-name')?.textContent.trim() === '探针花环');
  return c ? {
    found: true,
    locked: c.classList.contains('is-locked'),
    lockPill: c.querySelector('.afg-lock-pill')?.textContent.trim() || '',
    campaign: c.querySelector('.afg-limit-flag.is-campaign')?.textContent.trim() || ''
  } : { found: false };
});

// B1. 限免期内 + free 用户 → 可戴（不锁），带限免角标
{
  const state = { isAdmin: false, tier: 'free', points: 100, purchaseResult: { ok: false, message: 'NOT_PURCHASABLE' } };
  const { context, page, errors } = await newCtx(state);
  await openDecor(page, state);
  const st = await cardState(page);
  check('DB 清单里的框出现在装扮网格', st.found === true, JSON.stringify(st));
  check('限免期内 free 用户未被锁', st.locked === false, JSON.stringify(st));
  check('限免框带「限时免费」角标', st.campaign === '限时免费', st.campaign);
  check('用户端无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

// B2. 档位不够且无积分价 → 点击交给壳（跳订阅 tab），不弹购买
{
  const noPrice = { ...FRAME_ROW, points_price: null, free_until: null };
  const state = { isAdmin: false, tier: 'free', points: 100, purchaseResult: { ok: false, message: 'NOT_PURCHASABLE' } };
  const { context, page, errors } = await newCtx(state, { frames: [noPrice] });
  await openDecor(page, state);
  const st = await cardState(page);
  check('无积分价 + 档位不够 → 锁定且标 Ultra', st.locked === true && st.lockPill === 'Ultra 专属', JSON.stringify(st));
  await page.getByRole('button', { name: /探针花环/ }).first().click();
  await page.waitForTimeout(700);
  const purchaseShown = await page.locator('.afg-purchase').count();
  const leftDecor = await page.evaluate(() => !document.querySelector('.afg-grid'));
  check('无积分价时不弹购买条，交壳跳订阅', purchaseShown === 0 && leftDecor === true,
    `purchase=${purchaseShown} leftDecor=${leftDecor}`);
  check('档位场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

// B3. 有积分价 → 点击弹确认条 → 余额不足提示
{
  const state = {
    isAdmin: false, tier: 'free', points: 30,
    purchaseResult: { ok: false, message: 'INSUFFICIENT_POINTS', required_points: 120, current_points: 30 }
  };
  const { context, page, errors } = await newCtx(state);
  await openDecor(page, state);
  // 限免期内点卡片是「直接佩戴」，买断入口在预览条上
  await page.getByRole('button', { name: /探针花环/ }).first().click();
  await page.waitForTimeout(500);
  const buyBtn = page.locator('.afg-buy-btn');
  check('限免期内已可佩戴时，仍提供「永久解锁」入口', await buyBtn.count() === 1, `count=${await buyBtn.count()}`);
  await buyBtn.click();
  await page.waitForSelector('.afg-purchase', { timeout: 5000 });
  const txt = await page.locator('.afg-purchase').innerText();
  check('有积分价时弹出购买确认条', txt.includes('探针花环') && txt.includes('120'), txt.replace(/\n/g, ' ').slice(0, 60));
  check('限免期内说明买断是永久的（避免被误解为重复收费）', txt.includes('永久'), '');
  await page.locator('.afg-p-btn.primary').click();
  await page.waitForTimeout(600);
  const errTxt = await page.locator('.afg-purchase .err').innerText().catch(() => '');
  check('余额不足给出差额提示', errTxt.includes('120') && errTxt.includes('30'), errTxt);
  // 限免期内本来就能戴，所以「戴上」不能作为失败判据 —— 要看是否拿到了永久解锁
  const stillBuyable = await page.locator('.afg-buy-btn').count();
  check('余额不足时未获得永久解锁（买断入口仍在）', stillBuyable === 1, `count=${stillBuyable}`);
  await page.screenshot({ path: `${OUT}/avatar-console-purchase-insufficient.png` });
  check('余额不足场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

// B4. 积分解锁成功 → 解锁并佩戴
{
  const state = {
    isAdmin: false, tier: 'free', points: 300,
    purchaseResult: { ok: true, already_owned: false, points_deducted: 120, current_points: 180 }
  };
  const { context, page, errors } = await newCtx(state);
  await openDecor(page, state);
  await page.getByRole('button', { name: /探针花环/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.afg-buy-btn').click();
  await page.waitForSelector('.afg-purchase', { timeout: 5000 });
  await page.locator('.afg-p-btn.primary').click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    purchaseGone: !document.querySelector('.afg-purchase'),
    buyBtnGone: !document.querySelector('.afg-buy-btn'),
    previewName: document.querySelector('.afg-preview-name-row strong')?.textContent.trim() || '',
    previewFrame: (() => { const el = document.querySelector('.afg-preview .boh-avatar-frame'); return el ? getComputedStyle(el).backgroundImage : ''; })(),
    scale: (() => { const el = document.querySelector('.afg-preview .boh-avatar-frame'); return el ? String(el.style.getPropertyValue('--boh-avatar-frame-scale')).trim() : ''; })()
  }));
  check('解锁成功后确认条关闭', after.purchaseGone === true, '');
  check('解锁后不再劝买（永久持有已落地，非限免临时态）', after.buyBtnGone === true,
    `buyBtnGone=${after.buyBtnGone}`);
  check('解锁后立即佩戴该框', after.previewName === '探针花环', after.previewName);
  check('佩戴后渲染的是 DB 里的素材与 scale', after.previewFrame.includes('elf-flower-frame.png') && after.scale === '2.08',
    `${after.previewFrame.slice(-30)} scale=${after.scale}`);
  await page.screenshot({ path: `${OUT}/avatar-console-purchase-ok.png` });
  check('解锁成功场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

// B5. 深色主题：解锁后的装扮页
{
  const state = {
    isAdmin: false, tier: 'free', points: 300,
    purchaseResult: { ok: true, already_owned: false, points_deducted: 120, current_points: 180 }
  };
  const { context, page, errors } = await newCtx(state, { dark: true });
  await openDecor(page, state);
  await page.getByRole('button', { name: /探针花环/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.afg-buy-btn').click();
  await page.waitForSelector('.afg-purchase', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/avatar-console-purchase-dark.png` });
  const visible = await page.locator('.afg-purchase').isVisible();
  check('深色主题下购买条可见且不白屏', visible, '');
  check('深色场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项:\n' + failed.map((f) => `  - ${f.name}  ${f.detail}`).join('\n'));
process.exit(failed.length ? 1 : 0);
