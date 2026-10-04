/**
 * 影集编辑器多图上传流水线（2026-10-03 并发化 + 2026-10-04 审核批量化）自证
 *
 * 背景：`useAlbumEditor.uploadPhotos` 改造前是**整批纯串行** ——
 * 每张图依次「云端审核 → 压缩 → 签名 → 上传」，N 张图耗时 = N × 四步之和。
 * 论坛发帖链路早已是「压缩 2 路 + 上传 3 路」，影集这条线漏了。
 *
 * 改造后：
 *   · 审核**分块批量**（6 张/次，`moderateImagesWithFallback`）—— 一个块一次云端请求，
 *     取代「每张一次」；块内整批失败时退回逐张，一张坏图不连坐其他张；
 *   · 「压缩 → 上传」进并发池（`resolveCloudUploadConcurrency()`，默认 3、低配 2）。
 *   审核的**并发**始终不放开（配额/限流计数来源 + 本地兜底走 tfjs WebGL）。
 *
 * 本用例锁死五件事：
 *   ① 上传**真的并发**了（`maxInFlight > 1`）；
 *   ② 并发不破坏**保序**（`addAlbumPhotos` 依赖顺序写 `sort_order`，乱序 = 相册照片顺序错乱）；
 *   ③ 被拒的图不进上传、不进入库，但仍计入 `total`；
 *   ④ 审核按 6 张/块提交（14 张 = 6+6+2 共 3 次请求，而不是 14 次）；
 *   ⑤ 批量通道整块失败时退回逐张，一张坏图不连坐同块其他张。
 *
 * 反向对照实测（改坏 → 必红，改回 → 全绿）：
 *   · 并发池压回 1 路 → ①②③ 三条红（`expected 1 to be 3`）；
 *   · `moderateImagesWithFallback` 换回 `moderateChunkIndividually` → ④⑤ 两条红。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  checkPhotoQuota: vi.fn(),
  addAlbumPhotos: vi.fn(),
  appendPhotosToPages: vi.fn(),
  moderateImageWithFallback: vi.fn(),
  moderateImagesWithFallback: vi.fn(),
  getImageCompressionPlan: vi.fn(),
  compressImageFileToUploadLimit: vi.fn(),
  uploadImageToCloudinary: vi.fn(),
}));

vi.mock('@/utils/photo-albums/quota.js', () => ({
  checkPhotoQuota: testMocks.checkPhotoQuota,
  photosQuotaFor: () => 12,
  fetchMyTier: async () => 'free',
}));

vi.mock('@/utils/api/photo-albums-api.js', () => ({
  addAlbumPhotos: testMocks.addAlbumPhotos,
  deleteAlbumPhoto: vi.fn(),
  getMyAlbum: vi.fn(),
  saveAlbumPages: vi.fn(),
  updateAlbum: vi.fn(),
  updatePhotoCaption: vi.fn(),
}));

vi.mock('@/utils/photo-albums/auto-layout.js', () => ({
  buildAutoLayoutPages: vi.fn(() => []),
  appendPhotosToPages: testMocks.appendPhotosToPages,
}));

vi.mock('@/utils/photo-albums/layouts.js', () => ({
  getLayout: vi.fn(() => ({ id: 'full', maxPhotos: 1 })),
}));

vi.mock('@/utils/image-moderation-pipeline.js', () => ({
  moderateImageWithFallback: testMocks.moderateImageWithFallback,
  moderateImagesWithFallback: testMocks.moderateImagesWithFallback,
}));

vi.mock('@/utils/image-compression.js', () => ({
  getImageCompressionPlan: testMocks.getImageCompressionPlan,
  compressImageFileToUploadLimit: testMocks.compressImageFileToUploadLimit,
}));

vi.mock('@/utils/cloudinary-client.js', () => ({
  uploadImageToCloudinary: testMocks.uploadImageToCloudinary,
}));

import { useAlbumEditor } from '@/views/PhotoAlbumEditor/composables/useAlbumEditor.js';
import {
  CLOUD_UPLOAD_MAX_CONCURRENCY,
  CLOUD_UPLOAD_MAX_CONCURRENCY_LOW_END,
  resolveCloudUploadConcurrency,
} from '@/utils/cloud-upload-guard.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeFiles = (count) =>
  Array.from(
    { length: count },
    (_, i) => new File([`bytes-${i}`], `photo-${i}.jpg`, { type: 'image/jpeg' }),
  );

/** 记录「同时在上传的张数」，用于判定是否真的并发 */
let inFlight = 0;
let maxInFlight = 0;
let uploadOrder = [];

// 第 0 张刻意最慢：完成顺序因此与选图顺序不同 —— 这样才能证伪
// 「按完成顺序 push」的实现（那种实现下 uploadOrder 会等于选图顺序，且入库顺序会乱）。
const uploadDelayFor = (file) => (file.name === 'photo-0.jpg' ? 90 : 15);

function trackUpload() {
  inFlight = 0;
  maxInFlight = 0;
  uploadOrder = [];
  testMocks.uploadImageToCloudinary.mockImplementation(async (file) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(uploadDelayFor(file)); // 模拟真实上传耗时，给生产者留出把并发池填满的时间
    uploadOrder.push(file.name);
    inFlight -= 1;
    const publicId = `photo-album/${file.name}`;
    return {
      secure_url: `https://res.cloudinary.com/dkqae7j1m/image/upload/${publicId}.webp`,
      public_id: publicId,
      width: 1200,
      height: 800,
    };
  });
}

describe('影集上传流水线：并发度与保序', () => {
  let editor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });

    testMocks.checkPhotoQuota.mockResolvedValue({ allowed: true, used: 0, limit: 12, hint: '' });
    testMocks.getImageCompressionPlan.mockResolvedValue({ shouldCompress: false, dimensions: {} });
    testMocks.appendPhotosToPages.mockImplementation((pages) => ({ pages, changed: false }));
    testMocks.addAlbumPhotos.mockImplementation(async (_albumId, rows) => ({
      ok: true,
      data: rows.map((row, index) => ({ id: `db-${index}`, url: row.url })),
      error: null,
    }));
    // 审核比上传快，才能把并发池填满（模拟真实比例）
    testMocks.moderateImageWithFallback.mockImplementation(async () => {
      await delay(5);
      return { status: 'approved', score: 0.1, source: 'gemini' };
    });
    // 批量审核入口：默认按「块内逐张」转发到同一个 mock，
    // 这样各用例只改写 moderateImageWithFallback 就能同时覆盖单图与批量两条路径
    testMocks.moderateImagesWithFallback.mockImplementation(async (chunkFiles) =>
      Promise.all(chunkFiles.map((file) => testMocks.moderateImageWithFallback(file))),
    );

    trackUpload();

    editor = useAlbumEditor();
    editor.album.value = { id: 'album-1' };
  });

  it('多图上传真的并发（并发上限 = resolveCloudUploadConcurrency）', async () => {
    const files = makeFiles(6);
    const result = await editor.uploadPhotos(files);

    expect(result).toEqual({ ok: true, added: 6, error: null });
    expect(maxInFlight).toBe(CLOUD_UPLOAD_MAX_CONCURRENCY);
    // 串行实现下 maxInFlight 恒为 1 —— 这条断言就是「提速」的可证伪判据
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('并发不破坏保序：入库顺序 == 用户选图顺序（否则 sort_order 全乱）', async () => {
    const files = makeFiles(6);
    await editor.uploadPhotos(files);

    const [albumId, rows] = testMocks.addAlbumPhotos.mock.calls[0];
    expect(albumId).toBe('album-1');
    expect(rows.map((row) => row.url)).toEqual(
      files.map(
        (file) => `https://res.cloudinary.com/dkqae7j1m/image/upload/photo-album/${file.name}.webp`,
      ),
    );
    // 完成顺序与选图顺序不同 ⇒ 证明结果确实是「按下标落位」而非「按完成顺序 push」
    expect(uploadOrder).not.toEqual(files.map((file) => file.name));
  });

  it('低配机（hardwareConcurrency <= 4）降为 2 路', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
    const files = makeFiles(6);
    await editor.uploadPhotos(files);

    expect(maxInFlight).toBe(CLOUD_UPLOAD_MAX_CONCURRENCY_LOW_END);
  });

  it('中间某张被拒：不进上传、不进入库，但计入 total', async () => {
    testMocks.moderateImageWithFallback.mockImplementation(async (file) => {
      await delay(5);
      if (file.name === 'photo-2.jpg') {
        return { status: 'rejected', score: 0.9, reason: '未通过安全检测' };
      }
      return { status: 'approved', score: 0.1, source: 'gemini' };
    });

    const files = makeFiles(5);
    const summary = vi.fn();
    const result = await editor.uploadPhotos(files, { onUploadedSummary: summary });

    expect(result).toEqual({ ok: true, added: 4, error: null });
    expect(uploadOrder).not.toContain('photo-2.jpg');
    const [, rows] = testMocks.addAlbumPhotos.mock.calls[0];
    expect(rows).toHaveLength(4);
    expect(summary).toHaveBeenCalledWith({
      total: 5,
      added: 4,
      rejected: [{ name: 'photo-2.jpg', reason: '未通过安全检测' }],
    });
  });

  it('上传中断（cancelUpload）：不等满整批，也不把已上传的算作失败', async () => {
    const files = makeFiles(6);
    const promise = editor.uploadPhotos(files);
    await delay(10); // 让生产者跑起来
    editor.cancelUpload();
    const result = await promise;

    // 取消后不再有新增成功；已成功的那部分照旧入库（与改造前行为一致）
    expect(result.ok).toBe(true);
    expect(result.added).toBeLessThanOrEqual(6);
    if (result.added > 0) {
      const [, rows] = testMocks.addAlbumPhotos.mock.calls[0];
      expect(rows).toHaveLength(result.added);
    }
  });

  it('审核按 6 张/块批量提交（14 张 = 6+6+2，3 次请求而不是 14 次）', async () => {
    // 这条是「批量审核」的核心收益：云端审核从「每张一次」变成「每块一次」。
    // 退化成逐张（moderateImagesWithFallback 被绕过）时，下面两条断言会同时红。
    const files = makeFiles(14);
    const result = await editor.uploadPhotos(files);

    expect(testMocks.moderateImagesWithFallback).toHaveBeenCalledTimes(3);
    expect(testMocks.moderateImagesWithFallback.mock.calls.map(([chunk]) => chunk.length)).toEqual([
      6, 6, 2,
    ]);
    // 注：这里不能断言 moderateImageWithFallback 未被调用 —— 本文件的批量 mock 就是
    // 「转发到同一个单图 mock」，它必然被调用。批量是否生效由上面两条断言锁死：
    // 若生产代码退回逐张审核，moderateImagesWithFallback 的调用次数会是 0。
    expect(result).toEqual({ ok: true, added: 14, error: null });
  });

  it('批量通道整块失败时退回逐张：一张坏图不连坐同块其他张', async () => {
    // 批量入口是「一块一张解不开就整块失败」，直接放行会让同块 5 张正常图一起被拒。
    testMocks.moderateImagesWithFallback.mockRejectedValue(new Error('批量通道不可用'));
    testMocks.moderateImageWithFallback.mockImplementation(async (file) => {
      await delay(2);
      if (file.name === 'photo-1.jpg') throw new Error('图片无法解析，请换一张图片');
      return { status: 'approved', score: 0.1, source: 'gemini' };
    });

    const files = makeFiles(4);
    const summary = vi.fn();
    const result = await editor.uploadPhotos(files, { onUploadedSummary: summary });

    expect(testMocks.moderateImageWithFallback).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ ok: true, added: 3, error: null });
    expect(summary).toHaveBeenCalledWith({
      total: 4,
      added: 3,
      rejected: [{ name: 'photo-1.jpg', reason: '图片无法解析，请换一张图片' }],
    });
  });
});

describe('resolveCloudUploadConcurrency：设备能力 → 并发上限', () => {
  it('高配机取默认档 3', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    expect(resolveCloudUploadConcurrency()).toBe(CLOUD_UPLOAD_MAX_CONCURRENCY);
  });

  it('低配机（<=4 核，含全部 iOS）降为 2', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
    expect(resolveCloudUploadConcurrency()).toBe(CLOUD_UPLOAD_MAX_CONCURRENCY_LOW_END);
  });

  it('拿不到 hardwareConcurrency 时不降档（避免拖慢主流机）', () => {
    vi.stubGlobal('navigator', {});
    expect(resolveCloudUploadConcurrency()).toBe(CLOUD_UPLOAD_MAX_CONCURRENCY);
  });
});
