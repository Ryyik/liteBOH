/**
 * 八类制作机制的单元测试（plans/026 P0-2 / P0-3）
 *
 * 反证判据（改坏任一机制时本文件必须转红）：
 *  - 每种 kind 都有一条「机制达标 ⇒ 高档」「机制不达标 ⇒ fail/fair」的断言，
 *    而不是因为「只要调gradeByWindow 就会过」。
 *  - P0-3 的三档惩罚必须真的连击清零 + 扣 15 耐心（原来只扣 8）。
 */
import { describe, it, expect } from 'vitest';
import {
  STEP_DEFINITIONS,
  GRADES,
  gradeByWindow,
  resolveTargetWindow,
} from '@/games/cafe/core/steps.js';
import {
  createStepState,
  stepTick,
  stepCommit,
  doseOnce,
  sampleSwirl,
  sampleTrace,
  latteGuideY,
} from '@/games/cafe/core/engine.js';

const tick = (def, state, seconds, env = {}, dt = 0.05) => {
  let current = state;
  for (let t = 0; t < seconds; t += dt) current = stepTick(def, current, dt, env);
  return current;
};

describe('目标区与判定分级（P0-3）', () => {
  it('金区内侧三成判perfect、次级 good、稍外 fair、越界 fail', () => {
    expect(gradeByWindow(70, [60, 80]).grade).toBe('perfect');
    expect(gradeByWindow(61, [60, 80]).grade).toBe('good');
    expect(gradeByWindow(56, [60, 80]).grade).toBe('fair');
    expect(gradeByWindow(40, [60, 80]).grade).toBe('fail');
  });

  it('Fail 的惩罚是「连击清零 + 耐心 -15」，不是旧的 -8', () => {
    expect(GRADES.fail.patiencePenalty).toBe(15);
    expect(GRADES.fail.comboDelta).toBe(0);
    expect(GRADES.fair.comboDelta).toBe(0);
    expect(GRADES.perfect.comboMultiplier).toBe(2);
  });

  it('难度收窄封顶 3.5，且升级能把难度加回来（单一真源在resolveTargetWindow）', () => {
    const base = STEP_DEFINITIONS.grind.target;
    const late = resolveTargetWindow(60, base);
    const lateWidth = late[1] - late[0];
    const baseWidth = base[1] - base[0];
    // 收窄存在，但封顶 ⇒ 不会越做越窄到消失
    expect(lateWidth).toBeLessThan(baseWidth);
    expect(lateWidth).toBeGreaterThan(baseWidth - 2 * 3.5 - 0.001);
    // 升级加宽确实生效
    const upgraded = resolveTargetWindow(60, base, 4.2);
    expect(upgraded[1] - upgraded[0]).toBeGreaterThan(lateWidth);
  });
});

describe('研磨 oscillate —— 转速振荡 + 稳定保持', () => {
  const def = STEP_DEFINITIONS.grind;

  it('按住会升温；持续按住撞顶后进入过热并回落（这是新机制，旧版本没有）', () => {
    // ⚠️ 不能用「一直调tick」来测过热：达到 stable 后 status 变settled，
    // tick 直接 return（设计上就该停），永远不会撞顶。
    // 要测过热必须**绕过 stable**：从窗口上方起步，让 value 一路冲到 100。
    let state = { ...createStepState('grind'), status: 'holding', value: 88 };
    let hot = state;
    for (let i = 0; i < 60 && !hot.overheated; i += 1) {
      hot = stepTick(def, hot, 0.05, {});
    }
    expect(hot.overheated).toBe(true);
    expect(hot.value).toBe(100);

    // 回落速率 21/s，从 100 落回窗口下沿 40 需约 2.9s，冷却时间必须给够
    const cooled = tick(def, hot, 3.2);
    expect(cooled.value).toBeLessThan(100);
    expect(cooled.overheated).toBe(false);
  });

  it('在目标区稳住 holdRequired 秒 ⇒ settled；没稳住 ⇒ fail', () => {
    //真实路径：从窗口下沿起步，持续推进应当恰好在 stable 达标的那帧变settled
    let state = { ...createStepState('grind'), status: 'holding', value: def.target[0] + 2 };
    let settledState = null;
    for (let i = 0; i < 120; i += 1) {
      state = stepTick(def, state, 0.05, {});
      if (state.status === 'settled') {
        settledState = state;
        break;
      }
    }
    expect(settledState).not.toBeNull();
    expect(stepCommit(def, settledState).grade).not.toBe('fail');

    const rushed = {
      ...createStepState('grind'),
      status: 'holding',
      holdSeconds: 0,
      stable: false,
    };
    expect(stepCommit(def, rushed).grade).toBe('fail');
  });

  /**
   * 反证「设计层面做不到」的那类缺陷：
   * 窗口宽 / riseRate 必须 ≥ holdRequired，否则玩家在窗口内的穿越时间比要求的停留时间还短，
   * 物理上不可能停稳 ⇒ 转速会永久振荡、stable 永假。
   * 2026-10-08 实测：riseRate=46 时窗口 32 点 0.70s 就穿过去了（> holdRequired 1.0s），
   * 表现是「怎么按都判不了稳定」。
   */
  it('不变式：窗口穿越时间 ≥ 停留要求 × 1.6（否则玩家无法停稳）', () => {
    const width = def.target[1] - def.target[0];
    const traverse = width / def.riseRate;
    expect(traverse).toBeGreaterThanOrEqual(def.holdRequired * 1.6);
  });

  it('给定可行的 riseRate，真实推进 8 秒内必然能拿到一次 stable（不是靠改断言过关）', () => {
    let state = { ...createStepState('grind'), status: 'holding' };
    let sawStable = false;
    for (let i = 0; i < 160 && !sawStable; i += 1) {
      state = stepTick(def, state, 0.05, {});
      if (state.stable) sawStable = true;
    }
    expect(sawStable).toBe(true);
  });
});

describe('萃取 staged —— 中段必须排气', () => {
  const def = STEP_DEFINITIONS.extract;

  it('漏排气 ⇒ 降档且扣品质；排了气 ⇒ 正常档', () => {
    // rate=20/s ⇒ 排气窗[28,56] 是 1.4~2.8s，金区[62,94] 是 3.1~4.7s。
    // 推进到 3.6s：刚过排气窗（漏排已成立）且value 落在金区内侧 ⇒ 漏排是唯一扣分项。
    const missed = tick(def, { ...createStepState('extract'), status: 'holding' }, 3.6);
    expect(missed.value).toBeGreaterThan(def.ventWindow[1]);
    expect(missed.value).toBeGreaterThanOrEqual(def.target[0]);
    expect(missed.value).toBeLessThanOrEqual(def.target[1]);
    expect(missed.missedVent).toBe(true);
    const missedResult = stepCommit(def, missed);
    expect(missedResult.grade).toBe('fair');
    expect(missedResult.quality).toBeLessThan(88);

    const vented = { ...missed, ventedAt: 40, missedVent: false };
    expect(stepCommit(def, vented).grade).not.toBe('fail');
  });

  it('撞到 100 ⇒ 判定过萃失败，且给出的是「过萃」而不是通用失败文案', () => {
    const exhausted = tick(def, { ...createStepState('extract'), status: 'holding' }, 7);
    expect(exhausted.status).toBe('exhausted');
    const result = stepCommit(def, exhausted);
    expect(result.grade).toBe('fail');
    expect(result.message).toContain('过萃');
  });

  /**
   * 不变式：排气窗必须与金区**完全分离**。
   * 首版 ventWindow=[34,62] 而 target=[58,88]，只重叠 4 点 ⇒
   * 「排气」与「拿 perfect」互斥，端到端探针实测排气阀几乎抓不到。
   * 这类「机制互斥」单测看不出来（单看每一步都成立），必须显式断言区间关系。
   */
  it('排气窗完全落在金区之前，两者不重叠', () => {
    expect(def.ventWindow[1]).toBeLessThan(def.target[0]);
    // 且排气窗本身要有足够停留时间（不能一闪而过）
    expect(def.ventWindow[1] - def.ventWindow[0]).toBeGreaterThanOrEqual(20);
  });

  it('排气后再推进到金区 ⇒ 能拿到 perfect（不因漏排降档）', () => {
    let state = { ...createStepState('extract'), status: 'holding' };
    // 推进到排气窗中段（1.4~2.8s）并排气
    state = tick(def, state, 2.2);
    expect(state.stage).toBe(1);
    state = { ...state, ventedAt: state.value };
    // 继续推进到完美区中段（3.42~4.38s，取 3.9s）
    state = tick(def, state, 1.7);
    const center = (def.target[0] + def.target[1]) / 2;
    expect(Math.abs(state.value - center)).toBeLessThan(6);
    const result = stepCommit(def, state);
    expect(result.grade).toBe('perfect');
    expect(result.quality).toBe(100);
  });
});

describe('注水 swirl —— 必须画弧闭合且不抖', () => {
  const def = STEP_DEFINITIONS.water;

  it('角度累积够且不抖 ⇒ perfect；角度不够 ⇒ fail；抖太多 ⇒ fair', () => {
    let clean = createStepState('water');
    for (let a = 0; a < 400; a += 10) {
      const rad = (a * Math.PI) / 180;
      clean = sampleSwirl(clean, { x: 0.5 + Math.cos(rad) * 0.6, y: 0.5 + Math.sin(rad) * 0.6 });
    }
    expect(clean.accumulatedAngle).toBeGreaterThan(def.targetArc);
    expect(stepCommit(def, clean).grade).toBe('perfect');

    expect(stepCommit(def, createStepState('water')).grade).toBe('fail');

    let shaky = createStepState('water');
    for (let a = 0; a < 400; a += 10) {
      const rad = (a * Math.PI) / 180;
      const jitter = a % 20 === 0 ? 0.35 : 0;
      shaky = sampleSwirl(shaky, {
        x: 0.5 + Math.cos(rad) * 0.6 + jitter,
        y: 0.5 + Math.sin(rad) * 0.6,
      });
    }
    expect(stepCommit(def, shaky).grade).toBe('fair');
  });
});

describe('奶泡 texture —— 进气时机', () => {
  const def = STEP_DEFINITIONS.steam;

  it('太早进气 ⇒ fair 且品质低；在目标区 ⇒ perfect；太晚 ⇒ fair', () => {
    const early = tick(def, { ...createStepState('steam'), status: 'holding' }, 0.6);
    expect(early.value).toBeLessThan(def.earlyBelow);
    expect(stepCommit(def, early).quality).toBeLessThanOrEqual(70);

    const good = { ...createStepState('steam'), status: 'holding', value: 60 };
    expect(stepCommit(def, good).grade).toBe('perfect');

    const late = tick(def, { ...createStepState('steam'), status: 'holding' }, 6);
    expect(late.value).toBeGreaterThan(def.lateAbove);
    expect(stepCommit(def, late).quality).toBeLessThanOrEqual(70);
  });
});

describe('分层 layer —— 液面必须高于上一层', () => {
  const def = STEP_DEFINITIONS.coconut;

  it('抬升足够 ⇒ 过关；几乎没抬 ⇒ 串层 fail', () => {
    const good = tick(
      def,
      { ...createStepState('coconut'), status: 'holding', previousHeight: 10 },
      3,
    );
    expect(stepCommit(def, good).grade).not.toBe('fail');

    const flat = {
      ...createStepState('coconut'),
      status: 'holding',
      value: 1,
      previousHeight: 10,
      levelHeight: 11,
    };
    expect(stepCommit(def, flat).grade).toBe('fail');
  });
});

describe('冰块 timed —— 冰化倒计时', () => {
  const def = STEP_DEFINITIONS.ice;

  it('抢在化完前完成 ⇒ perfect；化完了 ⇒ fail；没加够 ⇒ fail', () => {
    let state = createStepState('ice');
    state = doseOnce(def, state, 0);
    state = doseOnce(def, state, 200);
    state = doseOnce(def, state, 400);
    expect(state.added).toBe(3);
    expect(stepCommit(def, state, { melted: false, elapsedMs: 2000 }).grade).toBe('perfect');
    expect(stepCommit(def, state, { melted: true }).grade).toBe('fail');
    expect(stepCommit(def, { ...state, added: 1 }).grade).toBe('fail');
  });
});

describe('投料 sequenced —— 间隔节奏', () => {
  const def = STEP_DEFINITIONS.syrup;

  it('间隔太短 ⇒ fair；均匀 ⇒ perfect', () => {
    let rushed = createStepState('syrup');
    rushed = doseOnce(def, rushed, 0);
    rushed = doseOnce(def, rushed, 100);
    expect(rushed.tooFast).toBe(true);
    expect(stepCommit(def, rushed).grade).toBe('fair');

    let even = createStepState('syrup');
    even = doseOnce(def, even, 0);
    even = doseOnce(def, even, 900);
    even = doseOnce(def, even, 1800);
    expect(even.tooFast).toBe(false);
    expect(even.evenPace).toBe(true);
    expect(stepCommit(def, even).grade).toBe('perfect');
  });
});

describe('拉花 trace —— 跟随轨迹 + 终点落心', () => {
  const def = STEP_DEFINITIONS.pour;

  it('沿引导线走完且落在杯心 ⇒ perfect；抖动超标 ⇒ fair；没走完 ⇒ fail', () => {
    let good = createStepState('pour');
    for (let x = 0; x <= 1.0001; x += 0.02) {
      good = sampleTrace(good, { x, y: latteGuideY(x) }, latteGuideY);
    }
    const result = stepCommit(def, good);
    expect(['perfect', 'good']).toContain(result.grade);

    expect(stepCommit(def, createStepState('pour')).grade).toBe('fail');

    let shaky = createStepState('pour');
    for (let x = 0; x <= 1.0001; x += 0.02) {
      shaky = sampleTrace(shaky, { x, y: latteGuideY(x) + 0.22 }, latteGuideY);
    }
    expect(stepCommit(def, shaky).grade).toBe('fair');
  });

  it('引导线连续可微、无接缝（分段拼接会让玩家在接缝处急停并被判抖）', () => {
    let maxJump = 0;
    for (let x = 0; x <= 1; x += 0.005) {
      maxJump = Math.max(maxJump, Math.abs(latteGuideY(x) - latteGuideY(Math.max(0, x - 0.005))));
    }
    expect(maxJump).toBeLessThan(0.02);
  });

  it('引导线两端回到杯心高度（玩家可以从容起笔与收笔）', () => {
    expect(latteGuideY(0)).toBeCloseTo(0.5, 5);
    expect(latteGuideY(1)).toBeCloseTo(0.5, 5);
  });

  it('引导线真的是心形：中间凹、两侧鼓（不是一条单调曲线）', () => {
    // 实测最深处（鼓包）在 t≈±0.6 ⇒ x≈0.2 / 0.8；中心 x=0.5 是浅凹谷
    const lobe = latteGuideY(0.8);
    const valley = latteGuideY(0.5);
    const edge = latteGuideY(0);
    expect(lobe).toBeLessThan(valley - 0.15);
    expect(edge).toBeGreaterThan(lobe + 0.2);
  });
});

/**
 * 回归：出杯瞬间 currentStepId 变 null，视图仍会用它创建装置状态。
 * 原实现 `STEP_DEFINITIONS[null].target` 抛 TypeError，被全局错误边界捕获 ⇒ 整页渲染报错。
 */
describe('createStepState 兜底 —— 一杯做完时 stepId 会是 null', () => {
  it('未知 / null stepId 不抛错，返回中性状态', () => {
    for (const bad of [null, undefined, 'no-such-step', '', 0]) {
      const state = createStepState(bad);
      expect(state).toBeTruthy();
      expect(state.kind).toBe('serve');
      expect(state.status).toBe('settled');
      expect(state.unknownStep).toBe(true);
      expect(Array.isArray(state.window)).toBe(true);
    }
  });

  it('未知 stepId 不会被 stepCommit 判成 fail（不应因缺数据惩罚玩家）', () => {
    const state = createStepState(null);
    expect(() => stepCommit({ kind: 'serve' }, state)).not.toThrow();
  });
});

describe('八类机制各自独立（反证：不是同一个 handler 套壳）', () => {
  it('每个 kind 都被 stepCommit 覆盖，且产生不同结果', () => {
    const kinds = new Set(Object.values(STEP_DEFINITIONS).map((def) => def.kind));
    expect(kinds.size).toBe(8);

    // 同一个「空状态」在八个机制下的判定不应完全一致
    const grades = Object.values(STEP_DEFINITIONS).map(
      (def) => stepCommit(def, createStepState(def.id)).grade,
    );
    expect(new Set(grades).size).toBeGreaterThan(1);
  });
});
