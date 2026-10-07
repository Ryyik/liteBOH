/**
 * types.ts — BOHAI Tool Registry 的**类型真源**（plans/025 v2 · Step 4）
 *
 * 工具 = 声明式能力描述：`id / label / category / surfaces / trigger / run / 权限 / 产出形态`。
 * 见 `docs/2026-10-05-BOHAI-Chat与Work双形态重构方案.md` §5.1。
 */

/** 工具类别 —— 决定它属于哪种能力，以及被哪个形态（surface）使用。 */
export type BohToolCategory = 'retrieval' | 'web' | 'generator' | 'action';

/** 产品形态 —— 大模式（Chat / Work）。 */
export type BohSurface = 'chat' | 'work';

/** 工具产出形态：`context` 喂模型；`artifact` 给用户下载。 */
export type BohToolOutput = 'context' | 'artifact';

/** 工具运行结果（最小契约；具体 data 由各工具自定）。 */
export interface BohToolResult {
  ok: boolean;
  /** 归一后的上下文文本（`output: 'context'` 时必填） */
  context?: string;
  /** 结构化结果（供 describeAction / 调试） */
  data?: unknown;
  /** 产出的证据引用编号，如 `[T1]` / `[W1]` */
  evidenceRefs?: string[];
  /** 错误信息（`ok: false` 时） */
  message?: string;
}

/** 工具的声明式描述。 */
export interface BohTool {
  id: string;
  label: string;
  category: BohToolCategory;
  /** 形态归属 —— 「形态 = 工具子集」的落点 */
  surfaces: BohSurface[];
  /** 是否需要登录 */
  requiresLogin?: boolean;
  /** 最低档位（`guest` 起） */
  minTier?: string;
  /** 配额倍率 */
  quotaMultiplier?: number;
  output: BohToolOutput;
  run: (params: Record<string, unknown>, ctx: unknown) => Promise<BohToolResult>;
}

/**
 * 读连接器工厂的公共入参：`read` 由调用方注入（连接器本身不持有状态）。
 * 见 `tools/retrieval/*.ts`。
 */
export interface RetrievalConnectorDeps {
  read: (queryText: string) => Promise<unknown>;
}
