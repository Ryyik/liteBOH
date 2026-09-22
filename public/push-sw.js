/**
 * BOH Web Push：Service Worker 侧的推送与点击处理。
 *
 * ⚠️ 这个文件不是独立注册的 SW —— 它由 vite.config.js 的 `workbox.importScripts`
 *    拼进生成的 sw.js 顶部（`importScripts('/push-sw.js')`）。
 *    原因：项目用的是 vite-plugin-pwa 的 generateSW 策略，生成器不给写自定义代码，
 *    importScripts 是唯一能在不切到 injectManifest 的前提下注入 push 事件处理的入口。
 *
 * ⚠️ 因此它必须是**经典脚本**（classic worker），不能用 import / export。
 *    也不能删：删了之后线上 sw.js 会 importScripts 到一个 404，整个 SW 装不上，
 *    表现为 PWA 直接失效。
 *
 * ⚠️ 它是运行时被拉取的（不像 hash 资源带指纹），缓存策略见 public/_headers 的 /push-sw.js。
 *
 * 两类事件：
 *   push              → 弹系统通知 + 刷新应用图标角标
 *   notificationclick → 回到应用并落到消息中心
 */

const DEFAULT_URL = '/#/user-space/messages';

/**
 * 归一化点击目标地址。
 *
 * Declarative Web Push 的 `notification.navigate` 是**绝对 URL**，而页面侧
 * （stores/notifications.ts）只认以 `/#` 开头的相对路径才会走 hash 路由。
 * 因此同源地址一律退化成 path+search+hash，避免「点了通知只聚焦、不跳转」。
 */
const normalizeTargetUrl = (raw) => {
  const value = String(raw || '');
  if (!value) return DEFAULT_URL;
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin === self.location.origin) {
      const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return relative && relative !== '/' ? relative : DEFAULT_URL;
    }
  } catch (_error) {
    // 非法 URL：按原值交给浏览器处理
  }
  return value;
};

/** 通知小图标用 monochrome 素材：安卓状态栏只渲染单色剪影，彩色图会变成白块 */
const NOTIFICATION_ICON = '/icons/icon-192.png';
const NOTIFICATION_BADGE = '/icons/icon-monochrome-512.png';

/**
 * 解析推送载荷。
 * 兼容非 JSON 的兜底（如调试用 tools 直接推纯文本）。
 */
const readPayload = (event) => {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (_error) {
    try {
      return { body: event.data.text() };
    } catch (_innerError) {
      return {};
    }
  }
};

/**
 * 刷新应用图标角标。
 *
 * ⚠️ Chrome for Android **不支持** setAppBadge（MDN 兼容表明确 No），
 *    所以安卓这条路会静默跳过 —— 安卓的角标由系统在「存在未读通知」时自动点亮，
 *    数字只在 iOS Safari 16.4+ 与桌面 Chrome/Edge（已安装 PWA）才可能出现。
 *    因此这里必须做好能力检测，不能让它抛错影响通知展示。
 */
const applyBadge = async (count) => {
  const nav = self.navigator;
  if (!nav || typeof nav.setAppBadge !== 'function') return;
  try {
    const value = Number(count);
    if (Number.isFinite(value) && value > 0) {
      await nav.setAppBadge(value);
    } else if (typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    }
  } catch (_error) {
    // 权限未授予 / 平台不支持：静默，通知本身照常展示
  }
};

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  // 兼容 Declarative Web Push 载荷（顶层 web_push:8030 + notification{}）：
  // Safari 18.4+ 会由浏览器自己渲染、根本不进这里；但若某端把该载荷转交给 SW，
  // 也要能正确读出内容，而不是退化成默认文案。
  const declarative = payload.notification && typeof payload.notification === 'object'
    ? payload.notification
    : null;
  const title = String(payload.title || declarative?.title || '方块之家').slice(0, 80);
  const options = {
    body: String(payload.body || declarative?.body || '你有一条新消息').slice(0, 160),
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    // 每条通知独立 tag → 互不顶掉、每条都会单独响一次。
    // ⚠️ 不能加 renotify:true：它只在「复用同一个 tag」时才有意义，
    //    部分浏览器在无意义的 renotify 下会直接抛 TypeError，导致通知弹不出来。
    //    若以后改成按类型合并 tag（同一 type 共用一个 tag），才需要把 renotify 打开。
    tag: String(payload.tag || 'boh-notification'),
    data: {
      url: normalizeTargetUrl(payload.url || declarative?.navigate),
      notificationId: payload.notificationId || null,
    },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (payload.badge !== undefined && payload.badge !== null) {
      await applyBadge(payload.badge);
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeTargetUrl(event.notification?.data?.url);

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // 已经有打开的窗口：通知页面自己去 navigate，然后聚焦
    // （hash 路由下直接 openWindow 会新开一个窗口，体验更差）
    for (const client of clientList) {
      if (typeof client.focus === 'function') {
        try {
          client.postMessage({ type: 'boh-notification-click', url: targetUrl });
        } catch (_error) {
          // postMessage 失败的旧客户端忽略，下面仍然聚焦
        }
        await client.focus();
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
