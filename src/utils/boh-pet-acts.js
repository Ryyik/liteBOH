/**
 * boh-pet-acts —— 小方「自主动作」的调度真源（2026-11-22）。
 *
 * 设计（waifu-tips 模式的扩展版）：
 *   · 动作池配置化：每个动作 = 触发条件/权重/冷却/时长 —— 加彩蛋改配置，不改代码
 *   · 调度器是**纯函数** pickPetAct：给（心情/输入焦点/可见性/忙碌/reduce/上次动作）
 *     返回「下一个该演的动作」或 null —— BohPetBlock 只负责执行
 *
 * 护栏（用户口径「宠物不变成骚扰」）：
 *   · ACT_MIN_GAP_MS：任意两个自主动作最小间隔 20s
 *   · typing/hidden/busy/reduced 任一为真 ⇒ 恒 null（输入框聚焦时全部静默）
 *   · cooldown 按动作 id 记（同一动作不连演）
 */

export const DIRECTOR_TICK_MS = 9000; // 导演醒来间隔（ms）
export const ACT_MIN_GAP_MS = 20000; // 任意两个自主动作的最小间隔

export const PET_ACTS = [
  /* 打盹小剧场：waiting → sleeping → 伸懒腰（伸展/抖动由挂件按 id 演 CSS） */
  { id: 'doze', dur: 3400, cooldown: 45000, weight: (mood) => (mood < 45 ? 3 : 1) },
  /* 原地蹦跳：心情好时多跳（落地爆粒） */
  { id: 'hop', dur: 900, cooldown: 45000, weight: (mood) => (mood >= 60 ? 2.5 : 1) },
  /* 好奇张望：眼睛/身体往贴边方向瞟一下 */
  { id: 'look', dur: 1200, cooldown: 60000, weight: () => 1 },
];

/**
 * 纯函数调度：返回下一个动作（PET_ACTS 成员）或 null（本轮不演）。
 * @param {{
 *   mood?: number,       // 0~100 心情（高 = 多活泼动作）
 *   typing?: boolean,    // 用户输入框聚焦中（真 ⇒ 恒不演）
 *   hidden?: boolean,    // 页面隐藏（真 ⇒ 恒不演）
 *   busy?: boolean,      // BOHAI 忙（真 ⇒ 恒不演，状态让位给阶段动效）
 *   reduced?: boolean,   // reduce-motion（真 ⇒ 恒不演）
 *   now?: number,
 *   lastActId?: string | null,
 *   lastActAt?: number,
 *   acts?: Array,
 * }} args
 */
export function pickPetAct({
  mood = 60,
  typing = false,
  hidden = false,
  busy = false,
  reduced = false,
  now = Date.now(),
  lastActId = null,
  lastActAt = 0,
  acts = PET_ACTS,
} = {}) {
  if (typing || hidden || busy || reduced) return null;
  if (now - lastActAt < ACT_MIN_GAP_MS) return null;
  /* 冷却按「上次演的那个动作自己的 cooldown」判断；其余动作只受 ACT_MIN_GAP 管束 */
  const pool = acts.filter((a) => !(a.id === lastActId && now - lastActAt < a.cooldown));
  if (!pool.length) return null;
  const total = pool.reduce((s, a) => s + Math.max(0, a.weight(mood)), 0);
  if (!(total > 0)) return null;
  let roll = Math.random() * total;
  for (const a of pool) {
    roll -= Math.max(0, a.weight(mood));
    if (roll <= 0) return a;
  }
  return pool[pool.length - 1];
}
