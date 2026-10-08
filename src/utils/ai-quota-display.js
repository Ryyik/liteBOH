/**
 * AI 额度的**百分比口径单一真源**（2026-10-08 用户口径 · 第二版）。
 *
 * 用户口径原文（第一版）：
 *   「订阅页面、AI 页面统一不再展示额度，只用百分比显示，不再展示你还有多少 token；
 *     若有附加包，则可以显示 150%，以此类推。」
 * 用户口径原文（第二版，本文件当前实现）：
 *   「还是显示用户当日剩余百分比额度比较好，Max 就显示剩余 625%。」
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 只有**一把尺子**：最低付费档 Plus = 100%
 *   · Plus = 100% / Pro = 250% / Max = 625% / Ultra = 1250%
 *     （数值来自 `PLAN_AI_TOKEN_PERCENTS`，与订阅页对比表**同一份**真源）；
 *   · 附加包在**同一把尺子**上相加（coding-lite 对 Plus = +62.5%）；
 *   · 主指标是**剩余**：剩余 = 总额 − 已用。Max 刚过 0 点、没消耗 ⇒ 剩余 625%。
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ 为什么改掉了第一版的「以自己档位基础额度 = 100%」：
 *    那个口径下 Max 用户看到「已用 0% / 剩余 100%」，用户**连问两次**
 *    「我是 Max，为什么显示 100%」。两个数其实都对 —— 但订阅页宣传的是
 *    「相对 Plus 的 625%」，同一个产品里同时存在两把尺子，必然被读成 bug。
 *    现在 AI 页也走 Plus 尺子，于是「订阅页说你 625%、AI 页也说剩余 625%」。
 *
 * 规则：
 *   1. `usedPercent = 档位百分比 × (used / base)`。
 *      ——用「真实比例 × 档位百分比」而不是「token ÷ Plus 的绝对 token 数」，是为了让
 *      显示值**永远**与订阅页宣传的档位百分比一致：即使 `ai_quota_config` 里的绝对值
 *      与展示副本（`PLAN_AI_TOKEN_LIMITS`）某天漂移，用户看到的仍然是 625%，
 *      而不会莫名其妙变成 632%。比例（used/base、bonus/base）永远来自 EF 真值。
 *   2. `totalPercent = 档位百分比 × (base + bonus) / base` —— 附加包在同一把尺子上相加。
 *   3. `remainingPercent = totalPercent − usedPercent`，下限 0（超额不显示负数）。
 *   4. 进度条宽度 `meterPercent` = 已用 ÷ 总额。它是**消耗量**，越满越危险，
 *      所以颜色阈值（80% 琥珀 / 95% 红）沿用旧语义，不要因为主指标变成「剩余」就反过来。
 *   5. 不限量（`tokenLimit === -1`）⇒ 显示 ∞，不参与百分比运算。
 *   6. 档位未知（guest / free 档没有 token 额度，`resolveTierQuotaPercent` 返回 null）
 *      ⇒ **降级**成「相对自己额度」的 ±100% 尺子并置 `degraded: true`，
 *      绝不猜一个 Plus 基准出来（guest 根本没有订阅档位）。
 *   7. `baseTokenLimit` 是 2026-10-08 才加进 `quota-status` 返回值的字段。老版本 Edge
 *      Function 不返回它时同样降级：总量当分母、包加成当 0，此时百分比依然正确，
 *      只是「包区段」不显示 —— 绝不能猜一个 +63% 出来。
 */

import { resolveTierQuotaPercent } from './subscription-benefits.js';

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** 百分比文案：<1% 两位小数、<10% 一位小数、其余取整（沿用设置面板旧口径） */
export function formatQuotaPercent(value) {
  const n = toFiniteNumber(value);
  if (n <= 0) return '0';
  if (n < 1) return n.toFixed(2);
  if (n < 10) return n.toFixed(1);
  return String(Math.round(n));
}

/** 不限量档的返回值（避免下面两个 return 各写一遍而漏字段） */
const unlimitedDisplay = () => ({
  isUnlimited: true,
  degraded: false,
  hasPack: false,
  tierPercent: null,
  usedTokens: 0,
  baseTokenLimit: -1,
  totalTokenLimit: -1,
  bonusTokens: 0,
  usedPercent: 0,
  // 不限量时「已用百分比」没有分母 ⇒ 用 — 而不是 ∞（「已用 ∞」会被读成「用了无穷多」）
  usedLabel: '—',
  totalPercent: 0,
  totalLabel: '不限量',
  packPercent: 0,
  packLabel: '',
  remainingPercent: 0,
  // 主指标：∞。**由口径函数定，不留调用方各自三元判断** —— 之前设置页写 ∞、
  // 侧栏浮层写「不限量」，同一次改动里同一个状态在三个界面出现两种说法。
  remainingLabel: '∞',
  meterPercent: 0,
  meterText: '100%',
  detailLabel: '当前订阅不限用量',
  titleLabel: '当前订阅不限用量',
});

/**
 * 把 `quota-status` 的原始字段折算成界面直接用的一组百分比。
 *
 * @param {object} input
 * @param {number} input.tier           订阅档位（plus / pro / max / ultra；缺省 ⇒ 降级）
 * @param {number} input.used           已用（或 `usedTokens`）；口径 = 额度拦截用的计费量
 * @param {number} input.limit          总可用（含附加包；或 `tokenLimit`）；-1 = 不限量
 * @param {number} [input.baseTokenLimit] 档位基础额度（不含包）；缺省则降级
 * @param {number} [input.bonusTokens]    附加包加成 token；缺省按 0
 */
export function resolveAiQuotaDisplay(input = {}) {
  const totalTokenLimit = toFiniteNumber(input.tokenLimit ?? input.limit);
  const usedTokens = Math.max(0, toFiniteNumber(input.usedTokens ?? input.used));

  if (totalTokenLimit === -1) return unlimitedDisplay();

  let baseTokenLimit = toFiniteNumber(input.baseTokenLimit);
  let bonusTokens = Math.max(0, toFiniteNumber(input.bonusTokens));
  // 降级之一：老 EF 不返回 baseTokenLimit（字段缺失），或 free 档基础额度合法为 0
  // 且买了包（包就是它的全部额度）⇒ 用总量当分母、包归零，量程回到 100%。
  let degraded = !(baseTokenLimit > 0);
  if (degraded) {
    baseTokenLimit = totalTokenLimit > 0 ? totalTokenLimit : 0;
    bonusTokens = 0;
  }

  // 尺子：档位在 Plus 基准上的百分比。拿不到（guest / free / 未知档）⇒ 退回 100% 并降级。
  const tierPercent = resolveTierQuotaPercent(input.tier);
  const anchored = Number.isFinite(tierPercent) && tierPercent > 0;
  const scale = anchored ? tierPercent : 100;
  if (!anchored) degraded = true;

  const usedPercent = baseTokenLimit > 0 ? (usedTokens / baseTokenLimit) * scale : 0;
  const totalPercent =
    baseTokenLimit > 0 ? ((baseTokenLimit + bonusTokens) / baseTokenLimit) * scale : scale;
  const packPercent = baseTokenLimit > 0 ? (bonusTokens / baseTokenLimit) * scale : 0;
  const remainingPercent = Math.max(0, totalPercent - usedPercent);
  const meterPercent =
    totalPercent > 0 ? Math.max(0, Math.min(100, (usedPercent / totalPercent) * 100)) : 0;

  const usedLabel = `${formatQuotaPercent(usedPercent)}%`;
  const totalLabel = `${formatQuotaPercent(totalPercent)}%`;
  const remainingLabel = `${formatQuotaPercent(remainingPercent)}%`;
  const hasPack = bonusTokens > 0;
  // ⚠️ 包自己的百分比**只进 tooltip**，不进可见文案：订阅页把包按 5% 取整展示
  //    （'额度 +65%'，marketing 口径），AI 页这里是精确值（+63%）。同一个包在同一屏
  //    出现两个数字会被当成 bug，所以可见处只说「含附加包」，总额里已经含了它。
  const packLabel = packPercent > 0 ? `+${formatQuotaPercent(packPercent)}%` : '';

  return {
    isUnlimited: false,
    degraded,
    hasPack,
    tierPercent: anchored ? tierPercent : null,
    usedTokens,
    baseTokenLimit,
    totalTokenLimit,
    bonusTokens,
    usedPercent,
    usedLabel,
    totalPercent,
    totalLabel,
    packPercent,
    packLabel,
    remainingPercent,
    remainingLabel,
    meterPercent,
    meterText: `${formatQuotaPercent(meterPercent)}%`,
    detailLabel: hasPack
      ? `已用 ${usedLabel} · 含附加包 · 每日 0:00 重置`
      : `已用 ${usedLabel} · 每日 0:00 重置`,
    titleLabel: hasPack
      ? `今日剩余 ${remainingLabel}（总额 ${totalLabel}，含附加包 ${packLabel}）· 已用 ${usedLabel} · 北京时间 0:00 重置`
      : `今日剩余 ${remainingLabel} · 已用 ${usedLabel} · 北京时间 0:00 重置`,
  };
}
