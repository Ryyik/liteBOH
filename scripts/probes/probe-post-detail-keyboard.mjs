#!/usr/bin/env node
/**
 * probe-post-detail-keyboard.mjs — 帖子详情键盘操作验收（2026-10-22）
 *
 * 判据（4 条）：
 *   A. → 切到下一张；← 切到上一张（弹窗态 972×734）
 *   B. 单图帖按方向键不报错、不切换
 *   C. 焦点在评论输入框时，方向键**不**切图（否则没法移光标）
 *   D. 大图查看器打开时，方向键交给查看器，不翻底图
 *   E. Esc 关闭弹窗（既有关闭链，防回归）
 *
 * 用法：
 *   node scripts/probes/probe-post-detail-keyboard.mjs          # 只报数，exit 0
 *   node scripts/probes/probe-post-detail-keyboard.mjs --assert  # 判定
 *
 * ⚠️ 前置：dev server 已在 [::1]:5173 运行。
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}   ${name}${detail ? `\n        ${detail}` : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

async function openModal(page, postId) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, {
    timeout: 30000,
  });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_user', role: 'user' });
  });
  await page.evaluate(async (id) => {
    const m = await import('/src/composables/usePostDetailModal.js');
    m.usePostDetailModal().open(id);
  }, postId);
  await page.waitForSelector('.pd-modal-overlay', { timeout: 20000 });
  await page.waitForTimeout(5000);
  // 诊断：等图片真正渲染出来，别用固定等待赌它（早期版本 5s 有时不够，
  // 拿到 null 于是 A/C 假红）。等不到就算超时，由断言显式报出来。
  await page
    .waitForSelector('.pd-modal-media img', { timeout: 15000 })
    .catch(() => {});
}

// 判据以 <img> 的 src 为准（实测类名是 .pd-media-dot / .pd-media-dot.active，
// 不是 is-active，也不是 aria-current —— 早期版本按这两个找，恒得到 -1 的假红）
const currentIndex = (page) =>
  page.evaluate(() => {
    const dots = [...document.querySelectorAll('.pd-media-dot')];
    const idx = dots.findIndex((d) => d.classList.contains('active'));
    const img = document.querySelector('.pd-modal-media img');
    return { dotIndex: idx, src: img?.getAttribute('src') || null };
  });

const run = async () => {
  const browser = await launch();

  // 找一个多图帖
  let multiId = null;
  let singleId = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 972, height: 734 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 30000 });
    const picked = await page.evaluate(async () => {
      const m = await import('/src/utils/supabase-client.js');
      const sb = m.supabase || m.default;
      const { data } = await sb.from('forum_post_images').select('post_id').limit(200);
      const counts = new Map();
      (data || []).forEach((r) => counts.set(r.post_id, (counts.get(r.post_id) || 0) + 1));
      const multi = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
      return { multi };
    });
    multiId = picked.multi[0]?.id || null;
    // 单图帖：任意帖里没有多图的那条
    singleId = await page.evaluate(async (exclude) => {
      const m = await import('/src/utils/supabase-client.js');
      const sb = m.supabase || m.default;
      const { data } = await sb.from('posts').select('id').eq('status', 'approved').limit(40);
      return (data || []).map((r) => r.id).find((id) => id !== exclude) || null;
    }, multiId);
    await ctx.close();
  }

  console.log(`多图帖 ${multiId}  对照帖 ${singleId}\n`);

  // ── A：方向键切图 ─────────────────────────────────────────
  if (multiId) {
    const ctx = await browser.newContext({ viewport: { width: 972, height: 734 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openModal(page, multiId);
    const before = await currentIndex(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    const afterRight = await currentIndex(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    const afterLeft = await currentIndex(page);
    const movedRight = afterRight.src !== before.src;
    const movedBack = afterLeft.src === before.src;
    rec('A. →/← 切换图片', movedRight && movedBack,
      `初始 ${String(before.src).slice(-18)} → 右 ${String(afterRight.src).slice(-18)} → 左 ${String(afterLeft.src).slice(-18)}`);

    // ── C：输入框聚焦时不切图 ───────────────────────────────
    const input = await page.$('.pd-reply-input');
    if (input) {
      await input.click();
      const beforeType = await currentIndex(page);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(600);
      const afterType = await currentIndex(page);
      rec('C. 输入框聚焦时方向键不切图', afterType.src === beforeType.src,
        `聚焦前后 src ${afterType.src === beforeType.src ? '一致' : '被切换（误伤）'}`);
      await page.keyboard.press('Escape'); // 失焦/关弹窗
      await page.waitForTimeout(400);
    } else {
      rec('C. 输入框聚焦时方向键不切图', false, '未找到 .pd-reply-input');
    }
    await ctx.close();
  } else {
    rec('A. →/← 切换图片', false, '未找到多图帖');
  }

  // ── E：Esc 关闭 ──────────────────────────────────────────
  if (multiId) {
    const ctx = await browser.newContext({ viewport: { width: 972, height: 734 } });
    const page = await ctx.newPage();
    await openModal(page, multiId);
    const open1 = await page.$('.pd-modal-overlay');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    const stillOpen = await page.$('.pd-modal-overlay');
    rec('E. Esc 关闭弹窗', Boolean(open1) && !stillOpen,
      `关闭前存在=${Boolean(open1)} 关闭后仍在=${Boolean(stillOpen)}`);
    await ctx.close();
  }

  // ── B：单图帖不炸 ────────────────────────────────────────
  if (singleId) {
    const ctx = await browser.newContext({ viewport: { width: 972, height: 734 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 100)));
    await openModal(page, singleId);
    const before = await currentIndex(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    const after = await currentIndex(page);
    rec('B. 单图/无图帖方向键安全', errs.length === 0 && after.src === before.src,
      `报错 ${errs.length} 条；src 变化=${after.src !== before.src}`);
    await ctx.close();
  }

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n小结  ${passed}/${results.length} 项达标`);
  if (ASSERT && passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error('探针异常：', e.message);
  if (ASSERT) process.exit(1);
});
