/**
 * 登录标识（方块 ID / 邮箱）→ 邮箱解析
 *
 * 背景（务必保留）：
 *   `public.profiles.email` 已在迁移 2026090911 中 drop —— 邮箱只存在 `auth.users`。
 *   因此这里对 profiles 只查 `id, username`，邮箱必须经 service_role 的 Admin API
 *   `auth.admin.getUserById()` 取。**禁止**再从 profiles 读 email（列不存在，
 *   会静默变成「账号不存在」，历史上就是这样让 auth-login EF 整条链路失效的）。
 *
 * 安全约束：解析结果（邮箱）**只能留在服务端**，用于随后的 signInWithPassword。
 *   绝不可把邮箱回传给客户端 —— 这正是 public.resolve_email_for_login RPC 的漏洞
 *   （匿名可枚举用户名→邮箱），本模块是它的服务端替代实现。
 */

export type LoginIdResolution =
  | { ok: true; email: string }
  | { ok: false; code: string; message: string };

/** 查询 profiles 时用到的行形状：只有 id 与 username（email 不存在） */
export interface ProfileLookupRow {
  id?: string | null;
  username?: string | null;
}

/** 只用到 service client 的这两个能力，便于测试注入假实现 */
export interface LoginIdLookupClient {
  from: (table: string) => {
    select: (columns: string) => {
      ilike: (column: string, pattern: string) => {
        limit: (count: number) => PromiseLike<{ data: ProfileLookupRow[] | null; error: unknown }>;
      };
    };
  };
  auth: {
    admin: {
      getUserById: (userId: string) => PromiseLike<{
        data: { user?: { email?: string | null } | null } | null;
        error: unknown;
      }>;
    };
  };
}

/** LIKE 通配符转义：用户名里的 % _ \ 不能当通配符用 */
export const escapeLikePattern = (value = ''): string =>
  String(value || '').replace(/[\\%_]/g, '\\$&');

const normalize = (value: unknown): string => String(value ?? '').trim();

export const resolveEmailFromLoginId = async (
  serviceClient: LoginIdLookupClient,
  loginId: string,
): Promise<LoginIdResolution> => {
  const normalizedLoginId = normalize(loginId);

  if (!normalizedLoginId) {
    return { ok: false, code: 'INVALID_INPUT', message: '请输入方块 ID 或邮箱地址。' };
  }

  // 直接是邮箱 → 无需查库（也避免了任何一次用户名枚举查询）
  if (normalizedLoginId.includes('@')) {
    return { ok: true, email: normalizedLoginId.toLowerCase() };
  }

  const { data: profileRows, error: lookupError } = await serviceClient
    .from('profiles')
    .select('id, username')
    .ilike('username', escapeLikePattern(normalizedLoginId))
    .limit(10);

  const exactProfileRows = Array.isArray(profileRows)
    ? profileRows.filter(
        (row) => normalize(row?.username).toLowerCase() === normalizedLoginId.toLowerCase(),
      )
    : [];

  if (lookupError || exactProfileRows.length === 0) {
    return { ok: false, code: 'UNKNOWN_ACCOUNT', message: '登录失败：未找到该方块 ID 对应的账号。' };
  }

  if (exactProfileRows.length > 1) {
    return {
      ok: false,
      code: 'DUPLICATED_USERNAME',
      message: '登录失败：该方块 ID 存在重复记录，请联系管理员处理。',
    };
  }

  const userId = normalize(exactProfileRows[0]?.id);
  if (!userId) {
    return { ok: false, code: 'UNKNOWN_ACCOUNT', message: '登录失败：未找到该方块 ID 对应的账号。' };
  }

  // 邮箱的唯一真源：auth.users（经 service_role Admin API）
  const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(userId);
  const email = normalize(userData?.user?.email).toLowerCase();

  if (userError || !email) {
    return { ok: false, code: 'EMAIL_MISSING', message: '登录失败：账号缺少邮箱记录，请联系管理员。' };
  }

  return { ok: true, email };
};
