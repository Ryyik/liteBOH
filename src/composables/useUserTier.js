import { supabase } from '@/utils/supabase-client.js';
import {
  normalizeSubscriptionPlanCode,
  resolveNicknameTierClass,
} from '@/utils/subscription-benefits.js';

const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟（内存内「新鲜」期）
const TIER_CACHE_MAX_ENTRIES = 500;
const tierCache = new Map();
const tierRequestInFlight = new Map();
const tierBatchInFlight = new Map();

/* ── 持久化（2026-11-16，A4）──────────────────────────────────────────────
 * 目标：回访时省掉一次 `get_user_subscription_tiers` 往返（实测该 RPC 执行
 * 34.5 ms，比整个 posts 列表查询 0.26 ms 贵两个数量级），并消掉昵称「先灰、
 * 1.3s 后才染色」的闪变 —— 等级决定的不只是徽章，还有昵称颜色和卡片皮肤。
 *
 * ⚠️ 只喂「显示」路径，这是本设计的关键约束。tier 同时被**配额与解锁**判断
 * 消费（useLabQuota / photo-albums/quota / useAvatarFrame 的 TIER_RANK）。
 * 订阅过期后若还信一份旧缓存，本地闸门就会放行服务端本会拒绝的操作。
 * ⇒ `fetchUserTier`（单发，配额/解锁用）**不认**持久化条目，照旧发真实查询；
 *   `fetchUserTiersBatch` / `getNicknameClass` / `getUserTierCode`（显示用）才认。
 *
 * TTL 取 2 小时而非跟随内存的 5 分钟：持久化要覆盖「当天多次进站」，5 分钟
 * 等于白做；也不能太长，否则降级用户的配色/头像框要旧很久（纯观感问题，
 * 但没必要）。2 小时是「覆盖回访」与「陈旧上限」的折中。
 *
 * ⚠️ key 与 `src/utils/safe-storage.js` 的 SENSITIVE_KEYS 两处必须一致
 * （登出要清 —— 里面是 userId → 档位，属于设备上的身份残留）。
 */
const TIER_PERSIST_KEY = 'boh_user_tier_cache_v1';
const TIER_PERSIST_TTL_MS = 2 * 60 * 60 * 1000;
const TIER_PERSIST_MAX_ENTRIES = 200;
const TIER_PERSIST_FLUSH_DELAY_MS = 1000;

function getLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // Safari 隐私模式访问 localStorage 会抛 ⇒ 当作没有
  }
  return null;
}

/** @returns {Record<string, {tier: string, expiresAt: number}>|null} */
function readPersistedTiers() {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(TIER_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 带版本号：结构变更时直接丢弃旧格式，不做迁移（缓存丢了只是多一次往返）
    if (!parsed || parsed.v !== 1 || !parsed.entries || typeof parsed.entries !== 'object')
      return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

function writePersistedTiers(entries) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(TIER_PERSIST_KEY, JSON.stringify({ v: 1, entries }));
  } catch {
    // 配额满 / 隐私模式：缓存是纯加速，写不进去就退化成「每次重新查」
  }
}

function hydrateFromPersistedTiers() {
  const entries = readPersistedTiers();
  if (!entries) return;
  const now = Date.now();
  for (const [userId, entry] of Object.entries(entries)) {
    if (!userId || !entry || typeof entry.tier !== 'string' || !entry.tier) continue;
    const expiresAt = Number(entry.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
    const existing = tierCache.get(userId);
    // 已有未过期的真实查询结果时不要被旧值覆盖
    if (existing && !existing.persisted && existing.expiresAt > now) continue;
    tierCache.set(userId, { tier: entry.tier, expiresAt, persisted: true });
  }
}

/** 只收集还没过期的条目；新查到的值按持久 TTL 写回，否则 5 分钟后回访又白查 */
function collectPersistableTiers(now) {
  const out = {};
  for (const [userId, entry] of tierCache) {
    if (!userId || !entry || !entry.tier) continue;
    const expiresAt = entry.persisted ? entry.expiresAt : now + TIER_PERSIST_TTL_MS;
    if (!(expiresAt > now)) continue;
    out[userId] = { tier: entry.tier, expiresAt };
  }
  const keys = Object.keys(out);
  if (keys.length > TIER_PERSIST_MAX_ENTRIES) {
    keys.sort((a, b) => out[b].expiresAt - out[a].expiresAt);
    for (const key of keys.slice(TIER_PERSIST_MAX_ENTRIES)) delete out[key];
  }
  return out;
}

let persistTimer = null;

/**
 * 立刻落盘。导出是因为它有真实调用场景（pagehide 时 1s 合并窗口还没到，
 * 不刷一次就白查了），顺带让单测不必依赖假定时器。
 */
export function flushUserTierCache() {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  writePersistedTiers(collectPersistableTiers(Date.now()));
}

function schedulePersistFlush() {
  if (typeof setTimeout !== 'function' || persistTimer !== null) return;
  // 合并写入：一次批量 RPC 会连续 set 几十条，不能每条都 JSON.stringify 一遍
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writePersistedTiers(collectPersistableTiers(Date.now()));
  }, TIER_PERSIST_FLUSH_DELAY_MS);
  // 浏览器里是数字（没有 unref），Node 测试环境里别拖住进程退出
  if (persistTimer && typeof persistTimer.unref === 'function') persistTimer.unref();
}

/**
 * @param {string} userId
 * @param {{ includePersisted?: boolean }} [options]
 *   includePersisted=false 用于配额/解锁等**决策**路径：不认持久化条目，只认本次会话
 *   真实查询过的值。
 */
function getCachedTier(userId, { includePersisted = true } = {}) {
  const entry = tierCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    tierCache.delete(userId);
    return undefined;
  }
  if (!includePersisted && entry.persisted) return undefined;
  return entry.tier;
}

function setCachedTier(userId, tier) {
  if (!userId) return;
  tierCache.set(userId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS, persisted: false });
  // Map 迭代序即插入序：容量超限时淘汰最早写入的条目
  while (tierCache.size > TIER_CACHE_MAX_ENTRIES) {
    const oldestKey = tierCache.keys().next().value;
    if (oldestKey === undefined) break;
    tierCache.delete(oldestKey);
  }
  schedulePersistFlush();
}

// 模块导入即水合：ForumMain 的 chunk 一到位就有配色可用，不必等 RPC 回来
hydrateFromPersistedTiers();

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushUserTierCache);
}

export function useUserTier() {
  async function fetchUserTier(userId) {
    if (!userId) return '';
    // 不认持久化条目：这条路径同时服务配额与头像框解锁判断，必须拿本次会话的真值
    const cached = getCachedTier(userId, { includePersisted: false });
    if (cached !== undefined) return cached;
    if (tierRequestInFlight.has(userId)) return tierRequestInFlight.get(userId);

    const request = (async () => {
      const { data, error } = await supabase.rpc('get_user_subscription_tier', {
        p_user_id: userId,
      });
      if (error || !data) {
        // RPC 失败不写缓存（避免负缓存 free 5 分钟），当次渲染回退 free，下次仍会重试
        return 'free';
      }
      const normalizedTier = normalizeSubscriptionPlanCode(data) || 'free';
      setCachedTier(userId, normalizedTier);
      return normalizedTier;
    })();
    tierRequestInFlight.set(userId, request);
    try {
      return await request;
    } finally {
      tierRequestInFlight.delete(userId);
    }
  }

  /**
   * 批量获取多个用户的订阅等级，调用 get_user_subscription_tiers RPC。
   * 已缓存且未过期的用户直接使用缓存，未命中的批量查询。
   *
   * 跨方法去重：批量 RPC 发起前，把待查 id 预注册进 tierRequestInFlight，
   * 使同一时刻并发调用的 fetchUserTier(id) 命中 in-flight 而不再各自发起单发 RPC。
   * 这样「父组件批量预取 + 子组件挂载时单发兜底」的组合只产生 1 次批量 RPC。
   * @param {string[]} userIds
   * @returns {Promise<Map<string, string>>} userId -> tier
   */
  async function fetchUserTiersBatch(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

    // in-flight 去重：相同 id 集合的并发批量请求共享同一次 RPC
    const batchKey = [...new Set(userIds.filter(Boolean))].sort().join(',');
    if (!batchKey) return new Map();
    const inFlight = tierBatchInFlight.get(batchKey);
    if (inFlight) return inFlight;

    const request = (async () => {
      const result = new Map();
      const uncached = [];
      for (const id of userIds) {
        const cached = getCachedTier(id);
        if (cached !== undefined) {
          result.set(id, cached);
        } else {
          uncached.push(id);
        }
      }
      if (uncached.length === 0) return result;

      const pending = uncached.filter((id) => tierRequestInFlight.has(id));
      const requestIds = uncached.filter((id) => !tierRequestInFlight.has(id));

      // 预注册必须在任何 await 之前同步完成：父组件 `void fetchUserTiersBatch(...)`
      // 返回后，子组件挂载时的 fetchUserTier(id) 才能立即命中 in-flight 而不发单发 RPC。
      // 若在此处之前有 await，会让出执行权导致子组件单发 RPC 抢先发起。
      let settleBatch;
      const batchGate = new Promise((res) => {
        settleBatch = res;
      });
      const registeredEntries = new Map();
      for (const id of requestIds) {
        const entryPromise = batchGate.then(() => getCachedTier(id) ?? 'free');
        tierRequestInFlight.set(id, entryPromise);
        registeredEntries.set(id, entryPromise);
      }

      // 等待已在飞行中的单发请求（来自其它路径），它们的结果会写入缓存
      await Promise.all(
        pending.map(async (id) => result.set(id, await tierRequestInFlight.get(id))),
      );
      if (requestIds.length === 0) {
        settleBatch();
        return result;
      }

      try {
        const { data, error } = await supabase.rpc('get_user_subscription_tiers', {
          p_user_ids: requestIds,
        });

        if (error || !Array.isArray(data)) {
          // 批量失败：先清除本批预注册（避免下方 fetchUserTier 递归命中自己死锁），
          // 再回退到逐个 fetchUserTier 单发路径。
          for (const id of requestIds) {
            if (tierRequestInFlight.get(id) === registeredEntries.get(id)) {
              tierRequestInFlight.delete(id);
            }
          }
          settleBatch();
          for (const id of requestIds) {
            result.set(id, await fetchUserTier(id));
          }
          return result;
        }

        for (const row of data) {
          const tier = normalizeSubscriptionPlanCode(row.tier) || 'free';
          setCachedTier(row.user_id, tier);
          result.set(row.user_id, tier);
        }
        // RPC 正常返回但缺少成员时同样缓存 free，避免每次渲染重新查询。
        for (const id of requestIds) {
          if (!result.has(id)) {
            setCachedTier(id, 'free');
            result.set(id, 'free');
          }
        }
        return result;
      } finally {
        // 批量结束：清除本批预注册（缓存已就绪，后续 fetchUserTier 走正常缓存命中）。
        for (const id of requestIds) {
          if (tierRequestInFlight.get(id) === registeredEntries.get(id)) {
            tierRequestInFlight.delete(id);
          }
        }
        settleBatch();
      }
    })();

    tierBatchInFlight.set(batchKey, request);
    try {
      return await request;
    } finally {
      tierBatchInFlight.delete(batchKey);
    }
  }

  function getNicknameClass(userId) {
    const tier = getCachedTier(userId);
    if (!tier) return '';
    return resolveNicknameTierClass(tier);
  }

  function getUserTierCode(userId) {
    return getCachedTier(userId) || '';
  }

  function setTierCache(userId, tierCode) {
    if (userId && tierCode) setCachedTier(userId, tierCode);
  }

  return { fetchUserTier, fetchUserTiersBatch, getNicknameClass, setTierCache, getUserTierCode };
}
