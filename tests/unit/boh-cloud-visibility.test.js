import { beforeEach, describe, expect, it, vi } from 'vitest';

// boh-cloud-api 顶层 import supabase-client 与 request-core，先钉住 supabase。
// auth.getUser / from(...).select().eq()... 链式查询用「可编程 thenable」模拟。
const supabaseMocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    auth: { getUser: supabaseMocks.authGetUser },
    from: supabaseMocks.fromMock,
    functions: { invoke: vi.fn().mockResolvedValue({}) },
    rpc: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  normalizeCloudEntryRow,
  setMyCloudEntryVisibility,
} from '../../src/utils/api/boh-cloud-api.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

/** 构造一条 thenable 链：每个方法都返回自身，maybeSingle/single 吐出预置结果 */
function createQueryChain(results) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    maybeSingle: vi.fn(
      async () =>
        results.maybeSingle ?? { data: results.data ?? null, error: results.error ?? null },
    ),
    then(resolve) {
      return Promise.resolve(resolve(results.data ?? null));
    },
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeCloudEntryRow 的 visibility 契约', () => {
  const baseRow = {
    id: ENTRY_ID,
    user_id: USER_A,
    entry_date: '2026-09-28',
    title: '手记',
    content_text: '正文',
    content_blocks: [{ type: 'text', text: '正文' }],
    created_at: '2026-09-28T08:00:00+08:00',
    updated_at: '2026-09-28T08:00:00+08:00',
  };

  it('DB 里的 public 不再被改写成 private', () => {
    const row = normalizeCloudEntryRow({ ...baseRow, visibility: 'public' });
    expect(row.visibility).toBe('public');
  });

  it('private / 非法值 / 缺失都归一为 private', () => {
    expect(normalizeCloudEntryRow({ ...baseRow, visibility: 'private' }).visibility).toBe(
      'private',
    );
    expect(normalizeCloudEntryRow({ ...baseRow, visibility: 'shared' }).visibility).toBe('private');
    expect(normalizeCloudEntryRow(baseRow).visibility).toBe('private');
  });
});

describe('setMyCloudEntryVisibility', () => {
  it('未登录用户 / 非法 id 直接拒绝，不发请求', async () => {
    const badUser = await setMyCloudEntryVisibility('not-a-uuid', ENTRY_ID, 'public');
    expect(badUser.ok).toBe(false);
    expect(badUser.error.code).toBe('NOT_AUTHENTICATED');

    const badEntry = await setMyCloudEntryVisibility(USER_A, 'legacy-2026-01-01', 'public');
    expect(badEntry.ok).toBe(false);
    expect(badEntry.error.code).toBe('INVALID_ENTRY_ID');
    expect(supabaseMocks.fromMock).not.toHaveBeenCalled();
  });

  it('会话用户与目标用户不匹配 → AUTH_MISMATCH', async () => {
    supabaseMocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_B } } });
    const result = await setMyCloudEntryVisibility(USER_A, ENTRY_ID, 'public');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('AUTH_MISMATCH');
  });

  it('论坛同步条目禁止公开（FORUM_SYNCED_CLOUD_ENTRY_LOCKED）', async () => {
    supabaseMocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_A } } });
    supabaseMocks.fromMock.mockReturnValue(
      createQueryChain({
        maybeSingle: {
          data: { id: ENTRY_ID, source: 'forum', visibility: 'private' },
          error: null,
        },
      }),
    );

    const result = await setMyCloudEntryVisibility(USER_A, ENTRY_ID, 'public');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('FORUM_SYNCED_CLOUD_ENTRY_LOCKED');
  });

  it('状态相同 → 幂等成功，不发起 update', async () => {
    supabaseMocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_A } } });
    const chain = createQueryChain({
      maybeSingle: { data: { id: ENTRY_ID, source: 'manual', visibility: 'public' }, error: null },
    });
    supabaseMocks.fromMock.mockReturnValue(chain);

    const result = await setMyCloudEntryVisibility(USER_A, ENTRY_ID, 'public');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: ENTRY_ID, visibility: 'public' });
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('private → public：update 带 visibility 并返回归一化后的条目', async () => {
    supabaseMocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_A } } });
    const updatedRow = {
      id: ENTRY_ID,
      user_id: USER_A,
      entry_date: '2026-09-28',
      title: '手记',
      visibility: 'public',
      content_text: '正文',
      content_blocks: [{ type: 'text', text: '正文' }],
      created_at: '2026-09-28T08:00:00+08:00',
      updated_at: '2026-09-28T09:00:00+08:00',
    };
    // 第一次 from() = 守卫查询（private），第二次 from() = update（返回公开后的行）
    const lookupChain = createQueryChain({
      maybeSingle: { data: { id: ENTRY_ID, source: 'manual', visibility: 'private' }, error: null },
    });
    const updateChain = createQueryChain({ maybeSingle: { data: updatedRow, error: null } });
    supabaseMocks.fromMock.mockReturnValueOnce(lookupChain).mockReturnValueOnce(updateChain);

    const result = await setMyCloudEntryVisibility(USER_A, ENTRY_ID, 'public');
    expect(result.ok).toBe(true);
    expect(result.data.visibility).toBe('public');
    expect(updateChain.update).toHaveBeenCalledWith({ visibility: 'public' });
  });
});
