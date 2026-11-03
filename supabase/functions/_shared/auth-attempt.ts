/**
 * 登录风控：决策 / 计数 / 校验三件套的共享封装
 *
 * 为什么必须三件一起接（2026-11-03 安全复审，P0）：
 *   `should_require_login_altcha` 的全部判断都来自 `auth_attempt_events` 的计数
 *   （login_key 15 分钟失败 ≥3、IP 15 分钟失败 ≥10、设备 15 分钟失败 ≥5、
 *    IP 1 分钟请求 ≥20）。而那张表**最后一条写入停在 2026-06-01**。
 *
 *   所以只接校验器（verifyAndConsumeAltchaProof）而不接计数，计数恒为 0
 *   → requireAltcha 恒为 false → 人机验证永远不会被要求 → 等于没接。
 *   三件事必须在同一处闭环：读决策 → 写计数 → 验证明。
 *
 * 失败策略（刻意区分，别一刀切成 fail-closed）：
 *   - 闸门 RPC 故障 → fail-open（放行）并记日志。
 *     登录是核心链路，一次 DB 抖动不该让全站登不上；
 *     且它前面还有 `check_rate_limit` 的 IP 维度兜底。
 *   - 计数写入失败 → 只记日志，**绝不影响登录结果**。
 *   - 验证器判定失败 → fail-closed（拒绝），这是真正的安全判定。
 */

import { createServiceClient } from './supabase.ts';

const textEncoder = new TextEncoder();

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * IP 哈希必须加盐。
 * 无盐 sha256 对 IPv4 而言等于可逆（2^32 空间，彩虹表几分钟就能全量还原），
 * 而 `auth_attempt_events.ip_hash` 会长期留存 —— 那就变成了「存明文 IP」。
 */
const readIpSalt = () =>
  String(Deno.env.get('AUTH_IP_HASH_SALT') || Deno.env.get('ALTCHA_HMAC_KEY') || '').trim();

export const hashClientIp = async (ip: string): Promise<string> => {
  const safeIp = String(ip || '').trim() || 'unknown';
  const salt = readIpSalt();
  if (!salt) {
    // 仍然哈希（比存明文好），但要留下运维信号
    console.warn('[auth-attempt] 未配置 AUTH_IP_HASH_SALT 或 ALTCHA_HMAC_KEY，IP 哈希无盐');
  }
  return sha256Hex(`${salt}:${safeIp}`);
};

/**
 * 登录标识哈希：表里不存明文账号。
 * `should_require_login_altcha` / `record_auth_attempt` 内部都会 `left(...,190)`，
 * 64 位 hex 安全落在上限内。
 */
export const hashLoginKey = async (loginId: string): Promise<string> =>
  sha256Hex(String(loginId || '').trim().toLowerCase());

export type LoginGate = {
  ok: boolean;
  requireAltcha: boolean;
  blocked: boolean;
  reason?: string;
  retryAfterSeconds?: number;
};

/**
 * 读决策。RPC 故障时放行（见文件头失败策略），但把原因带回给调用方记日志。
 */
export const evaluateLoginGate = async (
  serviceClient: ReturnType<typeof createServiceClient>,
  { loginKey, ipHash, deviceIdHash = '' }: { loginKey: string; ipHash: string; deviceIdHash?: string },
): Promise<LoginGate> => {
  try {
    const { data, error } = await serviceClient.rpc('should_require_login_altcha', {
      p_login_key: loginKey,
      p_ip_hash: ipHash,
      p_device_id_hash: deviceIdHash || '',
    });

    if (error || !data || typeof data !== 'object') {
      console.error('[auth-attempt] should_require_login_altcha 调用失败，本次放行:', error?.message);
      return { ok: false, requireAltcha: false, blocked: false, reason: 'GATE_UNAVAILABLE' };
    }

    const gate = data as Record<string, unknown>;
    return {
      ok: gate.ok === true,
      requireAltcha: gate.requireAltcha === true,
      blocked: gate.blocked === true,
      reason: typeof gate.reason === 'string' ? gate.reason : undefined,
      retryAfterSeconds: Number(gate.retryAfterSeconds) || undefined,
    };
  } catch (error) {
    console.error(
      '[auth-attempt] should_require_login_altcha 异常，本次放行:',
      error instanceof Error ? error.message : 'unknown',
    );
    return { ok: false, requireAltcha: false, blocked: false, reason: 'GATE_UNAVAILABLE' };
  }
};

/**
 * 写计数。**任何失败都只记日志**：记录失败不能把用户挡在门外，
 * 但如果长期写不进去，闸门会退化成恒 false —— 所以必须留下明显日志。
 */
export const recordLoginAttempt = async (
  serviceClient: ReturnType<typeof createServiceClient>,
  {
    loginKey,
    ipHash,
    deviceIdHash = '',
    succeeded,
    usedAltcha = false,
    failureCode = null,
    userAgent = null,
  }: {
    loginKey: string;
    ipHash: string;
    deviceIdHash?: string;
    succeeded: boolean;
    usedAltcha?: boolean;
    failureCode?: string | null;
    userAgent?: string | null;
  },
): Promise<void> => {
  try {
    const { error } = await serviceClient.rpc('record_auth_attempt', {
      p_event_type: 'login',
      p_login_key: loginKey,
      p_ip_hash: ipHash,
      p_device_id_hash: deviceIdHash || '',
      p_succeeded: succeeded,
      p_used_altcha: usedAltcha,
      p_failure_code: failureCode || null,
      p_user_agent: userAgent || null,
    });
    if (error) {
      console.error('[auth-attempt] record_auth_attempt 失败（闸门计数会失真）:', error.message);
    }
  } catch (error) {
    console.error(
      '[auth-attempt] record_auth_attempt 异常（闸门计数会失真）:',
      error instanceof Error ? error.message : 'unknown',
    );
  }
};
