/**
 * 猫系统平衡的单元测试（plans/026 P0-4）
 *
 * 反证判据：如果哪天有人把冷却改回 320ms、或把救场品质改回 82，
 * 「刷猫优于认真做」这条会立刻转红 —— 这正是本次修复要守住的不变式。
 */
import { describe, it, expect } from 'vitest';
import {
  CAT_AFFINITY_CAP,
  CAT_HELP_COST,
  CAT_PET_COOLDOWN_MS,
  CAT_PLAY_GAIN,
  CAT_PLAY_COOLDOWN_MS,
  CAT_RESCUE_QUALITY,
  MAX_CAT_RESCUES,
  CAT_BALANCE_NOTES,
  canCatRescue,
  canPlayWithCat,
  resolveCatRescue,
  resolveNormalServe,
  tryPetCat,
  tryPlayWithCat,
} from '@/games/cafe/systems/cat.js';

const base = { nowMs: 10_000, anyStepInProgress: false, paused: false };

/** 造一个「距上次交互已过足够久」的时间戳 */
const idleFor = (ms) => 10_000 - ms - 1;

describe('摸猫与逗猫 —— 获取变慢（P0-4 ①）', () => {
  it('冷却 1.5s 内不能再摸（旧值 320ms ⇒ 攒 8 点只要 1.28s）', () => {
    expect(CAT_PET_COOLDOWN_MS).toBeGreaterThanOrEqual(1200);
    const first = tryPetCat({ ...base, affinity: 0, lastPetAt: idleFor(CAT_PET_COOLDOWN_MS) });
    expect(first.ok).toBe(true);
    expect(first.affinity).toBe(1);
    // 冷却窗口内（刚好差 1ms）
    const tooSoon = tryPetCat({
      ...base,
      affinity: 1,
      lastPetAt: 10_000 - CAT_PET_COOLDOWN_MS + 1,
    });
    expect(tooSoon.ok).toBe(false);
    expect(tooSoon.reason).toBe('cooldown');
    const ok = tryPetCat({ ...base, affinity: 1, lastPetAt: idleFor(CAT_PET_COOLDOWN_MS) });
    expect(ok.ok).toBe(true);
  });

  it('逗猫收益降到 +1（旧值 +2）', () => {
    expect(CAT_PLAY_GAIN).toBe(1);
    const played = tryPlayWithCat({ ...base, affinity: 0, lastPlayAt: 0, catMood: 'idle' });
    expect(played.affinity).toBe(1);
  });

  it('制作中不许摸/逗 —— 堵掉「拖着奶泡连点猫」白嫖额度', () => {
    expect(canPlayWithCat(true)).toBe(false);
    expect(canPlayWithCat(false)).toBe(true);
    const pet = tryPetCat({ ...base, affinity: 0, lastPetAt: -9999, anyStepInProgress: true });
    expect(pet.ok).toBe(false);
    expect(pet.reason).toBe('busy');
    const play = tryPlayWithCat({
      ...base,
      affinity: 0,
      lastPlayAt: -9999,
      catMood: 'idle',
      anyStepInProgress: true,
    });
    expect(play.ok).toBe(false);
    expect(play.reason).toBe('busy');
  });

  it('亲密度有上限，且不会溢出', () => {
    expect(CAT_AFFINITY_CAP).toBeGreaterThan(CAT_HELP_COST);
    const result = tryPetCat({ ...base, affinity: CAT_AFFINITY_CAP, lastPetAt: -9999 });
    expect(result.affinity).toBe(CAT_AFFINITY_CAP);
  });

  it('攒满一次救场所需亲密度 ≥ 8 秒（旧实现 1.28s）', () => {
    expect(CAT_BALANCE_NOTES.minSecondsToCharge).toBeGreaterThanOrEqual(12);
    expect(CAT_PLAY_COOLDOWN_MS).toBeGreaterThan(0);
  });
});

describe('救场 —— 真实代价 + 次数封顶（P0-4 ②③）', () => {
  it('品质 68，低于认真做的中位档（good=88）', () => {
    expect(CAT_RESCUE_QUALITY).toBeLessThan(88);
    expect(CAT_RESCUE_QUALITY).toBeGreaterThanOrEqual(60);
  });

  it('救场清零连击、且拿不到 comboTip（旧实现两样都保留）', () => {
    const rescued = resolveCatRescue({ price: 30, patience: 80, currentCombo: 5 });
    expect(rescued.nextCombo).toBe(0);
    expect(rescued.comboTip).toBe(0);
    expect(rescued.comboBroken).toBe(true);
  });

  it('认真做连击能累积、并拿到 comboTip（与救场形成对照）', () => {
    const normal = resolveNormalServe({ price: 30, patience: 80, quality: 88, nextCombo: 5 });
    expect(normal.comboTip).toBeGreaterThan(0);
    expect(normal.nextCombo).toBe(5);
  });

  it('同样的价格与耐心下，认真做的收益必须高于救场', () => {
    const rescued = resolveCatRescue({ price: 36, patience: 70, currentCombo: 3 });
    const careful = resolveNormalServe({ price: 36, patience: 70, quality: 88, nextCombo: 4 });
    expect(careful.coins).toBeGreaterThan(rescued.coins);
    expect(careful.nextCombo).toBeGreaterThan(rescued.nextCombo);
  });

  it('每局救场次数封顶为 2', () => {
    expect(MAX_CAT_RESCUES).toBe(2);
    const ready = {
      affinity: 20,
      phase: 'playing',
      paused: false,
      resolving: false,
      rescuesUsed: 0,
    };
    expect(canCatRescue(ready)).toBe(true);
    expect(canCatRescue({ ...ready, rescuesUsed: MAX_CAT_RESCUES })).toBe(false);
  });

  it('不够亲密度 / 暂停中 / 正在结算时都不能救场', () => {
    const base2 = {
      affinity: 20,
      phase: 'playing',
      paused: false,
      resolving: false,
      rescuesUsed: 0,
    };
    expect(canCatRescue({ ...base2, affinity: CAT_HELP_COST - 1 })).toBe(false);
    expect(canCatRescue({ ...base2, paused: true })).toBe(false);
    expect(canCatRescue({ ...base2, resolving: true })).toBe(false);
    expect(canCatRescue({ ...base2, phase: 'intro' })).toBe(false);
  });
});

describe('不变式：刷猫不再优于认真做（本次修复的核心命题）', () => {
  it('刷猫的全速出杯耗时显著高于认真做', () => {
    expect(CAT_BALANCE_NOTES.optimisticSecondsPerCup).toBeGreaterThan(
      CAT_BALANCE_NOTES.carefulSecondsPerCup,
    );
  });

  it('一局 150s 内认真做的杯数多于刷猫能救的杯数（刷猫还受 2 次封顶）', () => {
    const carefulCups = Math.floor(150 / CAT_BALANCE_NOTES.carefulSecondsPerCup);
    //刷猫上限就是 MAX_CAT_RESCUES 次（额度封顶），不可能超过认真做
    expect(MAX_CAT_RESCUES).toBeLessThan(carefulCups);
  });
});
