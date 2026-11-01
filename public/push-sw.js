/**
 * BOH Web Push：Service Worker 侧的推送与点击处理。
 *
 * ⚠️ 这个文件不是独立注册的 SW。它的源码在**构建期被原地内联**进 dist/sw.js：
 *    vite.config.js 的 `bohInlinePushSwPlugin()`（enforce: 'post'）在 closeBundle
 *    阶段把 sw.js 里 workbox 生成的 `importScripts("push-sw.js")` 替换成本文件内容
 *    （IIFE 包裹，带 `BOH-PUSH-INLINE` 标记）。
 *
 *    为什么不再用运行时的 `workbox.importScripts`：
 *      1) importScripts 是运行时拉取，受 /push-sw.js 的 HTTP 缓存支配（线上实测
 *         `max-age=14400` ⇒ 改推送逻辑最多滞后 4 小时生效）；
 *      2) 它不参与 SW 更新判定 —— 浏览器只比对 sw.js 的字节，sw.js 不变就永不重装。
 *    内联后推送逻辑成为 sw.js 的一部分 ⇒ 改它必然改变 sw.js 字节 ⇒ 正常触发 SW 更新。
 *
 * ⚠️ 因此它必须是**经典脚本**（classic worker），不能用 import / export。
 *    内联进 sw.js 后语法错误会让整个 SW 装不上（离线全白 + 推送失效），
 *    所以构建期有 `new Function()` 语法自检，失败直接 throw。
 *
 * ⚠️ **文件本身必须保留，不要删。** 已经装在用户机器上的旧 sw.js 仍然会
 *    `importScripts('/push-sw.js')`，删掉就是 404 + 整个 SW 装不上（PWA 直接失效）。
 *    新构建已不再依赖它，但存量客户端要等它们各自完成一次 SW 更新才会脱钩。
 *
 * ⚠️ 缓存策略见 public/_headers 的 /push-sw.js（存量客户端仍走这条路径）。
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
  const declarative =
    payload.notification && typeof payload.notification === 'object' ? payload.notification : null;
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

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (payload.badge !== undefined && payload.badge !== null) {
        await applyBadge(payload.badge);
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeTargetUrl(event.notification?.data?.url);

  event.waitUntil(
    (async () => {
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
    })(),
  );
});
