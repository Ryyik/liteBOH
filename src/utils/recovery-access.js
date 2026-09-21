// 一次性 token 登录态的判定（服务端签发依据，客户端不可伪造）。
//
// 背景：账号安全页修改密码要求输入当前密码，但管理员代发 token 上号的用户
// 恰恰不知道当前密码。需要识别「这个会话是刚通过一次性 token 建立的」，
// 并在宽限窗内免除当前密码校验（详见 AccountSecurity 页）。
//
// 判定依据：access_token 的 JWT payload 里有 `amr`
//（Authentication Methods Reference），由 GoTrue 服务端签发，
// 形如 [{ method: 'otp', timestamp: 1758… }, { method: 'password', … }]。
//
// **不能用 localStorage 标志替代**：偷到会话的攻击者同样能写标志 ——
// 当前密码检查防的正是这类人，标志一写这道检查就形同虚设。
//
// 宽限窗（默认 15 分钟）：把「刚建好的 token 会话被偷」情形的爆炸半径
// 压到最小；过窗后恢复要求当前密码。
//
// method 取并集（otp / magiclink / recovery / email）：GoTrue 不同版本
// 对 OTP 验证的 amr 写法存在差异，取并集覆盖；误报风险趋近于零 ——
// 这些 method 只会由 OTP/链接验证写入，密码登录写的是 'password'。

const RECOVERY_METHODS = new Set(['otp', 'magiclink', 'recovery', 'email']);

export const RECOVERY_GRACE_MS = 15 * 60 * 1000;

// 解码 JWT payload（base64url；支持含 UTF-8 的中文 payload）。
export const decodeJwtPayload = (jwt) => {
  const token = String(jwt || '');
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

// amr 里最近一次 token 类登录的时间戳（Unix 秒）；无则 null。
const latestRecoveryTimestamp = (amr) => {
  if (!Array.isArray(amr)) return null;
  let latest = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') continue;
    const method = String(entry.method || '').trim().toLowerCase();
    if (!RECOVERY_METHODS.has(method)) continue;
    const ts = Number(entry.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (latest === null || ts > latest) latest = ts;
  }
  return latest;
};

// 入参：supabase session（含 access_token）或直接给 JWT 字符串。
// 返回：是否处于「一次性 token 登录」宽限窗内。
export const isRecentTokenLogin = (sessionOrToken, nowMs = Date.now(), graceMs = RECOVERY_GRACE_MS) => {
  const jwt = typeof sessionOrToken === 'string'
    ? sessionOrToken
    : String(sessionOrToken?.access_token || '');
  if (!jwt) return false;

  const payload = decodeJwtPayload(jwt);
  if (!payload) return false;

  const ts = latestRecoveryTimestamp(payload.amr);
  if (ts === null) return false;

  const elapsed = nowMs - ts * 1000;
  return elapsed >= 0 && elapsed <= graceMs;
};

// 读取剪贴板文本（供「一键粘贴令牌」按钮使用）。
// 约束与失败面：需要 https 安全上下文 + 用户手势 + 浏览器授权（Chrome 首次会弹权限框）；
// Firefox 的 readText 长期不可用、权限被拒、非安全上下文 → 一律返回 null，
// 由调用方给出「请手动粘贴」的降级提示。失败不抛错 —— 粘贴是便利功能，不该变成报错源。
export const readClipboardText = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      return null;
    }
    const text = await navigator.clipboard.readText();
    const trimmed = String(text || '').trim();
    return trimmed || null;
  } catch {
    return null;
  }
};
