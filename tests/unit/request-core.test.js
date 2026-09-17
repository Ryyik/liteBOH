import { beforeEach, describe, it, expect } from 'vitest';
import {
  executeRead,
  invalidateByTags,
  clearRequestCache,
  normalizeDbError,
  createAbortError,
  isAbortError,
  ABORT_ERROR_CODE,
  __cacheDebug
} from '../../src/utils/request-core.js';

describe('request-core', () => {
  beforeEach(() => {
    clearRequestCache();
  });

  it('deduplicates concurrent reads with same key', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { data: { value: 42 }, error: null };
    };

    const [a, b] = await Promise.all([
      executeRead('x.scope', { id: 1 }, fetcher, { ttlMs: 1000, tags: ['x'], retry: 0 }),
      executeRead('x.scope', { id: 1 }, fetcher, { ttlMs: 1000, tags: ['x'], retry: 0 })
    ]);

    expect(calls).toBe(1);
    expect(a.ok).toBe(true);
    expect(b.data.value).toBe(42);
  });

  it('invalidates by tag prefix', async () => {
    await executeRead(
      'p.scope',
      { id: 2 },
      async () => ({ data: { v: 1 }, error: null }),
      { ttlMs: 1000, tags: ['posts:user:2'], retry: 0 }
    );

    expect(__cacheDebug.size()).toBeGreaterThan(0);
    invalidateByTags(['posts']);
    expect(__cacheDebug.size()).toBe(0);
  });

  it('normalizes forum rate limit errors into user-facing messages', () => {
    const error = normalizeDbError({
      code: 'P0001',
      message: 'FORUM_RATE_LIMIT:POST_COOLDOWN:发布太频繁了，请 30 秒后再试'
    });

    expect(error.code).toBe('FORUM_RATE_LIMIT');
    expect(error.details).toBe('POST_COOLDOWN');
    expect(error.message).toBe('发布太频繁了，请 30 秒后再试');
  });

  // ============================================
  // 取消（AbortController）语义：取消不是失败
  // 回归护栏：论坛列表出现过「切页/重新加载 → AbortError: The operation was aborted
  // 被当成加载失败渲染成红色错误」的问题。
  // ============================================

  it('recognizes the postgrest-wrapped abort shape as cancellation', () => {
    // postgrest-js 把 fetch 的 AbortError 转成普通对象返回，没有 name 字段，
    // 只靠 message / hint 才能识别（Chrome 版本不同文案也不同）
    const wrapped = {
      message: 'AbortError: signal is aborted without reason',
      code: '',
      details: 'AbortError: signal is aborted without reason',
      hint: 'Request was aborted (timeout or manual cancellation)'
    };
    expect(isAbortError(wrapped)).toBe(true);

    const normalized = normalizeDbError(wrapped);
    expect(normalized.code).toBe(ABORT_ERROR_CODE);
    expect(normalized.aborted).toBe(true);
    expect(normalized.message).not.toMatch(/aborted/i);
  });

  it('recognizes DOMException AbortError and the legacy Chinese message', () => {
    expect(isAbortError(new DOMException('The operation was aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(createAbortError())).toBe(true);
    expect(isAbortError(new Error('请求已被取消'))).toBe(true);
    expect(isAbortError(new Error('网络异常'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it('does not retry a cancelled request (no AbortError leakage)', async () => {
    const controller = new AbortController();
    let calls = 0;

    const result = await executeRead(
      'posts.getPosts',
      { page: 1, cancel: true },
      async () => {
        calls += 1;
        controller.abort();
        throw new DOMException('The operation was aborted', 'AbortError');
      },
      { retry: 2, signal: controller.signal }
    );

    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.error.code).toBe(ABORT_ERROR_CODE);
    expect(result.error.name).toBe('AbortError');
  });

  it('marks a read resolving with a postgrest abort error as cancelled', async () => {
    const result = await executeRead(
      'posts.getPosts',
      { page: 2, wrapped: true },
      async () => ({
        data: [],
        error: {
          message: 'AbortError: signal is aborted without reason',
          code: '',
          hint: 'Request was aborted (timeout or manual cancellation)'
        }
      }),
      { retry: 0 }
    );

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.error.code).toBe(ABORT_ERROR_CODE);
  });

  it('keeps non-abort failures untouched', async () => {
    const result = await executeRead(
      'posts.getPosts',
      { page: 3, fail: true },
      async () => ({ data: null, error: { message: 'boom', code: '500' } }),
      { retry: 0 }
    );

    expect(result.ok).toBe(false);
    expect(result.aborted).toBeUndefined();
    expect(result.error.code).toBe('500');
    expect(result.error.message).toBe('boom');
  });
});
