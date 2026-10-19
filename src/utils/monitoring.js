import { logger } from './logger.js';

/* ⚠️ 端点刻意**惰性读取**（不在模块顶层取常量）：
   构建时 Vite 仍会把 `import.meta.env.VITE_MONITORING_ENDPOINT` 内联成字面量，
   生产行为不变；但单测可以用 vi.stubEnv 在不重置模块的情况下驱动真行为。 */
const getMonitoringEndpoint = () => import.meta.env.VITE_MONITORING_ENDPOINT;

/* ── URL 脱敏（2026-10-17，全面审查 P1-6）─────────────────────────────────
   背景：邮箱验证 / 重置密码回跳链接带明文一次性令牌（/?token_hash=…&type=…，
   见 useSignupEmailConfirmation.js / ResetPassword）——ResetPassword 要等 verify
   成功回调才 replaceState 清 URL，而 verify 是异步的。这个窗口期内任何
   runtime_error / unhandledrejection / web-vitals beacon 都会把 href 原样发出去，
   等于把「可直接 verifyOtp 建会话」的令牌交给监控端点。
   口径：**宁可过度脱敏**——命中敏感参数名一律 <redacted>，search 与 hash 两段都查
   （Supabase implicit flow 的令牌在 #access_token=… hash 里）。
   实现注意：正则只用 ES5 语法（参数前必须紧跟 ?&# 之一），**不要用 lookbehind**——
   旧 Safari 不支持，而这里是模块顶层字面量，解析失败 = 整站白屏。 */
const SENSITIVE_URL_PARAM_RE =
  /([?&#](?:token_hash|access_token|refresh_token|id_token|error_description|code|state)=)[^&\s"']+/g;

export function redactSensitiveParams(input) {
  return String(input ?? '').replace(SENSITIVE_URL_PARAM_RE, '$1<redacted>');
}

function sendMetric(payload) {
  const endpoint = getMonitoringEndpoint();
  if (!endpoint || typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify({
      ...payload,
      ts: Date.now(),
      url: redactSensitiveParams(window.location.href),
      ua: navigator.userAgent,
    });
    navigator.sendBeacon(endpoint, body);
  } catch (err) {
    logger.warn('monitoring', 'sendMetric failed', err);
  }
}

/**
 * 业务事件上报（相对 web-vitals 的通用出口）。
 *
 * 现在的使用者是「样式加载失败」这一类**静默降级**：用户看到的是「页面样式错乱」，
 * 而我们在服务端什么都看不到（2026-10-12 那次报障就是靠用户口述才发现的）。
 *
 * 返回 true = 已发出 beacon；false = 未配置端点（本地/预览环境属正常，不报错）。
 */
export function reportEvent(type, payload = {}) {
  if (!type) return false;
  if (!getMonitoringEndpoint()) {
    // 没配端点时留一条 debug：本地调试能看到信号存在，但不会污染 warn 级日志
    logger.debug('monitoring', `未配置监控端点，跳过上报：${type}`, payload);
    return false;
  }
  sendMetric({ type, ...payload });
  return true;
}

/* ── unknown_route 埋点（2026-10-15）───────────────────────────────────────
   背景：兼容重定向（30 条 → routes/compat.ts 的 17 条）此前**没有任何命中度量**，
   「旧链接还有没有人用、该不该删」只能拍脑袋，于是它们默认永久存在。
   现在 NotFound 兜底（router/index.ts）每次命中就报一条 unknown_route；
   到期复核时按真实数据决定每条兼容的删/续。
   ⚠️ 同一条路径每次会话只报一次（Set 去重）——防止脚本遍历/爬虫把埋点刷成噪声。 */
const reportedUnknownRoutes = new Set();

export function reportUnknownRoute(fullPath) {
  // fullPath 可能携带敏感 query（hash 路由下 token 也会出现在路由 query 里），
  // 与 sendMetric 的 url 字段同一套脱敏口径（2026-10-17 P1-6）
  const path = redactSensitiveParams(String(fullPath || '').slice(0, 200));
  if (!path || reportedUnknownRoutes.has(path)) return false;
  reportedUnknownRoutes.add(path);
  return reportEvent('unknown_route', { path });
}

function initWebVitalsLite() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  // LCP
  try {
    let lcpValue = 0;
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        lcpValue = last.startTime;
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden' && lcpValue > 0) {
          sendMetric({ type: 'web_vital', name: 'LCP', value: lcpValue });
          lcpObserver.disconnect();
        }
      },
      { once: true },
    );
  } catch (err) {
    logger.warn('monitoring', 'LCP observer unavailable', err);
  }

  // CLS
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          sendMetric({ type: 'web_vital', name: 'CLS', value: clsValue });
          clsObserver.disconnect();
        }
      },
      { once: true },
    );
  } catch (err) {
    logger.warn('monitoring', 'CLS observer unavailable', err);
  }

  // INP (lite): use max interaction event duration where supported
  try {
    let inpValue = 0;
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (typeof entry.duration === 'number') {
          inpValue = Math.max(inpValue, entry.duration);
        }
      }
    });
    inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden' && inpValue > 0) {
          sendMetric({ type: 'web_vital', name: 'INP', value: inpValue });
          inpObserver.disconnect();
        }
      },
      { once: true },
    );
  } catch (err) {
    logger.warn('monitoring', 'INP observer unavailable', err);
  }
}

export function initMonitoring() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const payload = {
      type: 'runtime_error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      col: event.colno,
    };
    logger.error('monitoring', payload.message || 'runtime_error', payload);
    sendMetric(payload);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || 'unknown');
    const payload = {
      type: 'unhandled_rejection',
      message: reason,
    };
    logger.error('monitoring', payload.message, payload);
    sendMetric(payload);
  });
  initWebVitalsLite();
}
