/**
 * Web Push 订阅层（浏览器端）
 *
 * 职责边界：
 *   · 这里只管「把浏览器订阅注册到账号上」以及「查状态、开关、测试」。
 *   · 真正发推送在 supabase/functions/push-send（服务端），触发点是
 *     notifications 的 AFTER INSERT 触发器 —— 前端不做推送分发。
 *   · 角标数字的落点在 stores/notifications.ts，不在本文件。
 *
 * ⚠️ VAPID 公钥不硬编码在前端：由 push-send 的 action=config 运行时下发。
 *    这样轮换密钥不需要重新构建/部署前端，公钥也只有一个来源。
 *
 * ⚠️ 绝不能「进页面就弹权限」。Chrome 对无用户手势的权限请求会降级甚至永久拉黑，
 *    一旦 blocked 用户几乎无法再开启。因此 subscribe 只在用户点开关时调用。
 */

import { supabase } from '../supabase-client.js';
import { logger } from '../logger.js';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const PUSH_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/push-send` : '';
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
let configCache = null;
let configFetchedAt = 0;

/**
 * 等待 Service Worker 就绪的超时上限（毫秒）。
 *
 * ⚠️ 为什么必须带超时：规范里 `navigator.serviceWorker.ready` 只在**存在 active
 *    registration** 时才 resolve；若从未注册成功（隐私浏览被限制、扩展拦截、
 *    注册异常），这个 Promise 会**永久 pending** —— 它不是 reject，try/catch 抓不到。
 *    后果是任何 await 它的路径直接卡死：登出（signOut → unbindDeviceOnLogout）、
 *    设置页 loading 不结束、开关按钮一直 busy。
 *    `'serviceWorker' in navigator` 只说明 API 存在，不保证注册成功，
 *    所以超时兜底是唯一可靠的防线。
 */
const SERVICE_WORKER_READY_TIMEOUT_MS = 3000;

/** 等待 SW 就绪；超时或异常一律返回 null，绝不挂起调用方 */
const waitForServiceWorker = async (timeoutMs = SERVICE_WORKER_READY_TIMEOUT_MS) => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  let timerId = null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => {
        timerId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch (error) {
    logger.warn('push-api', '等待 Service Worker 就绪失败', error);
    return null;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};

/**
 * 是否属于 iOS / iPadOS 系（这类设备必须「添加到主屏幕」才允许 Web Push）。
 *
 * ⚠️ 不能只匹配 UA 里的 iPhone|iPad|iPod：iPadOS 13+ 的 Safari 以
 *    「Macintosh; Intel Mac OS X」+ Mobile 上报，UA 里**根本没有 iPad 字样**。
 *    只按 UA 判会把 iPad 当成桌面 → 在标签页里直接调 Notification.requestPermission()，
 *    而 iOS 标签页内 Notification API 不可用，表现为「点了没反应 / 未获得权限」。
 *    唯一可靠的补充判据是触摸点数（桌面 Mac 恒为 0）。
 */
const isIosLike = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1;
};

/** 把 base64url 的 applicationServerKey 转成 subscribe() 需要的 Uint8Array */
const urlBase64ToUint8Array = (base64Url) => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = `${base64Url}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

/**
 * 能力检测。返回 supported=false 时带 reason，便于设置页给出可执行的提示，
 * 而不是让用户盯着一个点不动的开关。
 */
export const getPushCapability = () => {
  if (typeof window === 'undefined') return { supported: false, reason: '当前环境不支持通知' };
  if (!window.isSecureContext) return { supported: false, reason: '需要 HTTPS 环境' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: '当前浏览器不支持 Service Worker' };
  if (!('PushManager' in window)) return { supported: false, reason: '当前浏览器不支持推送订阅' };
  if (!('Notification' in window)) return { supported: false, reason: '当前浏览器不支持系统通知' };

  // iOS Safari 只有把站点「添加到主屏幕」后才允许 Web Push，标签页里拿不到权限
  const isIos = isIosLike();
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isIos && !isStandalone) {
    return { supported: false, reason: 'iPhone / iPad 需先「添加到主屏幕」再开启' };
  }

  return { supported: true, reason: '' };
};

/** 取服务端配置（是否已部署 VAPID + 公钥）。5 分钟内存缓存。 */
export const fetchPushConfig = async ({ force = false } = {}) => {
  if (!PUSH_FUNCTION_URL) return { enabled: false, vapidPublicKey: '', error: '未配置 Supabase 地址' };
  const now = Date.now();
  if (!force && configCache && now - configFetchedAt < CONFIG_CACHE_TTL_MS) return configCache;

  try {
    const response = await fetch(PUSH_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 函数网关默认校验 JWT，config 用 anon key 过网关即可（函数内部不再校验身份）
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'config' }),
    });
    const payload = await response.json().catch(() => ({}));
    configCache = {
      enabled: Boolean(payload?.enabled && payload?.vapidPublicKey),
      vapidPublicKey: String(payload?.vapidPublicKey || ''),
      error: response.ok ? '' : String(payload?.message || `配置读取失败 (${response.status})`),
    };
  } catch (error) {
    logger.warn('push-api', '读取推送配置失败', error);
    configCache = { enabled: false, vapidPublicKey: '', error: error.message || '网络异常' };
  }

  configFetchedAt = now;
  return configCache;
};

/** 当前浏览器已有的推送订阅（没有则 null）。不触发任何权限请求。 */
export const readLocalSubscription = async () => {
  if (!getPushCapability().supported) return null;
  // 必须走带超时的等待：SW 未注册成功时 ready 会永久 pending（详见 waitForServiceWorker 注释）
  const registration = await waitForServiceWorker();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch (error) {
    logger.warn('push-api', '读取本地订阅失败', error);
    return null;
  }
};

/**
 * 汇总设置页需要的状态。
 * enabled 的判定 = 权限已授予 + 本地有订阅 + 库里也存在这台设备的行
 * （只看本地不够：用户可能在另一端解绑过，或者换过账号）
 *
 * force=true 绕过 fetchPushConfig 的 5 分钟缓存 —— 设置页是用户主动查看的地方，
 * 若服务端刚配好密钥而缓存还是「未配置」，用户会以为自己点错了。
 */
export const getPushStatus = async (userId, { force = false } = {}) => {
  const capability = getPushCapability();
  const status = {
    supported: capability.supported,
    reason: capability.reason,
    configured: false,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    enabled: false,
    endpoint: '',
  };
  if (!capability.supported) return status;

  const config = await fetchPushConfig({ force });
  status.configured = config.enabled;
  if (!config.enabled) return status;

  const subscription = await readLocalSubscription();
  if (!subscription) return status;
  status.endpoint = subscription.endpoint;

  if (status.permission !== 'granted' || !userId) return status;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)
    .is('disabled_at', null)
    .maybeSingle();

  if (error) {
    logger.warn('push-api', '查询订阅状态失败', error);
    return status;
  }

  status.enabled = Boolean(data?.id);
  return status;
};

/** 把本地订阅写入账号。走 RPC 以正确处理「同设备换账号」的接管。 */
const persistSubscription = async (subscription) => {
  const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  const endpoint = String(json?.endpoint || '').trim();
  const keys = json?.keys || {};

  if (!endpoint || !keys.p256dh || !keys.auth) {
    return { success: false, message: '订阅信息不完整，请重试' };
  }

  const { error } = await supabase.rpc('boh_save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: String(keys.p256dh),
    p_auth: String(keys.auth),
    p_user_agent: String(navigator.userAgent || ''),
  });

  if (error) {
    logger.error('push-api', '保存订阅失败', error);
    return { success: false, message: error.message || '保存订阅失败' };
  }
  return { success: true, message: '' };
};

/**
 * 开启推送。必须在用户手势里调用（点击开关）。
 * 顺序刻意如此：先拿权限，再订阅，最后落库 —— 任一步失败都能给出准确原因。
 */
export const enablePush = async (userId) => {
  if (!userId) return { success: false, message: '请先登录' };

  const capability = getPushCapability();
  if (!capability.supported) return { success: false, message: capability.reason };

  // force：刚在服务端配好密钥时，不能让 5 分钟缓存把开关挡回去
  const config = await fetchPushConfig({ force: true });
  if (!config.enabled) {
    return { success: false, message: config.error || '推送服务尚未在服务端配置' };
  }

  // 1) 权限
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return {
      success: false,
      message: permission === 'denied'
        ? '通知权限已被浏览器拒绝，需在网站设置里手动允许'
        : '未获得通知权限',
    };
  }

  // 2) 浏览器订阅
  let subscription = await readLocalSubscription();
  if (!subscription) {
    const registration = await waitForServiceWorker();
    if (!registration) {
      return { success: false, message: '通知服务尚未就绪，请稍后重试' };
    }
    try {
      subscription = await registration.pushManager.subscribe({
        // 规范要求：收到推送必须展示可见通知（不允许静默推送）
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      });
    } catch (error) {
      logger.error('push-api', '创建订阅失败', error);
      return { success: false, message: error.message || '创建订阅失败' };
    }
  }

  // 3) 落库
  const saved = await persistSubscription(subscription);
  if (!saved.success) return saved;

  // 4) 立刻用真实链路跑一次，用户在设置页就能确认成没成
  const testResult = await sendTestPush({ silent: true });
  return {
    success: true,
    message: testResult.ok ? '已开启，测试通知已发送' : '已开启（测试通知发送失败，请稍后重试）',
  };
};

/** 关闭推送：先退订，再删库（顺序反了会留下一个推不到的僵尸订阅） */
export const disablePush = async (userId) => {
  const subscription = await readLocalSubscription();

  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch (error) {
      logger.warn('push-api', '退订失败（继续清理数据库）', error);
    }
  }

  if (subscription?.endpoint) {
    const { error } = await supabase.rpc('boh_delete_push_subscription', {
      p_endpoint: subscription.endpoint,
    });
    if (error) {
      logger.error('push-api', '删除订阅记录失败', error);
      return { success: false, message: error.message || '关闭失败' };
    }
    return { success: true, message: '已关闭通知' };
  }

  // 本地已经没有订阅（例如被浏览器回收过）。
  // ⚠️ 这里刻意**不**再顺手停用该账号的其它订阅行：push_subscriptions 是按设备一行的，
  //    全量停用会让用户在手机 / 平板上的推送莫名失效，而用户本意只是关掉当前这台。
  //    当前设备无订阅可解绑时，如实告知范围即可。
  logger.warn('push-api', '当前设备无本地订阅，未改动其它设备的订阅', { userId });
  return { success: true, message: '当前设备未开启通知，其它设备不受影响' };
};

/**
 * 静默对齐：登录/进设置页时调。
 * 场景：用户在 A 设备开过推送，之后换账号登录 —— 本地订阅还在，
 * 权限也还在，此时应当把这台设备归属到当前账号，否则新账号收不到任何推送。
 */
export const syncPushSubscription = async (userId) => {
  if (!userId) return;
  const capability = getPushCapability();
  if (!capability.supported) return;
  if (Notification.permission !== 'granted') return;

  const subscription = await readLocalSubscription();
  if (!subscription) return;

  const saved = await persistSubscription(subscription);
  if (!saved.success) logger.warn('push-api', '同步订阅失败', saved.message);
};

/** 退出登录时解绑这台设备，避免把上一个账号的推送继续发到本机 */
export const unbindDeviceOnLogout = async () => {
  try {
    const subscription = await readLocalSubscription();
    if (!subscription?.endpoint) return;
    // 退订时已登出，auth.uid() 可能已失效；失败就算了，下次登录会被 sync 接管
    await supabase.rpc('boh_delete_push_subscription', { p_endpoint: subscription.endpoint });
  } catch (error) {
    logger.warn('push-api', '退出登录解绑设备失败（忽略）', error);
  }
};

/** 发一条测试推送。silent=true 时不抛出，只返回结果。 */
export const sendTestPush = async ({ silent = false } = {}) => {
  if (!PUSH_FUNCTION_URL) {
    if (silent) return { ok: false, message: '未配置 Supabase 地址' };
    throw new Error('未配置 Supabase 地址');
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || '';
    if (!token) {
      if (silent) return { ok: false, message: '登录状态已失效' };
      throw new Error('登录状态已失效');
    }

    const response = await fetch(PUSH_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'test' }),
    });
    const payload = await response.json().catch(() => ({}));
    const ok = response.ok && payload?.ok;
    if (!ok && !silent) throw new Error(String(payload?.message || `发送失败 (${response.status})`));
    return { ok, message: String(payload?.message || '') };
  } catch (error) {
    logger.warn('push-api', '测试推送失败', error);
    if (silent) return { ok: false, message: error.message || '发送失败' };
    throw error;
  }
};
