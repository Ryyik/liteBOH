import { describe, expect, it, vi } from 'vitest';

/**
 * 极简用户列表的数据入口（`/admin/users-minimal`）。
 *
 * 守两件事：
 *   ① **关键词必须被转义**。PostgREST 的 `.or()` 是拼在 URL 上的语法，
 *      用户输入一个 `%` 就能把整表捞出来、输入 `(` 直接 400 —— 这不是「不好看」，
 *      是「一个字符就能改变查询语义」。
 *   ② **列清单不能放进敏感列**。profiles 没有表级 SELECT（email 不在表里，
 *      shipping_* / pushplus_token 按 H-1 收窄过），多写一列就是整条查询 42501。
 */

const calls = [];
let nextResult = { data: [], error: null, count: 0 };

const makeBuilder = () => {
  const builder = {
    select: (columns, options) => {
      calls.push({ op: 'select', columns, options });
      return builder;
    },
    order: (column, options) => {
      calls.push({ op: 'order', column, options });
      return builder;
    },
    range: (from, to) => {
      calls.push({ op: 'range', from, to });
      return builder;
    },
    or: (expression) => {
      calls.push({ op: 'or', expression });
      return builder;
    },
    then: (resolve) => resolve(nextResult),
  };
  return builder;
};

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    from: (table) => {
      calls.push({ op: 'from', table });
      return makeBuilder();
    },
  },
}));

const { fetchAdminProfiles, PROFILE_LIST_COLUMNS, sanitizeProfileKeyword } =
  await import('@/utils/api/data-admin-profile-api.js');

const reset = (result = { data: [], error: null, count: 0 }) => {
  calls.length = 0;
  nextResult = result;
};

describe('sanitizeProfileKeyword', () => {
  it('去掉首尾空白、内部多余空格压成一个', () => {
    expect(sanitizeProfileKeyword('   小 明   ')).toBe('小 明');
  });

  it('ilike 通配符与 or() 语法字符一律抹掉', () => {
    expect(sanitizeProfileKeyword('%')).toBe('');
    expect(sanitizeProfileKeyword('a%(b),c*')).toBe('a b c');
  });

  it('null / undefined / 数字都安全', () => {
    expect(sanitizeProfileKeyword(null)).toBe('');
    expect(sanitizeProfileKeyword(undefined)).toBe('');
    expect(sanitizeProfileKeyword(123)).toBe('123');
  });
});

describe('fetchAdminProfiles', () => {
  it('不传关键词时不拼 .or()（空条件会把整表拖出来）', async () => {
    reset();
    await fetchAdminProfiles({});
    expect(calls.some((c) => c.op === 'or')).toBe(false);
    expect(calls.find((c) => c.op === 'from').table).toBe('profiles');
  });

  it('关键词去掉通配符后再拼进 or()（`%` 不会变成「匹配所有」）', async () => {
    reset();
    await fetchAdminProfiles({ keyword: '% 小明%' });
    const orCall = calls.find((c) => c.op === 'or');
    expect(orCall.expression).toBe('username.ilike.%小明%,role.ilike.%小明%');
  });

  it('只取列表列：不含 email / shipping_*（否则 42501）', async () => {
    reset();
    await fetchAdminProfiles({});
    const selectCall = calls.find((c) => c.op === 'select');
    expect(selectCall.columns).toBe(PROFILE_LIST_COLUMNS);
    expect(selectCall.options).toEqual({ count: 'exact' });
    ['email', 'shipping_recipient', 'shipping_phone', 'shipping_address', 'pushplus_token'].forEach(
      (forbidden) => {
        expect(selectCall.columns).not.toContain(forbidden);
      },
    );
    expect(selectCall.columns).toContain('username');
  });

  it('分页窗口按 offset/limit 计算，并按注册时间倒序', async () => {
    reset();
    await fetchAdminProfiles({ offset: 100, limit: 20 });
    const range = calls.find((c) => c.op === 'range');
    expect(range).toMatchObject({ from: 100, to: 119 });
    const order = calls.find((c) => c.op === 'order');
    expect(order.column).toBe('join_date');
    expect(order.options.ascending).toBe(false);
  });

  it('limit 被夹到 1..200（非正数/超大都按边界走）', async () => {
    reset();
    await fetchAdminProfiles({ limit: 100000 });
    expect(calls.find((c) => c.op === 'range')).toMatchObject({ from: 0, to: 199 });

    reset();
    await fetchAdminProfiles({ limit: 20 });
    expect(calls.find((c) => c.op === 'range')).toMatchObject({ from: 0, to: 19 });

    // `limit: 0` 的语义是「没指定」→ 回落默认 50，而不是「取零条」
    reset();
    await fetchAdminProfiles({ limit: 0 });
    expect(calls.find((c) => c.op === 'range')).toMatchObject({ from: 0, to: 49 });
  });

  it('没有 count 时 total 是 null（不是 0 —— 别把「数不准」当成「没有数据」）', async () => {
    reset({ data: [{ id: 'a' }], error: null, count: null });
    const result = await fetchAdminProfiles({});
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBeNull();
  });

  it('查询报错必须抛出来（静默返回空数组 = 把「查不动」说成「没有」）', async () => {
    reset({ data: null, error: { message: 'permission denied' }, count: null });
    await expect(fetchAdminProfiles({})).rejects.toThrow('permission denied');
  });
});
