/**
 * useImageEditorDoc 单测 —— 编辑器命令栈纯逻辑（发帖图片编辑 P0）。
 * 判据：node --test 不适用，统一走 vitest（见根 vitest.config.js）。
 */
import { describe, expect, it } from 'vitest';
import {
  IMAGE_EDITOR_MAX_COMMANDS,
  clampNormalizedRect,
  deriveEditorOutputSize,
  isFullRect,
  isValidEditorCommand,
  useImageEditorDoc,
} from '@/views/Forum/composables/useImageEditorDoc.js';

describe('clampNormalizedRect', () => {
  it('合法矩形原样通过', () => {
    expect(clampNormalizedRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
  });

  it('越界截断：x + width 超出 1 时收到右边界', () => {
    const rect = clampNormalizedRect({ x: 0.8, y: 0, width: 0.5, height: 1 });
    expect(rect.x).toBe(0.8);
    expect(rect.width).toBeCloseTo(0.2, 10);
  });

  it('非法数字归零而不是 NaN 传染', () => {
    const rect = clampNormalizedRect({ x: 'abc', y: NaN, width: -1, height: undefined });
    expect(rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('接受 left/top 别名（cropper 坐标系转换用）', () => {
    const rect = clampNormalizedRect({ left: 0.2, top: 0.3, width: 0.1, height: 0.1 });
    expect(rect.x).toBe(0.2);
    expect(rect.y).toBe(0.3);
  });

  it('空入参给全零矩形', () => {
    expect(clampNormalizedRect()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('isFullRect', () => {
  it('整幅为 true', () => {
    expect(isFullRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  });

  it('浮点贴边（0.9995）仍算整幅', () => {
    expect(isFullRect({ x: 0, y: 0, width: 0.9995, height: 1 })).toBe(true);
  });

  it('裁过为 false', () => {
    expect(isFullRect({ x: 0, y: 0, width: 0.9, height: 1 })).toBe(false);
    expect(isFullRect({ x: 0.1, y: 0, width: 0.9, height: 1 })).toBe(false);
  });
});

describe('deriveEditorOutputSize', () => {
  it('空命令 = 原尺寸', () => {
    expect(deriveEditorOutputSize([], 4000, 3000)).toEqual({ width: 4000, height: 3000 });
  });

  it('rotate 交换宽高（一次）', () => {
    expect(deriveEditorOutputSize([{ type: 'rotate' }], 4000, 3000)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it('rotate ×4 回到原尺寸', () => {
    const commands = Array.from({ length: 4 }, () => ({ type: 'rotate' }));
    expect(deriveEditorOutputSize(commands, 4000, 3000)).toEqual({ width: 4000, height: 3000 });
  });

  it('flip 不改尺寸', () => {
    expect(deriveEditorOutputSize([{ type: 'flip' }], 4000, 3000)).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('crop 按归一化比例缩尺寸（相对当前态）', () => {
    expect(deriveEditorOutputSize([{ type: 'crop', rect: { x: 0, y: 0, width: 0.5, height: 1 } }], 4000, 3000)).toEqual(
      { width: 2000, height: 3000 },
    );
  });

  it('rotate 后 crop 相对旋转后的尺寸', () => {
    const commands = [
      { type: 'rotate' },
      { type: 'crop', rect: { x: 0, y: 0, width: 0.5, height: 1 } },
    ];
    // 4000x3000 → 旋转 3000x4000 → 裁半宽 → 1500x4000
    expect(deriveEditorOutputSize(commands, 4000, 3000)).toEqual({ width: 1500, height: 4000 });
  });

  it('crop 出 0 尺寸时保底 1px（canvas 不允许 0）', () => {
    const size = deriveEditorOutputSize([{ type: 'crop', rect: { x: 0, y: 0, width: 0.0001, height: 0.0001 } }], 100, 100);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it('畸形命令被跳过', () => {
    expect(deriveEditorOutputSize([null, {}, { type: 'unknown' }, 42], 100, 60)).toEqual({
      width: 100,
      height: 60,
    });
  });
});

describe('isValidEditorCommand', () => {
  it('rotate / flip / crop(正矩形) 合法', () => {
    expect(isValidEditorCommand({ type: 'rotate' })).toBe(true);
    expect(isValidEditorCommand({ type: 'flip' })).toBe(true);
    expect(isValidEditorCommand({ type: 'crop', rect: { x: 0, y: 0, width: 0.5, height: 0.5 } })).toBe(true);
  });

  it('零面积 crop / 未知类型 / 空值非法', () => {
    expect(isValidEditorCommand({ type: 'crop', rect: { x: 0, y: 0, width: 0, height: 0 } })).toBe(false);
    expect(isValidEditorCommand({ type: 'crop' })).toBe(false);
    expect(isValidEditorCommand({ type: 'mosaic' })).toBe(false);
    expect(isValidEditorCommand(null)).toBe(false);
  });
});

describe('useImageEditorDoc', () => {
  it('push / undo / reset 基本链路', () => {
    const doc = useImageEditorDoc();
    expect(doc.canUndo.value).toBe(false);
    expect(doc.commandCount.value).toBe(0);

    expect(doc.pushCommand({ type: 'rotate' })).toBe(true);
    expect(doc.pushCommand({ type: 'flip' })).toBe(true);
    expect(doc.canUndo.value).toBe(true);
    expect(doc.commandCount.value).toBe(2);

    const undone = doc.undo();
    expect(undone).toEqual({ type: 'flip' });
    expect(doc.commandCount.value).toBe(1);

    doc.reset();
    expect(doc.commandCount.value).toBe(0);
    expect(doc.undo()).toBeNull();
  });

  it('畸形命令不进栈', () => {
    const doc = useImageEditorDoc();
    expect(doc.pushCommand({ type: 'mosaic' })).toBe(false);
    expect(doc.pushCommand(null)).toBe(false);
    expect(doc.commandCount.value).toBe(0);
  });

  it(`撤销栈上限 ${IMAGE_EDITOR_MAX_COMMANDS}：最旧命令被挤出`, () => {
    const doc = useImageEditorDoc();
    for (let i = 0; i < IMAGE_EDITOR_MAX_COMMANDS + 5; i += 1) {
      doc.pushCommand({ type: 'rotate' });
    }
    expect(doc.commandCount.value).toBe(IMAGE_EDITOR_MAX_COMMANDS);
    // 撤销 30 次后为空，第 31 次返回 null
    for (let i = 0; i < IMAGE_EDITOR_MAX_COMMANDS; i += 1) {
      expect(doc.undo()).toEqual({ type: 'rotate' });
    }
    expect(doc.undo()).toBeNull();
    expect(doc.canUndo.value).toBe(false);
  });

  it('撤销返回命令的完整内容（调用方可做补偿渲染；ref 深层代理会包 Proxy，断言用结构相等）', () => {
    const doc = useImageEditorDoc();
    const crop = { type: 'crop', rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } };
    doc.pushCommand(crop);
    expect(doc.undo()).toEqual(crop);
  });
});
