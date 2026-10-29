/**
 * 审核链并发改造（2026-10-29）的守卫。
 *
 * 背景：论坛预热管线此前用**一条全局串行链**把所有检测串起来，理由是「WebGL classify
 * 不并发」。但那个约束只对**本地兜底**成立（且 forum-image-moderation.js 的
 * `classifyMutex` 已经兜住了），云端审核是纯 fetch，被顺手串成了「6 张 = 6 次 RTT 相加」。
 *
 * 拆开之后有两条**必须同时成立**的契约，少一条都是线上事故：
 *   ① 云端可以并发，但**同一波次的失败只能记一次** —— 否则一次 300ms 抖动会让在飞的
 *      3 个请求同时失败，一步凑满 FAILURE_THRESHOLD ⇒ 云端冻结 60s ⇒ 整批转本地从宽判定；
 *   ② 本地兜底**强制单并发** —— 用户实测过移动端批量本地审核会崩（整组解码 + WebGL
 *      classify 叠加），所以无论调用方开几路，落到本地必须一个一个来。
 *
 * 两条都是行为断言（不是读源码），反证见文件末尾说明。
 */
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
  isCloudModerationCoolingDown,
  markCloudModerationSuccess,
  getCloudModerationCooldownState,
} from '../../src/utils/image-moderation-pipeline.js';

const FAKE_IMAGE = { naturalWidth: 100, naturalHeight: 100 };
const FAKE_CANVAS = { toDataURL: () => 'data:image/jpeg;base64,TESTIMAGE' };

const cloudFail = ({ code = 'API_KEY_RUNTIME_TIMEOUT', status = 0, message = '超时' } = {}) => ({
  ok: false,
  status,
  data: null,
  error: { message, code },
});

const localApproved = () => ({
  status: 'approved',
  score: 0.05,
  reason: '通过',
  scores: {},
});

describe('审核并发（2026-10-29）', () => {
  beforeEach(() => {
    testMocks.callVaultSiliconChat.mockReset();
    testMocks.moderateForumImageFile.mockReset();
    testMocks.createImageElementForModeration.mockResolvedValue({
      image: FAKE_IMAGE,
      objectUrl: 'blob:test',
    });
    testMocks.createModerationSurfaceForModeration.mockReturnValue(FAKE_CANVAS);
    markCloudModerationSuccess();
  });

  it('本地兜底强制单并发：3 张同时降级，本地检测全程只有一个在跑', async () => {
    // 云端全挂 ⇒ 三张都会落到 localFallbackModerate。移动端就是在这个位置崩的
    // （整组解码全分辨率位图 + WebGL classify 叠加），所以必须串起来。
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail());
    let active = 0;
    let maxActive = 0;
    testMocks.moderateForumImageFile.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return localApproved();
    });

    const results = await Promise.all(
      [0, 1, 2].map((i) => moderateImageWithFallback(new File([], `local-${i}.jpg`))),
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.source === 'local_fallback')).toBe(true);
    // 反证：去掉 localFallbackModerate 里的互斥链 ⇒ maxActive 变成 3（本断言红）
    expect(maxActive).toBe(1);
  });

  it('同一波次的并发失败只记一次（一次抖动不许把云端冻结 60s）', async () => {
    // 三个请求"同时"在飞：用统一延迟保证它们确实重叠，再一起失败。
    testMocks.callVaultSiliconChat.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(cloudFail()), 20);
        }),
    );
    testMocks.moderateForumImageFile.mockResolvedValue(localApproved());

    await Promise.all(
      [0, 1, 2].map((i) => moderateImageWithFallback(new File([], `burst-${i}.jpg`))),
    );

    const state = getCloudModerationCooldownState();
    // 反证：把 markCloudModerationUnreachable 里的 `mergedIntoBurst` 恒置 false
    //      ⇒ 计数变成 3 ⇒ 本断言红且 isCloudModerationCoolingDown() 变 true。
    expect(state.consecutiveFailures).toBe(1);
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('串行调用仍按次计数（并发合并不能把阈值废掉）', async () => {
    // 这条锁的是「合并只看在飞请求」：串行时每次失败都看到在飞数 0，必须逐次 +1。
    // 若有人把它误实现成"时间窗口内合并"，串行快速失败也会被并成 1 次，阈值等于失效。
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail());
    testMocks.moderateForumImageFile.mockResolvedValue(localApproved());

    await moderateImageWithFallback(new File([], 'seq-1.jpg'));
    await moderateImageWithFallback(new File([], 'seq-2.jpg'));

    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(2);
    expect(isCloudModerationCoolingDown()).toBe(false);
  });

  it('第三个独立波次才冻结（真挂时仍能降级）', async () => {
    testMocks.callVaultSiliconChat.mockResolvedValue(cloudFail());
    testMocks.moderateForumImageFile.mockResolvedValue(localApproved());

    for (let wave = 0; wave < 3; wave += 1) {
      // 每波 3 张并发：波内合并成 1 次，波与波之间各 +1
      await Promise.all(
        [0, 1, 2].map((i) => moderateImageWithFallback(new File([], `w${wave}-${i}.jpg`))),
      );
    }

    expect(getCloudModerationCooldownState().consecutiveFailures).toBe(3);
    expect(isCloudModerationCoolingDown()).toBe(true);
  });
});
