/**
 * 模式「消耗倍率」文案**单一真源**（2026-10-08）。
 *
 * 服务两处模式列表：
 *   · 输入区的模式面板 `BohComposer.vue`
 *   · 设置页的「对话模式」选择器 `BohaiSettingsPanel.vue`
 *
 * ⚠️ 为什么必须收敛：这两处曾经各写一份，而**只有 composer 那份**带了「免费」分支
 *    ⇒ 同一个 Fast 在输入区显示「免费」、在设置页显示「1x」（用户 2026-10-08
 *    当场问「Fast 为啥显示的是 1x 倍率」）。文案逻辑一旦分叉，用户就会在两个入口
 *    看到两种说法。
 *
 * `quotaMultiplier` 有三个极易混的状态：
 *   · `0` + `byok` ⇒ 用户自己的 Key，不扣 BOH 额度 ⇒ **「自有 Key」**
 *   · `0`          ⇒ 免费模型（EF 侧 billed 记 0）  ⇒ **`0.00x`**（2026-10-08 用户口径：
 *                     不写「免费」二字，直接显示倍率原值，与其它行的「Nx」可比）
 *   · 正数         ⇒ 按倍率消耗                     ⇒ 「0.5x」/「2x」
 * ⚠️ 绝不能把 `0` 兜底成 `1x` —— 那会同时说错「免费」这件事和倍率这件事。
 *    倍率**缺失**时宁可返回空串（不显示），也不要谎报 1x。
 */

/** 去掉多余尾零：1.00 → '1'、0.50 → '0.5'、0.06 → '0.06'；非正数/非法 ⇒ '' */
export const formatMultiplierNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  return String(parseFloat(num.toFixed(2)));
};

/**
 * 免费模型：倍率为 **0** 且不是自带 Key（自带 Key 的倍率同样是 0，但含义完全不同）。
 *
 * ⚠️ 判定必须要求「值真的存在」：`Number(null)` 与 `Number('')` 都是 **0**，
 * 直接用 `Number(v) === 0` 会把「字段缺失」误判成「免费」。缺失应当走
 * 「不显示倍率」而不是「免费」—— 这里宁可保守。
 */
export const isFreeMode = (mode) => {
  if (mode?.byok) return false;
  const raw = mode?.quotaMultiplier;
  if (raw === null || raw === undefined || raw === '') return false;
  return Number(raw) === 0;
};

/**
 * 模式右侧的计费标签。
 *
 * 文案口径（2026-10-08 用户口径）：**免费模型不写「免费」二字**，直接显示它的倍率原值
 * `0.00x` —— 列里其它行都是「Nx」，插一个词会破坏可比性；而且 `0.00` 本身就是
 * 「不消耗」最准确的表达（EF 侧按 quota_multiplier = 0 记 0 计费量）。
 * ⚠️ 自带 Key 的自定义模型**必须仍是「自有 Key」**：它的 quota_multiplier 同样是 0，
 *    但用户是在花自己的钱，写 `0.00x` 会被读成「免费」—— 两件事完全不同。
 *
 * @returns {string} '自有 Key' / '0.00x' / '2x' / ''（倍率缺失）
 */
export const formatModeRateLabel = (mode) => {
  if (mode?.byok) return '自有 Key';
  if (isFreeMode(mode)) return '0.00x';
  const n = formatMultiplierNumber(mode?.quotaMultiplier);
  return n ? `${n}x` : '';
};

/** 同一个标签的悬浮说明（为什么是 0.00x / 自有 Key，而不是一个正经倍率） */
export const formatModeRateTitle = (mode) => {
  if (mode?.byok) return '使用你自己的 API Key，不消耗 BOH 额度';
  if (isFreeMode(mode)) return '免费模型：消耗倍率 0.00，不扣 BOH 额度';
  const n = formatMultiplierNumber(mode?.quotaMultiplier);
  return n ? `该模式消耗倍率为 ${n}x` : '该模式未标注消耗倍率';
};
