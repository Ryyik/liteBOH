import { describe, expect, it } from 'vitest';
import { normalizeForumImages, toForumImageRpcPayload } from '../../src/utils/api/forum-format.js';

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
    ...overrides,
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
    const images = [makeImage({ url: 'a.jpg' }), null, undefined, makeImage({ url: 'b.jpg' })];
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
// ============================================================
// 审核来源贯通（2026-10-20）：云端 / 本地兜底必须可区分
//
// 背景（线上只读实测）：forum_post_images 全表 128 行 moderation_source 只有
// 'client_nsfwjs' 一个值 —— 因为两个 RPC 把它写死、且客户端链路从不传该字段。
// 症状是「云端判定成功也标成本地」，来源维度失去信息量，云端降级率无法用 SQL 统计。
// 判据：源侧（moderationSource）→ normalizeForumImage → toForumImageRpcPayload 全程不丢。
// ============================================================
describe('审核来源贯通（moderationSource）', () => {
  it('normalizeForumImage 保留云端来源 gemini', () => {
    const [img] = normalizeForumImages([makeImage({ moderationSource: 'gemini' })]);
    expect(img.moderationSource).toBe('gemini');
  });

  it('normalizeForumImage 保留本地兜底来源', () => {
    const [img] = normalizeForumImages([
      makeImage({ moderationSource: 'local_fallback_borderline' }),
    ]);
    expect(img.moderationSource).toBe('local_fallback_borderline');
  });

  it('缺省时回落 client_nsfwjs（兼容旧客户端，不产生非法值）', () => {
    const [img] = normalizeForumImages([makeImage()]);
    expect(img.moderationSource).toBe('client_nsfwjs');
  });

  it('DB 下划线字段也能读入（读取列表回填时走这条路）', () => {
    const [img] = normalizeForumImages([makeImage({ moderation_source: 'gemini' })]);
    expect(img.moderationSource).toBe('gemini');
  });

  it('toForumImageRpcPayload 把来源透传给服务端（关键链路，漏了等于没修）', () => {
    const payload = toForumImageRpcPayload([
      makeImage({
        url: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
        moderationSource: 'gemini',
      }),
      makeImage({
        url: 'https://res.cloudinary.com/demo/image/upload/b.jpg',
        moderationSource: 'local_fallback',
      }),
    ]);
    expect(payload).toHaveLength(2);
    expect(payload[0].moderationSource).toBe('gemini');
    expect(payload[1].moderationSource).toBe('local_fallback');
  });

  it('toForumImageRpcPayload 缺省时字段仍然存在且为安全默认值', () => {
    const payload = toForumImageRpcPayload([
      makeImage({ url: 'https://res.cloudinary.com/demo/image/upload/c.jpg' }),
    ]);
    expect(payload[0]).toHaveProperty('moderationSource', 'client_nsfwjs');
  });
});
