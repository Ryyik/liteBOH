import { chromium } from 'playwright';

// composer 工具 chips 探针：横屏（UserSpace 社区 tab → 左栏「发布」→ 全屏发布会话）
// 验证点：1) chips 一行排布 2) 激活态着色 3) 行高 ~40px 4) 暗色适配
// 流程对齐 probe-user-space-ia.mjs：登录注入重试锚定 + rail-action compose 入口
const BASE = 'http://localhost:5173';
const ARGS = ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'];

async function capture(theme, vw = 1180, vh = 720) {
  const browser = await chromium.launch({ channel: 'chrome', args: ARGS });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  if (theme === 'dark') {
    await page.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  }

  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });

  await page.waitForFunction(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return pinia && pinia.state.value.auth.isInitialized === true;
  }, null, { timeout: 15000 }).catch(() => {});

  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: '3f1c9a54-2b6e-4e2a-9d17-8c4b1f0a2e77',
        username: 'probe_chips',
        role: 'user',
        points: 1024
      };
    });
    await page.waitForTimeout(450);
    const stillIn = await page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return !!pinia && pinia.state.value.auth.isLoggedIn === true;
    });
    if (stillIn) break;
  }

  await page.waitForFunction(() => !!document.querySelector('.user-space-page'), null, { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('.forum-main-grid'), null, { timeout: 20000 });
  if (theme === 'dark') {
    // forum-dark.css 是动态 import：等含 chip/glass-pill 暗色规则的样式表真正插入后再度量
    await page.waitForFunction(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of rules) {
          const sel = r.selectorText || '';
          if (sel.includes('data-theme="dark"') && (sel.includes('mobile-composer-chip') || sel.includes('glass-pill-btn'))) return true;
        }
      }
      return false;
    }, null, { timeout: 10000 }).catch(() => console.log('[warn] forum-dark css rules not detected in time'));
  }
  await page.waitForTimeout(700);

  await page.click('[data-rail-action="compose"]');
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 12000 });
  const chipReady = await page.waitForSelector('.mobile-composer-chip-row', { state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(async () => {
      const diag = await page.evaluate(() => ({
        url: location.href,
        overlayCount: document.querySelectorAll('.mobile-composer-overlay').length,
        chipRowCount: document.querySelectorAll('.mobile-composer-chip-row').length,
        settingListCount: document.querySelectorAll('.mobile-composer-setting-list').length,
        chipCount: document.querySelectorAll('.mobile-composer-chip').length,
        loggedIn: (() => {
          const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
          return !!pinia && pinia.state.value.auth.isLoggedIn === true;
        })(),
        overlayHead: (document.querySelector('.mobile-composer-overlay')?.innerHTML || '').slice(0, 400)
      }));
      console.log('[diag] chip-row missing:', JSON.stringify(diag, null, 2));
      return false;
    });
  if (!chipReady) throw new Error('chip-row not visible');
  await page.waitForTimeout(700);

  await page.fill('.mobile-composer-overlay .post-content-input', '横屏 chips 验证：工具行应为一行玻璃胶囊，高度约 40px，激活项淡蓝着色。');
  await page.waitForTimeout(600);

  await page.screenshot({ path: `debug-screenshots/composer-chips-${theme}-full.png` });
  const row = page.locator('.mobile-composer-chip-row');
  await row.screenshot({ path: `debug-screenshots/composer-chips-${theme}-row.png` });

  const m = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const rect = (sel) => {
      const el = q(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const chips = [...document.querySelectorAll('.mobile-composer-chip')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.replace(/\s+/g, ' ').trim(),
        h: Math.round(el.getBoundingClientRect().height),
        bg: cs.backgroundColor,
        color: cs.color,
        border: cs.borderColor,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
        active: el.classList.contains('is-active')
      };
    });
    return {
      row: rect('.mobile-composer-chip-row'),
      chipCount: chips.length,
      chips,
      bodyTheme: document.documentElement.dataset.theme || 'light',
      toolbarDisplay: (() => {
        const el = document.querySelector('.mobile-post-image-toolbar');
        return el ? getComputedStyle(el).display : 'ABSENT';
      })(),
      saveDraftPill: (() => {
        const el = document.querySelector('.desktop-save-draft-btn');
        if (!el) return 'ABSENT';
        const cs = getComputedStyle(el);
        return { tag: el.tagName, bg: cs.backgroundColor, radius: cs.borderRadius, color: cs.color };
      })(),
      imageEntries: {
        desktopImgBtn: (() => {
          const el = document.querySelector('.desktop-post-image-btn') ||
            [...document.querySelectorAll('.desktop-post-tool-btn')].find((b) => (b.getAttribute('aria-label') || '').includes('从相册选择图片'));
          return el ? getComputedStyle(el).display : 'ABSENT';
        })(),
        addMoreCard: (() => {
          const el = [...document.querySelectorAll('.post-image-add-more-card')].find((n) => n.closest('.mobile-composer-overlay'));
          return el ? getComputedStyle(el).display : 'ABSENT';
        })()
      }
    };
  });
  console.log(`[${theme}@${vw}x${vh}] metrics:`, JSON.stringify(m, null, 2));
  console.log(`[${theme}@${vw}x${vh}] errors:`, errors.length ? errors.slice(0, 6) : 'none');
  await browser.close();
}

async function captureEmbedded(theme, vw, vh) {
  const browser = await chromium.launch({ channel: 'chrome', args: ARGS });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));

  if (theme === 'dark') {
    await page.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  }
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = { id: '3f1c9a54-2b6e-4e2a-9d17-8c4b1f0a2e77', username: 'probe_chips', role: 'user', points: 1024 };
    });
    await page.waitForTimeout(450);
    if (await page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return !!pinia && pinia.state.value.auth.isLoggedIn === true;
    })) break;
  }
  await page.waitForFunction(() => !!document.querySelector('.forum-main-grid'), null, { timeout: 20000 });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const section = document.querySelector('.forum-page.embedded-mode .post-creation-section');
    const pick = (sel, root) => {
      const el = root && root.querySelector(sel);
      return el ? getComputedStyle(el).display : 'ABSENT';
    };
    return {
      sectionClass: section ? section.className : 'ABSENT',
      toolbar: pick('.mobile-post-image-toolbar', section),
      desktopTools: pick('.desktop-post-tools', section),
      chipRow: pick('.mobile-composer-chip-row', section),
      bodyClassHasUserspace: document.body.classList.contains('page-userspace')
    };
  });
  console.log(`[embedded ${theme}@${vw}x${vh}]`, JSON.stringify(m, null, 2));
  console.log(`[embedded ${theme}@${vw}x${vh}] errors:`, errors.length ? errors.slice(0, 6) : 'none');
  await browser.close();
}

await capture('dark', 1180, 720);
await captureEmbedded('light', 900, 700);
console.log('done');
