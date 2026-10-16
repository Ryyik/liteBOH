/**
 * retrieval-targets.ts — **检索目标标签**计算（plans/025 v2 · Step 5-2 第二刀）
 *
 * `sendMessage` 拿到知识检索结果后，要把「本轮检索了哪些源」拼成人话标签，塞进进度文案
 * （`正在检索 BOH Cloud+(3条)、AI公共记忆(2条)...`）。
 *
 * 这段是**纯计算**（只读检索结果，不碰响应式状态），所以能整块搬出来。
 *
 * ⚠️ 标签的**顺序 = 展示顺序**，不可调换。
 *
 * 2026-10-16：BOH Health 功能整体下线 —— 原先这里还顺带判定「本轮是否命中健康数据」
 * （`healthAnalysisActive`，供后续注入健康专用提示词附录），该职责已随功能一并删除。
 */

export interface RetrievalTargetsInput {
  /** 本轮检索计划（哪个源被启用） */
  retrievalPlan: Record<string, unknown> | null | undefined;
  /** BOH Cloud+ 命中条数 */
  treeholeTotal: number;
  /** AI 公共记忆命中条数 */
  sharedMemoryTotal: number;
  /** 用户私域标签（取前 3 个展示） */
  userPrivateLabels: unknown[] | null | undefined;
}

export interface RetrievalTargetsResult {
  /** 展示用标签列表（顺序 = 展示顺序） */
  targets: string[];
}

/**
 * 计算检索目标标签。
 *
 * 2026-10-16：BOH Health 功能整体下线，原先的 `healthAnalysisActive` 副作用返回值一并移除
 * （它只服务「健康数据命中时注入健康专用提示词附录」这一条链路）。
 */
export const computeRetrievalTargets = ({
  retrievalPlan,
  treeholeTotal,
  sharedMemoryTotal,
  userPrivateLabels,
}: RetrievalTargetsInput): RetrievalTargetsResult => {
  const plan = (retrievalPlan || {}) as Record<string, unknown>;
  const targets: string[] = [];

  if (plan.treehole) {
    targets.push(treeholeTotal > 0 ? `BOH Cloud+(${treeholeTotal}条)` : 'BOH Cloud+');
  }
  if (plan.sharedMemory && sharedMemoryTotal > 0) {
    targets.push(`AI公共记忆(${sharedMemoryTotal}条)`);
  }
  if (plan.memory) targets.push('记忆库');
  if (plan.siteGuide) targets.push('操作手册');
  if (plan.forum) targets.push('社区帖子');
  if (plan.userPrivate && Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0) {
    targets.push(...(userPrivateLabels.slice(0, 3) as string[]));
  }

  return { targets };
};
