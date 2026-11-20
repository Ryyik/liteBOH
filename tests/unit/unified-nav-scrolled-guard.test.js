import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
// .vue 必须先取 <script> 区再剥注释：模板里的 `accept="image/*"` 会与远处的 `*/`
// 错配、把真实代码一起吃掉（实测见 tests/helpers/source.js 的说明）。
const scriptCode = (rel) => stripComments(scriptSection(read(rel)));
const navTemplate = flattenSource(read('src/components/UnifiedNavbar/index.vue'));
const navScript = squeezeSource(
  stripComments(scriptSection(read('src/components/UnifiedNavbar/index.vue'))),
);

const NAV_STYLESHEETS = [
  'src/styles/vendor/unified-nav.css',
  'src/components/UnifiedNavbar/style.scoped.css',
];

describe('统一导航：休眠的 .scrolled 规则不得回流', () => {
  it('导航样式表里没有任何 .scrolled 选择器', () => {
    // 背景（2026-09-29 实测 + 清理）：
    //   Beta 6 起导航是常驻悬浮岛，「滚动收纳」的触发（给 #unified-nav-container 加 .scrolled）
    //   已随 4.9.1 回退通道一并移除 —— 全仓（含 index.html / JS / 模板绑定）再无一处添加它。
    //   但 vendor 里当时仍留着 3 组 .scrolled 规则（含 @media (orientation: portrait) 一整块）。
    //   危险点：`#unified-nav-container.scrolled .nav-menu-mobile { top: 64px }` 的特异性是
    //   (1,2,0)，高于 style.scoped.css 里那条 (1,1,0) 的 `top: 100%`。**一旦有人把 .scrolled
    //   加回来，已经修好的约 17px 接缝会当场回归**；而 probe-nav-mobile-menu.mjs 全程不滚动，
    //   同一 path 又没有滚动档 → 探针照样全绿。所以这条按「选择器」在源码层锁死，
    //   不依赖浏览器探针。要重新引入 .scrolled，必须先显式删掉本断言并说明理由。
    for (const file of NAV_STYLESHEETS) {
      expect(stripCssComments(read(file)), `${file} 不应再出现 .scrolled 选择器`).not.toContain(
        '.scrolled',
      );
    }
  });

  it('反证：注释里合法提到 .scrolled，所以断言必须先剥注释（否则这条会假红）', () => {
    // style.scoped.css 的注释里记录过「旧 stable 全宽 sheet 与 .scrolled 触发已移除」。
    // 这条反证锁住上面那步 stripCssComments：去掉它，第一条断言立刻假红。
    const scoped = read('src/components/UnifiedNavbar/style.scoped.css');
    expect(scoped).toContain('.scrolled');
    expect(stripCssComments(scoped)).not.toContain('.scrolled');
  });

  it('导航组件里也没有任何运行时添加 .scrolled 的代码', () => {
    expect(scriptCode('src/components/UnifiedNavbar/index.vue')).not.toContain('scrolled');
  });
});

/**
 * 顶栏语义 / 直接动作目标守卫（2026-11-20）。
 *
 * 为什么放在单测而不是只靠探针：浏览器探针不进 CI，而这里的失效是**静默**的 ——
 * 换回 <a href="javascript:;">、删掉 aria-current 或 aria-label，页面照样能点，
 * 只是读屏/键盘用户拿不到地标、当前页与未读信息。探针负责几何，源码层锁语义。
 */
describe('统一导航：语义与直接动作目标', () => {
  it('根节点是带名称的 navigation 地标', () => {
    expect(navTemplate).toContain(
      flattenSource('<nav id="unified-nav-container" class="unified-nav" aria-label="全局导航"'),
    );
  });

  it('桌面一级下拉是原生 button disclosure，并关联自己的子菜单', () => {
    expect(navTemplate).toContain(flattenSource('<button type="button" class="nav-link-wrapper"'));
    expect(navTemplate).toContain(flattenSource(':aria-controls="`nav-submenu-${item.name}`"'));
    expect(navTemplate).toContain(flattenSource(':id="`nav-submenu-${item.name}`"'));
    // 旧的 anchor + role=button 写法不得回流
    expect(navTemplate).not.toContain(flattenSource('class="nav-link-wrapper" role="button"'));
  });

  it('当前页用 aria-current 暴露，桌面与竖屏都要有', () => {
    expect(navTemplate).toContain(
      flattenSource(':aria-current="item.isActive ? \'page\' : undefined"'),
    );
    expect(navTemplate).toContain(
      flattenSource(':aria-current="isActive(child.path) ? \'page\' : undefined"'),
    );
    expect(navTemplate).toContain(
      flattenSource(':aria-current="isActive(grand.path) ? \'page\' : undefined"'),
    );
  });

  it('竖屏一级下拉也是原生 button，并关联共享子菜单面板', () => {
    expect(navTemplate).toContain(flattenSource('<button type="button" class="nav-mobile-link"'));
    expect(navTemplate).toContain('aria-controls="nav-menu-mobile-submenu"');
    expect(navTemplate).toContain('id="nav-menu-mobile-submenu"');
  });

  it('汉堡按形态区分受控对象：只有非桌面 mini 才指向竖屏菜单', () => {
    expect(navTemplate).toContain('ref="navHamburger"');
    expect(navTemplate).toContain(
      flattenSource(':aria-controls="desktopMiniActive ? undefined : \'nav-menu-mobile\'"'),
    );
  });

  it('未读红点并入头像链接的可访问名称，数字本身不再重复朗读', () => {
    expect(navTemplate).toContain('条未读消息');
    expect(navTemplate).toContain('aria-hidden="true"');
  });

  it('Esc 能关竖屏菜单并把焦点还给汉堡', () => {
    expect(navScript).toContain(
      squeezeSource(
        'if (isMobileMenuOpen.value) { closeMobileMenu(); nextTick(() => navHamburger.value?.focus()); return; }',
      ),
    );
  });

  it('logo / 头像 / 登录同属直接动作目标，hover 不排展开', () => {
    expect(navScript).toContain(
      squeezeSource(
        "const DIRECT_ACTION_SELECTOR = '.nav-logo, .nav-user-profile, .nav-login-btn';",
      ),
    );
    expect(navScript).toContain(
      squeezeSource('if (isPointerOnDirectAction(event)) { clearMiniHoverTimer(); return; }'),
    );
  });

  it('岛与导航菜单互斥：开菜单先收岛，岛唤起时收菜单', () => {
    expect(navScript).toContain(
      squeezeSource('if (bohIsland.isOpen.value) { bohIsland.close(); return; }'),
    );
    expect(navScript).toContain(squeezeSource('if (expandedMenu.value) closeSubMenu();'));
  });

  it('菜单展开时状态岛让位，surface 高度改跟菜单而非状态卡', () => {
    // 2026-11-20 用户截图报障：/newsroom 的搜索岛（has-status-card）常驻，
    // 打开下拉后高度被状态卡的 !important 锁死，菜单只露出前两项。
    const css = stripCssComments(read('src/components/UnifiedNavbar/style.scoped.css'));
    for (const sel of [
      '.unified-nav-surface.has-submenu > .global-nav-status-card',
      '.unified-nav-surface.has-submenu > .global-nav-task-card',
      '.unified-nav-surface.has-submenu > .island-custom-host',
      '.unified-nav-surface.has-mobile-menu > .global-nav-status-card',
      '.unified-nav-surface.has-mobile-menu > .global-nav-task-card',
      '.unified-nav-surface.has-mobile-menu > .island-custom-host',
    ]) {
      expect(css).toContain(sel);
    }
    /* 高度不再补一条 !important（important-budget 棘轮只许降）：
       点击展开只改写 `--nav-open-height`，基础高度规则用 var() 读它。 */
    expect(css).toContain('var(--nav-open-height,');
    expect(css).toMatch(/\.unified-nav-surface\.has-submenu\s*\{[^}]*--nav-open-height:/);
    expect(css).toMatch(/\.unified-nav-surface\.has-mobile-menu\s*\{[^}]*--nav-open-height:/);
    expect(css).toContain('var(--nav-submenu-h, 0px)');
    expect(css).toContain('var(--nav-mobile-h, 0px)');
  });

  it('一级触发器按钮在 ≤1024 档与锚点同级（锚点专属规则必须并列 .nav-link-wrapper）', () => {
    /* 2026-11-20 实测（744 / 900 / 1024 三档）：触发器从 <a> 换成 <button> 后，
       vendor 里 `.nav-menu a` 的平板档尺寸不再命中 —— 触发器 14px/8px 0、高 42.6，
       同级链接 13px/8px 14px、高 44，且页面色规则里的 #000 也漏掉它。 */
    const css = stripCssComments(read('src/styles/vendor/unified-nav.css'));
    expect(css).toMatch(
      /\.unified-nav \.nav-menu a,\s*\.unified-nav \.nav-menu \.nav-link-wrapper\s*\{\s*padding: 8px 14px;\s*font-size: 13px;/,
    );
    expect(css).toMatch(
      /\.unified-nav \.nav-menu > \.nav-menu-item > a,\s*\.unified-nav \.nav-menu > \.nav-menu-item > \.nav-link-wrapper\s*\{\s*min-height: 44px;/,
    );
    expect(css).toMatch(/body\.page-home \.unified-nav \.nav-link-wrapper/);
  });

  it('has-boh-island 由 Vue 绑定，避免响应式 class 重算抹掉命令式停靠类', () => {
    expect(navTemplate).toContain(flattenSource("'has-boh-island': bohIsland.docked.value"));
    expect(read('src/composables/useBohIsland.js')).toContain('const docked = ref(false);');
    expect(read('src/composables/useBohIsland.js')).toContain('docked,');
    expect(read('src/components/BohIsland.vue')).toContain('toggle, docked } = useBohIsland();');
  });
});
