/**
 * glass-pill-refract.test.js — GlassPillButton 材质守卫（2026-10-15，§21.14 线 2 评估结论）
 *
 * ⭐ 结论：**维持模糊级，禁盲目升折射**。2026-10-15 曾按 §21.8 线 2 候选实施过一轮
 *   「锚 + BohGlassRefract」升级并跑了运行时实测，随即回退 —— 实测证据：
 *   `.glass-pill-anchor.toolbar-hero-pill` 的采样祖先链上有
 *   `forum-toolbar z=5`（工具栏自身堆叠上下文，页面背板在子树之外）⇒
 *   折射采样被裁空；而它的另外两个宿主同样不满足：
 *   · AccountBindPrompt —— 胶囊在被调用方 `.liquid-glass` 卡片（backdrop-filter +
 *     contain:paint）之内，背板被裁成卡片自身；
 *   · PostComposer —— 胶囊底下是发帖器面板自身实底，无内容可透。
 *   §21.6 口径（底下有可透内容才做玻璃）在宿主层面筛掉了全部三个。
 *   且升折射会把 0.62 白底降成 0.1 白膜（可读性回退）—— 双重负收益。
 *
 * 本文件锁住「维持模糊级」这个结论：谁再想升折射，先推翻这里的实测依据。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');
const src = read('src/components/ui/GlassPillButton.vue');
const styleStripped = src.slice(src.indexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('GlassPillButton 材质守卫（维持模糊级）', () => {
  it('按钮本体保留 CSS 模糊（--liquid-filter-sm）—— 三宿主采样链实测均被裁，折射无收益', () => {
    expect(styleStripped).toMatch(/[{;]\s*backdrop-filter\s*:\s*var\(--liquid-filter-sm\)/);
  });

  it('不得引入折射级组件（宿主链澄清前，升折射 = 第二材质源 + 可读性回退）', () => {
    expect(src).not.toContain('BohGlassRefract');
  });
});
