import fs from 'node:fs';
import { chromium } from 'playwright';

// 发帖图片编辑器探针（2026-11-05：P0 骨架 + 滤镜 + 猫贴纸遮挡 + UI 对齐发帖器）
//
// 覆盖「流法 C」全链路：系统面板选图 → 确认页（一屏一张大图 + 编辑/移除 +
// 全部确认）→ 确认后回填网格启动管线 → 网格画笔角标再编辑（产物重启管线保位）。
// 编辑器本体：裁切（vue-advanced-cropper 自由比例）/ 左右各转 90° / 水平翻转 /
// 滤镜预设（CSS filter，导出走 ctx.filter）/ 猫贴纸（拖动 = 遮挡，canvas 合成）/
// 撤销栈（上限 30，纯逻辑见 useImageEditorDoc 单测）。
//
// 断言（反证敏感对标注 *）：
//   A1* 选图后先出确认页：2 张 slide + 编辑本张/移除 + 全部确认（删确认页直接选图 → 红）
//   A2* 确认前网格零缩略图（编辑发生在上传前 = 流法 C 锚点）
//   A3  移除一张 → 剩 1 张 slide
//   B1  编辑器：标题「编辑图片」+ 工具条五项（裁切/旋转/滤镜/贴纸/撤销）+「返回」
//   B2  初始撤销 disabled（命令栈空）
//   B3* 旋转面板「右转 90°」→ 撤销 enabled（不重渲染预览 → 红）
//   B4* 滤镜面板 12 档；点「黑白」→ chip 选中 + 图片 computed filter 含 grayscale(1)
//       且胶片物理层（泛光/染色/提黑场/颗粒/暗角）真的挂上了 + 强度滑块出现
//   B4b 微调 5 项可展开；颗粒 180% 真的改变渲染；「还原」回到预设原样
//   B4c* 微调后撤销：命令回滚且本地草稿作废（草稿盖住命令 → 画面不回落 → 红）
//   B5* 贴纸面板 10 只猫；点一只 → 浮层出现 1 枚，且浮层矩形 = 照片实际矩形（±2px）
//       （归一化坐标算错 → 贴纸位置/遮挡范围全错）
//   B6* 拖动贴纸 → 位置变化且撤销 enabled（拖动只落一条 update 命令）
//   B7  完成 → 返回确认页，slide 带「已编辑」徽标
//   C1  全部确认 → 确认页关闭 → 网格 1 张缩略图
//   C2* 网格缩略图**没有**画笔角标（「编辑/删除」两枚小圆点只隔 12px，触屏误触源）
//   C3  缩略图 → 大图预览 → 「编辑」→ 编辑器（单图再编辑，取消文案「取消」）
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
  const slideCount = await page.locator('.imgedit-overlay .imgedit-slide').count();
  const actionCount = await page.locator('.imgedit-overlay .imgedit-action').count();
  check(
    'A1 选图后先出确认页（2 slide + 编辑本张/移除 + 全部确认）',
    (await overlay.isVisible().catch(() => false)) &&
      slideCount === 2 &&
      actionCount === 2 &&
      (await page.locator('.imgedit-overlay .imgedit-pill.is-primary').isVisible()),
    `slides=${slideCount} actions=${actionCount}`,
  );
  const gridCountBefore = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check('A2 确认前网格零缩略图', gridCountBefore === 0, `count=${gridCountBefore}`);

  // A4：底栏「下一张」按钮（显式翻页入口 —— 横滑撞到浏览器边缘返回手势时会整页退出，
  // 所以这条不能只靠横滑。断言点点的选中位跟着走，而不是只断言按钮存在）
  const pageBtns = await page.locator('.imgedit-overlay .imgedit-page-btn').count();
  await page.locator('.imgedit-overlay .imgedit-page-btn').nth(1).click();
  await page.waitForTimeout(700);
  const secondDotOn = await page
    .locator('.imgedit-overlay .imgedit-dot')
    .nth(1)
    .evaluate((el) => el.classList.contains('is-on'))
    .catch(() => false);
  check(
    'A4 底栏「上一张/下一张」按钮存在且能切到第 2 张',
    pageBtns === 2 && secondDotOn === true,
    `btns=${pageBtns} onSecond=${secondDotOn}`,
  );

  // A3：移除当前张
  await page.locator('.imgedit-overlay .imgedit-action.is-danger').click();
  await page.waitForTimeout(400);
  const slideCountAfterRemove = await page.locator('.imgedit-overlay .imgedit-slide').count();
  check(
    'A3 移除一张后剩 1 张 slide',
    slideCountAfterRemove === 1,
    `count=${slideCountAfterRemove}`,
  );

  // —— B：编辑器（命令栈 + 预览重渲染）——
  await page.locator('.imgedit-overlay .imgedit-action', { hasText: '编辑本张' }).click();
  await page.waitForTimeout(700);
  const editorTitle = (await page.locator('.imgedit-overlay .imgedit-title').textContent()) || '';
  const toolLabels = await page.locator('.imgedit-overlay .imgedit-tool span').allTextContents();
  const backLabel =
    (await page.locator('.imgedit-overlay .imgedit-pill').first().textContent()) || '';
  check(
    'B1 编辑器视图（标题 + 五项工具条 + 确认页入口「返回」）',
    editorTitle.trim() === '编辑图片' &&
      toolLabels.join(',') === '裁切,旋转,滤镜,贴纸,撤销' &&
      backLabel.trim() === '返回',
    `title=${editorTitle.trim()} tools=${toolLabels.join(',')}`,
  );
  const undoBtn = page.locator('.imgedit-overlay .imgedit-tool', { hasText: '撤销' }).first();
  check('B2 初始撤销 disabled（命令栈空）', (await undoBtn.isDisabled()) === true);

  // B3：旋转面板 → 右转 90°
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '旋转' }).click();
  await page.waitForTimeout(400);
  await page.locator('.imgedit-overlay .imgedit-sheet-btn', { hasText: '右转 90°' }).click();
  await page.waitForTimeout(900);
  check('B3 旋转后撤销 enabled', (await undoBtn.isDisabled()) === false);

  // B4：滤镜（预设 12 档 + 选中态 + 图片 CSS filter + 胶片物理层）
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '滤镜' }).click();
  await page.waitForTimeout(500);
  const filterChips = await page.locator('.imgedit-overlay .imgedit-chip').count();
  await page.locator('.imgedit-overlay .imgedit-chip', { hasText: '黑白' }).click();
  await page.waitForTimeout(400);
  const monoOn = await page
    .locator('.imgedit-overlay .imgedit-chip', { hasText: '黑白' })
    .evaluate((el) => el.classList.contains('is-on'))
    .catch(() => false);
  const photoFilter = await page
    .locator('.imgedit-overlay .imgedit-photo')
    .evaluate((el) => getComputedStyle(el).filter)
    .catch(() => '');
  // 胶片层：黑白档应挂上泛光/阴影染色/高光染色/提黑场/颗粒/暗角
  const fxLayers = await page.locator('.imgedit-overlay .film-fx__layer').count();
  // 泛光是「按阈值提取高光」的小图，不是把整幅模糊后 screen（那会发灰）
  const glowSrc = await page
    .locator('.imgedit-overlay .film-fx__layer.is-glow')
    .first()
    .evaluate((el) => (el.getAttribute('src') || '').slice(0, 22))
    .catch(() => '');
  const grainBg = await page
    .locator('.imgedit-overlay .film-fx__layer')
    .evaluateAll((els) =>
      els.some((el) => (getComputedStyle(el).backgroundImage || '').includes('data:image/png')),
    )
    .catch(() => false);
  const strengthVisible = await page
    .locator('.imgedit-overlay .imgedit-strength-range')
    .isVisible()
    .catch(() => false);
  check(
    'B4 滤镜面板 12 档 + 选中「黑白」后 grayscale + 胶片层与强度滑块',
    filterChips === 12 &&
      monoOn &&
      /grayscale\(1\)/.test(photoFilter) &&
      fxLayers >= 6 &&
      glowSrc.startsWith('data:image/png') &&
      grainBg &&
      strengthVisible,
    `chips=${filterChips} fx=${fxLayers} glow=${Boolean(glowSrc)} grain=${grainBg} strength=${strengthVisible}`,
  );

  // B4b：微调（用户口径「想自己调颗粒质感」）。
  // 微调面板默认收起，展开后 5 项；把颗粒拖到 180% 必须真的改变渲染，
  // 点「还原」必须回到预设原样 —— 只看 DOM 有没有滑块是不够的。
  const readGrainOpacity = () =>
    page
      .locator('.imgedit-overlay .film-fx__layer')
      .evaluateAll((els) => {
        const grain = els.find((el) =>
          (getComputedStyle(el).backgroundImage || '').includes('data:image/png'),
        );
        return grain ? Number(getComputedStyle(grain).opacity) : -1;
      })
      .catch(() => -1);
  const grainBefore = await readGrainOpacity();
  await page.locator('.imgedit-overlay .imgedit-tune-toggle').click();
  await page.waitForTimeout(300);
  const tuneItems = await page.locator('.imgedit-overlay .imgedit-tune-item').count();
  await page
    .locator('.imgedit-overlay .imgedit-tune-item')
    .first()
    .locator('input[type="range"]')
    .evaluate((el) => {
      el.value = String(Math.min(200, Number(el.max)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await page.waitForTimeout(400);
  const grainAfter = await readGrainOpacity();

  // 「还原」把五项一次性推回默认（收起态带脏点、展开态才出现还原按钮）
  const resetVisible = await page
    .locator('.imgedit-overlay .imgedit-tune-reset')
    .isVisible()
    .catch(() => false);
  if (resetVisible) {
    await page.locator('.imgedit-overlay .imgedit-tune-reset').click();
    await page.waitForTimeout(500);
  }
  const grainReset = await readGrainOpacity();
  check(
    'B4b 微调 5 项可展开 + 颗粒倍率真的改变渲染 + 「还原」回到预设原样',
    tuneItems === 5 &&
      grainBefore > 0 &&
      grainAfter > grainBefore &&
      resetVisible &&
      Math.abs(grainReset - grainBefore) < 0.03,
    `items=${tuneItems} grain ${grainBefore}→${grainAfter}→${grainReset}`,
  );

  // 微调与强度的组合：先调颗粒再拖强度，颗粒必须跟着强度缩放、而不是被清掉。
  // filter 命令是「后写覆盖」，早先 commitFilterStrength 少带 tune 字段，
  // 于是「拖完颗粒再拖强度」= 微调静默归零（0.36→0.14 而不是 0.36×1.5×0.4）。
  await page
    .locator('.imgedit-overlay .imgedit-tune-item')
    .first()
    .locator('input[type="range"]')
    .evaluate((el) => {
      el.value = '150';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await page.waitForTimeout(500);
  const grainTuned = await readGrainOpacity();
  await page.locator('.imgedit-overlay .imgedit-strength-range').evaluate((el) => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const grainAfterStrength = await readGrainOpacity();
  const expected = grainBefore * 1.5 * 0.4;
  check(
    'B4c* 调完颗粒再拖强度：微调被保留并跟着强度缩放（少带 tune → 归零 → 红）',
    grainTuned > grainBefore + 0.05 && Math.abs(grainAfterStrength - expected) < 0.04,
    `grain 预设 ${grainBefore} → 颗粒150% ${grainTuned} → 强度40% ${grainAfterStrength}（应 ≈${expected.toFixed(2)}）`,
  );

  // B5：贴纸（10 只猫 + 浮层矩形与照片一致）
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '贴纸' }).click();
  await page.waitForTimeout(600);
  const stickerChips = await page.locator('.imgedit-overlay .imgedit-chip.is-sticker').count();
  await page.locator('.imgedit-overlay .imgedit-chip.is-sticker').first().click();
  await page.waitForTimeout(500);
  const stickerCount = await page.locator('.imgedit-overlay .imgedit-sticker').count();
  const align = await page.evaluate(() => {
    const stage = document.querySelector('.imgedit-stage')?.getBoundingClientRect();
    const layer = document.querySelector('.imgedit-sticker-layer')?.getBoundingClientRect();
    const img = document.querySelector('.imgedit-photo');
    if (!stage || !layer || !img) return null;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.min(stage.width / nw, stage.height / nh);
    return {
      layerW: Math.round(layer.width),
      expectW: Math.round(nw * scale),
      offsetLeft: Math.round(layer.left - (stage.left + (stage.width - nw * scale) / 2)),
    };
  });
  check(
    'B5 贴纸面板 10 只猫 + 浮层贴合照片矩形',
    stickerChips === 10 &&
      stickerCount === 1 &&
      Boolean(align) &&
      Math.abs(align.layerW - align.expectW) <= 2 &&
      Math.abs(align.offsetLeft) <= 2,
    align
      ? `chips=${stickerChips} layer=${align.layerW}/${align.expectW} dx=${align.offsetLeft}`
      : 'null',
  );

  // B6：拖动贴纸 → 位置变化（一条 update 命令）
  const before = await page.locator('.imgedit-overlay .imgedit-sticker').boundingBox();
  if (before) {
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 - 40, before.y + before.height / 2 - 30, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await page.waitForTimeout(400);
  const after = await page.locator('.imgedit-overlay .imgedit-sticker').boundingBox();
  check(
    'B6 拖动贴纸后位置改变',
    Boolean(before && after) && Math.abs(after.x - before.x) > 10,
    before && after ? `dx=${Math.round(after.x - before.x)}` : 'null',
  );

  // B7：完成 → 回确认页 + 已编辑徽标
  await page.screenshot({ path: `${OUT}/portrait-editor.png` });
  await page.locator('.imgedit-overlay .imgedit-pill.is-primary', { hasText: '完成' }).click();
  await page.waitForTimeout(1200);
  const editedTag = await page.locator('.imgedit-overlay .imgedit-slide-tag').count();
  const confirmTitle = (await page.locator('.imgedit-overlay .imgedit-title').textContent()) || '';
  check(
    'B7 完成后返回确认页且带「已编辑」徽标',
    confirmTitle.trim() === '确认图片' && editedTag === 1,
    `tag=${editedTag}`,
  );

  // —— C：全部确认 → 网格 → 画笔再编辑 ——
  await page.locator('.imgedit-overlay .imgedit-pill.is-primary').click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  const gridImg = page.locator('.mobile-composer-overlay .post-image-preview-grid img').first();
  await gridImg.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check(
    'C1 全部确认后网格回填 1 张缩略图',
    (await gridImg.isVisible().catch(() => false)) === true,
  );

  // C2：编辑入口**两处都在**（用户口径「里外都放一个」）：
  // 瓦片右下角的画笔 + 大图预览里的「编辑」按钮。
  // 同时校验画笔与删除钮不再贴着：两者中心纵向距离应 ≥ 50px
  const pencil = page.locator('.mobile-composer-overlay .post-image-edit-btn').first();
  const pencilVisible = await pencil.isVisible().catch(() => false);
  const gap = await page.evaluate(() => {
    const item = document.querySelector('.mobile-composer-overlay .post-image-preview-item');
    const edit = item?.querySelector('.post-image-edit-btn')?.getBoundingClientRect();
    const remove = item?.querySelector('.post-image-remove-btn')?.getBoundingClientRect();
    if (!edit || !remove) return null;
    return Math.round(
      Math.hypot(
        edit.left + edit.width / 2 - (remove.left + remove.width / 2),
        edit.top + edit.height / 2 - (remove.top + remove.height / 2),
      ),
    );
  });
  check(
    'C2 瓦片画笔角标存在且与删除钮拉开 ≥50px',
    pencilVisible && typeof gap === 'number' && gap >= 50,
    `gap=${gap}`,
  );

  const openGridEditor = async () => {
    await page.locator('.mobile-composer-overlay .post-image-preview-open').first().click();
    const editBtn = page.locator('.composer-image-preview-edit').first();
    await editBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await editBtn.click();
    await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700);
  };
  await openGridEditor();
  const editModeCancel =
    (await page.locator('.imgedit-overlay .imgedit-pill').first().textContent()) || '';
  check(
    'C3 预览「编辑」进入单图编辑器（取消文案「取消」）',
    editModeCancel.trim() === '取消' && (await overlay.isVisible().catch(() => false)) === true,
    `btn=${editModeCancel.trim()}`,
  );
  await page.locator('.imgedit-overlay .imgedit-pill', { hasText: '取消' }).click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  const gridCountAfterCancel = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check('C4 取消后网格仍 1 张', gridCountAfterCancel === 1, `count=${gridCountAfterCancel}`);

  // C5：预览编辑 → 旋转 → 完成 → 网格仍 1 张（编辑重启管线且保位）
  await openGridEditor();
  await page.waitForTimeout(400);
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '旋转' }).click();
  await page.waitForTimeout(400);
  await page.locator('.imgedit-overlay .imgedit-sheet-btn', { hasText: '右转 90°' }).click();
  await page.waitForTimeout(700);
  await page.locator('.imgedit-overlay .imgedit-pill.is-primary', { hasText: '完成' }).click();
  await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const gridCountAfterEdit = await page
    .locator('.mobile-composer-overlay .post-image-preview-grid img')
    .count();
  check(
    'C5 再编辑完成后网格仍 1 张（重启管线保位）',
    gridCountAfterEdit === 1,
    `count=${gridCountAfterEdit}`,
  );

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
  await page.waitForSelector('.userspace-rail-item[data-rail-action="compose"]', {
    timeout: 20000,
  });
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
  const confirmBox = await page.locator('.imgedit-overlay .imgedit-card').boundingBox();
  check(
    'D1 桌面确认页卡片居中限宽（≤900px，居中偏差 ≤40px）',
    Boolean(confirmBox) &&
      confirmBox.width <= 900 &&
      Math.abs(confirmBox.x + confirmBox.width / 2 - 720) <= 40,
    confirmBox ? `w=${Math.round(confirmBox.width)} x=${Math.round(confirmBox.x)}` : 'null',
  );
  await page.locator('.imgedit-overlay .imgedit-action', { hasText: '编辑本张' }).click();
  await page.waitForTimeout(900);
  const editorBox = await page.locator('.imgedit-overlay .imgedit-card').boundingBox();
  const stageVisible = await page
    .locator('.imgedit-overlay .imgedit-stage')
    .isVisible()
    .catch(() => false);
  check(
    'D2 桌面编辑器卡片居中限宽 + 舞台可见',
    Boolean(editorBox) &&
      editorBox.width <= 900 &&
      Math.abs(editorBox.x + editorBox.width / 2 - 720) <= 40 &&
      stageVisible,
    editorBox ? `w=${Math.round(editorBox.width)} x=${Math.round(editorBox.x)}` : 'null',
  );
  // D3*：横屏把面板挪到右侧（底部 sheet 会吃掉照片最缺的高度）
  // 修前实测：1440×900 下 stage 331px、photoFrame 385px（底部被裁 54px）
  await page.locator('.imgedit-overlay .imgedit-tool', { hasText: '滤镜' }).click();
  await page.waitForTimeout(700);
  const rects = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
    };
    return {
      card: pick('.imgedit-overlay .imgedit-card'),
      stage: pick('.imgedit-overlay .imgedit-stage'),
      frame: pick('.imgedit-overlay .imgedit-photo-frame'),
      sheet: pick('.imgedit-overlay .imgedit-sheet'),
    };
  });
  const fitsStage =
    rects.stage && rects.frame
      ? rects.frame.h <= rects.stage.h + 2 && rects.frame.bottom <= rects.stage.bottom + 2
      : false;
  const sideBySide = rects.stage && rects.sheet ? rects.sheet.x >= rects.stage.right - 1 : false;
  check(
    'D3 横屏侧栏：照片完整落在舞台内（无裁切）+ 面板不压照片',
    fitsStage && sideBySide,
    rects.stage
      ? `stage=${Math.round(rects.stage.w)}x${Math.round(rects.stage.h)} frame=${Math.round(
          rects.frame.w,
        )}x${Math.round(rects.frame.h)} sheet.x=${Math.round(rects.sheet?.x ?? -1)}`
      : 'null',
  );
  await page.screenshot({ path: `${OUT}/desktop-editor.png` });
  await context.close();
}

check(
  'E 全程无 pageerror',
  errors.length === 0,
  errors.length ? errors.slice(0, 4).join(' | ') : '',
);
console.log(`RESULT: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
