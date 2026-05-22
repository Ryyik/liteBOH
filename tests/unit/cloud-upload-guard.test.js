import { describe, expect, it } from 'vitest';
import {
  detectImageMimeFromSignature,
  registerCloudUploadBurst,
  validateCloudinaryUploadResult,
  validateImageFileBeforeUpload
} from '../../src/utils/cloud-upload-guard.js';

function makeFile(bytes, name, type) {
  if (typeof File !== 'undefined') {
    return new File([new Uint8Array(bytes)], name, { type });
  }
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

describe('cloud-upload-guard', () => {
  it('detects image signatures', () => {
    expect(detectImageMimeFromSignature([0x89, 0x50, 0x4e, 0x47])).toBe('image/png');
    expect(detectImageMimeFromSignature([0xff, 0xd8, 0xff, 0xee])).toBe('image/jpeg');
    expect(detectImageMimeFromSignature([0x47, 0x49, 0x46, 0x38])).toBe('image/gif');
    expect(detectImageMimeFromSignature([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).toBe('image/webp');
  });

  it('rejects disguised image uploads before Cloudinary', async () => {
    const file = makeFile([0x3c, 0x73, 0x76, 0x67], 'payload.png', 'image/png');
    await expect(validateImageFileBeforeUpload(file)).rejects.toThrow('图片文件头异常');
  });

  it('rejects mismatched declared type and file content', async () => {
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0], 'payload.jpg', 'image/jpeg');
    await expect(validateImageFileBeforeUpload(file)).rejects.toThrow('图片类型与文件内容不一致');
  });

  it('validates trusted Cloudinary image responses', () => {
    expect(validateCloudinaryUploadResult({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/boh-cloud-plus/photo.webp',
      public_id: 'boh-cloud-plus/photo',
      width: 1200,
      height: 800
    }, {
      cloudName: 'demo',
      folder: 'boh-cloud-plus'
    })).toBe(true);

    expect(() => validateCloudinaryUploadResult({
      secure_url: 'http://evil.example/payload.webp',
      public_id: 'boh-cloud-plus/payload',
      width: 1200,
      height: 800
    }, {
      cloudName: 'demo',
      folder: 'boh-cloud-plus'
    })).toThrow('图片来源异常');
  });

  it('enforces per-session upload burst limits', () => {
    const first = registerCloudUploadBurst([], 9, { nowTs: 1000, limit: 18, windowMs: 60000 });
    expect(first.ok).toBe(true);

    const second = registerCloudUploadBurst(first.timestamps, 9, { nowTs: 2000, limit: 18, windowMs: 60000 });
    expect(second.ok).toBe(true);

    const third = registerCloudUploadBurst(second.timestamps, 1, { nowTs: 3000, limit: 18, windowMs: 60000 });
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
