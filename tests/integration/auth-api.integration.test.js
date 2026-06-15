import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSignUp: vi.fn(),
  authSignInWithPassword: vi.fn(),
  authSignOut: vi.fn(),
  authGetUser: vi.fn(),
  authResend: vi.fn(),
  authUpdateUser: vi.fn(),
  authVerifyOtp: vi.fn(),
  authResetPasswordForEmail: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    auth: {
      signUp: mocks.authSignUp,
      signInWithPassword: mocks.authSignInWithPassword,
      signOut: mocks.authSignOut,
      getUser: mocks.authGetUser,
      resend: mocks.authResend,
      updateUser: mocks.authUpdateUser,
      verifyOtp: mocks.authVerifyOtp,
      resetPasswordForEmail: mocks.authResetPasswordForEmail,
    },
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  updatePassword,
  deleteMyAccount,
  getAllProfiles,
  getProfilesPage,
} from '../../src/utils/api/auth-api.js';

function createQueryBuilder(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return query; }),
    ilike: vi.fn((col, val) => { calls.push({ method: 'ilike', col, val }); return query; }),
    limit: vi.fn((n) => { calls.push({ method: 'limit', n }); return query; }),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    single: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    not: vi.fn(() => query),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('auth-api integration: signUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty username', async () => {
    const result = await signUp('', 'test@example.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_USERNAME');
  });

  it('rejects short password', async () => {
    const result = await signUp('testuser', 'test@example.com', '12345');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_PASSWORD');
  });

  it('rejects invalid email', async () => {
    const result = await signUp('testuser', 'not-an-email', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_EMAIL');
  });

  it('rejects when username already taken', async () => {
    const usernameQuery = createQueryBuilder({
      data: [{ id: 'existing', username: 'testuser' }],
      error: null,
    });
    mocks.fromMock.mockReturnValue(usernameQuery);

    const result = await signUp('testuser', 'test@example.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('USERNAME_TAKEN');
  });

  it('succeeds and creates profile', async () => {
    const usernameQuery = createQueryBuilder({ data: [], error: null });
    // First call for username check, second for profile insert
    mocks.fromMock.mockReturnValue(usernameQuery);

    mocks.authSignUp.mockResolvedValue({
      data: {
        user: {
          id: 'new-user-id',
          email: 'test@example.com',
          identities: [{ id: 'id1' }],
        },
      },
      error: null,
    });

    const result = await signUp('testuser', 'test@example.com', 'password123');
    expect(result.ok).toBe(true);
    expect(mocks.authSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        password: 'password123',
      })
    );
  });

  it('handles user already registered error', async () => {
    const usernameQuery = createQueryBuilder({ data: [], error: null });
    mocks.fromMock.mockReturnValue(usernameQuery);

    mocks.authSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered', code: 'USER_EXISTS' },
    });

    const result = await signUp('testuser', 'test@example.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('USER_ALREADY_REGISTERED');
  });

  it('handles rate limit error', async () => {
    const usernameQuery = createQueryBuilder({ data: [], error: null });
    mocks.fromMock.mockReturnValue(usernameQuery);

    mocks.authSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email rate limit exceeded', code: '429' },
    });

    const result = await signUp('testuser', 'test@example.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EMAIL_RATE_LIMIT');
  });
});

describe('auth-api integration: signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty loginId', async () => {
    const result = await signIn('', 'password');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('rejects empty password', async () => {
    const result = await signIn('testuser', '');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('signs in with email directly', async () => {
    mocks.authSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@example.com' }, session: {} },
      error: null,
    });

    const result = await signIn('test@example.com', 'password123');
    expect(result.ok).toBe(true);
    expect(mocks.authSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('resolves username to email with profile lookup', async () => {
    const profileQuery = createQueryBuilder({
      data: [{ id: 'u1', email: 'found@example.com', username: 'testuser' }],
      error: null,
    });
    mocks.fromMock.mockReturnValue(profileQuery);

    mocks.authSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    });

    const result = await signIn('testuser', 'password123');
    expect(result.ok).toBe(true);
    expect(mocks.fromMock).toHaveBeenCalled();
  });

  it('rejects unknown username', async () => {
    const profileQuery = createQueryBuilder({ data: [], error: null });
    mocks.fromMock.mockReturnValue(profileQuery);

    const result = await signIn('unknown_user', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_ACCOUNT');
  });

  it('handles invalid credentials', async () => {
    mocks.authSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', code: '401' },
    });

    const result = await signIn('test@example.com', 'wrongpassword');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('handles email not confirmed', async () => {
    mocks.authSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Email not confirmed', code: '401' },
    });

    const result = await signIn('test@example.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });
});

describe('auth-api integration: signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('signs out successfully', async () => {
    mocks.authSignOut.mockResolvedValue({ error: null });
    const result = await signOut();
    expect(result.ok).toBe(true);
    expect(mocks.authSignOut).toHaveBeenCalled();
  });

  it('handles sign out error', async () => {
    mocks.authSignOut.mockResolvedValue({ error: { message: 'Network error' } });
    const result = await signOut();
    expect(result.ok).toBe(false);
  });
});

describe('auth-api integration: getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns user when authenticated', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@example.com' } },
      error: null,
    });

    const user = await getCurrentUser();
    expect(user).toBeDefined();
    expect(user.id).toBe('u1');
  });

  it('returns null when auth session missing', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing', code: 'AUTH_SESSION_MISSING' },
    });

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});

describe('auth-api integration: updatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects short new password', async () => {
    const result = await updatePassword('123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_PASSWORD');
  });

  it('updates password without current password verification', async () => {
    mocks.authUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });

    const result = await updatePassword('newpassword123');
    expect(result.ok).toBe(true);
    expect(mocks.authUpdateUser).toHaveBeenCalledWith({
      password: 'newpassword123',
    });
  });
});

describe('auth-api integration: deleteMyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects short password', async () => {
    const result = await deleteMyAccount('123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_PASSWORD');
  });

  it('rejects if not authenticated', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const result = await deleteMyAccount('password123');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBeDefined();
  });
});

describe('auth-api integration: profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('getAllProfiles returns list', async () => {
    const query = createQueryBuilder({
      data: [{ id: 'u1', username: 'alice' }, { id: 'u2', username: 'bob' }],
      error: null,
    });
    mocks.fromMock.mockReturnValue(query);

    const result = await getAllProfiles();
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('getProfilesPage supports pagination', async () => {
    const query = createQueryBuilder({
      data: [{ id: 'u1', username: 'alice' }],
      count: 1,
      error: null,
    });
    mocks.fromMock.mockReturnValue(query);

    const result = await getProfilesPage({ page: 1, pageSize: 10 });
    expect(result.ok).toBe(true);
    expect(result.data.items).toHaveLength(1);
  });
});