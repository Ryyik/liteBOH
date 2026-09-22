import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_LEGACY,
  normalizeEmail,
  normalizeLoginId,
  validateCurrentPassword,
  validateEmail,
  validateLoginId,
  validatePassword,
  validateUsername
} from '../../src/utils/auth-validation.js';

describe('auth-validation', () => {
  it('normalizes email and login id', () => {
    expect(normalizeEmail('  TeSt@Example.com ')).toBe('test@example.com');
    expect(normalizeLoginId('  TestUser  ')).toBe('TestUser');
  });

  it('validates username rules', () => {
    expect(validateUsername('')).toBe('请输入有效的方块 ID');
    expect(validateUsername('ab')).toContain('3-20');
    expect(validateUsername('abc')).toBe('');
    expect(validateUsername('admin')).toContain('保留词');
  });

  it('validates email and password', () => {
    expect(validateEmail('bad-email')).toContain('邮箱');
    expect(validateEmail('ok@example.com')).toBe('');
    expect(validatePassword('')).toContain('请设置密码');
    expect(validatePassword('1234567')).toContain(`至少为 ${PASSWORD_MIN_LENGTH} 位`);
    expect(validatePassword('12345678')).toBe('');
  });

  it('当前密码只按历史下限拦，不跟随新密码强度上调', () => {
    // 强度策略不能变成锁死策略：老用户的 6~7 位密码必须仍然能过这一关，
    // 否则他们改不了邮箱、删不了账号。
    expect(validateCurrentPassword('')).toContain('请输入当前账号密码');
    expect(validateCurrentPassword('12345')).toContain(`至少 ${PASSWORD_MIN_LENGTH_LEGACY} 位`);
    expect(validateCurrentPassword('123456')).toBe('');
    expect(PASSWORD_MIN_LENGTH_LEGACY).toBeLessThan(PASSWORD_MIN_LENGTH);
  });

  it('validates login id as username or email', () => {
    expect(validateLoginId('')).toContain('方块 ID 或邮箱');
    expect(validateLoginId('abc')).toBe('');
    expect(validateLoginId('ab')).toContain('3-20');
    expect(validateLoginId('not-an-email@')).toContain('邮箱');
    expect(validateLoginId('ok@example.com')).toBe('');
  });
});
