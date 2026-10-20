export const DEFAULT_CLOUD_IMAGE_LIMIT = 150;

export const PLAN_DISPLAY_NAMES = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
};

/**
 * 当前档位的**用户可见文案单一真源**。
 *
 * ⚠️ 与上面的 `PLAN_DISPLAY_NAMES` 分工不同，别合并：
 *   · `PLAN_DISPLAY_NAMES` = **产品名**（Free / Plus / Pro …），用于权益表、营销页；
 *   · 本表 = **「你现在是什么」的口语文案**，用于设置面板的用量卡与侧栏账号浮层，
 *     并且必须覆盖 `guest`（未登录）这一档 —— 那是 `PLAN_DISPLAY_NAMES` 没有的。
 * 2026-10-08 从 `BohaiSettingsPanel` 的局部常量收敛过来：侧栏账号浮层也要显示同一文案，
 * 留在组件里就会让同一个用户在两处看到两种叫法。
 */
export const TIER_DISPLAY_LABELS = {
  guest: '未登录用户',
  free: '免费用户',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
};

export const PLAN_CLOUD_IMAGE_LIMITS = {
  free: 150,
  plus: 300,
  pro: 450,
  max: 900,
  ultra: 1200,
};

/* ===== 档位权益展示单源 =====
   订阅页卡片与对比表共用：改一处两处同步（展示格式化在 SubscriptionPlans.vue）。
   - PLAN_AI_TOKEN_LIMITS / PLAN_AI_TOKEN_PERCENTS：BOH AI 每日 Token 额度。**真实值以
     ai_quota_config.daily_token_limit 为准**（数据管理面板「AI 额度与计费」可调），
     此处是**展示副本** —— 调完额度必须回来改这里，否则页面会宣传一个系统不认的数字。
     ⚠️ 2026-10-02：档位额度 ÷2（plus 80万→40万 / pro 200万→100万 / max 500万→250万 /
     ultra 1000万→500万），此处已同步；`free` 从「20 万」改成「0」——
     **free 的 daily_token_limit 一直是 0**（无 token 额度，纯走积分兜底），
     那个「20 万」从上线起就没对应过任何东西，属既存展示错误。
     对齐口径：与 ai_pricing_config.rate_tokens_per_point 一起决定「1 积分能买多少」。
     ⚠️ 2026-10-20（plans/030 §3.3）：`free` 从 0 改成 **5 万** —— 注册即有免费量，
     用完才走积分兜底。DB 侧同步见迁移 2026102003。改后 `free` 在对比表里由
     「—」变成「13%」（Plus=100% 那把尺子）—— **这是有意的展示变化，不是回归**。
     ⚠️ 2026-10-08 口径变更（用户口径「不再展示你还有多少 token，只用百分比」）：
     界面**不再展示绝对 Token 数**。`PLAN_AI_TOKEN_LIMITS` 保留为**绝对值底数** ——
     它既是档位百分比的推导来源，也是附加包百分比的分母；界面一律读
     `PLAN_AI_TOKEN_PERCENTS`（横向对比）/ `utils/ai-quota-display.js`（自己用了多少）。
   - PLAN_PHOTO_ALBUM_*：摄影集权益展示口径（2026-09-27 上线）。数值必须与
     utils/photo-albums/quota.js 的三张 enforcement MAP 对齐：
     ALBUM_QUOTA_MAP / PHOTOS_QUOTA_MAP / EXPORT_QUOTA_MAP（ultra = -1 即「不限」）。
     两侧同步核对；卡片与表格一致性由 probe-subscription-benefits.mjs 守。
   - PLAN_LOTTERY_PITY_THRESHOLDS：抽奖保底门槛，口径对齐 get_my_lottery_pity_status：
     按「连续未中奖场次」累计、中奖清零、达标后兑保底礼；Free 不计保底（null）。
     真实阈值以数据库 RPC 为准，此处为展示口径，改动需与 PityIslandCard 阈值文案同步核对。 */
export const PLAN_AI_TOKEN_LIMITS = {
  free: 50000,
  plus: 400000,
  pro: 1000000,
  max: 2500000,
  ultra: 5000000,
};

/* 档位横向对比的基准档：**最低付费档**。Plus = 100%、Pro = 250%…
   （free 无 token 额度 ⇒ '—'，不参与百分比） */
export const PLAN_AI_TOKEN_BASELINE_TIER = 'plus';

export const PLAN_AI_TOKEN_PERCENTS = Object.fromEntries(
  Object.entries(PLAN_AI_TOKEN_LIMITS).map(([code, tokens]) => [
    code,
    tokens > 0
      ? `${Math.round((tokens / PLAN_AI_TOKEN_LIMITS[PLAN_AI_TOKEN_BASELINE_TIER]) * 100)}%`
      : '—',
  ]),
);

/**
 * 「Plus = 100%」这把尺子上某档位的**数值**（Plus 100 / Pro 250 / Max 625 / Ultra 1250）。
 *
 * 为什么需要它：`PLAN_AI_TOKEN_PERCENTS` 是给表格/卡片直接印的**字符串**（'625%'），
 * 而 AI 页要做「剩余 = 总额 − 已用」的运算，得拿到数值。2026-10-08 第二版口径把
 * AI 页的尺子也统一到这一把，于是 `utils/ai-quota-display.js` 依赖它。
 *
 * ⚠️ 刻意从 `PLAN_AI_TOKEN_PERCENTS` 反解、而不是重新除一遍 `PLAN_AI_TOKEN_LIMITS` ——
 *    两处各算一遍就等于又多了一份真源，改额度时必漏一处。百分比表是唯一真源。
 * ⚠️ 不能写成模块级常量去调 `normalizeSubscriptionPlanCode()`：那个函数依赖文件下方
 *    才初始化的 `PLAN_CODE_ALIASES`，在模块初始化期调用会踩 TDZ。故做成运行时函数。
 *
 * @returns {number|null} free / guest / 未知档位 ⇒ null（没有 token 额度或没有订阅）
 */
export function resolveTierQuotaPercent(tierCode) {
  const label = PLAN_AI_TOKEN_PERCENTS[normalizeSubscriptionPlanCode(tierCode)];
  if (!label || label === '—') return null;
  const value = Number.parseFloat(label);
  return Number.isFinite(value) ? value : null;
}

/* AI 积分消费倍率（超出额度后按量计费的折扣）。展示口径：
   真实值以 ai_quota_config.points_multiplier 为准（数据管理面板「AI 额度与计费」可调），
   改动需与面板当前值核对；口径同 PLAN_LOTTERY_PITY_THRESHOLDS（展示单源 vs DB 真值）。 */
export const PLAN_AI_POINT_MULTIPLIERS = {
  free: 1,
  plus: 0.95,
  pro: 0.9,
  max: 0.85,
  ultra: 0.8,
};

/* ⚠️ 2026-10-20：Coding 附加包整体下线（plans/030 §5）。
   删除的导出：CODING_PACKS / PACK_QUOTA_PERCENT_STEP / resolvePackQuotaPercent /
   formatPackQuotaPercent —— 连带删除 tests/unit/ai-coding-pack-bonus-parity.test.js
   （它锁的正是「本文件的 tokenBonus」与「EF 的 CODING_PLAN_BONUSES」两处一致，源已不存在）。

   为什么删（plans/030 §1）：一个 plan_code 同时承担两个正交职责 ——
   「每天多 N 万 token」的额度加成（加法）与「能不能用某些模型」的准入阶梯（比较）。
   两者共用同一标识符，导致 min_tier 出现两套合法值域、两个查找表、一个必须
   前后端逐字对齐的数值。现在准入收敛为 guest/free 两种，额度加成随包消失。

   DB 侧：subscription_plan_prices 的 coding-* 置 is_active=false（迁移 2026102003），
   行保留以留审计痕迹；购买 RPC 的 EXECUTE 已 revoke。
   若要恢复：优先从 git 历史取这段定义，而不是凭记忆重写。 */
/** 实验室（/lab）已于 2026-10-19 退场：PLAN_LAB_QUOTAS 展示口径同步删除；
 *  配额 enforcement（TIER_QUOTA_MAP，composables/useLabQuota.js）保留待 BOHAI Work 接管。 */

export const PLAN_LOTTERY_PITY_THRESHOLDS = {
  free: null,
  plus: 24,
  pro: 18,
  max: 12,
  ultra: 8,
};

export const PLAN_PHOTO_ALBUM_COUNTS = {
  free: '1 本',
  plus: '3 本',
  pro: '5 本',
  max: '10 本',
  ultra: '不限',
};

export const PLAN_PHOTO_ALBUM_PHOTOS = {
  free: '12 张',
  plus: '24 张',
  pro: '40 张',
  max: '60 张',
  ultra: '不限',
};

export const PLAN_PHOTO_ALBUM_EXPORTS = {
  free: '2 次 / 月',
  plus: '5 次 / 月',
  pro: '10 次 / 月',
  max: '20 次 / 月',
  ultra: '不限',
};

const PLAN_CODE_ALIASES = {
  'boh-ai-plus': 'plus',
  'boh-plus': 'plus',
  'boh-pro': 'pro',
  'boh-max': 'max',
  'boh-ultra': 'ultra',
};

export function normalizeSubscriptionPlanCode(planCode = '') {
  const normalized = String(planCode || '')
    .trim()
    .toLowerCase();
  return PLAN_CODE_ALIASES[normalized] || normalized;
}

export function isSubscriptionRecordActive(record, nowTs = Date.now()) {
  if (
    !record ||
    String(record.status || '')
      .trim()
      .toLowerCase() !== 'active'
  )
    return false;
  const expiresTs = Date.parse(record.expiresAt || record.expires_at || '');
  return Number.isFinite(expiresTs) && expiresTs > nowTs;
}

// 决定权益是否生效：active 或 trial（未过期）均发放完整权益
export function isSubscriptionRecordGrantingBenefits(record, nowTs = Date.now()) {
  if (!record) return false;
  const status = String(record.status || '')
    .trim()
    .toLowerCase();
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
    planName: matchedPlanCode ? PLAN_DISPLAY_NAMES[matchedPlanCode] || matchedPlanCode : '默认额度',
    cloudImageLimit,
  };
}

export function resolveCloudBenefitFromSubscriptions(subscriptions = [], nowTs = Date.now()) {
  const activePlanCodes = (Array.isArray(subscriptions) ? subscriptions : [])
    .filter((record) => isSubscriptionRecordGrantingBenefits(record, nowTs))
    .map((record) => record.planCode || record.plan_code);

  return resolveCloudBenefitFromPlanCodes(activePlanCodes);
}

export const TIER_NICKNAME_COLORS = {
  free: '',
  plus: 'nickname-blue',
  pro: 'nickname-silver',
  max: 'nickname-gold',
  ultra: 'nickname-rainbow',
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
