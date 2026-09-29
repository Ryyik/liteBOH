import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
// .vue 必须先取 <script> 区再剥注释：模板里的 `accept="image/*"` 会与远处的 `*/`
// 错配、把真实代码一起吃掉（实测见 tests/helpers/source.js 的说明）。
const scriptCode = (rel) => stripComments(scriptSection(read(rel)));

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
