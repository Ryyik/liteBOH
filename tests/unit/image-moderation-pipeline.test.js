import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  callVaultSiliconChat: vi.fn(),
  moderateForumImageFile: vi.fn(),
  createImageElementForModeration: vi.fn(),
  createModerationSurfaceForModeration: vi.fn()
}));

vi.mock('../../src/utils/api/api-key-runtime-api.js', () => ({
  callVaultSiliconChat: testMocks.callVaultSiliconChat
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn() }
}));

vi.mock('../../src/utils/forum-image-moderation.js', () => ({
  moderateForumImageFile: testMocks.moderateForumImageFile,
  createImageElementForModeration: testMocks.createImageElementForModeration,
  createModerationSurfaceForModeration: testMocks.createModerationSurfaceForModeration
}));

import {
  moderateImageWithFallback,
  moderateImagesWithFallback,
  isCloudModerationCoolingDown,
  markCloudModerationSuccess,
  getCloudModerationCooldownState
} from '../../src/utils/image-moderation-pipeline.js';

const FAKE_IMAGE = { naturalWidth: 100, naturalHeight: 100 };
const FAKE_CANVAS = { toDataURL: () => 'data:image/jpeg;base64,TESTIMAGE' };

function mockEncoding() {
  testMocks.createImageElementForModeration.mockResolvedValue({ image: FAKE_IMAGE, objectUrl: 'blob:test' });
  testMocks.createModerationSurfaceForModeration.mockReturnValue(FAKE_CANVAS);
}

const cloudOk = (verdictJson) => ({
  ok: true,
  status: 200,
  data: { choices: [{ message: { content: verdictJson } }] },
  keyInfo: { label: 'worker', maskedValue: 'wt***' }
});

const cloudFail = ({ code = '', status = 0, message = '' } = {}) => ({
  ok: false,
  status,
  data: null,
  error: { message, code }
});

describe('image-moderation-pipeline（云端优先、本地兜底）', () => {
  beforeEach(() => {
    testMocks.callVaultSiliconChat.mockReset();
    testMocks.moderateForumImageFile.mockReset();
    mockEncoding();
    markCloudModerationSuccess();
  });

  it('uses the gemini verdict directly when the cloud approves', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk('{"status":"approved","confidence":0.12,"reason":"正常内容"}')
    );

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('gemini');
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('rejects on a clear gemini rejection without falling back to local', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk('{"status":"rejected","confidence":0.97,"reason":"包含色情内容"}')
    );

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('rejected');
    expect(result.source).toBe('gemini');
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('treats a gemini safety block as a rejection, not an outage', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue({
      ok: true,
      status: 200,
      data: { choices: [], promptFeedback: { blockReason: 'SEXUALLY_EXPLICIT' } },
      keyInfo: null
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('rejected');
    expect(result.source).toBe('gemini');
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('falls back to local nsfwjs on cloud timeout and relaxes borderline verdicts', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT', message: '超时' }));
    // 本地模型给出 needs_review（旧版会拦），兜底策略应放行并标记待抽查
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'needs_review', score: 0.52, reason: '检测结果不明确', scores: {}
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('local_fallback_borderline');
    expect(isCloudModerationCoolingDown()).toBe(true);
  });

  it('still blocks high-confidence local rejections while in fallback', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }));
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'rejected', score: 0.91, reason: '图片疑似包含不适宜内容', scores: {}
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('rejected');
    expect(result.source).toBe('local_fallback');
  });

  it('does not engage cooldown when the moderation mode is simply unconfigured', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail({ code: 'MODE_UNAVAILABLE', message: '当前模式暂不可用' }));
    testMocks.moderateForumImageFile.mockResolvedValue({ status: 'approved', score: 0.05, reason: '通过', scores: {} });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('local_fallback');
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('skips cloud calls entirely while cooling down', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }));
    testMocks.moderateForumImageFile.mockResolvedValue({ status: 'approved', score: 0.05, reason: '通过', scores: {} });

    await moderateImageWithFallback(new File([], 'first.jpg'));
    expect(isCloudModerationCoolingDown()).toBe(true);

    const second = await moderateImageWithFallback(new File([], 'second.jpg'));
    expect(second.source).toBe('local_fallback');
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(1);
    expect(getCloudModerationCooldownState().coolingDown).toBe(true);
  });

  it('maps batch results per image and retries nothing on success', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk('{"results":[{"index":0,"status":"approved","confidence":0.1},{"index":1,"status":"rejected","confidence":0.95,"reason":"违规"}]}')
    );

    const results = await moderateImagesWithFallback([new File([], 'a.jpg'), new File([], 'b.jpg')]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'approved', source: 'gemini' });
    expect(results[1]).toMatchObject({ status: 'rejected', source: 'gemini' });
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(1);
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('falls back the whole batch to local when the cloud batch call fails', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail({ code: 'RATE_LIMITED', status: 429, message: '请求过于频繁' }));
    testMocks.moderateForumImageFile.mockResolvedValue({ status: 'approved', score: 0.05, reason: '通过', scores: {} });

    const results = await moderateImagesWithFallback([new File([], 'a.jpg'), new File([], 'b.jpg')]);

    expect(results).toHaveLength(2);
    expect(results.every((item) => item.source === 'local_fallback')).toBe(true);
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(1);
  });

  it('retries upstream failures once before falling back', async () => {
    testMocks.callVaultSiliconChat
      .mockResolvedValueOnce(cloudFail({ status: 502, message: '上游请求失败' }))
      .mockResolvedValueOnce(cloudOk('{"status":"approved","confidence":0.2,"reason":"正常"}'));

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('gemini');
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(2);
  });
});
