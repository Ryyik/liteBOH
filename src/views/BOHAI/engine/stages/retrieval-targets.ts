/**
 * retrieval-targets.ts — **检索目标标签**计算（plans/025 v2 · Step 5-2 第二刀）
 *
 * `sendMessage` 拿到知识检索结果后，要把「本轮检索了哪些源」拼成人话标签，塞进进度文案
 * （`正在检索 BOH Cloud+(3条)、AI公共记忆(2条)...`）。同时它顺带判定本轮是否命中
 * BOH Health 本机数据 —— 那个开关会决定后面要不要注入健康分析附录。
 *
 * 这段是**纯计算**（只读检索结果，不碰响应式状态），所以能整块搬出来。
 *
 * ⚠️ 标签的**顺序 = 展示顺序**，不可调换；`BOH Health` 必须最后（它是「补充数据」）。
 */
import { BOHAI_CONNECTOR_IDS } from '@/utils/bohai-connectors.js';

/** 一个成功的连接器结果（`buildAutoKnowledgeContext` 产出）。 */
export interface ConnectorResultLike {
  connectorId?: string;
  ok?: boolean;
  total?: number;
}

export interface RetrievalTargetsInput {
  /** 本轮检索计划（哪个源被启用） */
  retrievalPlan: Record<string, unknown> | null | undefined;
  /** BOH Cloud+ 命中条数 */
  treeholeTotal: number;
  /** AI 公共记忆命中条数 */
  sharedMemoryTotal: number;
  /** 用户私域标签（取前 3 个展示） */
  userPrivateLabels: unknown[] | null | undefined;
  /** 已成功的连接器结果（已 filter `ok`） */
  successfulConnectorResults: ConnectorResultLike[];
}

export interface RetrievalTargetsResult {
  /** 展示用标签列表（顺序 = 展示顺序） */
  targets: string[];
  /** 本轮是否命中 BOH Health 本机健康数据 */
  healthAnalysisActive: boolean;
}

/**
 * 计算检索目标标签 + 健康分析开关。
 *
 * 原先这段在 `sendMessage` 里顺带把 `healthAnalysisActive` 置 true（副作用写外层 `let`），
 * 现在改为**返回值**，由壳显式赋值 —— 计算与状态变更分离。
 */
export const computeRetrievalTargets = ({
  retrievalPlan,
  treeholeTotal,
  sharedMemoryTotal,
  userPrivateLabels,
  successfulConnectorResults,
}: RetrievalTargetsInput): RetrievalTargetsResult => {
  const plan = (retrievalPlan || {}) as Record<string, unknown>;
  const targets: string[] = [];
  let healthAnalysisActive = false;

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
  if (plan.health) {
    const healthResult = successfulConnectorResults.find(
      (item) => item?.connectorId === BOHAI_CONNECTOR_IDS.health,
    );
    if (healthResult && Number(healthResult.total || 0) > 0) {
      healthAnalysisActive = true;
      targets.push(`BOH Health(${healthResult.total}组)`);
    }
  }

  return { targets, healthAnalysisActive };
};
