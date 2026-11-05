import fs from 'node:fs';
import { chromium } from 'playwright';

// 发帖图片编辑器探针（P0，2026-11-05 落地）
//
// 覆盖「流法 C」全链路：系统面板选图 → 确认页（横滑 + 编辑/移除/全部确认）→
// 确认后回填网格启动管线 → 网格画笔角标再编辑（编辑产物重启管线保位）。
// 编辑器本体：裁切（vue-advanced-cropper 自由比例）/ 旋转 90° / 水平翻转 /
// 撤销栈（上限 30，见 useImageEditorDoc 单测的纯逻辑部分，这里只测接线）。
//
// 断言（反证敏感对标注 *）：
//   A1* 选图后先出确认页：2 张卡片 + 每张「编辑/移除」+「全部确认」（删确认页直接选图 → 红）
//   A2* 确认前网格零缩略图（编辑发生在上传前 = 流法 C 锚点）
//   A3  移除一张 → 剩 1 张卡片
//   B1  「编辑」进编辑器：标题/工具条三键（撤销/旋转/翻转），确认页入口的取消文案是「返回」
//   B2  初始撤销 disabled（命令栈空）
//   B3* 旋转 → 撤销 enabled + 裁切图上屏（cropper 内 blob 图）（不重渲染预览 → 红）
//   B4  翻转 → 仍 enabled
//   B5* 撤销×2 → 撤销回到 disabled（栈清空；撤销不生效 → 红）
//   B6  旋转 → 完成 → 返回确认页，卡片带「已编辑」徽标
//   C1  全部确认 → 确认页关闭 → 网格 1 张缩略图
//   C2  网格缩略图带画笔角标
//   C3  画笔 → 编辑器（单图再编辑，取消文案「取消」）
//   C4  取消 → 编辑器关闭，网格仍 1 张（未动）
//   C5* 画笔 → 旋转 → 完成 → 网格仍 1 张（编辑重启管线且保位；丢失/重复 → 红）
//   D1/D2 桌面 1440×900：确认页与编辑器卡片居中限宽（≤900px，居中偏差 ≤40px）
//   E    全程无 pageerror
//
// 运行：node scripts/probes/probe-image-editor.mjs（需 dev server 5173）

const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/probe-image-editor';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail ? '— ' + detail : '');
  } else {
    fail += 1;
    console.log('FAIL ', name, detail ? '— ' + detail : '');
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

/** 生成一张可快速压缩的渐变图（内容无关，编辑器链路只关心尺寸与解码） */
async function makeGradientPng(page, hue) {
  return page.evaluate(async (h) => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 720, 540);
    grad.addColorStop(0, `hsl(${h}, 80%, 60%)`);
    grad.addColorStop(1, `hsl(${(h + 120) % 360}, 70%, 35%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 540);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(`#${h}`, 40, 90);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }, hue);
}

const injectAuth = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
  // ⚠️ auth store 会异步恢复会话并覆写 state，单次注入会被冲掉 ——
  // 与 probe-composer-session-gate 同款：连续注入 5 次（每次隔 350ms）钉住状态
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000004',
        username: 'probe_image_editor',
        role: 'user',
        points: 42,
      });
    });
    await page.waitForTimeout(350);
  }
};

async function openPortraitComposer() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'light');
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  // 审核与上传断流：本探针只测编辑链路与网格接线，不测上传结果
  await page.route('**/functions/v1/api-key-vault*', (route) => route.abort('failed'));
  await page.route('**/api.cloudinary.com/**', (route) => route.abort('failed'));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  const fab = page.locator('.mobile-compose-fab').first();
  await fab.waitFor({ state: 'visible', timeout: 15000 });
  await fab.click();
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(500);
  return { context, page };
}

// =====================================================================
// 竖屏 390×844：主战场
// =====================================================================
{
  const { context, page } = await openPortraitComposer();
  const png1 = await makeGradientPng(page, 10);
  const png2 = await makeGradientPng(page, 200);
  const overlay = page.locator('.imgedit-overlay');

  // —— A：确认页（流法 C）——
  await page.setInputFiles('.mobile-composer-overlay .post-image-input', [
    { name: 'probe-edit-a.png', mimeType: 'image/png', buffer: Buffer.from(png1) },
    { name: 'probe-edit-b.png', mimeType: 'image/png', buffer: Buffer.from(png2) },
  ]);
  await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  const cardCount = await page.locator('.imgedit-overlay .imgedit-card').count();
  const editBtnCount = await page.locator('.imgedit-overlay .imgedit-card-btn', { hasText: '编辑' }).count();
  const removeBtnCount = await page.locator('.imgedit-overlay .imgedit-card-btn', { hasText: '移除' }).count();
  check(
    'A1 选图后先出确认页（2 卡片 + 编辑/移除 + 全部确认）',
    (await overlay.isVisible().catch(() => false)) &&
      cardCount === 2 &&
      editBtnCount === 2 &&
      removeBtnCount === 2 &&
      (await page.locator('.imgedit-overlay .imgedit-head-primary', { hasText: '全部确认' }).isVisible()),
    `cards=${cardCount} edit=${editBtnCount} remove=${removeBtnCount}`,
  );
  const gridCountBefore = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check('A2 确认前网格零缩略图', gridCountBefore === 0, `count=${gridCountBefore}`);

  // A3：移除第二张
  await page.locator('.imgedit-overlay .imgedit-card', { hasText: '移除' }).nth(1).getByRole('button', { name: /移除/ }).click();
  await page.waitForTimeout(400);
  const cardCountAfterRemove = await page.locator('.imgedit-overlay .imgedit-card').count();
  check('A3 移除一张后剩 1 张卡片', cardCountAfterRemove === 1, `count=${cardCountAfterRemove}`);

  // —— B：编辑器（命令栈 + 预览重渲染）——
  await page.locator('.imgedit-overlay .imgedit-card-btn', { hasText: '编辑' }).first().click();
  await page.waitForTimeout(600);
  const editorTitle = (await page.locator('.imgedit-overlay .imgedit-head-title').textContent()) || '';
  const toolLabels = await page.locator('.imgedit-overlay .imgedit-tool span').allTextContents();
  const backLabel = (await page.locator('.imgedit-overlay .imgedit-head-btn').textContent()) || '';
  check(
    'B1 编辑器视图（标题 + 撤销/旋转/翻转 + 确认页入口「返回」）',
    editorTitle.trim() === '编辑图片' &&
      toolLabels.join(',') === '撤销,旋转,翻转' &&
      backLabel.trim() === '返回',
    `title=${editorTitle.trim()} tools=${toolLabels.join(',')}`,
  );
  const undoBtn = page.locator('.imgedit-overlay .imgedit-tool', { hasText: '撤销' }).first();
  const undoDisabledInitial = await undoBtn.isDisabled();
  check('B2 初始撤销 disabled（命令栈空）', undoDisabledInitial === true);

  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '旋转' }).click();
  await page.waitForTimeout(900);
  const cropperImg = page.locator('.imgedit-overlay .imgedit-cropper img').first();
  const cropperImgVisible = await cropperImg.isVisible().catch(() => false);
  const cropperImgSrc = (await cropperImg.getAttribute('src').catch(() => '')) || '';
  check(
    'B3 旋转后撤销 enabled + 裁切图上屏（blob 预览）',
    (await undoBtn.isDisabled()) === false && cropperImgVisible && cropperImgSrc.startsWith('blob:'),
    `src=${cropperImgSrc.slice(0, 24)}`,
  );
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '翻转' }).click();
  await page.waitForTimeout(500);
  check('B4 翻转后撤销仍 enabled', (await undoBtn.isDisabled()) === false);
  await undoBtn.click();
  await page.waitForTimeout(300);
  await undoBtn.click();
  await page.waitForTimeout(300);
  check('B5 撤销×2 后回到 disabled（栈清空）', (await undoBtn.isDisabled()) === true);

  // B6：旋转一次 → 完成 → 已编辑徽标
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '旋转' }).click();
  await page.waitForTimeout(500);
  await page.locator('.imgedit-overlay .imgedit-head-primary', { hasText: '完成' }).click();
  await page.waitForTimeout(800);
  const editedBadge = await page.locator('.imgedit-overlay .imgedit-card-edited').count();
  const confirmTitle = (await page.locator('.imgedit-overlay .imgedit-head-title').textContent()) || '';
  check(
    'B6 完成后返回确认页且带「已编辑」徽标',
    confirmTitle.trim() === '确认图片' && editedBadge === 1,
    `badge=${editedBadge}`,
  );

  // —— C：全部确认 → 网格 → 画笔再编辑 ——
  await page.locator('.imgedit-overlay .imgedit-head-primary', { hasText: '全部确认' }).click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  const gridImg = page.locator('.mobile-composer-overlay .post-image-preview-grid img').first();
  await gridImg.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check('C1 全部确认后网格回填 1 张缩略图', (await gridImg.isVisible().catch(() => false)) === true);

  const pencil = page.locator('.mobile-composer-overlay .post-image-edit-btn').first();
  await pencil.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  check('C2 网格缩略图带画笔角标', (await pencil.isVisible().catch(() => false)) === true);

  // C3/C4：画笔 → 编辑器（mode=edit，取消文案「取消」）→ 取消 → 网格不动
  await pencil.click();
  await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
  const editModeCancel = (await page.locator('.imgedit-overlay .imgedit-head-btn').textContent()) || '';
  check(
    'C3 画笔进入单图编辑器（取消文案「取消」）',
    editModeCancel.trim() === '取消' &&
      (await overlay.isVisible().catch(() => false)) === true,
    `btn=${editModeCancel.trim()}`,
  );
  await page.locator('.imgedit-overlay .imgedit-head-btn', { hasText: '取消' }).click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  const gridCountAfterCancel = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check('C4 取消后网格仍 1 张', gridCountAfterCancel === 1, `count=${gridCountAfterCancel}`);

  // C5：画笔 → 旋转 → 完成 → 网格仍 1 张（编辑重启管线且保位）
  await pencil.click();
  await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '旋转' }).click();
  await page.waitForTimeout(600);
  await page.locator('.imgedit-overlay .imgedit-head-primary', { hasText: '完成' }).click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const gridCountAfterEdit = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check('C5 再编辑完成后网格仍 1 张（重启管线保位）', gridCountAfterEdit === 1, `count=${gridCountAfterEdit}`);

  await page.screenshot({ path: `${OUT}/portrait-final.png` });
  await context.close();
}

// =====================================================================
// 横屏 1440×900：桌面顺带适配（卡片居中限宽）
// =====================================================================
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'light');
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.route('**/functions/v1/api-key-vault*', (route) => route.abort('failed'));
  await page.route('**/api.cloudinary.com/**', (route) => route.abort('failed'));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.userspace-rail-item[data-rail-action="compose"]', { timeout: 20000 });
  // 横屏发布入口在左栏（rail 的 click 用页面内 click，避免玻璃层遮挡）
  await page.evaluate(() => {
    document.querySelector('.userspace-rail-item[data-rail-action="compose"]').click();
  });
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);
  const png = await makeGradientPng(page, 120);
  await page.setInputFiles('.mobile-composer-overlay .post-image-input', {
    name: 'probe-edit-desktop.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png),
  });
  const overlay = page.locator('.imgedit-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  const confirmBox = await page.locator('.imgedit-overlay .imgedit-confirm').boundingBox();
  check(
    'D1 桌面确认页卡片居中限宽（≤900px，居中偏差 ≤40px）',
    Boolean(confirmBox) && confirmBox.width <= 900 && Math.abs(confirmBox.x + confirmBox.width / 2 - 720) <= 40,
    confirmBox ? `w=${Math.round(confirmBox.width)} x=${Math.round(confirmBox.x)}` : 'null',
  );
  await page.locator('.imgedit-overlay .imgedit-card-btn', { hasText: '编辑' }).first().click();
  await page.waitForTimeout(800);
  const editorBox = await page.locator('.imgedit-overlay .imgedit-editor').boundingBox();
  const stageVisible = await page.locator('.imgedit-overlay .imgedit-stage').isVisible().catch(() => false);
  check(
    'D2 桌面编辑器卡片居中限宽 + 舞台可见',
    Boolean(editorBox) &&
      editorBox.width <= 900 &&
      Math.abs(editorBox.x + editorBox.width / 2 - 720) <= 40 &&
      stageVisible,
    editorBox ? `w=${Math.round(editorBox.width)} x=${Math.round(editorBox.x)}` : 'null',
  );
  await page.screenshot({ path: `${OUT}/desktop-editor.png` });
  await context.close();
}

check('E 全程无 pageerror', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : '');
console.log(`RESULT: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
