/**
 * probe-bohai-shell.mjs — BOH AI 整页「壳 + 空态」几何探针（plans/025 v2 · Step 6-1）
 *
 * Step 6 把 `BOHAIMain.vue`（3183 行）拆成「薄壳 + 5 个区域组件」。拆壳最大的风险不是逻辑，
 * 而是 **scoped 样式随 DOM 搬走后失效**（不报错、只是布局错）⇒ 本探针在**替换前后**都钉死
 * 「壳的布局骨架 + 空态几何」，每次替换都用它对照。
 *
 * 三档视口（DESIGN §3.1 的 4+1 断点表）：
 *   · 1440×900（桌面 ≥1024×600）：左栏 88px；`.boh-shell` 在栏右；会话侧栏静态列 280px 且
 *     主列让位；浮动操作组在场；**空态只剩虚影 BOHAI 且整组垂直居中**；Work 面板收起
 *   · 390×844（竖屏 ≤768）：左栏 `display:none`；侧栏是抽屉（未开 ⇒ 整体在视口左侧外）；
 *     主列不让位；虚影字不溢出视口；Work 面板不出现
 *   · 844×390（矮横屏 landscape ≤600 高）：浮动操作组在场、虚影字按视口高度收窄、Work 不出现
 *   · 场景 D（同 1440×900）：发第一条消息 ⇒ 输入框 FLIP 从居中落到底部（途中必须有位移）
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
      // 2026-10-11 空态重做：只有一行虚影 BOHAI，logo/标题/建议卡/副标题整套下线
      const ghost = q('.boh-empty__ghost');
      const composer = q('.boh-composer');
      const work = q('.boh-work');
      return {
        hasPage: !!pageEl,
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        railWidth: Math.round(rect(rail)?.width ?? 0),
        shellLeft: Math.round(rect(shell)?.x ?? -1),
        sidebarFound: !!sidebar,
        sidebarOpen: !!sidebar && sidebar.classList.contains('is-open'),
        // 2026-10-11 用户口径「初始状态下默认收起侧栏」：收起态的宽度应为 0
        sidebarCollapsedWidth: Math.round(rect(sidebar)?.width ?? -1),
        // 收起态的入口必须在场（否则侧栏再也召不出来）
        openSidebarBtn: !!topbar?.querySelector('[title="打开侧栏"]'),
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
        ghostText: ghost ? ghost.textContent.trim() : '',
        ghostSize: ghost ? Math.round(parseFloat(getComputedStyle(ghost).fontSize)) : 0,
        // 居中判据：**整组**（虚影字顶 → 输入框底）的中点 vs 主区中点。
        // ⚠️ 不能拿「输入框自己的中心」去比 —— 输入框是整组的下半截，它的中心本来
        //    就该落在主区中线**之下**；那样断言等于要求输入框比设计稿再高一倍。
        groupMidDelta: (() => {
          const m = main?.getBoundingClientRect();
          const c = composer?.getBoundingClientRect();
          const g = ghost?.getBoundingClientRect();
          if (!m || !c || !g) return -1;
          return Math.round(Math.abs((g.top + c.bottom) / 2 - (m.top + m.bottom) / 2));
        })(),
        ghostToComposerGap: (() => {
          const c = composer?.getBoundingClientRect();
          const g = ghost?.getBoundingClientRect();
          return c && g ? Math.round(c.top - g.bottom) : -1;
        })(),
        mainHeight: Math.round(rect(main)?.height ?? 0),
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
    // 2026-10-11：默认收起。判据是「宽度 0 + 主列不让位 + 入口在场」三条一起 ——
    // 只判 `is-open` 为假会把「侧栏被 display:none 干掉」也读成通过。
    check(
      '桌面：会话侧栏存在且**默认收起**（宽度 0）',
      d.sidebarFound && !d.sidebarOpen && d.sidebarCollapsedWidth === 0,
      `open=${d.sidebarOpen} w=${d.sidebarCollapsedWidth}`,
    );
    check('桌面：收起态的「打开侧栏」入口在场', d.openSidebarBtn, `btn=${d.openSidebarBtn}`);
    check(
      '桌面：收起态主列吃满剩余空间（让位 0）',
      d.mainLeft === 88 && d.mainMarginLeft === '0px',
      `mainLeft=${d.mainLeft} marginLeft=${d.mainMarginLeft}`,
    );

    // 展开路径不能被这次改动带坏：点入口 → 280 宽 + 主列让位 280
    await page.locator('.boh-float-actions [title="打开侧栏"]').first().click();
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => {
      const sidebar = document.querySelector('.boh-sidebar');
      const main = document.querySelector('.boh-main');
      const sb = sidebar?.getBoundingClientRect();
      const mb = main?.getBoundingClientRect();
      return {
        open: !!sidebar?.classList.contains('is-open'),
        width: Math.round(sb?.width ?? -1),
        left: Math.round(sb?.x ?? -1),
        mainLeft: Math.round(mb?.x ?? -1),
        mainMargin: main ? getComputedStyle(main).marginLeft : '',
        overflow: sidebar
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
      };
    });
    check(
      '桌面：点入口展开 → 宽 280 且接在左栏右侧，主列让位 280',
      opened.open &&
        opened.width === 280 &&
        opened.left === 88 &&
        opened.mainLeft === 368 &&
        opened.mainMargin === '280px',
      JSON.stringify(opened),
    );
    check(
      '桌面：展开后侧栏子元素不水平溢出（新对话 / 搜索条）',
      opened.overflow <= 0,
      `右溢出 ${opened.overflow}px`,
    );
    // 收回去：入口按钮此刻已消失（v-if），要靠侧栏自己的「收起侧栏」键
    await page.locator('[title="收起侧栏"]').first().click();
    await page.waitForTimeout(400);
    const recollapsed = await page.evaluate(() => ({
      open: !!document.querySelector('.boh-sidebar')?.classList.contains('is-open'),
      width: Math.round(
        document.querySelector('.boh-sidebar')?.getBoundingClientRect().width ?? -1,
      ),
    }));
    check(
      '桌面：侧栏内「收起侧栏」→ 回到收起态（宽度 0）',
      !recollapsed.open && recollapsed.width === 0,
      JSON.stringify(recollapsed),
    );
    // 2026-10-08：顶栏整条已删（用户口径「整体布局参考 Codex 那种感觉」），
    // 入口收成主区右上角的浮动操作组；桌面档里有「工作台」按钮在场。
    check(
      '桌面：右上角浮动操作在场（替代已删的顶栏）',
      d.topbarHeight > 0 && d.topbarWork,
      `h=${d.topbarHeight} work=${d.topbarWork}`,
    );
    // 2026-10-11：空态下消息区收成**内容高度**（只剩虚影字），不再吃掉整块剩余空间 ——
    // 所以这里判「有高度」而不是「撑满」，撑满的那条已由下面的居中断言接管。
    check('桌面：.boh-stream 在空态仍有内容高度', d.streamHeight > 80, `h=${d.streamHeight}`);
    check('桌面：空态可见（flex）', d.emptyDisplay === 'flex', d.emptyDisplay);
    check(
      '桌面：空态只剩虚影 BOHAI（2026-10-11：标题/建议卡/副标题已下线）',
      d.ghostText === 'BOHAI' && d.ghostSize >= 48,
      `text=「${d.ghostText}」 size=${d.ghostSize}px`,
    );
    check(
      '桌面：空态整组（虚影字 + 输入框）垂直居中（中点偏差 ≤ 主区高的 6%）',
      d.groupMidDelta >= 0 && d.groupMidDelta <= Math.round(d.mainHeight * 0.06),
      `偏差=${d.groupMidDelta}px 主区高=${d.mainHeight}`,
    );
    // 反向保险：auto 写错位置时两者之间会裂开一个大洞（实测 309px），这条钉住上界
    check(
      '桌面：虚影字与输入框之间不留大空洞（≤ 64px）',
      d.ghostToComposerGap >= 0 && d.ghostToComposerGap <= 64,
      `gap=${d.ghostToComposerGap}px`,
    );
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
      const ghost = q('.boh-empty__ghost');
      const pad = q('.boh-stream-pad');
      const orb = q('.unified-nav-surface.nav-immersive');
      const orbRect = rect(orb);
      return {
        streamPadTop: pad ? parseFloat(getComputedStyle(pad).paddingTop) : 0,
        orbBottom: Math.round(orbRect?.bottom ?? 0),
        railDisplay: rail ? getComputedStyle(rail).display : 'none',
        sidebarRight: Math.round(rect(sidebar)?.right ?? 0),
        sidebarOpen: !!sidebar && sidebar.classList.contains('is-open'),
        mainMarginLeft: main ? getComputedStyle(main).marginLeft : '',
        topbarHeight: Math.round(rect(topbar)?.height ?? 0),
        workDisplay: work ? getComputedStyle(work).display : '(无节点)',
        ghostWidth: Math.round(rect(ghost)?.width ?? 0),
        ghostSize: ghost ? Math.round(parseFloat(getComputedStyle(ghost).fontSize)) : 0,
        viewportW: window.innerWidth,
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
    // 2026-10-11：建议卡已下线，改为断「虚影字不横向溢出」（窄屏最容易顶破的就是它）
    check(
      '竖屏：虚影字在场且不溢出视口',
      m.ghostSize > 0 && m.ghostWidth > 0 && m.ghostWidth <= m.viewportW,
      `size=${m.ghostSize} w=${m.ghostWidth}/${m.viewportW}`,
    );
    // 2026-10-11 用户报障「竖屏下打开侧栏按钮和消息重叠」：沉浸球模式下页面顶到满屏，
    // 悬浮球（实测 14..66）与浮动操作（8..40）都压在消息头上 ⇒ 消息区必须留出顶部一条。
    check(
      '竖屏：消息区顶部留白让开悬浮球（≥68px）',
      m.streamPadTop >= 68,
      `padding-top=${m.streamPadTop}`,
    );
    check(
      '竖屏：Work 面板不出现',
      m.workDisplay === 'none' || m.workDisplay === '(无节点)',
      m.workDisplay,
    );

    // B4 为了量宽度已经把抽屉收回了，这里重新打开再判球
    await page.locator('.boh-float-actions [title="打开侧栏"]').first().click();
    await page.waitForTimeout(500);
    // 2026-10-11 用户报障「悬浮球会遮挡内容」：抽屉打开时球正好压住头部左侧。
    // 判据是**命中测试**而不是肉眼看 opacity —— 只藏不挡会留下一个看不见却能吃点击的
    // 52px 靶子（vendor 给 surface 写了 `pointer-events: auto !important`）。
    const orbWhileOpen = await page.evaluate(() => {
      const orb = document.querySelector('.unified-nav-surface.nav-immersive');
      const b = orb?.getBoundingClientRect();
      const x = Math.round((b?.left ?? 0) + 26);
      const y = Math.round((b?.top ?? 0) + 26);
      const hit = document.elementFromPoint(x, y);
      return {
        opacity: orb ? getComputedStyle(orb).opacity : '',
        visibility: orb ? getComputedStyle(orb).visibility : '',
        hitIsNav: !!hit?.closest('#unified-nav-container'),
        hit: hit
          ? `${hit.tagName.toLowerCase()}.${(hit.className || '').toString().split(' ')[0]}`
          : 'none',
      };
    });
    check(
      '竖屏：抽屉打开时悬浮球让位（不可见且不吃点击）',
      orbWhileOpen.opacity === '0' &&
        orbWhileOpen.visibility === 'hidden' &&
        !orbWhileOpen.hitIsNav,
      JSON.stringify(orbWhileOpen),
    );
    await ctx.close();
  }

  // ── 矮横屏档 844×390 ───────────────────────────────────────────
  {
    const { ctx, page } = await openPage({ width: 844, height: 390 }, 4000);
    const l = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const ghost = q('.boh-empty__ghost');
      const topbar = q('.boh-float-actions');
      const work = q('.boh-work');
      return {
        ghostSize: ghost ? Math.round(parseFloat(getComputedStyle(ghost).fontSize)) : 0,
        ghostDisplay: ghost ? getComputedStyle(ghost).display : '(无节点)',
        topbarHeight: Math.round(rect(topbar)?.height ?? 0),
        workDisplay: work ? getComputedStyle(work).display : '(无节点)',
      };
    });
    check('矮横屏：浮动操作在场（顶栏已删）', l.topbarHeight > 0, `${l.topbarHeight}px`);
    // 2026-10-11：副标题与建议卡都已下线；矮横屏现在断「虚影字收窄」
    //（390px 高的屏上，128px 的字会把输入框顶出视口 —— 那条 max-height 断点就是为此）
    check(
      '矮横屏：虚影字在场且已按视口高度收窄（≤72px）',
      l.ghostDisplay !== 'none' && l.ghostSize > 0 && l.ghostSize <= 72,
      `display=${l.ghostDisplay} size=${l.ghostSize}px`,
    );
    check(
      '矮横屏：Work 面板不出现（≤1023）',
      l.workDisplay === 'none' || l.workDisplay === '(无节点)',
      l.workDisplay,
    );
    await ctx.close();
  }
  // ── 场景 D：第一条消息 → 输入框从居中 FLIP 到底部（2026-10-11）─────────
  //   这段位移 CSS 自己做不到（flex:1 ↔ margin:auto 都不可过渡），靠壳做 FLIP。
  //   判据是**动画途中量到了非零 transform** + 落点贴底；只看落点会漏掉「瞬移」这种
  //   退化实现（FLIP 的全部价值就是那一段过程）。
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    // ⚠️ 模式清单必须 mock：拉不到 ⇒ 模型表为空 ⇒ 发送被引擎拒绝 ⇒
    // 「FLIP 没发生」和「发送失败」在断言上长得一模一样（实测踩过）。
    await page.route('**/rest/v1/rpc/list_public_bohai_modes*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'fast',
            mode_id: 'fast',
            model_id: 'deepseek-ai/DeepSeek-V3',
            name: 'Fast',
            display_name: 'Fast',
            tagline: '极速响应',
            min_tier: 'free',
            status: 'active',
            sort_order: 10,
            quota_multiplier: 1,
          },
        ]),
      });
    });
    await page.route('**/functions/v1/api-key-vault**', async (route) => {
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
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForSelector('.boh-composer-input', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const centeredTop = await page.evaluate(() =>
      Math.round(document.querySelector('.boh-composer-wrap').getBoundingClientRect().top),
    );
    await page.fill('.boh-composer-input', '探针：第一条消息');
    await page.locator('.boh-send').click();
    // 采样 12 次 × 45ms，覆盖 200ms 的过渡
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      samples.push(
        await page.evaluate(() => {
          const el = document.querySelector('.boh-composer-wrap');
          return {
            top: Math.round(el.getBoundingClientRect().top),
            transform: getComputedStyle(el).transform,
          };
        }),
      );
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(600);
    const end = await page.evaluate(() => ({
      top: Math.round(document.querySelector('.boh-composer-wrap').getBoundingClientRect().top),
      msgs: document.querySelectorAll('.boh-msg').length,
      mainBottom: Math.round(document.querySelector('.boh-main').getBoundingClientRect().bottom),
      isEmptyClass: document.querySelector('.boh-main').classList.contains('is-empty'),
    }));
    const moved = samples.some((s) => s.transform && s.transform !== 'none');
    const monotonic = samples.every((s, i) => i === 0 || s.top >= samples[i - 1].top);
    check(
      '桌面：第一条消息 → 输入框有位移动画（FLIP，途中量到非零 transform）',
      moved && monotonic && end.top > centeredTop,
      `居中=${centeredTop} → 贴底=${end.top} 途中transform=${samples[1]?.transform}`,
    );
    check(
      '桌面：落点贴底且 is-empty 已摘、消息已渲染',
      Math.abs(end.top - end.mainBottom) < 200 && !end.isEmptyClass && end.msgs >= 1,
      `top=${end.top} mainBottom=${end.mainBottom} is-empty=${end.isEmptyClass} msgs=${end.msgs}`,
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
