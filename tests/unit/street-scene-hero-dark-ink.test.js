import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 首屏开场白（StreetSceneHero 品牌兜底态）的亮/暗墨色契约。
 *
 * ── 为什么用源码断言而不是渲染断言 ────────────────────────────────────
 * 这个组件没有 scoped 样式注入的测试环境（vitest 里不跑 Vue SFC 样式管线），
 * jsdom 也不会做层叠计算 —— 挂载后拿到的 color 永远是默认值，测不出回归。
 * 历史上这条 bug 的形态恰好就是「底色跟着 token 翻了、文字没翻」：
 *   2026-10-22 把 .on-brand 的 background 从 #ffffff 改成 var(--boh-page-bg)；
 *   2026-11-02 实测暗色 #16120e 底 + #17130e 字 = 1.01:1（整段不可见）。
 * 所以这里锁的是**两半必须挂在同一个 token 体系上**，任一半退回裸值就红。
 */

const root = resolve(import.meta.dirname, '../..');
const SRC = readFileSync(resolve(root, 'src/views/Home/components/StreetSceneHero.vue'), 'utf8');

const styleSection = (vue) =>
  [...vue.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/** CSS 注释里会合法地复述被禁的裸色值（解释「以前是 #17130e」），不剥就会假绿 */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 取某条选择器（必须是完整选择器）的声明块；找不到返回 ''，让断言明确失败 */
const ruleOf = (css, selector) => {
  const m = css.match(new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

const CSS = stripCssComments(styleSection(SRC));

const GREETING = '.street-hero.on-brand .street-hero-greeting';
const HINT = '.street-hero.on-brand .street-hero-hint';
const BRAND = '.street-hero.on-brand';

describe('品牌兜底态：问候语墨色', () => {
  it('跟随 --boh-text-primary（暗色会自动翻成 #f5f5f7）', () => {
    const rule = ruleOf(CSS, GREETING);
    expect(rule, `没找到 ${GREETING} 的声明块`).not.toBe('');
    expect(rule).toContain('color: var(--boh-text-primary');
  });

  it('不得出现裸的 color 字面量（回退值只能写在 var() 里）', () => {
    const rule = ruleOf(CSS, GREETING);
    // 去掉 var(...) 之后还残留 color: #xxx 就是硬编码
    const withoutVar = rule.replace(/var\([^)]*\)/g, 'var()');
    expect(withoutVar).not.toMatch(/color:\s*#[0-9a-fA-F]{3,8}/);
  });
});

describe('品牌兜底态：提示语墨色', () => {
  it('从 --boh-text-primary 派生（color-mix），沿用主文字 token 的亮暗翻转', () => {
    const rule = ruleOf(CSS, HINT);
    expect(rule, `没找到 ${HINT} 的声明块`).not.toBe('');
    expect(rule).toMatch(/color:\s*color-mix\(\s*in srgb,\s*var\(--boh-text-primary/);
  });

  it('不得直接用 --boh-text-secondary：它浅色档是 #86868b，白底只有 3.5:1', () => {
    const rule = ruleOf(CSS, HINT);
    expect(rule).not.toContain('--boh-text-secondary');
  });
});

describe('底色与文字必须同源（这条 bug 的根因）', () => {
  it('.on-brand 的底色走 --boh-page-bg', () => {
    const rule = ruleOf(CSS, BRAND);
    expect(rule).toContain('background-color: var(--boh-page-bg');
  });

  it('底色与文字引用的都是 --boh-* token，不会一边翻一边不翻', () => {
    const bg = ruleOf(CSS, BRAND);
    const ink = ruleOf(CSS, GREETING);
    expect(bg).toMatch(/var\(--boh-page-bg/);
    expect(ink).toMatch(/var\(--boh-text-primary/);
  });
});

describe('规则提取器自身的反证（防止断言因取不到规则而假绿）', () => {
  it('裸色写法能被抓到', () => {
    const fake =
      '.street-hero.on-brand .street-hero-greeting { color: #17130e; text-shadow: none; }';
    const rule = ruleOf(fake, GREETING);
    expect(rule).not.toBe('');
    expect(rule).not.toContain('var(--boh-text-primary');
    expect(rule.replace(/var\([^)]*\)/g, 'var()')).toMatch(/color:\s*#17130e/);
  });

  it('注释里的裸色不算数（必须剥注释后再断言）', () => {
    const fake = `/* 原来是 color: #17130e */
      .street-hero.on-brand .street-hero-greeting { color: var(--boh-text-primary, #17130e); }`;
    const rule = ruleOf(stripCssComments(fake), GREETING);
    expect(rule).toContain('var(--boh-text-primary');
  });
});
