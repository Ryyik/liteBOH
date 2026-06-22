export const DEFAULT_CLOUD_IMAGE_LIMIT = 150;

const PLAN_DISPLAY_NAMES = {
  'boh-ai-plus': 'BOH Plus',
  'boh-pro': 'BOH Pro',
  'boh-max': 'BOH Max'
};

const PLAN_CLOUD_IMAGE_LIMITS = {
  'boh-ai-plus': 300,
  'boh-pro': 500,
  'boh-max': 800
};

export function normalizeSubscriptionPlanCode(planCode = '') {
  const normalized = String(planCode || '').trim().toLowerCase();
  if (normalized === 'boh-plus') return 'boh-ai-plus';
  return normalized;
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
