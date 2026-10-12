import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// BOHAI 补齐的四处「缺桥」动效守卫（2026-10-12，按 .agents/skills/
// find-animation-opportunities 筛出的 4 条采纳项）。
//
// 为什么用源码守卫：这四处都是**纯 CSS/模板接线**，没有可断言的运行时行为
// （node 环境不挂载组件），而它们的失效方式是**静默的** —— 少一个 `-enter-from`
// 类、`<Transition>` 忘了包、`@property` 漏注册，症状都只是「动画没生效」，不报错。
//
// ⚠️ 三条本仓硬约束（断言就在锁它们）：
//   1. **用 `var(--boh-dur-*)`**，不写死毫秒 —— `layout.css` 在 reduce 下把这些令牌
//      归零，写死就等于绕过降级；
//   2. **不新增 `@keyframes`** —— 本仓把「关键帧 3 处 / 无限循环 2 条」当不变量
//      （`boh-search-shimmer` / `boh-search-fade` / `boh-spin`），用 transition 就够；
//   3. `@property` 必须在**非 scoped** 的令牌文件里注册（全局注册，且未注册的自定义
//      属性不可插值 ⇒ `transition: --boh-ring-p` 会空转）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const BOHAI = 'src/views/BOHAI';
const COMPOSER_VUE = `${BOHAI}/BOHAI/components/BohComposer.vue`;
const COMPOSER_CSS = `${BOHAI}/BOHAI/components/styles/boh-composer.css`;
const SIDEBAR_VUE = `${BOHAI}/BOHAI/components/BohSidebar.vue`;
const SIDEBAR_CSS = `${BOHAI}/BOHAI/components/styles/boh-sidebar.css`;
const STREAM_VUE = `${BOHAI}/BOHAI/components/BohChatStream.vue`;
const EMPTY_CSS = `${BOHAI}/BOHAI/components/styles/boh-empty-state.css`;
const TOKENS = `${BOHAI}/BOHAI/styles/tokens.css`;

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(css|vue)$/.test(entry.name)) out.push(full);
  }
  return out;
};

describe('输入区浮层进场（模式 / 工具 / 用量）', () => {
  const vue = read(COMPOSER_VUE);
  const css = squeezeSource(read(COMPOSER_CSS));

  it('三个面板都包了 `<Transition name="boh-pop">`', () => {
    expect((vue.match(/<Transition name="boh-pop">/g) || []).length).toBe(3);
    expect((vue.match(/<\/Transition>/g) || []).length).toBe(3);
  });

  it('进场只动 opacity + 4px 位移，不用 scale（探针 200ms 就量几何）', () => {
    expect(css).toContain(
      '.boh-pop-enter-active, .boh-pop-leave-active { transition: opacity var(--boh-dur-fast) var(--boh-ease), transform var(--boh-dur-fast) var(--boh-ease)',
    );
    expect(css).toContain(
      '.boh-pop-enter-from, .boh-pop-leave-to { opacity: 0; transform: translateY(4px)',
    );
    expect(css).not.toMatch(/\.boh-pop-enter-from[^}]*scale\(/);
  });
});

describe('会话列表项进出与让位', () => {
  const vue = read(SIDEBAR_VUE);
  const css = squeezeSource(read(SIDEBAR_CSS));

  it('列表项包了 `<TransitionGroup>`，且**不写 tag**（Fragment ⇒ 零额外 DOM）', () => {
    expect(vue).toContain('<TransitionGroup name="boh-sb">');
    expect(vue).toContain('</TransitionGroup>');
    expect(vue).not.toMatch(/<TransitionGroup[^>]*\stag=/);
  });

  it('enter 与 move 都在（move 才是「跳变」的主因）', () => {
    expect(css).toContain('.boh-sb-enter-active { transition: opacity var(--boh-dur-fast)');
    expect(css).toContain('.boh-sb-enter-from { opacity: 0; transform: translateY(-6px)');
    expect(css).toContain('.boh-sb-move { transition: transform var(--boh-dur-med)');
  });

  it('**刻意不做 leave**（脱流会让滚动容器跳一下）', () => {
    expect(css).not.toContain('.boh-sb-leave-active');
    expect(css).not.toContain('.boh-sb-leave-to');
  });
});

describe('空态一次性进场', () => {
  const vue = read(STREAM_VUE);
  const css = squeezeSource(read(EMPTY_CSS));

  it('空态包了 `<Transition name="boh-empty">`', () => {
    expect(vue).toContain('<Transition name="boh-empty">');
    expect(vue).toContain('</Transition>');
  });

  it('只做 enter —— leave 会与壳的 FLIP 打架（退场保持瞬隐）', () => {
    expect(css).toContain('.boh-empty-enter-active');
    expect(css).toContain('.boh-empty-enter-from');
    expect(css).not.toContain('.boh-empty-leave-active');
    expect(css).not.toContain('.boh-empty-leave-to');
  });
});

describe('用量环进度过渡', () => {
  it('`--boh-ring-p` 在非 scoped 的令牌文件里注册成 `<number>`', () => {
    const tokens = read(TOKENS);
    expect(tokens).toMatch(/@property\s+--boh-ring-p\s*\{[^}]*syntax:\s*'<number>'/);
    expect(tokens).toMatch(/@property\s+--boh-ring-p\s*\{[^}]*initial-value:\s*0/);
  });

  it('环自己挂了该属性的 transition（不注册就空转）', () => {
    expect(squeezeSource(read(COMPOSER_CSS))).toContain(
      'transition: --boh-ring-p var(--boh-dur-med) var(--boh-ease)',
    );
  });
});

describe('两条硬约束（改这四处时别踩）', () => {
  it('时长一律走 `--boh-dur-*` 令牌，没有写死毫秒', () => {
    for (const file of [COMPOSER_CSS, SIDEBAR_CSS, EMPTY_CSS]) {
      const css = read(file);
      // 只查这四组新类的块（`transition:` 后面跟裸毫秒 = 绕过 reduce 降级）
      for (const name of ['boh-pop', 'boh-sb', 'boh-empty']) {
        const re = new RegExp(`\\.${name}-(?:enter|leave)-active\\s*\\{[^}]*\\}`, 'g');
        for (const block of css.match(re) || []) {
          expect(block).toContain('var(--boh-dur-');
          expect(block).not.toMatch(/transition:[^;]*\d+m?s/);
        }
      }
    }
  });

  it('⭐ 关键帧不变量：BOHAI 仍是 3 处（新增动画请用 transition）', () => {
    const total = walk(BOHAI).reduce(
      (sum, file) => sum + (read(file).match(/@keyframes\s/g) || []).length,
      0,
    );
    expect(total).toBe(3);
  });
});
