import { describe, expect, it } from 'vitest';
import {
  buildSignaturePayload,
  normalizeSignableParams,
  resolveUploadMode,
  sanitizeCloudinaryFolder,
  sha1Hex,
  signCloudinaryParams,
} from '../../supabase/functions/_shared/cloudinary-sign.ts';

/**
 * 交叉校验向量：下列 signature 由**独立实现**（Python hashlib，非本模块）算出，
 * 见提交说明。若实现口径漂移（排序、排除键、拼接符、secret 位置），测试必红。
 */
const SECRET = 'test_secret_abc';
const VECTOR_A = {
  params: {
    context: 'uid=11111111-2222-3333-4444-555555555555',
    folder: 'boh-forum',
    timestamp: '1758412345',
    upload_preset: 'BOHIMG',
  },
  payload: 'context=uid=11111111-2222-3333-4444-555555555555&folder=boh-forum&timestamp=1758412345&upload_preset=BOHIMG',
  signature: '776440e457461cacc23336fa3b224ca03194572f',
};
const VECTOR_B = {
  params: { folder: 'boh-block-wall', timestamp: '1758499999', upload_preset: 'BOHIMG' },
  payload: 'folder=boh-block-wall&timestamp=1758499999&upload_preset=BOHIMG',
  signature: '37a56996a2fd270043dc64ca99a6276230f821f8',
};

describe('Cloudinary 签名口径', () => {
  it('向量 A：含 context 的完整参数集，签名与独立实现一致', async () => {
    const result = await signCloudinaryParams(VECTOR_A.params, SECRET);
    expect(result.payload).toBe(VECTOR_A.payload);
    expect(result.signature).toBe(VECTOR_A.signature);
  });

  it('向量 B：不含 context，签名与独立实现一致', async () => {
    const result = await signCloudinaryParams(VECTOR_B.params, SECRET);
    expect(result.payload).toBe(VECTOR_B.payload);
    expect(result.signature).toBe(VECTOR_B.signature);
  });

  it('签名是 40 位十六进制（SHA-1）', async () => {
    const result = await signCloudinaryParams(VECTOR_B.params, SECRET);
    expect(result.signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it('key 按升序排列，与传入顺序无关', async () => {
    const shuffled = {
      upload_preset: 'BOHIMG',
      timestamp: '1758499999',
      folder: 'boh-block-wall',
    };
    expect(buildSignaturePayload(shuffled)).toBe(VECTOR_B.payload);
  });

  it('secret 不同则签名不同（证明 secret 真的参与运算）', async () => {
    const other = await signCloudinaryParams(VECTOR_B.params, 'another_secret');
    expect(other.signature).not.toBe(VECTOR_B.signature);
  });

  it('api_secret 参与在末尾，而非插在中间', async () => {
    const payload = buildSignaturePayload(VECTOR_B.params);
    expect(await sha1Hex(payload + SECRET)).toBe(VECTOR_B.signature);
  });
});

describe('不参与签名的键必须被排除', () => {
  it('file / cloud_name / resource_type / api_key / signature 一律剔除', () => {
    const normalized = normalizeSignableParams({
      file: 'blob',
      cloud_name: 'dkqae7j1m',
      resource_type: 'image',
      api_key: '123456789',
      signature: 'deadbeef',
      folder: 'boh-forum',
    });

    expect(Object.keys(normalized)).toEqual(['folder']);
  });

  it('即使调用方误传 file，签名结果也不受影响', async () => {
    const withFile = await signCloudinaryParams({ ...VECTOR_B.params, file: 'binary' }, SECRET);
    expect(withFile.signature).toBe(VECTOR_B.signature);
  });

  it('空值 / null / undefined 被剔除，不产生 `k=` 片段', () => {
    const normalized = normalizeSignableParams({
      folder: 'boh-forum',
      context: '',
      tags: null,
      public_id: undefined,
    });

    expect(normalized).toEqual({ folder: 'boh-forum' });
  });

  it('值中的 `=` 原样保留（context=uid=... 是合法形态）', () => {
    const payload = buildSignaturePayload(VECTOR_A.params);
    expect(payload).toContain('context=uid=11111111-2222-3333-4444-555555555555');
  });
});

describe('API secret 缺失时拒绝签名（不得退化为无签名）', () => {
  it('空 secret → 抛 MISSING_API_SECRET', async () => {
    await expect(signCloudinaryParams(VECTOR_B.params, '')).rejects.toThrow('MISSING_API_SECRET');
    await expect(signCloudinaryParams(VECTOR_B.params, '   ')).rejects.toThrow('MISSING_API_SECRET');
  });

  it('无任何可签参数 → 抛 NOTHING_TO_SIGN', async () => {
    await expect(signCloudinaryParams({ file: 'x' }, SECRET)).rejects.toThrow('NOTHING_TO_SIGN');
  });
});

describe('上传模式开关：默认必须保持 unsigned（部署即变行为是不可接受的）', () => {
  it('未设置 / 空值 / 未知值 → unsigned', () => {
    expect(resolveUploadMode(undefined)).toBe('unsigned');
    expect(resolveUploadMode('')).toBe('unsigned');
    expect(resolveUploadMode(null)).toBe('unsigned');
    expect(resolveUploadMode('SIGNED_UP')).toBe('unsigned');
  });

  it('仅显式 signed（大小写不敏感、去空格）才切换', () => {
    expect(resolveUploadMode('signed')).toBe('signed');
    expect(resolveUploadMode('  SIGNED  ')).toBe('signed');
  });
});

describe('folder 校验：拒绝路径穿越与异常字符', () => {
  it('合法 folder 原样通过', () => {
    expect(sanitizeCloudinaryFolder('boh-forum')).toBe('boh-forum');
    expect(sanitizeCloudinaryFolder('boh-cloud-plus/source')).toBe('boh-cloud-plus/source');
    expect(sanitizeCloudinaryFolder('avatar-frames_2')).toBe('avatar-frames_2');
  });

  it('拒绝 `..` 与 `//`（路径穿越）', () => {
    expect(() => sanitizeCloudinaryFolder('boh/../secret')).toThrow('INVALID_FOLDER');
    expect(() => sanitizeCloudinaryFolder('boh//other')).toThrow('INVALID_FOLDER');
  });

  it('拒绝大写、开头非字母数字、超长', () => {
    expect(() => sanitizeCloudinaryFolder('Boh-Forum')).toThrow('INVALID_FOLDER');
    expect(() => sanitizeCloudinaryFolder('-leading')).toThrow('INVALID_FOLDER');
    expect(() => sanitizeCloudinaryFolder('a'.repeat(62))).toThrow('INVALID_FOLDER');
  });

  it('空值回落 fallback', () => {
    expect(sanitizeCloudinaryFolder('', 'boh-cloud-plus')).toBe('boh-cloud-plus');
    expect(sanitizeCloudinaryFolder(undefined, 'fallback')).toBe('fallback');
  });
});

describe('测试自身有效性', () => {
  it('SHA-1 实现正确（空串标准值）', async () => {
    expect(await sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('crypto.subtle 在本运行环境可用', () => {
    expect(typeof crypto?.subtle?.digest).toBe('function');
  });
});
