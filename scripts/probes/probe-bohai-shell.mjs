/**
 * probe-bohai-shell.mjs — BOH AI 整页「壳 + 空态」几何探针（plans/025 v2 · Step 6-1）
 *
 * Step 6 把 `BOHAIMain.vue`（3183 行）拆成「薄壳 + 5 个区域组件」。拆壳最大的风险不是逻辑，
 * 而是 **scoped 样式随 DOM 搬走后失效**（不报错、只是布局错）⇒ 本探针在**替换前后**都钉死
 * 「壳的布局骨架 + 空态几何」，每次替换都用它对照。
 *
 * 三档视口（DESIGN §3.1 的 4+1 断点表）：
 *   · 1440×900（桌面 ≥1024×600）：左栏 88px；`.boh-shell` 在栏右；会话侧栏静态列 280px 且
 *     主列让位；`.boh-topbar` 存在；空态标题 + 建议 4 个 / 2 列；Work 面板存在但收起
 *   · 390×844（竖屏 ≤768）：左栏 `display:none`；侧栏是抽屉（未开 ⇒ 整体在视口左侧外）；
 *     主列不让位；Work 面板不出现
 *   · 844×390（矮横屏 landscape ≤600 高）：顶栏 44px、空态副标题隐藏、建议 4 列、Work 不出现
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

const openPage = async (viewport, waitMs = 4500) => {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  return { ctx, page, errors };
};

try {
  // ── 桌面档 1440×900 ─────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openPage({ width: 1440, height: 900 });

    const d = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const pageEl = q('.bohai-page');
      const rail = q('.userspace-rail');
      const shell = q('.boh-shell');
      const sidebar = q('.boh-sidebar');
      const main = q('.boh-main');
      const topbar = q('.boh-float-actions');
      const stream = q('.boh-stream');
      const empty = q('.boh-empty');
      const title = q('.boh-empty__title');
      const suggestions = q('.boh-empty__suggestions');
      const buttons = suggestions ? [...suggestions.querySelectorAll('button')] : [];
      const sub = q('.boh-empty__subtitle');
      const composer = q('.boh-composer');
      const work = q('.boh-work');
      return {
        hasPage: !!pageEl,
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        railWidth: Math.round(rect(rail)?.width ?? 0),
        shellLeft: Math.round(rect(shell)?.x ?? -1),
        sidebarFound: !!sidebar,
        sidebarOpen: !!sidebar && sidebar.classList.contains('is-open'),
        sidebarWidth: Math.round(rect(sidebar)?.width ?? 0),
        sidebarLeft: Math.round(rect(sidebar)?.x ?? -1),
        // 侧栏内的水平溢出：2026-10-08 用户报「新对话和搜索的条有超出」。
        // 起因是一类通用缺陷 —— `min-width` 算的是元素**自身**宽度、不含水平外距，
        // 于是带 `margin: 0 12px` 的块会比容器宽 24px 并被 `overflow: hidden` 裁断。
        // 这里对**所有直接子元素**取最大右溢出，任何一条再冒头都会在这里报出来。
        sidebarChildOverflow: sidebar
          ? Math.round(
              [...sidebar.children].reduce(
                (max, child) =>
                  Math.max(
                    max,
                    child.getBoundingClientRect().right - sidebar.getBoundingClientRect().right,
                  ),
                0,
              ),
            )
          : 0,
        mainLeft: Math.round(rect(main)?.x ?? -1),
        mainMarginLeft: main ? getComputedStyle(main).marginLeft : '',
        topbarHeight: Math.round(rect(topbar)?.height ?? 0),
        topbarWork: !!topbar?.querySelector('.is-work'),
        streamHeight: Math.round(rect(stream)?.height ?? 0),
        emptyDisplay: empty ? getComputedStyle(empty).display : '',
        emptyTitle: title ? title.textContent.trim() : '',
        suggestionCols: suggestions
          ? getComputedStyle(suggestions).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0,
        buttonCount: buttons.length,
        subDisplay: sub ? getComputedStyle(sub).display : 'none',
        hasComposer: !!composer,
        workDisplay: work ? getComputedStyle(work).display : 'none',
        workWidth: Math.round(rect(work)?.width ?? 0),
      };
    });

    check('桌面：.bohai-page 存在', d.hasPage);
    check(
      '桌面：左栏可见且宽 88px',
      d.railDisplay === 'flex' && d.railWidth === 88,
      `display=${d.railDisplay} w=${d.railWidth}`,
    );
    check('桌面：.boh-shell 在左栏右侧', d.shellLeft >= 88, `left=${d.shellLeft}`);
    check(
      '桌面：.boh-sidebar 存在且默认展开',
      d.sidebarFound && d.sidebarOpen,
      `open=${d.sidebarOpen}`,
    );
    check(
      '桌面：会话侧栏宽 280 且接在左栏右侧',
      d.sidebarWidth === 280 && d.sidebarLeft === 88,
      `w=${d.sidebarWidth} left=${d.sidebarLeft}`,
    );
    check(
      '桌面：侧栏子元素不水平溢出（新对话 / 搜索条）',
      d.sidebarChildOverflow <= 0,
      `右溢出 ${d.sidebarChildOverflow}px`,
    );
    check(
      '桌面：主列让位 = 88 + 280',
      d.mainLeft === 368 && d.mainMarginLeft === '280px',
      `mainLeft=${d.mainLeft} marginLeft=${d.mainMarginLeft}`,
    );
    // 2026-10-08：顶栏整条已删（用户口径「整体布局参考 Codex 那种感觉」），
    // 入口收成主区右上角的浮动操作组；桌面档里有「工作台」按钮在场。
    check(
      '桌面：右上角浮动操作在场（替代已删的顶栏）',
      d.topbarHeight > 0 && d.topbarWork,
      `h=${d.topbarHeight} work=${d.topbarWork}`,
    );
    check('桌面：.boh-stream 有高度', d.streamHeight > 200, `h=${d.streamHeight}`);
    check('桌面：空态可见（flex）', d.emptyDisplay === 'flex', d.emptyDisplay);
    check('桌面：空态标题 = 今天想聊点什么?', d.emptyTitle === '今天想聊点什么?', d.emptyTitle);
    check(
      '桌面：建议按钮 4 个 / 2 列',
      d.buttonCount === 4 && d.suggestionCols === 2,
      `n=${d.buttonCount} cols=${d.suggestionCols}`,
    );
    check('桌面：空态副标题可见', d.subDisplay !== 'none', d.subDisplay);
    check('桌面：输入区存在', d.hasComposer);
    check(
      '桌面：Work 面板已挂载但收起（宽度 0）',
      d.workDisplay === 'flex' && d.workWidth === 0,
      `display=${d.workDisplay} w=${d.workWidth}`,
    );
    check('桌面：无 pageerror', errors.length === 0, errors[0] || '');

    await ctx.close();
  }

  // ── 竖屏档 390×844 ─────────────────────────────────────────────
  {
    const { ctx, page } = await openPage({ width: 390, height: 844 }, 4000);
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const rail = q('.userspace-rail');
      const sidebar = q('.boh-sidebar');
      const main = q('.boh-main');
      const topbar = q('.boh-float-actions');
      const work = q('.boh-work');
      const suggestions = q('.boh-empty__suggestions');
      return {
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        sidebarRight: Math.round(rect(sidebar)?.right ?? 0),
        sidebarOpen: !!sidebar && sidebar.classList.contains('is-open'),
        mainMarginLeft: main ? getComputedStyle(main).marginLeft : '',
        topbarHeight: Math.round(rect(topbar)?.height ?? 0),
        workDisplay: work ? getComputedStyle(work).display : '(无节点)',
        suggestionCols: suggestions
          ? getComputedStyle(suggestions).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0,
      };
    });
    check('竖屏：左栏隐藏', m.railDisplay === 'none', m.railDisplay);
    check(
      '竖屏：侧栏是抽屉且默认收起（在视口左侧外）',
      !m.sidebarOpen && m.sidebarRight <= 0,
      `open=${m.sidebarOpen} right=${m.sidebarRight}`,
    );
    check('竖屏：主列不让位', m.mainMarginLeft === '0px', m.mainMarginLeft);
    // 2026-10-08：顶栏已删 ⇒ 竖屏不再有 46px 横条，只剩右上角浮动操作（贴边 8px）。
    check('竖屏：浮动操作在场（顶栏已删）', m.topbarHeight > 0, `${m.topbarHeight}px`);
    check('竖屏：建议按钮 2 列', m.suggestionCols === 2, `cols=${m.suggestionCols}`);
    check(
      '竖屏：Work 面板不出现',
      m.workDisplay === 'none' || m.workDisplay === '(无节点)',
      m.workDisplay,
    );
    await ctx.close();
  }

  // ── 矮横屏档 844×390 ───────────────────────────────────────────
  {
    const { ctx, page } = await openPage({ width: 844, height: 390 }, 4000);
    const l = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const sub = q('.boh-empty__subtitle');
      const suggestions = q('.boh-empty__suggestions');
      const topbar = q('.boh-float-actions');
      const work = q('.boh-work');
      return {
        subDisplay: sub ? getComputedStyle(sub).display : '(无节点)',
        suggestionCols: suggestions
          ? getComputedStyle(suggestions).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0,
        topbarHeight: Math.round(rect(topbar)?.height ?? 0),
        workDisplay: work ? getComputedStyle(work).display : '(无节点)',
      };
    });
    check('矮横屏：浮动操作在场（顶栏已删）', l.topbarHeight > 0, `${l.topbarHeight}px`);
    check(
      '矮横屏：副标题隐藏（landscape && max-height:600）',
      l.subDisplay === 'none',
      l.subDisplay,
    );
    check('矮横屏：建议 4 列', l.suggestionCols === 4, `cols=${l.suggestionCols}`);
    check(
      '矮横屏：Work 面板不出现（≤1023）',
      l.workDisplay === 'none' || l.workDisplay === '(无节点)',
      l.workDisplay,
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
