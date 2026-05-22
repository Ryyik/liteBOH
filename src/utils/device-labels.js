const normalizeText = (value = '') => String(value || '').trim();

const detectBrowser = (ua = '', brands = []) => {
  const safeUa = normalizeText(ua);
  const brandNames = Array.isArray(brands)
    ? brands.map((item) => normalizeText(item?.brand || item)).filter(Boolean)
    : [];
  const merged = `${brandNames.join(' ')} ${safeUa}`.toLowerCase();

  if (merged.includes('edg')) return 'Edge';
  if (merged.includes('opr') || merged.includes('opera')) return 'Opera';
  if (merged.includes('firefox')) return 'Firefox';
  if (merged.includes('samsung browser')) return 'Samsung Internet';
  if (merged.includes('wechat')) return '微信内置浏览器';
  if (merged.includes('chrome') || merged.includes('chromium')) return 'Chrome';
  if (merged.includes('safari')) return 'Safari';
  return '浏览器';
};

const detectOs = (ua = '', platform = '') => {
  const merged = `${normalizeText(platform)} ${normalizeText(ua)}`.toLowerCase();

  if (merged.includes('iphone') || merged.includes('ios')) return 'iOS';
  if (merged.includes('ipad')) return 'iPadOS';
  if (merged.includes('android')) return 'Android';
  if (merged.includes('mac')) return 'macOS';
  if (merged.includes('win')) return 'Windows';
  if (merged.includes('linux')) return 'Linux';
  return '未知系统';
};

const detectDeviceKind = (ua = '', platform = '', mobile = false, maxTouchPoints = 0) => {
  const merged = `${normalizeText(platform)} ${normalizeText(ua)}`.toLowerCase();

  if (merged.includes('iphone')) return 'iPhone';
  if (merged.includes('ipad')) return 'iPad';
  if (merged.includes('android')) {
    return mobile ? 'Android 手机' : 'Android 平板';
  }
  if (merged.includes('mac')) return 'Mac';
  if (merged.includes('win')) return 'Windows PC';
  if (merged.includes('linux')) return 'Linux 设备';
  if (maxTouchPoints > 1 && mobile) return '移动设备';
  return '这台设备';
};

const parseUserAgentLabel = (ua = '') => {
  const safeUa = normalizeText(ua);
  if (!safeUa) return '未知设备';

  const deviceKind = detectDeviceKind(safeUa, '', /mobile|iphone|android/.test(safeUa.toLowerCase()), 0);
  const os = detectOs(safeUa);
  const browser = detectBrowser(safeUa);

  if (deviceKind === '这台设备' && os === '未知系统' && browser === '浏览器') {
    return safeUa;
  }

  return `${deviceKind} · ${os} · ${browser}`;
};

export function getCurrentDeviceDisplayLabel() {
  if (typeof window === 'undefined') return '当前设备';

  const ua = normalizeText(window.navigator?.userAgent || '');
  const uaData = window.navigator?.userAgentData || null;
  const brands = Array.isArray(uaData?.brands) ? uaData.brands : [];
  const platform = normalizeText(uaData?.platform || '');
  const mobile = Boolean(uaData?.mobile);
  const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);

  const deviceKind = detectDeviceKind(ua, platform, mobile, maxTouchPoints);
  const os = detectOs(ua, platform);
  const browser = detectBrowser(ua, brands);
  return `${deviceKind} · ${os} · ${browser}`;
}

export function formatTrustedDeviceDisplayLabel(item = {}, currentDeviceLabel = '') {
  if (item?.is_current_device) {
    return currentDeviceLabel || '当前设备';
  }

  const summary = normalizeText(item?.user_agent_summary || '');
  return parseUserAgentLabel(summary);
}
