/**
 * 步骤机制定义 —— 云上咖啡店
 *
 * plans/026 P0-2 的核心：原来 11 个步骤全部退化成「进度条涨进金色区」同一条规则，
 * 这里给每类步骤一个**不同的核心动作**，让玩家在每一步都判断不同的东西。
 *
 * 八类机制（原来只有 hold/toggle/gesture/tap 四种，且 gesture 里 water 出现 3 次）：
 *   oscillate 研磨    —— 转速随按住时长上升，过热回落，需在目标区**稳定保持**
 *   staged    萃取    —— 分三段，中段必须点一次排气阀（漏点扣品质）
 *   swirl     注水    —— 追踪指针轨迹，需绕杯心画弧闭合（角度累积）
 *   texture   奶泡    —— 进气量随时间涨，太早/太晚都扣品质（时机取舍）
 *   layer     生椰/气泡—— 液面必须**高于**已有液面，同层则分层失败
 *   timed     冰块    —— 冰化倒计时，必须抢在化完前完成
 *   sequenced 糖浆/果汁/可可 —— 有先后顺序（如焦糖必须在可可之后）
 *   trace     拉花    —— 跟随引导心形轨迹，抖动与终点落点双判
 *
 * 判据：本文件**无 Vue 依赖**，可直接被 vitest 引用（plans/026 §3 步3的验收要求）。
 */

/** 判定档位 —— plans/026 P0-3：原来只有完美/偏差/失败三档，偏差只扣 8 点耐心 */
export const GRADES = {
  perfect: {
    id: 'perfect',
    label: '完美',
    quality: 100,
    comboDelta: 1,
    comboMultiplier: 2,
    patiencePenalty: 0,
  },
  good: {
    id: 'good',
    label: '很好',
    quality: 88,
    comboDelta: 1,
    comboMultiplier: 1,
    patiencePenalty: 0,
  },
  fair: {
    id: 'fair',
    label: '尚可',
    quality: 70,
    comboDelta: 0,
    comboMultiplier: 0,
    patiencePenalty: 6,
  },
  fail: {
    id: 'fail',
    label: '失误',
    quality: 0,
    comboDelta: 0,
    comboMultiplier: 0,
    patiencePenalty: 15,
  },
};

/** 超时/失误的耐心惩罚（P0-3：Fail 从「重做 3s」提到「连击清零 + 耐心 -15」） */
export const FAIL_PATIENCE_PENALTY = GRADES.fail.patiencePenalty;

/** 金区宽度（百分点）。P0-3 要求「金区可见且可学习」，所以这是玩家能预先看到的数 */
export const PERFECT_BAND_RATIO = 0.3;

/**
 * 目标区随难度收窄，但**必须给出一段下限**。
 * 原实现 shrink 上限 5（即每侧 -10，总宽 16 → 6），会被磨豆机满级 bonus(+8.4) 反超，
 * 导致「越熟练越难但升级能把难度买回来」。这里收窄封顶 3.5，且收窄对所有步骤一致。
 */
export const DIFFICULTY_SHRINK_CAP = 3.5;

/**
 * @param {number} served 已出杯数
 * @param {[number, number]} base 步骤基础目标区
 * @param {number} upgradeBonus 升级带来的加宽（每侧）
 * @returns {[number, number]} 实际目标区
 */
export function resolveTargetWindow(served, base, upgradeBonus = 0) {
  const [start, end] = base;
  const shrink = Math.min(DIFFICULTY_SHRINK_CAP, served * 0.35);
  return [Math.max(4, start + shrink - upgradeBonus), Math.min(96, end - shrink + upgradeBonus)];
}

/**
 * 把一个落点换算成档位。
 * @param {number} value 当前值
 * @param {[number, number]} window 目标区
 * @returns {{ grade: string, quality: number }}
 */
export function gradeByWindow(value, window) {
  const [start, end] = window;
  if (value >= start && value <= end) {
    const center = (start + end) / 2;
    const half = Math.max(0.5, (end - start) / 2);
    // 落在金区内侧 30% ⇒ perfect，向外线性衰减到 good(88)
    const ratio = Math.abs(value - center) / Math.max(0.001, half);
    const quality = Math.round(
      GRADES.perfect.quality -
        (ratio / PERFECT_BAND_RATIO) * (GRADES.perfect.quality - GRADES.good.quality),
    );
    return {
      grade: ratio <= PERFECT_BAND_RATIO ? 'perfect' : 'good',
      quality: Math.max(GRADES.good.quality, quality),
    };
  }
  const distance = value < start ? start - value : value - end;
  if (distance <= 8) {
    return { grade: 'fair', quality: Math.max(40, Math.round(GRADES.fair.quality - distance * 2)) };
  }
  return { grade: 'fail', quality: 0 };
}

/**
 * 八类机制的定义表。
 *
 * `kind`决定用哪个 handler；`target` 是机制自己的目标区（不再是万用的进度条）；
 * `instruction` 是给玩家看的操作提示（P0-2 要求每步都能学会）。
 */
export const STEP_DEFINITIONS = {
  grind: {
    id: 'grind',
    kind: 'oscillate',
    name: '研磨咖啡豆',
    short: '研磨',
    icon: 'Coffee',
    visual: 'grind',
    action: '按住研磨',
    instruction: '按住越久转速越高，太热会回落 —— 在目标区稳住一秒',
    target: [40, 92],
    // ⚠️ 两个参数是一对，改一个必须重算另一个（不变式由 cafe-steps.test.js 断言）：
    //   ① 窗口穿越时间 (target宽 / riseRate) 必须 ≥ holdRequired × 1.6，
    //      否则玩家物理上不可能在窗口里停够时间。旧配置 32 点 ÷ 46/s = 0.70s穿越
    //      而 holdRequired=1.0s ⇒ 转速在 62↔100 永久振荡、stable 永假。
    //   ② 从 0 撞到 100 也不宜太慢（>5s 玩家会觉得没在动）⇒ rise ≥ 24。
    //  当前 52 点 ÷ 28/s = 1.86s穿越（> 1.6s ✓），0→100 用 3.6s（✓）。
    riseRate: 28,
    fallRate: 21,
    holdRequired: 1.0,
    upgradeKey: 'grinder',
  },
  extract: {
    id: 'extract',
    kind: 'staged',
    name: '萃取浓缩',
    short: '萃取',
    icon: 'Gauge',
    visual: 'extract',
    action: '开始萃取',
    instruction: '前段稳定萃取，中段点一次排气阀排气，后段收尾',
    target: [62, 94],
    // ⚠️ ventWindow 必须**完全落在金区之前**。
    // 首版取 [34, 62] 而金区是 [58, 88]，两者只重叠 4 点（58~62）：
    // 玩家在 stage1（34~62）里排气时停下只能拿 fair，而一旦 value 过 62 就判漏排
    // ⇒ 「排气」与「拿 perfect」在时间上互斥（端到端探针 6b 实测排气阀几乎抓不到）。
    // 现在排气窗 [28, 56]、金区 [62, 94] 完全分离：
    // 先在 28~56 之间排气（不受金区影响），推进到 62~94 收尾 ⇒ perfect 可达。
    ventWindow: [28, 56],
    ventRequired: true,
    ventPenalty: 14,
    upgradeKey: 'machine',
  },
  water: {
    id: 'water',
    kind: 'swirl',
    name: '注入热水',
    short: '热水',
    icon: 'Droplets',
    visual: 'water',
    action: '按住注水',
    instruction: '绕着杯心画弧，水线要连成完整的一圈',
    targetArc: 300,
    wobbleTolerance: 26,
    upgradeKey: null,
  },
  steam: {
    id: 'steam',
    kind: 'texture',
    name: '蒸汽打奶泡',
    short: '奶泡',
    icon: 'Milk',
    visual: 'steam',
    action: '注入蒸汽',
    instruction: '进气量一直在涨 —— 太粗或没气泡都不算好奶泡',
    target: [46, 74],
    earlyBelow: 46,
    lateAbove: 74,
    upgradeKey: 'steam',
  },
  syrup: {
    id: 'syrup',
    kind: 'sequenced',
    name: '加入焦糖糖浆',
    short: '焦糖',
    icon: 'Sparkles',
    visual: 'dose',
    action: '按压焦糖泵',
    instruction: '分两次泵入，间隔太短会混在一起',
    targetCount: 2,
    minGapMs: 380,
    color: '#b85b3f',
    jarLabel: '焦糖',
    upgradeKey: null,
  },
  ice: {
    id: 'ice',
    kind: 'timed',
    name: '加入冰块',
    short: '冰块',
    icon: 'Droplets',
    visual: 'dose',
    action: '加入一块冰',
    instruction: '冰块会化 —— 倒计时归零前必须完成这一杯',
    targetCount: 3,
    meltMs: 8200,
    color: '#8fcbd7',
    jarLabel: 'ICE',
    upgradeKey: null,
  },
  fruit: {
    id: 'fruit',
    kind: 'sequenced',
    name: '压入鲜果汁',
    short: '果汁',
    icon: 'Sparkles',
    visual: 'dose',
    action: '按压果汁泵',
    instruction: '分两次压入，间隔太短会混在一起',
    targetCount: 2,
    minGapMs: 380,
    color: '#df744a',
    jarLabel: '鲜果',
    upgradeKey: null,
  },
  cocoa: {
    id: 'cocoa',
    kind: 'sequenced',
    name: '加入可可',
    short: '可可',
    icon: 'Coffee',
    visual: 'dose',
    action: '加入一勺可可',
    instruction: '分两勺加入，间隔太短会结块',
    targetCount: 2,
    minGapMs: 380,
    color: '#6f4129',
    jarLabel: '可可',
    upgradeKey: null,
  },
  coconut: {
    id: 'coconut',
    kind: 'layer',
    name: '倒入生椰乳',
    short: '生椰',
    icon: 'Milk',
    visual: 'layer',
    action: '按住倒生椰',
    instruction: '液面必须高于杯里已有的那一层，否则会串层',
    target: [40, 92],
    layeringOrder: ['cocoa', 'syrup', 'coconut'],
    upgradeKey: null,
  },
  sparkling: {
    id: 'sparkling',
    kind: 'layer',
    name: '注入气泡水',
    short: '气泡',
    icon: 'Droplets',
    visual: 'layer',
    action: '按住倒气泡水',
    instruction: '液面必须高于杯里已有的那一层，否则会串层',
    target: [40, 92],
    layeringOrder: ['fruit', 'sparkling'],
    upgradeKey: null,
  },
  pour: {
    id: 'pour',
    kind: 'trace',
    name: '融合与拉花',
    short: '融合',
    icon: 'Milk',
    visual: 'pour',
    action: '按住淋杯',
    instruction: '跟着引导线走完一个心形，终点要落在杯心',
    targetProgress: 96,
    wobblePenalty: 22,
    centerTolerance: 14,
    upgradeKey: null,
  },
};

/**
 * 饮品配方。`steps` 仍是步骤 id 序列，但**顺序本身现在有意义了**：
 * layer/sequenced 类步骤会检查同一杯里其它层是否已经就位。
 */
export const DRINKS = [
  {
    id: 'americano',
    name: '云上美式',
    price: 22,
    steps: ['grind', 'extract', 'water'],
    color: '#7b4a2d',
  },
  {
    id: 'latte',
    name: '经典拿铁',
    price: 30,
    steps: ['grind', 'extract', 'steam', 'pour'],
    color: '#d7aa70',
  },
  {
    id: 'coconut-americano',
    name: '生椰美式',
    price: 32,
    steps: ['grind', 'extract', 'ice', 'coconut'],
    color: '#e5d6b4',
  },
  {
    id: 'orange-americano',
    name: '橙香美式',
    price: 34,
    steps: ['grind', 'extract', 'ice', 'fruit'],
    color: '#df7745',
  },
  {
    id: 'grape-sparkling',
    name: '葡萄气泡果咖',
    price: 36,
    steps: ['ice', 'fruit', 'sparkling', 'extract'],
    color: '#8b6ca8',
  },
  {
    id: 'caramel-macchiato',
    name: '焦糖玛奇朵',
    price: 36,
    steps: ['grind', 'extract', 'steam', 'syrup', 'pour'],
    color: '#bc784c',
  },
  {
    id: 'mocha',
    name: '黑森林摩卡',
    price: 36,
    steps: ['grind', 'extract', 'cocoa', 'steam', 'pour'],
    color: '#603725',
  },
  {
    id: 'anniversary',
    name: '八周年特调',
    price: 42,
    steps: ['grind', 'extract', 'cocoa', 'steam', 'fruit', 'syrup', 'pour'],
    color: '#d96752',
  },
];

export const MAX_CONCURRENT_ORDERS = 3;
export const ROUND_SECONDS = 150;
