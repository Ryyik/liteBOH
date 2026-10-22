#!/usr/bin/env node
/**
 * probe-post-detail-refresh-restore.mjs — 刷新后保留详情弹窗（2026-10-22）
 *
 * 用户报障：横屏点帖进弹窗 → F5 → 掉回旧版整页详情。
 *
 * 判据：
 *   A. 横屏弹窗内刷新 → 仍是弹窗（不是整页详情）
 *   B. 刷新后弹窗内容仍是同一帖（postId 不丢）
 *   C. 竖屏整页详情刷新 → 仍走整页路由（不许被弹窗抢走）
 *   D. 从弹窗关闭后刷新 → 不再弹（history.state 标记已被消费）
 *   E. 横屏但**非**弹窗来源的直链（直接打开 #/forum/post/x，无 state 标记）
 *      → 不强行弹窗，保持整页兜底（避免把分享链接变成弹窗）
 *
 * 用法：node scripts/probes/probe-post-detail-refresh-restore.mjs [--assert]
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
const results = [];
const rec = (n, pass, d) => {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}   ${n}${d ? `\n        ${d}` : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const prime = async (p) => {
  await p.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_user', role: 'user' });
  });
};

const state = (p) =>
  p.evaluate(() => ({
    overlay: !!document.querySelector('.pd-modal-overlay'),
    pageMode: !!document.querySelector('.post-detail-page:not(.post-detail-page--modal)'),
    hash: location.hash,
    modalId: window.history.state?.bohPdModal || null,
  }));

const run = async () => {
  const browser = await launch();
  let postId = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    // 取测试帖要重试：客户端刚挂载时请求会被 AbortError 打断
    // （实测直接查一次拿到 0 行 + "signal is aborted without reason"）
    postId = null;
    for (let i = 0; i < 6 && !postId; i += 1) {
      await p.waitForTimeout(1500);
      postId = await p.evaluate(async () => {
        const m = await import('/src/utils/supabase-client.js');
        const sb = m.supabase || m.default;
        try {
          const { data } = await sb.from('posts').select('id').eq('status', 'approved').limit(1);
          return data?.[0]?.id || null;
        } catch {
          return null;
        }
      });
    }
    await ctx.close();
  }
  if (!postId) {
    rec('前置：找到测试帖', false, 'DB 未返回任何 approved 帖');
    await browser.close();
    if (ASSERT) process.exit(1);
    return;
  }
  console.log(`测试帖 ${postId}\n`);

  // ── A + B：横屏弹窗内刷新 ─────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.evaluate(async (id) => {
      const m = await import('/src/composables/usePostDetailModal.js');
      m.usePostDetailModal().open(id);
    }, postId);
    await p.waitForSelector('.pd-modal-overlay', { timeout: 20000 });
    await p.waitForTimeout(2500);
    const before = await state(p);
    const markerBefore = before.modalId;

    await p.reload({ waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(3500); // 给 restore 与异步详情留时间
    const after = await state(p);

    rec(
      'A. 横屏刷新后仍是弹窗',
      before.overlay && after.overlay && !after.pageMode,
      `刷新前 overlay=${before.overlay} → 刷新后 overlay=${after.overlay} 整页=${after.pageMode}`,
    );
    rec(
      'B. 刷新后仍是同一帖',
      Boolean(markerBefore) && after.hash.includes(postId),
      `state 标记=${markerBefore}，刷新后 hash 含该 id=${after.hash.includes(postId)}`,
    );
    await ctx.close();
  }

  // ── C：竖屏整页刷新（不许被弹窗抢） ──────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/forum/post/${postId}`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(3000);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(3500);
    const st = await state(p);
    rec(
      'C. 竖屏整页刷新不被弹窗抢走',
      !st.overlay && st.pageMode,
      `overlay=${st.overlay} 整页=${st.pageMode}`,
    );
    await ctx.close();
  }

  // ── D：关闭弹窗后刷新不再弹 ──────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.evaluate(async (id) => {
      const m = await import('/src/composables/usePostDetailModal.js');
      m.usePostDetailModal().open(id);
    }, postId);
    await p.waitForSelector('.pd-modal-overlay', { timeout: 20000 });
    await p.waitForTimeout(2000);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(1500);
    const closed = await state(p);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(3000);
    const after = await state(p);
    rec(
      'D. 关闭后刷新不再自动弹',
      !closed.overlay && !after.overlay,
      `关闭后 overlay=${closed.overlay}；刷新后 overlay=${after.overlay} state=${after.modalId}`,
    );
    await ctx.close();
  }

  // ── E：横屏无 state 标记的直链 → 不弹窗 ──────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/forum/post/${postId}`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(4000);
    const st = await state(p);
    rec(
      'E. 无 state 标记的直链不强行弹窗（分享链接保持整页）',
      !st.overlay && st.pageMode && !st.modalId,
      `overlay=${st.overlay} 整页=${st.pageMode} state=${st.modalId}`,
    );
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
