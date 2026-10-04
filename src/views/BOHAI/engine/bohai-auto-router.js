/**
 * BOH AI 能力决策（保存意图 / Cloud+ 引用）—— 2026-10-02 大幅收口
 * ------------------------------------------------------------
 * 历史：本文件原是一套「auto 模式」的路由器，含 23 类意图正则与 19 个决策字段。
 * auto 模式已于 2026-06-08 移除（`chat-engine-config.js` 的 BOH_AUTO_MODE_ID），
 * 但路由子系统一直留在每轮对话里空转 —— 其中 9 类正则的产物没有任何消费方。
 * 收口依据见 `plans/024-bohai-rules-and-latency-slimming.md` §1.4。
 *
 * 现在只回答两个问题：
 *   1. 用户这句话是不是要「保存记忆」？保存到哪里（Cloud+ / 公共记忆 / 都存 / 问用户）？
 *   2. 用户这句话是不是要「参考我的 Cloud+」？
 *
 * 维护约定：
 * 1. ROUTING_PATTERNS 里的每一类正则都必须有真实消费方。新增前先确认调用点，
 *    否则会重演「正则照跑、结果没人读」。
 * 2. 删除任何一类正则前，必须追到它的消费方链终点；其中 community / question /
 *    memoryQuery / memoryShare 是**间接存活**（只经 isLikelyCommunityMemoryShare →
 *    shouldAskMemoryDestination 生效），professionalHealth / personalSupport 被
 *    `useChatEngine.js` 直接 import —— 这 6 类最容易被误删。
 * 3. 缓存键只看文本指纹：决策结果已不依赖登录态或 Cloud+ 开关。
 * ------------------------------------------------------------
 */

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

const normalizeText = (text) =>
  String(text || '')
    .toLowerCase()
    .trim();

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
  // ── 保存意图 ────────────────────────────────────────────────
  cloudSave: {
    pattern:
      /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(cloud\+|cloud|随手记|日记|笔记|我的记录|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下)(?!.*(公共记忆|共享记忆|社群记忆|记忆库)))/i,
    label: '保存到Cloud+',
  },
  sharedSave: {
    pattern:
      /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(公共记忆|共享记忆|社群记忆|记忆库|boh ai 公共))|((公共记忆|共享记忆|社群记忆|记忆库).{0,12}(存|保存|记录|写入|加入))/i,
    label: '保存到共享记忆',
  },
  bothSave: {
    pattern: /(两者|两个都|两边|都存|都保存|都写入|同时|一起|cloud\+.*公共|公共.*cloud\+)/i,
    label: '双重保存',
  },
  // 发帖请求不应被当作「保存记忆」（见 resolveBOHAIAutoModeDecision 的 forumPostAction）
  forumPost: {
    pattern:
      /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|论坛发布文案|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案)|生成.{0,12}(论坛|社区|帖子|发布文案)|整理.{0,12}(论坛|社区|帖子|发布文案))/i,
    label: '论坛发帖',
  },

  // ── Cloud+ 引用意图 ─────────────────────────────────────────
  dailySummary: {
    pattern:
      /(总结|复盘|回顾|梳理).{0,12}(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录|cloud\+|cloud|笔记|日记)|(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录).{0,16}(总结|复盘|回顾|梳理)/i,
    label: '日常总结',
  },
  cloudReference: {
    pattern:
      /(根据|结合|参考|看看|读取|分析).{0,18}(我的|我).{0,18}(cloud\+|cloud|随手记|笔记|日记|记录|近况|最近|近期|状态|情绪|生活)/i,
    label: 'Cloud+引用',
  },
  internalSource: {
    pattern:
      /(cloud\+|cloud|随手记|日记|笔记|我的记录|我的资料|我的数据|我的帖子|我的账号|方块之家|block of home|\bboh\b|社区|社群|论坛|公共记忆|共享记忆|记忆库)/i,
    label: '内部数据源',
  },

  // ── 「这句是不是在分享社群记忆」的判据 ───────────────────────
  // 下面 4 类只被 isLikelyCommunityMemoryShare 使用，**不要因为「没人直接调」就删**：
  // 它的产物经 shouldAskMemoryDestination 影响「保存到哪里」的询问。
  question: {
    pattern:
      /[?？]|^(?:请问|问一下|想问|能不能|可以吗|是否|是不是|有没有|怎么|如何|为什么|what|why|how|when|where|who)\b|(?:总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|列出|看看|查询|搜索|找一下|发生了什么|最近发生)/i,
    label: '问题类请求',
  },
  community: {
    pattern:
      /(方块之家|block of home|\bboh\b|社区|社群|群里|论坛|成员|周年庆|内战|服务器|联机|hypixel|我的世界|minecraft|\bmc\b|英雄联盟|\blol\b|王者荣耀|ryyik|lf|小牛|eleven|end|汉堡|丁老师|雨芙蕖|白烨|百城|小天光|小仙)/i,
    label: '社区相关内容',
  },
  memoryShare: {
    pattern:
      /(今天|昨天|刚刚|最近|后来|以前|之前|当时|这次|这件事|发生|加入|认识|一起|玩了|聊了|说过|提到|决定|举办|更新|补充|记一下|记录一下|分享一下|告诉你)/i,
    label: '记忆共享',
  },
  memoryQuery: {
    pattern:
      /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|论坛最近|帖子最近|大家在聊)/i,
    label: '记忆查询',
  },

  // ── 代码/命令（isLikelyCommunityMemoryShare 用它排除）────────
  codeOrCommand: {
    pattern:
      /(```|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|代码|编程|函数|组件|接口|api|sql|脚本|报错|bug|debug|调试|重构|命令|指令|终端|shell|bash|npm|node|python|javascript|typescript|vue|react|css|html|json|正则|minecraft\s*command|mc\s*指令|命令方块)/i,
    label: '代码或命令',
  },

  // ── 个人支持（被 useChatEngine 直接 import，驱动 responseRules）──
  professionalHealth: {
    pattern:
      /(诊断|治疗|疗法|药物|用药|处方|剂量|副作用|禁忌|疾病|病症|症状|抑郁症|焦虑症|双相|精神分裂|创伤后|ptsd|adhd|ocd|心理学研究|论文|量表|指南|咨询师|心理医生|精神科|医院|危机干预|自杀|自残|轻生|严重失眠|连续.*睡不着|几天.*没睡)/i,
    label: '专业健康',
  },
  personalSupport: {
    pattern:
      /(睡不好|睡不着|失眠|焦虑|难过|伤心|低落|不开心|委屈|孤独|害怕|心里堵|压力大|内耗|烦躁|崩溃|撑不住|想哭|关系.{0,8}(难受|冲突|紧张|别扭)|朋友.{0,8}(吵架|冲突|疏远)|家人.{0,8}(冲突|吵架|压力)|恋爱.{0,8}(难受|分手|冲突)|分手).{0,24}(咋办|怎么办|怎么处理|怎么缓解|怎么调节|有点|很|太|一直|老是|总是)?/i,
    label: '个人支持',
  },
};

export const isLikelyCodeOrCommandRequest = (text) =>
  ROUTING_PATTERNS.codeOrCommand.pattern.test(normalizeText(text));

export const isLikelyDailySummaryRequest = (text) =>
  ROUTING_PATTERNS.dailySummary.pattern.test(normalizeText(text));

export const isLikelyCloudReferenceRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.dailySummary.pattern.test(normalized)) return true;
  if (ROUTING_PATTERNS.cloudReference.pattern.test(normalized)) return true;
  if (
    ROUTING_PATTERNS.internalSource.pattern.test(normalized) &&
    /(我|我的|自己|本人)/.test(normalized)
  ) {
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

export const isLikelyCommunityMemoryShare = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (!ROUTING_PATTERNS.community.pattern.test(normalized)) return false;
  if (ROUTING_PATTERNS.question.pattern.test(normalized)) return false;
  if (ROUTING_PATTERNS.memoryQuery.pattern.test(normalized)) return false;
  if (isLikelyCodeOrCommandRequest(normalized)) return false;
  if (ROUTING_PATTERNS.memoryShare.pattern.test(normalized)) return true;
  // 仅当文本较长且包含记忆相关关键词时才判定为记忆分享
  const hasMemoryKeywords = /记忆|回忆|分享|story|memory|remember/i.test(normalized);
  return normalized.length >= 64 && hasMemoryKeywords;
};

// 冻结的"中性空决策"
export const EMPTY_AUTO_DECISION = Object.freeze({
  shouldSaveSharedMemory: false,
  saveDestination: 'none',
  shouldReferenceCloud: false,
});

// LRU 缓存
const decisionCache = new LRUCache(ROUTE_DECISION_CACHE_MAX_SIZE);

export const clearRouteDecisionCache = () => {
  decisionCache.clear();
};

/**
 * 解析本轮的能力决策。
 *
 * ⚠️ 第二参数（isAutoMode / cloudReferenceEnabled / isLoggedIn）保留是为了不破坏调用方签名：
 * 它们原先只用于生成 actionNotes（进度文案），而 `SHOW_INTERNAL_PROGRESS_NOTES = false`
 * 使那些文案从不显示；相关字段已于 2026-10-02 删除，因此这些开关不再影响返回值，
 * 也不再进缓存键（否则同一句话会因登录态不同而各缓存一份）。
 */
export const resolveBOHAIAutoModeDecision = (text, _options = {}) => {
  const safeText = String(text || '').trim();
  if (!safeText) return EMPTY_AUTO_DECISION;

  const cacheKey = buildTextFingerprint(safeText);
  const cached = decisionCache.get(cacheKey);
  if (cached) return cached;

  const shouldReferenceCloud = isLikelyCloudReferenceRequest(safeText);
  const forumPostAction = ROUTING_PATTERNS.forumPost.pattern.test(safeText);
  // 2026-10-04：Cloud+ 写入（cloudSave）与「两处同存」（bothSave）已下线 ⇒ 目的地只剩
  // shared / none 两种；「问用户存哪里」（shouldAskMemoryDestination）也随之取消。
  // ⚠️ `isLikelyCommunityMemoryShare` 的调用已移除，但**函数与它的 4 类正则先保留** ——
  // 删它们要连带改单测，且 `community/question/memoryQuery/memoryShare` 属于 024 标注的
  // 「间接存活」正则，误删代价高。要清理请单独一次提交 + 反证。
  const wantsSharedSave = !forumPostAction && ROUTING_PATTERNS.sharedSave.pattern.test(safeText);
  const saveDestination = wantsSharedSave ? 'shared' : 'none';

  const decision = {
    shouldSaveSharedMemory: saveDestination === 'shared',
    saveDestination,
    shouldReferenceCloud,
  };

  decisionCache.set(cacheKey, decision);
  return decision;
};

export { buildTextFingerprint, LRUCache };
