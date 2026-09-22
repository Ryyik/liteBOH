const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_ALLOWED_PATTERN = /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/;
const USERNAME_RESERVED_WORDS = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'official',
  'mod',
  'moderator',
  'api',
  'www',
  'mail',
  'test',
  'service',
  'security',
  'boh',
  'bohai',
  '管理员',
  '官方',
  '系统',
]);

const getUsernameLength = (username: string) => Array.from(String(username || '')).length;

export const validateUsername = (username: string) => {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) {
    return '请输入有效的方块 ID';
  }

  const usernameLength = getUsernameLength(safeUsername);
  if (usernameLength < USERNAME_MIN_LENGTH || usernameLength > USERNAME_MAX_LENGTH) {
    return `方块 ID 需为 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符。`;
  }
  if (!USERNAME_ALLOWED_PATTERN.test(safeUsername)) {
    return '方块 ID 仅支持中英文、数字、下划线和连字符。';
  }
  if (/^[_-]|[_-]$/.test(safeUsername)) {
    return '方块 ID 不能以下划线或连字符开头或结尾。';
  }
  if (/^\d+$/.test(safeUsername)) {
    return '方块 ID 不能为纯数字。';
  }

  const normalizedLowerCase = safeUsername.toLowerCase();
  if (USERNAME_RESERVED_WORDS.has(safeUsername) || USERNAME_RESERVED_WORDS.has(normalizedLowerCase)) {
    return '该方块 ID 为保留词，请更换后重试。';
  }

  return '';
};

export const validateEmail = (email: string) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(safeEmail)) {
    return '请输入有效的邮箱地址';
  }
  return '';
};

// ⚠️ 必须与 src/utils/auth-validation.js 的 PASSWORD_MIN_LENGTH 保持一致。
// 这两份是**独立副本**（Deno 不能直接 import src/），谁改都得同步改另一个；
// 漂移过：前端提到 8 位后这里仍是 6，前端校验可被绕过，服务端形同虚设。
// 由 scripts/check-auth-validation-parity.mjs 把关。
const PASSWORD_MIN_LENGTH = 8;

export const validatePassword = (password: string) => {
  const safePassword = String(password || '');
  if (!safePassword) {
    return '请设置密码';
  }
  if (safePassword.length < PASSWORD_MIN_LENGTH) {
    return `密码长度至少为 ${PASSWORD_MIN_LENGTH} 位`;
  }
  return '';
};

export const validateLoginId = (loginId: string) => {
  const safeLoginId = String(loginId || '').trim();
  if (!safeLoginId) {
    return '登录失败：请输入方块 ID 或邮箱地址。';
  }

  if (safeLoginId.includes('@')) {
    const emailValidationMessage = validateEmail(safeLoginId);
    return emailValidationMessage ? `登录失败：${emailValidationMessage}` : '';
  }

  const usernameValidationMessage = validateUsername(safeLoginId);
  return usernameValidationMessage ? `登录失败：${usernameValidationMessage}` : '';
};
