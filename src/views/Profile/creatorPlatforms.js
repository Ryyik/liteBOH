export const CREATOR_PLATFORM_KEYS = ['bilibili', 'xiaohongshu', 'douyin'];

export const creatorPlatformsMeta = [
  { key: 'bilibili', label: '哔哩哔哩', placeholder: '示例：B站 UID / 用户名' },
  { key: 'xiaohongshu', label: '小红书', placeholder: '示例：小红书号 / 用户名' },
  { key: 'douyin', label: '抖音', placeholder: '示例：抖音号 / 用户名' }
];

export const creatorPlatformLabelMap = creatorPlatformsMeta.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

const creatorPlatformBaseUrls = {
  bilibili: 'https://www.bilibili.com',
  xiaohongshu: 'https://www.xiaohongshu.com',
  douyin: 'https://www.douyin.com'
};

export const normalizeCreatorPlatformIds = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const normalized = {};
  for (const key of CREATOR_PLATFORM_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[key] = trimmed.slice(0, 64);
  }
  return normalized;
};

export const buildCreatorPlatformJumpUrl = (platformKey, rawAccountId) => {
  const accountId = String(rawAccountId || '').trim();
  if (!platformKey) return '';

  if (platformKey === 'bilibili') {
    if (/^\d+$/.test(accountId)) {
      return `https://space.bilibili.com/${accountId}`;
    }
    if (accountId) {
      return `https://search.bilibili.com/upuser?keyword=${encodeURIComponent(accountId)}`;
    }
    return creatorPlatformBaseUrls.bilibili;
  }

  if (platformKey === 'xiaohongshu') {
    if (accountId) {
      return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(accountId)}&source=web_explore_feed`;
    }
    return creatorPlatformBaseUrls.xiaohongshu;
  }

  if (platformKey === 'douyin') {
    if (accountId) {
      return `https://www.douyin.com/search/${encodeURIComponent(accountId)}?type=user`;
    }
    return creatorPlatformBaseUrls.douyin;
  }

  return '';
};

export const copyText = async (text) => {
  const safeText = String(text || '').trim();
  if (!safeText) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(safeText);
      return true;
    }
  } catch (_err) {
    // noop, fallback to execCommand
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = safeText;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (_err) {
    return false;
  }
};
