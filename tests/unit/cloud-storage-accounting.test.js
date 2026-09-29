import { describe, expect, it } from 'vitest';
import {
  computeCloudStorageAccounting,
  countCloudEntryImages,
  isPublicCloudEntry,
  normalizeCloudVisibility,
} from '../../src/utils/cloud-storage-accounting.js';

describe('normalizeCloudVisibility', () => {
  it('接受合法值并归一大小写', () => {
    expect(normalizeCloudVisibility('public')).toBe('public');
    expect(normalizeCloudVisibility('PUBLIC')).toBe('public');
    expect(normalizeCloudVisibility(' private ')).toBe('private');
  });

  it('非法/缺失值回落 private（默认私密是安全方向）', () => {
    expect(normalizeCloudVisibility('')).toBe('private');
    expect(normalizeCloudVisibility(undefined)).toBe('private');
    expect(normalizeCloudVisibility('shared')).toBe('private');
    expect(normalizeCloudVisibility(null)).toBe('private');
  });
});

describe('isPublicCloudEntry / countCloudEntryImages', () => {
  it('只有显式 public 才算公开', () => {
    expect(isPublicCloudEntry({ visibility: 'public' })).toBe(true);
    expect(isPublicCloudEntry({ visibility: 'private' })).toBe(false);
    expect(isPublicCloudEntry({})).toBe(false);
    expect(isPublicCloudEntry(null)).toBe(false);
  });

  it('只数 image 块，异常输入按 0 处理', () => {
    const entry = {
      contentBlocks: [
        { type: 'image', url: 'a' },
        { type: 'text', text: 'x' },
        { type: 'image', url: 'b' },
      ],
    };
    expect(countCloudEntryImages(entry)).toBe(2);
    expect(countCloudEntryImages({})).toBe(0);
    expect(countCloudEntryImages({ contentBlocks: null })).toBe(0);
  });
});

describe('computeCloudStorageAccounting', () => {
  const privateEntry = (images) => ({
    visibility: 'private',
    contentBlocks: Array.from({ length: images }, (_, i) => ({ type: 'image', url: `p${i}` })),
  });
  const publicEntry = (images) => ({
    visibility: 'public',
    contentBlocks: Array.from({ length: images }, (_, i) => ({ type: 'image', url: `u${i}` })),
  });

  it('空列表：用量 0，剩余 = 上限', () => {
    const a = computeCloudStorageAccounting({ entries: [], limit: 150 });
    expect(a).toMatchObject({
      usedImages: 0,
      privateImages: 0,
      publicImages: 0,
      privateEntries: 0,
      publicEntries: 0,
      remainingImages: 150,
      overflow: false,
    });
    expect(a.privatePercent + a.publicPercent + a.remainingPercent).toBe(100);
  });

  it('私密/公开分段记账，公开条目计入条数与图片', () => {
    const a = computeCloudStorageAccounting({
      entries: [privateEntry(4), publicEntry(6), { visibility: 'public', contentBlocks: [] }],
      limit: 150,
    });
    expect(a.privateEntries).toBe(1);
    expect(a.publicEntries).toBe(2);
    expect(a.privateImages).toBe(4);
    expect(a.publicImages).toBe(6);
    expect(a.usedImages).toBe(10);
    expect(a.remainingImages).toBe(140);
  });

  it('百分比三段加总恒为 100（余量吃掉取整误差）', () => {
    const a = computeCloudStorageAccounting({
      entries: [privateEntry(33), publicEntry(1)],
      limit: 100,
    });
    expect(a.privatePercent + a.publicPercent + a.remainingPercent).toBe(100);
    expect(a.privatePercent).toBe(33);
    expect(a.publicPercent).toBe(1);
  });

  it('超限时：剩余 0、overflow 标记、条形不超过 100', () => {
    const a = computeCloudStorageAccounting({
      entries: [privateEntry(90), publicEntry(30)],
      limit: 100,
    });
    expect(a.overflow).toBe(true);
    expect(a.remainingImages).toBe(0);
    expect(a.privatePercent + a.publicPercent + a.remainingPercent).toBe(100);
    expect(a.privatePercent + a.publicPercent).toBeLessThanOrEqual(100);
  });

  it('limit 非法（0/负数/NaN）：百分比全 0，不崩', () => {
    for (const limit of [0, -5, NaN, undefined]) {
      const a = computeCloudStorageAccounting({ entries: [privateEntry(3)], limit });
      expect(a.privatePercent).toBe(0);
      expect(a.publicPercent).toBe(0);
      expect(a.remainingPercent).toBe(0);
      expect(a.remainingImages).toBe(0);
    }
  });
});
