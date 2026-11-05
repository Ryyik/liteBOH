/**
 * 编辑器滤镜单测（v2 胶片模拟，2026-11-05）。
 *
 * 判据三件事：
 *  1. 同一份 settings 永远拼出**同一根串**（预览 CSS 与导出 ctx.filter 共用它，
 *     顺序一变就会出现「预览是暖调、导出是冷调」这种不可复现的偏差）；
 *  2. **强度 0 必须严格等于原图** —— 滑块拖到底还留一层颗粒/暗角，用户会以为坏了；
 *  3. 物理层（颗粒/暗角/泛光/漏光）随强度线性缩放，且数值全部落在合法区间。
 */
import { describe, expect, it } from 'vitest';
import {
  IMAGE_EDITOR_FILTERS,
  buildFilterString,
  getEditorFilter,
  getEditorFilterString,
  isDefaultFilterTune,
  normalizeFilterTune,
  resolveFilterLook,
} from '@/utils/image-editor-filters.js';

describe('buildFilterString', () => {
  it('空设置返回 none（不是空串 —— 空串在部分浏览器里是非法值）', () => {
    expect(buildFilterString({})).toBe('none');
    expect(buildFilterString()).toBe('none');
    expect(buildFilterString(null)).toBe('none');
  });

  it('函数顺序固定（与设置里写的顺序无关）', () => {
    const a = buildFilterString({ sepia: 0.3, brightness: 1.1, contrast: 1.2 });
    const b = buildFilterString({ contrast: 1.2, sepia: 0.3, brightness: 1.1 });
    expect(a).toBe('brightness(1.1) contrast(1.2) sepia(0.3)');
    expect(b).toBe(a);
  });

  it('hue-rotate 带 deg、blur 带 px，其余裸数值', () => {
    expect(buildFilterString({ 'hue-rotate': -25, blur: 2, grayscale: 1 })).toBe(
      'blur(2px) grayscale(1) hue-rotate(-25deg)',
    );
  });

  it('恒等值不输出（contrast(1) 是空操作，留着会污染「强度 0 = 原图」的判定）', () => {
    expect(buildFilterString({ contrast: 1, brightness: 1, saturate: 1 })).toBe('none');
    expect(buildFilterString({ grayscale: 0, saturate: 1.2 })).toBe('saturate(1.2)');
  });

  it('非法数值被忽略，不产生 NaN 片段', () => {
    expect(buildFilterString({ brightness: 'abc', contrast: 1.1 })).toBe('contrast(1.1)');
    expect(buildFilterString({ brightness: Number.NaN })).toBe('none');
  });
});

describe('预设表', () => {
  it('12 档、id 唯一、首档是原图', () => {
    expect(IMAGE_EDITOR_FILTERS).toHaveLength(12);
    expect(new Set(IMAGE_EDITOR_FILTERS.map((item) => item.id)).size).toBe(12);
    expect(IMAGE_EDITOR_FILTERS[0].id).toBe('none');
  });

  /**
   * 染色层（cast）是「一眼看出是哪卷」的那一层，而混合模式决定它是否成立：
   * soft-light 配亮色只会提亮（实测 Kodak Gold 亮度 134→155、饱和度 0.54→0.37，
   * 观感是加了一层雾）；overlay 才真正改色相。这条断言防的是「层被删掉」或
   * 「混合模式被改回去」两种回归。
   */
  it('每档都有 cast 染色层，且用 overlay（soft-light 只会提亮不加色）', () => {
    for (const preset of IMAGE_EDITOR_FILTERS.slice(1)) {
      const look = resolveFilterLook(preset.id, 1);
      expect(look.cast.opacity, preset.id).toBeGreaterThan(0);
      expect(look.cast.color, preset.id).not.toBe('transparent');
      expect(look.cast.blend, preset.id).toBe('overlay');
    }
  });

  it('阴影染色走 multiply（胶片暗部是被染料压暗，不是被抬亮）', () => {
    for (const preset of IMAGE_EDITOR_FILTERS.slice(1)) {
      const look = resolveFilterLook(preset.id, 1);
      expect(look.shadow.blend, preset.id).toBe('multiply');
    }
  });

  it('除原图外每档都至少有一层真的会改变画面（调色或物理层）', () => {
    for (const preset of IMAGE_EDITOR_FILTERS.slice(1)) {
      const look = resolveFilterLook(preset.id, 1);
      const hasGrade = look.css !== 'none';
      const hasLayer =
        look.lift > 0 ||
        look.shadow.opacity > 0 ||
        look.highlight.opacity > 0 ||
        look.halation.opacity > 0 ||
        look.grain.opacity > 0 ||
        look.vignette > 0 ||
        look.leak.opacity > 0;
      expect(hasGrade || hasLayer, preset.id).toBe(true);
    }
  });

  it('每档都有中文标签与色卡（UI 缺任一项会出现空 chip）', () => {
    for (const preset of IMAGE_EDITOR_FILTERS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.swatch.length).toBeGreaterThan(0);
    }
  });

  it('未知 id 回落原图（脏数据不该把画面变成黑块）', () => {
    expect(getEditorFilter('不存在的滤镜').id).toBe('none');
    expect(getEditorFilterString('不存在的滤镜')).toBe('none');
    expect(getEditorFilterString(undefined)).toBe('none');
  });
});

describe('resolveFilterLook', () => {
  it('强度 0 等于原图：调色 none、物理层全部归零', () => {
    for (const preset of IMAGE_EDITOR_FILTERS) {
      const look = resolveFilterLook(preset.id, 0);
      expect(look.css, preset.id).toBe('none');
      expect(look.lift, preset.id).toBe(0);
      expect(look.vignette, preset.id).toBe(0);
      expect(look.shadow.opacity, preset.id).toBe(0);
      expect(look.highlight.opacity, preset.id).toBe(0);
      expect(look.halation.opacity, preset.id).toBe(0);
      expect(look.grain.opacity, preset.id).toBe(0);
      expect(look.leak.opacity, preset.id).toBe(0);
    }
  });

  it('强度 50% 的调色落在「恒等值 → 目标值」的中点', () => {
    const preset = IMAGE_EDITOR_FILTERS.find((item) => item.id === 'mono');
    const full = resolveFilterLook('mono', 1);
    const half = resolveFilterLook('mono', 0.5);
    const mid = (target) => (1 + target) / 2;
    expect(full.css).toContain('grayscale(1)');
    expect(half.css).toContain(`brightness(${mid(preset.grade.brightness)})`);
    expect(half.css).toContain(`contrast(${mid(preset.grade.contrast)})`);
    expect(half.css).toContain('grayscale(0.5)');
  });

  it('物理层随强度线性缩放，且暗角/不透明度不超过 1', () => {
    const full = resolveFilterLook('disposable', 1);
    const half = resolveFilterLook('disposable', 0.5);
    expect(half.vignette).toBeCloseTo(full.vignette / 2, 5);
    expect(half.grain.opacity).toBeCloseTo(full.grain.opacity / 2, 5);
    expect(half.leak.opacity).toBeCloseTo(full.leak.opacity / 2, 5);
    for (const preset of IMAGE_EDITOR_FILTERS) {
      const look = resolveFilterLook(preset.id, 1);
      expect(look.vignette).toBeLessThanOrEqual(1);
      expect(look.grain.opacity).toBeLessThanOrEqual(1);
      expect(look.halation.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('强度非法值按 100% 处理（滑块的 NaN 不该把画面清零）', () => {
    expect(resolveFilterLook('portra', Number.NaN).strength).toBe(1);
    expect(resolveFilterLook('portra', 3).strength).toBe(1);
    expect(resolveFilterLook('portra', -2).strength).toBe(0);
  });

  it('颗粒粗细与漏光坐标原样透传（渲染层靠它定位）', () => {
    const look = resolveFilterLook('vista', 1);
    expect(look.grain.scale).toBeGreaterThan(0);
    expect(look.leak.x).toBeGreaterThanOrEqual(0);
    expect(look.leak.x).toBeLessThanOrEqual(1);
    expect(look.leak.y).toBeGreaterThanOrEqual(0);
    expect(look.leak.y).toBeLessThanOrEqual(1);
  });
});

/**
 * 微调（v3，用户口径「还想自己调颗粒质感」）。
 *
 * 这一层最容易出的两个错：
 *  1. 倍率乘错位置 —— 微调是「在强度缩放之后再乘」，先乘再缩放会让
 *     强度 0 也留下颗粒（用户拖回 0 却发现画面还在抖）；
 *  2. 没有上限 —— 暗角×2 直接黑角、褪色×2 整幅发白。
 */
describe('微调（tune）', () => {
  it('默认值全为 1，脏数据回落 1，超上限被夹住', () => {
    expect(normalizeFilterTune()).toEqual({ grain: 1, vignette: 1, halation: 1, cast: 1, lift: 1 });
    expect(normalizeFilterTune({ grain: 'abc', vignette: -3, halation: 99 })).toMatchObject({
      grain: 1,
      vignette: 0,
      halation: 2,
    });
  });

  it('isDefaultFilterTune 只在五项都为 1 时为真（UI 靠它显示「已改」）', () => {
    expect(isDefaultFilterTune({})).toBe(true);
    expect(isDefaultFilterTune({ grain: 1.4 })).toBe(false);
  });

  it('颗粒倍率真的作用在 opacity 上，且被上限夹住', () => {
    const base = resolveFilterLook('gold', 1, { grain: 1 });
    const more = resolveFilterLook('gold', 1, { grain: 1.5 });
    expect(more.grain.opacity).toBeCloseTo(Math.min(1, base.grain.opacity * 1.5), 5);
    // 倍率不设上限的话，暗角与颗粒会先撞到 1（再高就不是胶片而是噪声/黑角）
    expect(resolveFilterLook('mono', 1, { grain: 1.6 }).grain.opacity).toBeLessThanOrEqual(1);
    expect(resolveFilterLook('disposable', 1, { vignette: 2 }).vignette).toBeLessThanOrEqual(0.92);
  });

  it('微调是「先强度、后倍率」：强度 0 时任何微调都不该留下痕迹', () => {
    const look = resolveFilterLook('gold', 0, { grain: 2, vignette: 2, halation: 2, cast: 2 });
    expect(look.grain.opacity).toBe(0);
    expect(look.vignette).toBe(0);
    expect(look.halation.opacity).toBe(0);
    expect(look.cast.opacity).toBe(0);
  });

  it('五项各自独立：调颗粒不动暗角与染色', () => {
    const base = resolveFilterLook('gold', 1);
    const onlyGrain = resolveFilterLook('gold', 1, { grain: 1.8 });
    expect(onlyGrain.vignette).toBeCloseTo(base.vignette, 6);
    expect(onlyGrain.cast.opacity).toBeCloseTo(base.cast.opacity, 6);
    expect(onlyGrain.grain.opacity).toBeGreaterThan(base.grain.opacity);
  });

  it('褪色（lift）有硬上限 0.22：×2 也不会把画面洗白', () => {
    expect(resolveFilterLook('mono', 1, { lift: 2 }).lift).toBeLessThanOrEqual(0.22);
  });

  it('resolveFilterLook 把 tune 原样带出来（渲染层与 UI 读同一份）', () => {
    expect(resolveFilterLook('gold', 1, { grain: 1.25 }).tune.grain).toBe(1.25);
  });
});
