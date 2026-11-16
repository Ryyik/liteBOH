/**
 * 从 User-Agent 里读出一个**人能看懂**的设备名（2026-11-16）。
 *
 * 为什么要单独成文件：登录页的「当前设备」和「登录设备」列表都要用同一套判定，
 * 各写一份必然漂移（例如 iOS 上的 Chrome 是 `CriOS` 而不是 `Chrome/`，
 * 微信内嵌浏览器又是 `MicroMessenger` 且**同时**带 Safari 和 Chrome 字样，
 * 判断顺序错了会把微信显示成 Safari）。
 *
 * 刻意不引第三方 UA 解析库：这里只需要"iOS · 微信"这种粒度，
 * 引 ua-parser 会把几十 KB 拉进首屏，收益不匹配。
 */

export const describeDeviceLabel = (userAgent) => {
  const ua = String(userAgent || '').trim();
  if (!ua) return '未知设备';

  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Macintosh|Mac OS X/i.test(ua)
        ? 'macOS'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '未知系统';

  // 顺序有意义：微信 > Edge > iOS 上的 Chrome/Firefox > 桌面 Chrome > Safari。
  // 微信 UA 同时含 Safari 与 Chrome 字样，放最后会把微信认成 Safari / Chrome。
  const browser = /MicroMessenger/i.test(ua)
    ? '微信'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /CriOS/i.test(ua)
        ? 'Chrome'
        : /FxiOS/i.test(ua)
          ? 'Firefox'
          : /Chrome\//i.test(ua)
            ? 'Chrome'
            : /Firefox\//i.test(ua)
              ? 'Firefox'
              : /Safari\//i.test(ua)
                ? 'Safari'
                : '浏览器';

  return `${os} · ${browser}`;
};
