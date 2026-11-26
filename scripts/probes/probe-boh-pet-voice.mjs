/**
 * probe-boh-pet-voice.mjs —— 小方「台词 + 关闭开关」的端到端验收（2026-11-23）
 *
 * 要证四件事：
 *   V1 台词气泡会出现，且内容是「小方自己说的话」（不播报系统消息）
 *   V2 右键弹菜单（回默认位置 / 隐藏小方），不再是「右键直接回位」
 *   V3 菜单「隐藏小方」⇒ 挂件消失 + 偏好被持久化
 *   V4 **默认关闭**（2026-11-24 口径）：空盘首访既不出挂件、也不下载 chunk
 *   V5 关掉后重开能回来
 *   V6 设置·通用 里的「小方挂件」开关能真实开关（补上的重开回路）
 *
 * ⚠️ 台词有 25s 最小间隔 + 场景间隔，探针不能靠「等它自己说」——
 *    必须走确定性路径：长按摸头（petted 场景，冷却 60s 但首次必出）。
 *
 * ⚠️ 2026-11-24 起小方**默认关**，前半段测「开着的行为」必须先显式置 true
 *    **并盖迁移代次章**（petDefaultOffVersion），否则会被一次性迁移当场改回 false。
 *
 * 用法：
 *   npx vite preview --outDir dist-check --port 4181 --strictPort --host 127.0.0.1
 *   BASE=http://127.0.0.1:4181 node scripts/probes/probe-boh-pet-voice.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4181';
const OUT = process.env.OUT || 'debug-screenshots';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 220) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));

// RPC 全兜空（挂件不依赖 RPC 内容）
await page.route('**/rest/v1/rpc/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

/* 小方自 2026-11-24 起**默认关**（用户口径：「默认为用户关闭」）。
   本探针的前半段测「开着时的行为」，必须显式从开着起步；
   ⚠️ 只写 petEnabled: true 不够 —— 偏好模块带一次性迁移（代次小 ⇒ 强制关掉），
      必须同时把代次章盖上。 */
await page.addInitScript(() => {
  try {
    const k = 'boh_global_ai_preferences_v1';
    const v = JSON.parse(localStorage.getItem(k) || '{}');
    v.petEnabled = true;
    v.petDefaultOffVersion = 2;
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 隐私模式忽略 */
  }
});

try {
  // 用一个「无开场画」的宿主页，避免 hello 台词被开屏盖住
  await page.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
  await page.waitForTimeout(7000); // 等懒加载 chunk + 引擎起来

  // ---- V1：挂件在场 ----
  const petBox = await page
    .locator('.boh-pet-block')
    .boundingBox()
    .catch(() => null);
  check(
    'V0 小方挂件在场',
    Boolean(petBox),
    petBox ? `${Math.round(petBox.width)}×${Math.round(petBox.height)}` : '未找到',
  );

  if (petBox) {
    /* ---- V1：长按摸头 ⇒ 说一句 ----
       确定性触发：petted 场景冷却 60s，首次必出；且不受 25s 间隔约束
       （lastLineAt 初始为 0）。 */
    const cx = petBox.x + petBox.width - 10;
    const cy = petBox.y + petBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(500); // 超过 LONGPRESS_MS=350
    await page.mouse.up();

    const bubbleAppeared = await page
      .waitForSelector('.boh-pet-bubble', { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    const bubbleText = bubbleAppeared
      ? (await page.locator('.boh-pet-bubble').first().textContent())?.trim()
      : '';
    check('V1 摸头之后出现台词气泡', bubbleAppeared, bubbleText ? `「${bubbleText}」` : '');

    // 内容边界：不许播报系统消息
    const banned = ['新版本', '更新', '刷新', '失败', '错误', '网络', '上传', '重试'];
    const violates = bubbleText && banned.some((w) => bubbleText.includes(w));
    check('V1b 台词没有播报系统消息', !violates, violates ? `出现了：${bubbleText}` : '');

    // 气泡应贴在视口内、不越界
    if (bubbleAppeared) {
      const bb = await page.locator('.boh-pet-bubble').first().boundingBox();
      const inView =
        bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= 1280 && bb.y + bb.height <= 900;
      check(
        'V1c 气泡完全在视口内（不越界、不被裁）',
        Boolean(inView),
        bb
          ? `x=${Math.round(bb.x)} y=${Math.round(bb.y)} w=${Math.round(bb.width)} h=${Math.round(bb.height)}`
          : '',
      );
      await page
        .screenshot({
          path: `${OUT}/pet-voice-bubble.png`,
          clip: { x: Math.max(0, bb.x - 120), y: Math.max(0, bb.y - 60), width: 420, height: 220 },
        })
        .catch(() => {});
    }

    // 点气泡应自己散掉
    if (bubbleAppeared) {
      await page.locator('.boh-pet-bubble').first().click({ force: true });
      await page.waitForTimeout(400);
      const gone = (await page.locator('.boh-pet-bubble').count()) === 0;
      check('V1d 点一下气泡就收起', gone);
    }

    /* ---- V2：右键弹菜单 ---- */
    await page.mouse.click(cx, cy, { button: 'right' });
    const menuAppeared = await page
      .waitForSelector('.boh-pet-menu', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    check('V2 右键弹出菜单（不再直接回位）', menuAppeared);

    if (menuAppeared) {
      const items = await page.locator('.boh-pet-menu-item').allTextContents();
      check(
        'V2b 菜单含「回默认位置」与「隐藏小方」',
        items.some((t) => t.includes('回默认')) && items.some((t) => t.includes('隐藏')),
        items.join(' / '),
      );
      await page.screenshot({ path: `${OUT}/pet-voice-menu.png` }).catch(() => {});

      /* ---- V3：点「隐藏小方」⇒ 挂件消失 + 偏好落盘 ---- */
      await page.locator('.boh-pet-menu-item', { hasText: '隐藏' }).click();
      await page.waitForTimeout(600);

      const petGone = (await page.locator('.boh-pet-block').count()) === 0;
      check('V3 隐藏后挂件从 DOM 移除', petGone);

      const pref = await page.evaluate(() => {
        const raw = localStorage.getItem('boh_global_ai_preferences_v1');
        return raw ? JSON.parse(raw).petEnabled : 'no-key';
      });
      check('V3b 偏好被持久化（petEnabled=false）', pref === false, `petEnabled=${pref}`);

      /* ---- V5：重新打开（走设置页那条路）---- */
      await page.evaluate(() => {
        const key = 'boh_global_ai_preferences_v1';
        const cur = JSON.parse(localStorage.getItem(key) || '{}');
        cur.petEnabled = true;
        localStorage.setItem(key, JSON.stringify(cur));
      });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(7000);
      const backAgain = (await page.locator('.boh-pet-block').count()) > 0;
      check('V5 重新打开偏好后挂件回来', backAgain);
    }
  }

  /* ---- V4：关掉时不加载 chunk ---- */
  {
    const ctx2 = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    /* ⚠️ 这里刻意**不预置任何偏好**（空盘）：V4 要证的是 2026-11-24 的新口径
       「默认为用户关闭」—— 新用户首访就不该看到小方，也不该下载它的 chunk。
       预置 petEnabled: false 只能证明「显式关掉有效」，证明不了默认值（曾经的写法）。 */
    const page2 = await ctx2.newPage();
    const requested = [];
    page2.on('request', (r) => {
      if (/BohPetBlock/i.test(r.url())) requested.push(r.url());
    });
    await page2.route('**/rest/v1/rpc/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page2.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
    await page2.waitForTimeout(6000);

    const noPet = (await page2.locator('.boh-pet-block').count()) === 0;
    check('V4 新用户默认看不到小方（默认关闭口径）', noPet);
    check(
      'V4b 默认关闭时连 BohPetBlock chunk 都不请求（v-if 省掉一次下载）',
      requested.length === 0,
      requested.length ? `请求了 ${requested.length} 次` : '',
    );
    await ctx2.close();
  }

  /* ---- V6：设置页「通用」里的开关是真实可用的重开回路（2026-11-24 用户口径）----
     用户原话：「设置里要允许关闭小方（默认为用户关闭）」。
     在补这一行之前，唯一的重开入口在博莱克设置（/ai-chat 语境）里，
     右键菜单只有「隐藏」⇒ 关掉后在网上找不到回来。本段按用户真实路径点一遍：
       空盘（默认关）→ 我 → 设置 → 通用 → 小方挂件（开）→ 挂件出现且偏好落盘。 */
  {
    const ctx3 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
    });
    const page3 = await ctx3.newPage();
    page3.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
    await page3.route('**/rest/v1/rpc/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page3.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'load' });
    await page3.waitForTimeout(6500);

    /* 设置页在 requiresLogin 路由下；本探针其余场景都不需要登录，所以这里单独伪造一次
       （同 probe-settings-glass 的 injectLogin：直接改 pinia，不发真请求）。 */
    await page3.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return;
      auth.isLoggedIn = true;
      if (auth.userInfo) {
        auth.userInfo.username = 'probe_user';
        auth.userInfo.email = 'probe@bohrite.example.com';
      }
    });
    await page3.waitForTimeout(1200);

    /* 进「通用」：竖屏是组行 → 二级页 */
    const entered = await page3.evaluate(() => {
      const row = [...document.querySelectorAll('.gs-row')].find(
        (x) => x.querySelector('.gs-label')?.textContent.trim() === '通用',
      );
      row?.click();
      return Boolean(row);
    });
    await page3.waitForTimeout(900);

    const toggle = page3.locator('.gs-row', { hasText: '小方挂件' }).first();
    const hasRow = (await toggle.count()) > 0;
    check('V6 设置·通用 里有「小方挂件」开关行', entered && hasRow);

    const beforeOn = await toggle
      .locator('.setting-toggle')
      .evaluate((el) => el.getAttribute('aria-checked'))
      .catch(() => null);
    check('V6b 该开关初始为关（默认关闭）', beforeOn === 'false', `aria-checked=${beforeOn}`);

    if (hasRow) {
      await toggle.click();
      await page3.waitForTimeout(1600);
      const after = await page3.evaluate(() => ({
        pref: JSON.parse(localStorage.getItem('boh_global_ai_preferences_v1') || '{}').petEnabled,
        pet: !!document.querySelector('.boh-pet-block'),
        checked: [...document.querySelectorAll('.gs-row')]
          .find((r) => r.textContent.includes('小方挂件'))
          ?.querySelector('.setting-toggle')
          ?.getAttribute('aria-checked'),
      }));
      check('V6c 点开开关 ⇒ 偏好写盘为 true', after.pref === true, `petEnabled=${after.pref}`);
      check(
        'V6d 点开开关 ⇒ 开关态变 on',
        after.checked === 'true',
        `aria-checked=${after.checked}`,
      );
      check('V6e 点开开关 ⇒ 挂件立刻出现（v-if 即时响应）', after.pet === true);

      /* 再点一次：关掉必须立刻消失，且偏好回到 false */
      await toggle.click();
      await page3.waitForTimeout(1200);
      const off = await page3.evaluate(() => ({
        pref: JSON.parse(localStorage.getItem('boh_global_ai_preferences_v1') || '{}').petEnabled,
        pet: !!document.querySelector('.boh-pet-block'),
      }));
      check('V6f 再点一次 ⇒ 挂件消失且偏好为 false', off.pref === false && !off.pet);
    }
    await ctx3.close();
  }

  check('E1 全程无 JS 异常', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[pet-voice] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error('[pet-voice] 失败项：');
  failed.forEach((f) => console.error(`  · ${f.name}  ${f.detail}`));
  process.exit(1);
}
