/**
 * 边缘落点采样（2026-11-23）
 *
 * 为什么有这个文件：2026-11-23 拿到两个真实样本 —— 同一域名，一个国内用户
 * `/cdn-cgi/trace` 返回 `colo=LAX`，另一个（中国移动 + 微信内置浏览器）返回
 * `colo=LHR`（伦敦）。也就是说大陆用户落到哪个 Cloudflare POP 完全由运营商到
 * anycast 段的 BGP 选路决定，**站点侧不可控**，而每次未命中还要从那个 POP
 * 回源到美西的 GitHub Pages —— 这就是「不是所有地区都能流畅打开」的机制。
 *
 * 但在这次之前只有口述，没有分布，于是「做体感兜底就够」还是「必须立项做多入口 /
 * 备案」这个决策没法下。本模块只负责把分布采出来。
 *
 * 设计约束（都是硬约束，别"优化"掉）：
 *   1. **绝不进首屏关键路径** —— `main.js` 在 `load` 之后的空闲回调里**动态引入**
 *      并调用；本模块刻意不进入口闭包（首屏预算只剩 0.2 KB 余量）。超时/失败全静默。
 *   2. **零额外域名** —— 打的是同源 `/cdn-cgi/trace`，复用已有连接，不新增 DNS/TLS。
 *   3. **每台设备每天最多一次** —— localStorage 记时间戳 + 服务端 unique 双保险。
 *   4. **不碰任何用户内容** —— 只读 timing 数值，不读 URL / UA / 账号。
 *   5. 非 Cloudflare 环境（本地 dev、预览）拿不到 `colo` ⇒ 自然跳过，不做特判。
 *
 * 数据落地见 `supabase/migrations/2026112301_edge_probe_events.sql`。
 */
import { logger } from './logger.js';

const PROBE_PATH = '/cdn-cgi/trace';
const STATE_KEY = 'boh_edge_probe_v1';
const CLIENT_KEY_STORAGE = 'boh_edge_probe_cid';

/* 20h 而不是 24h：用户跨时区 / 手机时钟略快时，24h 会让「每天一次」变成「隔天一次」， 
   20h 保证同一天只会采一次的同时不丢天数。服务端的 unique(client_key, probe_day) 兜底。 */
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/* 只有这两个域名的流量才有诊断价值；其余（dev / 预览 / 自建镜像）一律不采。 */
const PRODUCTION_HOSTS = ['blockofhome.cn', 'www.blockofhome.cn'];

/**
 * 解析 `/cdn-cgi/trace` 的 `k=v` 行格式。
 *
 * 非 Cloudflare 环境会返回站点自己的 index.html（HTML），解析不出 colo ⇒ 返回 null，
 * 这是本地开发/预览的天然护栏，不需要额外的环境判断。
 */
export function parseTrace(text) {
  if (typeof text !== 'string' || !text) return null;
  const fields = Object.create(null);
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (key) fields[key] = line.slice(idx + 1).trim();
  }
  const colo = String(fields.colo || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(colo)) return null;
  const loc = String(fields.loc || '').toUpperCase();
  return {
    colo,
    loc: /^[A-Z]{2}$/.test(loc) ? loc : null,
    // ip 只用于服务端截成 /24 反查 ASN，前端不落盘、不上报给任何第三方
    ip: fields.ip || null,
    http: fields.http || null,
    tls: fields.tls || null,
  };
}

/**
 * 距上次采样是否已超过间隔。
 *
 * 时钟回拨（`now - lastProbeAt` 为负）按「该采」处理：否则一次误设时间就能让
 * 这台设备永久停采，而这是最难发现的那种失败。
 */
export function shouldProbe({ lastProbeAt, now, minIntervalMs = MIN_INTERVAL_MS }) {
  if (!Number.isFinite(now)) return false;
  if (!Number.isFinite(lastProbeAt)) return true;
  const elapsed = now - lastProbeAt;
  if (elapsed < 0) return true;
  return elapsed >= minIntervalMs;
}

/** 读 `PerformanceNavigationTiming`：TTFB 与总耗时。取不到/越界一律 null。 */
export function readNavTiming(performanceImpl) {
  const empty = { ttfbMs: null, loadMs: null };
  const clamp = (value) =>
    Number.isFinite(value) && value >= 0 && value <= 600000 ? Math.round(value) : null;
  try {
    const entries = performanceImpl?.getEntriesByType?.('navigation');
    const entry = entries && entries[0];
    if (!entry) return empty;
    return { ttfbMs: clamp(entry.responseStart), loadMs: clamp(entry.duration) };
  } catch {
    return empty;
  }
}

function readStorage(storage) {
  try {
    return storage?.getItem(STATE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, value) {
  try {
    storage?.setItem(STATE_KEY, value);
  } catch {
    /* 隐私模式 / 配额满：内存态兜底，下次会话重采一次，可接受 */
  }
}

function parseStoredState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at);
    return Number.isFinite(at) ? { at } : null;
  } catch {
    return null;
  }
}

/** 本机随机标识。与账号无关，只用来在同一天里做去重。 */
export function getOrCreateClientKey(storage) {
  try {
    const existing = storage?.getItem(CLIENT_KEY_STORAGE);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const key =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    storage?.setItem(CLIENT_KEY_STORAGE, key);
    return key;
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function fetchTrace(fetchImpl) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(PROBE_PATH, {
      cache: 'no-store',
      signal: controller?.signal,
      headers: { accept: 'text/plain' },
    });
    if (!res?.ok) return null;
    return parseTrace(await res.text());
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 跑一次采样。依赖全部注入，单测里不需要真网络 / 真 localStorage。
 *
 * 返回的 `status` 是给测试和日志看的，调用方不关心：
 *   sent          已写入
 *   duplicate     服务端判定今天已有记录
 *   no-edge       拿不到 colo（非 Cloudflare / 被拦截 / 响应异常）
 *   skipped       间隔未到
 *   failed        网络或 RPC 抛错
 */
export async function runEdgeProbe({
  now = Date.now(),
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  performanceImpl = typeof performance !== 'undefined' ? performance : null,
  submit,
} = {}) {
  if (!fetchImpl || typeof submit !== 'function') return { status: 'failed', reason: 'no-dep' };

  const lastProbeAt = parseStoredState(readStorage(storage))?.at;
  if (!shouldProbe({ lastProbeAt, now })) return { status: 'skipped', reason: 'interval' };

  let trace = null;
  try {
    trace = await fetchTrace(fetchImpl);
  } catch (err) {
    logger.debug('edge-probe', 'trace 请求失败，跳过', err);
    return { status: 'failed', reason: 'fetch' };
  }
  if (!trace) return { status: 'no-edge' };

  const { ttfbMs, loadMs } = readNavTiming(performanceImpl);
  const payload = {
    p_client_key: getOrCreateClientKey(storage),
    p_colo: trace.colo,
    p_loc: trace.loc,
    p_http_version: trace.http,
    p_tls_version: trace.tls,
    p_ip: trace.ip,
    p_ttfb_ms: ttfbMs,
    p_load_ms: loadMs,
  };

  try {
    const inserted = await submit(payload);
    // 只有上报成功（含服务端判重）才记时间戳：一次网络抖动不该让这台设备
    // 永久丢样本，留到下次会话重试即可。写时间戳与「是否真的落库」无关 ——
    // 重复计数没有价值，反复重试只会放大跨境请求。
    writeStorage(storage, JSON.stringify({ at: now, colo: trace.colo }));
    logger.debug('edge-probe', `落点 ${trace.colo}`, { inserted, ttfbMs, loadMs });
    return { status: inserted === false ? 'duplicate' : 'sent', colo: trace.colo };
  } catch (err) {
    logger.debug('edge-probe', '上报失败', err);
    return { status: 'failed', reason: 'submit' };
  }
}

const isProductionHost = (hostname) =>
  PRODUCTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

/**
 * 入口：拿真实依赖跑一次。
 *
 * ⚠️ 调用方必须**在空闲期**调用它（`main.js` 用「`load` → `requestIdleCallback`
 * → 动态 `import()`」三步进来），本模块**不进入口闭包**：首屏预算只剩 0.2 KB
 * 余量，静态引入会直接顶破 `check:first-paint-budget`。
 *
 * 这里也刻意不自带 idle 调度：内部再包一层会变成「idle → 取 chunk → 再 idle」，
 * 多一次无意义的等待，还把「什么时候跑」分散到两个文件里。
 *
 * 一次观察不该影响任何用户可见的时序，所以不返回 Promise、失败只落 debug 日志。
 */
export function initEdgeProbe() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (import.meta.env.DEV) return;

  try {
    if (!isProductionHost(window.location.hostname)) return;
    if (navigator.onLine === false) return;
    // 省流量模式 / 2G 用户：宁可少一个样本，也不要再占一条跨境连接
    if (navigator.connection?.saveData === true) return;
  } catch {
    return;
  }

  runEdgeProbe({
    submit: async (payload) => {
      const { supabase } = await import('./supabase-client.js');
      const { data, error } = await supabase.rpc('record_edge_probe', payload);
      if (error) throw error;
      return data;
    },
  }).catch(() => {});
}
