/**
 * 编辑器滤镜预设单测（2026-11-05）。
 *
 * 判据两件事：
 *  1. 同一份 settings 永远拼出**同一根串**（预览 CSS 与导出 ctx.filter 共用它，
 *     顺序一变就会出现「预览是暖调、导出是冷调」这种不可复现的偏差）；
 *  2. 预设表本身不重复、不空表、未知 id 有兜底。
 */
import { describe, expect, it } from 'vitest';
import {
  IMAGE_EDITOR_FILTERS,
  buildFilterString,
  getEditorFilter,
  getEditorFilterString,
} from '@/views/Forum/composables/image-editor-filters.js';

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

  it('grayscale 为 0 不输出（抵消项不该拼成 grayscale(0) 占位）', () => {
    expect(buildFilterString({ grayscale: 0, saturate: 1.2 })).toBe('saturate(1.2)');
  });

  it('非法数值被忽略，不产生 NaN 片段', () => {
    expect(buildFilterString({ brightness: 'abc', contrast: 1.1 })).toBe('contrast(1.1)');
    expect(buildFilterString({ brightness: Number.NaN })).toBe('none');
  });
});

describe('预设表', () => {
  it('九档、id 唯一、首档是原图', () => {
    expect(IMAGE_EDITOR_FILTERS).toHaveLength(9);
    expect(new Set(IMAGE_EDITOR_FILTERS.map((item) => item.id)).size).toBe(9);
    expect(IMAGE_EDITOR_FILTERS[0].id).toBe('none');
  });

  it('除原图外每档都真的会改变画面', () => {
    for (const preset of IMAGE_EDITOR_FILTERS.slice(1)) {
      expect(buildFilterString(preset.settings)).not.toBe('none');
    }
  });

  it('未知 id 回落原图（脏数据不该把画面变成黑块）', () => {
    expect(getEditorFilter('不存在的滤镜').id).toBe('none');
    expect(getEditorFilterString('不存在的滤镜')).toBe('none');
    expect(getEditorFilterString(undefined)).toBe('none');
  });

  it('每个预设都有中文标签与色卡（UI 缺任一项会出现空 chip）', () => {
    for (const preset of IMAGE_EDITOR_FILTERS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.swatch.length).toBeGreaterThan(0);
    }
  });
});
