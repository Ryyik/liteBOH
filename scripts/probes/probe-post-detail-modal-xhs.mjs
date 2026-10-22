/**
 * probe-post-detail-modal-xhs.mjs — 横屏帖子详情弹窗「小红书对齐」差距度量器
 *
 * 定位：**度量器，不是门禁**。默认永远 exit 0，只打印「当前值 / 目标值 / 是否达标」对照表；
 * 加 `--assert` 才对 P0 项判定（用于分批实施后的验收）。
 *   node scripts/probes/probe-post-detail-modal-xhs.mjs
 *   node scripts/probes/probe-post-detail-modal-xhs.mjs --assert
 *
 * 目标值来源：小红书横屏网页版详情截图（DPR=2 的 972×734 CSS 视口，即 1944×1468 物理像素）。
 * 参考图本身不入库（外部截图），故目标值以常量固化在本文件 —— 每条都标注了实测日期与偏移。
 * 完整推导见 plans/032-post-detail-modal-xhs-alignment.md。
 *
 * ⚠️ 为什么用 972×734：参考截图就是该视口。别的视口下 `clamp()` 类字号会取不同值，
 * 拿 1440 去比会把「视口差异」误判成「设计差异」（实测：`.content-text` 在 972 取 clamp 下限 17px，
 * 在 1440 取 18.43px，在 ≥1600 取上限 19px）。
 *
 * ⚠️ 反证说明：本探针只读 DOM 计算值，不截图、不做像素比对，所以它**证明不了「看起来一样」**，
 * 只能证明「这些度量值是否到位」。像素级验收仍需人眼过 `output/xhs-align/compare-full.png` 式的对照图。
 *
 * ⚠️ 实现这批改动时必读的坑（2026-10-22 反证实测）：`modal-layout.css` 由 `<style scoped>` 的 `@import`
 * 引入（`PostDetailMain.vue:3192`），所以指向子组件内部类名的规则**必须加 `:deep()`**
 * （`.x-comments-section` / `.comment-item-x` / `.child-reply-item` 都在 `CommentThread.vue` 里）。
 * 第一版补丁漏了 `:deep()`，样式静默失效，本探针照样 FAIL；补上后立刻转 PASS。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:5173';
const POST = process.env.POST || '0ac059e1-b258-41ee-8407-0e0a5752f6a7'; // 有封面图 + 4 条评论
const ASSERT = process.argv.includes('--assert');
const VIEWPORT = { width: 972, height: 734 };

/** 目标值：小红书横屏详情（972×734 CSS，2026-10-22 实测）。tolerance 为「可接受偏差」。 */
const TARGETS = [
  {
    key: 'panelFill',
    label: '面板填充为实白',
    read: (s) => s.panelBg,
    expect: 'rgb(255, 255, 255)',
    ok: (s) => /^rgb\(255,\s*255,\s*255\)$/.test(s.panelBg),
    detail: (s) => `现值 ${s.panelBg}（参考纯白 255；玻璃 0.84 实测落屏 234）`,
  },
  {
    key: 'mediaBleed',
    label: '媒体满出血（左/上/下贴面板边）',
    read: (s) => s.mediaInset,
    expect: '≤ 1px',
    ok: (s) => Math.max(s.mediaInset.left, s.mediaInset.top, s.mediaInset.bottom) <= 1,
    detail: (s) =>
      `现值 L${s.mediaInset.left} T${s.mediaInset.top} B${s.mediaInset.bottom}（参考 0/0/0，我方曾 17/17/17）`,
  },
  {
    key: 'mediaRadius',
    label: '媒体无自身圆角',
    read: (s) => s.mediaRadius,
    expect: '0px',
    ok: (s) => parseFloat(s.mediaRadius) === 0,
    detail: (s) => `现值 ${s.mediaRadius}（参考圆角只由面板裁切）`,
  },
  {
    key: 'actionRow',
    label: '动作条图标与数字同一行',
    read: (s) => s.iconCountDeltaY,
    expect: '≤ 6px',
    ok: (s) => s.iconCountDeltaY !== null && s.iconCountDeltaY <= 6,
    detail: (s) =>
      `现值 ${s.iconCountDeltaY}px（参考同行；我方 column 布局曾差 20px，即数字堆在图标下方）`,
  },
  {
    key: 'titleFont',
    label: '标题字号收敛到 18px',
    read: (s) => s.titleFont,
    expect: '18px',
    ok: (s) => parseFloat(s.titleFont) <= 18.5,
    detail: (s) => `现值 ${s.titleFont}（参考墨高比 0.87 ⇒ 20px 应下调约 12%）`,
  },
  {
    key: 'bodyFont',
    label: '正文字号收敛到 15px',
    read: (s) => s.bodyFont,
    expect: '15px',
    ok: (s) => parseFloat(s.bodyFont) <= 15.5,
    detail: (s) => `现值 ${s.bodyFont}（参考墨高比 0.88）`,
  },
  {
    key: 'commentAlign',
    label: '评论头像左缘对齐标题左缘',
    read: (s) => s.commentAvatarIndent,
    expect: '≤ 2px',
    ok: (s) => s.commentAvatarIndent !== null && s.commentAvatarIndent <= 2,
    detail: (s) =>
      `现值 ${s.commentAvatarIndent}px（参考同基线；实测 18px 来自 .x-comments-section padding、2px 来自评论项 padding）`,
  },
  {
    key: 'childAvatar',
    label: '子回复头像 24px',
    read: (s) => s.childAvatarWidth,
    expect: '24px',
    ok: (s) => s.childAvatarWidth !== null && Math.abs(s.childAvatarWidth - 24) <= 1,
    detail: (s) => `现值 ${s.childAvatarWidth}（参考 24.0；我方曾 32）`,
  },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const fail = (msg) => {
  console.log(`FATAL  ${msg}`);
  process.exit(ASSERT ? 1 : 0);
};

let context;
let page;
try {
  context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, {
    timeout: 30000,
  });
  await page.waitForTimeout(2200);

  // 伪造登录：只是为了拿到「已登录」形态（关注按钮 / 可输入的回复框）。按本仓纪律注入 pinia，不种 auth-token。
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_user', role: 'user' });
  });

  // 直接驱动全局单例（与列表点击同一条链路），绕开滚动/可见性干扰
  await page.evaluate(async (id) => {
    const mod = await import('/src/composables/usePostDetailModal.js');
    mod.usePostDetailModal().open(id);
  }, POST);

  await page.waitForSelector('.pd-modal-overlay', { timeout: 20000 });
  await page.waitForTimeout(2600);

  // 展开楼中楼，否则 .child-reply-item 不存在（子回复默认只露 1 条，且可能未加载）
  await page.evaluate(() => {
    document.querySelectorAll('.child-expand-link').forEach((b) => b.click());
  });
  await page.waitForTimeout(1400);

  const state = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const cs = (el) => (el ? getComputedStyle(el) : null);

    const panel = q('.pd-modal-panel');
    const stage = q('.pd-media-stage-wrap');
    const title = q('.pd-title');
    const body = q('.content-text');
    const actIcon = q('.pd-action-btn .action-svg');
    const actCount = q('.pd-action-count');
    const cAvatar = q('.comment-item-x .mini-avatar');
    const childAv = q('.child-reply-item .mini-avatar');

    const pr = rect(panel);
    const sr = rect(stage);
    const ir = rect(actIcon);
    const cr = rect(actCount);
    const tr = rect(title);
    const car = rect(cAvatar);

    // 面板真实落屏色：panel 可能是半透明，getComputedStyle 的 backgroundColor 已含 alpha，
    // 这里读它的计算值即可（不要用截图采样，那个会受背景图影响）。
    return {
      panelBg: cs(panel)?.backgroundColor || '',
      mediaInset: sr
        ? {
            left: +(sr.x - pr.x).toFixed(1),
            top: +(sr.y - pr.y).toFixed(1),
            bottom: +(pr.bottom - sr.bottom).toFixed(1),
          }
        : { left: -1, top: -1, bottom: -1 },
      mediaRadius: cs(stage)?.borderRadius || '0px',
      iconCountDeltaY:
        ir && cr ? +Math.abs(cr.y + cr.height / 2 - (ir.y + ir.height / 2)).toFixed(1) : null,
      titleFont: cs(title)?.fontSize || '',
      bodyFont: cs(body)?.fontSize || '',
      commentAvatarIndent: car && tr ? +(car.x - tr.x).toFixed(1) : null,
      childAvatarWidth: childAv ? +rect(childAv).width.toFixed(1) : null,
      // 诊断信息（不进断言，只帮定位）
      hasMedia: Boolean(stage),
      commentCount: document.querySelectorAll('.comment-item-x').length,
      childCount: document.querySelectorAll('.child-reply-item').length,
    };
  });

  console.log(`\n探针视口 ${VIEWPORT.width}×${VIEWPORT.height}  帖子 ${POST}`);
  console.log(
    `媒体区 ${state.hasMedia ? '有' : '无'}  顶层评论 ${state.commentCount} 条  子回复 ${state.childCount} 条\n`,
  );

  if (!state.hasMedia) {
    console.log('SKIP   该帖无图 ⇒ 媒体相关项无法测量（换一个带封面的 POST 再跑）');
  }

  let failed = 0;
  for (const t of TARGETS) {
    // 无媒体时跳过两条媒体断言，避免给出假的 PASS
    if (!state.hasMedia && t.key.startsWith('media')) {
      console.log(`SKIP   ${t.label}（无媒体区）`);
      continue;
    }
    const pass = t.ok(state);
    if (!pass) failed += 1;
    console.log(`${pass ? 'PASS' : 'FAIL'}   ${t.label}`);
    console.log(`        目标 ${t.expect}`);
    console.log(`        ${t.detail(state)}`);
  }

  console.log(
    `\n小结  ${TARGETS.length - failed}/${TARGETS.length} 项达标${failed ? `，${failed} 项待实施` : ''}`,
  );
  if (errors.length) console.log('页面错误:', errors.slice(0, 5));

  // 度量器默认永远 exit 0；--assert 才把「未达标」当失败
  process.exitCode = ASSERT && failed > 0 ? 1 : 0;
} catch (err) {
  console.log(`FATAL  探针执行异常: ${String(err && err.message).slice(0, 300)}`);
  console.log('       常见原因：dev server 未启动（npm run dev，监听 [::1]:5173）');
  process.exitCode = ASSERT ? 1 : 0;
} finally {
  await context?.close().catch(() => {});
  await browser.close().catch(() => {});
}
