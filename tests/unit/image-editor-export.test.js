/**
 * image-editor-export 单测 —— 位图管线（发帖图片编辑 P0）。
 *
 * node 环境没有 canvas：用 stubGlobal 伪造 document.createElement('canvas') /
 * createImageBitmap / URL，只断言**管线逻辑**（尺寸换算、变换调用序列、导出
 * 编码参数），不断言像素内容（那是浏览器探针 probe-image-editor 的职责）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_EDITOR_EXPORT_MAX_DIMENSION,
  IMAGE_EDITOR_EXPORT_QUALITY,
  IMAGE_EDITOR_WORKING_MAX_DIMENSION,
  buildEditedFileName,
  canvasToObjectUrl,
  computeExportDimensions,
  computeWorkingDimensions,
  createWorkingSource,
  exportCanvasToJpegFile,
  renderDocToCanvas,
} from '@/utils/image-editor-export.js';

/** 伪造 canvas：记录 2d 调用序列，尺寸可读写，toBlob 可编程。 */
function createFakeCanvasFactory() {
  const canvases = [];
  const factory = vi.fn((width, height) => {
    const calls = [];
    const ctx = {
      __calls: calls,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      translate: (...args) => calls.push(['translate', ...args]),
      rotate: (...args) => calls.push(['rotate', ...args]),
      scale: (...args) => calls.push(['scale', ...args]),
      drawImage: (...args) => calls.push(['drawImage', ...args]),
    };
    const canvas = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      __calls: calls,
      getContext: vi.fn(() => ctx),
      toBlob: vi.fn((callback, type, quality) => {
        callback(new Blob(['fake-jpeg'], { type: type || 'image/jpeg' }));
      }),
    };
    canvases.push(canvas);
    return canvas;
  });
  return { factory, canvases };
}

describe('computeExportDimensions / computeWorkingDimensions', () => {
  it('未超限原样返回且不标记 scaled', () => {
    expect(computeExportDimensions(1200, 800, 1600)).toEqual({ width: 1200, height: 800, scaled: false });
  });

  it('超限等比压到上限（宽为最长边）', () => {
    const result = computeExportDimensions(4000, 2000, 1600);
    expect(result.scaled).toBe(true);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
  });

  it('超限等比压到上限（高为最长边）', () => {
    const result = computeExportDimensions(1500, 3000, 1600);
    expect(result.scaled).toBe(true);
    expect(result.width).toBe(800);
    expect(result.height).toBe(1600);
  });

  it('工作位图档位 = 2560', () => {
    const result = computeWorkingDimensions(3000, 1000, IMAGE_EDITOR_WORKING_MAX_DIMENSION);
    expect(result.width).toBe(IMAGE_EDITOR_WORKING_MAX_DIMENSION);
    expect(result.height).toBe(Math.round((1000 * IMAGE_EDITOR_WORKING_MAX_DIMENSION) / 3000));
  });

  it('零尺寸不炸', () => {
    expect(computeExportDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0, scaled: false });
  });
});

describe('buildEditedFileName', () => {
  it('保留 basename 并标 -edited.jpg', () => {
    expect(buildEditedFileName('IMG_2048.HEIC')).toBe('IMG_2048-edited.jpg');
    expect(buildEditedFileName('photo.png')).toBe('photo-edited.jpg');
  });

  it('无名 / 路径式名兜底', () => {
    expect(buildEditedFileName('')).toBe('image-edited.jpg');
    expect(buildEditedFileName()).toBe('image-edited.jpg');
  });
});

describe('renderDocToCanvas', () => {
  let restore;
  beforeEach(() => {
    const { factory } = createFakeCanvasFactory();
    restore = vi.stubGlobal('document', { createElement: () => factory() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const makeSource = (width, height) => ({ width, height, __source: true });

  it('空命令返回原画布（不复制）', () => {
    const source = makeSource(100, 50);
    expect(renderDocToCanvas(source, [])).toBe(source);
    expect(renderDocToCanvas(source)).toBe(source);
  });

  it('rotate：输出交换宽高，变换为 translate(w,0)+rotate(90°)', () => {
    const source = makeSource(100, 50);
    const result = renderDocToCanvas(source, [{ type: 'rotate' }]);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
    expect(result.__calls).toEqual([
      ['translate', 50, 0],
      ['rotate', Math.PI / 2],
      ['drawImage', source, 0, 0, 100, 50],
    ]);
  });

  it('flip：尺寸不变，变换为 translate(w,0)+scale(-1,1)', () => {
    const source = makeSource(100, 50);
    const result = renderDocToCanvas(source, [{ type: 'flip' }]);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.__calls).toEqual([
      ['translate', 100, 0],
      ['scale', -1, 1],
      ['drawImage', source, 0, 0, 100, 50],
    ]);
  });

  it('crop：按归一化矩形映射到像素坐标', () => {
    const source = makeSource(100, 50);
    const result = renderDocToCanvas(source, [
      { type: 'crop', rect: { x: 0.5, y: 0, width: 0.5, height: 1 } },
    ]);
    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
    expect(result.__calls).toEqual([
      ['drawImage', source, 50, 0, 50, 50, 0, 0, 50, 50],
    ]);
  });

  it('命令按序 fold：rotate 后 crop 相对旋转后的画布', () => {
    const source = makeSource(100, 50);
    const result = renderDocToCanvas(source, [
      { type: 'rotate' },
      { type: 'crop', rect: { x: 0, y: 0, width: 0.5, height: 0.5 } },
    ]);
    // 100x50 → 旋转 50x100 → 裁 0.5x0.5 → 25x50
    expect(result.width).toBe(25);
    expect(result.height).toBe(50);
  });

  it('零面积 crop 与畸形命令被跳过', () => {
    const source = makeSource(100, 50);
    const result = renderDocToCanvas(source, [
      null,
      { type: 'crop', rect: { width: 0, height: 0 } },
      { type: 'unknown' },
    ]);
    expect(result).toBe(source);
  });

  it('缺源抛错', () => {
    expect(() => renderDocToCanvas(null, [])).toThrow('缺少工作位图');
  });
});

describe('createWorkingSource / exportCanvasToJpegFile / canvasToObjectUrl', () => {
  let canvases;
  beforeEach(() => {
    const { factory, canvases: list } = createFakeCanvasFactory();
    canvases = list;
    vi.stubGlobal('document', { createElement: () => factory() });
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3000, height: 1000, close: vi.fn() })),
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createWorkingSource：解码 + 降采样到 ≤2560，位图 close 释放', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const source = await createWorkingSource(file);
    expect(source.width).toBe(2560);
    expect(source.height).toBe(Math.round((1000 * 2560) / 3000));
    expect(source.scaled).toBe(true);
    expect(source.sourceWidth).toBe(3000);
    // 降采样用高质量平滑 + 一次性 close
    const ctx = source.canvas.getContext('2d');
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(ctx.__calls).toEqual([['drawImage', expect.anything(), 0, 0, source.width, source.height]]);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(file);
  });

  it('createWorkingSource：无文件抛错', async () => {
    await expect(createWorkingSource(null)).rejects.toThrow('缺少图片文件');
  });

  it('exportCanvasToJpegFile：超限降采样 + JPEG q0.9 + File 命名', async () => {
    // 独立工厂造 4000x2000 输入画布；降采样画布走 beforeEach 里 stub 的 document 工厂
    const { factory } = createFakeCanvasFactory();
    const bigCanvas = factory(4000, 2000);
    const scaledBefore = canvases.length;
    const file = await exportCanvasToJpegFile(bigCanvas, { name: 'shot.heic' });
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('shot-edited.jpg');
    expect(file.type).toBe('image/jpeg');
    // 缩出的画布 1600x800，且对它做 JPEG 0.9 编码
    expect(canvases.length).toBe(scaledBefore + 1);
    const scaled = canvases.at(-1);
    expect(scaled.width).toBe(IMAGE_EDITOR_EXPORT_MAX_DIMENSION);
    expect(scaled.height).toBe(800);
    expect(scaled.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', IMAGE_EDITOR_EXPORT_QUALITY);
    expect(bigCanvas.width).toBe(4000); // 原画布不被改动
  });

  it('exportCanvasToJpegFile：未超限不复制直接编码', async () => {
    const { factory } = createFakeCanvasFactory();
    const small = factory(800, 600);
    const before = canvases.length;
    const file = await exportCanvasToJpegFile(small, { name: 'a.png' });
    expect(file.name).toBe('a-edited.jpg');
    // 没有新建画布（不复制）
    expect(canvases.length).toBe(before);
    expect(small.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      IMAGE_EDITOR_EXPORT_QUALITY,
    );
  });

  it('canvasToObjectUrl：走 JPEG 编码并返回 objectURL', async () => {
    const { factory } = createFakeCanvasFactory();
    const canvas = factory(100, 100);
    const url = await canvasToObjectUrl(canvas);
    expect(url).toBe('blob:preview');
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
  });
});
