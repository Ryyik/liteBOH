export const SYNTHESIZER_SYSTEM_PROMPT = `你是 BOH AI 集群的合成器（Synthesizer），负责把多个 Agent 的子任务产出整合成最终回复。

# 输入
- 用户原始问题
- 历史摘要（可能为空）
- 多个 Agent 的产出（包含 output / evidence / sources / notes）

# 输出要求
1. 严格基于 Agent 提供的证据和结论回答，禁止编造事实。
2. 若多个来源存在冲突，提示"存在冲突信息"，并指明哪个更新、更具体。
3. 引用证据时使用 [E1] [E2] 等编号，末尾追加"参考来源"列表。
4. 回答要自然、简洁、可执行，遵循用户提问语言。
5. 不要在回复中暴露内部 Agent 名称、模型名、prompt 等技术词。
6. 不输出 JSON / 代码块（除非用户明确要求代码）。
7. 严格使用 \`synth-final\` 标记结尾，便于前端解析。
`;

export const buildSynthesizerUserPrompt = ({
  query = '',
  historySummary = '',
  agentOutputs = [],
  evidence = [],
  sources = []
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
  lines.push('## Agent 产出');
  if (Array.isArray(agentOutputs) && agentOutputs.length) {
    agentOutputs.forEach((entry, index) => {
      lines.push(`### Agent ${index + 1}: ${entry.agent}${entry.role ? ` (${entry.role})` : ''} - ${entry.status || 'ok'}`);
      if (entry.notes && entry.notes.length) {
        lines.push(`- 备注：${entry.notes.join('；')}`);
      }
      if (typeof entry.output === 'string') {
        lines.push(entry.output.slice(0, 1500));
      } else if (entry.output != null) {
        lines.push(JSON.stringify(entry.output).slice(0, 1500));
      }
      if (entry.evidence && entry.evidence.length) {
        lines.push('');
        lines.push('证据：');
        entry.evidence.slice(0, 8).forEach((ev, i) => {
          const idx = `[${(evidence?.length || 0) + i + 1}]`;
          lines.push(`${idx} ${(ev?.text || ev?.summary || '').toString().slice(0, 400)}`);
        });
      } else {
        lines.push('');
        lines.push('证据：(无)');
      }
    });
  } else {
    lines.push('(无 Agent 产出)');
  }
  if (Array.isArray(sources) && sources.length) {
    lines.push('');
    lines.push('## 来源汇总');
    sources.forEach((source, index) => {
      lines.push(`${index + 1}. ${source.label || source.id || ''} ${source.source ? `(${source.source})` : ''}`);
    });
  }
  return lines.join('\n');
};

export const splitSynthesizerStream = (rawText = '') => {
  const text = String(rawText || '');
  const marker = 'synth-final';
  const idx = text.lastIndexOf(marker);
  if (idx < 0) {
    return { visible: text.trim(), internal: '' };
  }
  return {
    visible: text.slice(0, idx).trim(),
    internal: text.slice(idx + marker.length).trim()
  };
};
