/**
 * probe-bohai-shell.mjs — BOH AI 整页「壳 + 空态」几何探针（plans/025 v2 · Step 6-1）
 *
 * 用途：Step 6 要把 `BOHAIMain.vue`（3183 行）拆成「薄壳 + 5 个区域组件」。
 * 拆壳最大的风险不是逻辑，而是 **scoped 样式随 DOM 搬走后失效** ——
 * 本探针在**替换前**先把「壳的布局骨架 + 空态几何」钉死，之后每次替换都用它对照。
 *
 * 两档视口：
 *   · 1440×900（桌面）：左栏 88px；`.bohai-container` 在栏右；空态在 `.chat-container` 内、
 *     `justify-content: flex-end`、宽度 = `min(100% - 32px, --bohai-rail)`；建议按钮 2 列
 *   · 390×844（竖屏）：左栏 `display:none`；空态宽 = `100% - 28px`；建议按钮 1 列；
 *     副标题隐藏（矮横屏才隐藏，竖屏不隐藏 —— 见下一条）
 *   · 844×390（矮横屏）：`.empty-subtitle` 被 `display:none`（`landscape && max-height:560px` 档）
 *
 * 用法（**打 dev server**，本沙箱 `npm run build` 被拦）：
 *   npx vite --port 5173            # 另开一个终端
 *   node scripts/probes/probe-bohai-shell.mjs http://localhost:5173
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

try {
  // ── 桌面档 1440×900 ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForTimeout(4500);

    const d = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const pageEl = q('.bohai-page');
      const rail = q('.userspace-rail');
      const container = q('.bohai-container');
      const main = q('.main-content');
      const chat = q('.chat-container');
      const empty = q('.boh-empty');
      const suggestions = q('.boh-empty__suggestions');
      const buttons = suggestions ? [...suggestions.querySelectorAll('button')] : [];
      const sub = q('.boh-empty__subtitle');
      const input = q('.input-area');
      const railVar = pageEl
        ? getComputedStyle(pageEl).getPropertyValue('--bohai-rail').trim()
        : '';
      return {
        hasPage: !!pageEl,
        railRect: rect(rail),
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        containerLeft: rect(container)?.x ?? null,
        mainLeft: rect(main)?.x ?? null,
        chatRect: rect(chat),
        emptyRect: rect(empty),
        emptyJustify: empty ? getComputedStyle(empty).justifyContent : '',
        emptyDisplay: empty ? getComputedStyle(empty).display : '',
        suggestionCols: suggestions
          ? getComputedStyle(suggestions).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0,
        buttonCount: buttons.length,
        subDisplay: sub ? getComputedStyle(sub).display : 'none',
        hasInput: !!input,
        railVar,
      };
    });

    check('桌面：.bohai-page 存在', d.hasPage);
    check(
      '桌面：左栏可见且宽 88px',
      d.railDisplay === 'flex' && Math.round(d.railRect?.width) === 88,
      `display=${d.railDisplay} w=${Math.round(d.railRect?.width ?? 0)}`,
    );
    check('桌面：.bohai-container 在左栏右侧', d.containerLeft >= 88, `left=${d.containerLeft}`);
    check(
      '桌面：.main-content 在会话侧栏右侧',
      d.mainLeft > d.containerLeft,
      `main=${d.mainLeft} container=${d.containerLeft}`,
    );
    check(
      '桌面：.chat-container 存在且有高度',
      !!d.chatRect && d.chatRect.height > 200,
      `h=${Math.round(d.chatRect?.height ?? 0)}`,
    );
    check('桌面：空态可见（flex）', d.emptyDisplay === 'flex', d.emptyDisplay);
    check(
      '桌面：空态靠底对齐（justify-content: flex-end）',
      d.emptyJustify === 'flex-end',
      d.emptyJustify,
    );
    check(
      '桌面：空态宽 = min(100% - 32px, --bohai-rail)',
      !!d.emptyRect &&
        Math.abs(d.emptyRect.width - Math.min(1440 - 88 - 32, parseFloat(d.railVar))) <= 2,
      `w=${Math.round(d.emptyRect?.width ?? 0)} railVar=${d.railVar}`,
    );
    check(
      '桌面：建议按钮 4 个 / 2 列',
      d.buttonCount === 4 && d.suggestionCols === 2,
      `n=${d.buttonCount} cols=${d.suggestionCols}`,
    );
    check('桌面：副标题可见（竖屏/桌面都不隐藏）', d.subDisplay !== 'none', d.subDisplay);
    check('桌面：输入区存在', d.hasInput);
    check('桌面：无 pageerror', errors.length === 0, errors[0] || '');

    await ctx.close();
  }

  // ── 竖屏档 390×844 ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rail = q('.userspace-rail');
      const empty = q('.boh-empty');
      const suggestions = q('.boh-empty__suggestions');
      return {
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        emptyWidth: empty ? empty.getBoundingClientRect().width : 0,
        suggestionCols: suggestions
          ? getComputedStyle(suggestions).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0,
      };
    });
    check('竖屏：左栏隐藏', m.railDisplay === 'none', m.railDisplay);
    check(
      '竖屏：空态宽 = 100% - 28px',
      Math.abs(m.emptyWidth - (390 - 28)) <= 2,
      `w=${Math.round(m.emptyWidth)}`,
    );
    check('竖屏：建议按钮 1 列', m.suggestionCols === 1, `cols=${m.suggestionCols}`);
    await ctx.close();
  }

  // ── 矮横屏档 844×390 ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const l = await page.evaluate(() => {
      const sub = document.querySelector('.boh-empty__subtitle');
      return { subDisplay: sub ? getComputedStyle(sub).display : '(无节点)' };
    });
    check(
      '矮横屏：副标题隐藏（landscape && max-height:560px）',
      l.subDisplay === 'none',
      l.subDisplay,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n合计 ${total} 条，失败 ${violations.length} 条`);
if (violations.length) {
  console.log('失败项：\n- ' + violations.join('\n- '));
  process.exit(1);
}
