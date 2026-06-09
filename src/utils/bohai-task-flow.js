// BOH AI 结构化任务流
// ------------------------------------------------------------
// 阶段 2.2 任务：把"复杂问题"的回答拆成 4 步可编辑面板
// 1. 分析(Analyze) — 根因 / 现状
// 2. 方案(Plan)     — 解决思路 / 步骤
// 3. 实施(Implement)— 代码 / 操作清单
// 4. 验证(Verify)   — 怎么确认已修复
//
// 设计要点：
// 1. 先从 AI 回复里"启发式抽取"4 段（用标题、emoji、关键词）
// 2. 抽不出来就保留原文，让用户手动拆
// 3. 每段独立可编辑（isEditable 状态由 UI 层管，这里只管数据）
// ------------------------------------------------------------

export const TASK_FLOW_STEPS = [
  { id: 'analyze', label: '分析', icon: 'Search', description: '根因 / 现状' },
  { id: 'plan', label: '方案', icon: 'Lightbulb', description: '解决思路 / 步骤' },
  { id: 'implement', label: '实施', icon: 'Wrench', description: '代码 / 操作清单' },
  { id: 'verify', label: '验证', icon: 'CheckCircle', description: '怎么确认已修复' }
];

/**
 * 标题识别：把 markdown 文本按 ## / ### 切分，再按关键词归类
 * 不要求严格的 4 段，缺哪段就空着
 */
const STEP_KEYWORDS = {
  verify: ['验证', '测试', '确认', '检查', '复核', '回归', 'verify', 'test', 'check', 'validate', 'regression', 'confirm'],
  implement: ['实施', '执行', '代码', '修改', '补丁', '操作', '实现', '修复', 'implement', 'code', 'patch', 'fix', 'apply', 'execute'],
  plan: ['方案', '计划', '策略', '思路', '设计', 'plan', 'strategy', 'approach', 'design', 'todo'],
  analyze: ['分析', '根因', '原因', '诊断', '现状', '排查', 'analyze', 'analysis', 'root cause', 'reason', 'diagnosis', 'investigation']
};

/**
 * 抽取一个标题对应到哪个 step
 */
const matchStepForHeading = (heading) => {
  const lower = String(heading || '').toLowerCase();
  // 按优先级 verify > implement > plan > analyze 匹配,避免"验证步骤"被 plan 的"步骤"抢走
  for (const stepId of ['verify', 'implement', 'plan', 'analyze']) {
    const kws = STEP_KEYWORDS[stepId];
    if (kws.some((kw) => lower.includes(kw.toLowerCase()))) {
      return stepId;
    }
  }
  return '';
};

/**
 * 从 markdown 文本里抽取 4 段
 * 优先按 ## / ### 切分；切不出来则按"四段模板"识别
 * @returns { analyze, plan, implement, verify, hasStructure }
 */
export const extractTaskFlowFromText = (text) => {
  if (typeof text !== 'string' || !text) {
    return emptyTaskFlow();
  }
  const steps = emptyTaskFlow();
  // 1. 按 ## / ### 切
  const sections = text.split(/(?=^#{1,3}\s+)/m);
  for (const section of sections) {
    const headingMatch = section.match(/^#{1,3}\s+(.+?)\n/);
    if (!headingMatch) continue;
    const stepId = matchStepForHeading(headingMatch[1]);
    if (!stepId) continue;
    if (steps[stepId]) {
      // 已经有内容了，附加（罕见）
      steps[stepId] += '\n\n' + section.replace(/^#{1,3}\s+.+?\n/, '').trim();
    } else {
      steps[stepId] = section.replace(/^#{1,3}\s+.+?\n/, '').trim();
    }
  }
  // 2. 兜底：识别"1. / 2. / 3. / 4. 开头"对应 4 段
  if (!steps.analyze && !steps.plan && !steps.implement && !steps.verify) {
    const numbered = text.split(/(?=^\s*\d+[.、]\s*\*\*)/m);
    if (numbered.length >= 2) {
      numbered.forEach((chunk) => {
        const headingMatch = chunk.match(/^\s*\d+[.、]\s*\*\*(.+?)\*\*/);
        if (!headingMatch) return;
        const stepId = matchStepForHeading(headingMatch[1]);
        if (stepId && !steps[stepId]) {
          steps[stepId] = chunk.replace(/^\s*\d+[.、]\s*\*\*.+?\*\*\s*/, '').trim();
        }
      });
    }
  }
  // 3. 兜底：识别"4 个 emoji 段落"模式（🔍 📋 🛠 ✅）
  if (!steps.analyze && !steps.plan && !steps.implement && !steps.verify) {
    // 用 extended pictographic 匹配 emoji,避免 surrogate pair 拆开
    const emojiSections = text.split(/(?=\p{Extended_Pictographic})/u);
    if (emojiSections.length >= 2) {
      emojiSections.forEach((chunk) => {
        if (/\p{Extended_Pictographic}/u.test(chunk) === false) return;
        // 取第一段
        const firstGrapheme = [...chunk][0] || '';
        const rest = chunk.slice(firstGrapheme.length).trim();
        if (/🔍|🔎|📊|🔬/.test(firstGrapheme) && !steps.analyze) steps.analyze = rest;
        else if (/📋|📝|🗒/.test(firstGrapheme) && !steps.plan) steps.plan = rest;
        else if (/🛠|🔧|💻|🛠️/.test(firstGrapheme) && !steps.implement) steps.implement = rest;
        else if (/✅|✔|🎯/.test(firstGrapheme) && !steps.verify) steps.verify = rest;
      });
    }
  }
  const hasStructure = Boolean(steps.analyze || steps.plan || steps.implement || steps.verify);
  return { ...steps, hasStructure };
};

const emptyTaskFlow = () => ({
  analyze: '',
  plan: '',
  implement: '',
  verify: '',
  hasStructure: false
});

/**
 * 判断是否应该"建议"用户用结构化面板
 * 命中条件：
 *   1. AI 答复里能抽到 2 段以上步骤
 *   2. 文本总长 > 200 字符
 *   3. 用户明确要求"分步 / 拆解 / 步骤化"或上一轮 routedMode 是 Plan
 */
export const shouldSuggestTaskFlow = (text, ctx = {}) => {
  const flow = extractTaskFlowFromText(text);
  const stepCount = [flow.analyze, flow.plan, flow.implement, flow.verify].filter(Boolean).length;
  if (stepCount >= 2) return { suggest: true, flow, reason: 'multi-step-detected' };
  if (ctx.userAskedForSteps || ctx.lastRoutedMode === 'plan') {
    return { suggest: true, flow, reason: 'user-or-plan-context' };
  }
  return { suggest: false, flow, reason: 'not-applicable' };
};

/**
 * 把 4 段拼回 markdown（用户编辑完后回传）
 */
export const buildTextFromTaskFlow = (flow) => {
  if (!flow) return '';
  const parts = [];
  TASK_FLOW_STEPS.forEach((step) => {
    const content = String(flow[step.id] || '').trim();
    if (content) {
      parts.push(`## ${step.label}\n\n${content}`);
    }
  });
  return parts.join('\n\n');
};

/**
 * 校验每段最小完整性
 * 返回 { valid, missing, suggestions }
 */
export const validateTaskFlow = (flow) => {
  const missing = TASK_FLOW_STEPS.filter((s) => !String(flow?.[s.id] || '').trim());
  return {
    valid: missing.length === 0,
    missing,
    suggestions: missing.map((s) => `${s.label}段为空，建议补充${s.description}`)
  };
};
