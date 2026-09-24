export const DEFAULT_CLOUD_IMAGE_LIMIT = 150;

export const PLAN_DISPLAY_NAMES = {
  'free': 'Free',
  'plus': 'Plus',
  'pro': 'Pro',
  'max': 'Max',
  'ultra': 'Ultra'
};

export const PLAN_CLOUD_IMAGE_LIMITS = {
  'free': 150,
  'plus': 300,
  'pro': 450,
  'max': 900,
  'ultra': 1200
};

/* ===== 档位权益展示单源 =====
   订阅页卡片与对比表共用：改一处两处同步（展示格式化在 SubscriptionPlans.vue）。
   - PLAN_AI_TOKENS：BOH AI 每日 Token 额度
   - PLAN_LAB_QUOTAS：实验室 PPT / Word 产出次数
   - PLAN_LOTTERY_PITY_THRESHOLDS：抽奖保底门槛，口径对齐 get_my_lottery_pity_status：
     按「连续未中奖场次」累计、中奖清零、达标后兑保底礼；Free 不计保底（null）。
     真实阈值以数据库 RPC 为准，此处为展示口径，改动需与 PityIslandCard 阈值文案同步核对。 */
export const PLAN_AI_TOKENS = {
  'free': '20 万',
  'plus': '80 万',
  'pro': '200 万',
  'max': '500 万',
  'ultra': '1000 万'
};

export const PLAN_LAB_QUOTAS = {
  'free': '10 次 / 月',
  'plus': '15 次 / 月',
  'pro': '20 次 / 月',
  'max': '30 次 / 月',
  'ultra': '不限次数'
};

export const PLAN_LOTTERY_PITY_THRESHOLDS = {
  'free': null,
  'plus': 24,
  'pro': 18,
  'max': 12,
  'ultra': 8
};

const PLAN_CODE_ALIASES = {
  'boh-ai-plus': 'plus',
  'boh-plus': 'plus',
  'boh-pro': 'pro',
  'boh-max': 'max',
  'boh-ultra': 'ultra'
};

export function normalizeSubscriptionPlanCode(planCode = '') {
  const normalized = String(planCode || '').trim().toLowerCase();
  return PLAN_CODE_ALIASES[normalized] || normalized;
}

export function isSubscriptionRecordActive(record, nowTs = Date.now()) {
  if (!record || String(record.status || '').trim().toLowerCase() !== 'active') return false;
  const expiresTs = Date.parse(record.expiresAt || record.expires_at || '');
  return Number.isFinite(expiresTs) && expiresTs > nowTs;
}

// 决定权益是否生效：active 或 trial（未过期）均发放完整权益
export function isSubscriptionRecordGrantingBenefits(record, nowTs = Date.now()) {
  if (!record) return false;
  const status = String(record.status || '').trim().toLowerCase();
  if (status !== 'active' && status !== 'trial') return false;
  const expiresTs = Date.parse(record.expiresAt || record.expires_at || '');
  return Number.isFinite(expiresTs) && expiresTs > nowTs;
}

export function resolveCloudBenefitFromPlanCodes(planCodes = []) {
  let matchedPlanCode = '';
  let cloudImageLimit = DEFAULT_CLOUD_IMAGE_LIMIT;

  planCodes.forEach((rawCode) => {
    const planCode = normalizeSubscriptionPlanCode(rawCode);
    const planLimit = Number(PLAN_CLOUD_IMAGE_LIMITS[planCode] || 0);
    if (planLimit > cloudImageLimit) {
      matchedPlanCode = planCode;
      cloudImageLimit = planLimit;
    }
  });

  return {
    planCode: matchedPlanCode,
    planName: matchedPlanCode ? (PLAN_DISPLAY_NAMES[matchedPlanCode] || matchedPlanCode) : '默认额度',
    cloudImageLimit
  };
}

export function resolveCloudBenefitFromSubscriptions(subscriptions = [], nowTs = Date.now()) {
  const activePlanCodes = (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((record) => isSubscriptionRecordGrantingBenefits(record, nowTs))
    .map((record) => record.planCode || record.plan_code);

  return resolveCloudBenefitFromPlanCodes(activePlanCodes);
}

export const TIER_NICKNAME_COLORS = {
  'free': '',
  'plus': 'nickname-blue',
  'pro': 'nickname-silver',
  'max': 'nickname-gold',
  'ultra': 'nickname-rainbow'
};

export function resolveNicknameTierClass(planCode) {
  const code = normalizeSubscriptionPlanCode(planCode);
  return TIER_NICKNAME_COLORS[code] || '';
}

export function resolveHighestTierCode(subscriptions = [], nowTs = Date.now()) {
  const TIER_ORDER = ['free', 'plus', 'pro', 'max', 'ultra'];
  let best = '';
  let bestIdx = -1;
  (Array.isArray(subscriptions) ? subscriptions : []).forEach((record) => {
    const code = normalizeSubscriptionPlanCode(record.planCode || record.plan_code);
    const idx = TIER_ORDER.indexOf(code);
    if (code && idx > bestIdx && isSubscriptionRecordGrantingBenefits(record, nowTs)) {
      bestIdx = idx;
      best = code;
    }
  });
  return best;
}
