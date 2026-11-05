import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 岛的「Siri 式」形态（2026-11-05 第五次用户口径）源码守卫
//
// 口径原话：「仍然需要岛的形态，只不过唤起 BOHAI 整个岛自动变成深色」，
// 参考图是 iOS 的两张：①加载态 =「Searching events 2/5」深黑胶囊 + 白色点环；
// ②回复态 = 灵动岛胶囊（内容 + 结果胶囊）。**明确不再做彩虹流光。**
//
// 为什么用源码守卫：这套东西全是 CSS 接线 + 一个 data-theme 合成，node 环境不挂载组件，
// 失效方式全部静默 —— 少一个点阵、`--i` 没写进内联样式、data-theme 没跟着 isOpen 切、
// 深色底被 navbar-dark.css 的 !important 刷掉，症状都只是「看起来不对」，不报错。
//
// ⚠️ 被这里锁死的五条：
//   1. **岛恒为深色**：墨色是纸白，不跟站点主题分叉；彩虹那套（`--boh-iri-*`、
//      `bohIsleSpin`、`generating` 跨组件信号）一律不许回来；
//   2. 唤起时**整块 surface** 变深色 —— 靠 UnifiedNavbar 把容器 data-theme 切成 dark，
//      不在导航栏里另抄一份白字颜色；
//   3. 加载态 = 8 个白点围成的环，延迟靠 `--i` 错开（拖尾光弧的来源）；
//   4. 加载态的 `scale` 只能小幅度走（0.95→1.06），放大差值会看成「散落的点」；
//   5. 输入条在生成中整条不渲染，回答落定后返场（可追问）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

const ISLAND_VUE = 'src/components/BohIsland.vue';
const ANSWER_VUE = 'src/components/BohIslandAnswer.vue';
const NAV_VUE = 'src/components/UnifiedNavbar/index.vue';
const NAV_CSS = 'src/components/UnifiedNavbar/style.scoped.css';
/* 材质真源：岛的 scrim 档在这里定义（2026-11-05 收口，见 check:liquid-glass） */
const TOKENS_CSS = 'src/styles/common/tokens.css';
const STORE = 'src/composables/useBohIsland.js';

describe('岛恒为深色：纸白墨色 + 彩虹那一套彻底退场', () => {
  const island = read(ISLAND_VUE);
  const css = squeezeSource(island);

  it('墨色是纸白，且不再按 data-theme 分叉', () => {
    expect(css).toMatch(/--boh-ink:\s*#ffffff/);
    expect(css).toMatch(/--boh-ink-soft:\s*rgba\(255,\s*255,\s*255/);
    // 旧版「浅色下深墨写在白玻璃上」的分叉必须消失
    expect(island).not.toContain('--boh-ink: #1d1d1f');
  });

  it('⭐ 彩虹流光全族不许回来（用户已明确「不再执着于做彩虹」）', () => {
    expect(island).not.toContain('--boh-iri');
    expect(island).not.toContain('bohIriBreathe');
    expect(island).not.toContain('bohIriFlow');
    expect(island).not.toContain('bohIsleSpin');
    expect(island).not.toContain('.generating');
    expect(read(ANSWER_VUE)).not.toContain('--boh-iri');
  });

  it('跨组件 `generating` 信号已删除（生成态视觉全在岛内）', () => {
    const store = read(STORE);
    expect(store).not.toContain('const generating = ref(false);');
    expect(island).not.toContain('generating }');
  });

  it('docked 态卡片仍然透明（材质由 surface 提供），悬浮态自己带深色胶囊', () => {
    // docked：材质交给 surface，卡片不许自带底色（否则导航那块玻璃上叠一层黑）
    const docked = (css.match(/\.docked \.boh-card\s*\{[^}]*\}/) || [''])[0];
    expect(docked).toContain('background: transparent');
    // 悬浮（无导航栏路由）：自带深色渐变 + 顶部内高光
    expect(css).toMatch(/\.boh-island-root \.boh-card\s*\{[^}]*linear-gradient\(180deg, #383940/);
  });
});

describe('唤起 BOHAI：整块 surface 切深色', () => {
  const nav = read(NAV_VUE);
  const css = read(NAV_CSS);

  it('容器 data-theme 由「岛是否展开」合成', () => {
    expect(nav).toContain(
      "const surfaceTheme = computed(() => (bohIsland.isOpen.value ? 'dark' : currentTheme.value));",
    );
    expect(nav).toContain(':data-theme="surfaceTheme"');
  });

  it('只在容器上切，不动 <html data-theme>（站点主题/其它岛不受影响）', () => {
    expect(nav).not.toMatch(
      /documentElement\.setAttribute\(\s*['"]data-theme['"]\s*,\s*['"]dark['"]/,
    );
  });

  it('透出来的是「被压暗的页面」，不是一片浅灰（backdrop 必须带 brightness）', () => {
    // 只降 alpha 不让 backdrop 变暗 ⇒ 浅色站点上透出白页面，看着像褪色。
    // 2026-11-05 起材质收进 tokens 单源（check:liquid-glass 要求）：这条断言
    // 不能再只认组件里的裸值 —— 要顺着 `var(--liquid-filter-scrim)` 找到定义处，
    // 否则「把 brightness 从 token 里删掉」这种回归照样全绿。
    const block = (css.match(/\.has-boh-island\)\s*\{[^}]*\}/) || [''])[0];
    expect(block).toContain('var(--liquid-filter-scrim)');

    const tokens = read(TOKENS_CSS);
    const declaration = (tokens.match(/--liquid-filter-scrim\s*:[^;]+;/) || [''])[0];
    expect(declaration).toContain('brightness(0.');
  });

  it('⭐ 暗色兜底规则必须 `:not(.has-boh-island)`（同权重靠后，会静默压掉底部亮边）', () => {
    // scoped 规则编译后自带 `[data-v-x]` ⇒ `#id[data-theme] .surface[data-v]` 是 (1,3,0)，
    // 与 `.has-boh-island.has-boh-island` 同权重；它在文件里更靠后，于是把岛的
    // border-color 刷回 --liquid-border（0.12）。2026-11-05 实测「底部亮边消失」就是这条。
    expect(css).toMatch(
      /#unified-nav-container\[data-theme=['"]dark['"]\]\s*\.unified-nav-surface:not\(\.has-boh-island\)/,
    );
  });

  it('has-boh-island 的深色底用双写类名压过 navbar-dark 的 !important', () => {
    // navbar-dark.css 有一条 `[data-theme="dark"] #… .unified-nav-surface:not(...)`
    // 的 !important 偏蓝底；同权重只能靠加载顺序，不可靠 ⇒ 这里必须抬高一级
    expect(css).toContain(
      ':global(#unified-nav-container .unified-nav-surface.has-boh-island.has-boh-island)',
    );
    const block = (css.match(/\.has-boh-island\.has-boh-island\)\s*\{[^}]*\}/) || [''])[0];
    expect(block).toContain('!important');
    // 顶部纯黑 → 底部微透（用户口径「黑色到底部慢慢渐变成微透」）
    expect(block).toContain('#000000 0,');
    // 底部要「渐隐消失」+ 一道亮边（2026-11-05 用户最终口径）：
    //   · 末段 alpha 必须很低（< 0.25），黑要真的化掉；
    //   · 形体靠 border-bottom + inset 底边亮线撑住，不能只靠渐变。
    const lastStop = (block.match(/rgba\(0, 0, 0, ([\d.]+)\) 100%/) || [])[1];
    expect(Number(lastStop)).toBeLessThan(0.25);
    // ⭐ 渐隐带必须按 **px 反推**：百分比会随岛高伸缩，竖屏（矮岛）就只剩十几像素，
    //    肉眼等于没改（2026-11-05 用户实拍「为啥我看得没区别」的直接原因）
    expect(block).toContain('calc(100% - min(84px, 45%))');
    // 中间停靠点不许用百分比（末段 100% 除外）
    expect(block).not.toMatch(/rgba\(0, 0, 0, [\d.]+\) (?!100%)[\d.]+%/);
    // background-color 必须是 transparent：底色一旦写死，渐隐就没了
    expect(block).toContain('background-color: transparent');
  });
});

describe('加载态：8 点环 + 状态 + 步骤（参考图 1）', () => {
  const answer = read(ANSWER_VUE);
  const css = squeezeSource(answer);

  it('只在「流式已开始、一个字还没出来」时占位', () => {
    expect(answer).toMatch(
      /const showLoading = computed\(\s*\(\)\s*=>\s*streaming\.value && !answerText\.value && pageLinks\.value\.length === 0,?\s*\)/,
    );
  });

  it('点环是 8 个 `<i>`，角度与延迟都靠内联变量错开', () => {
    expect(answer).toMatch(/v-for="n in 8"/);
    expect(answer).toContain("'--a': `${(n - 1) * 45}deg`");
    expect(answer).toContain("'--i': n - 1");
    expect(css).toMatch(/\.boh-ring i\s*\{[^}]*animation-delay:\s*calc\(var\(--i\) \* -0\.115s\)/);
  });

  it('⭐ 点的缩放必须小幅度（0.95→1.06）—— 差值放大会看成「散落的点」', () => {
    // squeezeSource 把换行压掉了，不能按 `\n}` 截块；直接切一段足够长的窗口
    const at = css.indexOf('@keyframes bohRingPulse');
    expect(at).toBeGreaterThan(-1);
    const frames = css.slice(at, at + 700);
    expect(frames).toContain('scale(0.95)');
    expect(frames).toContain('scale(1.06)');
    expect(frames).not.toContain('scale(0.78');
  });

  it('状态文案按 stage 做进行时改写', () => {
    expect(answer).toContain("'web-searching': '正在搜索网页…'");
    expect(answer).toContain("thinking: '正在思考…'");
  });

  it('⭐ 不显示 1/3、2/3 这类进度（2026-11-05 口径）', () => {
    expect(answer).not.toContain('loadingStep');
    expect(answer).not.toContain('LOAD_STEPS');
    expect(answer).not.toMatch(/\b\d\/3\b/);
  });

  it('⭐ 加载态**不提供**停止入口（2026-11-05 口径：等首字出来再停）', () => {
    expect(answer).not.toContain('boh-load-stop');
    // 脚部也不能在这一态露出来 —— 否则左下角会多一条「停止生成」
    expect(answer).toMatch(/<div v-if="hasAnswer && !showLoading" class="boh-answer-foot">/);
  });

  it('两条降级都在：系统 reduce + 站点开关，且降级时点必须全亮', () => {
    expect(css).toMatch(
      /prefers-reduced-motion: reduce[\s\S]{0,160}\.boh-ring i\s*\{[^}]*opacity:\s*0\.85/,
    );
    expect(css).toMatch(/\.reduce-motion \.boh-ring i\s*\{[^}]*opacity:\s*0\.85/);
  });
});

describe('回复态 + 输入条（参考图 2）', () => {
  const answer = read(ANSWER_VUE);
  const css = squeezeSource(answer);

  it('问题是标题级（不再是 11.5px 的一行小字）', () => {
    expect(css).toMatch(/\.boh-q-echo\s*\{[^}]*font-size:\s*15\.5px/);
    expect(css).not.toMatch(/\.boh-q-echo\s*\{[^}]*font-size:\s*11\.5px/);
  });

  it('结果胶囊是独立一枚（inline-flex + pill 圆角），不是占满宽的按钮', () => {
    const block = (css.match(/\.boh-result-pill\s*\{[^}]*\}/) || [''])[0];
    expect(block).toContain('inline-flex');
    expect(block).toContain('border-radius: 999px');
    expect(answer).toContain('查看完整回答');
  });

  it('输入条生成中整条不渲染，回答落定后返场', () => {
    expect(answer).toMatch(/<Transition name="boh-bar">[\s\S]{0,160}v-if="!streaming"/);
    expect(css).toMatch(/\.boh-bar-enter-from,[^}]*\.boh-bar-leave-to\s*\{[^}]*max-height:\s*0/);
  });

  it('回复态生成中仍有停止入口（脚部文字）', () => {
    expect(answer).toMatch(/v-if="streaming"[^>]*class="boh-foot-stop"[^>]*@click="stop"/);
  });
});

describe('岛与移动菜单互斥（2026-11-05 实拍事故）', () => {
  const nav = read(NAV_VUE);

  it('岛展开时点汉堡 = 先收岛，这一下不开菜单', () => {
    // 岛的面板与移动菜单在同一块区域，同时展开是叠影（截图里菜单半透明压在岛上）
    expect(nav).toMatch(
      /if \(!isMobileMenuOpen\.value && bohIsland\.isOpen\.value\) \{\s*bohIsland\.close\(\);\s*return;/,
    );
  });

  it('任意来源唤起岛都会收起已展开的菜单 —— 含 bohIsland', () => {
    // 旧 watch 只看 statusCard / taskCard / custom 三个槽位，⌘K 与下拉手势
    // 唤起的岛不在其中，菜单会滞留在展开态
    expect(nav).toMatch(/!!islandCustomSlot\.component \|\|\s*bohIsland\.isOpen\.value/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 回答面形态（2026-11-05 第六次用户口径）
//
// 用户原话：「默认显示完整回答，只是会根据 AI 的回答自动延长岛，但是会设置最大限制，
// 支持内部滚动，不显示滚动条。」
// ⇒ 旧的「首屏 5–6 行渐隐 + 展开全文」整套退场；高度 = 内容驱动 + 封顶；
//    溢出交给内层滚动（轨道隐藏）。
// ─────────────────────────────────────────────────────────────────────────────

describe('回答面：全文直出 + 封顶 + 内滚（不给滚动条）', () => {
  const island = read(ISLAND_VUE);
  const answer = read(ANSWER_VUE);
  const answerCss = squeezeSource(answer);
  const islandCss = squeezeSource(island);

  it('「展开全文 / 裁剪」整套不许回来', () => {
    expect(answer).not.toContain('展开全文');
    expect(answer).not.toContain('ANSWER_CLIP_MAX');
    expect(answerCss).not.toContain('clipped');
    expect(answerCss).not.toContain('boh-expand');
  });

  it('正文全文直出（只有流式占位判断，没有行数裁剪）', () => {
    expect(answer).toMatch(
      /class="boh-answer-text" v-html="answerHtml"|v-html="answerHtml"\s*><\/div>/,
    );
  });

  it('滚动条隐藏但滚动能力保留（overflow-y 必须还在）', () => {
    const body = (answerCss.match(/\.boh-answer-body\s*\{[^}]*\}/) || [''])[0];
    expect(body).toContain('overflow-y: auto');
    expect(body).toContain('scrollbar-width: none');
    expect(answerCss).toMatch(/\.boh-answer-body::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it('流式跟随只在「本来就贴着底」时生效（往上翻时不被拽回去）', () => {
    expect(answer).toContain('const STICK_THRESHOLD = 48;');
    expect(answer).toMatch(
      /stickBottom\s*=\s*el\.scrollHeight - el\.scrollTop - el\.clientHeight < STICK_THRESHOLD/,
    );
    expect(answer).toMatch(/if \(!stickBottom\) return;/);
  });

  it('⭐ 程序贴底引发的 scroll 事件不许被当成「用户往上翻」', () => {
    // 只按位置判断时，溢出 28px 会被判成用户已离开底部 ⇒ 从此不再跟随。
    expect(answer).toContain('let lastPinAt = 0;');
    expect(answer).toMatch(/if \(Date\.now\(\) - lastPinAt < 160\) return;/);
    // 容器尺寸变化（卡片被 max-height 夹紧）也要重贴，否则溢出量刚好一点点时贴不住
    expect(answer).toMatch(/bodyObserver = new ResizeObserver\(\(\) => \{\s*void pinToBottom\(\);/);
  });

  it('⭐ 卡片高度两态都有明确上限（docked / 悬浮都不能撑满屏）', () => {
    // docked 原先是 `calc(100dvh - …)` 裸算式 —— 长回答会把导航撑到吃掉整个屏幕
    const docked = (islandCss.match(/\.boh-island-root\.docked \.boh-card\s*\{[^}]*\}/) || [''])[0];
    expect(docked).toContain('max-height');
    expect(docked).toContain('clamp(320px, 62dvh, 600px)');
    // 文件里有两块 `.boh-island-root .boh-card`（定位块 + 材质/尺寸块），要取含 max-height 的那块
    const floating = (islandCss.match(
      /\.boh-island-root \.boh-card\s*\{[^}]*max-height[^}]*\}/,
    ) || [''])[0];
    expect(floating).toContain('clamp(320px, 62dvh, 600px)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 侧栏「在搜索里问过」：折叠 + 一键清理（2026-11-05 用户口径）
//
// 这一组是唯一会无限堆积的分组（每次关岛重开都是一条新快速会话），
// 所以要能收起来、也能一次清掉。两件事都是「看起来没坏但其实没接上」的类型：
// 折叠态写不进 localStorage、清理信号没人接、批量删把正在生成的会话带走。
// ─────────────────────────────────────────────────────────────────────────────

describe('侧栏「在搜索里问过」：折叠 + 一键清理', () => {
  const sidebar = read('src/views/BOHAI/BOHAI/components/BohSidebar.vue');
  const sidebarCss = read('src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css');
  const shell = read('src/views/BOHAI/composables/useBohShell.js');
  const manager = read('src/views/BOHAI/composables/useConversationManager.js');
  const main = read('src/views/BOHAI/BOHAI/BOHAIMain.vue');

  it('分组头是按钮，带 aria-expanded', () => {
    expect(sidebar).toMatch(
      /class="boh-sb-glabel"[\s\S]{0,120}:aria-expanded="!isGroupCollapsed\(group\.id\)"/,
    );
    expect(sidebar).toMatch(/@click="toggleGroup\(group\.id\)"/);
  });

  it('折叠状态落 localStorage，搜索中强制展开（否则命中项藏在收起的组里）', () => {
    expect(sidebar).toContain("const COLLAPSED_GROUPS_KEY = 'boh_sidebar_collapsed_groups';");
    expect(sidebar).toMatch(/localStorage\.setItem\(COLLAPSED_GROUPS_KEY/);
    expect(sidebar).toMatch(
      /const isGroupCollapsed = \(id\) => \{\s*if \(String\(query\.value \|\| ''\)\.trim\(\)\) return false;/,
    );
  });

  it('折叠用 0fr↔1fr（高度未知也能过渡），不是硬切 display:none', () => {
    expect(sidebarCss).toMatch(/\.boh-sb-gbody\s*\{[^}]*grid-template-rows:\s*1fr/);
    expect(sidebarCss).toMatch(/\.boh-sb-gbody\.is-collapsed\s*\{[^}]*grid-template-rows:\s*0fr/);
  });

  it('清理入口只给 quickAsk 分组（别的时间分组不该出现）', () => {
    expect(sidebar).toMatch(/v-if="group\.id === 'quickAsk'"/);
    expect(sidebar).toContain("emit('clear-quick-asks')");
  });

  it('信号一路接通：侧栏 → 壳 → 会话管理器', () => {
    expect(main).toMatch(/@clear-quick-asks="requestClearQuickAsks"/);
    expect(shell).toMatch(/const requestClearQuickAsks = \(\) => \{/);
    expect(shell).toContain('clearQuickAskSessions()');
    expect(manager).toContain('const clearQuickAskSessions = () => {');
  });

  it('⭐ 批量清理只删 quick-ask，且跳过正在生成的那条（倒序 deleteSession 会留空会话）', () => {
    expect(manager).toMatch(
      /const generating = activeGenerationSessionIndex\.value === index;\s*if \(!generating && session\?\.origin === 'quick-ask'\) return;/,
    );
    // 走重建数组 + 索引重映射，而不是循环 deleteSession
    expect(manager).toMatch(/indexMap\.set\(index, kept\.length\)/);
    expect(manager).toMatch(/currentSessionIndex\.value = indexMap\.get\(prevCurrent\) \?\? 0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 跳页即关岛（2026-11-05 用户报障：从帖子详情返回后多出一块空的黑岛）
//
// 复现链：首页唤起岛 → 点帖子（`/forum/post/:id`，hideNavbar）→ 返回。
// 期间发生两件事：① 导航栏整个卸载，岛退成悬浮态（`top:12` 的深色小胶囊，只剩输入条）；
// ② 返回时导航栏是**新建的 DOM**，旧实现只 observe 过一次导航容器，
//    新容器等不到 measure ⇒ 卡片停在那副悬浮形态上，就是用户看到的「空黑岛」。
// ─────────────────────────────────────────────────────────────────────────────

describe('跳页即关岛（空黑岛事故）', () => {
  const island = read(ISLAND_VUE);

  it('⭐ 路由一变就关岛（岛是「当前这一页」的入口，跟着页面走）', () => {
    expect(island).toMatch(
      /watch\(\s*\(\) => route\.fullPath,\s*\(\) => \{\s*if \(isOpen\.value\) close\(\);/,
    );
  });

  it('⭐ 导航容器换了必须重新 observe（不能盯着已销毁的节点）', () => {
    expect(island).toContain('let observedNav = null;');
    expect(island).toMatch(/if \(navResizeObserver && observedNav === nav\) return;/);
    expect(island).toMatch(/observedNav = nav;/);
    // 旧的一次性守卫不许回来：它会在导航栏重建后永久静默
    expect(island).not.toMatch(/if \(!nav \|\| navResizeObserver\) return;/);
  });
});

describe('开合竞态（2026-11-05 复核发现）', () => {
  const island = read(ISLAND_VUE);

  it('⭐ 退场动画期间重新开岛，不许被上一次的收尾吞掉', () => {
    // 旧实现：await playClose() 之后无条件 clearDock + rendered=false，
    // 若期间用户又按了 ⌘K，会把刚打开的新岛一起收掉。
    expect(island).toContain('let openEpoch = 0;');
    expect(island).toMatch(/const epoch = \(openEpoch \+= 1\);/);
    expect(island).toMatch(/if \(epoch !== openEpoch \|\| isOpen\.value\) return;/);
    // 上一次退场写下的内联 opacity:0 必须清掉，否则重开出来的岛是隐形的
    expect(island).toMatch(/style\.removeProperty\('opacity'\)/);
    expect(island).toMatch(/closing\.value = false;\s*\n\s*rendered\.value = true;/);
  });
});
