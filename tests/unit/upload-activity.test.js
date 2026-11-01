import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetUploadActivityForTests,
  beginUpload,
  endUpload,
  hasActiveUpload,
} from '../../src/utils/upload-activity.js';

/**
 * 这个信号唯一的消费者是 version-checker 的自动强刷护栏。它判错的两种代价：
 *   · 该拦没拦 ⇒ 正在上传的文件被刷断，Cloudinary 不可续传，用户从第一张重传；
 *   · 不该拦却拦 ⇒ 自动更新永久失效，用户卡在旧构建上（撞已删除的 hash chunk）。
 * 所以计数语义必须精确，不能退化成「有人开过上传就永远为真」。
 */
describe('upload-activity', () => {
  beforeEach(() => {
    __resetUploadActivityForTests();
  });

  it('初始状态没有任何上传', () => {
    expect(hasActiveUpload()).toBe(false);
  });

  it('begin/end 成对调用后回到空闲', () => {
    beginUpload();
    expect(hasActiveUpload()).toBe(true);
    endUpload();
    expect(hasActiveUpload()).toBe(false);
  });

  it('并发上传只结束一部分时仍视为「正在上传」', () => {
    // 上传并发上限是 3（CLOUD_UPLOAD_MAX_CONCURRENCY）：
    // 用布尔量的话，第一个请求结束就会放行强刷，剩下两个还在传。
    beginUpload();
    beginUpload();
    beginUpload();
    endUpload();
    expect(hasActiveUpload()).toBe(true);
    endUpload();
    expect(hasActiveUpload()).toBe(true);
    endUpload();
    expect(hasActiveUpload()).toBe(false);
  });

  it('多余的 endUpload 不会把计数压成负数（否则护栏会永久失效）', () => {
    endUpload();
    endUpload();
    beginUpload();
    expect(hasActiveUpload()).toBe(true);
    endUpload();
    expect(hasActiveUpload()).toBe(false);
  });
});
