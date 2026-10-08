/**
 * 猫（小满）系统 —— plans/026 P0-4
 *
 * ## 为什么这个文件存在（旧实现是三处硬编码凑出来的）
 *
 * 2026-10-08 实测：旧数值下「摸猫 + 救场」是**唯一最优解**，认真做咖啡反而是劣势策略：
 *   摸猫 320ms 冷却 +1、逗猫 +2 ⇒ 攒 8 点最快 1.28s，救场 0.35s
 *   ⇒ 2.9s/杯；而认真做一杯 4-5 步要~17s。150s 内刷猫能出 51 杯，认真做只有 7-9 杯。
 *  且 `resolveSuccess` 里 catAssist 品质硬编码 82，`totalQuality` 还照记，
 * 于是 `getAnniversaryCafeStars` 的三星门槛（served≥8 && avg≥85）纯靠刷猫就能过。
 *
 * 结论：**这不是彩蛋，是奖励结构反了**。修法必须三条一起上，单改任何一条都还会有人刷：
 *   ① 获取变慢（冷却拉长、逗猫收益减半、且不许在等餐时白嫖）
 *   ② 救场有真实代价（品质低于认真做的中位、且**不计连杯加成**）
 *   ③ 救场次数封顶（HUD 上明示，玩家知道额度是稀缺资源）
 */

/** 亲密度上限（数值随 CAT_PET_COOLDOWN 一起调，改一处要重算下面的平衡账） */
export const CAT_AFFINITY_CAP = 20;

/**
 * 救场消耗的亲密度：**12**。
 * 这个数字是被平衡账逼出来的，不是随手填的：
 *   攒 12 点 × 1.5s = 18s，加救场动画 0.35s⇒ 18.4s/杯
 *   而认真做一杯（4-5 步 × 3-4s）≈ 17s
 *   ⇒ 救场必须**严格慢于**认真做，否则「最优解刷猫」没被真正堵住。
 *   （曾经取 8 点：8×1.5 = 12.35s/杯，仍快于认真做 17s ⇒ 不变式断言转红，
 *     这就是那条不变式的价值。）
 * 同时 MAX_CAT_RESCUES=2 ⇒ 整局最多靠猫捞 2 杯，认真做能出 8 杯。
 */
export const CAT_HELP_COST = 12;

/** 摸猫冷却：320ms → 1500ms。这是最关键的一处：它把「连点刷亲密度」彻底堵掉 */
export const CAT_PET_COOLDOWN_MS = 1500;

/** 逗猫收益：+2 → +1（配合 1.5s 冷却，攒满 8 点需 8~12s 而不是 1.28s） */
export const CAT_PLAY_GAIN = 1;

/** 逗猫冷却 */
export const CAT_PLAY_COOLDOWN_MS = 2400;

/** 每局救场次数上限 */
export const MAX_CAT_RESCUES = 2;

/**
 * 救场的品质：**68**，低于认真做的中位档（good=88）。
 * 旧值 82 偏高，加上时间成本只有 1/6，导致刷猫严格优于认真做。
 * 取 68 = 与 fair 同档，语义上也对：救场是「勉强及格」，不是「完美代劳」。
 */
export const CAT_RESCUE_QUALITY = 68;

/**
 * 能否逗猫：必须**当前没有任何订单正在制作**。
 * 这一条堵的是「顾客在等、玩家在旁边逗猫攒额度」的空转 —— 旧实现没有这个约束，
 * 玩家可以一手拖着奶泡一手连点猫，亲密度白嫖。
 * @param {boolean} anyStepInProgress 是否存在进行中的制作步骤
 */
export function canPlayWithCat(anyStepInProgress) {
  return !anyStepInProgress;
}

/**
 * 一次摸猫。返回 { ok, reason }，不做状态变更（纯函数，便于单测）。
 * @param {object} args
 * @param {number} args.affinity 当前亲密度
 * @param {number} args.nowMs 当前时间
 * @param {number} args.lastPetAt 上次摸猫时间
 * @param {boolean} args.anyStepInProgress 是否有订单在制作
 * @param {boolean} args.paused 是否暂停
 */
export function tryPetCat({ affinity, nowMs, lastPetAt, anyStepInProgress, paused }) {
  if (paused) return { ok: false, reason: 'paused' };
  if (nowMs - lastPetAt < CAT_PET_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  // 制作中不许摸：否则「拖着奶泡连点猫」白嫖额度（见文件头 ①）
  if (anyStepInProgress) return { ok: false, reason: 'busy' };
  return {
    ok: true,
    affinity: Math.min(CAT_AFFINITY_CAP, affinity + 1),
    reason: null,
  };
}

/**
 * 一次逗猫。
 * @param {object} args 同 tryPetCat
 * @param {number} args.lastPlayAt 上次逗猫时间
 * @param {string} args.catMood 当前情绪（chase 时不可再逗）
 */
export function tryPlayWithCat({
  affinity,
  nowMs,
  lastPlayAt,
  catMood,
  anyStepInProgress,
  paused,
}) {
  if (paused) return { ok: false, reason: 'paused' };
  if (catMood === 'chase') return { ok: false, reason: 'chasing' };
  if (nowMs - lastPlayAt < CAT_PLAY_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  if (anyStepInProgress) return { ok: false, reason: 'busy' };
  return {
    ok: true,
    affinity: Math.min(CAT_AFFINITY_CAP, affinity + CAT_PLAY_GAIN),
    reason: null,
  };
}

/**
 * 能否发动救场：亲密度够、没暂停、**且本局额度没用完**。
 * @param {object} args
 * @param {number} args.rescuesUsed 本局已用次数
 */
export function canCatRescue({ affinity, phase, paused, resolving, rescuesUsed }) {
  return (
    affinity >= CAT_HELP_COST &&
    phase === 'playing' &&
    !paused &&
    !resolving &&
    rescuesUsed < MAX_CAT_RESCUES
  );
}

/**
 * 救场出杯的结算参数。
 *
 *⚠️ 关键改动：`comboTip = 0`。
 * 旧实现里 catAssist 走的earnedCombo = combo（不增长但也不清零），
 * 于是 comboTip = min(combo*2, 14) 照拿 —— 刷猫能同时保住连杯加成，是双重奖励。
 * 现在救场**连击直接清零**，品质也压到 68 ⇒ 认真做才可能累积 comboTip。
 */
export function resolveCatRescue({ price, patience, currentCombo }) {
  const qualityTip = Math.max(0, Math.round((CAT_RESCUE_QUALITY - 60) / 4));
  const patienceTip = Math.round(Math.max(0, patience) / 14);
  return {
    quality: CAT_RESCUE_QUALITY,
    coins: price + qualityTip + patienceTip,
    nextCombo: 0,
    comboTip: 0,
    comboBroken: currentCombo > 0,
  };
}

/** 认真做出杯的结算参数（对照用：必须显著优于救场） */
export function resolveNormalServe({ price, patience, quality, nextCombo }) {
  const qualityTip = Math.max(0, Math.round((quality - 60) / 4));
  const patienceTip = Math.round(Math.max(0, patience) / 14);
  const comboTip = Math.min(nextCombo * 2, 14);
  return { quality, coins: price + qualityTip + patienceTip + comboTip, nextCombo, comboTip };
}

/** 平衡账（供单测断言，也是改数值后的自查表） */
export const CAT_BALANCE_NOTES = {
  /** 攒满一次救场所需亲密度：12 × 1.5s */
  minSecondsToCharge: (CAT_HELP_COST * CAT_PET_COOLDOWN_MS) / 1000,
  /** 救场后每杯总耗时（乐观：一直摸不被打断） */
  optimisticSecondsPerCup: (CAT_HELP_COST * CAT_PET_COOLDOWN_MS) / 1000 + 0.35,
  /** 认真做一杯：4-5 步，每步 3-4s */
  carefulSecondsPerCup: 17,
  rescueQuality: CAT_RESCUE_QUALITY,
  rescueCap: MAX_CAT_RESCUES,
};
