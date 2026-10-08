/**
 * 步进与状态复位的单元测试（2026-10-08 修复「长按没反应」的回归护栏）
 *
 * ## 背景：用户报「有概率出现长按没反应」
 *
 * 两条缺陷叠加导致，**都是"有概率"**（取决于玩家有没有在失败后切回那一单）：
 *
 * 1. `applyStepResult` 无论成功失败都 `stepIndex + 1`
 *    ⇒ 失败后玩家被静默送到下一步，但按钮/进度条还停在原地，
 *      反馈文字又写着「下一步：xxx」⇒ 看起来就是「按钮失灵、进度条不动」。
 * 2. `stepStates[stepId].status` 失败后留着 `'failed'`，
 *    而视图层 `canInteract()` 对 `failed` 直接 return false
 *    ⇒ 玩家切回这一单时**长按真的完全没有任何反应**（连 holding 都不会出现）。
 *
 * 单测能覆盖第1 条（纯函数）。第 2 条依赖视图层，由 probe-cafe-mechanics 覆盖。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  applyStepResult,
  averageOf,
  createOrder,
  createStats,
  getCurrentStepId,
  mergeSettlement,
  settleCatRescue,
  settleNormalServe,
} from '@/games/cafe/core/round.js';
import { CUSTOMERS } from '@/games/cafe/data/people.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
/** 只取 <script setup> 区，避免模板里的 `/*` 之类与注释起始错配 */
const cafeViewScript = () => {
  const src = read('src/views/AnniversaryCafe/index.vue');
  return src.slice(src.indexOf('<script setup'), src.indexOf('</script>'));
};

/** 造一个指定配方的订单（createOrder 内部随机挑饮品，这里直接覆盖） */
const makeOrder = (drinkId = 'americano') => {
  const order = createOrder({ customers: CUSTOMERS, nextCustomerIndex: 0, previousDrinkId: null });
  return { ...order, drinkId };
};

describe('失败不推进步骤（长按失灵根因 ①）', () => {
  it('fail ⇒ stepIndex 保持不变（这是修复的核心）', () => {
    const order = makeOrder('americano');
    expect(order.stepIndex).toBe(0);
    const failed = applyStepResult(
      order,
      { grade: 'fail', quality: 0, message: '没能稳住转速' },
      'grind',
    );
    expect(failed.stepIndex).toBe(0);
  });

  it('fail ⇒ 不累加品质与档位（重做不该有历史分）', () => {
    const order = makeOrder('americano');
    const failed = applyStepResult(order, { grade: 'fail', quality: 0, message: 'x' }, 'grind');
    expect(failed.stepQualities).toEqual([]);
    expect(failed.grades).toEqual([]);
    expect(averageOf(failed.stepQualities)).toBe(0);
  });

  it('fail ⇒ 扣 15 耐心、反馈标明要重做、不出现「下一步」', () => {
    const order = makeOrder('americano');
    const failed = applyStepResult(
      order,
      { grade: 'fail', quality: 0, message: '没能稳住转速' },
      'grind',
    );
    expect(order.patience).toBe(100);
    expect(failed.patience).toBe(85); // GRADES.fail.patiencePenalty = 15
    expect(failed.feedback).toContain('重做');
    //⚠️ 反证：失败后绝不能出现「下一步」——那会让玩家以为已经换步骤了，
    //   而按钮还在原地 ⇒ 正是「长按没反应」的观感来源。
    expect(failed.feedback).not.toContain('下一步');
  });

  it('成功与尚可档照常推进（fair 是「勉强完成」，该进下一步）', () => {
    const order = makeOrder('americano');
    expect(
      applyStepResult(order, { grade: 'perfect', quality: 100, message: '稳' }, 'grind').stepIndex,
    ).toBe(1);
    expect(
      applyStepResult(order, { grade: 'good', quality: 88, message: 'ok' }, 'grind').stepIndex,
    ).toBe(1);
    expect(
      applyStepResult(order, { grade: 'fair', quality: 70, message: '勉强' }, 'grind').stepIndex,
    ).toBe(1);
  });

  it('连续失败也不会推进（可以无限重试，不会卡死）', () => {
    let order = makeOrder('americano');
    // 注意每轮都要基于上一轮的结果继续扣耐心（order 是新对象，不会共享引用）
    for (let i = 1; i <= 5; i += 1) {
      const before = order.patience;
      order = applyStepResult(order, { grade: 'fail', quality: 0, message: 'x' }, 'grind');
      expect(order.patience).toBeLessThan(before);
    }
    expect(order.stepIndex).toBe(0);
    expect(getCurrentStepId(order)).toBe('grind');
    // 耐心会耗尽但步骤不推进 —— 玩家仍能继续尝试
    expect(order.patience).toBe(25);
  });
});

describe('层高只在成功时累加（失败不该留下脏数据）', () => {
  it('layer 步骤失败 ⇒ layerHeights 不变；成功 ⇒ 累加', () => {
    const order = makeOrder('coconut-americano'); // grind→extract→ice→coconut
    const failed = applyStepResult(order, { grade: 'fail', quality: 0, message: 'x' }, 'coconut');
    expect(failed.layerHeights.previous ?? 0).toBe(0);
    const ok = applyStepResult(order, { grade: 'perfect', quality: 100, message: 'x' }, 'coconut');
    expect(ok.layerHeights.previous).toBeGreaterThan(0);
  });
});

describe('出杯结算（未回归，顺带钉住P0-4）', () => {
  it('认真做 ⇒ 连击累积且有 comboTip', () => {
    const stats = { ...createStats(), combo: 2 };
    const order = makeOrder('americano');
    const done = { ...order, stepQualities: [96, 90, 88] };
    const r = settleNormalServe(done, stats);
    expect(r.nextCombo).toBe(3);
    expect(r.comboTip).toBeGreaterThan(0);
  });

  it('猫救场 ⇒ 品质 68、连击清零、无 comboTip', () => {
    const stats = { ...createStats(), combo: 4 };
    const order = makeOrder('americano');
    const r = settleCatRescue(order, stats, 0);
    expect(r.quality).toBe(68);
    expect(r.nextCombo).toBe(0);
    expect(r.comboTip).toBe(0);
    // comboBroken 必须透出到 round 层：AnniversaryCafe/index.vue 用它选反馈色调
    //（`settlement.comboBroken ? 'neutral' : 'success'`）。首版漏透出 ⇒ 连击被打断
    //  仍显示成功文案，恒为 undefined。
    expect(r.comboBroken).toBe(true);
    expect(stats.combo).toBe(4); // 原 stats 不被就地改写（纯函数）
  });

  it('救场次数用完 ⇒ 结算返回 null（不再白给）', () => {
    const stats = createStats();
    const order = makeOrder('americano');
    expect(settleCatRescue(order, stats, 2)).toBeNull();
  });
});

/**
 * ⚠️ 接线守卫（2026-10-08 修，阻断级回归）
 *
 * 首版只测 settle* 的纯函数性，漏了**消费侧必须自己累加**这一半，于是
 * `stats.coins` 被单杯增量覆盖、`stats.combo` 恒为 0，而 9 条单测全绿。
 * 下面这组断言直接盯「连出 N 杯后的累计值」，把接线钉死。
 */
describe('结算合入累计统计（接线守卫）', () => {
  it('连出 3 杯 ⇒ coins 逐杯累加，不是只留最后一杯', () => {
    const done = { ...makeOrder('americano'), stepQualities: [96, 90, 88] };
    let stats = createStats();
    const deltas = [];
    for (let i = 0; i < 3; i++) {
      const r = settleNormalServe(done, stats);
      deltas.push(r.coinsDelta);
      stats = mergeSettlement(stats, r);
    }
    expect(deltas).toHaveLength(3);
    // 反证：首版实现下这里会是 deltas[2]（只有最后一杯）
    expect(stats.coins).toBe(deltas.reduce((a, b) => a + b, 0));
    expect(stats.coins).toBeGreaterThan(deltas[2]);
    expect(stats.served).toBe(3);
  });

  it('连出 3 杯 ⇒ combo 递增、bestCombo 跟随（首版恒为 0 / 1）', () => {
    const done = { ...makeOrder('americano'), stepQualities: [96, 90, 88] };
    let stats = createStats();
    const combos = [];
    for (let i = 0; i < 3; i++) {
      const r = settleNormalServe(done, stats);
      stats = mergeSettlement(stats, r);
      combos.push(stats.combo);
    }
    expect(combos).toEqual([1, 2, 3]);
    expect(stats.bestCombo).toBe(3);
  });

  it('合入后 stats 里不残留每杯专属字段 / 野字段', () => {
    const done = { ...makeOrder('americano'), stepQualities: [96, 90, 88] };
    const stats = mergeSettlement(createStats(), settleNormalServe(done, createStats()));
    for (const key of ['nextCombo', 'coinsDelta', 'quality', 'comboTip', 'comboBroken']) {
      expect(stats).not.toHaveProperty(key);
    }
  });

  it('猫救场 ⇒ 合入后 combo 归零且已有钱保留', () => {
    const done = { ...makeOrder('americano'), stepQualities: [96, 90, 88] };
    const stats = { ...createStats(), coins: 100, combo: 4, rescuesUsed: 0 };
    const after = mergeSettlement(stats, settleCatRescue(done, stats, 0));
    expect(after.combo).toBe(0);
    expect(after.rescuesUsed).toBe(1);
    expect(after.coins).toBeGreaterThan(100);
  });

  it('settlement 为 null ⇒ stats 原样返回，不清零', () => {
    const stats = { ...createStats(), coins: 42, combo: 3 };
    expect(mergeSettlement(stats, null)).toBe(stats);
  });
});

/**
 * ⚠️ 视图接线守卫（2026-10-08）
 *
 * 上面那组只证明 `mergeSettlement` 本身对，证明不了**视图真的调用了它**。
 * 首版回归正是「helper 不存在、视图自己展开」，所以这里直接读源码锁死调用点。
 * 反向对照实测：把 `mergeSettlement(stats.value, settlement)` 改回
 * `{ ...stats.value, ...settlement }` ⇒ 下面两条当场 FAIL。
 */
describe('周年馆视图接线（防「结算不回写」静默复发）', () => {
  it('两处结算都必须走 mergeSettlement，不得自行展开', () => {
    const code = cafeViewScript();
    const calls = code.match(/mergeSettlement\(\s*stats\.value\s*,\s*settlement\s*\)/g) || [];
    expect(calls).toHaveLength(2);
    expect(code).not.toMatch(/\.\.\.stats\.value\s*,\s*\.\.\.settlement/);
    expect(code).not.toMatch(/\.\.\.stats\s*,\s*\.\.\.settlement/);
  });

  it('mergeSettlement 已 import 进视图', () => {
    expect(cafeViewScript()).toMatch(/import\s*\{[^}]*\bmergeSettlement\b[^}]*\}/);
  });

  it('反馈文案读该杯增量 coinsDelta（不是累计值 coins）', () => {
    expect(cafeViewScript()).toMatch(/settlement\.coinsDelta/);
  });
});
