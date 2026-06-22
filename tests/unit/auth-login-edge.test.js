import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';

describe('auth-login edge function (BUG-U4)', () => {
  it('maps email not confirmed error to EMAIL_NOT_CONFIRMED code', async () => {
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');
    expect(source).toContain('EMAIL_NOT_CONFIRMED');
    expect(source).toContain('email not confirmed');
  });

  it('returns appropriate user-facing message for email not confirmed', async () => {
    const source = await readFile('supabase/functions/auth-login/index.ts', 'utf-8');
    expect(source).toContain('请先验证邮箱后再登录');
  });
});
