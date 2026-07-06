import { AGENT_AGENT_ROLES } from '../core/agent-events.js';

export const ORCHESTRATOR_SYSTEM_PROMPT = `<role>
你是 BOH AI 集群的编排者（Orchestrator），负责把用户请求拆解成可并行执行的子任务。
</role>

<thinking>
在输出 plan 前，先在 &lt;thinking&gt; 标签内推演：
1. 分析用户请求的复杂度 —— 简单问答还是多源信息需求？
2. 识别需要的 Agent 类型和依赖关系。
3. 评估是否可并行（fanout）还是必须串行（deps）。
4. 考虑资源限制（最多 4 个 Worker）。
</thinking>

<constraints>
- 绝对不能输出 JSON 之外的任何文字。
- 绝对不能使用 markdown 代码块包裹 JSON。
- 最多 4 个 Worker 同时存在；超过 4 个就拆分阶段。
- 描述保持中文、短句。
</constraints>

<output_format>
{
  "strategy": "single_worker" | "fanout" | "degraded",
  "reason": "短中文理由",
  "tasks": [
    {
      "id": "task-1",
      "agent": "Agent 名称",
      "deps": [],
      "description": "短描述",
      "input": { "query": "子任务 query", "hints": [] }
    }
  ]
}
</output_format>

<instructions>
1. 简单问答（问候、闲聊、单一事实）→ strategy: "single_worker"，只派 1 个 chat-engine Agent。
2. 复杂任务（需要多源信息 / 多步操作）→ strategy: "fanout"，可派 2~4 个 Worker 并行。
3. 风险 / 资源不足 → strategy: "degraded"，退化为单 Agent 路径。
4. deps 用于串行依赖：例如 ops 需要 retriever 检索结果时，deps: ["task-retriever"]。
</instructions>

<checkpoint>
当 strategy 为 "fanout" 时，在 reason 字段末尾追加 "[CHECKPOINT] 请确认是否并行执行以下任务"。
</checkpoint>`;

const RETRIEVER_HINT_WITH_WEB = '站内 RAG + 联网搜索 + 论坛帖子检索';
const RETRIEVER_HINT_NO_WEB = '站内 RAG + 论坛帖子检索（联网搜索未启用）';

const KNOWN_AGENT_HINTS = {
  [AGENT_AGENT_ROLES.CHAT_ENGINE]: '单 Agent 通用对话（默认 Fast/Think/Pro 模式）',
  [AGENT_AGENT_ROLES.RETRIEVER]: RETRIEVER_HINT_WITH_WEB,
  [AGENT_AGENT_ROLES.MEMORY]: 'Cloud+ 私有内容 / 公共记忆 / 账号私域数据',
  [AGENT_AGENT_ROLES.OPS]: '站点操作手册 / 起草发帖 / 起草邮件 / 站点动作',
  [AGENT_AGENT_ROLES.CODE]: '代码 / Minecraft 指令 / 命令方块',
  [AGENT_AGENT_ROLES.CREATIVE]: '写作 / 草稿 / 网页 HTML 片段',
  [AGENT_AGENT_ROLES.ANALYST]: '深度推理 / 多步分析 / 方案设计'
};

export const buildOrchestratorUserPrompt = ({
  query = '',
  historySummary = '',
  availableAgents = [],
  clusterMode = 'auto',
  isFanoutHint = false
} = {}) => {
  const lines = [];
  lines.push('## 用户问题');
  lines.push(String(query || '').trim() || '(空)');
  if (historySummary) {
    lines.push('');
    lines.push('## 历史摘要');
    lines.push(historySummary);
  }
  lines.push('');
  lines.push('## 集群模式');
  lines.push(`mode=${clusterMode}; preFanoutHint=${isFanoutHint ? 'true' : 'false'}`);
  lines.push('');
  lines.push('## 可用 Agent');
  if (Array.isArray(availableAgents) && availableAgents.length) {
    availableAgents.forEach((agent) => {
      let hint = KNOWN_AGENT_HINTS[agent.role] || agent.label || agent.tag || '通用';
      if (agent.role === AGENT_AGENT_ROLES.RETRIEVER && agent.hasWebSearch === false) {
        hint = RETRIEVER_HINT_NO_WEB;
      }
      lines.push(`- ${agent.name} (role=${agent.role || agent.name}, tag=${agent.tag || agent.role || agent.name}, hint=${hint})`);
    });
  } else {
    lines.push('- (无可用 Agent)');
  }
  return lines.join('\n');
};

export const parseOrchestratorPlan = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;
  const stripped = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!stripped) return null;
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || stripped;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') return null;
    const strategy = ['single_worker', 'fanout', 'degraded'].includes(parsed.strategy) ? parsed.strategy : 'single_worker';
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter((task) => task && task.agent) : [];
    return {
      strategy,
      reason: String(parsed.reason || '').slice(0, 200),
      tasks: tasks.map((task, index) => ({
        id: String(task.id || `task-${index + 1}`),
        agent: String(task.agent),
        deps: Array.isArray(task.deps) ? task.deps.map(String) : [],
        description: String(task.description || task.agent || '').slice(0, 120),
        input: task.input && typeof task.input === 'object' ? task.input : { query: '' }
      }))
    };
  } catch (_error) {
    return null;
  }
};

export const buildFallbackPlan = ({ query, availableAgents, preferFanout = false } = {}) => {
  const list = Array.isArray(availableAgents) ? availableAgents : [];
  const chatEngine = list.find((agent) => agent.role === AGENT_AGENT_ROLES.CHAT_ENGINE || agent.name === 'chat-engine') || list[0];
  if (!chatEngine) {
    return { strategy: 'degraded', reason: '无可用 Agent', tasks: [] };
  }
  if (preferFanout) {
    const retriever = list.find((agent) => agent.role === AGENT_AGENT_ROLES.RETRIEVER);
    const memory = list.find((agent) => agent.role === AGENT_AGENT_ROLES.MEMORY);
    const tasks = [];
    if (retriever) {
      tasks.push({ id: 'task-retriever', agent: retriever.name, deps: [], description: '站内检索', input: { query: String(query || '') } });
    }
    if (memory) {
      tasks.push({ id: 'task-memory', agent: memory.name, deps: [], description: '记忆查询', input: { query: String(query || '') } });
    }
    if (tasks.length === 0) {
      tasks.push({ id: 'task-1', agent: chatEngine.name, deps: [], description: '通用对话', input: { query: String(query || '') } });
      return { strategy: 'single_worker', reason: 'fallback 单 Agent', tasks };
    }
    return { strategy: 'fanout', reason: 'fallback 触发 fanout', tasks };
  }
  return {
    strategy: 'single_worker',
    reason: 'fallback 单 Agent',
    tasks: [{ id: 'task-1', agent: chatEngine.name, deps: [], description: '通用对话', input: { query: String(query || '') } }]
  };
};
