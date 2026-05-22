import { logger } from './logger.js';

const MONITORING_ENDPOINT = import.meta.env.VITE_MONITORING_ENDPOINT;

function sendMetric(payload) {
  if (!MONITORING_ENDPOINT || typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify({
      ...payload,
      ts: Date.now(),
      url: window.location.href,
      ua: navigator.userAgent
    });
    navigator.sendBeacon(MONITORING_ENDPOINT, body);
  } catch (err) {
    logger.warn('monitoring', 'sendMetric failed', err);
  }
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
      { once: true }
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
      { once: true }
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
      { once: true }
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
      col: event.colno
    };
    logger.error('monitoring', payload.message || 'runtime_error', payload);
    sendMetric(payload);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || 'unknown');
    const payload = {
      type: 'unhandled_rejection',
      message: reason
    };
    logger.error('monitoring', payload.message, payload);
    sendMetric(payload);
  });
  initWebVitalsLite();
}
