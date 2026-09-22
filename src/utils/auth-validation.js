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
  '系统'
]);

export const getUsernameLength = (username) => Array.from(String(username || '')).length;

export const validateUsername = (username) => {
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

export const validateEmail = (email) => {
  const safeEmail = String(email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(safeEmail)) {
    return '请输入有效的邮箱地址';
  }
  return '';
};

/**
 * 新密码的强度下限 —— 全站唯一真源。
 * 注册（auth-api#signUp）与改密码（auth-api#updatePassword）都从这里取，
 * 不要再在调用方硬编码数字（历史上同一规则在 auth-api 里抄了三份，下限各不相同）。
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * 历史上允许过的最小密码长度。
 * 只用来给「当前密码」这类回填输入做便宜的前置拦截 —— 必须**刻意低于**
 * PASSWORD_MIN_LENGTH，且绝不能跟着它一起上调：一旦上调，历史 6~7 位密码的
 * 老用户就改不了邮箱、也删不了账号，强度策略变成锁死策略。
 */
export const PASSWORD_MIN_LENGTH_LEGACY = 6;

export const validatePassword = (password) => {
  const safePassword = String(password || '');
  if (!safePassword) {
    return '请设置密码';
  }
  if (safePassword.length < PASSWORD_MIN_LENGTH) {
    return `密码长度至少为 ${PASSWORD_MIN_LENGTH} 位`;
  }
  return '';
};

/**
 * 校验「当前密码」这类回填输入 —— 只做非空 + 历史下限的便宜拦截。
 * 真正的判定永远由服务端做（密码正确与否这里判断不了）。
 */
export const validateCurrentPassword = (password) => {
  const safePassword = String(password || '');
  if (!safePassword) {
    return '请输入当前账号密码';
  }
  if (safePassword.length < PASSWORD_MIN_LENGTH_LEGACY) {
    return `请输入当前账号密码（至少 ${PASSWORD_MIN_LENGTH_LEGACY} 位）`;
  }
  return '';
};

export const validateLoginId = (loginId) => {
  const safeLoginId = String(loginId || '').trim();
  if (!safeLoginId) {
    return '请输入方块 ID 或邮箱地址';
  }

  if (safeLoginId.includes('@')) {
    return validateEmail(safeLoginId);
  }

  return validateUsername(safeLoginId);
};

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const normalizeLoginId = (loginId) => String(loginId || '').trim();
