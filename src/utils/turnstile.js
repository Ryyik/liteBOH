const TURNSTILE_ENABLED_BY_ENV =
  String(import.meta.env.VITE_TURNSTILE_ENABLED || 'false').trim().toLowerCase() === 'true';
const TURNSTILE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

export const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const TURNSTILE_DEFAULT_LOAD_TIMEOUT_MS = 12000;
export const TURNSTILE_DEFAULT_TOKEN_TIMEOUT_MS = 15000;

const TURNSTILE_API_POLL_MS = 50;
const TURNSTILE_ACTION_MAX_LENGTH = 32;

let turnstileLoadPromise = null;

const canUseTurnstileBrowserApis = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export const isTurnstileEnabled = () =>
  canUseTurnstileBrowserApis() && TURNSTILE_ENABLED_BY_ENV && Boolean(TURNSTILE_SITE_KEY);

export const getTurnstileApi = () => {
  if (!canUseTurnstileBrowserApis()) return null;
  return window.turnstile || null;
};

const normalizeTurnstileAction = (action = 'auth') => {
  const normalized = String(action || 'auth')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, '_')
    .slice(0, TURNSTILE_ACTION_MAX_LENGTH);
  return normalized || 'auth';
};

const appendHiddenTurnstileContainer = () => {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);
  return container;
};

const cleanupTurnstileWidget = (api, widgetId, container) => {
  if (widgetId !== null && widgetId !== undefined && typeof api?.remove === 'function') {
    try {
      api.remove(widgetId);
    } catch (_error) {
      // 忽略清理失败，避免影响主流程。
    }
  }

  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
};

const markScriptState = (script, state) => {
  if (!script) return;
  script.dataset.loadState = state;
};

const getTurnstileScript = () => {
  if (!canUseTurnstileBrowserApis()) return null;
  return document.getElementById(TURNSTILE_SCRIPT_ID);
};

const waitForTurnstileApi = (timeoutMs = TURNSTILE_DEFAULT_LOAD_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const poll = () => {
      const api = getTurnstileApi();
      if (api) {
        resolve(api);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('TURNSTILE_SCRIPT_LOAD_TIMEOUT'));
        return;
      }

      window.setTimeout(poll, TURNSTILE_API_POLL_MS);
    };

    poll();
  });

const ensureTurnstileScriptElement = () => {
  let script = getTurnstileScript();
  if (script?.dataset.loadState === 'error') {
    script.remove();
    script = null;
  }

  if (script) return script;

  script = document.createElement('script');
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.crossOrigin = 'anonymous';
  markScriptState(script, 'loading');

  try {
    script.fetchPriority = 'high';
  } catch (_error) {
    // 旧浏览器不支持 fetchPriority，忽略即可。
  }

  script.addEventListener('load', () => {
    markScriptState(script, 'loaded');
  });

  script.addEventListener('error', () => {
    markScriptState(script, 'error');
    turnstileLoadPromise = null;
  });

  document.head.appendChild(script);
  return script;
};

const createTurnstileLoadPromise = (timeoutMs = TURNSTILE_DEFAULT_LOAD_TIMEOUT_MS) => {
  if (turnstileLoadPromise) return turnstileLoadPromise;

  const script = ensureTurnstileScriptElement();
  turnstileLoadPromise = waitForTurnstileApi(timeoutMs).catch((error) => {
    markScriptState(script, 'error');
    turnstileLoadPromise = null;
    throw error;
  });

  return turnstileLoadPromise;
};

export const primeTurnstileScript = (timeoutMs = TURNSTILE_DEFAULT_LOAD_TIMEOUT_MS) => {
  if (!isTurnstileEnabled()) return;
  if (getTurnstileApi()) return;

  void createTurnstileLoadPromise(timeoutMs).catch(() => {
    // 失败时保留给页面上的重试按钮处理。
  });
};

export const ensureTurnstileScript = (timeoutMs = TURNSTILE_DEFAULT_LOAD_TIMEOUT_MS) => {
  if (!isTurnstileEnabled()) {
    return Promise.reject(new Error('TURNSTILE_DISABLED'));
  }

  const api = getTurnstileApi();
  if (api) return Promise.resolve(api);

  return createTurnstileLoadPromise(timeoutMs);
};

export const resolveTurnstileToken = async ({
  action = 'auth',
  timeoutMs = TURNSTILE_DEFAULT_TOKEN_TIMEOUT_MS,
} = {}) => {
  if (!isTurnstileEnabled()) return '';

  const api = await ensureTurnstileScript(timeoutMs);
  if (!api || typeof api.render !== 'function' || typeof api.execute !== 'function') {
    throw new Error('TURNSTILE_API_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    const container = appendHiddenTurnstileContainer();
    const safeAction = normalizeTurnstileAction(action);
    const safeTimeoutMs = Math.max(2000, Number(timeoutMs) || TURNSTILE_DEFAULT_TOKEN_TIMEOUT_MS);
    let widgetId = null;
    let settled = false;
    let timerId = null;

    const finalize = (token = '', error = null) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      cleanupTurnstileWidget(api, widgetId, container);
      if (error) {
        reject(error);
        return;
      }
      resolve(String(token || '').trim());
    };

    const failWithCode = (code) => finalize('', new Error(String(code || 'TURNSTILE_FAILED')));

    try {
      widgetId = api.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        size: 'invisible',
        action: safeAction,
        execution: 'execute',
        callback: (token) => {
          const safeToken = String(token || '').trim();
          if (!safeToken) {
            failWithCode('TURNSTILE_EMPTY_TOKEN');
            return;
          }
          finalize(safeToken, null);
        },
        'error-callback': () => failWithCode('TURNSTILE_CHALLENGE_FAILED'),
        'expired-callback': () => failWithCode('TURNSTILE_CHALLENGE_EXPIRED'),
        'timeout-callback': () => failWithCode('TURNSTILE_CHALLENGE_TIMEOUT'),
      });

      timerId = window.setTimeout(() => {
        failWithCode('TURNSTILE_EXECUTE_TIMEOUT');
      }, safeTimeoutMs);

      api.execute(widgetId);
    } catch (error) {
      finalize('', error instanceof Error ? error : new Error('TURNSTILE_EXECUTE_FAILED'));
    }
  });
};
