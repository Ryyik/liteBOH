import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const BOHAI_MAIN = 'src/views/BOHAI/BOHAI/BOHAIMain.vue';
// plans/025 v2 · Step 6-2：侧栏已重绘为 `BohSidebar.vue`（旧 `BohaiSidebar.vue` 随旧 DOM 删除），
// 样式搬进同组件的 scoped CSS 文件 ⇒ 两处都要读。
const BOHAI_SIDEBAR = 'src/views/BOHAI/BOHAI/components/BohSidebar.vue';
const BOHAI_SIDEBAR_CSS = 'src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css';
const RAIL_CSS = 'src/views/user-center/UserSpace/styles/landscape-rail.css';

/**
 * BOH AI 整页（/ai-chat → body.page-aichat）在横屏保留 UserSpace 左栏导航。
 *
 * 2026-10-03 用户口径：AI 是底栏「AI」席的全屏落点，原先一切过去左栏整条消失 ——
 * 横屏电脑上从「我」页点 AI，导航没了、只剩一个返回键。
 *
 * 这套接线横跨三个文件，任一处掉了都不会报错、只会「左栏不见了」，
 * 所以必须锁：① 组件与 navItems 是不是那份单源；② 页面级 CSS 有没有被引入
 * （最容易漏的一处：landscape-rail.css 是按页引入的，不是全局样式）；
 * ③ body.page-aichat 段是否把 rail 钉住、把内容让开、把会话侧栏推到右边。
 */
describe('BOH AI 整页横屏左栏（2026-10-03，防「切到 AI 左栏就没了」）', () => {
  const script = () => scriptSection(read(BOHAI_MAIN));

  it('复用 UserSpace 的同一份左栏组件与 navItems 单源', () => {
    const src = read(BOHAI_MAIN);
    expect(src).toContain(
      "import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue'",
    );
    expect(src).toContain(
      "import { userSpaceNavItems } from '@/views/user-center/UserSpace/composables/useUserSpaceTabs.js'",
    );
    // 不许在 AI 页自己拼一份 navItems —— 那会让底栏/左栏/首页三处分叉
    expect(src).not.toMatch(/const\s+userSpaceNavItems\s*=/);
  });

  it('只在 standalone（/ai-chat 整页）挂载，且高亮 AI 席', () => {
    const src = read(BOHAI_MAIN);
    // embedded / overlayMode 下宿主自己已有左栏，再挂一份就是两条左栏
    // 2026-10-08：横屏左栏也要在**设置打开时**让位 —— 设置已重写为「全屏设置页」，
    // 打开时壳会把会话侧栏与这条左栏一起撤掉（否则两条导航都浮在设置页上）。
    expect(src).toMatch(/<UserSpaceSideRail\s+v-if="isStandalone && !settingsOpen"/);
    expect(src).toMatch(/current-tab="ai"/);
    expect(src).toMatch(/:nav-items="userSpaceNavItems"/);
    expect(src).toMatch(/@nav-click="handleRailNavClick"/);
    expect(src).toMatch(/@action="handleRailAction"/);
  });

  it('引入页面级 landscape-rail.css（按页引入，不是全局样式）', () => {
    expect(read(BOHAI_MAIN)).toContain(
      '<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>',
    );
    // 三处消费方共用同一份文件；断点与栏宽档位只在那一个文件里定义
    for (const consumer of [
      'src/views/user-center/UserSpace/UserSpaceMain.vue',
      'src/views/Profile/ProfileMain.vue',
      'src/views/Home/index.vue',
    ]) {
      expect(read(consumer), `${consumer} 也应引入同一份`).toContain('landscape-rail.css');
    }
  });

  it('body.page-aichat 段：钉住左栏 + 内容让位 + 会话侧栏右移', () => {
    const sheet = read(RAIL_CSS);
    const block = sheet.slice(sheet.indexOf('body.page-aichat'));
    expect(block, '未找到 body.page-aichat 段').not.toBe('');
    // 栏宽固定 88px，不随 ≥1280 升到 240px（AI 页另有一条 ~280px 会话侧栏）
    expect(block).toMatch(/body\.page-aichat\s*\{[\s\S]{0,200}--userspace-rail-w: 88px/);
    expect(block).toContain('--bohai-sidebar-left: var(--userspace-rail-w)');
    // 满屏长页里的 rail 必须 fixed（absolute 会跟着文档/包含块跑）
    expect(block).toMatch(
      /body\.page-aichat \.userspace-rail\.liquid-glass\s*\{[\s\S]{0,80}position: fixed/,
    );
    // 内容让位：整页一起右移（会话侧栏是 Teleport 到 body 的，由变量单独推）
    expect(block).toMatch(/body\.page-aichat \.bohai-page\s*\{[\s\S]{0,80}padding-left/);
    expect(block).toMatch(/body\.page-aichat \.unified-nav-surface/);
    // 不许给 page-aichat 单独升 240px 档（AI 页本身已有一条 ~280px 会话侧栏）
    expect(sheet).not.toMatch(/page-aichat[\s\S]{0,240}--userspace-rail-w: 240px/);
  });

  it('条目状态底色与暗色与 page-home 共用同一条规则（不复制色值）', () => {
    const sheet = read(RAIL_CSS);
    // 亮色与暗色两处都必须是「选择器列表 + 一份色值」，否则裸色棘轮会涨
    expect(sheet).toMatch(/body\.page-home,\s*\n\s*body\.page-aichat\s*\{/);
    expect(sheet).toMatch(
      /html\[data-theme="dark"\] body\.page-home,\s*\n\s*html\[data-theme="dark"\] body\.page-aichat\s*\{/,
    );
  });

  it('会话侧栏的 left 由变量驱动（默认 0，只有 AI 整页置位）', () => {
    const css = read(BOHAI_SIDEBAR_CSS);
    expect(css).toContain('left: var(--bohai-sidebar-left, 0px)');
    // 写死 0 会让会话侧栏压在左栏下面（两块面板重叠）
    expect(css).not.toMatch(/\.boh-sidebar\s*\{[\s\S]{0,160}left: 0 !important/);
    // 侧栏必须仍 Teleport 到 body —— 否则 left 由变量驱动这件事失去意义（父容器 padding 管不到它）
    expect(read(BOHAI_SIDEBAR)).toContain('<Teleport to="body">');
  });

  it('左栏动作分发到已有 handler（发布 / 搜索 / 主题 / 首页 / 退出）', () => {
    const code = script();
    expect(code).toContain('handleRailNavClick');
    expect(code).toContain('handleRailAction');
    for (const action of ['compose', 'search', 'theme', 'home', 'logout']) {
      expect(code, `缺少 ${action} 分支`).toContain(`case '${action}'`);
    }
  });
});
