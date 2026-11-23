/**
 * boh-pet-lines.js —— 小方「台词」的数据与选句真源（2026-11-23）
 *
 * 设计口径（与 boh-pet-acts.js 同构：数据配置化 + 调度是纯函数）：
 *   每条台词 = { id, scene, text, weight, cooldown, mood?, hours? }
 *   调度的唯一入口是 pickPetLine：给（场景 / 心情 / 当前时段 / 最近说过什么）
 *   返回「这一句」或 null。组件只负责显示，不参与挑句。
 *
 * ⚠️ 一条硬边界（用户 2026-11-23 定稿「更新不弹窗、也不做通知」的直接推论）：
 *   **小方的台词绝不播报系统消息。**
 *   不许写「有新版本」「网络异常」「上传失败」这类。一旦它开始转述系统状态，
 *   它就退化成了一个带脸的弹窗 —— 那是这一轮刚删掉的东西。
 *   台词只允许来自「它自己想说」：见面打招呼、看你待太久了、深夜了、刚才那件事
 *   做得不错。换句话说，**主语始终是它，不是系统**。
 *
 * 另一条边界（「宠物不变成骚扰」，与 acts 同一套价值观）：
 *   · 同一句在 cooldown 内不重复；
 *   · 同一场景短时间内只说一次（sceneCooldown）；
 *   · 用户正在输入 / 隐藏 / 忙 / reduce-motion ⇒ 恒不出声（由组件侧挡，这里也再挡一遍）。
 */

/** 台词表。`text` 请保持短句：气泡宽度有限，超过 ~24 个汉字会换行到第三行。 */
export const PET_LINES = [
  /* ── 见面 / 回到站点 ── */
  { id: 'hi-first', scene: 'hello', text: '又见面了。', weight: 2, cooldown: 30 * 60 * 1000 },
  { id: 'hi-casual', scene: 'hello', text: '我在。', weight: 3, cooldown: 20 * 60 * 1000 },
  {
    id: 'hi-night',
    scene: 'hello',
    text: '这么晚还来。',
    weight: 2,
    cooldown: 60 * 60 * 1000,
    hours: [0, 1, 2, 3, 4],
  },

  /* ── 待久了（它在关心，不是在监督） ── */
  {
    id: 'stay-long',
    scene: 'stay',
    text: '坐挺久了，起来走两步？',
    weight: 1,
    cooldown: 45 * 60 * 1000,
  },
  {
    id: 'stay-deep',
    scene: 'stay',
    text: '眼睛要不要歇一下。',
    weight: 1,
    cooldown: 90 * 60 * 1000,
    hours: [0, 1, 2, 3, 4, 5],
  },

  /* ── 它自己的小情绪 / 无聊 ── */
  { id: 'bore-1', scene: 'idle', text: '……', weight: 1, cooldown: 25 * 60 * 1000 },
  {
    id: 'bore-2',
    scene: 'idle',
    text: '有点无聊。',
    weight: 1,
    cooldown: 40 * 60 * 1000,
    mood: { max: 40 },
  },
  { id: 'bore-3', scene: 'idle', text: '你忙你的。', weight: 1, cooldown: 50 * 60 * 1000 },

  /* ── 被摸 / 被拖（对交互本身的反应） ── */
  /* ⚠️ 这两组标了 `interactive: true`：它们是对**用户当场动作**的回应，
     不该被「任意两句之间 25s」那条全局间隔挡住（否则刚进站打过招呼，
     用户第一次摸它就完全没反应 —— 那看起来像坏了）。
     交互型台词只受它自己的 cooldown 管束。 */
  { id: 'pet-1', scene: 'petted', text: '嗯。', weight: 3, cooldown: 60 * 1000, interactive: true },
  {
    id: 'pet-2',
    scene: 'petted',
    text: '这里。',
    weight: 2,
    cooldown: 90 * 1000,
    interactive: true,
  },
  {
    id: 'drag-1',
    scene: 'dragged',
    text: '放我下来。',
    weight: 1,
    cooldown: 5 * 60 * 1000,
    interactive: true,
  },

  /* ── 睡醒 ── */
  { id: 'wake-1', scene: 'wake', text: '……醒了。', weight: 2, cooldown: 10 * 60 * 1000 },

  /* ── 心情好的时候（博莱克刚干完活那阵） ── */
  { id: 'good-1', scene: 'cheer', text: '弄好了。', weight: 2, cooldown: 3 * 60 * 1000 },
  {
    id: 'good-2',
    scene: 'cheer',
    text: '还行吧。',
    weight: 1,
    cooldown: 8 * 60 * 1000,
    mood: { min: 70 },
  },
];

/** 气泡停留时长（ms）：字数越少越短，避免「一个字挂五秒」。 */
export const LINE_DURATION_MIN = 2600;
export const LINE_DURATION_MAX = 4600;

/** 任意两句之间的最小间隔：防止连珠炮。 */
export const LINE_MIN_GAP_MS = 25 * 1000;
/** 同一场景的最小间隔：同一类话不连着说。 */
export const SCENE_MIN_GAP_MS = 3 * 60 * 1000;

/** 按字数算显示时长。 */
export const lineDuration = (text) => {
  const n = String(text || '').length;
  // 6 字以内按最小值，之后每字 +120ms，封顶最大值
  return Math.min(LINE_DURATION_MAX, LINE_DURATION_MIN + Math.max(0, n - 6) * 120);
};

/**
 * 挑一句台词。纯函数，可测。
 *
 * @param {{
 *   scene?: string,          // 想要的场景；'' / 未知 ⇒ 返回 null（不要随机兜底，那会造成"哪都在说话"）
 *   mood?: number,           // 0~100
 *   hour?: number,           // 0~23，用于 hours 过滤
 *   typing?: boolean,        // 用户正在输入 ⇒ 恒不出声
 *   hidden?: boolean,        // 页面隐藏 ⇒ 恒不出声
 *   busy?: boolean,          // 博莱克忙 ⇒ 让位给状态动效
 *   reduced?: boolean,       // reduce-motion ⇒ 恒不出声
 *   now?: number,
 *   lastLineAt?: number,     // 上次说话的绝对时间
 *   lastSceneAt?: number,    // 上次说这个场景的绝对时间
 *   lastLineId?: string,
 *   lines?: Array,
 * }} args
 * @returns {{id: string, scene: string, text: string, duration: number}|null}
 */
export function pickPetLine({
  scene = '',
  mood = 60,
  hour = new Date().getHours(),
  typing = false,
  hidden = false,
  busy = false,
  reduced = false,
  now = Date.now(),
  lastLineAt = 0,
  lastSceneAt = 0,
  lastLineId = null,
  lines = PET_LINES,
} = {}) {
  if (!scene) return null;
  if (typing || hidden || busy || reduced) return null;

  /* 交互型场景（被摸 / 被拖）：绕开全局间隔与场景间隔。
     理由：那两句是对**用户当场动作**的回应，用户刚摸完就等 25s 才有反应 = 看起来坏了。
     它们只受自己的 cooldown 管束（见 PET_LINES 里的 interactive 标记）。
     场景列表由台词表反推，不在函数里硬编码场景名 —— 加新场景时不用改这里。 */
  const isInteractiveScene = lines.some((l) => l.scene === scene && l.interactive);

  if (!isInteractiveScene) {
    // 任意两句之间留够间隔（防连珠炮）
    if (now - lastLineAt < LINE_MIN_GAP_MS) return null;
    // 同一场景不连说
    if (now - lastSceneAt < SCENE_MIN_GAP_MS) return null;
  }

  const pool = lines.filter((line) => {
    if (line.scene !== scene) return false;
    // 同一句在它自己的冷却期内不重复
    if (line.id === lastLineId && now - lastLineAt < (line.cooldown || 0)) return false;
    // 时段限定（深夜台词白天不说）
    if (Array.isArray(line.hours) && !line.hours.includes(hour)) return false;
    // 心情区间
    if (line.mood) {
      if (Number.isFinite(line.mood.min) && mood < line.mood.min) return false;
      if (Number.isFinite(line.mood.max) && mood > line.mood.max) return false;
    }
    return true;
  });
  if (!pool.length) return null;

  const total = pool.reduce((sum, line) => sum + Math.max(0, line.weight || 1), 0);
  if (!(total > 0)) return null;

  let roll = Math.random() * total;
  for (const line of pool) {
    roll -= Math.max(0, line.weight || 1);
    if (roll <= 0) {
      return { id: line.id, scene: line.scene, text: line.text, duration: lineDuration(line.text) };
    }
  }
  const fallback = pool[pool.length - 1];
  return {
    id: fallback.id,
    scene: fallback.scene,
    text: fallback.text,
    duration: lineDuration(fallback.text),
  };
}
