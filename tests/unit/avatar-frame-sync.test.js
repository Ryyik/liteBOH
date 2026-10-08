import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 头像框「跨设备同步」的行为锁。
 *
 * 为什么值得单测：这条链路的失败模式**全是静默的** ——
 *   · 新设备登录后不进「我的」页 → 压根没同步（本机仍是空），页面上看不出来是 bug 还是没戴框
 *   · 服务端 url 反查不到清单行 → 旧写法 `frame?.id || 'none'` 会把「戴着的框」写成「无框」，
 *     并且顺手覆盖本机记录（用户在 A 机戴的框，在 B 机登录一下就被抹掉）
 *   · 上库请求没回包就刷新 → 服务端仍是旧值，下次同步又把新框盖回去
 * 三条都是「不做反证就发现不了」的类型，所以这里对每条都写正反两面。
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  listPublished: vi.fn(),
  listUnlocks: vi.fn(),
  currentUserId: 'u1',
  isLoggedIn: true,
}));

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      update: mocks.update,
    }),
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get isLoggedIn() {
      return mocks.isLoggedIn;
    },
    userInfo: { id: mocks.currentUserId },
  }),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/api/avatar-frames-api.js', () => ({
  listPublishedAvatarFrames: mocks.listPublished,
  listMyAvatarFrameUnlocks: mocks.listUnlocks,
}));

/** 线上真实形态的清单（2026-10-06 线上库导出节选）：
 *  white-cat 的 url 已被运营在控制台改成 Cloudinary 绝对地址，
 *  frame-muh01jp3 是运营后来新增的框 —— 内置清单里两个都没有。 */
const DB_FRAMES = [
  { id: 'orange-cat', name: '橙猫手绘', url: '/avatars/frames/orange-cat-frame.png', tier: 'free' },
  {
    id: 'white-cat',
    name: '白绒猫',
    url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1789798615/boh-cloud-plus/admin-avatar-frames/mupu5trhd5napiwg7zew.png',
    tier: 'plus',
    scale: 1.4,
  },
  {
    id: 'hamster',
    name: '仓鼠瓜子',
    url: '/avatars/frames/hamster-frame.png?v=3',
    tier: 'free',
    scale: 1.61,
  },
  {
    id: 'frame-muh01jp3',
    name: '中秋限定',
    url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1790345356/boh-cloud-plus/admin-avatar-frames/tjqkosgvp3x2tqpbpor0.png',
    tier: 'limit',
  },
];

const STORAGE_KEY = 'boh-avatar-frame-id';
const OWNER_KEY = 'boh-avatar-frame-owner';
const PENDING_KEY = 'boh-avatar-frame-pending';

/** 冲掉链式 await（getUser → select → update 全是立即 resolve 的 mock） */
const flush = async (rounds = 10) => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

/** 每个用例重新 import：equippedId 是模块级单例 ref，只在模块首次求值时读一次 localStorage */
async function loadModule() {
  vi.resetModules();
  return import('@/composables/useAvatarFrame.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.currentUserId = 'u1';
  mocks.isLoggedIn = true;
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mocks.maybeSingle.mockResolvedValue({ data: { avatar_frame_url: '' }, error: null });
  mocks.update.mockImplementation(() => ({ eq: mocks.updateEq }));
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.listPublished.mockResolvedValue({ ok: true, data: DB_FRAMES });
  mocks.listUnlocks.mockResolvedValue({ ok: true, data: [] });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: null } });
});

describe('syncAvatarFrameFromServer · 服务端 → 本机', () => {
  it('服务端有 url 且命中清单 → 本机对齐（新设备登录后即戴上）', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    mocks.maybeSingle.mockResolvedValue({
      data: { avatar_frame_url: '/avatars/frames/hamster-frame.png?v=7' },
      error: null,
    });
    const mod = await loadModule();

    const ok = await mod.syncAvatarFrameFromServer();

    expect(ok).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('hamster');
  });

  it('运营新增框（内置清单没有、url 只在 DB 里）也能反查还原', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    mocks.maybeSingle.mockResolvedValue({
      data: { avatar_frame_url: DB_FRAMES[3].url },
      error: null,
    });
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('frame-muh01jp3');
  });

  it('反证 · 服务端 url 反查不到任何清单行 → 保留本机佩戴，绝不回落「无框」', async () => {
    // 旧写法 frame?.id || 'none' 在这里会把本机抹成 none —— 这正是「戴着的框自己消失」的成因
    localStorage.setItem(STORAGE_KEY, 'cow');
    mocks.maybeSingle.mockResolvedValue({
      data: { avatar_frame_url: 'https://example.com/unknown-frame.png' },
      error: null,
    });
    const mod = await loadModule();

    const ok = await mod.syncAvatarFrameFromServer();

    expect(ok).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('cow');
  });

  it('反证 · DB 清单拉不到时不拿内置清单硬比（否则会把本机框误判/覆盖）', async () => {
    localStorage.setItem(STORAGE_KEY, 'cow');
    mocks.listPublished.mockResolvedValue({ ok: false, data: [] });
    mocks.maybeSingle.mockResolvedValue({
      data: { avatar_frame_url: DB_FRAMES[3].url },
      error: null,
    });
    const mod = await loadModule();

    const ok = await mod.syncAvatarFrameFromServer();

    expect(ok).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('cow');
  });

  it('库空而本机戴了框 → 首次上库，写的是框 url（渲染层只认 url）', async () => {
    localStorage.setItem(STORAGE_KEY, 'orange-cat');
    localStorage.setItem(OWNER_KEY, 'u1');
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      avatar_frame_url: '/avatars/frames/orange-cat-frame.png',
    });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('库空且本机是「无框」→ 不产生任何写请求', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    localStorage.setItem(OWNER_KEY, 'u1');
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('换号保护：本机佩戴态归属上一个账号 → 先清本机，绝不搬到新账号', async () => {
    localStorage.setItem(STORAGE_KEY, 'elf-flower');
    localStorage.setItem(OWNER_KEY, 'someone-else');
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('none');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('并发去重：三个 auth 事件同时触发只打一次 profiles 查询', async () => {
    const mod = await loadModule();

    await Promise.all([
      mod.syncAvatarFrameFromServer(),
      mod.syncAvatarFrameFromServer(),
      mod.syncAvatarFrameFromServer(),
    ]);

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });
});

describe('上库失败 → 待补写', () => {
  it('写库报错时留下 PENDING，本机不回滚（用户刚点的框不会自己弹回去）', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    const mod = await loadModule();
    const { equip } = mod.useAvatarFrame();

    mocks.updateEq.mockResolvedValue({ error: { message: 'permission denied' } });
    equip('cow');
    await flush();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('cow');
    expect(localStorage.getItem(PENDING_KEY)).toBe('cow');
  });

  it('下次同步用本机补写（否则服务端旧值会把新框盖回去）', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    mocks.maybeSingle.mockResolvedValue({
      data: { avatar_frame_url: '/avatars/frames/orange-cat-frame.png' },
      error: null,
    });
    const mod = await loadModule();
    const { equip } = mod.useAvatarFrame();

    // 第一次：上库失败 → PENDING=cow
    mocks.updateEq.mockResolvedValue({ error: { message: 'network' } });
    equip('cow');
    await flush();
    expect(localStorage.getItem(PENDING_KEY)).toBe('cow');

    // 第二次：网络恢复 → 以本机为准补写，且不被服务端旧值（orange-cat）覆盖
    mocks.updateEq.mockResolvedValue({ error: null });
    await mod.syncAvatarFrameFromServer();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('cow');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(mocks.update).toHaveBeenLastCalledWith({
      avatar_frame_url: '/avatars/frames/cow-frame.png',
    });
  });

  it('待补写的框已下架（清单里没有）→ 丢弃标记，不无限重试', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    localStorage.setItem(PENDING_KEY, 'frame-deleted-long-ago');
    localStorage.setItem(OWNER_KEY, 'u1');
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('反证 · 清单拉不到时保留待补写标记（不拿内置清单硬判「已下架」）', async () => {
    localStorage.setItem(STORAGE_KEY, 'none');
    // 运营新增框：内置清单里本来就没有，若用内置清单判定会被误清
    localStorage.setItem(PENDING_KEY, 'frame-muh01jp3');
    localStorage.setItem(OWNER_KEY, 'u1');
    mocks.listPublished.mockResolvedValue({ ok: false, data: [] });
    const mod = await loadModule();

    await mod.syncAvatarFrameFromServer();

    expect(localStorage.getItem(PENDING_KEY)).toBe('frame-muh01jp3');
  });
});

describe('登出 / 注册时机', () => {
  it('SIGNED_OUT → 清空本机佩戴态与两个同步标记', async () => {
    localStorage.setItem(STORAGE_KEY, 'cow');
    localStorage.setItem(OWNER_KEY, 'u1');
    localStorage.setItem(PENDING_KEY, 'cow');
    const mod = await loadModule();

    mod.initAvatarFrameSync();
    const handler = mocks.onAuthStateChange.mock.calls[0][0];
    handler('SIGNED_OUT', null);

    expect(localStorage.getItem(STORAGE_KEY)).toBe('none');
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('initAvatarFrameSync 是唯一注册点，重复调用不叠加监听', async () => {
    const mod = await loadModule();

    mod.initAvatarFrameSync();
    mod.initAvatarFrameSync();

    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('SIGNED_IN 的同步挪到回调栈之外（supabase-js 禁止在回调里 await 其它 auth 调用）', async () => {
    // 观测点用 getUser 而不是 maybeSingle：sync 走到第一个 await 之前会**同步**调用
    // supabase.auth.getUser()，所以「回调栈内有没有发起 auth 调用」在这里才看得见
    // （若用 maybeSingle，无论挪不挪出栈，回调返回时它都还没被调到，是条假断言）。
    localStorage.setItem(STORAGE_KEY, 'none');
    const mod = await loadModule();
    mod.initAvatarFrameSync();
    await flush(20); // 等 init 里的冷启动兜底同步跑完
    mocks.getUser.mockClear();
    mocks.maybeSingle.mockClear();

    const handler = mocks.onAuthStateChange.mock.calls[0][0];
    handler('SIGNED_IN', { user: { id: 'u1' } });
    expect(mocks.getUser).not.toHaveBeenCalled(); // 回调栈内没发起 auth 调用

    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush(20);
    expect(mocks.getUser).toHaveBeenCalledTimes(1); // 出栈后补上
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
