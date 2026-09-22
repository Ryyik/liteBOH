import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：注册页（/#/join）现状取证 —— 截图 + 关键计算样式实测
// 用途：为「注册页改版方案」提供现状基线（字段顺序、可及性缺陷、响应式表现）
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const launch = async (viewport) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { browser, page, errors };
};

const run = async (label, viewport) => {
  const { browser, page, errors } = await launch(viewport);
  await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.apple-form', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // vite 编译错误遮罩会盖住页面顶部（可能来自其它文件的陈旧错误），
  // 截图前先关掉，避免取证图被污染。
  const overlay = await page.evaluate(() => {
    const el = document.querySelector('vite-error-overlay');
    if (!el) return null;
    const msg = el.shadowRoot?.textContent?.replace(/\s+/g, ' ').slice(0, 200) || '';
    const btn = el.shadowRoot?.querySelector('.window');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return msg;
  });
  if (overlay) console.log(`[warn] vite overlay: ${overlay}`);
  await page.waitForTimeout(400);

  const file = `${OUT}/audit-join-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });

  const data = await page.evaluate(() => {
    const out = {};
    out.fields = [...document.querySelectorAll('.apple-input-group .input-wrapper')].map((w) => {
      const el = w.querySelector('input, select');
      return {
        tag: el?.tagName?.toLowerCase(),
        type: el?.type || null,
        placeholder: el?.placeholder || w.querySelector('.birthday-label, .avatar-label')?.textContent?.trim() || null,
        autocomplete: el?.getAttribute('autocomplete') ?? null,
        id: el?.id || null,
        hasLabel: Boolean(w.querySelector('label')),
        suffix: w.querySelector('.input-suffix')?.textContent?.trim() || null,
      };
    });
    const inp = document.querySelector('.apple-input');
    if (inp) {
      const cs = getComputedStyle(inp);
      out.inputStyle = {
        outline: cs.outline, fontSize: cs.fontSize,
        placeholderColor: getComputedStyle(inp, '::placeholder').color,
        textColor: cs.color,
      };
    }
    const btn = document.querySelector('.apple-continue-btn');
    if (btn) out.submitLabel = btn.textContent.trim();
    out.honeypotExists = Boolean(document.querySelector('.anti-bot-honeypot'));
    out.altchaPresent = Boolean(document.querySelector('.altcha-wrap'));
    out.altchaText = document.querySelector('.altcha-wrap')?.innerText?.trim()?.slice(0, 80) || null;
    out.hiddenInputs = [...document.querySelectorAll('input[type=checkbox]')].map((c) => ({
      checked: c.checked, parentText: c.closest('label')?.innerText?.trim()?.slice(0, 40),
    }));
    out.pageHeight = document.documentElement.scrollHeight;
    return out;
  });

  console.log(`\n===== ${label} ${viewport.width}x${viewport.height} =====`);
  console.log(JSON.stringify(data, null, 2));
  if (errors.length) console.log('pageerrors:', errors);
  console.log('screenshot:', file);
  await browser.close();
};

await run('desktop', { width: 1440, height: 900 });
await run('mobile', { width: 390, height: 844 });
