import { describe, expect, it, vi } from 'vitest';
import {
  escapeLikePattern,
  resolveEmailFromLoginId,
} from '../../supabase/functions/_shared/resolve-login-id.ts';

/**
 * 假 service client —— 刻意镜像**线上真实 schema**：
 *   profiles 只有 id / username（email 列已在迁移 2026090911 drop），
 *   auth.users 才有 email。
 * 因此若实现想从 profiles 读 email，只会拿到 undefined 而失败。
 *
 * 这也是本测试集的反证意义：老实现（profiles select email + 判空）
 * 在这套假数据下必然返回 UNKNOWN_ACCOUNT —— 测试会红。
 */
const makeFakeClient = ({ profiles = [], authUsers = {}, profilesError = null } = {}) => {
  const calls = { select: [], ilike: [], limit: [], getUserById: [] };
  const rows = profiles.map((row) => ({ ...row }));

  const client = {
    from(table) {
      calls.from = (calls.from || []).concat(table);
      return {
        select(columns) {
          calls.select.push(columns);
          return {
            ilike(column, pattern) {
              calls.ilike.push({ column, pattern });
              return {
                limit(count) {
                  calls.limit.push(count);
                  return Promise.resolve({ data: profilesError ? null : rows, error: profilesError });
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        getUserById(userId) {
          calls.getUserById.push(userId);
          const email = authUsers[userId];
          if (email === undefined) {
            return Promise.resolve({ data: { user: null }, error: { message: 'user not found' } });
          }
          if (email === null) {
            return Promise.resolve({ data: { user: { id: userId, email: null } }, error: null });
          }
          return Promise.resolve({ data: { user: { id: userId, email } }, error: null });
        },
      },
    },
  };

  return { client, calls };
};

const USER_A = '11111111-2222-3333-4444-555555555555';

describe('resolveEmailFromLoginId：邮箱唯一真源是 auth.users', () => {
  it('输入本身就是邮箱 → 直接小写返回，且不查 profiles（零枚举查询）', async () => {
    const { client, calls } = makeFakeClient();
    const result = await resolveEmailFromLoginId(client, '  SOMEONE@Example.COM  ');

    expect(result).toEqual({ ok: true, email: 'someone@example.com' });
    expect(calls.from).toBeUndefined();
    expect(calls.getUserById).toHaveLength(0);
  });

  it('输入方块 ID → 邮箱取自 auth.users 的 Admin API', async () => {
    const { client, calls } = makeFakeClient({
      profiles: [{ id: USER_A, username: '瑞一颗' }],
      authUsers: { [USER_A]: 'Owner@Example.com' },
    });

    const result = await resolveEmailFromLoginId(client, '瑞一颗');

    expect(result).toEqual({ ok: true, email: 'owner@example.com' });
    expect(calls.getUserById).toEqual([USER_A]);
  });

  it('回归：profiles 行里没有 email 列时，仍然能解析出邮箱（老实现会在这里失败）', async () => {
    const profilesWithoutEmail = [{ id: USER_A, username: 'boh_user' }];
    // 显式断言假数据确实不含 email —— 否则这条测试就退化成无效断言
    expect(Object.keys(profilesWithoutEmail[0])).not.toContain('email');

    const { client } = makeFakeClient({
      profiles: profilesWithoutEmail,
      authUsers: { [USER_A]: 'boh@example.com' },
    });

    await expect(resolveEmailFromLoginId(client, 'boh_user')).resolves.toEqual({
      ok: true,
      email: 'boh@example.com',
    });
  });

  it('只查 id 与 username，不 select email', async () => {
    const { client, calls } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'boh_user' }],
      authUsers: { [USER_A]: 'boh@example.com' },
    });

    await resolveEmailFromLoginId(client, 'boh_user');

    expect(calls.select).toEqual(['id, username']);
    expect(calls.select.join('')).not.toContain('email');
  });

  it('方块 ID 大小写不敏感且去空格', async () => {
    const { client } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'Boh_User' }],
      authUsers: { [USER_A]: 'boh@example.com' },
    });

    await expect(resolveEmailFromLoginId(client, '  boh_user  ')).resolves.toEqual({
      ok: true,
      email: 'boh@example.com',
    });
  });

  it('账号不存在 → UNKNOWN_ACCOUNT，且不触碰 Admin API', async () => {
    const { client, calls } = makeFakeClient({ profiles: [{ id: USER_A, username: 'other' }] });

    const result = await resolveEmailFromLoginId(client, 'nobody');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNKNOWN_ACCOUNT');
    expect(calls.getUserById).toHaveLength(0);
  });

  it('ILIKE 命中但非完全相等（如 username 含通配符语义）→ 不误判为命中', async () => {
    const { client } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'abc' }],
      authUsers: { [USER_A]: 'abc@example.com' },
    });

    const result = await resolveEmailFromLoginId(client, 'ab');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNKNOWN_ACCOUNT');
  });

  it('重名 → DUPLICATED_USERNAME', async () => {
    const { client } = makeFakeClient({
      profiles: [
        { id: USER_A, username: 'dup_user' },
        { id: 'aaaa1111-2222-3333-4444-555555555555', username: 'DUP_USER' },
      ],
      authUsers: { [USER_A]: 'a@example.com' },
    });

    const result = await resolveEmailFromLoginId(client, 'dup_user');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('DUPLICATED_USERNAME');
  });

  it('auth.users 里没有邮箱 → EMAIL_MISSING（不降级成「账号不存在」）', async () => {
    const { client } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'no_mail' }],
      authUsers: { [USER_A]: null },
    });

    const result = await resolveEmailFromLoginId(client, 'no_mail');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('EMAIL_MISSING');
  });

  it('profiles 查询报错 → UNKNOWN_ACCOUNT（不泄露内部错误细节）', async () => {
    const { client } = makeFakeClient({ profilesError: { message: 'boom' } });

    const result = await resolveEmailFromLoginId(client, 'anyone');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNKNOWN_ACCOUNT');
  });

  it('空输入 → INVALID_INPUT', async () => {
    const { client, calls } = makeFakeClient();

    await expect(resolveEmailFromLoginId(client, '   ')).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(calls.from).toBeUndefined();
  });

  it('LIKE 通配符被转义：% _ \\ 一律不当作通配符下发', async () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');

    const { client, calls } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'axb_c' }],
      authUsers: { [USER_A]: 'x@example.com' },
    });

    // 传入含通配符的值：转义后不匹配任何真实用户
    const result = await resolveEmailFromLoginId(client, 'a%b');

    expect(calls.ilike).toEqual([{ column: 'username', pattern: 'a\\%b' }]);
    expect(result.ok).toBe(false);
  });

  it('limit 固定为 10（重名只用小样本判定）', async () => {
    const { client, calls } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'x' }],
      authUsers: { [USER_A]: 'x@example.com' },
    });

    await resolveEmailFromLoginId(client, 'x');

    expect(calls.limit).toEqual([10]);
  });

  it('两个不同用户名各自解析到自己的邮箱（无串号）', async () => {
    const USER_B = 'bbbb1111-2222-3333-4444-555555555555';
    const { client } = makeFakeClient({
      profiles: [
        { id: USER_A, username: 'alpha' },
        { id: USER_B, username: 'beta' },
      ],
      authUsers: { [USER_A]: 'alpha@example.com', [USER_B]: 'beta@example.com' },
    });

    await expect(resolveEmailFromLoginId(client, 'alpha')).resolves.toEqual({
      ok: true,
      email: 'alpha@example.com',
    });
    await expect(resolveEmailFromLoginId(client, 'beta')).resolves.toEqual({
      ok: true,
      email: 'beta@example.com',
    });
  });

  it('绝不把邮箱回传给调用方的契约：返回值只含 ok 与 email（服务端内部使用）', async () => {
    const { client } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'boh_user' }],
      authUsers: { [USER_A]: 'boh@example.com' },
    });

    const result = await resolveEmailFromLoginId(client, 'boh_user');

    expect(Object.keys(result).sort()).toEqual(['email', 'ok']);
  });
});

describe('escapeLikePattern：单独口径', () => {
  it('空值与普通值原样', () => {
    expect(escapeLikePattern('')).toBe('');
    expect(escapeLikePattern('normal_user')).toBe('normal\\_user');
  });

  it('null / undefined 不抛错', () => {
    expect(escapeLikePattern(undefined)).toBe('');
    expect(escapeLikePattern(null)).toBe('');
  });
});

describe('auth-login EF 不再依赖已 drop 的 profiles.email', () => {
  it('index.ts 通过共享模块解析登录标识', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');

    expect(source).toContain("from '../_shared/resolve-login-id.ts'");
    expect(source).toContain('resolveEmailFromLoginId');
    // 不该再出现从 profiles 取 email 的写法
    expect(source).not.toMatch(/from\('profiles'\)[\s\S]{0,80}select\('email/);
    expect(source).not.toContain(".select('email, username')");
  });

  it('共享模块内不再出现 profiles.email 读取', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile('supabase/functions/_shared/resolve-login-id.ts', 'utf-8');

    expect(source).not.toContain('select(\'id, email');
    expect(source).not.toContain(".select('email");
    expect(source).toContain('auth.admin.getUserById');
  });

  it('未使用的本地实现已移除（导出唯一来源是共享模块）', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');
    expect(source).not.toContain('const resolveEmailFromLoginId = async');
  });
});

describe('回归守卫：EF 关键行为未被破坏', () => {
  it('保留限流、封禁复核与 EMAIL_NOT_CONFIRMED 映射', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');

    expect(source).toContain('checkRateLimitDb');
    expect(source).toContain('EMAIL_NOT_CONFIRMED');
    expect(source).toContain('请先验证邮箱后再登录');
    expect(source).toContain('INVALID_CREDENTIALS');
  });

  it('登录成功后返回 session 对象（内含 access_token/refresh_token），供前端 setSession 采纳', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');

    // 前端要 setSession({ access_token, refresh_token })，所以必须回传整个 session
    expect(source).toMatch(/session:\s*authData\.session/);
    expect(source).toMatch(/user:\s*authData\.user/);
  });
});

describe('测试自身有效性（防止断言空转）', () => {
  it('假 client 的 profiles 行确实不含 email 字段', async () => {
    const { client } = makeFakeClient({
      profiles: [{ id: USER_A, username: 'boh_user' }],
      authUsers: { [USER_A]: 'boh@example.com' },
    });

    const res = await client.from('profiles').select('id, username').ilike('username', 'x').limit(10);
    expect(res.data[0]).not.toHaveProperty('email');
  });

  it('vi 可用（避免 mock 能力静默失效）', () => {
    const fn = vi.fn(() => 1);
    fn();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
