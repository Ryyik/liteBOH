import { describe, expect, it } from 'vitest';
import { normalizeForumImages } from '../../src/utils/api/forum-format.js';

// 构造测试用的 forum image 数据
function makeImage(overrides = {}) {
  return {
    url: 'https://example.com/test.jpg',
    publicId: 'forum/test123',
    width: 800,
    height: 600,
    format: 'jpg',
    moderationStatus: 'approved',
    moderationScore: 0,
    moderationReason: '',
    sortOrder: 0,
    ...overrides
  };
}

// ============================================================
// Bug #14 修复验证: normalizeForumImages includeNonApproved 选项
// ============================================================
describe('normalizeForumImages', () => {
  it('默认只返回 moderationStatus 为 approved 的图片', () => {
    const images = [
      makeImage({ url: 'a.jpg', moderationStatus: 'approved', sortOrder: 1 }),
      makeImage({ url: 'b.jpg', moderationStatus: 'pending', sortOrder: 2 }),
      makeImage({ url: 'c.jpg', moderationStatus: 'needs_review', sortOrder: 3 }),
    ];
    const result = normalizeForumImages(images);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a.jpg');
  });

  it('includeNonApproved: true 时返回所有状态的图片（按 sortOrder 排序）', () => {
    const images = [
      makeImage({ url: 'c.jpg', moderationStatus: 'needs_review', sortOrder: 3 }),
      makeImage({ url: 'a.jpg', moderationStatus: 'approved', sortOrder: 1 }),
      makeImage({ url: 'b.jpg', moderationStatus: 'pending', sortOrder: 2 }),
    ];
    const result = normalizeForumImages(images, { includeNonApproved: true });
    expect(result).toHaveLength(3);
    expect(result.map((img) => img.url)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('includeNonApproved: false 时行为与默认一致', () => {
    const images = [
      makeImage({ url: 'a.jpg', moderationStatus: 'approved' }),
      makeImage({ url: 'b.jpg', moderationStatus: 'pending' }),
    ];
    const result = normalizeForumImages(images, { includeNonApproved: false });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a.jpg');
  });

  it('空数组返回空数组', () => {
    expect(normalizeForumImages([])).toEqual([]);
    expect(normalizeForumImages(null)).toEqual([]);
    expect(normalizeForumImages(undefined)).toEqual([]);
  });

  it('按 sortOrder 升序排列', () => {
    const images = [
      makeImage({ url: 'third.jpg', sortOrder: 3 }),
      makeImage({ url: 'first.jpg', sortOrder: 1 }),
      makeImage({ url: 'second.jpg', sortOrder: 2 }),
    ];
    const result = normalizeForumImages(images);
    expect(result.map((img) => img.url)).toEqual(['first.jpg', 'second.jpg', 'third.jpg']);
  });

  it('所有图片都有 moderationStatus 但不是 approved 且没有 includeNonApproved 时返回空', () => {
    const images = [
      makeImage({ url: 'a.jpg', moderationStatus: 'rejected' }),
      makeImage({ url: 'b.jpg', moderationStatus: 'pending' }),
    ];
    const result = normalizeForumImages(images);
    expect(result).toHaveLength(0);
  });

  it('过滤掉 null/undefined 的图片项', () => {
    const images = [
      makeImage({ url: 'a.jpg' }),
      null,
      undefined,
      makeImage({ url: 'b.jpg' }),
    ];
    const result = normalizeForumImages(images);
    expect(result).toHaveLength(2);
  });

  it('includeNonApproved 也过滤掉 null/undefined', () => {
    const images = [
      makeImage({ url: 'a.jpg', moderationStatus: 'pending' }),
      null,
      makeImage({ url: 'b.jpg', moderationStatus: 'approved' }),
    ];
    const result = normalizeForumImages(images, { includeNonApproved: true });
    expect(result).toHaveLength(2);
  });
});