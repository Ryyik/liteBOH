import { createServiceClient } from './supabase.ts';

export async function checkRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const serviceClient = createServiceClient();
    const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

    // 单次原子 RPC：检查 + 自增 + 窗口过期重置
    // 替代原 SELECT + UPSERT/RPC 的多往返方案
    const { data, error } = await serviceClient.rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    // RPC 失败时按允许处理（fail open，与原行为一致）
    if (error || !Array.isArray(data) || data.length === 0) {
      return { ok: true };
    }

    const row = data[0];
    if (row?.allowed === false) {
      return { ok: false, retryAfter: Number(row.retry_after_seconds) || 60 };
    }
    return { ok: true };
  } catch (err) {
    // 与 RPC error 分支保持一致：基础设施异常同样 fail open，
    // 不因限流器自身故障误伤正常用户（已 console.error 留痕）
    console.error('[rate-limiter] 数据库限流查询失败', err);
    return { ok: true };
  }
}
