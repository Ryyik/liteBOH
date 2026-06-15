import { describe, it, expect } from 'vitest';
import {
  isMissingRpcFunctionError,
  isMissingDbColumnError,
  isMissingCloudTableError,
  isForumRateLimitError,
  normalizeDbError,
} from '../../src/utils/db-error.js';

describe('isMissingRpcFunctionError', () => {
  it('detects by message pattern', () => {
    expect(isMissingRpcFunctionError({ message: 'function is not found' })).toBe(true);
  });

  it('detects by PGRST202 code', () => {
    expect(isMissingRpcFunctionError({ code: 'PGRST202' })).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingRpcFunctionError({ message: 'connection timeout' })).toBe(false);
    expect(isMissingRpcFunctionError({ code: '23505' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isMissingRpcFunctionError(null)).toBe(false);
    expect(isMissingRpcFunctionError(undefined)).toBe(false);
  });
});

describe('isMissingDbColumnError', () => {
  it('detects column does not exist message', () => {
    expect(isMissingDbColumnError({ message: 'column "foo" does not exist' })).toBe(true);
  });

  it('detects by 42703 code', () => {
    expect(isMissingDbColumnError({ code: '42703' })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isMissingDbColumnError({ message: 'relation does not exist' })).toBe(false);
  });
});

describe('isMissingCloudTableError', () => {
  it('detects relation does not exist message', () => {
    expect(isMissingCloudTableError({ message: 'relation "foo" does not exist' })).toBe(true);
  });

  it('detects by 42P01 code', () => {
    expect(isMissingCloudTableError({ code: '42P01' })).toBe(true);
  });

  it('returns false for column errors', () => {
    expect(isMissingCloudTableError({ message: 'column "foo" does not exist' })).toBe(false);
  });
});

describe('isForumRateLimitError', () => {
  it('detects FORUM_RATE_LIMIT in message', () => {
    expect(isForumRateLimitError({ message: 'FORUM_RATE_LIMIT:post:too many posts' })).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isForumRateLimitError({ message: 'forum_rate_limit exceeded' })).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isForumRateLimitError({ message: 'something else' })).toBe(false);
  });

  it('returns false for non-string message', () => {
    expect(isForumRateLimitError({ message: 123 })).toBe(false);
  });
});

describe('normalizeDbError', () => {
  it('normalizes missing RPC error', () => {
    const result = normalizeDbError({ code: 'PGRST202' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('MISSING_RPC');
    expect(result.error.message).toContain('RPC');
  });

  it('normalizes rate limit error', () => {
    const result = normalizeDbError({ message: 'FORUM_RATE_LIMIT:too fast' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RATE_LIMIT');
  });

  it('normalizes duplicate error (23505)', () => {
    const result = normalizeDbError({ code: '23505' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('DUPLICATE');
    expect(result.error.message).toContain('已存在');
  });

  it('normalizes unknown errors with custom fallback', () => {
    const result = normalizeDbError({ message: 'unknown error' }, '自定义提示');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN');
    expect(result.error.message).toBe('unknown error');
  });

  it('uses default fallback message when error has no message', () => {
    const result = normalizeDbError({ code: 'XYZ' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('XYZ');
    expect(result.error.message).toContain('操作失败');
  });
});