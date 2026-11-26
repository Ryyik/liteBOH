/**
 * 注册第 ③ 屏的写入顺序守卫（2026-11-26）
 *
 * 契约（迁移 2026112506 + `completeSignupIdentity` 文件头）：
 *   `profiles.signup_completed_at` 的语义是「BOH ID **与密码**都已设置」。
 *   它同时是「同一邮箱允许继续注册」的开关 —— 为 NULL 放行、非 NULL 挡回登录。
 *
 * 所以它**必须最后写**。反例（曾经的真实实现）：
 *   把标记塞进第一次 profiles update（和 username 同一 patch）⇒ 密码那步一旦失败
 *   （网络 / 服务端强度策略 / 限流）而用户关掉页面，账号就变成
 *   「已建完（不允许重新注册） + 没有密码（也登不进来）」= 邮箱被永久锁死。
 *
 * 这条测试锁的是**调用顺序**，不是某个字段有没有出现在源码里 ——
 * 改实现（合并 patch、换 RPC）不会误伤，但「提前盖章」一定变红。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ops = [];
let updateUserError = null;
let markerError = null;

const profilesUpdate = (patch) => {
  const isMarker = Object.prototype.hasOwnProperty.call(patch, 'signup_completed_at');
  ops.push({ op: 'profiles.update', patch: { ...patch }, isMarker });
  return {
    eq: async () => ({ error: isMarker ? markerError : null }),
  };
};

const mockFrom = (table) => {
  if (table !== 'profiles') throw new Error(`unexpected table: ${table}`);
  return {
    // isUsernameAvailable 的查重链：select → ilike → limit
    select: () => ({
      ilike: () => ({
        limit: async () => ({ data: [], error: null }),
      }),
    }),
    update: profilesUpdate,
  };
};

const mockAuth = {
  getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  updateUser: async () => {
    ops.push({ op: 'auth.updateUser' });
    return { error: updateUserError };
  },
};

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { from: mockFrom, auth: mockAuth, rpc: vi.fn() },
}));

const { completeSignupIdentity } = await import('@/utils/api/auth-api.js');

const PAYLOAD = { username: 'ryyik_fan', password: 'Passw0rd!x' };

const opsOf = (op) => ops.filter((entry) => entry.op === op);

beforeEach(() => {
  ops.length = 0;
  updateUserError = null;
  markerError = null;
});

describe('注册第 ③ 屏：建完标记必须最后写', () => {
  it('成功路径：ID/生日 → 密码 → 建完标记（且第一次 patch 不含标记）', async () => {
    const result = await completeSignupIdentity(PAYLOAD);

    expect(result.ok).toBe(true);
    expect(result.step).toBe('done');

    expect(ops.map((entry) => entry.op)).toEqual([
      'profiles.update',
      'auth.updateUser',
      'profiles.update',
    ]);
    expect(ops[0].isMarker).toBe(false);
    expect(ops[0].patch.username).toBe('ryyik_fan');
    expect(ops[2].isMarker).toBe(true);
  });

  it('密码失败：绝不能留下「已建完但没密码」的账号（标记不写）', async () => {
    updateUserError = { message: 'Password is too weak', code: 'weak_password' };

    const result = await completeSignupIdentity(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.step).toBe('password');
    // 只应有一次 profiles 写入，且不是标记
    expect(opsOf('profiles.update')).toHaveLength(1);
    expect(opsOf('profiles.update')[0].isMarker).toBe(false);
    expect(opsOf('auth.updateUser')).toHaveLength(1);
  });

  it('标记写入失败不阻断注册（账号此时已可用）', async () => {
    markerError = { message: 'network down' };

    const result = await completeSignupIdentity(PAYLOAD);

    expect(result.ok).toBe(true);
    expect(result.step).toBe('done');
    expect(opsOf('profiles.update').some((entry) => entry.isMarker)).toBe(true);
  });
});
