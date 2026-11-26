import {
  CHROME_ARGS,
  MOBILE,
  LANDSCAPE,
  boot,
  overflowProbe,
  contrastProbe,
} from '../lib/join-probe.mjs';
import { chromium } from 'playwright';

/**
 * 探针：注册页的响应式底线实测 —— 横向溢出 / 触控目标 / 对比度 / 首屏可见性。
 *
 * 与 probe-join-real 的分工：那边是「流程与纪律的验收」（断言 PASS/FAIL），
 * 这边只输出**读数**，用于改版前后对比和肉眼复核。所以不写 check()。
 *
 * 2026-11-25 重写：旧版取 `.apple-input-group` / `.agreement-checkbox` 那套选择器，
 * 七屏改版时整块没了（跑起来等 20 秒超时）。
 *
 * 用法：node scripts/probes/probe-join-mobile-metrics.mjs
 */

const PAIRS = [
  ['字段标签', '.join-label'],
  ['字段提示', '.join-hint'],
  ['步骤文本', '.join-progress-text'],
  ['引导句', '.join-lead'],
  ['协议文本', '.join-consent-text'],
  ['placeholder', '#joinEmail', '::placeholder'],
];

// ⚠️ 量的是**可点区域**而不是内部控件：
//    协议那一行的 label 才是点击目标（点文字也能勾），
//    里面那个 16×16 的 <input> 只是视觉符号 —— 拿它当触控目标会得出
//    「16px、不合格」的假结论。判据见 WCAG 2.5.8（最小 24×24，本仓库按 44 收）。
const TAP_TARGETS = [
  ['.join-consent-row', '协议勾选行'],
  ['.join-btn-primary', '主按钮'],
  ['#joinEmail', '邮箱输入框'],
  ['.join-mini', '次按钮（重发/选择图片）'],
];

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });

const measure = async (label, ctxOpts) => {
  const { context, page, pageErrors } = await boot(browser, ctxOpts);
  // 先推进到第 2 屏，好让重发按钮这类只在那屏出现的目标也能被量到
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.join-admin-preview-btn')].find((b) =>
      b.textContent.includes('②'),
    );
    btn?.click();
  });
  await page.waitForTimeout(600);

  const r = await page.evaluate(
    ({ taps }) => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
          right: Math.round(b.right),
          bottom: Math.round(b.bottom),
        };
      };
      return {
        viewport: { w: document.documentElement.clientWidth, h: window.innerHeight },
        docH: document.documentElement.scrollHeight,
        card: rect('.join-card'),
        inner: rect('.join-inner'),
        primary: rect('.join-actions .join-btn-primary'),
        taps: taps.map(([sel, name]) => {
          const r = rect(sel);
          return { name, sel, ...(r || { missing: true }) };
        }),
        // 触控目标另有「≥44×44」的硬要求（WCAG 2.5.5 / iOS HIG）
        smallTargets: taps
          .map(([sel, name]) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return b.width < 44 || b.height < 44
              ? `${name} ${Math.round(b.width)}×${Math.round(b.height)}`
              : null;
          })
          .filter(Boolean),
        fontSize: {
          hint: getComputedStyle(
            document.querySelector('.join-hint') ||
              document.querySelector('.join-msg') ||
              document.body,
          ).fontSize,
          label: getComputedStyle(document.querySelector('.join-label') || document.body).fontSize,
          // ≥16px 是 iOS Safari 聚焦不缩放页面的门槛
          emailInput: getComputedStyle(document.getElementById('joinEmail')).fontSize,
        },
        // 可见性：主按钮必须落在首屏内，否则用户会以为页面没有按钮
        primaryInView: (() => {
          const el = document.querySelector('.join-actions .join-btn-primary');
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return b.bottom <= window.innerHeight + 1;
        })(),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    },
    { taps: TAP_TARGETS },
  );

  const contrast = await page.evaluate(contrastProbe, PAIRS);
  const overflow = await page.evaluate(overflowProbe);

  console.log(`\n===== ${label} ${r.viewport.w}×${r.viewport.h} =====`);
  console.log('文档高度 :', r.docH, '（视口', r.viewport.h, '）');
  console.log('卡片     :', JSON.stringify(r.card));
  console.log('主按钮   :', JSON.stringify(r.primary), '首屏内:', r.primaryInView);
  console.log('横向溢出 :', overflow.bad.length ? JSON.stringify(overflow.bad) : '无');
  console.log('触控目标 :');
  r.taps.forEach((t) =>
    console.log(`  ${t.name.padEnd(22)} ${t.missing ? '缺失' : `${t.w}×${t.h}`}`),
  );
  console.log('  <44px  :', r.smallTargets.length ? r.smallTargets.join(' , ') : '无');
  console.log('字号     :', JSON.stringify(r.fontSize));
  console.log(
    '对比度   :',
    contrast.map((p) => `${p.name}=${p.ratio === null ? '—' : p.ratio.toFixed(2)}`).join('  '),
  );
  if (pageErrors.length) console.log('页面错误 :', pageErrors.slice(0, 3));

  await page.screenshot({ path: `debug-screenshots/metrics-join-${label}.png`, fullPage: false });
  await context.close();
};

await measure('mobile', MOBILE);
await measure('landscape', LANDSCAPE);
await measure('tablet-portrait', { viewport: { width: 768, height: 1024 } });

await browser.close();
