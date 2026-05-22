import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  normalizeLoginId,
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
    expect(validatePassword('12345')).toContain('至少为 6 位');
    expect(validatePassword('123456')).toBe('');
  });

  it('validates login id as username or email', () => {
    expect(validateLoginId('')).toContain('方块 ID 或邮箱');
    expect(validateLoginId('abc')).toBe('');
    expect(validateLoginId('ab')).toContain('3-20');
    expect(validateLoginId('not-an-email@')).toContain('邮箱');
    expect(validateLoginId('ok@example.com')).toBe('');
  });
});
