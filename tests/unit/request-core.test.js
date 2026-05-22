import { beforeEach, describe, it, expect } from 'vitest';
import { executeRead, invalidateByTags, clearRequestCache, normalizeDbError, __cacheDebug } from '../../src/utils/request-core.js';

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
});
