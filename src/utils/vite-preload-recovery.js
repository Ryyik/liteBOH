const VITE_PRELOAD_RELOAD_TS_KEY = "boh_vite_preload_reload_ts";
const VITE_PRELOAD_RELOAD_COOLDOWN_MS = 30 * 1000;

export function setupVitePreloadErrorRecovery() {
  if (import.meta.env.DEV || typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now();
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(sessionStorage.getItem(VITE_PRELOAD_RELOAD_TS_KEY) || 0);
    } catch {
      lastReloadAt = 0;
    }

    // 限流重载，避免资源持续异常时反复刷新。
    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < VITE_PRELOAD_RELOAD_COOLDOWN_MS) {
      return;
    }

    try {
      sessionStorage.setItem(VITE_PRELOAD_RELOAD_TS_KEY, String(now));
    } catch {
      // ignore
    }
    if (typeof event?.preventDefault === "function") {
      event.preventDefault();
    }
    window.location.reload();
  });
}