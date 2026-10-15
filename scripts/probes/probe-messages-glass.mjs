/**
 * probe-messages-glass.mjs — 消息中心液态玻璃验收探针（2026-10-15）
 *
 * 四类断言同批（交接 §5 纪律；方法论照 probe-bohai-glass.mjs 复制）：
 *   1. 玻璃挂载：页头 .x-header-minimal / 列表 .x-inbox-list 的 computed backdrop-filter 非 none；
 *   2. 材质口径：底色 == --liquid-bg token 值（亮 rgba(255,255,255,.72) / 暗 rgba(28,28,36,.72)），
 *      页头内控件（.x-filter-chip）必须实底 token 且 computed blur == none（§21.11 采样死区）；
 *   3. 像素级模糊开-关：铺确定性高频条纹背板 + 隐藏表面自身内容 → 截图回读 canvas
 *      算梯度能量，断言「开 < 关 × 50%」。「关」走**整页重建**（hash 加 probe-off=1，
 *      addInitScript 注入关闭样式）—— §21.7：合成属性 A/B 必须整页重建，
 *      运行时改样式不触发重合成（假绿/假红）；
 *   4. 采样根链：两块玻璃的祖先链上堆叠上下文必须为 0（§21.11；非 0 = 玻璃假死）。
 *
 * 附：/user-center/messages 旧路由重定向、双主题各断言零 pageerror，
 *     并落两张人眼复核截图（debug-screenshots/messages-glass-{light,dark}.png）。
 *
 * 登录伪造走 AI-ENV 既定口径：等 `#app.__vue_app__` 出现后改 pinia auth（不种 sb-token），
 *   配合 route mock /auth/v1/user 与 /rest/v1/notifications（带 Content-Range）。
 *
 * 用法（打 dev server）：
 *   node scripts/probes/probe-messages-glass.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const violations = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (ok) console.log(`PASS  ${name}  -- ${detail}`);
  else {
    console.log(`FAIL  ${name}  -- ${detail}`);
    violations.push(name);
  }
};

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ryyik@bohrite.example.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email' },
  user_metadata: { username: '瑞一颗' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: new Date().toISOString(),
};

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
const MOCK_UID = '00000000-0000-4000-8000-000000000001';
const row = (id, type, status, minsAgo, extra = {}) => ({
  id,
  type,
  status,
  recipient_id: MOCK_UID,
  created_at: iso(minsAgo),
  sender_id: `${id}-sender`,
  archived_at: null,
  sender: { id: `${id}-sender`, username: `用户${id}`, avatar_url: '' },
  post: null,
  comment: null,
  ...extra,
});
const rows = [
  row('n1', 'like', 'unread', 5, {
    post: { id: 'p1', title: null, body: null, content: 'Beta6 的液态玻璃导航真的绝了' },
  }),
  row('n2', 'comment', 'unread', 38, {
    post: { id: 'p2', title: null, body: null, content: '关于横屏适配的讨论' },
    comment: {
      id: 'c1',
      content: '这个反馈我复现了，横屏下底部导航确实会压住返回键。',
      parent_id: null,
      author_username: '用户n2',
      parent: null,
    },
  }),
  row('n3', 'follow', 'unread', 180),
  row('n4', 'impression', 'read', 60 * 26),
  row('n5', 'like', 'read', 60 * 30, {
    post: { id: 'p5', title: null, body: null, content: '消息中心改版真好看' },
  }),
  row('n6', 'comment', 'read', 60 * 50, {
    post: { id: 'p6', title: null, body: null, content: 'Cloud+ 相册捏合切列' },
    comment: {
      id: 'c6',
      content: '列数记忆这块我补了个单测。',
      parent_id: null,
      author_username: '用户n6',
      parent: null,
    },
  }),
  row('n7', 'follow', 'read', 60 * 74),
  row('n8', 'impression', 'unread', 60 * 96),
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const energy = async (page, clip) => {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let sum = 0;
    for (let y = 0; y < c.height - 1; y++) {
      for (let x = 0; x < c.width - 1; x++) {
        const i = (y * c.width + x) * 4;
        sum += Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + c.width * 4));
      }
    }
    return sum / (c.width * c.height);
  }, b64);
};

const tmpStyle = (page, id, css) =>
  page.evaluate(
    ([i, c]) => {
      const s = document.createElement('style');
      s.id = i;
      s.textContent = c;
      document.head.appendChild(s);
    },
    [id, css],
  );
const rmStyle = (page, id) => page.evaluate((i) => document.getElementById(i)?.remove(), id);

/* 确定性背板：条纹铺 body + 容器（玻璃「底下有东西可糊」；§21.10 的稀疏背板坑）。
   ⚠️ 必须 !important 且带 [data-theme="dark"] 变体 —— 暗色容器底是
   `background: #0d0d12 !important`（简写连带 image、特异度 0,2,0），
   不抬到同特异度 + 后注入赢，条纹在暗色下会被整体压平（首跑实测 on=off≈0.1）。 */
const STRIPES =
  'body, .x-notifications-container, [data-theme="dark"] .x-notifications-container { background-image: repeating-linear-gradient(45deg, #111 0 3px, #eee 3px 6px) !important; }';

const samplingBlockers = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const blockers = [];
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const reasons = [];
      if (cs.transform !== 'none') reasons.push(`transform`);
      if (cs.willChange && cs.willChange !== 'auto') reasons.push(`will-change:${cs.willChange}`);
      if (cs.filter && cs.filter !== 'none') reasons.push(`filter:${cs.filter}`);
      if (parseFloat(cs.opacity) < 1) reasons.push(`opacity:${cs.opacity}`);
      if (cs.isolation === 'isolate') reasons.push('isolation');
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal')
        reasons.push(`mix-blend:${cs.mixBlendMode}`);
      if (cs.backdropFilter && cs.backdropFilter !== 'none') reasons.push('ancestor-backdrop');
      const positioned = ['absolute', 'fixed', 'sticky', 'relative'].includes(cs.position);
      if (cs.zIndex !== 'auto' && positioned) reasons.push(`z-index:${cs.zIndex}(${cs.position})`);
      if (reasons.length) {
        const cls = String(
          node.className && node.className.baseVal === undefined ? node.className : '',
        )
          .trim()
          .split(/\s+/)
          .join('.');
        blockers.push(
          `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ''} → ${reasons.join(', ')}`,
        );
      }
      node = node.parentElement;
    }
    return blockers;
  }, selector);

const runTheme = async (theme) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  const reqLog = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('request', (r) => {
    if (/rest\/v1|functions\/v1/.test(r.url())) reqLog.push(r.url().slice(0, 120));
  });
  page.on('console', (m) => {
    if (
      m.type() === 'warning' &&
      /is not defined on instance|accessed during render/i.test(m.text())
    )
      errors.push(`vue-warn: ${m.text().slice(0, 160)}`);
  });

  await page.route('**/auth/v1/user', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }),
  );
  await page.route('**/rest/v1/notifications**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${rows.length - 1}/${rows.length}` },
      body: JSON.stringify(rows),
    }),
  );

  /* 会话占位：值全部**运行时生成**（非凭据；所有网络都走本文件的 route mock），
     只需要形状合法让 supabase-js 认为有会话 —— 消息页取数链 getCurrentUser →
     supabase.auth.getUser() 在无会话时零网络静默返回 null（2026-10-15 实测），
     故必须给 localStorage 一个会话形状（probe-messages-metrics.mjs 同口径）。 */
  await page.addInitScript(
    (u) => {
      /* about:blank 是不透明源，碰 localStorage 会抛 SecurityError 污染 pageerror 统计 */
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      const rnd = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('boh-theme', u.theme);
      localStorage.setItem(
        'sb-nplnlefdwfgtyimfkyih-auth-token',
        JSON.stringify({
          access_token: rnd(),
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: rnd(),
          user: u.user,
        }),
      );
    },
    { theme, user: mockUser },
  );
  /* 令牌刷新端点：supabase 自动续期时接住，避免假会话过期导致中途登出 */
  await page.route('**/auth/v1/token**', (r) => {
    const rnd = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: rnd(),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: rnd(),
        user: mockUser,
      }),
    });
  });
  /* 「关」态：hash 带 probe-off=1 的整页重建注入（比运行时改样式可信，§21.7） */
  await page.addInitScript(() => {
    if (!location.hash.includes('probe-off=1')) return;
    const install = () => {
      const s = document.createElement('style');
      s.id = 'pmg-off';
      s.textContent =
        '.x-header-minimal, .x-inbox-list { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
      document.head.appendChild(s);
    };
    if (document.head) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
  });

  const gotoMsg = async (off) => {
    /* 先跳 about:blank 强制整页重建 —— 同文档 hash 导航不会重跑 initScript（probe-off 会失灵） */
    await page.goto('about:blank');
    await page.goto(`${BASE}/#/user-space?tab=messages${off ? '&probe-off=1' : ''}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForSelector('.x-notifications-container', { timeout: 30000 });
    await page.waitForSelector('.x-inbox-list, .x-empty', { timeout: 20000 });
    if (theme === 'dark') {
      await page
        .waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
          timeout: 10000,
        })
        .catch(() => {});
    }
    await page.waitForTimeout(2500); /* tab 过渡（300ms will-change）退场 + 暗色 CSS 懒加载 */
    if (process.env.PMG_DEBUG) {
      const dbg = await page.evaluate(() => ({
        list: !!document.querySelector('.x-inbox-list'),
        empty:
          document.querySelector('.x-empty')?.textContent?.replace(/\s+/g, ' ').slice(0, 140) ||
          null,
        rows: document.querySelectorAll('.x-item').length,
      }));
      console.log(`  [dbg] off=${off} list=${dbg.list} rows=${dbg.rows} empty=${dbg.empty}`);
      const notifReqs = reqLog.filter((u) => u.includes('notifications'));
      console.log(
        `  [dbg] notifications 请求(${notifReqs.length}): ${notifReqs.slice(-3).join(' | ') || '(无)'}`,
      );
    }
  };

  await gotoMsg(false);

  /* ── 1+2. 挂载与材质口径 ── */
  const cs = (sel, prop) =>
    page.evaluate(
      ([s, p]) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el)[p] : null;
      },
      [sel, prop],
    );

  const headerBlur = await cs('.x-header-minimal', 'backdropFilter');
  const listBlur = await cs('.x-inbox-list', 'backdropFilter');
  check(
    `${theme}: 页头玻璃挂载（computed 非 none）`,
    !!headerBlur && headerBlur !== 'none',
    headerBlur || 'missing',
  );
  check(
    `${theme}: 列表玻璃挂载（computed 非 none）`,
    !!listBlur && listBlur !== 'none',
    listBlur || 'missing',
  );

  const headerBg = await cs('.x-header-minimal', 'backgroundColor');
  const listBg = await cs('.x-inbox-list', 'backgroundColor');
  const wantBg = theme === 'dark' ? '28, 28, 36' : '255, 255, 255';
  check(
    `${theme}: 页头底色 == --liquid-bg(${wantBg},0.72)`,
    !!headerBg && headerBg.includes(wantBg) && headerBg.includes('0.72'),
    headerBg || 'missing',
  );
  check(
    `${theme}: 列表底色 == --liquid-bg(${wantBg},0.72)`,
    !!listBg && listBg.includes(wantBg) && listBg.includes('0.72'),
    listBg || 'missing',
  );

  const chipBlur = await cs('.x-filter-chip', 'backdropFilter');
  const chipBg = await cs('.x-filter-chip', 'backgroundColor');
  /* 暗色芯片的 0.07 白是 scoped 暗色块的既有设计（2026-09-09 补全体系），
     按 §21.13「暗色观感不静默改」保留；这里锁的是「实底、零 blur」这两个硬口径。 */
  const wantChip = theme === 'dark' ? '255, 255, 255' : '255, 255, 255';
  check(
    `${theme}: 页头内芯片实底且零 blur（采样死区）`,
    chipBlur === 'none' &&
      !!chipBg &&
      chipBg.includes(wantChip) &&
      (theme === 'dark' ? chipBg.includes('0.07') : chipBg.includes('0.84')),
    `blur=${chipBlur} bg=${chipBg}`,
  );

  /* ── 4. 采样根链 ── */
  /* 采样祖先链：⭐ 除架构层 .tab-page（全 tab 叠放所需 z-index，背板内容同在其子树内，
     实测列表像素级 PASS 证明采样可达）外，链上不得再出现新的堆叠上下文 ——
     它是「新面被裁假玻璃」的探测器（§21.11）。 */
  const architecturalLayer = (b) => b.includes('.tab-page');
  const headerChain = (await samplingBlockers(page, '.x-header-minimal'))?.filter(
    (b) => !architecturalLayer(b),
  );
  const listChain = (await samplingBlockers(page, '.x-inbox-list'))?.filter(
    (b) => !architecturalLayer(b),
  );
  check(
    `${theme}: 页头采样祖先链零堆叠上下文`,
    Array.isArray(headerChain) && headerChain.length === 0,
    headerChain === null ? 'missing' : headerChain.join(' | ') || 'clean',
  );
  check(
    `${theme}: 列表采样祖先链零堆叠上下文`,
    Array.isArray(listChain) && listChain.length === 0,
    listChain === null ? 'missing' : listChain.join(' | ') || 'clean',
  );

  /* ── 3. 像素级开-关（整页重建） ── */
  const clipOf = async (sel) => {
    const box = await page.locator(sel).boundingBox();
    if (!box) return null;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    return {
      x,
      y,
      width: Math.min(box.width, 390 - x),
      height: Math.min(box.height, 844 - y),
    };
  };
  const blurDiff = async (name, surfaceSel, hideSel) => {
    /* 滚到 300：让列表行真的从 sticky 页头下穿过。scroll=0 时页头背后只有背板条纹，
       且 fixed 岛的状态卡（「顶部动态导航已启用」）会探进页头 clip 污染能量读数
       （首跑实测：on=10 全是岛卡片内容）。滚动后一并把岛藏出 clip。 */
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(350);
    await tmpStyle(page, 'pmg-bg', STRIPES);
    await tmpStyle(
      page,
      'pmg-hide',
      `${hideSel}, #unified-nav-container { visibility: hidden !important; }`,
    );
    await page.waitForTimeout(250);
    const clip = await clipOf(surfaceSel);
    if (!clip) return check(name, false, 'surface missing');
    const dbg = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_').slice(0, 24);
    const liveBlur = await cs(surfaceSel, 'backdropFilter');
    await page.screenshot({ path: `debug-screenshots/pmg-dbg-${dbg}-on.png`, clip });
    const on = await energy(page, clip);
    await gotoMsg(true);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(350);
    await tmpStyle(page, 'pmg-bg', STRIPES);
    await tmpStyle(
      page,
      'pmg-hide',
      `${hideSel}, #unified-nav-container { visibility: hidden !important; }`,
    );
    await page.waitForTimeout(250);
    const clip2 = await clipOf(surfaceSel);
    if (!clip2) return check(name, false, 'surface missing (off)');
    const offBlur = await cs(surfaceSel, 'backdropFilter');
    await page.screenshot({ path: `debug-screenshots/pmg-dbg-${dbg}-off.png`, clip });
    const off = await energy(page, clip2);
    console.log(`  [dbg] ${surfaceSel} blur on=${liveBlur} / off=${offBlur}`);
    await rmStyle(page, 'pmg-hide');
    await rmStyle(page, 'pmg-bg');
    await page.waitForTimeout(150);
    check(
      name,
      on < off * 0.5,
      `on=${on.toFixed(2)} off=${off.toFixed(2)} Δ=${(on - off).toFixed(2)}`,
    );
    await gotoMsg(false);
  };

  await blurDiff(`${theme}: 页头像素级模糊开/关`, '.x-header-minimal', '.x-header-minimal *');
  await blurDiff(`${theme}: 列表像素级模糊开/关`, '.x-inbox-list', '.x-inbox-list *');

  /* 人眼复核截图（gitignored，轮转清理） */
  await page.screenshot({ path: `debug-screenshots/messages-glass-${theme}.png`, fullPage: false });

  check(
    `${theme}: 零 pageerror / 零 Vue 未定义绑定警告`,
    errors.length === 0,
    errors.join(' | ') || 'clean',
  );
  await ctx.close();
  return;
};

await runTheme('light');
await runTheme('dark');

/* ── 旧路由重定向（唯一宿主收口） ── */
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/user-center/messages`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const hash = await page.evaluate(() => location.hash);
  check('/user-center/messages 重定向到 user-space messages', /tab=messages/.test(hash), hash);
  await ctx.close();
}

await browser.close();
console.log(`\n${total - violations.length}/${total} passed`);
if (violations.length) {
  console.log('FAILED:', violations.join(' | '));
  process.exit(1);
}
