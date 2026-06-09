/**
 * Unified database error detection helpers.
 *
 * Consolidates 5+ inline implementations across the codebase.
 */

export function isMissingRpcFunctionError(error) {
  return (
    error?.message?.includes('function is not found') ||
    error?.code === 'PGRST202'
  )
}

export function isMissingDbColumnError(error) {
  return (
    error?.message?.includes('column') && error?.message?.includes('does not exist') ||
    error?.code === '42703'
  )
}

export function isMissingCloudTableError(error) {
  return (
    error?.message?.includes('relation') && error?.message?.includes('does not exist') ||
    error?.code === '42P01'
  )
}

const FORUM_RATE_LIMIT_PATTERN = /forum_rate_limit/i

export function isForumRateLimitError(error) {
  return typeof error?.message === 'string' && FORUM_RATE_LIMIT_PATTERN.test(error.message)
}

export function normalizeDbError(error, fallbackMessage = '操作失败，请稍后重试') {
  if (isMissingRpcFunctionError(error)) {
    return { ok: false, error: { code: 'MISSING_RPC', message: '服务暂不可用（RPC 未部署）' } }
  }
  if (isForumRateLimitError(error)) {
    return { ok: false, error: { code: 'RATE_LIMIT', message: '操作过于频繁，请稍后重试' } }
  }
  if (error?.code === '23505') {
    return { ok: false, error: { code: 'DUPLICATE', message: '已存在相同记录' } }
  }
  return { ok: false, error: { code: error?.code || 'UNKNOWN', message: error?.message || fallbackMessage } }
}