/**
 * probe-bohai-glass.mjs — BOHAI「折射级」液态玻璃验收探针（2026-10-14，§21.7）
 *
 * 锁四件事（§21.7 的四条硬约束各有一条机器判据）：
 *   1. **覆盖层结构**：玻璃是 `inset:0 + pointer-events:none` 的纯装饰层，
 *      与输入框/菜单逐像素对齐，且不吃任何点击；
 *   2. **背板采样根**：玻璃祖先链上的堆叠上下文会裁掉采样 ⇒
 *      断言「到第一个含消息流的堆叠上下文为止，链上无其他堆叠上下文」；
 *   3. **像素级模糊真实生效**：截图回读 canvas 算梯度能量，
 *      断言「玻璃开着 < 关着 × 50%」（隐藏玻璃自身内容与 tint 后只比背后文字）；
 *   4. **零 JS 跟随**：textarea 自动增高后玻璃仍对齐（`glass-size: 100%` 的功劳）。
 *
 * 附带：菜单 elasticity=0（鼠标划过零位移）+ 点选联动 + 用量浮层同款接线（§21.8 线1）。
 *
 * 用法（打 dev server）：
 *   node scripts/probes/probe-bohai-glass.mjs http://localhost:5173
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

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
page.on('console', (m) => {
  if (
    m.type() === 'warning' &&
    /is not defined on instance|accessed during render/i.test(m.text())
  ) {
    errors.push(`vue-warn: ${m.text().slice(0, 160)}`);
  }
});

/* 模式清单 mock（确定性；真库的六档在 composer 探针里已验） */
await page.route('**/rest/v1/rpc/list_public_bohai_modes**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      {
        id: 'fast',
        mode_id: 'fast',
        model_id: 'm1',
        name: 'Fast',
        display_name: 'Fast',
        tagline: '极速响应',
        min_tier: 'free',
        status: 'active',
        sort_order: 10,
        quota_multiplier: 1,
      },
      {
        id: 'ultra',
        mode_id: 'ultra',
        model_id: 'm2',
        name: 'Ultra',
        display_name: 'Ultra',
        tagline: '深思考',
        min_tier: 'free',
        status: 'active',
        sort_order: 20,
        quota_multiplier: 2,
      },
      {
        id: 'air',
        mode_id: 'air',
        model_id: 'm3',
        name: 'Air',
        display_name: 'Air',
        tagline: '轻量',
        min_tier: 'free',
        status: 'active',
        sort_order: 30,
        quota_multiplier: 0.3,
      },
    ]),
  }),
);
await page.route('**/functions/v1/api-key-vault**', (route) => {
  const body = route.request().postData() || '';
  if (!body.includes('runtime-chat-stream')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, message: '探针不调真模型' }),
  });
});

/* 种子用户偏好：玻璃透明度 40%（在应用脚本跑之前写 localStorage）*/
await page.addInitScript(() => {
  const key = 'boh_global_ai_preferences_v1';
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      return {};
    }
  })();
  saved.glassOpacity = 0.4;
  localStorage.setItem(key, JSON.stringify(saved));
});
await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
await page.waitForSelector('.boh-composer-input', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const auth = pinia.state.value.auth;
  auth.isLoggedIn = true;
  if (auth.userInfo)
    Object.assign(auth.userInfo, {
      username: 'probe_user',
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
    });
});
await page.waitForTimeout(800);

/* 像素级锐度（梯度能量）：截图 → base64 → 页面 canvas */
const energy = async (clip) => {
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
const tmpStyle = (id, css) =>
  page.evaluate(
    ([i, c]) => {
      const s = document.createElement('style');
      s.id = i;
      s.textContent = c;
      document.head.appendChild(s);
    },
    [id, css],
  );
const rmStyle = (id) => page.evaluate((i) => document.getElementById(i)?.remove(), id);
/** 同区域「玻璃开/关」梯度对照（隐藏玻璃自身内容与 tint，只比背后文字） */
const blurDiff = async (name, hideSel, clipOf) => {
  await tmpStyle('pbg-hide', `${hideSel}, .boh-glass-tint { visibility: hidden !important; }`);
  await page.waitForTimeout(180);
  const clip = await clipOf();
  const on = await energy(clip);
  await tmpStyle('pbg-off', '.boh-glass-under { display: none !important; }');
  await page.waitForTimeout(180);
  const off = await energy(clip);
  await rmStyle('pbg-off');
  await rmStyle('pbg-hide');
  await page.waitForTimeout(150);
  check(
    `${name}（开/关梯度 <50%）`,
    on < off * 0.5,
    `on=${on.toFixed(2)} off=${off.toFixed(2)} Δ=${(on - off).toFixed(2)}`,
  );
};

/* 对齐：玻璃采样层（最大的 backdrop-filter 元素）与目标矩形对照 */
const alignWith = (anchorSel, targetSel) =>
  page.evaluate(
    ([a, s]) => {
      const anchor = document.querySelector(a);
      const target = document.querySelector(s);
      if (!anchor || !target) return { ok: false, note: 'missing' };
      const tr = target.getBoundingClientRect();
      let best = null;
      anchor.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if ((cs.backdropFilter || cs.webkitBackdropFilter || '').includes('blur')) {
          const r = el.getBoundingClientRect();
          if (!best || r.width * r.height > best.width * best.height) best = r;
        }
      });
      if (!best) return { ok: false, note: 'no layer' };
      const dx = Math.abs(best.left + best.width / 2 - (tr.left + tr.width / 2));
      const dy = Math.abs(best.top + best.height / 2 - (tr.top + tr.height / 2));
      const dw = Math.abs(best.width - tr.width);
      const dh = Math.abs(best.height - tr.height);
      return {
        ok: dx < 4 && dy < 4 && dw < 6 && dh < 6,
        d: `${Math.round(dx)}/${Math.round(dy)}/${Math.round(dw)}/${Math.round(dh)}`,
      };
    },
    [anchorSel, targetSel],
  );

/* 采样根链：到第一个「包含 .boh-stream 的堆叠上下文」为止不得有其他堆叠上下文 */
const chainCheck = () =>
  page.evaluate(() => {
    const bad = new Set();
    const stream = document.querySelector('.boh-stream');
    document.querySelectorAll('.boh-glass-under').forEach((el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        const name = (typeof n.className === 'string' && n.className) || n.tagName;
        const stacks =
          cs.zIndex !== 'auto' ||
          cs.opacity !== '1' ||
          cs.filter !== 'none' ||
          cs.transform !== 'none' ||
          cs.mixBlendMode !== 'normal';
        if (stacks) {
          if (stream && n.contains(stream)) break;
          bad.add(`${name} z=${cs.zIndex}`);
        }
        n = n.parentElement;
      }
    });
    return Array.from(bad);
  });

check(
  '输入框锚与玻璃层存在',
  (await page.locator('.boh-composer-anchor .boh-glass-under').count()) === 1,
);
check(
  '玻璃层 pointer-events:none',
  (await page
    .locator('.boh-glass-under')
    .first()
    .evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none',
);
const prefState = await page.evaluate(() => ({
  alphaVar: document.documentElement.style.getPropertyValue('--refract-alpha').trim(),
  tint: getComputedStyle(document.querySelector('.boh-glass-tint') || document.body)
    .backgroundColor,
}));
check(
  '用户偏好已写根变量（--refract-alpha=0.40）',
  prefState.alphaVar === '0.40',
  prefState.alphaVar,
);
check('白膜 α 跟随用户偏好', prefState.tint.includes('0.4'), prefState.tint);
const c0 = await alignWith('.boh-composer-anchor', '.boh-composer');
check('输入框玻璃与框对齐', c0.ok, JSON.stringify(c0));
check(
  '采样根链合法（坏根=0）',
  (await chainCheck()).length === 0,
  JSON.stringify(await chainCheck()),
);

/* 发两条消息（mock 不调真模型 ⇒ AI 侧渲染失败占位，但消息节点在）⇒ 背板有内容 */
for (const text of [
  '探针：一',
  '探针：二',
  '探针：三',
  '探针：四',
  '探针：五',
  '探针：六',
  '探针：七',
  '探针：八',
  '探针：九',
  '探针：十',
]) {
  await page.fill('.boh-composer-input', text);
  await page.locator('.boh-send').click();
  await page.waitForTimeout(700);
}
check(
  '消息已渲染（背板有内容）',
  (await page.locator('.boh-msg').count()) >= 2,
  `msgs=${await page.locator('.boh-msg').count()}`,
);

/* 滚动让文字垫到玻璃下面（真实使用是「滚动时」文字穿过玻璃） */
await page.evaluate(() => {
  const s = document.querySelector('.boh-stream');
  if (s) s.scrollTop = 0;
});
check(
  '已滚到会话顶部（首批消息垫在玻璃下）',
  await page.evaluate(() => {
    const s = document.querySelector('.boh-stream');
    const c = document.querySelector('.boh-composer').getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    return sr.bottom > c.y + 30 && s.scrollHeight > s.clientHeight;
  }),
);
await page.waitForTimeout(300);

await blurDiff('输入框玻璃模糊真实生效', '.boh-composer *', async () => {
  const r = await page.locator('.boh-composer').boundingBox();
  return {
    x: Math.round(r.x + 40),
    y: Math.round(r.y + 8),
    width: Math.round(r.width - 80),
    height: Math.round(r.height * 0.42),
  };
});

/* 自动增高跟随 */
const h0 = await page.locator('.boh-composer').evaluate((el) => el.getBoundingClientRect().height);
await page.fill(
  '.boh-composer-input',
  '第一行长文本测试内容\n第二行\n第三行\n第四行\n第五行\n第六行',
);
await page.waitForTimeout(400);
const h1 = await page.locator('.boh-composer').evaluate((el) => el.getBoundingClientRect().height);
check('输入后自动增高', h1 > h0 + 20, `${Math.round(h0)}→${Math.round(h1)}`);
const c1 = await alignWith('.boh-composer-anchor', '.boh-composer');
check('增高后玻璃零 JS 跟随（仍对齐）', c1.ok, JSON.stringify(c1));

/* 模型菜单 */
await page.evaluate(() => {
  const s = document.querySelector('.boh-stream');
  if (s) s.scrollTop = s.scrollHeight;
});
await page.click('.boh-mode-pill');
await page.waitForTimeout(350);
check('模型菜单打开', await page.locator('.boh-mode-wrap .boh-menu-anchor').isVisible());
const m0 = await alignWith('.boh-mode-wrap .boh-menu-anchor', '.boh-mode-wrap .boh-mode-menu');
check('菜单玻璃与面板对齐', m0.ok, JSON.stringify(m0));
await blurDiff('菜单玻璃模糊真实生效', '.boh-mode-menu *', async () => {
  const r = await page.locator('.boh-mode-menu').boundingBox();
  return {
    x: Math.round(r.x + 20),
    y: Math.round(r.y + r.height * 0.35),
    width: 180,
    height: Math.round(r.height * 0.4),
  };
});
const sig = () =>
  page.evaluate(() => {
    const a = document.querySelector('.boh-mode-wrap .boh-menu-anchor');
    return Array.from(a.querySelectorAll('*'))
      .map((n) => getComputedStyle(n).transform)
      .join('|');
  });
const s1 = await sig();
const mb = await page.locator('.boh-mode-menu').boundingBox();
await page.mouse.move(mb.x + 24, mb.y + 24);
await page.waitForTimeout(200);
await page.mouse.move(mb.x + mb.width - 24, mb.y + mb.height - 24);
await page.waitForTimeout(300);
const s2 = await sig();
check('菜单零位移（elasticity=0）', s1 === s2);
await page.click('.boh-mm-item[data-mode-id="ultra"]');
await page.waitForTimeout(300);
check(
  '点选模式 → 胶囊更新 + 菜单收起',
  ((await page.locator('.boh-mode-pill-name').textContent()) || '').includes('Ultra') &&
    !(await page.locator('.boh-mode-wrap .boh-menu-anchor').isVisible()),
);

/* 工具菜单 */
await page.click('.boh-tools-pill');
await page.waitForTimeout(350);
check('工具菜单打开', await page.locator('.boh-tools-wrap .boh-menu-anchor').isVisible());
const m1 = await alignWith('.boh-tools-wrap .boh-menu-anchor', '.boh-tools-wrap .boh-tools-menu');
check('工具菜单玻璃对齐', m1.ok, JSON.stringify(m1));
await page.click('.boh-tools-pill');
await page.waitForTimeout(200);

/* 用量浮层（§21.8 线1）：hover 圆钮 → 锚内折射玻璃；与输入框/菜单同款「无 z-index 锚 + 兄弟玻璃」。
   ⚠️ 每个新面都要重演一次采样根链检查（chainCheck 遍历**所有** .boh-glass-under，天然覆盖）。 */
await page.fill('.boh-composer-input', '');
await page.evaluate(() => {
  const s = document.querySelector('.boh-stream');
  if (s) s.scrollTop = s.scrollHeight;
});
await page.waitForTimeout(300);
await page.hover('.boh-usage');
await page.waitForTimeout(420);
check(
  '用量浮层锚与玻璃层存在',
  (await page.locator('.boh-usage-anchor .boh-glass-under').count()) === 1,
);
const u0 = await alignWith('.boh-usage-anchor', '.boh-usage-pop');
check('用量浮层玻璃与面板对齐', u0.ok, JSON.stringify(u0));
check(
  '用量浮层玻璃采样根链合法（坏根=0）',
  (await chainCheck()).length === 0,
  JSON.stringify(await chainCheck()),
);
/* ⚠️ 浮层锚在工具栏**最右**、弹出位置常落在消息稀疏区 ⇒ 背板能量可能恒 0，
   判据会退化成「0 < 0×50%」必然红（实测踩到）。给 `.boh-stream` **临时铺一层高频底纹**
   当确定性背板：玻璃开着 ⇒ 糊掉（低能量）；关掉 ⇒ 锐利（高能量）。 */
await tmpStyle(
  'pbg-usage-bg',
  '.boh-stream { background-image: repeating-linear-gradient(45deg, #111 0 3px, #eee 3px 6px); }',
);
await page.waitForTimeout(220);
await blurDiff('用量浮层玻璃模糊真实生效', '.boh-usage-pop *', async () => {
  const r = await page.locator('.boh-usage-pop').boundingBox();
  const c = await page.locator('.boh-composer').boundingBox();
  /* 只取「浮层落在输入框之上」的那一段：输入框区域底下还有 composer 自己的玻璃，
     混进采样区会让「关玻璃」的对照同时撤掉两层 ⇒ 判据被稀释（假绿风险）。 */
  const h = Math.max(24, Math.min(r.height - 16, c.y - r.y - 12));
  return {
    x: Math.round(r.x + 12),
    y: Math.round(r.y + 8),
    width: Math.round(r.width - 24),
    height: Math.round(h),
  };
});
await rmStyle('pbg-usage-bg');

check('零 pageerror / 零 Vue 未定义绑定', errors.length === 0, errors.join(' | ').slice(0, 220));

await page.screenshot({ path: 'debug-screenshots/bohai-glass-src-light.png' });
await browser.close();

console.log(`\n──── 合计 ${total} 条，失败 ${violations.length} 条 ────`);
if (violations.length) {
  console.log(`失败项：\n- ${violations.join('\n- ')}`);
  process.exit(1);
}
