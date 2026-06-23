import { createServiceClient } from './supabase.ts';

export async function checkRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const serviceClient = createServiceClient();
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    const { data: existing } = await serviceClient
      .from('_rate_limits')
      .select('count, reset_at')
      .eq('key', key)
      .maybeSingle();

    if (!existing || new Date(existing.reset_at) <= now) {
      const { error } = await serviceClient
        .from('_rate_limits')
        .upsert({ key, count: 1, reset_at: resetAt.toISOString() }, { onConflict: 'key' });
      if (error) return { ok: true };
      return { ok: true };
    }

    const newCount = existing.count + 1;
    const { error } = await serviceClient
      .from('_rate_limits')
      .update({ count: newCount })
      .eq('key', key);
    if (error) return { ok: true };

    if (newCount > maxRequests) {
      const retryAfter = Math.ceil((new Date(existing.reset_at).getTime() - now.getTime()) / 1000);
      return { ok: false, retryAfter };
    }
    return { ok: true };
  } catch (err) {
    console.error('[rate-limiter] 数据库限流查询失败', err);
    return { ok: false, retryAfter: 60 };
  }
}
