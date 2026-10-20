import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Cloud+ 暗色适配守卫（2026-10-19）。
 *
 * 背景：Cloud+ 此前整页零暗色适配（--apple-* 硬编码亮色），暗色下是「亮页面」，
 * 且顶栏白字标题落在白底上不可见。2026-10-19 采用「变量重映射」路线修复：
 *   · 亮色变量块补派生变量（默认值 = 原字面量，亮色渲染不变）
 *   · [data-theme='dark'] .cloud-page 块把 --apple-* 整组映射到 --boh-* token
 *   · 文件内硬编码白面/黑字逐处换成变量
 *
 * 这组断言锁三件事：
 *   ① 重映射块存在，且块内**一个裸色值都没有**（check:dark-tokens 棘轮对暗色块
 *      内裸色值只许下降；谁往里塞 hex/rgba/white/black 就当场红）
 *   ② 关键面（顶栏/底部导航/反色按钮/骨架 shimmer）确实走变量，而不是退回字面量
 *   ③ 「暗色退实色底」的旧兜底块已删除（页面本身暗了之后那块反而把玻璃盖死）
 */
const CSS = readFileSync('src/views/user-center/Cloud+/style.scoped.css', 'utf8');
const STORAGE_BAR = readFileSync('src/views/user-center/Cloud+/CloudStorageBar.vue', 'utf8');

/** 与 scripts/lib/dark-token-counter.mjs 同口径的裸色判定（hex / rgb() / hsl() / white / black） */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/;

/** 取「选择器开头 → 下一个顶层 `}`」的规则体（够用：本文件没有嵌套 at-rule 内同名选择器） */
function extractRule(css, selectorPrefix) {
  const start = css.indexOf(selectorPrefix);
  if (start === -1) return null;
  const bodyStart = css.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(bodyStart + 1, i);
    }
  }
  return null;
}

describe('Cloud+ 暗色适配（变量重映射）', () => {
  it('存在 [data-theme=dark] .cloud-page 重映射块', () => {
    expect(CSS).toContain("[data-theme='dark'] .cloud-page");
    expect(extractRule(CSS, "[data-theme='dark'] .cloud-page")).toBeTruthy();
  });

  it('重映射块内零裸色值（暗色棘轮只许下降的源码层保证）', () => {
    const body = extractRule(CSS, "[data-theme='dark'] .cloud-page");
    const decls = body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    expect(decls.length).toBeGreaterThan(20);
    for (const decl of decls) {
      expect(decl, `重映射块内出现裸色值: ${decl}`).not.toMatch(COLOR_LITERAL);
    }
  });

  it('重映射块引用的 --boh-* token 真源存在（dark-mode.css 的 dark 块里有定义）', () => {
    const darkTokens = readFileSync('src/styles/themes/dark-mode.css', 'utf8');
    for (const token of [
      '--boh-page-bg',
      '--boh-bg-secondary',
      '--boh-bg-tertiary',
      '--boh-text-primary',
      '--boh-text-secondary',
      '--boh-text-tertiary',
      '--boh-brand-blue',
      '--boh-brand-red',
      '--boh-border-primary',
      '--boh-divider',
      '--boh-glass-bg',
      '--boh-glass-border',
    ]) {
      expect(darkTokens, `dark-mode.css 缺少 ${token}`).toContain(token);
    }
  });

  it('关键亮色默认值保持原字面量（亮色渲染不变）', () => {
    const light = extractRule(CSS, '.cloud-page {');
    expect(light).toContain('--apple-glass-bar: rgba(255, 255, 255, 0.72)');
    expect(light).toContain('--apple-glass-input: rgba(255, 255, 255, 0.82)');
    expect(light).toContain('--apple-red: #ff3b30');
    expect(light).toContain('--apple-bg: #ffffff');
    expect(light).toContain('--apple-text: #1d1d1f');
  });

  it('关键面已换变量：顶栏玻璃底 / 底部导航 / 骨架 shimmer / 危险按钮', () => {
    expect(extractRule(CSS, '.cloud-back-header {')).toContain('var(--apple-glass-bar)');
    const nav = extractRule(CSS, '.cloud-bottom-nav {');
    expect(nav).toContain('var(--apple-glass-input)');
    expect(nav).toContain('var(--apple-nav-border)');
    expect(extractRule(CSS, '.skeleton-block {')).toContain('var(--apple-shimmer-a)');
    expect(extractRule(CSS, '.danger-btn {')).toContain('var(--apple-red)');
  });

  it('反色按钮的文字必须跟底色对调（暗色下不允许 white-on-white）', () => {
    for (const selector of [
      '.share-visibility-btn.active',
      '.filter-pill.active',
      '.filter-chip.active',
    ]) {
      const body = extractRule(CSS, `${selector} {`);
      expect(body, `${selector} 缺少 color: var(--apple-bg)`).toContain('color: var(--apple-bg)');
      expect(body, `${selector} 不应再写死 white`).not.toMatch(
        /color:\s*#f{3,6}\b|color:\s*white\b/,
      );
    }
  });

  it('旧「暗色退实色底」兜底块已删除（页面暗了之后它会把玻璃盖死）', () => {
    expect(CSS).not.toContain("[data-theme='dark'] .sidebar-card.liquid-glass");
    expect(STORAGE_BAR).not.toContain("[data-theme='dark'] .storage-bar-card.liquid-glass");
  });

  it('CloudStorageBar 跟随页面变量（继承 .cloud-page 的重映射）', () => {
    expect(STORAGE_BAR).toContain('var(--apple-red)');
    expect(STORAGE_BAR).not.toMatch(/color:\s*#ff3b30/);
  });
});
