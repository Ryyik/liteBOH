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

export const validatePassword = (password) => {
  const safePassword = String(password || '');
  if (safePassword.length < 6) {
    return '密码长度至少为 6 位';
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
