import { chromium } from 'playwright';
import fs from 'node:fs';
import {
  OUT,
  CHROME_ARGS,
  MOBILE,
  ensureOut,
  boot,
  contrastProbe,
  overflowProbe,
} from '../lib/join-probe.mjs';

/**
 * 探针：注册页（/#/join）逐屏取证 —— 截图 + 关键计算样式实测。
 *
 * 用途：改版后 / 换主题后快速拿一份「每屏长什么样」的现场，
 * 以及可及性底线的读数（对比度、触控尺寸、横向溢出）。
 *
 * 与 probe-join-real 的分工：
 *   · probe-join-real  —— **验收**（断言跑通流程、纪律、两种形态）；
 *   · 本文件           —— **取证**（只输出读数 + 截图，不判死活）。
 * 所以这里刻意不写 check()：样式评审要的是数字和眼睛，不是 PASS。
 *
 * 2026-11-25 重写：旧版取的是 `.apple-form` / `.apple-input-group` 那套
 * 选择器，七屏改版时整块没了（跑起来直接超时）。
 *
 * 用法：node scripts/probes/probe-join-audit.mjs
 */
ensureOut();
fs.mkdirSync(OUT, { recursive: true });

const STEPS = [
  { n: 1, name: 'email', title: '① 邮箱 + 协议' },
  { n: 2, name: 'otp', title: '② 验证码' },
  { n: 3, name: 'identity', title: '③ 建号（ID + 密码）' },
  { n: 4, name: 'birth', title: '④ 生日' },
  { n: 5, name: 'avatar', title: '⑤ 头像' },
  { n: 6, name: 'passkey', title: '⑥ 通行密钥' },
];

const PAIRS = [
  ['字段标签', '.join-label'],
  ['字段提示', '.join-hint'],
  ['步骤文本', '.join-progress-text'],
  ['引导句', '.join-lead'],
  ['协议文本', '.join-consent-text'],
  ['placeholder', '#joinEmail', '::placeholder'],
];

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });

const audit = async (label, ctxOpts) => {
  // 用 ?preview=1 打开管理员预览条 —— 它是 DEV 下的官方跳步入口，
  // 不需要真发信就能逐屏取证（也正是它存在的理由）。
  const { context, page } = await boot(browser, {
    ...ctxOpts,
    signupState: 'incomplete',
    preview: true,
  });

  console.log(`\n===== ${label} =====`);
  for (const s of STEPS) {
    await page.evaluate((n) => {
      // 直接点预览条上的按钮，与管理员评审用的是同一条路径
      const btn = [...document.querySelectorAll('.join-admin-preview-btn')].find((b) =>
        b.textContent.includes(['①', '②', '③', '④', '⑤', '⑥', '⑦'][n - 1]),
      );
      btn?.click();
    }, s.n);
    await page.waitForTimeout(700);

    const data = await page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
          bottom: Math.round(b.bottom),
        };
      };
      const taps = ['.join-btn-primary', '.join-mini', '.join-consent-row'].map((sel) => {
        const r = rect(sel);
        return r ? { sel, w: r.w, h: r.h, ok44: r.w >= 44 && r.h >= 44 } : { sel, missing: true };
      });
      return {
        title: document.querySelector('.join-step.is-active h2')?.textContent?.trim() || '',
        step: document.querySelector('.join-progress-text')?.textContent?.trim() || '',
        fields: [...document.querySelectorAll('.join-step.is-active .join-fld')].map((f) => ({
          field: f.dataset.field,
          input: f.querySelector('input,select')?.tagName?.toLowerCase() || null,
          type: f.querySelector('input')?.type || null,
          autocomplete: f.querySelector('input,select')?.getAttribute('autocomplete') ?? null,
          hasLabel: Boolean(f.querySelector('label')),
        })),
        primary: rect('.join-btn-primary'),
        taps,
        viewportH: window.innerHeight,
        pageScrollH: document.documentElement.scrollHeight,
      };
    });

    const contrast = await page.evaluate(contrastProbe, PAIRS);
    data.contrast = contrast.map((p) =>
      p.ratio === null ? `${p.name}=—` : `${p.name}=${p.ratio.toFixed(2)}`,
    );

    const file = `${OUT}/audit-join-${label}-step${s.n}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(
      `${s.title}  ${data.step}  primary.bottom=${data.primary?.bottom}/${data.viewportH}`,
    );
    console.log(`  对比度: ${data.contrast.join('  ')}`);
    console.log(
      `  触控: ${data.taps.map((t) => `${t.sel}=${t.missing ? '缺' : t.w + '×' + t.h}`).join('  ')}`,
    );
    console.log(`  截图: ${file}`);
  }

  const overflow = await page.evaluate(overflowProbe);
  console.log(`  横向溢出: ${overflow.bad.length === 0 ? '无' : JSON.stringify(overflow.bad)}`);
  console.log(
    `  文档高度: ${overflow.scrollWidth} × ${await page.evaluate(() => document.documentElement.scrollHeight)}`,
  );
  await context.close();
};

await audit('desktop-portrait', { viewport: { width: 1024, height: 1366 } });
await audit('mobile', MOBILE);
await audit('landscape', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

await browser.close();
