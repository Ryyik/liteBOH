import { chromium } from 'playwright';

// composer 统一动作栏探针：横屏（UserSpace 社区 tab → 左栏「发布」→ 发布会话）
// 验证点：1) 标签 / 图片 / 智能整理 / 更多同排 2) 点击标签后菜单可用
//        3) 内部不再有第二颗发布按钮与旧 chips 4) 暗色适配
// 流程对齐 probe-user-space-ia.mjs：登录注入重试锚定 + rail-action compose 入口
const BASE = process.env.BASE || 'http://localhost:5173';
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
    // forum-dark.css 是动态 import：等动作栏暗色规则真正插入后再度量
    await page.waitForFunction(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of rules) {
          const sel = r.selectorText || '';
          if (sel.includes('data-theme="dark"') && sel.includes('composer-actions')) return true;
        }
      }
      return false;
    }, null, { timeout: 10000 }).catch(() => console.log('[warn] forum-dark action-bar rules not detected in time'));
  }
  await page.waitForTimeout(700);

  await page.click('[data-rail-action="compose"]');
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 12000 });
  const actionBarReady = await page.waitForSelector('.mobile-composer-overlay .composer-actions', { state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(async () => {
      const diag = await page.evaluate(() => ({
        url: location.href,
        overlayCount: document.querySelectorAll('.mobile-composer-overlay').length,
        actionBarCount: document.querySelectorAll('.composer-actions').length,
        actionButtonCount: document.querySelectorAll('.composer-action-btn').length,
        legacyChipRowCount: document.querySelectorAll('.mobile-composer-chip-row').length,
        loggedIn: (() => {
          const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
          return !!pinia && pinia.state.value.auth.isLoggedIn === true;
        })(),
        overlayHead: (document.querySelector('.mobile-composer-overlay')?.innerHTML || '').slice(0, 400)
      }));
      console.log('[diag] action-bar missing:', JSON.stringify(diag, null, 2));
      return false;
    });
  if (!actionBarReady) throw new Error('composer action bar not visible');
  await page.waitForTimeout(700);

  await page.fill('.mobile-composer-overlay .post-content-input', '横屏动作栏验证：标签、图片、智能整理、更多应同排，旧的 chips 行不得回潮。');
  await page.waitForTimeout(600);

  await page.screenshot({ path: `debug-screenshots/composer-chips-${theme}-full.png` });
  const row = page.locator('.mobile-composer-overlay .composer-actions');
  await row.screenshot({ path: `debug-screenshots/composer-chips-${theme}-row.png` });

  // 点开标签菜单，证明统一动作栏不是静态装饰
  await page.click('.mobile-composer-overlay .composer-actions .composer-action-btn[aria-label="选择帖子标签"]');
  const tagMenuVisible = await page
    .waitForSelector('.mobile-composer-overlay .composer-tag-menu', { state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  const m = await page.evaluate(() => {
    const overlay = document.querySelector('.mobile-composer-overlay');
    const q = (sel) => overlay?.querySelector(sel) || null;
    const rect = (sel) => {
      const el = q(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const actions = [...(overlay?.querySelectorAll('.composer-action-btn') || [])].map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.replace(/\s+/g, ' ').trim(),
        label: el.getAttribute('aria-label') || '',
        h: Math.round(el.getBoundingClientRect().height),
        bg: cs.backgroundColor,
        color: cs.color,
        border: cs.borderColor,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
        active: el.classList.contains('active')
      };
    });
    return {
      row: rect('.composer-actions'),
      actionCount: actions.length,
      actions,
      bodyTheme: document.documentElement.dataset.theme || 'light',
      footerPostBtn: (() => {
        const el = q('.editor-footer .post-btn');
        return el ? getComputedStyle(el).display : 'ABSENT';
      })(),
      legacy: {
        chipRow: q('.mobile-composer-chip-row') ? 'PRESENT' : 'ABSENT',
        mobileToolbar: q('.mobile-post-image-toolbar') ? 'PRESENT' : 'ABSENT',
        desktopTools: q('.desktop-post-tools') ? 'PRESENT' : 'ABSENT',
        tagSelector: q('.post-tag-selector') ? 'PRESENT' : 'ABSENT',
        weeklyCheckin: q('.weekly-checkin-panel') ? 'PRESENT' : 'ABSENT'
      },
      addMoreCard: q('.post-image-add-more-card')
        ? getComputedStyle(q('.post-image-add-more-card')).display
        : 'ABSENT'
    };
  });
  console.log(`[${theme}@${vw}x${vh}] metrics:`, JSON.stringify({ ...m, tagMenuVisible }, null, 2));
  console.log(`[${theme}@${vw}x${vh}] errors:`, errors.length ? errors.slice(0, 6) : 'none');
  const failures = [];
  if (!m.row || m.row.h < 36) failures.push('action row missing/too short');
  if (m.actionCount < 4) failures.push(`expected 4 actions, got ${m.actionCount}`);
  if (!m.actions.some((a) => a.label.includes('选择帖子标签'))) failures.push('tag action missing');
  if (!m.actions.some((a) => a.label.includes('相册选择图片'))) failures.push('image action missing');
  if (!m.actions.some((a) => a.text.includes('智能整理'))) failures.push('polish action missing');
  if (!m.actions.some((a) => a.label.includes('更多选项'))) failures.push('more action missing');
  if (!tagMenuVisible) failures.push('tag menu did not open');
  if (m.footerPostBtn !== 'none' && m.footerPostBtn !== 'ABSENT') failures.push('second publish button visible');
  for (const [key, value] of Object.entries(m.legacy)) {
    if (value !== 'ABSENT') failures.push(`legacy ${key} present`);
  }
  if (m.addMoreCard !== 'none' && m.addMoreCard !== 'ABSENT') failures.push('legacy add-more card visible');
  if (errors.length) failures.push(...errors.slice(0, 3));
  if (failures.length) {
    console.error(`[${theme}] FAIL: ${failures.join(' | ')}`);
    process.exitCode = 1;
  } else {
    console.log(`[${theme}] PASS`);
  }
  await browser.close();
}

async function captureDeprecatedHost(theme, vw, vh) {
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
    return {
      sectionClass: section ? section.className : 'ABSENT',
      bodyClassHasUserspace: document.body.classList.contains('page-userspace')
    };
  });
  console.log(`[deprecated-host ${theme}@${vw}x${vh}]`, JSON.stringify(m, null, 2));
  console.log(`[deprecated-host ${theme}@${vw}x${vh}] errors:`, errors.length ? errors.slice(0, 6) : 'none');
  if (m.sectionClass !== 'ABSENT') {
    console.error('[deprecated-host] FAIL: embedded composer still rendered');
    process.exitCode = 1;
  } else if (errors.length) {
    console.error('[deprecated-host] FAIL:', errors.slice(0, 3).join(' | '));
    process.exitCode = 1;
  } else {
    console.log('[deprecated-host] PASS');
  }
  await browser.close();
}

await capture('dark', 1180, 720);
await captureDeprecatedHost('light', 900, 700);
console.log('done');
