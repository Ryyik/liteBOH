import { describe, expect, it } from 'vitest';

import {
  PIXEL_H,
  PIXEL_W,
  buildTreeSceneSvg,
} from '../../src/views/ChristmasGiftTree/data/tree-pixels.js';

describe('christmas tree pixel scene', () => {
  it('produces a deterministic picture for the same seed', () => {
    // 像素画是"手调"出来的：同一个种子必须画出完全一样的每一格，
    // 否则每次进页面树的纹理都在变，改色改形都无从对比
    expect(buildTreeSceneSvg({ seed: 42 })).toBe(buildTreeSceneSvg({ seed: 42 }));
    expect(buildTreeSceneSvg({ seed: 42 })).not.toBe(buildTreeSceneSvg({ seed: 43 }));
  });

  it('emits a well-formed svg with the declared canvas size', () => {
    const svg = buildTreeSceneSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${PIXEL_W} ${PIXEL_H}"`);
    // 像素边缘必须是硬边，不能靠抗锯齿糊过去
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('never emits script, event handlers, or external references', () => {
    const svg = buildTreeSceneSvg();
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+=/i);
    // xmlns 是 SVG 命名空间，不算外链；真正要防的是 href / url() 引用外部资源
    expect(svg).not.toMatch(/(?:xlink:)?href\s*=/i);
    expect(svg).not.toMatch(/url\(\s*['"]?https?:/i);
  });

  it('keeps the node count within the budget a phone can paint', () => {
    // 万圣节场景踩过：逐格铺光晕生成过 6.9 万个 rect，首屏直接卡住
    const nodes = (buildTreeSceneSvg().match(/<rect /g) || []).length;
    expect(nodes).toBeGreaterThan(600);
    expect(nodes).toBeLessThan(4000);
  });

  it('draws the tree inside the canvas and leaves room for the star', () => {
    const svg = buildTreeSceneSvg();
    const xs = [...svg.matchAll(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      w: Number(m[3]),
    }));
    expect(xs.length).toBeGreaterThan(0);
    // 远景雪丘故意铺到画布外（-20 ~ 120），纵向不能跑出画布
    for (const cell of xs) {
      expect(cell.y).toBeGreaterThanOrEqual(-30);
      expect(cell.y).toBeLessThanOrEqual(PIXEL_H);
    }
  });

  it('animates only via css classes, so still mode can switch it off', () => {
    const svg = buildTreeSceneSvg();
    expect(svg).toContain('class="px-lamp"');
    expect(svg).toContain('class="px-lamp-core"');
    expect(svg).toContain('class="px-tw"');
  });
});
