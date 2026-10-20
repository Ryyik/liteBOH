import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  callVaultSiliconChat: vi.fn(),
  moderateForumImageFile: vi.fn(),
  createImageElementForModeration: vi.fn(),
  createModerationSurfaceForModeration: vi.fn(),
}));

vi.mock('../../src/utils/api/api-key-runtime-api.js', () => ({
  callVaultSiliconChat: testMocks.callVaultSiliconChat,
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/utils/forum-image-moderation.js', () => ({
  moderateForumImageFile: testMocks.moderateForumImageFile,
  createImageElementForModeration: testMocks.createImageElementForModeration,
  createModerationSurfaceForModeration: testMocks.createModerationSurfaceForModeration,
}));

import {
  moderateImageWithFallback,
  moderateImagesWithFallback,
  isCloudModerationCoolingDown,
  markCloudModerationSuccess,
  markCloudModerationUnreachable,
  getCloudModerationCooldownState,
} from '../../src/utils/image-moderation-pipeline.js';

const FAKE_IMAGE = { naturalWidth: 100, naturalHeight: 100 };
const FAKE_CANVAS = { toDataURL: () => 'data:image/jpeg;base64,TESTIMAGE' };

function mockEncoding() {
  testMocks.createImageElementForModeration.mockResolvedValue({
    image: FAKE_IMAGE,
    objectUrl: 'blob:test',
  });
  testMocks.createModerationSurfaceForModeration.mockReturnValue(FAKE_CANVAS);
}

const cloudOk = (verdictJson) => ({
  ok: true,
  status: 200,
  data: { choices: [{ message: { content: verdictJson } }] },
  keyInfo: { label: 'worker', maskedValue: 'wt***' },
});

const cloudFail = ({ code = '', status = 0, message = '' } = {}) => ({
  ok: false,
  status,
  data: null,
  error: { message, code },
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
      cloudOk('{"status":"approved","confidence":0.12,"reason":"正常内容"}'),
    );

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('gemini');
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('rejects on a clear gemini rejection without falling back to local', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk('{"status":"rejected","confidence":0.97,"reason":"包含色情内容"}'),
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
      keyInfo: null,
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('rejected');
    expect(result.source).toBe('gemini');
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('falls back to local nsfwjs on cloud timeout and relaxes borderline verdicts', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT', message: '超时' }),
    );
    // 本地模型给出 needs_review（旧版会拦），兜底策略应放行并标记待抽查
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'needs_review',
      score: 0.52,
      reason: '检测结果不明确',
      scores: {},
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('local_fallback_borderline');
    // 2026-10-20 语义变更：单次超时**不再**冻结冷却。
    // 旧断言是 `toBe(true)`（首次失败即冷却）；现在要连续 3 次才冻结，单次失败只记账
    // —— 否则 4 张图的帖子第 1 张超时会让后 3 张连云端都不问（线上实测的「1 次云端 + 4 张本地」）。
    expect(isCloudModerationCoolingDown()).toBe(false);
    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(1);
  });

  it('still blocks high-confidence local rejections while in fallback', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'rejected',
      score: 0.91,
      reason: '图片疑似包含不适宜内容',
      scores: {},
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('rejected');
    expect(result.source).toBe('local_fallback');
  });

  it('does not engage cooldown when the moderation mode is simply unconfigured', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ code: 'MODE_UNAVAILABLE', message: '当前模式暂不可用' }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.status).toBe('approved');
    expect(result.source).toBe('local_fallback');
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('连续失败达阈值才冻结；冻结后不再打云端（错误预算）', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });

    // 第 1、2 次失败：只记账，不冻结，每张都照常问云端
    await moderateImageWithFallback(new File([], 'first.jpg'));
    expect(isCloudModerationCoolingDown()).toBe(false);
    await moderateImageWithFallback(new File([], 'second.jpg'));
    expect(isCloudModerationCoolingDown()).toBe(false);
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(2);

    // 第 3 次失败：达到阈值 → 冻结
    const third = await moderateImageWithFallback(new File([], 'third.jpg'));
    expect(third.source).toBe('local_fallback');
    expect(isCloudModerationCoolingDown()).toBe(true);
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(3);

    // 冻结期内：第 4 张不再打云端
    const fourth = await moderateImageWithFallback(new File([], 'fourth.jpg'));
    expect(fourth.source).toBe('local_fallback');
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(3);
    expect(getCloudModerationCooldownState().coolingDown).toBe(true);
  });

  it('一次失败不再拖垮同批：4 张图里只挂 1 张，其余 3 张仍走云端', async () => {
    // 这是本次改造要守住的**核心行为**，直接对应线上事故：
    // 旧行为下第 1 张超时 ⇒ 后 3 张连云端都不问 ⇒ 「1 次云端调用 + 4 张本地兜底」。
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });
    testMocks.callVaultSiliconChat
      .mockResolvedValueOnce(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }))
      .mockResolvedValue(cloudOk('{"status":"approved","confidence":0.1}'));

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await moderateImageWithFallback(new File([], `img-${i}.jpg`)));
    }

    // 第 1 张本地兜底，后 3 张全部拿到云端裁决
    expect(results[0].source).toBe('local_fallback');
    expect(results.slice(1).every((r) => r.source === 'gemini')).toBe(true);
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(4);
    // 云端成功后计数清零，不残留
    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(0);
  });

  it('任意一次成功都会清零连续失败计数（成功是最强健康信号）', async () => {
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });
    testMocks.callVaultSiliconChat
      .mockResolvedValueOnce(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }))
      .mockResolvedValueOnce(cloudFail({ code: 'API_KEY_RUNTIME_TIMEOUT' }))
      .mockResolvedValue(cloudOk('{"status":"approved","confidence":0.1}'));

    await moderateImageWithFallback(new File([], 'a.jpg'));
    await moderateImageWithFallback(new File([], 'b.jpg'));
    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(2);

    const third = await moderateImageWithFallback(new File([], 'c.jpg'));
    expect(third.source).toBe('gemini');
    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(0);
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('maps batch results per image and retries nothing on success', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk(
        '{"results":[{"index":0,"status":"approved","confidence":0.1},{"index":1,"status":"rejected","confidence":0.95,"reason":"违规"}]}',
      ),
    );

    const results = await moderateImagesWithFallback([
      new File([], 'a.jpg'),
      new File([], 'b.jpg'),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'approved', source: 'gemini' });
    expect(results[1]).toMatchObject({ status: 'rejected', source: 'gemini' });
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(1);
    expect(testMocks.moderateForumImageFile).not.toHaveBeenCalled();
  });

  it('falls back the whole batch to local when the cloud batch call fails', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ code: 'RATE_LIMITED', status: 429, message: '请求过于频繁' }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });

    const results = await moderateImagesWithFallback([
      new File([], 'a.jpg'),
      new File([], 'b.jpg'),
    ]);

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

/**
 * 2026-10-04 提速改造：超时 / 首次失败即冷却 / 批量编码有界并发。
 *
 * 多图上传里「云端审核」的代价是**逐张累加**的，改造前三个问题叠在一起：
 *   ① 单图超时 8s ⇒ 云端不可达时第一张就要等满 8s；
 *   ② 批量超时写的是 `CLOUD_TIMEOUT_MS + 4000`，单图一降就会把批量一起压下去
 *      —— 而分享复审是把整集（最多 60 张）一次丢进批量入口的；
 *   ③ 批量入口 `Promise.all` 一次性解码全部原图 ⇒ 移动端 OOM。
 *
 * ⚠️ 一条**实测出来的诚实结论**（反向对照记录，别再来回改）：
 *   「首次失败即冷却」在**当前串行管线里观察不到效果**。把
 *   `if (classified.cooldownMs > 0)` 改成 `if (false && ...)` 退回旧行为后，
 *   本文件 15 条**全绿** —— 因为串行下第 2 张永远排在本次重试之后，
 *   而重试失败后 `handleUnreachable` 照样会把冷却立起来，终态完全一致。
 *   保留这次改动只是因为「不可达一经观察到就立即冷却」语义更正确、
 *   且在审核将来若改并发时才有意义；**不要**拿它当提速项汇报。
 *   真正有牙的是超时 2500 / 批量 12000（解耦）/ 编码并发 ≤2 这三条。
 */
describe('image-moderation-pipeline（2026-10-04 超时 / 冷却 / 编码并发）', () => {
  beforeEach(() => {
    testMocks.callVaultSiliconChat.mockReset();
    testMocks.moderateForumImageFile.mockReset();
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });
    mockEncoding();
    markCloudModerationSuccess();
  });

  it('单图超时 2500ms、批量超时 12000ms，两者**解耦**', async () => {
    // 解耦是刻意的：share-moderation.js 把整集（最多 60 张）一次丢进批量入口，
    // 批量超时若跟着单图一起降到 6.5s，那一路必然整组超时回落本地。
    // 反向对照：把单图改回 8000 → 第一条红；把批量改回 `CLOUD_TIMEOUT_MS + 4000` → 第二条红。
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk('{"status":"approved","confidence":0.1}'),
    );
    await moderateImageWithFallback(new File([], 'a.jpg'));
    expect(testMocks.callVaultSiliconChat.mock.calls[0][0].timeoutMs).toBe(2500);

    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk(
        '{"results":[{"index":0,"status":"approved"},{"index":1,"status":"approved"},{"index":2,"status":"approved"}]}',
      ),
    );
    await moderateImagesWithFallback([
      new File([], 'b.jpg'),
      new File([], 'c.jpg'),
      new File([], 'd.jpg'),
    ]);
    expect(testMocks.callVaultSiliconChat.mock.calls[1][0].timeoutMs).toBe(12000);
  });

  it('可重试类失败：本次重试一次，且单次失败不冻结（下一张仍打云端）', async () => {
    // ⚠️ 契约锁，含两层：
    //   ① 「upstream 失败仍重试一次」—— 这是 2026-10-04 的既有口径，没被本次改造动过；
    //   ② 「单次失败后第 2 张仍打云端」—— 2026-10-20 错误预算改造的**新增**口径。
    //      旧断言是「冷却建立后第 2 张不再打云端」，那正是要修掉的整批降级行为。
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudFail({ status: 503, message: '上游故障' }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue({
      status: 'approved',
      score: 0.05,
      reason: '通过',
      scores: {},
    });

    const first = await moderateImageWithFallback(new File([], 'a.jpg'));
    expect(first.source).toBe('local_fallback');
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(2); // 本次仍重试一次
    expect(isCloudModerationCoolingDown()).toBe(false); // 单次失败不冻结

    await moderateImageWithFallback(new File([], 'b.jpg'));
    expect(testMocks.callVaultSiliconChat).toHaveBeenCalledTimes(4); // 第 2 张仍打云端（2 次重试）
  });

  it('重试成功时冷却被清掉（首次失败即冷却不误伤）', async () => {
    testMocks.callVaultSiliconChat
      .mockResolvedValueOnce(cloudFail({ status: 502, message: '上游请求失败' }))
      .mockResolvedValueOnce(cloudOk('{"status":"approved","confidence":0.2,"reason":"正常"}'));

    const result = await moderateImageWithFallback(new File([], 'a.jpg'));

    expect(result.source).toBe('gemini');
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('批量编码有界并发（≤2），不再 Promise.all 全量解码原图', async () => {
    // 反向对照：改回 `Promise.all(list.map(encode...))` → maxInFlight 变成 8，本条红。
    let inFlight = 0;
    let maxInFlight = 0;
    testMocks.createImageElementForModeration.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return { image: FAKE_IMAGE, objectUrl: 'blob:test' };
    });
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk(
        JSON.stringify({
          results: Array.from({ length: 8 }, (_, index) => ({ index, status: 'approved' })),
        }),
      ),
    );

    const files = Array.from({ length: 8 }, (_, i) => new File([], `p${i}.jpg`));
    const results = await moderateImagesWithFallback(files);

    expect(results).toHaveLength(8);
    // 全量并发下这里会是 8 —— 分享前复审 60 张时就是同时解码 60 张原图
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it('编码有界并发不得打乱落位：返回顺序 == 入参顺序', async () => {
    // 让第 0 张编码最慢：按完成顺序 push 的实现会把它排到最后
    testMocks.createImageElementForModeration.mockImplementation(async (file) => {
      await new Promise((resolve) => setTimeout(resolve, file.name === 'p0.jpg' ? 40 : 5));
      return { image: FAKE_IMAGE, objectUrl: 'blob:test' };
    });
    testMocks.callVaultSiliconChat.mockResolvedValue(
      cloudOk(
        JSON.stringify({
          results: [
            { index: 0, status: 'rejected', confidence: 0.9, reason: '第 0 张被拒' },
            { index: 1, status: 'approved', confidence: 0.1 },
            { index: 2, status: 'approved', confidence: 0.1 },
          ],
        }),
      ),
    );

    const results = await moderateImagesWithFallback([
      new File([], 'p0.jpg'),
      new File([], 'p1.jpg'),
      new File([], 'p2.jpg'),
    ]);

    expect(results.map((item) => item.status)).toEqual(['rejected', 'approved', 'approved']);
  });

  it('连续故障时冷却按 60s → 120s → 240s 指数退避，并封顶 5 分钟', async () => {
    // 退避的意义：真挂机时不要每 60s 就重试一次并把用户拖进超时；
    // 但也不能无限增长（否则一次故障 = 半小时用不上云端），故封顶 COOLDOWN_MAX_MS。
    // 反向对照：把 `base * 2 ** (cooldownStreak - 1)` 改回 `base` → 第 2/3 段相等，本条红。
    //
    // ⚠️ 用 fake timers 做「时间旅行」：这条要验证的是**多轮故障之间的退避递增**，
    // 靠 sleep 无法在单测里跨越 60s+，且会把整套测试拖慢。
    vi.useFakeTimers();
    try {
      const durations = [];
      for (let round = 0; round < 4; round += 1) {
        // 每轮打满阈值（3 次失败）→ 冻结一次
        for (let i = 0; i < 3; i += 1) {
          markCloudModerationUnreachable(60000, 'backoff-test');
        }
        const state = getCloudModerationCooldownState();
        durations.push(Math.round(((state.cooldownUntil || 0) - Date.now()) / 1000));
        // 时间旅行到冷却结束之后，但**不清** consecutiveFailures / cooldownStreak
        vi.advanceTimersByTime(400000);
      }

      // 期望 60 / 120 / 240 / 300（封顶 5 分钟）
      expect(durations[0]).toBeGreaterThanOrEqual(59);
      expect(durations[1]).toBeGreaterThanOrEqual(119);
      expect(durations[2]).toBeGreaterThanOrEqual(239);
      expect(durations[3]).toBeGreaterThanOrEqual(299);
    } finally {
      vi.useRealTimers();
      markCloudModerationSuccess();
    }
  });
});
