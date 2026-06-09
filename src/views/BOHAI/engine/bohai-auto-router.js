/**
 * BOH AI Auto 模式路由工具
 * ------------------------------------------------------------
 * 维护约定：
 * 1. ROUTING_PATTERNS 仍按"意图"维度声明，保持与历史单测的稳定行为。
 * 2. resolveBOHAIAutoModeDecision 是"本地兜底路由"，会缓存结果。
 * 3. _safeJsonParse / computeModeFromDecision / mergeAutoDecisionWithLocalGuardrails
 *    等纯函数从 useChatEngine 抽出到 bohai-auto-decision.js，供单测覆盖。
 * ------------------------------------------------------------
 */

export const BOH_AUTO_MODE_ID = 'auto';

import { ROUTE_DECISION_CACHE_MAX_SIZE } from '../../../utils/bohai-constants.js';

// ------------------------------------------------------------
// LRU 缓存：最近访问的 key 排在最前，超过容量时淘汰最久未访问的。
// 之前的实现使用 Map 的插入顺序做 FIFO，长会话中最久的决策反而
// 容易被踢出，命中率较差。
// ------------------------------------------------------------
class LRUCache {
  constructor(maxSize) {
    this.maxSize = Math.max(1, Number(maxSize) || 1);
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    // 读取即刷新顺序
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
  has(key) {
    return this.map.has(key);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}

const normalizeText = (text) => String(text || '').toLowerCase().trim();

// 轻量哈希（FNV-1a 32 位），用于把长文本压缩为定长 key。
const fnv1a32 = (str) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
};

// 文本指纹：取归一化前 200 字符 + 长度哈希
const buildTextFingerprint = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return '0:0';
  const head = normalized.slice(0, 200);
  return `${normalized.length}:${fnv1a32(head)}`;
};

export const ROUTING_PATTERNS = {
  question: {
    pattern: /[?？]|^(?:请问|问一下|想问|能不能|可以吗|是否|是不是|有没有|怎么|如何|为什么|what|why|how|when|where|who)\b|(?:总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|列出|看看|查询|搜索|找一下|发生了什么|最近发生)/i,
    label: '问题类请求'
  },
  community: {
    pattern: /(方块之家|block of home|\bboh\b|社区|社群|群里|论坛|成员|周年庆|内战|服务器|联机|hypixel|我的世界|minecraft|\bmc\b|英雄联盟|\blol\b|王者荣耀|ryyik|lf|小牛|eleven|end|汉堡|丁老师|雨芙蕖|白烨|百城|小天光|小仙)/i,
    label: '社区相关内容'
  },
  memoryShare: {
    pattern: /(今天|昨天|刚刚|最近|后来|以前|之前|当时|这次|这件事|发生|加入|认识|一起|玩了|聊了|说过|提到|决定|举办|更新|补充|记一下|记录一下|分享一下|告诉你)/i,
    label: '记忆共享'
  },
  complex: {
    pattern: /(分析|推理|思考|权衡|方案|设计|架构|规划|复盘|诊断|排查|定位|优化|策略|路线图|复杂|深度|详细|全面|比较|对比|评估|拆解|判断|决策|选择|取舍|利弊|优缺点|风险|优先级|可行性|可能性|为什么|原因|怎么设计|如何落地|实现方案|技术方案|给我一个方案|你怎么看|该不该|要不要|值不值得|哪一个更好|怎么选)/i,
    label: '复杂推理'
  },
  planMode: {
    pattern: /(plan\s*模式|计划模式|持续推进|不断推进|长期推进|分步推进|一步步推进|按阶段推进|跟进|复盘推进|执行计划|行动计划|推进计划|实施计划|落地计划|三阶段|阶段性|阶段目标|里程碑|路线图|拆成步骤|拆成小步|分几步|先计划再执行|先规划再执行|下一步行动|待办清单|任务拆解|风险跟踪|风险闭环|降低幻觉|减少幻觉)/i,
    label: '计划推进'
  },
  multiStepReasoning: {
    pattern: /(先.+再|如果.+那么|同时.+但是|既.+又|从.+角度|分别|分几步|一步步|按.{0,8}优先级|综合.{0,8}判断|帮我判断|帮我分析|帮我看看|我应该|我该|怎么处理|怎么解决|怎么优化|怎么改|哪里出了问题|问题在哪里|为什么会这样)/i,
    label: '多步推理'
  },
  dailySummary: {
    pattern: /(总结|复盘|回顾|梳理).{0,12}(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录|cloud\+|cloud|笔记|日记)|(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录).{0,16}(总结|复盘|回顾|梳理)/i,
    label: '日常总结'
  },
  codeOrCommand: {
    pattern: /(```|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|代码|编程|函数|组件|接口|api|sql|脚本|报错|bug|debug|调试|重构|命令|指令|终端|shell|bash|npm|node|python|javascript|typescript|vue|react|css|html|json|正则|minecraft\s*command|mc\s*指令|命令方块)/i,
    label: '代码或命令'
  },
  minecraftCommand: {
    pattern: /(minecraft|我的世界|\bmc\b|命令方块|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|基岩版|java\s*1\.\d+|钻石剑|附魔|药水效果|gamerule|死亡不掉落)/i,
    label: 'Minecraft命令'
  },
  cloudReference: {
    pattern: /(根据|结合|参考|看看|读取|分析).{0,18}(我的|我).{0,18}(cloud\+|cloud|随手记|笔记|日记|记录|近况|最近|近期|状态|情绪|生活)/i,
    label: 'Cloud+引用'
  },
  cloudSave: {
    pattern: /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(cloud\+|cloud|随手记|日记|笔记|我的记录|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下)(?!.*(公共记忆|共享记忆|社群记忆|记忆库)))/i,
    label: '保存到Cloud+'
  },
  forumPost: {
    pattern: /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|论坛发布文案|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案)|生成.{0,12}(论坛|社区|帖子|发布文案)|整理.{0,12}(论坛|社区|帖子|发布文案))/i,
    label: '论坛发帖'
  },
  sharedSave: {
    pattern: /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(公共记忆|共享记忆|社群记忆|记忆库|boh ai 公共))|((公共记忆|共享记忆|社群记忆|记忆库).{0,12}(存|保存|记录|写入|加入))/i,
    label: '保存到共享记忆'
  },
  bothSave: {
    pattern: /(两者|两个都|两边|都存|都保存|都写入|同时|一起|cloud\+.*公共|公共.*cloud\+)/i,
    label: '双重保存'
  },
  memoryQuery: {
    pattern: /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|论坛最近|帖子最近|大家在聊)/i,
    label: '记忆查询'
  },
  explicitWebSearch: {
    pattern: /(联网|上网|网络搜索|网页搜索|搜索一下|搜一下|查一下网上|网上查|查网页|google|百度|bing|web search|search the web)/i,
    label: '明确联网搜索'
  },
  webFreshness: {
    pattern: /(最新|最近|今天|今日|现在|当前|实时|刚刚|本周|本月|今年|202[4-9]|新闻|发布|上线|更新|价格|汇率|股价|票房|赛程|比分|天气|政策|法规|版本|发布时间|官网)/i,
    label: '时效性内容'
  },
  healthOrSafety: {
    pattern: /(健康|医学|医疗|疾病|症状|诊断|治疗|用药|药物|药品|处方|副作用|禁忌|剂量|服用|能不能吃|要不要吃|要喝吗|要吃吗|怀孕|过敏|营养|补剂|补充剂|肌酸|蛋白粉|咖啡因|维生素|鱼油|健身|训练|增肌|减脂|运动损伤|拉伤|疼痛|康复|睡眠)/i,
    label: '健康安全'
  },
  personalSupport: {
    pattern: /(睡不好|睡不着|失眠|焦虑|难过|伤心|低落|不开心|委屈|孤独|害怕|心里堵|压力大|内耗|烦躁|崩溃|撑不住|想哭|关系.{0,8}(难受|冲突|紧张|别扭)|朋友.{0,8}(吵架|冲突|疏远)|家人.{0,8}(冲突|吵架|压力)|恋爱.{0,8}(难受|分手|冲突)|分手).{0,24}(咋办|怎么办|怎么处理|怎么缓解|怎么调节|有点|很|太|一直|老是|总是)?/i,
    label: '个人支持'
  },
  professionalHealth: {
    pattern: /(诊断|治疗|疗法|药物|用药|处方|剂量|副作用|禁忌|疾病|病症|症状|抑郁症|焦虑症|双相|精神分裂|创伤后|ptsd|adhd|ocd|心理学研究|论文|量表|指南|咨询师|心理医生|精神科|医院|危机干预|自杀|自残|轻生|严重失眠|连续.*睡不着|几天.*没睡)/i,
    label: '专业健康'
  },
  externalKnowledge: {
    pattern: /(是什么|为什么|怎么|如何|能不能|要不要|是否|区别|对比|推荐|建议|原理|用法|风险|安全吗|靠谱吗|指南|教程|资料|文档|官网|研究|论文|科学|历史|地理|法律|税务|保险|签证|旅游|学校|大学|专业|产品|品牌|型号|软件|app|api|框架|库|插件|vue|react|node|npm|python|javascript|typescript|css|html|sql|what|why|how|when|where|which|should i|can i)/i,
    label: '外部知识'
  },
  internalSource: {
    pattern: /(cloud\+|cloud|随手记|日记|笔记|我的记录|我的资料|我的数据|我的帖子|我的账号|方块之家|block of home|\bboh\b|社区|社群|论坛|公共记忆|共享记忆|记忆库)/i,
    label: '内部数据源'
  },
  bohInternalFact: {
    pattern: /(方块之家|block of home|\bboh\b|boh\s*ai|boh\s*cloud\+?|cloud\+|论坛|帖子|公告|活动|周年庆|内战|服务器|联机|成员|pushplus|订阅|会员|积分|礼物|生日).{0,24}(是谁|是什么|什么时候|何时|哪年|哪里|在哪|怎么|如何|步骤|入口|路径|最新|最近|今天|近期|公告|活动|规则|状态|记录|历史|来源|细节|有没有|是否|介绍|总结|复盘|查询|查看)|(是谁|是什么|什么时候|何时|哪年|哪里|在哪|怎么|如何|步骤|入口|路径|最新|最近|今天|近期|公告|活动|规则|状态|记录|历史|来源|细节|有没有|是否|介绍|总结|复盘|查询|查看).{0,24}(方块之家|block of home|\bboh\b|boh\s*ai|boh\s*cloud\+?|cloud\+|论坛|帖子|公告|活动|周年庆|内战|服务器|联机|成员|pushplus|订阅|会员|积分|礼物|生日)/i,
    label: 'BOH内部事实查询'
  }
};

export const isLikelyCodeOrCommandRequest = (text) => ROUTING_PATTERNS.codeOrCommand.pattern.test(normalizeText(text));

export const isLikelyMinecraftCommandRequest = (text) => ROUTING_PATTERNS.minecraftCommand.pattern.test(normalizeText(text));

export const isLikelyDailySummaryRequest = (text) => ROUTING_PATTERNS.dailySummary.pattern.test(normalizeText(text));

export const isLikelyCloudReferenceRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.dailySummary.pattern.test(normalized)) return true;
  if (ROUTING_PATTERNS.cloudReference.pattern.test(normalized)) return true;
  if (ROUTING_PATTERNS.internalSource.pattern.test(normalized)
    && /(我|我的|自己|本人)/.test(normalized)) {
    return true;
  }
  return false;
};

export const isLikelyPersonalSupportRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.professionalHealth.pattern.test(normalized)) return false;
  return ROUTING_PATTERNS.personalSupport.pattern.test(normalized);
};

export const isLikelyWebSearchRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.forumPost.pattern.test(normalized)) return false;
  if (ROUTING_PATTERNS.explicitWebSearch.pattern.test(normalized)) return true;
  const isInternalSource = ROUTING_PATTERNS.internalSource.pattern.test(normalized);
  if (!isInternalSource && isLikelyPersonalSupportRequest(normalized)) return false;
  if (!isInternalSource && ROUTING_PATTERNS.healthOrSafety.pattern.test(normalized)) return true;
  if (!isInternalSource && ROUTING_PATTERNS.externalKnowledge.pattern.test(normalized)) return true;
  if (!ROUTING_PATTERNS.webFreshness.pattern.test(normalized)) return false;
  if (isInternalSource && !/(官网|外部|网上|联网|新闻|政策|法规|价格|股价|天气|汇率|版本)/i.test(normalized)) {
    return false;
  }
  return true;
};

/**
 * Unified complexity determination — single source of truth.
 *
 * Consolidates 3 previously scattered implementations:
 * 1. chat-engine-config.js _isProComplex
 * 2. bohai-auto-router.js ROUTING_PATTERNS.complex
 * 3. bohai-auto-router.js ROUTING_PATTERNS.multiStepReasoning
 * 4. isLikelyComplexQuestion (combines both patterns + heuristics)
 *
 * Use this instead of duplicating regex patterns.
 */
export const isLikelyComplexQuestion = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.complex.pattern.test(normalized)) return true;
  if (ROUTING_PATTERNS.multiStepReasoning.pattern.test(normalized)) return true;
  const questionMarks = (normalized.match(/[?？]/g) || []).length;
  const clauseCount = (normalized.match(/[，,；;、\n]/g) || []).length;
  return normalized.length >= 72 && (questionMarks >= 1 || clauseCount >= 2);
};

export const isLikelyPlanModeRequest = (text) => ROUTING_PATTERNS.planMode.pattern.test(normalizeText(text));

export const isLikelyBohInternalFactualRequest = (text) => ROUTING_PATTERNS.bohInternalFact.pattern.test(normalizeText(text));

export const isLikelyCommunityMemoryShare = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (!ROUTING_PATTERNS.community.pattern.test(normalized)) return false;
  if (ROUTING_PATTERNS.question.pattern.test(normalized)) return false;
  if (ROUTING_PATTERNS.memoryQuery.pattern.test(normalized)) return false;
  if (isLikelyCodeOrCommandRequest(normalized)) return false;
  return ROUTING_PATTERNS.memoryShare.pattern.test(normalized) || normalized.length >= 32;
};

// 冻结的"中性空决策"
export const EMPTY_AUTO_DECISION = Object.freeze({
  modeId: 'fast',
  codeOrCommand: false,
  minecraftCommand: false,
  dailySummary: false,
  planMode: false,
  bohInternalFactual: false,
  complexQuestion: false,
  communityMemoryShare: false,
  personalSupport: false,
  shouldSearchWeb: false,
  shouldReferenceCloud: false,
  shouldSaveCloud: false,
  shouldSaveSharedMemory: false,
  saveDestination: 'none',
  shouldAskMemoryDestination: false,
  forceCloudReference: false,
  shouldAskSharedMemory: false,
  actionNotes: Object.freeze([]),
  confidence: 0
});

// LRU 缓存
const decisionCache = new LRUCache(ROUTE_DECISION_CACHE_MAX_SIZE);

export const clearRouteDecisionCache = () => {
  decisionCache.clear();
};

const computeRoutingConfidence = (signals) => {
  let max = 0;
  let sum = 0;
  let count = 0;
  for (const value of Object.values(signals)) {
    if (typeof value !== 'number' || value <= 0) continue;
    sum += value;
    count += 1;
    if (value > max) max = value;
  }
  if (count === 0) return 0.5;
  const aggregate = max * 0.7 + (sum / count) * 0.3;
  return Math.min(0.97, Math.max(0.5, Number(aggregate.toFixed(2))));
};

export const resolveBOHAIAutoModeDecision = (text, {
  isAutoMode = false,
  cloudReferenceEnabled = false,
  isLoggedIn = false
} = {}) => {
  const safeText = String(text || '').trim();
  if (!safeText) return EMPTY_AUTO_DECISION;

  const cacheKey = `${buildTextFingerprint(safeText)}|${Boolean(isAutoMode)}|${Boolean(cloudReferenceEnabled)}|${Boolean(isLoggedIn)}`;
  const cached = decisionCache.get(cacheKey);
  if (cached) return cached;

  const codeOrCommand = isLikelyCodeOrCommandRequest(safeText);
  const minecraftCommand = isLikelyMinecraftCommandRequest(safeText);
  const dailySummary = isLikelyDailySummaryRequest(safeText);
  const shouldReferenceCloud = isLikelyCloudReferenceRequest(safeText);
  const complexQuestion = isLikelyComplexQuestion(safeText);
  const planMode = isLikelyPlanModeRequest(safeText);
  const bohInternalFactual = isLikelyBohInternalFactualRequest(safeText);
  const communityMemoryShare = isLikelyCommunityMemoryShare(safeText);
  const personalSupport = isLikelyPersonalSupportRequest(safeText);
  const shouldSearchWeb = isLikelyWebSearchRequest(safeText);
  const forumPostAction = ROUTING_PATTERNS.forumPost.pattern.test(safeText);
  const wantsCloudSave = !forumPostAction && ROUTING_PATTERNS.cloudSave.pattern.test(safeText);
  const wantsSharedSave = ROUTING_PATTERNS.sharedSave.pattern.test(safeText);
  const wantsBothSave = ROUTING_PATTERNS.bothSave.pattern.test(safeText) && (wantsCloudSave || wantsSharedSave);
  const shouldAskMemoryDestination = communityMemoryShare && !wantsCloudSave && !wantsSharedSave;

  let saveDestination = 'none';
  if (wantsBothSave) {
    saveDestination = 'both';
  } else if (wantsCloudSave) {
    saveDestination = 'cloud';
  } else if (wantsSharedSave) {
    saveDestination = 'shared';
  } else if (shouldAskMemoryDestination) {
    saveDestination = 'ask';
  }

  const modeId = pickModeFromLocalSignals({
    codeOrCommand,
    planMode,
    dailySummary,
    shouldReferenceCloud,
    complexQuestion,
    bohInternalFactual,
    shouldSearchWeb
  }) || 'fast';

  const actionNotes = [];
  if (isAutoMode) {
    if (codeOrCommand) {
      actionNotes.push('切换到专业模式处理代码或指令。');
    } else if (dailySummary) {
      actionNotes.push('切换到思考模式总结最近日常。');
    } else if (planMode) {
      actionNotes.push('检测到规划意图；如需完整 Plan 模式请从顶部下拉框选择。');
    } else if (complexQuestion) {
      actionNotes.push('切换到思考模式拆解复杂问题。');
    } else if (bohInternalFactual) {
      actionNotes.push('切换到思考模式核对 BOH 内部资料。');
    } else if (personalSupport) {
      actionNotes.push('已识别为个人支持场景，倾向使用快速/思考模式。');
    } else {
      actionNotes.push('使用快速模式处理日常问答。');
    }
  }

  if (isAutoMode && shouldSearchWeb) {
    actionNotes.push('准备联网搜索最新资料。');
  }

  if (shouldReferenceCloud) {
    if (cloudReferenceEnabled) {
      actionNotes.push('准备参考你的 BOH Cloud+。');
    } else if (isLoggedIn) {
      actionNotes.push('需要先确认是否允许参考你的 BOH Cloud+。');
    }
  }

  if (communityMemoryShare) {
    actionNotes.push('识别到社群记忆，准备询问是否写入公共记忆库。');
  }

  const confidence = computeRoutingConfidence({
    codeOrCommand: codeOrCommand ? 0.85 : 0,
    planMode: planMode ? 0.8 : 0,
    dailySummary: dailySummary ? 0.78 : 0,
    cloudReference: shouldReferenceCloud ? 0.7 : 0,
    complexQuestion: complexQuestion ? 0.72 : 0,
    bohInternalFactual: bohInternalFactual ? 0.7 : 0,
    shouldSearchWeb: shouldSearchWeb ? 0.7 : 0,
    communityMemoryShare: communityMemoryShare ? 0.65 : 0
  });

  const decision = {
    modeId,
    codeOrCommand,
    minecraftCommand,
    dailySummary,
    planMode,
    bohInternalFactual,
    complexQuestion,
    communityMemoryShare,
    personalSupport,
    shouldSearchWeb,
    shouldReferenceCloud,
    shouldSaveCloud: saveDestination === 'cloud' || saveDestination === 'both',
    shouldSaveSharedMemory: saveDestination === 'shared' || saveDestination === 'both',
    saveDestination,
    shouldAskMemoryDestination,
    forceCloudReference: shouldReferenceCloud,
    shouldAskSharedMemory: communityMemoryShare || wantsSharedSave || wantsBothSave,
    actionNotes,
    confidence
  };

  decisionCache.set(cacheKey, decision);
  return decision;
};

// 模式等级: fast(1) < pro(2)
const AUTO_MODE_RANK = { fast: 1, pro: 2 };

const pickMoreCapableMode = (left = 'fast', right = 'fast') => {
  const safeLeft = ['fast', 'pro'].includes(left) ? left : 'fast';
  const safeRight = ['fast', 'pro'].includes(right) ? right : 'fast';
  return (AUTO_MODE_RANK[safeLeft] >= AUTO_MODE_RANK[safeRight]) ? safeLeft : safeRight;
};

const pickModeFromLocalSignals = (signals) => {
  if (signals.codeOrCommand) return 'pro';
  if (
    signals.dailySummary
    || signals.shouldReferenceCloud
    || signals.complexQuestion
    || signals.bohInternalFactual
    || signals.shouldSearchWeb
  ) {
    return 'pro';
  }
  return 'fast';
};

export { pickMoreCapableMode, pickModeFromLocalSignals, buildTextFingerprint, LRUCache };