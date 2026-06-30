import { logger } from './logger.js';
import { CACHE_TTL_LEVELS } from './cache-strategy.js';

const requestInFlight = new Map();
const requestCache = new Map();
const MAX_CACHE_ENTRIES = 200;

// 缓存命中率统计
const cacheStats = {
  hits: 0,
  misses: 0
};

// 请求超时分级配置
export const TIMEOUT_LEVELS = {
  CRITICAL: 5000,  // 关键API: 5秒
  NORMAL: 8000     // 普通API: 8秒
};

// 请求优先级配置
const PRIORITY_LEVELS = {
  HIGH: 1,
  NORMAL: 5,
  LOW: 10
};

// 请求队列管理器
class RequestQueue {
  constructor(maxConcurrent = 6) {
    this.queue = [];
    this.activeCount = 0;
    this.maxConcurrent = maxConcurrent;
    this.stats = {
      totalRequests: 0,
      queuedRequests: 0,
      completedRequests: 0,
      cancelledRequests: 0
    };
  }

  enqueue(task, priority = PRIORITY_LEVELS.NORMAL, signal = null) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        task,
        priority,
        signal,
        resolve,
        reject,
        id: Date.now() + Math.random()
      };

      // 检查是否已被取消
      if (signal && signal.aborted) {
        this.stats.cancelledRequests++;
        reject(new Error('请求已被取消'));
        return;
      }

      this.stats.totalRequests++;
      this.stats.queuedRequests++;

      // 按优先级插入队列（数字越小优先级越高）
      let inserted = false;
      for (let i = 0; i < this.queue.length; i++) {
        if (priority < this.queue[i].priority) {
          this.queue.splice(i, 0, queueItem);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.queue.push(queueItem);
      }

      // 监听取消事件
      if (signal) {
        signal.addEventListener('abort', () => {
          const idx = this.queue.findIndex(item => item.id === queueItem.id);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            this.stats.cancelledRequests++;
            this.stats.queuedRequests--;
            reject(new Error('请求已被取消'));
          }
        });
      }

      this.process();
    });
  }

  async process() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      // 检查是否已被取消
      if (item.signal && item.signal.aborted) {
        this.stats.cancelledRequests++;
        this.stats.queuedRequests--;
        item.reject(new Error('请求已被取消'));
        continue;
      }

      this.activeCount++;
      this.stats.queuedRequests--;

      try {
        const result = await item.task();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.activeCount--;
        this.stats.completedRequests++;
        this.process();
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.maxConcurrent
    };
  }

  clear() {
    this.queue.forEach(item => {
      item.reject(new Error('队列已清空'));
    });
    this.queue = [];
    this.stats.queuedRequests = 0;
  }
}

const requestQueue = new RequestQueue();

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
  if (!cached) {
    cacheStats.misses++;
    return null;
  }
  if (cached.expireAt <= Date.now()) {
    requestCache.delete(key);
    cacheStats.misses++;
    return null;
  }
  cacheStats.hits++;
  return cached.payload;
}

function withTimeout(promise, timeoutMs, signal = null) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求超时(${timeoutMs}ms)`)), timeoutMs);

    // 监听取消信号
    let abortHandler = null;
    if (signal) {
      abortHandler = () => {
        clearTimeout(timer);
        reject(new Error('请求已被取消'));
      };
      signal.addEventListener('abort', abortHandler);
    }

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
        reject(error);
      });
  });
}

async function runWithRetry(task, options = {}) {
  const {
    retry = 0,
    baseDelayMs = 300,
    maxDelayMs = 10000,
    jitter = true,
    signal = null
  } = options;

  let attempt = 0;
  while (true) {
    // 检查是否被取消
    if (signal && signal.aborted) {
      throw new Error('请求已被取消');
    }

    try {
      return await task();
    } catch (error) {
      if (attempt >= retry) {
        throw error;
      }
      attempt += 1;

      // 指数退避计算：delay = baseDelay * 2^attempt
      let delayMs = baseDelayMs * Math.pow(2, attempt - 1);

      // 添加随机抖动避免惊群效应
      if (jitter) {
        delayMs = delayMs * (0.5 + Math.random() * 0.5);
      }

      // 不超过最大延迟
      delayMs = Math.min(delayMs, maxDelayMs);

      logger.debug('request-core', `重试第${attempt}次，等待${Math.round(delayMs)}ms`);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);

        // 支持取消等待
        if (signal) {
          const abortHandler = () => {
            clearTimeout(timer);
            reject(new Error('请求已被取消'));
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }
      });
    }
  }
}

export function clearRequestCache() {
  requestCache.clear();
  cacheStats.hits = 0;
  cacheStats.misses = 0;
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

// 创建 AbortController 的便捷方法
export function createAbortController() {
  return new AbortController();
}

// 获取请求队列统计信息
export function getRequestQueueStats() {
  return requestQueue.getStats();
}

// 获取缓存统计信息
export function getCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total * 100).toFixed(2) : '0.00';
  return {
    ...cacheStats,
    total,
    hitRate: `${hitRate}%`,
    cacheSize: requestCache.size,
    maxCacheSize: MAX_CACHE_ENTRIES
  };
}

export async function executeRead(scope, params, fetcher, options = {}) {
  const {
    ttlMs = 0,
    tags = [],
    timeoutMs = TIMEOUT_LEVELS.NORMAL,
    timeoutLevel = null,  // 可选：'CRITICAL' 或 'NORMAL'
    retry = 1,
    retryDelayMs = 300,
    baseDelayMs = 300,    // 指数退避基础延迟
    maxDelayMs = 10000,   // 指数退避最大延迟
    priority = PRIORITY_LEVELS.NORMAL,
    signal = null         // AbortController signal
  } = options;

  // 使用超时级别覆盖具体超时值
  const effectiveTimeoutMs = timeoutLevel && TIMEOUT_LEVELS[timeoutLevel]
    ? TIMEOUT_LEVELS[timeoutLevel]
    : timeoutMs;

  if (ttlMs > 0) {
    const validTTLs = Object.values(CACHE_TTL_LEVELS);
    const isValid = validTTLs.some(valid => valid === ttlMs);
    if (!isValid) {
      logger.warn('request-core', `TTL ${ttlMs}ms 不符合统一缓存策略 (scope: ${scope})`);
    }
  }

  const key = buildRequestKey(scope, params);
  const cached = getCache(key);
  if (cached) return cached;

  if (requestInFlight.has(key)) {
    return requestInFlight.get(key);
  }

  const task = (async () => {
    try {
      const raw = await requestQueue.enqueue(
        () => runWithRetry(
          () => withTimeout(fetcher(signal), effectiveTimeoutMs, signal),
          {
            retry,
            baseDelayMs: retryDelayMs || baseDelayMs,
            maxDelayMs,
            signal
          }
        ),
        priority,
        signal
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
      // 区分取消错误和其他错误
      if (error.message === '请求已被取消') {
        logger.debug('request-core', `请求已取消: ${scope}`);
        return failResult(error);
      }
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
  size: () => requestCache.size,
  stats: getCacheStats,
  queueStats: getRequestQueueStats
};