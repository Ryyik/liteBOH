import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatImageFileSize,
  formatImageMegapixels,
  getImageCompressionPlan
} from '../../src/utils/image-compression.js';

const stubImageDimensions = (width, height) => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:forum-test'),
    revokeObjectURL: vi.fn()
  });
  vi.stubGlobal('Image', class {
    naturalWidth = width;
    naturalHeight = height;
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('image-compression: formatImageFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatImageFileSize(0)).toBe('0.00MB');
  });

  it('formats small file', () => {
    const result = formatImageFileSize(1024 * 1024); // 1MB
    expect(result).toBe('1.00MB');
  });

  it('formats 10MB file', () => {
    const result = formatImageFileSize(10 * 1024 * 1024);
    expect(result).toBe('10.0MB');
  });

  it('formats large file with 1 decimal', () => {
    const result = formatImageFileSize(50 * 1024 * 1024);
    expect(result).toBe('50.0MB');
  });

  it('handles negative input', () => {
    const result = formatImageFileSize(-100);
    expect(result).toBe('0.00MB');
  });

  it('handles undefined input', () => {
    const result = formatImageFileSize();
    expect(result).toBe('0.00MB');
  });

  it('handles NaN input', () => {
    const result = formatImageFileSize(NaN);
    expect(result).toBe('0.00MB');
  });
});

describe('image-compression: formatImageMegapixels', () => {
  it('formats 0 pixels', () => {
    expect(formatImageMegapixels(0, 0)).toBe('0.0MP');
  });

  it('formats 1MP image', () => {
    const result = formatImageMegapixels(1000, 1000);
    expect(result).toBe('1.0MP');
  });

  it('formats 25MP image', () => {
    const result = formatImageMegapixels(5000, 5000);
    expect(result).toBe('25.0MP');
  });

  it('handles undefined arguments', () => {
    const result = formatImageMegapixels();
    expect(result).toBe('0.0MP');
  });

  it('handles negative dimensions', () => {
    const result = formatImageMegapixels(-100, -100);
    expect(result).toBe('0.0MP');
  });
});

describe('image-compression: upload optimization plan', () => {
  it('optimizes multi-megabyte JPEG files below the hard upload limit', async () => {
    stubImageDimensions(1600, 1200);
    const plan = await getImageCompressionPlan({
      name: 'phone.jpg',
      type: 'image/jpeg',
      size: 3 * 1024 * 1024
    }, { optimizeForUpload: true });

    expect(plan.requiresCompression).toBe(false);
    expect(plan.shouldOptimize).toBe(true);
    expect(plan.shouldCompress).toBe(true);
    expect(plan.targetSizeMB).toBe(2);
  });

  it('limits large phone-photo dimensions to 2048px', async () => {
    stubImageDimensions(4032, 3024);
    const plan = await getImageCompressionPlan({
      name: 'camera.jpg',
      type: 'image/jpeg',
      size: 1024 * 1024
    }, { optimizeForUpload: true });

    expect(plan.shouldOptimize).toBe(true);
    expect(plan.maxWidthOrHeight).toBe(2048);
  });

  it('does not recompress an in-limit PNG just for transfer optimization', async () => {
    stubImageDimensions(1600, 1200);
    const plan = await getImageCompressionPlan({
      name: 'transparent.png',
      type: 'image/png',
      size: 3 * 1024 * 1024
    }, { optimizeForUpload: true });

    expect(plan.shouldCompress).toBe(false);
    expect(plan.shouldOptimize).toBe(false);
  });
});
