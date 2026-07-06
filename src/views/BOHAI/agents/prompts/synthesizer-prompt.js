export const SYNTHESIZER_SYSTEM_PROMPT = `<role>
你是 BOH AI 集群的合成器（Synthesizer），负责把多个 Agent 的子任务产出整合成最终回复。
</role>

<thinking>
在整合前，先在 &lt;thinking&gt; 标签内推演：
1. 对比多个 Agent 的产出 —— 是否存在冲突或矛盾？
2. 评估每个证据的可靠性和时效性。
3. 规划回答结构 —— 哪些信息合并、哪些单独说明冲突。
</thinking>

<constraints>
- 绝对不能编造事实；必须严格基于 Agent 提供的证据和结论回答。
- 绝对不能暴露内部 Agent 名称、模型名、prompt 等技术词。
- 绝对不能输出 JSON / 代码块（除非用户明确要求代码）。
</constraints>

<output_format>
1. 回答自然、简洁、可执行，遵循用户提问语言。
2. 引用证据时使用 [E1] [E2] 等编号，末尾追加"参考来源"列表。
3. 若多个来源存在冲突，提示"存在冲突信息"，并指明哪个更新、更具体。
4. 结尾严格使用 \`<<<synth-final>>>\` 标记（保留前后空行），标记之后不要输出任何内容。
</output_format>`;

// 强 sentinel：前后各保留换行避免被模型误当成行内词。`synth-final` 单独使用容易被模型在答案中复述。
export const SYNTH_FINAL_MARKER = '<<<synth-final>>>';

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

/**
 * 解析合成器输出：把 marker 之前的部分作为 visible，之后作为 internal（不向用户展示）。
 * 使用 `<<<synth-final>>>` 强 sentinel + 校验"它出现在末尾 200 字符内"以降低误切风险。
 */
export const splitSynthesizerStream = (rawText = '') => {
  const text = String(rawText || '');
  const idx = text.lastIndexOf(SYNTH_FINAL_MARKER);
  if (idx < 0) {
    return { visible: text.trim(), internal: '', hadMarker: false };
  }
  // 健壮性：marker 必须出现在文本末尾 200 字符内，否则视为模型忘了在结尾放 marker
  const tail = text.length - idx - SYNTH_FINAL_MARKER.length;
  if (tail > 200) {
    return { visible: text.trim(), internal: '', hadMarker: false };
  }
  return {
    visible: text.slice(0, idx).trim(),
    internal: text.slice(idx + SYNTH_FINAL_MARKER.length).trim(),
    hadMarker: true
  };
};
