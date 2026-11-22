/**
 * boh-pet-bus —— BOHAI 忙闲状态 → 全局挂件「小方」（BohPetBlock）的状态总线。
 *
 * 2026-11-22 用户口径：小方挂在全站所有页面上，BOHAI 在哪忙、它就在哪演。
 *
 * 写入方（两个 AI 面，各写各的）：
 *   ① BohChatStream watch(activityStage) —— 全页 /ai-chat 的活动行阶段
 *   ② BohIslandAnswer watch(activityStage) —— App 级 BohIsland 回答面的阶段
 * 读取方：BohPetBlock → STAGE_STATE 映射 → 角色动效（sleeping 挂件自管，不经总线）。
 *
 * 多写方并存（/ai-chat keep-alive 与岛可能同时活）：最后写入生效 ——
 * busy 装饰是尽力而为的「全局氛围灯」，不是权威任务状态（权威状态在引擎里）。
 */

import { ref } from 'vue';

/** 当前阶段（boh-activity.js 的阶段名；'' = 闲置） */
export const petStage = ref('');
/** 最近一次写入方（'page' = 全页活动行；'island' = 岛回答面）——调试/归因用 */
export const petStageSource = ref('');

export const setPetStage = (stage, source = '') => {
  const next = String(stage || '');
  if (petStage.value === next && petStageSource.value === source) return;
  petStage.value = next;
  petStageSource.value = source;
};
