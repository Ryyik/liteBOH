/**
 * generation-profile.js — 生成参数 profile 解析 + 分层上下文压缩
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 *
 * ⚠️ 参数真源：`GENERATION_PROFILE_BY_MODE` / `PSYCH_INTERVIEW_GENERATION_PROFILE`
 * 在 `composables/chat-engine-config.js`，`TASK_GENERATION_PRESETS` 在 `generation-params.js`；
 * 本文件只消费，不复制（`check:bohai-params` 会拦）。
 */
import {
  GENERATION_PROFILE_BY_MODE,
  PSYCH_INTERVIEW_GENERATION_PROFILE,
} from '../composables/chat-engine-config.js';
import { TASK_GENERATION_PRESETS } from '../generation-params.js';
import { TOKEN_ESTIMATE_ROLE_OVERHEAD, estimateMessagesTokens, estimateTokens } from './tokens.js';

// 生成停滞判定阈值（原在 bohai-engine-helpers.js，plans/025 v2 · Step 3「utils 归位」）
export const GENERATION_STALL_TIMEOUT_MS = 120000;

// getGenerationProfile 的 memoize cache：避免同一组参数重复创建对象
const _generationProfileCache = new Map();
const _GEN_PROFILE_CACHE_MAX = 32;
const _GEN_PROFILE_CACHE_TTL_MS = 60_000;

export const getGenerationProfile = (
  modeId,
  { factualQuestion = false, operationQuestion = false, psychInterview = false } = {},
) => {
  // ⚠️ psychInterview 必须进 cacheKey：缓存按 key 命中，漏掉它会让访谈态拿到非访谈态的 profile
  // （或反过来），而且这种错配是静默的 —— 表现只是"有时候像问卷腔"。
  const cacheKey = `${modeId}|${factualQuestion}|${operationQuestion}|${psychInterview}`;
  const cached = _generationProfileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < _GEN_PROFILE_CACHE_TTL_MS) return cached.value;
  if (cached) _generationProfileCache.delete(cacheKey);

  const fallback = TASK_GENERATION_PRESETS.engineParamFallback;
  const base = GENERATION_PROFILE_BY_MODE[modeId] || fallback;
  const profile = { ...base };
  if (factualQuestion || operationQuestion) {
    profile.temperature = Math.min(profile.temperature, operationQuestion ? 0.14 : 0.16);
    profile.top_p = Math.min(profile.top_p, operationQuestion ? 0.68 : 0.72);
    profile.frequency_penalty = Math.min(profile.frequency_penalty, 0.08);
  }

  // 访谈态最后覆盖，且**有意放在上面的 clamp 之后**：
  // 访谈中途用户难免问出"我该怎么办"这类操作/事实问句，若让 clamp 生效会把温度压到 0.14，
  // 访谈立刻退回问卷腔。访谈要的是"像人"，不是"准确"，所以它优先级最高。
  if (psychInterview) {
    Object.assign(profile, PSYCH_INTERVIEW_GENERATION_PROFILE);
  }

  // LRU-style cache eviction
  if (_generationProfileCache.size >= _GEN_PROFILE_CACHE_MAX) {
    const firstKey = _generationProfileCache.keys().next().value;
    _generationProfileCache.delete(firstKey);
  }
  _generationProfileCache.set(cacheKey, { value: profile, timestamp: Date.now() });
  return profile;
};

// ============================================================
// 优化 3: 分层上下文压缩
// 3 层压缩策略：trim → summarize → compact
// ============================================================

export const compactMessages = (messages, maxTokens) => {
  if (!Array.isArray(messages) || messages.length <= 2) return messages;

  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= maxTokens) return messages;

  // Layer 1: Trim tool outputs (长消息截断)
  let result = messages.map((m) => {
    const content = String(m.content || '');
    if (estimateTokens(content) > 800) {
      return { ...m, content: content.slice(0, 2400) + '...（内容已截断）' };
    }
    return m;
  });

  if (estimateMessagesTokens(result) <= maxTokens) return result;

  // Layer 2: 从最早的非 system 消息开始丢弃
  const system = result.filter((m) => m.role === 'system');
  const nonSystem = result.filter((m) => m.role !== 'system');

  const kept = [];
  let used = estimateMessagesTokens(system);
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const estimated =
      TOKEN_ESTIMATE_ROLE_OVERHEAD + estimateTokens(String(nonSystem[i].content || ''));
    if (used + estimated > maxTokens) break;
    kept.unshift(nonSystem[i]);
    used += estimated;
  }

  return [...system, ...kept];
};
