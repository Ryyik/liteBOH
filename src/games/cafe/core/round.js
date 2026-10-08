/**
 * 一局营业的订单/评分系统 —— plans/026 P0-1
 *
 * 从原来 1318 行的 index.vue 里剥出来的纯逻辑部分。**无 Vue 依赖**，可直接单测。
 *
 * 三条设计口径（都对应 plans/026 里实测出的问题）：
 *  1. **P0-3**：每步产出档位（perfect/good/fair/fail）而不是连续品质分；
 *     fail 额外扣 15 耐心并清连击，fair 也清连击 —— 让「稳一点别fail」成为有意义的策略。
 *  2. **P0-4**：猫救场走 `resolveCatRescue`，品质 68、连击清零、不给 comboTip，
 *     且每局封顶 2 次。
 *  3. 耐心衰减随出杯数上升（原有），但补上「离场压力」：
 *     队列里的每一单都会衰减，出杯越多后面越难 ⇒ 正反馈爬坡有天花板。
 */

import { DRINKS, MAX_CONCURRENT_ORDERS, ROUND_SECONDS, STEP_DEFINITIONS } from './steps.js';
import { GRADES } from './steps.js';
import {
  CAT_HELP_COST,
  MAX_CAT_RESCUES,
  resolveCatRescue,
  resolveNormalServe,
} from '../systems/cat.js';

export { ROUND_SECONDS, MAX_CONCURRENT_ORDERS };

/** 耐心衰减基础值（%/s） */
export const PATIENCE_BASE_DECAY = 0.62;
/** 每出一杯额外增加（%/s） */
export const PATIENCE_DECAY_PER_SERVED = 0.055;

let orderSerial = 0;

export function resetOrderSerial() {
  orderSerial = 0;
}

/**
 * 建一个新订单。
 * @param {object} args
 * @param {Array} args.customers 顾客表
 * @param {number} args.nextCustomerIndex 从哪个顾客开始
 * @param {string} args.previousDrinkId 上一单是什么（避免连续重复）
 */
export function createOrder({ customers, nextCustomerIndex, previousDrinkId = null }) {
  const usedCustomers = new Set();
  let customerIndex = nextCustomerIndex % customers.length;
  while (usedCustomers.has(customerIndex)) customerIndex = (customerIndex + 1) % customers.length;
  const options = DRINKS.filter((drink) => drink.id !== previousDrinkId);
  const drink = options[Math.floor(Math.random() * options.length)];
  const firstStep = STEP_DEFINITIONS[drink.steps[0]];
  return {
    id: `order-${(orderSerial += 1)}`,
    customerIndex,
    drinkId: drink.id,
    patience: 100,
    feedback: `先完成「${firstStep.name}」`,
    feedbackTone: 'neutral',
    isResolving: false,
    stepIndex: 0,
    stepQualities: [],
    grades: [],
    /** 每层累计高度，供 layer 类步骤判定「液面必须高于上一层」 */
    layerHeights: {},
    meltStartedAt: 0,
    meltMs: STEP_DEFINITIONS.ice.meltMs,
  };
}

export function getDrink(order) {
  return DRINKS.find((drink) => drink.id === order?.drinkId) || DRINKS[0];
}

export function getCurrentStepId(order) {
  const drink = getDrink(order);
  return drink.steps[order.stepIndex] || null;
}

export function isOrderComplete(order) {
  return order.stepIndex >= getDrink(order).steps.length;
}

/**
 * 累计一局内的所有待处理订单，返回超时的 order id 列表（纯函数，不改入参）。
 * @param {Array} orders
 * @param {number} elapsedSeconds
 * @param {number} served
 */
export function collectExpiredOrders(orders, elapsedSeconds, served) {
  const decay = PATIENCE_BASE_DECAY + served * PATIENCE_DECAY_PER_SERVED;
  return orders
    .filter((order) => !order.isResolving && order.patience - decay * elapsedSeconds <= 0)
    .map((order) => order.id);
}

/** 每单 patience 的每帧衰减量（供视图层直接用） */
export function patienceDecayPerSecond(served) {
  return PATIENCE_BASE_DECAY + served * PATIENCE_DECAY_PER_SERVED;
}

/**
 * 应用一次衰减（返回新 order 数组，不改入参 —— 保持纯函数便于测试）。
 */
export function applyPatienceDecay(orders, elapsedSeconds, served) {
  const decay = patienceDecayPerSecond(served) * elapsedSeconds;
  return orders.map((order) =>
    order.isResolving ? order : { ...order, patience: Math.max(0, order.patience - decay) },
  );
}

/**
 * 记录一步完成，返回更新后的 order。
 * @param {object} order
 * @param {{ quality:number, grade:string }} result stepCommit 的产物
 * @param {string} stepId
 */
/**
 * 记录一步完成，返回更新后的 order。
 *
 * ⚠️ **失败不推进步骤**（2026-10-08 修）。
 * 首版无论成功失败都 `stepIndex: order.stepIndex + 1`，后果是：
 *   ① 玩家按坏了（比如研磨没稳住）却被静默送到下一步，看不到「没能稳住转速」的反馈，
 *      反馈文字还挂在原地 —— 表现为「按钮像是坏了、长按没反应」；
 *   ② 且 `stepStates[stepId].status` 留着'failed'，而 `canInteract()`
 *      对 `failed` 直接返回 false ⇒ 回到该步时**长按真的完全无反应**（有概率：
 *      取决于玩家失败后有没有再切回这一单）。
 * 现在 fail 只扣耐心、不进下一步；成功与尚可档才推进（fair 是「勉强完成」，该进）。
 */
export function applyStepResult(order, result, stepId) {
  const grade = GRADES[result.grade];
  const failed = result.grade === 'fail';
  // 失败不累加品质/档位：这步没做成，重做时不该有历史分
  const stepQualities = failed ? order.stepQualities : [...order.stepQualities, result.quality];
  const grades = failed ? order.grades : [...order.grades, result.grade];
  const patiencePenalty = grade?.patiencePenalty || 0;
  const def = STEP_DEFINITIONS[stepId];
  // layer 类步骤完成后累加液面高度，供下一步判「高于上一层」
  const layerHeights = { ...order.layerHeights };
  if (!failed && def?.kind === 'layer') {
    layerHeights[stepId] = (layerHeights.previous || 0) + 40;
    layerHeights.previous = layerHeights[stepId];
  }
  return {
    ...order,
    stepIndex: failed ? order.stepIndex : order.stepIndex + 1,
    stepQualities,
    grades,
    layerHeights,
    patience: Math.max(0, order.patience - patiencePenalty),
    feedback: failed ? `${result.message} · 这一步要重做` : result.message,
    feedbackTone: failed ? 'error' : result.grade === 'perfect' ? 'success' : 'neutral',
  };
}

/** 这一步做完之后的下一句反馈文案 */
export function nextStepFeedback(order) {
  const drink = getDrink(order);
  const nextStepId = drink.steps[order.stepIndex];
  if (!nextStepId) {
    const avg = averageOf(order.stepQualities);
    return { text: `制作完成 · 综合品质 ${avg}`, tone: 'success' };
  }
  return { text: `下一步：${STEP_DEFINITIONS[nextStepId].name}`, tone: 'neutral' };
}

export function averageOf(list) {
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
}

/**
 * 正常出杯结算。
 *
 * ⚠️ **增量 / 累计的契约（2026-10-08 修，阻断级）**
 * 首版返回的 `coins` 是**单杯增量**，而 `createStats()` 里的 `coins` 是**整局累计**，
 * 视图用 `{...stats, ...settlement}` 展开 ⇒ 累计值被单杯覆盖，连出 N 杯后
 * `stats.coins` 永远等于最后一杯的钱（`wallet += stats.coins` 只入账最后一杯）。
 * 同一个 `combo` 问题：这里返回 `nextCombo`，而 stats 的字段叫 `combo`，
 * 展开后多出一个野字段 `nextCombo`，`stats.combo` 恒为 0 ⇒ 连杯加成整条回路失效。
 *
 * 现在的约定（别再推翻）：
 *   - **单杯增量**一律带 `Delta` 后缀：`coinsDelta`；
 *   - **需要调用方回写**的下一状态一律叫 `nextCombo`；
 *   - `totalQuality` / `served` / `bestCombo` / `rescuesUsed` 是**已在函数内算好的累计值**，
 *     调用方必须走 `mergeSettlement()` 合入，**不要再自己写展开**。
 * 每杯专属的 `quality` / `comboTip` / `comboBroken` 只从结算返回值上读，不进 stats。
 *
 * @returns 每杯增量 + 已算好的累计值 + 该杯专属反馈
 */
export function settleNormalServe(order, stats) {
  const drink = getDrink(order);
  const quality = averageOf(order.stepQualities);
  const nextCombo = stats.combo + 1;
  const result = resolveNormalServe({
    price: drink.price,
    patience: order.patience,
    quality,
    nextCombo,
  });
  return {
    quality,
    coinsDelta: result.coins,
    nextCombo,
    comboTip: result.comboTip,
    totalQuality: stats.totalQuality + quality,
    served: stats.served + 1,
    missed: stats.missed,
    bestCombo: Math.max(stats.bestCombo, nextCombo),
  };
}

/**
 * 猫救场结算（品质 68、连击清零、无 comboTip —— 见 systems/cat.js 的注释）。
 * @param {object} stats 当前统计
 * @param {number} rescuesUsed 本局已用救场次数（不含本次）
 */
export function settleCatRescue(order, stats, rescuesUsed) {
  if (rescuesUsed >= MAX_CAT_RESCUES) return null;
  const drink = getDrink(order);
  const result = resolveCatRescue({
    price: drink.price,
    patience: order.patience,
    currentCombo: stats.combo,
  });
  return {
    quality: result.quality,
    coinsDelta: result.coins,
    nextCombo: result.nextCombo,
    comboTip: result.comboTip,
    comboBroken: result.comboBroken,
    totalQuality: stats.totalQuality + result.quality,
    served: stats.served + 1,
    missed: stats.missed,
    bestCombo: stats.bestCombo,
    rescuesUsed: rescuesUsed + 1,
  };
}

/**
 * 把一次结算合进 stats —— **唯一允许的合并入口**（见 `settleNormalServe` 的契约注释）。
 *
 * 为什么不交给调用方展开：`{...stats, ...settlement}` 正是首版把「单杯增量」写成
 * 「累计字段同名字」时的翻车点，而这个 bug 静默无报错、单测还测不出来。
 * 累加与回写只有这一处，以后改结算口径不会再漏接线。
 *
 * @param {object} stats 当前累计统计
 * @param {object|null} settlement `settleNormalServe` / `settleCatRescue` 的返回值
 * @returns 新的 stats；settlement 为 null（救场次数用尽）时原样返回
 */
export function mergeSettlement(stats, settlement) {
  if (!settlement) return stats;
  return {
    // 已在 settle* 内算好的累计值，直接采用
    totalQuality: settlement.totalQuality,
    served: settlement.served,
    missed: settlement.missed,
    bestCombo: settlement.bestCombo,
    rescuesUsed: settlement.rescuesUsed ?? stats.rescuesUsed,
    // 单杯增量 → 累加；下一连杯数 → 回写
    coins: stats.coins + (settlement.coinsDelta ?? 0),
    combo: settlement.nextCombo,
  };
}

/** 救场是否可用（把 cat.js 的判定原样透出，视图层只调这里） */
export function canRescue({ affinity, phase, paused, resolving, rescuesUsed }) {
  return (
    affinity >= CAT_HELP_COST &&
    phase === 'playing' &&
    !paused &&
    !resolving &&
    rescuesUsed < MAX_CAT_RESCUES
  );
}

/** 一局的初始统计 */
export function createStats() {
  return {
    coins: 0,
    served: 0,
    missed: 0,
    combo: 0,
    bestCombo: 0,
    totalQuality: 0,
    rescuesUsed: 0,
  };
}
