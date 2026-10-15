/**
 * messages-glass-surfaces.test.js — 锁「消息中心液态玻璃接线」（2026-10-15）
 *
 * 口径（对齐 docs/2026-10-14-液玻交接-给下一个AI.md 与 未完成任务清单 §21.11）：
 *   · 上玻璃（采样祖先链干净或 filter 挂自身）：sticky 页头（.x-header / .x-header-minimal，
 *     自身的堆叠上下文不裁自身的 backdrop-filter）、玻璃列表 .x-inbox-list、
 *     详情抽屉 .x-detail-panel 及其子面（drawer-header / detail-user-card / source-content /
 *     reply-input-section / notification-actions）、悬浮胶囊 .x-select-action-bar；
 *   · **不上**：sticky 页头的**子树**（芯片 / 分段 / 两下拉 / 操作钮）—— 页头是
 *     sticky + z-index + translateZ 的堆叠上下文，子代 backdrop-filter 必被裁空
 *     （§21.11 实测 on=off）⇒ 一律实底 token；
 *   · 面板链：.x-detail-panel 不得保留 will-change / translateZ / 动画残留 transform
 *     （会把整条子代玻璃裁死），入场 keyframes 收尾必须是 transform: none；
 *   · 材质零字面量：blur 只引 --liquid-filter*（check:liquid-glass 单源）；
 *   · 暗色：messages-dark.css 不再覆盖面板底色（token 自动翻转），只留语义色。
 *
 * ⚠️ 断言前必须剥掉 CSS 注释：源码注释里会合法地复述「will-change / translateX(0) /
 *    .x-inbox-list 实底已删」这类词——不剥就是成批假红（2026-10-15 首跑 5 连假红实录；
 *    同类教训见 tests/helpers/source.js 文件头的 prettier 三连挂档案）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');
const SCOPED = 'src/views/user-center/Messages/style.scoped.css';
const DARK = 'src/styles/themes/messages-dark.css';

/** 剥 CSS 块注释（本仓 CSS 无字符串内 `/*`，逐字安全；再过 squeezeSource 归一空白） */
const stripCssComments = (text) => String(text).replace(/\/\*[\s\S]*?\*\//g, ' ');
const prep = (rel) => squeezeSource(stripCssComments(read(rel)));

const css = prep(SCOPED);
const dark = prep(DARK);

/** 取某选择器**所有**规则体的并集（同名规则常有多条：布局条 + 材质条各一条；
 *  只看首条会漏掉后面的材质条 —— 2026-10-15 首跑实测咬过 .x-quick-btn /
 *  .notification-actions，负向断言也因此可能漏检）。 */
const ruleOf = (source, selector) => {
  const re = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`, 'g');
  return [...source.matchAll(re)].map((m) => m[0]).join('\n');
};

/* sticky 页头子树内的控件：玻璃必被采样裁空 ⇒ 实底 token */
const HEADER_CHILDREN = [
  '.x-mark-all-btn',
  '.x-mark-all-btn-minimal',
  '.x-filter-chip',
  '.x-select-btn',
  '.x-select-status-filter',
  '.x-filter-dropdown',
  '.x-select-actions-menu',
];

/* 详情面板内的玻璃子面：面板链修活后必须保持玻璃 */
const DETAIL_GLASS_FACES = [
  '.drawer-header',
  '.detail-user-card',
  '.source-content',
  '.reply-input-section',
  '.notification-actions',
];

describe('消息中心液态玻璃：页头', () => {
  it('独立页 .x-header 自身玻璃有效（token 材质，几何不动）', () => {
    const rule = ruleOf(css, '.x-header');
    expect(rule).toContain('backdrop-filter: var(--liquid-filter-sm)');
    expect(rule).toContain('background: var(--liquid-bg)');
    expect(rule).toContain('border-bottom: 1px solid var(--liquid-border)');
    expect(rule).toContain('box-shadow: var(--liquid-shadow-sm)');
    expect(rule).toContain('position: sticky');
    expect(rule).toContain('z-index: 100');
    // 旧的亮色字面量不回来
    expect(rule).not.toContain('rgba(248, 249, 250');
  });

  it('minimal 页头 .x-header-minimal 同口径玻璃化（旧的显式 none 已废除）', () => {
    const rule = ruleOf(css, '.x-header-minimal');
    expect(rule).toContain('backdrop-filter: var(--liquid-filter-sm)');
    expect(rule).not.toMatch(/backdrop-filter:\s*none/);
    expect(rule).toContain('background: var(--liquid-bg)');
    // 几何零变化承诺：页头高度被 metrics 实测在案，不许加 border/padding
    expect(rule).toContain('border: 0');
  });

  it('⭐ 页头子树零 backdrop-filter（§21.11：sticky 堆叠上下文裁空子代采样）', () => {
    for (const sel of HEADER_CHILDREN) {
      const rule = ruleOf(css, sel);
      expect(rule, `${sel} 规则存在`).not.toBe('');
      expect(rule, `${sel} 子代玻璃必死，不许声明`).not.toMatch(/backdrop-filter\s*:/);
    }
  });

  it('页头子树实底收敛到 --liquid-bg-* token（暗色自动翻转，不再白块）', () => {
    expect(ruleOf(css, '.x-filter-chip')).toContain('background: var(--liquid-bg-strong)');
    expect(ruleOf(css, '.x-select-btn')).toContain('background: var(--liquid-bg-strong)');
    expect(ruleOf(css, '.x-mark-all-btn-minimal')).toContain('background: var(--liquid-bg-strong)');
    expect(ruleOf(css, '.x-select-status-filter')).toContain('background: var(--liquid-bg-subtle)');
    expect(ruleOf(css, '.x-select-actions-menu')).toContain('background: var(--liquid-bg-strong)');
    expect(ruleOf(css, '.x-filter-dropdown')).toContain('background: var(--liquid-bg-strong)');
  });

  it('页头内控件暗色可读性：messages-dark.css 只补文字 token，不再覆盖面板底色', () => {
    expect(dark).toContain('color: var(--liquid-text-secondary)');
    expect(dark).not.toMatch(/\.x-header\s*\{[^}]*background/);
    expect(dark).not.toMatch(/\.x-header-minimal\s*\{[^}]*background/);
  });
});

describe('消息中心液态玻璃：列表面板', () => {
  it('.x-inbox-list 保持玻璃（token 四件套）', () => {
    const rule = ruleOf(css, '.x-inbox-list');
    expect(rule).toContain('backdrop-filter: var(--liquid-filter)');
    expect(rule).toContain('background: var(--liquid-bg)');
    expect(rule).toContain('border: 1px solid var(--liquid-border)');
  });

  it('列表内嵌件 .x-quick-btn 实底（嵌套在玻璃列表里，blur 只会采到列表自身）', () => {
    const rule = ruleOf(css, '.x-quick-btn');
    expect(rule).not.toMatch(/backdrop-filter\s*:/);
    expect(rule).toContain('background: var(--liquid-bg-strong)');
  });

  it('悬浮胶囊 .x-select-action-bar 保留 token 玻璃（fixed 自身，祖先链干净）', () => {
    const rule = ruleOf(css, '.x-select-action-bar');
    expect(rule).toContain('backdrop-filter: var(--liquid-filter-sm)');
    expect(rule).toContain('background: var(--liquid-bg-strong');
  });
});

describe('消息中心液态玻璃：详情抽屉链修活', () => {
  it('⭐ .x-detail-panel 不再建常驻合成层（will-change / translateZ 全撤）', () => {
    const rule = ruleOf(css, '.x-detail-panel');
    expect(rule).not.toContain('will-change');
    expect(rule).not.toContain('translateZ');
    expect(rule).toContain('background: var(--liquid-bg-strong)');
  });

  it('入场 keyframes 收尾 transform: none（fill-mode: both 会把残留 transform 永久留下）', () => {
    const i = css.indexOf('@keyframes message-drawer-in');
    expect(i).toBeGreaterThanOrEqual(0);
    const block = css.slice(i, i + 300);
    expect(block).toContain('transform: none');
    expect(block).not.toContain('translateX(0)');
  });

  it('⭐ 详情子面保持玻璃（面板链修活后它们才真的糊得动）', () => {
    for (const sel of DETAIL_GLASS_FACES) {
      const rule = ruleOf(css, sel);
      expect(rule, `${sel} 规则存在`).not.toBe('');
      expect(rule, `${sel} 应有玻璃`).toMatch(/backdrop-filter:\s*var\(--liquid-filter/);
      expect(rule, `${sel} 底色应走 token`).toMatch(/background:\s*var\(--liquid-bg/);
    }
  });
});

describe('消息中心液态玻璃：材质单源与暗色清障', () => {
  it('全文件 blur 材质零字面量（只能引 --liquid-filter*；check:liquid-glass 的本仓加严版）', () => {
    expect(css).not.toMatch(/backdrop-filter:\s*blur\(/);
  });

  it('messages-dark.css 不再覆盖玻璃面板底色（token 自动翻转；旧 #1e1e2a 实底已删）', () => {
    expect(dark).not.toMatch(/\.x-inbox-list[^{]*\{[^}]*background/);
    expect(dark).not.toMatch(/\.x-item\s*\{[^}]*background/);
    expect(dark).not.toMatch(/\.x-item:hover\s*\{[^}]*background/);
    expect(dark).not.toMatch(/\.x-inbox-list[^{]*\{[^}]*border-color/);
    for (const sel of DETAIL_GLASS_FACES) {
      expect(dark, `${sel} 暗色实底应已让位`).not.toMatch(
        new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{[^}]*background`),
      );
    }
  });

  it('暗色语义色保留（未读/类型徽章/骨架屏不被误伤）', () => {
    expect(dark).toMatch(/\.x-unread-dot\s*\{[^}]*background/);
    expect(dark).toMatch(/\.x-skeleton-item[^{]*\{[^}]*background/);
    expect(dark).toMatch(/\.x-sender-name/);
  });
});
