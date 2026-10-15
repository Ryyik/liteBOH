/**
 * probe-navbar-tokens.mjs — 顶栏「玻璃材质收敛到 --liquid-*」验收探针（§21.13）
 *
 * ── 这道探针守什么 ────────────────────────────────────────────────────────────
 * 顶栏岛的玻璃材质（底色 / 描边 / 投影 / 高光）必须来自**全局唯一出口**
 * `src/styles/common/tokens.css` 的 `--liquid-*`，组件里不许再各挑一个 rgba。
 * 断言一律**比解析后的值**，不比字符串 —— 令牌写作 `hsla(0,0%,100%,.72)`，
 * 浏览器算出来是 `rgba(255, 255, 255, 0.72)`，直接比字符串会全是假红。
 *
 * ── 两条必须记住的分层真相（2026-10-15 实测，别再改错地方）──────────────────
 * ① **亮色**：本文件的 `:global(#unified-nav-container .unified-nav-surface)` 就是真源，
 *    令牌在这里真实生效（底色 0.72 / 描边 0.65 / 投影 shadow-sm）。
 * ② **暗色**：底色与描边的真源是 `src/styles/themes/navbar-dark.css` 的
 *    `…:not(.has-login-card){ background: rgba(20,27,37,.9)!important; … }`。
 *    那是**藏青 palette**（与 BOHAI 暗色同族），与 `--liquid-*` 的中性暗色不是一套 ⇒
 *    暗色底色/描边**不纳入令牌断言**（换了就是全站暗色观感决策）。本文件里那条暗色规则
 *    只是兜底（暗色 CSS 懒加载失败时防止岛变透明）。
 *    暗色仍然生效的是**投影**（navbar-dark.css 没声明 box-shadow）⇒ 照常断言。
 *
 * ── 探针自身的两个坑（都踩过）───────────────────────────────────────────────
 * · 切主题必须写 localStorage 的 `boh-theme` 让 themeManager 自己应用 + 懒加载暗色 CSS；
 *   手动 setAttribute('data-theme') 是假路径，navbar-dark.css 不会加载，读数是假的。
 * · 连续切状态读 getComputedStyle 会读到 **CSS 过渡中间值**（展开态规则带
 *   `transition: background-color 180ms ease`）⇒ 每次切完必须等 ≥400ms。第一版没等，
 *   把展开态误读成 #f7f7f5，还据此写错了结论。
 *
 * 用法：node scripts/probes/probe-navbar-tokens.mjs http://localhost:5173
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

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.addInitScript(
    ([t]) => {
      try {
        localStorage.setItem('boh-theme', t);
      } catch {}
    },
    [theme],
  );
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const r = await page.evaluate(async () => {
    const island = document.querySelector('#unified-nav-container .unified-nav-surface');
    if (!island) return null;
    const settle = () => new Promise((res) => setTimeout(res, 420));
    // 归一化探针：把「令牌原样」和「岛算出来的」都过一遍同一个浏览器，
    // 比的是解析后的值，屏蔽 hsla/rgba、色序、px 尾零之类的格式差。
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const norm = (prop, value) => {
      probe.style.cssText = '';
      probe.style[prop] = value;
      return getComputedStyle(probe)[prop];
    };
    const read = () => {
      const cs = getComputedStyle(island);
      return {
        bg: cs.backgroundColor,
        border: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        shadow: cs.boxShadow,
      };
    };
    const base = read();
    // 展开态：给**真岛**加 class，并等过渡走完（否则读到的是中间值）
    island.classList.add('has-status-card');
    await settle();
    const expanded = read();
    island.classList.remove('has-status-card');
    await settle();
    return {
      theme: document.documentElement.dataset.theme,
      containerTheme: document.getElementById('unified-nav-container')?.dataset.theme,
      base,
      expanded,
      expected: {
        bg: norm('backgroundColor', 'var(--liquid-bg)'),
        border: norm('borderTopColor', 'var(--liquid-border)'),
        shadow: norm('boxShadow', 'var(--liquid-shadow-sm)'),
      },
    };
  });

  if (!r) {
    check(`[${theme}] 顶栏岛存在`, false, 'missing');
    await ctx.close();
    continue;
  }
  const { base: a, expanded: e, expected: x } = r;
  check(
    `[${theme}] 主题已应用（html + 导航容器）`,
    r.theme === theme && r.containerTheme === theme,
    `html=${r.theme} container=${r.containerTheme}`,
  );
  check(`[${theme}] 岛描边宽度仍在（不许透明边框）`, a.borderWidth === '1px', a.borderWidth);

  if (theme === 'light') {
    // 亮色：令牌就是真源，四条全断
    check(`[light] 岛底色 == --liquid-bg`, a.bg === x.bg, `${a.bg} vs ${x.bg}`);
    check(`[light] 岛描边 == --liquid-border`, a.border === x.border, `${a.border} vs ${x.border}`);
    check(
      `[light] 岛投影 == --liquid-shadow-sm`,
      a.shadow === x.shadow,
      `${a.shadow} vs ${x.shadow}`,
    );
    // 展开态不得另建一份材质（§21.13：那两条死声明已清）⇒ 必须与常态同一套
    check(
      `[light] 展开态材质 == 常态（不另建第二份材质）`,
      e.bg === a.bg && e.shadow === a.shadow,
      `bg ${e.bg} / shadow ${e.shadow.slice(0, 46)}`,
    );
  } else {
    // 暗色：底色/描边的真源是 navbar-dark.css 的 !important ⇒ 只打印不断言；
    //       投影它没声明，仍是本文件的令牌 ⇒ 照常断言。
    check(
      `[dark] 岛投影 == --liquid-shadow-sm（暗色档）`,
      a.shadow === x.shadow,
      `${a.shadow} vs ${x.shadow}`,
    );
    console.log(
      `  · [dark] 底色/描边真源 = themes/navbar-dark.css 的 !important（藏青 palette，` +
        `刻意不并入 --liquid-*）：bg=${a.bg} border=${a.border}`,
    );
  }
  check(`[${theme}] 零 pageerror`, errors.length === 0, errors.join(' | '));

  await ctx.close();
}

await browser.close();

console.log(`\n──── 合计 ${total} 条，失败 ${violations.length} 条 ────`);
if (violations.length) {
  console.log(`失败项：\n- ${violations.join('\n- ')}`);
  process.exit(1);
}
