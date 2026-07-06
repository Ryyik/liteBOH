/**
 * API 调用自动重试工具
 * 支持：指数退避、最大重试次数、错误分类
 */

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['network', 'timeout', 'rate_limit', '5', 'ECONNREFUSED', 'ENOTFOUND'],
}

function isRetryable(error, retryableErrors) {
  const msg = (error?.message || error?.toString() || '').toLowerCase()
  return retryableErrors.some(keyword => msg.includes(keyword.toLowerCase()))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  let lastError = null

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < config.maxRetries && isRetryable(error, config.retryableErrors)) {
        const delay = Math.min(config.baseDelay * Math.pow(2, attempt - 1), config.maxDelay)
        console.warn(`[withRetry] 第 ${attempt} 次失败，${delay}ms 后重试:`, error.message)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }

  throw lastError
}

/**
 * 统一错误收集
 */
export function captureError(error, context = {}) {
  const payload = {
    message: error?.message || '未知错误',
    stack: error?.stack,
    timestamp: new Date().toISOString(),
    ...context,
  }

  // 开发环境打印详细日志
  if (import.meta.env.DEV) {
    console.group(`[ErrorCapture] ${payload.message}`)
    console.error('错误详情:', payload)
    if (error) console.error('原始错误:', error)
    console.groupEnd()
  }

  // 生产环境可上报到 Sentry 或自建日志服务
  if (import.meta.env.PROD) {
    try {
      // 未来可替换为 Sentry.captureException(error, { extra: context })
      fetch('/api/log/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    } catch {}
  }

  return payload
}
