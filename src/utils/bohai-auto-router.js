export const BOH_AUTO_MODE_ID = 'auto';

const normalizeText = (text) => String(text || '').toLowerCase().trim();

const QUESTION_PATTERN = /[?？]|^(?:请问|问一下|想问|能不能|可以吗|是否|是不是|有没有|怎么|如何|为什么|what|why|how|when|where|who)\b|(?:总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|列出|看看|查询|搜索|找一下|发生了什么|最近发生)/i;
const COMMUNITY_PATTERN = /(方块之家|block of home|\bboh\b|社区|社群|群里|论坛|成员|周年庆|内战|服务器|联机|hypixel|我的世界|minecraft|\bmc\b|英雄联盟|\blol\b|王者荣耀|ryyik|lf|小牛|eleven|end|汉堡|丁老师|雨芙蕖|白烨|百城|小天光|小仙)/i;
const MEMORY_SHARE_PATTERN = /(今天|昨天|刚刚|最近|后来|以前|之前|当时|这次|这件事|发生|加入|认识|一起|玩了|聊了|说过|提到|决定|举办|更新|补充|记一下|记录一下|分享一下|告诉你)/i;
const COMPLEX_PATTERN = /(分析|推理|思考|权衡|方案|设计|架构|规划|复盘|诊断|排查|定位|优化|策略|路线图|复杂|深度|详细|全面|比较|对比|评估|拆解|判断|决策|选择|取舍|利弊|优缺点|风险|优先级|可行性|可能性|为什么|原因|怎么设计|如何落地|实现方案|技术方案|给我一个方案|你怎么看|该不该|要不要|值不值得|哪一个更好|怎么选)/i;
const MULTI_STEP_REASONING_PATTERN = /(先.+再|如果.+那么|同时.+但是|既.+又|从.+角度|分别|分几步|一步步|按.{0,8}优先级|综合.{0,8}判断|帮我判断|帮我分析|帮我看看|我应该|我该|怎么处理|怎么解决|怎么优化|怎么改|哪里出了问题|问题在哪里|为什么会这样)/i;
const DAILY_SUMMARY_PATTERN = /(总结|复盘|回顾|梳理).{0,12}(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录|cloud\+|cloud|笔记|日记)|(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录).{0,16}(总结|复盘|回顾|梳理)/i;
const CODE_OR_COMMAND_PATTERN = /(```|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|代码|编程|函数|组件|接口|api|sql|脚本|报错|bug|debug|调试|重构|命令|指令|终端|shell|bash|npm|node|python|javascript|typescript|vue|react|css|html|json|正则|minecraft\s*command|mc\s*指令|命令方块)/i;
const MINECRAFT_COMMAND_PATTERN = /(minecraft|我的世界|\bmc\b|命令方块|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|基岩版|java\s*1\.\d+|钻石剑|附魔|药水效果|gamerule|死亡不掉落)/i;
const CLOUD_REFERENCE_PATTERN = /(根据|结合|参考|看看|读取|分析).{0,18}(我的|我).{0,18}(cloud\+|cloud|随手记|笔记|日记|记录|近况|最近|近期|状态|情绪|生活)/i;
const CLOUD_SAVE_PATTERN = /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(cloud\+|cloud|随手记|日记|笔记|我的记录|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下)(?!.*(公共记忆|共享记忆|社群记忆|记忆库)))/i;
const SHARED_SAVE_PATTERN = /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(公共记忆|共享记忆|社群记忆|记忆库|boh ai 公共))|((公共记忆|共享记忆|社群记忆|记忆库).{0,12}(存|保存|记录|写入|加入))/i;
const BOTH_SAVE_PATTERN = /(两者|两个都|两边|都存|都保存|都写入|同时|一起|cloud\+.*公共|公共.*cloud\+)/i;
const MEMORY_QUERY_PATTERN = /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|论坛最近|帖子最近|大家在聊)/i;
const EXPLICIT_WEB_SEARCH_PATTERN = /(联网|上网|网络搜索|网页搜索|搜索一下|搜一下|查一下网上|网上查|查网页|google|百度|bing|web search|search the web)/i;
const WEB_FRESHNESS_PATTERN = /(最新|最近|今天|今日|现在|当前|实时|刚刚|本周|本月|今年|202[4-9]|新闻|发布|上线|更新|价格|汇率|股价|票房|赛程|比分|天气|政策|法规|版本|发布时间|官网)/i;
const HEALTH_OR_SAFETY_PATTERN = /(健康|医学|医疗|疾病|症状|诊断|治疗|用药|药物|药品|处方|副作用|禁忌|剂量|服用|能不能吃|要不要吃|要喝吗|要吃吗|怀孕|过敏|营养|补剂|补充剂|肌酸|蛋白粉|咖啡因|维生素|鱼油|健身|训练|增肌|减脂|运动损伤|拉伤|疼痛|康复|睡眠)/i;
const EXTERNAL_GENERAL_KNOWLEDGE_PATTERN = /(是什么|为什么|怎么|如何|能不能|要不要|是否|区别|对比|推荐|建议|原理|用法|风险|安全吗|靠谱吗|指南|教程|资料|文档|官网|研究|论文|科学|历史|地理|法律|税务|保险|签证|旅游|学校|大学|专业|产品|品牌|型号|软件|app|api|框架|库|插件|vue|react|node|npm|python|javascript|typescript|css|html|sql|what|why|how|when|where|which|should i|can i)/i;
const INTERNAL_SOURCE_PATTERN = /(cloud\+|cloud|随手记|日记|笔记|我的记录|我的资料|我的数据|我的帖子|我的账号|方块之家|block of home|\bboh\b|社区|社群|论坛|公共记忆|共享记忆|记忆库)/i;
const BOH_INTERNAL_FACT_PATTERN = /(方块之家|block of home|\bboh\b|boh\s*ai|boh\s*cloud\+?|cloud\+|论坛|帖子|公告|活动|周年庆|内战|服务器|联机|成员|pushplus|订阅|会员|积分|礼物|生日).{0,24}(是谁|是什么|什么时候|何时|哪年|哪里|在哪|怎么|如何|步骤|入口|路径|最新|最近|今天|近期|公告|活动|规则|状态|记录|历史|来源|细节|有没有|是否|介绍|总结|复盘|查询|查看)|(是谁|是什么|什么时候|何时|哪年|哪里|在哪|怎么|如何|步骤|入口|路径|最新|最近|今天|近期|公告|活动|规则|状态|记录|历史|来源|细节|有没有|是否|介绍|总结|复盘|查询|查看).{0,24}(方块之家|block of home|\bboh\b|boh\s*ai|boh\s*cloud\+?|cloud\+|论坛|帖子|公告|活动|周年庆|内战|服务器|联机|成员|pushplus|订阅|会员|积分|礼物|生日)/i;

export const isLikelyCodeOrCommandRequest = (text) => CODE_OR_COMMAND_PATTERN.test(normalizeText(text));

export const isLikelyMinecraftCommandRequest = (text) => MINECRAFT_COMMAND_PATTERN.test(normalizeText(text));

export const isLikelyDailySummaryRequest = (text) => DAILY_SUMMARY_PATTERN.test(normalizeText(text));

export const isLikelyCloudReferenceRequest = (text) => {
  const normalized = normalizeText(text);
  return DAILY_SUMMARY_PATTERN.test(normalized) || CLOUD_REFERENCE_PATTERN.test(normalized);
};

export const isLikelyWebSearchRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (EXPLICIT_WEB_SEARCH_PATTERN.test(normalized)) return true;
  const isInternalSource = INTERNAL_SOURCE_PATTERN.test(normalized);
  if (!isInternalSource && HEALTH_OR_SAFETY_PATTERN.test(normalized)) return true;
  if (!isInternalSource && EXTERNAL_GENERAL_KNOWLEDGE_PATTERN.test(normalized)) return true;
  if (!WEB_FRESHNESS_PATTERN.test(normalized)) return false;
  if (isInternalSource && !/(官网|外部|网上|联网|新闻|政策|法规|价格|股价|天气|汇率|版本)/i.test(normalized)) {
    return false;
  }
  return true;
};

export const isLikelyComplexQuestion = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (COMPLEX_PATTERN.test(normalized)) return true;
  if (MULTI_STEP_REASONING_PATTERN.test(normalized)) return true;
  const questionMarks = (normalized.match(/[?？]/g) || []).length;
  const clauseCount = (normalized.match(/[，,；;、\n]/g) || []).length;
  return normalized.length >= 72 && (questionMarks >= 1 || clauseCount >= 2);
};

export const isLikelyBohInternalFactualRequest = (text) => BOH_INTERNAL_FACT_PATTERN.test(normalizeText(text));

export const isLikelyCommunityMemoryShare = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (!COMMUNITY_PATTERN.test(normalized)) return false;
  if (QUESTION_PATTERN.test(normalized)) return false;
  if (MEMORY_QUERY_PATTERN.test(normalized)) return false;
  if (isLikelyCodeOrCommandRequest(normalized)) return false;
  return MEMORY_SHARE_PATTERN.test(normalized) || normalized.length >= 32;
};

export const resolveBOHAIAutoModeDecision = (text, {
  isAutoMode = false,
  cloudReferenceEnabled = false,
  isLoggedIn = false
} = {}) => {
  const safeText = String(text || '').trim();
  const codeOrCommand = isLikelyCodeOrCommandRequest(safeText);
  const minecraftCommand = isLikelyMinecraftCommandRequest(safeText);
  const dailySummary = isLikelyDailySummaryRequest(safeText);
  const shouldReferenceCloud = isLikelyCloudReferenceRequest(safeText);
  const complexQuestion = isLikelyComplexQuestion(safeText);
  const bohInternalFactual = isLikelyBohInternalFactualRequest(safeText);
  const communityMemoryShare = isLikelyCommunityMemoryShare(safeText);
  const shouldSearchWeb = isLikelyWebSearchRequest(safeText);
  const wantsCloudSave = CLOUD_SAVE_PATTERN.test(safeText);
  const wantsSharedSave = SHARED_SAVE_PATTERN.test(safeText);
  const wantsBothSave = BOTH_SAVE_PATTERN.test(safeText) && (wantsCloudSave || wantsSharedSave);
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

  const modeId = codeOrCommand
    ? 'pro'
    : (dailySummary || shouldReferenceCloud || complexQuestion || bohInternalFactual || shouldSearchWeb ? 'think' : 'fast');

  const actionNotes = [];
  if (isAutoMode) {
    if (codeOrCommand) {
      actionNotes.push('切换到专业模式处理代码或指令。');
    } else if (dailySummary) {
      actionNotes.push('切换到思考模式总结最近日常。');
    } else if (complexQuestion) {
      actionNotes.push('切换到思考模式拆解复杂问题。');
    } else if (bohInternalFactual) {
      actionNotes.push('切换到思考模式核对 BOH 内部资料。');
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

  return {
    modeId,
    codeOrCommand,
    minecraftCommand,
    dailySummary,
    bohInternalFactual,
    complexQuestion,
    communityMemoryShare,
    shouldSearchWeb,
    shouldReferenceCloud,
    shouldSaveCloud: saveDestination === 'cloud' || saveDestination === 'both',
    shouldSaveSharedMemory: saveDestination === 'shared' || saveDestination === 'both',
    saveDestination,
    shouldAskMemoryDestination,
    forceCloudReference: shouldReferenceCloud,
    shouldAskSharedMemory: communityMemoryShare || wantsSharedSave || wantsBothSave,
    actionNotes,
    confidence: (
      codeOrCommand
      || minecraftCommand
      || dailySummary
      || shouldReferenceCloud
      || shouldSearchWeb
      || complexQuestion
      || communityMemoryShare
      || wantsCloudSave
      || wantsSharedSave
    ) ? 0.94 : 0.78
  };
};
