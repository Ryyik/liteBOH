import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseAuth: { getUser: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.supabaseFrom,
    rpc: fm.supabaseRpc,
    auth: fm.supabaseAuth,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { getWeeklyCheckinStatus, submitWeeklyCheckin } from '../../src/utils/api/forum/post-api.js';

// 线上事故复盘（2026-09-29）：
//   症状 = 签到按钮可以无限点、每次都弹「签到成功」，同时界面积分余额被清成 0。
//   根因 = 后端 RPC 的「业务失败」被前端当成「传输成功」：
//     1) submit_weekly_checkin 在已签到时返回 {ok:false, already_signed:true}（HTTP 200，无 error），
//        旧实现只看 transport error → 返回 ok:true → 调用方弹成功、hasSignedThisWeek 仍为 false
//        → 按钮一直可点（无限签到）。
//     2) 该失败 payload 不含 current_points，normalize 用 Number(x || 0) 伪造成 0，
//        调用方无条件 userInfo.points = 0 → 余额清零（「余额不显示」）。
//   这两条都必须在契约层锁死，故本文件按「后端真值」写断言。
const ALREADY_SIGNED_PAYLOAD = {
  ok: false,
  message: 'ALREADY_SIGNED_THIS_WEEK',
  already_signed: true,
};

const NOT_AUTHENTICATED_PAYLOAD = { ok: false, message: 'NOT_AUTHENTICATED' };

describe('周签到契约：RPC 业务失败不得被当成成功', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('submit：已签到时必须上报 ok:false 且标出 alreadySigned', async () => {
    fm.supabaseRpc.mockResolvedValue({ data: ALREADY_SIGNED_PAYLOAD, error: null });

    const result = await submitWeeklyCheckin();

    expect(result.ok).toBe(false);
    expect(result.alreadySigned).toBe(true);
    expect(fm.supabaseRpc).toHaveBeenCalledWith('submit_weekly_checkin');
  });

  it('submit：未登录时必须上报 ok:false', async () => {
    fm.supabaseRpc.mockResolvedValue({ data: NOT_AUTHENTICATED_PAYLOAD, error: null });

    const result = await submitWeeklyCheckin();

    expect(result.ok).toBe(false);
    expect(result.alreadySigned).toBe(false);
  });

  it('submit：成功时 hasSignedThisWeek 与余额都是后端真值', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: {
        ok: true,
        has_signed_this_week: true,
        points_awarded: 5,
        current_points: 125,
        current_week_start: '2026-09-28',
      },
      error: null,
    });

    const result = await submitWeeklyCheckin();

    expect(result.ok).toBe(true);
    expect(result.data.hasSignedThisWeek).toBe(true);
    expect(result.data.pointsAwarded).toBe(5);
    expect(result.data.currentPoints).toBe(125);
  });

  it('status：业务失败必须反映到 ok，否则调用方会拿默认值把余额清零', async () => {
    fm.supabaseRpc.mockResolvedValue({ data: NOT_AUTHENTICATED_PAYLOAD, error: null });

    const result = await getWeeklyCheckinStatus('u1');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('status：上游没给 current_points 时必须是 null，不能用 0 冒充', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: { ok: true, has_signed_this_week: true, current_week_start: '2026-09-28' },
      error: null,
    });

    const result = await getWeeklyCheckinStatus('u1');

    expect(result.ok).toBe(true);
    expect(result.data.currentPoints).toBeNull();
  });

  it('status：成功时余额是后端真值', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: {
        ok: true,
        has_signed_this_week: true,
        current_points: 88,
        current_week_start: '2026-09-28',
      },
      error: null,
    });

    const result = await getWeeklyCheckinStatus('u1');

    expect(result.ok).toBe(true);
    expect(result.data.currentPoints).toBe(88);
  });
});
