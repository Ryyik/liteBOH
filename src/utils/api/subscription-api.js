import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { CACHE_TTL_LEVELS } from '../cache-strategy.js';

/* ── 订阅 RPC 的「机器码 → 人话」映射（2026-11-24，plans/046）───────────────
   背景：订阅类 RPC 的失败走的是 **`{ok:false, message:'SOME_CODE'}`**（HTTP 200、
   不带 PostgREST error），所以 `normalizeDbError()` 那条 error 分支**根本接不到**它。
   `normalizeSubscribePayload()` 又把 `message` 原样透传，于是调用方
   `notify('订阅失败', result.data?.message)` 会把 `PLAN_NOT_AVAILABLE`
   这种英文常量**直接印到用户眼前**。实测（2026-11-24）确认无任何映射分支兜底。

   为什么映射放在这个文件、而不是 `request-core.js`：
     · 这些码是**订阅域**的词汇，放进通用层会让 request-core 越长越像垃圾桶
       （它现在已经有 FORUM_* / CLOUDINARY_* 两组了）；
     · 商城域就是这么做的（`shop-orders-api.js` 自己判 `ALREADY_CANCELLED`），
       跟随既有惯例，不新造第二套机制。

   ⚠️ 映射不到的码**保持原样透传**，不做「一律换成请稍后重试」的兜底 ——
      那样会把真错误淹掉，排查时看不到服务端到底说了什么。
   ⚠️ 只翻 `message`，**不动 `ok`**：调用方判断成功与否依赖 `ok`，翻译文案不该改变语义。 */
const SUBSCRIPTION_MESSAGE_LABELS = {
  PLAN_NOT_AVAILABLE: '该档位已下架，请刷新页面后选择其他方案',
  INVALID_BILLING_CYCLE: '计费周期无效，请重新选择',
  INSUFFICIENT_POINTS: '积分不足，请先充值',
  NOT_AUTHENTICATED: '请先登录',
  PROFILE_NOT_FOUND: '账号资料异常，请刷新后重试',
  LOWER_TIER_NOT_SUPPORTED: '不支持降级到更低的档位',
  INVALID_POINTS_COST: '价格校验失败，请刷新页面后重试',
};

/**
 * 把订阅 RPC 的机器码翻成用户可读文案；不认识的原样返回。
 * 空串/非字符串一律按「没有 message」处理，让调用方的 `||` 兜底生效。
 */
export function localizeSubscriptionMessage(message) {
  const code = String(message || '').trim();
  if (!code) return '';
  return SUBSCRIPTION_MESSAGE_LABELS[code] || code;
}

function normalizeSubscriptionRow(row = {}) {
  return {
    id: row.id || '',
    userId: row.user_id || '',
    planCode: row.plan_code || '',
    planName: row.plan_name || '',
    billingCycle: row.billing_cycle || '',
    pointsCost: Number(row.points_cost || 0),
    durationMonths: Number(row.duration_months || 0),
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || null,
    status: row.status || 'active',
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeSubscribePayload(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};

  return {
    ok: safe.ok !== false,
    // ⚠️ 走映射再交给调用方：调用方是 `notify('订阅失败', data.message)`
    //    直接上屏的，这里不翻就会把 PLAN_NOT_AVAILABLE 印给用户。
    message: localizeSubscriptionMessage(safe.message),
    subscriptionId: safe.subscription_id || null,
    planCode: safe.plan_code || '',
    planName: safe.plan_name || '',
    billingCycle: safe.billing_cycle || '',
    pointsDeducted: Number(safe.points_deducted || 0),
    currentPoints: Number(safe.current_points || 0),
    requiredPoints: Number(safe.required_points || 0),
    action: String(safe.action || ''),
    previousPlanCode: safe.previous_plan_code || null,
    creditApplied: Number(safe.credit_applied || 0),
    remainingDays: Number(safe.remaining_days || 0),
    startedAt: safe.started_at || null,
    expiresAt: safe.expires_at || null,
  };
}

export async function getMySubscriptions(userId, options = {}) {
  const includeExpired = options.includeExpired !== false;
  if (!userId) {
    return {
      ok: false,
      data: [],
      error: normalizeDbError({ message: '用户未登录', code: 'NOT_AUTHENTICATED' }),
    };
  }

  return executeRead(
    'subscriptions.getMySubscriptions',
    { userId, includeExpired },
    async () => {
      let query = supabase
        .from('user_subscriptions')
        .select(
          `
          id,
          user_id,
          plan_code,
          plan_name,
          billing_cycle,
          points_cost,
          duration_months,
          started_at,
          expires_at,
          status,
          metadata,
          created_at,
          updated_at
        `,
        )
        .eq('user_id', userId)
        .order('expires_at', { ascending: false });

      if (!includeExpired) {
        query = query.eq('status', 'active').gt('expires_at', new Date().toISOString());
      }

      const { data, error } = await query;
      if (error) return { data: [], error };
      return { data: (data || []).map(normalizeSubscriptionRow), error: null };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.REALTIME,
      tags: ['subscriptions', `subscriptions:user:${userId}`],
      timeoutMs: 8000,
      retry: 0,
    },
  );
}

export async function subscribeWithPoints(payload = {}) {
  const {
    planCode = '',
    planName = '',
    billingCycle = 'monthly',
    pointsCost = 0,
    durationMonths = 1,
    metadata = {},
  } = payload;

  const { data, error } = await supabase.rpc('subscribe_with_points', {
    p_plan_code: planCode,
    p_plan_name: planName,
    p_billing_cycle: billingCycle,
    p_points_cost: Number(pointsCost || 0),
    p_duration_months: Number(durationMonths || 0),
    p_metadata: metadata || {},
  });

  if (error) {
    return {
      ok: false,
      data: normalizeSubscribePayload(),
      error: normalizeDbError(error),
    };
  }

  const normalized = normalizeSubscribePayload(data);
  if (normalized.ok) {
    invalidateByTags(['profiles', 'subscriptions']);
  }

  return {
    ok: normalized.ok,
    data: normalized,
    error: null,
  };
}

// Coding 附加包（Token Plan 包）：与主订阅共存的独立订阅，服务端取价。
// 同档有效期内再买 = 顺延续费；异档共存，vault 侧加成按档位叠加。
export async function subscribeCodingPackWithPoints({
  planCode = '',
  billingCycle = 'monthly',
  metadata = {},
} = {}) {
  const { data, error } = await supabase.rpc('subscribe_coding_pack_with_points', {
    p_plan_code: String(planCode || ''),
    p_billing_cycle: billingCycle,
    p_metadata: metadata || {},
  });

  if (error) {
    return {
      ok: false,
      data: { ok: false, message: '' },
      error: normalizeDbError(error),
    };
  }

  const safe = (Array.isArray(data) ? data[0] : data) || {};
  const normalized = {
    ok: safe.ok !== false,
    message: localizeSubscriptionMessage(safe.message),
    subscriptionId: safe.subscription_id || null,
    planCode: String(safe.plan_code || ''),
    action: String(safe.action || ''),
    pointsDeducted: Number(safe.points_deducted || 0),
    currentPoints: Number(safe.current_points || 0),
    requiredPoints: Number(safe.required_points || 0),
    startedAt: safe.started_at || null,
    expiresAt: safe.expires_at || null,
  };
  if (normalized.ok) {
    invalidateByTags(['profiles', 'subscriptions']);
  }
  return { ok: normalized.ok, data: normalized, error: null };
}

function normalizeTrialPayload(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};
  return {
    ok: safe.ok === true,
    message: localizeSubscriptionMessage(safe.message),
    subscriptionId: safe.subscription_id || null,
    planCode: String(safe.plan_code || ''),
    planName: String(safe.plan_name || ''),
    expiresAt: safe.expires_at || null,
    trialDays: Number(safe.trial_days || 0),
  };
}

export async function startSubscriptionTrial({
  planCode = 'pro',
  durationDays = 3,
  metadata = {},
} = {}) {
  const { data, error } = await supabase.rpc('start_subscription_trial', {
    p_plan_code: String(planCode || 'pro'),
    p_duration_days: Number(durationDays || 3),
    p_metadata: metadata || {},
  });

  if (error) {
    return { ok: false, data: normalizeTrialPayload(), error: normalizeDbError(error) };
  }

  const normalized = normalizeTrialPayload(data);
  if (normalized.ok) {
    invalidateByTags(['profiles', 'subscriptions']);
  }

  return {
    ok: normalized.ok,
    data: normalized,
    error: null,
  };
}

function normalizeLotteryPityStatus(payload = {}) {
  const safe = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return {
    ok: safe.ok === true,
    tierCode: String(safe.tier_code || 'free'),
    eligible: Boolean(safe.eligible),
    consecutiveLosses: Math.max(0, Number(safe.consecutive_losses || 0)),
    threshold: Math.max(0, Number(safe.threshold || 0)),
    remainingLosses:
      safe.remaining_losses === null || safe.remaining_losses === undefined
        ? null
        : Math.max(0, Number(safe.remaining_losses || 0)),
    isDue: Boolean(safe.is_due),
    updatedAt: safe.updated_at || null,
  };
}

export async function getMyLotteryPityStatus() {
  const { data, error } = await supabase.rpc('get_my_lottery_pity_status');
  if (error) return { ok: false, data: null, error: normalizeDbError(error) };

  const normalized = normalizeLotteryPityStatus(data);
  return {
    ok: normalized.ok,
    data: normalized.ok ? normalized : null,
    error: normalized.ok
      ? null
      : normalizeDbError({ message: '保底进度暂不可用', code: 'PITY_STATUS_UNAVAILABLE' }),
  };
}

function normalizeAnniversaryClaim(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};
  return {
    ok: safe.ok === true,
    message: localizeSubscriptionMessage(safe.message),
    alreadyClaimed: Boolean(safe.already_claimed),
    planCode: String(safe.plan_code || ''),
    planName: String(safe.plan_name || ''),
    subscriptionId: safe.subscription_id || null,
    startedAt: safe.started_at || null,
    expiresAt: safe.expires_at || null,
  };
}

export async function getAnniversarySubscriptionClaim(userId) {
  if (!userId) return { ok: false, data: null, error: null };
  const { data, error } = await supabase
    .from('anniversary_subscription_claims')
    .select('granted_plan_code, granted_plan_name, subscription_id, started_at, expires_at')
    .eq('campaign_code', 'boh-8th-anniversary-2026')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, data: null, error: normalizeDbError(error) };
  if (!data) return { ok: true, data: null, error: null };
  return {
    ok: true,
    data: normalizeAnniversaryClaim({
      ok: true,
      already_claimed: true,
      plan_code: data.granted_plan_code,
      plan_name: data.granted_plan_name,
      subscription_id: data.subscription_id,
      started_at: data.started_at,
      expires_at: data.expires_at,
    }),
    error: null,
  };
}

export async function claimAnniversarySubscription({ preferCurrentTier = true } = {}) {
  const { data, error } = await supabase.rpc('claim_boh_eighth_anniversary_subscription', {
    p_prefer_current_tier: Boolean(preferCurrentTier),
  });

  if (error)
    return { ok: false, data: normalizeAnniversaryClaim(), error: normalizeDbError(error) };
  const normalized = normalizeAnniversaryClaim(data);
  if (normalized.ok || normalized.alreadyClaimed) {
    invalidateByTags(['profiles', 'subscriptions']);
  }
  return { ok: normalized.ok, data: normalized, error: null };
}
