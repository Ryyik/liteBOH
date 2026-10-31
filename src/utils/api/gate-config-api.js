/**
 * 首屏开屏配置（home_gate_config）读写
 *
 * 分层：
 *   - 真相源是 DB 单行表（id=1），管理台 GateConsole 写、首页开屏读；
 *   - 首屏必须在「首帧」就决定渲染哪种开屏，所以另有一份 localStorage 缓存，
 *     同步读、网络回来后覆盖（与 useGatePull 读 gate-passed 同性质）；
 *   - 生效判定（enabled + 时间窗）放在本模块，管理台预览与线上渲染共用同一份，
 *     否则「后台显示启用中、线上却没播」这类问题会各写一套判断。
 */
import { supabase } from '../supabase-client.js';

export const GATE_CONFIG_CACHE_KEY = 'boh-home-gate-config-v1';
/** 缓存只作「网络失败时的兜底」，正常路径每次进站都会拉一次网络 */
const CACHE_TTL_MS = 30 * 60 * 1000;

export const GATE_THEMES = [
  { value: 'halloween', label: '万圣夜（像素南瓜灯）' },
  { value: 'default', label: '默认开屏（红苹果）' },
];

export const GATE_CTA_TYPES = [
  { value: 'none', label: '不放按钮' },
  { value: 'lottery', label: '跳转抽奖' },
  { value: 'route', label: '跳转站内页面' },
];

const COLUMNS =
  'id,enabled,theme,eyebrow,title,subtitle,hint_text,cta_text,cta_target_type,cta_lottery_id,cta_route,starts_at,ends_at,updated_at';

const str = (value, fallback = '') => {
  const text = value === null || value === undefined ? '' : String(value);
  return text.trim() ? text.trim() : fallback;
};

const isoOrNull = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

/** DB 行 → 前端配置对象。字段口径与表单一一对应，别在组件里再改名 */
export function normalizeGateConfig(row = {}) {
  const theme = str(row.theme, 'halloween');
  const targetType = str(row.cta_target_type, 'none');
  return {
    id: Number(row.id ?? 1),
    enabled: row.enabled === true || row.enabled === 'true',
    theme: theme === 'default' ? 'default' : 'halloween',
    eyebrow: str(row.eyebrow),
    title: str(row.title),
    subtitle: str(row.subtitle),
    hint_text: str(row.hint_text),
    cta_text: str(row.cta_text),
    cta_target_type: ['none', 'lottery', 'route'].includes(targetType) ? targetType : 'none',
    cta_lottery_id: str(row.cta_lottery_id) || null,
    cta_route: str(row.cta_route),
    starts_at: isoOrNull(row.starts_at),
    ends_at: isoOrNull(row.ends_at),
    updated_at: row.updated_at || null,
  };
}

/** 是否该播（enabled + 时间窗）。now 可注入，便于单测 */
export function isGateConfigActive(config, now = Date.now()) {
  if (!config || !config.enabled) return false;
  if (config.theme === 'default') return false;
  const started = config.starts_at ? new Date(config.starts_at).getTime() : null;
  const ended = config.ends_at ? new Date(config.ends_at).getTime() : null;
  if (Number.isFinite(started) && now < started) return false;
  if (Number.isFinite(ended) && now >= ended) return false;
  return true;
}

/**
 * CTA 目标解析。返回 null 表示「不该渲染按钮」。
 * 绑定抽奖但目前还没建抽奖时，退到抽奖列表页 —— 活动上线第一天最常见的情形。
 */
export function resolveGateCtaTarget(config) {
  if (!config || !config.cta_text) return null;
  if (config.cta_target_type === 'lottery') {
    const id = str(config.cta_lottery_id);
    return { to: id ? `/lotteries?lottery=${encodeURIComponent(id)}` : '/lotteries' };
  }
  if (config.cta_target_type === 'route') {
    const path = str(config.cta_route);
    // 只接受站内绝对路径：避免把用户配置的 javascript: / http: 直接塞给 router
    if (!path.startsWith('/') || path.startsWith('//')) return null;
    return { to: path };
  }
  return null;
}

/** 同步读缓存（首帧用）。返回 null 表示没有可用缓存 */
export function readGateConfigCache() {
  try {
    const raw = window.localStorage.getItem(GATE_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.config) return null;
    const savedAt = Number(parsed.savedAt || 0);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > CACHE_TTL_MS) return null;
    return normalizeGateConfig(parsed.config);
  } catch {
    return null;
  }
}

export function writeGateConfigCache(config) {
  try {
    window.localStorage.setItem(
      GATE_CONFIG_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), config: normalizeGateConfig(config) }),
    );
  } catch {
    /* 隐私模式 / 配额满：存不住就每次拉网络，不影响功能 */
  }
}

export function clearGateConfigCache() {
  try {
    window.localStorage.removeItem(GATE_CONFIG_CACHE_KEY);
  } catch {
    /* 同上 */
  }
}

/** 公开读（首页开屏用）。表不存在 / 网络失败时返回 error，调用方回落默认开屏 */
export async function fetchGateConfig() {
  const { data, error } = await supabase
    .from('home_gate_config')
    .select(COLUMNS)
    .eq('id', 1)
    .maybeSingle();
  if (error) return { data: null, error };
  const config = data ? normalizeGateConfig(data) : null;
  if (config) writeGateConfigCache(config);
  return { data: config, error: null };
}

/** 管理台保存。patch 是完整配置对象（不做字段级合并，避免「漏传即清空」的歧义） */
export async function saveGateConfig(patch) {
  const payload = {
    id: 1,
    enabled: Boolean(patch.enabled),
    theme: patch.theme === 'default' ? 'default' : 'halloween',
    eyebrow: str(patch.eyebrow),
    title: str(patch.title),
    subtitle: str(patch.subtitle),
    hint_text: str(patch.hint_text),
    cta_text: str(patch.cta_text),
    cta_target_type: ['none', 'lottery', 'route'].includes(patch.cta_target_type)
      ? patch.cta_target_type
      : 'none',
    cta_lottery_id: str(patch.cta_lottery_id) || null,
    cta_route: str(patch.cta_route),
    starts_at: isoOrNull(patch.starts_at),
    ends_at: isoOrNull(patch.ends_at),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('home_gate_config')
    .upsert(payload, { onConflict: 'id' })
    .select(COLUMNS)
    .maybeSingle();
  if (error) return { data: null, error };
  const config = data ? normalizeGateConfig(data) : null;
  if (config) writeGateConfigCache(config);
  return { data: config, error: null };
}

/** 管理台的抽奖下拉：只取挑选需要的几列，按创建时间倒序 */
export async function listLotteryOptions() {
  const { data, error } = await supabase
    .from('lotteries')
    .select('id,title,status,draw_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error };
  return {
    data: (data || []).map((row) => ({
      id: String(row.id || ''),
      title: str(row.title, '未命名抽奖'),
      status: str(row.status, 'open'),
      draw_at: row.draw_at || null,
    })),
    error: null,
  };
}
