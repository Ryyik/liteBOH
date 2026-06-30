export const DEFAULT_CLOUD_IMAGE_LIMIT = 150;

const PLAN_DISPLAY_NAMES = {
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

export function normalizeSubscriptionPlanCode(planCode = '') {
  return String(planCode || '').trim().toLowerCase();
}

export function isSubscriptionRecordActive(record, nowTs = Date.now()) {
  if (!record || String(record.status || '').trim().toLowerCase() !== 'active') return false;
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
    .filter((record) => isSubscriptionRecordActive(record, nowTs))
    .map((record) => record.planCode || record.plan_code);

  return resolveCloudBenefitFromPlanCodes(activePlanCodes);
}

const TIER_NICKNAME_COLORS = {
  'free': '',
  'plus': '',
  'pro': 'nickname-gold',
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
    if (code && idx > bestIdx && isSubscriptionRecordActive(record, nowTs)) {
      bestIdx = idx;
      best = code;
    }
  });
  return best;
}
