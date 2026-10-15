#!/usr/bin/env node
/**
 * probe-portrait-visual-audit.mjs — 竖屏（390×844）全站视觉巡检采集器（2026-10-13）
 *
 * 用途：一次性巡检采集，不是门禁。产出：
 *   · debug-screenshots/portrait-audit-2026-10-13/*.png —— 每页多档滚动位置截图
 *   · 同目录 diagnostics.json —— 每页的 DOM 级问题清单（横向溢出/截断/小字号/遮挡）
 *     + axe-core color-contrast 违规 + 控制台错误
 * 判读靠人（或 AI）看截图 + 清单。
 *
 * 前置：dev server 已在 5173（BASE 可覆盖）。
 * 运行：node scripts/probes/probe-portrait-visual-audit.mjs [--only=04,10]
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = path.resolve('debug-screenshots/portrait-audit-2026-10-13');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '')
  .slice(7)
  .split(',')
  .filter(Boolean);

const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

// ---------------------------------------------------------------------------
// 页面清单：name 前缀是排序号。auth: none | user | admin
// shots: 视口截图档位（top / mid / bottom）。fullPage 若页面不过长也会拍。
// ---------------------------------------------------------------------------
const PAGES = [
  {
    name: '01-home',
    hash: '/',
    auth: 'user',
    unlockGate: true,
    shots: ['top', 'mid', 'bottom'],
    waitSel: '.home',
  },
  { name: '02-forum-list', hash: '/?view=latest', auth: 'user', shots: ['top', 'mid', 'bottom'] },
  { name: '03-ai-intro', hash: '/ai-intro', auth: 'none', shots: ['top', 'mid', 'bottom'] },
  {
    name: '04-ai-chat',
    hash: '/ai-chat',
    auth: 'user',
    shots: ['top', 'mid'],
    waitSel: '.boh-shell',
    extras: 'aiChat',
  },
  {
    name: '05-uspace-community',
    hash: '/user-space?tab=community',
    auth: 'user',
    shots: ['top', 'mid'],
  },
  {
    name: '06-uspace-posts',
    hash: '/user-space?tab=posts',
    auth: 'user',
    shots: ['top', 'mid', 'bottom'],
  },
  { name: '07-uspace-assets', hash: '/user-space?tab=assets', auth: 'user', shots: ['top', 'mid'] },
  {
    name: '08-uspace-messages',
    hash: '/user-space?tab=messages',
    auth: 'user',
    shots: ['top', 'mid'],
  },
  {
    name: '09-uspace-settings',
    hash: '/user-space?tab=settings',
    auth: 'user',
    shots: ['top', 'mid', 'bottom'],
  },
  {
    name: '10-admin-keys-models',
    hash: '/admin/data-management?section=keys-models',
    auth: 'admin',
    stubAdmin: true,
    shots: ['top', 'mid'],
    extras: 'keysModels',
  },
  {
    name: '11-admin-moderation',
    hash: '/admin/data-management?section=moderation-model',
    auth: 'admin',
    stubAdmin: true,
    shots: ['top'],
  },
  {
    name: '12-admin-lab-ai',
    hash: '/admin/data-management?section=lab-ai-model',
    auth: 'admin',
    stubAdmin: true,
    shots: ['top'],
  },
  { name: '13-overview', hash: '/overview', auth: 'user', shots: ['top', 'mid'] },
  { name: '14-activities', hash: '/activities', auth: 'none', shots: ['top', 'mid'] },
  { name: '15-lotteries', hash: '/lotteries', auth: 'none', shots: ['top', 'mid'] },
  { name: '16-shop', hash: '/shop', auth: 'none', shots: ['top', 'mid'] },
  { name: '17-newsroom', hash: '/newsroom', auth: 'none', shots: ['top'] },
];

// ---------------------------------------------------------------------------
// 注入与打桩
// ---------------------------------------------------------------------------
const armGuard = (page, role) =>
  page.evaluate(
    ({ role, uid }) => {
      const app = document.querySelector('#app')?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      if (!pinia) return 'no-pinia';
      const apply = () => {
        const s = pinia.state.value.auth;
        if (!s) return;
        s.isLoggedIn = true;
        s.isInitialized = true;
        if (s.userInfo)
          Object.assign(s.userInfo, { id: uid, username: '竖屏巡检', role, points: 42 });
      };
      apply();
      if (!window.__portraitAuditGuard) window.__portraitAuditGuard = setInterval(apply, 200);
      return 'armed';
    },
    { role, uid: ADMIN_UUID },
  );

const MOCK_KEYS = [
  {
    id: 'k1',
    provider: 'siliconflow',
    purpose: 'chat',
    label: 'SiliconFlow Chat',
    maskedValue: 'sk-••••••••3f2a',
    status: 'active',
    readonly: false,
    lastTestStatus: 'ok',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'k2',
    provider: 'openrouter',
    purpose: 'chat',
    label: 'OpenRouter Chat',
    maskedValue: 'sk-or-••••••a91c',
    status: 'active',
    readonly: false,
    lastTestStatus: 'failed',
    updated_at: '2026-10-02T00:00:00Z',
  },
  {
    id: 'k3',
    provider: 'custom',
    purpose: 'chat',
    label: '公司内网网关（很长的一个自定义平台名称测试用）',
    maskedValue: 'gw-••••••••77dd',
    status: 'active',
    readonly: false,
    lastTestStatus: 'untested',
    updated_at: '2026-10-03T00:00:00Z',
  },
  {
    id: 'k4',
    provider: 'custom',
    purpose: 'chat',
    label: '公司内网网关二号（测试多网关共用模型清单提示）',
    maskedValue: 'gw-••••••••88ee',
    status: 'inactive',
    readonly: false,
    lastTestStatus: 'untested',
    updated_at: '2026-10-04T00:00:00Z',
  },
  {
    id: 'k5',
    provider: 'tavily',
    purpose: 'search',
    label: 'Tavily 联网搜索',
    maskedValue: 'tvly-••••••••1b2c',
    status: 'active',
    readonly: false,
    lastTestStatus: 'ok',
    updated_at: '2026-10-05T00:00:00Z',
  },
];

const MOCK_MODELS = [
  {
    id: 'm1',
    provider: 'siliconflow',
    name: 'Qwen2.5 7B 指令版（长名称测试·用于检查窄屏行内折行与截断）',
    model_id: 'Qwen/Qwen2.5-7B-Instruct',
    family_label: '通用',
    is_active: true,
    sort_order: 1,
    api_base_url: 'https://api.siliconflow.cn/v1/chat/completions',
  },
  {
    id: 'm2',
    provider: 'siliconflow',
    name: 'DeepSeek V3',
    model_id: 'deepseek-ai/DeepSeek-V3',
    family_label: '通用',
    is_active: true,
    sort_order: 2,
    api_base_url: 'https://api.siliconflow.cn/v1/chat/completions',
  },
  {
    id: 'm3',
    provider: 'siliconflow',
    name: 'BAAI/bge-m3 向量模型（中文摘要）',
    model_id: 'BAAI/bge-m3',
    family_label: '向量嵌入',
    is_active: false,
    sort_order: 3,
    api_base_url: 'https://api.siliconflow.cn/v1/chat/completions',
  },
];

async function installStubs(context) {
  await context.route('**/functions/v1/api-key-vault**', async (route) => {
    let action = '';
    try {
      action = route.request().postDataJSON()?.action || '';
    } catch {
      /* 非 JSON body */
    }
    if (action === 'list') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: MOCK_KEYS }),
      });
    }
    if (action === 'test') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { status: 'ok', latency_ms: 123 } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  await context.route('**/rest/v1/freemodels*', async (route) => {
    const accept = route.request().headers()['accept'] || '';
    if (accept.includes('pgrst.object')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify({ sort_order: 3 }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-2/3' },
      body: JSON.stringify(MOCK_MODELS),
    });
  });

  // admin_* RPC 打桩（探针无真实会话，必然 401；统一 200 空集，避免噪声淹没视觉信号）
  await context.route('**/rest/v1/rpc/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const url = route.request().url();
    const listShaped = /list|existing|batches|users|audit/i.test(url);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': listShaped ? '0--1/*' : '0-0/0' },
      body: listShaped ? '[]' : '{}',
    });
  });
}

// ---------------------------------------------------------------------------
// DOM 级诊断（自包含函数；不得依赖闭包）
// ---------------------------------------------------------------------------
const diagFn = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const parts = el.className.trim().split(/\s+/).slice(0, 3);
      if (parts.length) s += '.' + parts.join('.');
    }
    return s;
  };
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
  const inHScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (
        (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
        p.scrollWidth > p.clientWidth + 1
      )
        return true;
    }
    return false;
  };
  const underUntransformed = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.transform !== 'none' || cs.position === 'fixed') return true;
    }
    return false;
  };

  const out = {
    vw,
    vh,
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    offscreen: [],
    offscreenInTransformed: [],
    clippedX: [],
    clampedY: [],
    tiny: [],
    covered: [],
    fixedBottom: [],
  };

  const seenOff = new Set();
  const seenClip = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    // 横向越出视口
    if ((r.right > vw + 2 || r.left < -2) && !inHScroll(el)) {
      const key = desc(el);
      if (!seenOff.has(key) && out.offscreen.length + out.offscreenInTransformed.length < 60) {
        seenOff.add(key);
        const item = {
          sel: key,
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
        };
        if (underUntransformed(el)) out.offscreenInTransformed.push(item);
        else out.offscreen.push(item);
      }
    }
    // 横向文本截断（overflow hidden/clip + scrollWidth > clientWidth）
    const cs = getComputedStyle(el);
    if (/hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflow)) {
      const hasOwn = ownText(el).length > 0;
      if (hasOwn && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
        const key = desc(el) + '::' + ownText(el).slice(0, 20);
        if (!seenClip.has(key) && out.clippedX.length < 50) {
          seenClip.add(key);
          out.clippedX.push({
            sel: desc(el),
            cw: el.clientWidth,
            sw: el.scrollWidth,
            overflow: cs.overflow,
            ellipsis: cs.textOverflow,
            fs: cs.fontSize,
            text: ownText(el).slice(0, 64),
          });
        }
      }
      // 纵向截断（line-clamp / max-height 裁切）
      if (
        hasOwn &&
        el.clientHeight > 0 &&
        el.scrollHeight > el.clientHeight + 4 &&
        cs.overflowY !== 'visible'
      ) {
        const key = 'Y' + desc(el) + '::' + ownText(el).slice(0, 20);
        if (!seenClip.has(key) && out.clampedY.length < 40) {
          seenClip.add(key);
          out.clampedY.push({
            sel: desc(el),
            ch: el.clientHeight,
            sh: el.scrollHeight,
            clamp: cs.webkitLineClamp,
            text: ownText(el).slice(0, 64),
          });
        }
      }
    }
    // 过小字号（只统计自己直接持有文本的元素）
    const t = ownText(el);
    if (t.length > 0) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > 0 && fs < 11.5 && out.tiny.length < 40) {
        out.tiny.push({ sel: desc(el), fs, text: t.slice(0, 48) });
      }
    }
  }

  // 遮挡采样：文本元素的中心点被别的元素盖住
  const coverMap = new Map();
  const targets = document.querySelectorAll(
    'p,span,button,a,h1,h2,h3,h4,strong,label,code,small,li',
  );
  for (const el of targets) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 8) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || top === el || el.contains(top) || top.contains(el)) continue;
    const tcs = getComputedStyle(top);
    if (tcs.pointerEvents === 'none') continue;
    // 只关心「浮层类」遮挡（fixed/absolute），静态元素互相压多半是布局内的正常情形
    if (tcs.position !== 'fixed' && tcs.position !== 'absolute') continue;
    const key = desc(top);
    const cur = coverMap.get(key) || {
      sel: key,
      count: 0,
      sample: ownText(el).slice(0, 40),
      z: tcs.zIndex,
    };
    cur.count += 1;
    coverMap.set(key, cur);
  }
  out.covered = [...coverMap.values()].filter((c) => c.count >= 2).slice(0, 20);

  // 底部固定条
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height > 24 && r.bottom >= vh - 2 && r.width >= vw * 0.85) {
      out.fixedBottom.push({ sel: desc(el), h: Math.round(r.height), top: Math.round(r.top) });
    }
  }

  return out;
};

// ---------------------------------------------------------------------------
// 交互扩展
// ---------------------------------------------------------------------------
const shot = (page, label) => page.screenshot({ path: path.join(OUT, `${label}.png`) });

const extrasAiChat = async (page, log) => {
  // 1) 打开侧栏（若收起）
  await page.evaluate(() => {
    const btn = document.querySelector('.boh-float-actions [title="打开侧栏"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(900);
  const sidebarOpen = await page.evaluate(() => !!document.querySelector('.boh-sidebar.is-open'));
  await shot(page, '04-ai-chat-sidebar');
  if (!sidebarOpen) log('侧栏未打开（可能没有收起按钮或仍是 off-canvas 态）');

  // 2) 账号浮层（额度 / 订阅 / 设置入口）
  const acct = page.locator('.boh-account-btn').first();
  if (await acct.count()) {
    await acct.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    let panel = await page.evaluate(() => !!document.querySelector('.boh-account-actions'));
    if (!panel) {
      await acct.hover().catch(() => {});
      await page.waitForTimeout(500);
      panel = await page.evaluate(() => !!document.querySelector('.boh-account-actions'));
    }
    await shot(page, '04-ai-chat-account');
    log(`账号浮层可见：${panel}`);

    // 3) 设置（全屏抽屉）
    const st = page.locator('.boh-account-actions button', { hasText: '设置' });
    if (await st.count()) {
      await st
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(2000);
      if (await page.locator('.ai-settings-drawer').count()) {
        await shot(page, '04-ai-chat-settings-top');
        // 点「模型」分区（若导航在竖屏是叠层布局，滚动定位同样成立）
        const modelNav = page.locator('.ai-settings-nav-item', { hasText: '模型' }).first();
        if (await modelNav.count()) {
          await modelNav.click({ force: true }).catch(() => {});
          await page.waitForTimeout(800);
          await shot(page, '04-ai-chat-settings-models');
        }
        await page.evaluate(() => {
          const b = document.querySelector('.ai-settings-body');
          if (b) b.scrollTo(0, b.scrollHeight);
        });
        await page.waitForTimeout(500);
        await shot(page, '04-ai-chat-settings-models-bottom');
        // 关设置
        await page.evaluate(() => document.querySelector('.ai-settings-back-app')?.click());
        await page.waitForTimeout(900);
        log('settings drawer captured');
      } else {
        log('settings drawer 未出现');
      }
    } else {
      log('账号浮层里没找到「设置」');
    }
  } else {
    log('没有 .boh-account-btn');
  }

  // 4) 关侧栏，回到主区
  await page.evaluate(() => document.querySelector('.boh-sb-close')?.click());
  await page.waitForTimeout(700);

  // 5) 输入区：slash 命令菜单
  const ta = page.locator('textarea.boh-composer-input').first();
  if (await ta.count()) {
    await ta.click({ force: true }).catch(() => {});
    await ta.fill('/').catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, '04-ai-chat-slash');
    await ta.fill('').catch(() => {});
    await page.waitForTimeout(300);

    // 6) 模型菜单
    await page
      .locator('.boh-mode-pill')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, '04-ai-chat-mode-menu');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    // 7) 长文本（多行）下输入区形态
    await ta.click({ force: true }).catch(() => {});
    await ta
      .fill(
        '请帮我检查这段很长的输入文本在竖屏输入框里会不会把左右两侧的按钮挤掉，顺便看看它换行之后输入区的高度是怎么涨的，以及发送按钮是否还在原位。',
      )
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, '04-ai-chat-composer-long');
    await ta.fill('').catch(() => {});
  } else {
    log('没有找到 .boh-composer-input');
  }
};

const extrasKeysModels = async (page, log) => {
  // 打开「添加平台」对话框（也是「添加密钥」的载体）
  const add = page.locator('button', { hasText: '添加平台' }).first();
  if (await add.count()) {
    await add.click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    if (await page.locator('.g-dialog').count()) {
      await shot(page, '10-admin-keys-models-dialog');
      // 对话框内滚动到底（表单可能超屏）
      await page.evaluate(() => {
        const d = document.querySelector('.g-dialog');
        if (d) d.scrollTo(0, d.scrollHeight);
      });
      await page.waitForTimeout(400);
      await shot(page, '10-admin-keys-models-dialog-bottom');
      await page.evaluate(() => {
        const d = document.querySelector('.g-dialog');
        const close = d?.querySelector('.g-icon-btn');
        if (close) close.click();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await page.waitForTimeout(500);
    } else {
      log('点「添加平台」后没有 .g-dialog');
    }
  }
  // 切到一个工具服务（Tavily：只显示密钥、不显示模型区块）
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.km-pf')];
    const tavily = items.find((b) => /Tavily/i.test(b.textContent || ''));
    if (tavily) tavily.click();
  });
  await page.waitForTimeout(800);
  await shot(page, '10-admin-keys-models-tool');
};

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const results = [];
const main = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

  for (const p of PAGES) {
    if (ONLY.length && !ONLY.some((n) => p.name.startsWith(n))) continue;
    const started = Date.now();
    const logs = [];
    const log = (m) => {
      logs.push(m);
      console.log(`   · [${p.name}] ${m}`);
    };
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
      locale: 'zh-CN',
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/favicon|Failed to load resource.*(4\d\d|5\d\d)/i.test(t)) return;
      if (consoleErrors.length < 20) consoleErrors.push(t.slice(0, 220));
    });
    page.on('pageerror', (e) => {
      if (consoleErrors.length < 20)
        consoleErrors.push('pageerror: ' + String(e.message).slice(0, 220));
    });

    let diag = null;
    let axe = null;
    try {
      if (p.stubAdmin) await installStubs(ctx);

      await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
        timeout: 30000,
      });

      if (p.auth === 'user' || p.auth === 'admin') {
        await page.waitForTimeout(3200); // 等启动期会话检查落定
        const armed = await armGuard(page, p.auth === 'admin' ? 'admin' : 'user');
        if (armed !== 'armed') log(`guard 注入异常：${armed}`);
      } else {
        await page.waitForTimeout(1200);
      }

      // 跳到目标 hash
      await page.evaluate((h) => {
        location.hash = '#' + h;
      }, p.hash);
      await page.waitForTimeout(4200);
      if (p.waitSel) {
        await page
          .waitForSelector(p.waitSel, { timeout: 12000 })
          .catch(() => log(`waitSel 超时：${p.waitSel}`));
      }
      if (p.unlockGate) {
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        await page.waitForTimeout(2700);
      }
      await page.waitForTimeout(1200);

      // 诊断
      diag = await page.evaluate(diagFn).catch((e) => ({ error: String(e).slice(0, 200) }));

      // 截图
      for (const label of p.shots) {
        if (label === 'top') await page.evaluate(() => window.scrollTo(0, 0));
        else if (label === 'bottom') await page.evaluate(() => window.scrollTo(0, 1e7));
        else
          await page.evaluate(() =>
            window.scrollTo(
              0,
              Math.max(0, (document.documentElement.scrollHeight - innerHeight) / 2),
            ),
          );
        await page.waitForTimeout(650);
        await shot(page, `${p.name}-${label}`);
      }
      // fullPage（过长跳过）
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      if (docH <= 9000) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(350);
        await page
          .screenshot({ path: path.join(OUT, `${p.name}-full.png`), fullPage: true })
          .catch(() => {});
      } else {
        log(`页面过长（${docH}px），跳过 fullPage`);
      }

      // axe 对比度
      try {
        const res = await new AxeBuilder({ page })
          .options({ runOnly: { type: 'rule', values: ['color-contrast'] } })
          .analyze();
        axe = res.violations.flatMap((v) =>
          v.nodes.slice(0, 12).map((n) => ({
            target: n.target?.[0],
            html: (n.html || '').slice(0, 140),
            summary: (n.failureSummary || '').replace(/\n/g, ' ').slice(0, 200),
          })),
        );
      } catch (e) {
        axe = [{ error: String(e).slice(0, 160) }];
      }

      // 交互扩展
      if (p.extras === 'aiChat')
        await extrasAiChat(page, log).catch((e) => log('extras 失败：' + e.message.slice(0, 100)));
      if (p.extras === 'keysModels')
        await extrasKeysModels(page, log).catch((e) =>
          log('extras 失败：' + e.message.slice(0, 100)),
        );
    } catch (e) {
      log('流程失败：' + String(e.message).slice(0, 200));
    }

    const record = {
      name: p.name,
      hash: p.hash,
      auth: p.auth,
      diag,
      axe,
      consoleErrors,
      logs,
      ms: Date.now() - started,
    };
    results.push(record);
    const off = diag?.offscreen?.length ?? '-';
    const clip = diag?.clippedX?.length ?? '-';
    const cov = diag?.covered?.length ?? '-';
    console.log(
      `[${p.name}] 完成 ${record.ms}ms — 横向溢出(static)=${off} 截断=${clip} 遮挡组=${cov} axe对比度=${axe?.length ?? '-'}`,
    );
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'diagnostics.json'), JSON.stringify(results, null, 2));
  console.log(`\n产物: ${OUT}`);
  console.log(`诊断: ${path.join(OUT, 'diagnostics.json')}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
