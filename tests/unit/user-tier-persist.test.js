import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A4：用户档位缓存持久化（2026-11-16）
 *
 * 这条改动的价值全在「省一次往返 + 消掉昵称先灰后染色」，但它的**失败模式是静默的**：
 * 缓存写错、TTL 写错、或者水合压根没跑，页面照样能显示，只是慢一点、闪一下 ——
 * 不做反证根本发现不了。更危险的是反向：如果「决策路径」也认了旧缓存，
 * 订阅过期的用户会被本地闸门放行（配额 / 头像框解锁），而这在 UI 上看不出来。
 *
 * 所以这里锁三件事：
 *   1. 回访：持久化档位直接可用，批量预取**不发 RPC**
 *   2. 决策路径（fetchUserTier）**不认**持久化条目，仍然真实查询
 *   3. 真实查询结果会落盘，且用的是持久 TTL（2h）而不是内存 TTL（5min）
 */

const KEY = 'boh_user_tier_cache_v1';

const mocks = vi.hoisted(() => ({
  rpcSingle: vi.fn(),
  rpcBatch: vi.fn(),
}));

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    rpc: (name, params) =>
      name === 'get_user_subscription_tiers' ? mocks.rpcBatch(params) : mocks.rpcSingle(params),
  },
}));

/** 每次重置模块图：水合是模块导入期的一次性动作，不重置就测不到 */
async function loadTierModule() {
  vi.resetModules();
  return import('@/composables/useUserTier.js');
}

function seedPersisted(entries) {
  localStorage.setItem(KEY, JSON.stringify({ v: 1, entries }));
}

function readPersisted() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.rpcSingle.mockResolvedValue({ data: 'free', error: null });
  mocks.rpcBatch.mockResolvedValue({ data: [], error: null });
});

describe('A4 档位缓存持久化', () => {
  it('回访：水合后立刻能染色，批量预取不再发 RPC', async () => {
    seedPersisted({ u1: { tier: 'plus', expiresAt: Date.now() + 60_000 } });

    const { useUserTier } = await loadTierModule();
    const { fetchUserTiersBatch, getNicknameClass, getUserTierCode } = useUserTier();

    // 导入即水合 —— 渲染第一帧就有配色，不用等任何请求
    expect(getNicknameClass('u1')).toBe('nickname-blue');
    expect(getUserTierCode('u1')).toBe('plus');

    const map = await fetchUserTiersBatch(['u1']);
    expect(map.get('u1')).toBe('plus');
    expect(mocks.rpcBatch).not.toHaveBeenCalled();
    expect(mocks.rpcSingle).not.toHaveBeenCalled();
  });

  it('决策路径不认持久化：订阅过期后配额/解锁仍走真实查询', async () => {
    seedPersisted({ u1: { tier: 'plus', expiresAt: Date.now() + 60_000 } });
    mocks.rpcSingle.mockResolvedValue({ data: 'free', error: null });

    const { useUserTier } = await loadTierModule();
    await expect(useUserTier().fetchUserTier('u1')).resolves.toBe('free');
    expect(mocks.rpcSingle).toHaveBeenCalledTimes(1);
  });

  it('过期条目被丢弃，不会拿旧档位冒充新鲜值', async () => {
    seedPersisted({ u1: { tier: 'plus', expiresAt: Date.now() - 1 } });
    mocks.rpcBatch.mockResolvedValue({ data: [], error: null });

    const { useUserTier } = await loadTierModule();
    const { getNicknameClass, fetchUserTiersBatch } = useUserTier();

    expect(getNicknameClass('u1')).toBe('');
    const map = await fetchUserTiersBatch(['u1']);
    expect(mocks.rpcBatch).toHaveBeenCalledTimes(1);
    expect(map.get('u1')).toBe('free');
  });

  it('真实查询结果会落盘，且用持久 TTL（2h）而不是内存 TTL（5min）', async () => {
    mocks.rpcBatch.mockResolvedValue({ data: [{ user_id: 'u2', tier: 'pro' }], error: null });

    const { useUserTier, flushUserTierCache } = await loadTierModule();
    await useUserTier().fetchUserTiersBatch(['u2']);
    flushUserTierCache();

    const persisted = readPersisted();
    expect(persisted.v).toBe(1);
    expect(persisted.entries.u2.tier).toBe('pro');
    // 关键：如果这里写成内存的 5 分钟，回访基本命中不到，整个改动等于白做
    expect(persisted.entries.u2.expiresAt).toBeGreaterThan(Date.now() + HOUR);
  });

  it('落盘内容里不含空档位，也不会把空串写进去', async () => {
    mocks.rpcBatch.mockResolvedValue({ data: [{ user_id: 'u3', tier: 'free' }], error: null });

    const { useUserTier, flushUserTierCache } = await loadTierModule();
    await useUserTier().fetchUserTiersBatch(['u3']);
    flushUserTierCache();

    const persisted = readPersisted();
    expect(persisted.entries.u3.tier).toBe('free');
    expect(
      Object.values(persisted.entries).every((e) => typeof e.tier === 'string' && e.tier),
    ).toBe(true);
  });

  it('坏数据不炸：非法 JSON 与版本不符都退化成空缓存', async () => {
    localStorage.setItem(KEY, '{not json');
    let mod = await loadTierModule();
    expect(mod.useUserTier().getNicknameClass('u1')).toBe('');

    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 2, entries: { u1: { tier: 'plus', expiresAt: Date.now() + 60_000 } } }),
    );
    mod = await loadTierModule();
    expect(mod.useUserTier().getNicknameClass('u1')).toBe('');
  });

  it('登出清理名单覆盖这个 key（否则换账号能看出上一任访问过谁）', async () => {
    seedPersisted({ u1: { tier: 'plus', expiresAt: Date.now() + 60_000 } });
    // 测试跑在 node 环境，没有 window；safe-storage 用 window.localStorage 判空
    vi.stubGlobal('window', { localStorage: globalThis.localStorage });
    try {
      const { clearSensitiveLocalStorage } = await import('@/utils/safe-storage.js');
      clearSensitiveLocalStorage();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
