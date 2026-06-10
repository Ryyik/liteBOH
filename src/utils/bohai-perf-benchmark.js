/**
 * bohai-perf-benchmark.js
 * ------------------------------------------------------------
 * BOHAI 性能基准测试工具集
 * 用于测量模型调用延迟、缓存命中率、内存使用等关键指标
 */

// ================================================================
// 计时器
// ================================================================

/**
 * 包装异步函数并返回执行时间
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn
 * @param {string} label
 * @returns {{ wrapped: (...args: any[]) => Promise<{ result: T, durationMs: number }>, label: string }}
 */
export function createTimedWrapper(fn, label) {
  if (typeof fn !== 'function') {
    throw new Error('createTimedWrapper: fn 必须是函数');
  }
  const labelStr = String(label || '').trim() || 'anonymous';
  return {
    label: labelStr,
    async wrapped(...args) {
      const start = performance.now();
      try {
        const result = await fn(...args);
        return { result, durationMs: performance.now() - start };
      } catch (error) {
        const durationMs = performance.now() - start;
        throw Object.assign(error, { _timing: { label: labelStr, durationMs } });
      }
    }
  };
}

/**
 * 手动计时
 */
export function createStopwatch() {
  let start = 0;
  return {
    start() { start = performance.now(); },
    /** @returns {number} 经过的毫秒数 */
    elapsed() { return performance.now() - start; },
    /** @returns {{ elapsedMs: number, label: string } 带标签的读数 */
    lap(label) {
      return { label: String(label || '').trim(), elapsedMs: performance.now() - start };
    }
  };
}

// ================================================================
// 缓存追踪
// ================================================================

/**
 * 包装一个 Map 为可追踪命中率的缓存
 * @param {number} maxSize
 * @returns {{ get, set, has, delete, clear, stats: () => { hits: number, misses: number, hitRate: number, size: number, maxSize: number } }}
 */
export function createTrackedCache(maxSize = 100) {
  const store = new Map();
  let hits = 0;
  let misses = 0;

  const isValidKey = (key) => key !== null && key !== undefined;

  return {
    /**
     * @param {*} key
     * @returns {*|undefined}
     */
    get(key) {
      if (!isValidKey(key)) {
        misses += 1;
        return undefined;
      }
      if (store.has(key)) {
        hits += 1;
        return store.get(key);
      }
      misses += 1;
      return undefined;
    },

    /**
     * @param {*} key
     * @param {*} value
     */
    set(key, value) {
      if (!isValidKey(key)) return;
      if (store.size >= maxSize && !store.has(key)) {
        const firstKey = store.keys().next().value;
        if (firstKey !== undefined) store.delete(firstKey);
      }
      store.set(key, value);
    },

    /**
     * @param {*} key
     * @returns {boolean}
     */
    has(key) {
      if (!isValidKey(key)) {
        misses += 1;
        return false;
      }
      const exists = store.has(key);
      if (exists) hits += 1;
      else misses += 1;
      return exists;
    },

    /**
     * @param {*} key
     * @returns {boolean}
     */
    delete(key) {
      return store.delete(key);
    },

    clear() {
      store.clear();
      hits = 0;
      misses = 0;
    },

    /** @returns {{ hits: number, misses: number, hitRate: number, size: number, maxSize: number }} */
    stats() {
      const total = hits + misses;
      return {
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
        size: store.size,
        maxSize
      };
    }
  };
}

// ================================================================
// 性能标记
// ================================================================

/** @type {PerformanceEntry[]} */
const fallbackMeasures = [];

const markImpl = typeof performance !== 'undefined' && typeof performance.mark === 'function'
  ? performance
  : null;

export const perfMark = {
  /**
   * @param {string} name - 标记名称
   * @param {object} [detail] - 附加数据
   */
  mark(name, detail) {
    const markName = String(name || '').trim();
    if (!markName) return;
    if (markImpl) {
      markImpl.mark(markName, { detail });
    }
    // performance.mark 在不支持的环境中静默跳过
  },

  /**
   * 测量两个标记之间的时间
   * @param {string} name - 测量名称
   * @param {string} startMark - 起始标记
   * @param {string} endMark - 结束标记
   */
  measure(name, startMark, endMark) {
    const measureName = String(name || '').trim();
    const start = String(startMark || '').trim();
    const end = String(endMark || '').trim();
    if (!measureName || !start || !end) return;

    if (markImpl && typeof markImpl.measure === 'function') {
      try {
        markImpl.measure(measureName, start, end);
        return;
      } catch {
        // 标记不存在时 fallback 到手动计算
      }
    }

    // Fallback: 手动测量
    const startEntry = markImpl ? markImpl.getEntriesByName(start).pop() : null;
    const endEntry = markImpl ? markImpl.getEntriesByName(end).pop() : null;
    if (startEntry && endEntry) {
      const duration = endEntry.startTime - startEntry.startTime;
      fallbackMeasures.push({
        name: measureName,
        entryType: 'measure',
        startTime: startEntry.startTime,
        duration,
        toJSON() { return this; }
      });
    }
  },

  /** 清除所有标记 */
  clear() {
    if (markImpl && typeof markImpl.clearMarks === 'function') {
      markImpl.clearMarks();
    }
    if (markImpl && typeof markImpl.clearMeasures === 'function') {
      markImpl.clearMeasures();
    }
    fallbackMeasures.length = 0;
  },

  /** @returns {PerformanceEntry[]} 所有测量结果 */
  getMeasures() {
    if (markImpl && typeof markImpl.getEntriesByType === 'function') {
      try {
        return /** @type {PerformanceEntry[]} */ (markImpl.getEntriesByType('measure'));
      } catch {
        return [...fallbackMeasures];
      }
    }
    return [...fallbackMeasures];
  }
};

// ================================================================
// 报告生成
// ================================================================

/**
 * 格式化毫秒数为可读字符串
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  if (!Number.isFinite(ms)) return 'N/A';
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 格式化百分比
 * @param {number} rate
 * @returns {string}
 */
function formatPercent(rate) {
  if (!Number.isFinite(rate)) return 'N/A';
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 获取内存信息
 * @returns {{ used: string, total: string, limit: string }|null}
 */
function getMemoryInfo() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const mem = performance.memory;
    return {
      used: formatBytes(mem.usedJSHeapSize),
      total: formatBytes(mem.totalJSHeapSize),
      limit: formatBytes(mem.jsHeapSizeLimit)
    };
  }
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage();
    return {
      used: formatBytes(mem.heapUsed),
      total: formatBytes(mem.heapTotal),
      limit: 'N/A'
    };
  }
  return null;
}

/**
 * 格式化字节数为可读字符串
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 生成性能报告
 * @param {object} options
 * @param {Array<{ label: string, durationMs: number }>} options.timings
 * @param {Array<{ name: string, hits: number, misses: number, hitRate: number, size: number }>} options.cacheStats
 * @param {object} [options.memoryInfo]
 * @param {string} [options.phase]
 * @returns {string} 格式化的报告文本
 */
export function generatePerfReport(options = {}) {
  const {
    timings = [],
    cacheStats = [],
    memoryInfo,
    phase = ''
  } = options;

  const lines = [];

  // 标题
  lines.push('# BOHAI 性能报告');
  if (phase) {
    lines.push('');
    lines.push(`**阶段**: ${phase}`);
  }
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push('');

  // 时序
  if (Array.isArray(timings) && timings.length > 0) {
    lines.push('## 时序');
    lines.push('');
    lines.push('| 标签 | 耗时 |');
    lines.push('|------|------|');
    let totalDuration = 0;
    for (const t of timings) {
      const label = t.label || 'unknown';
      const ms = Number.isFinite(t.durationMs) ? t.durationMs : 0;
      totalDuration += ms;
      lines.push(`| ${label} | ${formatMs(ms)} |`);
    }
    if (timings.length > 1) {
      lines.push(`| **总计** | **${formatMs(totalDuration)}** |`);
    }
    lines.push('');
  }

  // 缓存统计
  if (Array.isArray(cacheStats) && cacheStats.length > 0) {
    lines.push('## 缓存命中率');
    lines.push('');
    lines.push('| 缓存名称 | 命中 | 未命中 | 命中率 | 当前大小 |');
    lines.push('|----------|------|--------|--------|----------|');
    for (const cs of cacheStats) {
      const name = cs.name || 'unknown';
      const hits = Number.isFinite(cs.hits) ? cs.hits : 0;
      const misses = Number.isFinite(cs.misses) ? cs.misses : 0;
      const hitRate = Number.isFinite(cs.hitRate) ? cs.hitRate : 0;
      const size = Number.isFinite(cs.size) ? cs.size : 0;
      lines.push(`| ${name} | ${hits} | ${misses} | ${formatPercent(hitRate)} | ${size} |`);
    }
    lines.push('');
  }

  // 内存信息
  const mem = memoryInfo || getMemoryInfo();
  if (mem) {
    lines.push('## 内存使用');
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push(`| 已用堆内存 | ${mem.used} |`);
    lines.push(`| 总堆内存 | ${mem.total} |`);
    if (mem.limit !== 'N/A') {
      lines.push(`| 堆内存限制 | ${mem.limit} |`);
    }
    lines.push('');
  }

  // 性能标记测量
  const measures = perfMark.getMeasures();
  if (measures.length > 0) {
    lines.push('## 性能标记测量');
    lines.push('');
    lines.push('| 测量名称 | 耗时 |');
    lines.push('|----------|------|');
    for (const m of measures) {
      lines.push(`| ${m.name} | ${formatMs(m.duration)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ================================================================
// 优化前后对比
// ================================================================

/**
 * @param {Array<{ label: string, beforeMs: number, afterMs: number }>} comparisons
 * @returns {string} 对比报告文本
 */
export function generateComparisonReport(comparisons) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    return '# 优化对比报告\n\n无对比数据。\n';
  }

  const lines = [];
  lines.push('# 优化前后对比报告');
  lines.push('');
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('| 标签 | 优化前 | 优化后 | 提升 | 改善幅度 |');
  lines.push('|------|--------|--------|------|----------|');

  for (const c of comparisons) {
    const label = c.label || 'unknown';
    const before = Number.isFinite(c.beforeMs) ? c.beforeMs : 0;
    const after = Number.isFinite(c.afterMs) ? c.afterMs : 0;
    const improvement = before - after;
    const pct = before > 0 ? (improvement / before) * 100 : 0;
    const arrow = improvement >= 0 ? '✅' : '⚠️';
    lines.push(
      `| ${label} | ${formatMs(before)} | ${formatMs(after)} | ${formatMs(Math.abs(improvement))} ${improvement >= 0 ? '更快' : '更慢'} | ${arrow} ${formatPercent(pct / 100)} |`
    );
  }

  lines.push('');

  // 汇总行
  const totalBefore = comparisons.reduce((sum, c) => sum + (Number.isFinite(c.beforeMs) ? c.beforeMs : 0), 0);
  const totalAfter = comparisons.reduce((sum, c) => sum + (Number.isFinite(c.afterMs) ? c.afterMs : 0), 0);
  if (totalBefore > 0) {
    const totalImprovement = totalBefore - totalAfter;
    const totalPct = (totalImprovement / totalBefore) * 100;
    lines.push(`**汇总**: 总耗时从 ${formatMs(totalBefore)} 降至 ${formatMs(totalAfter)}，`);
    lines.push(`总体改善 ${formatMs(Math.abs(totalImprovement))}（${totalImprovement >= 0 ? '提升' : '下降'} ${formatPercent(totalPct / 100)}）。`);
    lines.push('');
  }

  return lines.join('\n');
}

// ================================================================
// 基准测试运行器
// ================================================================

/**
 * 运行基准测试
 * @param {string} name - 测试名称
 * @param {() => Promise<any>} testFn - 测试函数
 * @param {number} iterations - 迭代次数
 * @returns {Promise<{ name: string, iterations: number, totalMs: number, avgMs: number, minMs: number, maxMs: number }>}
 */
export async function runBenchmark(name, testFn, iterations = 5) {
  if (typeof testFn !== 'function') {
    throw new Error('runBenchmark: testFn 必须是函数');
  }
  const label = String(name || '').trim() || 'benchmark';
  const count = Number.isFinite(iterations) ? Math.max(1, Math.floor(iterations)) : 5;

  const durations = [];

  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await testFn();
    durations.push(performance.now() - start);
  }

  const totalMs = durations.reduce((sum, d) => sum + d, 0);
  const avgMs = totalMs / durations.length;
  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);

  return {
    name: label,
    iterations: count,
    totalMs,
    avgMs,
    minMs,
    maxMs
  };
}