/**
 * bohai-sidebar-layer.test.js — BOHAI 侧栏与全局 chrome 的层级阶梯（2026-10-11）
 *
 * 起因（实测，不是推测）：`.boh-sidebar`（对话管理）曾是 `z-index: 2147483450`，
 * 而导航栏是 9999 ⇒ **对话管理压在全局搜索岛上面**。判据是交叠点的命中测试：
 * `document.elementFromPoint(346, 389)` 在改之前返回 `nav.boh-sb-groups`（侧栏赢了），
 * 改之后返回 `div.global-search`（搜索岛赢了）。
 *
 * ⚠️ 这条锁的是**相对关系**，不是某个具体数字：以后谁把导航栏抬到 100000 也一样成立。
 *   但 `2147483450` 这类「抽屉时代遗留的魔法值」要钉死 —— 它天然高于任何 chrome，
 *   正是这次事故的成因。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');

/** 取 `.selector { ... }` 里第一条 z-index 的数值；取不到返回 null */
const zIndexOf = (css, selector) => {
  const block = css.match(
    new RegExp(`(?:^|[,}\\s])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`),
  );
  const value = block?.[1]?.match(/z-index:\s*(\d+)/)?.[1];
  return value === undefined ? null : Number(value);
};

describe('BOHAI 层级阶梯：对话管理必须低于全局 chrome', () => {
  const sidebarCss = read('src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css');
  // ⚠️ 导航栏容器的 z-index 不在组件自己的 scoped CSS 里，在 vendor 那份
  //    （`src/styles/vendor/unified-nav.css:13` = 9999）—— 别去 UnifiedNavbar 里找。
  const navbarCss = read('src/styles/vendor/unified-nav.css');
  const layoutCss = read('src/views/BOHAI/BOHAI/styles/layout.css');
  const settings = read('src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue');

  it('侧栏低于导航栏（这条就是「搜索框要在对话管理之上」的机器判据）', () => {
    const sidebar = zIndexOf(sidebarCss, '.boh-sidebar');
    const navbar = zIndexOf(navbarCss, '#unified-nav-container');
    expect(sidebar).not.toBeNull();
    expect(navbar).not.toBeNull();
    expect(sidebar).toBeLessThan(navbar);
  });

  it('侧栏仍高于页面内容与遮罩（不能为了压 chrome 把抽屉压没了）', () => {
    const sidebar = zIndexOf(sidebarCss, '.boh-sidebar');
    expect(sidebar).toBeGreaterThan(zIndexOf(layoutCss, '.boh-backdrop'));
    expect(sidebar).toBeGreaterThan(zIndexOf(layoutCss, '.boh-main'));
  });

  it('侧栏仍低于全屏设置页（2026-10-03 那次事故的反向保险）', () => {
    const sidebar = zIndexOf(sidebarCss, '.boh-sidebar');
    const panel = Number(settings.match(/z-index:\s*(\d+)/)?.[1]);
    expect(panel).toBeGreaterThan(sidebar);
  });

  it('BOHAI 样式里不再有 2147483450 这类抽屉时代遗留的魔法值（声明位，注释里可以写）', () => {
    expect(sidebarCss).not.toMatch(/z-index:\s*214748\d+/);
  });
});
