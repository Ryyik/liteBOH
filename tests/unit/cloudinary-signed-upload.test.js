import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invokeMock,
  getUserMock,
  fetchMock,
  mockNormalizeDbError,
  mockLogger,
  mockValidateImageFileBeforeUpload,
  mockValidateCloudinaryUploadResult,
} = vi.hoisted(() => {
  const mockNormalizeDbError = vi.fn((error, fallback = '请求失败') => {
    if (!error) return null;
    return {
      message: String(error?.message || fallback),
      code: error?.code || 'APP_ERROR',
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    };
  });

  return {
    invokeMock: vi.fn(),
    getUserMock: vi.fn(),
    fetchMock: vi.fn(),
    mockNormalizeDbError,
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    mockValidateImageFileBeforeUpload: vi.fn(async () => {}),
    mockValidateCloudinaryUploadResult: vi.fn(),
  };
});

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { getUser: getUserMock },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(),
  },
}));

vi.mock('../../src/utils/request-core.js', () => ({
  normalizeDbError: mockNormalizeDbError,
}));

vi.mock('../../src/utils/logger.js', () => ({ logger: mockLogger }));

vi.mock('../../src/utils/cloud-upload-guard.js', () => ({
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  validateImageFileBeforeUpload: mockValidateImageFileBeforeUpload,
  validateCloudinaryUploadResult: mockValidateCloudinaryUploadResult,
}));

import {
  __resetCloudinaryUploadGuardsForTests,
  resolveCloudinaryUploadSignParams,
  uploadImageToCloudinary,
} from '../../src/utils/cloudinary-client.js';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const SIGNED_PAYLOAD = {
  ok: true,
  mode: 'signed',
  cloudName: 'dkqae7j1m',
  apiKey: '123456789',
  signature: 'sig-from-server',
  params: {
    upload_preset: 'BOHIMG',
    folder: 'server-folder',
    timestamp: '1758500000',
    context: `uid=${USER_ID}`,
  },
};

const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: { status, json: async () => body },
});

const uploadSuccessBody = () => ({
  secure_url: 'https://cdn.blockofhome.cn/image/upload/v1/server-folder/pic.webp',
  public_id: 'server-folder/pic',
  delete_token: 'dt',
  width: 100,
  height: 100,
  format: 'webp',
  original_filename: 'pic.webp',
});

const makeFile = () => new Blob(['binary'], { type: 'image/webp' });
const entriesOf = (formData) => Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '<blob>']));

const lastFormData = () => {
  const lastCall = fetchMock.mock.calls.at(-1);
  return lastCall?.[1]?.body;
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetCloudinaryUploadGuardsForTests();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => uploadSuccessBody() });
  vi.stubGlobal('fetch', fetchMock);
});

describe('resolveCloudinaryUploadSignParams：四种结果必须分清', () => {
  it('EF 返回 signed → 透传服务端 params 与 signature', async () => {
    invokeMock.mockResolvedValue({ data: SIGNED_PAYLOAD, error: null });

    const result = await resolveCloudinaryUploadSignParams({ source: 'forum', folder: 'x' });

    expect(result.mode).toBe('signed');
    expect(result.signature).toBe('sig-from-server');
    expect(result.apiKey).toBe('123456789');
    expect(result.params.folder).toBe('server-folder');
  });

  it('EF 返回 unsigned → 走无签名模式', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, mode: 'unsigned' }, error: null });

    await expect(resolveCloudinaryUploadSignParams({})).resolves.toMatchObject({ mode: 'unsigned' });
  });

  it('EF 未部署（404）→ unavailable（允许回落无签名，保证前端可先上线）', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404, { message: 'Not Found' }) });

    await expect(resolveCloudinaryUploadSignParams({})).resolves.toMatchObject({
      mode: 'unavailable',
      status: 404,
    });
  });

  it('invoke 抛异常（网络）→ unavailable', async () => {
    invokeMock.mockRejectedValue(new Error('FunctionsFetchError'));

    await expect(resolveCloudinaryUploadSignParams({})).resolves.toMatchObject({ mode: 'unavailable' });
  });

  it('EF 明确拒绝（429 额度）→ blocked，且带上服务端文案与错误码', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(429, {
        ok: false,
        code: 'UPLOAD_10M_LIMIT',
        message: '图片上传过于频繁，请稍后再试',
        retryAfter: 120,
      }),
    });

    const result = await resolveCloudinaryUploadSignParams({});

    expect(result.mode).toBe('blocked');
    expect(result.payload.code).toBe('UPLOAD_10M_LIMIT');
  });

  it('EF 返回 500（配置缺失）→ blocked 而非静默回落', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(500, { ok: false, code: 'ENV_MISSING', message: '签名服务未配置' }),
    });

    await expect(resolveCloudinaryUploadSignParams({})).resolves.toMatchObject({
      mode: 'blocked',
      status: 500,
    });
  });
});

describe('uploadImageToCloudinary：unsigned 模式必须与改造前逐字一致', () => {
  it('未切换签名时，formData 只含 upload_preset / folder / context', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, mode: 'unsigned' }, error: null });

    await uploadImageToCloudinary(makeFile(), { folder: 'boh-forum', source: 'forum' });

    const entries = entriesOf(lastFormData());
    expect(entries).toMatchObject({
      upload_preset: 'BOHIMG',
      folder: 'boh-forum',
      context: `uid=${USER_ID}`,
    });
    expect(entries).not.toHaveProperty('signature');
    expect(entries).not.toHaveProperty('api_key');
    expect(entries).not.toHaveProperty('timestamp');
  });

  it('EF 未部署 → 回落 unsigned，上传照常成功（前端可先上线）', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404, { message: 'Not Found' }) });

    await expect(
      uploadImageToCloudinary(makeFile(), { folder: 'boh-forum' }),
    ).resolves.toMatchObject({ publicId: 'server-folder/pic' });

    expect(entriesOf(lastFormData())).toMatchObject({ upload_preset: 'BOHIMG' });
    expect(mockLogger.warn).toBeDefined();
  });
});

describe('uploadImageToCloudinary：signed 模式以服务端参数为准', () => {
  it('formData 用服务端 params + api_key + signature，不带客户端自算的 upload_preset', async () => {
    invokeMock.mockResolvedValue({ data: SIGNED_PAYLOAD, error: null });

    await uploadImageToCloudinary(makeFile(), { folder: 'client-folder', pendingSource: 'forum' });

    const entries = entriesOf(lastFormData());
    expect(entries).toMatchObject({
      upload_preset: 'BOHIMG',
      folder: 'server-folder',
      timestamp: '1758500000',
      context: `uid=${USER_ID}`,
      api_key: '123456789',
      signature: 'sig-from-server',
    });
    expect(entries.folder).not.toBe('client-folder');
  });

  it('folder 以服务端为准：客户端传入的 folder 不得出现在请求里', async () => {
    invokeMock.mockResolvedValue({ data: SIGNED_PAYLOAD, error: null });

    await uploadImageToCloudinary(makeFile(), { folder: 'attacker-folder' });

    expect(entriesOf(lastFormData()).folder).toBe('server-folder');
    expect(JSON.stringify(entriesOf(lastFormData()))).not.toContain('attacker-folder');
  });

  it('行长度：签名模式下仍把 folder 传给 EF（供服务端签名）', async () => {
    invokeMock.mockResolvedValue({ data: SIGNED_PAYLOAD, error: null });

    await uploadImageToCloudinary(makeFile(), { folder: 'boh-forum', pendingSource: 'forum' });

    expect(invokeMock).toHaveBeenCalledWith('cloudinary-sign-upload', {
      body: { source: 'forum', folder: 'boh-forum', includeContext: true },
    });
  });

  it('额度被拒（429）→ 抛错且**完全不发起上传**（绝不静默降级为无签名）', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(429, {
        ok: false,
        code: 'UPLOAD_10M_LIMIT',
        message: '图片上传过于频繁，请稍后再试',
      }),
    });

    await expect(
      uploadImageToCloudinary(makeFile(), { folder: 'boh-forum' }),
    ).rejects.toMatchObject({ code: 'UPLOAD_10M_LIMIT' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未登录被拒（401）→ 抛错且不发起上传', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(401, { ok: false, code: 'UNAUTHORIZED', message: '缺少登录凭证。' }),
    });

    await expect(
      uploadImageToCloudinary(makeFile(), { folder: 'boh-forum' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('signed 模式的 context 降级重试必须重新取签名', () => {
  it('去掉 context 重试时会重新请求签名，且新签名与旧签名不同', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: SIGNED_PAYLOAD, error: null })
      .mockResolvedValueOnce({
        data: {
          ...SIGNED_PAYLOAD,
          signature: 'sig-without-context',
          params: {
            upload_preset: 'BOHIMG',
            folder: 'server-folder',
            timestamp: '1758500001',
          },
        },
        error: null,
      });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'context is not allowed for unsigned upload' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => uploadSuccessBody() });

    await uploadImageToCloudinary(makeFile(), { folder: 'client-folder' });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[1][1]).toEqual({
      body: { source: 'generic', folder: 'client-folder', includeContext: false },
    });

    const second = entriesOf(lastFormData());
    expect(second.signature).toBe('sig-without-context');
    expect(second).not.toHaveProperty('context');
    expect(second.timestamp).toBe('1758500001');
  });

  it('重试请求里的签名与参数成对（不会把旧签名配到新参数上）', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: SIGNED_PAYLOAD, error: null })
      .mockResolvedValueOnce({
        data: {
          ...SIGNED_PAYLOAD,
          signature: 'sig-v2',
          params: { upload_preset: 'BOHIMG', folder: 'server-folder', timestamp: '1758500002' },
        },
        error: null,
      });

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'context not allowed' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => uploadSuccessBody() });

    await uploadImageToCloudinary(makeFile(), { folder: 'f' });

    const second = entriesOf(lastFormData());
    expect(second.signature).toBe('sig-v2');
    expect(second.timestamp).toBe('1758500002');
  });
});
