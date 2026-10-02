// BOH AI 任务级生成参数预设 —— temperature / max_tokens / top_p / penalty 字面量的唯一真源。
// 背景：21 处字面量曾散在 9 个文件（含 Orchestrator / Synthesizer 等集群核心），
// 调参要改 N 处且行为不可审计。`check:bohai-params` 门禁禁止在本文件之外内联这些字面量。
//
// 与 chat-engine-config.js 的 GENERATION_PROFILE_BY_MODE 的分工：
//   那张表按「对话模式」（fast / pro / plan…）取参，供主生成管线整段引用；
//   本表按「任务语义」取参，供一次性辅助生成调用点引用。两表互补，都不许有第二份拷贝。
// 改这里的值会直接改变对应任务的实际生成行为——改前想清楚，改后跑 verify + npm run probe:ai-panels。

export const TASK_GENERATION_PRESETS = {
  // agent-cluster 兜底对话（无主 ChatEngine 时走 callBohAIModel 直调）
  clusterChatFallback: { temperature: 0.22, maxTokens: 1400 },
  // 结构化输出（facts 300 + progress 400 + 标签开销；max_tokens 曾从 1100 提到 1400）
  structuredProgress: { max_tokens: 1400, temperature: 0.08, top_p: 0.55, frequency_penalty: 0.05 },
  // agent-cluster 主对话 Agent（走主 ChatEngine 真实调用链）
  clusterChatMain: { max_tokens: 1800, temperature: 0.22, top_p: 0.75 },
  // ⚠️ 已删除 `titleExtract`（2026-10-02）：它唯一的消费方是 useChatEngine 里那次
  // 「追问改写」LLM 调用，该调用已按 plans/024 §P0-2 移除（它排在检索之前、
  // 用推理模型跑 256 token，产出常被截断后静默丢弃）。需要新的短输出任务时，
  // 重新在此声明，不要在调用点内联字面量（check:bohai-params 会红）。
  // 论坛总结叙事（低温防编造；max_tokens 由 generationProfile 派生钳制，不在此表）
  forumNarrative: { temperature: 0.03, top_p: 0.42 },
  // 论坛总结极性冲突修复（全确定性）
  forumRepair: { temperature: 0, top_p: 0.35 },
  // Minecraft 资源搜索规划器（严格 JSON 输出）
  resourceDigest: { max_tokens: 520, temperature: 0.05, top_p: 0.45, frequency_penalty: 0.02 },
  // 随手记标题生成（80 token 硬上限，标题最长 18 汉字）
  quickTitle: { max_tokens: 80, temperature: 0.2, top_p: 0.8, frequency_penalty: 0.1 },
  // 引擎参数兜底（modeId 不在 GENERATION_PROFILE_BY_MODE 时使用）
  engineParamFallback: {
    temperature: 0.24,
    top_p: 0.76,
    frequency_penalty: 0.08,
    max_tokens: 1800,
  },
  // 操作草稿生成的 profile 缺省兜底（profile 缺字段时的 ?? 回落值）
  actionDraftFallback: {
    temperature: 0.22,
    top_p: 0.75,
    frequency_penalty: 0.08,
    max_tokens: 2048,
  },
  // OpsAgent 站内起草（发帖/网页 JSON）
  opsDraft: { temperature: 0.2, maxTokens: 1200 },
  // Orchestrator 任务规划（JSON 输出，低温）
  planner: { temperature: 0.12 },
  // Synthesizer 终稿合成
  synthesis: { temperature: 0.2 },
  // RetrieverAgent 证据摘要
  evidenceSummary: { temperature: 0.18, maxTokens: 500 },
};
