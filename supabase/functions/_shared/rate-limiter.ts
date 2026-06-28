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

    // 原子自增: insert...on conflict do update returning count
    // 避免 read-then-write 之间的竞态
    const { data: bumped, error: bumpErr } = await serviceClient.rpc('increment_rate_limit', {
      p_key: key,
    });
    let newCount: number;
    if (bumpErr || !bumped) {
      // 回退: 仍走原路径,失败则按允许处理(原行为)
      const { data: after } = await serviceClient
        .from('_rate_limits')
        .select('count')
        .eq('key', key)
        .maybeSingle();
      newCount = (after?.count || 0) + 1;
      await serviceClient
        .from('_rate_limits')
        .update({ count: newCount })
        .eq('key', key);
    } else {
      newCount = Number(bumped);
    }

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
