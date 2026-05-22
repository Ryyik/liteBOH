import { COMMAND_MODE_INSTRUCTION } from '@/data/minecraft-commands.js';

const keywordGroups = {
  give: ['give', '给予', '获得', 'give item', '物品', '武器', '装备'],
  effect: ['effect', '药水', '效果', 'potion', '药水效果', '状态效果'],
  attribute: ['attribute', '属性', '修饰', 'attribute modifier', '攻击速度', '生命值', '护甲'],
  title: ['title', '标题', 'custom title', 'subtitle', 'actionbar', '提示字'],
  execute: ['execute', '执行', '检测', 'command block', '命令方块', '条件执行'],
  enchant: ['enchant', '附魔', 'enchantment'],
  summon: ['summon', '召唤', '刷怪', '实体'],
  gamerule: ['gamerule', '游戏规则', '死亡不掉落', '天气', '时间流逝']
};

const templateGroupMap = {
  give_item: ['give', 'enchant'],
  effect: ['effect'],
  give_potion: ['effect'],
  attribute_modifier: ['attribute'],
  title: ['title'],
  execute: ['execute'],
  summon: ['summon']
};

const dictionaryGroupMap = {
  enchantments: ['enchant', 'give'],
  effects: ['effect'],
  attributes: ['attribute'],
  slots: ['attribute', 'give'],
  gamerules: ['gamerule', 'execute']
};

const defaultTemplateKeys = ['give_item', 'effect', 'attribute_modifier', 'execute', 'title'];

const normalizeText = (text) => String(text || '').toLowerCase();

const includesAny = (text, keywords) => keywords.some((kw) => text.includes(kw));

export const detectCommandIntent = (userText = '') => {
  const text = normalizeText(userText);
  const matchedGroups = [];

  for (const [group, keywords] of Object.entries(keywordGroups)) {
    if (includesAny(text, keywords)) {
      matchedGroups.push(group);
    }
  }

  const isBedrock = includesAny(text, ['bedrock', 'pe', '基岩', '手机版', 'win10版']);
  const isJavaModern = includesAny(text, ['1.20.5', '1.20.6', '1.21', 'java新版', '组件语法', 'latest', '最新版', '最新']);
  const isJavaClassic = includesAny(text, ['1.13', '1.14', '1.15', '1.16', '1.17', '1.18', '1.19', '1.20.4', 'nbt', '旧版', '传统语法']);

  let versionTarget = 'unspecified';
  if (isBedrock) {
    versionTarget = 'bedrock';
  } else if (isJavaModern && !isJavaClassic) {
    versionTarget = 'java_modern';
  } else if (isJavaClassic && !isJavaModern) {
    versionTarget = 'java_classic';
  }

  return {
    versionTarget,
    requireDualVersion: versionTarget === 'unspecified',
    matchedGroups: matchedGroups.length > 0 ? matchedGroups : ['general']
  };
};

const pickRelevantTemplates = (groups) => {
  const templates = {};
  Object.entries(templateGroupMap).forEach(([templateKey, mappedGroups]) => {
    if (mappedGroups.some((group) => groups.includes(group))) {
      templates[templateKey] = COMMAND_MODE_INSTRUCTION.templates[templateKey];
    }
  });

  if (Object.keys(templates).length === 0) {
    defaultTemplateKeys.forEach((templateKey) => {
      templates[templateKey] = COMMAND_MODE_INSTRUCTION.templates[templateKey];
    });
  }

  return templates;
};

const pickRelevantDictionaries = (groups) => {
  const dictionaries = {};
  Object.entries(dictionaryGroupMap).forEach(([dictionaryKey, mappedGroups]) => {
    if (mappedGroups.some((group) => groups.includes(group))) {
      dictionaries[dictionaryKey] = COMMAND_MODE_INSTRUCTION.dictionaries[dictionaryKey];
    }
  });

  return dictionaries;
};

const getInstructionRulesExcerpt = () => {
  const raw = String(COMMAND_MODE_INSTRUCTION.instructions || '').trim();
  return raw.split('## 回答格式范例')[0].trim();
};

export const getRelevantCommandInstructions = (userText, intent = detectCommandIntent(userText)) => {
  const relevant = {
    meta: COMMAND_MODE_INSTRUCTION.meta,
    intent: {
      version_target: intent.versionTarget,
      require_dual_version: intent.requireDualVersion,
      matched_topics: intent.matchedGroups
    },
    instructions: getInstructionRulesExcerpt(),
    templates: pickRelevantTemplates(intent.matchedGroups),
    dictionaries: pickRelevantDictionaries(intent.matchedGroups)
  };
  return JSON.stringify(relevant, null, 2);
};

const buildVersionDirective = (intent) => {
  switch (intent?.versionTarget) {
    case 'bedrock':
      return '用户已指定基岩版。你必须只输出基岩版方案，严禁在 /give 里使用 NBT 或组件语法。';
    case 'java_modern':
      return '用户已指定 Java 1.20.5+。你必须只输出 Java 1.20.5+ 组件语法（[]）。';
    case 'java_classic':
      return '用户已指定 Java 1.13-1.20.4。你必须只输出 Java 传统 NBT 语法（{}）。';
    default:
      return '用户未指定版本。你必须同时输出两套命令：Java 1.20.5+（组件语法）和 Java 1.13-1.20.4（NBT 语法）。';
  }
};

export const getCommandSystemPrompt = (formattedInstructions, intent) => {
  return `你是 Minecraft 指令专家。请仅围绕 Minecraft 指令回答。
不要引用、复述或混入任何 BOH 社区记忆、站点知识或其他无关背景。

版本策略：
${buildVersionDirective(intent)}

输出要求：
1. 使用与用户相同语言回答。
2. 回答必须包含“适用版本”。
3. 所有指令必须放在 Markdown 代码块，语言标记用 \`\`\`mcfunction。
4. 不允许输出思考过程、分析草稿或 <think> 标签。
5. 如果用户输入信息不足（目标物品/版本/效果缺失），先给一个可运行的默认示例并标注可替换参数。

REFERENCE KNOWLEDGE (MC-UKB):
${formattedInstructions}

请严格遵守以上规则生成最终答案。`;
};

export const validateCommandOutput = (text, intent = {}) => {
  const output = String(text || '');
  const giveLines = output.match(/\/give[^\n]*/gi) || [];
  const issues = [];

  const getGiveSyntaxFlags = (line) => {
    const cleaned = String(line || '').replace(/^\/give\s+/i, '').trim();
    const parts = cleaned.split(/\s+/);
    const itemToken = parts[1] || '';
    return {
      hasClassicNbtGive: itemToken.includes('{'),
      hasModernComponentGive: itemToken.includes('[')
    };
  };

  const syntaxFlags = giveLines.map(getGiveSyntaxFlags);
  const hasClassicNbtGive = syntaxFlags.some((item) => item.hasClassicNbtGive);
  const hasModernComponentGive = syntaxFlags.some((item) => item.hasModernComponentGive);

  if (intent.versionTarget === 'bedrock') {
    if (hasClassicNbtGive || hasModernComponentGive) {
      issues.push('基岩版 /give 不应包含 NBT({}) 或组件([])语法。');
    }
  }

  if (intent.versionTarget === 'java_modern' && hasClassicNbtGive) {
    issues.push('Java 1.20.5+ 不应在 /give 中使用传统 NBT({})语法。');
  }

  if (intent.versionTarget === 'java_classic' && hasModernComponentGive) {
    issues.push('Java 1.13-1.20.4 不应在 /give 中使用组件([])语法。');
  }

  if (intent.requireDualVersion) {
    const hasModernSection = /1\.20\.5|1\.21|组件语法/i.test(output);
    const hasClassicSection = /1\.13|1\.20\.4|nbt/i.test(output);
    if (!hasModernSection || !hasClassicSection) {
      issues.push('未指定版本时应同时给出 Java 1.20.5+ 与 Java 1.13-1.20.4 两套方案。');
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
};

export const buildCommandRepairPrompt = (userText, previousOutput, validation) => {
  return `你需要修复一份 Minecraft 指令回答，使其满足版本和语法要求。

用户原始需求：
${userText}

上一版回答（存在问题）：
${previousOutput}

发现的问题：
${(validation?.issues || []).map((issue, index) => `${index + 1}. ${issue}`).join('\n')}

请直接输出修复后的最终答案，不要解释修复过程。`;
};
