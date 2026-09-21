// 管理员代发一次性登录 token —— 纯逻辑（入参校验 / 审计行构造 / 出参收敛）。
//
// 独立成模块的原因：index.ts 顶层是 Deno.serve，无法被 vitest 直接测；
// 同时把「绝不把 action_link 回传给调用方」这类安全约定固化在代码里，
// 而不是依赖每个调用点的自觉。

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REASON_MAX_LENGTH = 200;

export interface IssueTokenInput {
  userId: string;
  reason: string;
}

export type IssueTokenInputResult =
  | { ok: true; value: IssueTokenInput }
  | { ok: false; code: string; message: string };

// 入参校验：user_id 必须是合法 UUID；reason 必填且限长（写入审计，宁缺勿滥）。
export const validateIssueInput = (body: unknown): IssueTokenInputResult => {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const userId = String(raw.user_id ?? '').trim();
  const reason = String(raw.reason ?? '').trim();

  if (!userId) {
    return { ok: false, code: 'INVALID_INPUT', message: '缺少 user_id 参数。' };
  }
  if (!UUID_REGEX.test(userId)) {
    return { ok: false, code: 'INVALID_USER_ID', message: 'user_id 格式不合法。' };
  }
  if (!reason) {
    return { ok: false, code: 'REASON_REQUIRED', message: '签发原因必填（将写入审计日志）。' };
  }
  if (reason.length > REASON_MAX_LENGTH) {
    return {
      ok: false,
      code: 'REASON_TOO_LONG',
      message: `签发原因不能超过 ${REASON_MAX_LENGTH} 字。`,
    };
  }
  return { ok: true, value: { userId, reason } };
};

export interface AuditRowInput {
  actorId: string;
  targetId: string;
  targetUsername: string;
  reason: string;
}

// 审计行构造。status 初始为 pending —— EF 先落审计再签发（fail-closed），
// 签发成功后更新为 issued，失败更新为 failed 并带原因。
export const buildAuditRow = (input: AuditRowInput) => ({
  actor_id: input.actorId,
  target_id: input.targetId,
  target_username: input.targetUsername,
  reason: input.reason,
  status: 'pending',
  detail: {
    otp_type: 'recovery',
    delivery: 'manual',
    issued_via: 'admin-issue-login-token',
  },
});

export type PickIssuePayloadResult =
  | { ok: true; token: string }
  | { ok: false; code: string; message: string };

// 出参收敛：调用方只允许拿到 hashed_token。
// generateLink 的返回里还有 action_link（完整登录链接）与 email_otp ——
// 绝不回传：完整链接一旦被存进聊天记录/截图，等同把一次性凭证变成持久凭证。
export const pickIssuePayload = (linkData: unknown): PickIssuePayloadResult => {
  const payload = (linkData && typeof linkData === 'object' ? linkData : {}) as {
    properties?: { hashed_token?: unknown };
  };
  const token = String(payload.properties?.hashed_token ?? '').trim();
  if (!token) {
    return { ok: false, code: 'TOKEN_GENERATION_EMPTY', message: '签发结果异常，请重试。' };
  }
  return { ok: true, token };
};
