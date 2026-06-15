import { describe, expect, it, vi } from 'vitest';

import { formatImageFileSize, formatImageMegapixels } from '../../src/utils/image-compression.js';

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