/**
 * 八类制作机制的纯逻辑引擎 —— 云上咖啡店（plans/026 P0-2）
 *
 * 设计约束：
 *  1. **无 Vue 依赖**。所有 handler 都是 `state → state` 的纯函数（或返回判定结果），
 *     可直接被 vitest 引用，这是 plans/026 §3 步 3 的验收条件。
 *  2. 每个 kind 暴露同一个接口：`createStepState / stepTick / stepCommit`，
 *     所以视图层不需要按 kind 分支调用不同方法。
 *  3. **判定只走gradeByWindow**（core/steps.js），Fail 一律落到
 *     `GRADES.fail`（连击清零 + 耐心 -15），不再有「只扣 8 点」的软失败。
 */

import { GRADES, STEP_DEFINITIONS, gradeByWindow, resolveTargetWindow } from './steps.js';

/**
 * 每个订单里这一步的运行时状态（新建时由 createStepState 产出）。
 *
 * ⚠️ stepId 可能是 null/undefined 或未知 id：一杯做完最后一步后
 * `currentStepId` 就是 null，而视图层仍会用它渲染装置台
 * （`:state="stepState || createStepState(currentStepId || 'serve')"`）。
 * 原实现直接 `def.target` ⇒ `TypeError: Cannot read properties of undefined`，
 * 被全局错误边界捕获 ⇒ 整页渲染报错（出杯那一瞬间白屏）。
 * 现在显式兜底成一个中性状态，装置台会渲染「这一杯做完了」。
 */
export function createStepState(stepId, context = {}) {
  const def = STEP_DEFINITIONS[stepId];
  if (!def) {
    return {
      kind: 'serve',
      value: 0,
      status: 'settled',
      window: [0, 100],
      grade: null,
      quality: 0,
      message: '',
      startedAt: 0,
      unknownStep: true,
    };
  }
  const window = resolveTargetWindow(
    context.served || 0,
    def.target || [50, 90],
    context.upgradeBonus || 0,
  );
  const base = {
    kind: def.kind,
    value: 0,
    status: 'idle', // idle | holding | exhausted | settled | failed
    window,
    grade: null,
    quality: 0,
    message: '',
    startedAt: 0,
  };

  switch (def.kind) {
    case 'oscillate':
      return { ...base, holdSeconds: 0, overheated: false, stable: false };
    case 'staged':
      return { ...base, stage: 0, ventedAt: -1, missedVent: false };
    case 'swirl':
      return { ...base, accumulatedAngle: 0, lastAngle: null, wobble: 0, closed: false };
    case 'texture':
      return { ...base, inflow: 0, stoppedAt: 0 };
    case 'layer':
      return {
        ...base,
        levelHeight: context.previousHeight || 0,
        previousHeight: context.previousHeight || 0,
      };
    case 'timed':
      return { ...base, added: 0, lastDoseAt: -9999 };
    case 'sequenced':
      return { ...base, added: 0, lastDoseAt: -9999 };
    case 'trace':
      return { ...base, progress: 0, trail: [], deviation: 0, lastX: null, lastY: null };
    default:
      return base;
  }
}

/**
 * 每帧推进。返回新的 state（不改传入对象，方便单测断言）。
 * @param {object} def 步骤定义
 * @param {object} state 当前状态
 * @param {number} delta 秒
 * @param {object} env { served, upgradeBonus, blocked }
 */
export function stepTick(def, state, delta, env = {}) {
  const difficulty = 1 + Math.min(0.28, (env.served || 0) * 0.03);
  if (env.blocked) return state;

  switch (def.kind) {
    // ── 研磨：按住升温，过热回落，需在目标区累计停留 holdRequired 秒 ──
    case 'oscillate': {
      // stable 一旦成立就不再退回 —— 否则调用方（视图层）把 stable 置true 后，
      // 下一帧又因 inWindow 瞬时为假而把 status 打回 holding，稳定判定丢失。
      if (state.stable) return { ...state, status: 'settled' };
      if (state.status !== 'holding') return state;
      const ceiling = 100;
      // ⚠️ 过热判定必须用「本帧实际推进后的值」而不是增量预测：
      // 旧写法 `value + rise*delta >= ceiling` 在 value 已接近 100 时会每帧都判过热，
      // 于是.overheated 立刻为真、转入回落分支，回落到窗口内又被判冷却，
      // 来回翻转实测出现 value 在 62↔100 之间摆动、holdSeconds 永远攒不满。
      const rise = state.overheated ? 0 : def.riseRate * delta * difficulty;
      const fall = state.overheated ? def.fallRate * delta : 0;
      const raw = state.value + rise - fall;
      const value = Math.max(0, Math.min(ceiling, raw));
      const hitCeiling = !state.overheated && value >= ceiling;
      const [wStart, wEnd] = state.window;
      const inWindow = value >= wStart && value <= wEnd;
      const stableNow = inWindow && !state.overheated && !hitCeiling;
      const holdSeconds = stableNow ? state.holdSeconds + delta : 0;
      const stable = holdSeconds >= def.holdRequired;
      // 冷却到窗口下沿以下才允许重新升温
      const cooledDown = state.overheated && value <= wStart;
      return {
        ...state,
        value,
        holdSeconds,
        stable,
        overheated: cooledDown ? false : state.overheated || hitCeiling,
        status: stable ? 'settled' : 'holding',
      };
    }

    // ── 萃取：三段推进，中段需要排气阀 ──
    case 'staged': {
      if (state.status !== 'holding') return state;
      // ⚠️ 速率 20/s：金区 62~94 意味着要 3.1~4.7 秒才进入，整步 5~6 秒。
      // 首版用 11/s，进入金区要 5.6 秒、到顶 9 秒 —— 实测端到端探针按 2.4 秒
      // 等待时 value 才 26，节奏太拖沓（一个步骤吃掉 1/25 局）。
      const rate = 20 * difficulty;
      const value = Math.min(100, state.value + rate * delta);
      const [vStart, vEnd] = def.ventWindow;
      let stage = 0;
      if (value >= vStart && value < vEnd) stage = 1;
      else if (value >= vEnd) stage = 2;
      // 中段过去了但没排气 → 记为漏排（在 settle 时扣品质）
      const missedVent = state.stage === 1 && stage === 2 && state.ventedAt < 0;
      // ⚠️ 撞到 100 必须停在这里（status 落到 failed 由 stepCommit 判定）。
      // 否则 requestAnimationFrame 会继续推 value，永远锁在 100，
      // 而 window 上限是 88⇒ 拖满 12 秒**必定**判 fail，玩家毫无补救余地。
      if (value >= 100) {
        return {
          ...state,
          value: 100,
          stage,
          missedVent: state.missedVent || missedVent,
          status: 'exhausted',
        };
      }
      return {
        ...state,
        value,
        stage,
        missedVent: state.missedVent || missedVent,
        status: 'holding',
      };
    }

    // ── 注水：绕杯心画弧，累积角度要够，且抖动在容差内 ──
    case 'swirl': {
      if (state.status !== 'holding') return state;
      return state;
    }

    // ── 奶泡：进气量持续上涨，到达目标区松手 ──
    case 'texture': {
      if (state.status !== 'holding') return state;
      return { ...state, value: Math.min(100, state.value + 17 * difficulty * delta) };
    }

    // ── 分层：液面必须高于已有液面（同层=串层失败） ──
    case 'layer': {
      if (state.status !== 'holding') return state;
      const value = Math.min(100, state.value + 19 * difficulty * delta);
      const levelHeight = state.previousHeight + value * 0.9;
      return { ...state, value, levelHeight };
    }

    case 'timed':
    case 'sequenced': {
      if (state.status !== 'holding') return state;
      return state;
    }

    // ── 拉花：跟随引导轨迹累积进度，抖动累计 ──
    case 'trace': {
      if (state.status !== 'holding') return state;
      return state;
    }

    default:
      return state;
  }
}

/**
 * 玩家结束当前动作（松手 / 点确认）时调用。返回带 grade/quality 的 state。
 * 这是唯一判定入口 —— 保证八类机制的判定口径一致。
 */
export function stepCommit(def, state, env = {}) {
  const finish = (gradeId, message, qualityOverride) => {
    const grade = GRADES[gradeId];
    return {
      ...state,
      status: gradeId === 'fail' ? 'failed' : 'settled',
      grade: gradeId,
      quality: qualityOverride ?? grade.quality,
      message,
    };
  };

  switch (def.kind) {
    case 'oscillate': {
      if (state.overheated && !state.stable) return finish('fail', '研磨过热，细度回落了');
      if (!state.stable && state.holdSeconds < def.holdRequired * 0.6) {
        return finish('fail', '没能稳住转速');
      }
      const result = gradeByWindow(state.value, state.window);
      const message = result.grade === 'perfect' ? '转速稳稳锁住' : '细度基本到位';
      return finish(result.grade, message, result.quality);
    }

    case 'staged': {
      // ⚠️ exhausted = 已经撞到 100（过萃），value锁死在 100 而 window 上限88。
      // 这种情况必须判 fail 且提示「过萃」，不能按 gradeByWindow 的
      // distance=12 > 8 落进通用 fail 文案（玩家看不懂是哪错了）。
      if (state.status === 'exhausted') return finish('fail', '萃取过头了，咖啡已经过萃');
      if (def.ventRequired && state.missedVent) {
        const base = gradeByWindow(state.value, state.window);
        if (base.grade === 'fail') return finish('fail', '萃取出问题，而且漏了排气');
        return finish(
          'fair',
          `漏了排气阀（品质 -${def.ventPenalty}）`,
          Math.max(45, base.quality - def.ventPenalty),
        );
      }
      const result = gradeByWindow(state.value, state.window);
      return finish(
        result.grade,
        result.grade === 'perfect' ? '萃取均匀漂亮' : '萃取完成',
        result.quality,
      );
    }

    case 'swirl': {
      if (state.accumulatedAngle < def.targetArc) {
        return finish('fail', '水线没连成一圈');
      }
      if (state.wobble > def.wobbleTolerance) {
        return finish('fair', '水线画得太抖', 66);
      }
      const ratio = Math.min(1, state.accumulatedAngle / (def.targetArc * 1.25));
      return finish(
        ratio > 0.92 ? 'perfect' : 'good',
        ratio > 0.92 ? '一圈闭合，稳' : '水线连上了',
        Math.round(88 + ratio * 12),
      );
    }

    case 'texture': {
      if (state.value < def.earlyBelow) return finish('fair', '进气太早，奶泡粗糙', 62);
      if (state.value > def.lateAbove) return finish('fair', '进气太晚，几乎没气泡', 62);
      const result = gradeByWindow(state.value, state.window);
      return finish(
        result.grade,
        result.grade === 'perfect' ? '奶泡细腻如云' : '奶泡还行',
        result.quality,
      );
    }

    case 'layer': {
      // 分层的核心判定：必须严格高于上一层，否则串层
      if (state.value <= 2) return finish('fail', '液面没有超过上一层，串层了');
      const result = gradeByWindow(state.value, state.window);
      const heightsOk = state.levelHeight > state.previousHeight + 6;
      if (!heightsOk) return finish('fair', '液面抬升太慢，容易混', 64);
      return finish(
        result.grade,
        result.grade === 'perfect' ? '分层清晰漂亮' : '分层成立',
        result.quality,
      );
    }

    case 'timed': {
      // 冰块：冰化倒计时
      if (env.melted) return finish('fail', '冰化完了，这杯得重做');
      if (state.added < def.targetCount)
        return finish('fail', `冰块没加够（${state.added}/${def.targetCount}）`);
      const fast = env.elapsedMs != null && env.elapsedMs < def.meltMs * 0.55;
      if (fast) return finish('perfect', '赶在冰化前完成', 100);
      return finish('good', '冰块撑住了', 88);
    }

    case 'sequenced': {
      if (state.added < def.targetCount) {
        return finish('fail', `份量不足（${state.added}/${def.targetCount}）`);
      }
      if (state.tooFast) return finish('fair', '间隔太短，混在一起了', 64);
      return finish(
        state.evenPace ? 'perfect' : 'good',
        state.evenPace ? '节奏均匀' : '完成',
        state.evenPace ? 100 : 88,
      );
    }

    case 'trace': {
      if (state.progress < def.targetProgress) return finish('fail', '轨迹没走完');
      if (state.deviation > def.wobblePenalty) return finish('fair', '手抖了，线条歪了', 68);
      const centered = state.endOffset != null && state.endOffset <= def.centerTolerance;
      if (!centered) return finish('fair', '收尾没落在杯心', 72);
      return finish('perfect', '一颗完整的心', 100);
    }

    default:
      return finish('good', '完成', GRADES.good.quality);
  }
}

/** 点按类步骤的一次投料（timed / sequenced） */
export function doseOnce(def, state, nowMs) {
  if (state.added >= def.targetCount) return { ...state, status: 'settled' };
  // ⚠️ 首投没有「上一个时刻」，lastDoseAt 是哨兵 -9999。
  // 直接算gap 会得到 9999ms 这个假间隔，混进 spread 后 evenPace 永远为假
  //（实测首投后 spread≈9000 ⇒ 均匀投放也判不出 perfect）。
  const isFirst = state.lastDoseAt <= -9000;
  const gap = isFirst ? null : nowMs - state.lastDoseAt;
  const tooFast = gap != null && gap < def.minGapMs;
  const gaps = gap == null ? state.gaps || [] : [...(state.gaps || []), gap];
  // ⚠️ 只有一个真实间隔也足以判断「两次投料的节奏」，不要求 ≥2 个
  // （targetCount=2 的配方永远只有 1 个间隔，旧条件 gaps.length>=2 永假 ⇒
  //  所有两泵配方都拿不到 perfect）。
  const evenPace = gaps.length >= 1 && Math.max(...gaps) - Math.min(...gaps) <= def.minGapMs * 2.2;
  return {
    ...state,
    added: state.added + 1,
    value: ((state.added + 1) / def.targetCount) * 100,
    lastDoseAt: nowMs,
    gaps,
    tooFast: state.tooFast || tooFast,
    evenPace,
    status: 'holding',
  };
}

/**
 * 注水（swirl）的指针采样：累积绕杯心的角度，抖动累计。
 * @param {object} state
 * @param {{x:number,y:number}} point 相对装置中心的归一化坐标（-1..1）
 */
export function sampleSwirl(state, point) {
  // ⚠️ 必须减去装置中心：point 是 0..1 归一化坐标，圆心在 (0.5, 0.5) 而非原点。
  // 不减去的话 atan2 绕的是页面原点，同心圆上各点角差被压缩（实测 10° → 4.5°），
  // 累积角度永远够不到 targetArc ⇒「干净画一圈也判fail」的假失败。
  const x = point.x - 0.5;
  const y = point.y - 0.5;
  const angle = Math.atan2(y, x);
  if (state.lastAngle == null) {
    return { ...state, lastAngle: angle, lastX: point.x, lastY: point.y };
  }
  let delta = angle - state.lastAngle;
  // 处理 ±π 跨越
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  const magnitude = Math.abs(delta);
  const radius = Math.hypot(x, y);
  // ⚠️ 抖动只惩罚「半径明显偏离舒适圈」的采样，不能惩罚角度推进本身。
  // 旧公式 `magnitude*9` 把正常画圈的角增量也算成抖动 ⇒ 一个完美同心圆
  // 累积 wobble=61（容差 26）被判 fair，等于「画得越圆越抖」。
  // 现在只留径向惩罚，且系数下调到「贴心(0.28)或甩飞(0.95)才明显」量级。
  const radialOff = Math.max(0, 0.3 - radius) * 60 + Math.max(0, radius - 0.92) * 60;
  const wobble = state.wobble + radialOff * magnitude * (180 / Math.PI);
  return {
    ...state,
    accumulatedAngle: state.accumulatedAngle + magnitude * (180 / Math.PI),
    wobble,
    lastAngle: angle,
    lastX: point.x,
    lastY: point.y,
    closed:
      state.accumulatedAngle + magnitude * (180 / Math.PI) >= STEP_DEFINITIONS.water.targetArc,
  };
}

/**
 * 拉花（trace）的指针采样：算到引导轨迹的偏差，累积进度与抖动。
 * @param {object} state
 * @param {{x:number,y:number}} point 归一化坐标
 * @param {(x:number)=>number} guideY 给定 x 返回引导线 y
 * @param {number} width 装置宽度（px，用于把 x 映射成进度）
 */
export function sampleTrace(state, point, guideY) {
  const expected = guideY(point.x);
  const deviation = Math.abs(point.y - expected) * 100;
  const prevX = state.lastX ?? point.x;
  const advanced = Math.abs(point.x - prevX) * 100;
  // ⚠️ 系数 0.72 是按「x 走 0→1 ⇒ progress 72」算的，但 targetProgress 是 96
  // ⇒ 哪怕完美跟完全程也永远差24 点，只能判 fail（实测走完 progress=72）。
  // 改成 1.0 让「完整走完全程」= 100，判定余量由抖动与落点决定。
  const progress = Math.min(100, state.progress + advanced);
  // 抖动只累计「相对上一点的方向突变」，不能把沿引导线的正常纵向移动算成手抖
  //（引导线本身在x=0.5 附近有拐点，y 变化大 ⇒ 旧算法整条路径都算抖）。
  const jitter =
    state.lastX == null || state.lastY == null
      ? 0
      : Math.abs(point.y - state.lastY - (expected - state.lastExpectedY || 0)) * 100;
  const next = {
    ...state,
    progress,
    deviation: state.deviation + deviation * 0.34 + jitter * 0.4,
    trail: [...state.trail.slice(-15), { x: point.x * 100, y: point.y * 100 }],
    lastX: point.x,
    lastY: point.y,
    lastExpectedY: expected,
    // 收笔判定：玩家**跟完引导线后**实际落点与「引导线终点」的偏移。
    // ⚠️ 不能拿几何原点 (0.5,0.5) 当心形中心 —— 引导线终点在 x=1 处，
    // 与原点的横向距离恒为 50（归一化×100），而 centerTolerance 只有 14
    // ⇒ 完美跟完也必然判「没落在杯心」（实测 endOffset=50，判定 fair）。
    // 心形的收笔点就是引导线末点，所以偏移必须相对末点算。
    endOffset: point.x >= 0.9 ? Math.hypot(point.x - 1, point.y - guideY(1)) * 100 : null,
  };
  return next;
}

/**
 * 拉花引导线：一条心形参数曲线（viewBox 归一化 0..1）。
 *
 * ⚠️ 两个可达性约束（都来自「玩家能不能做到」，不是审美偏好）：
 *  1. **起笔与收笔都回到 (0.5, 0.5) 杯心** —— 因为「终点要收在杯心」是 centerTolerance
 *     的判定依据；轨迹若从别处收笔，玩家不可能同时满足「走完全程」和「终点在杯心」。
 *  2. **右段 (|t| > 0.72) 平滑回杯心** —— 让 x≥0.9 时引导线已回到 0.5，
 *     收笔偏移才可能落进 14 的容差内。
 */
/**
 * 拉花引导线：一条心形曲线（viewBox 归一化 0..1，x 是玩家横向位置）。
 *
 * 形状 = 两个鼓包（t=±0.5 最深）+ 中间凹谷（t=0）+ 两端回到杯心高度（t=±1），
 * 闭式连续可微。踩过的坑：
 *  - 早先拆成「鼓包段 + 右段收心」两段拼接，x=0.86 处导数不连续、跳变 0.12，
 *    玩家手指要急停一下才跟得上 ⇒ 完美轨迹反被判抖。现在一条公式到底。
 *  - 试过 `0.5 - depth*sqrt(1-t⁴)*|t|`，`|t|` 让 t=0 处导数不可导、整条心形退化成直线。
 */
export function latteGuideY(x) {
  const t = Math.max(-1, Math.min(1, (x - 0.5) * 2));
  const depth = 0.26;
  return 0.5 - depth * Math.sin(Math.PI * t) * (1 - 0.35 * Math.cos(Math.PI * t));
}
