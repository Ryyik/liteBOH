import { chromium } from 'playwright';
import fs from 'node:fs';

// 暗色模式全站审查探针 v2（保真版）
// 与 v1 的区别：通过 localStorage['boh-theme']=dark 让 themeManager 在启动时原生进入暗色，
// 触发 ensureThemeCSS('dark') 懒加载 9 个暗色样式表；页面容器 data-theme 由各组件
// :data-theme="currentTheme" 自管理，全部生效。SPA 内 hash 导航保持主题状态。
const BASE = 'http://localhost:5173';
const OUT_JSON = 'dark-audit-results.json';
const SHOT_DIR = 'debug-screenshots';
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/newsroom', name: 'newsroom' },
  { path: '/overview', name: 'overview' },
  { path: '/forum', name: 'forum' },
  { path: '/forum/post/1', name: 'post-detail' },
  { path: '/lotteries', name: 'lotteries' },
  { path: '/activities-wall', name: 'activities-wall' },
  { path: '/activities-wall/list', name: 'activities-list' },
  { path: '/activities-wall/photo-wall', name: 'photo-wall' },
  { path: `/profile/${encodeURIComponent('方块之家')}`, name: 'profile' },
  { path: '/shop', name: 'shop' },
  { path: '/shop/account', name: 'shop-account' },
  { path: '/gift', name: 'gift' },
  { path: '/login', name: 'login' },
  { path: '/reset-password', name: 'reset-password' },
  { path: '/mbti', name: 'mbti' },
  { path: '/history', name: 'history' },
  { path: '/birthday', name: 'birthday' },
  { path: '/about', name: 'about' },
  { path: '/join', name: 'join' },
  { path: '/download', name: 'download' },
  { path: '/tutorial', name: 'tutorial' },
  { path: '/shows', name: 'shows' },
  { path: '/character-book', name: 'character-book' },
  { path: '/ai-chat', name: 'ai-chat' },
  { path: '/ai-intro', name: 'ai-intro' },
  { path: '/boh-8-years-event', name: 'boh-8-years' },
  { path: '/boh-8-years-journey', name: 'boh-8-years-journey' },
  { path: '/lab', name: 'lab' },
  { path: '/health', name: 'health' },
  { path: '/user-space', name: 'user-space' },
  { path: '/user-space/subscriptions', name: 'us-subscriptions' },
  { path: '/user-space/gifts', name: 'us-gifts' },
  { path: '/user-space/messages', name: 'us-messages' },
  { path: '/user-space/partners', name: 'us-partners' },
  { path: '/user-space/profile', name: 'us-profile' },
  { path: '/user-space/posts', name: 'us-posts' },
  { path: '/user-space/ai', name: 'us-ai' },
  { path: '/user-space/account-security', name: 'us-account' },
  { path: '/mailbox', name: 'mailbox' },
  { path: '/user-center/points', name: 'uc-points' },
  { path: '/creator-studio', name: 'creator-studio' },
  { path: '/admin/data-management', name: 'admin-data' },
  { path: '/admin/api-keys', name: 'admin-apikeys' },
  { path: '/admin/alert-style-editor', name: 'admin-alert' },
  { path: '/admin/ai-quota', name: 'admin-aiquota' },
  { path: '/admin/birthday', name: 'admin-birthday' },
  { path: '/admin/shop-console', name: 'admin-shop' },
  { path: '/admin/hero-console', name: 'admin-hero' },
  { path: '/__dev/motion', name: 'motion-lab' }
];

const AUDIT_FN = () => {
  const parseC = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = Math.max(a, b), y = Math.min(a, b); return (x + 0.05) / (y + 0.05); };
  const gradStops = (g) => {
    const out = [];
    const re = /rgba?\(([^)]+)\)|#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
    let m;
    while ((m = re.exec(g))) {
      if (m[1]) {
        const p = m[1].split(',').map((x) => parseFloat(x));
        out.push({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 });
      } else {
        let h = m[2];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        out.push({ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 });
      }
    }
    return out;
  };

  const bodyBase = parseC(getComputedStyle(document.body).backgroundColor)
    || parseC(getComputedStyle(document.documentElement).backgroundColor)
    || { r: 255, g: 255, b: 255, a: 1 };

  // blendOver: 把 top(可带 alpha) 叠到 bottom 上，返回不透明合成色
  const blendOver = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1
  });

  // candidates = 该元素文字之下"实际可能渲染出的背景色"集合（不透明）
  const cache = new WeakMap();
  function bgFor(node) {
    if (cache.has(node)) return cache.get(node);
    let result;
    if (!node.parentElement || node === document.documentElement) {
      result = { candidates: [bodyBase], imageNear: false, unknown: false, desc: hex(bodyBase) + '(root)' };
    } else {
      const under = bgFor(node.parentElement);
      const u0 = under.candidates[0] || bodyBase;
      const cs = getComputedStyle(node);
      const bgi = cs.backgroundImage;
      const isGrad = bgi && /gradient\(/.test(bgi);
      const hasImg = bgi && bgi !== 'none' && !isGrad;
      const ownStops = isGrad ? gradStops(bgi) : null;
      const c = parseC(cs.backgroundColor);
      let candidates;
      let unknown = false;
      if (c && c.a >= 0.98) {
        // 不透明纯色层：盖住下方一切；自身渐变绘制在其上，以渐变止点为候选
        if (ownStops && ownStops.length) {
          candidates = ownStops.filter((s) => s.a > 0.9).map((s) => ({ ...s, a: 1 }));
          candidates.push(c);
        } else {
          candidates = [{ ...c, a: 1 }];
        }
      } else if (c) {
        // 半透明色调：叠到下方每个候选上；自身渐变止点也先叠到 u0
        candidates = [];
        if (ownStops && ownStops.length) for (const s of ownStops) candidates.push(blendOver(s, u0));
        for (const u of under.candidates.slice(0, 4)) candidates.push(blendOver(c, u));
        unknown = under.unknown;
      } else {
        if (ownStops && ownStops.length) candidates = ownStops.map((s) => blendOver(s, u0));
        else if (ownStops) { candidates = under.candidates; unknown = true; } // var() 渐变止点不可解析
        else candidates = under.candidates;
        unknown = unknown || under.unknown;
      }
      if (!candidates.length) { candidates = [{ ...bodyBase, a: 1 }]; unknown = true; }
      const flags = (ownStops && ownStops.length ? '+grad' : '') + (hasImg ? '+img' : '') + (c && c.a < 0.98 ? '(α' + c.a + ')' : '');
      result = { candidates, unknown: unknown || (c && c.a >= 0.98 ? false : under.unknown && !(c && c.a > 0.001)), imageNear: hasImg || (c && c.a >= 0.98 ? false : under.imageNear), desc: hex(candidates[0]) + flags };
    }
    cache.set(node, result);
    return result;
  }

  const seen = new Set();
  const issues = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    const tag = el.tagName;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'LINK', 'META', 'HEAD'].includes(tag)) continue;
    let hasText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    let vis = true;
    try {
      vis = el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true, visibilityProperty: true, contentVisibilityAuto: true });
    } catch (e) { vis = true; }
    if (!vis) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    // 排除开发环境专用 DEV-TEST 元素
    if (el.closest('.nav-dev-island-btn')) continue;
    const cs = getComputedStyle(el);
    const col = parseC(cs.color);
    if (!col || col.a < 0.05) continue;
    const bg = bgFor(el);
    const cands = bg.candidates.length ? bg.candidates : [bodyBase];
    let worst = Infinity, worstBg = null;
    for (const c of cands) {
      const r = ratio(lum(col), lum(c));
      if (r < worst) { worst = r; worstBg = c; }
    }
    if (worst >= 4.5) continue;
    const textLum = lum(col), bgLum = lum(worstBg);
    const blackOnDark = textLum < 0.25 && bgLum < 0.3;
    const whiteOnLight = textLum > 0.5 && bgLum > 0.5;
    let cls = '';
    try { cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''; } catch (e) { cls = ''; }
    const clsShort = cls.trim().split(/\s+/).slice(0, 2).join('.');
    const isRainbow = /rainbow/i.test(clsShort);
    const review = bg.unknown || bg.imageNear || isRainbow;
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const key = tag + '|' + clsShort + '|' + hex(col) + '|' + hex(worstBg) + '|' + (worst < 3 ? 'sev' : 'warn');
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      el: tag.toLowerCase() + (clsShort ? '.' + clsShort : ''),
      text, color: hex(col), bg: hex(worstBg), bgDesc: bg.desc,
      ratio: Math.round(worst * 100) / 100,
      level: review ? 'review' : (worst < 3 ? 'severe' : 'warn'),
      blackOnDark, whiteOnLight,
      unknownBg: bg.unknown, imageNear: bg.imageNear, rainbow: isRainbow,
      fontSize: cs.fontSize
    });
  }
  return {
    darkActive: document.documentElement.getAttribute('data-theme') === 'dark',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    issues
  };
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem('boh-theme', 'dark');
    localStorage.setItem('boh-ui-style', 'glass');
  } catch (e) {}
});
const page = await context.newPage();

await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(2000); // 等待 ensureThemeCSS('dark') 完成 + 首屏渲染

const injectState = () => page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  const prev = pinia.state.value.auth.userInfo || {};
  pinia.state.value.auth.userInfo = {
    ...prev, id: 'probe-user', username: '方块之家', role: 'admin',
    points: 9999, isBanned: false, avatar_url: '', tier: 'premium'
  };
});
await injectState();

const results = [];
for (const p of PAGES) {
  try {
    await page.goto(`${BASE}/#${p.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1300);
    await injectState();
    await page.waitForTimeout(400);
    const r = await page.evaluate(AUDIT_FN);
    const finalUrl = await page.url();
    await page.screenshot({ path: `${SHOT_DIR}/dark-audit-${p.name}.png` });
    const severe = r.issues.filter((i) => i.level === 'severe');
    const warn = r.issues.filter((i) => i.level === 'warn');
    const review = r.issues.filter((i) => i.level === 'review');
    const black = r.issues.filter((i) => i.blackOnDark);
    const white = r.issues.filter((i) => i.whiteOnLight);
    results.push({
      page: p.name, path: p.path, finalUrl,
      darkActive: r.darkActive, bodyBg: r.bodyBg,
      severeCount: severe.length, warnCount: warn.length, reviewCount: review.length,
      blackOnDarkCount: black.length, whiteOnLightCount: white.length,
      issues: r.issues
    });
    console.log(`[${p.name}] dark=${r.darkActive ? 'Y' : 'N'} severe=${severe.length} warn=${warn.length} review=${review.length} blackOnDark=${black.length} whiteOnLight=${white.length} url=${finalUrl.replace(BASE, '')}`);
    for (const s of severe.slice(0, 4)) {
      console.log(`   · ${s.blackOnDark ? '黑底黑字' : s.whiteOnLight ? '白底白字' : '低对比'} ${s.ratio} ${s.el} "${s.text.slice(0, 22)}" color=${s.color} bg=${s.bg}${s.imageNear ? ' (bg=图片?)' : ''}`);
    }
  } catch (e) {
    results.push({ page: p.name, path: p.path, error: String(e.message || e).slice(0, 200), issues: [] });
    console.log(`[${p.name}] PROBE-ERROR ${String(e.message || e).slice(0, 120)}`);
  }
}

fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
await browser.close();
const totalSevere = results.reduce((a, r) => a + (r.severeCount || 0), 0);
const totalBlack = results.reduce((a, r) => a + (r.blackOnDarkCount || 0), 0);
const totalWhite = results.reduce((a, r) => a + (r.whiteOnLightCount || 0), 0);
console.log(`\nDONE pages=${results.length} severe=${totalSevere} blackOnDark=${totalBlack} whiteOnLight=${totalWhite} → ${OUT_JSON}`);
