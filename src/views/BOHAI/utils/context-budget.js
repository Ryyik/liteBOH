/**
 * context-budget.js — Token 预算监控（ContextManager）+ 子代理上下文构建
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 *
 * 依赖：`./tokens`（估算）、`./retrieval/budget`（历史消息预算）——
 * 后者也是本组必须在 retrieval 之后拆的原因。
 */
import { buildHistoryMessagesWithinBudget } from './retrieval/budget.js';
import { estimateTokens } from './tokens.js';

// ============================================================
// 优化 1: Token 预算监控 — ContextManager
// 跟踪每种上下文的 token 用量，超出时提供降级建议。
// ============================================================

export const CONTEXT_CATEGORIES = {
  SYSTEM_PROMPT: 'systemPrompt',
  HISTORY: 'history',
  EVIDENCE: 'evidence',
  RULES: 'rules',
  USER_INPUT: 'userInput',
  STRUCTURED_MEMORY: 'structuredMemory',
};

export const CONTEXT_BUDGET_DEFAULTS = {
  systemPrompt: { max: 4000, priority: 0 },
  history: { max: 10000, priority: 2 },
  evidence: { max: 5000, priority: 3 },
  rules: { max: 2000, priority: 1 },
  userInput: { max: 3000, priority: 0 },
  structuredMemory: { max: 800, priority: 1 },
};

export const createContextBudgetTracker = (budgets = {}) => {
  const merged = {};
  for (const [key, def] of Object.entries(CONTEXT_BUDGET_DEFAULTS)) {
    merged[key] = { ...def, ...(budgets[key] || {}) };
  }

  const usage = {};
  for (const key of Object.keys(merged)) {
    usage[key] = 0;
  }

  const addEstimate = (category, text) => {
    if (!usage.hasOwnProperty(category)) return;
    usage[category] += estimateTokens(String(text || ''));
  };

  const getUsage = () => {
    const totalUsed = Object.values(usage).reduce((a, b) => a + b, 0);
    const totalBudget = Object.values(merged).reduce((a, b) => a + b.max, 0);

    const byCategory = {};
    for (const [key, val] of Object.entries(usage)) {
      const budget = merged[key];
      byCategory[key] = {
        used: val,
        max: budget.max,
        percent: budget.max > 0 ? Math.min(100, (val / budget.max) * 100) : 0,
        priority: budget.priority,
      };
    }

    return {
      total: {
        used: totalUsed,
        max: totalBudget,
        percent: totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0,
      },
      byCategory,
      level:
        totalBudget > 0 && totalUsed / totalBudget >= 0.95
          ? 'full'
          : totalBudget > 0 && totalUsed / totalBudget >= 0.8
            ? 'high'
            : totalBudget > 0 && totalUsed / totalBudget >= 0.55
              ? 'mid'
              : 'low',
    };
  };

  const getDegradationPlan = () => {
    const state = getUsage();
    const drops = [];

    if (state.level === 'full' || state.level === 'high') {
      const sorted = Object.entries(state.byCategory)
        .filter(([_, v]) => v.percent > 50)
        .sort((a, b) => b[1].priority - a[1].priority);

      for (const [cat, info] of sorted) {
        if (info.percent > 80) {
          drops.push({ category: cat, action: 'truncate', target: Math.round(info.max * 0.5) });
        } else if (info.percent > 60) {
          drops.push({ category: cat, action: 'summarize', target: Math.round(info.max * 0.6) });
        }
      }
    }

    return { level: state.level, drops };
  };

  const reset = () => {
    for (const key of Object.keys(usage)) {
      usage[key] = 0;
    }
  };

  return { addEstimate, getUsage, getDegradationPlan, reset };
};

// ============================================================
// 优化 4: 子代理上下文构建
// 根据 agent 角色构建最小化的上下文
// ============================================================

export const AGENT_CONTEXT_BUDGETS = {
  orchestrator: { historyMax: 600 },
  retriever: { historyMax: 800 },
  memory: { historyMax: 400 },
  ops: { historyMax: 800 },
  synthesizer: { historyMax: 1200 },
  'chat-engine': { historyMax: 12000 },
};

export const buildAgentContext = (history = [], agentName = '', _query = '') => {
  const budget = AGENT_CONTEXT_BUDGETS[agentName] || AGENT_CONTEXT_BUDGETS['chat-engine'];
  const safeHistory = Array.isArray(history) ? history : [];

  if (agentName === 'orchestrator' || agentName === 'memory') {
    return { context: '', history: [] };
  }

  const recent = buildHistoryMessagesWithinBudget(safeHistory, {
    maxChars: budget.historyMax,
    maxMessages: agentName === 'chat-engine' ? 30 : 8,
    maxPerMessage: agentName === 'chat-engine' ? 2000 : 800,
  });

  return { context: '', history: recent };
};
