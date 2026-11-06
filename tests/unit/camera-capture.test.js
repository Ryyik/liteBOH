/**
 * 相机抓帧几何单测（BOH Camera Beta，plans/041）。
 *
 * 这一组锁三件事，每一条都对应一个「拍出来和看到的不一样」的真实故障：
 *  1. 按取景框宽高比中心裁切（否则成片比预览多两条边）；
 *  2. 数码变焦要在抓帧时扣掉（否则 2× 预览拍出来回到 1×）；
 *  3. 硬件/数码两段不能乘两次（否则 2× 变成 4×）。
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_ZOOM_STEPS,
  DIGITAL_ZOOM_RANGE,
  buildZoomSteps,
  computeCaptureRect,
  normalizeZoom,
  splitZoom,
} from '@/utils/camera-capture.js';

describe('computeCaptureRect', () => {
  it('竖屏取景框（3:4）在 4:3 视频上取中间竖条', () => {
    // 1920×1440 是 4:3；取景框 3:4 更窄 ⇒ 保留高度、裁宽度
    expect(computeCaptureRect(1920, 1440, 3 / 4, 1)).toEqual({
      sx: 420,
      sy: 0,
      sw: 1080,
      sh: 1440,
    });
  });

  it('横屏取景框（2:1）在 4:3 视频上取中间横条', () => {
    expect(computeCaptureRect(1920, 1440, 2, 1)).toEqual({
      sx: 0,
      sy: 240,
      sw: 1920,
      sh: 960,
    });
  });

  it('数码变焦 2× 时源矩形缩到一半，且仍居中', () => {
    const rect = computeCaptureRect(1920, 1440, 3 / 4, 2);
    expect(rect).toEqual({ sx: 690, sy: 360, sw: 540, sh: 720 });
    // 面积是 1× 的 1/4（线性各半）
    expect(rect.sw / 1080).toBeCloseTo(0.5, 5);
    expect(rect.sh / 1440).toBeCloseTo(0.5, 5);
  });

  it('取景框宽高比与原视频一致时，不裁边（只扣变焦）', () => {
    expect(computeCaptureRect(1000, 1000, 1, 1)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
    expect(computeCaptureRect(1000, 1000, 1, 2)).toEqual({ sx: 250, sy: 250, sw: 500, sh: 500 });
  });

  it('尺寸非法返回 null（不许拍出 1×1 黑图）', () => {
    expect(computeCaptureRect(0, 0, 3 / 4, 1)).toBeNull();
    expect(computeCaptureRect(1, 1, 3 / 4, 1)).toBeNull();
    expect(computeCaptureRect(undefined, 720, 3 / 4, 1)).toBeNull();
  });

  it('宽高比非法时退回源比例（不产出畸形矩形）', () => {
    const rect = computeCaptureRect(800, 600, 0, 1);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 800, sh: 600 });
  });

  it('结果永远落在源图范围内', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 2]) {
      for (const zoom of [1, 1.5, 2, 3]) {
        const rect = computeCaptureRect(1280, 720, aspect, zoom);
        expect(rect.sx).toBeGreaterThanOrEqual(0);
        expect(rect.sy).toBeGreaterThanOrEqual(0);
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(1280);
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(720);
        expect(rect.sw).toBeGreaterThan(0);
        expect(rect.sh).toBeGreaterThan(0);
      }
    }
  });
});

describe('normalizeZoom', () => {
  it('默认范围夹在 1~3，非法值按 1×', () => {
    expect(normalizeZoom(0)).toBe(1);
    expect(normalizeZoom(-2)).toBe(1);
    expect(normalizeZoom('abc')).toBe(1);
    expect(normalizeZoom(2.5)).toBe(2.5);
    expect(normalizeZoom(99)).toBe(3);
  });

  it('按设备范围收敛（安卓常见 1~8×）', () => {
    const range = { min: 1, max: 8, step: 0.1, supported: true };
    expect(normalizeZoom(9, range)).toBe(8);
    expect(normalizeZoom(0.2, range)).toBe(1);
    expect(normalizeZoom(3.4, range)).toBe(3.4);
  });

  it('支持超广角的机型允许 <1×', () => {
    const range = { min: 0.5, max: 8, step: 0.1, supported: true };
    expect(normalizeZoom(0.5, range)).toBe(0.5);
    expect(normalizeZoom(0.1, range)).toBe(0.5);
  });

  it('档位都落在合法区间内', () => {
    for (const step of CAMERA_ZOOM_STEPS) expect(normalizeZoom(step)).toBe(step);
  });
});

describe('splitZoom', () => {
  it('没有硬件变焦的设备（iOS 常见）整段走数码', () => {
    expect(splitZoom(2, DIGITAL_ZOOM_RANGE)).toEqual({ hardware: 1, digital: 2 });
    expect(splitZoom(3, DIGITAL_ZOOM_RANGE)).toEqual({ hardware: 1, digital: 3 });
  });

  it('硬件吃得下就全给硬件，不叠加数码（避免 z²）', () => {
    const range = { min: 1, max: 8, step: 0.1, supported: true };
    expect(splitZoom(2, range)).toEqual({ hardware: 2, digital: 1 });
    expect(splitZoom(3, range)).toEqual({ hardware: 3, digital: 1 });
  });

  it('超过设备上限时收到上限，不偷偷用数码补到更高倍', () => {
    const range = { min: 1, max: 4, step: 0.1, supported: true };
    expect(splitZoom(9, range)).toEqual({ hardware: 4, digital: 1 });
  });

  it('超广角机型的 0.5× 走硬件', () => {
    const range = { min: 0.5, max: 8, step: 0.1, supported: true };
    expect(splitZoom(0.5, range)).toEqual({ hardware: 0.5, digital: 1 });
  });

  it('1× 时两段都是 1', () => {
    expect(splitZoom(1, { min: 1, max: 8, step: 0.1, supported: true })).toEqual({
      hardware: 1,
      digital: 1,
    });
    expect(splitZoom(1, DIGITAL_ZOOM_RANGE)).toEqual({ hardware: 1, digital: 1 });
  });
});

describe('buildZoomSteps', () => {
  it('没有硬件变焦时退回 1/2/3× 数码档', () => {
    expect(buildZoomSteps(DIGITAL_ZOOM_RANGE)).toEqual([1, 2, 3]);
  });

  it('按设备上限列出档位，并补上非整数上限', () => {
    // 1~8× 的安卓机：常见档 + 真实上限
    expect(buildZoomSteps({ min: 1, max: 8, step: 0.1, supported: true })).toEqual([1, 2, 3, 5, 8]);
    // 只能到 4.3× 的机型，不能只列到 3
    expect(buildZoomSteps({ min: 1, max: 4.3, step: 0.1, supported: true })).toEqual([
      1, 2, 3, 4.3,
    ]);
  });

  it('支持超广角时把最小档放在最前', () => {
    expect(buildZoomSteps({ min: 0.5, max: 8, step: 0.1, supported: true })).toEqual([
      0.5, 1, 2, 3, 5, 8,
    ]);
  });

  it('上限很低（1.4×）时也给出两个可用档', () => {
    expect(buildZoomSteps({ min: 1, max: 1.4, step: 0.1, supported: true })).toEqual([1, 1.4]);
  });

  it('档位数不超过 6 个（窄屏放得下）', () => {
    const steps = buildZoomSteps({ min: 0.5, max: 20, step: 0.1, supported: true });
    expect(steps.length).toBeLessThanOrEqual(6);
  });

  it('数码上限（128×）不列成档位，也不突破 10×', () => {
    // 安卓常见把 CONTROL_ZOOM_RATIO 的数码上限报成 128×：
    // 列出来等于引导用户拍一屏马赛克（成片 1600px，10× 只剩 160px）
    expect(buildZoomSteps({ min: 1, max: 128, step: 0.1, supported: true })).toEqual([
      1, 2, 3, 5, 10,
    ]);
    expect(buildZoomSteps({ min: 0.5, max: 128, step: 0.1, supported: true })).toEqual([
      0.5, 1, 2, 3, 5, 10,
    ]);
  });

  it('上限恰好等于 10× 时仍然列出来', () => {
    expect(buildZoomSteps({ min: 1, max: 10, step: 0.1, supported: true })).toEqual([
      1, 2, 3, 5, 10,
    ]);
  });
});
