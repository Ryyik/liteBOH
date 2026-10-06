/**
 * structured-memory.js — 结构化记忆提取
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 */

export const STRUCTURED_MEMORY_TYPES = {
  PREFERENCE: 'preference',
  PERSONAL_INFO: 'personal_info',
  DECISION: 'decision',
  GOAL: 'goal',
  RELATIONSHIP: 'relationship',
  EVENT: 'event',
};

export const extractStructuredMemories = (messages = []) => {
  if (!Array.isArray(messages) || messages.length < 4) return [];

  const memories = [];
  const text = messages
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .map((m) => String(m.content || ''))
    .join('\n')
    .slice(-6000);

  const patterns = [
    {
      type: STRUCTURED_MEMORY_TYPES.PREFERENCE,
      re: /(?:我|用户)(?:喜欢|不喜欢|偏爱|更愿意)\s*(.+?)[。，；;]/g,
    },
    {
      type: STRUCTURED_MEMORY_TYPES.PERSONAL_INFO,
      re: /(?:我|用户)(?:是|叫|在|来自|今年)\s*(.+?)[。，；;]/g,
    },
    {
      type: STRUCTURED_MEMORY_TYPES.DECISION,
      re: /(?:我|用户)(?:决定|选择|打算|想|要)\s*(.+?)[。，；;]/g,
    },
    {
      type: STRUCTURED_MEMORY_TYPES.GOAL,
      re: /(?:我|用户)(?:的目标|的目标是|希望|想要|需要|梦想)\s*(.+?)[。，；;]/g,
    },
    {
      type: STRUCTURED_MEMORY_TYPES.EVENT,
      re: /(?:我|用户)(?:最近|刚刚|之前|昨天|上周|今天)\s*(.+?)[。，；;]/g,
    },
  ];

  for (const { type, re } of patterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = match[1].trim().slice(0, 100);
      if (
        value.length >= 4 &&
        !memories.some((m) => m.value.includes(value) || value.includes(m.value))
      ) {
        memories.push({
          type,
          value,
          confidence: type === STRUCTURED_MEMORY_TYPES.PERSONAL_INFO ? 0.7 : 0.5,
        });
        if (memories.length >= 12) break;
      }
    }
    if (memories.length >= 12) break;
  }

  return memories;
};

export const buildStructuredMemoryBlock = (memories = []) => {
  if (!memories.length) return '';
  const xml = memories
    .map(
      (m) =>
        `  <fact type="${m.type}" confidence="${m.confidence.toFixed(1)}">${escapeXml(m.value)}</fact>`,
    )
    .join('\n');
  return `<structured_memory>\n${xml}\n</structured_memory>`;
};

const escapeXml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
