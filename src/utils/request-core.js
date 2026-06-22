import { logger } from './logger.js';

const requestInFlight = new Map();
const requestCache = new Map();
const MAX_CACHE_ENTRIES = 200;

function buildRequestKey(scope, params = {}) {
  const safeParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  try {
    return `${scope}:${JSON.stringify(safeParams)}`;
  } catch {
    return `${scope}:${Date.now()}`;
  }
}

export function normalizeDbError(error, fallbackMessage = '请求失败') {
  if (!error) return null;
  if (typeof error === 'string') {
    return { message: error, code: 'APP_ERROR', details: null, hint: null };
  }
  const rawMessage = String(error.message || fallbackMessage);
  if (rawMessage.startsWith('FORUM_RATE_LIMIT:')) {
    const [, ruleCode, ...messageParts] = rawMessage.split(':');
    return {
      message: messageParts.join(':') || '发布太频繁了，请稍后再试',
      code: 'FORUM_RATE_LIMIT',
      details: ruleCode || null,
      hint: error.hint || null
    };
  }
  if (rawMessage.startsWith('FORUM_IMAGE:')) {
    const [, ruleCode, ...messageParts] = rawMessage.split(':');
    return {
      message: messageParts.join(':') || '图片发布失败，请稍后再试',
      code: 'FORUM_IMAGE',
      details: ruleCode || null,
      hint: error.hint || null
    };
  }
  if (rawMessage.startsWith('FORUM_LIKE:')) {
    const [, ruleCode, ...messageParts] = rawMessage.split(':');
    return {
      message: messageParts.join(':') || '点赞操作失败，请稍后再试',
      code: 'FORUM_LIKE',
      details: ruleCode || null,
      hint: error.hint || null
    };
  }
  return {
    message: rawMessage,
    code: error.code || 'UNKNOWN',
    details: error.details || null,
    hint: error.hint || null
  };
}

export function okResult(data = null, extras = {}) {
  return { ok: true, data, error: null, ...extras };
}

export function failResult(error, data = null, extras = {}) {
  return { ok: false, data, error: normalizeDbError(error), ...extras };
}

function setCache(key, payload, ttlMs, tags = []) {
  if (!ttlMs || ttlMs <= 0) return;

  // LRU 淘汰：超过上限时移除最旧的条目
  while (requestCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = requestCache.keys().next().value;
    requestCache.delete(oldestKey);
  }

  requestCache.set(key, {
    expireAt: Date.now() + ttlMs,
    payload,
    tags: new Set(tags)
  });
}

function getCache(key) {
  const cached = requestCache.get(key);
  if (!cached) return null;
  if (cached.expireAt <= Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return cached.payload;
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求超时(${timeoutMs}ms)`)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function runWithRetry(task, retry = 0, retryDelayMs = 300) {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retry) {
        throw error;
      }
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}

export function clearRequestCache() {
  requestCache.clear();
}

export function invalidateByTags(tags = []) {
  if (!tags.length) return;
  const patterns = tags.filter(Boolean);
  if (!patterns.length) return;

  for (const [key, entry] of requestCache.entries()) {
    const entryTags = Array.from(entry.tags || []);
    const matched = patterns.some((pattern) =>
      entryTags.some((tag) => tag === pattern || tag.startsWith(`${pattern}:`))
    );
    if (matched) {
      requestCache.delete(key);
    }
  }
}

export async function executeRead(scope, params, fetcher, options = {}) {
  const {
    ttlMs = 0,
    tags = [],
    timeoutMs = 8000,
    retry = 1,
    retryDelayMs = 300
  } = options;

  const key = buildRequestKey(scope, params);
  const cached = getCache(key);
  if (cached) return cached;

  if (requestInFlight.has(key)) {
    return requestInFlight.get(key);
  }

  const task = (async () => {
    try {
      const raw = await runWithRetry(
        () => withTimeout(fetcher(), timeoutMs),
        retry,
        retryDelayMs
      );

      const extras = raw && typeof raw === 'object'
        ? Object.fromEntries(
            Object.entries(raw).filter(([key]) => key !== 'data' && key !== 'error')
          )
        : {};

      const response = {
        ok: !raw?.error,
        data: raw?.data ?? null,
        error: normalizeDbError(raw?.error),
        ...extras
      };

      if (!response.error) {
        setCache(key, response, ttlMs, tags);
      }
      return response;
    } catch (error) {
      logger.warn('request-core', `Read request failed: ${scope}`, error);
      return failResult(error);
    } finally {
      requestInFlight.delete(key);
    }
  })();

  requestInFlight.set(key, task);
  return task;
}

export const __cacheDebug = {
  size: () => requestCache.size
};
